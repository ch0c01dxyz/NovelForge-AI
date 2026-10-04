/**
 * @novelforge/worker — `workflow-runs` BullMQ job handler (NF-WF-004).
 *
 * One new module: the job processor. It drives one claimed run through the
 * shared executor from `@novelforge/workflow-executor` and runs the
 * restart-recovery sweep. It never imports HTTP; all capabilities arrive as
 * injected deps.
 *
 * Production AI wiring (generate / retrieval / compiler) is NOT
 * constructed here: those service factories live in `apps/api/src`, which
 * this module must not import. The executor is built with worker-side deps
 * (db, audit, DB-backed definition resolvers); step kinds needing the AI
 * path fail with a clear "not configured" error until the factories move
 * to shared packages (recorded in ISSUES-AND-GAPS).
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import {
  createWorkflowExecutor,
  createDbDefinitionResolvers,
  WORKFLOW_DEFAULT_JOB_OPTIONS,
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_SWEEPER_INTERVAL_MS,
  WORKFLOW_WORKER_LOCK_DURATION_MS,
  type RecoveryQueuePort,
  type WorkflowExecutor,
} from "@novelforge/workflow-executor";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import type { WorkerLogger } from "./worker.ts";

/** The BullMQ job payload for a workflow run (see invariant 1). */
export interface WorkflowJobData {
  runId: string;
  actorUserId?: string;
  workspaceId?: string;
  workflowId?: string;
  runInput?: Record<string, unknown>;
  novelId?: string;
  idempotencyKey?: string;
}

/** Minimal BullMQ Job surface the handler needs. */
export interface WorkflowJobPort {
  id?: string;
  data: WorkflowJobData;
}

export interface WorkflowJobHandlerDeps {
  executor: WorkflowExecutor;
  logger: WorkerLogger;
}

/**
 * Create the BullMQ processor for the `workflow-runs` queue. The runId
 * comes from the job data (falling back to the BullMQ job id, which the
 * enqueue path sets to the run id); the executor loads everything else
 * from the run row and claims it — a lost claim exits silently, which is
 * what makes BullMQ's at-least-once delivery safe.
 */
export function createWorkflowJobHandler(deps: WorkflowJobHandlerDeps) {
  const { executor, logger } = deps;
  return async function handleWorkflowJob(job: WorkflowJobPort): Promise<void> {
    const runId = job.data.runId ?? job.id;
    if (!runId) {
      logger.error("workflow job has no run id; dropping", {});
      return;
    }
    try {
      const result = await executor.executeRun(runId);
      if (!result.claimed) {
        logger.info("workflow run claim lost; another driver owns it", { runId });
        return;
      }
      logger.info("workflow run finished", {
        runId,
        status: result.status,
        stoppedForCancellation: result.stoppedForCancellation ?? false,
      });
    } catch (err) {
      // executeRun marks FAILED internally for step failures; an escape
      // here is infrastructure (db down). Log and rethrow so BullMQ marks
      // the job failed — the sweeper, not a retry, owns recovery.
      logger.error("workflow run handler threw", {
        runId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

export interface RecoverySweepDeps {
  executor: WorkflowExecutor;
  queue: RecoveryQueuePort;
  logger: WorkerLogger;
}

/** One restart-recovery pass (invariant 3). Returns the sweep report. */
export async function runRecoverySweep(deps: RecoverySweepDeps) {
  const { executor, queue, logger } = deps;
  try {
    const report = await executor.recoverStaleRuns(queue);
    const total =
      report.resetRuns.length + report.requeuedRuns.length + report.orphanEnqueues.length;
    if (total > 0) {
      logger.info("workflow recovery sweep recovered stale runs", {
        reset: report.resetRuns.length,
        requeued: report.requeuedRuns.length,
        orphans: report.orphanEnqueues.length,
      });
    }
    return report;
  } catch (err) {
    logger.error("workflow recovery sweep failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export interface WorkerExecutorDeps {
  db: NovelForgeDb;
  logger: WorkerLogger;
}

/**
 * Build the worker-side executor: db-backed audit and definition
 * resolvers. The AI path (generate / retrieval / compiler) is
 * intentionally absent — see the module docstring.
 */
export function createWorkerExecutor(deps: WorkerExecutorDeps): WorkflowExecutor {
  const { db, logger } = deps;
  return createWorkflowExecutor({
    db,
    audit: {
      record: (entry) =>
        db.auditLog.create({
          data: {
            actorUserId: entry.actorUserId ?? null,
            workspaceId: entry.workspaceId ?? null,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            payload: (entry.payload ?? {}) as never,
          },
        }).then(() => undefined),
    },
    resolvers: createDbDefinitionResolvers(db),
    dbg: { error: (message, meta) => logger.error(message, meta as Record<string, unknown>) },
  });
}

/** Re-exported so worker.ts and tests share the queue identity. */
export { WORKFLOW_QUEUE_NAME, WORKFLOW_SWEEPER_INTERVAL_MS, WORKFLOW_WORKER_LOCK_DURATION_MS };

// ---------------------------------------------------------------------------
// Workflow worker lifecycle: BullMQ Worker + restart-recovery sweeper.
// ---------------------------------------------------------------------------

/** Minimal BullMQ Worker surface this module needs. */
export interface WorkflowRunnerFacade {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
}

/** Minimal ioredis surface the workflow worker needs. */
export type WorkflowRedisConnection = ConnectionOptions & {
  ping(): Promise<string>;
  quit(): Promise<"OK">;
  disconnect(): void;
  on(event: "error", handler: (err: Error) => void): WorkflowRedisConnection;
};

export interface WorkflowWorkerDeps {
  createDb(url: string): NovelForgeDb;
  createExecutor(db: NovelForgeDb, logger: WorkerLogger): WorkflowExecutor;
  createConnection(url: string): WorkflowRedisConnection;
  createQueue(name: string, connection: unknown): RecoveryQueuePort & { close(): Promise<void> };
  createWorker(
    name: string,
    processor: (job: WorkflowJobPort) => Promise<void>,
    connection: unknown,
    opts: { lockDuration: number },
  ): WorkflowRunnerFacade;
  logger: WorkerLogger;
  probeTimeoutMs: number;
  sweeperIntervalMs: number;
}

export interface WorkflowWorkerApp {
  readonly started: boolean;
  readonly stopped: boolean;
  stop(): Promise<void>;
}

const defaultWorkflowWorkerDeps = (logger: WorkerLogger): WorkflowWorkerDeps => ({
  createDb: (url) => createDb(url),
  createExecutor: (db, l) => createWorkerExecutor({ db, logger: l }),
  createConnection: (url) =>
    new IORedis(url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    }) as unknown as WorkflowRedisConnection,
  createQueue: (name, connection) => {
    const queue = new Queue(name, {
      connection: connection as ConnectionOptions,
      defaultJobOptions: { ...WORKFLOW_DEFAULT_JOB_OPTIONS },
    });
    return {
      getJob: (jobId: string) => queue.getJob(jobId),
      add: (n: string, data: unknown, opts: { jobId: string }) => queue.add(n, data, opts),
      close: () => queue.close(),
    };
  },
  createWorker: (name, processor, connection, opts) =>
    new Worker(name, processor, {
      connection: connection as ConnectionOptions,
      lockDuration: opts.lockDuration,
    }),
  logger,
  probeTimeoutMs: 3_000,
  sweeperIntervalMs: WORKFLOW_SWEEPER_INTERVAL_MS,
});

/**
 * Start the `workflow-runs` worker: a BullMQ Worker driving claimed runs
 * through the shared executor, plus the restart-recovery sweep at startup
 * and every `sweeperIntervalMs`.
 *
 * Degrades gracefully when Redis is unreachable (logged warning, no
 * crash) — same posture as the heartbeat worker. The sweep needs both
 * Postgres and Redis; without Redis there is nothing to recover.
 */
export async function startWorkflowWorkerApp(
  env: { DATABASE_URL: string; REDIS_URL: string },
  logger: WorkerLogger,
  deps: Partial<WorkflowWorkerDeps> = {},
): Promise<WorkflowWorkerApp> {
  const d: WorkflowWorkerDeps = { ...defaultWorkflowWorkerDeps(logger), ...deps };
  let started = false;
  let stopped = false;

  const db = d.createDb(env.DATABASE_URL);
  const executor = d.createExecutor(db, d.logger);
  const queueConnection = d.createConnection(env.REDIS_URL);
  const workerConnection = d.createConnection(env.REDIS_URL);

  const onConnError = (err: Error) => {
    if (!stopped) d.logger.warn("workflow redis connection error", { message: err.message });
  };
  queueConnection.on("error", onConnError);
  workerConnection.on("error", onConnError);

  // Reuse the probe pattern from the heartbeat worker: a fresh socket
  // starts "connecting" and rejects commands until ready.
  const available = await (async () => {
    const deadline = Date.now() + d.probeTimeoutMs;
    do {
      try {
        await queueConnection.ping();
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    } while (Date.now() < deadline);
    return false;
  })();

  if (!available) {
    d.logger.warn("redis unavailable; workflow worker not started", {});
    queueConnection.disconnect();
    workerConnection.disconnect();
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

  const queue = d.createQueue(WORKFLOW_QUEUE_NAME, queueConnection);
  const handler = createWorkflowJobHandler({ executor, logger: d.logger });
  const worker = d.createWorker(
    WORKFLOW_QUEUE_NAME,
    handler,
    workerConnection,
    { lockDuration: WORKFLOW_WORKER_LOCK_DURATION_MS },
  );
  worker.on("error", (err) => {
    if (!stopped)
      d.logger.warn("workflow worker error", {
        message: String((err as Error)?.message ?? err),
      });
  });
  worker.on("failed", (job, err) => {
    // attempts: 1, so a failure is terminal for the job — the sweeper
    // (not a BullMQ retry) owns recovery. Log it loudly.
    if (!stopped)
      d.logger.error("workflow job failed", {
        jobId: (job as { id?: string } | undefined)?.id,
        message: err instanceof Error ? err.message : String(err),
      });
  });

  // Startup sweep covers deploys; the interval covers crashes without a
  // restart (invariant 3: both, not either).
  await runRecoverySweep({ executor, queue, logger: d.logger });
  const sweepTimer = setInterval(() => {
    if (stopped) return;
    void runRecoverySweep({ executor, queue, logger: d.logger });
  }, d.sweeperIntervalMs);
  sweepTimer.unref?.();

  started = true;
  d.logger.info("workflow worker started", {
    queue: WORKFLOW_QUEUE_NAME,
    sweeperIntervalMs: d.sweeperIntervalMs,
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
      clearInterval(sweepTimer);
      await worker.close();
      await queue.close();
      queueConnection.disconnect();
      workerConnection.disconnect();
      await db.$disconnect();
      d.logger.info("workflow worker stopped cleanly");
    },
  };
}
