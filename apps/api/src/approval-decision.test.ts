/**
 * Approval decision and safe continuation (NF-WF-005) integration suite.
 *
 * Dedicated novelforge_test_approval db. Covers the contract's acceptance
 * list: approve happy path with a LIVE resumed job (not just "add was
 * called"), reject, stale-snapshot refusal, snapshotless rows, duplicate
 * decisions, sequential approvals, authorization, validation, restart-safe
 * continuation via sweeper (b), resume cursor exactness, the cancel race,
 * and the migration's re-runnability + unique backstop.
 *
 * Unlike definitions.test.ts (fake queue), this suite builds the app with
 * a REAL BullMQ queue so the resumed job's liveness is asserted against
 * Redis (`queue.getJob(runId)` → waiting). Steps are deterministic
 * TRANSFORM/HUMAN_APPROVAL kinds — no production AI path (GAP-028).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import {
  createWorkflowQueue,
  type WorkflowQueue,
} from "./services/workflow-queue.ts";
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";
import {
  createWorkflowExecutor,
  type RecoveryQueuePort,
} from "@novelforge/workflow-executor";

const TEST_DB = "novelforge_test_approval";
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

/** Never called: all steps here are deterministic. */
function fakeCreateGateway(_rec: GatewayRecord): AIGateway {
  throw new Error("no gateway in approval tests");
}

let db: NovelForgeDb;
let app: FastifyInstance;
let driver: TestDriver;
/** The REAL queue the app enqueues through (BullMQ against localhost Redis). */
let realQueue: WorkflowQueue;
/**
 * Wrapper the app actually uses: delegates to the real queue, but tests
 * can arm a one-shot add() failure to simulate a post-commit enqueue crash
 * (restart-safe continuation acceptance).
 */
let failNextAdd = false;
const appQueue: WorkflowQueue = {
  add: async (name, data, opts) => {
    if (failNextAdd) {
      failNextAdd = false;
      throw new Error("simulated post-commit enqueue failure");
    }
    return realQueue.add(name, data, opts);
  },
  getJob: (jobId) => realQueue.getJob(jobId),
  close: async () => {},
};

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
  realQueue = createWorkflowQueue(env.REDIS_URL);
  app = await buildApp(env, { db, createGateway: fakeCreateGateway, workflowQueue: appQueue });
  driver = createTestDriver(db, { encryptionKey: ENCRYPTION_KEY, createGateway: fakeCreateGateway });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await realQueue?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  failNextAdd = false;
  await db.workflowApprovalDecision.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(
  email: string,
): Promise<{ userId: string; cookie: string }> {
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
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" as never } });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function addMember(workspaceId: string, role: string) {
  const u = await seedUser(`${role.toLowerCase()}-${Date.now()}@x.test`);
  await db.membership.create({
    data: { workspaceId, userId: u.userId, role: role as never },
  });
  return u;
}

async function makeWorkflow(
  cookie: string,
  workspaceId: string,
  key: string,
  graph: unknown,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { cookie },
    payload: { scope: "WORKSPACE", workspaceId, key, name: key, graph },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const pub = await app.inject({
    method: "POST",
    url: `/api/workflows/${id}/publish`,
    headers: { cookie },
  });
  expect(pub.statusCode).toBe(200);
  return id;
}

const approvalGraph = (instruction = "Approve the draft") => ({
  steps: [
    { key: "draft", kind: "TRANSFORM", inputs: { v: "$input.x" } },
    { key: "review", kind: "HUMAN_APPROVAL", instruction },
    { key: "final", kind: "TRANSFORM", inputs: { v: "$steps.draft.json" } },
  ],
  edges: [
    { from: "draft", to: "review" },
    { from: "review", to: "final" },
  ],
});

interface ParkedRun {
  runId: string;
  snapshotHash: string;
  stepId: string;
}

/** Enqueue, drive to the HUMAN_APPROVAL park, and read the snapshot back. */
async function parkRun(
  cookie: string,
  workspaceId: string,
  workflowId: string,
): Promise<ParkedRun> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    headers: { cookie },
    payload: { input: { x: "hello" } },
  });
  expect(res.statusCode).toBe(202);
  const { id: runId } = res.json() as { id: string };

  const driven = await driver.driveRun(runId);
  expect(driven.claimed).toBe(true);
  expect(driven.status).toBe("AWAITING_APPROVAL");

  const got = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
    headers: { cookie },
  });
  expect(got.statusCode).toBe(200);
  const run = got.json() as {
    status: string;
    steps: Array<{ stepKey: string; id?: string; approvalSnapshot: { snapshotHash: string } | null }>;
  };
  expect(run.status).toBe("AWAITING_APPROVAL");
  const step = run.steps.find((s) => s.stepKey === "review")!;
  expect(step.approvalSnapshot).not.toBeNull();
  const stepRow = await db.workflowStepRun.findFirstOrThrow({
    where: { runId, stepKey: "review" },
    select: { id: true },
  });
  return { runId, snapshotHash: step.approvalSnapshot!.snapshotHash, stepId: stepRow.id };
}

async function decide(
  cookie: string,
  workspaceId: string,
  runId: string,
  decision: "approve" | "reject",
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/${decision}`,
    headers: { cookie },
    payload: body,
  });
}

describe("approve happy path", () => {
  it("resumes the same run with a LIVE job; the decision is recorded once and audited", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "appr", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const res = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
      reason: "looks good",
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("PENDING");

    // Exactly one decision row, bound to the snapshot.
    const decisions = await db.workflowApprovalDecision.findMany({ where: { runId } });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe("APPROVED");
    expect(decisions[0]!.snapshotHash).toBe(snapshotHash);
    expect(decisions[0]!.stepKey).toBe("review");
    expect(decisions[0]!.reason).toBe("looks good");

    // The parked step is SUCCEEDED with the decision summary — not re-parked.
    const stepRow = await db.workflowStepRun.findFirstOrThrow({
      where: { runId, stepKey: "review" },
    });
    expect(stepRow.status).toBe("SUCCEEDED");

    // The resumed job is actually LIVE in Redis — not just "add was called".
    // (A retained completed record would make re-add() a silent no-op; the
    // decide path removes the old record first.)
    const job = await realQueue.getJob(runId);
    expect(job).toBeDefined();
    const liveJob = job as unknown as { getState(): Promise<string> };
    expect(await liveJob.getState()).toBe("waiting");

    // Audit: one workflow.run_approved with the binding.
    const audits = await db.auditLog.findMany({
      where: { entityId: runId, action: "workflow.run_approved" },
    });
    expect(audits).toHaveLength(1);
    expect((audits[0]!.payload as { snapshotHash: string }).snapshotHash).toBe(snapshotHash);

    // Drive the resumed run to completion as the worker would.
    const driven = await driver.driveRun(runId);
    expect(driven.claimed).toBe(true);
    expect(driven.status).toBe("SUCCEEDED");
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.completedAt).not.toBeNull();
  });

  it("resume cursor exactness: pre-approval steps are not re-executed, post-approval runs once", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "appr2", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const draftBefore = await db.workflowStepRun.findFirstOrThrow({
      where: { runId, stepKey: "draft" },
    });

    await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("SUCCEEDED");

    const steps = await db.workflowStepRun.findMany({ where: { runId } });
    // Pre-approval: same single row, untouched (not re-executed).
    const draftAfter = steps.filter((s) => s.stepKey === "draft");
    expect(draftAfter).toHaveLength(1);
    expect(draftAfter[0]!.completedAt?.getTime()).toBe(draftBefore.completedAt?.getTime());
    // The decided approval step: one row, SUCCEEDED, never re-parked.
    const reviewAfter = steps.filter((s) => s.stepKey === "review");
    expect(reviewAfter).toHaveLength(1);
    expect(reviewAfter[0]!.status).toBe("SUCCEEDED");
    // Post-approval: exactly one SUCCEEDED row.
    const finalAfter = steps.filter((s) => s.stepKey === "final");
    expect(finalAfter).toHaveLength(1);
    expect(finalAfter[0]!.status).toBe("SUCCEEDED");
  });
});

describe("reject", () => {
  it("fails the run with the reason recorded; nothing resumes", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "rej", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const res = await decide(owner.cookie, workspaceId, runId, "reject", {
      expectedSnapshotHash: snapshotHash,
      reason: "the draft contradicts chapter 3",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; errorMessage: string; completedAt: string };
    expect(body.status).toBe("FAILED");
    expect(body.errorMessage).toContain("the draft contradicts chapter 3");
    expect(body.completedAt).not.toBeNull();

    const stepRow = await db.workflowStepRun.findFirstOrThrow({
      where: { runId, stepKey: "review" },
    });
    expect(stepRow.status).toBe("FAILED");
    expect(stepRow.errorMessage).toContain("the draft contradicts chapter 3");

    const decisions = await db.workflowApprovalDecision.findMany({ where: { runId } });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe("REJECTED");

    // No resume: a drive attempt loses the claim on the terminal run.
    const driven = await driver.driveRun(runId);
    expect(driven.claimed).toBe(false);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("FAILED");

    const audits = await db.auditLog.findMany({
      where: { entityId: runId, action: "workflow.run_rejected" },
    });
    expect(audits).toHaveLength(1);
  });
});

describe("stale and snapshotless", () => {
  it("refuses a decision minted against old material (409 STALE_APPROVAL), then accepts the fresh hash", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "stale", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const bad = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: "0".repeat(64),
    });
    expect(bad.statusCode).toBe(409);
    expect((bad.json() as { code: string }).code).toBe("STALE_APPROVAL");

    // No state change: still parked, no decision row.
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "AWAITING_APPROVAL",
    );
    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(0);

    // The fresh hash resumes normally.
    const good = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(good.statusCode).toBe(200);
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("SUCCEEDED");
  });

  it("refuses to decide a pre-NF-WF-005 parked row with no snapshot (409 NO_APPROVAL_SNAPSHOT)", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "nosnap", approvalGraph());

    // Seed the pre-NF-WF-005 shape directly: parked, but approvalSnapshot NULL.
    const version = await db.workflowVersion.findFirstOrThrow({ where: { workflowId } });
    const run = await db.workflowRun.create({
      data: {
        workflowId,
        workflowVersionId: version.id,
        workflowVersionNumber: version.number,
        workspaceId,
        triggeredById: owner.userId,
        status: "AWAITING_APPROVAL",
        input: {},
      },
      select: { id: true },
    });
    await db.workflowStepRun.create({
      data: {
        runId: run.id,
        stepKey: "review",
        sequence: 1,
        kind: "HUMAN_APPROVAL",
        status: "AWAITING_APPROVAL",
        instruction: "Approve",
        approvalSnapshot: undefined,
      },
    });

    const res = await decide(owner.cookie, workspaceId, run.id, "approve", {
      expectedSnapshotHash: "a".repeat(64),
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("NO_APPROVAL_SNAPSHOT");
    // Untouched: still parked, no decision row, never backfilled.
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      "AWAITING_APPROVAL",
    );
    expect(await db.workflowApprovalDecision.count({ where: { runId: run.id } })).toBe(0);
    const stepRow = await db.workflowStepRun.findFirstOrThrow({
      where: { runId: run.id, stepKey: "review" },
    });
    expect(stepRow.approvalSnapshot).toBeNull();
  });
});

describe("duplicate decisions", () => {
  it("second approve → 409 ALREADY_DECIDED; exactly one decision row; no second enqueue", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "dup", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const first = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(first.statusCode).toBe(200);
    const jobAfterFirst = await realQueue.getJob(runId);
    const firstTimestamp = (jobAfterFirst as unknown as { timestamp: number }).timestamp;

    const second = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { code: string }).code).toBe("ALREADY_DECIDED");

    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(1);
    // No second enqueue: the live job is still the first decision's job.
    const jobAfterSecond = await realQueue.getJob(runId);
    expect((jobAfterSecond as unknown as { timestamp: number }).timestamp).toBe(firstTimestamp);
  });

  it("decision unique backstop: a duplicate (runId, stepKey) insert is rejected", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "uniq", approvalGraph());
    const { runId, snapshotHash, stepId } = await parkRun(owner.cookie, workspaceId, workflowId);
    await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });

    await expect(
      db.workflowApprovalDecision.create({
        data: {
          runId,
          stepRunId: stepId,
          stepKey: "review",
          decision: "APPROVED",
          snapshotHash,
          pins: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(1);
  });
});

describe("sequential approvals", () => {
  it("two HUMAN_APPROVAL steps: decide → resume → park → decide → completes, each bound to its own snapshot", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const graph = {
      steps: [
        { key: "draft", kind: "TRANSFORM", inputs: { v: "$input.x" } },
        { key: "check1", kind: "HUMAN_APPROVAL", instruction: "First check" },
        { key: "check2", kind: "HUMAN_APPROVAL", instruction: "Second check" },
        { key: "final", kind: "TRANSFORM", inputs: { v: "$steps.draft.json" } },
      ],
      edges: [
        { from: "draft", to: "check1" },
        { from: "check1", to: "check2" },
        { from: "check2", to: "final" },
      ],
    };
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "seq", graph);

    const runRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { input: { x: "hello" } },
    });
    expect(runRes.statusCode).toBe(202);
    const runId = (runRes.json() as { id: string }).id;

    async function snapshotHashFor(stepKey: string): Promise<string> {
      const got = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
        headers: { cookie: owner.cookie },
      });
      expect(got.statusCode).toBe(200);
      const step = (got.json() as { steps: Array<{ stepKey: string; approvalSnapshot: { snapshotHash: string } | null }> }).steps.find(
        (s) => s.stepKey === stepKey,
      )!;
      return step.approvalSnapshot!.snapshotHash;
    }

    // First park → decide → resume.
    let driven = await driver.driveRun(runId);
    expect(driven.status).toBe("AWAITING_APPROVAL");
    const hash1 = await snapshotHashFor("check1");
    expect((await decide(owner.cookie, workspaceId, runId, "approve", { expectedSnapshotHash: hash1 })).statusCode).toBe(200);

    // Resumed run parks at the second approval.
    driven = await driver.driveRun(runId);
    expect(driven.status).toBe("AWAITING_APPROVAL");
    const hash2 = await snapshotHashFor("check2");
    expect(hash2).not.toBe(hash1);
    expect((await decide(owner.cookie, workspaceId, runId, "approve", { expectedSnapshotHash: hash2 })).statusCode).toBe(200);

    driven = await driver.driveRun(runId);
    expect(driven.status).toBe("SUCCEEDED");

    const decisions = await db.workflowApprovalDecision.findMany({
      where: { runId },
    });
    expect(decisions).toHaveLength(2);
    const byKey = new Map(decisions.map((d) => [d.stepKey, d]));
    expect(byKey.get("check1")!.snapshotHash).toBe(hash1);
    expect(byKey.get("check2")!.snapshotHash).toBe(hash2);
  });
});

describe("authorization", () => {
  it("EDITOR and VIEWER → 403; run untouched", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const editor = await addMember(workspaceId, "EDITOR");
    const viewer = await addMember(workspaceId, "VIEWER");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "authz", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    for (const member of [editor, viewer]) {
      const res = await decide(member.cookie, workspaceId, runId, "approve", {
        expectedSnapshotHash: snapshotHash,
      });
      expect(res.statusCode).toBe(403);
    }
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "AWAITING_APPROVAL",
    );
    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(0);
  });

  it("non-member → 404", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const stranger = await seedUser("stranger@example.com");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "authz2", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const res = await decide(stranger.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("validation", () => {
  it("400s on missing hash, malformed hash, missing reject reason, malformed uuids", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "val", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    expect(
      (await decide(owner.cookie, workspaceId, runId, "approve", {})).statusCode,
    ).toBe(400);
    expect(
      (await decide(owner.cookie, workspaceId, runId, "approve", { expectedSnapshotHash: "xyz" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await decide(owner.cookie, workspaceId, runId, "reject", {
          expectedSnapshotHash: snapshotHash,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/workspaces/not-a-uuid/workflow-runs/${runId}/approve`,
          headers: { cookie: owner.cookie },
          payload: { expectedSnapshotHash: snapshotHash },
        })
      ).statusCode,
    ).toBe(400);
    // Untouched by all the 400s.
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "AWAITING_APPROVAL",
    );
  });
});

describe("cancel race", () => {
  it("cancel wins → decide gives 409 RUN_CANCELLED (distinct from ALREADY_DECIDED)", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "race1", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(cancelled.statusCode).toBe(200);

    const res = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("RUN_CANCELLED");
    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(0);
  });

  it("decide-then-cancel follows the normal path", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "race2", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    const approved = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(approved.statusCode).toBe(200);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as { status: string }).status).toBe("CANCELLED");
  });
});

describe("restart-safe continuation", () => {
  it("approve commits, enqueue throws → PENDING with no job; sweeper (b) re-enqueues → completes", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "rst", approvalGraph());
    const { runId, snapshotHash } = await parkRun(owner.cookie, workspaceId, workflowId);

    // Simulate the crash: the decide transaction commits, then the
    // post-commit enqueue throws.
    failNextAdd = true;
    const res = await decide(owner.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: snapshotHash,
    });
    expect(res.statusCode).toBe(500);

    // The decision IS persisted (commit happened before the throw)...
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("PENDING");
    expect(await db.workflowApprovalDecision.count({ where: { runId } })).toBe(1);
    // ...but no job record exists: the decide path removed the old one and
    // the re-add threw.
    expect(await realQueue.getJob(runId)).toBeUndefined();

    // Age the run past the PENDING-orphan window and invoke sweeper (b),
    // exactly as NF-WF-004's recovery does.
    await db.workflowRun.update({
      where: { id: runId },
      data: { startedAt: new Date(Date.now() - 6 * 60_000) },
    });
    const sweeper = createWorkflowExecutor({
      db,
      audit: { record: async () => {} },
      resolvers: {
        resolveAgent: async () => {
          throw new Error("no agents in approval tests");
        },
        resolveSkill: async () => {
          throw new Error("no skills in approval tests");
        },
      },
    });
    const queuePort: RecoveryQueuePort = {
      getJob: async (jobId) => {
        const job = await realQueue.getJob(jobId);
        if (!job) return null;
        const full = job as unknown as { getState(): Promise<string> };
        return { getState: () => full.getState(), remove: () => job.remove() };
      },
      add: (name, data, opts) => realQueue.add(name, data as Record<string, unknown>, opts),
    };
    const report = await sweeper.recoverStaleRuns(queuePort);
    expect(report.orphanEnqueues).toEqual([runId]);

    // The re-enqueued job is live; drive it to completion.
    const requeued = await realQueue.getJob(runId);
    expect(
      await (requeued as unknown as { getState(): Promise<string> }).getState(),
    ).toBe("waiting");
    const driven = await driver.driveRun(runId);
    expect(driven.claimed).toBe(true);
    expect(driven.status).toBe("SUCCEEDED");
  });
});

describe("migration", () => {
  it("the NF-WF-005 migration SQL re-applies cleanly (GAP-018)", async () => {
    const sql = readFileSync(
      path.join(DB_PACKAGE_ROOT, "prisma", "migrations", "20261005_nf_wf_005_approval_decision", "migration.sql"),
      "utf8",
    );
    const admin = new pg.Client({ connectionString: withDb(BASE_URL, TEST_DB) });
    await admin.connect();
    // Statement-level re-runnability: running the whole file again must not throw.
    await admin.query(sql);
    const tables = await admin.query(
      `SELECT tablename FROM pg_tables WHERE tablename = 'workflow_approval_decisions'`,
    );
    expect(tables.rows).toHaveLength(1);
    const cols = await admin.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'workflow_step_runs' AND column_name = 'approval_snapshot'`,
    );
    expect(cols.rows).toHaveLength(1);
    await admin.end();
  });
});
