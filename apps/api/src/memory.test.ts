/**
 * Revision-derived chapter/arc memory (NF-WF-009) integration suite.
 *
 * Dedicated novelforge_test_memory db. Covers: deterministic rebuilds
 * (byte-identical), freshness derivation (FRESH/STALE/FAILED/MISSING),
 * rejected-fact exclusion, N→N+1 continuity via the 003 compiler tiers,
 * as-of correctness, simulation refusal (F3), idempotent rebuilds, the
 * three HTTP routes, and authorization. Structural-only: no AI paths,
 * so GAP-028 does not arise.
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
import {
  processRebuild,
  deriveFreshness,
  settleRev,
  chapterScope,
  MEMORY_RECENT_CHAPTERS_DEFAULT,
} from "@novelforge/memory";

const TEST_DB = "novelforge_test_memory";
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

// Fake queue: captures enqueues without a live BullMQ exchange (same seam
// as the workflow queue). The rebuild handler itself is covered by
// processRebuild calls below.
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
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.canonProposal.deleteMany();
  await db.storyPromise.deleteMany();
  await db.storyThread.deleteMany();
  await db.storyEntity.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.outlineNode.deleteMany();
  await db.saga.deleteMany();
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
    title: "Memory Test Novel",
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

async function makeChapter(novelId: string, number: number, createdById?: string) {
  const creator =
    createdById ?? (await db.user.findFirstOrThrow({ select: { id: true } })).id;
  const chapter = await db.chapter.create({
    data: { novelId, number, title: `Ch ${number}`, createdById: creator },
  });
  const version = await db.chapterVersion.create({
    data: { chapterId: chapter.id, number: 1, content: "draft", wordCount: 1, authorId: creator },
  });
  return { chapter, version };
}

async function makeChangeSet(
  workspaceId: string,
  novelId: string,
  revisionId: string,
  items: Array<{ entityType: string; entityId: string; operation: string }>,
) {
  const cs = await db.changeSet.create({
    data: { workspaceId, novelId, revisionId },
  });
  for (const item of items) {
    await db.changeSetItem.create({ data: { changeSetId: cs.id, ...item } });
  }
  return cs;
}

async function makeEntity(workspaceId: string, novelId: string, name: string) {
  const creator = (await db.user.findFirstOrThrow({ select: { id: true } })).id;
  return db.storyEntity.create({
    data: {
      novelId,
      kind: "CHARACTER",
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      createdById: creator,
    },
  });
}

const memUrl = (workspaceId: string, novelId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/memory`;

// ---------------------------------------------------------------------------
// Rebuild determinism + freshness
// ---------------------------------------------------------------------------

describe("memory rebuild", () => {
  it("rebuild is durable and byte-identical on re-run (dedup)", async () => {
    const { userId } = await seedUser("a@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);

    const first = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    expect(first).toEqual({ deduped: false, ok: true });
    const row1 = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: rev.id } },
    });
    const second = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    expect(second).toEqual({ deduped: true, ok: true });
    const row2 = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: rev.id } },
    });
    expect(JSON.stringify(row2.structural)).toBe(JSON.stringify(row1.structural));
    expect(row2.attempts).toBe(row1.attempts);

    const freshness = await deriveFreshness(db, novelId, scope);
    expect(freshness?.freshness).toBe("FRESH");
    expect(freshness?.sourceRevisionId).toBe(rev.id);
  });

  it("forced stale: a newer head revision marks the projection STALE", async () => {
    const { userId } = await seedUser("b@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev1 = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev1.id });

    await makeRevision(workspaceId, novelId, branch.id);
    const freshness = await deriveFreshness(db, novelId, scope);
    expect(freshness?.freshness).toBe("STALE");
    expect(freshness?.sourceRevisionNumber).toBe(2);
    expect(freshness?.headRevisionNumber).toBe(3);
  });

  it("forced failed: a bad scope writes a FAILED row with lastError + attempts", async () => {
    const { userId } = await seedUser("c@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev = await makeRevision(workspaceId, novelId, branch.id);

    const result = await processRebuild(db, {
      workspaceId,
      novelId,
      scope: "bogus:scope",
      sourceRevisionId: rev.id,
    });
    expect(result).toEqual({ deduped: false, ok: false });
    const row = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope: "bogus:scope", sourceRevisionId: rev.id } },
    });
    expect(row.buildStatus).toBe("FAILED");
    expect(row.lastError).toContain("unknown memory scope");
    expect(row.attempts).toBe(1);

    // Retry increments attempts (F1).
    const retry = await processRebuild(db, {
      workspaceId,
      novelId,
      scope: "bogus:scope",
      sourceRevisionId: rev.id,
    });
    expect(retry.ok).toBe(false);
    const row2 = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope: "bogus:scope", sourceRevisionId: rev.id } },
    });
    expect(row2.attempts).toBe(2);

    const freshness = await deriveFreshness(db, novelId, "bogus:scope");
    expect(freshness?.freshness).toBe("FAILED");
  });

  it("missing scope derives MISSING", async () => {
    const { userId } = await seedUser("d@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    await makeRevision(workspaceId, novelId, branch.id);
    const freshness = await deriveFreshness(db, novelId, "chapter:nonexistent");
    expect(freshness?.freshness).toBe("MISSING");
  });
});

// ---------------------------------------------------------------------------
// Fact inclusion semantics
// ---------------------------------------------------------------------------

describe("structural fact inclusion", () => {
  it("excludes superseded facts at a newer revision, includes them as-of the older one", async () => {
    const { userId } = await seedUser("e@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-02T00:00:00Z");
    const t2 = new Date("2026-01-03T00:00:00Z");
    const rev1 = await makeRevision(workspaceId, novelId, branch.id, t0);
    const rev2 = await makeRevision(workspaceId, novelId, branch.id, t2);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);
    const entity = await makeEntity(workspaceId, novelId, "Wren");

    // Fact v1 created at t1 (after rev1, before rev2); superseded by v2 at t2.
    const v1 = await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "oath",
        statement: "Wren swore the oath",
        objectText: "the oath",
        status: "SUPERSEDED",
        createdById: userId,
        createdAt: t1,
      },
    });
    const v2 = await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "oath",
        statement: "Wren broke the oath",
        objectText: "broken",
        status: "ACTIVE",
        createdById: userId,
        createdAt: t2,
      },
    });
    await db.canonFact.update({ where: { id: v1.id }, data: { supersededById: v2.id } });

    // As-of rev1 (t0): neither fact existed yet → empty facts.
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev1.id });
    const old1 = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: rev1.id } },
    });
    expect((old1.structural as { facts: unknown[] }).facts).toHaveLength(0);

    // As-of rev2 (t2): v1 superseded at t2 (not after R) → excluded; v2 included.
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev2.id });
    const row2 = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: rev2.id } },
    });
    const facts = (row2.structural as { facts: Array<{ factId: string; statement: string }> }).facts;
    expect(facts.map((f) => f.factId)).toEqual([v2.id]);
  });

  it("excludes rejected proposals: they never become canon facts", async () => {
    const { userId } = await seedUser("f@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);
    const entity = await makeEntity(workspaceId, novelId, "Wren");

    // Facts must exist at R: create them before the revision.
    const t0 = new Date("2026-01-01T00:00:00Z");
    await db.canonProposal.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "secret",
        statement: "Wren hides a dagger",
        objectText: "a dagger",
        status: "REJECTED",
        proposedById: userId,
      },
    });
    const fact = await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "oath",
        statement: "Wren swore the oath",
        objectText: "the oath",
        status: "ACTIVE",
        createdById: userId,
        createdAt: t0,
      },
    });
    const rev = await makeRevision(workspaceId, novelId, branch.id, new Date("2026-01-02T00:00:00Z"));
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    const row = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId: rev.id } },
    });
    const facts = (row.structural as { facts: Array<{ factId: string }> }).facts;
    expect(facts.map((f) => f.factId)).toEqual([fact.id]);
  });
});

// ---------------------------------------------------------------------------
// Settle revision (F2)
// ---------------------------------------------------------------------------

describe("settleRev", () => {
  it("resolves the greatest main-branch revision touching the chapter", async () => {
    const { userId } = await seedUser("g@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev1 = await makeRevision(workspaceId, novelId, branch.id);
    const rev2 = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter, version } = await makeChapter(novelId, 3);
    await makeChangeSet(workspaceId, novelId, rev1.id, [
      { entityType: "ChapterVersion", entityId: version.id, operation: "CREATE" },
    ]);
    await makeChangeSet(workspaceId, novelId, rev2.id, [
      { entityType: "ChapterVersion", entityId: version.id, operation: "UPDATE" },
    ]);

    const settled = await settleRev(db, novelId, 3);
    expect(settled?.revisionId).toBe(rev2.id);
    expect(settled?.revisionNumber).toBe(3);
    void chapter;
  });

  it("returns null when the chapter was never touched", async () => {
    const { userId } = await seedUser("h@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    await makeRevision(workspaceId, novelId, branch.id);
    await makeChapter(novelId, 5);
    const settled = await settleRev(db, novelId, 5);
    expect(settled).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

describe("memory routes", () => {
  it("GET status is 401 without a session and 404 for a non-member (ADR-0004)", async () => {
    const { userId, cookie } = await seedUser("i@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    await makeRevision(workspaceId, novelId, branch.id);

    const anon = await app.inject({ method: "GET", url: `${memUrl(workspaceId, novelId)}/status` });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error).toBe("UNAUTHENTICATED");

    // Non-member must not learn the novel exists: 404, not 403 (ADR-0004).
    const { cookie: outsiderCookie } = await seedUser("i2@example.com");
    const foreign = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/status`,
      headers: { cookie: outsiderCookie },
    });
    expect(foreign.statusCode).toBe(404);

    // Owner with novel:read gets 200.
    const ok = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/status`,
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    void userId;
  });

  it("POST rebuild refuses simulation sources (F3) and enqueues otherwise", async () => {
    const { userId, cookie } = await seedUser("j@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);

    const refused = await app.inject({
      method: "POST",
      url: `${memUrl(workspaceId, novelId)}/rebuild`,
      headers: { cookie },
      payload: { simulation: true },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toBe("SIMULATION_SOURCE_REFUSED");
    expect(enqueuedJobs).toHaveLength(0);
    expect(await db.memoryProjection.count({ where: { novelId } })).toBe(0);

    const accepted = await app.inject({
      method: "POST",
      url: `${memUrl(workspaceId, novelId)}/rebuild`,
      headers: { cookie },
      payload: { scope },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({ accepted: true, scopes: [scope] });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.data).toMatchObject({
      workspaceId,
      novelId,
      scope,
      sourceRevisionId: rev.id,
    });

    // Unknown scope → 400 INVALID_INPUT.
    const bad = await app.inject({
      method: "POST",
      url: `${memUrl(workspaceId, novelId)}/rebuild`,
      headers: { cookie },
      payload: { scope: "nope:x" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("INVALID_INPUT");
  });

  it("GET as-of by chapter resolves the settle revision; cross-branch revisionId is 400", async () => {
    const { userId, cookie } = await seedUser("k@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev1 = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter, version } = await makeChapter(novelId, 2);
    await makeChangeSet(workspaceId, novelId, rev1.id, [
      { entityType: "ChapterVersion", entityId: version.id, operation: "CREATE" },
    ]);
    const scope = chapterScope(chapter.id);
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev1.id });

    const byChapter = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?chapter=2`,
      headers: { cookie },
    });
    expect(byChapter.statusCode).toBe(200);
    const body = byChapter.json();
    expect(body.asOf.revisionId).toBe(rev1.id);
    expect(body.chapterMemory.scope).toBe(scope);
    expect(body.chapterMemory.summary).toBeNull();
    expect(body.chapterMemory.summaryStatus).toBe("SKIPPED");

    const byRevision = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?revisionId=${rev1.id}`,
      headers: { cookie },
    });
    expect(byRevision.statusCode).toBe(200);
    expect(byRevision.json().asOf.revisionId).toBe(rev1.id);

    // Cross-branch: a revision on a non-main branch → 400 INVALID_INPUT (F4).
    const alt = await makeBranch(workspaceId, novelId, "alt");
    const altRev = await makeRevision(workspaceId, novelId, alt.id);
    const cross = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?revisionId=${altRev.id}`,
      headers: { cookie },
    });
    expect(cross.statusCode).toBe(400);
    expect(cross.json().error).toBe("INVALID_INPUT");

    // Unsettled chapter → 400.
    await makeChapter(novelId, 9);
    const unsettled = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?chapter=9`,
      headers: { cookie },
    });
    expect(unsettled.statusCode).toBe(400);
    expect(unsettled.json().error).toBe("INVALID_INPUT");
  });

  it("GET as-of never returns a row newer than the requested revision (Invariant 7)", async () => {
    const { userId, cookie } = await seedUser("k2@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-02T00:00:00Z");
    const t2 = new Date("2026-01-03T00:00:00Z");
    const rev1 = await makeRevision(workspaceId, novelId, branch.id, t0);
    const rev2 = await makeRevision(workspaceId, novelId, branch.id, t2);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);
    // A fact that exists only as of rev2 (created between rev1 and rev2).
    const entity = await makeEntity(workspaceId, novelId, "Wren");
    await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "oath",
        statement: "Wren swore the oath",
        objectText: "the oath",
        status: "ACTIVE",
        createdById: userId,
        createdAt: t1,
      },
    });
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev1.id });
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev2.id });

    // The head is rev2, but as-of rev1 must return the rev1 row — never
    // the newer one.
    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?revisionId=${rev1.id}&chapter=1`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chapterMemory.sourceRevisionId).toBe(rev1.id);
    expect(body.chapterMemory.sourceRevisionNumber).toBe(rev1.number);
    expect(body.chapterMemory.structural.facts).toHaveLength(0);

    // And as-of the head still returns the newest row.
    const head = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/as-of?revisionId=${rev2.id}&chapter=1`,
      headers: { cookie },
    });
    expect(head.statusCode).toBe(200);
    const headBody = head.json();
    expect(headBody.chapterMemory.sourceRevisionId).toBe(rev2.id);
    expect(headBody.chapterMemory.structural.facts).toHaveLength(1);
  });

  it("GET status lists per-scope freshness", async () => {
    const { userId, cookie } = await seedUser("l@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev = await makeRevision(workspaceId, novelId, branch.id);
    const { chapter } = await makeChapter(novelId, 1);
    const scope = chapterScope(chapter.id);
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });

    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/status`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const statuses = res.json().statuses;
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      scope,
      freshness: "FRESH",
      sourceRevisionId: rev.id,
      sourceRevisionNumber: 2,
      headRevisionNumber: 2,
    });
  });
});


// ---------------------------------------------------------------------------
// Compiler tier 7/8 integration (N → N+1 continuity)
// ---------------------------------------------------------------------------

describe("compiler memory tiers", () => {
  it("tier 7 is PRESENT with freshness metadata when the chapter is FRESH; tier 8 UNAVAILABLE when the arc is MISSING", async () => {
    const { userId } = await seedUser("m@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const { chapter } = await makeChapter(novelId, 1);
    const entity = await makeEntity(workspaceId, novelId, "Wren");
    // Fact first, then the revision: the rebuild only sees facts that
    // existed at R (createdAt <= R.createdAt).
    await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "oath",
        statement: "Wren swore the oath",
        objectText: "the oath",
        status: "ACTIVE",
        createdById: userId,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const rev = await makeRevision(workspaceId, novelId, branch.id, new Date("2026-01-02T00:00:00Z"));
    const scope = chapterScope(chapter.id);
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });

    const { fetchAndCompileContext, TIERS } = await import("./services/context-compiler.ts");
    const { createMemoryServices } = await import("./services/memory.ts");
    const memory = createMemoryServices({ db, queue: fakeQueue });
    // Bypass auth for the port: the compiler callers gate before compiling.
    const memoryPort = {
      recallNovel: (args: { novelId: string; chapter: number }) =>
        memory.recallNovel(userId, workspaceId, args.novelId, { chapter: args.chapter }),
    };

    // Minimal stub ports: tiers 1-6, 9, 10 read empty; only 7/8 matter here.
    const emptyPort = {
      listOutlineNodesForCompiler: async () => ({ nodes: [], horizonProblem: null }),
      getApprovedOutline: async () => null,
      getStoryPosition: async () => 1,
      listRelevantCast: async () => ({ entityIds: [], characterIds: [] }),
      listFactsForCompiler: async () => ({ facts: [] }),
      listDebtForCompiler: async () => ({ items: [] }),
      listEventsForCompiler: async () => ({ events: [] }),
      listCausalForCompiler: async () => ({ edges: [] }),
      getStateAtPosition: async () => null,
      getDna: async () => null,
      search: async () => ({ hits: [], retrievers: [], withheldCount: 0 }),
    };
    const compiled = await fetchAndCompileContext(
      {
        canon: emptyPort as never,
        planning: emptyPort as never,
        characters: emptyPort as never,
        relationships: emptyPort as never,
        narrative: emptyPort as never,
        retrieval: emptyPort as never,
        head: { readHeadRevisionId: async () => rev.id },
        memory: memoryPort as never,
      },
      {
        actorUserId: userId,
        workspaceId,
        novelId,
        instruction: "continue the story",
      },
    );
    const tier7 = compiled.blocks.find((b) => b.tier === TIERS.RECENT_MEMORY)!;
    const tier8 = compiled.blocks.find((b) => b.tier === TIERS.HISTORICAL_MEMORY)!;
    expect(tier7.status).toBe("PRESENT");
    expect(tier7.provenance.freshness).toBe("FRESH");
    expect(tier7.provenance.sourceRevisionId).toBe(rev.id);
    expect(tier7.text).toContain("Wren swore the oath");
    // Arc scope has no projection → UNAVAILABLE with an explicit reason,
    // never an empty PRESENT block.
    expect(tier8.status).toBe("UNAVAILABLE");
    expect(tier8.provenance.reason).toContain("MISSING");
    expect(tier8.text).toBe("");
  });

  it("tiers 7/8 are UNAVAILABLE with reason when the memory port is absent", async () => {
    const { userId } = await seedUser("n@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await makeBranch(workspaceId, novelId);
    const rev = await makeRevision(workspaceId, novelId, branch.id);
    await makeChapter(novelId, 1);

    const { fetchAndCompileContext, TIERS } = await import("./services/context-compiler.ts");
    const emptyPort = {
      listOutlineNodesForCompiler: async () => ({ nodes: [], horizonProblem: null }),
      getApprovedOutline: async () => null,
      getStoryPosition: async () => 1,
      listRelevantCast: async () => ({ entityIds: [], characterIds: [] }),
      listFactsForCompiler: async () => ({ facts: [] }),
      listDebtForCompiler: async () => ({ items: [] }),
      listEventsForCompiler: async () => ({ events: [] }),
      listCausalForCompiler: async () => ({ edges: [] }),
      getStateAtPosition: async () => null,
      getDna: async () => null,
      search: async () => ({ hits: [], retrievers: [], withheldCount: 0 }),
    };
    const compiled = await fetchAndCompileContext(
      {
        canon: emptyPort as never,
        planning: emptyPort as never,
        characters: emptyPort as never,
        relationships: emptyPort as never,
        narrative: emptyPort as never,
        retrieval: emptyPort as never,
        head: { readHeadRevisionId: async () => rev.id },
      },
      {
        actorUserId: userId,
        workspaceId,
        novelId,
        instruction: "continue the story",
      },
    );
    for (const tier of [TIERS.RECENT_MEMORY, TIERS.HISTORICAL_MEMORY]) {
      const b = compiled.blocks.find((x) => x.tier === tier)!;
      expect(b.status).toBe("UNAVAILABLE");
      expect(b.provenance.reason).toBeTruthy();
      expect(b.text).toBe("");
    }
  });

  it("recent chapters are bounded by MEMORY_RECENT_CHAPTERS_DEFAULT", () => {
    expect(MEMORY_RECENT_CHAPTERS_DEFAULT).toBe(10);
  });
});
