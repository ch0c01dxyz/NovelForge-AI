/**
 * NF-WF-050B sixth repair — complete producer/live proof consistency.
 *
 * GAP-119 (fifth repair re-review, finding 1 — P1): `final-text-review-gate.ts`
 * accepts WITHIN_REACH with `claims:[]`/`missingData:[]`/`blocking:false`.
 * With matching pins, no exception and PASS verdict, the shared gate returns
 * `ok:true` even under HARD policy with absent evidence; the traced path also
 * permits stale evidence or malformed standing with crafted matching pins.
 *
 * The fix reuses the deterministic assessor (`assessScaleDeterministic`) to
 * compute the EXPECTED protocol from validated live context + applicable
 * exception coverage, then compares the complete normalized protocol
 * (state, blocking, claims, missingData, pins). The retained proof must MATCH
 * the live assessment — an internally valid JSON shape is not proof of a
 * complete live assessment.
 *
 * These are DB-backed tests exercising the SHARED gate
 * (`checkFinalTextReviewGate`). Validators are not weakened: the crafted
 * receipts are fully schema-valid with verbatim-matching pins; only the
 * retained proof contradicts what the live assessor would produce.
 *
 * Real DB-backed tests on a dedicated disposable database
 * (`novelforge_test_scale_proof_complete`) — never touches working data.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  checkFinalTextReviewGate,
  fingerprintScalePolicy,
  assessScaleDeterministic,
} from "@novelforge/ai-services";
import type { ScaleReviewProtocol } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_proof_complete";
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
  versionContent: string;
  branchId: string;
  headRevisionId: string;
  policyFingerprint: string;
}

async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({
    data: {
      email: `spc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "spc",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "spc-ws", slug: `spc-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "SPC Novel",
      slug: `spc-novel-${user.id.slice(0, 8)}`,
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
      message: "spc baseline",
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
  const versionContent =
    "<p>SPC test prose with enough content for evidence spans.</p>";
  const chapter = await db.chapter.create({
    data: { novelId: novel.id, title: "Ch1", number: 1, createdById: user.id },
  });
  const version = await db.chapterVersion.create({
    data: {
      chapterId: chapter.id,
      number: 1,
      content: versionContent,
      wordCount: 9,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  // Configured SCALE policy (HARD).
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "spc test",
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

  return {
    userId: user.id,
    workspaceId: ws.id,
    novelId: novel.id,
    chapterId: chapter.id,
    chapterVersionId: version.id,
    versionContent,
    branchId: branch.id,
    headRevisionId: revision.id,
    policyFingerprint: realFingerprint,
  };
}

/** Acquire the gate's required lock order inside a transaction. */
async function withGateLocks<T>(
  f: Fixture,
  fn: (tx: NovelForgeDb) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
      f.novelId,
    );
    await tx.$queryRawUnsafe(
      `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
      f.branchId,
    );
    await tx.$queryRawUnsafe(
      `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
      f.chapterId,
    );
    return fn(tx as unknown as NovelForgeDb);
  });
}

/** Craft a schema-valid WITHIN_REACH protocol with empty claims and matching pins. */
function makeEmptyWithinReach(
  f: Fixture,
  evidenceSetId: string | null,
): ScaleReviewProtocol {
  return {
    protocol: 1,
    state: "WITHIN_REACH",
    blocking: false,
    pins: {
      chapterVersionId: f.chapterVersionId,
      branchId: f.branchId,
      sourceRevisionId: f.headRevisionId,
      evidenceSetId,
      policyFingerprint: f.policyFingerprint,
      exceptionOutcomeId: null,
    },
    claims: [],
    missingData: [],
  };
}

async function writeReceipt(
  f: Fixture,
  scaleReview: ScaleReviewProtocol | null,
): Promise<void> {
  await db.finalTextReview.upsert({
    where: { chapterVersionId: f.chapterVersionId },
    create: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterVersionId: f.chapterVersionId,
      revisionId: f.headRevisionId,
      verdict: "PASS",
      scaleReview: scaleReview as unknown as object,
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: [],
    },
    update: {
      verdict: "PASS",
      scaleReview: scaleReview as unknown as object,
      hardViolations: [],
    },
  });
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
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
  });
  db = createDb(TEST_URL);
}, 120000);

afterAll(async () => {
  await db.$disconnect();
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.end();
});

describe("complete proof consistency (P1)", () => {
  it("NEGATIVE: WITHIN_REACH/empty-claims/matching-pins under HARD with ABSENT evidence fails closed", async () => {
    const f = await seedFixture();
    // No evidence set exists. The live assessor would produce INCOMPLETE
    // (blocking, HARD). A retained WITHIN_REACH with empty claims and
    // matching pins must NOT pass.
    const crafted = makeEmptyWithinReach(f, null);
    await writeReceipt(f, crafted);

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    expect(result).toEqual({ ok: false, code: "REVIEW_STALE" });
  });

  it("NEGATIVE: WITHIN_REACH/empty-claims/matching-pins under HARD with STALE evidence fails closed", async () => {
    const f = await seedFixture();
    // Create a real older revision, then a stale evidence set pinned to it.
    // The live head stays at f.headRevisionId; the set is stale relative
    // to the head.
    const olderRevision = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 0,
        origin: "MANUAL",
        message: "spc older",
        createdById: f.userId,
      },
    });
    const staleSet = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: olderRevision.id,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "stale set",
        conflictsJson: [
          {
            scale: "VILLAGE",
            relevance: "ACTION",
            explanation: "test",
            source: { start: 7, end: 11, quote: "test" },
          },
        ],
        actorUserId: f.userId,
      },
    });
    // The live assessor would produce INCOMPLETE (stale set, HARD blocks).
    // A retained WITHIN_REACH pinned to the stale set's revision must NOT
    // pass — even though the pins "match" the stale set.
    const crafted = makeEmptyWithinReach(f, staleSet.id);
    crafted.pins.sourceRevisionId = olderRevision.id;
    await writeReceipt(f, crafted);

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    // The gate reads live context (head = f.headRevisionId, set is stale
    // relative to head). The complete check compares against the live
    // assessment (INCOMPLETE) → mismatch → REVIEW_STALE.
    expect(result).toEqual({ ok: false, code: "REVIEW_STALE" });
  });

  it("NEGATIVE: WITHIN_REACH/empty-claims/matching-pins under HARD with MALFORMED standing fails closed", async () => {
    const f = await seedFixture();
    // Corrupt the standing (invalid scale). The live assessor would produce
    // INCOMPLETE (malformed standing, HARD blocks).
    await db.narrativePolicy.update({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
      data: { payload: { standing: { scale: "UNKNOWN", access: [], reputation: 50 } } },
    });
    // Recompute the fingerprint to match the corrupted policy so pins "match".
    const corrupted = await db.narrativePolicy.findUniqueOrThrow({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    const corruptedFingerprint = fingerprintScalePolicy({
      id: corrupted.id,
      kind: corrupted.kind,
      hardness: corrupted.hardness,
      hardReason: corrupted.hardReason,
      payload: corrupted.payload,
    });
    const crafted = makeEmptyWithinReach(f, null);
    crafted.pins.policyFingerprint = corruptedFingerprint;
    await writeReceipt(f, crafted);

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    expect(result).toEqual({ ok: false, code: "REVIEW_STALE" });
  });

  it("NEGATIVE: inconsistent exception/claim coverage fails closed", async () => {
    const f = await seedFixture();
    // Create a fresh evidence set with a real claim.
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "real claim",
        conflictsJson: [
          {
            scale: "PERSONAL",
            relevance: "ACTION",
            explanation: "a personal-scale action",
            source: { start: 7, end: 11, quote: "test" },
          },
        ],
        actorUserId: f.userId,
      },
    });
    // Craft an EXCEPTED protocol claiming the claim is covered, but NO
    // exception outcome exists. The live assessor (no exception) would
    // produce WITHIN_REACH or VIOLATION depending on reach — never
    // EXCEPTED with coveredByException=true and no applicable outcome.
    const crafted: ScaleReviewProtocol = {
      protocol: 1,
      state: "EXCEPTED",
      blocking: false,
      pins: {
        chapterVersionId: f.chapterVersionId,
        branchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        evidenceSetId: set.id,
        policyFingerprint: f.policyFingerprint,
        exceptionOutcomeId: null,
      },
      claims: [
        {
          index: 0,
          scale: "PERSONAL",
          reach: "PERSONAL",
          gap: "0",
          ok: true,
          span: { start: 7, end: 11 },
          quote: "test",
          coveredByException: true,
        },
      ],
      missingData: [],
    };
    await writeReceipt(f, crafted);

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("POSITIVE: genuine WITHIN_REACH with real claims passes", async () => {
    const f = await seedFixture();
    // Create a fresh evidence set with a claim that is genuinely within
    // reach (VILLAGE claim vs VILLAGE standing).
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "within reach",
        conflictsJson: [
          {
            scale: "VILLAGE",
            relevance: "ACTION",
            explanation: "village action",
            source: { start: 7, end: 11, quote: "test" },
          },
        ],
        actorUserId: f.userId,
      },
    });
    // Build the genuine expected protocol using the real assessor, then
    // write it as the receipt. The gate must accept it.
    const assessed = assessScaleDeterministic({
      context: {
        chapterVersion: { id: f.chapterVersionId, content: f.versionContent },
        currentVersionId: f.chapterVersionId,
        branch: { id: f.branchId, headRevisionId: f.headRevisionId },
        headRevisionId: f.headRevisionId,
        latestSet: {
          id: set.id,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          chapterVersionId: f.chapterVersionId,
          sourceBranchId: f.branchId,
          sourceRevisionId: f.headRevisionId,
          sequence: 1,
          declaration: "CONFLICTS",
          explanation: "within reach",
          conflicts: set.conflictsJson as never,
          previousSetId: null,
          actorUserId: f.userId,
          createdAt: new Date(),
        },
        policy: {
          id: "policy-id",
          kind: "SCALE",
          hardness: "HARD",
          hardReason: "spc test",
          payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
        },
        policyFingerprint: f.policyFingerprint,
      },
      claims: [{ index: 0, scale: "VILLAGE", span: { start: 7, end: 11 }, quote: "test" }],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(assessed.state).toBe("WITHIN_REACH");
    const genuine: ScaleReviewProtocol = {
      ...assessed,
      pins: { ...assessed.pins, exceptionOutcomeId: null },
    };
    await writeReceipt(f, genuine);

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    expect(result).toEqual({ ok: true });
  });
});
