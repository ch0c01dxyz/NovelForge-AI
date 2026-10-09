/**
 * NF-WF-050B seventh repair — Slice 2: fresh configured-SCALE worker proofs.
 *
 * The sixth-repair worker suite (`scale-gate-fire.test.ts`) proves refusal
 * with a contradictory receipt and uses a legacy/no-SCALE success control.
 * This file adds the missing fresh configured-SCALE caller acceptance:
 *
 * - Genuine SCALE receipt (computed from live context with the shared
 *   deterministic assessor — the same producer the review writer uses)
 *   → PUBLISHED via the real `fireScheduledPublication`
 * - Contradictory retained receipt under fresh configured SCALE
 *   → refused + REVIEW_STALE + UNPUBLISHED + audit
 * - Evidence-set pin change after the receipt → refused + REVIEW_STALE
 *
 * This exercises direct `fireScheduledPublication` execution, NOT BullMQ
 * queue delivery (queue wiring is covered by `publication-jobs.test.ts`).
 * No live browser is involved.
 *
 * Dedicated scratch DB: novelforge_test_scale_gate_fire_scale.
 * Engram unavailable (GAP-021); file-based handoff only.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import { fireScheduledPublication } from "./publication-jobs.ts";
import {
  fingerprintScalePolicy,
  readScaleContext,
  resolveApplicableExceptionStrict,
  computeExpectedScaleProtocol,
} from "@novelforge/ai-services";
import type { ScaleReviewProtocol } from "@novelforge/ai-services";
import type { WorkerLogger } from "./worker.ts";

const TEST_DB = "novelforge_test_scale_gate_fire_scale";
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

let db: NovelForgeDb;

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
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.publication.deleteMany();
  await db.finalTextReview.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

function testLogger(): WorkerLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

interface Seed {
  userId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  versionId: string;
  branchId: string;
  headRevisionId: string;
}

async function seedNovel(): Promise<Seed> {
  const user = await db.user.create({
    data: { email: `fs-${Date.now()}@example.com`, passwordHash: "x", displayName: "fs" },
  });
  const ws = await db.workspace.create({
    data: { name: "fs", slug: `fs-${Date.now()}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: "N", slug: `nfs-${Date.now()}`, createdById: user.id },
  });
  const branch = await db.novelBranch.create({
    data: { workspaceId: ws.id, novelId: novel.id, name: "main" },
  });
  const rev = await db.revision.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      branchId: branch.id,
      number: 1,
      origin: "BASELINE",
      createdById: user.id,
    },
  });
  await db.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: rev.id },
  });
  await db.novel.update({
    where: { id: novel.id },
    data: { currentBranchId: branch.id },
  });
  const chapter = await db.chapter.create({
    data: { novelId: novel.id, number: 1, title: "Ch 1", createdById: user.id },
  });
  const version = await db.chapterVersion.create({
    data: {
      chapterId: chapter.id,
      number: 1,
      content: "Fire scale test prose with enough content.",
      wordCount: 7,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  return {
    userId: user.id,
    workspaceId: ws.id,
    novelId: novel.id,
    chapterId: chapter.id,
    versionId: version.id,
    branchId: branch.id,
    headRevisionId: rev.id,
  };
}

async function seedHardPolicy(seed: Seed): Promise<string> {
  await db.narrativePolicy.create({
    data: {
      novelId: seed.novelId,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "fire scale test reason",
      payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
    },
  });
  const row = await db.narrativePolicy.findUniqueOrThrow({
    where: { novelId_kind: { novelId: seed.novelId, kind: "SCALE" } },
  });
  return fingerprintScalePolicy({
    id: row.id,
    kind: row.kind,
    hardness: row.hardness,
    hardReason: row.hardReason,
    payload: row.payload,
  });
}

async function seedQuietEvidenceSet(seed: Seed): Promise<string> {
  const set = await db.scaleEvidenceSet.create({
    data: {
      workspaceId: seed.workspaceId,
      novelId: seed.novelId,
      chapterVersionId: seed.versionId,
      sourceBranchId: seed.branchId,
      sourceRevisionId: seed.headRevisionId,
      sequence: 1,
      previousSetId: null,
      declaration: "NO_OPERATIVE_CONFLICT",
      explanation: "fire scale quiet set",
      conflictsJson: [],
      actorUserId: seed.userId,
    },
  });
  return set.id;
}

/**
 * Compute the genuine SCALE protocol from live context using the same
 * shared deterministic assessor the review writer uses. This is what a
 * fresh, honest receipt looks like — not a crafted row.
 */
async function genuineScaleProtocol(seed: Seed): Promise<ScaleReviewProtocol> {
  const context = await readScaleContext(db as never, {
    workspaceId: seed.workspaceId,
    novelId: seed.novelId,
    chapterId: seed.chapterId,
    chapterVersionId: seed.versionId,
  });
  const exception = await resolveApplicableExceptionStrict(db as never, {
    novelId: seed.novelId,
    context,
  });
  return computeExpectedScaleProtocol({
    context,
    exceptionCoveredIndices: exception?.coveredIndices ?? [],
    applicableExceptionOutcomeId: exception?.outcomeId ?? null,
  });
}

async function writeReceipt(
  seed: Seed,
  scaleReview: ScaleReviewProtocol | null,
): Promise<void> {
  await db.finalTextReview.upsert({
    where: { chapterVersionId: seed.versionId },
    create: {
      workspaceId: seed.workspaceId,
      novelId: seed.novelId,
      chapterVersionId: seed.versionId,
      revisionId: seed.headRevisionId,
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

async function seedSchedule(seed: Seed): Promise<string> {
  const pub = await db.publication.create({
    data: {
      novelId: seed.novelId,
      chapterId: seed.chapterId,
      chapterVersionId: seed.versionId,
      revisionId: seed.headRevisionId,
      status: "SCHEDULED",
      scheduledFor: new Date(Date.now() - 1000),
      publishedById: seed.userId,
    },
  });
  return pub.id;
}

describe("fireScheduledPublication with fresh configured SCALE", () => {
  it("PUBLISHES with a genuine fresh SCALE receipt", async () => {
    const seed = await seedNovel();
    await seedHardPolicy(seed);
    await seedQuietEvidenceSet(seed);

    // Genuine receipt: computed from live context with the shared
    // deterministic assessor (the same producer the review writer uses).
    const genuine = await genuineScaleProtocol(seed);
    await writeReceipt(seed, genuine);
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("published");

    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("PUBLISHED");
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: seed.chapterId } });
    expect(chapter.status).toBe("PUBLISHED");
  });

  it("REFUSES a contradictory retained receipt under fresh configured SCALE", async () => {
    const seed = await seedNovel();
    const fingerprint = await seedHardPolicy(seed);
    await seedQuietEvidenceSet(seed);

    // Contradictory: WITHIN_REACH + empty claims + matching pins, but the
    // live assessor would produce NO_OPERATIVE_CONFLICT with the quiet set.
    // The retained state contradicts live semantics → refuse.
    const contradictory: ScaleReviewProtocol = {
      protocol: 1,
      state: "WITHIN_REACH",
      blocking: false,
      pins: {
        chapterVersionId: seed.versionId,
        branchId: seed.branchId,
        sourceRevisionId: seed.headRevisionId,
        evidenceSetId: (await db.scaleEvidenceSet.findFirstOrThrow()).id,
        policyFingerprint: fingerprint,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [],
    };
    await writeReceipt(seed, contradictory);
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("expected refused outcome");
    expect(outcome.code).toBe("REVIEW_STALE");

    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("UNPUBLISHED");

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: pubId, action: "publication.unpublished" },
    });
    expect((audit.payload as { reason: string }).reason).toBe("REVIEW_STALE");

    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: seed.chapterId } });
    expect(chapter.status).not.toBe("PUBLISHED");
  });

  it("REFUSES when the evidence set changes after the receipt (pin change)", async () => {
    const seed = await seedNovel();
    await seedHardPolicy(seed);
    const setId = await seedQuietEvidenceSet(seed);

    // Genuine receipt pins the first set.
    const genuine = await genuineScaleProtocol(seed);
    await writeReceipt(seed, genuine);

    // A superseding set changes the evidenceSetId pin → stale.
    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: seed.workspaceId,
        novelId: seed.novelId,
        chapterVersionId: seed.versionId,
        sourceBranchId: seed.branchId,
        sourceRevisionId: seed.headRevisionId,
        sequence: 2,
        previousSetId: setId,
        declaration: "NO_OPERATIVE_CONFLICT",
        explanation: "superseding set",
        conflictsJson: [],
        actorUserId: seed.userId,
      },
    });
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("expected refused outcome");
    expect(outcome.code).toBe("REVIEW_STALE");

    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("UNPUBLISHED");
  });

  it("REFUSES when the policy changes after the receipt (fingerprint pin change)", async () => {
    const seed = await seedNovel();
    await seedHardPolicy(seed);
    await seedQuietEvidenceSet(seed);

    // Genuine receipt pins the original fingerprint.
    const genuine = await genuineScaleProtocol(seed);
    await writeReceipt(seed, genuine);

    // Policy change → fingerprint pin stale.
    await db.narrativePolicy.update({
      where: { novelId_kind: { novelId: seed.novelId, kind: "SCALE" } },
      data: {
        hardReason: "updated reason",
        payload: { standing: { scale: "TOWN", access: ["VILLAGE", "TOWN"], reputation: 60 } },
      },
    });
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("expected refused outcome");
    expect(outcome.code).toBe("REVIEW_STALE");

    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("UNPUBLISHED");
  });
});
