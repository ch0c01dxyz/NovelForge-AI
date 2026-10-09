/**
 * NF-WF-050B fifth repair — retained SCALE state vs live-context semantics.
 *
 * GAP-119 (fourth repair re-review, finding 5): `isProtocolLiveConsistent`
 * checked only HARD INCOMPLETE/VIOLATION. A retained protocol with matching
 * pins could claim NOT_CONFIGURED while a SCALE policy is configured, or
 * NO_OPERATIVE_CONFLICT while the live evidence set declares CONFLICTS —
 * and still pass the shared API/worker gate (`checkFinalTextReviewGate`).
 * Internal schema validity is insufficient; the retained STATE must be
 * validated against actual live policy/evidence semantics before trusting
 * the proof.
 *
 * These are DB-backed negative tests exercising the SHARED gate (the same
 * function the API `assertPublishReviewGate` and the publication worker
 * fire-time check call). Validators are not weakened: the crafted receipts
 * are fully schema-valid with verbatim-matching pins; only the retained
 * STATE contradicts live semantics.
 *
 * Real DB-backed tests on a dedicated disposable database
 * (`novelforge_test_scale_gate_semantics`) — never touches working data.
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
} from "@novelforge/ai-services";
import type { ScaleReviewProtocol } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_gate_semantics";
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
      email: `sgs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "sgs",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "sgs-ws", slug: `sgs-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "SGS Novel",
      slug: `sgs-novel-${user.id.slice(0, 8)}`,
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
      message: "sgs baseline",
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
      content: "<p>SGS test prose with enough content for evidence spans.</p>",
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
      hardReason: "sgs test",
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

function makeProtocol(
  f: Fixture,
  state: ScaleReviewProtocol["state"],
  evidenceSetId: string | null,
): ScaleReviewProtocol {
  return {
    protocol: 1,
    state,
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
  await db?.$disconnect();
});

describe("retained SCALE state vs live semantics (shared gate)", () => {
  it("NOT_CONFIGURED with matching pins but a CONFIGURED live policy fails closed", async () => {
    const f = await seedFixture();
    // Crafted receipt: fully schema-valid protocol, verbatim-matching pins,
    // but the retained STATE (NOT_CONFIGURED) contradicts the live reality
    // (a SCALE policy IS configured). The producer can never emit this
    // combination — it is stale or fabricated and must never pass.
    const protocol = makeProtocol(f, "NOT_CONFIGURED", null);
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: ["SCALE"],
        scaleReview: JSON.parse(JSON.stringify(protocol)),
      },
    });

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

  it("NO_OPERATIVE_CONFLICT with matching pins but a CONFLICTS live evidence set fails closed", async () => {
    const f = await seedFixture();
    // Live evidence set declares CONFLICTS (with a valid claim).
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "sgs conflicts declaration",
        conflictsJson: [
          {
            scale: "VILLAGE",
            relevance: "ACTION",
            explanation: "sgs claim",
            source: { start: 7, end: 11, quote: "test" },
          },
        ],
        actorUserId: f.userId,
      },
    });
    // Crafted receipt: fully schema-valid protocol, verbatim-matching pins
    // (including evidenceSetId), but the retained STATE (NO_OPERATIVE_CONFLICT)
    // contradicts the live evidence declaration (CONFLICTS). The producer can
    // never emit this combination — it must never pass.
    const protocol = makeProtocol(f, "NO_OPERATIVE_CONFLICT", set.id);
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: ["SCALE"],
        scaleReview: JSON.parse(JSON.stringify(protocol)),
      },
    });

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

  it("positive control: genuine NOT_CONFIGURED with NO live policy still passes", async () => {
    const f = await seedFixture();
    // Remove the policy so the live reality matches the retained state.
    await db.narrativePolicy.delete({
      where: { novelId_kind: { novelId: f.novelId, kind: "SCALE" } },
    });
    const absenceFingerprint = fingerprintScalePolicy(null);
    const protocol: ScaleReviewProtocol = {
      ...makeProtocol(f, "NOT_CONFIGURED", null),
      pins: {
        ...makeProtocol(f, "NOT_CONFIGURED", null).pins,
        policyFingerprint: absenceFingerprint,
      },
    };
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: [],
        scaleReview: JSON.parse(JSON.stringify(protocol)),
      },
    });

    const result = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx as never, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );

    // No SCALE rows at all → legacy compatibility path; PASS verdict passes.
    expect(result).toEqual({ ok: true });
  });

  it("positive control: genuine NO_OPERATIVE_CONFLICT with matching declaration still passes", async () => {
    const f = await seedFixture();
    // Live evidence set declares NO_OPERATIVE_CONFLICT (no claims).
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "NO_OPERATIVE_CONFLICT",
        explanation: "sgs quiet chapter",
        conflictsJson: [],
        actorUserId: f.userId,
      },
    });
    const protocol = makeProtocol(f, "NO_OPERATIVE_CONFLICT", set.id);
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: ["SCALE"],
        scaleReview: JSON.parse(JSON.stringify(protocol)),
      },
    });

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
