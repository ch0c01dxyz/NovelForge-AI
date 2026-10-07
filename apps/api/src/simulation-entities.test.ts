/**
 * Simulation entity persistence (NF-WF-033 / GAP-091) integration suite.
 *
 * Dedicated `novelforge_test_simulation_entities` db (parallel-safe per
 * ADR-0003 §8). Drives the real HTTP surface + the service directly
 * (for scenario kinds carrying entity reducers, which the route does
 * not expose) against a real migrated database.
 *
 * What this suite pins:
 *  - **Initial entities**: validated at creation (400, atomic), persisted
 *    with tickCreated = 0 and deterministic ids.
 *  - **Per-tick deltas**: reducer bumps attributes; retirement sets
 *    tickRetired; lifespan rule for listEntities(tick).
 *  - **Atomicity**: malformed reducer output fails the tick — no tick
 *    row, no events, no partial entity writes, currentTick unadvanced.
 *  - **Determinism**: same seed + same ticks → byte-identical entity
 *    rows (createdAt excluded as wall-clock audit metadata).
 *  - **Tenant isolation**: run-scoped reads; cross-novel 404s.
 *  - **No canon mutation**: canon counts unchanged after entity ticks.
 *  - **Forward-only**: pre-existing entity-less runs list [].
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createSimulationServices } from "./services/simulation.ts";
import {
  deriveEntityDeltas,
  deriveEntityId,
  isValidEntityKind,
  resolveEntityRules,
  __clearEntityRulesForTesting,
  __registerEntityRulesForTesting,
  type EntityReducer,
} from "./services/simulation-entities.ts";

const TEST_DB = "novelforge_test_simulation_entities";
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

afterEach(() => {
  __clearEntityRulesForTesting();
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
  const { userId, cookie } = await seedUser(
    `ent-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`,
  );
  const ws = await db.workspace.create({
    data: {
      name: "ws",
      slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ownerId: userId,
    },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Entity Novel", slug: `novel-${Date.now()}` },
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

async function enableModule(fx: Fixture): Promise<void> {
  await db.novelModule.create({
    data: { novelId: fx.novelId, moduleName: "simulation" },
  });
}

async function makeCheckpoint(fx: Fixture): Promise<string> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/checkpoints`,
    fx.cookie,
    { label: "entity-checkpoint" },
  );
  expect(res.statusCode).toBe(201);
  return (res.json() as { checkpointId: string }).checkpointId;
}

async function mainBranchId(fx: Fixture): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId: fx.novelId, name: "main" },
    select: { id: true },
  });
  return branch.id;
}

/** Create a run via HTTP (STANDARD kind; no reducer). */
async function createRun(
  fx: Fixture,
  branchId: string,
  scenario?: Record<string, unknown>,
): Promise<string> {
  const res = await api("POST", simUrl(fx, ""), fx.cookie, {
    branchId,
    scenario: {
      initialState: { population: 500 },
      injections: {},
      seed: "entity-seed",
      maxTicks: 20,
      ...scenario,
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { run: { id: string } }).run.id;
}

/** Configure + start a run via HTTP (prerequisites satisfied by fixture). */
async function configureAndStart(fx: Fixture, runId: string): Promise<void> {
  await enableModule(fx);
  await makeCheckpoint(fx);
  let res = await api("POST", simUrl(fx, `/${runId}/configure`), fx.cookie);
  expect(res.statusCode).toBe(200);
  res = await api("POST", simUrl(fx, `/${runId}/start`), fx.cookie);
  expect(res.statusCode).toBe(200);
}

async function canonCounts(novelId: string): Promise<Record<string, number>> {
  const [canonFact, storyEntity, chapter, chapterVersion] = await Promise.all([
    db.canonFact.count({ where: { novelId } }),
    db.storyEntity.count({ where: { novelId } }),
    db.chapter.count({ where: { novelId } }),
    db.chapterVersion.count({ where: { chapter: { novelId } } }),
  ]);
  return { canonFact, storyEntity, chapter, chapterVersion };
}

// ---------------------------------------------------------------------------
// Pure-function unit tests (no DB)
// ---------------------------------------------------------------------------

describe("deriveEntityId / deriveEntityDeltas (pure)", () => {
  it("derives stable, distinct ids (UUIDv5, never random)", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const a = deriveEntityId(runId, "SETTLEMENT", 0, 0);
    const b = deriveEntityId(runId, "SETTLEMENT", 0, 0);
    const c = deriveEntityId(runId, "SETTLEMENT", 0, 1);
    const d = deriveEntityId(runId, "POPULATION", 0, 0);
    expect(a).toBe(b); // deterministic
    expect(a).not.toBe(c); // ordinal distinguishes
    expect(a).not.toBe(d); // kind distinguishes
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ); // version 5, RFC 4122 variant
  });

  it("returns empty deltas when entityRules is null (021A minimal rule)", () => {
    const deltas = deriveEntityDeltas({
      stateBefore: {},
      stateAfter: { x: 1 },
      tickNumber: 1,
      liveEntities: [],
      entityRules: null,
    });
    expect(deltas).toEqual({ upsert: [], retire: [] });
  });

  it("passes reducer output through when valid", () => {
    const reducer: EntityReducer = () => ({
      upsert: [{ kind: "RESOURCE", attributes: { surplus: 5 } }],
      retire: [],
    });
    const deltas = deriveEntityDeltas({
      stateBefore: {},
      stateAfter: {},
      tickNumber: 1,
      liveEntities: [],
      entityRules: reducer,
    });
    expect(deltas.upsert).toHaveLength(1);
    expect(deltas.upsert[0]?.kind).toBe("RESOURCE");
  });

  it("rejects unknown upsert ids (never silently ignored)", () => {
    const reducer: EntityReducer = () => ({
      upsert: [
        {
          id: "00000000-0000-4000-8000-000000000000",
          kind: "POPULATION",
          attributes: {},
        },
      ],
      retire: [],
    });
    expect(() =>
      deriveEntityDeltas({
        stateBefore: {},
        stateAfter: {},
        tickNumber: 1,
        liveEntities: [],
        entityRules: reducer,
      }),
    ).toThrow(/unknown entity/);
  });

  it("rejects unknown retire ids", () => {
    const reducer: EntityReducer = () => ({
      upsert: [],
      retire: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(() =>
      deriveEntityDeltas({
        stateBefore: {},
        stateAfter: {},
        tickNumber: 1,
        liveEntities: [],
        entityRules: reducer,
      }),
    ).toThrow(/unknown entity/);
  });

  it("rejects invalid kinds in reducer output", () => {
    const reducer = (() => ({
      upsert: [{ kind: "BOGUS", attributes: {} }],
      retire: [],
    })) as unknown as EntityReducer;
    expect(() =>
      deriveEntityDeltas({
        stateBefore: {},
        stateAfter: {},
        tickNumber: 1,
        liveEntities: [],
        entityRules: reducer,
      }),
    ).toThrow(/not a valid SimulationEntityKind/);
  });

  it("isValidEntityKind accepts the F5 kinds only", () => {
    for (const k of [
      "SETTLEMENT",
      "POPULATION",
      "RESOURCE",
      "KNOWLEDGE",
      "INFRASTRUCTURE",
    ]) {
      expect(isValidEntityKind(k)).toBe(true);
    }
    expect(isValidEntityKind("BOGUS")).toBe(false);
    expect(isValidEntityKind(null)).toBe(false);
    expect(isValidEntityKind(42)).toBe(false);
  });

  it("resolveEntityRules: unregistered kinds → null (021A minimal rule)", () => {
    expect(resolveEntityRules("STANDARD")).toBeNull();
    expect(resolveEntityRules("WHATIF")).toBeNull();
    expect(resolveEntityRules("NOPE")).toBeNull();
    expect(resolveEntityRules(null)).toBeNull();
    const reducer: EntityReducer = () => ({ upsert: [], retire: [] });
    __registerEntityRulesForTesting("TEST_X", reducer);
    expect(resolveEntityRules("TEST_X")).toBe(reducer);
  });
});

// ---------------------------------------------------------------------------
// Initial entities (run start)
// ---------------------------------------------------------------------------

describe("initial entities", () => {
  it("persists initial entities with tickCreated = 0 and deterministic ids", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId, {
      initialEntities: [
        { kind: "SETTLEMENT", attributes: { name: "Riverbend" } },
        { kind: "POPULATION", attributes: { count: 500 } },
      ],
    });

    const rows = await db.simulationEntity.findMany({
      where: { runId },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.tickCreated).toBe(0);
      expect(r.tickRetired).toBeNull();
    }
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    expect(byKind.get("SETTLEMENT")?.attributes).toMatchObject({ name: "Riverbend" });
    expect(byKind.get("POPULATION")?.attributes).toMatchObject({ count: 500 });
    // Deterministic ids: runId + kind + tickCreated + ordinal.
    expect(byKind.get("SETTLEMENT")?.id).toBe(
      deriveEntityId(runId, "SETTLEMENT", 0, 0),
    );
    expect(byKind.get("POPULATION")?.id).toBe(
      deriveEntityId(runId, "POPULATION", 0, 1),
    );
  });

  it("first stepRun keeps initial entities live (no-op without rules)", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId, {
      initialEntities: [{ kind: "RESOURCE", attributes: { surplus: 100 } }],
    });
    await configureAndStart(fx, runId);

    const res = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, {
      ticks: 2,
    });
    expect(res.statusCode).toBe(200);

    // Entities persist untouched under the 021A minimal rule (no reducer).
    const rows = await db.simulationEntity.findMany({ where: { runId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tickRetired).toBeNull();
    expect(rows[0]?.attributes).toMatchObject({ surplus: 100 });

    // listEntities at tick 2 includes it (lifespan rule).
    const list = await api(
      "GET",
      simUrl(fx, `/${runId}/entities?tick=2`),
      fx.cookie,
    );
    expect(list.statusCode).toBe(200);
    expect((list.json() as { entities: unknown[] }).entities).toHaveLength(1);
  });

  it("no initialEntities → zero entity rows after ticks", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId);
    await configureAndStart(fx, runId);

    const res = await api("POST", simUrl(fx, `/${runId}/step`), fx.cookie, {
      ticks: 3,
    });
    expect(res.statusCode).toBe(200);
    expect(await db.simulationEntity.count({ where: { runId } })).toBe(0);

    const list = await api("GET", simUrl(fx, `/${runId}/entities`), fx.cookie);
    expect(list.statusCode).toBe(200);
    expect((list.json() as { entities: unknown[] }).entities).toEqual([]);
  });

  it("invalid initial kind → 400 INVALID_INPUT, no partial run (route)", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const before = await db.simulationRun.count({ where: { novelId: fx.novelId } });

    const res = await api("POST", simUrl(fx, ""), fx.cookie, {
      branchId,
      scenario: {
        initialState: {},
        initialEntities: [{ kind: "BOGUS", attributes: {} }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");

    // Atomic: no run row, no entity rows.
    expect(await db.simulationRun.count({ where: { novelId: fx.novelId } })).toBe(
      before,
    );
    expect(await db.simulationEntity.count()).toBe(0);
  });

  it("invalid initial kind → 400 INVALID_INPUT (service, bypassing route zod)", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const services = createSimulationServices({ db });
    await expect(
      services.createRun({
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        branchId,
        scenario: {
          initialEntities: [{ kind: "BOGUS", attributes: {} }] as never,
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", statusCode: 400 });
    expect(await db.simulationRun.count({ where: { novelId: fx.novelId } })).toBe(0);
  });

  it("non-object attributes → 400 INVALID_INPUT", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const services = createSimulationServices({ db });
    await expect(
      services.createRun({
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        branchId,
        scenario: {
          initialEntities: [{ kind: "RESOURCE", attributes: [1, 2] } as never],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

// ---------------------------------------------------------------------------
// Per-tick deltas via a registered test reducer (service-direct)
// ---------------------------------------------------------------------------

/** Counter reducer: bumps POPULATION.count by 1 each tick. */
function counterReducer(): EntityReducer {
  return ({ liveEntities }) => {
    const pop = liveEntities.find((e) => e.kind === "POPULATION");
    if (!pop) return { upsert: [], retire: [] };
    const count = (pop.attributes["count"] as number) ?? 0;
    return {
      upsert: [
        {
          id: pop.id,
          kind: "POPULATION",
          attributes: { ...pop.attributes, count: count + 1 },
        },
      ],
      retire: [],
    };
  };
}

async function serviceFixture(kind: string) {
  const fx = await seedFixture();
  const branchId = await mainBranchId(fx);
  await enableModule(fx);
  await makeCheckpoint(fx);
  const services = createSimulationServices({ db });
  const run = await services.createRun({
    actorUserId: fx.userId,
    workspaceId: fx.workspaceId,
    novelId: fx.novelId,
    branchId,
    kind,
    scenario: {
      initialState: {},
      seed: "entity-seed",
      maxTicks: 20,
      initialEntities: [{ kind: "POPULATION", attributes: { count: 10 } }],
    },
  });
  await services.configureRun({
    actorUserId: fx.userId,
    workspaceId: fx.workspaceId,
    novelId: fx.novelId,
    runId: run.id,
  });
  await services.startRun({
    actorUserId: fx.userId,
    workspaceId: fx.workspaceId,
    novelId: fx.novelId,
    runId: run.id,
  });
  const base = {
    actorUserId: fx.userId,
    workspaceId: fx.workspaceId,
    novelId: fx.novelId,
    runId: run.id,
  };
  return { fx, services, base, runId: run.id };
}

describe("per-tick deltas", () => {
  it("reducer bumps attributes per tick; entities agree with tick state", async () => {
    __registerEntityRulesForTesting("TEST_COUNTER", counterReducer());
    const { services, base, runId } = await serviceFixture("TEST_COUNTER");

    await services.stepRun({ ...base, ticks: 3 });

    const entities = await services.listEntities({ ...base });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.attributes).toMatchObject({ count: 13 }); // 10 + 3

    // Tick JSON and entities agree: the tick row exists for each tick.
    const tickCount = await db.simulationTick.count({ where: { runId } });
    expect(tickCount).toBe(3);
  });

  it("retirement sets tickRetired; lifespan rule filters correctly", async () => {
    const retireAt2: EntityReducer = ({ liveEntities, tickNumber }) => {
      if (tickNumber !== 2) return { upsert: [], retire: [] };
      const target = liveEntities.find((e) => e.kind === "POPULATION");
      return { upsert: [], retire: target ? [target.id] : [] };
    };
    __registerEntityRulesForTesting("TEST_RETIRE", retireAt2);
    const { services, base, runId } = await serviceFixture("TEST_RETIRE");

    await services.stepRun({ ...base, ticks: 3 });

    const row = await db.simulationEntity.findFirstOrThrow({ where: { runId } });
    expect(row.tickRetired).toBe(2);

    expect((await services.listEntities({ ...base, tick: 1 })).length).toBe(1);
    expect((await services.listEntities({ ...base, tick: 2 })).length).toBe(0);
    expect((await services.listEntities({ ...base })).length).toBe(0); // currentTick = 3
  });

  it("reducer can create entities mid-run with deterministic ids", async () => {
    const spawner: EntityReducer = ({ tickNumber }) =>
      tickNumber === 1
        ? {
            upsert: [{ kind: "RESOURCE", attributes: { surplus: 42 } }],
            retire: [],
          }
        : { upsert: [], retire: [] };
    __registerEntityRulesForTesting("TEST_SPAWN", spawner);
    const { services, base, runId } = await serviceFixture("TEST_SPAWN");

    await services.stepRun({ ...base, ticks: 2 });

    const spawned = await db.simulationEntity.findFirstOrThrow({
      where: { runId, kind: "RESOURCE" },
    });
    expect(spawned.tickCreated).toBe(1);
    expect(spawned.id).toBe(deriveEntityId(runId, "RESOURCE", 1, 0));
    expect(spawned.attributes).toMatchObject({ surplus: 42 });
  });

  it("atomicity: malformed delta fails the tick — no partial writes", async () => {
    let calls = 0;
    const flaky: EntityReducer = () => {
      calls += 1;
      if (calls === 1) return { upsert: [], retire: [] };
      // Second tick: reference an unknown entity → 400, tick must fail.
      return {
        upsert: [
          {
            id: "00000000-0000-4000-8000-000000000000",
            kind: "POPULATION",
            attributes: {},
          },
        ],
        retire: [],
      };
    };
    __registerEntityRulesForTesting("TEST_FLAKY", flaky);
    const { services, base, runId } = await serviceFixture("TEST_FLAKY");

    await services.stepRun({ ...base, ticks: 1 });
    await expect(services.stepRun({ ...base, ticks: 1 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      statusCode: 400,
    });

    // No tick row for tick 2, no events, no entity changes, currentTick = 1.
    expect(
      await db.simulationTick.count({ where: { runId, tickNumber: 2 } }),
    ).toBe(0);
    expect(
      await db.simulationEvent.count({ where: { runId, tickNumber: 2 } }),
    ).toBe(0);
    const run = await db.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.currentTick).toBe(1);
    const entities = await services.listEntities({ ...base });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.attributes).toMatchObject({ count: 10 }); // unchanged
  });

  it("a later tick failure preserves the durable cursor for retry", async () => {
    let calls = 0;
    __registerEntityRulesForTesting("TEST_BATCH_FAILURE", () => {
      calls++;
      if (calls === 2) return { upsert: [{ id: "00000000-0000-4000-8000-000000000000", kind: "POPULATION", attributes: {} }], retire: [] };
      return { upsert: [], retire: [] };
    });
    const { services, base, runId } = await serviceFixture("TEST_BATCH_FAILURE");
    await expect(services.stepRun({ ...base, ticks: 2 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const persisted = await db.simulationTick.count({ where: { runId } });
    expect((await db.simulationRun.findUniqueOrThrow({ where: { id: runId } })).currentTick).toBe(persisted);
    await expect(services.stepRun({ ...base, ticks: 1 })).resolves.toBeDefined();
  });

  it("kind filter returns only matching rows", async () => {
    __registerEntityRulesForTesting("TEST_COUNTER", counterReducer());
    const { fx, runId } = await serviceFixture("TEST_COUNTER");
    // Add a second kind directly to test filtering.
    await db.simulationEntity.create({
      data: {
        id: deriveEntityId(runId, "RESOURCE", 0, 1),
        runId,
        kind: "RESOURCE",
        attributes: { surplus: 1 },
        tickCreated: 0,
        tickRetired: null,
      },
    });

    const res = await api(
      "GET",
      simUrl(fx, `/${runId}/entities?kind=RESOURCE`),
      fx.cookie,
    );
    expect(res.statusCode).toBe(200);
    const entities = (res.json() as { entities: { kind: string }[] }).entities;
    expect(entities).toHaveLength(1);
    expect(entities[0]?.kind).toBe("RESOURCE");
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same seed + same ticks → identical entity content; ids deterministically derived", async () => {
    __registerEntityRulesForTesting("TEST_COUNTER", counterReducer());

    async function runOnce() {
      const { services, base, runId } = await serviceFixture("TEST_COUNTER");
      await services.stepRun({ ...base, ticks: 3 });
      const rows = await db.simulationEntity.findMany({
        where: { runId },
        orderBy: { id: "asc" },
      });
      return { runId, rows };
    }

    const a = await runOnce();
    // Fresh fixture for the second run (same seed, same reducer).
    const b = await runOnce();

    // Entity content (kind/attributes/lifespan) is byte-identical.
    // runId/id differ across runs by design (ids derive from runId);
    // id determinism is asserted per-row below.
    const content = (r: { rows: typeof a.rows }) =>
      r.rows.map((row) => ({
        kind: row.kind,
        attributes: row.attributes,
        tickCreated: row.tickCreated,
        tickRetired: row.tickRetired,
      }));
    expect(JSON.stringify(content(b))).toBe(JSON.stringify(content(a)));
    expect(a.rows.length).toBeGreaterThan(0);

    // Ids are deterministically derived (not random): each id equals
    // UUIDv5(runId + kind + tickCreated + ordinal).
    for (const { runId, rows } of [a, b]) {
      const byTickKind = new Map<string, number>();
      const sorted = [...rows].sort((x, y) =>
        x.tickCreated - y.tickCreated || x.kind.localeCompare(y.kind),
      );
      for (const row of sorted) {
        const key = `${row.tickCreated}:${row.kind}`;
        const ordinal = byTickKind.get(key) ?? 0;
        byTickKind.set(key, ordinal + 1);
        expect(row.id).toBe(
          deriveEntityId(runId, row.kind as never, row.tickCreated, ordinal),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
  it("entities are run-scoped: cross-novel context → 404", async () => {
    const fxA = await seedFixture();
    const branchId = await mainBranchId(fxA);
    const runId = await createRun(fxA, branchId, {
      initialEntities: [{ kind: "SETTLEMENT", attributes: { name: "A" } }],
    });

    const fxB = await seedFixture(); // different workspace + novel
    const res = await api(
      "GET",
      `/api/workspaces/${fxB.workspaceId}/novels/${fxB.novelId}/simulations/${runId}/entities`,
      fxB.cookie,
    );
    expect(res.statusCode).toBe(404);
  });

  it("non-member → 404", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId);
    const outsider = await seedUser(`outsider-${Date.now()}@test.local`);

    const res = await api(
      "GET",
      simUrl(fx, `/${runId}/entities`),
      outsider.cookie,
    );
    expect(res.statusCode).toBe(404);
  });

  it("VIEWER stepRun → 403 (writes need simulation:manage)", async () => {
    const owner = await seedFixture("OWNER");
    const branchId = await mainBranchId(owner);
    const runId = await createRun(owner, branchId);
    await configureAndStart(owner, runId);

    // Downgrade the same user is complex; use a fresh VIEWER fixture on the
    // same novel via direct membership insert.
    const viewer = await seedUser(`viewer-${Date.now()}@test.local`);
    await db.membership.create({
      data: { workspaceId: owner.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const res = await api(
      "POST",
      simUrl(
        { ...owner, cookie: viewer.cookie, userId: viewer.userId },
        `/${runId}/step`,
      ),
      viewer.cookie,
      { ticks: 1 },
    );
    expect(res.statusCode).toBe(403);
  });

  it("EDITOR can read entities (simulation:read); VIEWER → 403", async () => {
    const owner = await seedFixture("OWNER");
    const branchId = await mainBranchId(owner);
    const runId = await createRun(owner, branchId, {
      initialEntities: [{ kind: "SETTLEMENT", attributes: { name: "A" } }],
    });
    const editor = await seedUser(`editor-${Date.now()}@test.local`);
    await db.membership.create({
      data: { workspaceId: owner.workspaceId, userId: editor.userId, role: "EDITOR" },
    });
    const res = await api(
      "GET",
      simUrl(
        { ...owner, cookie: editor.cookie, userId: editor.userId },
        `/${runId}/entities`,
      ),
      editor.cookie,
    );
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entities: unknown[] }).entities).toHaveLength(1);

    // VIEWER has no simulation:read → 403.
    const viewer = await seedUser(`viewer2-${Date.now()}@test.local`);
    await db.membership.create({
      data: { workspaceId: owner.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const denied = await api(
      "GET",
      simUrl(
        { ...owner, cookie: viewer.cookie, userId: viewer.userId },
        `/${runId}/entities`,
      ),
      viewer.cookie,
    );
    expect(denied.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// No canon mutation + route-level
// ---------------------------------------------------------------------------

describe("no canon mutation", () => {
  it("canon counts unchanged after entity-writing ticks (Invariant 1)", async () => {
    __registerEntityRulesForTesting("TEST_COUNTER", counterReducer());
    const { fx, services, base, runId } = await serviceFixture("TEST_COUNTER");
    const before = await canonCounts(fx.novelId);
    await services.stepRun({ ...base, ticks: 3 });
    const after = await canonCounts(fx.novelId);
    expect(after).toEqual(before);
    // Sanity: entities were actually written.
    expect(await db.simulationEntity.count({ where: { runId } })).toBe(1);
  });
});

describe("route-level", () => {
  it("GET entities → 200; tick/kind filters; 401; 404 unknown run", async () => {
    const fx = await seedFixture();
    const branchId = await mainBranchId(fx);
    const runId = await createRun(fx, branchId, {
      initialEntities: [
        { kind: "SETTLEMENT", attributes: { name: "A" } },
        { kind: "RESOURCE", attributes: { surplus: 1 } },
      ],
    });

    let res = await api("GET", simUrl(fx, `/${runId}/entities`), fx.cookie);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entities: unknown[] }).entities).toHaveLength(2);

    res = await api("GET", simUrl(fx, `/${runId}/entities?kind=SETTLEMENT`), fx.cookie);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entities: unknown[] }).entities).toHaveLength(1);

    res = await api("GET", simUrl(fx, `/${runId}/entities?tick=0`), fx.cookie);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entities: unknown[] }).entities).toHaveLength(2);

    res = await api(
      "GET",
      simUrl(fx, `/${runId}/entities?kind=BOGUS`),
      fx.cookie,
    );
    expect(res.statusCode).toBe(400);

    // 401 unauthenticated.
    res = await app.inject({
      method: "GET",
      url: simUrl(fx, `/${runId}/entities`),
    });
    expect(res.statusCode).toBe(401);

    // 404 unknown run.
    res = await api(
      "GET",
      simUrl(fx, `/00000000-0000-4000-8000-000000000000/entities`),
      fx.cookie,
    );
    expect(res.statusCode).toBe(404);
  });
});
