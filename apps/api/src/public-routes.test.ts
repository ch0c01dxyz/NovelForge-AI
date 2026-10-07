/**
 * NF-WF-013 public reader routes tests.
 *
 * Dedicated novelforge_test_public_reader db (parallel-safe per ADR-0003 §8).
 * The BullMQ publication queue is faked (buildApp seam) — the release path
 * itself is 012's tested territory; here it is the honest setup mechanism
 * for PUBLIC visibility (PUBLISHED/UNPUBLISHED/SCHEDULED states).
 *
 * Covers the contract acceptance checkboxes:
 * - public novel route: exact shape, PUBLISHED-only chapters, author byline
 * - no-oracle 404 for all nine invisible cases; identical with/without cookie
 * - tenant separation: slug collision → earliest-created ACTIVE wins;
 *   chapter route novel-first, so novel/chapter pages never disagree
 * - version pinning from the reader's view (publish → re-publish serves new pin)
 * - spoiler boundary: no draft titles, no canon/review/workflow data
 * - author route: displayName + published novels; unknown/no-public → 404
 * - search/AI exclusion: retrieval/AI routes stay 401 unauthenticated
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

const TEST_DB = "novelforge_test_public_reader";
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
OMNIROUTE_API_KEY: process.env.OMNIROUTE_API_KEY ?? "test",
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

/** Publish a chapter through the real release path; returns the pinned version. */
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
  return { chapterId: ch.id, number: ch.number, versionId: v.id, content };
}

const publicNovel = (slug: string) => `/api/public/novels/${slug}`;
const publicChapter = (slug: string, number: number) =>
  `/api/public/novels/${slug}/chapters/${number}`;

describe("GET /api/public/novels/:slug", () => {
  it("serves the exact pinned shape: novel + author byline + PUBLISHED chapters only", async () => {
    const owner = await seedUser("pr-novel@example.com", "Pen Author");
    const wsId = await seedWorkspace(owner.userId, "pr-novel-ws");
    const novelId = await seedNovel(owner.userId, wsId, "visible-novel");
    const ids = { workspaceId: wsId, novelId };

    await publishChapter(owner.cookie, ids, "Chapter One", "One two three four.");
    // A draft chapter must not leak into the list.
    await makeChapter(owner.cookie, ids, "Draft Chapter");

    const res = await api("GET", publicNovel("visible-novel"));
    expect(res.status).toBe(200);
    const body = res.body as {
      novel: { id: string; title: string; slug: string; author: { id: string; displayName: string } };
      chapters: Array<{ number: number; title: string; publishedAt: string }>;
    };
    expect(body.novel.id).toBe(novelId);
    expect(body.novel.title).toBe("Novel visible-novel");
    expect(body.novel.slug).toBe("visible-novel");
    expect(body.novel.author.displayName).toBe("Pen Author");
    expect(body.novel.author.id).toBe(owner.userId);
    // No email/workspace data leaks.
    expect(JSON.stringify(body)).not.toContain("pr-novel@example.com");
    expect(JSON.stringify(body)).not.toContain(wsId);
    expect(body.chapters).toHaveLength(1);
    expect(body.chapters[0]!.number).toBe(1);
    expect(body.chapters[0]!.title).toBe("Chapter One");
    expect(typeof body.chapters[0]!.publishedAt).toBe("string");
    expect(JSON.stringify(body)).not.toContain("Draft Chapter");
  });

  it("returns the identical 404 for unknown slug, DRAFT novel, ARCHIVED novel", async () => {
    const owner = await seedUser("pr-404@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-404-ws");
    await seedNovel(owner.userId, wsId, "draft-novel", "DRAFT");
    await seedNovel(owner.userId, wsId, "archived-novel", "ARCHIVED");

    for (const slug of ["no-such-novel", "draft-novel", "archived-novel"]) {
      const res = await api("GET", publicNovel(slug));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "NOT_FOUND" });
    }
  });

  it("returns the same response with and without a session cookie", async () => {
    const owner = await seedUser("pr-cookie@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-cookie-ws");
    const novelId = await seedNovel(owner.userId, wsId, "cookie-novel");
    await publishChapter(owner.cookie, { workspaceId: wsId, novelId }, "Ch 1", "Some text.");

    const anon = await api("GET", publicNovel("cookie-novel"));
    const authed = await api("GET", publicNovel("cookie-novel"), owner.cookie);
    expect(anon.status).toBe(200);
    expect(authed.body).toEqual(anon.body);
  });

  it("rejects an empty slug with 400 INVALID_INPUT", async () => {
    const res = await api("GET", "/api/public/novels/");
    // Trailing slash matches the route with an empty slug → Zod 400.
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });
});

describe("GET /api/public/novels/:slug/chapters/:number", () => {
  it("serves pinned content with wordCount and prev/next navigation", async () => {
    const owner = await seedUser("pr-ch@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-ch-ws");
    const novelId = await seedNovel(owner.userId, wsId, "ch-novel");
    const ids = { workspaceId: wsId, novelId };

    await publishChapter(owner.cookie, ids, "First", "alpha beta gamma");
    await publishChapter(owner.cookie, ids, "Second", "delta epsilon");
    await publishChapter(owner.cookie, ids, "Third", "zeta");

    const res = await api("GET", publicChapter("ch-novel", 2));
    expect(res.status).toBe(200);
    const body = res.body as {
      chapter: {
        number: number;
        title: string;
        content: string;
        wordCount: number;
        publishedVersionNumber: number;
        publishedAt: string;
      };
      prevChapter: { number: number; title: string } | null;
      nextChapter: { number: number; title: string } | null;
    };
    expect(body.chapter.number).toBe(2);
    expect(body.chapter.title).toBe("Second");
    expect(body.chapter.content).toBe("delta epsilon");
    expect(body.chapter.wordCount).toBe(2);
    expect(body.chapter.publishedVersionNumber).toBe(1);
    expect(typeof body.chapter.publishedAt).toBe("string");
    expect(body.prevChapter).toEqual({ number: 1, title: "First" });
    expect(body.nextChapter).toEqual({ number: 3, title: "Third" });
  });

  it("returns 404 for draft / IN_REVIEW / SCHEDULED / UNPUBLISHED / out-of-range chapters", async () => {
    const owner = await seedUser("pr-chstates@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-chstates-ws");
    const novelId = await seedNovel(owner.userId, wsId, "chstates-novel");
    const ids = { workspaceId: wsId, novelId };

    await publishChapter(owner.cookie, ids, "Pub", "published text");
    // Draft chapter (number 2).
    const draft = await makeChapter(owner.cookie, ids, "Draft");
    await saveVersion(owner.cookie, ids, draft.id, "draft text");
    // IN_REVIEW chapter (number 3).
    const inReview = await makeChapter(owner.cookie, ids, "In Review");
    await saveVersion(owner.cookie, ids, inReview.id, "review text");
    await db.chapter.update({ where: { id: inReview.id }, data: { status: "IN_REVIEW" } });
    // SCHEDULED chapter (number 4).
    const scheduled = await makeChapter(owner.cookie, ids, "Scheduled");
    const sv = await saveVersion(owner.cookie, ids, scheduled.id, "scheduled text");
    await seedReceipt(ids, sv.id);
    const sch = await api(
      "POST",
      `${pubUrl(ids, scheduled.id)}/schedule`,
      owner.cookie,
      { scheduledFor: new Date(Date.now() + 3600_000).toISOString() },
    );
    expect(sch.status).toBe(201);
    // UNPUBLISHED chapter (number 5): publish then unpublish.
    const unpub = await publishChapter(owner.cookie, ids, "Unpublished", "was public");
    const un = await api("POST", `${pubUrl(ids, unpub.chapterId)}/unpublish`, owner.cookie);
    expect(un.status).toBe(200);

    for (const n of [2, 3, 4, 5, 99]) {
      const res = await api("GET", publicChapter("chstates-novel", n));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "NOT_FOUND" });
    }
    // And the novel page lists only the one published chapter.
    const novel = await api("GET", publicNovel("chstates-novel"));
    expect(novel.status).toBe(200);
    expect((novel.body as { chapters: unknown[] }).chapters).toHaveLength(1);
  });

  it("rejects a non-numeric chapter number with 400 INVALID_INPUT", async () => {
    const res = await api("GET", "/api/public/novels/some-slug/chapters/abc");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });

  it("tenant separation: slug collision → earliest ACTIVE wins; chapter route is novel-first", async () => {
    const owner = await seedUser("pr-collide@example.com");
    const wsA = await seedWorkspace(owner.userId, "pr-collide-a");
    const wsB = await seedWorkspace(owner.userId, "pr-collide-b");
    const novelA = await seedNovel(owner.userId, wsA, "shared-slug", "ACTIVE");
    const novelB = await seedNovel(owner.userId, wsB, "shared-slug", "ACTIVE");

    await publishChapter(owner.cookie, { workspaceId: wsA, novelId: novelA }, "A-One", "a one text");
    const idsB = { workspaceId: wsB, novelId: novelB };
    await publishChapter(owner.cookie, idsB, "B-One", "b one text");
    await publishChapter(owner.cookie, idsB, "B-Two", "b two text");

    const novel = await api("GET", publicNovel("shared-slug"));
    expect(novel.status).toBe(200);
    const nbody = novel.body as { novel: { id: string }; chapters: Array<{ title: string }> };
    expect(nbody.novel.id).toBe(novelA);
    expect(nbody.chapters.map((c) => c.title)).toEqual(["A-One"]);

    // Chapter 1 resolves within novel A only.
    const ch1 = await api("GET", publicChapter("shared-slug", 1));
    expect(ch1.status).toBe(200);
    expect((ch1.body as { chapter: { title: string } }).chapter.title).toBe("A-One");
    // Chapter 2 exists only in novel B → 404 (the two routes never disagree).
    const ch2 = await api("GET", publicChapter("shared-slug", 2));
    expect(ch2.status).toBe(404);
    expect(ch2.body).toEqual({ error: "NOT_FOUND" });
  });

  it("version pinning: re-publish serves the NEW pin; the old pin is never served", async () => {
    const owner = await seedUser("pr-pin@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-pin-ws");
    const novelId = await seedNovel(owner.userId, wsId, "pin-novel");
    const ids = { workspaceId: wsId, novelId };

    const first = await publishChapter(owner.cookie, ids, "Pinned", "first version text");
    const seen1 = await api("GET", publicChapter("pin-novel", 1));
    expect((seen1.body as { chapter: { content: string } }).chapter.content).toBe(
      "first version text",
    );

    // unpublish → edit → review → re-publish.
    await api("POST", `${pubUrl(ids, first.chapterId)}/unpublish`, owner.cookie);
    const v2 = await saveVersion(owner.cookie, ids, first.chapterId, "second version text here");
    await seedReceipt(ids, v2.id);
    const repub = await api("POST", `${pubUrl(ids, first.chapterId)}/publish`, owner.cookie);
    expect(repub.status).toBe(200);

    const seen2 = await api("GET", publicChapter("pin-novel", 1));
    const body2 = seen2.body as { chapter: { content: string; publishedVersionNumber: number } };
    expect(body2.chapter.content).toBe("second version text here");
    expect(body2.chapter.publishedVersionNumber).toBe(2);
    expect(body2.chapter.content).not.toBe("first version text");
  });
});

describe("GET /api/public/authors/:authorId", () => {
  it("serves displayName + published novels; unknown or no-public-novels → 404", async () => {
    const author = await seedUser("pr-author@example.com", "Famous Author");
    const wsId = await seedWorkspace(author.userId, "pr-author-ws");
    const novelId = await seedNovel(author.userId, wsId, "author-novel");
    const ids = { workspaceId: wsId, novelId };
    await publishChapter(author.cookie, ids, "A1", "text one");
    await publishChapter(author.cookie, ids, "A2", "text two");
    // A draft-only novel is excluded.
    await seedNovel(author.userId, wsId, "draft-only-novel", "ACTIVE");

    const res = await api("GET", `/api/public/authors/${author.userId}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      // NF-WF-019A (GAP-070): followerCount is additive on the frozen
      // 013 author shape (Q8 pattern, ruled contract-conformant).
      author: { id: string; displayName: string; followerCount: number };
      novels: Array<{ id: string; title: string; slug: string; publishedChapterCount: number }>;
    };
    expect(body.author).toEqual({
      id: author.userId,
      displayName: "Famous Author",
      followerCount: 0,
    });
    expect(body.novels).toHaveLength(1);
    expect(body.novels[0]!.slug).toBe("author-novel");
    expect(body.novels[0]!.publishedChapterCount).toBe(2);
    expect(JSON.stringify(body)).not.toContain("pr-author@example.com");
    expect(JSON.stringify(body)).not.toContain("draft-only-novel");

    // Unknown author → 404.
    const unknown = await api("GET", "/api/public/authors/00000000-0000-4000-8000-000000000000");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "NOT_FOUND" });

    // Author with no publicly-visible novels → 404.
    const quiet = await seedUser("pr-quiet@example.com", "Quiet Author");
    const quietWs = await seedWorkspace(quiet.userId, "pr-quiet-ws");
    await seedNovel(quiet.userId, quietWs, "quiet-draft", "DRAFT");
    const quietRes = await api("GET", `/api/public/authors/${quiet.userId}`);
    expect(quietRes.status).toBe(404);
    expect(quietRes.body).toEqual({ error: "NOT_FOUND" });
  });

  it("rejects a non-uuid authorId with 400 INVALID_INPUT", async () => {
    const res = await api("GET", "/api/public/authors/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });
});

describe("search/AI exclusion", () => {
  it("unauthenticated requests to retrieval and AI routes stay 401", async () => {
    const owner = await seedUser("pr-401@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-401-ws");
    const r1 = await api("GET", `/api/workspaces/${wsId}/references`);
    expect(r1.status).toBe(401);
    expect(r1.body).toEqual({ error: "UNAUTHENTICATED" });
    const r2 = await api("GET", "/api/gateways");
    expect(r2.status).toBe(401);
    expect(r2.body).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("the /api/public/search route is 014-owned and stays anonymous", async () => {
    // NF-WF-014 introduced GET /api/public/search (published-only,
    // anonymous). This replaces the old "no /api/public/search route
    // exists" assertion: the route exists, is anonymous, and has no
    // oracle behavior (empty query is a 400, not a leak).
    const res = await api("GET", "/api/public/search");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_INPUT" });
  });
});

describe("spoiler boundary", () => {
  it("responses contain no canon facts, review receipts, workflow data, or future metadata", async () => {
    const owner = await seedUser("pr-spoiler@example.com");
    const wsId = await seedWorkspace(owner.userId, "pr-spoiler-ws");
    const novelId = await seedNovel(owner.userId, wsId, "spoiler-novel");
    const ids = { workspaceId: wsId, novelId };
    await publishChapter(owner.cookie, ids, "Clean", "clean chapter text");

    const novel = await api("GET", publicNovel("spoiler-novel"));
    const chapter = await api("GET", publicChapter("spoiler-novel", 1));
    const dump = JSON.stringify([novel.body, chapter.body]).toLowerCase();
    for (const leaked of [
      "canonfact",
      "review",
      "workflow",
      "receipt",
      "scheduledfor",
      "outline",
      "synopsis",
      "password",
      "token",
      "email",
    ]) {
      expect(dump).not.toContain(leaked);
    }
  });
});
