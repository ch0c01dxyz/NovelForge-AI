/**
 * NF-WF-050B Slice 2 — S2 decision service integration tests.
 *
 * Real DB-backed tests for proposal/decision CAS, 409 paths, and atomicity.
 * Uses a dedicated disposable database (`novelforge_test_scale_decisions`) —
 * never touches the working database.
 *
 * The deterministic assessment unit tests (scale-review.test.ts) cover the
 * 8-row decision table; this file covers the S2 service boundaries.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createScaleDecisionServices,
  createAuditService,
  fingerprintScalePolicy,
} from "@novelforge/ai-services";
import { ConflictError, NotFoundError } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_decisions";
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
      email: `s2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "s2",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "s2-ws", slug: `s2-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  // AUTHOR has chapter:update, canon:manage, canon:approve.
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "S2 Novel",
      slug: `s2-novel-${user.id.slice(0, 8)}`,
      createdById: user.id,
    },
  });
  // Branch first (headRevisionId nullable); revision needs branchId.
  const branch = await db.novelBranch.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      name: "main",
    },
  });
  const revision = await db.revision.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      branchId: branch.id,
      number: 1,
      origin: "MANUAL",
      message: "s2 baseline",
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
      content: "<p>S2 test prose with enough content.</p>",
      wordCount: 6,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  // SCALE policy (HARD) for fingerprint expectations.
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "s2 test",
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
  // Child-first cleanup.
  await db.scaleDecisionOutcome.deleteMany();
  await db.scaleDecisionProposal.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.finalTextReview.deleteMany();
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

function validStandingChangePayload() {
  return {
    standing: { scale: "TOWN", access: ["VILLAGE", "TOWN"], reputation: 60 },
    hardness: "HARD",
    hardReason: "expanding scope for act two",
  };
}

function validExceptionPayload() {
  return { claimIndices: [0, 2] };
}

describe("createProposal", () => {
  it("creates a STANDING_CHANGE proposal with sequence 1 and returns the decision head", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const result = await svc.createProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "STANDING_CHANGE",
      payload: validStandingChangePayload(),
      reason: "The protagonist's influence is growing",
    });

    expect(result.proposal.sequence).toBe(1);
    expect(result.proposal.kind).toBe("STANDING_CHANGE");
    expect(result.decisionHeadId).toBeNull();

    const stored = await db.scaleDecisionProposal.findUnique({
      where: { id: result.proposal.id },
    });
    expect(stored).toBeTruthy();
    expect(stored!.policyFingerprint).toBe(f.policyFingerprint);
    expect(stored!.sourceBranchId).toBe(f.branchId);
  });

  it("creates a CHAPTER_EXCEPTION proposal with validated claim indices", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const result = await svc.createProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "CHAPTER_EXCEPTION",
      payload: validExceptionPayload(),
      reason: "Narrow exception for dramatic irony",
    });

    expect(result.proposal.sequence).toBe(1);
    expect(result.proposal.kind).toBe("CHAPTER_EXCEPTION");
  });

  it("rejects empty claimIndices with 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: null,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [] },
        reason: "empty indices",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const count = await db.scaleDecisionProposal.count();
    expect(count).toBe(0);
  });

  it("rejects duplicate claimIndices with 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: null,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [1, 1] },
        reason: "duplicate indices",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects stale branch expectation with 409 and zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: "00000000-0000-0000-0000-000000000000",
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: null,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "STANDING_CHANGE",
        payload: validStandingChangePayload(),
        reason: "stale branch",
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });

  it("rejects stale policy fingerprint with 409 and zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: null,
        expectedDecisionId: null,
        expectedPolicyFingerprint: "0".repeat(64),
        kind: "STANDING_CHANGE",
        payload: validStandingChangePayload(),
        reason: "stale fingerprint",
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });

  it("allocates monotonic sequences for sequential proposals", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const base = {
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "CHAPTER_EXCEPTION" as const,
      reason: "seq test",
    };

    const r1 = await svc.createProposal({ ...base, payload: { claimIndices: [0] } });
    const r2 = await svc.createProposal({ ...base, payload: { claimIndices: [1] } });

    expect(r1.proposal.sequence).toBe(1);
    expect(r2.proposal.sequence).toBe(2);
  });

  it("rejects a user without canon:manage (VIEWER) with 403", async () => {
    const f = await seedFixture();
    const viewer = await db.user.create({
      data: {
        email: `viewer-${Date.now()}@t.io`,
        passwordHash: "x",
        displayName: "viewer",
      },
    });
    await db.membership.create({
      data: { workspaceId: f.workspaceId, userId: viewer.id, role: "VIEWER" },
    });
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.createProposal({
        actorUserId: viewer.id,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: null,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "STANDING_CHANGE",
        payload: validStandingChangePayload(),
        reason: "viewer attempt",
      }),
    ).rejects.toThrow();

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });
});

describe("decideProposal", () => {
  async function seedProposal(f: Fixture) {
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const result = await svc.createProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "CHAPTER_EXCEPTION",
      payload: validExceptionPayload(),
      reason: "decide me",
    });
    return result.proposal;
  }

  it("REJECT records one outcome without policy mutation", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const proposal = await seedProposal(f);

    const policyBefore = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });

    const result = await svc.decideProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "REJECT",
      reason: "not justified",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
    });

    expect(result.outcome.action).toBe("REJECT");
    expect(result.outcome.sequence).toBe(1);

    const policyAfter = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policyAfter!.payload).toEqual(policyBefore!.payload);
  });

  it("duplicate decision returns 409 with zero new writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const proposal = await seedProposal(f);

    await svc.decideProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "REJECT",
      reason: "first",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
    });

    await expect(
      svc.decideProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "APPROVE",
        reason: "second attempt",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionOutcome.count()).toBe(1);
  });

  it("stale expectedDecisionId returns 409", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const proposal = await seedProposal(f);

    await expect(
      svc.decideProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "stale head",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("ALTERNATIVE records one outcome plus a new pending proposal atomically", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const proposal = await seedProposal(f);

    const result = await svc.decideProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "ALTERNATIVE",
      reason: "try narrower indices",
      alternativePayload: { claimIndices: [0] },
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
    });

    expect(result.outcome.action).toBe("ALTERNATIVE");
    expect(result.alternativeProposal).toBeTruthy();
    expect(result.alternativeProposal!.sequence).toBe(2);
    expect(result.alternativeProposal!.predecessorProposalId).toBe(proposal.id);

    const altOutcome = await db.scaleDecisionOutcome.findUnique({
      where: { proposalId: result.alternativeProposal!.id },
    });
    expect(altOutcome).toBeNull();
  });

  it("ALTERNATIVE without payload is 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const proposal = await seedProposal(f);

    await expect(
      svc.decideProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "ALTERNATIVE",
        reason: "missing payload",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("decision on foreign proposal is 404", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.decideProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: "00000000-0000-0000-0000-000000000000",
        action: "REJECT",
        reason: "foreign",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
