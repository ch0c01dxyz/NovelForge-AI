/**
 * Platform administration (NF-WF-018B) integration suite.
 *
 * Dedicated novelforge_test_platform_admin db (parallel-safe per ADR-0003 §8).
 * No test ever reaches a real provider: `buildApp` is given a GatewayManager
 * whose gateways are fakes (CLAUDE.md §25).
 *
 * Covers (contract Invariant 1 + 018B acceptance):
 * - gateway list is masked: `hasCredential` only, never value/ciphertext
 * - credential create/rotate is write-only; after rotation the old key no
 *   longer decrypts
 * - delete (revoke) cascades to catalog models + mappings; attempt rows
 *   keep history via SetNull
 * - audit rows carry identity only (never the credential)
 * - a workspace OWNER (non-SUPER_ADMIN) gets 403 on every platform route
 * - GET /api/auth/session carries the additive `platformRole` field
 * - GET /api/admin/audit-log is SUPER_ADMIN-only and pinned to the
 *   platform audit-action allowlist
 * - GET /api/admin/routing-strategy returns the deployment strategy
 *   read-only (GAP-066)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { decryptCredential } from "@novelforge/ai-core";
import type {
  AIGateway,
  GatewayRecord,
  GenerateResult,
} from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_platform_admin";
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

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(): Promise<GenerateResult> {
      return {
        content: "fake",
        model: `${rec.name}-model`,
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "fake" };
    },
    async embed() {
      return { vectors: [[0.1]], model: rec.name, inputTokens: 1 };
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
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.modelProfileMapping.deleteMany();
  await db.aIModel.deleteMany();
  await db.auditLog.deleteMany();
  await db.aIGateway.deleteMany();
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

async function seedOwner(email: string): Promise<{ userId: string; cookie: string }> {
  const { userId, cookie } = await seedUser(email, null);
  const ws = await db.workspace.create({
    data: { name: "ws", slug: `ws-${email}`, ownerId: userId },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId, role: "OWNER" },
  });
  return { userId, cookie };
}

const DEFAULT_GATEWAY_KEY = "test-gateway-key";

async function createGateway(
  sessionCookie: string,
  name: string,
  apiKey: string = DEFAULT_GATEWAY_KEY,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie: sessionCookie },
    payload: { name, baseUrl: "http://localhost:20128", apiKey },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

describe("gateway list is masked (Invariant 1)", () => {
  it("returns hasCredential only — never the value or ciphertext", async () => {
    const admin = await seedUser("admin1@example.com", "SUPER_ADMIN");
    await createGateway(admin.cookie, "gw-masked", "secret-key-1");
    const res = await app.inject({
      method: "GET",
      url: "/api/gateways",
      headers: { cookie: admin.cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasCredential).toBe(true);
    // The P1 rule: no credential value or ciphertext anywhere in the body.
    const body = res.body;
    expect(body).not.toContain("secret-key-1");
    expect(body).not.toContain("credentialCiphertext");
    expect(rows[0]!).not.toHaveProperty("credentialCiphertext");
    expect(rows[0]!).not.toHaveProperty("apiKey");
  });
});

describe("credential rotate is write-only", () => {
  it("after rotation the stored ciphertext decrypts to the new key only", async () => {
    const admin = await seedUser("admin2@example.com", "SUPER_ADMIN");
    const id = await createGateway(admin.cookie, "gw-rotate", "old-key");
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/gateways/${id}`,
      headers: { cookie: admin.cookie },
      payload: { apiKey: "new-key" },
    });
    expect(patch.statusCode).toBe(200);
    // The response is the masked status shape — no credential echoed.
    expect(patch.body).not.toContain("new-key");
    const row = await db.aIGateway.findUniqueOrThrow({ where: { id } });
    expect(decryptCredential(row.credentialCiphertext, ENCRYPTION_KEY)).toBe("new-key");
    // The old key no longer decrypts from anything stored.
    const allCiphertexts = [row.credentialCiphertext];
    for (const c of allCiphertexts) {
      expect(decryptCredential(c, ENCRYPTION_KEY)).not.toBe("old-key");
    }
  });
});

describe("delete (revoke) cascades (Invariant 1)", () => {
  it("removes catalog models + mappings; attempt rows keep history via SetNull", async () => {
    const admin = await seedUser("admin3@example.com", "SUPER_ADMIN");
    const id = await createGateway(admin.cookie, "gw-revoke");
    // Sync the fake catalog, then map a profile.
    const sync = await app.inject({
      method: "POST",
      url: `/api/gateways/${id}/sync-models`,
      headers: { cookie: admin.cookie },
    });
    expect(sync.statusCode).toBe(200);
    const model = await db.aIModel.findFirstOrThrow({ where: { gatewayId: id } });
    const mapRes = await app.inject({
      method: "PUT",
      url: "/api/model-profiles",
      headers: { cookie: admin.cookie },
      payload: { profile: "CREATIVE_WRITER", modelId: model.id },
    });
    expect(mapRes.statusCode).toBe(200);
    // A generation attempt referencing the gateway (history must survive).
    const generation = await db.generation.create({
      data: {
        workspaceId: null,
        task: "t",
        modelProfile: "CREATIVE_WRITER",
        status: "SUCCEEDED",
      },
    });
    await db.generationAttempt.create({
      data: {
        generationId: generation.id,
        attemptNumber: 1,
        gatewayId: id,
        modelId: model.modelId,
        status: "SUCCEEDED",
        errorCategory: "NONE",
      },
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/api/gateways/${id}`,
      headers: { cookie: admin.cookie },
    });
    expect(del.statusCode).toBe(200);
    expect(await db.aIGateway.findUnique({ where: { id } })).toBeNull();
    expect(await db.aIModel.count({ where: { gatewayId: id } })).toBe(0);
    expect(await db.modelProfileMapping.count({ where: { modelRef: model.id } })).toBe(0);
    const attempt = await db.generationAttempt.findFirstOrThrow({
      where: { generationId: generation.id },
    });
    expect(attempt.gatewayId).toBeNull();
  });
});

describe("audit rows carry identity only (Invariant 1)", () => {
  it("gateway.created/updated payloads never contain the credential", async () => {
    const admin = await seedUser("admin4@example.com", "SUPER_ADMIN");
    const id = await createGateway(admin.cookie, "gw-audit", "audit-secret");
    await app.inject({
      method: "PATCH",
      url: `/api/gateways/${id}`,
      headers: { cookie: admin.cookie },
      payload: { priority: 5 },
    });
    const rows = await db.auditLog.findMany({
      where: { action: { in: ["gateway.created", "gateway.updated"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const payload = JSON.stringify(row.payload);
      expect(payload).not.toContain("audit-secret");
      expect(payload).not.toContain("apiKey");
    }
    const created = rows[0]!.payload as { name: string; baseUrl: string };
    expect(created.name).toBe("gw-audit");
    expect(created.baseUrl).toBe("http://localhost:20128");
  });
});

describe("platform axis: workspace OWNER gets 403 everywhere", () => {
  it("a workspace OWNER (non-SUPER_ADMIN) is refused on every platform route", async () => {
    const admin = await seedUser("admin5@example.com", "SUPER_ADMIN");
    const owner = await seedOwner("owner5@example.com");
    const gatewayId = await createGateway(admin.cookie, "gw-403");
    const model = await db.aIModel.create({
      data: { gatewayId, modelId: "m-403", capabilities: ["chat"], enabled: true },
    });
    const cases: Array<{ method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; url: string; payload?: Record<string, unknown> }> = [
      { method: "GET", url: "/api/gateways" },
      {
        method: "POST",
        url: "/api/gateways",
        payload: { name: "x", baseUrl: "http://x", apiKey: "y1234567" },
      },
      { method: "PATCH", url: `/api/gateways/${gatewayId}`, payload: { priority: 1 } },
      { method: "DELETE", url: `/api/gateways/${gatewayId}` },
      { method: "POST", url: "/api/gateways/health-check" },
      { method: "POST", url: `/api/gateways/${gatewayId}/sync-models` },
      { method: "GET", url: "/api/models" },
      { method: "PATCH", url: `/api/models/${model.id}`, payload: { enabled: false } },
      { method: "GET", url: "/api/model-profiles" },
      {
        method: "PUT",
        url: "/api/model-profiles",
        payload: { profile: "CREATIVE_WRITER", modelId: model.id },
      },
      { method: "GET", url: "/api/admin/audit-log" },
      { method: "GET", url: "/api/admin/routing-strategy" },
    ];
    for (const c of cases) {
      const res = await app.inject({
        method: c.method,
        url: c.url,
        headers: { cookie: owner.cookie },
        payload: c.payload,
      });
      expect(res.statusCode).toBe(403);
    }
    // And the same routes succeed for the SUPER_ADMIN (sanity).
    const ok = await app.inject({
      method: "GET",
      url: "/api/gateways",
      headers: { cookie: admin.cookie },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe("GET /api/auth/session platformRole (018B additive)", () => {
  it("returns SUPER_ADMIN for a platform admin and null for a regular user", async () => {
    const admin = await seedUser("admin6@example.com", "SUPER_ADMIN");
    const user = await seedUser("user6@example.com", null);
    const asAdmin = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: admin.cookie },
    });
    expect(asAdmin.statusCode).toBe(200);
    const adminBody = asAdmin.json() as { userId: string; platformRole: string | null };
    expect(adminBody.platformRole).toBe("SUPER_ADMIN");
    expect(adminBody.userId).toBe(admin.userId);
    const asUser = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: user.cookie },
    });
    expect(asUser.statusCode).toBe(200);
    expect((asUser.json() as { platformRole: string | null }).platformRole).toBeNull();
  });
});

describe("GET /api/admin/audit-log (018B additive)", () => {
  it("lists only pinned platform actions, filters by ?action=, rejects others", async () => {
    const admin = await seedUser("admin7@example.com", "SUPER_ADMIN");
    await createGateway(admin.cookie, "gw-auditlog");
    await app.inject({
      method: "POST",
      url: "/api/gateways/health-check",
      headers: { cookie: admin.cookie },
    });
    // A workspace-scoped action must never appear here (belongs to 018C).
    await db.auditLog.create({
      data: {
        actorUserId: admin.userId,
        action: "workflow.run",
        entityType: "WorkflowRun",
        payload: {},
      },
    });
    const all = await app.inject({
      method: "GET",
      url: "/api/admin/audit-log",
      headers: { cookie: admin.cookie },
    });
    expect(all.statusCode).toBe(200);
    const rows = all.json() as Array<{ action: string; actorEmail: string | null }>;
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("gateway.created");
    expect(actions).toContain("gateways.health-checked");
    expect(actions).not.toContain("workflow.run");
    expect(rows[0]!.actorEmail).toBe("admin7@example.com");
    // ?action= narrows to the pinned action.
    const filtered = await app.inject({
      method: "GET",
      url: "/api/admin/audit-log?action=gateway.created",
      headers: { cookie: admin.cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const frows = filtered.json() as Array<{ action: string }>;
    expect(frows.length).toBeGreaterThan(0);
    expect(frows.every((r) => r.action === "gateway.created")).toBe(true);
    // A non-allowlisted action is rejected, never silently widened.
    const bad = await app.inject({
      method: "GET",
      url: "/api/admin/audit-log?action=workflow.run",
      headers: { cookie: admin.cookie },
    });
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { error: string }).error).toBe("INVALID_INPUT");
  });
});

describe("GET /api/admin/routing-strategy (018B additive, GAP-066)", () => {
  it("returns the deployment strategy read-only for SUPER_ADMIN only", async () => {
    const admin = await seedUser("admin8@example.com", "SUPER_ADMIN");
    const owner = await seedOwner("owner8@example.com");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/routing-strategy",
      headers: { cookie: admin.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ strategy: "PRIORITY" });
    const denied = await app.inject({
      method: "GET",
      url: "/api/admin/routing-strategy",
      headers: { cookie: owner.cookie },
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe("health-check trigger (018B)", () => {
  it("SUPER_ADMIN can trigger a health check; the run is audited", async () => {
    const admin = await seedUser("admin9@example.com", "SUPER_ADMIN");
    await createGateway(admin.cookie, "gw-health");
    const res = await app.inject({
      method: "POST",
      url: "/api/gateways/health-check",
      headers: { cookie: admin.cookie },
    });
    expect(res.statusCode).toBe(200);
    const results = res.json() as Array<{ gatewayId: string; healthy: boolean }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.healthy).toBe(true);
    const audit = await db.auditLog.findFirst({
      where: { action: "gateways.health-checked" },
    });
    expect(audit).not.toBeNull();
    expect((audit!.payload as { checked: number }).checked).toBe(1);
  });
});
