/**
 * NF-WF-030 (GAP-095): memory rebuild reconciliation tests.
 *
 * - Redis-loss simulation: seed STALE → drop queue state → reconcile →
 *   re-derived with deterministic jobId → processRebuild → OK.
 * - No-duplicate: double reconciliation (and pre-existing job) → single OK row.
 * - No-false-success: queue unavailable → DB rows unchanged, error logged.
 * - FRESH-skip: FRESH scopes are not requeued.
 * - MISSING-skip: MISSING scopes are not auto-rebuilt (Invariant 9).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { processRebuild } from "@novelforge/memory";
import {
  reconcileMemoryRebuilds,
  memoryRebuildJobId,
  type MemoryReconQueue,
  type MemoryReconciliationReport,
} from "./memory-reconciliation.ts";
import type { WorkerLogger } from "./worker.ts";

const IT_DB = "novelforge_test_memory_recon";
// Keep host credentials/port configurable, but never migrate the supplied database.
const BASE_URL = process.env.DATABASE_URL ?? "postgresql://novelforge_test:novelforge_test@localhost:5432/postgres";
function withDb(database: string): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}
const IT_URL = withDb(IT_DB);

function testLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** In-memory mock queue simulating BullMQ jobId dedup semantics. */
function mockQueue(): MemoryReconQueue & {
  jobs: Map<string, { data: unknown; state: string }>;
} {
  const jobs = new Map<string, { data: unknown; state: string }>();
  return {
    jobs,
    add: async (_name, data, opts) => {
      // BullMQ dedupes on jobId: re-adding an existing job is a no-op.
      if (jobs.has(opts.jobId)) return { id: opts.jobId };
      jobs.set(opts.jobId, { data, state: "waiting" });
      return { id: opts.jobId };
    },
    getJob: async (jobId) => {
      const j = jobs.get(jobId);
      if (!j) return undefined;
      return {
        getState: async () => j.state,
        remove: async () => {
          jobs.delete(jobId);
        },
      };
    },
  };
}

interface Seed {
  workspaceId: string;
  novelId: string;
  branchId: string;
  oldRevisionId: string;
  headRevisionId: string;
  scope: string;
}

// Track seeded novels for per-test cleanup (cascade deletes projections,
// revisions, branches) so STALE seeds don't leak into other tests.
const createdNovelIds: string[] = [];

async function seedNovel(db: NovelForgeDb): Promise<Seed> {
  const user = await db.user.create({
    data: {
      email: `recon-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "x",
      displayName: "Recon Test",
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: "Recon WS",
      slug: `recon-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerId: user.id,
    },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: workspace.id,
      title: "Recon Novel",
      slug: `recon-novel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdById: user.id,
    },
  });
  const branch = await db.novelBranch.create({
    data: { workspaceId: workspace.id, novelId: novel.id, name: "main" },
  });
  const oldRev = await db.revision.create({
    data: {
      workspaceId: workspace.id,
      novelId: novel.id,
      branchId: branch.id,
      number: 1,
      origin: "MANUAL",
    },
  });
  const headRev = await db.revision.create({
    data: {
      workspaceId: workspace.id,
      novelId: novel.id,
      branchId: branch.id,
      parentRevisionId: oldRev.id,
      number: 2,
      origin: "MANUAL",
    },
  });
  await db.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: headRev.id },
  });
  createdNovelIds.push(novel.id);
  return {
    workspaceId: workspace.id,
    novelId: novel.id,
    branchId: branch.id,
    oldRevisionId: oldRev.id,
    headRevisionId: headRev.id,
    scope: `chapter:${crypto.randomUUID()}`,
  };
}

async function seedProjection(
  db: NovelForgeDb,
  seed: Seed,
  opts: { sourceRevisionId: string; buildStatus: "OK" | "FAILED" },
): Promise<void> {
  await db.memoryProjection.create({
    data: {
      workspaceId: seed.workspaceId,
      novelId: seed.novelId,
      scope: seed.scope,
      sourceRevisionId: opts.sourceRevisionId,
      buildStatus: opts.buildStatus,
      lastError: opts.buildStatus === "FAILED" ? "boom" : null,
      attempts: 1,
      structural: { facts: [], threads: [], promises: [] },
      chapterCoverage: [],
    },
  });
}

describe("reconcileMemoryRebuilds (NF-WF-030)", () => {
  let db: NovelForgeDb;

  beforeAll(async () => {
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: withDb("postgres") });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${IT_DB}"`);
    await admin.query(`CREATE DATABASE "${IT_DB}"`);
    await admin.end();

    // Apply reviewed migrations to this dedicated scratch database.
    const { execFileSync } = await import("node:child_process");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
    const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
    execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      stdio: "pipe",
      cwd: DB_PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: IT_URL },
    });
    db = createDb(IT_URL);
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  afterEach(async () => {
    for (const novelId of createdNovelIds.splice(0)) {
      await db.novel.deleteMany({ where: { id: novelId } });
    }
  });

  it("re-derives a rebuild job for a STALE scope after simulated Redis loss", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    // STALE: projection built at revision 1, head is revision 2.
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const queue = mockQueue();
    // Simulate the original queued job, then Redis loss wipes it.
    const originalJobId = memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId);
    queue.jobs.set(originalJobId, { data: {}, state: "waiting" });
    queue.jobs.clear(); // Redis loss: all queued jobs gone.

    const report: MemoryReconciliationReport = await reconcileMemoryRebuilds({
      db,
      queue,
      logger,
    });

    expect(report.checked).toBe(1);
    expect(report.stale).toBe(1);
    expect(report.requeued).toBe(1);
    expect(report.failed).toBe(0);
    expect(queue.jobs.has(originalJobId)).toBe(true);

    // The re-derived job executes to OK (end-to-end proof).
    const job = queue.jobs.get(originalJobId)!;
    const data = job.data as { workspaceId: string; novelId: string; scope: string; sourceRevisionId: string };
    expect(data.sourceRevisionId).toBe(seed.headRevisionId);
    const result = await processRebuild(db, data);
    expect(result.ok).toBe(true);
    expect(result.deduped).toBe(false);

    const rows = await db.memoryProjection.findMany({
      where: { novelId: seed.novelId, scope: seed.scope, buildStatus: "OK" },
    });
    // Old STALE row (rev 1) + new OK row (rev 2).
    expect(rows.length).toBe(2);
  });

  it("does not duplicate when reconciliation runs twice", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const queue = mockQueue();
    const first = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(first.requeued).toBe(1);

    // Second run: the job is still queued (not yet processed) → skipped.
    const second = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(second.requeued).toBe(0);
    expect(second.checked).toBeGreaterThanOrEqual(1);

    // Only one job for the deterministic jobId.
    const jobId = memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId);
    expect([...queue.jobs.keys()].filter((k) => k === jobId).length).toBe(1);

    // Process once → single OK row for (novelId, scope, headRevisionId).
    const data = queue.jobs.get(jobId)!.data as {
      workspaceId: string; novelId: string; scope: string; sourceRevisionId: string;
    };
    await processRebuild(db, data);
    // Processing again dedupes at the DB level.
    const again = await processRebuild(db, data);
    expect(again.deduped).toBe(true);

    const okRows = await db.memoryProjection.findMany({
      where: {
        novelId: seed.novelId,
        scope: seed.scope,
        sourceRevisionId: seed.headRevisionId,
        buildStatus: "OK",
      },
    });
    expect(okRows.length).toBe(1);
  });

  it.each(["failed", "completed"])("re-queues a retained %s job when projection is stale", async (state) => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const queue = mockQueue();
    const jobId = memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId);
    // A previous attempt failed and the job record was retained.
    queue.jobs.set(jobId, { data: {}, state });

    const report = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(report.requeued).toBe(1);
    // The stale failed record was removed and replaced with a fresh job.
    expect(queue.jobs.get(jobId)!.state).toBe("waiting");
  });

  it("does not mark scopes healthy when the queue is unavailable (no false success)", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const brokenQueue: MemoryReconQueue = {
      add: async () => {
        throw new Error("ECONNREFUSED");
      },
      getJob: async () => undefined,
    };

    const report = await reconcileMemoryRebuilds({ db, queue: brokenQueue, logger });
    expect(report.requeued).toBe(0);
    expect(report.failed).toBe(1);
    expect(logger.error).toHaveBeenCalled();

    // DB rows unchanged: still STALE, no OK row for head.
    const headRows = await db.memoryProjection.findMany({
      where: { novelId: seed.novelId, scope: seed.scope, sourceRevisionId: seed.headRevisionId },
    });
    expect(headRows.length).toBe(0);
  });

  it("skips FRESH scopes", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    // FRESH: projection built at head revision.
    await seedProjection(db, seed, { sourceRevisionId: seed.headRevisionId, buildStatus: "OK" });

    const queue = mockQueue();
    const report = await reconcileMemoryRebuilds({ db, queue, logger });
    // checked counts all pairs in the DB (including other tests' seeds);
    // assert this novel's scope was skipped as fresh via the counters.
    expect(report.skippedFresh).toBeGreaterThanOrEqual(1);
    expect(report.requeued).toBe(0);
    expect(queue.jobs.size).toBe(0);
  });

  it("does not auto-rebuild MISSING scopes (Invariant 9)", async () => {
    const logger = testLogger();
    // Novel with a head revision but no projection rows for this scope.
    // deriveFreshness returns MISSING only when rows exist but... actually
    // MISSING means no rows at all, so the pair won't appear in the scan.
    // This test asserts the scan finds no pair for a rowless scope.
    const seed = await seedNovel(db);
    const otherScope = `chapter:${crypto.randomUUID()}`;

    const queue = mockQueue();
    const before = queue.jobs.size;
    await reconcileMemoryRebuilds({ db, queue, logger });
    // No job for the rowless scope.
    const jobId = memoryRebuildJobId(seed.novelId, otherScope, seed.headRevisionId);
    expect(queue.jobs.has(jobId)).toBe(false);
    expect(queue.jobs.size).toBe(before);
  });

  it("re-derives FAILED scopes for the head revision", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "FAILED" });

    const queue = mockQueue();
    const report = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(report.stale).toBeGreaterThanOrEqual(1);
    expect(report.requeued).toBeGreaterThanOrEqual(1);

    // Job targets the head revision, not the failed one.
    const jobId = memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId);
    expect(queue.jobs.has(jobId)).toBe(true);
  });
});
