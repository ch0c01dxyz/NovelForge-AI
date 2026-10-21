/**
 * Agent / skill / workflow platform (Phase 4) integration suite.
 *
 * Dedicated novelforge_test_phase4 db. No test reaches a real provider:
 * the gateway adapter is faked through `BuildAppOptions.createGateway`, so
 * agent steps exercise the REAL Phase 3 generation path (routing, retries,
 * the generation ledger) end to end.
 *
 * Covers the roadmap Phase 4 exit criterion — "chapter test workflow can
 * run multiple agents deterministically" — plus the invariants in
 * CLAUDE.md §3/§11/§19 and SECURITY.md (explicit allowlists, prompt
 * injection boundary, tenant isolation).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import {
  GatewayError,
  classifyStatus,
  messageFor,
  type AIGateway,
  type GatewayRecord,
  type GenerateResult,
} from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import { createWorkflowExecutor, createDbDefinitionResolvers } from "@novelforge/workflow-executor";
import type { WorkflowQueue } from "./services/workflow-queue.ts";
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";

const TEST_DB = "novelforge_test_phase4";
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

/** Prompts the fake provider actually received, for prompt-assembly assertions. */
let seenPrompts: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];

/**
 * When set, the fake gateway throws instead of answering. Lets a test drive
 * the executor's failure path — in particular that a provider failure is
 * reported to the client with its classified message rather than a generic
 * string, and that nothing internal leaks.
 */
let gatewayFailure: { status: number } | null = null;

/**
 * Fake gateway. Returns `content` from the behaviour map keyed by gateway
 * name; records every request so tests can assert what the executor sent.
 */
function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(req): Promise<GenerateResult> {
      seenPrompts.push({ model: req.model, messages: req.messages });
      const content =
        typeof req.messages[req.messages.length - 1]?.content === "string"
          ? (req.messages[req.messages.length - 1]!.content as string)
          : "";
      // Echo a JSON object when the instruction visibly asks for JSON, so
      // structured-output contracts can be exercised without a real model.
      const wantsJson = /respond with json/i.test(content);
      if (gatewayFailure) {
        // Mirrors OmniRouteGateway.fail(): the category is classified and the
        // message comes from `messageFor`, which never echoes the response
        // body (the real adapter drains and discards it for exactly that
        // reason). A fake that threw the raw body would be testing a
        // situation the transport cannot produce.
        const category = classifyStatus(gatewayFailure.status);
        throw new GatewayError(
          category,
          messageFor(category, gatewayFailure.status),
          gatewayFailure.status,
        );
      }
      return {
        content: wantsJson
          ? JSON.stringify({ summary: "ok", beats: ["a", "b"] })
          : `step output for: ${content.slice(0, 40)}`,
        model: "fake-writer",
        inputTokens: 5,
        outputTokens: 9,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed() {
      return { vectors: [[0.1]], model: "fake-writer", inputTokens: 1 };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;
let driver: TestDriver;
/**
 * Fake queue for the run route: records enqueues without touching Redis.
 * The worker suite covers the real BullMQ path.
 */
const enqueuedJobs: Array<{
  name: string;
  data: Record<string, unknown>;
  opts: { jobId: string };
}> = [];
const fakeQueue: WorkflowQueue = {
  add: async (name, data, opts) => {
    enqueuedJobs.push({ name, data, opts });
    return { id: opts.jobId };
  },
  getJob: async () => undefined,
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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway, workflowQueue: fakeQueue });
  driver = createTestDriver(db, { encryptionKey: ENCRYPTION_KEY, createGateway: fakeCreateGateway });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  seenPrompts = [];
  gatewayFailure = null;
  enqueuedJobs.length = 0;
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.modelProfileMapping.deleteMany();
  await db.aIModel.deleteMany();
  await db.aIGateway.deleteMany();
  await db.auditLog.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
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

async function seedWorkspace(ownerId: string, slug: string, role = "OWNER") {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: role as never } });
  // Through the production path, not a raw row: `createNovel` is where C8's
  // baseline branch/revision lives, so a raw insert would seed a novel the
  // product cannot produce (no head) and every covered mutation would 409.
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

/**
 * Route a model to a profile so agent steps have somewhere to go.
 *
 * Gateway and model administration is platform-only (ADR-0005), so this
 * seeds its own SUPER_ADMIN rather than reusing the workspace cookie.
 */
async function seedRoute() {
  const platformAdmin = await seedUser("platform-admin@example.com", "SUPER_ADMIN");
  const cookie = platformAdmin.cookie;
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie },
    payload: {
      name: "phase4-gw",
      baseUrl: "http://localhost:20128",
      apiKey: "sk-secret-phase4",
    },
  });
  expect(gw.statusCode).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (await app.inject({ method: "POST", url: `/api/gateways/${gatewayId}/sync-models`, headers: { cookie } }))
      .statusCode,
  ).toBe(200);
  const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
  const model = (models.json() as Array<{ id: string; modelId: string }>).find(
    (m) => m.modelId === "fake-writer",
  )!;
  for (const profile of [
    "CREATIVE_WRITER",
    "DEEP_PLANNER",
    "CONTINUITY_REVIEWER",
    "FAST_CLASSIFIER",
    "STRUCTURED_EXTRACTOR",
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

/** Create + publish an agent through the API. */
async function makeAgent(
  cookie: string,
  workspaceId: string,
  key: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers: { cookie },
    payload: {
      scope: "WORKSPACE",
      workspaceId,
      key,
      name: key,
      instructions: `You are ${key}.`,
      modelProfile: "CREATIVE_WRITER",
      ...extra,
    },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const pub = await app.inject({
    method: "POST",
    url: `/api/agents/${id}/publish`,
    headers: { cookie },
  });
  expect(pub.statusCode).toBe(200);
  return id;
}

async function makeSkill(
  cookie: string,
  workspaceId: string,
  key: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/skills",
    headers: { cookie },
    payload: {
      scope: "WORKSPACE",
      workspaceId,
      key,
      name: key,
      instructions: `Perform ${key}.`,
      modelProfile: "STRUCTURED_EXTRACTOR",
      ...extra,
    },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const pub = await app.inject({
    method: "POST",
    url: `/api/skills/${id}/publish`,
    headers: { cookie },
  });
  expect(pub.statusCode).toBe(200);
  return id;
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

// ---------------------------------------------------------------------------
// NF-WF-004 helpers: the run route now enqueues (202) instead of executing.
// Tests drive the run through the shared executor — the same code the
// worker runs — then read the result back through the route.
// ---------------------------------------------------------------------------

/** POST the run route; expect 202; return the run id and status URL. */
async function postRun(
  cookie: string,
  workspaceId: string,
  workflowId: string,
  payload: Record<string, unknown> = {},
): Promise<{ runId: string; statusUrl: string; statusCode: number }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    headers: { cookie },
    payload,
  });
  expect(res.statusCode).toBe(202);
  const body = res.json() as { id: string; statusUrl: string };
  expect(typeof body.statusUrl).toBe("string");
  return { runId: body.id, statusUrl: body.statusUrl, statusCode: res.statusCode };
}

/** Drive one run to its terminal state through the executor, as the worker would. */
async function driveRun(runId: string) {
  const result = await driver.driveRun(runId);
  expect(result.claimed).toBe(true);
  return result;
}

/** GET the single-run status URL through the route. */
async function getRun(cookie: string, workspaceId: string, runId: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    id: string;
    status: string;
    stepCount: number;
    output: Record<string, unknown>;
    errorMessage: string | null;
    completedAt: string | null;
    steps: Array<{
      approvalSnapshot: { snapshotHash: string } | null;
      stepKey: string;
      sequence: number;
      status: string;
      agentKey: string | null;
      agentVersionNumber: number | null;
      skillKey: string | null;
      skillVersionNumber: number | null;
      generationId: string | null;
      output: unknown;
      errorMessage: string | null;
    }>;
  };
}

/** Enqueue, drive to completion, and return the run as the route serves it. */
async function runToCompletion(
  cookie: string,
  workspaceId: string,
  workflowId: string,
  payload: Record<string, unknown> = {},
) {
  const { runId } = await postRun(cookie, workspaceId, workflowId, payload);
  await driveRun(runId);
  return getRun(cookie, workspaceId, runId);
}

// A three-agent chapter pipeline, mirroring the first steps of the
// CHAPTER-GENERATION pipeline in docs/07-workflows/CORE-WORKFLOWS.md.
const CHAPTER_PIPELINE = {
  steps: [
    { key: "plan", kind: "AGENT", ref: "scene-planner", instruction: "Plan the scene." },
    {
      key: "write",
      kind: "AGENT",
      ref: "chapter-writer",
      instruction: "Write the scene.",
      inputs: { plan: "$steps.plan.text" },
    },
    {
      key: "review",
      kind: "AGENT",
      ref: "continuity-guardian",
      instruction: "Check continuity.",
      inputs: { draft: "$steps.write.text" },
    },
  ],
  edges: [
    { from: "plan", to: "write" },
    { from: "write", to: "review" },
  ],
  maxSteps: 20,
};

describe("Phase 4 — definitions", () => {
  it("previews scoped routing and persists request/step choices through approval and idempotency", async () => {
    const owner = await seedUser("request-models@example.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "request-models");
    await seedRoute();
    const automatic = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    const writer = await db.aIModel.create({ data: { gatewayId: automatic.gatewayId, modelId: "request-writer", capabilities: ["chat"] } });
    const extractor = await db.aIModel.create({ data: { gatewayId: automatic.gatewayId, modelId: "request-extractor", capabilities: ["chat"] } });
    await db.modelProfileMapping.create({ data: { profile: "CREATIVE_WRITER", modelRef: writer.id, priority: 999 } });
    await db.modelProfileMapping.create({ data: { profile: "STRUCTURED_EXTRACTOR", modelRef: extractor.id, priority: 999 } });
    await makeAgent(owner.cookie, workspaceId, "request-writer-agent", { preferredModelRef: automatic.id });
    await makeSkill(owner.cookie, workspaceId, "request-extractor-skill", { preferredModelRef: automatic.id });
    const graph = { steps: [{ key: "write", kind: "AGENT", ref: "request-writer-agent", instruction: "Write" }, { key: "approval", kind: "HUMAN_APPROVAL" }, { key: "extract", kind: "SKILL", ref: "request-extractor-skill", instruction: "Extract" }], edges: [{ from: "write", to: "approval" }, { from: "approval", to: "extract" }], maxSteps: 3 };
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "requested-models", graph);
    const base = `/api/workspaces/${workspaceId}/workflows/${workflowId}`;
    const previewResponse = await app.inject({ method: "GET", url: `${base}/model-preferences?novelId=${novelId}`, headers: { cookie: owner.cookie } });
    expect(previewResponse.statusCode, previewResponse.body).toBe(200);
    const preview = previewResponse.json();
    expect(preview.steps.map((step: { profile: string }) => step.profile)).toEqual(["CREATIVE_WRITER", "STRUCTURED_EXTRACTOR"]);
    const choices = { preferredModelRef: writer.id, stepModelRefs: { extract: extractor.id } };
    const payload = { novelId, idempotencyKey: "requested-models", expectedModelPreferenceFingerprint: preview.fingerprint, ...choices, input: { requestedModelPreferences: { preferredModelRef: automatic.id } } };
    const queued = await app.inject({ method: "POST", url: `${base}/run`, headers: { cookie: owner.cookie }, payload });expect(queued.statusCode, queued.body).toBe(202);
    const runId = queued.json().id;
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).requestedModelPreferences).toEqual(choices);
    await db.workflowRun.update({ where: { id: runId }, data: { startedAt: new Date(Date.now() - 900_000) } });
    const recovery = createWorkflowExecutor({ db, audit: createAuditService(db), resolvers: createDbDefinitionResolvers(db) });
    const recovered = await recovery.recoverStaleRuns({ getJob: async () => undefined, add: async () => {} });
    expect(recovered.orphanEnqueues).toContain(runId);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).requestedModelPreferences).toEqual(choices);
    expect((await driveRun(runId)).status).toBe("AWAITING_APPROVAL");
    const parked = await getRun(owner.cookie, workspaceId, runId);
    const snapshot = parked.steps.find(step => step.stepKey === "approval")!.approvalSnapshot!;
    const decision = await app.inject({ method: "POST", url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/approve`, headers: { cookie: owner.cookie }, payload: { expectedSnapshotHash: snapshot.snapshotHash, reason: "Fixture approval only" } });expect(decision.statusCode).toBe(200);
    expect((await driveRun(runId)).status).toBe("SUCCEEDED");
    expect(seenPrompts.map(prompt => prompt.model)).toEqual(["request-writer", "request-extractor"]);
    const retry = await app.inject({ method: "POST", url: `${base}/run`, headers: { cookie: owner.cookie }, payload: { ...payload, preferredModelRef: automatic.id, expectedModelPreferenceFingerprint: "0".repeat(64) } });
    expect(retry.statusCode).toBe(200);expect(retry.json().id).toBe(runId);expect(retry.json().requestedModelPreferences).toEqual(choices);
  });
  it("binds previews to tenant/novel/default/definition versions and refuses stale enqueue without a row", async () => {
    const fixture = await queuedFixture();
    const { owner, workspaceId, workflowId, agentId } = fixture;
    const firstNovel = await db.novel.findFirstOrThrow({ where: { workspaceId } });
    const otherNovel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ actorUserId: owner.userId, workspaceId, title: "Other preview", slug: "other-preview" });
    const base = `/api/workspaces/${workspaceId}/workflows/${workflowId}`;
    const preview = (novelId: string, cookie = owner.cookie) => app.inject({ method: "GET", url: `${base}/model-preferences?novelId=${novelId}`, headers: { cookie } });
    const first = await preview(firstNovel.id), other = await preview(otherNovel.id);
    expect(first.statusCode).toBe(200);expect(other.statusCode).toBe(200);
    expect(first.json().fingerprint).not.toBe(other.json().fingerprint);
    const stranger = await seedUser("preview-stranger@example.test");
    expect((await preview(firstNovel.id, stranger.cookie)).statusCode).toBe(404);
    await db.membership.create({ data: { workspaceId, userId: stranger.userId, role: "VIEWER" } });
    expect((await preview(firstNovel.id, stranger.cookie)).statusCode).toBe(403);
    const count = await db.workflowRun.count(), jobs = enqueuedJobs.length;
    const refuse = async (fingerprint: string) => {
      const response = await app.inject({ method: "POST", url: `${base}/run`, headers: { cookie: owner.cookie }, payload: { novelId: firstNovel.id, expectedModelPreferenceFingerprint: fingerprint } });
      expect(response.statusCode).toBe(409);expect(await db.workflowRun.count()).toBe(count);expect(enqueuedJobs).toHaveLength(jobs);
    };
    await db.novelModelDefaultsVersion.create({ data: { novelId: firstNovel.id, number: 1, actorUserId: owner.userId, reason: "New routing configuration" } });
    await refuse(first.json().fingerprint);
    const afterDefaults = await preview(firstNovel.id);
    expect((await app.inject({ method: "POST", url: `/api/agents/${agentId}/versions`, headers: { cookie: owner.cookie }, payload: { instructions: "New preview definition", modelProfile: "CREATIVE_WRITER" } })).statusCode).toBe(200);
    await refuse(afterDefaults.json().fingerprint);
  });
  it.each(["unknown-step", "deterministic-step", "malformed-uuid", "unavailable", "bad-stored", "legacy"])("refuses unsafe request choices or preserves legacy (%s)", async mode => {
    const fixture = await queuedFixture();
    const { owner, workspaceId } = fixture;
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "negative-preferences", { steps: [{ key: "write", kind: "AGENT", ref: "queued-writer", instruction: "Write" }, { key: "approval", kind: "HUMAN_APPROVAL" }], edges: [{ from: "write", to: "approval" }], maxSteps: 2 });
    const model = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    if (mode === "bad-stored" || mode === "legacy") {
      if (mode === "legacy") await db.$executeRaw`UPDATE workflow_runs SET requested_model_preferences = NULL WHERE id = ${fixture.runId}::uuid`;
      else await db.workflowRun.update({ where: { id: fixture.runId }, data: { requestedModelPreferences: { stepModelRefs: { missing: model.id } } } });
      expect((await driveRun(fixture.runId)).status).toBe(mode === "legacy" ? "SUCCEEDED" : "FAILED");
      expect(seenPrompts).toHaveLength(mode === "legacy" ? 1 : 0);return;
    }
    const payload = mode === "malformed-uuid" ? { preferredModelRef: "provider/model" }
      : mode === "unavailable" ? { preferredModelRef: "00000000-0000-4000-8000-000000000999" }
      : { stepModelRefs: { [mode === "unknown-step" ? "missing" : "approval"]: model.id } };
    const count = await db.workflowRun.count();
    const response = await app.inject({ method: "POST", url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`, headers: { cookie: owner.cookie }, payload });
    if (mode === "unavailable") {
      expect(response.statusCode).toBe(202);expect((await driveRun(response.json().id)).status).toBe("FAILED");
    } else {
      expect(response.statusCode).toBe(mode === "malformed-uuid" ? 400 : 409);expect(await db.workflowRun.count()).toBe(count);
    }
    expect(seenPrompts).toHaveLength(0);
  });
  it.each(["configured", "absent", "legacy", "foreign", "disabled"])("pins novel defaults at enqueue (%s)", async mode => {
    const owner = await seedUser("novel-default-pin@example.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "novel-default-pin");
    await seedRoute();
    const automatic = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    const selected = await db.aIModel.create({ data: { gatewayId: automatic.gatewayId, modelId: "novel-selected", capabilities: ["chat"] } });
    await db.modelProfileMapping.create({ data: { profile: "CREATIVE_WRITER", modelRef: selected.id, priority: 999 } });
    const config = { novelId, number: 1, generationModelRef: selected.id, analysisModelRef: null, actorUserId: owner.userId, reason: "Scratch routing default" };
    const original = mode === "absent" ? null : await db.novelModelDefaultsVersion.create({ data: config });
    await makeAgent(owner.cookie, workspaceId, "default-writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "default-workflow", { steps: [{ key: "write", kind: "AGENT", ref: "default-writer", instruction: "Write", usageComponent: "CHAPTER" }], edges: [], maxSteps: 1 });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, { novelId, runInput: { novelModelDefaultsVersionId: "untrusted", modelDefaultsPinnedAt: null } });
    const pin = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(pin.modelDefaultsPinnedAt).not.toBeNull();
    expect(pin.novelModelDefaultsVersionId).toBe(original?.id ?? null);
    await db.novelModelDefaultsVersion.create({ data: { ...config, number: original ? 2 : 1, generationModelRef: automatic.id } });
    if (mode === "legacy") await db.workflowRun.update({ where: { id: runId }, data: { modelDefaultsPinnedAt: null, novelModelDefaultsVersionId: null } });
    if (mode === "foreign") {
      const other = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ actorUserId: owner.userId, workspaceId, title: "Other", slug: "other" });
      const foreign = await db.novelModelDefaultsVersion.create({ data: { ...config, novelId: other.id } });
      await db.workflowRun.update({ where: { id: runId }, data: { novelModelDefaultsVersionId: foreign.id } });
    }
    if (mode === "disabled") await db.modelProfileMapping.update({ where: { profile_modelRef: { profile: "CREATIVE_WRITER", modelRef: selected.id } }, data: { enabled: false } });
    const result = await driveRun(runId);
    if (mode === "foreign" || mode === "disabled") {
      expect(result.status).toBe("FAILED");expect(seenPrompts).toHaveLength(0);
    } else {
      expect(result.status).toBe("SUCCEEDED");expect(seenPrompts.map(prompt => prompt.model)).toEqual([mode === "configured" ? "novel-selected" : "fake-writer"]);
      const generation = await db.generation.findFirstOrThrow({ where: { novelId } });
      expect(generation.contextSnapshot).toMatchObject({ routing: { novelModelDefaultsVersionId: mode === "configured" ? original!.id : null } });
    }
    if (original && mode !== "foreign" && mode !== "legacy") await expect(db.novelModelDefaultsVersion.delete({ where: { id: original.id } })).rejects.toMatchObject({ code: "P2003" });
  });
  async function queuedFixture() {
    const owner = await seedUser("queued-fixture@example.test");
    const { workspaceId } = await seedWorkspace(owner.userId, "queued-fixture");
    await seedRoute();
    const skillId = await makeSkill(owner.cookie, workspaceId, "queued-grant", { instructions: "QUEUED_GRANT", modelProfile: "CREATIVE_WRITER" });
    const agentId = await makeAgent(owner.cookie, workspaceId, "queued-writer", { instructions: "QUEUED_AGENT", skillKeys: ["queued-grant"] });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "queued-workflow", { steps: [{ key: "write", kind: "AGENT", ref: "queued-writer", instruction: "Write" }], edges: [], maxSteps: 1 });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, { idempotencyKey: "queued-proof", runInput: { definitionsPinnedAt: null, definitionPins: [] } });
    return { owner, workspaceId, skillId, agentId, workflowId, runId };
  }

  it.each(["missing", "foreign"])("fails closed for %s enqueue pins without model calls", async damage => {
    const fixture = await queuedFixture();
    if (damage === "missing") await db.workflowRunDefinitionPin.deleteMany({ where: { runId: fixture.runId, kind: "SKILL" } });
    else {
      const foreign = await seedUser("foreign-pin@example.test");
      const workspace = await seedWorkspace(foreign.userId, "foreign-pin");
      const foreignId = await makeAgent(foreign.cookie, workspace.workspaceId, "queued-writer");
      const version = await db.agentVersion.findFirstOrThrow({ where: { agentId: foreignId } });
      await db.workflowRunDefinitionPin.updateMany({ where: { runId: fixture.runId, kind: "AGENT" }, data: { agentVersionId: version.id } });
    }
    expect((await driveRun(fixture.runId)).status).toBe("FAILED");
    expect(seenPrompts).toHaveLength(0);
    expect(await db.generation.count()).toBe(0);
  });

  it("retains direct and granted version dependencies through database constraints", async () => {
    const fixture = await queuedFixture();
    const agent = await db.agentVersion.findFirstOrThrow({ where: { agentId: fixture.agentId } });
    const skill = await db.skillVersion.findFirstOrThrow({ where: { skillId: fixture.skillId } });
    await expect(db.agentVersion.delete({ where: { id: agent.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.skillVersion.delete({ where: { id: skill.id } })).rejects.toMatchObject({ code: "P2003" });
    expect(await db.workflowRunDefinitionPin.count({ where: { runId: fixture.runId } })).toBe(2);
    expect((await driveRun(fixture.runId)).status).toBe("SUCCEEDED");
  });

  it("rolls back the run and pending steps if writing its definition pins fails", async () => {
    const fixture = await queuedFixture();
    const jobsBefore = enqueuedJobs.length;
    await db.$executeRawUnsafe(`CREATE FUNCTION test_enqueue_pin_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test pin refusal'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_enqueue_pin_failure BEFORE INSERT ON workflow_run_definition_pins FOR EACH ROW EXECUTE FUNCTION test_enqueue_pin_failure()`);
    try {
      const response = await app.inject({ method: "POST", url: `/api/workspaces/${fixture.workspaceId}/workflows/${fixture.workflowId}/run`, headers: { cookie: fixture.owner.cookie }, payload: { idempotencyKey: "pin-write-refusal" } });
      expect(response.statusCode).toBe(500);
      expect(await db.workflowRun.count({ where: { workflowId: fixture.workflowId } })).toBe(1);
      expect(await db.workflowStepRun.count({ where: { run: { workflowId: fixture.workflowId } } })).toBe(1);
      expect(await db.workflowRunDefinitionPin.count({ where: { runId: fixture.runId } })).toBe(2);
      expect(enqueuedJobs).toHaveLength(jobsBefore);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER test_enqueue_pin_failure ON workflow_run_definition_pins`);
      await db.$executeRawUnsafe(`DROP FUNCTION test_enqueue_pin_failure()`);
    }
  });

  it("returns idempotent pinned runs after definitions are archived without recapturing", async () => {
    const fixture = await queuedFixture();
    const before = await db.workflowRunDefinitionPin.findMany({ where: { runId: fixture.runId }, orderBy: { kind: "asc" } });
    await db.agent.update({ where: { id: fixture.agentId }, data: { status: "ARCHIVED" } });
    await db.workflow.update({ where: { id: fixture.workflowId }, data: { status: "ARCHIVED" } });
    const response = await app.inject({ method: "POST", url: `/api/workspaces/${fixture.workspaceId}/workflows/${fixture.workflowId}/run`, headers: { cookie: fixture.owner.cookie }, payload: { idempotencyKey: "queued-proof" } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().id).toBe(fixture.runId);
    expect(await db.workflowRunDefinitionPin.findMany({ where: { runId: fixture.runId }, orderBy: { kind: "asc" } })).toEqual(before);
    expect((await driveRun(fixture.runId)).status).toBe("SUCCEEDED");
    const stranger = await seedUser("stranger-pin@example.test");
    expect((await app.inject({ method: "POST", url: `/api/workspaces/${fixture.workspaceId}/workflows/${fixture.workflowId}/run`, headers: { cookie: stranger.cookie }, payload: { idempotencyKey: "queued-proof" } })).statusCode).toBe(404);
  });

  it("preserves explicit legacy resolution without manufacturing past pins", async () => {
    const fixture = await queuedFixture();
    await db.workflowRunDefinitionPin.deleteMany({ where: { runId: fixture.runId } });
    await db.workflowRun.update({ where: { id: fixture.runId }, data: { definitionsPinnedAt: null } });
    expect((await app.inject({ method: "POST", url: `/api/agents/${fixture.agentId}/versions`, headers: { cookie: fixture.owner.cookie }, payload: { instructions: "LEGACY_CURRENT", modelProfile: "CREATIVE_WRITER" } })).statusCode).toBe(200);
    expect((await driveRun(fixture.runId)).status).toBe("SUCCEEDED");
    expect(seenPrompts[0]!.messages[0]!.content).toContain("LEGACY_CURRENT");
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: fixture.runId } })).definitionsPinnedAt).toBeNull();
    expect(await db.workflowRunDefinitionPin.count({ where: { runId: fixture.runId } })).toBe(0);
  });

  it("recovers an orphaned pending run with its original pin identities", async () => {
    const fixture = await queuedFixture();
    const before = await db.workflowRunDefinitionPin.findMany({ where: { runId: fixture.runId }, orderBy: { kind: "asc" } });
    await db.workflowRun.update({ where: { id: fixture.runId }, data: { startedAt: new Date(Date.now() - 3_600_000) } });
    const jobs: unknown[] = [];
    const { createWorkflowExecutor, createDbDefinitionResolvers } = await import("@novelforge/workflow-executor");
    const recovery = createWorkflowExecutor({ db, audit: createAuditService(db), resolvers: createDbDefinitionResolvers(db) });
    const report = await recovery.recoverStaleRuns({ getJob: async () => undefined, add: async (_name, data) => { jobs.push(data); } });
    expect(report.orphanEnqueues).toContain(fixture.runId);
    expect(jobs[0]).toMatchObject({ runId: fixture.runId });
    expect(await db.workflowRunDefinitionPin.findMany({ where: { runId: fixture.runId }, orderBy: { kind: "asc" } })).toEqual(before);
    expect((await driveRun(fixture.runId)).status).toBe("SUCCEEDED");
  });
  it("retains enqueue-time definitions and model choices across edits and approval resume", async () => {
    const owner = await seedUser("pinned-owner@example.test");
    const { workspaceId } = await seedWorkspace(owner.userId, "pinned");
    await seedRoute();
    const original = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    const later = await db.aIModel.create({ data: { gatewayId: original.gatewayId, modelId: "later-writer", capabilities: ["chat"] } });
    await db.modelProfileMapping.create({ data: { modelRef: later.id, profile: "CREATIVE_WRITER", priority: 999 } });
    const granted = await makeSkill(owner.cookie, workspaceId, "granted", { instructions: "PINNED_GRANTED", modelProfile: "CREATIVE_WRITER" });
    const action = await makeSkill(owner.cookie, workspaceId, "action", { instructions: "PINNED_ACTION", modelProfile: "CREATIVE_WRITER", preferredModelRef: later.id });
    const agent = await makeAgent(owner.cookie, workspaceId, "pinned", { instructions: "PINNED_AGENT", skillKeys: ["granted"], preferredModelRef: original.id });
    const graph = { steps: [{ key: "draft", kind: "AGENT", ref: "pinned", instruction: "Write" }, { key: "approve", kind: "HUMAN_APPROVAL", instruction: "Review fixture" }, { key: "action", kind: "SKILL", ref: "action", instruction: "Write" }], edges: [{ from: "draft", to: "approve" }, { from: "approve", to: "action" }], maxSteps: 3 };
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "pinned", graph);
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, { idempotencyKey: "pinned-run" });
    const originalAgent = await db.agentVersion.findFirstOrThrow({ where: { agentId: agent, number: 1 } });
    const originalAction = await db.skillVersion.findFirstOrThrow({ where: { skillId: action, number: 1 } });
    for (const [kind, id] of [["agents", agent], ["skills", granted], ["skills", action]]) expect((await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers: { cookie: owner.cookie }, payload: { instructions: "LATER_INSTRUCTIONS", modelProfile: "CREATIVE_WRITER", preferredModelRef: id === action ? original.id : later.id } })).statusCode).toBe(200);
    expect((await driveRun(runId)).status).toBe("AWAITING_APPROVAL");
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]!.messages[0]!.content).toContain("PINNED_AGENT");
    expect(seenPrompts[0]!.messages[0]!.content).toContain("PINNED_GRANTED");
    expect(seenPrompts[0]!.model).toBe("fake-writer");
    const approval = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "approve" } });
    const hash = (approval.approvalSnapshot as { snapshotHash: string }).snapshotHash;
    await db.modelProfileMapping.updateMany({ where: { modelRef: original.id }, data: { enabled: false } });
    const response = await app.inject({ method: "POST", url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/approve`, headers: { cookie: owner.cookie }, payload: { expectedSnapshotHash: hash } });
    expect(response.statusCode, response.body).toBe(200);
    expect((await driveRun(runId)).status).toBe("SUCCEEDED");
    expect(seenPrompts).toHaveLength(2);
    expect(seenPrompts[1]!.messages[0]!.content).toContain("PINNED_ACTION");
    expect(seenPrompts[1]!.model).toBe("later-writer");
    const steps = await db.workflowStepRun.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
    expect(steps[0]!.agentVersionId).toBe(originalAgent.id);
    expect(steps[2]!.skillVersionId).toBe(originalAction.id);
    const pins = await db.$queryRawUnsafe<Array<{ kind: string; key: string }>>('SELECT kind,key FROM workflow_run_definition_pins WHERE run_id=$1::uuid', runId);
    expect(pins.map(p => `${p.kind}:${p.key}`).sort()).toEqual(["AGENT:pinned", "SKILL:action", "SKILL:granted"]);
  });
  it("executes agent and skill preferences ahead of the workflow default", async () => {
    const owner = await seedUser("worker-preference@example.test");
    const { workspaceId } = await seedWorkspace(owner.userId, "worker-preference");
    await seedRoute();
    const automatic = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    const selected = await db.aIModel.create({ data: { gatewayId: automatic.gatewayId, modelId: "selected-writer", capabilities: ["chat"] } });
    const fallback = await db.aIModel.create({ data: { gatewayId: automatic.gatewayId, modelId: "workflow-writer", capabilities: ["chat"] } });
    for (const model of [selected, fallback]) await db.modelProfileMapping.create({ data: { modelRef: model.id, profile: "CREATIVE_WRITER", priority: 999 } });
    await makeAgent(owner.cookie, workspaceId, "selected", { preferredModelRef: selected.id });
    await makeAgent(owner.cookie, workspaceId, "inherited");
    await makeSkill(owner.cookie, workspaceId, "selected-skill", { modelProfile: "CREATIVE_WRITER", preferredModelRef: selected.id });
    const graph = { steps: [
      { key: "first", kind: "AGENT", ref: "selected", instruction: "Write" },
      { key: "second", kind: "SKILL", ref: "selected-skill", instruction: "Write" },
      { key: "third", kind: "AGENT", ref: "inherited", instruction: "Write" },
    ], edges: [{ from: "first", to: "second" }, { from: "second", to: "third" }], maxSteps: 3 };
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "preference", graph);
    expect((await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/versions`, headers: { cookie: owner.cookie }, payload: { graph, defaultModelRef: fallback.id } })).statusCode).toBe(200);
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId);
    expect((await driveRun(runId)).status).toBe("SUCCEEDED");
    expect(seenPrompts.map(p => p.model)).toEqual(["selected-writer", "selected-writer", "workflow-writer"]);
    const generations = await db.generation.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    expect(generations.map(g => (g.contextSnapshot as { routing: { preferredModelRef: string } }).routing.preferredModelRef)).toEqual([selected.id, selected.id, fallback.id]);
    await db.modelProfileMapping.deleteMany({ where: { modelRef: fallback.id } });
    seenPrompts = [];
    const refused = await postRun(owner.cookie, workspaceId, workflowId);
    expect((await driveRun(refused.runId)).status).toBe("FAILED");
    expect(seenPrompts).toHaveLength(0);
  });
  it.each(["agents", "skills", "workflows"])("versions %s model choices without changing history", async kind => {
    const owner = await seedUser("preference-owner@example.test");
    const { workspaceId } = await seedWorkspace(owner.userId, "preference");
    await seedRoute();
    const model = await db.aIModel.findFirstOrThrow({ where: { modelId: "fake-writer" } });
    const field = kind === "workflows" ? "defaultModelRef" : "preferredModelRef";
    const content = kind === "workflows"
      ? { graph: { steps: [{ key: "context", kind: "RETRIEVAL", instruction: "Read context" }], edges: [], maxSteps: 2 } }
      : { instructions: "Write concisely.", modelProfile: "CREATIVE_WRITER" };
    const headers = { cookie: owner.cookie };
    const created = await app.inject({ method: "POST", url: `/api/${kind}`, headers, payload: { ...content, scope: "WORKSPACE", workspaceId, key: "preference", name: "Preference", [field]: model.id } });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    const read = () => app.inject({ method: "GET", url: `/api/${kind}/${id}`, headers });
    expect((await read()).json()[field]).toBe(model.id);
    const next = await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers, payload: { ...content, [field]: null } });
    expect(next.statusCode, next.body).toBe(200);
    expect((await read()).json()[field]).toBeNull();
    const rows = await db.$queryRawUnsafe<Array<{ choice: string | null }>>(`SELECT ${kind === "workflows" ? "default_model_ref" : "preferred_model_ref"} AS choice FROM ${kind === "agents" ? "agent_versions" : kind === "skills" ? "skill_versions" : "workflow_versions"} WHERE ${kind === "agents" ? "agent_id" : kind === "skills" ? "skill_id" : "workflow_id"} = $1::uuid ORDER BY number`, id);
    expect(rows.map(r => r.choice)).toEqual([model.id, null]);
    const refused = await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers, payload: { ...content, [field]: "00000000-0000-4000-8000-000000000001" } });
    expect(refused.statusCode).toBe(409);
    if (kind !== "workflows") expect((await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers, payload: { ...content, modelProfile: "EMBEDDING", [field]: model.id } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers, payload: { ...content, [field]: "invalid" } })).statusCode).toBe(400);
    await db.aIModel.update({ where: { id: model.id }, data: { enabled: false } });
    expect((await app.inject({ method: "POST", url: `/api/${kind}/${id}/versions`, headers, payload: { ...content, [field]: model.id } })).statusCode).toBe(409);
    expect((await read()).json().version).toBe(2);
  });
  it("creates an agent, versions it, and never mutates a prior version", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const agentId = await makeAgent(owner.cookie, workspaceId, "scene-planner");

    const v2 = await app.inject({
      method: "POST",
      url: `/api/agents/${agentId}/versions`,
      headers: { cookie: owner.cookie },
      payload: { instructions: "You are scene-planner, revised.", modelProfile: "DEEP_PLANNER" },
    });
    expect(v2.statusCode).toBe(200);
    expect((v2.json() as { version: number }).version).toBe(2);

    const detail = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}`,
      headers: { cookie: owner.cookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as { version: number; instructions: string };
    expect(body.version).toBe(2);
    expect(body.instructions).toContain("revised");

    // Version 1 still exists, unchanged — versioning is append-only.
    const v1 = await db.agentVersion.findFirstOrThrow({
      where: { agentId, number: 1 },
    });
    expect(v1.instructions).toBe("You are scene-planner.");
    expect(v1.modelProfile).toBe("CREATIVE_WRITER");
  });

  it("rejects a structured-output contract this validator cannot enforce", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "unchecked",
        name: "unchecked",
        instructions: "x",
        modelProfile: "STRUCTURED_EXTRACTOR",
        // minItems is silently ignored by the underlying converter, so
        // registering it must fail rather than store a contract that
        // appears to constrain output but does not.
        outputSchema: { type: "object", properties: { beats: { type: "array", minItems: 3 } } },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; failures: Array<{ code: string }> };
    expect(body.error).toBe("INVALID_DEFINITION");
    expect(body.failures.map((f) => f.code)).toContain("SCHEMA_UNSUPPORTED_KEYWORD");
  });

  it("rejects a workflow graph with a cycle", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await makeAgent(owner.cookie, workspaceId, "a");
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "looping",
        name: "looping",
        graph: {
          steps: [
            { key: "one", kind: "AGENT", ref: "a" },
            { key: "two", kind: "AGENT", ref: "a" },
          ],
          edges: [
            { from: "one", to: "two" },
            { from: "two", to: "one" },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { failures: Array<{ code: string }> }).failures.map((f) => f.code)).toContain(
      "GRAPH_CYCLE",
    );
  });

  it("refuses to publish a definition with no version", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    // A row with no currentVersionId cannot arise through the API; create
    // it directly to prove publish refuses rather than publishing a
    // definition every run would then fail to resolve.
    const orphan = await db.agent.create({
      data: {
        scope: "WORKSPACE",
        workspaceId,
        key: "orphan",
        name: "orphan",
        createdById: owner.userId,
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/agents/${orphan.id}/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a duplicate key within the same scope", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await makeAgent(owner.cookie, workspaceId, "dup");
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "dup",
        name: "dup again",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("lets two workspaces reuse the same key", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const a = await seedWorkspace(owner.userId, "ws-a");
    const b = await seedWorkspace(other.userId, "ws-b");
    await makeAgent(owner.cookie, a.workspaceId, "shared-key");
    await makeAgent(other.cookie, b.workspaceId, "shared-key");
    expect(await db.agent.count({ where: { key: "shared-key" } })).toBe(2);
  });

  it("deletes a workflow that never ran, but refuses one with run history", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "scene-planner");
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    const neverRan = await makeWorkflow(owner.cookie, workspaceId, "draft-flow", {
      steps: [{ key: "plan", kind: "AGENT", ref: "scene-planner", instruction: "Plan." }],
      edges: [],
      maxSteps: 5,
    });
    const hasRuns = await makeWorkflow(owner.cookie, workspaceId, "run-flow", {
      steps: [
        { key: "plan", kind: "AGENT", ref: "scene-planner", instruction: "Plan." },
        { key: "write", kind: "AGENT", ref: "chapter-writer", instruction: "Write." },
      ],
      edges: [{ from: "plan", to: "write" }],
      maxSteps: 5,
    });

    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${hasRuns}/run`,
      headers: { cookie: owner.cookie },
      payload: { novelId, input: { premise: "a forge" } },
    });
    expect(run.statusCode, run.body).toBe(202);

    // Run history is the execution audit trail (CLAUDE.md §2.11): RESTRICT,
    // not CASCADE — the definition delete cannot take the record of what it
    // did with it.
    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${hasRuns}`,
      headers: { cookie: owner.cookie },
    });
    expect(blocked.statusCode).toBe(409);
    expect(await db.workflowRun.count({ where: { workflowId: hasRuns } })).toBe(1);

    // The sibling path: deleting the WORKFLOW VERSION a run cites is blocked
    // by the same rule — but there is no version-delete route, so prove the
    // FK at the database instead (the route would be the only way to reach
    // it, and it does not exist).
    const version = await db.workflowVersion.findFirstOrThrow({
      where: { workflowId: hasRuns },
      orderBy: { number: "desc" },
    });
    await expect(db.workflowVersion.delete({ where: { id: version.id } })).rejects.toThrow();

    // A workflow that never ran deletes cleanly, versions and all.
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${neverRan}`,
      headers: { cookie: owner.cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await db.workflow.count({ where: { id: neverRan } })).toBe(0);
    expect(await db.workflowVersion.count({ where: { workflowId: neverRan } })).toBe(0);

    // The run-holding workflow still exists with its history intact.
    expect(await db.workflow.count({ where: { id: hasRuns } })).toBe(1);
    expect(await db.workflowRun.count({ where: { workflowId: hasRuns } })).toBe(1);
  });
});

describe("Phase 4 — authorization", () => {
  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents/00000000-0000-0000-0000-000000000000" });
    expect(res.statusCode).toBe(401);
  });

  it("hides another tenant's agent behind 404, not 403", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const a = await seedWorkspace(owner.userId, "ws-a");
    const b = await seedWorkspace(other.userId, "ws-b");
    const agentId = await makeAgent(owner.cookie, a.workspaceId, "secret-agent");

    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}`,
      headers: { cookie: other.cookie },
    });
    expect(res.statusCode).toBe(404);

    // And the other workspace never sees it in its list.
    const list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${b.workspaceId}/agents`,
      headers: { cookie: other.cookie },
    });
    expect((list.json() as Array<{ key: string }>).map((x) => x.key)).not.toContain("secret-agent");
  });

  it("denies a VIEWER the workspace definition list", async () => {
    const owner = await seedUser("owner@example.com");
    const viewer = await seedUser("viewer@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await db.membership.create({
      data: { workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/agents`,
      headers: { cookie: viewer.cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies an AUTHOR managing definitions but allows reading and running", async () => {
    const owner = await seedUser("owner@example.com");
    const author = await seedUser("author@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await db.membership.create({
      data: { workspaceId, userId: author.userId, role: "AUTHOR" },
    });

    const create = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: author.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "nope",
        name: "nope",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(create.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/agents`,
      headers: { cookie: author.cookie },
    });
    expect(list.statusCode).toBe(200);
  });

  it("requires platform:define for a PLATFORM-scoped agent, not workspace ADMIN", async () => {
    const admin = await seedUser("admin@example.com");
    await seedWorkspace(admin.userId, "ws-a", "ADMIN");
    const asWorkspaceAdmin = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: admin.cookie },
      payload: {
        scope: "PLATFORM",
        key: "shared-agent",
        name: "shared-agent",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    // A workspace ADMIN must not be able to inject a shared definition
    // into every tenant's prompts (ADR-0005).
    expect(asWorkspaceAdmin.statusCode).toBe(403);

    const superAdmin = await seedUser("super@example.com", "SUPER_ADMIN");
    const asPlatform = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload: {
        scope: "PLATFORM",
        key: "shared-agent",
        name: "shared-agent",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(asPlatform.statusCode).toBe(201);
  });

  it("rejects a duplicate PLATFORM key", async () => {
    // `@@unique([scope, workspaceId, key])` cannot constrain these rows:
    // PostgreSQL treats NULL as distinct, so workspaceId IS NULL rows never
    // collide. The partial unique index from 20260927 is what enforces it.
    const superAdmin = await seedUser("super@example.com", "SUPER_ADMIN");
    const payload = {
      scope: "PLATFORM",
      key: "shared-dup",
      name: "shared-dup",
      instructions: "x",
      modelProfile: "CREATIVE_WRITER",
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload,
    });
    // 409, not a 500 from an unhandled P2002 and not a silent duplicate.
    expect(second.statusCode).toBe(409);
    expect(await db.agent.count({ where: { key: "shared-dup", workspaceId: null } })).toBe(1);
  });

  it("allows a workspace key that shadows a platform key, and prefers it", async () => {
    // The unique indexes are per-scope by design: a tenant may override a
    // shared definition with its own. This asserts the second half too —
    // that resolution actually prefers the tenant row, which is the whole
    // point of allowing the shadow.
    const superAdmin = await seedUser("super@example.com", "SUPER_ADMIN");
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();

    const shared = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload: {
        scope: "PLATFORM",
        key: "shadowable",
        name: "shadowable",
        instructions: "PLATFORM-INSTRUCTIONS",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(shared.statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: `/api/agents/${(shared.json() as { id: string }).id}/publish`,
      headers: { cookie: superAdmin.cookie },
    });

    const own = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "shadowable",
        name: "shadowable",
        instructions: "TENANT-INSTRUCTIONS",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(own.statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: `/api/agents/${(own.json() as { id: string }).id}/publish`,
      headers: { cookie: owner.cookie },
    });

    // Run a one-step workflow naming the shared key: the tenant's version
    // must be the one sent to the model.
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "shadow-run", {
      steps: [{ key: "go", kind: "AGENT", ref: "shadowable" }],
      edges: [],
    });
    await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(seenPrompts.at(-1)!.messages[0]!.content).toBe("TENANT-INSTRUCTIONS");
  });

  it("does not let a platform admin manage a workspace's definitions", async () => {
    const owner = await seedUser("owner@example.com");
    const superAdmin = await seedUser("super@example.com", "SUPER_ADMIN");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "intruder",
        name: "intruder",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    // Platform administration is not a bypass for workspace authorization.
    expect(res.statusCode).toBe(404);
  });

  it("exposes a published platform agent to every workspace but not a draft", async () => {
    const superAdmin = await seedUser("super@example.com", "SUPER_ADMIN");
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");

    const draft = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: superAdmin.cookie },
      payload: {
        scope: "PLATFORM",
        key: "draft-shared",
        name: "draft-shared",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(draft.statusCode).toBe(201);

    let list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/agents`,
      headers: { cookie: owner.cookie },
    });
    expect((list.json() as Array<{ key: string }>).map((x) => x.key)).not.toContain("draft-shared");

    const { id } = draft.json() as { id: string };
    expect(
      (await app.inject({ method: "POST", url: `/api/agents/${id}/publish`, headers: { cookie: superAdmin.cookie } }))
        .statusCode,
    ).toBe(200);

    list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/agents`,
      headers: { cookie: owner.cookie },
    });
    expect((list.json() as Array<{ key: string }>).map((x) => x.key)).toContain("draft-shared");
  });
});

describe("Phase 4 — workflow execution", () => {
  it("runs multiple agents deterministically and records each step", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "scene-planner");
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    await makeAgent(owner.cookie, workspaceId, "continuity-guardian");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "chapter-test", CHAPTER_PIPELINE);

    // Enqueue (202) then drive via the worker's executor — the run no
    // longer executes on the request thread.
    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {
      novelId,
      input: { premise: "a forge" },
    });

    expect(run.status).toBe("SUCCEEDED");
    expect(run.stepCount).toBe(3);
    // Deterministic order: the topological order, not map iteration order.
    expect(run.steps.map((s) => s.stepKey)).toEqual(["plan", "write", "review"]);
    expect(run.steps.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(run.steps.every((s) => s.status === "SUCCEEDED")).toBe(true);

    // Each agent step is pinned to its version and to a real generation.
    expect(run.steps.map((s) => s.agentKey)).toEqual([
      "scene-planner",
      "chapter-writer",
      "continuity-guardian",
    ]);
    expect(run.steps.every((s) => s.agentVersionNumber === 1)).toBe(true);
    expect(run.steps.every((s) => s.generationId !== null)).toBe(true);

    // Three logical generations, one transport attempt each.
    expect(await db.generation.count({ where: { workspaceId } })).toBe(3);
    expect(await db.generationAttempt.count()).toBe(3);
  });

  it("produces the same step order across repeated runs of one graph", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "scene-planner");
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    await makeAgent(owner.cookie, workspaceId, "continuity-guardian");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "chapter-test", CHAPTER_PIPELINE);

    const orders: string[][] = [];
    for (let i = 0; i < 3; i += 1) {
      const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
      orders.push(run.steps.map((s) => s.stepKey));
    }
    expect(orders[0]).toEqual(orders[1]);
    expect(orders[1]).toEqual(orders[2]);
  });

  it("routes a CONDITION branch and skips the untaken step", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "branching", {
      steps: [
        { key: "check", kind: "CONDITION", condition: { path: "$input.revise", equals: true } },
        { key: "revise", kind: "AGENT", ref: "chapter-writer", instruction: "Revise." },
        { key: "accept", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "check", to: "revise", when: "true" },
        { from: "check", to: "accept", when: "false" },
      ],
    });

    const takenRun = await runToCompletion(owner.cookie, workspaceId, workflowId, {
      input: { revise: true },
    });
    expect(takenRun.steps.find((s) => s.stepKey === "revise")!.status).toBe("SUCCEEDED");
    expect(takenRun.steps.find((s) => s.stepKey === "accept")!.status).toBe("SKIPPED");

    const notTakenRun = await runToCompletion(owner.cookie, workspaceId, workflowId, {
      input: { revise: false },
    });
    expect(notTakenRun.steps.find((s) => s.stepKey === "revise")!.status).toBe("SKIPPED");
    expect(notTakenRun.steps.find((s) => s.stepKey === "accept")!.status).toBe("SUCCEEDED");
  });

  it("stops at a HUMAN_APPROVAL step and reports AWAITING_APPROVAL", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "needs-approval", {
      steps: [
        { key: "approve", kind: "HUMAN_APPROVAL", instruction: "Sign off on the outline." },
      ],
      edges: [],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("AWAITING_APPROVAL");
    expect(run.steps[0]!.status).toBe("AWAITING_APPROVAL");
    // Parked is not finished: a null completedAt is what distinguishes a
    // halted-at-approval run from a done one.
    expect(run.completedAt).toBeNull();
    // No model call for an approval gate.
    expect(await db.generation.count()).toBe(0);
  });

  it("validates a step's structured output against its contract", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    // The fake provider returns { summary, beats } when the instruction
    // asks for JSON; this contract demands an extra field it never sends,
    // so the step must fail rather than pass an unvalidated value on.
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          beats: { type: "array", items: { type: "string" } },
          requiredMissing: { type: "string" },
        },
        required: ["summary", "beats", "requiredMissing"],
        additionalProperties: false,
      },
    });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "contract-check", {
      steps: [{ key: "extract", kind: "AGENT", ref: "extractor", instruction: "Respond with JSON." }],
      edges: [],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("FAILED");
    expect(run.errorMessage).toContain("contract");
    // The failing step gets its own row: `executed` is only pushed on
    // success, so without one the run would show working steps and then
    // simply stop, with no record of which step died.
    const failed = run.steps.find((s) => s.stepKey === "extract");
    expect(failed?.status).toBe("FAILED");
    expect(failed?.errorMessage).toContain("contract");
  });

  it("passes a satisfied contract and stores the parsed JSON", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          beats: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "beats"],
        additionalProperties: false,
      },
    });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "contract-ok", {
      steps: [{ key: "extract", kind: "AGENT", ref: "extractor", instruction: "Respond with JSON." }],
      edges: [],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("SUCCEEDED");
    expect(run.output["extract"]).toEqual({ summary: "ok", beats: ["a", "b"] });
  });

  it("binds an agent's instructions and passes prior step output downstream", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "first", { instructions: "FIRST-INSTRUCTIONS" });
    await makeAgent(owner.cookie, workspaceId, "second", {
      instructions: "SECOND-INSTRUCTIONS",
    });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "chained", {
      steps: [
        { key: "one", kind: "AGENT", ref: "first", instruction: "produce draft" },
        {
          key: "two",
          kind: "AGENT",
          ref: "second",
          instruction: "refine draft",
          inputs: { draft: "$steps.one.text" },
        },
      ],
      edges: [{ from: "one", to: "two" }],
    });

    await runToCompletion(owner.cookie, workspaceId, workflowId, {});

    // The agent's own instructions became the system message, and the
    // previous step's text reached the second call.
    expect(seenPrompts).toHaveLength(2);
    expect(seenPrompts[0]!.messages[0]!.content).toBe("FIRST-INSTRUCTIONS");
    expect(seenPrompts[1]!.messages[0]!.content).toBe("SECOND-INSTRUCTIONS");
    expect(seenPrompts[1]!.messages[1]!.content).toContain("produce draft");
    expect(seenPrompts[1]!.messages[1]!.content).toContain("step output for");
  });

  it("refuses to run a workflow that references an unpublished agent", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();

    // Created but never published.
    const created = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "draft-agent",
        name: "draft-agent",
        instructions: "x",
        modelProfile: "CREATIVE_WRITER",
      },
    });
    expect(created.statusCode).toBe(201);

    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "uses-draft", {
      steps: [{ key: "go", kind: "AGENT", ref: "draft-agent", instruction: "go" }],
      edges: [],
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    // No model call was made and no run row was left behind.
    expect(await db.generation.count()).toBe(0);
    expect(await db.workflowRun.count()).toBe(0);
  });

  it("refuses to run an unpublished WORKSPACE workflow", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");

    // Created but never published. The status column defaults to DRAFT, so
    // without this gate a freshly created workflow is runnable before
    // anyone publishes it — contradicting the definition service's own
    // contract and the parallel gate already enforced for agents.
    const created = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "unpublished",
        name: "unpublished",
        graph: {
          steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }],
          edges: [],
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: workflowId } = created.json() as { id: string };

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    // Nothing was spent and nothing was recorded.
    expect(await db.generation.count()).toBe(0);
    expect(await db.workflowRun.count()).toBe(0);
  });

  it("does not let an inherited object property stand in for run input", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");

    // `$input.constructor` passes the reference SYNTAX check, and a bare
    // index lookup on runInput would return Object.prototype.constructor —
    // a function, so the `undefined` guard misses it and the prompt gets
    // the literal text `undefined` as though the caller had supplied it.
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "prototype", {
      steps: [
        {
          key: "go",
          kind: "AGENT",
          ref: "writer",
          instruction: "go",
          inputs: { seed: "$input.constructor" },
        },
      ],
      edges: [],
    });
    await runToCompletion(owner.cookie, workspaceId, workflowId, {});

    // The absent value must be rendered as an absence, never as the string
    // "undefined" and never as a function's stringification.
    const sent = seenPrompts[0]!.messages[1]!.content;
    expect(sent).toContain("(not available)");
    expect(sent).not.toContain("function");
  });

  it("refuses to run a workflow bound to a different novel", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    const other = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
      actorUserId: owner.userId,
      workspaceId,
      title: "Other",
      slug: "other",
    });
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        novelId,
        key: "bound",
        name: "bound",
        graph: { steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }], edges: [] },
      },
    });
    const workflowId = (res.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/publish`, headers: { cookie: owner.cookie } });

    const wrongNovel = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { novelId: other.id },
    });
    expect(wrongNovel.statusCode).toBe(409);
  });

  it("hides another tenant's run behind 404", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const a = await seedWorkspace(owner.userId, "ws-a");
    const b = await seedWorkspace(other.userId, "ws-b");
    await seedRoute();
    await makeAgent(owner.cookie, a.workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, a.workspaceId, "wf", {
      steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }],
      edges: [],
    });
    const run = await postRun(owner.cookie, a.workspaceId, workflowId, {});
    const runId = run.runId;

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${b.workspaceId}/workflow-runs/${runId}`,
      headers: { cookie: other.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("lists run history for the workspace, newest first", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }],
      edges: [],
    });
    for (let i = 0; i < 2; i += 1) {
      await postRun(owner.cookie, workspaceId, workflowId, {});
    }
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/workflow-runs?workflowId=${workflowId}`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as unknown[]).length).toBe(2);
  });

  it("runs steps that follow a TRANSFORM, not just ones after an agent", async () => {
    // Regression: downstream steps were only marked reachable in the AGENT
    // and CONDITION branches, so a chain beginning with TRANSFORM had every
    // later step silently SKIPPED.
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "transform-first", {
      steps: [
        { key: "prep", kind: "TRANSFORM" },
        { key: "write", kind: "AGENT", ref: "writer", instruction: "write" },
        { key: "wrap", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "prep", to: "write" },
        { from: "write", to: "wrap" },
      ],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.map((s) => s.status)).toEqual(["SUCCEEDED", "SUCCEEDED", "SUCCEEDED"]);
    // The agent step really did reach a model.
    expect(await db.generation.count()).toBe(1);
  });

  it("injects an agent's granted skills into its own system prompt", async () => {
    // Regression: `skillKeys` was stored but never used, so declaring an
    // allowlist had no effect on what the agent could do.
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeSkill(owner.cookie, workspaceId, "voice-check", {
      instructions: "SKILL-INSTRUCTIONS-VOICE",
    });
    await makeAgent(owner.cookie, workspaceId, "writer", {
      instructions: "AGENT-INSTRUCTIONS",
      skillKeys: ["voice-check"],
    });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "granted", {
      steps: [{ key: "write", kind: "AGENT", ref: "writer", instruction: "write" }],
      edges: [],
    });

    await runToCompletion(owner.cookie, workspaceId, workflowId, {});

    const system = seenPrompts[0]!.messages[0]!.content;
    expect(system).toContain("AGENT-INSTRUCTIONS");
    expect(system).toContain("SKILL-INSTRUCTIONS-VOICE");
  });

  it("does not inject a skill the agent was not granted", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeSkill(owner.cookie, workspaceId, "ungranted", {
      instructions: "SKILL-INSTRUCTIONS-UNGRANTED",
    });
    await makeAgent(owner.cookie, workspaceId, "writer", {
      instructions: "AGENT-INSTRUCTIONS",
      skillKeys: [],
    });
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "not-granted", {
      steps: [{ key: "write", kind: "AGENT", ref: "writer", instruction: "write" }],
      edges: [],
    });

    await runToCompletion(owner.cookie, workspaceId, workflowId, {});

    const system = seenPrompts[0]!.messages[0]!.content;
    expect(system).toContain("AGENT-INSTRUCTIONS");
    expect(system).not.toContain("SKILL-INSTRUCTIONS-UNGRANTED");
  });

  it("runs a SKILL step on the skill's own profile and pins its version", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeSkill(owner.cookie, workspaceId, "extract-facts");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "skill-only", {
      steps: [
        { key: "extract", kind: "SKILL", ref: "extract-facts", instruction: "Extract facts." },
      ],
      edges: [],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps[0]!.skillKey).toBe("extract-facts");
    expect(run.steps[0]!.skillVersionNumber).toBe(1);
    // A SKILL step has no agent, so nothing is attributed to one.
    expect(run.steps[0]!.agentKey).toBeNull();
    expect(seenPrompts[0]!.messages[0]!.content).toBe("Perform extract-facts.");
  });

  it("reports a provider failure with its classified message, never the raw body", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "provider-down", {
      steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "Write." }],
      edges: [],
    });

    // A rate limit, so the classifier's message is deterministic.
    gatewayFailure = { status: 429 };
    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});

    expect(run.status).toBe("FAILED");
    // The regression this guards: `AiServices.generate` converts a
    // GatewayError into a BadGatewayError, so a check that only tested
    // `instanceof GatewayError` replaced this with "workflow step failed" —
    // the common real failure, reported uselessly.
    expect(run.errorMessage).toBe("gateway rate limit exceeded");
    // The failing step carries the same classified summary.
    expect(run.steps.find((s) => s.stepKey === "go")!.errorMessage).toBe(
      "gateway rate limit exceeded",
    );
  });

  it("persists a VALIDATOR step failure and marks the run FAILED", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "validating", {
      steps: [
        { key: "seed", kind: "TRANSFORM" },
        {
          key: "check",
          kind: "VALIDATOR",
          inputs: { src: "$steps.seed.json" },
          outputSchema: { type: "object", required: ["mustExist"], properties: { mustExist: { type: "string" } } },
        },
      ],
      edges: [{ from: "seed", to: "check" }],
    });

    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("FAILED");
    expect(run.steps.find((s) => s.stepKey === "check")!.status).toBe("FAILED");
  });

  it("audits a completed run", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "audited", {
      steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }],
      edges: [],
    });
    await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    const entry = await db.auditLog.findFirst({
      where: { action: "workflow.run_completed", workspaceId },
    });
    expect(entry).not.toBeNull();
    expect(entry!.actorUserId).toBe(owner.userId);
  });

  it("does not file a parked-at-approval run as completed", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "gated", {
      steps: [{ key: "approve", kind: "HUMAN_APPROVAL", instruction: "review it" }],
      edges: [],
    });
    const run = await runToCompletion(owner.cookie, workspaceId, workflowId, {});
    expect(run.status).toBe("AWAITING_APPROVAL");

    // The run row holds `completedAt` null for exactly this state, so the
    // audit trail must not disagree with it by recording a completion.
    expect(
      await db.auditLog.count({ where: { action: "workflow.run_completed", workspaceId } }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: { action: "workflow.run_awaiting_approval", workspaceId },
      }),
    ).toBe(1);
  });
});

describe("NF-WF-004 — durable execution", () => {
  it("POST /run returns 202, creates PENDING rows, and enqueues one job", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [
        { key: "a", kind: "TRANSFORM" },
        { key: "b", kind: "TRANSFORM" },
      ],
      edges: [{ from: "a", to: "b" }],
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { id: string; status: string; statusUrl: string };
    // 202 carries the run id and the single-run status URL; it never
    // claims execution.
    expect(body.status).toBe("PENDING");
    expect(body.statusUrl).toBe(`/api/workspaces/${workspaceId}/workflow-runs/${body.id}`);

    // One job, jobId = run.id.
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.opts.jobId).toBe(body.id);
    expect((enqueuedJobs[0]!.data as { runId: string }).runId).toBe(body.id);

    // PENDING run row + PENDING step rows for every step, in order.
    const steps = await db.workflowStepRun.findMany({
      where: { runId: body.id },
      orderBy: { sequence: "asc" },
    });
    expect(steps.map((s) => [s.stepKey, s.status])).toEqual([
      ["a", "PENDING"],
      ["b", "PENDING"],
    ]);
  });

  it("dedupes a repeat POST with the same idempotency key (200, one row)", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const url = `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`;

    const first = await app.inject({
      method: "POST",
      url,
      headers: { cookie: owner.cookie },
      payload: { idempotencyKey: "key-123" },
    });
    expect(first.statusCode).toBe(202);
    const firstId = (first.json() as { id: string }).id;

    const second = await app.inject({
      method: "POST",
      url,
      headers: { cookie: owner.cookie },
      payload: { idempotencyKey: "key-123" },
    });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { id: string }).id).toBe(firstId);

    expect(await db.workflowRun.count({ where: { workspaceId } })).toBe(1);
    // The repeat does not enqueue a second job.
    expect(enqueuedJobs).toHaveLength(1);
  });

  it("creates a new row per POST when no idempotency key is given", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const url = `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`;

    const first = await app.inject({ method: "POST", url, headers: { cookie: owner.cookie }, payload: {} });
    const second = await app.inject({ method: "POST", url, headers: { cookie: owner.cookie }, payload: {} });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect((first.json() as { id: string }).id).not.toBe((second.json() as { id: string }).id);
    expect(await db.workflowRun.count({ where: { workspaceId } })).toBe(2);
  });

  it("dedupes concurrent POSTs with the same key (one row)", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const url = `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`;
    const post = () =>
      app.inject({
        method: "POST",
        url,
        headers: { cookie: owner.cookie },
        payload: { idempotencyKey: "race-key" },
      });

    const [a, b] = await Promise.all([post(), post()]);
    // One wins with 202, the other dedupes with 200 — in either order.
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 202]);
    expect((a.json() as { id: string }).id).toBe((b.json() as { id: string }).id);
    expect(await db.workflowRun.count({ where: { workspaceId } })).toBe(1);
  });

  it("rejects an idempotency key longer than 64 chars", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { idempotencyKey: "x".repeat(65) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cancel transitions PENDING → CANCELLED and the run never executes", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, {});

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as { status: string }).status).toBe("CANCELLED");

    // The worker's claim now loses: the run stays CANCELLED, no step runs.
    const result = await driver.driveRun(runId);
    expect(result.claimed).toBe(false);
    const run = await getRun(owner.cookie, workspaceId, runId);
    expect(run.status).toBe("CANCELLED");
    expect(run.steps.every((s) => s.status === "PENDING")).toBe(true);
  });

  it("cancel stops a RUNNING run: no further steps, terminal write skipped", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [
        { key: "one", kind: "AGENT", ref: "writer", instruction: "one" },
        { key: "two", kind: "AGENT", ref: "writer", instruction: "two" },
      ],
      edges: [{ from: "one", to: "two" }],
    });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, {});

    // A generate that blocks until released, so the cancel lands mid-run.
    const generation = await db.generation.create({
      data: { task: "test", modelProfile: "CREATIVE_WRITER", workspaceId },
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { createWorkflowExecutor } = await import("@novelforge/workflow-executor");
    const { resolveAgent, resolveSkill } = await import("./services/definition-resolution.ts");
    const blocking = createWorkflowExecutor({
      db,
      audit: { record: async () => {} },
      resolvers: {
        resolveAgent: (ws, key) => resolveAgent(db, ws, key),
        resolveSkill: (ws, key) => resolveSkill(db, ws, key),
      },
      generate: {
        generate: async () => {
          await gate;
          return { generationId: generation.id, content: "done", model: "fake" };
        },
      },
    });

    const driving = blocking.executeRun(runId);
    // Let the first step start, then cancel mid-execution.
    await new Promise((r) => setTimeout(r, 100));
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    release();
    const result = await driving;

    expect(result.stoppedForCancellation).toBe(true);
    const run = await getRun(owner.cookie, workspaceId, runId);
    // The terminal write was skipped: CANCELLED is never overwritten.
    expect(run.status).toBe("CANCELLED");
    expect(run.steps.find((s) => s.stepKey === "one")!.status).toBe("SUCCEEDED");
    // The second step never executed.
    expect(run.steps.find((s) => s.stepKey === "two")!.status).toBe("PENDING");
  });

  it("cancel refuses a terminal run with 409", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, {});
    await driveRun(runId);

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cancel transitions AWAITING_APPROVAL → CANCELLED", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "gated", {
      steps: [{ key: "approve", kind: "HUMAN_APPROVAL", instruction: "review" }],
      edges: [],
    });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, {});
    await driveRun(runId);
    expect((await getRun(owner.cookie, workspaceId, runId)).status).toBe("AWAITING_APPROVAL");

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("CANCELLED");
  });

  it("cancel is retry-safe: a second cancel returns the CANCELLED run", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const { runId } = await postRun(owner.cookie, workspaceId, workflowId, {});
    const url = `/api/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`;

    const first = await app.inject({ method: "POST", url, headers: { cookie: owner.cookie } });
    const second = await app.inject({ method: "POST", url, headers: { cookie: owner.cookie } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((second.json() as { status: string }).status).toBe("CANCELLED");
  });

  it("cancel 404s for an unknown run or another tenant's run", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const a = await seedWorkspace(owner.userId, "ws-a");
    const b = await seedWorkspace(other.userId, "ws-b");
    await seedRoute();
    await makeAgent(owner.cookie, a.workspaceId, "writer");
    const workflowId = await makeWorkflow(owner.cookie, a.workspaceId, "wf", {
      steps: [{ key: "go", kind: "TRANSFORM" }],
      edges: [],
    });
    const { runId } = await postRun(owner.cookie, a.workspaceId, workflowId, {});

    const unknown = await app.inject({
      method: "POST",
      url: `/api/workspaces/${a.workspaceId}/workflow-runs/00000000-0000-0000-0000-000000000000/cancel`,
      headers: { cookie: owner.cookie },
    });
    expect(unknown.statusCode).toBe(404);

    const foreign = await app.inject({
      method: "POST",
      url: `/api/workspaces/${b.workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: other.cookie },
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("novel delete refuses a novel with workflow run history", () => {
  it("409s instead of cascading the runs away", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "scene-planner");
    // The workflow must be NOVEL-scoped: workflows.novel_id is CASCADE, so
    // only a novel's own workflows (with their runs, which have no novel
    // cascade of their own) make workflow_runs.workflow_id RESTRICT fire
    // mid-cascade. A WORKSPACE-scoped workflow is untouched by novel delete.
    const created = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        novelId,
        key: "run-flow",
        name: "run-flow",
        graph: {
          steps: [{ key: "plan", kind: "AGENT", ref: "scene-planner", instruction: "Plan." }],
          edges: [],
          maxSteps: 5,
        },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const workflow = (created.json() as { id: string }).id;
    const pub = await app.inject({
      method: "POST",
      url: `/api/workflows/${workflow}/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(pub.statusCode, pub.body).toBe(200);
    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflow}/run`,
      headers: { cookie: owner.cookie },
      payload: { novelId, input: { premise: "a forge" } },
    });
    expect(run.statusCode, run.body).toBe(202);

    // A novel with run history must refuse (409), never 500 and never
    // silent loss.
    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}`,
      headers: { cookie: owner.cookie },
    });
    expect(blocked.statusCode).toBe(409);
    expect(await db.novel.count({ where: { id: novelId } })).toBe(1);
    expect(await db.workflowRun.count({ where: { novelId } })).toBe(1);
  });
});
