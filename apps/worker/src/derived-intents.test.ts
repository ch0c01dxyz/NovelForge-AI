/**
 * ADR-0017/ADR-0022 derived rebuild intent consumer.
 *
 * Dedicated novelforge_test_intents db. Covers: unregistered projections stay
 * PENDING, newest-per-(projection, branch) CAS claim + supersession, FAILED
 * with backoff/cap, one winner under concurrent sweeps, and the expired
 * RUNNING lease reaper.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createIntentHandlers,
  INTENT_MAX_ATTEMPTS,
  INTENT_RETRY_MAX_MS,
  runDerivedIntentSweep,
  startDerivedIntentWorkerApp,
  INTENT_RUNNING_LEASE_MS,
  type RebuildHandler,
} from "./derived-intents.ts";
import { PIPELINE_PROJECTIONS } from "@novelforge/story-versioning";

const TEST_DB = "novelforge_test_intents";
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

const quiet = { warn: () => {}, error: () => {} };

let db: NovelForgeDb;
let workspaceId: string;
let novelId: string;
let branchId: string;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
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
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.canonSummary.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.auditLog.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  const user = await db.user.create({
    data: { email: `intents-${Date.now()}@test.local`, passwordHash: "x", displayName: "Intents" },
  });
  const workspace = await db.workspace.create({
    data: { name: "Intents WS", slug: `intents-${Date.now()}`, ownerId: user.id },
  });
  workspaceId = workspace.id;
  const novel = await db.novel.create({
    data: {
      workspaceId,
      title: "Intents Novel",
      slug: `intents-novel-${Date.now()}`,
      createdById: user.id,
    },
  });
  novelId = novel.id;
  const branch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  branchId = branch.id;
  const baseline = await db.revision.create({
    data: { workspaceId, novelId, branchId, number: 1, origin: "MANUAL" },
  });
  await db.novel.update({ where: { id: novelId }, data: { currentBranchId: branchId } });
  await db.novelBranch.update({
    where: { id: branchId },
    data: { headRevisionId: baseline.id },
  });
});

async function seedIntents(projections: string[], number = 2) {
  const rev = await db.revision.create({
    data: { workspaceId, novelId, branchId, number, origin: "MANUAL" },
  });
  const rows = [];
  for (const projection of projections) {
    rows.push(
      await db.derivedRebuildIntent.create({
        data: { workspaceId, novelId, projection, sourceRevisionId: rev.id },
      }),
    );
  }
  return { rev, rows };
}

function canonHandler(rebuild: RebuildHandler["rebuild"]): RebuildHandler {
  return { projection: "canon", rebuild };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Intercept only the post-claim publication transaction, preserving real SQL. */
function beforePublication(before: () => Promise<void>, afterFailure?: () => Promise<void>) {
  let transactions = 0;
  return new Proxy(db, {
    get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return async (...args: unknown[]) => {
        transactions += 1;
        const publication = transactions === 2;
        if (publication) await before();
        try {
          return await Reflect.apply(target.$transaction, target, args);
        } catch (error) {
          if (publication && afterFailure) await afterFailure();
          throw error;
        }
      };
    },
  });
}

describe("handler registry", () => {
  it("registered handlers match PIPELINE_PROJECTIONS", () => {
    const handlers = createIntentHandlers(db);
    expect(Object.keys(handlers).sort()).toEqual([...PIPELINE_PROJECTIONS].sort());
  });
});

describe("runDerivedIntentSweep", () => {
  it("skips an expired owner after another sweep reclaims and completes its intent", async () => {
    const { rows } = await seedIntents(["canon"]);
    const current = vi.fn(async () => {});
    const stale = vi.fn(async () => {});
    let replacementFresh = 0;
    const fencedDb = beforePublication(async () => {
      // The first claim committed, but it has not locked/published its artifact.
      const replacement = await runDerivedIntentSweep({
        db, handlers: { canon: canonHandler(current) }, logger: quiet,
        now: () => new Date(Date.now() + INTENT_RUNNING_LEASE_MS + INTENT_RETRY_MAX_MS + 1000),
      });
      replacementFresh = replacement.fresh;
    });
    const old = await runDerivedIntentSweep({ db: fencedDb, handlers: { canon: canonHandler(stale) }, logger: quiet });
    expect(replacementFresh).toBe(1);
    expect(current).toHaveBeenCalledOnce();
    expect(stale).not.toHaveBeenCalled();
    expect(old.fresh).toBe(0);
    expect(old.failed).toBe(0);
    expect(old.skipped).toBe(1);
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.status).toBe("FRESH");
    expect(row.attempts).toBe(2);
  });

  it.each([false, true])("commits the artifact and FRESH together; handler failure=%s rolls back publication", async (fail) => {
    const { rev, rows } = await seedIntents(["canon"]);
    const written = deferred();
    const release = deferred();
    const handler = canonHandler(async ({ db: transaction }) => {
      await transaction.canonSummary.create({ data: {
        workspaceId, novelId, branchId, sourceRevisionId: rev.id, sourceRevisionNumber: rev.number,
        entityCount: 0, activeFactCount: 0, supersededFactCount: 0, retractedFactCount: 0, digest: {},
      } });
      written.resolve();
      await release.promise;
      if (fail) throw new Error("failure after projection write");
    });
    const pending = runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
    try {
      await written.promise;
      expect(await db.canonSummary.count()).toBe(0);
      expect((await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } })).status).toBe("RUNNING");
    } finally {
      release.resolve();
    }
    const report = await pending;
    expect(await db.canonSummary.count()).toBe(fail ? 0 : 1);
    expect((await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } })).status).toBe(fail ? "FAILED" : "FRESH");
    expect(report.fresh).toBe(fail ? 0 : 1);
    expect(report.failed).toBe(fail ? 1 : 0);
  });

  it("does not let a failed old attempt mark a replacement RUNNING claim FAILED", async () => {
    const { rows } = await seedIntents(["canon"]);
    const fencedDb = beforePublication(async () => {}, async () => {
      await db.derivedRebuildIntent.update({
        where: { id: rows[0]!.id },
        data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
      });
    });
    const report = await runDerivedIntentSweep({
      db: fencedDb, handlers: { canon: canonHandler(async () => { throw new Error("old attempt failed"); }) }, logger: quiet,
    });
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.status).toBe("RUNNING");
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBeNull();
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it("leaves intents untouched when no handler is registered", async () => {
    const { rows } = await seedIntents(["character"]);
    const report = await runDerivedIntentSweep({ db, handlers: {}, logger: quiet });
    expect(report.claimed).toBe(0);
    const after = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(0);
  });

  it("claims the newest intent, supersedes older ones, and marks FRESH", async () => {
    const older = await seedIntents(["canon"], 2);
    const newerRev = await db.revision.create({
      data: { workspaceId, novelId, branchId, number: 3, origin: "MANUAL" },
    });
    const newer = await db.derivedRebuildIntent.create({
      data: { workspaceId, novelId, projection: "canon", sourceRevisionId: newerRev.id },
    });

    let seen: string | null = null;
    const report = await runDerivedIntentSweep({
      db,
      handlers: { canon: canonHandler(async ({ sourceRevisionId }) => { seen = sourceRevisionId; }) },
      logger: quiet,
    });

    expect(seen).toBe(newerRev.id);
    expect(report.fresh).toBe(1);
    expect(report.superseded).toBe(1);
    const oldRow = await db.derivedRebuildIntent.findUniqueOrThrow({
      where: { id: older.rows[0]!.id },
    });
    expect(oldRow.status).toBe("STALE");
    const newRow = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: newer.id } });
    expect(newRow.status).toBe("FRESH");
    expect(newRow.completedAt).not.toBeNull();
  });

  it("supersedes older intents outside the sweep batch window", async () => {
    await seedIntents(["canon"], 2);
    await seedIntents(["canon"], 3);
    const newest = await seedIntents(["canon"], 4);

    const report = await runDerivedIntentSweep({
      db,
      handlers: { canon: canonHandler(async () => {}) },
      logger: quiet,
      batchSize: 1,
    });

    expect(report.fresh).toBe(1);
    expect(report.superseded).toBe(2);
    const statuses = await db.derivedRebuildIntent.findMany({
      orderBy: { sourceRevision: { number: "asc" } },
      select: { status: true },
    });
    expect(statuses.map((row) => row.status)).toEqual(["STALE", "STALE", "FRESH"]);
    const newestRow = await db.derivedRebuildIntent.findUniqueOrThrow({
      where: { id: newest.rows[0]!.id },
    });
    expect(newestRow.completedAt).not.toBeNull();
  });

  it("rebuilds the canon summary through the registry handler", async () => {
    const { rev } = await seedIntents(["canon"], 2);
    await db.novelBranch.update({ where: { id: branchId }, data: { headRevisionId: rev.id } });
    const owner = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const entity = await db.storyEntity.create({
      data: {
        novelId,
        kind: "CHARACTER",
        key: "aria",
        name: "Aria",
        createdById: owner.ownerId,
      },
    });
    await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: entity.id,
        predicate: "has child",
        statement: "Aria has a child",
        objectText: "a child",
        createdById: owner.ownerId,
      },
    });

    const report = await runDerivedIntentSweep({
      db,
      handlers: createIntentHandlers(db),
      logger: quiet,
    });

    expect(report.fresh).toBe(1);
    const summary = await db.canonSummary.findFirstOrThrow();
    expect(summary.sourceRevisionId).toBe(rev.id);
    expect(summary.entityCount).toBe(1);
    expect(summary.activeFactCount).toBe(1);
  });

  it("persists FAILED with lastError and retries after backoff up to the cap", async () => {
    const { rows } = await seedIntents(["canon"]);
    const handler = canonHandler(async () => {
      throw new Error("boom");
    });

    await runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
    let row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("boom");

    await runDerivedIntentSweep({
      db,
      handlers: { canon: handler },
      logger: quiet,
      now: () => new Date(Date.now() + INTENT_RETRY_MAX_MS),
    });
    row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.attempts).toBe(2);
    expect(row.status).toBe("FAILED");
  });

  it("skips a FAILED intent that is still inside its backoff window", async () => {
    const { rows } = await seedIntents(["canon"]);
    let calls = 0;
    const handler = canonHandler(async () => {
      calls += 1;
      throw new Error("boom");
    });
    await runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
    const second = await runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
    expect(calls).toBe(1);
    expect(second.skipped).toBe(1);
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.attempts).toBe(1);
  });

  it("stops retrying at INTENT_MAX_ATTEMPTS", async () => {
    const { rows } = await seedIntents(["canon"]);
    await db.derivedRebuildIntent.update({
      where: { id: rows[0]!.id },
      data: { status: "FAILED", attempts: INTENT_MAX_ATTEMPTS, lastError: "exhausted" },
    });
    let calls = 0;
    const report = await runDerivedIntentSweep({
      db,
      handlers: { canon: canonHandler(async () => { calls += 1; }) },
      logger: quiet,
      now: () => new Date(Date.now() + INTENT_RETRY_MAX_MS * 10),
    });
    expect(calls).toBe(0);
    expect(report.claimed).toBe(0);
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.attempts).toBe(INTENT_MAX_ATTEMPTS);
  });

  it("has one CAS winner under two concurrent sweeps", async () => {
    const { rows } = await seedIntents(["canon"]);
    let calls = 0;
    const handler = canonHandler(async () => {
      calls += 1;
    });
    const [a, b] = await Promise.all([
      runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet }),
      runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet }),
    ]);
    expect(calls).toBe(1);
    expect(a.claimed + b.claimed).toBe(1);
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.status).toBe("FRESH");
    expect(row.attempts).toBe(1);
  });

  it("reaps an expired RUNNING lease into FAILED", async () => {
    const { rows } = await seedIntents(["canon"]);
    // attempts at the cap: after reaping, the row is not eligible again, so the
    // assertion isolates the lease transition.
    await db.derivedRebuildIntent.update({
      where: { id: rows[0]!.id },
      data: { status: "RUNNING", attempts: INTENT_MAX_ATTEMPTS },
    });
    await db.$executeRaw`
      UPDATE derived_rebuild_intents
      SET updated_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${rows[0]!.id}::uuid
    `;
    await runDerivedIntentSweep({
      db,
      handlers: { canon: canonHandler(async () => {}) },
      logger: quiet,
    });
    const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("lease expired");
  });
});

describe("derived intent worker shutdown", () => {
  it("shares overlapping ticks and idempotently drains the active sweep before disconnecting", async () => {
    const release = deferred();
    const disconnect = vi.fn(async () => {});
    const sweep = vi.fn(async () => {
      await release.promise;
      return { claimed: 1, fresh: 1, failed: 0, superseded: 0, skipped: 0 };
    });
    const app = startDerivedIntentWorkerApp({ DATABASE_URL: "unused" }, { ...quiet, info: () => {} }, {
      db: { $disconnect: disconnect } as unknown as NovelForgeDb,
      handlers: {}, sweep, intervalMs: 60_000,
    });
    const first = app.tick();
    expect(app.tick()).toBe(first);
    await Promise.resolve();
    const stop = app.stop();
    expect(app.stop()).toBe(stop);
    expect(disconnect).not.toHaveBeenCalled();
    release.resolve();
    await stop;
    expect(await first).toMatchObject({ fresh: 1 });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(sweep).toHaveBeenCalledOnce();
    expect(await app.tick()).toMatchObject({ claimed: 0 });
    expect(sweep).toHaveBeenCalledOnce();
  });
});
