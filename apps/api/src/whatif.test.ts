/**
 * NF-WF-027 (GAP-100): what-if branch ownership tests.
 *
 * Covers the 15 acceptance checks from the contract:
 * - Live two-outline comparison with provision mode
 * - No canon mutation
 * - Isolation
 * - Existing-branch mode
 * - 5 negative tests (main refused, missing checkpoint, missing branchSelection,
 *   unknown branch, module disabled)
 * - Failure recovery (no orphan on provision failure)
 * - Stub path regression (via whatif.eval.test.ts)
 * - Route-level (via HTTP)
 *
 * Uses a dedicated scratch database (novelforge_test_whatif_027).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createWhatifServices, WhatifError } from "./services/whatif.ts";
import { createSimulationServices } from "./services/simulation.ts";
import { createRevisionServices } from "./services/revisions.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_whatif_027";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}
const BASE_URL = process.env.DATABASE_URL!;
function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

let db: NovelForgeDb;
let workspaceId: string;
let novelId: string;
let ownerUserId: string;
let mainBranchId: string;

async function setupDb() {
  const { execFileSync } = await import("node:child_process");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const HERE = fileURLToPath(new URL(".", import.meta.url));
  const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");

  // Create scratch DB
  const pg = (await import("pg")).default;
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  // Run migrations
  const TEST_URL = withDb(BASE_URL, TEST_DB);
  execFileSync(process.execPath, [path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
}

async function seedBase() {
  const user = await db.user.create({
    data: { email: `owner-${Date.now()}@test.local`, displayName: "Owner", passwordHash: "test-hash" },
  });
  ownerUserId = user.id;

  const ws = await db.workspace.create({
    data: { name: "Test WS", slug: `ws-${Date.now()}`, ownerId: user.id },
  });
  workspaceId = ws.id;

  await db.membership.create({
    data: { workspaceId, userId: user.id, role: "OWNER" },
  });

  const novel = await db.novel.create({
    data: {
      workspaceId,
      title: "Whatif 027 Novel",
      slug: `whatif-027-${Date.now()}`,
      createdById: user.id,
    },
  });
  novelId = novel.id;

  // Create main branch (not auto-created via direct Prisma)
  const mainBranch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  mainBranchId = mainBranch.id;

  // Enable simulation module
  await db.novelModule.create({
    data: { novelId, moduleName: "simulation" },
  });

  const token = generateSessionToken();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
}

async function createOutlineVersion(num: number): Promise<string> {
  const v = await db.outlineVersion.create({
    data: {
      novelId,
      number: num,
      status: "DRAFT",
      content: { nodes: [{ id: `n${num}`, title: `Chapter ${num}` }] },
      createdById: ownerUserId,
    },
  });
  return v.id;
}

/** Create a non-main branch with checkpoint and head revision for existing-mode tests. */
async function createTestBranch(name: string): Promise<string> {
  // Create revision with snapshot on main first (to have something to branch from)
  // Use a unique number per call (beforeEach does not clean the revision table).
  const revNum = 100000 + Math.floor(Math.random() * 899999);
  const rev = await db.revision.create({
    data: {
      workspaceId,
      novelId,
      branchId: mainBranchId,
      number: revNum,
      origin: "MANUAL",
      message: "test baseline",
    },
  });
  const snap = await db.snapshot.create({
    data: {
      workspaceId,
      novelId,
      branchId: mainBranchId,
      revisionId: rev.id,
      formatVersion: 1,
      byteSize: 100,
      payload: {},
    },
  });
  await db.novelBranch.update({
    where: { id: mainBranchId },
    data: { headRevisionId: rev.id },
  });

  // Create the test branch
  const branch = await db.novelBranch.create({
    data: {
      workspaceId,
      novelId,
      name,
      parentBranchId: mainBranchId,
      sourceRevisionId: rev.id,
      headRevisionId: rev.id,
    },
  });

  // Create checkpoint on the branch
  await db.checkpoint.create({
    data: {
      workspaceId,
      novelId,
      branchId: branch.id,
      revisionId: rev.id,
      snapshotId: snap.id,
      kind: "MANUAL",
      label: `test checkpoint for ${name}`,
      createdById: ownerUserId,
    },
  });

  return branch.id;
}

beforeAll(async () => {
  await setupDb();
  const TEST_URL = withDb(BASE_URL, TEST_DB);
  db = createDb(TEST_URL);
  await seedBase();
}, 60000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  // Clean test-created rows between tests (order matters for FKs).
  // Base novel/workspace/user/main-branch persist.
  await db.whatifComparison.deleteMany({});
  await db.checkpoint.deleteMany({});
  await db.novelBranch.deleteMany({ where: { NOT: { name: "main" } } });
  await db.outlineVersion.deleteMany({});
  await db.simulationTick.deleteMany({});
  await db.simulationRun.deleteMany({});
});

describe("NF-WF-027: branch ownership", () => {

  it("negative: missing branchSelection at service level creates pre-027 row (stub compat)", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(1);
    const v2 = await createOutlineVersion(2);

    // Service-level: branchSelection optional (HTTP Zod requires it).
    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      outlineVersionIds: [v1, v2],
      confirmed: true,
    });
    expect(comparison.branchId).toBeNull();
    expect(comparison.branchMode).toBeNull();
  });

  it("negative: existing mode with main branch → 400 MAIN_BRANCH_FORBIDDEN", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(11);
    const v2 = await createOutlineVersion(12);

    await expect(
      whatif.createComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId,
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "existing", branchId: mainBranchId },
      }),
    ).rejects.toMatchObject({ code: "MAIN_BRANCH_FORBIDDEN", statusCode: 400 });

    // No row created
    const count = await db.whatifComparison.count();
    expect(count).toBe(0);
  });

  it("negative: existing mode with unknown branch → 404 BRANCH_NOT_FOUND", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(21);
    const v2 = await createOutlineVersion(22);
    const fakeId = "00000000-0000-0000-0000-000000000000";

    await expect(
      whatif.createComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId,
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "existing", branchId: fakeId },
      }),
    ).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND", statusCode: 404 });
  });

  it("negative: existing mode without checkpoint → 409 WHATIF_NO_SNAPSHOT", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(31);
    const v2 = await createOutlineVersion(32);

    // Create branch without checkpoint
    const branch = await db.novelBranch.create({
      data: { workspaceId, novelId, name: `no-checkpoint-${Date.now()}` },
    });

    await expect(
      whatif.createComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId,
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "existing", branchId: branch.id },
      }),
    ).rejects.toMatchObject({ code: "WHATIF_NO_SNAPSHOT", statusCode: 409 });
  });

  it("negative: module disabled → 409 WHATIF_MODULE_NOT_ENABLED", async () => {
    // Create a novel without simulation module
    const novel2 = await db.novel.create({
      data: {
        workspaceId,
        title: "No Sim Novel",
        slug: `no-sim-${Date.now()}`,
        createdById: ownerUserId,
      },
    });
    // Create branch with checkpoint (so we reach the module check)
    const rev2 = await db.revision.create({
      data: {
        workspaceId,
        novelId: novel2.id,
        branchId: mainBranchId, // temp, will create proper branch
        number: 1,
        origin: "MANUAL",
      },
    });
    const branch2 = await db.novelBranch.create({
      data: {
        workspaceId,
        novelId: novel2.id,
        name: "test-branch",
        headRevisionId: rev2.id,
      },
    });
    // Update revision to point to branch2
    await db.revision.update({
      where: { id: rev2.id },
      data: { branchId: branch2.id },
    });
    const snap2 = await db.snapshot.create({
      data: {
        workspaceId,
        novelId: novel2.id,
        branchId: branch2.id,
        revisionId: rev2.id,
        formatVersion: 1,
        byteSize: 100,
        payload: {},
      },
    });
    await db.checkpoint.create({
      data: {
        workspaceId,
        novelId: novel2.id,
        branchId: branch2.id,
        revisionId: rev2.id,
        snapshotId: snap2.id,
        kind: "MANUAL",
        label: "test",
        createdById: ownerUserId,
      },
    });

    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await db.outlineVersion.create({
      data: {
        novelId: novel2.id,
        number: 1,
        status: "DRAFT",
        content: {},
        createdById: ownerUserId,
      },
    });
    const v2 = await db.outlineVersion.create({
      data: {
        novelId: novel2.id,
        number: 2,
        status: "DRAFT",
        content: {},
        createdById: ownerUserId,
      },
    });

    await expect(
      whatif.createComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId: novel2.id,
        outlineVersionIds: [v1.id, v2.id],
        confirmed: true,
        branchSelection: { mode: "existing", branchId: branch2.id },
      }),
    ).rejects.toMatchObject({ code: "WHATIF_MODULE_NOT_ENABLED", statusCode: 409 });
  });

  it("existing mode: valid branch with checkpoint succeeds", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(41);
    const v2 = await createOutlineVersion(42);
    const branchId = await createTestBranch(`existing-ok-${Date.now()}`);

    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      outlineVersionIds: [v1, v2],
      confirmed: true,
      branchSelection: { mode: "existing", branchId },
    });

    expect(comparison.branchId).toBe(branchId);
    expect(comparison.branchMode).toBe("existing");
    expect(comparison.status).toBe("DRAFT");
  });

  it("provision mode: creates simulation-whatif-* branch with checkpoint", async () => {
    const revisions = createRevisionServices({ db });
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations, revisions });
    const v1 = await createOutlineVersion(51);
    const v2 = await createOutlineVersion(52);

    // Ensure main has a head revision with snapshot (for branch source)
    const rev = await db.revision.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        number: 100,
        origin: "MANUAL",
        message: "provision test baseline",
      },
    });
    const _snap2 = await db.snapshot.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        revisionId: rev.id,
        formatVersion: 1,
        byteSize: 100,
        payload: {},
      },
    });
    await db.novelBranch.update({
      where: { id: mainBranchId },
      data: { headRevisionId: rev.id },
    });

    const alternate = await db.novelBranch.create({ data: {
      workspaceId, novelId, name: "different-checked-out", headRevisionId: rev.id,
    } });
    const alternateRev = await db.revision.create({ data: {
      workspaceId, novelId, branchId: alternate.id, number: 101, origin: "MANUAL",
    } });
    await db.novelBranch.update({ where: { id: alternate.id }, data: { headRevisionId: alternateRev.id } });
    await db.novel.update({ where: { id: novelId }, data: { currentBranchId: alternate.id } });
    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId, workspaceId, novelId, outlineVersionIds: [v1, v2],
      confirmed: true, branchSelection: { mode: "provision" },
    });
    await db.novel.update({ where: { id: novelId }, data: { currentBranchId: mainBranchId } });
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: comparison.branchId! } })).headRevisionId).toBe(rev.id);

    // A failed comparison insert must compensate its newly provisioned branch.
    const branchCount = await db.novelBranch.count({ where: { novelId } });
    const insert = vi.spyOn(db.whatifComparison, "create").mockRejectedValueOnce(new Error("insert failed"));
    try {
      await expect(whatif.createComparison({ actorUserId: ownerUserId, workspaceId, novelId,
        outlineVersionIds: [v1, v2], confirmed: true, branchSelection: { mode: "provision" },
      })).rejects.toMatchObject({ code: "BRANCH_PROVISION_FAILED" });
    } finally { insert.mockRestore(); }
    expect(await db.novelBranch.count({ where: { novelId } })).toBe(branchCount);

    expect(comparison.branchMode).toBe("provision");
    expect(comparison.branchId).toBeTruthy();

    // Verify branch
    const branch = await db.novelBranch.findUnique({
      where: { id: comparison.branchId! },
    });
    expect(branch).toBeTruthy();
    expect(branch!.name).toMatch(/^simulation-whatif-/);
    expect(branch!.name.toLowerCase()).not.toBe("main");

    // Verify checkpoint exists
    const checkpoint = await db.checkpoint.findFirst({
      where: { novelId, branchId: branch!.id },
    });
    expect(checkpoint).toBeTruthy();
  });

  it("provision mode without revision:manage → ForbiddenError (403 at HTTP layer)", async () => {
    // Contract option (a): provision requires BOTH simulation:manage AND
    // revision:manage. No role in the current matrix holds simulation:manage
    // without revision:manage (AUTHOR/ADMIN/OWNER hold both), so simulate the
    // narrower role the contract anticipates by denying revision:manage at the
    // capability gate. The service surfaces ForbiddenError; the
    // platform-routes handler maps it to HTTP 403 (fail fast at create time).
    const authz = await import("@novelforge/auth/authorization");
    const realRequire = authz.requireCapability;
    const spy = vi.spyOn(authz, "requireCapability").mockImplementation((role, cap) => {
      if (cap === "revision:manage") throw new authz.ForbiddenError(cap);
      return realRequire(role, cap);
    });
    try {
      const revisions = createRevisionServices({ db });
      const simulations = createSimulationServices({ db });
      const whatif = createWhatifServices({ db, simulations, revisions });
      const v1 = await createOutlineVersion(61);
      const v2 = await createOutlineVersion(62);

      await expect(
        whatif.createComparison({
          actorUserId: ownerUserId,
          workspaceId,
          novelId,
          outlineVersionIds: [v1, v2],
          confirmed: true,
          branchSelection: { mode: "provision" },
        }),
      ).rejects.toThrow(authz.ForbiddenError);

      // Fail fast: no branch provisioned, no comparison row created.
      const simBranches = await db.novelBranch.count({
        where: { name: { startsWith: "simulation-whatif-" } },
      });
      expect(simBranches).toBe(0);
      expect(await db.whatifComparison.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("failure recovery: provision failure leaves no orphan branch", async () => {
    const simulations = createSimulationServices({ db });
    // Mock revisions to fail on createBranch
    const mockRevisions = {
      createBranch: vi.fn().mockRejectedValue(new Error("simulated branch failure")),
    };
    const whatif = createWhatifServices({ db, simulations, revisions: mockRevisions });
    const v1 = await createOutlineVersion(71);
    const v2 = await createOutlineVersion(72);

    const beforeCount = await db.novelBranch.count();

    await expect(
      whatif.createComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId,
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "provision" },
      }),
    ).rejects.toMatchObject({ code: "BRANCH_PROVISION_FAILED", statusCode: 409 });

    const afterCount = await db.novelBranch.count();
    expect(afterCount).toBe(beforeCount);

    // No comparison row created
    const compCount = await db.whatifComparison.count();
    expect(compCount).toBe(0);
  });

  it("WhatifError status codes map correctly", () => {
    expect(new WhatifError("BRANCH_NOT_FOUND", "x").statusCode).toBe(404);
    expect(new WhatifError("COMPARISON_NOT_FOUND", "x").statusCode).toBe(404);
    expect(new WhatifError("WHATIF_NO_SNAPSHOT", "x").statusCode).toBe(409);
    expect(new WhatifError("WHATIF_MODULE_NOT_ENABLED", "x").statusCode).toBe(409);
    expect(new WhatifError("BRANCH_PROVISION_FAILED", "x").statusCode).toBe(409);
    expect(new WhatifError("INVALID_STATUS_TRANSITION", "x").statusCode).toBe(409);
    expect(new WhatifError("MAIN_BRANCH_FORBIDDEN", "x").statusCode).toBe(400);
    expect(new WhatifError("INVALID_INPUT", "x").statusCode).toBe(400);
  });
});

describe("NF-WF-027: live comparison acceptance", () => {
  it("claims a comparison once under concurrent execution", async () => {
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const branchId = await createTestBranch("claim-race");
    const comparison = await whatif.createComparison({ actorUserId: ownerUserId, workspaceId, novelId,
      outlineVersionIds: [await createOutlineVersion(901), await createOutlineVersion(902)],
      confirmed: true, branchSelection: { mode: "existing", branchId }, maxChapters: 1 });
    const results = await Promise.allSettled([1, 2].map(() => whatif.runComparison({
      actorUserId: ownerUserId, workspaceId, novelId, comparisonId: comparison.id,
      stubGenerator: () => ({ test: true }),
    })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
  });

  /** Ensure main has a head revision with snapshot (provision source). */
  async function ensureMainHead(): Promise<void> {
    const main = await db.novelBranch.findUnique({
      where: { id: mainBranchId },
      select: { headRevisionId: true },
    });
    if (main?.headRevisionId) return;
    const rev = await db.revision.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        number: 900,
        origin: "MANUAL",
        message: "live acceptance baseline",
      },
    });
    await db.snapshot.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        revisionId: rev.id,
        formatVersion: 1,
        byteSize: 100,
        payload: {},
      },
    });
    await db.novelBranch.update({
      where: { id: mainBranchId },
      data: { headRevisionId: rev.id },
    });
  }

  /** Canon tables that a live what-if run must never write to. */
  async function canonCounts(): Promise<Record<string, number>> {
    const tables = [
      "novel",
      "workspace",
      "membership",
      "user",
      "outlineVersion",
      "chapter",
      "revision",
      "snapshot",
    ] as const;
    const out: Record<string, number> = {};
    for (const t of tables) {
      // @ts-expect-error dynamic table access for test checksums
      out[t] = await db[t].count();
    }
    return out;
  }

  it("live two-outline comparison (provision): COMPLETED via configureRun→startRun→stepRun", async () => {
    await ensureMainHead();
    const revisions = createRevisionServices({ db });
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations, revisions });
    const v1 = await createOutlineVersion(101);
    const v2 = await createOutlineVersion(102);

    const mainBefore = await db.novelBranch.findUnique({
      where: { id: mainBranchId },
      select: { headRevisionId: true },
    });
    const canonBefore = await canonCounts();

    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      outlineVersionIds: [v1, v2],
      confirmed: true,
      branchSelection: { mode: "provision" },
      maxChapters: 2,
    });
    expect(comparison.branchMode).toBe("provision");
    const provisionedBranchId = comparison.branchId!;
    expect(provisionedBranchId).toBeTruthy();

    // LIVE PATH: no stubGenerator — traverses 021A configureRun → startRun → stepRun.
    const result = await whatif.runComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      comparisonId: comparison.id,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.runIds).toHaveLength(2);

    // Each run carries the provisioned branchId and traversed the 021A lifecycle.
    for (const runId of result.runIds) {
      const run = await db.simulationRun.findUnique({
        where: { id: runId },
        select: { branchId: true, status: true, currentTick: true },
      });
      expect(run).toBeTruthy();
      expect(run!.branchId).toBe(provisionedBranchId);
      // stepRun completed the bounded ticks (maxChapters=2).
      expect(run!.currentTick).toBe(2);
      const ticks = await db.simulationTick.count({ where: { runId } });
      expect(ticks).toBe(2);
      // Scenario tagged WHATIF (read-path isolation).
      const scenario = await db.simulationScenario.findUnique({ where: { runId } });
      expect(scenario?.kind).toBe("WHATIF");
    }

    // Divergence detected (different outlineVersionIds → different initial states).
    expect(result.divergencePoints.length).toBeGreaterThan(0);
    expect(result.divergencePoints[0]!.kind).toBe("STRUCTURAL");

    // Invariant 1: no canon mutation — canon table counts unchanged.
    const canonAfter = await canonCounts();
    expect(canonAfter).toEqual(canonBefore);

    // Isolation: provisioned branch is simulation-dedicated, not main;
    // main head untouched.
    const branch = await db.novelBranch.findUnique({ where: { id: provisionedBranchId } });
    expect(branch!.name).toMatch(/^simulation-whatif-/);
    expect(branch!.name.toLowerCase()).not.toBe("main");
    const mainAfter = await db.novelBranch.findUnique({
      where: { id: mainBranchId },
      select: { headRevisionId: true },
    });
    expect(mainAfter!.headRevisionId).toBe(mainBefore!.headRevisionId);

    // Read-path isolation: WHATIF runs excluded from 021D listRuns.
    const listed = await simulations.listRuns({ actorUserId: ownerUserId, workspaceId, novelId });
    const listedIds = new Set(listed.map((r) => r.id));
    for (const runId of result.runIds) {
      expect(listedIds.has(runId)).toBe(false);
    }
  });

  it("live run on existing branch mode succeeds", async () => {
    await ensureMainHead();
    const revisions = createRevisionServices({ db });
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations, revisions });
    const v1 = await createOutlineVersion(111);
    const v2 = await createOutlineVersion(112);
    const branchId = await createTestBranch(`existing-live-${Date.now()}`);

    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      outlineVersionIds: [v1, v2],
      confirmed: true,
      branchSelection: { mode: "existing", branchId },
      maxChapters: 2,
    });

    const result = await whatif.runComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      comparisonId: comparison.id,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.runIds).toHaveLength(2);
    for (const runId of result.runIds) {
      const run = await db.simulationRun.findUnique({
        where: { id: runId },
        select: { branchId: true },
      });
      expect(run!.branchId).toBe(branchId);
    }
  });

  it("migration: pre-027 rows keep NULL branchId/branchMode", async () => {
    // The 027 migration is additive; rows created without branchSelection
    // (pre-027 path) store NULLs and their live path refuses explicitly.
    const simulations = createSimulationServices({ db });
    const whatif = createWhatifServices({ db, simulations });
    const v1 = await createOutlineVersion(121);
    const v2 = await createOutlineVersion(122);

    const comparison = await whatif.createComparison({
      actorUserId: ownerUserId,
      workspaceId,
      novelId,
      outlineVersionIds: [v1, v2],
      confirmed: true,
    });
    const row = await db.whatifComparison.findUnique({ where: { id: comparison.id } });
    expect(row!.branchId).toBeNull();
    expect(row!.branchMode).toBeNull();

    // Live path on a pre-027 row refuses with typed error (no silent fallback).
    await expect(
      whatif.runComparison({
        actorUserId: ownerUserId,
        workspaceId,
        novelId,
        comparisonId: comparison.id,
      }),
    ).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND" });
  });
});

describe("NF-WF-027: route-level", () => {
  it("POST /comparisons: 201 with branchSelection; 400 without; typed errors map", async () => {
    const { default: Fastify } = await import("fastify");
    const { default: cookie } = await import("@fastify/cookie");
    const { registerWhatifRoutes } = await import("./whatif-routes.ts");
    const { WhatifError } = await import("./services/whatif.ts");
    const { ForbiddenError } = await import("@novelforge/auth/authorization");

    const app = Fastify();
    await app.register(cookie);
    // Mirror the platform-routes error mapping for the errors under test
    // (contract: no new handler — the real mapping lives in platform-routes).
    app.setErrorHandler((error, _req, reply) => {
      if (error instanceof ForbiddenError) return reply.code(403).send({ error: "FORBIDDEN" });
      if (error instanceof WhatifError) return reply.code(error.statusCode).send({ error: error.code });
      return reply.code(500).send({ error: "INTERNAL" });
    });

    const token = generateSessionToken();
    const tokenPlain = token;
    await db.session.create({
      data: {
        userId: ownerUserId,
        tokenHash: hashSessionToken(tokenPlain),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const auth = { validateSession: async (t: string) => (t === tokenPlain ? { userId: ownerUserId } : null) };
    const revisions = createRevisionServices({ db });
    const simulations = createSimulationServices({ db });
    const services = createWhatifServices({ db, simulations, revisions });
    // @ts-expect-error test double for AuthService
    registerWhatifRoutes(app, { auth, services });

    const v1 = await createOutlineVersion(201);
    const v2 = await createOutlineVersion(202);
    const base = `/api/workspaces/${workspaceId}/novels/${novelId}/whatif/comparisons`;
    const cookies = { [SESSION_COOKIE]: tokenPlain };

    // Missing branchSelection → 400 INVALID_INPUT (Zod at the boundary).
    const noBranch = await app.inject({
      method: "POST",
      url: base,
      cookies,
      payload: { outlineVersionIds: [v1, v2], confirmed: true },
    });
    expect(noBranch.statusCode).toBe(400);
    expect(noBranch.json()).toEqual({ error: "INVALID_INPUT" });

    // Main branch → 400 MAIN_BRANCH_FORBIDDEN (typed, via platform mapping).
    const mainBranch = await app.inject({
      method: "POST",
      url: base,
      cookies,
      payload: {
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "existing", branchId: mainBranchId },
      },
    });
    expect(mainBranch.statusCode).toBe(400);
    expect(mainBranch.json()).toEqual({ error: "MAIN_BRANCH_FORBIDDEN" });

    // Valid provision → 201.
    // Ensure main has a head revision with snapshot for provisioning.
    const rev = await db.revision.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        number: 950,
        origin: "MANUAL",
        message: "route test baseline",
      },
    });
    await db.snapshot.create({
      data: {
        workspaceId,
        novelId,
        branchId: mainBranchId,
        revisionId: rev.id,
        formatVersion: 1,
        byteSize: 100,
        payload: {},
      },
    });
    await db.novelBranch.update({ where: { id: mainBranchId }, data: { headRevisionId: rev.id } });

    const created = await app.inject({
      method: "POST",
      url: base,
      cookies,
      payload: {
        outlineVersionIds: [v1, v2],
        confirmed: true,
        branchSelection: { mode: "provision" },
        maxChapters: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const comparison = created.json().comparison;
    expect(comparison.branchMode).toBe("provision");

    // Run → 200 COMPLETED (live path; route never passes stubGenerator).
    const run = await app.inject({
      method: "POST",
      url: `${base}/${comparison.id}/run`,
      cookies,
      payload: {},
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().comparison.status).toBe("COMPLETED");
    expect(run.json().comparison.runIds).toHaveLength(2);

    // Unauthenticated → 401.
    const unauth = await app.inject({
      method: "POST",
      url: base,
      payload: { outlineVersionIds: [v1, v2], confirmed: true, branchSelection: { mode: "provision" } },
    });
    expect(unauth.statusCode).toBe(401);

    await app.close();
  });
});
