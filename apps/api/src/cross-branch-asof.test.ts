/**
 * NF-WF-042 (GAP-040): Cross-branch revision guards — exact negatives + valid controls.
 *
 * Dedicated `novelforge_test_crossbranch` db (parallel-safe per ADR-0003 §8).
 * Replaces the vacuous "GAP-040 branch-aware as-of" test in branches.test.ts,
 * which hit a non-existent POST /memory/recall (always 404) and allowed
 * [400, 404] unions.
 *
 * For each of the 4 as-of consumers (memory, health, character, timeline):
 *  - Negative: cross-branch asOfRevisionId → exactly 400, error === "INVALID_INPUT"
 *  - Positive control: same-branch revision → 2xx with content assertions
 *  - Fixture validity proven BEFORE negatives (chapters exist, consumer state exists)
 *
 * Memory additionally has the mirrored negative (REQUIRED by contract):
 * checked-out = B, as-of = main-revision → 400 INVALID_INPUT. This is the
 * only test distinguishing `checkedOutBranchId` from a hardcoded `main`.
 *
 * Surfaces: memory via GET /memory/as-of (real route); health via
 * GET /story-health (real route); character/timeline via services directly
 * (no HTTP routes exist — see state-consumers.test.ts pattern).
 *
 * Forbidden assertion shapes (contract normative): no [400, 404] unions,
 * no .not.toBe(400)-only, no empty-array passes, no loop-without-execution.
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
import { createAuditService } from "@novelforge/ai-services";
import { createStateAssemblyServices } from "@novelforge/ai-services";
import { chapterScope } from "@novelforge/memory";

const TEST_DB = "novelforge_test_crossbranch";
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
  await db.memoryProjection.deleteMany();
  await db.timelineEvent.deleteMany();
  await db.causalEdge.deleteMany();
  await db.characterState.deleteMany();
  await db.character.deleteMany();
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
  await db.outlineNode.deleteMany();
  await db.saga.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.updateMany({ data: { currentBranchId: null } });
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

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

async function seedFixture(): Promise<Fixture> {
  const { userId, cookie } = await seedUser(`xbranch-${Date.now()}-${Math.random()}@test.local`);
  const ws = await db.workspace.create({ data: { name: "ws", slug: `ws-${Date.now()}`, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role: "OWNER" } });
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "XBranch Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;
  return { cookie, userId, workspaceId: ws.id, novelId };
}

async function api(method: "GET" | "POST", url: string, cookie: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    payload: payload ?? undefined,
  });
}

/** A checkpoint on the checked-out branch; returns the revision id. */
async function makeCheckpoint(fx: Fixture, label: string): Promise<{ checkpointId: string; revisionId: string }> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/checkpoints`,
    fx.cookie,
    { label },
  );
  expect(res.statusCode).toBe(201);
  const checkpointId = (res.json() as { checkpointId: string }).checkpointId;
  const cp = await db.checkpoint.findUniqueOrThrow({
    where: { id: checkpointId },
    select: { revisionId: true },
  });
  return { checkpointId, revisionId: cp.revisionId };
}

async function switchBranch(fx: Fixture, branchId: string, autoCheckpoint = false): Promise<void> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
    fx.cookie,
    autoCheckpoint ? { autoCheckpoint: true } : {},
  );
  expect(res.statusCode).toBe(200);
}

async function mainBranchId(novelId: string): Promise<string> {
  return (
    await db.novelBranch.findFirstOrThrow({ where: { novelId, name: "main" } })
  ).id;
}

/** Create a chapter with content directly (novel must exist). */
async function makeChapter(fx: Fixture, number: number, title: string): Promise<{ id: string }> {
  const chapter = await db.chapter.create({
    data: {
      novel: { connect: { id: fx.novelId } },
      createdBy: { connect: { id: fx.userId } },
      number,
      title,
      status: "DRAFT",
    },
  });
  return { id: chapter.id };
}

/**
 * Set up the two-branch fixture used by all consumers:
 *  - novel on main with a chapter
 *  - checkpoint "base" on main → mainRev
 *  - branch B created, switched to, checkpoint "on B" → bRev
 *  - switched back to main
 * Returns both revision ids. Caller adds consumer-specific state.
 */
async function setupTwoBranches(fx: Fixture): Promise<{ mainRevId: string; bRevId: string; branchBId: string }> {
  const { revisionId: mainRevId } = await makeCheckpoint(fx, "base");
  const created = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
    fx.cookie,
    { name: "experiment" },
  );
  expect(created.statusCode).toBe(201);
  const branchBId = (created.json() as { branchId: string }).branchId;
  await switchBranch(fx, branchBId);
  const { revisionId: bRevId } = await makeCheckpoint(fx, "on B");
  await switchBranch(fx, await mainBranchId(fx.novelId));
  return { mainRevId, bRevId, branchBId };
}

// ---------------------------------------------------------------------------
// Memory: GET /memory/as-of
// ---------------------------------------------------------------------------

describe("GAP-040 memory (GET /memory/as-of)", () => {
  /** Seed a memory projection so the same-branch control returns non-empty. */
  async function seedMemoryProjection(fx: Fixture, chapterId: string, sourceRevisionId: string): Promise<void> {
    await db.memoryProjection.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        scope: chapterScope(chapterId),
        sourceRevisionId,
        buildStatus: "OK",
        structural: {
          facts: [{ id: "f1", statement: "Aria is brave" }],
          threads: [],
          promises: [],
        },
        chapterCoverage: [1],
      },
    });
  }

  it("fixture validity: chapter exists and projection is seeded", async () => {
    const fx = await seedFixture();
    const { id: chapterId } = await makeChapter(fx, 1, "Ch 1");
    const { revisionId: mainRevId } = await makeCheckpoint(fx, "base");
    await seedMemoryProjection(fx, chapterId, mainRevId);

    // Fixture validity: chapter exists.
    const chapterCount = await db.chapter.count({ where: { novelId: fx.novelId } });
    expect(chapterCount).toBeGreaterThan(0);
    // Fixture validity: projection row exists for the chapter scope.
    const projCount = await db.memoryProjection.count({
      where: { novelId: fx.novelId, scope: chapterScope(chapterId) },
    });
    expect(projCount).toBe(1);
  });

  it("same-branch as-of → 200 with non-empty provenance-carrying recall (control)", async () => {
    const fx = await seedFixture();
    const { id: chapterId } = await makeChapter(fx, 1, "Ch 1");
    const { mainRevId } = await setupTwoBranches(fx);
    await seedMemoryProjection(fx, chapterId, mainRevId);

    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/memory/as-of?revisionId=${mainRevId}&chapter=1`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      chapterMemory: { provenance: { revisionId: string }; structural: unknown } | null;
      asOf: { revisionId: string };
    };
    // Non-empty with provenance — not merely "not 400".
    expect(body.chapterMemory).not.toBeNull();
    expect(body.chapterMemory!.provenance.revisionId).toBe(mainRevId);
    expect(body.asOf.revisionId).toBe(mainRevId);
  });

  it("cross-branch as-of → exactly 400 INVALID_INPUT (checked-out=main, as-of=B)", async () => {
    const fx = await seedFixture();
    const { id: chapterId } = await makeChapter(fx, 1, "Ch 1");
    const { mainRevId, bRevId } = await setupTwoBranches(fx);
    await seedMemoryProjection(fx, chapterId, mainRevId);

    // Control first: same-branch works (proves fixture valid).
    const ctrl = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/memory/as-of?revisionId=${mainRevId}&chapter=1`,
      fx.cookie,
    );
    expect(ctrl.statusCode).toBe(200);

    // Negative: B revision while checked out on main → exactly 400.
    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/memory/as-of?revisionId=${bRevId}&chapter=1`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("mirrored: checked-out=B, as-of=main-revision → exactly 400 INVALID_INPUT (REQUIRED)", async () => {
    const fx = await seedFixture();
    const { id: chapterId } = await makeChapter(fx, 1, "Ch 1");
    const { mainRevId, branchBId } = await setupTwoBranches(fx);
    await seedMemoryProjection(fx, chapterId, mainRevId);

    // Switch checked-out to B (auto-checkpoint: the seeded projection
    // dirtied main; the guard checks branchId, not head, so mainRevId
    // stays a valid cross-branch probe).
    await switchBranch(fx, branchBId, true);
    const checkedOut = await db.novel.findUniqueOrThrow({
      where: { id: fx.novelId },
      select: { currentBranchId: true },
    });
    expect(checkedOut.currentBranchId).toBe(branchBId);

    // A guard hardcoded to `main` would return 200 here (main IS main);
    // the correct checkedOutBranchId guard refuses with 400.
    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/memory/as-of?revisionId=${mainRevId}&chapter=1`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");

    // Restore: switch back to main for cleanliness.
    await switchBranch(fx, await mainBranchId(fx.novelId), true);
  });
});

// ---------------------------------------------------------------------------
// Health: GET /story-health
// ---------------------------------------------------------------------------

describe("GAP-040 health (GET /story-health)", () => {
  it("same-branch as-of → 200 with well-formed findings structure (control)", async () => {
    const fx = await seedFixture();
    await makeChapter(fx, 1, "Ch 1");
    const { mainRevId } = await setupTwoBranches(fx);

    // Fixture validity: chapter exists.
    expect(await db.chapter.count({ where: { novelId: fx.novelId } })).toBeGreaterThan(0);

    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/story-health?revisionId=${mainRevId}&chapter=1`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      findings: unknown[];
      unresolved: unknown[];
      sourceRevisionId: string;
    };
    // Well-formed structure — not just status.
    expect(Array.isArray(body.findings)).toBe(true);
    expect(Array.isArray(body.unresolved)).toBe(true);
    expect(body.sourceRevisionId).toBe(mainRevId);
  });

  it("cross-branch as-of → exactly 400 INVALID_INPUT", async () => {
    const fx = await seedFixture();
    await makeChapter(fx, 1, "Ch 1");
    const { mainRevId, bRevId } = await setupTwoBranches(fx);

    // Control first.
    const ctrl = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/story-health?revisionId=${mainRevId}&chapter=1`,
      fx.cookie,
    );
    expect(ctrl.statusCode).toBe(200);

    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/story-health?revisionId=${bRevId}&chapter=1`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");
  });
});

// ---------------------------------------------------------------------------
// Character / Timeline: service-level (no HTTP routes exist)
// ---------------------------------------------------------------------------

function assemblyServices() {
  return createStateAssemblyServices({ db, audit: createAuditService(db) });
}

describe("GAP-040 character (assembleCharacterState, service-level)", () => {
  async function seedCharacter(fx: Fixture): Promise<{ characterId: string }> {
    const character = await db.character.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        key: "aria",
        name: "Aria",
        summary: "protagonist",
        createdById: fx.userId,
      },
    });
    await db.characterState.create({
      data: {
        characterId: character.id,
        fromChapter: 1,
        toChapter: null,
        summary: "brave and hopeful",
      },
    });
    return { characterId: character.id };
  }

  it("fixture validity: character + state rows exist", async () => {
    const fx = await seedFixture();
    await makeChapter(fx, 1, "Ch 1");
    await seedCharacter(fx);
    expect(await db.character.count({ where: { novelId: fx.novelId } })).toBe(1);
    expect(await db.characterState.count()).toBe(1);
  });

  it("same-branch as-of → characters array with expected entries (control)", async () => {
    const fx = await seedFixture();
    await makeChapter(fx, 1, "Ch 1");
    await seedCharacter(fx);
    const { mainRevId } = await setupTwoBranches(fx);

    const asm = assemblyServices();
    const { characters } = await asm.assembleCharacterState({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      chapter: 1,
      asOfRevisionId: mainRevId,
    });
    // Non-empty with field assertions — not merely "did not throw".
    expect(characters.length).toBeGreaterThan(0);
    const aria = characters.find((c) => c.key === "aria");
    expect(aria).toBeDefined();
    expect(aria!.name).toBe("Aria");
  });

  it("cross-branch as-of → throws 400 INVALID_INPUT", async () => {
    const fx = await seedFixture();
    await makeChapter(fx, 1, "Ch 1");
    await seedCharacter(fx);
    const { mainRevId, bRevId } = await setupTwoBranches(fx);

    // Control first (proves fixture + guard passes for same-branch).
    const asm = assemblyServices();
    const ctrl = await asm.assembleCharacterState({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      chapter: 1,
      asOfRevisionId: mainRevId,
    });
    expect(ctrl.characters.length).toBeGreaterThan(0);

    // Negative: assert the thrown error's status/code, not merely "throws".
    await expect(
      asm.assembleCharacterState({
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        chapter: 1,
        asOfRevisionId: bRevId,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_INPUT" });
  });
});

describe("GAP-040 timeline (assembleTimeline, service-level)", () => {
  async function seedTimeline(fx: Fixture): Promise<void> {
    await db.timelineEvent.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        order: 1,
        description: "duel at dawn",
        availableFromChapter: 1,
        createdById: fx.userId,
      },
    });
    await db.timelineEvent.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        order: 2,
        description: "a quiet meal",
        availableFromChapter: 1,
        createdById: fx.userId,
      },
    });
  }

  it("fixture validity: timeline events exist", async () => {
    const fx = await seedFixture();
    await seedTimeline(fx);
    expect(await db.timelineEvent.count({ where: { novelId: fx.novelId } })).toBe(2);
  });

  it("same-branch as-of → events array with expected entries (control)", async () => {
    const fx = await seedFixture();
    await seedTimeline(fx);
    const { mainRevId } = await setupTwoBranches(fx);

    const asm = assemblyServices();
    const tl = await asm.assembleTimeline({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      asOfRevisionId: mainRevId,
    });
    expect(tl.entries.length).toBe(2);
    expect(tl.entries.map((e) => e.order)).toEqual([1, 2]);
    expect(tl.entries[0]!.description).toBe("duel at dawn");
  });

  it("cross-branch as-of → throws 400 INVALID_INPUT", async () => {
    const fx = await seedFixture();
    await seedTimeline(fx);
    const { mainRevId, bRevId } = await setupTwoBranches(fx);

    // Control first.
    const asm = assemblyServices();
    const ctrl = await asm.assembleTimeline({
      actorUserId: fx.userId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      asOfRevisionId: mainRevId,
    });
    expect(ctrl.entries.length).toBe(2);

    await expect(
      asm.assembleTimeline({
        actorUserId: fx.userId,
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        asOfRevisionId: bRevId,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_INPUT" });
  });
});
