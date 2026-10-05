/**
 * NF-WF-012 publication release contract tests.
 *
 * Dedicated novelforge_test_publication db (parallel-safe per ADR-0003 §8).
 * The BullMQ publication queue is faked (buildApp seam) — enqueue/remove
 * behavior is asserted on the fake; the real worker handler +
 * reconciliation are covered in apps/worker (publication-jobs.test.ts)
 * against real Redis.
 *
 * Covers the contract acceptance checkboxes:
 * - publish: 200 + PUBLISHED pin + chapters.status + novel DRAFT→ACTIVE;
 *   401/404/403 negatives
 * - Invariant 3 gate: REVIEW_STALE / HARD_POLICY_VIOLATION via both
 *   DRAFT→PUBLISHED and IN_REVIEW→PUBLISHED
 * - unpublish: PUBLISHED→IN_REVIEW, visibility fails, editing reopens
 * - re-publish: new pin replaces; PUBLISHED→PUBLISHED refused
 * - schedule/cancel/reschedule + job bookkeeping; 400/409 codes;
 *   schedule needs no receipt
 * - archive/unarchive: visibility, schedule cancellation, NOVEL_ARCHIVED
 * - version pinning: resolvePublicChapter serves the pin, never the live
 *   pointer; isPubliclyVisible predicate
 * - restoreTarget: false — restore never rewinds publication
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
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import { createRevisionServices } from "./services/revisions.ts";
import type { PublicationJobData } from "@novelforge/workflow-executor";

const TEST_DB = "novelforge_test_publication";
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

/** Fake BullMQ publication queue: records add/remove; job state is scriptable. */
function createFakePublicationQueue() {
  const jobs = new Map<
    string,
    { name: string; data: PublicationJobData; delay: number; state: string }
  >();
  return {
    jobs,
    async add(
      name: string,
      data: PublicationJobData,
      opts: { jobId: string; delay?: number },
    ) {
      jobs.set(opts.jobId, {
        name,
        data,
        delay: opts.delay ?? 0,
        state: "delayed",
      });
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
    setState(jobId: string, state: string) {
      const j = jobs.get(jobId);
      if (j) j.state = state;
    },
  };
}
type FakeQueue = ReturnType<typeof createFakePublicationQueue>;

let db: NovelForgeDb;
let app: FastifyInstance;
let fakeQueue: FakeQueue;

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

/** Seed user + session; returns cookie header value. */
async function seedUser(email: string): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
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

async function seedWorkspace(
  ownerId: string,
  slug: string,
  members: { userId: string; role: "EDITOR" | "VIEWER" | "AUTHOR" }[] = [],
) {
  const ws = await db.workspace.create({
    data: { name: slug, slug, ownerId },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  for (const m of members) {
    await db.membership.create({
      data: { workspaceId: ws.id, userId: m.userId, role: m.role },
    });
  }
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug: `novel-${slug}`,
  });
  return { workspaceId: ws.id, novelId: novel.id, novelSlug: `novel-${slug}` };
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
    payload: {
      content,
      expectedVersion: current.currentVersion?.number ?? null,
    },
  });
  expect(res.statusCode).toBe(200);
  const version = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId },
    orderBy: { number: "desc" },
  });
  return version;
}

async function headRevisionId(novelId: string): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId, name: "main" },
    select: { headRevisionId: true },
  });
  return branch.headRevisionId!;
}

/** Seed a review receipt directly (deterministic; the review logic is 010's tested territory). */
async function seedReceipt(
  ids: { workspaceId: string; novelId: string },
  chapterVersionId: string,
  verdict: "PASS" | "FAIL",
) {
  return db.finalTextReview.create({
    data: {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId,
      revisionId: await headRevisionId(ids.novelId),
      verdict,
      hardViolations:
        verdict === "FAIL" ? [{ rule: "COOLDOWN_VIOLATION", evidence: [] }] : [],
      advisory: [],
      evaluatedPolicies: {},
    },
  });
}

const pubUrl = (ids: { workspaceId: string; novelId: string }, chapterId: string) =>
  `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/publication`;

async function api(
  method: "GET" | "POST" | "DELETE",
  url: string,
  cookie: string,
  body?: Record<string, unknown>,
) {
  const res = await app.inject({
    method,
    url,
    headers: { cookie },
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

describe("publish chapter (immediate)", () => {
  it("publishes a reviewed chapter: 200, PUBLISHED pin, chapter status, novel DRAFT→ACTIVE", async () => {
    const owner = await seedUser("owner-pub1@example.com");
    const ids = await seedWorkspace(owner.userId, "pub1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Once upon a time in Eldoria.");
    await seedReceipt(ids, v.id, "PASS");

    const res = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.publicationId).toBeTruthy();
    expect(res.body.pinnedVersionId).toBe(v.id);
    expect(res.body.publishedAt).toBeTruthy();

    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.status).toBe("PUBLISHED");
    expect(row.chapterVersionId).toBe(v.id);
    expect(row.publishedById).toBe(owner.userId);
    expect(row.revisionId).toBeTruthy();

    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: ch.id } });
    expect(chapter.status).toBe("PUBLISHED");
    const novel = await db.novel.findUniqueOrThrow({ where: { id: ids.novelId } });
    expect(novel.status).toBe("ACTIVE");

    // Member-visible status endpoint.
    const status = await api("GET", pubUrl(ids, ch.id), owner.cookie);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("PUBLISHED");
    expect(status.body.pinnedVersionNumber).toBe(1);
  });

  it("401 unauthenticated / 404 non-member / 403 member without chapter:publish", async () => {
    const owner = await seedUser("owner-pub2@example.com");
    const editor = await seedUser("editor-pub2@example.com");
    const outsider = await seedUser("outsider-pub2@example.com");
    const ids = await seedWorkspace(owner.userId, "pub2", [
      { userId: editor.userId, role: "EDITOR" },
    ]);
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Text.");
    await seedReceipt(ids, v.id, "PASS");

    // Unauthenticated.
    const anon = await app.inject({
      method: "POST",
      url: `${pubUrl(ids, ch.id)}/publish`,
    });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error).toBe("UNAUTHENTICATED");

    // Non-member.
    const nm = await api("POST", `${pubUrl(ids, ch.id)}/publish`, outsider.cookie);
    expect(nm.status).toBe(404);
    expect(nm.body.error).toBe("NOT_FOUND");

    // EDITOR has chapter:update but not chapter:publish.
    const ed = await api("POST", `${pubUrl(ids, ch.id)}/publish`, editor.cookie);
    expect(ed.status).toBe(403);
    expect(ed.body.error).toBe("FORBIDDEN");

    // Sanity: nothing was published.
    expect(await db.publication.findUnique({ where: { chapterId: ch.id } })).toBeNull();
  });

  it("refuses without a PASS receipt: 409 REVIEW_STALE; FAIL receipt: 409 HARD_POLICY_VIOLATION (DRAFT→PUBLISHED)", async () => {
    const owner = await seedUser("owner-pub3@example.com");
    const ids = await seedWorkspace(owner.userId, "pub3");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    await saveVersion(owner.cookie, ids, ch.id, "Unreviewed text.");

    const stale = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("REVIEW_STALE");

    const v = await db.chapterVersion.findFirstOrThrow({ where: { chapterId: ch.id } });
    await seedReceipt(ids, v.id, "FAIL");
    const fail = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(fail.status).toBe(409);
    expect(fail.body.error).toBe("HARD_POLICY_VIOLATION");
  });

  it("Invariant 3: the IN_REVIEW→PUBLISHED path is gated too (012 behavior change)", async () => {
    const owner = await seedUser("owner-pub4@example.com");
    const ids = await seedWorkspace(owner.userId, "pub4");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v1 = await saveVersion(owner.cookie, ids, ch.id, "First version.");
    await seedReceipt(ids, v1.id, "PASS");
    // Move to IN_REVIEW via the legacy status route (DRAFT→IN_REVIEW is
    // gated by 010 and the receipt exists).
    const toReview = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "IN_REVIEW" },
    });
    expect(toReview.statusCode).toBe(200);
    // Save a NEW (unreviewed) version while IN_REVIEW — the 010 hole.
    const v2 = await saveVersion(owner.cookie, ids, ch.id, "Second version, never reviewed.");

    // Via the legacy PATCH route: now gated (was the carve-out).
    const legacy = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(legacy.statusCode).toBe(409);
    expect(legacy.json().error).toBe("REVIEW_STALE");

    // Via the new publication route: also gated.
    const viaRoute = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(viaRoute.status).toBe(409);
    expect(viaRoute.body.error).toBe("REVIEW_STALE");

    // Review the new version → both paths open.
    await seedReceipt(ids, v2.id, "PASS");
    const ok = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.pinnedVersionId).toBe(v2.id);
  });

  it("refuses PUBLISHED→PUBLISHED: 409 ALREADY_PUBLISHED", async () => {
    const owner = await seedUser("owner-pub5@example.com");
    const ids = await seedWorkspace(owner.userId, "pub5");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Text.");
    await seedReceipt(ids, v.id, "PASS");
    const first = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(first.status).toBe(200);
    const again = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("ALREADY_PUBLISHED");
  });
});

describe("unpublish + re-publish", () => {
  it("unpublishes: chapter back to IN_REVIEW, visibility fails, editing reopens", async () => {
    const owner = await seedUser("owner-unp1@example.com");
    const ids = await seedWorkspace(owner.userId, "unp1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Published text.");
    await seedReceipt(ids, v.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    const unpub = await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);
    expect(unpub.status).toBe(200);

    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: ch.id } });
    expect(chapter.status).toBe("IN_REVIEW");
    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.status).toBe("UNPUBLISHED");
    // The pin is retained on the row for history.
    expect(row.chapterVersionId).toBe(v.id);

    // The author can save a new version again (immutability guard lifted).
    const v2 = await saveVersion(owner.cookie, ids, ch.id, "Edited after unpublish.");
    expect(v2.number).toBe(2);

    // Unpublishing a non-published chapter is a 409.
    const again = await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);
    expect(again.status).toBe(409);
  });

  it("re-publish pins the new version; the old pin is replaced", async () => {
    const owner = await seedUser("owner-unp2@example.com");
    const ids = await seedWorkspace(owner.userId, "unp2");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v1 = await saveVersion(owner.cookie, ids, ch.id, "Version one.");
    await seedReceipt(ids, v1.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);

    const v2 = await saveVersion(owner.cookie, ids, ch.id, "Version two.");
    await seedReceipt(ids, v2.id, "PASS");
    const repub = await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(repub.status).toBe(200);
    expect(repub.body.pinnedVersionId).toBe(v2.id);

    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.status).toBe("PUBLISHED");
    expect(row.chapterVersionId).toBe(v2.id);
    // The superseded version row still exists (immutable history).
    expect(await db.chapterVersion.findUnique({ where: { id: v1.id } })).not.toBeNull();
  });
});

describe("schedule / cancel / reschedule", () => {
  it("schedules: 201, SCHEDULED row, delayed job enqueued; needs no receipt", async () => {
    const owner = await seedUser("owner-sch1@example.com");
    const ids = await seedWorkspace(owner.userId, "sch1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    await saveVersion(owner.cookie, ids, ch.id, "Unreviewed but schedulable.");
    const at = new Date(Date.now() + 3_600_000).toISOString();

    const res = await api(
      "POST",
      `${pubUrl(ids, ch.id)}/schedule`,
      owner.cookie,
      { scheduledFor: at },
    );
    expect(res.status).toBe(201);
    expect(res.body.publicationId).toBeTruthy();
    expect(res.body.scheduledFor).toBe(at);

    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.status).toBe("SCHEDULED");
    expect(row.scheduledFor?.toISOString()).toBe(at);

    const job = fakeQueue.jobs.get(row.id);
    expect(job).toBeTruthy();
    expect(job!.data.publicationId).toBe(row.id);
    expect(job!.data.scheduledFor).toBe(at);
    expect(job!.delay).toBeGreaterThan(0);
  });

  it("400 on past or unparseable scheduledFor", async () => {
    const owner = await seedUser("owner-sch2@example.com");
    const ids = await seedWorkspace(owner.userId, "sch2");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    await saveVersion(owner.cookie, ids, ch.id, "Text.");

    const past = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie, {
      scheduledFor: new Date(Date.now() - 1000).toISOString(),
    });
    expect(past.status).toBe(400);
    expect(past.body.error).toBe("INVALID_INPUT");

    const bad = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie, {
      scheduledFor: "not-a-date",
    });
    expect(bad.status).toBe(400);
  });

  it("reschedule replaces the time and the old job; cancel removes the job", async () => {
    const owner = await seedUser("owner-sch3@example.com");
    const ids = await seedWorkspace(owner.userId, "sch3");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    await saveVersion(owner.cookie, ids, ch.id, "Text.");
    const at1 = new Date(Date.now() + 3_600_000).toISOString();
    const at2 = new Date(Date.now() + 7_200_000).toISOString();

    const s1 = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie, {
      scheduledFor: at1,
    });
    expect(s1.status).toBe(201);
    const pubId = s1.body.publicationId as string;
    expect(fakeQueue.jobs.has(pubId)).toBe(true);

    const s2 = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie, {
      scheduledFor: at2,
    });
    expect(s2.status).toBe(201);
    expect(s2.body.publicationId).toBe(pubId);
    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.scheduledFor?.toISOString()).toBe(at2);
    // Exactly one live job: the old one was removed first.
    expect(fakeQueue.jobs.size).toBe(1);
    expect(fakeQueue.jobs.get(pubId)!.data.scheduledFor).toBe(at2);

    const cancel = await api("DELETE", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie);
    expect(cancel.status).toBe(200);
    expect(cancel.body.publicationId).toBe(pubId);
    const after = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(after.status).toBe("UNPUBLISHED");
    expect(after.scheduledFor).toBeNull();
    expect(fakeQueue.jobs.has(pubId)).toBe(false);
  });

  it("409 ALREADY_PUBLISHED on schedule; 409 NOT_SCHEDULED on cancel of non-scheduled", async () => {
    const owner = await seedUser("owner-sch4@example.com");
    const ids = await seedWorkspace(owner.userId, "sch4");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Text.");
    await seedReceipt(ids, v.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    const sch = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, owner.cookie, {
      scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(sch.status).toBe(409);
    expect(sch.body.error).toBe("ALREADY_PUBLISHED");

    const ch2 = await makeChapter(owner.cookie, ids, "Ch 2");
    await saveVersion(owner.cookie, ids, ch2.id, "Text 2.");
    const cancel = await api("DELETE", `${pubUrl(ids, ch2.id)}/schedule`, owner.cookie);
    expect(cancel.status).toBe(409);
    expect(cancel.body.error).toBe("NOT_SCHEDULED");
  });

  it("capability negatives on schedule/cancel: 401/404/403", async () => {
    const owner = await seedUser("owner-sch5@example.com");
    const viewer = await seedUser("viewer-sch5@example.com");
    const outsider = await seedUser("outsider-sch5@example.com");
    const ids = await seedWorkspace(owner.userId, "sch5", [
      { userId: viewer.userId, role: "VIEWER" },
    ]);
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    await saveVersion(owner.cookie, ids, ch.id, "Text.");
    const at = new Date(Date.now() + 3_600_000).toISOString();

    const anon = await app.inject({
      method: "POST",
      url: `${pubUrl(ids, ch.id)}/schedule`,
      payload: { scheduledFor: at },
    });
    expect(anon.statusCode).toBe(401);

    const nm = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, outsider.cookie, {
      scheduledFor: at,
    });
    expect(nm.status).toBe(404);

    const vw = await api("POST", `${pubUrl(ids, ch.id)}/schedule`, viewer.cookie, {
      scheduledFor: at,
    });
    expect(vw.status).toBe(403);
    expect(vw.body.error).toBe("FORBIDDEN");
  });
});

describe("archive / unarchive", () => {
  it("archives: public reads 404, member routes unchanged, schedules cancelled; unarchive restores", async () => {
    const owner = await seedUser("owner-arc1@example.com");
    const ids = await seedWorkspace(owner.userId, "arc1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Published text.");
    await seedReceipt(ids, v.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    const ch2 = await makeChapter(owner.cookie, ids, "Ch 2");
    await saveVersion(owner.cookie, ids, ch2.id, "Scheduled text.");
    const sch = await api("POST", `${pubUrl(ids, ch2.id)}/schedule`, owner.cookie, {
      scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(sch.status).toBe(201);
    const schPubId = sch.body.publicationId as string;
    expect(fakeQueue.jobs.has(schPubId)).toBe(true);

    const arc = await api(
      "POST",
      `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/archive`,
      owner.cookie,
    );
    expect(arc.status).toBe(200);
    expect((await db.novel.findUniqueOrThrow({ where: { id: ids.novelId } })).status).toBe("ARCHIVED");

    // Q5: schedules cancelled — row UNPUBLISHED, job removed.
    const schRow = await db.publication.findUniqueOrThrow({ where: { id: schPubId } });
    expect(schRow.status).toBe("UNPUBLISHED");
    expect(fakeQueue.jobs.has(schPubId)).toBe(false);

    // Schedule/publish on an archived novel → 409 NOVEL_ARCHIVED.
    const schAfter = await api("POST", `${pubUrl(ids, ch2.id)}/schedule`, owner.cookie, {
      scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(schAfter.status).toBe(409);
    expect(schAfter.body.error).toBe("NOVEL_ARCHIVED");

    // Member routes unchanged: the author can still read publication status.
    const status = await api("GET", pubUrl(ids, ch.id), owner.cookie);
    expect(status.status).toBe(200);

    const unarc = await api(
      "POST",
      `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/unarchive`,
      owner.cookie,
    );
    expect(unarc.status).toBe(200);
    expect((await db.novel.findUniqueOrThrow({ where: { id: ids.novelId } })).status).toBe("ACTIVE");
    // PUBLISHED chapter visible again; cancelled schedule NOT resurrected.
    const pubRow = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(pubRow.status).toBe("PUBLISHED");
    expect((await db.publication.findUniqueOrThrow({ where: { id: schPubId } })).status).toBe(
      "UNPUBLISHED",
    );
  });

  it("archive capability: novel:archive holder only (AUTHOR has it, EDITOR/VIEWER do not)", async () => {
    const owner = await seedUser("owner-arc2@example.com");
    const author = await seedUser("author-arc2@example.com");
    const editor = await seedUser("editor-arc2@example.com");
    const ids = await seedWorkspace(owner.userId, "arc2", [
      { userId: author.userId, role: "AUTHOR" },
      { userId: editor.userId, role: "EDITOR" },
    ]);
    const url = `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/archive`;

    const ed = await api("POST", url, editor.cookie);
    expect(ed.status).toBe(403);

    const au = await api("POST", url, author.cookie);
    expect(au.status).toBe(200);
    expect((await db.novel.findUniqueOrThrow({ where: { id: ids.novelId } })).status).toBe("ARCHIVED");
  });
});

describe("version pinning + visibility (013 handoff shapes)", () => {
  it("public resolution serves the pinned version, never the live pointer", async () => {
    const owner = await seedUser("owner-vis1@example.com");
    const ids = await seedWorkspace(owner.userId, "vis1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v1 = await saveVersion(owner.cookie, ids, ch.id, "Version one public.");
    await seedReceipt(ids, v1.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    // Unpublish → edit → re-publish: the pin moves to v2.
    await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);
    const v2 = await saveVersion(owner.cookie, ids, ch.id, "Version two public.");
    await seedReceipt(ids, v2.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    const { createPublicationServices } = await import("./services/publication.ts");
    const services = createPublicationServices({
      db,
      queue: fakeQueue,
      manuscripts: null as never,
    });
    // Visible: ACTIVE novel + PUBLISHED row.
    expect(await services.isPubliclyVisible({ novelId: ids.novelId, chapterId: ch.id })).toBe(true);
    const resolved = await services.resolvePublicChapter({
      novelSlug: ids.novelSlug,
      chapterNumber: 1,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.pinnedVersionId).toBe(v2.id);
    const content = await db.chapterVersion.findUniqueOrThrow({
      where: { id: resolved!.pinnedVersionId },
    });
    expect(content.content).toBe("Version two public.");

    // After unpublish, nothing is visible (no oracle: false, not throw).
    await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);
    expect(await services.isPubliclyVisible({ novelId: ids.novelId, chapterId: ch.id })).toBe(false);
    expect(
      await services.resolvePublicChapter({ novelSlug: ids.novelSlug, chapterNumber: 1 }),
    ).toBeNull();
    // Unknown slug and unknown chapter number also resolve null.
    expect(
      await services.resolvePublicChapter({ novelSlug: "no-such-novel", chapterNumber: 1 }),
    ).toBeNull();
    expect(
      await services.resolvePublicChapter({ novelSlug: ids.novelSlug, chapterNumber: 99 }),
    ).toBeNull();
  });

  it("archived and draft novels expose nothing", async () => {
    const owner = await seedUser("owner-vis2@example.com");
    const ids = await seedWorkspace(owner.userId, "vis2");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Text.");
    await seedReceipt(ids, v.id, "PASS");

    const { createPublicationServices } = await import("./services/publication.ts");
    const services = createPublicationServices({
      db,
      queue: fakeQueue,
      manuscripts: null as never,
    });
    // DRAFT novel (never published): nothing visible.
    expect(await services.isPubliclyVisible({ novelId: ids.novelId, chapterId: ch.id })).toBe(false);

    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);
    expect(await services.isPubliclyVisible({ novelId: ids.novelId, chapterId: ch.id })).toBe(true);

    await api("POST", `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/archive`, owner.cookie);
    expect(await services.isPubliclyVisible({ novelId: ids.novelId, chapterId: ch.id })).toBe(false);
    expect(
      await services.resolvePublicChapter({ novelSlug: ids.novelSlug, chapterNumber: 1 }),
    ).toBeNull();
  });
});

describe("restore never rewinds publication (Invariant 8)", () => {
  it("restoring a post-publish checkpoint does not resurrect a cancelled publication", async () => {
    const owner = await seedUser("owner-rst1@example.com");
    const ids = await seedWorkspace(owner.userId, "rst1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const v = await saveVersion(owner.cookie, ids, ch.id, "Published text.");
    await seedReceipt(ids, v.id, "PASS");
    await api("POST", `${pubUrl(ids, ch.id)}/publish`, owner.cookie);

    const revisions = createRevisionServices({ db, audit: createAuditService(db) });
    const cp = await revisions.createCheckpoint({
      actorUserId: owner.userId,
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      label: "post-publish",
    });

    // Cancel the publication after the checkpoint (unpublish → row UNPUBLISHED).
    await api("POST", `${pubUrl(ids, ch.id)}/unpublish`, owner.cookie);
    expect((await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } })).status).toBe(
      "UNPUBLISHED",
    );

    // Restore to the post-publish checkpoint: the publication row must NOT
    // come back as PUBLISHED (restoreTarget: false).
    const preview = await revisions.previewRestore({
      actorUserId: owner.userId,
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      checkpointId: cp.checkpointId,
    });
    await revisions.applyRestore({
      actorUserId: owner.userId,
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      restoreOperationId: preview.restoreOperationId,
    });
    const row = await db.publication.findUniqueOrThrow({ where: { chapterId: ch.id } });
    expect(row.status).toBe("UNPUBLISHED");
    expect(row.chapterVersionId).toBe(v.id);
  });
});
