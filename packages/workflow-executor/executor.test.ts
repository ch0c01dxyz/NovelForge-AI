/**
 * @novelforge/workflow-executor unit tests (NF-WF-004).
 *
 * Dedicated novelforge_test_workflow_executor db. Covers the guarded
 * claim transitions (the no-double-commit mechanism), cancellation, and
 * restart-recovery adoption — the invariants the worker depends on.
 * No test reaches a real provider: `generate` is a controllable fake.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createWorkflowExecutor,
  claimRunForExecution,
  claimStepForExecution,
  resetRunForRecovery,
  isRunCancelled,
  type WorkflowExecutor,
} from "./index.ts";

const TEST_DB = "novelforge_test_workflow_executor";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found");
  }
}
const BASE_URL = process.env.DATABASE_URL!;
const TEST_URL = (() => {
  const u = new URL(BASE_URL);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
})();

let db: NovelForgeDb;
let executor: WorkflowExecutor;
/** How many generate calls have started. */
let generateCalls = 0;

beforeAll(async () => {
  const adminUrl = new URL(BASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
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
  executor = createWorkflowExecutor({
    db,
    audit: { record: async () => {} },
    resolvers: {
      resolveAgent: async () => {
        throw new Error("no agents in unit tests");
      },
      resolveSkill: async () => {
        throw new Error("no skills in unit tests");
      },
    },
    generate: {
      generate: async () => {
        generateCalls += 1;
        return { generationId: crypto.randomUUID(), content: "fake", model: "fake" };
      },
    },
  });
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  generateCalls = 0;
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
});

let seedCounter = 0;

async function seedWorkflow(graph: unknown): Promise<{
  workspaceId: string;
  userId: string;
  workflowId: string;
  versionId: string;
}> {
  seedCounter += 1;
  const tag = `${Date.now()}-${seedCounter}`;
  const user = await db.user.create({
    data: { email: `u-${tag}@x.test`, passwordHash: "x", displayName: "u" },
  });
  const ws = await db.workspace.create({
    data: { name: "ws", slug: `ws-${tag}`, ownerId: user.id },
  });
  const workflow = await db.workflow.create({
    data: {
      scope: "WORKSPACE",
      workspaceId: ws.id,
      key: "wf",
      name: "wf",
      status: "PUBLISHED",
      createdById: user.id,
    },
  });
  const version = await db.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      number: 1,
      graph: graph as never,
      agentKeys: [],
      skillKeys: [],
      createdById: user.id,
    },
  });
  await db.workflow.update({
    where: { id: workflow.id },
    data: { currentVersionId: version.id },
  });
  return { workspaceId: ws.id, userId: user.id, workflowId: workflow.id, versionId: version.id };
}

async function seedRun(
  seed: { workspaceId: string; userId: string; workflowId: string; versionId: string },
  graph: { steps: Array<{ key: string; kind: string }>; edges: Array<unknown> },
  status = "PENDING",
): Promise<string> {
  const run = await db.workflowRun.create({
    data: {
      workflowId: seed.workflowId,
      workflowVersionId: seed.versionId,
      workflowVersionNumber: 1,
      workspaceId: seed.workspaceId,
      triggeredById: seed.userId,
      status: status as never,
      input: {},
    },
    select: { id: true },
  });
  let seq = 0;
  for (const step of graph.steps) {
    seq += 1;
    await db.workflowStepRun.create({
      data: {
        runId: run.id,
        stepKey: step.key,
        sequence: seq,
        kind: step.kind,
        status: "PENDING",
      },
    });
  }
  return run.id;
}

const TWO_TRANSFORMS = {
  steps: [
    { key: "a", kind: "TRANSFORM", inputs: { v: "$input.x" } },
    { key: "b", kind: "TRANSFORM", inputs: { v: "$steps.a.json" } },
  ],
  edges: [{ from: "a", to: "b" }],
};

describe("guarded claims", () => {
  it("claimRunForExecution has exactly one winner", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    const results = await Promise.all([
      claimRunForExecution(db, runId),
      claimRunForExecution(db, runId),
      claimRunForExecution(db, runId),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("RUNNING");
  });

  it("claimRunForExecution fails when the run is not PENDING", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    expect(await claimRunForExecution(db, runId)).toBe(false);
    expect(await claimRunForExecution(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("claimStepForExecution has exactly one winner (no double commit)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    const results = await Promise.all([
      claimStepForExecution(db, runId, "a"),
      claimStepForExecution(db, runId, "a"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("resetRunForRecovery moves RUNNING → PENDING atomically", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    expect(await resetRunForRecovery(db, runId)).toBe(true);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("PENDING");
    // Second reset is a no-op: the row is no longer RUNNING.
    expect(await resetRunForRecovery(db, runId)).toBe(false);
  });

  it("isRunCancelled reflects the row", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    expect(await isRunCancelled(db, runId)).toBe(false);
    await db.workflowRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });
    expect(await isRunCancelled(db, runId)).toBe(true);
  });
});

describe("executeRun", () => {
  it("drives a TRANSFORM chain to SUCCEEDED and records outcomes", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    await db.workflowRun.update({ where: { id: runId }, data: { input: { x: "hello" } } });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.stepCount).toBe(2);
    expect((run.output as Record<string, unknown>)["b"]).toEqual({ v: { v: "hello" } });

    const steps = await db.workflowStepRun.findMany({
      where: { runId },
      orderBy: { sequence: "asc" },
    });
    expect(steps.map((s) => s.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    // Outcomes are stored as envelopes for recovery.
    expect((steps[0]!.output as { text: string }).text).toBe("hello");
  });

  it("exits silently when the run claim is lost", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(false);
    expect(generateCalls).toBe(0);
  });

  it("marks untaken branches SKIPPED (no PENDING row left behind)", async () => {
    const graph = {
      steps: [
        { key: "check", kind: "CONDITION", condition: { path: "$input.go", equals: true } },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
      ],
    };
    const seed = await seedWorkflow(graph);
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { input: { go: false } } });

    await executor.executeRun(runId);
    const steps = await db.workflowStepRun.findMany({ where: { runId } });
    expect(steps.find((s) => s.stepKey === "yes")!.status).toBe("SKIPPED");
    expect(steps.find((s) => s.stepKey === "no")!.status).toBe("SUCCEEDED");
    expect(steps.every((s) => s.status !== "PENDING")).toBe(true);
  });

  it("skips the terminal write when stopped for cancellation", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    // Cancel before the drive: the between-steps check stops the loop.
    await db.workflowRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(false);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "CANCELLED",
    );
  });

  it("adopts already-SUCCEEDED steps on recovery without re-executing", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    // Simulate a crash after step "a": its row is SUCCEEDED with an outcome.
    await db.workflowStepRun.updateMany({
      where: { runId, stepKey: "a" },
      data: {
        status: "SUCCEEDED",
        output: { text: "hello", json: { v: "hello" } },
        completedAt: new Date(),
      },
    });
    // The sweeper's reset comes first (RUNNING → PENDING); only then the
    // worker claims and resumes.
    expect(await resetRunForRecovery(db, runId)).toBe(true);

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    // Step "a" was not re-executed (still one row), step "b" used its outcome.
    expect(await db.workflowStepRun.count({ where: { runId, stepKey: "a" } })).toBe(1);
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect((run.output as Record<string, unknown>)["b"]).toEqual({ v: { v: "hello" } });
    expect(run.stepCount).toBe(2);
  });
});

describe("recoverStaleRuns", () => {
  function fakeQueue(jobs: Map<string, "completed" | "failed" | "waiting">) {
    const added: Array<{ jobId: string }> = [];
    const removed: string[] = [];
    return {
      added,
      removed,
      queue: {
        getJob: async (jobId: string) => {
          const state = jobs.get(jobId);
          if (!state) return null;
          return {
            getState: async () => state,
            remove: async () => {
              removed.push(jobId);
              jobs.delete(jobId);
            },
          };
        },
        add: async (_name: string, _data: unknown, opts: { jobId: string }) => {
          // BullMQ semantics: re-adding an existing jobId is a silent no-op.
          if (jobs.has(opts.jobId)) return { id: opts.jobId };
          jobs.set(opts.jobId, "waiting");
          added.push({ jobId: opts.jobId });
          return { id: opts.jobId };
        },
      },
    };
  }

  it("resets an orphaned RUNNING run and re-enqueues it (dead job removed first)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    // The job died: record retained as failed (attempts: 1).
    const jobs = new Map([[runId, "failed" as const]]);
    const { added, removed, queue } = fakeQueue(jobs);

    const report = await executor.recoverStaleRuns(queue);
    expect(report.resetRuns).toEqual([runId]);
    expect(report.requeuedRuns).toEqual([runId]);
    // F12: the dead record is removed BEFORE re-add, or the re-add no-ops.
    expect(removed).toEqual([runId]);
    expect(added).toEqual([{ jobId: runId }]);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "PENDING",
    );

    // And the recovered run completes.
    const result = await executor.executeRun(runId);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("leaves a RUNNING run with a live job alone", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    const jobs = new Map([[runId, "waiting" as const]]);
    const { added, queue } = fakeQueue(jobs);

    const report = await executor.recoverStaleRuns(queue);
    expect(report.resetRuns).toEqual([]);
    expect(added).toEqual([]);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "RUNNING",
    );
  });

  it("enqueues a PENDING orphan (row without any job record)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "PENDING");
    // Age the row past the 5-minute orphan threshold. Via Prisma (JS
    // Date), not raw SQL: the column is `timestamp without time zone`
    // and the session tz would skew a `now()`-based UPDATE.
    await db.workflowRun.update({
      where: { id: runId },
      data: { startedAt: new Date(Date.now() - 6 * 60_000) },
    });
    const { added, queue } = fakeQueue(new Map());

    const report = await executor.recoverStaleRuns(queue);
    expect(report.orphanEnqueues).toEqual([runId]);
    expect(added).toEqual([{ jobId: runId }]);
  });

  it("does not treat a fresh PENDING run as an orphan", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "PENDING");
    const { added, queue } = fakeQueue(new Map());

    const report = await executor.recoverStaleRuns(queue);
    expect(report.orphanEnqueues).toEqual([]);
    expect(added).toEqual([]);
    expect(runId).toBeTruthy();
  });
});
