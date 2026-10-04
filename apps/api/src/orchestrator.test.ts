/**
 * AI Orchestrator milestone integration suite.
 *
 * Dedicated novelforge_test_orchestrator db (parallel-safe per ADR-0003 §8).
 * Every test drives the real HTTP surface against a real migrated database
 * and the REAL Phase 3 generation path — gateway routing, the generation
 * ledger, and the audit trail all run for real. Only the transport is faked
 * (`BuildAppOptions.createGateway`), so no test ever reaches a provider
 * (CLAUDE.md §25).
 *
 * Covers the lifecycle CLAUDE.md §7 and docs/06-ai/AI-ORCHESTRATION.md call
 * for, minus the deferred legs:
 * - definition resolution gates execution (unpublished 409, unknown 409,
 *   foreign workspace 404, VIEWER 403)
 * - agent + skill instructions and canon facts land in the assembled prompt
 * - provenance is persisted on the Generation row (promptVersion pin +
 *   contextSnapshot source ids)
 * - a structured output contract fails CLOSED (409), never passing an
 *   unvalidated value to the caller
 * - streaming settles its status and stamps provenance only on SUCCEEDED
 * - a contracted agent is refused up front on the streaming route, because
 *   the contract check cannot run after the bytes have left
 *
 * Deliberately NOT here: canon-proposal emission, review validators and
 * evaluation hooks. Those are separate slices; this suite pins the
 * orchestrator's own glue.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { GatewayError, type AIGateway, type GatewayRecord, type GenerateResult } from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import type { WorkflowQueue } from "./services/workflow-queue.ts";
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";

const TEST_DB = "novelforge_test_orchestrator";
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
  APP_ENCRYPTION_KEY: "unit-test-encryption-key",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

/** Every request the fake transport actually received, for prompt assertions. */
let seenPrompts: Array<{
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}> = [];
/** Content the fake transport answers with on a non-streaming generate. */
let generatedContent = "the chapter text";
/** Deltas the fake transport yields on a streaming generate. */
let streamDeltas: string[] = ["streamed ", "text"];
/** When true, the fake stream throws AFTER yielding — a broken upstream. */
let streamFails = false;

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(req): Promise<GenerateResult> {
      seenPrompts.push({
        model: req.model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      });
      return {
        content: generatedContent,
        model: "fake-writer",
        inputTokens: 7,
        outputTokens: 11,
        finishReason: "stop",
      };
    },
    async *generateStream(req) {
      seenPrompts.push({
        model: req.model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      });
      for (const delta of streamDeltas) yield { delta };
      // Content already emitted, so the manager settles this as INCOMPLETE
      // rather than FAILED — the case the orchestrator must not stamp.
      if (streamFails) throw new GatewayError("TRANSIENT", "fake stream failure");
    },
    async embed(req) {
      // One 1536-dim vector per input, the width the pgvector column stores
      // and the count embedChunks requires — a mismatch is a 502.
      return {
        vectors: req.input.map(() => new Array<number>(1536).fill(0.1)),
        model: "fake-writer",
        inputTokens: 1,
      };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;
let driver: TestDriver;
/** Fake queue: the worker suite covers the real BullMQ path. */
const fakeQueue: WorkflowQueue = {
  add: async () => ({}),
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
  driver = createTestDriver(db, {
    encryptionKey: "unit-test-encryption-key",
    createGateway: fakeCreateGateway,
  });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  seenPrompts = [];
  generatedContent = "the chapter text";
  streamDeltas = ["streamed ", "text"];
  streamFails = false;
  await db.retrievalAudit.deleteMany();
  // Chunks/embeddings cascade from reference versions, but be explicit: a
  // leftover embedding would make a later assertion pass for the wrong
  // reason. `references.current_version_id` RESTRICTs, so null it first.
  await db.$executeRawUnsafe(`DELETE FROM embeddings`);
  await db.$executeRawUnsafe(`DELETE FROM chunks`);
  await db.reference.updateMany({ data: { currentVersionId: null } });
  await db.referenceVersion.deleteMany();
  await db.reference.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonProposal.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
  await db.modelProfileMapping.deleteMany();
  await db.aIModel.deleteMany();
  await db.aIGateway.deleteMany();
  await db.auditLog.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
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

async function seedWorkspace(
  ownerId: string,
  slug: string,
  memberRole?: { userId: string; role: "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER" },
) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  if (memberRole) {
    await db.membership.create({
      data: { workspaceId: ws.id, userId: memberRole.userId, role: memberRole.role },
    });
  }
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
 * Register a gateway as a platform admin and map every profile the tests
 * use to its discovered model, end to end through the admin routes — so
 * `ModelManager` resolution is the real one, not a stub.
 */
async function seedRoute(): Promise<void> {
  const admin = await seedUser("platform-admin@example.com", "SUPER_ADMIN");
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie: admin.cookie },
    payload: {
      name: "orchestrator-gw",
      baseUrl: "http://localhost:20128",
      apiKey: "sk-secret-orchestrator",
    },
  });
  expect(gw.statusCode, gw.body).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/gateways/${gatewayId}/sync-models`,
        headers: { cookie: admin.cookie },
      })
    ).statusCode,
  ).toBe(200);
  const models = await app.inject({
    method: "GET",
    url: "/api/models",
    headers: { cookie: admin.cookie },
  });
  const model = (models.json() as Array<{ id: string; modelId: string }>).find(
    (m) => m.modelId === "fake-writer",
  )!;
  // EMBEDDING is not optional: ingest embeds every chunk, so an unmapped
  // profile makes reference ingestion fail with NoRouteError (409).
  for (const profile of [
    "CREATIVE_WRITER",
    "DEEP_PLANNER",
    "STRUCTURED_EXTRACTOR",
    "EMBEDDING",
  ]) {
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/model-profiles",
          headers: { cookie: admin.cookie },
          payload: { profile, modelId: model.id },
        })
      ).statusCode,
    ).toBe(200);
  }
}

/** Create a skill through the API. `published` controls the resolve gate. */
async function makeSkill(
  cookie: string,
  workspaceId: string,
  key: string,
  extra: Record<string, unknown> = {},
  published = true,
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
      instructions: `Skill ${key} instructions.`,
      modelProfile: "CREATIVE_WRITER",
      ...extra,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const { id } = res.json() as { id: string };
  if (published) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/skills/${id}/publish`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
  }
  return id;
}

/** Create an agent through the API. `published` controls the resolve gate. */
async function makeAgent(
  cookie: string,
  workspaceId: string,
  key: string,
  extra: Record<string, unknown> = {},
  published = true,
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
  expect(res.statusCode, res.body).toBe(201);
  const { id } = res.json() as { id: string };
  if (published) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/agents/${id}/publish`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
  }
  return id;
}

/** Create a canon fact through the API, so it is a real ACTIVE row. */
async function makeFact(
  cookie: string,
  workspaceId: string,
  novelId: string,
  name: string,
  predicate: string,
  objectText: string,
): Promise<string> {
  const entity = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
    headers: { cookie },
    payload: { kind: "CHARACTER", name },
  });
  expect(entity.statusCode, entity.body).toBe(201);
  const fact = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts`,
    headers: { cookie },
    payload: { entityId: (entity.json() as { id: string }).id, predicate, objectText },
  });
  expect(fact.statusCode, fact.body).toBe(201);
  return (fact.json() as { id: string }).id;
}

/**
 * Create, ingest and publish a reference through the API, so the lexical
 * leg can actually find it. Publication is not optional: search joins
 * `r.status = 'ACTIVE'`, and novel-scoping is not optional either — the
 * lexical SQL filters `r.novel_id = $n` whenever the caller passes a
 * novelId, which the orchestrator always does.
 */
async function makeReference(
  cookie: string,
  workspaceId: string,
  novelId: string,
  key: string,
  title: string,
  content: string,
): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/references`,
    headers: { cookie },
    payload: { key, title, novelId, content },
  });
  expect(created.statusCode, created.body).toBe(201);
  const { id, versionId } = created.json() as {
    id: string;
    versionId: string;
  };
  const ingest = await app.inject({
    method: "POST",
    url: `/api/reference-versions/${versionId}/ingest`,
    headers: { cookie },
    payload: {},
  });
  expect(ingest.statusCode, ingest.body).toBe(200);
  const publish = await app.inject({
    method: "POST",
    url: `/api/references/${id}/publish`,
    headers: { cookie },
  });
  expect(publish.statusCode, publish.body).toBe(200);
  return id;
}

function generate(
  cookie: string,
  workspaceId: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/generate`,
    headers: { cookie },
    payload,
  });
}

function generateStream(
  cookie: string,
  workspaceId: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/generate/stream`,
    headers: { cookie },
    payload,
  });
}

/** The generation id the SSE stream announced before any delta. */
function streamedGenerationId(body: string): string {
  const match = /event: generation\ndata: (\{.*\})/.exec(body);
  expect(match, body).not.toBeNull();
  return (JSON.parse(match![1]!) as { generationId: string }).generationId;
}

describe("the orchestrator assembles the prompt from resolved definitions", () => {
  it("puts agent and skill instructions plus canon facts in the system prompt, and pins provenance", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeSkill(owner.cookie, workspaceId, "voice", {
      instructions: "Write in close third person.",
    });
    await makeAgent(owner.cookie, workspaceId, "chapter-writer", {
      instructions: "You are the chapter writer.",
      skillKeys: ["voice"],
    });
    const factId = await makeFact(
      owner.cookie,
      workspaceId,
      novelId,
      "Ling Fan",
      "hair-colour",
      "black",
    );

    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "Write the opening scene.",
      novelId,
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { generationId: string; content: string; agentVersionNumber: number };
    expect(body.content).toBe("the chapter text");
    expect(body.agentVersionNumber).toBe(1);

    // The SYSTEM turn holds only instructions — the agent's and the granted
    // skill's (the executor's allowlist semantics). Retrieved text must NOT
    // be here: references are data, not system authority (SECURITY.md), and
    // a reference containing "## Established canon" must not be able to
    // impersonate the orchestrator's own instructions.
    expect(seenPrompts).toHaveLength(1);
    const [system, user] = seenPrompts[0]!.messages;
    expect(system!.role).toBe("system");
    expect(system!.content).toContain("You are the chapter writer.");
    expect(system!.content).toContain("Write in close third person.");
    expect(system!.content).not.toContain("## Established canon");
    expect(system!.content).not.toContain(`[fact:${factId}]`);

    // Retrieved canon reaches the model in the USER turn, fenced as source
    // material, with its provenance id inline and the author's instruction
    // still present unmodified.
    expect(user!.role).toBe("user");
    expect(user!.content).toContain("<context>");
    expect(user!.content).toContain("## Established canon");
    expect(user!.content).toContain(`[fact:${factId}]`);
    expect(user!.content).toContain("Ling Fan hair-colour black");
    expect(user!.content).toContain("Write the opening scene.");

    // Provenance on the settled row: the prompt pin names the exact version
    // that executed, and the snapshot records which facts were injected.
    // NF-WF-003: the snapshot now carries the shared compiler's provenance
    // blocks (the old {facts} shape is the floor, not the ceiling).
    const gen = await db.generation.findUniqueOrThrow({ where: { id: body.generationId } });
    expect(gen.status).toBe("SUCCEEDED");
    expect(gen.task).toBe("agent:chapter-writer");
    expect(gen.promptVersion).toBe("agent:chapter-writer@v1");
    const snapshot = gen.contextSnapshot as Record<string, unknown>;
    expect(snapshot["facts"]).toEqual([factId]);
    expect(snapshot["blocks"]).toBeDefined();
    expect(Array.isArray(snapshot["blocks"])).toBe(true);
  });

  it("passes the agent's profile, temperature and maxTokens to the transport", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "planner", {
      modelProfile: "DEEP_PLANNER",
      temperature: 0.2,
      maxTokens: 512,
    });

    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "planner",
      instruction: "Outline the arc.",
    });
    expect(res.statusCode, res.body).toBe(201);

    // The agent's own generation settings reach the transport, and the
    // ledger records the profile the agent asked for. Without this the
    // spreads in orchestrator.ts could be deleted with every test green.
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]!.temperature).toBe(0.2);
    expect(seenPrompts[0]!.maxTokens).toBe(512);
    const gen = await db.generation.findUniqueOrThrow({
      where: { id: (res.json() as { generationId: string }).generationId },
    });
    expect(gen.modelProfile).toBe("DEEP_PLANNER");
  });

  it("injects retrieved reference text as data, and records its provenance", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    const referenceId = await makeReference(
      owner.cookie,
      workspaceId,
      novelId,
      "style-guide",
      "House style guide",
      "Always open a scene with weather over dialogue.",
    );

    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "Write the opening scene of the storm.",
      novelId,
    });
    expect(res.statusCode, res.body).toBe(201);

    const [system, user] = seenPrompts[0]!.messages;
    // The excerpt reaches the model in the USER turn, quoted as source
    // material, never as system authority.
    expect(user!.content).toContain("## Reference excerpts");
    expect(user!.content).toContain("House style guide");
    expect(user!.content).toContain("Always open a scene with weather over dialogue.");
    expect(system!.content).not.toContain("House style guide");

    // The snapshot records which chunk was injected, so the generation can
    // be explained later without re-running the retriever.
    const gen = await db.generation.findUniqueOrThrow({
      where: { id: (res.json() as { generationId: string }).generationId },
    });
    const snapshot = gen.contextSnapshot as {
      references?: Array<{ referenceId: string }>;
    };
    expect(snapshot.references?.[0]?.referenceId).toBe(referenceId);
  });

  it("uses contextQuery for retrieval when supplied", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    await makeReference(
      owner.cookie,
      workspaceId,
      novelId,
      "style-guide",
      "House style guide",
      "Always open a scene with weather over dialogue.",
    );

    // The instruction shares no terms with the reference; only the override
    // can retrieve it. If contextQuery were ignored the excerpt would be
    // absent — which is the whole point of the field.
    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "zzzz qqqq",
      contextQuery: "weather over dialogue",
      novelId,
    });
    expect(res.statusCode, res.body).toBe(201);
    const [, user] = seenPrompts[0]!.messages;
    expect(user!.content).toContain("House style guide");
  });
});

describe("definition resolution gates execution", () => {
  it("refuses an unpublished agent and an unknown one with a 409", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "draft-agent", {}, false);

    // A DRAFT is mid-edit; pinning a generation to it would make the record
    // unexplainable after the next edit.
    expect(
      (
        await generate(owner.cookie, workspaceId, {
          agentKey: "draft-agent",
          instruction: "x",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await generate(owner.cookie, workspaceId, {
          agentKey: "no-such-agent",
          instruction: "x",
        })
      ).statusCode,
    ).toBe(409);
    // Nothing was generated on either refusal.
    expect(await db.generation.count()).toBe(0);
  });

  it("404s a workspace the caller is not a member of, and 403s a viewer", async () => {
    const owner = await seedUser("owner@example.com");
    const stranger = await seedUser("stranger@example.com");
    const viewer = await seedUser("viewer@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1", {
      userId: viewer.userId,
      role: "VIEWER",
    });
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");

    // A foreign workspace is a 404, not a 403 — the response must not
    // confirm the workspace exists (same rule as the platform services).
    expect(
      (
        await generate(stranger.cookie, workspaceId, {
          agentKey: "chapter-writer",
          instruction: "x",
        })
      ).statusCode,
    ).toBe(404);
    // Membership is not enough: generation:create is the capability, and a
    // VIEWER does not hold it.
    expect(
      (
        await generate(viewer.cookie, workspaceId, {
          agentKey: "chapter-writer",
          instruction: "x",
        })
      ).statusCode,
    ).toBe(403);
    expect(await db.generation.count()).toBe(0);
  });

  it("404s a novel that belongs to another workspace", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    const wsB = await seedWorkspace(other.userId, "wb");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");

    // The caller holds capabilities in THEIR workspace; naming a foreign
    // novel must not reach into the other tenant's canon.
    expect(
      (
        await generate(owner.cookie, workspaceId, {
          agentKey: "chapter-writer",
          instruction: "x",
          novelId: wsB.novelId,
        })
      ).statusCode,
    ).toBe(404);
    expect(await db.generation.count()).toBe(0);

    // Tenancy is checked BEFORE definition resolution. With an agent key
    // that does not exist, a resolution-first order would answer 409; the
    // 404 here is what proves the orchestrator's own novel guard ran and
    // was not merely masked by ai.generate's identical check downstream.
    expect(
      (
        await generate(owner.cookie, workspaceId, {
          agentKey: "no-such-agent",
          instruction: "x",
          novelId: wsB.novelId,
        })
      ).statusCode,
    ).toBe(404);
    expect(await db.generation.count()).toBe(0);
  });

  it("validates the request body", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    expect((await generate(owner.cookie, workspaceId, { agentKey: "", instruction: "" })).statusCode).toBe(400);
    expect(
      (await generate(owner.cookie, workspaceId, { agentKey: "a", instruction: "x", novelId: "nope" }))
        .statusCode,
    ).toBe(400);
  });
});

describe("structured output contracts fail closed", () => {
  it("409s when the model does not return JSON as the contract requires", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
    });
    generatedContent = "prose, not JSON";

    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "extractor",
      instruction: "Summarise.",
    });
    expect(res.statusCode, res.body).toBe(409);
    // The generation ran and was persisted — the refusal is about the
    // OUTPUT, not the request — but nothing was stamped as validated, and
    // the ledger must not keep claiming SUCCEEDED for output the
    // orchestrator refused.
    const gen = await db.generation.findFirstOrThrow({ where: { workspaceId } });
    expect(gen.promptVersion).toBeNull();
    expect(gen.status).toBe("FAILED");
    expect(gen.errorCategory).toBe("DETERMINISTIC");
  });

  it("409s when the JSON parses but violates the contract", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" }, beats: { type: "array" } },
        required: ["summary", "beats"],
        additionalProperties: false,
      },
    });
    // Valid JSON, missing `beats` — the shape the contract exists to refuse.
    generatedContent = JSON.stringify({ summary: "ok" });

    expect(
      (
        await generate(owner.cookie, workspaceId, {
          agentKey: "extractor",
          instruction: "Summarise.",
        })
      ).statusCode,
    ).toBe(409);
    const gen = await db.generation.findFirstOrThrow({ where: { workspaceId } });
    expect(gen.status).toBe("FAILED");
  });

  it("returns the contract-validated object, not a re-parse of the raw text", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
    });
    // Fenced JSON — valid, but NOT parseable by a bare JSON.parse. A caller
    // re-parsing `content` itself would fail here; the orchestrator's own
    // extractor handles it, which is the point of returning `output`.
    generatedContent = '```json\n{"summary":"ok"}\n```';

    const res = await generate(owner.cookie, workspaceId, {
      agentKey: "extractor",
      instruction: "Summarise.",
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((res.json() as { output?: unknown }).output).toEqual({ summary: "ok" });

    // A prose agent carries no `output` — the field means "the contract
    // approved this", not "the model returned a string".
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    const prose = await generate(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "Write.",
    });
    expect(prose.statusCode, prose.body).toBe(201);
    expect(prose.json()).not.toHaveProperty("output");
  });
});

describe("streamed orchestration", () => {
  it("streams deltas, settles SUCCEEDED, and stamps provenance", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    const factId = await makeFact(owner.cookie, workspaceId, novelId, "Ling Fan", "hair-colour", "black");

    const res = await generateStream(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "Write.",
      novelId,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: generation");
    expect(res.body).toContain("streamed ");
    expect(res.body).toContain("event: done");
    expect(res.body).toContain('"status":"SUCCEEDED"');

    // Look the row up by the id the stream announced, not by workspace: the
    // novel context leg embeds a query vector, which writes its own
    // EMBEDDING-profile Generation row first.
    const gen = await db.generation.findUniqueOrThrow({ where: { id: streamedGenerationId(res.body) } });
    expect(gen.status).toBe("SUCCEEDED");
    expect(gen.promptVersion).toBe("agent:chapter-writer@v1");
    // NF-WF-003: the snapshot now carries the shared compiler's provenance
    // blocks (the old {facts} shape is the floor, not the ceiling).
    const snapshot = gen.contextSnapshot as Record<string, unknown>;
    expect(snapshot["facts"]).toEqual([factId]);
    expect(snapshot["blocks"]).toBeDefined();
    expect(Array.isArray(snapshot["blocks"])).toBe(true);
  });

  it("does NOT stamp provenance when the stream breaks mid-output", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer");
    streamFails = true;

    const res = await generateStream(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: "Write.",
    });
    // Headers are already committed, so the failure is an event — with the
    // real outcome, which is INCOMPLETE because content was emitted.
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("event: error");
    expect(res.body).toContain('"status":"INCOMPLETE"');

    const gen = await db.generation.findFirstOrThrow({ where: { workspaceId } });
    expect(gen.status).toBe("INCOMPLETE");
    // A partial generation must not carry the provenance of a complete one.
    expect(gen.promptVersion).toBeNull();
    expect(gen.contextSnapshot).toEqual({});
  });

  it("refuses to stream an agent with a structured output contract", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "w1");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "extractor", {
      modelProfile: "STRUCTURED_EXTRACTOR",
      instructions: "Respond with JSON.",
      outputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    });

    // The contract check would run after the bytes had already left, so the
    // refusal happens before the status code is committed — a real 409, not
    // an SSE error event.
    const res = await generateStream(owner.cookie, workspaceId, {
      agentKey: "extractor",
      instruction: "Summarise.",
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.headers["content-type"]).not.toContain("text/event-stream");
    expect(await db.generation.count()).toBe(0);
  });
});

describe("caller divergence at the HTTP boundary (NF-WF-003 invariant 7, F5)", () => {
  it("POST /generate and a workflow RETRIEVAL run compile the same context blocks", async () => {
    const owner = await seedUser("diverge@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w-diverge");
    await seedRoute();
    await makeAgent(owner.cookie, workspaceId, "chapter-writer", {
      instructions: "You are the chapter writer.",
    });
    await makeFact(owner.cookie, workspaceId, novelId, "Wren", "oath-sworn", "true");

    const query = "Wren's oath";

    // Path 1: the direct generate path.
    const genRes = await generate(owner.cookie, workspaceId, {
      agentKey: "chapter-writer",
      instruction: query,
      novelId,
      contextQuery: query,
    });
    expect(genRes.statusCode, genRes.body).toBe(201);
    const { generationId } = genRes.json() as { generationId: string };
    const gen = await db.generation.findUniqueOrThrow({ where: { id: generationId } });
    const snapshot = gen.contextSnapshot as { blocks: Array<Record<string, unknown>> };

    // Path 2: a real workflow RETRIEVAL step on the same novel.
    const created = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "diverge-check",
        name: "diverge-check",
        graph: {
          steps: [{ key: "lookup", kind: "RETRIEVAL", instruction: query }],
          edges: [],
        },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { id: workflowId } = created.json() as { id: string };
    const published = await app.inject({
      method: "POST",
      url: `/api/workflows/${workflowId}/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(published.statusCode, published.body).toBe(200);
    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: { novelId },
    });
    expect(run.statusCode, run.body).toBe(202);
    const { id: runId } = run.json() as { id: string };

    // NF-WF-004: the RETRIEVAL step now executes off-request, on the
    // worker. Drive it through the shared executor and read the result
    // back through the route.
    const driven = await driver.driveRun(runId);
    expect(driven.claimed).toBe(true);
    const fetched = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
      headers: { cookie: owner.cookie },
    });
    expect(fetched.statusCode, fetched.body).toBe(200);
    const runBody = fetched.json() as {
      status: string;
      output: Record<string, { blocks: Array<Record<string, unknown>> }>;
    };
    expect(runBody.status).toBe("SUCCEEDED");
    const stepBlocks = runBody.output["lookup"]!.blocks;

    // One compiler, two callers: identical tier selection and provenance
    // for the same story state. If either caller grew its own selection
    // loop again, these shapes would diverge.
    expect(stepBlocks).toEqual(snapshot["blocks"]);
  });
});
