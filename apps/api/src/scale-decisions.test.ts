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
import { createRevisionServices } from "./services/revisions.ts";

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
  return { claimIndices: [0, 1] };
}

/**
 * Seed a SCALE evidence set for the fixture's branch/version.
 *
 * Default: a single KINGDOM ACTION claim — a proved violation against the
 * fixture's VILLAGE standing (reach VILLAGE). The quote/span must validate
 * against the fixture version content ("<p>S2 test prose with enough
 * content.</p>"): the tag-stripped prose "test prose" sits at raw offsets
 * 6..16.
 */
async function seedEvidenceSet(
  f: Fixture,
  opts: {
    claims?: Array<{ scale: string; relevance?: string }>;
    sourceRevisionId?: string | null;
    sequence?: number;
    declaration?: "CONFLICTS" | "NO_OPERATIVE_CONFLICT";
    previousSetId?: string | null;
  } = {},
) {
  const claims = (opts.claims ?? [{ scale: "KINGDOM" }]).map((c) => ({
    scale: c.scale,
    relevance: c.relevance ?? "ACTION",
    explanation: `test claim at ${c.scale}`,
    source: { start: 6, end: 16, quote: "test prose" },
  }));
  return await db.scaleEvidenceSet.create({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterVersionId: f.chapterVersionId,
      sourceBranchId: f.branchId,
      sourceRevisionId: opts.sourceRevisionId ?? f.headRevisionId,
      sequence: opts.sequence ?? 1,
      previousSetId: opts.previousSetId ?? null,
      declaration: opts.declaration ?? "CONFLICTS",
      explanation: "test evidence set",
      conflictsJson: claims,
      actorUserId: f.userId,
    },
  });
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
    // GAP-119: exception creation requires CURRENT complete evidence with
    // actual violating claims — seed a set with three KINGDOM violations.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "KINGDOM" }, { scale: "EMPIRE" }],
    });

    const result = await svc.createProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: set.id,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "CHAPTER_EXCEPTION",
      payload: validExceptionPayload(),
      reason: "Narrow exception for dramatic irony",
    });

    expect(result.proposal.sequence).toBe(1);
    expect(result.proposal.kind).toBe("CHAPTER_EXCEPTION");
    expect(result.proposal.evidenceSetId).toBe(set.id);
  });

  it("exception creation without evidence is refused with 409 and zero writes", async () => {
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
        payload: { claimIndices: [0] },
        reason: "exception without evidence",
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });

  it("exception creation with stale evidence is refused with 409 and zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // Seed a set pinned to a different (old) head revision.
    const oldRevision = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 0,
        origin: "MANUAL",
        message: "old head",
        createdById: f.userId,
      },
    });
    const staleSet = await seedEvidenceSet(f, {
      sourceRevisionId: oldRevision.id,
    });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: staleSet.id,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        reason: "exception with stale evidence",
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });

  it("exception creation with non-violating indices is refused with 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // One KINGDOM violation (index 0) and one VILLAGE within-reach claim
    // (index 1). Index 1 is not a violating claim.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "KINGDOM" }, { scale: "VILLAGE" }],
    });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: set.id,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [1] },
        reason: "exception for non-violating claim",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionProposal.count()).toBe(0);
  });

  it("exception creation with no current violations is refused with 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // All claims within reach (VILLAGE) — nothing to except.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "VILLAGE" }, { scale: "PERSONAL" }],
    });

    await expect(
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: set.id,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        reason: "exception without violations",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionProposal.count()).toBe(0);
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
    // GAP-119: exception proposals require current violating evidence.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "KINGDOM" }, { scale: "EMPIRE" }],
    });
    const base = {
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: set.id,
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

  it("HARD standing change with null hardReason is refused with 400 and zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const proposalsBefore = await db.scaleDecisionProposal.count();
    const policiesBefore = await db.narrativePolicy.count();
    const revisionsBefore = await db.revision.count();
    const checkpointsBefore = await db.checkpoint.count();
    const auditsBefore = await db.auditLog.count();

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
        kind: "STANDING_CHANGE",
        payload: {
          standing: { scale: "TOWN", access: ["VILLAGE"], reputation: 60 },
          hardness: "HARD",
          hardReason: null,
        },
        reason: "HARD without reason",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionProposal.count()).toBe(proposalsBefore);
    expect(await db.narrativePolicy.count()).toBe(policiesBefore);
    expect(await db.revision.count()).toBe(revisionsBefore);
    expect(await db.checkpoint.count()).toBe(checkpointsBefore);
    expect(await db.auditLog.count()).toBe(auditsBefore);
  });

  it("HARD standing change with blank hardReason is refused with 400 and zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const proposalsBefore = await db.scaleDecisionProposal.count();

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
        kind: "STANDING_CHANGE",
        payload: {
          standing: { scale: "TOWN", access: [], reputation: 60 },
          hardness: "HARD",
          hardReason: "   ",
        },
        reason: "HARD with whitespace reason",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionProposal.count()).toBe(proposalsBefore);
  });

  it("SOFT standing change with null hardReason is accepted (existing behavior)", async () => {
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
      payload: {
        standing: { scale: "TOWN", access: [], reputation: 60 },
        hardness: "SOFT",
        hardReason: null,
      },
      reason: "soft change without reason",
    });

    expect(result.proposal.id).toBeDefined();
    expect(await db.scaleDecisionProposal.count()).toBe(1);
  });
});

describe("decideProposal", () => {
  async function seedProposal(f: Fixture) {
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // GAP-119: exception proposals require CURRENT complete evidence with
    // actual violating claims.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "KINGDOM" }, { scale: "EMPIRE" }],
    });
    const result = await svc.createProposal({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterId: f.chapterId,
      chapterVersionId: f.chapterVersionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: set.id,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      kind: "CHAPTER_EXCEPTION",
      payload: validExceptionPayload(),
      reason: "decide me",
    });
    return { proposal: result.proposal, evidenceSetId: set.id };
  }

  it("REJECT records one outcome without policy mutation", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    const policyBefore = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });

    const result = await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "REJECT",
      reason: "not justified",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
    });

    expect(result.outcome.action).toBe("REJECT");
    expect(result.outcome.sequence).toBe(1);

    const policyAfter = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policyAfter!.payload).toEqual(policyBefore!.payload);
  });

  it("APPROVE STANDING_CHANGE creates checkpoint, revision, policy, outcome and rebuild intent atomically", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    // Create a STANDING_CHANGE proposal (VILLAGE -> TOWN)
    const proposalResult = await svc.createProposal({
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
      reason: "The protagonist's influence is growing beyond the village",
    });
    const proposal = proposalResult.proposal;

    // Capture counts before approval
    const checkpointsBefore = await db.checkpoint.count({ where: { novelId: f.novelId } });
    const revisionsBefore = await db.revision.count({ where: { novelId: f.novelId } });
    const intentsBefore = await db.derivedRebuildIntent.count({ where: { novelId: f.novelId } });

    // Execute APPROVE
    const result = await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "APPROVE",
      reason: "Approved: standing expansion is justified by chapter events",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: null,
    });

    // 1. Outcome created with APPROVE action
    expect(result.outcome.action).toBe("APPROVE");
    expect(result.outcome.sequence).toBe(1);

    // 2. resultRevisionId is NOT null (was the bug: null before fix)
    expect(result.outcome.resultRevisionId).not.toBeNull();
    const revisionId = result.outcome.resultRevisionId!;

    // 3. Revision exists with the new revision ID
    const revision = await db.revision.findUnique({ where: { id: revisionId } });
    expect(revision).not.toBeNull();
    expect(revision!.novelId).toBe(f.novelId);
    expect(revision!.branchId).toBe(f.branchId);
    const revisionsAfter = await db.revision.count({ where: { novelId: f.novelId } });
    expect(revisionsAfter).toBe(revisionsBefore + 1);

    // 4. Policy updated with new standing (TOWN, not VILLAGE)
    const policyAfter = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policyAfter).not.toBeNull();
    const standing = (policyAfter!.payload as { standing: { scale: string } }).standing;
    expect(standing.scale).toBe("TOWN");

    // 5. Checkpoint (PRE_MUTATION) exists
    const checkpointsAfter = await db.checkpoint.count({ where: { novelId: f.novelId } });
    expect(checkpointsAfter).toBeGreaterThan(checkpointsBefore);
    const checkpoint = await db.checkpoint.findFirst({
      where: { novelId: f.novelId },
      orderBy: { createdAt: "desc" },
    });
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.kind).toBe("PRE_MUTATION");

    // 6. Rebuild intent recorded
    const intentsAfter = await db.derivedRebuildIntent.count({ where: { novelId: f.novelId } });
    expect(intentsAfter).toBeGreaterThan(intentsBefore);

    // 7. ChangeSetItem has a valid UUID entityId (not "novel:<uuid>:SCALE")
    const changeSet = await db.changeSet.findFirst({
      where: { revisionId },
      include: { items: true },
    });
    expect(changeSet).not.toBeNull();
    expect(changeSet!.items.length).toBeGreaterThan(0);
    const policyItem = changeSet!.items.find((i) => i.entityType === "NarrativePolicy");
    expect(policyItem).toBeDefined();
    // UUID regex: must be a valid UUID, not "novel:..."
    expect(policyItem!.entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(policyItem!.entityId).toBe(policyAfter!.id);
  });

  it("duplicate decision returns 409 with zero new writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "REJECT",
      reason: "first",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
    });

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "APPROVE",
        reason: "second attempt",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionOutcome.count()).toBe(1);
  });

  it("stale expectedDecisionId returns 409", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "stale head",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: "00000000-0000-0000-0000-000000000000",
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("ALTERNATIVE records one outcome plus a new pending proposal atomically", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    const result = await svc.decideProposal({
      chapterId: f.chapterId,
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
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
    });

    expect(result.outcome.action).toBe("ALTERNATIVE");
    expect(result.alternativeProposal).toBeTruthy();
    const altProposal = result.alternativeProposal as {
      id: string;
      sequence: number;
      predecessorProposalId: string | null;
    };
    expect(altProposal.sequence).toBe(2);
    expect(altProposal.predecessorProposalId).toBe(proposal.id);

    const altOutcome = await db.scaleDecisionOutcome.findUnique({
      where: { proposalId: altProposal.id },
    });
    expect(altOutcome).toBeNull();
  });

  it("ALTERNATIVE without payload is 400", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "ALTERNATIVE",
        reason: "missing payload",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("ALTERNATIVE with HARD blank hardReason is 400 with zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // Create a STANDING_CHANGE proposal (valid).
    const proposalResult = await svc.createProposal({
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
      reason: "standing change for alternative test",
    });
    const proposal = proposalResult.proposal;

    const outcomesBefore = await db.scaleDecisionOutcome.count();
    const proposalsBefore = await db.scaleDecisionProposal.count();

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "ALTERNATIVE",
        reason: "alternative without hard reason",
        alternativePayload: {
          standing: { scale: "CITY", access: [], reputation: 70 },
          hardness: "HARD",
          hardReason: null,
        },
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await db.scaleDecisionOutcome.count()).toBe(outcomesBefore);
    expect(await db.scaleDecisionProposal.count()).toBe(proposalsBefore);
  });

  it("decision on foreign proposal is 404", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: "00000000-0000-0000-0000-000000000000",
        action: "REJECT",
        reason: "foreign",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: null,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("stale stored policy pin is 409 with zero writes and is never repinned", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    // Policy changes AFTER the proposal was created: the stored pin is now
    // stale. The client passes FRESH expectations (the new fingerprint) —
    // fresh client expectations must never repin the old proposal.
    const updated = await db.narrativePolicy.update({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
      data: {
        payload: {
          standing: { scale: "TOWN", access: ["TOWN"], reputation: 60 },
        },
      },
    });
    const freshFingerprint = fingerprintScalePolicy({
      id: updated.id,
      kind: updated.kind,
      hardness: updated.hardness,
      hardReason: updated.hardReason,
      payload: updated.payload,
    });
    expect(freshFingerprint).not.toBe(f.policyFingerprint);

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "stale pin",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: freshFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(/proposal is stale/);

    // Zero writes: no outcome recorded.
    expect(await db.scaleDecisionOutcome.count()).toBe(0);
    // The proposal is retained and its pins are NOT repinned to current.
    const reread = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(reread.policyFingerprint).toBe(f.policyFingerprint);
  });

  it("stale stored head pin is 409 with zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    // Head advances AFTER the proposal was created: the stored
    // sourceRevisionId pin is stale.
    const revision2 = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 2,
        origin: "MANUAL",
        message: "head moved",
        createdById: f.userId,
      },
    });
    await db.novelBranch.update({
      where: { id: f.branchId },
      data: { headRevisionId: revision2.id },
    });

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "head moved",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: revision2.id,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(/proposal is stale/);

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
    const reread = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(reread.sourceRevisionId).toBe(f.headRevisionId);
  });

  it("concurrent proposal creation allocates unique sequences (no duplicates)", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    // GAP-119: exception proposals require current violating evidence.
    // 5 unique violating claims (all beyond VILLAGE standing) with VALID
    // quote/span pairs against the fixture version content
    // "<p>S2 test prose with enough content.</p>" — verified via
    // verifyEvidenceQuote. Invalid spans would fail retained-evidence
    // validation before concurrency is exercised.
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "test evidence set",
        conflictsJson: [
          { scale: "KINGDOM", relevance: "ACTION", explanation: "c0", source: { start: 6, end: 10, quote: "test" } },
          { scale: "EMPIRE", relevance: "ACTION", explanation: "c1", source: { start: 11, end: 16, quote: "prose" } },
          { scale: "KINGDOM", relevance: "STAKES", explanation: "c2", source: { start: 17, end: 21, quote: "with" } },
          { scale: "EMPIRE", relevance: "STAKES", explanation: "c3", source: { start: 22, end: 28, quote: "enough" } },
          { scale: "KINGDOM", relevance: "CONSEQUENCE", explanation: "c4", source: { start: 29, end: 36, quote: "content" } },
        ],
        actorUserId: f.userId,
      },
    });

    // Create 5 proposals concurrently; each should get a unique sequence 1-5.
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        svc.createProposal({
          actorUserId: f.userId,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          chapterId: f.chapterId,
          chapterVersionId: f.chapterVersionId,
          expectedBranchId: f.branchId,
          expectedHeadRevisionId: f.headRevisionId,
          expectedSetId: set.id,
          expectedDecisionId: null,
          expectedPolicyFingerprint: f.policyFingerprint,
          kind: "CHAPTER_EXCEPTION",
          payload: { claimIndices: [i - 1] },
          reason: `concurrent ${i}`,
        }),
      ),
    );

    // All succeed with unique sequences.
    const sequences = results.map((r) => r.proposal.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2, 3, 4, 5]);

    // Verify in DB: 5 proposals, no duplicate sequences.
    const count = await db.scaleDecisionProposal.count({
      where: { novelId: f.novelId, chapterVersionId: f.chapterVersionId },
    });
    expect(count).toBe(5);
  });

  it("simultaneous DECISIONS: one winner, zero partial loser effects", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    // Two CHAPTER_EXCEPTION proposals for the same chapter version, referencing
    // the same evidence set. Exception approvals do NOT advance the head, so
    // the decision-head CAS (expectedDecisionId) is the sole serialization
    // mechanism — this test exercises the actual concurrent-decision race,
    // not proposal creation or head-pin invalidation.
    const set = await seedEvidenceSet(f, {
      claims: [{ scale: "KINGDOM" }, { scale: "EMPIRE" }],
    });
    const mkProposal = (claimIndices: number[], reason: string) =>
      svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedSetId: set.id,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices },
        reason,
      });
    const proposalA = await mkProposal([0], "concurrent decision A");
    const proposalB = await mkProposal([1], "concurrent decision B");

    const decideInput = (proposalId: string) => ({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId,
      action: "APPROVE" as const,
      reason: "concurrent race",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: set.id,
    });

    // Fire both decisions concurrently. Exactly one must win; the loser
    // must get a clean 409 (not a 500) and leave zero partial effects.
    const results = await Promise.allSettled([
      svc.decideProposal(decideInput(proposalA.proposal.id)),
      svc.decideProposal(decideInput(proposalB.proposal.id)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one winner.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser gets a clean 409 ConflictError, not a 500 or Prisma error.
    const loserError = (rejected[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(ConflictError);
    expect(loserError.message).toMatch(/decision head changed|concurrent decision/);

    // Exactly one outcome in the database.
    const outcomes = await db.scaleDecisionOutcome.findMany({
      where: { novelId: f.novelId },
    });
    expect(outcomes).toHaveLength(1);

    // Zero partial loser effects: the loser's proposal has no outcome.
    const winnerProposalId = (fulfilled[0] as PromiseFulfilledResult<any>).value.outcome.proposalId;
    const loserProposalId =
      winnerProposalId === proposalA.proposal.id ? proposalB.proposal.id : proposalA.proposal.id;
    const loserOutcome = await db.scaleDecisionOutcome.findUnique({
      where: { proposalId: loserProposalId },
    });
    expect(loserOutcome).toBeNull();

    // Zero partial loser effects: no audit record for the loser's decision.
    const loserAudits = await db.auditLog.findMany({
      where: {
        entityType: "ScaleDecisionOutcome",
        payload: { path: ["proposalId"], equals: loserProposalId },
      },
    });
    expect(loserAudits).toHaveLength(0);
  });

  it("checkpoint-failure rollback: zero effects including audit, pre-change state verified", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    // STANDING_CHANGE proposal (HIGH approval triggers advanceForMutation
    // with PRE_MUTATION checkpoint).
    const { proposal } = await svc.createProposal({
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
      reason: "checkpoint rollback test",
    });

    // Record PRE-CHANGE state: what the PRE_MUTATION checkpoint would have
    // captured, and the counts that must be unchanged after rollback.
    const policyBefore = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    const revisionCountBefore = await db.revision.count({ where: { novelId: f.novelId } });
    const checkpointCountBefore = await db.checkpoint.count({ where: { novelId: f.novelId } });
    const outcomeCountBefore = await db.scaleDecisionOutcome.count({ where: { novelId: f.novelId } });
    const auditCountBefore = await db.auditLog.count({ where: { workspaceId: f.workspaceId } });

    // Force the checkpoint write to throw via a trigger. This simulates a
    // checkpoint-storage failure mid-transaction.
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_checkpoint() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'test-forced checkpoint failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_checkpoint_trigger
      BEFORE INSERT ON checkpoints
      FOR EACH ROW EXECUTE FUNCTION test_fail_checkpoint();
    `);

    try {
      // The decision must fail...
      await expect(
        svc.decideProposal({
          chapterId: f.chapterId,
          actorUserId: f.userId,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          proposalId: proposal.id,
          action: "APPROVE",
          reason: "checkpoint will fail",
          expectedBranchId: f.branchId,
          expectedHeadRevisionId: f.headRevisionId,
          expectedDecisionId: null,
          expectedPolicyFingerprint: f.policyFingerprint,
          expectedVersionId: f.chapterVersionId,
          expectedSetId: null,
        }),
      ).rejects.toThrow(/test-forced checkpoint failure/);
    } finally {
      // Always remove the trigger, even if the assertion fails.
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_checkpoint_trigger ON checkpoints;`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_checkpoint();`);
    }

    // ...and roll back EVERYTHING, including audit.
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(revisionCountBefore);
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(checkpointCountBefore);
    expect(await db.scaleDecisionOutcome.count({ where: { novelId: f.novelId } })).toBe(outcomeCountBefore);
    expect(await db.auditLog.count({ where: { workspaceId: f.workspaceId } })).toBe(auditCountBefore);

    // The proposal itself is NOT rolled back (it was committed before the
    // decision attempt), but it has no outcome.
    const proposalAfter = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposal.id },
      include: { outcome: true },
    });
    expect(proposalAfter.outcome).toBeNull();

    // Pre-change snapshot contents verified: the policy still has the
    // ORIGINAL standing (VILLAGE) — the mutation never committed.
    const policyAfter = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(policyAfter.payload).toEqual(policyBefore.payload);
    expect((policyAfter.payload as any).standing.scale).toBe("VILLAGE");
  });

  it("ACTUAL STORY restore with old snapshot JSON lacking scale_review: invokes previewRestore/applyRestore", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const revSvc = createRevisionServices({ db, audit: createAuditService(db) });

    // 1. Create a legacy receipt (pre-050B format: scaleReview NULL).
    const legacyReceipt = await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: ["SCALE"],
        // scaleReview omitted → NULL (legacy: pre-050B snapshot had no scale_review)
      },
    });

    // 2. HIGH standing change: VILLAGE -> TOWN. No evidence set exists yet, so
    //    expectedSetId is null. This creates a PRE_MUTATION checkpoint whose
    //    snapshot captures the pre-change (VILLAGE) standing.
    const standingProposal = await svc.createProposal({
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
      reason: "standing change before restore test",
    });
    const standingDecision = await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: standingProposal.proposal.id,
      action: "APPROVE",
      reason: "approve standing change for restore test",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: null,
    });
    const postChangeHead = standingDecision.currentHeadRevisionId;
    expect(postChangeHead).not.toBe(f.headRevisionId);
    // Policy is now TOWN (changed from VILLAGE).
    const policyAfterChange = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(
      (policyAfterChange.payload as { standing: { scale: string } }).standing.scale,
    ).toBe("TOWN");
    const townFingerprint = fingerprintScalePolicy({
      id: policyAfterChange.id,
      kind: policyAfterChange.kind,
      hardness: policyAfterChange.hardness,
      hardReason: policyAfterChange.hardReason,
      payload: policyAfterChange.payload,
    });

    // 3. Create S2 history (proposal + outcome) — OPERATIONAL, append-only.
    //    Uses CHAPTER_EXCEPTION so the decision does not advance the head.
    const { proposal } = await (async () => {
      const set = await seedEvidenceSet(f, {
        claims: [{ scale: "KINGDOM" }, { scale: "EMPIRE" }],
        sourceRevisionId: postChangeHead,
      });
      const result = await svc.createProposal({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: postChangeHead,
        expectedSetId: set.id,
        expectedDecisionId: standingDecision.outcome.id,
        expectedPolicyFingerprint: townFingerprint,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        reason: "s2 history for restore test",
      });
      const decided = await svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: result.proposal.id,
        action: "APPROVE",
        reason: "approve for restore test",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: postChangeHead,
        expectedDecisionId: standingDecision.outcome.id,
        expectedPolicyFingerprint: townFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: set.id,
      });
      return { proposal: result.proposal, outcome: decided.outcome };
    })();

    // 4. Build OLD snapshot JSON: take the PRE_MUTATION checkpoint's snapshot
    //    payload (which captured the VILLAGE standing) and strip `scale_review`
    //    from every final_text_reviews row — the pre-050B format.
    const preMutationCheckpoint = await db.checkpoint.findFirstOrThrow({
      where: { novelId: f.novelId, kind: "PRE_MUTATION" },
      orderBy: { createdAt: "desc" },
      include: { snapshot: true },
    });
    const livePayload = preMutationCheckpoint.snapshot.payload as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const oldPayload: Record<string, Array<Record<string, unknown>>> = {};
    for (const [table, rows] of Object.entries(livePayload)) {
      oldPayload[table] = rows.map((row) => {
        if (table === "final_text_reviews") {
          const { scale_review, ...rest } = row;
          return rest;
        }
        return { ...row };
      });
    }
    // Sanity: the old payload really lacks scale_review and still pins VILLAGE.
    for (const row of oldPayload["final_text_reviews"] ?? []) {
      expect("scale_review" in row).toBe(false);
    }
    const oldPolicyRow = (oldPayload["narrative_policies"] ?? []).find(
      (r) => r["kind"] === "SCALE",
    );
    expect(oldPolicyRow).toBeDefined();
    expect(
      ((oldPolicyRow!["payload"] as { standing: { scale: string } }).standing.scale),
    ).toBe("VILLAGE");

    // 5. Persist the old-format snapshot + checkpoint. Direct DB writes: there
    //    is no service for "checkpoint with a custom payload" — the code path
    //    under test is the REAL previewRestore/applyRestore below.
    const oldRevision = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 900,
        origin: "MANUAL",
        message: "old-snapshot checkpoint (pre-050B format)",
        createdById: f.userId,
      },
    });
    const oldSnapshot = await db.snapshot.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        revisionId: oldRevision.id,
        formatVersion: 1, // SNAPSHOT_FORMAT_VERSION
        storage: "INLINE",
        payload: oldPayload as never,
        byteSize: JSON.stringify(oldPayload).length,
      },
    });
    const oldCheckpoint = await db.checkpoint.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        revisionId: oldRevision.id,
        snapshotId: oldSnapshot.id,
        kind: "MANUAL",
        label: "old snapshot without scale_review",
        createdById: f.userId,
      },
    });

    // 6. REAL STORY restore: NovelForge's actual previewRestore + applyRestore.
    //    This is NOT a simulation — it runs the FULL restore apply path
    //    (delete covered rows, re-insert from the old snapshot payload,
    //    rewind the branch head, record the RESTORE revision).
    const preview = await revSvc.previewRestore({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      checkpointId: oldCheckpoint.id,
      scope: "FULL",
    });
    expect(preview.restoreOperationId).toBeDefined();
    expect(preview.preview).toBeDefined();

    const applied = await revSvc.applyRestore({
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      restoreOperationId: preview.restoreOperationId,
    });
    expect(applied.status).toBe("APPLIED");
    expect(applied.revisionId).toBeDefined();
    expect(applied.revisionId).not.toBe(postChangeHead);

    // 7a. STANDING REWIND: the policy reverts to the old snapshot's VILLAGE
    //     standing (it was TOWN before the restore).
    const policyAfterRestore = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(
      (policyAfterRestore.payload as { standing: { scale: string } }).standing.scale,
    ).toBe("VILLAGE");

    // 7b. LEGACY RECEIPT HANDLING: the restored final_text_reviews rows come
    //     from the old snapshot JSON (no scale_review key → NULL). They are
    //     readable without crashing; NULL denotes legacy, never fabricated.
    const receiptsAfter = await db.finalTextReview.findMany({
      where: { novelId: f.novelId },
    });
    expect(receiptsAfter.length).toBeGreaterThan(0);
    for (const r of receiptsAfter) {
      expect(r.scaleReview).toBeNull();
    }
    // The pre-restore legacy receipt's content survived the rewind.
    const restoredLegacy = receiptsAfter.find((r) => r.id === legacyReceipt.id);
    expect(restoredLegacy).toBeDefined();
    expect(restoredLegacy!.verdict).toBe("PASS");

    // 7c. RETAINED OPERATIONAL S2 HISTORY: proposals/outcomes are NOT in the
    //     restore scope — they survive the FULL restore.
    const proposalAfter = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposal.id },
      include: { outcome: true },
    });
    expect(proposalAfter.outcome).not.toBeNull();

    // 7d. STALE APPLICABILITY: the restore created a NEW revision; the branch
    //     head moved. Any receipt pinning the pre-restore head is now stale.
    const branchAfter = await db.novelBranch.findUniqueOrThrow({
      where: { id: f.branchId },
    });
    expect(branchAfter.headRevisionId).toBe(applied.revisionId);
    expect(branchAfter.headRevisionId).not.toBe(postChangeHead);
    for (const r of receiptsAfter) {
      expect(r.revisionId).not.toBe(branchAfter.headRevisionId);
    }
  });

it("PRE_MUTATION checkpoint snapshot captures the pre-change standing", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    // Record the pre-change standing (VILLAGE).
    const policyBefore = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    const standingBefore = (
      policyBefore.payload as { standing: { scale: string } }
    ).standing.scale;
    expect(standingBefore).toBe("VILLAGE");

    // HIGH standing change: VILLAGE -> TOWN.
    const proposalResult = await svc.createProposal({
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
      reason: "prove pre-change snapshot content",
    });
    const decided = await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposalResult.proposal.id,
      action: "APPROVE",
      reason: "approve to inspect snapshot",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: null,
    });

    // The decision advanced the head; the checkpoint must pin the PRE-decision head.
    expect(decided.currentHeadRevisionId).not.toBe(f.headRevisionId);
    const checkpoint = await db.checkpoint.findFirstOrThrow({
      where: { novelId: f.novelId, kind: "PRE_MUTATION" },
      orderBy: { createdAt: "desc" },
      include: { snapshot: true },
    });
    // Source revision: the checkpoint pins the pre-decision head revision.
    expect(checkpoint.revisionId).toBe(f.headRevisionId);

    // Snapshot content: the narrative_policies rows carry the PRE-CHANGE
    // standing (VILLAGE), not the post-decision TOWN.
    const payload = checkpoint.snapshot.payload as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const policyRows = payload["narrative_policies"] ?? [];
    const scaleRow = policyRows.find((r) => r["kind"] === "SCALE");
    expect(scaleRow).toBeDefined();
    const snapshotStanding = (
      scaleRow!["payload"] as { standing: { scale: string } }
    ).standing.scale;
    expect(snapshotStanding).toBe("VILLAGE");
    expect(snapshotStanding).toBe(standingBefore);

    // And the live policy is now TOWN — proving the snapshot is pre-change,
    // not a copy of the current state.
    const policyAfter = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    expect(
      (policyAfter.payload as { standing: { scale: string } }).standing.scale,
    ).toBe("TOWN");
  });

  it("decision on obsolete version is 409 with zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    // Advance the chapter to a NEW current version (V2). The stored proposal
    // still pins the now-obsolete V1.
    const version2 = await db.chapterVersion.create({
      data: {
        chapterId: f.chapterId,
        number: 2,
        content: "<p>S2 test prose revised with enough content.</p>",
        wordCount: 7,
        authorId: f.userId,
      },
    });
    await db.chapter.update({
      where: { id: f.chapterId },
      data: { currentVersionId: version2.id },
    });

    // Client expectations are FRESH (they track the live current version V2),
    // but the stored proposal pins obsolete V1: the decision must refuse.
    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "obsolete version",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: version2.id,
        expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(/obsolete version/);

    // Zero writes: no outcome recorded, proposal pins untouched (never repinned).
    expect(await db.scaleDecisionOutcome.count()).toBe(0);
    const reread = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(reread.chapterVersionId).toBe(f.chapterVersionId);
  });

  it("stale expectedVersionId is 409 with zero writes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "REJECT",
        reason: "stale version expectation",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: "00000000-0000-0000-0000-000000000000",
        expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(/version expectation mismatch/);

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("exception approval with replaced evidence is refused with 409 and zero outcomes", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    // Replace the evidence set: a NEW set (sequence 2) with different claims
    // (all within reach — no violations). The stored proposal still pins the
    // old set's violating indices. The sequence-2 set carries the correct
    // previousSetId so chain validation passes and the test exercises the
    // intended applicability 409 boundary (not a chain-validation error).
    const set2 = await seedEvidenceSet(f, {
      claims: [
        { scale: "VILLAGE", relevance: "ACTION" },
        { scale: "PERSONAL", relevance: "ACTION" },
        { scale: "VILLAGE", relevance: "STAKES" },
      ],
      sequence: 2,
      previousSetId: evidenceSetId,
    });
    expect(set2.previousSetId).toBe(evidenceSetId);

    await expect(
      svc.decideProposal({
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: proposal.id,
        action: "APPROVE",
        reason: "approve against replaced evidence",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: evidenceSetId,
      }),
    ).rejects.toThrow(/exception no longer applicable/);

    expect(await db.scaleDecisionOutcome.count()).toBe(0);
  });

  it("exception approval succeeds when evidence is still current", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
    const { proposal, evidenceSetId } = await seedProposal(f);

    const result = await svc.decideProposal({
      chapterId: f.chapterId,
      actorUserId: f.userId,
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      proposalId: proposal.id,
      action: "APPROVE",
      reason: "exception justified by dramatic irony",
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedDecisionId: null,
      expectedPolicyFingerprint: f.policyFingerprint,
      expectedVersionId: f.chapterVersionId,
      expectedSetId: evidenceSetId,
    });

    expect(result.outcome.action).toBe("APPROVE");
    expect(result.outcome.sequence).toBe(1);
    // Exception approval changes no story truth: no revision result.
    expect(result.outcome.resultRevisionId).toBeNull();
  });
});

describe("atomic create+approve (NF-WF-050B second repair)", () => {
  it("failing approval rolls back the proposal: zero partial effects", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const proposalInput = {
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
      kind: "STANDING_CHANGE" as const,
      payload: validStandingChangePayload(),
      reason: "atomicity regression test",
    };

    // The approval is deliberately broken: wrong policy fingerprint.
    // createProposalTx succeeds, decideProposalTx throws 409.
    // In a single transaction, the proposal must roll back too.
    await expect(
      db.$transaction(async (tx) => {
        const created = await svc.createProposalTx(tx as import("@novelforge/ai-services").ScaleDecisionTx, proposalInput);
        await svc.decideProposalTx(tx as import("@novelforge/ai-services").ScaleDecisionTx, {
          chapterId: f.chapterId,
          actorUserId: f.userId,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          proposalId: created.proposal.id,
          action: "APPROVE",
          reason: "atomicity regression test",
          expectedBranchId: f.branchId,
          expectedHeadRevisionId: f.headRevisionId,
          expectedDecisionId: null,
          expectedPolicyFingerprint: "0".repeat(64), // WRONG: forces 409
          expectedVersionId: f.chapterVersionId,
          expectedSetId: null,
        });
      }),
    ).rejects.toThrow(/policy fingerprint expectation mismatch/);

    // Zero partial effects: no proposal, no outcome, no policy change.
    expect(
      await db.scaleDecisionProposal.count({ where: { novelId: f.novelId } }),
    ).toBe(0);
    expect(
      await db.scaleDecisionOutcome.count({ where: { novelId: f.novelId } }),
    ).toBe(0);
  });

  it("successful atomic create+approve leaves one proposal and one outcome", async () => {
    const f = await seedFixture();
    const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });

    const proposalInput = {
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
      kind: "STANDING_CHANGE" as const,
      payload: validStandingChangePayload(),
      reason: "atomicity success test",
    };

    const result = await db.$transaction(async (tx) => {
      const created = await svc.createProposalTx(tx as import("@novelforge/ai-services").ScaleDecisionTx, proposalInput);
      const decided = await svc.decideProposalTx(tx as import("@novelforge/ai-services").ScaleDecisionTx, {
        chapterId: f.chapterId,
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        proposalId: created.proposal.id,
        action: "APPROVE",
        reason: "atomicity success test",
        expectedBranchId: f.branchId,
        expectedHeadRevisionId: f.headRevisionId,
        expectedDecisionId: null,
        expectedPolicyFingerprint: f.policyFingerprint,
        expectedVersionId: f.chapterVersionId,
        expectedSetId: null,
      });
      return { created, decided };
    });

    expect(result.created.proposal.sequence).toBe(1);
    expect(result.decided.outcome.action).toBe("APPROVE");
    expect(result.decided.outcome.resultRevisionId).toBeTruthy();
    expect(
      await db.scaleDecisionProposal.count({ where: { novelId: f.novelId } }),
    ).toBe(1);
    expect(
      await db.scaleDecisionOutcome.count({ where: { novelId: f.novelId } }),
    ).toBe(1);
  });
});
