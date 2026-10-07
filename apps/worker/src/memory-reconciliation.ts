/**
 * NF-WF-030: startup reconciliation for the `memory-rebuild` queue (GAP-095).
 *
 * If Redis is lost, queued rebuild jobs are gone and nothing re-derives
 * them; recovery was manual via the API. On worker startup, this scans
 * PostgreSQL (the source of truth) for stale memory projections and
 * re-derives rebuild jobs for them.
 *
 * Guarantees (mirroring `reconcileScheduledPublications`):
 * - Idempotent: deterministic jobIds (`memory-rebuild:{novelId}:{scope}:{sourceRevisionId}`)
 *   make concurrent/double reconciliation safe (BullMQ dedupes); a job in
 *   `failed`/`unknown` state is removed first (re-adding against it is a
 *   silent no-op — the P2-6 hazard).
 * - No false success: never writes a healthy row; if the queue is
 *   unavailable, scopes stay STALE/FAILED in the DB and the next startup
 *   retries. Reconciliation failure never prevents the consumer from
 *   starting.
 * - MISSING scopes are NOT auto-rebuilt (Invariant 9: materialize when
 *   consumed — a scope with no rows stays MISSING until consumed).
 * - FAILED scopes are re-derived for the HEAD revision (not the failed
 *   revision): rebuilding the failed revision when head has moved would
 *   leave the projection STALE (wasted work).
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { NovelForgeDb } from "@novelforge/database";
import {
  deriveFreshness,
  MEMORY_REBUILD_QUEUE_NAME,
  MEMORY_REBUILD_MAX_ATTEMPTS,
  MEMORY_REBUILD_RETRY_BASE_MS,
  type MemoryRebuildJobData,
} from "@novelforge/memory";
import type { WorkerLogger } from "./worker.ts";

/** Minimal BullMQ Queue surface the reconciler needs. */
export interface MemoryReconQueue {
  add(
    name: string,
    data: MemoryRebuildJobData,
    opts: { jobId: string },
  ): Promise<unknown>;
  getJob(
    jobId: string,
  ): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined>;
}

/** Report shape for operator observability. `skipped` distinguishes
 * FRESH (healthy) from MISSING (not-yet-consumed) scopes. */
export type MemoryReconciliationReport = {
  checked: number;
  stale: number;
  requeued: number;
  skippedFresh: number;
  skippedMissing: number;
  failed: number;
};

/** Deterministic jobId — must match the API's `triggerRebuild` format. */
export function memoryRebuildJobId(
  novelId: string,
  scope: string,
  sourceRevisionId: string,
): string {
  return `memory-rebuild:${novelId}:${scope}:${sourceRevisionId}`;
}

/**
 * Create the `memory-rebuild` queue against a shared connection.
 * Production DI default for `MemoryWorkerDeps.createQueue` — mirrors the
 * API's `createMemoryQueue` options without importing from `apps/api/src`
 * (NF-WF-026 ESLint `no-restricted-imports`).
 */
export function createMemoryReconQueue(
  connection: IORedis,
): MemoryReconQueue & { close(): Promise<void> } {
  const queue = new Queue(MEMORY_REBUILD_QUEUE_NAME, {
    connection: connection as never,
    defaultJobOptions: {
      attempts: MEMORY_REBUILD_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: MEMORY_REBUILD_RETRY_BASE_MS },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
  return {
    add: (name, data, opts) => queue.add(name, data, opts),
    getJob: (jobId) => queue.getJob(jobId) as never,
    close: () => queue.close(),
  };
}

/**
 * Startup reconciliation: for every (novelId, scope) with projection rows,
 * derive freshness and re-derive rebuild jobs for STALE and FAILED scopes.
 *
 * Safe to run multiple times and concurrently (deterministic jobIds).
 * Per-scope errors are counted, not thrown; the caller decides whether a
 * non-zero `failed` count is loud enough.
 */
export async function reconcileMemoryRebuilds({
  db,
  queue,
  logger,
}: {
  db: NovelForgeDb;
  queue: MemoryReconQueue;
  logger?: WorkerLogger;
}): Promise<MemoryReconciliationReport> {
  const report: MemoryReconciliationReport = {
    checked: 0,
    stale: 0,
    requeued: 0,
    skippedFresh: 0,
    skippedMissing: 0,
    failed: 0,
  };

  const pairs = await db.memoryProjection.findMany({
    select: { novelId: true, scope: true, workspaceId: true },
    distinct: ["novelId", "scope"],
  });

  for (const { novelId, scope, workspaceId } of pairs) {
    report.checked++;
    try {
      const f = await deriveFreshness(db, novelId, scope);
      if (!f) {
        // Novel has no head revision — nothing to rebuild against.
        report.skippedMissing++;
        continue;
      }
      if (f.freshness === "FRESH") {
        report.skippedFresh++;
        continue;
      }
      if (f.freshness === "MISSING") {
        // Invariant 9: a scope with no rows stays MISSING until consumed.
        report.skippedMissing++;
        continue;
      }

      // STALE or FAILED → re-derive for the head revision.
      report.stale++;
      const jobId = memoryRebuildJobId(novelId, scope, f.headRevisionId);
      const data: MemoryRebuildJobData = {
        workspaceId,
        novelId,
        scope,
        sourceRevisionId: f.headRevisionId,
      };

      // P2-6 hazard: re-adding against a retained `failed` job is a silent
      // no-op. Remove failed/unknown jobs first; leave live jobs alone.
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "failed" || state === "unknown") {
          await existing.remove();
          logger?.info("memory rebuild stale job removed before requeue", {
            novelId,
            scope,
            jobId,
            previousState: state,
          });
        } else {
          // Job already queued/running/completed — BullMQ dedupes; skip.
          logger?.info("memory rebuild job already present; skipping", {
            novelId,
            scope,
            jobId,
            state,
          });
          continue;
        }
      }

      await queue.add("rebuild", data, { jobId });
      report.requeued++;
      logger?.info("memory rebuild reconciled", {
        novelId,
        scope,
        freshness: f.freshness,
        jobId,
      });
    } catch (err) {
      report.failed++;
      logger?.error("memory reconciliation failed for scope", {
        novelId,
        scope,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
