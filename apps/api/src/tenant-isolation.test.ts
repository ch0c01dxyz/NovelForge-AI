/**
 * NF-1005 Phase 1 exit gate: tenant isolation at the HTTP route level.
 * Dedicated novelforge_test_isolation db (parallel-safe per ADR-0003 §8).
 * Sessions are seeded directly (generateSessionToken + hashed row) so the
 * suite never touches register/login rate limits.
 *
 * Gate assertions (ADR-0002, ADR-0004):
 * - unauthenticated requests are 401 on every platform route
 * - non-members get 404 (never 403) for another tenant's workspace/novel
 * - removed members lose access immediately
 * - revoked sessions lose access immediately
 * - VIEWER is read-only at the route level
 * - GET /api/novels is session-scoped to the actor's own workspaces
 * - mutations via routes are audited with workspaceId scoping
 */
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

const TEST_DB = "novelforge_test_isolation";
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
});

let emailN = 0;
/** Seed a user plus a live session; returns the session cookie value. */
async function seedUser(name = "U"): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: {
      email: `iso${++emailN}-${Date.now()}@example.com`,
      passwordHash: "x",
      displayName: name,
    },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { userId: user.id, cookie: token };
}

function as(cookie: string) {
  return { [SESSION_COOKIE]: cookie };
}

async function api(
  cookie: string | null,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload } : {}),
    ...(cookie ? { cookies: as(cookie) } : {}),
  });
}

async function makeWorkspace(ownerCookie: string, slug: string): Promise<string> {
  const res = await api(ownerCookie, "POST", "/api/workspaces", { name: slug, slug });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function makeNovel(cookie: string, wsId: string, slug: string): Promise<string> {
  const res = await api(cookie, "POST", `/api/workspaces/${wsId}/novels`, {
    title: slug,
    slug,
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe("authentication gate", () => {
  it("every platform route is 401 without a session cookie", async () => {
    const probes = [
      ["POST", "/api/workspaces"],
      ["GET", "/api/workspaces/00000000-0000-0000-0000-000000000000"],
      ["GET", "/api/workspaces/00000000-0000-0000-0000-000000000000/members"],
      ["GET", "/api/novels"],
    ] as const;
    for (const [method, url] of probes) {
      const res = await api(null, method, url);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "UNAUTHENTICATED" });
    }
  }, 30_000);

  it("a revoked session loses access immediately", async () => {
    const owner = await seedUser();
    const wsId = await makeWorkspace(owner.cookie, "revoke-ws");
    expect((await api(owner.cookie, "GET", `/api/workspaces/${wsId}`)).statusCode).toBe(200);

    await db.session.updateMany({
      where: { userId: owner.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const after = await api(owner.cookie, "GET", `/api/workspaces/${wsId}`);
    expect(after.statusCode).toBe(401);
  }, 30_000);
});

describe("tenant isolation", () => {
  it("non-members get 404 (not 403) for another tenant's workspace and novel", async () => {
    const alice = await seedUser("A");
    const bob = await seedUser("B");
    const wsA = await makeWorkspace(alice.cookie, "alice-ws");
    const novelA = await makeNovel(alice.cookie, wsA, "alice-novel");

    // Bob has a valid session but no membership in Alice's workspace:
    // every access shape answers 404 — no existence leak.
    expect((await api(bob.cookie, "GET", `/api/workspaces/${wsA}`)).statusCode).toBe(404);
    expect(
      (await api(bob.cookie, "GET", `/api/workspaces/${wsA}/novels`)).statusCode,
    ).toBe(404);
    expect(
      (await api(bob.cookie, "GET", `/api/workspaces/${wsA}/novels/${novelA}`)).statusCode,
    ).toBe(404);
    expect(
      (await api(bob.cookie, "POST", `/api/workspaces/${wsA}/novels`, {
        title: "x",
        slug: "sneaky",
      })).statusCode,
    ).toBe(404);
    expect(
      (
        await api(bob.cookie, "POST", `/api/workspaces/${wsA}/members`, {
          userId: bob.userId,
          role: "OWNER",
        })
      ).statusCode,
    ).toBe(404);
  }, 30_000);

  it("GET /api/novels is session-scoped to the actor's own workspaces", async () => {
    const alice = await seedUser("A");
    const bob = await seedUser("B");
    const wsA = await makeWorkspace(alice.cookie, "alice-ws2");
    const novelA = await makeNovel(alice.cookie, wsA, "alice-book");
    const wsB = await makeWorkspace(bob.cookie, "bob-ws2");
    const novelB = await makeNovel(bob.cookie, wsB, "bob-book");

    const aliceList = (await api(alice.cookie, "GET", "/api/novels")).json();
    expect(aliceList.map((n: { id: string }) => n.id)).toEqual([novelA]);
    const bobList = (await api(bob.cookie, "GET", "/api/novels")).json();
    expect(bobList.map((n: { id: string }) => n.id)).toEqual([novelB]);
  }, 30_000);

  it("removed members lose access immediately (404 on read and write)", async () => {
    const owner = await seedUser("O");
    const editor = await seedUser("E");
    const wsId = await makeWorkspace(owner.cookie, "remove-ws");
    const novelId = await makeNovel(owner.cookie, wsId, "remove-novel");

    const add = await api(owner.cookie, "POST", `/api/workspaces/${wsId}/members`, {
      userId: editor.userId,
      role: "EDITOR",
    });
    expect(add.statusCode).toBe(201);
    expect((await api(editor.cookie, "GET", `/api/workspaces/${wsId}`)).statusCode).toBe(200);

    const del = await api(owner.cookie, "DELETE", `/api/workspaces/${wsId}/members/${editor.userId}`);
    expect(del.statusCode).toBe(200);

    expect((await api(editor.cookie, "GET", `/api/workspaces/${wsId}`)).statusCode).toBe(404);
    expect(
      (await api(editor.cookie, "GET", `/api/workspaces/${wsId}/novels/${novelId}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await api(editor.cookie, "POST", `/api/workspaces/${wsId}/novels`, {
          title: "late",
          slug: "late-book",
        })
      ).statusCode,
    ).toBe(404);
  }, 30_000);
});

describe("VIEWER read-only at the route level", () => {
  it("VIEWER reads novels but every mutation is 403", async () => {
    const owner = await seedUser("O");
    const viewer = await seedUser("V");
    const wsId = await makeWorkspace(owner.cookie, "viewer-ws");
    const novelId = await makeNovel(owner.cookie, wsId, "viewer-novel");

    const add = await api(owner.cookie, "POST", `/api/workspaces/${wsId}/members`, {
      userId: viewer.userId,
      role: "VIEWER",
    });
    expect(add.statusCode).toBe(201);

    // Reads succeed.
    expect((await api(viewer.cookie, "GET", `/api/workspaces/${wsId}`)).statusCode).toBe(200);
    expect(
      (await api(viewer.cookie, "GET", `/api/workspaces/${wsId}/novels/${novelId}`)).statusCode,
    ).toBe(200);

    // Mutations are 403 FORBIDDEN (member, but lacks the capability).
    const create = await api(viewer.cookie, "POST", `/api/workspaces/${wsId}/novels`, {
      title: "nope",
      slug: "nope-book",
    });
    expect(create.statusCode).toBe(403);
    expect(create.json()).toEqual({ error: "FORBIDDEN" });

    const invite = await api(viewer.cookie, "POST", `/api/workspaces/${wsId}/members`, {
      userId: viewer.userId,
      role: "EDITOR",
    });
    expect(invite.statusCode).toBe(403);
  }, 30_000);
});

describe("audit scoping via routes", () => {
  it("route mutations write audit rows scoped to workspaceId and actor", async () => {
    const owner = await seedUser("O");
    const wsId = await makeWorkspace(owner.cookie, "audit-ws");
    await makeNovel(owner.cookie, wsId, "audit-novel");

    const logs = await db.auditLog.findMany({ where: { workspaceId: wsId } });
    expect(logs.map((l) => l.action).sort()).toEqual(["novel.created", "workspace.created"]);
    for (const l of logs) {
      expect(l.actorUserId).toBe(owner.userId);
      expect(l.workspaceId).toBe(wsId);
    }
  }, 30_000);
});
