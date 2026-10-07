/**
 * Chapter generation/review template (NF-WF-006) integration suite.
 *
 * Dedicated novelforge_test_chapter_template db. Covers the contract's
 * acceptance list: seed-script idempotency, version immutability,
 * end-to-end template run, schema rejection (AGENT contract + VALIDATOR
 * backstop), evidence rejection, bounded correction (both paths, with
 * draft-selection assertions), approval integration through the NF-WF-005
 * routes, and workspace agent shadowing.
 *
 * GAP-028: no production AI path — the gateway is faked per step (the
 * fake answers from the agent's system instructions), and runs are driven
 * through the shared test driver (the same executor the worker runs).
 */
import { execFileSync } from "node:child_process";
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
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";
import {
  ensureChapterTemplate,
  type SeedHttp,
} from "../../../scripts/seed-chapter-template.ts";
import { CHAPTER_GENERATION_REVIEW } from "@novelforge/workflow-templates";

const TEST_DB = "novelforge_test_chapter_template";
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

// ---------------------------------------------------------------------------
// Fake gateway: answers per agent step from the system instructions, so each
// stage's contract can be exercised deterministically. `behavior` is reset
// before each test; `rewriteCalls` distinguishes rewrite_1 from rewrite_2.
// ---------------------------------------------------------------------------
const behavior = {
  needsCorrectionVs: false,
  needsCorrection1: false,
  planOk: true,
  citationsOk: true,
};
let rewriteCalls = 0;
let seenPrompts: Array<{ system: string; user: unknown }> = [];

const PROSE = (tag: string) => `${tag} ` + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8);

function planJson() {
  return behavior.planOk
    ? {
        purpose: "Introduce the oath",
        cast: ["Wren"],
        objectives: ["swear the oath"],
        conflict: "duty vs kin",
        stakes: "the alliance",
        permittedRevelations: ["the oath words"],
        outlineRef: "outline-1",
        sourcePins: { workflowVersion: 1, outlineVersion: "ov-1" },
      }
    : { purpose: "incomplete plan" }; // missing required fields → schema violation
}

function draftJson(tag: string) {
  return { prose: PROSE(tag), title: "Chapter 1" };
}

function findingsJson(needsCorrection: boolean) {
  return {
    findings: needsCorrection
      ? [
          {
            category: "voice",
            severity: "major",
            rule: "POV discipline",
            evidence: { source: "draft", version: "1", span: "paragraph 3" },
            remediation: "keep Wren's POV throughout",
          },
        ]
      : [],
    needsCorrection,
  };
}

function extractionJson() {
  return {
    proposals: [
      {
        kind: "fact",
        text: "Wren swore the oath",
        citations: behavior.citationsOk ? [{ source: "draft", span: "paragraph 1" }] : [],
      },
    ],
  };
}

function fakeCreateGateway(_rec: GatewayRecord): AIGateway {
  return {
    id: _rec.id,
    name: _rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(req) {
      const system = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      const user = typeof req.messages[1]?.content === "string" ? req.messages[1].content : "";
      seenPrompts.push({ system, user: req.messages[1]?.content });
      let payload: unknown;
      if (system.includes("scene planner") || system.includes("WORKSPACE-PLANNER-INSTRUCTIONS"))
        payload = planJson();
      else if (user.includes("revising a draft")) {
        rewriteCalls += 1;
        payload = draftJson(`DRAFT-REWRITE-${rewriteCalls}`);
      } else if (system.includes("chapter writer")) payload = draftJson("DRAFT-WRITE");
      else if (system.includes("voice and style reviewer")) {
        // review_vs and review_1 share the agent AND the instruction; the
        // bound draft content (user message) tells them apart.
        payload = user.includes("DRAFT-REWRITE-1")
          ? findingsJson(behavior.needsCorrection1)
          : findingsJson(behavior.needsCorrectionVs);
      } else if (system.includes("final reviewer")) payload = findingsJson(false);
      else if (system.includes("structured extractor")) payload = extractionJson();
      else payload = {};
      return {
        content: JSON.stringify(payload),
        model: "fake-writer",
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed() {
      return { vectors: [[0.1]], model: "fake", inputTokens: 1 };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

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
let driver: TestDriver;

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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway, workflowQueue: fakeQueue });
  driver = createTestDriver(db, { encryptionKey: ENCRYPTION_KEY, createGateway: fakeCreateGateway });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  behavior.needsCorrectionVs = false;
  behavior.needsCorrection1 = false;
  behavior.planOk = true;
  behavior.citationsOk = true;
  rewriteCalls = 0;
  seenPrompts = [];
  enqueuedJobs.length = 0;
  await db.workflowApprovalDecision.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

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

/** Adapter letting the seed script drive the test app as the super admin. */
function seedHttp(cookie: string): SeedHttp {
  return async (method, url, opts) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      payload: opts?.body as Record<string, unknown> | undefined,
    });
    let body: unknown = null;
    try {
      body = res.json();
    } catch {
      body = null;
    }
    return { status: res.statusCode, body };
  };
}

async function seedTemplate(cookie: string, workspaceId: string) {
  const result = await ensureChapterTemplate(seedHttp(cookie), { cookie, workspaceId });
  expect(result.workflowId).toBeTruthy();
  await seedModelRoutes(cookie);
  return result;
}

let gwCounter = 0;
/**
 * Mirror of definitions.test.ts's seedRoute: register a gateway backed by
 * the fake, sync its (fake) model catalog, and map every capability profile
 * the template uses onto the fake model so AGENT steps resolve.
 */
async function seedModelRoutes(cookie: string) {
  gwCounter += 1;
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie },
    payload: { name: `template-gw-${gwCounter}`, baseUrl: "http://localhost:20128", apiKey: "x" },
  });
  expect(gw.statusCode).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/gateways/${gatewayId}/sync-models`,
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(200);
  const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
  const model = (models.json() as Array<{ id: string; modelId: string }>).find(
    (m) => m.modelId === "fake-writer",
  )!;
  expect(model).toBeTruthy();
  for (const profile of [
    "CREATIVE_WRITER",
    "DEEP_PLANNER",
    "CONTINUITY_REVIEWER",
    "LONG_CONTEXT_REVIEWER",
    "STRUCTURED_EXTRACTOR",
    "FAST_CLASSIFIER",
  ]) {
    const put = await app.inject({
      method: "PUT",
      url: "/api/model-profiles",
      headers: { cookie },
      payload: { profile, modelId: model.id },
    });
    expect(put.statusCode).toBe(200);
  }
}

/** Enqueue a template run and drive it to the HUMAN_APPROVAL park. */
async function runToPark(
  cookie: string,
  workspaceId: string,
  novelId: string,
  workflowId: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    headers: { cookie },
    payload: {
      input: { novelId, chapterNumber: 1, outlineRef: "outline-1" },
      novelId,
    },
  });
  expect(res.statusCode, res.body).toBe(202);
  const { id: runId } = res.json() as { id: string };
  const driven = await driver.driveRun(runId);
  expect(driven.claimed).toBe(true);
  expect(driven.status).toBe("AWAITING_APPROVAL");
  return runId;
}

async function snapshotHash(cookie: string, workspaceId: string, runId: string): Promise<string> {
  const got = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
    headers: { cookie },
  });
  expect(got.statusCode).toBe(200);
  const run = got.json() as {
    steps: Array<{ stepKey: string; approvalSnapshot: { snapshotHash: string } | null }>;
  };
  const step = run.steps.find((s) => s.stepKey === "approve")!;
  expect(step.approvalSnapshot).not.toBeNull();
  return step.approvalSnapshot!.snapshotHash;
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

async function stepStatuses(runId: string): Promise<Map<string, string>> {
  const rows = await db.workflowStepRun.findMany({ where: { runId } });
  return new Map(rows.map((r) => [r.stepKey, r.status]));
}

describe("seed script idempotency", () => {
  it("creates 5 agents + the workflow on first run, no-ops on second run", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId } = await seedWorkspace(admin.userId, "ws-seed");

    const first = await seedTemplate(admin.cookie, workspaceId);
    expect(first.workflowCreated).toBe(true);
    // v1 is created together with the workflow (draft) and then published,
    // so no separate version is created on the first run.
    expect(first.versionCreated).toBe(false);
    expect(first.version).toBe(1);
    expect(first.agentsCreated).toHaveLength(5);

    const agents = await db.agent.findMany({ where: { scope: "PLATFORM" } });
    expect(agents.map((a) => a.key).sort()).toEqual(
      ["chapter-extractor", "chapter-planner", "chapter-writer", "final-reviewer", "voice-style-reviewer"].sort(),
    );
    const wf = await db.workflow.findUniqueOrThrow({ where: { id: first.workflowId } });
    expect(wf.key).toBe("chapter-generation-review");
    expect(wf.scope).toBe("PLATFORM");
    expect(wf.status).toBe("PUBLISHED");
    const versions = await db.workflowVersion.findMany({ where: { workflowId: wf.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.number).toBe(1);
    expect(wf.currentVersionId).toBe(versions[0]!.id);

    // Second run: everything exists and the graph is byte-identical → no-op.
    const second = await seedTemplate(admin.cookie, workspaceId);
    expect(second.workflowId).toBe(first.workflowId);
    expect(second.workflowCreated).toBe(false);
    expect(second.versionCreated).toBe(false);
    expect(second.agentsCreated).toHaveLength(0);
    expect(await db.workflowVersion.count({ where: { workflowId: wf.id } })).toBe(1);
    expect(await db.agent.count({ where: { scope: "PLATFORM" } })).toBe(5);
  });
});

describe("version immutability", () => {
  it("a v2 publish leaves v1 byte-identical; the script publishes v3 when the graph differs", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId } = await seedWorkspace(admin.userId, "ws-ver");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const v1Before = await db.workflowVersion.findFirstOrThrow({
      where: { workflowId: seeded.workflowId, number: 1 },
    });
    const v1GraphBytes = JSON.stringify(v1Before.graph);

    // Publish a changed graph as v2 through the public API.
    const changed = JSON.parse(JSON.stringify(CHAPTER_GENERATION_REVIEW.graph)) as Record<string, unknown>;
    changed.maxSteps = 41;
    const newVer = await app.inject({
      method: "POST",
      url: `/api/workflows/${seeded.workflowId}/versions`,
      headers: { cookie: admin.cookie },
      payload: { graph: changed },
    });
    expect(newVer.statusCode).toBe(200);
    const pub = await app.inject({
      method: "POST",
      url: `/api/workflows/${seeded.workflowId}/publish`,
      headers: { cookie: admin.cookie },
    });
    expect(pub.statusCode).toBe(200);

    // v1's row is byte-identical.
    const v1After = await db.workflowVersion.findFirstOrThrow({
      where: { workflowId: seeded.workflowId, number: 1 },
    });
    expect(JSON.stringify(v1After.graph)).toBe(v1GraphBytes);

    // The template graph now differs from the current version → the script
    // publishes a NEW version (v3); v1 and v2 are untouched.
    const reseeded = await seedTemplate(admin.cookie, workspaceId);
    expect(reseeded.versionCreated).toBe(true);
    expect(reseeded.version).toBe(3);
    const versions = await db.workflowVersion.findMany({
      where: { workflowId: seeded.workflowId },
      orderBy: { number: "asc" },
    });
    expect(versions).toHaveLength(3);
    expect(JSON.stringify(versions[0]!.graph)).toBe(v1GraphBytes);
    expect((versions[1]!.graph as { maxSteps: number }).maxSteps).toBe(41);
    const template = JSON.parse(JSON.stringify(CHAPTER_GENERATION_REVIEW.graph));
    expect(versions[2]!.graph).toEqual(template);
  });

  it("a run enqueued before a v2 publish pins v1", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-pin");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    // Enqueue run 1 while v1 is current (no need to drive it).
    const r1 = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(r1.statusCode).toBe(202);
    const run1Id = (r1.json() as { id: string }).id;

    // Publish v2.
    const changed = JSON.parse(JSON.stringify(CHAPTER_GENERATION_REVIEW.graph)) as Record<string, unknown>;
    changed.maxSteps = 41;
    const newVer = await app.inject({
      method: "POST",
      url: `/api/workflows/${seeded.workflowId}/versions`,
      headers: { cookie: admin.cookie },
      payload: { graph: changed },
    });
    expect(newVer.statusCode).toBe(200);
    const pub = await app.inject({
      method: "POST",
      url: `/api/workflows/${seeded.workflowId}/publish`,
      headers: { cookie: admin.cookie },
    });
    expect(pub.statusCode).toBe(200);

    const run1 = await db.workflowRun.findUniqueOrThrow({ where: { id: run1Id } });
    expect(run1.workflowVersionNumber).toBe(1);

    const r2 = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(r2.statusCode).toBe(202);
    const run2 = await db.workflowRun.findUniqueOrThrow({
      where: { id: (r2.json() as { id: string }).id },
    });
    expect(run2.workflowVersionNumber).toBe(2);
  });
});

describe("end-to-end template run", () => {
  it("succeeds through approval with every stage row and the rewrite chain skipped", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-e2e");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const runId = await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const statuses = await stepStatuses(runId);
    const succeeded = [
      "compile_context", "plan", "validate_plan", "write", "validate_draft",
      "review_vs", "validate_vs", "review_final", "validate_final",
      "extract", "validate_extract",
    ];
    for (const key of succeeded) {
      expect(statuses.get(key), key).toBe("SUCCEEDED");
    }
    // The CONDITION steps evaluate (SUCCEEDED); the rewrite chain on the
    // untaken branch was skipped (needsCorrection=false everywhere).
    expect(statuses.get("correct_1")).toBe("SUCCEEDED");
    // correct_2 is downstream of the untaken branch, so it never evaluates.
    expect(statuses.get("correct_2")).toBe("SKIPPED");
    for (const key of ["rewrite_1", "validate_rewrite_1", "review_1", "validate_review_1", "rewrite_2", "validate_rewrite_2"]) {
      expect(statuses.get(key), key).toBe("SKIPPED");
    }
    expect(statuses.get("approve")).toBe("AWAITING_APPROVAL");

    // The approval snapshot covers the parked draft and proposals.
    const hash = await snapshotHash(admin.cookie, workspaceId, runId);
    const approveRow = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "approve" } });
    const snapshot = approveRow.approvalSnapshot as {
      snapshotHash: string;
      material: { priorOutcomes: Record<string, unknown> };
    };
    expect(snapshot.snapshotHash).toBe(hash);
    expect(Object.keys(snapshot.material.priorOutcomes)).toContain("write");
    expect(Object.keys(snapshot.material.priorOutcomes)).toContain("extract");

    // Approve → drive → SUCCEEDED.
    const approved = await decide(admin.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: hash,
    });
    expect(approved.statusCode).toBe(200);
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("SUCCEEDED");
    expect((await stepStatuses(runId)).get("approve")).toBe("SUCCEEDED");
  });

  it("binds run inputs as values: the planner and writer receive chapterNumber/outlineRef", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-inputs");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);

    // The bound inputs render as ## sections with real values — not the
    // literal "$input.chapterNumber" placeholder string.
    const plannerPrompt = seenPrompts.find((p) => p.system.includes("scene planner"))!;
    expect(plannerPrompt, "planner prompt seen").toBeDefined();
    const plannerUser = String(plannerPrompt.user);
    expect(plannerUser).toContain("## chapterNumber\n1");
    expect(plannerUser).toContain("## outlineRef\noutline-1");
    expect(plannerUser).not.toContain("$input.chapterNumber");
    expect(plannerUser).not.toContain("$input.outlineRef");

    const writerPrompt = seenPrompts.find((p) => p.system.includes("chapter writer"))!;
    expect(writerPrompt, "writer prompt seen").toBeDefined();
    const writerUser = String(writerPrompt.user);
    expect(writerUser).toContain("## chapterNumber\n1");
    expect(writerUser).toContain("## outlineRef\noutline-1");
    expect(writerUser).not.toContain("$input.chapterNumber");
    expect(writerUser).not.toContain("$input.outlineRef");
  });

  it("rejects at approval → the run FAILS with the reason", async () => {    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-reject");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const runId = await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);
    const hash = await snapshotHash(admin.cookie, workspaceId, runId);

    const rejected = await decide(admin.cookie, workspaceId, runId, "reject", {
      expectedSnapshotHash: hash,
      reason: "the draft contradicts the outline",
    });
    expect(rejected.statusCode).toBe(200);
    expect((rejected.json() as { status: string }).status).toBe("FAILED");

    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("FAILED");
    expect(run.errorMessage).toContain("the draft contradicts the outline");
    expect((await stepStatuses(runId)).get("approve")).toBe("FAILED");
  });
});

describe("schema rejection", () => {
  it("an invalid plan fails the run at the AGENT contract; nothing downstream runs", async () => {
    behavior.planOk = false; // fake returns a plan missing required fields
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-schem");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(res.statusCode).toBe(202);
    const runId = (res.json() as { id: string }).id;
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("FAILED");

    const statuses = await stepStatuses(runId);
    expect(statuses.get("plan")).toBe("FAILED");
    // The VALIDATOR and everything downstream never executed.
    expect(statuses.get("validate_plan")).toBe("PENDING");
    expect(statuses.get("write")).toBe("PENDING");
    const planRow = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "plan" } });
    expect(planRow.errorMessage).toContain("contract");
  });

  it("a VALIDATOR re-checks a bad prior outcome (defense in depth): validate_plan fails with the rejection detail", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-valbad");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(res.statusCode).toBe(202);
    const runId = (res.json() as { id: string }).id;

    // Simulate a plan outcome that slipped past the AGENT contract (invalid
    // per plan-schema): the VALIDATOR must still catch it.
    await db.workflowStepRun.updateMany({
      where: { runId, stepKey: "plan" },
      data: {
        status: "SUCCEEDED",
        output: {
          text: '{"purpose":"incomplete"}',
          json: { purpose: "incomplete" },
          model: "fake",
          tokensIn: 1,
          tokensOut: 1,
        },
        completedAt: new Date(),
      },
    });

    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("FAILED");

    const statuses = await stepStatuses(runId);
    expect(statuses.get("plan")).toBe("SUCCEEDED");
    expect(statuses.get("validate_plan")).toBe("FAILED");
    expect(statuses.get("write")).toBe("PENDING");
    const vRow = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "validate_plan" } });
    const detail = (vRow.output as { json: { valid: boolean; detail: string } }).json.detail;
    expect(detail).toContain("sourcePins");
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.errorMessage).toContain('validator step "validate_plan" rejected its input');
  });
});

describe("evidence rejection", () => {
  it("citationless proposals fail the run at the extract contract; approval never parks", async () => {
    behavior.citationsOk = false;
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-evid");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(res.statusCode).toBe(202);
    const runId = (res.json() as { id: string }).id;
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("FAILED");

    const statuses = await stepStatuses(runId);
    expect(statuses.get("extract")).toBe("FAILED");
    expect(statuses.get("approve")).toBe("PENDING");
    const extractRow = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "extract" } });
    expect(extractRow.errorMessage).toContain("citations");
  });

  it("validate_extract names the offending proposal when a bad extract outcome slips past", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-evidv");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${seeded.workflowId}/run`,
      headers: { cookie: admin.cookie },
      payload: { input: { novelId, chapterNumber: 1, outlineRef: "outline-1" }, novelId },
    });
    expect(res.statusCode).toBe(202);
    const runId = (res.json() as { id: string }).id;

    // Simulate an extract outcome with a citationless proposal reaching the
    // VALIDATOR directly.
    const badExtract = {
      proposals: [{ kind: "fact", text: "Wren swore the oath", citations: [] }],
    };
    await db.workflowStepRun.updateMany({
      where: { runId, stepKey: "extract" },
      data: {
        status: "SUCCEEDED",
        output: { text: JSON.stringify(badExtract), json: badExtract, model: "fake", tokensIn: 1, tokensOut: 1 },
        completedAt: new Date(),
      },
    });

    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("FAILED");
    const statuses = await stepStatuses(runId);
    expect(statuses.get("validate_extract")).toBe("FAILED");
    expect(statuses.get("approve")).toBe("PENDING");
    const vRow = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "validate_extract" } });
    const detail = (vRow.output as { json: { valid: boolean; detail: string } }).json.detail;
    expect(detail).toContain("citations");
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.errorMessage).toContain('validator step "validate_extract" rejected its input');
  });
});

describe("bounded correction", () => {
  it("needsCorrection=true twice → exactly 2 rewrites, then review_final on rewrite_2's content", async () => {
    behavior.needsCorrectionVs = true;
    behavior.needsCorrection1 = true;
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-corr2");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const runId = await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);
    const statuses = await stepStatuses(runId);

    // Both correction passes executed: no third rewrite exists in the graph,
    // so exactly two rewrites ran.
    for (const key of [
      "correct_1", "rewrite_1", "validate_rewrite_1", "review_1", "validate_review_1",
      "correct_2", "rewrite_2", "validate_rewrite_2",
    ]) {
      expect(statuses.get(key), key).toBe("SUCCEEDED");
    }
    expect(rewriteCalls).toBe(2);

    // review_final received the SECOND rewrite's content (draft precedence).
    const finalPrompt = seenPrompts.find((p) => p.system.includes("final reviewer"))!;
    expect(String(finalPrompt.user)).toContain("DRAFT-REWRITE-2");

    // Approve → SUCCEEDED.
    const hash = await snapshotHash(admin.cookie, workspaceId, runId);
    const approved = await decide(admin.cookie, workspaceId, runId, "approve", {
      expectedSnapshotHash: hash,
    });
    expect(approved.statusCode).toBe(200);
    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("SUCCEEDED");
  });

  it("needsCorrection=false at review_vs → rewrite stages SKIPPED, review_final got write's content", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-corr0");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    const runId = await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);
    const statuses = await stepStatuses(runId);
    expect(statuses.get("correct_1")).toBe("SUCCEEDED");
    expect(statuses.get("correct_2")).toBe("SKIPPED");
    for (const key of ["rewrite_1", "validate_rewrite_1", "review_1", "validate_review_1", "rewrite_2", "validate_rewrite_2"]) {
      expect(statuses.get(key), key).toBe("SKIPPED");
    }
    // The final reviewer saw the ORIGINAL draft (write's content).
    const finalPrompt = seenPrompts.find((p) => p.system.includes("final reviewer"))!;
    expect(String(finalPrompt.user)).toContain("DRAFT-WRITE");
    expect(String(finalPrompt.user)).not.toContain("DRAFT-REWRITE");
  });
});

describe("workspace agent shadowing", () => {
  it("a workspace agent with the same key wins over the platform agent", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-shadow");
    const seeded = await seedTemplate(admin.cookie, workspaceId);

    // Workspace-scoped agent shadowing chapter-planner.
    const created = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: admin.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "chapter-planner",
        name: "Workspace planner",
        kind: "DEEP_PLANNER",
        instructions: "WORKSPACE-PLANNER-INSTRUCTIONS: plan like a local.",
        modelProfile: "DEEP_PLANNER",
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: wsAgentId } = created.json() as { id: string };
    const pub = await app.inject({
      method: "POST",
      url: `/api/agents/${wsAgentId}/publish`,
      headers: { cookie: admin.cookie },
    });
    expect(pub.statusCode).toBe(200);

    await runToPark(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const plannerPrompt = seenPrompts.find((p) => p.system.includes("WORKSPACE-PLANNER-INSTRUCTIONS"))!;
    expect(plannerPrompt).toBeTruthy();
    // The platform agent's instructions were not used for this workspace run.
    expect(String(plannerPrompt.system)).not.toContain("scene planner");
  });
});


