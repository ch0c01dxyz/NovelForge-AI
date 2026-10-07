/**
 * Reader comments + moderation tests (NF-WF-019B).
 *
 * Covers the full 019B acceptance: comment lifecycle on published
 * chapters (post/list/reply/edit/delete), rate limits (burst + daily +
 * reports), sanitization, thread depth, comment states
 * (VISIBLE/HIDDEN/DELETED), dedup-keyed reports, the staff moderation
 * queue, capability gating (novel:update reuse — no new capabilities),
 * and the transactional VISIBLE-comment counter.
 *
 * Dedicated scratch database (the public-discovery.test.ts pattern).
 * Every PUBLISHED chapter travels the real 012 release path (PASS
 * receipt seeded directly — review logic is 010's tested territory),
 * so the visibility predicates are exercised end to end. Backends
 * MODEL_UNVERIFIED per GAP-013 (no live model calls here anyway).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import type { Env } from "@novelforge/config";
import type { PublicationJobData } from "@novelforge/workflow-executor";

vi.mock("./services/ai/index.ts", () => ({ createAiServices: () => ({}) }));
vi.mock("./services/workflow-executor.ts", () => ({
  createWorkflowExecutor: () => ({}),
}));

function createFakePublicationQueue() {
  const jobs = new Map<string, { state: string }>();
  return {
    jobs,
    async add(
      _name: string,
      _data: PublicationJobData,
      opts: { jobId: string; delay?: number },
    ) {
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = "novelforge_test_comments";
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
  DATABASE_URL: TEST_URL,
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  fakeQueue.jobs.clear();
  await db.commentReport.deleteMany();
  await db.comment.deleteMany();
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
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  return ws.id;
}

/** A workspace member WITHOUT novel:update (VIEWER) — non-staff. */
async function seedViewerMember(workspaceId: string, email: string) {
  const viewer = await seedUser(email);
  await db.membership.create({
    data: { workspaceId, userId: viewer.userId, role: "VIEWER" },
  });
  return viewer;
}

async function seedNovel(
  ownerId: string,
  workspaceId: string,
  novelSlug: string,
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
  return novel.id;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function api(
  method: HttpMethod,
  url: string,
  cookie?: string,
  body?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    headers: cookie ? { cookie } : {},
    payload: body as Record<string, unknown> | undefined,
  });
  let json: unknown = null;
  try {
    json = res.body ? res.json() : null;
  } catch {
    json = null;
  }
  return { status: res.statusCode, json: json as Record<string, unknown> | null };
}

const pubUrl = (workspaceId: string, novelId: string, chapterId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}/publication`;

async function makeChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  if (res.statusCode !== 201) {
    throw new Error(`makeChapter failed: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { id: string; number: number };
}

async function saveVersion(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
  content: string,
) {
  const current = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    select: { currentVersion: { select: { number: true } } },
  });
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: {
      content,
      expectedVersion: current.currentVersion?.number ?? null,
    },
  });
  if (res.statusCode !== 200) {
    throw new Error(`saveVersion failed: ${res.statusCode} ${res.body}`);
  }
  return db.chapterVersion.findFirstOrThrow({
    where: { chapterId },
    orderBy: { number: "desc" },
  });
}

/** Seed a PASS review receipt directly (deterministic; review logic is 010's territory). */
async function seedReceipt(
  workspaceId: string,
  novelId: string,
  chapterVersionId: string,
) {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId, name: "main" },
    select: { headRevisionId: true },
  });
  return db.finalTextReview.create({
    data: {
      workspaceId,
      novelId,
      chapterVersionId,
      revisionId: branch.headRevisionId!,
      verdict: "PASS",
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: {},
    },
  });
}

/** Publish immediately via the real 012 release path (novel DRAFT→ACTIVE). */
async function publishChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
  chapterVersionId: string,
) {
  await seedReceipt(workspaceId, novelId, chapterVersionId);
  const res = await app.inject({
    method: "POST",
    url: `${pubUrl(workspaceId, novelId, chapterId)}/publish`,
    headers: { cookie },
    payload: {},
  });
  if (res.statusCode !== 200) {
    throw new Error(`publish failed: ${res.statusCode} ${res.body}`);
  }
}

/** Seed a novel with one PUBLISHED chapter via the real path. */
async function seedPublishedNovel(
  owner: { userId: string; cookie: string },
  workspaceId: string,
  novelSlug: string,
  chapterTitle = "Chapter 1",
) {
  const novelId = await seedNovel(owner.userId, workspaceId, novelSlug);
  const ch = await makeChapter(owner.cookie, workspaceId, novelId, chapterTitle);
  const version = await saveVersion(
    owner.cookie,
    workspaceId,
    novelId,
    ch.id,
    "Published prose.",
  );
  await publishChapter(owner.cookie, workspaceId, novelId, ch.id, version.id);
  return { novelId, chapterId: ch.id, chapterNumber: ch.number };
}

/** Seed a comment row directly (bypasses the HTTP burst limiter). */
async function seedComment(
  userId: string,
  novelId: string,
  chapterNumber: number,
  body = "Seeded comment",
  parentId: string | null = null,
  createdAt?: Date,
) {
  return db.comment.create({
    data: {
      userId,
      novelId,
      chapterNumber,
      body,
      parentId,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

const listUrl = (novelId: string, chapterNumber: number) =>
  `/api/reader/comments?novelId=${novelId}&chapterNumber=${chapterNumber}`;

describe("NF-WF-019B comments", () => {
  it("posts a comment on a published chapter → 201; anonymous list shows displayName, never email", async () => {
    const owner = await seedUser("owner@example.com", "The Author");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("reader@example.com", "Reader One");

    const post = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "What a chapter!",
    });
    expect(post.status).toBe(201);
    const comment = post.json!.comment as Record<string, unknown>;
    expect(comment.status).toBe("VISIBLE");
    expect(comment.parentId).toBeNull();
    expect((comment.author as Record<string, unknown>).displayName).toBe(
      "Reader One",
    );

    // Anonymous-readable list: VISIBLE comment with displayName, no email anywhere.
    const list = await api("GET", listUrl(novelId, chapterNumber));
    expect(list.status).toBe(200);
    const comments = list.json!.comments as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe("What a chapter!");
    expect((comments[0]!.author as Record<string, unknown>).displayName).toBe(
      "Reader One",
    );
    expect(JSON.stringify(list.json)).not.toContain("reader@example.com");
    expect(JSON.stringify(list.json)).not.toContain(reader.userId);
  });

  it("comment on an UNPUBLISHED chapter or invisible novel → 404 (no oracle)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    // DRAFT novel (never published): invisible.
    const draftNovelId = await seedNovel(owner.userId, ws, "draft-novel");
    const draftCh = await makeChapter(owner.cookie, ws, draftNovelId, "Ch 1");
    // Fresh sessions per POST: the burst limiter is keyed on the session.
    const readerA = await seedUser("reader2a@example.com");
    const readerB = await seedUser("reader2b@example.com");

    const draft = await api("POST", "/api/reader/comments", readerA.cookie, {
      novelId: draftNovelId,
      chapterNumber: draftCh.number,
      body: "Hello?",
    });
    expect(draft.status).toBe(404);
    expect(draft.json).toEqual({ error: "NOT_FOUND" });

    // Nonexistent novel → identical 404 (no oracle either way).
    const ghost = await api("POST", "/api/reader/comments", readerB.cookie, {
      novelId: "00000000-0000-0000-0000-000000000000",
      chapterNumber: 1,
      body: "Hello?",
    });
    expect(ghost.status).toBe(404);
    expect(ghost.json).toEqual({ error: "NOT_FOUND" });

    // The anonymous list is 404 too.
    const list = await api(
      "GET",
      listUrl(draftNovelId, draftCh.number),
    );
    expect(list.status).toBe(404);
  });

  it("unauthenticated post → 401", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const res = await api("POST", "/api/reader/comments", undefined, {
      novelId,
      chapterNumber,
      body: "Anonymous?",
    });
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("2nd comment within 10s → 429 (burst limiter)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("burst@example.com");

    const first = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "First!",
    });
    expect(first.status).toBe(201);
    const second = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "Second — too soon",
    });
    expect(second.status).toBe(429);
  });

  it("101st comment in 24h → 429 COMMENT_DAILY_LIMIT", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("daily@example.com");
    // Seed 100 comments directly (bypasses the HTTP burst limiter).
    await db.comment.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        userId: reader.userId,
        novelId,
        chapterNumber,
        body: `Seeded ${i}`,
      })),
    });
    const res = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "The 101st",
    });
    expect(res.status).toBe(429);
    expect(res.json).toEqual({ error: "COMMENT_DAILY_LIMIT" });
  });

  it("21st report in 24h → 429 REPORT_DAILY_LIMIT", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("reporter@example.com");
    const other = await seedUser("other@example.com");
    // 20 distinct comments, one report each from the same reporter.
    const comments = await Promise.all(
      Array.from({ length: 21 }, (_, i) =>
        seedComment(other.userId, novelId, chapterNumber, `Target ${i}`),
      ),
    );
    await db.commentReport.createMany({
      data: comments.slice(0, 20).map((c) => ({
        commentId: c.id,
        reporterId: reader.userId,
        reason: "SPAM" as const,
      })),
    });
    const res = await api(
      "POST",
      `/api/reader/comments/${comments[20]!.id}/reports`,
      reader.cookie,
      { reason: "SPAM" },
    );
    expect(res.status).toBe(429);
    expect(res.json).toEqual({ error: "REPORT_DAILY_LIMIT" });
  });

  it("body > 5000 chars → 400; HTML is stored as text (XSS probe)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("xss@example.com");

    const tooLong = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "x".repeat(5001),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.json).toEqual({ error: "INVALID_INPUT" });

    // Seed the XSS probe directly to dodge the burst limiter.
    const probe = await seedComment(
      reader.userId,
      novelId,
      chapterNumber,
      '<script>alert("xss")</script><img src=x onerror=alert(1)>',
    );
    const fetched = await db.comment.findUniqueOrThrow({
      where: { id: probe.id },
      select: { body: true },
    });
    // Stored as TEXT — the markup is data, not markup.
    expect(fetched.body).toContain("<script>");
    const list = await api("GET", listUrl(novelId, chapterNumber));
    const bodies = (list.json!.comments as Array<Record<string, unknown>>).map(
      (c) => c.body,
    );
    expect(bodies).toContain('<script>alert("xss")</script><img src=x onerror=alert(1)>');
  });

  it("empty body and control characters → 400", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");

    for (const [i, bad] of ["   ", "hello\x00world", "a\x07b"].entries()) {
      // Fresh session per attempt: the burst limiter is keyed on the session.
      const probe = await seedUser(`ctrl${i}@example.com`);
      const res = await api("POST", "/api/reader/comments", probe.cookie, {
        novelId,
        chapterNumber,
        body: bad,
      });
      expect(res.status).toBe(400);
      expect(res.json).toEqual({ error: "INVALID_INPUT" });
    }
  });

  it("reply to a top-level comment → 201 nested; reply to a reply → 400", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("replier@example.com");
    const parent = await seedComment(reader.userId, novelId, chapterNumber, "Parent");

    const reply = await api("POST", "/api/reader/comments", reader.cookie, {
      novelId,
      chapterNumber,
      body: "A reply",
      parentId: parent.id,
    });
    expect(reply.status).toBe(201);
    expect((reply.json!.comment as Record<string, unknown>).parentId).toBe(
      parent.id,
    );

    const nested = await api("GET", listUrl(novelId, chapterNumber));
    const top = (nested.json!.comments as Array<Record<string, unknown>>)[0]!;
    expect(top.replyCount).toBe(1);
    expect((top.replies as Array<Record<string, unknown>>)[0]!.body).toBe(
      "A reply",
    );

    // Reply to a reply (depth would be 2) → 400. Fresh session per
    // POST: the burst limiter is keyed on the session.
    const deepUser = await seedUser("deep@example.com");
    const replyId = ((reply.json!.comment as Record<string, unknown>).id) as string;
    const tooDeep = await api("POST", "/api/reader/comments", deepUser.cookie, {
      novelId,
      chapterNumber,
      body: "Too deep",
      parentId: replyId,
    });
    expect(tooDeep.status).toBe(400);

    // parentId on another chapter → 400.
    const ch2 = await makeChapter(owner.cookie, ws, novelId, "Chapter 2");
    const v2 = await saveVersion(owner.cookie, ws, novelId, ch2.id, "More prose.");
    await publishChapter(owner.cookie, ws, novelId, ch2.id, v2.id);
    const crossUser = await seedUser("cross@example.com");
    const crossChapter = await api("POST", "/api/reader/comments", crossUser.cookie, {
      novelId,
      chapterNumber: ch2.number,
      body: "Wrong chapter parent",
      parentId: parent.id,
    });
    expect(crossChapter.status).toBe(400);
  });

  it("edit: own within 15 min → 200; after 15 min → 403; another's → 403; HIDDEN → 403; DELETED → 404", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("editor@example.com");
    const other = await seedUser("other2@example.com");

    const mine = await seedComment(reader.userId, novelId, chapterNumber, "Original");
    const edit = await api("PATCH", `/api/reader/comments/${mine.id}`, reader.cookie, {
      body: "Edited!",
    });
    expect(edit.status).toBe(200);
    expect((edit.json!.comment as Record<string, unknown>).body).toBe("Edited!");

    // Another user's comment → 403.
    const theirs = await seedComment(other.userId, novelId, chapterNumber, "Theirs");
    const notMine = await api("PATCH", `/api/reader/comments/${theirs.id}`, reader.cookie, {
      body: "Hijack",
    });
    expect(notMine.status).toBe(403);

    // Older than 15 minutes → 403.
    const old = await seedComment(
      reader.userId,
      novelId,
      chapterNumber,
      "Old comment",
      null,
      new Date(Date.now() - 16 * 60 * 1000),
    );
    const stale = await api("PATCH", `/api/reader/comments/${old.id}`, reader.cookie, {
      body: "Too late",
    });
    expect(stale.status).toBe(403);

    // HIDDEN is not author-editable, even within the window → 403.
    await db.comment.update({ where: { id: mine.id }, data: { status: "HIDDEN" } });
    const hiddenEdit = await api("PATCH", `/api/reader/comments/${mine.id}`, reader.cookie, {
      body: "Edit while hidden",
    });
    expect(hiddenEdit.status).toBe(403);

    // DELETED → 404.
    await db.comment.update({ where: { id: mine.id }, data: { status: "DELETED" } });
    const gone = await api("PATCH", `/api/reader/comments/${mine.id}`, reader.cookie, {
      body: "Edit a tombstone",
    });
    expect(gone.status).toBe(404);
  });

  it("delete own → 204 → tombstone; staff can delete any; repeat delete → 204", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("deleter@example.com");

    const mine = await seedComment(reader.userId, novelId, chapterNumber, "Delete me");
    const del = await api("DELETE", `/api/reader/comments/${mine.id}`, reader.cookie);
    expect(del.status).toBe(204);
    const list = await api("GET", listUrl(novelId, chapterNumber));
    const tomb = (list.json!.comments as Array<Record<string, unknown>>)[0]!;
    expect(tomb.status).toBe("DELETED");
    expect(tomb.body).toBe("[deleted]");

    // Repeat delete → still 204 (idempotent).
    const again = await api("DELETE", `/api/reader/comments/${mine.id}`, reader.cookie);
    expect(again.status).toBe(204);

    // Staff (the novel owner) can delete someone else's comment.
    const victim = await seedComment(reader.userId, novelId, chapterNumber, "Victim");
    const staffDel = await api("DELETE", `/api/reader/comments/${victim.id}`, owner.cookie);
    expect(staffDel.status).toBe(204);

    // Non-staff cannot delete someone else's comment → 403.
    const viewer = await seedViewerMember(ws, "viewer@example.com");
    const other = await seedComment(reader.userId, novelId, chapterNumber, "Keep me");
    const forbidden = await api("DELETE", `/api/reader/comments/${other.id}`, viewer.cookie);
    expect(forbidden.status).toBe(403);
  });

  it("reports: each pinned reason → 201; duplicate → 200 same; invalid reason → 400; rate-limited", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reporter = await seedUser("rep2@example.com");
    const author = await seedUser("author2@example.com");

    const reasons = ["SPAM", "HARASSMENT", "SPOILER", "OFF_TOPIC", "OTHER"] as const;
    for (const reason of reasons) {
      const target = await seedComment(author.userId, novelId, chapterNumber, `Report me: ${reason}`);
      const res = await api(
        "POST",
        `/api/reader/comments/${target.id}/reports`,
        reporter.cookie,
        { reason },
      );
      expect(res.status).toBe(201);
      expect((res.json!.report as Record<string, unknown>).reason).toBe(reason);

      // Duplicate → 200 with the same row (never 409, never a duplicate row).
      const dup = await api(
        "POST",
        `/api/reader/comments/${target.id}/reports`,
        reporter.cookie,
        { reason },
      );
      expect(dup.status).toBe(200);
      expect((dup.json!.report as Record<string, unknown>).reason).toBe(reason);
      const count = await db.commentReport.count({
        where: { commentId: target.id, reporterId: reporter.userId },
      });
      expect(count).toBe(1);
    }

    const target = await seedComment(author.userId, novelId, chapterNumber, "Bad reason target");
    const bad = await api(
      "POST",
      `/api/reader/comments/${target.id}/reports`,
      reporter.cookie,
      { reason: "NOPE" },
    );
    expect(bad.status).toBe(400);

    // Unauthenticated → 401.
    const anon = await api(
      "POST",
      `/api/reader/comments/${target.id}/reports`,
      undefined,
      { reason: "SPAM" },
    );
    expect(anon.status).toBe(401);
  });

  it("moderation: non-staff hide → 403; staff hide → HIDDEN (invisible to others, visible to staff+author with notice); unhide restores", async () => {
    const owner = await seedUser("owner@example.com", "Novel Owner");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("mod-target@example.com", "Target Reader");
    const viewer = await seedViewerMember(ws, "viewer2@example.com");
    const target = await seedComment(reader.userId, novelId, chapterNumber, "Needs hiding");

    // Non-staff (VIEWER member) → 403.
    const vHide = await api("POST", `/api/reader/comments/${target.id}/hide`, viewer.cookie);
    expect(vHide.status).toBe(403);

    // Non-member → 404 (no oracle).
    const outsider = await seedUser("outsider@example.com");
    const oHide = await api("POST", `/api/reader/comments/${target.id}/hide`, outsider.cookie);
    expect(oHide.status).toBe(404);

    // Staff hide → 200 HIDDEN.
    const hide = await api("POST", `/api/reader/comments/${target.id}/hide`, owner.cookie);
    expect(hide.status).toBe(200);
    expect((hide.json!.comment as Record<string, unknown>).status).toBe("HIDDEN");

    // Anonymous list: the HIDDEN comment is gone.
    const anonList = await api("GET", listUrl(novelId, chapterNumber));
    expect((anonList.json!.comments as Array<unknown>)).toHaveLength(0);

    // The author still sees it, with the hidden-by-moderator notice.
    const authorList = await api("GET", listUrl(novelId, chapterNumber), reader.cookie);
    const mine = (authorList.json!.comments as Array<Record<string, unknown>>)[0]!;
    expect(mine.body).toBe("Needs hiding");
    expect(mine.hiddenByModerator).toBe(true);

    // Staff sees it too (with the notice).
    const staffList = await api("GET", listUrl(novelId, chapterNumber), owner.cookie);
    const staffView = (staffList.json!.comments as Array<Record<string, unknown>>)[0]!;
    expect(staffView.body).toBe("Needs hiding");
    expect(staffView.hiddenByModerator).toBe(true);

    // Unhide restores.
    const unhide = await api("POST", `/api/reader/comments/${target.id}/unhide`, owner.cookie);
    expect(unhide.status).toBe(200);
    expect((unhide.json!.comment as Record<string, unknown>).status).toBe("VISIBLE");
    const restored = await api("GET", listUrl(novelId, chapterNumber));
    expect((restored.json!.comments as Array<unknown>)).toHaveLength(1);

    // Non-staff unhide → 403.
    await api("POST", `/api/reader/comments/${target.id}/hide`, owner.cookie);
    const vUnhide = await api("POST", `/api/reader/comments/${target.id}/unhide`, viewer.cookie);
    expect(vUnhide.status).toBe(403);

    // The hide was audit-logged (actor identity only).
    const audits = await db.auditLog.findMany({
      where: { action: "comment.hidden", entityId: target.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.actorUserId).toBe(owner.userId);
    expect(JSON.stringify(audits[0]!.payload)).not.toContain("Needs hiding");
  });

  it("report queue: staff-only, counts without reporter identities, ?status= filter", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const r1 = await seedUser("qr1@example.com");
    const r2 = await seedUser("qr2@example.com");
    const author = await seedUser("qauthor@example.com", "Q Author");
    const viewer = await seedViewerMember(ws, "viewer3@example.com");

    const c1 = await seedComment(author.userId, novelId, chapterNumber, "Reported one");
    const c2 = await seedComment(author.userId, novelId, chapterNumber, "Reported two");
    await db.commentReport.createMany({
      data: [
        { commentId: c1.id, reporterId: r1.userId, reason: "SPAM" },
        { commentId: c1.id, reporterId: r2.userId, reason: "SPAM" },
        { commentId: c2.id, reporterId: r1.userId, reason: "HARASSMENT" },
      ],
    });

    // Non-staff → 403; unauthenticated → 401.
    const vq = await api("GET", `/api/reader/novels/${novelId}/moderation/reports`, viewer.cookie);
    expect(vq.status).toBe(403);
    const aq = await api("GET", `/api/reader/novels/${novelId}/moderation/reports`);
    expect(aq.status).toBe(401);

    const q = await api("GET", `/api/reader/novels/${novelId}/moderation/reports`, owner.cookie);
    expect(q.status).toBe(200);
    const reports = q.json!.reports as Array<Record<string, unknown>>;
    expect(reports).toHaveLength(2);
    const spam = reports.find((r) => r.reason === "SPAM")!;
    expect(spam.reporterCount).toBe(2);
    // Reporter identities are never exposed.
    expect(JSON.stringify(q.json)).not.toContain("qr1@example.com");
    expect(JSON.stringify(q.json)).not.toContain(r1.userId);
    expect(JSON.stringify(q.json)).not.toContain(r2.userId);

    // ?status= filter: hide c1, then filter HIDDEN vs VISIBLE.
    await api("POST", `/api/reader/comments/${c1.id}/hide`, owner.cookie);
    const hidden = await api(
      "GET",
      `/api/reader/novels/${novelId}/moderation/reports?status=HIDDEN`,
      owner.cookie,
    );
    const hiddenReports = hidden.json!.reports as Array<Record<string, unknown>>;
    expect(hiddenReports).toHaveLength(1);
    expect(((hiddenReports[0]!.comment as Record<string, unknown>).id as string)).toBe(c1.id);
    const visible = await api(
      "GET",
      `/api/reader/novels/${novelId}/moderation/reports?status=VISIBLE`,
      owner.cookie,
    );
    expect((visible.json!.reports as Array<unknown>)).toHaveLength(1);
  });

  it("commentCount counts VISIBLE only; hide/delete decrement transactionally", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("counter@example.com");

    const chapterRow = () =>
      db.chapter.findFirstOrThrow({
        where: { novelId, number: chapterNumber },
        select: { commentCount: true },
      });
    expect((await chapterRow()).commentCount).toBe(0);

    const c1 = await db.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: { userId: reader.userId, novelId, chapterNumber, body: "One" },
      });
      await tx.chapter.updateMany({
        where: { novelId, number: chapterNumber },
        data: { commentCount: { increment: 1 } },
      });
      return c;
    });
    expect((await chapterRow()).commentCount).toBe(1);

    // Hide via HTTP → decrements.
    await api("POST", `/api/reader/comments/${c1.id}/hide`, owner.cookie);
    expect((await chapterRow()).commentCount).toBe(0);

    // Unhide → re-increments.
    await api("POST", `/api/reader/comments/${c1.id}/unhide`, owner.cookie);
    expect((await chapterRow()).commentCount).toBe(1);

    // Delete (author) → decrements.
    await api("DELETE", `/api/reader/comments/${c1.id}`, reader.cookie);
    expect((await chapterRow()).commentCount).toBe(0);
  });

  it("cursor pagination lists top-level oldest-first with nested replies", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws1");
    const { novelId, chapterNumber } = await seedPublishedNovel(owner, ws, "n1");
    const reader = await seedUser("pager@example.com");

    for (let i = 0; i < 5; i++) {
      await seedComment(
        reader.userId,
        novelId,
        chapterNumber,
        `Top ${i}`,
        null,
        new Date(Date.now() + i * 1000),
      );
    }
    const page1 = await api("GET", `${listUrl(novelId, chapterNumber)}&limit=2`);
    expect(page1.status).toBe(200);
    const p1 = page1.json!.comments as Array<Record<string, unknown>>;
    expect(p1.map((c) => c.body)).toEqual(["Top 0", "Top 1"]);
    expect((page1.json!.page as Record<string, unknown>).hasMore).toBe(true);
    const cursor = (page1.json!.page as Record<string, unknown>).cursor as string;

    const page2 = await api(
      "GET",
      `${listUrl(novelId, chapterNumber)}&limit=2&cursor=${encodeURIComponent(cursor)}`,
    );
    const p2 = page2.json!.comments as Array<Record<string, unknown>>;
    expect(p2.map((c) => c.body)).toEqual(["Top 2", "Top 3"]);
  });
});
