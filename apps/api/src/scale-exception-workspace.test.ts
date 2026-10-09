/**
 * NF-WF-050B eighth repair — strict exception workspace provenance.
 *
 * GAP-119 (seventh repair re-review, P2): `resolveApplicableExceptionStrict`
 * compared novel/version/branch but omitted `proposal.workspaceId` and
 * `outcome.workspaceId`. Independent database FKs allow inconsistent
 * historical tenant fields. A retained exception with foreign workspace
 * fields must fail closed (null) with history preserved.
 *
 * Real DB-backed tests on a dedicated disposable database
 * (`novelforge_test_scale_exception_workspace`) — never touches working data.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createScaleDecisionServices,
  createAuditService,
  fingerprintScalePolicy,
  resolveApplicableExceptionStrict,
  readScaleContext,
} from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_exception_workspace";
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
  foreignWorkspaceId: string;
  novelId: string;
  chapterId: string;
  chapterVersionId: string;
  branchId: string;
  headRevisionId: string;
  policyFingerprint: string;
  evidenceSetId: string;
}

async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({
    data: {
      email: `sew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "sew",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "sew-ws", slug: `sew-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  const foreignWs = await db.workspace.create({
    data: { name: "sew-foreign", slug: `sew-f-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "SEW Novel",
      slug: `sew-novel-${user.id.slice(0, 8)}`,
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
      message: "sew baseline",
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
      wordCount: 9,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  // HARD VILLAGE policy: KINGDOM/EMPIRE claims are violating (ok:false).
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "sew test",
      payload: policyPayload,
    },
  });
  const policyRow = await db.narrativePolicy.findUniqueOrThrow({
    where: { novelId_kind: { novelId: novel.id, kind: "SCALE" } },
  });
  const realFingerprint = fingerprintScalePolicy({
    id: policyRow.id,
    kind: policyRow.kind,
    hardness: policyRow.hardness,
    hardReason: policyRow.hardReason,
    payload: policyRow.payload,
  });
  // Evidence set with 2 violating claims (KINGDOM idx 0, EMPIRE idx 1).
  const set = await db.scaleEvidenceSet.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      chapterVersionId: version.id,
      sourceBranchId: branch.id,
      sourceRevisionId: revision.id,
      sequence: 1,
      previousSetId: null,
      declaration: "CONFLICTS",
      explanation: "sew evidence",
      conflictsJson: [
        {
          scale: "KINGDOM",
          relevance: "ACTION",
          explanation: "kingdom claim",
          source: { start: 6, end: 10, quote: "test" },
        },
        {
          scale: "EMPIRE",
          relevance: "STAKES",
          explanation: "empire claim",
          source: { start: 11, end: 16, quote: "prose" },
        },
      ],
      actorUserId: user.id,
    },
  });

  return {
    userId: user.id,
    workspaceId: ws.id,
    foreignWorkspaceId: foreignWs.id,
    novelId: novel.id,
    chapterId: chapter.id,
    chapterVersionId: version.id,
    branchId: branch.id,
    headRevisionId: revision.id,
    policyFingerprint: realFingerprint,
    evidenceSetId: set.id,
  };
}

/** Create and APPROVE a CHAPTER_EXCEPTION with the given payload. */
async function seedApprovedException(
  f: Fixture,
  payload: Record<string, unknown>,
): Promise<{ proposalId: string; outcomeId: string }> {
  const svc = createScaleDecisionServices({ db, audit: createAuditService(db) });
  const created = await svc.createProposal({
    actorUserId: f.userId,
    workspaceId: f.workspaceId,
    novelId: f.novelId,
    chapterId: f.chapterId,
    chapterVersionId: f.chapterVersionId,
    expectedBranchId: f.branchId,
    expectedHeadRevisionId: f.headRevisionId,
    expectedSetId: f.evidenceSetId,
    expectedDecisionId: null,
    expectedPolicyFingerprint: f.policyFingerprint,
    kind: "CHAPTER_EXCEPTION",
    payload,
    reason: "sew exception",
  });
  const decided = await svc.decideProposal({
    chapterId: f.chapterId,
    actorUserId: f.userId,
    workspaceId: f.workspaceId,
    novelId: f.novelId,
    proposalId: created.proposal.id,
    action: "APPROVE",
    reason: "approved",
    expectedBranchId: f.branchId,
    expectedHeadRevisionId: f.headRevisionId,
    expectedDecisionId: null,
    expectedPolicyFingerprint: f.policyFingerprint,
    expectedVersionId: f.chapterVersionId,
    expectedSetId: f.evidenceSetId,
  });
  return { proposalId: created.proposal.id, outcomeId: decided.outcome.id };
}

/** Acquire the gate's required lock order inside a transaction. */
async function withGateLocks<T>(
  f: Fixture,
  fn: (tx: unknown) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT id FROM novels WHERE id = $1::uuid FOR NO KEY UPDATE`,
      f.novelId,
    );
    await tx.$executeRawUnsafe(
      `SELECT id FROM novel_branches WHERE id = $1::uuid FOR UPDATE`,
      f.branchId,
    );
    await tx.$executeRawUnsafe(
      `SELECT id FROM chapters WHERE id = $1::uuid FOR UPDATE`,
      f.chapterId,
    );
    return fn(tx);
  });
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
  });
  db = createDb(TEST_URL);
});

afterAll(async () => {
  await db.$disconnect();
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.end();
});

describe("exception workspace provenance (eighth repair, GAP-119 P2)", () => {
  it("accepts a valid owned exception (same workspace control)", async () => {
    const f = await seedFixture();
    const { outcomeId, proposalId } = await seedApprovedException(f, {
      claimIndices: [0, 1],
    });

    const result = await withGateLocks(f, async (tx) => {
      const context = await readScaleContext(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      });
      return resolveApplicableExceptionStrict(tx as never, {
        novelId: f.novelId,
        workspaceId: f.workspaceId,
        context: context!,
      });
    });

    expect(result).not.toBeNull();
    expect(result!.outcomeId).toBe(outcomeId);
    expect(result!.proposalId).toBe(proposalId);
    expect(result!.coveredIndices).toEqual([0, 1]);
  });

  it("FAIL CLOSED: foreign proposal.workspaceId is rejected (history preserved)", async () => {
    const f = await seedFixture();
    const { proposalId, outcomeId } = await seedApprovedException(f, {
      claimIndices: [0, 1],
    });
    // Corrupt the historical record: proposal claims a foreign workspace.
    await db.scaleDecisionProposal.update({
      where: { id: proposalId },
      data: { workspaceId: f.foreignWorkspaceId },
    });

    // Records still exist (audit history preserved, not deleted).
    const proposal = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    expect(proposal.workspaceId).toBe(f.foreignWorkspaceId);
    const outcome = await db.scaleDecisionOutcome.findUniqueOrThrow({
      where: { id: outcomeId },
    });
    expect(outcome).not.toBeNull();

    // But the strict resolver refuses to trust it.
    const result = await withGateLocks(f, async (tx) => {
      const context = await readScaleContext(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      });
      return resolveApplicableExceptionStrict(tx as never, {
        novelId: f.novelId,
        workspaceId: f.workspaceId,
        context: context!,
      });
    });
    expect(result).toBeNull();
  });

  it("FAIL CLOSED: foreign outcome.workspaceId is rejected (history preserved)", async () => {
    const f = await seedFixture();
    const { proposalId, outcomeId } = await seedApprovedException(f, {
      claimIndices: [0, 1],
    });
    // Corrupt the historical record: outcome claims a foreign workspace.
    await db.scaleDecisionOutcome.update({
      where: { id: outcomeId },
      data: { workspaceId: f.foreignWorkspaceId },
    });

    // Records still exist (audit history preserved, not deleted).
    const outcome = await db.scaleDecisionOutcome.findUniqueOrThrow({
      where: { id: outcomeId },
    });
    expect(outcome.workspaceId).toBe(f.foreignWorkspaceId);
    const proposal = await db.scaleDecisionProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    expect(proposal).not.toBeNull();

    // But the strict resolver refuses to trust it.
    const result = await withGateLocks(f, async (tx) => {
      const context = await readScaleContext(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      });
      return resolveApplicableExceptionStrict(tx as never, {
        novelId: f.novelId,
        workspaceId: f.workspaceId,
        context: context!,
      });
    });
    expect(result).toBeNull();
  });
});
