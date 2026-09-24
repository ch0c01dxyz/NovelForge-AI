/**
 * /api/auth integration tests via fastify.inject against the live compose
 * PostgreSQL (dedicated novelforge_test_api db — parallel-safe per
 * ADR-0003). Covers register -> login -> session -> logout, invalid
 * input, bad credentials, duplicate email, and cookie flags.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";

const TEST_DB = "novelforge_test_api";
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
  APP_ENCRYPTION_KEY: "test",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

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
  app = await buildApp(env, { db });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE audit_logs, novel_settings, novels, memberships, sessions, workspaces, users RESTART IDENTITY CASCADE`,
  );
  // Rate-limit state persists across tests in one app instance; reset it.
  // (fastify-rate-limit in-memory store: clear by recreating is heavy —
  // tests stay under the per-route limits instead.)
});

const uniqueEmail = () => `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201 with userId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: uniqueEmail(), password: "pw12345678", displayName: "A" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toMatch(/^[0-9a-f-]{36}$/);
  }, 30_000);

  it("rejects invalid input with 400 (short password, bad email)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short", displayName: "A" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "INVALID_INPUT" });
  });

  it("rejects duplicate email with 409", async () => {
    const email = uniqueEmail();
    const body = { email, password: "pw12345678", displayName: "A" };
    await app.inject({ method: "POST", url: "/api/auth/register", payload: body });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: body });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "EMAIL_TAKEN" });
  }, 30_000);
});

describe("POST /api/auth/login + session cookie", () => {
  it("sets an HttpOnly SameSite=Lax session cookie on success; body has no token", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "pw12345678", displayName: "L" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "pw12345678" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(cookieStr).toContain(SESSION_COOKIE);
    expect(cookieStr.toLowerCase()).toContain("httponly");
    expect(cookieStr.toLowerCase()).toContain("samesite=lax");
    // Dev/test: not Secure. Production sets Secure (ADR-0002 §6).
    expect(cookieStr.toLowerCase()).not.toContain("secure");
  }, 30_000);

  it("wrong password and unknown email both return 401 INVALID_CREDENTIALS", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "pw12345678", displayName: "L" },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrongpassword" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "INVALID_CREDENTIALS" });

    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: `ghost-${Date.now()}@example.com`, password: "pw12345678" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ error: "INVALID_CREDENTIALS" });
  }, 30_000);
});

describe("GET /api/auth/session + POST /api/auth/logout", () => {
  it("full round-trip: session valid with cookie, 401 without, logout revokes", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "pw12345678", displayName: "S" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "pw12345678" },
    });
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie).toBeDefined();

    // No cookie -> 401.
    const anon = await app.inject({ method: "GET", url: "/api/auth/session" });
    expect(anon.statusCode).toBe(401);

    // With cookie -> 200 and a userId.
    const sess = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [SESSION_COOKIE]: cookie.value },
    });
    expect(sess.statusCode).toBe(200);
    expect(sess.json().userId).toMatch(/^[0-9a-f-]{36}$/);

    // Logout clears the cookie and revokes server-side.
    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [SESSION_COOKIE]: cookie.value },
    });
    expect(out.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [SESSION_COOKIE]: cookie.value },
    });
    expect(after.statusCode).toBe(401);
  }, 30_000);
});
