/**
 * NF-WF-050B fourth repair — direct SCALE policy mutation obsolete-version
 * refusal tests.
 *
 * GAP-119: hardness PUT and DELETE must read the LIVE chapter.currentVersionId
 * under the frozen novel -> branch -> chapter lock order and refuse requests
 * pinned to an obsolete chapter version (409) with ZERO policy, revision,
 * checkpoint, change-set (rebuild intent) and audit writes.
 *
 * Real DB-backed tests on a dedicated disposable database
 * (`novelforge_test_scale_policy_direct`) — never touches working data.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createNarrativeServices,
  createAuditService,
  fingerprintScalePolicy,
  ConflictError,
} from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_policy_direct";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

const BASE_URL = resolveTestDatabaseUrl({
  envPath: path.join(HERE, "..", "..", "..", ".env"),
});

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
const TEST_URL = withDb(BASE_URL, TEST_DB);

let db: NovelForgeDb;

interface Fixture {
  userId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  chapterVersionId: string;
  branchId: string;
  headRevisionId: string;
  policyFingerprint: string;
}

async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({
    data: {
      email: `spd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "spd",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "spd-ws", slug: `spd-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  // AUTHOR has chapter:update and canon:manage.
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "SPD Novel",
      slug: `spd-novel-${user.id.slice(0, 8)}`,
      createdById: user.id,
    },
  });
  const branch = await db.novelBranch.create({
    data: { workspaceId: ws.id, novelId: novel.id, name: "main" },
  });
  const revision = await db.revision.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      branchId: branch.id,
      number: 1,
      origin: "MANUAL",
      message: "spd baseline",
      createdById: user.id,
    },
  });
  await db.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: revision.id },
  });
  await db.novel.update({
    where: { id: novel.id },
    data: { currentBranchId: branch.id },
  });
  const chapter = await db.chapter.create({
    data: { novelId: novel.id, title: "Ch1", number: 1, createdById: user.id },
  });
  const version = await db.chapterVersion.create({
    data: {
      chapterId: chapter.id,
      number: 1,
      content: "<p>SPD test prose.</p>",
      wordCount: 3,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "spd test",
      payload: policyPayload,
    },
  });
  const policyRow = await db.narrativePolicy.findUnique({
    where: { novelId_kind: { novelId: novel.id, kind: "SCALE" } },
  });
  const realFingerprint = fingerprintScalePolicy({
    id: policyRow!.id,
    kind: policyRow!.kind,
    hardness: policyRow!.hardness,
    hardReason: policyRow!.hardReason,
    payload: policyRow!.payload,
  });

  return {
    userId: user.id,
    workspaceId: ws.id,
    novelId: novel.id,
    chapterId: chapter.id,
    chapterVersionId: version.id,
    branchId: branch.id,
    headRevisionId: revision.id,
    policyFingerprint: realFingerprint,
  };
}

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
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.scaleDecisionOutcome.deleteMany();
  await db.scaleDecisionProposal.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.finalTextReview.deleteMany();
  await db.changeSet.deleteMany();
  await db.checkpoint.deleteMany();
  await db.auditLog.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelBranch.deleteMany();
  await db.revision.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

/** Count every write surface a direct policy mutation can touch. */
async function countWrites() {
  const [policy, revision, checkpoint, changeSet, auditLog] = await Promise.all([
    db.narrativePolicy.count(),
    db.revision.count(),
    db.checkpoint.count(),
    db.changeSet.count(),
    db.auditLog.count(),
  ]);
  return { policy, revision, checkpoint, changeSet, auditLog };
}

function validPins(f: Fixture, overrides: Partial<Fixture> = {}) {
  return {
    chapterId: f.chapterId,
    chapterVersionId: overrides.chapterVersionId ?? f.chapterVersionId,
    expectedBranchId: f.branchId,
    expectedHeadRevisionId: f.headRevisionId,
    expectedSetId: null,
    expectedDecisionId: null,
    expectedPolicyFingerprint: f.policyFingerprint,
    reason: "spd test reason",
  };
}

function narrative() {
  const audit = createAuditService(db);
  return createNarrativeServices({ db, audit });
}

describe("direct SCALE policy hardness PUT refuses obsolete versions", () => {
  it("rejects a hardness change pinned to an obsolete chapter version with zero writes", async () => {
    const f = await seedFixture();
    const obsoleteVersionId = f.chapterVersionId;

    // Advance the chapter to a new current version (v2).
    const v2 = await db.chapterVersion.create({
      data: {
        chapterId: f.chapterId,
        number: 2,
        content: "<p>SPD test prose v2.</p>",
        wordCount: 4,
        authorId: f.userId,
      },
    });
    await db.chapter.update({
      where: { id: f.chapterId },
      data: { currentVersionId: v2.id },
    });

    const before = await countWrites();
    const policyBefore = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
      select: { hardness: true, updatedAt: true },
    });

    // Hardness-only change: same VILLAGE standing, HARD -> SOFT.
    // Pins are otherwise valid; only the version is obsolete.
    await expect(
      narrative().putPolicy({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        kind: "SCALE",
        hardness: "SOFT",
        hardReason: null,
        payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
        ...validPins(f, { chapterVersionId: obsoleteVersionId }),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const after = await countWrites();
    expect(after).toEqual(before);

    // The policy row itself is untouched.
    const policyAfter = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
      select: { hardness: true, updatedAt: true },
    });
    expect(policyAfter!.hardness).toBe(policyBefore!.hardness);
    expect(policyAfter!.updatedAt.getTime()).toBe(policyBefore!.updatedAt.getTime());
  });

  it("accepts a hardness change pinned to the current chapter version", async () => {
    const f = await seedFixture();
    const result = await narrative().putPolicy({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      kind: "SCALE",
      hardness: "SOFT",
      hardReason: null,
      payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
      ...validPins(f),
    });
    expect(result.hardness).toBe("SOFT");
  });
});

describe("direct SCALE policy DELETE refuses obsolete versions", () => {
  it("rejects a delete pinned to an obsolete chapter version with zero writes", async () => {
    const f = await seedFixture();
    const obsoleteVersionId = f.chapterVersionId;

    const v2 = await db.chapterVersion.create({
      data: {
        chapterId: f.chapterId,
        number: 2,
        content: "<p>SPD test prose v2.</p>",
        wordCount: 4,
        authorId: f.userId,
      },
    });
    await db.chapter.update({
      where: { id: f.chapterId },
      data: { currentVersionId: v2.id },
    });

    const before = await countWrites();

    await expect(
      narrative().deletePolicy({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        kind: "SCALE",
        ...validPins(f, { chapterVersionId: obsoleteVersionId }),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const after = await countWrites();
    expect(after).toEqual(before);

    // The policy still exists.
    const policy = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policy).not.toBeNull();
  });

  it("accepts a delete pinned to the current chapter version", async () => {
    const f = await seedFixture();
    await narrative().deletePolicy({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      kind: "SCALE",
      ...validPins(f),
    });
    const policy = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policy).toBeNull();
  });
});
