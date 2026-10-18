/**
 * Workspace management (create exists; NF follow-up: rename + delete).
 *
 * Dedicated novelforge_test_ws_mgmt db (parallel-safe per ADR-0003 §8),
 * mirroring tenant-isolation.test.ts's harness: direct session seeding,
 * real HTTP via buildApp.
 *
 * Gate assertions:
 * - PATCH/DELETE are 401 unauthenticated, 400 on malformed input
 * - rename: OWNER/ADMIN may (workspace:update), AUTHOR/VIEWER 403,
 *   non-member 404; slug is immutable; action audited
 * - delete: OWNER only (workspace:delete); non-empty → 409
 *   WORKSPACE_NOT_EMPTY; empty → memberships cascade, workspace gone,
 *   audit + generation history DETACHED (workspaceId null), never erased;
 *   deletion itself audited with a null tenant boundary
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

const TEST_DB = "novelforge_test_ws_mgmt";
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
    `TRUNCATE audit_logs, generations, novel_settings, novels, memberships,
     sessions, workspaces, users RESTART IDENTITY CASCADE`,
  );
});

let emailN = 0;
async function seedUser(name = "U"): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: {
      email: `ws-mgmt${++emailN}-${Date.now()}@example.com`,
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

async function makeWorkspace(ownerCookie: string, name: string, slug: string): Promise<string> {
  const res = await api(ownerCookie, "POST", "/api/workspaces", { name, slug });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function seedMember(workspaceId: string, userId: string, role: string) {
  await db.membership.create({
    data: { workspaceId, userId, role: role as "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER" },
  });
}

const MISSING_WS = "00000000-0000-4000-8000-0000000000ff";

describe("workspace management authorization gate", () => {
  it("PATCH and DELETE are 401 without a session cookie", async () => {
    expect((await api(null, "PATCH", `/api/workspaces/${MISSING_WS}`, { name: "X" })).statusCode).toBe(401);
    expect((await api(null, "DELETE", `/api/workspaces/${MISSING_WS}`)).statusCode).toBe(401);
  });

  it("malformed ids and bodies are 400", async () => {
    const owner = await seedUser("Owner");
    expect(
      (await api(owner.cookie, "PATCH", "/api/workspaces/not-a-uuid", { name: "X" })).statusCode,
    ).toBe(400);
    expect(
      (await api(owner.cookie, "PATCH", `/api/workspaces/${MISSING_WS}`, { name: "  " })).statusCode,
    ).toBe(400);
    expect(
      (await api(owner.cookie, "PATCH", `/api/workspaces/${MISSING_WS}`, { name: "x".repeat(121) }))
        .statusCode,
    ).toBe(400);
    expect(
      (await api(owner.cookie, "PATCH", `/api/workspaces/${MISSING_WS}`, {})).statusCode,
    ).toBe(400);
  });

  it("unknown workspace is 404 for the OWNER-shaped caller", async () => {
    const owner = await seedUser("Owner");
    expect((await api(owner.cookie, "PATCH", `/api/workspaces/${MISSING_WS}`, { name: "X" })).statusCode).toBe(404);
    expect((await api(owner.cookie, "DELETE", `/api/workspaces/${MISSING_WS}`)).statusCode).toBe(404);
  });
});

describe("workspace rename", () => {
  it("OWNER renames; the slug stays immutable; the action is audited", async () => {
    const owner = await seedUser("Owner");
    const wsId = await makeWorkspace(owner.cookie, "Original", "original");
    const res = await api(owner.cookie, "PATCH", `/api/workspaces/${wsId}`, {
      name: "Renamed",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: wsId, name: "Renamed", slug: "original" });
    const logs = await db.auditLog.findMany({ where: { action: "workspace.updated" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.workspaceId).toBe(wsId);
    expect(logs[0]!.payload).toMatchObject({ name: "Renamed" });
  });

  it("ADMIN may rename (workspace:update), AUTHOR and VIEWER are 403, non-member 404", async () => {
    const owner = await seedUser("Owner");
    const admin = await seedUser("Admin");
    const author = await seedUser("Author");
    const viewer = await seedUser("Viewer");
    const outsider = await seedUser("Outsider");
    const wsId = await makeWorkspace(owner.cookie, "Ws", "ws");
    await seedMember(wsId, admin.userId, "ADMIN");
    await seedMember(wsId, author.userId, "AUTHOR");
    await seedMember(wsId, viewer.userId, "VIEWER");
    expect(
      (await api(admin.cookie, "PATCH", `/api/workspaces/${wsId}`, { name: "By Admin" })).statusCode,
    ).toBe(200);
    expect(
      (await api(author.cookie, "PATCH", `/api/workspaces/${wsId}`, { name: "By Author" })).statusCode,
    ).toBe(403);
    expect(
      (await api(viewer.cookie, "PATCH", `/api/workspaces/${wsId}`, { name: "By Viewer" })).statusCode,
    ).toBe(403);
    expect(
      (await api(outsider.cookie, "PATCH", `/api/workspaces/${wsId}`, { name: "By Outsider" }))
        .statusCode,
    ).toBe(404);
  });
});

describe("workspace deletion", () => {
  async function raceWithLock(
    workspaceId: string,
    request: () => ReturnType<typeof api>,
    mutate: (client: pg.Client) => Promise<unknown>,
  ) {
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    let pending: ReturnType<typeof api> | undefined;
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [workspaceId]);
      pending = request();
      let waiting = false;
      for (let i = 0; i < 120; i++) {
        await client.query("SELECT pg_stat_clear_snapshot()");
        const result = await client.query(`SELECT 1 FROM pg_stat_activity
          WHERE pg_backend_pid()=ANY(pg_blocking_pids(pid))`);
        if (result.rowCount) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting, "request must reach the workspace lock before the concurrent change").toBe(true);
      await mutate(client);
      await client.query("COMMIT");
      return await pending;
    } finally {
      await client.query("ROLLBACK");
      await pending;
      await client.end();
    }
  }

  it("preserves a novel committed while workspace deletion waits for its lock", async () => {
    const owner = await seedUser();
    const wsId = await makeWorkspace(owner.cookie, "Concurrent", "concurrent");
    const result = await raceWithLock(wsId,
      () => api(owner.cookie, "DELETE", `/api/workspaces/${wsId}`),
      (client) => client.query(`INSERT INTO novels
        (id, workspace_id, created_by_id, title, slug, updated_at)
        VALUES(gen_random_uuid(),$1,$2,'Concurrent story','concurrent-story',now())`, [wsId, owner.userId]),
    );
    expect(result.statusCode).toBe(409);
    expect(result.json()).toEqual({ error: "WORKSPACE_NOT_EMPTY" });
    expect(await db.novel.count({ where: { workspaceId: wsId } })).toBe(1);
  });

  it.each(["PATCH", "DELETE"] as const)("rechecks revoked permission after the lock for %s", async (method) => {
    const owner = await seedUser();
    const wsId = await makeWorkspace(owner.cookie, "Original", "revoked");
    const result = await raceWithLock(wsId,
      () => api(owner.cookie, method, `/api/workspaces/${wsId}`, method === "PATCH" ? { name: "Unauthorized" } : undefined),
      (client) => client.query("UPDATE memberships SET role='AUTHOR' WHERE workspace_id=$1 AND user_id=$2", [wsId, owner.userId]),
    );
    expect(result.statusCode).toBe(403);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: wsId } })).name).toBe("Original");
  });

  it("preserves novel-independent definitions instead of cascading them", async () => {
    const owner = await seedUser();
    const wsId = await makeWorkspace(owner.cookie, "Definitions", "definitions");
    await db.agent.create({ data: { workspaceId: wsId, key: "writer", name: "Writer", createdById: owner.userId } });
    const result = await api(owner.cookie, "DELETE", `/api/workspaces/${wsId}`);
    expect(result.statusCode).toBe(409);
    expect(result.json()).toEqual({ error: "WORKSPACE_HAS_REFERENCED_HISTORY" });
    expect(await db.agent.count({ where: { workspaceId: wsId } })).toBe(1);
  });

  it("rolls rename and deletion back when their required audit write fails", async () => {
    const owner = await seedUser();
    const wsId = await makeWorkspace(owner.cookie, "Audited", "audited");
    await db.$executeRawUnsafe(`CREATE FUNCTION nf_ws_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('workspace.updated','workspace.deleted') THEN
        RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER nf_ws_audit_failure BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION nf_ws_audit_failure()`);
    try {
      expect((await api(owner.cookie, "PATCH", `/api/workspaces/${wsId}`, { name: "Unrecorded" })).statusCode).toBe(500);
      expect((await api(owner.cookie, "DELETE", `/api/workspaces/${wsId}`)).statusCode).toBeGreaterThanOrEqual(400);
      expect((await db.workspace.findUniqueOrThrow({ where: { id: wsId } })).name).toBe("Audited");
      expect(await db.auditLog.count({ where: { workspaceId: wsId } })).toBe(1);
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER nf_ws_audit_failure ON audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION nf_ws_audit_failure()");
    }
  });
  it("refuses a non-empty workspace with WORKSPACE_NOT_EMPTY and keeps it intact", async () => {
    const owner = await seedUser("Owner");
    const wsId = await makeWorkspace(owner.cookie, "Full", "full");
    const novelRes = await api(owner.cookie, "POST", `/api/workspaces/${wsId}/novels`, {
      title: "Story",
      slug: "story",
    });
    expect(novelRes.statusCode).toBe(201);
    const res = await api(owner.cookie, "DELETE", `/api/workspaces/${wsId}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "WORKSPACE_NOT_EMPTY" });
    expect(await db.workspace.findUnique({ where: { id: wsId } })).not.toBeNull();
    expect(await db.novel.count({ where: { workspaceId: wsId } })).toBe(1);
  });

  it("ADMIN and VIEWER cannot delete (workspace:delete is OWNER-only)", async () => {
    const owner = await seedUser("Owner");
    const admin = await seedUser("Admin");
    const viewer = await seedUser("Viewer");
    const wsId = await makeWorkspace(owner.cookie, "Ws", "ws");
    await seedMember(wsId, admin.userId, "ADMIN");
    await seedMember(wsId, viewer.userId, "VIEWER");
    expect((await api(admin.cookie, "DELETE", `/api/workspaces/${wsId}`)).statusCode).toBe(403);
    expect((await api(viewer.cookie, "DELETE", `/api/workspaces/${wsId}`)).statusCode).toBe(403);
  });

  it("deletes an empty workspace: memberships cascade, history is detached not erased, action audited", async () => {
    const owner = await seedUser("Owner");
    const wsId = await makeWorkspace(owner.cookie, "Doomed", "doomed");
    // Pre-existing history pointing at the tenant: an audit row and a
    // generation record. Both survive the deletion with workspaceId null.
    await db.auditLog.create({
      data: { workspaceId: wsId, action: "workspace.created", entityType: "Workspace", entityId: wsId },
    });
    await db.generation.create({
      data: { workspaceId: wsId, task: "outline", modelProfile: "CREATIVE_WRITER" },
    });
    const res = await api(owner.cookie, "DELETE", `/api/workspaces/${wsId}`);
    expect(res.statusCode).toBe(200);
    expect(await db.workspace.findUnique({ where: { id: wsId } })).toBeNull();
    expect(await db.membership.count({ where: { workspaceId: wsId } })).toBe(0);
    const auditRows = await db.auditLog.findMany({ where: { entityType: "Workspace", entityId: wsId } });
    // Two workspace.created rows: the real route audit + the seeded history
    // row. Both — plus the deletion record — carry a null tenant boundary.
    expect(auditRows.map((r) => r.action).sort()).toEqual([
      "workspace.created",
      "workspace.created",
      "workspace.deleted",
    ]);
    expect(auditRows.every((r) => r.workspaceId === null)).toBe(true);
    expect(auditRows.find((r) => r.action === "workspace.deleted")?.payload).toMatchObject({ slug: "doomed" });
    const gen = await db.generation.findFirst({ where: { task: "outline" } });
    expect(gen).not.toBeNull();
    expect(gen!.workspaceId).toBeNull();
  });

  it("listWorkspaces exposes management flags and novel counts", async () => {
    const owner = await seedUser("Owner");
    const author = await seedUser("Author");
    const wsId = await makeWorkspace(owner.cookie, "Flagged", "flagged");
    await seedMember(wsId, author.userId, "AUTHOR");
    await api(owner.cookie, "POST", `/api/workspaces/${wsId}/novels`, { title: "S", slug: "s" });
    const ownerView = (await api(owner.cookie, "GET", "/api/workspaces")).json();
    const authorView = (await api(author.cookie, "GET", "/api/workspaces")).json();
    const ownerRow = ownerView.find((w: { id: string }) => w.id === wsId);
    const authorRow = authorView.find((w: { id: string }) => w.id === wsId);
    expect(ownerRow).toMatchObject({ canRename: true, canDelete: true, novelCount: 1 });
    expect(authorRow).toMatchObject({ canRename: false, canDelete: false, novelCount: 1 });
  });
});
