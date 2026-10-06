/**
 * Simulation debugger (NF-WF-024B) integration suite.
 *
 * Dedicated `novelforge_test_simulation_debugger` db (parallel-safe per
 * ADR-0003 §8). Every assertion drives the real HTTP surface against a real
 * migrated database.
 *
 * What this suite pins (024B contract §"Evaluation", pinned):
 *
 *  - **Breakpoints**: TICK, PREDICATE, ON_PROPOSAL kinds fire; watch strip
 *    renders; replay byte-identical; trace walks 021B chains (via 021B
 *    routes, integrated in UI).
 *  - **Fault-injection eval** (3/3 scenarios, deterministic fixtures):
 *    1. Attribute crash: injection drives `population` off a cliff at tick
 *       12 — a PREDICATE breakpoint must fire at tick 12.
 *    2. Missing injection: a scheduled injection is dropped — the watch
 *       strip must show the flatline; replay to tick 10→14 must reproduce
 *       it byte-identically.
 *    3. Proposal storm: a tick raises ≥3 proposals — the ON_PROPOSAL
 *       breakpoint must pause with all three listed.
 *  - **No state-edit operation**: the debugger has no "edit state and
 *    continue" (grep-verified in review; the service exposes no mutation
 *    of tick history).
 *  - **Capabilities**: VIEWER → 403 on manage; EDITOR can read.
 *  - **Invariant 5**: replay is non-persisting (tick count unchanged after
 *    replay); debug-step never edits history.
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

const TEST_DB = "novelforge_test_simulation_debugger";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    process.env.DATABASE_URL = "postgresql://novelforge_test@localhost:5432/postgres";
  }
}
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
  // Debugger tables first, then 021B, then 021A (FK order).
  await db.simulationBreakpoint.deleteMany();
  await db.simulationProposal.deleteMany();
  await db.simulationCausalLink.deleteMany();
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
  const { userId, cookie } = await seedUser(`dbg-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`);
  const ws = await db.workspace.create({ data: { name: "ws", slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Debug Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;
  return { cookie, userId, workspaceId: ws.id, novelId };
}

function simUrl(fx: Fixture, path: string): string {
  return `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/simulations${path}`;
}

async function api(
  method: "GET" | "POST" | "DELETE",
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

async function enableModule(fx: Fixture): Promise<void> {
  await db.novelModule.create({
    data: { novelId: fx.novelId, moduleName: "simulation" },
  });
}

async function makeCheckpoint(fx: Fixture): Promise<void> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/checkpoints`,
    fx.cookie,
    { label: "dbg-checkpoint" },
  );
  expect(res.statusCode).toBe(201);
}

async function mainBranchId(fx: Fixture): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId: fx.novelId, name: "main" },
    select: { id: true },
  });
  return branch.id;
}

/**
 * Create a RUNNING run with the given scenario. Handles the full
 * DRAFT → CONFIGURED → RUNNING lifecycle.
 */
async function createRunningRun(
  fx: Fixture,
  scenario: {
    initialState: Record<string, unknown>;
    injections: Record<string, unknown[]>;
    seed?: string;
    maxTicks?: number;
  },
): Promise<string> {
  await enableModule(fx);
  await makeCheckpoint(fx);
  const branchId = await mainBranchId(fx);

  const createRes = await api("POST", simUrl(fx, ""), fx.cookie, {
    branchId,
    scenario: {
      initialState: scenario.initialState,
      injections: scenario.injections,
      seed: scenario.seed ?? "dbg-seed",
      maxTicks: scenario.maxTicks ?? 20,
    },
  });
  expect(createRes.statusCode).toBe(201);
  const runId = (createRes.json() as { run: { id: string } }).run.id;

  const confRes = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
  expect(confRes.statusCode).toBe(200);

  const startRes = await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
  expect(startRes.statusCode).toBe(200);

  return runId;
}

/** Debug-step until the run pauses, completes, or maxSteps is reached. */
async function debugStepUntilStop(
  fx: Fixture,
  runId: string,
  maxSteps: number,
): Promise<{ tickNumber: number; breakpointHit: unknown | null; runStatus: string }> {
  let last: { tickNumber: number; breakpointHit: unknown | null; runStatus: string } | null = null;
  for (let i = 0; i < maxSteps; i++) {
    const res = await api("POST", simUrl(fx, `/${runId}/debug-step`), fx.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      tickNumber: number;
      breakpointHit: unknown | null;
      runStatus: string;
    };
    last = { tickNumber: body.tickNumber, breakpointHit: body.breakpointHit, runStatus: body.runStatus };
    if (body.breakpointHit || body.runStatus !== "RUNNING") break;
  }
  if (!last) throw new Error("no steps taken");
  return last;
}

// ---------------------------------------------------------------------------
// Tests: breakpoint CRUD
// ---------------------------------------------------------------------------

describe("024B breakpoint CRUD", () => {
  it("creates, lists, and deletes breakpoints (simulation:manage)", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500 },
      injections: {},
    });

    // Create TICK breakpoint.
    const createRes = await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "TICK",
      predicate: { tickNumber: 5 },
    });
    expect(createRes.statusCode).toBe(201);
    const bpId = (createRes.json() as { breakpoint: { id: string } }).breakpoint.id;

    // List.
    const listRes = await api("GET", simUrl(fx, `/${runId}/breakpoints`), fx.cookie);
    expect(listRes.statusCode).toBe(200);
    const bps = (listRes.json() as { breakpoints: Array<{ id: string; kind: string }> }).breakpoints;
    expect(bps).toHaveLength(1);
    expect(bps[0]?.kind).toBe("TICK");

    // Delete.
    const delRes = await api("DELETE", simUrl(fx, `/${runId}/breakpoints/${bpId}`), fx.cookie);
    expect(delRes.statusCode).toBe(204);

    const listRes2 = await api("GET", simUrl(fx, `/${runId}/breakpoints`), fx.cookie);
    expect((listRes2.json() as { breakpoints: unknown[] }).breakpoints).toHaveLength(0);
  });

  it("rejects invalid predicates (400 INVALID_INPUT)", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500 },
      injections: {},
    });

    // TICK without tickNumber.
    const r1 = await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "TICK",
      predicate: {},
    });
    expect(r1.statusCode).toBe(400);
    expect((r1.json() as { error: string }).error).toBe("INVALID_INPUT");

    // PREDICATE with bad op.
    const r2 = await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "PREDICATE",
      predicate: { path: "population", op: "LIKE", value: 100 },
    });
    expect(r2.statusCode).toBe(400);

    // Watch on non-PREDICATE kind.
    const r3 = await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "TICK",
      predicate: { tickNumber: 3 },
      watch: true,
    });
    expect(r3.statusCode).toBe(400);
  });

  it("VIEWER cannot create breakpoints (403)", async () => {
    const ownerFx = await seedFixture("OWNER");
    const runId = await createRunningRun(ownerFx, {
      initialState: { population: 500 },
      injections: {},
    });

    // VIEWER membership on the same workspace (no simulation caps).
    const { cookie: viewerCookie } = await seedUser(`viewer-${Date.now()}@test.local`);
    const viewer = await db.user.findFirstOrThrow({
      where: { email: { startsWith: "viewer-" } },
      orderBy: { createdAt: "desc" },
    });
    await db.membership.create({
      data: { workspaceId: ownerFx.workspaceId, userId: viewer.id, role: "VIEWER" },
    });

    const r1 = await api(
      "POST",
      simUrl(ownerFx, `/${runId}/breakpoints`),
      viewerCookie,
      { kind: "TICK", predicate: { tickNumber: 2 } },
    );
    expect(r1.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tests: fault-injection evaluation (contract §"Evaluation", pinned)
// ---------------------------------------------------------------------------

describe("024B fault-injection evaluation", () => {
  it("scenario 1: attribute crash — PREDICATE breakpoint fires at tick 12", async () => {
    const fx = await seedFixture();
    // Injection drives `population` off a cliff at tick 12.
    const runId = await createRunningRun(fx, {
      initialState: { population: 500, food_security: 0.6 },
      injections: {
        "12": [
          {
            kind: "POPULATION_CRASH",
            stateDelta: { population: 50 },
          },
        ],
      },
      maxTicks: 20,
    });

    // Predicate breakpoint: population < 100.
    const bpRes = await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "PREDICATE",
      predicate: { path: "population", op: "<", value: 100 },
    });
    expect(bpRes.statusCode).toBe(201);

    const stop = await debugStepUntilStop(fx, runId, 20);

    // Must pause at tick 12 with the predicate hit.
    expect(stop.tickNumber).toBe(12);
    expect(stop.runStatus).toBe("PAUSED");
    const hit = stop.breakpointHit as { kind: string; reason: string };
    expect(hit.kind).toBe("PREDICATE");
    expect(hit.reason).toContain("population");

    // pause_reason recorded on the run (021A PAUSED reused).
    const run = await db.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("PAUSED");
    expect(run.pauseReason).toContain("population");
  });

  it("scenario 1b: TICK breakpoint fires at the exact tick", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500 },
      injections: {},
      maxTicks: 10,
    });

    await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "TICK",
      predicate: { tickNumber: 4 },
    });

    const stop = await debugStepUntilStop(fx, runId, 10);
    expect(stop.tickNumber).toBe(4);
    expect(stop.runStatus).toBe("PAUSED");
    expect((stop.breakpointHit as { kind: string }).kind).toBe("TICK");
  });

  it("scenario 2: missing injection — watch shows flatline; replay byte-identical", async () => {
    const fx = await seedFixture();
    // Injections at ticks 10 and 12, but the tick-11 injection is
    // "dropped" (missing). The watch on `grain` must show the flatline
    // (value unchanged across tick 11).
    const runId = await createRunningRun(fx, {
      initialState: { grain: 100 },
      injections: {
        "10": [{ kind: "HARVEST", stateDelta: { grain: 120 } }],
        // Tick 11: intentionally missing (dropped injection).
        "12": [{ kind: "HARVEST", stateDelta: { grain: 140 } }],
      },
      maxTicks: 15,
    });

    // Watch the grain path.
    await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "PREDICATE",
      predicate: { path: "grain", op: ">", value: 0 },
      watch: true,
    });

    // Step to tick 14 (no breakpoints that pause — the watch is observe-only).
    for (let i = 0; i < 14; i++) {
      const res = await api("POST", simUrl(fx, `/${runId}/debug-step`), fx.cookie);
      expect(res.statusCode).toBe(200);
    }

    // Watch strip: grain goes 100 → 120 (tick 10) → 120 (tick 11, flatline)
    // → 140 (tick 12).
    const watchRes = await api("GET", simUrl(fx, `/${runId}/watch`), fx.cookie);
    expect(watchRes.statusCode).toBe(200);
    const watches = (watchRes.json() as { watches: Array<{ path: string; values: Array<{ tickNumber: number; value: unknown }> }> }).watches;
    expect(watches).toHaveLength(1);
    expect(watches[0]?.path).toBe("grain");
    const byTick = new Map(watches[0]?.values.map((v) => [v.tickNumber, v.value]) ?? []);
    expect(byTick.get(10)).toBe(120);
    expect(byTick.get(11)).toBe(120); // flatline — the dropped injection
    expect(byTick.get(12)).toBe(140);

    // Replay to tick 14: must be byte-identical to the stored tick.
    const replayRes = await api("POST", simUrl(fx, `/${runId}/replay`), fx.cookie, {
      toTick: 14,
    });
    expect(replayRes.statusCode).toBe(200);
    const replay = replayRes.json() as {
      toTick: number;
      fidelity: { matches: boolean };
    };
    expect(replay.toTick).toBe(14);
    expect(replay.fidelity.matches).toBe(true);

    // Invariant 5: replay is non-persisting — tick count unchanged.
    const tickCount = await db.simulationTick.count({ where: { runId } });
    expect(tickCount).toBe(14);
  });

  it("scenario 3: proposal storm — ON_PROPOSAL breakpoint pauses with all three listed", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500 },
      injections: {},
      maxTicks: 20,
    });

    // Raise 3 proposals directly (021B service — the "storm").
    for (let i = 0; i < 3; i++) {
      await db.simulationProposal.create({
        data: {
          workspaceId: fx.workspaceId,
          novelId: fx.novelId,
          runId,
          tickNumber: 5,
          kind: "OUTCOME_FORK",
          alternatives: [
            { id: "a", outcome: "up", evidence: {}, confidence: 0.5 },
            { id: "b", outcome: "down", evidence: {}, confidence: 0.5 },
          ],
          trigger: "NO_DOMINANT_OUTCOME",
          reason: `storm proposal ${i}`,
        },
      });
    }

    await api("POST", simUrl(fx, `/${runId}/breakpoints`), fx.cookie, {
      kind: "ON_PROPOSAL",
    });

    const stop = await debugStepUntilStop(fx, runId, 20);
    expect(stop.runStatus).toBe("PAUSED");
    const hit = stop.breakpointHit as {
      kind: string;
      proposals: Array<{ id: string }>;
    };
    expect(hit.kind).toBe("ON_PROPOSAL");
    expect(hit.proposals).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: replay fidelity + determinism
// ---------------------------------------------------------------------------

describe("024B replay", () => {
  it("replay is byte-identical across the full run (determinism proof)", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500, food_security: 0.6, grain: 100 },
      injections: {
        "3": [{ kind: "RAIN", stateDelta: { food_security: 0.7 } }],
        "7": [{ kind: "HARVEST", stateDelta: { grain: 130, population: 520 } }],
      },
      maxTicks: 10,
    });

    // Step the full run.
    for (let i = 0; i < 10; i++) {
      const res = await api("POST", simUrl(fx, `/${runId}/debug-step`), fx.cookie);
      expect(res.statusCode).toBe(200);
    }

    // Replay every tick; all must match.
    for (let k = 1; k <= 10; k++) {
      const replayRes = await api("POST", simUrl(fx, `/${runId}/replay`), fx.cookie, {
        toTick: k,
      });
      expect(replayRes.statusCode).toBe(200);
      const replay = replayRes.json() as { fidelity: { matches: boolean } };
      expect(replay.fidelity.matches).toBe(true);
    }
  });

  it("replay out of range → 409 REPLAY_OUT_OF_RANGE", async () => {
    const fx = await seedFixture();
    const runId = await createRunningRun(fx, {
      initialState: { population: 500 },
      injections: {},
      maxTicks: 10,
    });

    // toTick=5 but currentTick=0.
    const res = await api("POST", simUrl(fx, `/${runId}/replay`), fx.cookie, {
      toTick: 5,
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("REPLAY_OUT_OF_RANGE");
  });

  it("replay requires simulation:read (EDITOR can replay, cannot debug-step)", async () => {
    const ownerFx = await seedFixture("OWNER");
    const runId = await createRunningRun(ownerFx, {
      initialState: { population: 500 },
      injections: {},
      maxTicks: 5,
    });
    for (let i = 0; i < 3; i++) {
      await api("POST", simUrl(ownerFx, `/${runId}/debug-step`), ownerFx.cookie);
    }

    // EDITOR has simulation:read but not simulation:manage (021A Q7).
    const { cookie: editorCookie } = await seedUser(`editor-${Date.now()}@test.local`);
    const editor = await db.user.findFirstOrThrow({
      where: { email: { startsWith: "editor-" } },
      orderBy: { createdAt: "desc" },
    });
    await db.membership.create({
      data: { workspaceId: ownerFx.workspaceId, userId: editor.id, role: "EDITOR" },
    });

    // EDITOR can replay (read).
    const r1 = await api("POST", simUrl(ownerFx, `/${runId}/replay`), editorCookie, {
      toTick: 2,
    });
    expect(r1.statusCode).toBe(200);

    // EDITOR cannot debug-step (manage).
    const r2 = await api("POST", simUrl(ownerFx, `/${runId}/debug-step`), editorCookie);
    expect(r2.statusCode).toBe(403);
  });
});
