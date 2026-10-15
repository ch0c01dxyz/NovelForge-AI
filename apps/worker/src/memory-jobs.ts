/**
 * NF-WF-009 memory worker: the `memory-rebuild` BullMQ consumer.
 *
 * Each job `{workspaceId, novelId, scope, sourceRevisionId}` runs the
 * deterministic structural rebuild from `@novelforge/memory`
 * (`processRebuild`): dedup-safe, byte-identical on re-run (Invariant 3),
 * FAILED rows on error — never a false success (constitution §9).
 *
 * BullMQ handles the retry policy (MEMORY_REBUILD_MAX_ATTEMPTS = 5,
 * exponential backoff from MEMORY_REBUILD_RETRY_BASE_MS, F6); the handler
 * itself never retries internally. Deps are injectable for tests.
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import {
  MEMORY_REBUILD_QUEUE_NAME,
  MEMORY_REBUILD_MAX_ATTEMPTS,
  MEMORY_REBUILD_RETRY_BASE_MS,
  MEMORY_RECONCILE_INTERVAL_MS,
  processRebuild,
  type MemoryRebuildJobData,
} from "@novelforge/memory";
import type { WorkerLogger } from "./worker.ts";
import {
  createMemoryReconQueue,
  reconcileMemoryRebuilds,
  type MemoryReconQueue,
} from "./memory-reconciliation.ts";

export interface MemoryWorkerDeps {
  createDb: (url: string) => NovelForgeDb;
  createConnection: (url: string) => IORedis;
  /**
   * NF-WF-030 (GAP-095): queue factory for startup reconciliation.
   * Mirrors the publication worker's DI pattern; defaults to
   * `createMemoryReconQueue` (never imports `createMemoryQueue` from
   * `apps/api/src` — NF-WF-026 ESLint `no-restricted-imports`).
   */
  createQueue: (connection: IORedis) => MemoryReconQueue & {
    close(): Promise<void>;
  };
  createWorker: (
    queueName: string,
    handler: (job: { data: MemoryRebuildJobData; id?: string }) => Promise<void>,
    connection: IORedis,
  ) => {
    on(event: "error", cb: (err: Error) => void): void;
    on(event: "failed", cb: (job: { id?: string } | undefined, err: Error) => void): void;
    on(event: string, cb: (...args: never[]) => void): void;
    close(): Promise<void>;
  };
  processRebuild: typeof processRebuild;
  /**
   * NF-WF-051: interval between memory reconciliation sweeps (mid-run
   * Redis-loss recovery). Defaults to MEMORY_RECONCILE_INTERVAL_MS;
   * tests inject a short value to prove the timer wiring.
   */
  reconcileIntervalMs: number;
  probeTimeoutMs: number;
  logger: WorkerLogger;
}

export function defaultMemoryWorkerDeps(logger: WorkerLogger): MemoryWorkerDeps {
  return {
    createDb,
    createConnection: (url) =>
      new IORedis(url, { maxRetriesPerRequest: null, enableOfflineQueue: false }),
    createQueue: (connection) => createMemoryReconQueue(connection),
    createWorker: (queueName, handler, connection) =>
      new Worker(queueName, handler as never, {
        connection: connection as never,
        concurrency: 4,
      }),
    processRebuild,
    reconcileIntervalMs: MEMORY_RECONCILE_INTERVAL_MS,
    probeTimeoutMs: 10_000,
    logger,
  };
}

export interface MemoryWorkerApp {
  readonly started: boolean;
  readonly stopped: boolean;
  stop(): Promise<void>;
}

export async function startMemoryWorkerApp(
  env: { DATABASE_URL: string; REDIS_URL: string },
  logger: WorkerLogger,
  deps: Partial<MemoryWorkerDeps> = {},
): Promise<MemoryWorkerApp> {
  const d: MemoryWorkerDeps = { ...defaultMemoryWorkerDeps(logger), ...deps };
  let started = false;
  let stopped = false;

  const db = d.createDb(env.DATABASE_URL);
  const connection = d.createConnection(env.REDIS_URL);

  const onConnError = (err: Error) => {
    if (!stopped) d.logger.warn("memory redis connection error", { message: err.message });
  };
  connection.on("error", onConnError);

  const available = await (async () => {
    const deadline = Date.now() + d.probeTimeoutMs;
    do {
      try {
        await connection.ping();
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    } while (Date.now() < deadline);
    return false;
  })();

  if (!available) {
    d.logger.warn("redis unavailable; memory worker not started", {});
    connection.disconnect();
    await db.$disconnect();
    return {
      get started() {
        return started;
      },
      get stopped() {
        return stopped;
      },
      async stop() {
        stopped = true;
      },
    };
  }

  // NF-WF-030 (GAP-095): startup reconciliation — after Redis loss,
  // queued rebuild jobs are gone and nothing re-derives them. Scan
  // PostgreSQL (source of truth) for STALE/FAILED projections and
  // re-derive rebuild jobs. A failed pass is logged loudly but never
  // prevents the consumer from starting (publication pattern).
  let queue: (MemoryReconQueue & { close(): Promise<void> }) | undefined;
  try {
    queue = d.createQueue(connection);
    const report = await reconcileMemoryRebuilds({ db, queue, logger: d.logger });
    d.logger.info("memory startup reconciliation complete", report);
  } catch (err) {
    d.logger.error("memory startup reconciliation failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // NF-WF-051: interval sweeper — the startup pass only heals losses that
  // happened before the process started; a long-lived worker that loses
  // Redis mid-run gets the same pass on a timer. One failed pass is logged
  // and never kills the timer — the next tick retries. Ticks skip when the
  // queue factory failed at startup (queue undefined).
  const reconcileTimer = setInterval(() => {
    if (stopped) return;
    if (!queue) return;
    void reconcileMemoryRebuilds({ db, queue, logger: d.logger }).catch((err) => {
      d.logger.error("memory reconciliation sweep failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, d.reconcileIntervalMs);
  reconcileTimer.unref?.();
  d.logger.info("memory reconciliation sweeper started", {
    reconcileIntervalMs: d.reconcileIntervalMs,
  });

  const worker = d.createWorker(
    MEMORY_REBUILD_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (
        !data ||
        typeof data.novelId !== "string" ||
        typeof data.scope !== "string" ||
        typeof data.sourceRevisionId !== "string"
      ) {
        throw new Error("malformed memory-rebuild job data");
      }
      const result = await d.processRebuild(db, {
        workspaceId: data.workspaceId,
        novelId: data.novelId,
        scope: data.scope,
        sourceRevisionId: data.sourceRevisionId,
      });
      d.logger.info("memory rebuild processed", {
        novelId: data.novelId,
        scope: data.scope,
        sourceRevisionId: data.sourceRevisionId,
        deduped: result.deduped,
        ok: result.ok,
      });
    },
    connection,
  );
  worker.on("error", (err) => {
    if (!stopped) d.logger.warn("memory worker error", { message: err.message });
  });
  worker.on("failed", (job, err) => {
    // After MEMORY_REBUILD_MAX_ATTEMPTS the job is terminal; the FAILED
    // row (with lastError + attempts) is already persisted by
    // processRebuild, so this is the loud log only.
    if (!stopped)
      d.logger.error("memory job failed", { jobId: job?.id, message: err.message });
  });

  started = true;
  d.logger.info("memory worker started", {
    queue: MEMORY_REBUILD_QUEUE_NAME,
    attempts: MEMORY_REBUILD_MAX_ATTEMPTS,
    retryBaseMs: MEMORY_REBUILD_RETRY_BASE_MS,
  });

  return {
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(reconcileTimer);
      await worker.close();
      await queue?.close();
      connection.disconnect();
      await db.$disconnect();
    },
  };
}
