/**
 * NF-WF-019A reader engagement tests.
 *
 * Dedicated novelforge_test_reader_engagement db (parallel-safe per
 * ADR-0003 §8). The BullMQ publication queue is faked (buildApp seam)
 * — the release path is 012's tested territory; here it is the honest
 * setup mechanism for PUBLISHED visibility.
 *
 * Covers the 019A acceptance checkboxes:
 * - bookmark/follow/like idempotency (repeat → 200 same state, no
 *   duplicate rows; delete → 204 idempotent)
 * - 404 NOT_FOUND (no oracle) for DRAFT/ARCHIVED novels and
 *   UNPUBLISHED chapters
 * - 401 UNAUTHENTICATED on every /api/reader/* route without a session
 * - transactional counters: follow/unfollow, like/unlike, concurrent
 *   writers (no double-count, never negative)
 * - privacy: lists return the caller's rows only; no endpoint reaches
 *   another user's list; per-user state never leaks
 * - author follows: follow/unfollow, self-follow 400, nonexistent
 *   author 404, aggregate count (no User counter column)
 * - engagement + engagement/author state endpoints
 * - cursor pagination; invalid cursor → 400
 * - Q8/GAP-068: additive likeCount/commentCount/followerCount on the
 *   frozen 013 shapes — additive-only, published-visible counts only,
 *   no auth object in /api/public/* (identical with/without cookie)
 * - GAP-070: additive followerCount on the frozen 013 author shape
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import type { PublicationJobData } from "@novelforge/workflow-executor";

const TEST_DB = "novelforge_test_reader_engagement";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found — see ADR-0003");
  }
}
const BASE_URL = process.env.DATABASE_URL!;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
const TEST_URL = withDb(BASE_URL, TEST_DB);

const env: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "novelforge",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: "test",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

function createFakePublicationQueue() {
  const jobs = new Map<string, { state: string }>();
  return {
    jobs,
    async add(_name: string, _data: PublicationJobData, opts: { jobId: string; delay?: number }) {
      jobs.set(opts.jobId, { state: "delayed" });
    },
    async getJob(jobId: string) {
      const j = jobs.get(jobId);
      if (!j) return undefined;
      return {
        getState: async () => j.state,
        remove: async () => {
          jobs.delete(jobId);
        },
      };
    },
    async close() {},
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;
let fakeQueue: ReturnType<typeof createFakePublicationQueue>;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
  fakeQueue = createFakePublicationQueue();
  app = await buildApp(env, { db, publicationQueue: fakeQueue });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  fakeQueue.jobs.clear();
  await db.auditLog.deleteMany();
  await db.publication.deleteMany();
  await db.finalTextReview.deleteMany();
  await db.scene.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
  await db.chapterLike.deleteMany();
  await db.authorFollow.deleteMany();
  await db.novelFollow.deleteMany();
  await db.bookmark.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(email: string, displayName?: string) {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: displayName ?? email },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" } });
  return ws.id;
}

async function seedNovel(
  ownerId: string,
  workspaceId: string,
  novelSlug: string,
  status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "DRAFT",
) {
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({
    actorUserId: ownerId,
    workspaceId,
    title: `Novel ${novelSlug}`,
    slug: novelSlug,
  });
  if (status !== "DRAFT") {
    await db.novel.update({ where: { id: novel.id }, data: { status } });
  }
  return novel.id;
}

async function api(
  method: "GET" | "POST" | "DELETE",
  url: string,
  cookie?: string,
  body?: Record<string, unknown>,
) {
  const res = await app.inject({
    method,
    url,
    headers: cookie ? { cookie } : {},
    ...(body !== undefined ? { payload: body } : {}),
  });
  let parsed: unknown = null;
  try {
    parsed = res.body ? JSON.parse(res.body) : null;
  } catch {
    parsed = res.body;
  }
  return { status: res.statusCode, body: parsed as Record<string, unknown> };
}

async function makeChapter(
cookie: string,
  ids: { workspaceId: string; novelId: string },
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; number: number };
}

async function saveVersion(
cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  content: string,
) {
  const current = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    select: { currentVersion: { select: { number: true } } },
  });
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: { content, expectedVersion: current.currentVersion?.number ?? null },
  });
  expect(res.statusCode).toBe(200);
  return db.chapterVersion.findFirstOrThrow({
    where: { chapterId },
    orderBy: { number: "desc" },
  });
}

async function headRevisionId(novelId: string): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId, name: "main" },
    select: { headRevisionId: true },
  });
  return branch.headRevisionId!;
}

async function seedReceipt(ids: { workspaceId: string; novelId: string }, chapterVersionId: string) {
  return db.finalTextReview.create({
    data: {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId,
      revisionId: await headRevisionId(ids.novelId),
      verdict: "PASS",
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: {},
    },
  });
}

const pubUrl = (ids: { workspaceId: string; novelId: string }, chapterId: string) =>
  `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/publication`;

/** Publish a chapter through the real release path; returns the chapter. */
async function publishChapter(
cookie: string,
  ids: { workspaceId: string; novelId: string },
  title: string,
  content: string,
) {
  const ch = await makeChapter(cookie, ids, title);
  const v = await saveVersion(cookie, ids, ch.id, content);
  await seedReceipt(ids, v.id);
  const res = await api("POST", `${pubUrl(ids, ch.id)}/publish`, cookie);
  expect(res.status).toBe(200);
  // The novel must be ACTIVE for engagement (the 014 predicate).
  await db.novel.update({ where: { id: ids.novelId }, data: { status: "ACTIVE" } });
  return { chapterId: ch.id, number: ch.number };
}

/** Seed an ACTIVE novel with one PUBLISHED chapter; returns ids. */
async function seedEngageableNovel(slug: string, ownerEmail = "owner@example.com") {
  const owner = await seedUser(ownerEmail, "Owner Author");
  const wsId = await seedWorkspace(owner.userId, `${slug}-ws`);
  const novelId = await seedNovel(owner.userId, wsId, slug);
  const ids = { workspaceId: wsId, novelId };
  const ch = await publishChapter(owner.cookie, ids, "Chapter One", "Once upon a time.");
  return { owner, wsId, novelId, chapterNumber: ch.number, slug };
}

describe("bookmarks", () => {
  it("bookmark → 200; repeat → 200 same state; no duplicate rows", async () => {
    const { novelId } = await seedEngageableNovel("bm-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    const first = await api("POST", "/api/reader/bookmarks", reader.cookie, { novelId });
    expect(first.status).toBe(200);
    const firstBody = first.body.bookmark as { novelId: string; createdAt: string };
    expect(firstBody.novelId).toBe(novelId);
    expect(typeof firstBody.createdAt).toBe("string");

    const second = await api("POST", "/api/reader/bookmarks", reader.cookie, { novelId });
    expect(second.status).toBe(200);
    expect((second.body.bookmark as { novelId: string }).novelId).toBe(novelId);
    expect((second.body.bookmark as { createdAt: string }).createdAt).toBe(
      firstBody.createdAt,
    );

    const rows = await db.bookmark.count({ where: { userId: reader.userId, novelId } });
    expect(rows).toBe(1);
  });

  it("unbookmark → 204; repeat → 204", async () => {
    const { novelId } = await seedEngageableNovel("ub-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    await api("POST", "/api/reader/bookmarks", reader.cookie, { novelId });
    const del = await api("DELETE", `/api/reader/bookmarks/${novelId}`, reader.cookie);
    expect(del.status).toBe(204);
    const again = await api("DELETE", `/api/reader/bookmarks/${novelId}`, reader.cookie);
    expect(again.status).toBe(204);
    expect(await db.bookmark.count({ where: { userId: reader.userId } })).toBe(0);
  });

  it("bookmark on a DRAFT novel → 404 NOT_FOUND (no oracle)", async () => {
    const owner = await seedUser("draft-owner@example.com", "Draft Owner");
    const wsId = await seedWorkspace(owner.userId, "draft-ws");
    const novelId = await seedNovel(owner.userId, wsId, "draft-novel"); // DRAFT
    const reader = await seedUser("reader@example.com", "Reader");

    const res = await api("POST", "/api/reader/bookmarks", reader.cookie, { novelId });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });

  it("bookmark on an ARCHIVED novel → 404 NOT_FOUND", async () => {
    const owner = await seedUser("arch-owner@example.com", "Arch Owner");
    const wsId = await seedWorkspace(owner.userId, "arch-ws");
    const novelId = await seedNovel(owner.userId, wsId, "arch-novel", "ARCHIVED");
    const reader = await seedUser("reader@example.com", "Reader");

    const res = await api("POST", "/api/reader/bookmarks", reader.cookie, { novelId });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });

  it("list returns only the caller's rows (cursor pagination)", async () => {
    const { novelId: novelA } = await seedEngageableNovel("list-a", "la@example.com");
    const { novelId: novelB } = await seedEngageableNovel("list-b", "lb@example.com");
    const { novelId: novelC } = await seedEngageableNovel("list-c", "lc@example.com");
    const alice = await seedUser("alice@example.com", "Alice");
    const bob = await seedUser("bob@example.com", "Bob");

    await api("POST", "/api/reader/bookmarks", alice.cookie, { novelId: novelA });
    await api("POST", "/api/reader/bookmarks", alice.cookie, { novelId: novelB });
    await api("POST", "/api/reader/bookmarks", alice.cookie, { novelId: novelC });
    await api("POST", "/api/reader/bookmarks", bob.cookie, { novelId: novelA });

    // Bob's list contains only his own row — Alice's rows are unreachable.
    const bobList = await api("GET", "/api/reader/bookmarks?limit=10", bob.cookie);
    expect(bobList.status).toBe(200);
    const bobBookmarks = bobList.body.bookmarks as Array<{ novelId: string }>;
    expect(bobBookmarks).toHaveLength(1);
    expect(bobBookmarks[0]!.novelId).toBe(novelA);

    // Cursor pagination over Alice's 3 rows, 2 per page.
    const page1 = await api("GET", "/api/reader/bookmarks?limit=2", alice.cookie);
    expect(page1.status).toBe(200);
    const p1 = page1.body.bookmarks as Array<{ novelId: string }>;
    const page1Info = page1.body.page as { cursor: string | null; hasMore: boolean };
    expect(p1).toHaveLength(2);
    expect(page1Info.hasMore).toBe(true);
    expect(typeof page1Info.cursor).toBe("string");

    const page2 = await api(
      "GET",
      `/api/reader/bookmarks?limit=2&cursor=${encodeURIComponent(page1Info.cursor!)}`,
      alice.cookie,
    );
    expect(page2.status).toBe(200);
    const p2 = page2.body.bookmarks as Array<{ novelId: string }>;
    const page2Info = page2.body.page as { cursor: string | null; hasMore: boolean };
    expect(p2).toHaveLength(1);
    expect(page2Info.hasMore).toBe(false);
    expect(page2Info.cursor).toBeNull();
    // No overlap, full coverage.
    const seen = new Set([...p1, ...p2].map((b) => b.novelId));
    expect(seen).toEqual(new Set([novelA, novelB, novelC]));
  });

  it("invalid cursor → 400 INVALID_INPUT", async () => {
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("GET", "/api/reader/bookmarks?cursor=not-a-cursor", reader.cookie);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });

  it("invalid novelId → 400 INVALID_INPUT", async () => {
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("POST", "/api/reader/bookmarks", reader.cookie, {
      novelId: "not-a-uuid",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });
});

describe("novel follows + followerCount", () => {
  it("follow → 200; repeat → 200 same state; followerCount +1 then stable", async () => {
    const { novelId, slug } = await seedEngageableNovel("fol-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    const first = await api("POST", "/api/reader/follows", reader.cookie, { novelId });
    expect(first.status).toBe(200);
    const second = await api("POST", "/api/reader/follows", reader.cookie, { novelId });
    expect(second.status).toBe(200);

    expect(await db.novelFollow.count({ where: { userId: reader.userId, novelId } })).toBe(1);
    const novel = await db.novel.findUniqueOrThrow({
      where: { id: novelId },
      select: { followerCount: true },
    });
    expect(novel.followerCount).toBe(1);

    // The Q8 public field reflects the count (anonymous-readable).
    const pub = await api("GET", `/api/public/novels/${slug}`);
    expect(pub.status).toBe(200);
    expect((pub.body.novel as { followerCount: number }).followerCount).toBe(1);
  });

  it("unfollow → 204; counter decrements; repeat → 204 (never negative)", async () => {
    const { novelId } = await seedEngageableNovel("unf-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    await api("POST", "/api/reader/follows", reader.cookie, { novelId });
    const del = await api("DELETE", `/api/reader/follows/${novelId}`, reader.cookie);
    expect(del.status).toBe(204);
    const again = await api("DELETE", `/api/reader/follows/${novelId}`, reader.cookie);
    expect(again.status).toBe(204);

    const novel = await db.novel.findUniqueOrThrow({
      where: { id: novelId },
      select: { followerCount: true },
    });
    expect(novel.followerCount).toBe(0);
  });

  it("concurrent follows from N users → followerCount = N, one row each", async () => {
    const { novelId } = await seedEngageableNovel("conc-novel");
    const readers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => seedUser(`conc${i}@example.com`, `Conc ${i}`)),
    );
    const results = await Promise.all(
      readers.map((r) => api("POST", "/api/reader/follows", r.cookie, { novelId })),
    );
    for (const r of results) expect(r.status).toBe(200);
    const novel = await db.novel.findUniqueOrThrow({
      where: { id: novelId },
      select: { followerCount: true },
    });
    expect(novel.followerCount).toBe(8);
    expect(await db.novelFollow.count({ where: { novelId } })).toBe(8);
  });

  it("concurrent duplicate follows from the SAME user → one row, count +1", async () => {
    const { novelId } = await seedEngageableNovel("dup-novel");
    const reader = await seedUser("reader@example.com", "Reader");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        api("POST", "/api/reader/follows", reader.cookie, { novelId }),
      ),
    );
    for (const r of results) expect(r.status).toBe(200);
    expect(await db.novelFollow.count({ where: { userId: reader.userId, novelId } })).toBe(1);
    const novel = await db.novel.findUniqueOrThrow({
      where: { id: novelId },
      select: { followerCount: true },
    });
    expect(novel.followerCount).toBe(1);
  });

  it("follow list returns only the caller's rows", async () => {
    const { novelId: novelA } = await seedEngageableNovel("fl-a", "fla@example.com");
    const alice = await seedUser("alice@example.com", "Alice");
    const bob = await seedUser("bob@example.com", "Bob");
    await api("POST", "/api/reader/follows", alice.cookie, { novelId: novelA });

    const bobList = await api("GET", "/api/reader/follows", bob.cookie);
    expect(bobList.status).toBe(200);
    expect((bobList.body.follows as unknown[])).toHaveLength(0);
  });
});

describe("author follows", () => {
  it("follow author → 200 with { author: { id, displayName } }; repeat → 200 same state", async () => {
    const { owner } = await seedEngageableNovel("af-novel", "author@example.com");
    const reader = await seedUser("reader@example.com", "Reader");

    const first = await api("POST", "/api/reader/author-follows", reader.cookie, {
      authorId: owner.userId,
    });
    expect(first.status).toBe(200);
    const af = first.body.authorFollow as {
      authorId: string;
      author: { id: string; displayName: string };
      createdAt: string;
    };
    expect(af.authorId).toBe(owner.userId);
    expect(af.author).toEqual({ id: owner.userId, displayName: "Owner Author" });

    const second = await api("POST", "/api/reader/author-follows", reader.cookie, {
      authorId: owner.userId,
    });
    expect(second.status).toBe(200);
    expect(
      await db.authorFollow.count({
        where: { userId: reader.userId, authorId: owner.userId },
      }),
    ).toBe(1);
  });

  it("unfollow author → 204; repeat → 204", async () => {
    const { owner } = await seedEngageableNovel("au-novel", "author2@example.com");
    const reader = await seedUser("reader@example.com", "Reader");
    await api("POST", "/api/reader/author-follows", reader.cookie, { authorId: owner.userId });

    const del = await api(
      "DELETE",
      `/api/reader/author-follows/${owner.userId}`,
      reader.cookie,
    );
    expect(del.status).toBe(204);
    const again = await api(
      "DELETE",
      `/api/reader/author-follows/${owner.userId}`,
      reader.cookie,
    );
    expect(again.status).toBe(204);
  });

  it("self-follow → 400 INVALID_INPUT", async () => {
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("POST", "/api/reader/author-follows", reader.cookie, {
      authorId: reader.userId,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });

  it("nonexistent author → 404 NOT_FOUND (no oracle)", async () => {
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("POST", "/api/reader/author-follows", reader.cookie, {
      authorId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });

  it("user with no public novels is not a followable author → 404", async () => {
    const plain = await seedUser("plain@example.com", "Plain User");
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("POST", "/api/reader/author-follows", reader.cookie, {
      authorId: plain.userId,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });

  it("author-follow list returns only the caller's rows", async () => {
    const { owner } = await seedEngageableNovel("al-novel", "author3@example.com");
    const alice = await seedUser("alice@example.com", "Alice");
    const bob = await seedUser("bob@example.com", "Bob");
    await api("POST", "/api/reader/author-follows", alice.cookie, { authorId: owner.userId });

    const bobList = await api("GET", "/api/reader/author-follows", bob.cookie);
    expect(bobList.status).toBe(200);
    expect((bobList.body.authorFollows as unknown[])).toHaveLength(0);

    const aliceList = await api("GET", "/api/reader/author-follows", alice.cookie);
    expect((aliceList.body.authorFollows as unknown[])).toHaveLength(1);
  });

  it("GET /api/reader/engagement/author → caller's state + aggregate count; no other user's state", async () => {
    const { owner } = await seedEngageableNovel("as-novel", "author4@example.com");
    const alice = await seedUser("alice@example.com", "Alice");
    const bob = await seedUser("bob@example.com", "Bob");
    await api("POST", "/api/reader/author-follows", alice.cookie, { authorId: owner.userId });

    const aliceState = await api(
      "GET",
      `/api/reader/engagement/author?authorId=${owner.userId}`,
      alice.cookie,
    );
    expect(aliceState.status).toBe(200);
    expect(aliceState.body).toEqual({ followingAuthor: true, followerCount: 1 });

    const bobState = await api(
      "GET",
      `/api/reader/engagement/author?authorId=${owner.userId}`,
      bob.cookie,
    );
    expect(bobState.status).toBe(200);
    expect(bobState.body).toEqual({ followingAuthor: false, followerCount: 1 });
    // No per-user state of others leaks: only the caller's boolean + aggregate.
    expect(Object.keys(bobState.body).sort()).toEqual(["followerCount", "followingAuthor"]);
  });

  it("GAP-070: the public author shape carries the additive followerCount (anonymous, no auth object)", async () => {
    const { owner } = await seedEngageableNovel("g70-novel", "author5@example.com");
    const reader = await seedUser("reader@example.com", "Reader");
    await api("POST", "/api/reader/author-follows", reader.cookie, { authorId: owner.userId });

    // Anonymous (no cookie at all).
    const res = await api("GET", `/api/public/authors/${owner.userId}`);
    expect(res.status).toBe(200);
    const author = res.body.author as {
      id: string;
      displayName: string;
      followerCount: number;
    };
    expect(author.id).toBe(owner.userId);
    expect(author.displayName).toBe("Owner Author");
    expect(author.followerCount).toBe(1);
    // No auth object, no per-user state in the public shape.
    expect("bookmarked" in (res.body as object)).toBe(false);
  });
});

describe("chapter likes + likeCount", () => {
  it("like → 200; repeat → 200 same state; likeCount +1 then stable", async () => {
    const { novelId, chapterNumber, slug } = await seedEngageableNovel("like-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    const first = await api("POST", "/api/reader/likes", reader.cookie, {
      novelId,
      chapterNumber,
    });
    expect(first.status).toBe(200);
    expect(first.body.like).toMatchObject({ novelId, chapterNumber });

    const second = await api("POST", "/api/reader/likes", reader.cookie, {
      novelId,
      chapterNumber,
    });
    expect(second.status).toBe(200);

    expect(
      await db.chapterLike.count({ where: { userId: reader.userId, novelId, chapterNumber } }),
    ).toBe(1);
    const chapter = await db.chapter.findFirstOrThrow({
      where: { novelId, number: chapterNumber },
      select: { likeCount: true },
    });
    expect(chapter.likeCount).toBe(1);

    // The Q8 public field reflects the count (anonymous-readable).
    const pub = await api("GET", `/api/public/novels/${slug}/chapters/${chapterNumber}`);
    expect(pub.status).toBe(200);
    expect((pub.body.chapter as { likeCount: number }).likeCount).toBe(1);
    expect((pub.body.chapter as { commentCount: number }).commentCount).toBe(0);
  });

  it("unlike → 204; likeCount decrements; repeat → 204 (never negative)", async () => {
    const { novelId, chapterNumber } = await seedEngageableNovel("unl-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    await api("POST", "/api/reader/likes", reader.cookie, { novelId, chapterNumber });
    const del = await api(
      "DELETE",
      `/api/reader/likes/${novelId}/${chapterNumber}`,
      reader.cookie,
    );
    expect(del.status).toBe(204);
    const again = await api(
      "DELETE",
      `/api/reader/likes/${novelId}/${chapterNumber}`,
      reader.cookie,
    );
    expect(again.status).toBe(204);

    const chapter = await db.chapter.findFirstOrThrow({
      where: { novelId, number: chapterNumber },
      select: { likeCount: true },
    });
    expect(chapter.likeCount).toBe(0);
  });

  it("concurrent duplicate likes from the same user → one row, likeCount +1", async () => {
    const { novelId, chapterNumber } = await seedEngageableNovel("dlike-novel");
    const reader = await seedUser("reader@example.com", "Reader");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        api("POST", "/api/reader/likes", reader.cookie, { novelId, chapterNumber }),
      ),
    );
    for (const r of results) expect(r.status).toBe(200);
    expect(
      await db.chapterLike.count({ where: { userId: reader.userId, novelId, chapterNumber } }),
    ).toBe(1);
    const chapter = await db.chapter.findFirstOrThrow({
      where: { novelId, number: chapterNumber },
      select: { likeCount: true },
    });
    expect(chapter.likeCount).toBe(1);
  });

  it("like on an UNPUBLISHED chapter → 404 NOT_FOUND (no oracle)", async () => {
    const owner = await seedUser("unpub-owner@example.com", "Unpub Owner");
    const wsId = await seedWorkspace(owner.userId, "unpub-ws");
    const novelId = await seedNovel(owner.userId, wsId, "unpub-novel", "ACTIVE");
    const ids = { workspaceId: wsId, novelId };
    const ch = await makeChapter(owner.cookie, ids, "Draft Chapter");
    const v = await saveVersion(owner.cookie, ids, ch.id, "draft content");
    await seedReceipt(ids, v.id);
    // Chapter exists with a receipt but was never published.
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api("POST", "/api/reader/likes", reader.cookie, {
      novelId,
      chapterNumber: ch.number,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });
});

describe("engagement state endpoint", () => {
  it("returns the caller's per-user state + aggregates", async () => {
    const { novelId, chapterNumber } = await seedEngageableNovel("eng-novel");
    const alice = await seedUser("alice@example.com", "Alice");
    const bob = await seedUser("bob@example.com", "Bob");

    await api("POST", "/api/reader/bookmarks", alice.cookie, { novelId });
    await api("POST", "/api/reader/follows", alice.cookie, { novelId });
    await api("POST", "/api/reader/likes", alice.cookie, { novelId, chapterNumber });
    await api("POST", "/api/reader/follows", bob.cookie, { novelId });

    const aliceState = await api(
      "GET",
      `/api/reader/engagement?novelId=${novelId}&chapterNumber=${chapterNumber}`,
      alice.cookie,
    );
    expect(aliceState.status).toBe(200);
    expect(aliceState.body).toEqual({
      bookmarked: true,
      following: true,
      liked: true,
      likeCount: 1,
      commentCount: 0,
      followerCount: 2,
    });

    const bobState = await api(
      "GET",
      `/api/reader/engagement?novelId=${novelId}&chapterNumber=${chapterNumber}`,
      bob.cookie,
    );
    expect(bobState.status).toBe(200);
    expect(bobState.body).toEqual({
      bookmarked: false,
      following: true,
      liked: false,
      likeCount: 1,
      commentCount: 0,
      followerCount: 2,
    });
  });

  it("novel-level engagement (no chapterNumber) omits chapter state", async () => {
    const { novelId } = await seedEngageableNovel("engn-novel");
    const alice = await seedUser("alice@example.com", "Alice");
    await api("POST", "/api/reader/bookmarks", alice.cookie, { novelId });

    const res = await api("GET", `/api/reader/engagement?novelId=${novelId}`, alice.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bookmarked: true,
      following: false,
      liked: false,
      likeCount: 0,
      commentCount: 0,
      followerCount: 0,
    });
  });

  it("engagement on an invisible novel → 404 NOT_FOUND", async () => {
    const reader = await seedUser("reader@example.com", "Reader");
    const res = await api(
      "GET",
      `/api/reader/engagement?novelId=123e4567-e89b-12d3-a456-426614174000`,
      reader.cookie,
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });
});

describe("auth boundary (Invariant 1)", () => {
  it("every /api/reader/* route 401s without a session", async () => {
    const { novelId, chapterNumber, owner } = await seedEngageableNovel("auth-novel");
    const routes: Array<[string, string, Record<string, unknown>?]> = [
      ["POST", "/api/reader/bookmarks", { novelId }],
      ["DELETE", `/api/reader/bookmarks/${novelId}`],
      ["GET", "/api/reader/bookmarks"],
      ["POST", "/api/reader/follows", { novelId }],
      ["DELETE", `/api/reader/follows/${novelId}`],
      ["GET", "/api/reader/follows"],
      ["POST", "/api/reader/author-follows", { authorId: owner.userId }],
      ["DELETE", `/api/reader/author-follows/${owner.userId}`],
      ["GET", "/api/reader/author-follows"],
      ["POST", "/api/reader/likes", { novelId, chapterNumber }],
      ["DELETE", `/api/reader/likes/${novelId}/${chapterNumber}`],
      ["GET", `/api/reader/engagement?novelId=${novelId}`],
      ["GET", `/api/reader/engagement/author?authorId=${owner.userId}`],
    ];
    for (const [method, url, body] of routes) {
      const res = await api(method as "GET" | "POST" | "DELETE", url, undefined, body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "UNAUTHENTICATED" });
    }
  });

  it("/api/public/* has no 401 path and ignores the session cookie (013 Invariant 2)", async () => {
    const { slug, chapterNumber } = await seedEngageableNovel("pub-novel");
    const reader = await seedUser("reader@example.com", "Reader");

    const anon = await api("GET", `/api/public/novels/${slug}`);
    const authed = await api("GET", `/api/public/novels/${slug}`, reader.cookie);
    expect(anon.status).toBe(200);
    expect(authed.status).toBe(200);
    expect(anon.body).toEqual(authed.body);

    const anonCh = await api("GET", `/api/public/novels/${slug}/chapters/${chapterNumber}`);
    expect(anonCh.status).toBe(200);
    // No auth object anywhere in the public shape.
    expect("session" in (anonCh.body as object)).toBe(false);
  });
});

describe("Q8/GAP-068 additive counts", () => {
  it("the frozen 013 shapes keep every pinned field (additive-only)", async () => {
    const { slug, chapterNumber } = await seedEngageableNovel("add-novel");
    const novelRes = await api("GET", `/api/public/novels/${slug}`);
    expect(novelRes.status).toBe(200);
    const novel = novelRes.body.novel as Record<string, unknown>;
    // All 012-pinned + GAP-049 fields still present and unchanged.
    expect(novel.id).toBeDefined();
    expect(novel.title).toBeDefined();
    expect(novel.slug).toBe("add-novel");
    expect(novel.author).toBeDefined();
    expect(typeof novel.followerCount).toBe("number");
    const chapters = novelRes.body.chapters as Array<Record<string, unknown>>;
    expect(chapters[0]).toHaveProperty("number");
    expect(chapters[0]).toHaveProperty("title");
    expect(chapters[0]).toHaveProperty("publishedAt");

    const chRes = await api("GET", `/api/public/novels/${slug}/chapters/${chapterNumber}`);
    expect(chRes.status).toBe(200);
    const chapter = chRes.body.chapter as Record<string, unknown>;
    expect(chapter.number).toBe(chapterNumber);
    expect(chapter.title).toBeDefined();
    expect(chapter.content).toBeDefined();
    expect(chapter.wordCount).toBeDefined();
    expect(chapter.publishedVersionNumber).toBeDefined();
    expect(chapter.publishedAt).toBeDefined();
    expect(typeof chapter.likeCount).toBe("number");
    expect(typeof chapter.commentCount).toBe("number");
  });

  it("counts vanish from reads when the chapter leaves PUBLISHED (Invariant 2)", async () => {
    const owner = await seedUser("van-owner@example.com", "Van Owner");
    const wsId = await seedWorkspace(owner.userId, "van-ws");
    const novelId = await seedNovel(owner.userId, wsId, "van-novel");
    const ids = { workspaceId: wsId, novelId };
    const ch = await publishChapter(owner.cookie, ids, "Here Then Gone", "content here");
    const reader = await seedUser("reader@example.com", "Reader");
    await api("POST", "/api/reader/likes", reader.cookie, {
      novelId,
      chapterNumber: ch.number,
    });

    // Unpublish via the real path: set the publication back to UNPUBLISHED.
    await db.publication.updateMany({
      where: { novelId },
      data: { status: "UNPUBLISHED" },
    });

    // The chapter page 404s — the like count is invisible on the next query.
    const res = await api("GET", `/api/public/novels/van-novel/chapters/${ch.number}`);
    expect(res.status).toBe(404);
    // The engagement write now 404s too (chapter no longer PUBLISHED).
    const like = await api("POST", "/api/reader/likes", reader.cookie, {
      novelId,
      chapterNumber: ch.number,
    });
    expect(like.status).toBe(404);
    // Rows are retained (republish would restore visibility).
    expect(await db.chapterLike.count({ where: { novelId } })).toBe(1);
  });
});
