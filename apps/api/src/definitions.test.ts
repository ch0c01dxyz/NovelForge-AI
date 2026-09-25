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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  seenPrompts = [];
  gatewayFailure = null;
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
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: `Novel ${slug}`, slug, createdById: ownerId },
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
    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { novelId, input: { premise: "a forge" } },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as {
      status: string;
      stepCount: number;
      steps: Array<{ stepKey: string; sequence: number; status: string; agentKey: string | null; agentVersionNumber: number | null; generationId: string | null }>;
    };

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
      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
        headers: { cookie: owner.cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      orders.push(
        (res.json() as { steps: Array<{ stepKey: string }> }).steps.map((s) => s.stepKey),
      );
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

    const taken = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { input: { revise: true } },
    });
    expect(taken.statusCode).toBe(201);
    const takenRun = taken.json() as { steps: Array<{ stepKey: string; status: string }> };
    expect(takenRun.steps.find((s) => s.stepKey === "revise")!.status).toBe("SUCCEEDED");
    expect(takenRun.steps.find((s) => s.stepKey === "accept")!.status).toBe("SKIPPED");

    const notTaken = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { input: { revise: false } },
    });
    const notTakenRun = notTaken.json() as { steps: Array<{ stepKey: string; status: string }> };
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as { status: string; steps: Array<{ status: string }>; completedAt: string | null };
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as {
      status: string;
      errorMessage: string | null;
      steps: Array<{ stepKey: string; status: string; errorMessage: string | null }>;
    };
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    const run = res.json() as { status: string; output: Record<string, unknown> };
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);

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
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);

    // The absent value must be rendered as an absence, never as the string
    // "undefined" and never as a function's stringification.
    const sent = seenPrompts[0]!.messages[1]!.content;
    expect(sent).toContain("(not available)");
    expect(sent).not.toContain("function");
  });

  it("refuses to run a workflow bound to a different novel", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    const other = await db.novel.create({
      data: { workspaceId, title: "Other", slug: "other", createdById: owner.userId },
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
    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${a.workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    const runId = (run.json() as { id: string }).id;

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
      await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
        headers: { cookie: owner.cookie },
        payload: {},
      });
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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as { status: string; steps: Array<{ stepKey: string; status: string }> };
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

    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });

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

    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });

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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as {
      status: string;
      steps: Array<{ stepKey: string; skillKey: string | null; skillVersionNumber: number | null; agentKey: string | null }>;
    };
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
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    const run = res.json() as {
      status: string;
      errorMessage: string | null;
      steps: Array<{ stepKey: string; status: string; errorMessage: string | null }>;
    };

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

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    const run = res.json() as { status: string; steps: Array<{ stepKey: string; status: string }> };
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
    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
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
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { status: string }).status).toBe("AWAITING_APPROVAL");

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
