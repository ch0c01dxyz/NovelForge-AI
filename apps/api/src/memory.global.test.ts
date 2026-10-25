/**
 * NF-WF-052 global novel memory union read — integration suite.
 *
 * Dedicated novelforge_test_memory_global db. Covers the bounded,
 * deterministic union read over arc:{sagaId} scopes: the registered
 * route, auth, workspace isolation, freshness surfacing
 * (FRESH/STALE/FAILED/MISSING), UNRESOLVABLE_SOURCE exclusion, the
 * MEMORY_ARC_SCOPES_MAX cap with its bounded overflow aggregate,
 * cross-branch as-of refusal, as-of correctness, no-head short
 * circuit, orphan-scope candidates, and source-merge determinism
 * (equal createdAt tie-break; saga-keyed ordering). Structural-only.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
import { createAuditService, createPlatformServices } from "@novelforge/ai-services";
import { processRebuild } from "@novelforge/memory";
import { createMemoryServices } from "@novelforge/ai-services";
import { bindMeasureDb, measureQueries } from "./e2e/measure.ts";

const TEST_DB = "novelforge_test_memory_global";
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
const ENCRYPTION_KEY = "unit-test-encryption-key";

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
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

// Fake queue: captures enqueues without a live BullMQ exchange. The
// global read is read-only and never enqueues.
const enqueuedJobs: Array<{ name: string; data: unknown; opts: unknown }> = [];
const fakeQueue = {
  add: async (name: string, data: unknown, opts: { jobId: string }) => {
    enqueuedJobs.push({ name, data, opts });
    return { id: opts.jobId };
  },
  getJob: async () => undefined,
  close: async () => {},
};

let db: NovelForgeDb;
let app: FastifyInstance;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
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
  app = await buildApp(env, { db, memoryQueue: fakeQueue });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  enqueuedJobs.length = 0;
  await db.memoryProjection.deleteMany();
  await db.outlineNode.deleteMany();
  await db.saga.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedUser(
  email: string,
  platformRole: "SUPER_ADMIN" | null = null,
): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: {
      email,
      passwordHash: "x",
      displayName: email,
      platformRole: platformRole ?? undefined,
    },
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

async function seedNovel(
  userId: string,
  memberRole: string = "OWNER",
): Promise<{ workspaceId: string; novelId: string }> {
  const slug = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId: userId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId, role: memberRole as never },
  });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: userId,
    workspaceId: ws.id,
    title: "Global Memory Test Novel",
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function makeBranch(workspaceId: string, novelId: string, name = "main") {
  // createNovel already seeds the main branch; reuse it.
  const existing = await db.novelBranch.findFirst({ where: { novelId, name } });
  if (existing) return existing;
  return db.novelBranch.create({ data: { workspaceId, novelId, name } });
}

async function makeRevision(
  workspaceId: string,
  novelId: string,
  branchId: string,
  createdAt?: Date,
) {
  // createNovel seeds revision 1; append the next number on this branch.
  const branch = await db.novelBranch.findUniqueOrThrow({
    where: { id: branchId },
    select: { headRevisionId: true },
  });
  const max = await db.revision.aggregate({
    where: { branchId },
    _max: { number: true },
  });
  const number = (max._max.number ?? 0) + 1;
  const rev = await db.revision.create({
    data: {
      workspaceId,
      novelId,
      branchId,
      number,
      parentRevisionId: branch.headRevisionId,
      origin: "MANUAL",
      ...(createdAt ? { createdAt } : {}),
    },
  });
  await db.novelBranch.update({ where: { id: branchId }, data: { headRevisionId: rev.id } });
  return rev;
}

async function makeSaga(workspaceId: string, novelId: string, title: string, createdAt?: Date) {
  const creator = (await db.user.findFirstOrThrow({ select: { id: true } })).id;
  return db.saga.create({
    data: { novelId, kind: "SAGA", title, createdById: creator, ...(createdAt ? { createdAt } : {}) },
  });
}

async function seedOkProjection(
  workspaceId: string,
  novelId: string,
  scope: string,
  sourceRevisionId: string,
) {
  const res = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId });
  if (!res.ok) throw new Error("seed projection failed");
}

const memUrl = (workspaceId: string, novelId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/memory`;

it("reads twenty populated arc scopes with a bounded number of database operations", async () => {
  const { userId } = await seedUser("bounded-global@example.com");
  const { workspaceId, novelId } = await seedNovel(userId);
  const branch = await makeBranch(workspaceId, novelId);
  const scopes = [];
  for (let index = 0; index < 20; index++) {
    const saga = await makeSaga(workspaceId, novelId, `Bounded arc ${index}`);
    scopes.push(`arc:${saga.id}`);
  }
  await db.memoryProjection.createMany({
    data: scopes.map((scope) => ({
      workspaceId, novelId, scope, sourceRevisionId: branch.headRevisionId!,
      structural: { facts: [], threads: [], promises: [] },
      chapterCoverage: [], summaryCoveredFactIds: [],
    })),
  });
  const memory = createMemoryServices({ db: bindMeasureDb(db), queue: fakeQueue });
  const { result, queryCount } = await measureQueries("bounded-global", () =>
    memory.readGlobalMemory(userId, workspaceId, novelId, {}),
  );
  expect(result.scopes.map((block) => block.arcScope).sort()).toEqual(scopes.sort());
  expect(result.scopes.every((block) => block.freshness === "FRESH" && block.sourceRevisionId === branch.headRevisionId)).toBe(true);
  expect(queryCount).toBeLessThanOrEqual(8);
});

// ---------------------------------------------------------------------------
// Global union read (NF-WF-052)
// ---------------------------------------------------------------------------

describe("GET memory/global", () => {
  it("GET global returns the union over seeded arc scopes through the registered route", async () => {
    const { userId, cookie } = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    const rev2 = await makeRevision(workspaceId, novelId, branch.id);
    const scope = `arc:${s1.id}`;
    await seedOkProjection(workspaceId, novelId, scope, rev2.id);

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(1);
    const entry = global.scopes[0];
    expect(entry.arcScope).toBe(scope);
    expect(entry.sagaId).toBe(s1.id);
    expect(entry.freshness).toBe("FRESH");
    expect(entry.sourceRevisionId).toBe(rev2.id);
    expect(entry.sourceRevisionNumber).toBe(2);
    expect(Array.isArray(entry.chapterCoverage)).toBe(true);
    expect(Array.isArray(entry.structural.facts)).toBe(true);
    expect(Array.isArray(entry.structural.threads)).toBe(true);
    expect(Array.isArray(entry.structural.promises)).toBe(true);
    expect(entry.summary).toBeNull();
    expect(entry.summaryStatus).toBe("SKIPPED");
    expect(entry.provenance.revisionId).toBe(rev2.id);
    expect(entry.provenance.arcScope).toBe(scope);
    expect(entry.provenance.sagaId).toBe(s1.id);
    expect(typeof entry.provenance.builtAt).toBe("string");
    expect(entry.provenance.sourceRevisionNumber).toBe(2);
    expect(global.asOf.revisionId).toBe(rev2.id);
    expect(global.asOf.chapter).toBeNull();
    expect(global.arcScopesMax).toBe(20);
    expect(global.excluded).toEqual([]);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    expect(global.overflow).toEqual({
      overCapCount: 0,
      overCapArcIds: [],
      firstExcludedOrderingKey: null,
    });
  });

  it("GET global requires authentication", async () => {
    const { userId } = await seedUser("owner2@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHENTICATED");
  });

  it("GET global isolates workspaces: non-member and foreign-novel 404", async () => {
    const { userId, cookie } = await seedUser("owner3@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const outsider = await seedUser("outsider@example.com");

    // Non-member: 404 — does not reveal existence (ADR-0004).
    const nonMember = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie: outsider.cookie },
    });
    expect(nonMember.statusCode).toBe(404);

    // Owner actor + a novel belonging to a DIFFERENT workspace → 404.
    const foreign = await seedNovel(outsider.userId);
    const foreignRes = await app.inject({
      method: "GET",
      url: `${memUrl(foreign.workspaceId, foreign.novelId)}/global`,
      headers: { cookie },
    });
    expect(foreignRes.statusCode).toBe(404);
  });

  it("GET global flags STALE arc scope with correct metadata", async () => {
    const { userId, cookie } = await seedUser("stale@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    await makeRevision(workspaceId, novelId, branch.id); // rev 2
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await makeRevision(workspaceId, novelId, branch.id); // rev 3 head
    const scope = `arc:${s1.id}`;
    const rev2 = await db.revision.findFirstOrThrow({ where: { novelId, number: 2 } });
    await seedOkProjection(workspaceId, novelId, scope, rev2.id);

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(1);
    expect(global.scopes[0].freshness).toBe("STALE");
    expect(global.scopes[0].sourceRevisionNumber).toBe(2);
    expect(global.scopes[0].provenance.revisionId).toBe(rev2.id);
    expect(global.scopes[0].sagaId).toBe(s1.id);
    expect(global.overflow.overCapCount).toBe(0);
  });

  it("GET global surfaces FAILED arc scope, never dropped or rendered FRESH", async () => {
    const { userId, cookie } = await seedUser("failed@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const headRev = await makeRevision(workspaceId, novelId, branch.id);
    // Saga-less orphan arc scope with a FAILED build row (the exact stored
    // outcome the rebuild's failure path persists: FAILED, attempts 1,
    // empty structural payload).
    const scope = "arc:00000000-0000-4000-8000-000000000000";
    await db.memoryProjection.create({
      data: {
        workspaceId,
        novelId,
        scope,
        sourceRevisionId: headRev.id,
        buildStatus: "FAILED",
        lastError: "seed: forced failure",
        attempts: 1,
        structural: { facts: [], threads: [], promises: [] },
        chapterCoverage: [],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(1);
    const entry = global.scopes[0];
    expect(entry.arcScope).toBe(scope);
    expect(entry.sagaId).toBe("00000000-0000-4000-8000-000000000000");
    expect(entry.freshness).toBe("FAILED");
    expect(entry.structural).toEqual({ facts: [], threads: [], promises: [] });
    expect(entry).not.toHaveProperty("lastError");
    expect(global.excluded).toEqual([]);
  });

  it("GET global caps arc scopes and reports a bounded overflow aggregate deterministically", async () => {
    const { userId, cookie } = await seedUser("cap@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const sagas = [];
    for (let k = 1; k <= 25; k++) {
      const s = await makeSaga(workspaceId, novelId, `S${k}`, new Date(Date.UTC(2026, 0, 1, 0, 0, k)));
      sagas.push(s);
      await seedOkProjection(workspaceId, novelId, `arc:${s.id}`, head.id);
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(20);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    for (let k = 0; k < 20; k++) {
      expect(global.scopes[k]!.sagaId).toBe(sagas[k]!.id);
    }
    expect(global.overflow.overCapCount).toBe(5);
    expect(global.overflow.overCapArcIds).toEqual(sagas.slice(20).map((s) => s.id));
    expect(global.overflow.firstExcludedOrderingKey).toEqual({
      createdAt: sagas[20]!.createdAt.toISOString(),
      id: sagas[20]!.id,
    });

    // Determinism: a repeat call is byte-identical.
    const res2 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res2.statusCode).toBe(200);
    expect(JSON.stringify(res2.body)).toBe(JSON.stringify(res.body));
    // OVER_CAP is never entry-by-entry (types carry no such reason).
    expect(res.body).not.toContain("OVER_CAP");
  });

  it("GET global excludes an unresolvable-provenance row instead of merging it", async () => {
    const { userId, cookie } = await seedUser("unresolvable@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    const scope = `arc:${s1.id}`;
    const rev2 = await makeRevision(workspaceId, novelId, branch.id);
    await seedOkProjection(workspaceId, novelId, scope, rev2.id);
    // FK-suppressed tooling row (replica role skips the FK check): a
    // projection row whose source revision never resolved. Deleting a real
    // revision is not usable here — memory_projections.source_revision_id
    // is ON DELETE CASCADE, so the delete would remove the row itself, and
    // novel_branches.head_revision_id would be SetNull'd (empty union).
    const ghostRevisionId = randomUUID();
    await db.$executeRawUnsafe(
      `SET session_replication_role = replica;
       INSERT INTO memory_projections (workspace_id, novel_id, scope, source_revision_id, build_status, structural, chapter_coverage)
       VALUES ('${workspaceId}', '${novelId}', '${scope}', '${ghostRevisionId}', 'OK', '{"facts":[],"threads":[],"promises":[]}', ARRAY[]::int[]);
       SET session_replication_role = DEFAULT;`,
    );

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes.some((e: { arcScope: string }) => e.arcScope === scope)).toBe(false);
    expect(global.excluded).toEqual([
      { arcScope: scope, sagaId: s1.id, reason: "UNRESOLVABLE_SOURCE" },
    ]);
  });

  it("GET global rejects cross-branch asOfRevisionId with 400 INVALID_INPUT", async () => {
    const { userId, cookie } = await seedUser("crossbranch@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const feature = await makeBranch(workspaceId, novelId, "feature");
    const featureRev = await makeRevision(workspaceId, novelId, feature.id);

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global?asOfRevisionId=${featureRev.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_INPUT");
  });

  it("GET global as-of never returns a row newer than R", async () => {
    const { userId, cookie } = await seedUser("asof@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    const scope = `arc:${s1.id}`;
    const rev1 = await db.revision.findFirstOrThrow({ where: { novelId, number: 1 } });
    const rev2 = await makeRevision(workspaceId, novelId, branch.id);
    await seedOkProjection(workspaceId, novelId, scope, rev2.id);
    const rev3 = await makeRevision(workspaceId, novelId, branch.id); // rev 3 head
    // OK rows exist at rev2 AND rev3 (head): as-of rev2 returning the rev2
    // row FRESH is the real never-newer-than-R proof.
    await seedOkProjection(workspaceId, novelId, scope, rev3.id);

    const atRev2 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global?asOfRevisionId=${rev2.id}`,
      headers: { cookie },
    });
    expect(atRev2.statusCode).toBe(200);
    const at2 = atRev2.json().global;
    expect(at2.scopes).toHaveLength(1);
    expect(at2.scopes[0].sourceRevisionNumber).toBe(2);
    expect(at2.scopes[0].freshness).toBe("FRESH");
    expect(at2.asOf.revisionId).toBe(rev2.id);

    const atRev1 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global?asOfRevisionId=${rev1.id}`,
      headers: { cookie },
    });
    expect(atRev1.statusCode).toBe(200);
    const at1 = atRev1.json().global;
    expect(at1.scopes).toEqual([]);
    expect(at1.excluded).toEqual([
      { arcScope: scope, sagaId: s1.id, reason: "MISSING" },
    ]);
  });

  it("GET global reports outline saga with no rows as MISSING", async () => {
    const { userId, cookie } = await seedUser("outline@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head.id);
    // S2: an outline saga (nodes exist) but no projection rows — reachable
    // only because the S source enumerates every saga.
    const s2 = await makeSaga(workspaceId, novelId, "S2");
    await db.outlineNode.create({
      // CHAPTER_GROUP: the leaf-links CHECK requires exactly one of
      // chapterId/sceneId for CHAPTER/SCENE nodes.
      data: { novelId, sagaId: s2.id, kind: "CHAPTER_GROUP", title: "n", order: 1 },
    });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.excluded).toEqual([
      { arcScope: `arc:${s2.id}`, sagaId: s2.id, reason: "MISSING" },
    ]);
    expect(global.scopes).toHaveLength(1);
    expect(global.scopes[0].sagaId).toBe(s1.id);
  });

  it("GET global returns 200 empty union for a no-head novel", async () => {
    const { userId, cookie } = await seedUser("nohead@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    // One saga seeded BEFORE the head is removed: the short-circuit must
    // not enumerate candidates at all.
    await makeSaga(workspaceId, novelId, "S1");
    await db.revision.deleteMany({ where: { novelId } });
    await db.novelBranch.updateMany({ where: { novelId }, data: { headRevisionId: null } });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toEqual([]);
    expect(global.excluded).toEqual([]);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    expect(global.overflow.overCapCount).toBe(0);
    expect(global.asOf.revisionId).toBe("");
    expect(global.arcScopesMax).toBe(20);
  });

  it("GET global merges sources deterministically on equal createdAt across sources", async () => {
    const { userId, cookie } = await seedUser("tie@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const t = new Date(Date.UTC(2026, 3, 1));
    const sx = await makeSaga(workspaceId, novelId, "SX", t);
    await seedOkProjection(workspaceId, novelId, `arc:${sx.id}`, head.id);
    // Orphan whose uuid sorts LEXICOGRAPHICALLY BEFORE sx.id: on the
    // createdAt tie-break it must come first.
    let orphanId = randomUUID();
    while (orphanId >= sx.id) orphanId = randomUUID();
    const orphanScope = `arc:${orphanId}`;
    await seedOkProjection(workspaceId, novelId, orphanScope, head.id);
    await db.memoryProjection.update({
      where: {
        novelId_scope_sourceRevisionId: {
          novelId,
          scope: orphanScope,
          sourceRevisionId: head.id,
        },
      },
      data: { createdAt: t },
    });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(2);
    expect(global.scopes[0].sagaId).toBe(orphanId);
    expect(global.scopes[1].sagaId).toBe(sx.id);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });

    const res2 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(JSON.stringify(res2.body)).toBe(JSON.stringify(res.body));
  });

  it("GET global keeps saga-backed scopes out of the orphan source (late projections)", async () => {
    const { userId, cookie } = await seedUser("latesagaproj@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    // S1: earliest saga createdAt, but its ONLY projection row is pinned
    // LATE. The candidate key must be the saga's createdAt, not the
    // projection's.
    const s1 = await makeSaga(workspaceId, novelId, "S1", new Date(Date.UTC(2026, 0, 1)));
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head.id);
    await db.memoryProjection.update({
      where: {
        novelId_scope_sourceRevisionId: {
          novelId,
          scope: `arc:${s1.id}`,
          sourceRevisionId: head.id,
        },
      },
      data: { createdAt: new Date(Date.UTC(2026, 5, 1)) },
    });
    // Orphan scope O pinned in between.
    const orphanId = randomUUID();
    const orphanScope = `arc:${orphanId}`;
    await seedOkProjection(workspaceId, novelId, orphanScope, head.id);
    await db.memoryProjection.update({
      where: {
        novelId_scope_sourceRevisionId: {
          novelId,
          scope: orphanScope,
          sourceRevisionId: head.id,
        },
      },
      data: { createdAt: new Date(Date.UTC(2026, 2, 1)) },
    });
    // A second stored row for O at a newer head: still ONE candidate — the
    // P source GROUPs BY scope (MIN(created_at) stays the pinned row), so
    // over-cap accounting must not double-count multi-row scopes.
    const head2 = await makeRevision(workspaceId, novelId, branch.id);
    await seedOkProjection(workspaceId, novelId, orphanScope, head2.id);

    // Phase 1 (under cap): merged order is S1 first (saga createdAt),
    // orphan second.
    const res1 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res1.statusCode).toBe(200);
    const g1 = res1.json().global;
    expect(g1.scopes).toHaveLength(2);
    expect(g1.scopes[0].sagaId).toBe(s1.id);
    expect(g1.scopes[1].sagaId).toBe(orphanId);

    // Phase 2 (over cap): S2..S21 push candidates to 22 > cap 20. S1 is
    // still selected via S at position 0; beyond the boundary: S21 + the
    // orphan — exact two-term sum, the orphan not double-counted.
    for (let k = 2; k <= 21; k++) {
      await makeSaga(workspaceId, novelId, `S${k}`, new Date(Date.UTC(2026, 0, 1, 0, 0, k)));
    }
    const res2 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res2.statusCode).toBe(200);
    const g2 = res2.json().global;
    // Window of 20: S1 included (OK row); S2..S20 have no rows and are
    // MISSING-excluded — only S1 appears in scopes.
    const s21 = await sagaByTitle(novelId, "S21");
    expect(g2.scopes).toHaveLength(1);
    expect(g2.scopes[0].sagaId).toBe(s1.id);
    expect(g2.excluded).toHaveLength(19);
    for (const e of g2.excluded) {
      expect(e.reason).toBe("MISSING");
    }
    expect(g2.overflow.overCapCount).toBe(2);
    expect(g2.overflow.overCapArcIds).toEqual([s21.id, orphanId]);
    expect(g2.overflow.firstExcludedOrderingKey).toEqual({
      createdAt: s21.createdAt.toISOString(),
      id: s21.id,
    });
    expect(g2.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
  });

  it("GET global bounds the overflow id list at 50 with an authoritative count", async () => {
    const { userId, cookie } = await seedUser("bound@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    await makeRevision(workspaceId, novelId, branch.id);
    const creator = (await db.user.findFirstOrThrow({ select: { id: true } })).id;
    const sameT = new Date(Date.UTC(2026, 0, 1));
    // 75 sagas, SAME createdAt: ordering falls to the uuid tie-break. No
    // projections — every candidate is MISSING, proving MISSING candidates
    // consume the window (no backfill past them).
    await db.saga.createMany({
      data: Array.from({ length: 75 }, (_, k) => ({
        novelId,
        kind: "SAGA" as const,
        title: `s${k}`,
        createdById: creator,
        createdAt: sameT,
      })),
    });
    const rows = await db.saga.findMany({ where: { novelId }, select: { id: true } });
    expect(rows).toHaveLength(75);
    const sortedIds = rows.map((r) => r.id).sort();

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    // No projections: every window candidate is MISSING-excluded — scopes
    // stay empty while the window is fully consumed (no backfill).
    expect(global.scopes).toHaveLength(0);
    expect(global.excluded).toHaveLength(20);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    for (const e of global.excluded) {
      expect(e.reason).toBe("MISSING");
    }
    expect(global.overflow.overCapCount).toBe(55);
    expect(global.overflow.overCapArcIds).toHaveLength(50);
    expect(global.overflow.overCapArcIds).toEqual(sortedIds.slice(20, 70));
    expect(global.overflow.firstExcludedOrderingKey).toEqual({
      createdAt: sameT.toISOString(),
      id: sortedIds[20],
    });
  });

  it("GET global includes a selected orphan scope with full provenance", async () => {
    const { userId, cookie } = await seedUser("orphanfull@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const orphanId = randomUUID();
    const orphanScope = `arc:${orphanId}`;
    await seedOkProjection(workspaceId, novelId, orphanScope, head.id);

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.excluded).toEqual([]);
    expect(global.scopes).toHaveLength(1);
    const entry = global.scopes[0];
    expect(entry.arcScope).toBe(orphanScope);
    expect(entry.sagaId).toBe(orphanId);
    expect(entry.freshness).toBe("FRESH");
    expect(entry.provenance.revisionId).toBe(head.id);
    expect(entry.provenance.sourceRevisionNumber).toBe(head.number);
    expect(entry.provenance.arcScope).toBe(orphanScope);
    expect(entry.provenance.sagaId).toBe(orphanId);
    expect(typeof entry.provenance.builtAt).toBe("string");
  });

  // -------------------------------------------------------------------------
  // Addendum §5 canonical-form defense (NF-WF-052 repair) — non-canonical
  // arc scopes are excluded as UNRESOLVABLE_SOURCE, never ranked.
  // -------------------------------------------------------------------------

  it("GET global excludes a non-canonical uppercase variant of a saga-backed scope instead of double-serving the saga", async () => {
    const { userId, cookie } = await seedUser("uppercase@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head.id);
    // FK-suppressed tooling row: the same saga uuid in NON-canonical
    // uppercase text. The raw-text anti-join finds no saga for it — §5
    // requires exclusion (never a second, phantom entry for the same saga).
    const upperScope = `arc:${s1.id.toUpperCase()}`;
    await db.memoryProjection.create({
      data: {
        workspaceId,
        novelId,
        scope: upperScope,
        sourceRevisionId: head.id,
        buildStatus: "OK",
        structural: { facts: [], threads: [], promises: [] },
        chapterCoverage: [],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    // Exactly the canonical S entry — canonical freshness/metadata as usual.
    expect(global.scopes).toHaveLength(1);
    expect(global.scopes[0].sagaId).toBe(s1.id);
    expect(global.scopes[0].arcScope).toBe(`arc:${s1.id}`);
    // The uppercase variant is surfaced in global.anomalies (amendment
    // 2026-10-15), not silently dropped — excluded[] keeps only
    // selected-candidate exclusions.
    expect(global.excluded).toEqual([]);
    expect(global.anomalies.total).toBe(1);
    expect(global.anomalies.surfaced).toEqual([
      { arcScope: upperScope, sagaId: s1.id.toUpperCase() },
    ]);
    expect(global.anomalies.complete).toBe(true);
    expect(global.scopes.some((e: { sagaId: string }) => e.sagaId === s1.id.toUpperCase())).toBe(
      false,
    );
  });

  it("GET global excludes malformed orphan scopes instead of ranking them", async () => {
    const { userId, cookie } = await seedUser("malformed@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head.id);
    // Braced, bare, and junk id text: all non-canonical, all excluded.
    const malformed = [`arc:{${randomUUID()}}`, "arc:", "arc:not-a-uuid"];
    for (const scope of malformed) {
      await db.memoryProjection.create({
        data: {
          workspaceId,
          novelId,
          scope,
          sourceRevisionId: head.id,
          buildStatus: "OK",
          structural: { facts: [], threads: [], promises: [] },
          chapterCoverage: [],
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(1);
    expect(global.scopes[0].sagaId).toBe(s1.id);
    // Detection diagnostics moved to global.anomalies (amendment
    // 2026-10-15): excluded[] keeps only selected-candidate exclusions.
    expect(global.excluded).toEqual([]);
    expect(global.anomalies.total).toBe(3);
    expect(global.anomalies.complete).toBe(true);
    // sagaId carries the RAW id text (braced / empty / junk) verbatim;
    // order-independent comparison (surfaced order is (MIN(created_at),
    // scope) — seed-insertion order here).
    expect(
      [...global.anomalies.surfaced].sort((a, b) =>
        a.arcScope < b.arcScope ? -1 : a.arcScope > b.arcScope ? 1 : 0,
      ),
    ).toEqual(
      malformed
        .map((scope) => ({ arcScope: scope, sagaId: scope.slice("arc:".length) }))
        .sort((a, b) => (a.arcScope < b.arcScope ? -1 : a.arcScope > b.arcScope ? 1 : 0)),
    );
    // Never ranked: scopes[] holds only the canonical saga and excluded[]
    // only selected-candidate exclusions; each malformed scope appears
    // exactly once, in anomalies.surfaced. (Raw substring counting is
    // meaningless for the bare "arc:" scope: it is a prefix of every
    // rendered arc scope.)
  });

  it("GET global orders same-createdAt orphan scopes by uuid text (F3)", async () => {
    const { userId, cookie } = await seedUser("orphantie@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const t = new Date(Date.UTC(2026, 7, 1));
    // O1's uuid text must sort AFTER O2's: at the createdAt tie the order
    // is uuid-text ASC, so O2 precedes O1.
    let o1 = randomUUID();
    let o2 = randomUUID();
    while (o1 <= o2) {
      o1 = randomUUID();
      o2 = randomUUID();
    }
    for (const id of [o1, o2]) {
      const scope = `arc:${id}`;
      await seedOkProjection(workspaceId, novelId, scope, head.id);
      await db.memoryProjection.update({
        where: {
          novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: head.id },
        },
        data: { createdAt: t },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    expect(global.scopes).toHaveLength(2);
    expect(o2 < o1).toBe(true);
    expect(global.scopes[0].sagaId).toBe(o2);
    expect(global.scopes[1].sagaId).toBe(o1);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });

    // Determinism: repeat call byte-identical.
    const res2 = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(JSON.stringify(res2.body)).toBe(JSON.stringify(res.body));
  });

  it("GET global breaks same-createdAt orphan ties at the overflow boundary by uuid text (F3)", async () => {
    const { userId, cookie } = await seedUser("boundary@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    // 19 canonical sagas, ascending createdAt, early in time.
    for (let k = 1; k <= 19; k++) {
      await makeSaga(workspaceId, novelId, `S${k}`, new Date(Date.UTC(2026, 0, 1, 0, 0, k)));
    }
    // Two orphan scopes at the SAME late instant, OB1 < OB2 by uuid text.
    // 21 candidates > cap 20: the boundary falls inside the tie.
    const tLate = new Date(Date.UTC(2026, 11, 1));
    let ob1 = randomUUID();
    let ob2 = randomUUID();
    while (ob1 >= ob2) {
      ob1 = randomUUID();
      ob2 = randomUUID();
    }
    for (const id of [ob1, ob2]) {
      const scope = `arc:${id}`;
      await seedOkProjection(workspaceId, novelId, scope, head.id);
      await db.memoryProjection.update({
        where: {
          novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: head.id },
        },
        data: { createdAt: tLate },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const global = res.json().global;
    // Merged window = 19 sagas (MISSING: no rows) + OB1 (uuid tie-break).
    expect(global.scopes).toHaveLength(1);
    expect(global.scopes[0].sagaId).toBe(ob1);
    expect(global.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    expect(global.excluded).toHaveLength(19);
    for (const e of global.excluded) {
      expect(e.reason).toBe("MISSING");
    }
    // The successor predicate's id tie-break picks exactly OB2. The
    // ordering key renders id per source domain (v2-approved: scope
    // string for P, saga uuid for S) — OB2 is P-source.
    expect(global.overflow.overCapCount).toBe(1);
    expect(global.overflow.overCapArcIds).toEqual([ob2]);
    expect(global.overflow.firstExcludedOrderingKey).toEqual({
      createdAt: tLate.toISOString(),
      id: `arc:${ob2}`,
    });
  });

  // -------------------------------------------------------------------------
  // Anomalies amendment (2026-10-15): bounded non-canonical diagnostics in
  // global.anomalies; excluded[] stays within the A1.4 bound.
  // -------------------------------------------------------------------------

  it("GET global keeps excluded within the A1.4 bound in the combined state (20 selected MISSING + 20 anomalies)", async () => {
    const { userId, cookie } = await seedUser("combined@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    for (let i = 1; i <= 20; i++) {
      await makeSaga(workspaceId, novelId, `S${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    for (let i = 0; i < 20; i++) {
      await db.memoryProjection.create({
        data: {
          workspaceId,
          novelId,
          scope: `arc:zz-noncanonical-${i}`,
          sourceRevisionId: head.id,
          buildStatus: "OK",
          structural: { facts: [], threads: [], promises: [] },
          chapterCoverage: [],
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const g = res.json().global;
    expect(g.scopes).toHaveLength(0);
    // A1.4 combined fixture (amendment 2026-10-15): previously excluded[] reached 40 (2x cap) before the anomalies channel.
    expect(g.excluded).toHaveLength(20);
    for (const e of g.excluded) {
      expect(e.reason).toBe("MISSING");
    }
    expect(g.anomalies.total).toBe(20);
    expect(g.anomalies.surfaced).toHaveLength(20);
    expect(g.anomalies.complete).toBe(true);
    expect(g.overflow.overCapCount).toBe(0);
  });

  it("GET global reports the exact non-canonical total with a truncated surfaced prefix (25 → 20, complete=false)", async () => {
    const { userId, cookie } = await seedUser("tail@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const t = new Date(Date.UTC(2026, 0, 1));
    const scopes = Array.from({ length: 25 }, (_, i) => `arc:zz-noncanonical-${i}`);
    for (const scope of scopes) {
      await db.memoryProjection.create({
        data: {
          workspaceId,
          novelId,
          scope,
          sourceRevisionId: head.id,
          buildStatus: "OK",
          structural: { facts: [], threads: [], promises: [] },
          chapterCoverage: [],
        },
      });
      await db.memoryProjection.update({
        where: {
          novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: head.id },
        },
        data: { createdAt: t },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const g = res.json().global;
    expect(g.anomalies.total).toBe(25);
    expect(g.anomalies.surfaced).toHaveLength(20);
    expect(g.anomalies.complete).toBe(false);
    // Surfaced = FIRST 20 in (MIN(created_at), scope) order; createdAt is
    // pinned identical, so the order is purely scope-ASC. Expected set is
    // computed, never hand-listed.
    const expectedSurfaced = [...scopes]
      .sort()
      .slice(0, 20)
      .map((scope) => ({ arcScope: scope, sagaId: scope.slice("arc:".length) }));
    expect(g.anomalies.surfaced).toEqual(expectedSurfaced);
    // The lexicographic tail beyond the LIMIT is unreported (complete=false
    // flags it): unpadded digit suffixes sort "-5".."-9" after "-4".
    const surfacedArcs = g.anomalies.surfaced.map((e: { arcScope: string }) => e.arcScope);
    expect(surfacedArcs).not.toContain("arc:zz-noncanonical-5");
    expect(surfacedArcs[surfacedArcs.length - 1]).toBe("arc:zz-noncanonical-4");
  });

  it("GET global counts a multi-row malformed scope once", async () => {
    const { userId, cookie } = await seedUser("dupscope@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const head2 = await makeRevision(workspaceId, novelId, branch.id);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head2.id);
    // ONE malformed scope, TWO stored rows (one per revision): grouped
    // before COUNT — exactly one anomaly.
    for (const rid of [head.id, head2.id]) {
      await db.memoryProjection.create({
        data: {
          workspaceId,
          novelId,
          scope: "arc:zz-dup-scope",
          sourceRevisionId: rid,
          buildStatus: "OK",
          structural: { facts: [], threads: [], promises: [] },
          chapterCoverage: [],
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const g = res.json().global;
    expect(g.anomalies.total).toBe(1);
    expect(g.anomalies.surfaced).toEqual([
      { arcScope: "arc:zz-dup-scope", sagaId: "zz-dup-scope" },
    ]);
    expect(g.anomalies.complete).toBe(true);
    expect(g.scopes).toHaveLength(1);
    expect(g.scopes[0].sagaId).toBe(s1.id);
  });

  it("GET global returns zeroed anomalies for canonical-only responses", async () => {
    const { userId, cookie } = await seedUser("canonicalonly@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const head = await makeRevision(workspaceId, novelId, branch.id);
    const s1 = await makeSaga(workspaceId, novelId, "S1");
    await seedOkProjection(workspaceId, novelId, `arc:${s1.id}`, head.id);

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/global`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const g = res.json().global;
    expect(g.scopes).toHaveLength(1);
    expect(g.scopes[0].sagaId).toBe(s1.id);
    expect(g.scopes[0].freshness).toBe("FRESH");
    expect(g.excluded).toEqual([]);
    expect(g.anomalies).toEqual({ total: 0, surfaced: [], complete: true });
    expect(g.overflow).toEqual({
      overCapCount: 0,
      overCapArcIds: [],
      firstExcludedOrderingKey: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Local lookup helpers (test-ordering references)
// ---------------------------------------------------------------------------

async function sagaByTitle(novelId: string, title: string) {
  return db.saga.findFirstOrThrow({ where: { novelId, title } });
}
