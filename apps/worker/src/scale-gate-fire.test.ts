/**
 * NF-WF-050B sixth repair — Slice 3A: real worker caller acceptance proofs.
 *
 * Exercises the ACTUAL scheduled-worker caller of the shared SCALE gate
 * (`fireScheduledPublication` in `publication-jobs.ts` → real
 * `checkFinalTextReviewGate`), not the DB-backed helper in isolation:
 *
 * - Contradictory retained SCALE receipt (WITHIN_REACH + empty claims +
 *   matching pins under HARD + absent evidence) → refused + REVIEW_STALE +
 *   UNPUBLISHED (deterministic, audit-logged)
 * - Genuine legacy PASS receipt with no SCALE rows → published (legacy
 *   compatibility preserved)
 * - No receipt at fire time → refused + REVIEW_STALE (existing behavior,
 *   re-verified against the new gate)
 *
 * Dedicated scratch DB: novelforge_test_scale_gate_fire.
 * Engram unavailable (GAP-021); file-based handoff only.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import { fireScheduledPublication } from "./publication-jobs.ts";
import { fingerprintScalePolicy } from "@novelforge/ai-services";
import type { ScaleReviewProtocol } from "@novelforge/ai-services";
import type { WorkerLogger } from "./worker.ts";

const TEST_DB = "novelforge_test_scale_gate_fire";
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
    data: { email: `f-${Date.now()}@example.com`, passwordHash: "x", displayName: "f" },
  });
  const ws = await db.workspace.create({
    data: { name: "f", slug: `f-${Date.now()}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: "N", slug: `n-${Date.now()}`, createdById: user.id },
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
      content: "Fire test prose with enough content.",
      wordCount: 6,
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
      hardReason: "fire test reason",
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

describe("fireScheduledPublication with SCALE gate", () => {
  it("REFUSES a contradictory retained receipt: refused + REVIEW_STALE + UNPUBLISHED", async () => {
    const seed = await seedNovel();
    const fingerprint = await seedHardPolicy(seed);

    // Crafted retained receipt: WITHIN_REACH + empty claims + matching pins,
    // but HARD policy with ABSENT evidence → live assessor would produce
    // INCOMPLETE (blocking). The real worker must refuse deterministically.
    const contradictory: ScaleReviewProtocol = {
      protocol: 1,
      state: "WITHIN_REACH",
      blocking: false,
      pins: {
        chapterVersionId: seed.versionId,
        branchId: seed.branchId,
        sourceRevisionId: seed.headRevisionId,
        evidenceSetId: null,
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

    // Deterministic refusal is audit-logged.
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: pubId, action: "publication.unpublished" },
    });
    expect((audit.payload as { reason: string }).reason).toBe("REVIEW_STALE");

    // The chapter must NOT have been published.
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: seed.chapterId } });
    expect(chapter.status).not.toBe("PUBLISHED");
  });

  it("PUBLISHES with a genuine legacy PASS receipt and no SCALE rows (legacy compatibility)", async () => {
    const seed = await seedNovel();
    // No SCALE policy, no evidence set → legacy path. Null scaleReview with
    // no SCALE rows preserves non-SCALE PASS compatibility.
    await writeReceipt(seed, null);
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("published");

    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("PUBLISHED");
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: seed.chapterId } });
    expect(chapter.status).toBe("PUBLISHED");
  });

  it("REFUSES when the fire-time version has no receipt (existing behavior, re-verified)", async () => {
    const seed = await seedNovel();
    const pubId = await seedSchedule(seed);

    const outcome = await fireScheduledPublication(db, pubId, { logger: testLogger() });

    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("expected refused outcome");
    expect(outcome.code).toBe("REVIEW_STALE");
    const row = await db.publication.findUniqueOrThrow({ where: { id: pubId } });
    expect(row.status).toBe("UNPUBLISHED");
  });
});
