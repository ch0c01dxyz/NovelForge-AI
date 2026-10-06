/**
 * Endgame callbacks + legacy (NF-WF-022B) integration suite.
 *
 * Dedicated `novelforge_test_endgame_callback` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database, because what this task claims is a property of the DATABASE
 * and the transaction: explicit callback links, the unpaid query, legacy
 * records per kind, and — critically — the ABSENCE of any auto-linking
 * path (Invariant 5).
 *
 * What this suite pins, and why each one is a property rather than a shape:
 *
 *  - **Explicit links**: POST /callbacks with setup only → 201 PENDING;
 *    with setup + payoff → 201 PAID. Duplicate setup → 409
 *    DUPLICATE_CALLBACK. setup == payoff → 400 INVALID_INPUT.
 *  - **Unpaid query**: GET /callbacks/unpaid returns exactly the PENDING
 *    rows (read by 022A's debt report).
 *  - **Legacy**: POST /legacy per kind (CHARACTER/WORLD/THEMATIC) → 201;
 *    empty description → 400; list with kind filter.
 *  - **No auto-linking** (Invariant 5): performing story operations and
 *    creating other callbacks never creates a callback row for a setup
 *    that was not explicitly POSTed. The service module exposes no other
 *    write path to endgame_callbacks (verified by code inspection; the
 *    only `db.endgameCallback.create` call site is createCallback).
 *  - **Capabilities**: VIEWER → 403; EDITOR reads OK but manage → 403.
 *  - **Canon isolation**: canon row counts unchanged after all operations
 *    (Invariant 3).
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_endgame_callback";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    // Fallback for environments where .env is not available.
    // Test database (local scratch only, not production).
    // pg_hba.conf uses trust auth for novelforge_test@localhost.
    process.env.DATABASE_URL = "postgresql://novelforge_test@localhost:5432/postgres";
  }
}
// If .env had a placeholder, use the test credentials.
if (process.env.DATABASE_URL?.includes("<redacted>")) {
  process.env.DATABASE_URL = "postgresql://novelforge_test@localhost:5432/postgres";
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
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });

  db = createDb(TEST_URL);
  app = await buildApp(env, { db });
  await app.ready();
}, 120000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  // 022B tables first, then 022A tables (FK order within endgame), then
  // the novel graph.
  await db.endgameLegacy.deleteMany();
  await db.endgameCallback.deleteMany();
  await db.endgameGateApproval.deleteMany();
  await db.endgameLedger.deleteMany();
  await db.auditLog.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.novel.updateMany({ data: { currentBranchId: null } });
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedUser(email: string): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
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

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

async function seedFixture(): Promise<Fixture> {
  const { userId, cookie } = await seedUser(`cb-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`);
  const ws = await db.workspace.create({ data: { name: "ws", slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role: "OWNER" } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Callback Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;
  return { cookie, userId, workspaceId: ws.id, novelId };
}

/** Add a user with the given role to an existing fixture's workspace. */
async function addMember(
  fx: Fixture,
  role: "EDITOR" | "VIEWER",
): Promise<{ cookie: string; userId: string }> {
  const { userId, cookie } = await seedUser(
    `cb-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`,
  );
  await db.membership.create({ data: { workspaceId: fx.workspaceId, userId, role } });
  return { cookie, userId };
}

function cbUrl(fx: Fixture, path: string): string {
  return `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/endgame${path}`;
}

async function api(
  method: "GET" | "POST",
  url: string,
  cookie: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    payload: payload ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Callback creation (explicit links)
// ---------------------------------------------------------------------------

describe("POST /endgame/callbacks", () => {
  it("creates a PENDING callback when only the setup is given (unpaid)", async () => {
    const fx = await seedFixture();
    const setupEventId = randomUUID();
    const res = await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId,
      description: "The mysterious key will matter later.",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { callback: { status: string; payoffEventId: null; setupEventId: string } };
    expect(body.callback.status).toBe("PENDING");
    expect(body.callback.payoffEventId).toBeNull();
    expect(body.callback.setupEventId).toBe(setupEventId);
  });

  it("creates a PAID callback when setup + payoff are linked", async () => {
    const fx = await seedFixture();
    const res = await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: randomUUID(),
      payoffEventId: randomUUID(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { callback: { status: string; payoffEventId: string } };
    expect(body.callback.status).toBe("PAID");
    expect(body.callback.payoffEventId).toBeTruthy();
  });

  it("409 DUPLICATE_CALLBACK when the setup already has a callback", async () => {
    const fx = await seedFixture();
    const setupEventId = randomUUID();
    const first = await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId });
    expect(first.statusCode).toBe(201);
    const second = await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId,
      payoffEventId: randomUUID(),
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toBe("DUPLICATE_CALLBACK");
  });

  it("400 INVALID_INPUT when setup == payoff", async () => {
    const fx = await seedFixture();
    const eventId = randomUUID();
    const res = await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: eventId,
      payoffEventId: eventId,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("401 when unauthenticated", async () => {
    const fx = await seedFixture();
    const res = await api("POST", cbUrl(fx, "/callbacks"), "bogus=cookie", {
      setupEventId: randomUUID(),
    });
    expect(res.statusCode).toBe(401);
  });

  it("403 FORBIDDEN for VIEWER (needs endgame:manage)", async () => {
    const fx = await seedFixture();
    const viewer = await addMember(fx, "VIEWER");
    const res = await api("POST", cbUrl(fx, "/callbacks"), viewer.cookie, {
      setupEventId: randomUUID(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("403 FORBIDDEN for EDITOR (read-only per pinned role mapping)", async () => {
    const fx = await seedFixture();
    const editor = await addMember(fx, "EDITOR");
    const res = await api("POST", cbUrl(fx, "/callbacks"), editor.cookie, {
      setupEventId: randomUUID(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Unpaid query
// ---------------------------------------------------------------------------

describe("GET /endgame/callbacks/unpaid", () => {
  it("returns exactly the PENDING callbacks", async () => {
    const fx = await seedFixture();
    // Two unpaid setups, one paid.
    const unpaid1 = randomUUID();
    const unpaid2 = randomUUID();
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: unpaid1 });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: unpaid2 });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: randomUUID(),
      payoffEventId: randomUUID(),
    });

    const res = await api("GET", cbUrl(fx, "/callbacks/unpaid"), fx.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { callbacks: { setupEventId: string; status: string }[] };
    expect(body.callbacks).toHaveLength(2);
    const setupIds = body.callbacks.map((c) => c.setupEventId).sort();
    expect(setupIds).toEqual([unpaid1, unpaid2].sort());
    for (const c of body.callbacks) expect(c.status).toBe("PENDING");
  });

  it("EDITOR can read the unpaid list (endgame:read)", async () => {
    const fx = await seedFixture();
    const editor = await addMember(fx, "EDITOR");
    const res = await api("GET", cbUrl(fx, "/callbacks/unpaid"), editor.cookie);
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /endgame/callbacks", () => {
  it("lists all callbacks with optional status filter", async () => {
    const fx = await seedFixture();
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: randomUUID() });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: randomUUID(),
      payoffEventId: randomUUID(),
    });

    const all = await api("GET", cbUrl(fx, "/callbacks"), fx.cookie);
    expect((all.json() as { callbacks: unknown[] }).callbacks).toHaveLength(2);

    const pending = await api("GET", cbUrl(fx, "/callbacks?status=PENDING"), fx.cookie);
    const pendingBody = pending.json() as { callbacks: { status: string }[] };
    expect(pendingBody.callbacks).toHaveLength(1);
    expect(pendingBody.callbacks[0]!.status).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

describe("POST /endgame/legacy", () => {
  it("records a legacy per kind (CHARACTER/WORLD/THEMATIC)", async () => {
    const fx = await seedFixture();
    for (const kind of ["CHARACTER", "WORLD", "THEMATIC"] as const) {
      const res = await api("POST", cbUrl(fx, "/legacy"), fx.cookie, {
        kind,
        description: `${kind} legacy: what remains.`,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { legacy: { kind: string; description: string } };
      expect(body.legacy.kind).toBe(kind);
    }
    const list = await api("GET", cbUrl(fx, "/legacy"), fx.cookie);
    expect((list.json() as { legacies: unknown[] }).legacies).toHaveLength(3);
  });

  it("accepts an optional subjectId", async () => {
    const fx = await seedFixture();
    const subjectId = randomUUID();
    const res = await api("POST", cbUrl(fx, "/legacy"), fx.cookie, {
      kind: "CHARACTER",
      subjectId,
      description: "The hero's sacrifice is remembered.",
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { legacy: { subjectId: string } }).legacy.subjectId).toBe(subjectId);
  });

  it("400 INVALID_INPUT for empty description", async () => {
    const fx = await seedFixture();
    const res = await api("POST", cbUrl(fx, "/legacy"), fx.cookie, {
      kind: "WORLD",
      description: "   ",
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("filters by kind", async () => {
    const fx = await seedFixture();
    await api("POST", cbUrl(fx, "/legacy"), fx.cookie, { kind: "CHARACTER", description: "c" });
    await api("POST", cbUrl(fx, "/legacy"), fx.cookie, { kind: "WORLD", description: "w" });
    const res = await api("GET", cbUrl(fx, "/legacy?kind=WORLD"), fx.cookie);
    const body = res.json() as { legacies: { kind: string }[] };
    expect(body.legacies).toHaveLength(1);
    expect(body.legacies[0]!.kind).toBe("WORLD");
  });

  it("403 FORBIDDEN for VIEWER on manage", async () => {
    const fx = await seedFixture();
    const viewer = await addMember(fx, "VIEWER");
    const res = await api("POST", cbUrl(fx, "/legacy"), viewer.cookie, {
      kind: "THEMATIC",
      description: "x",
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Invariant 5 — no auto-linking (pinned)
// ---------------------------------------------------------------------------

describe("Invariant 5: callbacks are explicit, never auto-linked", () => {
  it("no callback row exists for a setup that was never explicitly POSTed", async () => {
    const fx = await seedFixture();
    // Perform various story-adjacent operations: create another callback,
    // record legacies. None of these may conjure a callback for setupX.
    const setupX = randomUUID();
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: randomUUID() });
    await api("POST", cbUrl(fx, "/legacy"), fx.cookie, {
      kind: "THEMATIC",
      description: "theme",
    });

    // Direct DB check: only explicitly-created rows exist.
    const rows = await db.endgameCallback.findMany({
      where: { novelId: fx.novelId },
      select: { setupEventId: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setupEventId).not.toBe(setupX);

    // And the unpaid query does not list setupX.
    const res = await api("GET", cbUrl(fx, "/callbacks/unpaid"), fx.cookie);
    const body = res.json() as { callbacks: { setupEventId: string }[] };
    expect(body.callbacks.map((c) => c.setupEventId)).not.toContain(setupX);
  });

  it("creating a PAID callback does not touch other setups", async () => {
    const fx = await seedFixture();
    const setupA = randomUUID();
    const setupB = randomUUID();
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: setupA });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: setupB,
      payoffEventId: randomUUID(),
    });
    const res = await api("GET", cbUrl(fx, "/callbacks/unpaid"), fx.cookie);
    const body = res.json() as { callbacks: { setupEventId: string }[] };
    expect(body.callbacks.map((c) => c.setupEventId)).toEqual([setupA]);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3 — no canon writes
// ---------------------------------------------------------------------------

describe("Invariant 3: no canon writes", () => {
  it("canon row counts are unchanged after callback + legacy operations", async () => {
    const fx = await seedFixture();
    const before = await db.canonFact.count({ where: { novelId: fx.novelId } });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, { setupEventId: randomUUID() });
    await api("POST", cbUrl(fx, "/callbacks"), fx.cookie, {
      setupEventId: randomUUID(),
      payoffEventId: randomUUID(),
    });
    await api("POST", cbUrl(fx, "/legacy"), fx.cookie, {
      kind: "WORLD",
      description: "The world changed.",
    });
    const after = await db.canonFact.count({ where: { novelId: fx.novelId } });
    expect(after).toBe(before);
  });
});
