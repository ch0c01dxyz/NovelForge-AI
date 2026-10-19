import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL required for dedicated cover test database");
const TEST_DB = "novelforge_test_novel_cover";
const dbUrl = (database: string) => { const u = new URL(BASE_URL); u.pathname = `/${database}`; return u.toString(); };
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_ROOT = path.join(HERE, "../../../packages/database");
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=";
const payload = { mimeType: "image/png", dataBase64: png, sourceName: "cover.png" };
let db: NovelForgeDb;
let app: FastifyInstance;
let cookie: string;
let userId: string;
let workspaceId: string;
let novelId: string;
let sequence = 0;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: dbUrl("postgres") });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [TEST_DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: DB_ROOT, stdio: "pipe", env: { ...process.env, DATABASE_URL: dbUrl(TEST_DB) },
  });
  db = createDb(dbUrl(TEST_DB));
  const env: Env = { NODE_ENV: "test", PORT: 3000, DATABASE_URL: dbUrl(TEST_DB), REDIS_URL: "redis://localhost:6379",
    S3_ENDPOINT: "http://localhost:9000", S3_REGION: "us-east-1", S3_BUCKET: "novelforge", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test",
    OMNIROUTE_BASE_URL: "http://localhost:20128", OMNIROUTE_API_KEY: "test", APP_ENCRYPTION_KEY: "test", AI_ROUTING_STRATEGY: "PRIORITY" };
  app = await buildApp(env, { db });
}, 120_000);
afterAll(async () => { await app?.close(); await db?.$disconnect(); });

async function actor(role?: "VIEWER") {
  const user = await db.user.create({ data: { email: `cover-${++sequence}@example.test`, passwordHash: "not-used", displayName: "Cover tester" } });
  const token = generateSessionToken();
  await db.session.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  if (role) await db.membership.create({ data: { workspaceId, userId: user.id, role } });
  return { userId: user.id, cookie: token };
}
function request(method: "GET" | "PUT" | "POST", url: string, body?: object, token: string | null = cookie) {
  return app.inject({ method, url, ...(body ? { payload: body } : {}), ...(token ? { cookies: { [SESSION_COOKIE]: token } } : {}) });
}
const base = () => `/api/workspaces/${workspaceId}/novels/${novelId}`;
beforeEach(async () => {
  const owner = await actor();
  cookie = owner.cookie; userId = owner.userId;
  workspaceId = (await request("POST", "/api/workspaces", { name: "Cover test", slug: `cover-${sequence}` })).json().id;
  novelId = (await request("POST", `/api/workspaces/${workspaceId}/novels`, { title: "Covered story", slug: "covered-story" })).json().id;
});

describe("authenticated novel cover configuration", () => {
  it("stores bytes exactly, preserves sibling settings, audits metadata and returns only cover URLs in novel views", async () => {
    await db.novelSettings.update({ where: { novelId }, data: { settings: { scaleS3: { enabled: true }, unrelated: "preserve" } } });
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
    const put = await request("PUT", `${base()}/cover`, payload);
    expect(put.statusCode).toBe(200);
    expect(put.json().sha256).toMatch(/^[a-f0-9]{64}$/);
    const image = await request("GET", put.json().coverUrl);
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload.equals(Buffer.from(png, "base64"))).toBe(true);
    expect(image.headers).toMatchObject({ "content-type": "image/png", "x-content-type-options": "nosniff", "cache-control": "private, no-store", "content-disposition": "inline" });
    const row = await db.novelSettings.findUniqueOrThrow({ where: { novelId } });
    expect(row.settings).toMatchObject({ scaleS3: { enabled: true }, unrelated: "preserve", cover: { ...payload, sha256: put.json().sha256 } });
    for (const url of [base(), "/api/novels", `/api/workspaces/${workspaceId}/novels`]) {
      const response = await request("GET", url);
      expect(response.statusCode).toBe(200);
      const view = Array.isArray(response.json()) ? response.json().find((n: { id: string }) => n.id === novelId) : response.json();
      expect(view.coverUrl).toBe(put.json().coverUrl);
      expect(response.body).not.toContain(png);
      expect(response.body).not.toContain("dataBase64");
    }
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: novelId, action: "novel.cover-updated" } });
    expect(audit.payload).toMatchObject({ sha256: put.json().sha256, previousSha256: null, mimeType: "image/png", bytes: Buffer.from(png, "base64").length });
    expect(JSON.stringify(audit)).not.toContain(png);
  });

  it("enforces session, tenant membership, UUIDs and write capability", async () => {
    for (const method of ["GET", "PUT"] as const) {
      expect((await request(method, `${base()}/cover`, method === "PUT" ? payload : undefined, null)).statusCode).toBe(401);
    }
    const outsider = await actor();
    const viewer = await actor("VIEWER");
    expect((await request("PUT", `${base()}/cover`, payload, outsider.cookie)).statusCode).toBe(404);
    expect((await request("PUT", `${base()}/cover`, payload, viewer.cookie)).statusCode).toBe(403);
    expect((await request("PUT", `${base()}/cover`, payload)).statusCode).toBe(200);
    expect((await request("GET", `${base()}/cover`, undefined, outsider.cookie)).statusCode).toBe(404);
    expect((await request("GET", `${base()}/cover`, undefined, viewer.cookie)).statusCode).toBe(200);
    expect((await request("GET", `/api/workspaces/${workspaceId}/novels/not-a-uuid/cover`)).statusCode).toBe(400);
    const otherWorkspace = (await request("POST", "/api/workspaces", { name: "Other", slug: `other-${sequence}` })).json().id;
    for (const method of ["GET", "PUT"] as const) expect((await request(method, `/api/workspaces/${otherWorkspace}/novels/${novelId}/cover`, method === "PUT" ? payload : undefined)).statusCode).toBe(404);
  });

  it("rejects invalid encodings, unsafe types, signatures and oversized bodies without storing a cover", async () => {
    for (const bad of [
      { ...payload, dataBase64: png + "\n" }, { ...payload, mimeType: "image/jpeg" },
      { ...payload, sourceName: "../cover.png" }, { ...payload, mimeType: "image/svg+xml" },
      { ...payload, dataBase64: Buffer.alloc(512 * 1024 + 1).toString("base64") },
      { ...payload, sha256: "client-controlled" },
    ]) expect((await request("PUT", `${base()}/cover`, bad)).statusCode).toBe(400);
    expect((await request("PUT", `${base()}/cover`, { ...payload, dataBase64: "A".repeat(800_000) })).statusCode).toBe(413);
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
  });

  it("rolls back the settings write if its transaction audit fails", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION refuse_cover_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'novel.cover-updated' THEN RAISE EXCEPTION 'test refusal'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER refuse_cover_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION refuse_cover_audit()`);
    try {
      expect((await request("PUT", `${base()}/cover`, payload)).statusCode).toBe(500);
      expect((await db.novelSettings.findUniqueOrThrow({ where: { novelId } })).settings).toEqual({});
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER refuse_cover_audit ON audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION refuse_cover_audit()");
    }
    expect(await db.auditLog.count({ where: { actorUserId: userId, action: "novel.cover-updated" } })).toBe(0);
  });
});
