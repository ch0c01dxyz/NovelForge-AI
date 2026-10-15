/**
 * NF-WF-051: memory reconciliation interval sweeper tests.
 *
 * The sweeper re-runs the NF-WF-030 startup reconciliation on a timer;
 * these tests cover the timer wiring and the guarantees at interval
 * cadence, mirroring `publication-jobs.test.ts:439-604` patterns:
 *
 * - MEMORY_RECONCILE_INTERVAL_MS is 60s and the default DI value.
 * - Overlapping sweeps enqueue no duplicate jobs (deterministic jobId).
 * - stop() clears the timer and prevents new passes; existing passes may finish.
 * - Repeated queue (Redis) failures: a failed pass never kills the timer,
 *   DB staleness is untouched (no false buildStatus OK), the next tick
 *   retries and recovers.
 * - FRESH scopes skipped; head-less (MISSING) pairs never auto-rebuilt.
 * - Bounded scanning: distinct (novelId, scope) pairs, not rows.
 * - Ticks are safe when the queue factory failed at startup.
 *
 * Real disposable scratch DB for staleness/freshness reality; the BullMQ
 * queue is mocked (the connection is a fake with ping → PONG).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { MEMORY_RECONCILE_INTERVAL_MS, memoryRebuildJobId } from "@novelforge/memory";
import pg from "pg";
import { defaultMemoryWorkerDeps, startMemoryWorkerApp, type MemoryWorkerApp } from "./memory-jobs.ts";
import {
  reconcileMemoryRebuilds,
  type MemoryReconQueue,
} from "./memory-reconciliation.ts";
import * as reconciliation from "./memory-reconciliation.ts";
import type { WorkerLogger } from "./worker.ts";

const IT_DB = "novelforge_test_memory_sweeper";
const BASE_URL =
  process.env.DATABASE_URL ?? "postgresql://novelforge:novelforge@localhost:5433/novelforge";
function withDb(database: string): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}
const IT_URL = withDb(IT_DB);

let db: NovelForgeDb;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb("postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${IT_DB}"`);
  await admin.query(`CREATE DATABASE "${IT_DB}"`);
  await admin.end();

  // Apply reviewed migrations to this dedicated scratch database.
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

function testLogger(): WorkerLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** Mock queue with BullMQ jobId dedup semantics (mirrors NF-WF-030 tests). */
function mockQueue(): MemoryReconQueue & {
  jobs: Map<string, { data: unknown; state: string }>;
} {
  const jobs = new Map<string, { data: unknown; state: string }>();
  return {
    jobs,
    add: async (_name, data, opts) => {
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

/** Stateless getJob (every pass re-enqueues) with dedup-on-add — the
 * publication-jobs.test.ts fake-queue shape for deterministic overlap. */
function statelessQueue(): MemoryReconQueue & {
  jobs: Map<string, { data: unknown; state: string }>;
} {
  const jobs = new Map<string, { data: unknown; state: string }>();
  return {
    jobs,
    add: async (_name, data, opts) => {
      jobs.set(opts.jobId, { data, state: "waiting" });
      return { id: opts.jobId };
    },
    getJob: async () => undefined,
  };
}

interface Seed {
  workspaceId: string;
  novelId: string;
  oldRevisionId: string;
  headRevisionId: string | null;
  scope: string;
}

const createdNovelIds: string[] = [];

// Cascade deletes projections, revisions, branches so seeds never leak
// across tests — leftover STALE pairs would pollute pair scans and queue
// assertions (the scan reads every (novelId, scope) pair in the DB).
afterEach(async () => {
  for (const novelId of createdNovelIds.splice(0)) {
    await db.novel.deleteMany({ where: { id: novelId } });
  }
});

async function seedWorkspaceNovel(db: NovelForgeDb): Promise<{ userId: string; workspaceId: string; novelId: string }> {
  const user = await db.user.create({
    data: {
      email: `sweep-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "x",
      displayName: "Sweep Test",
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: "Sweep WS",
      slug: `sweep-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerId: user.id,
    },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: workspace.id,
      title: "Sweep Novel",
      slug: `sweep-novel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdById: user.id,
    },
  });
  createdNovelIds.push(novel.id);
  return { userId: user.id, workspaceId: workspace.id, novelId: novel.id };
}

/** Novel with a main branch whose head is revision 2 (revision 1 behind). */
async function seedNovel(db: NovelForgeDb): Promise<Seed> {
  const { workspaceId, novelId } = await seedWorkspaceNovel(db);
  const branch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  const oldRev = await db.revision.create({
    data: { workspaceId, novelId, branchId: branch.id, number: 1, origin: "MANUAL" },
  });
  const headRev = await db.revision.create({
    data: {
      workspaceId,
      novelId,
      branchId: branch.id,
      parentRevisionId: oldRev.id,
      number: 2,
      origin: "MANUAL",
    },
  });
  await db.novelBranch.update({ where: { id: branch.id }, data: { headRevisionId: headRev.id } });
  return {
    workspaceId,
    novelId,
    oldRevisionId: oldRev.id,
    headRevisionId: headRev.id,
    scope: `chapter:${crypto.randomUUID()}`,
  };
}

/** Novel whose main branch has NO head (headRevisionId null) — the
 * deriveFreshness → null fixture for the MISSING-skip test. */
async function seedHeadlessNovel(db: NovelForgeDb): Promise<Seed> {
  const { workspaceId, novelId } = await seedWorkspaceNovel(db);
  const branch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  const rev = await db.revision.create({
    data: { workspaceId, novelId, branchId: branch.id, number: 1, origin: "MANUAL" },
  });
  return {
    workspaceId,
    novelId,
    oldRevisionId: rev.id,
    headRevisionId: null,
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

describe("memory reconciliation sweeper (NF-WF-051)", () => {
  it("MEMORY_RECONCILE_INTERVAL_MS is 60s and the default", () => {
    expect(MEMORY_RECONCILE_INTERVAL_MS).toBe(60_000);
    expect(defaultMemoryWorkerDeps(testLogger()).reconcileIntervalMs).toBe(60_000);
  });

  it("overlapping sweeps enqueue no duplicate jobs (deterministic jobId)", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const queue = statelessQueue();
    const [r1, r2] = await Promise.all([
      reconcileMemoryRebuilds({ db, queue, logger }),
      reconcileMemoryRebuilds({ db, queue, logger }),
    ]);

    // Both passes may observe no live job and both enqueue; every enqueue
    // carries the same deterministic jobId, so BullMQ dedupes to one live
    // job (publication-jobs.test.ts concurrent-sweep shape).
    const jobId = memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId!);
    expect([...queue.jobs.keys()]).toEqual([jobId]);
    expect(queue.jobs.size).toBe(1);
    expect(r1.requeued + r2.requeued).toBe(2);
    expect(r1.failed + r2.failed).toBe(0);
  });

  it("skips FRESH scopes", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.headRevisionId!, buildStatus: "OK" });

    const queue = mockQueue();
    const report = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(report.skippedFresh).toBeGreaterThanOrEqual(1);
    expect(report.requeued).toBe(0);
    expect(queue.jobs.size).toBe(0);
  });

  it("never auto-rebuilds a pair whose novel has no main-branch head (MISSING)", async () => {
    const logger = testLogger();
    const seed = await seedHeadlessNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const queue = mockQueue();
    const report = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(report.skippedMissing).toBeGreaterThanOrEqual(1);
    expect(report.requeued).toBe(0);
    expect(queue.jobs.size).toBe(0);
  });

  it("scans distinct (novelId, scope) pairs, not rows (bounded)", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    // Two rows for the SAME pair: newest row (head) is FAILED → the pass
    // re-derives for head; the pair count stays 1.
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });
    await seedProjection(db, seed, { sourceRevisionId: seed.headRevisionId!, buildStatus: "FAILED" });

    const queue = mockQueue();
    const first = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(first.checked).toBe(1);
    expect(first.stale).toBe(1);
    expect(first.requeued).toBe(1);

    // A repeat pass rescans the same bounded set — no growth.
    const second = await reconcileMemoryRebuilds({ db, queue, logger });
    expect(second.checked).toBe(1);
    expect(second.requeued).toBe(0); // live waiting job → skipped
  });
});

describe("memory sweeper interval wiring (NF-WF-051)", () => {
  let app: MemoryWorkerApp | undefined;
  let reconcile: MockInstance<typeof reconcileMemoryRebuilds>;

  beforeEach(() => {
    app = undefined;
    // Control scheduling only; PostgreSQL I/O keeps its real timers.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    reconcile = vi.spyOn(reconciliation, "reconcileMemoryRebuilds");
  });

  async function finishPasses() {
    await Promise.all(reconcile.mock.results.map((result) => result.value));
  }

  async function tick(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await finishPasses();
  }

  afterEach(async () => {
    try {
      await finishPasses();
      await app?.stop();
    } finally {
      reconcile.mockRestore();
      vi.useRealTimers();
    }
  });
  function fakeConnection(): never {
    return {
      ping: vi.fn(async () => "PONG"),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
  }

  function fakeWorker(): never {
    return { on: vi.fn(), close: vi.fn(async () => {}) } as never;
  }

  it("runs the sweep on an interval and stops it on stop()", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const added: string[] = [];
    const queue = {
      add: async (_n: string, _d: unknown, opts: { jobId: string }) => {
        added.push(opts.jobId);
        return {};
      },
      getJob: vi.fn(async () => undefined), // stateless: every pass re-enqueues
      close: vi.fn(async () => {}),
    };

    app = await startMemoryWorkerApp(
      { DATABASE_URL: IT_URL, REDIS_URL: "redis://x" },
      logger,
      {
        createDb: () => createDb(IT_URL),
        createConnection: () => fakeConnection(),
        createQueue: () => queue as never,
        createWorker: () => fakeWorker(),
        probeTimeoutMs: 500,
        reconcileIntervalMs: 50, // DI override drives the ticks
      },
    );
    expect(app.started).toBe(true);

    // Startup pass + at least one interval tick.
    expect(reconcile).toHaveBeenCalledTimes(1);
    await tick(50);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(added).toHaveLength(2);
    expect(
      added.every(
        (id) => id === memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId!),
      ),
    ).toBe(true);

    await app.stop();
    expect(app.stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await tick(150);
    // stop prevents new passes; the contract permits in-flight completion.
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(added).toHaveLength(2);
  });

  it("survives repeated queue failures and recovers on a later tick; DB staleness untouched", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    const added: string[] = [];
    let failuresLeft = 99;
    const failingQueue = {
      add: async (_n: string, _d: unknown, opts: { jobId: string }) => {
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error("ECONNREFUSED");
        }
        added.push(opts.jobId);
        return {};
      },
      getJob: vi.fn(async () => undefined),
      close: vi.fn(async () => {}),
    };

    app = await startMemoryWorkerApp(
      { DATABASE_URL: IT_URL, REDIS_URL: "redis://x" },
      logger,
      {
        createDb: () => createDb(IT_URL),
        createConnection: () => fakeConnection(),
        createQueue: () => failingQueue as never,
        createWorker: () => fakeWorker(),
        probeTimeoutMs: 500,
        reconcileIntervalMs: 40,
      },
    );

    // Startup pass + several ticks all fail; the timer keeps firing.
    await tick(40);
    await tick(40);
    expect(99 - failuresLeft).toBe(3);
    expect(logger.error).toHaveBeenCalledWith(
      "memory reconciliation failed for scope",
      expect.objectContaining({ novelId: seed.novelId, scope: seed.scope, message: "ECONNREFUSED" }),
    );

    // No false success: only the original stale row exists; no OK row at
    // head was written by any failed pass.
    const staleRows = await db.memoryProjection.findMany({
      where: { novelId: seed.novelId, scope: seed.scope },
    });
    expect(staleRows).toHaveLength(1);
    expect(staleRows[0]!.sourceRevisionId).toBe(seed.oldRevisionId);
    expect(
      await db.memoryProjection.count({
        where: {
          novelId: seed.novelId,
          scope: seed.scope,
          sourceRevisionId: seed.headRevisionId!,
          buildStatus: "OK",
        },
      }),
    ).toBe(0);

    // Recovery: allow adds; the next tick re-derives the deterministic job.
    failuresLeft = 0;
    await tick(40);
    expect(added).toContain(
      memoryRebuildJobId(seed.novelId, seed.scope, seed.headRevisionId!),
    );
    // Still no false OK — the sweeper never writes buildStatus rows.
    expect(
      await db.memoryProjection.count({
        where: {
          novelId: seed.novelId,
          scope: seed.scope,
          sourceRevisionId: seed.headRevisionId!,
          buildStatus: "OK",
        },
      }),
    ).toBe(0);

    await app.stop();
  });

  it("ticks are safe when the queue factory failed at startup (queue undefined)", async () => {
    const logger = testLogger();
    const seed = await seedNovel(db);
    await seedProjection(db, seed, { sourceRevisionId: seed.oldRevisionId, buildStatus: "OK" });

    app = await startMemoryWorkerApp(
      { DATABASE_URL: IT_URL, REDIS_URL: "redis://x" },
      logger,
      {
        createDb: () => createDb(IT_URL),
        createConnection: () => fakeConnection(),
        createQueue: () => {
          throw new Error("queue factory down");
        },
        createWorker: () => fakeWorker(),
        probeTimeoutMs: 500,
        reconcileIntervalMs: 30,
      },
    );
    expect(app.started).toBe(true);

    // Several ticks fire; the queue-undefined guard keeps them silent
    // (the only error is the startup reconciliation failure).
    await vi.advanceTimersByTimeAsync(150);
    expect(logger.error).toHaveBeenCalledTimes(1);

    await app.stop();
    expect(app.stopped).toBe(true);
  });
});
