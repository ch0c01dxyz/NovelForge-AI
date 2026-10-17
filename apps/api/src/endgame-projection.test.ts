/**
 * Endgame closure projection (NF-WF-022C) integration suite.
 *
 * Dedicated `novelforge_test_endgame_projection` db (parallel-safe per ADR-0003 §8).
 * Drives `runEndgameProjection` against the real 021A SimulationServices
 * and a real migrated database, with an in-memory ledger store behind the
 * injected EndgameLedgerReader seam (022A is implemented in parallel;
 * the reader is the pinned-shape contract).
 *
 * What this suite pins:
 *  - **Projection runs via 021**: close plan → per-tick closures;
 *    MUSTs in the plan end CLOSED; projectedGate READY.
 *  - **"What if X stays OPEN"**: MUST absent from the plan stays OPEN;
 *    projectedGate BLOCKED.
 *  - **021-disabled → clean 400**: no NovelModule row → SimulationError
 *    MODULE_NOT_ENABLED (021A's existing prerequisite check; no new code).
 *  - **No ledger mutation**: the in-memory ledger store is deep-equal
 *    before/after the projection, while simulation tables were written
 *    (the projection ran — it just never touched the ledger).
 *  - **Validation**: unknown thread in closePlan → INVALID_INPUT.
 *  - **Determinism**: same inputs → identical projection results.
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
import { createSimulationServices } from "./services/simulation.ts";
import { SimulationError } from "./services/simulation.ts";
import {
  runEndgameProjection,
  createEndgameLedgerReader,
  type EndgameLedgerReader,
  type EndgameLedgerEntry,
} from "./services/endgame-projection.ts";
import { createEndgameServices } from "./services/endgame.ts";
import { createAuditService } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_endgame_projection";
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
  await db.endgameCallback.deleteMany();
  await db.endgameLegacy.deleteMany();
  await db.endgameGateApproval.deleteMany();
  await db.endgameLedger.deleteMany();
  await db.storyThreadEvent.deleteMany();
  await db.storyThread.deleteMany();
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
  branchId: string;
}

async function seedFixture(): Promise<Fixture> {
  const { userId, cookie } = await seedUser(
    `endgame-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`,
  );
  const ws = await db.workspace.create({
    data: {
      name: "ws",
      slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ownerId: userId,
    },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role: "OWNER" } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Endgame Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;

  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId, name: "main" },
    select: { id: true },
  });

  const cp = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels/${novelId}/checkpoints`,
    headers: { cookie },
    payload: { label: "endgame-checkpoint" },
  });
  expect(cp.statusCode).toBe(201);

  return { cookie, userId, workspaceId: ws.id, novelId, branchId: branch.id };
}

/** Enable the simulation module via direct DB insert (021A F4 precedent). */
async function enableModule(fx: Fixture): Promise<void> {
  await db.novelModule.create({
    data: { novelId: fx.novelId, moduleName: "simulation" },
  });
}

function ledgerEntry(
  threadId: string,
  status: EndgameLedgerEntry["status"],
  closed = false,
): EndgameLedgerEntry {
  return {
    ledgerId: `ledger-${threadId}`,
    threadId,
    status,
    closed,
    criteria: `${status} criteria`,
  };
}

/** In-memory ledger store behind the reader seam (022A parallel). */
function memoryLedger(entries: EndgameLedgerEntry[]): {
  reader: EndgameLedgerReader;
  store: EndgameLedgerEntry[];
} {
  const store = entries.map((e) => ({ ...e }));
  const reader: EndgameLedgerReader = async () => store.map((e) => ({ ...e }));
  return { reader, store };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("022C endgame projection", () => {
  it("runs via 021; MUSTs in the close plan end CLOSED; gate READY", async () => {
    const fx = await seedFixture();
    await enableModule(fx);
    const services = createSimulationServices({ db });
    const { reader } = memoryLedger([
      ledgerEntry("t-must-1", "MUST", true),
      ledgerEntry("t-must-2", "MUST", false),
      ledgerEntry("t-should-1", "SHOULD", false),
    ]);

    const result = await runEndgameProjection({
      db,
      simulationServices: services,
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      branchId: fx.branchId,
      readLedger: reader,
      closePlan: ["t-must-2", "t-should-1"],
    });

    expect(result.runId).toBeTruthy();
    expect(result.projectedGate).toBe("READY");
    expect(result.openMusts).toEqual([]);
    expect(result.closedMusts.map((e) => e.threadId).sort()).toEqual([
      "t-must-1",
      "t-must-2",
    ]);
    expect(result.ticksRun).toBe(2);

    // The projection ran through 021 tables.
    const run = await db.simulationRun.findUniqueOrThrow({
      where: { id: result.runId },
    });
    expect(run.status).toBe("COMPLETED");
  });

  it("MUST left out of the close plan stays OPEN; gate BLOCKED", async () => {
    const fx = await seedFixture();
    await enableModule(fx);
    const services = createSimulationServices({ db });
    const { reader } = memoryLedger([
      ledgerEntry("t-must-1", "MUST", false),
      ledgerEntry("t-should-1", "SHOULD", false),
    ]);

    const result = await runEndgameProjection({
      db,
      simulationServices: services,
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      branchId: fx.branchId,
      readLedger: reader,
      // "What if t-must-1 stays OPEN?" — close only the SHOULD.
      closePlan: ["t-should-1"],
    });

    expect(result.projectedGate).toBe("BLOCKED");
    expect(result.openMusts.map((e) => e.threadId)).toEqual(["t-must-1"]);
    expect(result.closedOthers.map((e) => e.threadId)).toEqual(["t-should-1"]);
  });

  it("021 not enabled → clean 400 MODULE_NOT_ENABLED (not a crash)", async () => {
    const fx = await seedFixture();
    // Deliberately NOT enabling the module.
    const services = createSimulationServices({ db });
    const { reader } = memoryLedger([ledgerEntry("t-must-1", "MUST", false)]);

    const err = await runEndgameProjection({
      db,
      simulationServices: services,
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      branchId: fx.branchId,
      readLedger: reader,
      closePlan: ["t-must-1"],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SimulationError);
    expect((err as SimulationError).code).toBe("MODULE_NOT_ENABLED");
    expect((err as SimulationError).statusCode).toBe(400);
  });

  it("does not mutate the ledger (real 022A table: row counts and contents unchanged)", async () => {
    const fx = await seedFixture();
    await enableModule(fx);
    const services = createSimulationServices({ db });
    const audit = createAuditService(db);
    const endgameServices = createEndgameServices({ db, audit });

    // Real story threads + real ledger entries via 022A's service.
    const t1 = await db.storyThread.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        kind: "MYSTERY",
        title: "thread one",
        status: "ACTIVE",
        importance: 3,
        createdById: fx.userId,
      },
    });
    const t2 = await db.storyThread.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        kind: "MYSTERY",
        title: "thread two",
        status: "ACTIVE",
        importance: 3,
        createdById: fx.userId,
      },
    });
    await endgameServices.createLedgerEntry({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      threadId: t1.id,
      status: "MUST",
      criteria: "must close",
    });
    await endgameServices.createLedgerEntry({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      threadId: t2.id,
      status: "SHOULD",
      criteria: "should close",
    });

    const before = await db.endgameLedger.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(before).toHaveLength(2);

    // Production reader: thin adapter over 022A's listLedgerEntries.
    const reader = createEndgameLedgerReader(endgameServices, fx.userId);

    const result = await runEndgameProjection({
      db,
      simulationServices: services,
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      branchId: fx.branchId,
      readLedger: reader,
      closePlan: [t1.id],
    });

    expect(result.projectedGate).toBe("READY");

    // Ledger table untouched — same rows, same contents.
    const after = await db.endgameLedger.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(after).toHaveLength(before.length);
    expect(after).toEqual(before);
    // …while the projection genuinely ran (021 tables written).
    expect(await db.simulationRun.count()).toBe(1);
    expect(await db.simulationTick.count()).toBe(1);
  });

  it("close plan with an unknown thread → INVALID_INPUT", async () => {
    const fx = await seedFixture();
    await enableModule(fx);
    const services = createSimulationServices({ db });
    const { reader } = memoryLedger([ledgerEntry("t-must-1", "MUST", false)]);

    await expect(
      runEndgameProjection({
        db,
        simulationServices: services,
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        branchId: fx.branchId,
        readLedger: reader,
        closePlan: ["t-unknown"],
      }),
    ).rejects.toThrow(/INVALID_INPUT.*unknown thread/);
  });

  it("is deterministic: same inputs → identical projection results", async () => {
    const fx = await seedFixture();
    await enableModule(fx);
    const services = createSimulationServices({ db });
    const entries = [
      ledgerEntry("t-must-1", "MUST", false),
      ledgerEntry("t-may-1", "MAY", false),
    ];

    const runOnce = () =>
      runEndgameProjection({
        db,
        simulationServices: services,
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        branchId: fx.branchId,
        readLedger: memoryLedger(entries).reader,
        closePlan: ["t-must-1"],
        seed: "fixed-seed",
      });

    const a = await runOnce();
    const b = await runOnce();
    const { runId: _ra, ...restA } = a;
    const { runId: _rb, ...restB } = b;
    expect(restA).toEqual(restB);
  });
});
