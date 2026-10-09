/**
 * NF-WF-050B seventh repair — Slice 2: immediate-publication caller proofs.
 *
 * Exercises the ACTUAL immediate-publication route
 * (`POST .../publication/publish` → `publishChapter` in
 * `services/publication.ts` → real `assertPublishReviewGate` → real
 * `checkFinalTextReviewGate` → real completeness check), not the
 * DB-backed helper in isolation:
 *
 * - Genuine SCALE receipt (via the real review route) → 200, PUBLISHED
 * - Contradictory retained SCALE receipt → 409 REVIEW_STALE, stays DRAFT
 * - Evidence-set pin change after receipt → 409 REVIEW_STALE
 * - Race: policy change vs immediate publish → 200 or typed 409, never 500
 *
 * Dedicated scratch DB: novelforge_test_scale_gate_publish.
 * Engram unavailable (GAP-021); file-based handoff only.
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
import { createPlatformServices } from "@novelforge/ai-services";
import { fingerprintScalePolicy } from "@novelforge/ai-services";
import type { ScaleReviewProtocol } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_gate_publish";
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
  APP_ENCRYPTION_KEY: "test",
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
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
  app = await buildApp(env, { db });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.publication.deleteMany();
  await db.finalTextReview.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
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

async function seedNovel(ownerId: string, slug: string) {
  const ws = await db.workspace.create({
    data: { name: slug, slug, ownerId },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function makeChapter(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  title: string,
): Promise<{ id: string; versionId: string }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  expect(res.statusCode, res.body).toBe(201);
  const chapter = res.json() as { id: string };
  const save = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapter.id}`,
    headers: { cookie },
    payload: { content: "<p>Publish test prose with enough content.</p>", expectedVersion: null },
  });
  expect(save.statusCode, save.body).toBe(200);
  const version = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId: chapter.id },
    orderBy: { number: "desc" },
  });
  return { id: chapter.id, versionId: version.id };
}

/** Seed a HARD SCALE policy and return its live fingerprint. */
async function seedHardPolicy(novelId: string): Promise<string> {
  await db.narrativePolicy.create({
    data: {
      novelId,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "publish test reason",
      payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
    },
  });
  const row = await db.narrativePolicy.findUniqueOrThrow({
    where: { novelId_kind: { novelId, kind: "SCALE" } },
  });
  return fingerprintScalePolicy({
    id: row.id,
    kind: row.kind,
    hardness: row.hardness,
    hardReason: row.hardReason,
    payload: row.payload,
  });
}

/**
 * Seed a NO_OPERATIVE_CONFLICT evidence set for the chapter version, so the
 * live deterministic assessor produces a non-blocking state (gate passes).
 * The quote/span must validate against the fixture content
 * "<p>Publish test prose with enough content.</p>".
 */
async function seedQuietEvidenceSet(
  ids: { workspaceId: string; novelId: string },
  chapter: { id: string; versionId: string },
  branchId: string,
  headRevisionId: string,
): Promise<string> {
  const set = await db.scaleEvidenceSet.create({
    data: {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: chapter.versionId,
      sourceBranchId: branchId,
      sourceRevisionId: headRevisionId,
      sequence: 1,
      previousSetId: null,
      declaration: "NO_OPERATIVE_CONFLICT",
      explanation: "publish test quiet set",
      conflictsJson: [],
      actorUserId: (await db.user.findFirstOrThrow()).id,
    },
  });
  return set.id;
}

/** Write a crafted retained receipt directly (simulates a stale/crafted row). */
async function writeReceipt(
  ids: { workspaceId: string; novelId: string },
  chapter: { id: string; versionId: string },
  headRevisionId: string,
  scaleReview: ScaleReviewProtocol | null,
): Promise<void> {
  await db.finalTextReview.upsert({
    where: { chapterVersionId: chapter.versionId },
    create: {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: chapter.versionId,
      revisionId: headRevisionId,
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

async function headRevisionId(novelId: string): Promise<string> {
  const novel = await db.novel.findUniqueOrThrow({
    where: { id: novelId },
    select: { currentBranchId: true },
  });
  const branch = await db.novelBranch.findUniqueOrThrow({
    where: { id: novel.currentBranchId! },
    select: { id: true, headRevisionId: true },
  });
  return branch.headRevisionId!;
}

async function branchId(novelId: string): Promise<string> {
  const novel = await db.novel.findUniqueOrThrow({
    where: { id: novelId },
    select: { currentBranchId: true },
  });
  return novel.currentBranchId!;
}

function publishUrl(
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
): string {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/publication/publish`;
}

function reviewUrl(
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
): string {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/final-text-review`;
}

describe("immediate publication via real publish route", () => {
  it("PUBLISHES with a genuine SCALE receipt from the real review route", async () => {
    const owner = await seedUser("pub1@t.io");
    const ids = await seedNovel(owner.userId, "pub-ws1");
    const chapter = await makeChapter(owner.cookie, ids, "Genuine");
    await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);
    await seedQuietEvidenceSet(ids, chapter, branch, head);

    // Real review route → real writer → real assessor → genuine receipt.
    const reviewed = await app.inject({
      method: "POST",
      url: reviewUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { chapterVersionId: chapter.versionId },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    const res = await app.inject({
      method: "POST",
      url: publishUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { publicationId: string; pinnedVersionId: string };
    expect(body.publicationId).toBeTruthy();
    expect(body.pinnedVersionId).toBe(chapter.versionId);

    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(row.status).toBe("PUBLISHED");
    const pub = await db.publication.findUniqueOrThrow({ where: { id: body.publicationId } });
    expect(pub.status).toBe("PUBLISHED");
    expect(pub.chapterVersionId).toBe(chapter.versionId);
  });

  it("REFUSES immediate publish with a contradictory retained receipt", async () => {
    const owner = await seedUser("pub2@t.io");
    const ids = await seedNovel(owner.userId, "pub-ws2");
    const chapter = await makeChapter(owner.cookie, ids, "Contradictory");
    const fingerprint = await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);

    // Crafted retained receipt: WITHIN_REACH + empty claims + matching pins,
    // but HARD policy with ABSENT evidence → live assessor would produce
    // INCOMPLETE (blocking). The immediate route must refuse.
    const contradictory: ScaleReviewProtocol = {
      protocol: 1,
      state: "WITHIN_REACH",
      blocking: false,
      pins: {
        chapterVersionId: chapter.versionId,
        branchId: branch,
        sourceRevisionId: head,
        evidenceSetId: null,
        policyFingerprint: fingerprint,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [],
    };
    await writeReceipt(ids, chapter, head, contradictory);

    const res = await app.inject({
      method: "POST",
      url: publishUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("REVIEW_STALE");

    // The chapter must NOT have transitioned; no publication row created.
    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(row.status).toBe("DRAFT");
    const pub = await db.publication.findUnique({ where: { chapterId: chapter.id } });
    expect(pub).toBeNull();
  });

  it("REFUSES when the evidence set changes after the receipt (pin change)", async () => {
    const owner = await seedUser("pub3@t.io");
    const ids = await seedNovel(owner.userId, "pub-ws3");
    const chapter = await makeChapter(owner.cookie, ids, "PinChange");
    await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);
    const setId = await seedQuietEvidenceSet(ids, chapter, branch, head);

    // Genuine receipt via the real review route (pins the first set).
    const reviewed = await app.inject({
      method: "POST",
      url: reviewUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { chapterVersionId: chapter.versionId },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    // A new evidence set supersedes the pinned one → evidenceSetId pin stale.
    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: chapter.versionId,
        sourceBranchId: branch,
        sourceRevisionId: head,
        sequence: 2,
        previousSetId: setId,
        declaration: "NO_OPERATIVE_CONFLICT",
        explanation: "superseding set",
        conflictsJson: [],
        actorUserId: owner.userId,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: publishUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("REVIEW_STALE");

    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(row.status).toBe("DRAFT");
  });

  it("RACE: policy change vs immediate publish — consistent outcome, never 500", async () => {
    const owner = await seedUser("pub4@t.io");
    const ids = await seedNovel(owner.userId, "pub-ws4");
    const chapter = await makeChapter(owner.cookie, ids, "Race");
    await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);
    await seedQuietEvidenceSet(ids, chapter, branch, head);

    const reviewed = await app.inject({
      method: "POST",
      url: reviewUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { chapterVersionId: chapter.versionId },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    // Race: a direct SCALE policy change (new fingerprint) against the
    // immediate publish. The gate reads the policy inside its locked tx,
    // so the outcome is consistent: 200 (publish won) or typed 409
    // (policy change won → fingerprint pin stale). Never a 500.
    const policyReq = db.narrativePolicy.update({
      where: { novelId_kind: { novelId: ids.novelId, kind: "SCALE" } },
      data: {
        hardReason: "race-updated reason",
        payload: { standing: { scale: "TOWN", access: ["VILLAGE", "TOWN"], reputation: 60 } },
      },
    });
    const publishReq = app.inject({
      method: "POST",
      url: publishUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
    });
    const [, publishRes] = await Promise.all([policyReq, publishReq]);

    expect([200, 409]).toContain(publishRes.statusCode);
    if (publishRes.statusCode === 409) {
      expect(publishRes.json().error).toBe("REVIEW_STALE");
    }

    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    if (publishRes.statusCode === 200) {
      expect(row.status).toBe("PUBLISHED");
    } else {
      expect(row.status).toBe("DRAFT");
    }
  });
});
