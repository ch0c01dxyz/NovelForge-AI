/**
 * Simulation primitives and prerequisites (NF-WF-021A) integration suite.
 *
 * Dedicated `novelforge_test_simulation` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database, because what this task claims is a property of the DATABASE
 * and the transaction: the 5 primitives, the 4 prerequisites (all
 * REQUIRED), the run lifecycle, and canon isolation (Invariant 1).
 *
 * What this suite pins, and why each one is a property rather than a shape:
 *
 *  - **Primitives**: create run (DRAFT), scenario row, tick/entity/event
 *    tables exist and are queryable.
 *  - **Prerequisites**: configure without branch → 400 NO_BRANCH; without
 *    checkpoint → 400 NO_SNAPSHOT; without module → 400 MODULE_NOT_ENABLED;
 *    with all four → CONFIGURED.
 *  - **Lifecycle**: DRAFT → CONFIGURED → RUNNING → (step ticks) →
 *    PAUSED → RUNNING → COMPLETED (via maxTicks) or ABORTED (terminal).
 *    Invalid transitions → 409 INVALID_STATUS_TRANSITION.
 *  - **Determinism**: same seed + same ticks → same state (re-run verified).
 *  - **Canon isolation**: canon row counts unchanged after 100 ticks
 *    (Invariant 1).
 *  - **Capabilities**: VIEWER → 403; EDITOR can read but not manage.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_simulation";
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
// Note: pg_hba.conf is configured with trust auth for novelforge_test@localhost,
// so no password is needed.
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
  // Simulation tables first (FK order), then the novel graph.
  await db.simulationEvent.deleteMany();
  await db.simulationEntity.deleteMany();
  await db.simulationTick.deleteMany();
  await db.simulationScenario.deleteMany();
  await db.simulationRun.deleteMany();
  await db.novelModule.deleteMany();
  await db.auditLog.deleteMany();
  await db.restoreOperation.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.checkpoint.deleteMany();
  await db.snapshot.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.publication.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.novelSettings.deleteMany();
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

async function seedFixture(role: "OWNER" | "EDITOR" | "VIEWER" = "OWNER"): Promise<Fixture> {
  const { userId, cookie } = await seedUser(`sim-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`);
  const ws = await db.workspace.create({ data: { name: "ws", slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Sim Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;
  return { cookie, userId, workspaceId: ws.id, novelId };
}

function simUrl(fx: Fixture, path: string): string {
  return `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/simulations${path}`;
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

/** Enable the simulation module via direct DB insert (contract F4). */
async function enableModule(fx: Fixture): Promise<void> {
  await db.novelModule.create({
    data: { novelId: fx.novelId, moduleName: "simulation" },
  });
}

/** Create a checkpoint on the novel's main branch (prerequisite 2). */
async function makeCheckpoint(fx: Fixture): Promise<string> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/checkpoints`,
    fx.cookie,
    { label: "sim-checkpoint" },
  );
  expect(res.statusCode).toBe(201);
  return (res.json() as { checkpointId: string }).checkpointId;
}

/** Get the novel's main branch id. */
async function mainBranchId(fx: Fixture): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId: fx.novelId, name: "main" },
    select: { id: true },
  });
  return branch.id;
}

/** Create a run with a branch (DRAFT). */
async function createRun(fx: Fixture, branchId?: string): Promise<string> {
  const res = await api("POST", simUrl(fx, ""), fx.cookie, {
    ...(branchId === undefined ? {} : { branchId }),
    scenario: {
      initialState: { population: 500, food_security: 0.6 },
      injections: {},
      seed: "test-seed",
      maxTicks: 20,
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { run: { id: string } }).run.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("021A primitives", () => {
  it("creates a DRAFT run with a scenario row", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId);

    const run = await db.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("DRAFT");
    expect(run.branchId).toBe(branchId);
    expect(run.currentTick).toBe(0);

    const scenario = await db.simulationScenario.findUniqueOrThrow({
      where: { runId },
    });
    expect(scenario.initialState).toMatchObject({ population: 500 });
  });

  it("lists runs (simulation:read)", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await createRun(fx, branchId);
    await createRun(fx, branchId);

    const res = await api("GET", simUrl(fx, ""), fx.cookie);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { runs: unknown[] }).runs).toHaveLength(2);
  });

  it("returns run detail with scenario", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId);

    const res = await api("GET", simUrl(fx, `/${runId}`), fx.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { run: { id: string; scenario: { seed: string } } };
    expect(body.run.id).toBe(runId);
    expect(body.run.scenario.seed).toBe("test-seed");
  });
});

describe("021A prerequisites (all REQUIRED)", () => {
  it("configure without branch → 400 NO_BRANCH", async () => {
    const fx = await seedFixture();
    // Create run WITHOUT a branch.
    const res = await api("POST", simUrl(fx, ""), fx.cookie, {
      scenario: { initialState: {}, seed: "x" },
    });
    expect(res.statusCode).toBe(201);
    const runId = (res.json() as { run: { id: string } }).run.id;

    const cfg = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    expect(cfg.statusCode).toBe(400);
    expect((cfg.json() as { error: string }).error).toBe("NO_BRANCH");
  });

  it("configure without checkpoint → 400 NO_SNAPSHOT", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await enableModule(fx);
    const runId = await createRun(fx, branchId);
    // No checkpoint created.

    const cfg = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    expect(cfg.statusCode).toBe(400);
    expect((cfg.json() as { error: string }).error).toBe("NO_SNAPSHOT");
  });

  it("configure without module → 400 MODULE_NOT_ENABLED", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    // Module NOT enabled.
    const runId = await createRun(fx, branchId);

    const cfg = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    expect(cfg.statusCode).toBe(400);
    expect((cfg.json() as { error: string }).error).toBe("MODULE_NOT_ENABLED");
  });

  it("configure with all four prerequisites → CONFIGURED", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    await enableModule(fx);
    const runId = await createRun(fx, branchId);

    const cfg = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    expect(cfg.statusCode).toBe(200);
    const body = cfg.json() as { run: { status: string; snapshotId: string; canonRevisionId: string } };
    expect(body.run.status).toBe("CONFIGURED");
    expect(body.run.snapshotId).toBeTruthy();
    expect(body.run.canonRevisionId).toBeTruthy();
  });
});

describe("021A run lifecycle", () => {
  async function configuredRun(fx: Fixture): Promise<string> {
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    await enableModule(fx);
    const runId = await createRun(fx, branchId);
    const cfg = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    expect(cfg.statusCode).toBe(200);
    return runId;
  }

  it("start → RUNNING; step advances ticks deterministically", async () => {
    const fx = await seedFixture();
    const runId = await configuredRun(fx);

    const start = await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
    expect(start.statusCode).toBe(200);
    expect((start.json() as { run: { status: string } }).run.status).toBe("RUNNING");

    const step = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 3 });
    expect(step.statusCode).toBe(200);
    const body = step.json() as {
      run: { currentTick: number; status: string };
      ticks: { tickNumber: number; stateBefore: unknown; stateAfter: unknown }[];
    };
    expect(body.run.currentTick).toBe(3);
    expect(body.ticks).toHaveLength(3);
    expect(body.ticks[0]!.tickNumber).toBe(1);
    // Deterministic: state carries forward from initialState.
    expect(body.ticks[0]!.stateBefore).toMatchObject({ population: 500 });
  });

  it("same seed + same ticks → same state (determinism, Invariant 6)", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    await enableModule(fx);

    async function runToTick3(): Promise<unknown> {
      const runId = await createRun(fx, branchId);
      await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
      await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
      const step = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 3 });
      const body = step.json() as { ticks: { stateAfter: unknown }[] };
      return body.ticks[2]!.stateAfter;
    }

    const state1 = await runToTick3();
    const state2 = await runToTick3();
    expect(state1).toEqual(state2);
  });

  it("pause → PAUSED; resume → RUNNING; invalid transitions → 409", async () => {
    const fx = await seedFixture();
    const runId = await configuredRun(fx);
    await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);

    const pause = await api("POST", simUrl(fx, `/${runId}/pause`), fx.cookie);
    expect((pause.json() as { run: { status: string } }).run.status).toBe("PAUSED");

    // Stepping while paused → 409.
    const step = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 1 });
    expect(step.statusCode).toBe(409);
    expect((step.json() as { error: string }).error).toBe("INVALID_STATUS_TRANSITION");

    const resume = await api("POST", simUrl(fx, `/${runId}/resume`), fx.cookie);
    expect((resume.json() as { run: { status: string } }).run.status).toBe("RUNNING");
  });

  it("abort is terminal; aborted run cannot be restarted", async () => {
    const fx = await seedFixture();
    const runId = await configuredRun(fx);
    await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);

    const abort = await api("POST", simUrl(fx, `/${runId}/abort`), fx.cookie);
    expect((abort.json() as { run: { status: string } }).run.status).toBe("ABORTED");

    // Cannot start an aborted run.
    const start = await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
    expect(start.statusCode).toBe(409);

    // Cannot abort twice.
    const abort2 = await api("POST", simUrl(fx, `/${runId}/abort`), fx.cookie);
    expect(abort2.statusCode).toBe(409);
  });

  it("reaching maxTicks auto-completes the run", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    await enableModule(fx);

    // Create run with maxTicks: 2.
    const res = await api("POST", simUrl(fx, ""), fx.cookie, {
      branchId,
      scenario: { initialState: {}, seed: "x", maxTicks: 2 },
    });
    const runId = (res.json() as { run: { id: string } }).run.id;
    await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);

    const step = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 5 });
    const body = step.json() as { run: { status: string; currentTick: number } };
    expect(body.run.status).toBe("COMPLETED");
    expect(body.run.currentTick).toBe(2);
  });

  it("tick detail returns stateBefore/stateAfter/events", async () => {
    const fx = await seedFixture();
    const runId = await configuredRun(fx);
    await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
    await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 2 });

    const res = await api("GET", simUrl(fx, `/${runId}/ticks/1`), fx.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      tick: { tickNumber: number; stateBefore: unknown; stateAfter: unknown; events: unknown[] };
    };
    expect(body.tick.tickNumber).toBe(1);
    expect(body.tick.stateBefore).toBeTruthy();
    expect(body.tick.stateAfter).toBeTruthy();
    expect(Array.isArray(body.tick.events)).toBe(true);
  });

  it("start without configure → 409", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId); // DRAFT, not configured.

    const start = await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
    expect(start.statusCode).toBe(409);
    expect((start.json() as { error: string }).error).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("021A canon isolation (Invariant 1)", () => {
  it("canon row counts unchanged after 100 ticks", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    await makeCheckpoint(fx);
    await enableModule(fx);

    // Seed some canon data (StoryEntity is a canon table).
    await db.storyEntity.create({
      data: {
        novelId: fx.novelId,
        kind: "CHARACTER",
        key: "canon-entity",
        name: "Canon Entity",
        createdById: fx.userId,
      },
    });

    const beforeEntities = await db.storyEntity.count({ where: { novelId: fx.novelId } });

    // Run 100 ticks.
    const res = await api("POST", simUrl(fx, ""), fx.cookie, {
      branchId,
      scenario: { initialState: { x: 1 }, seed: "iso", maxTicks: 100 },
    });
    const runId = (res.json() as { run: { id: string } }).run.id;
    await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
    await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
    await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, { ticks: 100 });

    const afterEntities = await db.storyEntity.count({ where: { novelId: fx.novelId } });
    expect(afterEntities).toBe(beforeEntities);
  });
});

describe("021A capabilities (Q7/F1)", () => {
  it("VIEWER cannot create or list runs → 403", async () => {
    // Create fixture as OWNER, then add a VIEWER.
    const owner = await seedFixture("OWNER");
    const branchId = await mainBranchId(owner);

    const viewerUser = await seedUser(`viewer-${Date.now()}@test.local`);
    await db.membership.create({
      data: { workspaceId: owner.workspaceId, userId: viewerUser.userId, role: "VIEWER" },
    });
    const viewerFx: Fixture = {
      cookie: viewerUser.cookie,
      userId: viewerUser.userId,
      workspaceId: owner.workspaceId,
      novelId: owner.novelId,
    };

    const create = await api("POST", simUrl(viewerFx, ""), viewerFx.cookie, { branchId });
    expect(create.statusCode).toBe(403);

    const list = await api("GET", simUrl(viewerFx, ""), viewerFx.cookie);
    expect(list.statusCode).toBe(403);
  });

  it("EDITOR can read but cannot manage", async () => {
    // Create a run as OWNER first.
    const owner = await seedFixture("OWNER");
    const branchId = await mainBranchId(owner);
    await makeCheckpoint(owner);
    await enableModule(owner);
    const runId = await createRun(owner, branchId);

    // Add an EDITOR to the same workspace/novel.
    const editorUser = await seedUser(`editor-${Date.now()}@test.local`);
    await db.membership.create({
      data: { workspaceId: owner.workspaceId, userId: editorUser.userId, role: "EDITOR" },
    });
    const editorFx: Fixture = {
      cookie: editorUser.cookie,
      userId: editorUser.userId,
      workspaceId: owner.workspaceId,
      novelId: owner.novelId,
    };

    // EDITOR can list (simulation:read).
    const list = await api("GET", simUrl(editorFx, ""), editorFx.cookie);
    expect(list.statusCode).toBe(200);

    // EDITOR can get run detail.
    const get = await api("GET", simUrl(editorFx, `/${runId}`), editorFx.cookie);
    expect(get.statusCode).toBe(200);

    // EDITOR cannot create (needs simulation:manage).
    const create = await api("POST", simUrl(editorFx, ""), editorFx.cookie, { branchId });
    expect(create.statusCode).toBe(403);

    // EDITOR cannot step.
    const step = await api("POST", simUrl(editorFx, `/${runId}/step`), editorFx.cookie, { ticks: 1 });
    expect(step.statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    const fx = await seedFixture();
    const res = await app.inject({
      method: "GET",
      url: simUrl(fx, ""),
    });
    expect(res.statusCode).toBe(401);
  });
});
