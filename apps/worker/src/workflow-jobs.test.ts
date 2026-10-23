/**
 * @novelforge/worker — workflow job handler tests (NF-WF-004).
 *
 * Unit tests use a fake executor/queue (the executor core is covered in
 * `@novelforge/workflow-executor`). The integration test at the bottom
 * runs a real BullMQ Queue + Worker against localhost Redis with the real
 * executor on a scratch DB — the "run reaches SUCCEEDED via the worker
 * (not the request thread)" path.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import {
  createWorkflowExecutor,
  WORKFLOW_QUEUE_NAME,
  type WorkflowExecutor,
} from "@novelforge/workflow-executor";
import {
  createWorkflowJobHandler,
  runRecoverySweep,
  startWorkflowWorkerApp,
} from "./workflow-jobs.ts";
import type { WorkerLogger } from "./worker.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

function testLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies WorkerLogger as WorkerLogger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function fakeExecutor(overrides: Partial<WorkflowExecutor> = {}): WorkflowExecutor & {
  executeRun: ReturnType<typeof vi.fn>;
  recoverStaleRuns: ReturnType<typeof vi.fn>;
} {
  return {
    executeRun: vi.fn(async (_runId: string) => ({ claimed: true as const, runId: _runId })),
    recoverStaleRuns: vi.fn(async () => ({ resetRuns: [], requeuedRuns: [], orphanEnqueues: [] })),
    ...overrides,
  } as unknown as WorkflowExecutor & {
    executeRun: ReturnType<typeof vi.fn>;
    recoverStaleRuns: ReturnType<typeof vi.fn>;
  };
}

describe("createWorkflowJobHandler", () => {
  it("drives the run id from the job data through the executor", async () => {
    const logger = testLogger();
    const executor = fakeExecutor();
    const handler = createWorkflowJobHandler({ executor, logger });

    await handler({ id: "job-1", data: { runId: "run-1" } });

    expect(executor.executeRun).toHaveBeenCalledWith("run-1");
    expect(logger.info).toHaveBeenCalledWith(
      "workflow run finished",
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("falls back to the BullMQ job id when the payload has no runId", async () => {
    const logger = testLogger();
    const executor = fakeExecutor();
    const handler = createWorkflowJobHandler({ executor, logger });

    await handler({ id: "run-2", data: {} as never });

    expect(executor.executeRun).toHaveBeenCalledWith("run-2");
  });

  it("exits silently (logs, no throw) when the run claim is lost", async () => {
    const logger = testLogger();
    const executor = fakeExecutor({
      executeRun: vi.fn(async (runId: string) => ({ claimed: false as const, runId })),
    });
    const handler = createWorkflowJobHandler({ executor, logger });

    await expect(handler({ id: "j", data: { runId: "run-3" } })).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      "workflow run claim lost; another driver owns it",
      { runId: "run-3" },
    );
  });

  it("logs and rethrows when the executor throws (job goes failed)", async () => {
    const logger = testLogger();
    const executor = fakeExecutor({
      executeRun: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const handler = createWorkflowJobHandler({ executor, logger });

    await expect(handler({ id: "j", data: { runId: "run-4" } })).rejects.toThrow("db down");
    expect(logger.error).toHaveBeenCalledWith(
      "workflow run handler threw",
      expect.objectContaining({ runId: "run-4" }),
    );
  });

  it("drops a job with no run id and no job id", async () => {
    const logger = testLogger();
    const executor = fakeExecutor();
    const handler = createWorkflowJobHandler({ executor, logger });

    await handler({ data: {} as never });
    expect(executor.executeRun).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "workflow job has no run id; dropping",
      expect.anything(),
    );
  });
});

describe("runRecoverySweep", () => {
  it("runs the executor's sweep and logs when it recovers runs", async () => {
    const logger = testLogger();
    const executor = fakeExecutor({
      recoverStaleRuns: vi.fn(async () => ({
        resetRuns: ["r1"],
        requeuedRuns: ["r1"],
        orphanEnqueues: [],
      })),
    });
    const queue = { getJob: vi.fn(), add: vi.fn() };

    const report = await runRecoverySweep({ executor, queue, logger });
    expect(report.resetRuns).toEqual(["r1"]);
    expect(logger.info).toHaveBeenCalledWith(
      "workflow recovery sweep recovered stale runs",
      expect.objectContaining({ reset: 1, requeued: 1 }),
    );
  });

  it("stays quiet when there is nothing to recover", async () => {
    const logger = testLogger();
    const executor = fakeExecutor();
    const queue = { getJob: vi.fn(), add: vi.fn() };

    await runRecoverySweep({ executor, queue, logger });
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("startWorkflowWorkerApp — fakes", () => {
  it("starts the worker, sweeps at startup, and stops cleanly", async () => {
    const logger = testLogger();
    const executor = fakeExecutor();
    const queue = {
      getJob: vi.fn(async () => null),
      add: vi.fn(async () => ({})),
      close: vi.fn(async () => {}),
    };
    const worker = { close: vi.fn(async () => {}), on: vi.fn() };
    let processor: ((job: unknown) => Promise<void>) | null = null;

    const app = await startWorkflowWorkerApp(
      { DATABASE_URL: "postgres://x", REDIS_URL: "redis://localhost:6379", APP_ENCRYPTION_KEY: "test" },
      logger,
      {
        createDb: () => ({ $disconnect: vi.fn(async () => {}) }) as unknown as NovelForgeDb,
        createExecutor: () => executor,
        createDiscovery: () => ({ discoverRun: vi.fn(async () => null) }),
        createConnection: () =>
          ({
            ping: vi.fn(async () => "PONG"),
            quit: vi.fn(async () => "OK" as const),
            disconnect: vi.fn(),
            on: vi.fn(function (this: unknown) {
              return this;
            }),
          }) as never,
        createQueue: () => queue as never,
        createWorker: (_name, p) => {
          processor = p as (job: unknown) => Promise<void>;
          return worker as never;
        },
        probeTimeoutMs: 50,
        sweeperIntervalMs: 60_000,
      },
    );

    expect(app.started).toBe(true);
    expect(executor.recoverStaleRuns).toHaveBeenCalledTimes(1);
    expect(processor).not.toBeNull();

    // The processor is the job handler: drive it and see the executor called.
    await processor!({ id: "j", data: { runId: "r-9" } });
    expect(executor.executeRun).toHaveBeenCalledWith("r-9");

    await app.stop();
    expect(app.stopped).toBe(true);
    expect(worker.close).toHaveBeenCalledTimes(2);
    expect(queue.close).toHaveBeenCalledTimes(2);
  });

  it("degrades gracefully when redis is unavailable", async () => {
    const logger = testLogger();
    const app = await startWorkflowWorkerApp(
      { DATABASE_URL: "postgres://x", REDIS_URL: "redis://localhost:6379", APP_ENCRYPTION_KEY: "test" },
      logger,
      {
        createDb: () => ({ $disconnect: vi.fn(async () => {}) }) as unknown as NovelForgeDb,
        createConnection: () =>
          ({
            ping: vi.fn(async () => {
              throw new Error("ECONNREFUSED");
            }),
            quit: vi.fn(async () => "OK" as const),
            disconnect: vi.fn(),
            on: vi.fn(function (this: unknown) {
              return this;
            }),
          }) as never,
        probeTimeoutMs: 50,
      },
    );

    expect(app.started).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "redis unavailable; workflow worker not started",
      expect.anything(),
    );
    await app.stop();
  });
});

// ---------------------------------------------------------------------------
// Integration: real BullMQ Queue + Worker, real executor, scratch DB.
// ---------------------------------------------------------------------------

const IT_DB = "novelforge_test_worker_jobs";
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found");
  }
}
const IT_URL = (() => {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${IT_DB}`;
  return u.toString();
})();

const itRedis = process.env.WORKER_IT_REDIS_URL ?? "redis://localhost:6379";
const itPrefix = `nf-worker-jobs-it-${process.pid}-${Date.now()}`;

describe("integration — real BullMQ + real executor", () => {
  let db: NovelForgeDb;
  let queue: Queue;
  let worker: Worker | null = null;

  beforeAll(async () => {
    const { default: pg } = await import("pg");
    const adminUrl = new URL(process.env.DATABASE_URL!);
    adminUrl.pathname = "/postgres";
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [IT_DB],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${IT_DB}`);
    await admin.query(`CREATE DATABASE ${IT_DB}`);
    await admin.end();
    execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      stdio: "pipe",
      cwd: DB_PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: IT_URL },
    });
    db = createDb(IT_URL);

    const connection = new IORedis(itRedis, { maxRetriesPerRequest: null });
    queue = new Queue(WORKFLOW_QUEUE_NAME, {
      prefix: itPrefix,
      connection: connection as never,
      defaultJobOptions: { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }, 120_000);

  afterAll(async () => {
    await worker?.close();
    await queue?.obliterate();
    await queue?.close();
    await db?.$disconnect();
  });

  it("a run enqueued on the real queue reaches SUCCEEDED via the worker", async () => {
    // Seed: workspace + workflow + PENDING run (as the API's enqueueRun would).
    const user = await db.user.create({
      data: { email: "w@example.com", passwordHash: "x", displayName: "w" },
    });
    const ws = await db.workspace.create({
      data: { name: "ws", slug: "ws-it", ownerId: user.id },
    });
    const workflow = await db.workflow.create({
      data: {
        scope: "WORKSPACE",
        workspaceId: ws.id,
        key: "it",
        name: "it",
        status: "PUBLISHED",
        createdById: user.id,
      },
    });
    const version = await db.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        number: 1,
        graph: {
          steps: [{ key: "a", kind: "TRANSFORM", inputs: { v: "$input.x" } }],
          edges: [],
        } as never,
        agentKeys: [],
        skillKeys: [],
        createdById: user.id,
      },
    });
    const run = await db.workflowRun.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: version.id,
        workflowVersionNumber: 1,
        workspaceId: ws.id,
        triggeredById: user.id,
        status: "PENDING",
        input: { x: "it-works" },
      },
      select: { id: true },
    });
    await db.workflowStepRun.create({
      data: { runId: run.id, stepKey: "a", sequence: 1, kind: "TRANSFORM", status: "PENDING" },
    });

    const executor = createWorkflowExecutor({
      db,
      audit: { record: async () => {} },
      resolvers: {
        resolveAgent: async () => {
          throw new Error("no agents");
        },
        resolveSkill: async () => {
          throw new Error("no skills");
        },
      },
    });
    const logger = testLogger();
    const handler = createWorkflowJobHandler({ executor, logger });

    const workerConnection = new IORedis(itRedis, { maxRetriesPerRequest: null });
    worker = new Worker(WORKFLOW_QUEUE_NAME, handler as never, {
      prefix: itPrefix,
      connection: workerConnection as never,
    });
    await worker.waitUntilReady();

    await queue.add("workflow-run", { runId: run.id }, { jobId: run.id });

    // Wait for the run to reach a terminal state.
    const deadline = Date.now() + 20_000;
    let status: string | null = null;
    while (Date.now() < deadline) {
      const row = await db.workflowRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      status = row?.status ?? null;
      if (status === "SUCCEEDED" || status === "FAILED") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(status).toBe("SUCCEEDED");

    const step = await db.workflowStepRun.findFirstOrThrow({
      where: { runId: run.id, stepKey: "a" },
    });
    expect(step.status).toBe("SUCCEEDED");
    expect((step.output as { text: string }).text).toBe("it-works");
  }, 30_000);
});
