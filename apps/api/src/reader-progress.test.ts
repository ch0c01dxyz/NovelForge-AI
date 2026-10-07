/**
 * Synced reading progress (NF-WF-019D) integration suite.
 *
 * Dedicated novelforge_test_reader_progress db (parallel-safe per ADR-0003 §8).
 *
 * Covers (019D contract):
 * - PUT /api/reader/progress: 200 with the stored position; NEWER
 *   clientUpdatedAt overwrites; OLDER clientUpdatedAt → 200 with the
 *   STORED (newer) position, no regression; EQUAL timestamp → stored
 *   wins (deterministic tie).
 * - Unauthenticated PUT/GET/DELETE → 401 {error:"UNAUTHENTICATED"}.
 * - GET returns only the caller's row; another user's progress is
 *   unreachable (no endpoint lists it).
 * - PUT on an invisible novel (DRAFT, no PUBLISHED publication) →
 *   404 {error:"NOT_FOUND"} (no oracle — identical to nonexistent).
 * - DELETE → 204 idempotent; GET after DELETE → { progress: null }.
 * - Engageable check is IN the SQL (Invariant 2): an unpublished
 *   novel's stored row is retained but the write 404s.
 * - Input validation: 400 INVALID_INPUT on bad novelId, chapterNumber,
 *   scrollRatio, clientUpdatedAt.
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

const TEST_DB = "novelforge_test_reader_progress";
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
  APP_ENCRYPTION_KEY: "unit-test-encryption-key",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

let db: NovelForgeDb;
let app: FastifyInstance;

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
  app = await buildApp(env, { db });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.readingProgress.deleteMany();
  await db.publication.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(email: string) {
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

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  return ws.id;
}

async function seedNovel(
  ownerId: string,
  workspaceId: string,
  novelSlug: string,
  status: "DRAFT" | "ACTIVE" = "DRAFT",
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

/**
 * Make a novel engageable (Invariant 2): ACTIVE + one PUBLISHED
 * publication, through the real publish path.
 */
async function seedEngageableNovel(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
) {
  const chRes = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
    headers: { cookie },
    payload: { title: "Chapter one" },
  });
  expect(chRes.statusCode).toBe(201);
  const ch = chRes.json() as { id: string; number: number };
  const current = await db.chapter.findUniqueOrThrow({
    where: { id: ch.id },
    select: { currentVersion: { select: { number: true } } },
  });
  const vRes = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
    headers: { cookie },
    payload: {
      content: "Once upon a time in a test novel.",
      expectedVersion: current.currentVersion?.number ?? null,
    },
  });
  expect(vRes.statusCode).toBe(200);
  const v = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId: ch.id },
    orderBy: { number: "desc" },
  });
  const rev = await db.revision.findFirstOrThrow({
    where: { novelId: ids.novelId },
    orderBy: { number: "desc" },
  });
  await db.finalTextReview.create({
    data: {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: v.id,
      revisionId: rev.id,
      verdict: "PASS",
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: {},
    },
  });
  const pubRes = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}/publication/publish`,
    headers: { cookie },
  });
  expect(pubRes.statusCode).toBe(200);
  await db.novel.update({ where: { id: ids.novelId }, data: { status: "ACTIVE" } });
}

async function api(
  method: "PUT" | "GET" | "DELETE",
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

const T0 = "2026-10-06T10:00:00.000Z";
const T1 = "2026-10-06T11:00:00.000Z";
const T2 = "2026-10-06T12:00:00.000Z";

describe("PUT /api/reader/progress (019D last-write-wins)", () => {
  it("stores progress for an authenticated user on an engageable novel", async () => {
    const owner = await seedUser("rp-owner@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws");
    const novelId = await seedNovel(owner.userId, ws, "rp-novel", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    const res = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 3,
      scrollRatio: 0.5,
      clientUpdatedAt: T1,
      deviceId: "device-a",
    });
    expect(res.status).toBe(200);
    const progress = res.body.progress as Record<string, unknown>;
    expect(progress.novelId).toBe(novelId);
    expect(progress.chapterNumber).toBe(3);
    expect(progress.scrollRatio).toBe(0.5);
    expect(progress.updatedAt).toBe(T1);
  });

  it("a NEWER clientUpdatedAt overwrites; an OLDER one returns the stored row without regression", async () => {
    const owner = await seedUser("rp-owner2@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws2");
    const novelId = await seedNovel(owner.userId, ws, "rp-novel2", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 3,
      clientUpdatedAt: T1,
    });
    // Newer write wins.
    const newer = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 5,
      clientUpdatedAt: T2,
    });
    expect(newer.status).toBe(200);
    expect((newer.body.progress as Record<string, unknown>).chapterNumber).toBe(5);

    // Older write: 200 with the STORED (newer) position — no regression.
    const older = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 1,
      clientUpdatedAt: T0,
    });
    expect(older.status).toBe(200);
    const stored = older.body.progress as Record<string, unknown>;
    expect(stored.chapterNumber).toBe(5);
    expect(stored.updatedAt).toBe(T2);

    // The row in the database is unchanged.
    const row = await db.readingProgress.findUniqueOrThrow({
      where: { userId_novelId: { userId: owner.userId, novelId } },
    });
    expect(row.chapterNumber).toBe(5);
  });

  it("an EQUAL timestamp keeps the stored row (deterministic tie)", async () => {
    const owner = await seedUser("rp-owner3@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws3");
    const novelId = await seedNovel(owner.userId, ws, "rp-novel3", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 3,
      scrollRatio: 0.25,
      clientUpdatedAt: T1,
    });
    const tie = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 9,
      scrollRatio: 0.9,
      clientUpdatedAt: T1,
    });
    expect(tie.status).toBe(200);
    const stored = tie.body.progress as Record<string, unknown>;
    expect(stored.chapterNumber).toBe(3);
    expect(stored.scrollRatio).toBe(0.25);
  });

  it("PUT on an invisible novel → 404 NOT_FOUND (no oracle)", async () => {
    const owner = await seedUser("rp-owner4@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws4");
    // DRAFT novel with no publication — invisible.
    const novelId = await seedNovel(owner.userId, ws, "rp-novel4", "DRAFT");

    const res = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 1,
      clientUpdatedAt: T1,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");

    // Identical response for a nonexistent novel id (no oracle).
    const ghost = await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId: "00000000-0000-0000-0000-000000000000",
      chapterNumber: 1,
      clientUpdatedAt: T1,
    });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error).toBe("NOT_FOUND");
  });

  it("unauthenticated PUT → 401 UNAUTHENTICATED", async () => {
    const owner = await seedUser("rp-owner5@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws5");
    const novelId = await seedNovel(owner.userId, ws, "rp-novel5", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    const res = await api("PUT", "/api/reader/progress", undefined, {
      novelId,
      chapterNumber: 1,
      clientUpdatedAt: T1,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });

  it("400 INVALID_INPUT on malformed body", async () => {
    const owner = await seedUser("rp-owner6@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-ws6");
    const novelId = await seedNovel(owner.userId, ws, "rp-novel6", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });
    const base = { novelId, chapterNumber: 1, clientUpdatedAt: T1 };

    for (const bad of [
      { ...base, novelId: "not-a-uuid" },
      { ...base, chapterNumber: 0 },
      { ...base, chapterNumber: 1.5 },
      { ...base, scrollRatio: 1.5 },
      { ...base, scrollRatio: -0.1 },
      { ...base, clientUpdatedAt: "not-a-date" },
      { ...base, clientUpdatedAt: "2026-13-99" },
    ]) {
      const res = await api("PUT", "/api/reader/progress", owner.cookie, bad);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_INPUT");
    }
  });
});

describe("GET /api/reader/progress (019D privacy)", () => {
  it("returns the caller's own row; another user's row is unreachable", async () => {
    const owner = await seedUser("rp-g-owner@example.com");
    const reader = await seedUser("rp-g-reader@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-g-ws");
    const novelId = await seedNovel(owner.userId, ws, "rp-g-novel", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    await api("PUT", "/api/reader/progress", reader.cookie, {
      novelId,
      chapterNumber: 7,
      clientUpdatedAt: T1,
    });

    // The reader sees their own row.
    const own = await api(
      "GET",
      `/api/reader/progress?novelId=${novelId}`,
      reader.cookie,
    );
    expect(own.status).toBe(200);
    expect((own.body.progress as Record<string, unknown>).chapterNumber).toBe(7);

    // The owner (a different user) sees null — the row is private.
    const other = await api(
      "GET",
      `/api/reader/progress?novelId=${novelId}`,
      owner.cookie,
    );
    expect(other.status).toBe(200);
    expect(other.body.progress).toBeNull();
  });

  it("returns { progress: null } when no row exists", async () => {
    const owner = await seedUser("rp-g2-owner@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-g2-ws");
    const novelId = await seedNovel(owner.userId, ws, "rp-g2-novel", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    const res = await api(
      "GET",
      `/api/reader/progress?novelId=${novelId}`,
      owner.cookie,
    );
    expect(res.status).toBe(200);
    expect(res.body.progress).toBeNull();
  });

  it("unauthenticated GET → 401 UNAUTHENTICATED; bad novelId → 400", async () => {
    const anon = await api(
      "GET",
      "/api/reader/progress?novelId=00000000-0000-0000-0000-000000000000",
    );
    expect(anon.status).toBe(401);
    expect(anon.body.error).toBe("UNAUTHENTICATED");

    const owner = await seedUser("rp-g3-owner@example.com");
    const bad = await api("GET", "/api/reader/progress?novelId=nope", owner.cookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("INVALID_INPUT");
  });
});

describe("DELETE /api/reader/progress/:novelId (019D idempotent clear)", () => {
  it("clears the synced position; repeat delete is still 204", async () => {
    const owner = await seedUser("rp-d-owner@example.com");
    const ws = await seedWorkspace(owner.userId, "rp-d-ws");
    const novelId = await seedNovel(owner.userId, ws, "rp-d-novel", "DRAFT");
    await seedEngageableNovel(owner.cookie, { workspaceId: ws, novelId });

    await api("PUT", "/api/reader/progress", owner.cookie, {
      novelId,
      chapterNumber: 4,
      clientUpdatedAt: T1,
    });
    const del = await api("DELETE", `/api/reader/progress/${novelId}`, owner.cookie);
    expect(del.status).toBe(204);

    const after = await api(
      "GET",
      `/api/reader/progress?novelId=${novelId}`,
      owner.cookie,
    );
    expect(after.body.progress).toBeNull();

    // Idempotent: deleting again is still 204.
    const again = await api("DELETE", `/api/reader/progress/${novelId}`, owner.cookie);
    expect(again.status).toBe(204);
  });

  it("unauthenticated DELETE → 401; bad novelId → 400", async () => {
    const anon = await api(
      "DELETE",
      "/api/reader/progress/00000000-0000-0000-0000-000000000000",
    );
    expect(anon.status).toBe(401);

    const owner = await seedUser("rp-d2-owner@example.com");
    const bad = await api("DELETE", "/api/reader/progress/nope", owner.cookie);
    expect(bad.status).toBe(400);
  });
});
