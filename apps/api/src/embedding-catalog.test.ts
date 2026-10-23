import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import pg from "pg";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createAuthService, generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { GatewayError, type AIGateway, type GatewayRecord } from "../../../packages/ai-core/index.ts";
import { createAiServices } from "../../../packages/ai-services/src/ai.ts";
import { createGatewayRegistry } from "../../../packages/ai-services/src/ai-registry.ts";
import { createAuditService } from "../../../packages/ai-services/src/audit.ts";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";

// Exercise this isolated checkout's manager through the existing package boundary.
vi.mock("@novelforge/ai-core", async () => import("../../../packages/ai-core/index.ts"));

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DB_ROOT = path.join(ROOT, "packages/database");
const TEST_DB = `novelforge_test_embedding_catalog_${process.pid}`;
const databaseUrl = new URL(resolveTestDatabaseUrl({ envPath: path.join(ROOT, ".env") }));
const adminUrl = new URL(databaseUrl); adminUrl.pathname = "/postgres";
databaseUrl.pathname = `/${TEST_DB}`;
let owned = false;
let db: NovelForgeDb;
let app: FastifyInstance;
let services: ReturnType<typeof createAiServices>;
let embeddingUnavailable = false;
let embeddingCalls = 0;
let textCalls = 0;
const EMBEDDING_MODEL = "provider/text-and-embedding";

function gateway(row: GatewayRecord): AIGateway {
  return {
    id: row.id, name: row.name,
    async listModels() { textCalls++; return [{ modelId: "provider/chat", capabilities: ["chat"] }, { modelId: EMBEDDING_MODEL, capabilities: ["chat"] }]; },
    async listEmbeddingModels() {
      embeddingCalls++;
      if (embeddingUnavailable) throw new GatewayError("TRANSIENT", "private upstream failure");
      return [{ modelId: EMBEDDING_MODEL, capabilities: ["embeddings"], displayName: "Embedding model" }];
    },
    async generate() { throw new Error("catalog tests must not generate text"); },
    // eslint-disable-next-line require-yield
    async *generateStream() { throw new Error("catalog tests must not stream text"); },
    async embed() { throw new Error("catalog tests must not call inference"); },
    async healthCheck() { return { healthy: true, category: null }; },
  };
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: adminUrl.toString() }); await admin.connect();
  try { await admin.query(`CREATE DATABASE ${TEST_DB}`); owned = true; } finally { await admin.end(); }
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: DB_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl.toString() }, stdio: "pipe",
  });
  db = createDb(databaseUrl.toString());
  services = createAiServices({ db, registry: createGatewayRegistry(db, "fixture-encryption"), encryptionKey: "fixture-encryption", audit: createAuditService(db), createGateway: gateway });
  app = Fastify(); await app.register(cookie);
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { code?: string }).code;
    return reply.code(code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : code === "BAD_GATEWAY" ? 502 : 500).send({ error: code ?? "INTERNAL_ERROR" });
  });
  registerAiRoutes(app, {
    services, auth: createAuthService({ users: prismaUserStore(db), sessions: prismaSessionStore(db) }),
    platformRoleOf: async id => (await db.user.findUniqueOrThrow({ where: { id }, select: { platformRole: true } })).platformRole,
  });
});
beforeEach(() => { embeddingUnavailable = false; embeddingCalls = 0; textCalls = 0; });
afterAll(async () => {
  await app?.close(); await db?.$disconnect();
  if (owned) {
    const admin = new pg.Client({ connectionString: adminUrl.toString() }); await admin.connect();
    try { await admin.query(`DROP DATABASE ${TEST_DB}`); } finally { await admin.end(); }
  }
});

async function seed() {
  async function user(platformRole: "SUPER_ADMIN" | null) {
    const row = await db.user.create({ data: { email: `${randomUUID()}@embedding.test`, passwordHash: "fixture-not-a-login", displayName: "Embedding fixture", platformRole } });
    const token = generateSessionToken(); await db.session.create({ data: { userId: row.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { ...row, cookie: `nf_session=${token}` };
  }
  const admin = await user("SUPER_ADMIN"), author = await user(null);
  const workspace = await db.workspace.create({ data: { name: "Embedding fixture", slug: randomUUID(), ownerId: author.id } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: author.id, role: "OWNER" } });
  const { id } = await services.createGateway({ actorPlatformRole: "SUPER_ADMIN", actorUserId: admin.id, name: randomUUID(), baseUrl: "http://gateway.test", apiKey: "fixture-key" });
  const actor = { actorPlatformRole: "SUPER_ADMIN" as const, actorUserId: admin.id };
  return { admin, author, workspaceId: workspace.id, gatewayId: id, actor };
}

describe("audited embedding catalog", () => {
  it("requires a real SUPER_ADMIN and validates gateway identity before the dedicated sync", async () => {
    const f = await seed(); const url = `/api/gateways/${f.gatewayId}/sync-embedding-models`;
    expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, headers: { cookie: f.author.cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/gateways/invalid/sync-embedding-models", headers: { cookie: f.admin.cookie } })).statusCode).toBe(400);
    expect(embeddingCalls).toBe(0);
    const response = await app.inject({ method: "POST", url, headers: { cookie: f.admin.cookie } });
    expect(response.statusCode, response.body).toBe(200); expect(response.json()).toEqual({ discovered: 1 });
    expect(embeddingCalls).toBe(1); expect(textCalls).toBe(0);
    expect(await db.aIModel.findUniqueOrThrow({ where: { gatewayId_modelId: { gatewayId: f.gatewayId, modelId: EMBEDDING_MODEL } } })).toMatchObject({ capabilities: ["embeddings"], enabled: true });
    expect(await db.auditLog.findFirstOrThrow({ where: { entityId: f.gatewayId, action: "models.synced" } })).toMatchObject({ actorUserId: f.admin.id, payload: { discovered: 1, kind: "embedding" } });
    expect(response.body).not.toMatch(/credential|fixture-key|baseUrl/);
  });

  it("uses the embedding catalog for admin/author choices without creating rows on GET or treating text as embeddings", async () => {
    const f = await seed();
    const adminUrl = "/api/model-catalog?profile=EMBEDDING";
    const before = await app.inject({ method: "GET", url: adminUrl, headers: { cookie: f.admin.cookie } });
    expect(before.statusCode).toBe(200);
    expect(before.json().find((row: { gatewayId: string }) => row.gatewayId === f.gatewayId)).toMatchObject({ providerModelId: EMBEDDING_MODEL, modelRef: null, selectable: false, unavailableReason: "NOT_SYNCED" });
    expect(await db.aIModel.count({ where: { gatewayId: f.gatewayId } })).toBe(0);
    await services.syncModels({ ...f.actor, gatewayId: f.gatewayId, kind: "embedding" });
    const model = await db.aIModel.findUniqueOrThrow({ where: { gatewayId_modelId: { gatewayId: f.gatewayId, modelId: EMBEDDING_MODEL } } });
    const map = await app.inject({ method: "PUT", url: "/api/model-profiles", headers: { cookie: f.admin.cookie }, payload: { profile: "EMBEDDING", modelId: model.id } });
    expect(map.statusCode, map.body).toBe(200);
    const authorUrl = `/api/workspaces/${f.workspaceId}/model-catalog?profile=EMBEDDING`;
    const choices = await app.inject({ method: "GET", url: authorUrl, headers: { cookie: f.author.cookie } });
    expect(choices.statusCode).toBe(200); expect(choices.json()).toHaveLength(1);
    expect(choices.json()[0]).toMatchObject({ providerModelId: EMBEDDING_MODEL, selectable: true });
    expect(textCalls).toBe(0);
    await services.syncModels({ ...f.actor, gatewayId: f.gatewayId });
    const chat = await db.aIModel.findUniqueOrThrow({ where: { gatewayId_modelId: { gatewayId: f.gatewayId, modelId: "provider/chat" } } });
    const refused = await app.inject({ method: "PUT", url: "/api/model-profiles", headers: { cookie: f.admin.cookie }, payload: { profile: "EMBEDDING", modelId: chat.id } });
    expect(refused.statusCode, refused.body).toBe(409);
    expect(await db.modelProfileMapping.count({ where: { profile: "EMBEDDING", modelRef: chat.id } })).toBe(0);
    await db.modelProfileMapping.create({ data: { profile: "EMBEDDING", modelRef: chat.id, enabled: true } });
    const disabled = await app.inject({ method: "PUT", url: "/api/model-profiles", headers: { cookie: f.admin.cookie }, payload: { profile: "EMBEDDING", modelId: chat.id, enabled: false } });
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect((await db.modelProfileMapping.findUniqueOrThrow({ where: { profile_modelRef: { profile: "EMBEDDING", modelRef: chat.id } } })).enabled).toBe(false);
  });

  it("preserves modality/observed markers and disabled state across embedding and ordinary text refreshes", async () => {
    const f = await seed();
    const retained = ["chat", "image-generation", "embeddings", "nf:json_object=ok", "nf:image-output=incompatible"];
    const row = await db.aIModel.create({ data: { gatewayId: f.gatewayId, modelId: EMBEDDING_MODEL, capabilities: retained, enabled: false, contextWindow: 32768 } });
    const disabledGemini = await db.aIModel.create({ data: { gatewayId: f.gatewayId, modelId: "gemini/disabled-fixture", capabilities: ["chat"], enabled: false } });
    await services.syncModels({ ...f.actor, gatewayId: f.gatewayId, kind: "embedding" });
    const refreshed = await db.aIModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(refreshed.contextWindow).toBe(32768);
    expect(refreshed.enabled).toBe(false); expect(refreshed.capabilities).toEqual(expect.arrayContaining(retained));
    await services.syncModels({ ...f.actor, gatewayId: f.gatewayId });
    expect((await db.aIModel.findUniqueOrThrow({ where: { id: row.id } })).capabilities).toEqual(expect.arrayContaining(retained));
    expect(await db.aIModel.findUniqueOrThrow({ where: { id: disabledGemini.id } })).toEqual(disabledGemini);
    expect(await db.generation.count()).toBe(0);
  });

  it("failed embedding discovery is audited and fails safely without a text fallback or model deletion", async () => {
    const f = await seed();
    await services.syncModels({ ...f.actor, gatewayId: f.gatewayId, kind: "embedding" });
    const before = await db.aIModel.findMany({ where: { gatewayId: f.gatewayId } });
    embeddingUnavailable = true;
    const response = await app.inject({ method: "POST", url: `/api/gateways/${f.gatewayId}/sync-embedding-models`, headers: { cookie: f.admin.cookie } });
    expect(response.statusCode, response.body).toBe(502);
    expect(await db.aIModel.findMany({ where: { gatewayId: f.gatewayId } })).toEqual(before);
    expect(textCalls).toBe(0);
    expect(await db.auditLog.findFirstOrThrow({ where: { entityId: f.gatewayId, action: "models.sync-failed" } })).toMatchObject({ payload: { category: "TRANSIENT", kind: "embedding" } });
    const catalog = await app.inject({ method: "GET", url: "/api/model-catalog?profile=EMBEDDING", headers: { cookie: f.admin.cookie } });
    expect(catalog.statusCode).toBe(502); expect(catalog.body).not.toContain("private upstream failure");
    expect(textCalls).toBe(0);
  });
});
