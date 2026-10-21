/**
 * NF-WF-050B sixth repair — Slice 3A: real caller acceptance proofs.
 *
 * Exercises the ACTUAL API route callers of the shared SCALE gate
 * (`checkFinalTextReviewGate` via `assertPublishReviewGate` in
 * `manuscript.ts`), not the DB-backed helper in isolation:
 *
 * - PATCH .../chapters/:chapterId/status (setStatus) with a contradictory
 *   retained SCALE receipt → 409 REVIEW_STALE (real route → real service →
 *   real gate → real completeness check)
 * - PATCH .../status with a genuine receipt from the real review route
 *   → 200 (positive control)
 * - Concurrent PATCH .../status → one 200, one clean 409 (lock/race)
 *
 * Dedicated scratch DB: novelforge_test_scale_gate_callers.
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

const TEST_DB = "novelforge_test_scale_gate_callers";
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
  await db.finalTextReview.deleteMany();
  await db.narrativePolicy.deleteMany();
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
    payload: { content: "<p>Caller test prose with enough content.</p>", expectedVersion: null },
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
      hardReason: "caller test reason",
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

function statusUrl(
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
): string {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/status`;
}

describe("SCALE gate via real setStatus route", () => {
  it("REFUSES a contradictory retained receipt: 409 REVIEW_STALE through the real route", async () => {
    const owner = await seedUser("caller1@t.io");
    const ids = await seedNovel(owner.userId, "caller-ws1");
    const chapter = await makeChapter(owner.cookie, ids, "Contradictory");
    const fingerprint = await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);

    // Crafted retained receipt: WITHIN_REACH + empty claims + matching pins,
    // but HARD policy with ABSENT evidence → the live assessor would produce
    // INCOMPLETE (blocking). The complete consistency check must refuse.
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
      method: "PATCH",
      url: statusUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("REVIEW_STALE");

    // The chapter must NOT have transitioned.
    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(row.status).toBe("DRAFT");
  });

  it("PUBLISHES with a genuine receipt from the real review route (positive control)", async () => {
    const owner = await seedUser("caller2@t.io");
    const ids = await seedNovel(owner.userId, "caller-ws2");
    const chapter = await makeChapter(owner.cookie, ids, "Genuine");

    // Real review route → real writer → real assessor → genuine receipt.
    const reviewed = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapter.id}/final-text-review`,
      headers: { cookie: owner.cookie },
      payload: { chapterVersionId: chapter.versionId },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    const res = await app.inject({
      method: "PATCH",
      url: statusUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(res.statusCode, res.body).toBe(200);

    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(row.status).toBe("PUBLISHED");
  });

  it("RACE: save (new version) vs setStatus — gate sees the locked version, never a 500", async () => {
    const owner = await seedUser("caller3@t.io");
    const ids = await seedNovel(owner.userId, "caller-ws3");
    const chapter = await makeChapter(owner.cookie, ids, "Race");

    const reviewed = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapter.id}/final-text-review`,
      headers: { cookie: owner.cookie },
      payload: { chapterVersionId: chapter.versionId },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    // Race: a save (creating version 2) against setStatus → PUBLISHED.
    // The gate reads currentVersionId INSIDE its locked tx, so whichever
    // order they commit, the result is consistent and never a 500:
    // - setStatus first: version 1 publishes; the locked save refuses immutable content.
    // - save first: gate sees version 2, receipt pins version 1 → 409 REVIEW_STALE.
    const saveReq = app.inject({
      method: "PUT",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapter.id}`,
      headers: { cookie: owner.cookie },
      payload: {
        content: "<p>Race edit creating version two.</p>",
        expectedVersion: 1,
      },
    });
    const statusReq = app.inject({
      method: "PATCH",
      url: statusUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    const [saveRes, statusRes] = await Promise.all([saveReq, statusReq]);

    // The gate must never 500 under the race; 200 or a typed 409 are both
    // consistent outcomes depending on commit order.
    expect([200, 409]).toContain(statusRes.statusCode);
    if (statusRes.statusCode === 409) {
      expect(statusRes.json().error).toBe("REVIEW_STALE");
    }

    const row = await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    const liveVersion = await db.chapterVersion.findFirstOrThrow({
      where: { chapterId: chapter.id },
      orderBy: { number: "desc" },
    });
    if (statusRes.statusCode === 200) {
      expect(saveRes.statusCode, saveRes.body).toBe(409);
      expect(saveRes.json().error).toBe("CONFLICT");
      expect(row.status).toBe("PUBLISHED");
      expect(liveVersion.number).toBe(1);
      expect(row.currentVersionId).toBe(chapter.versionId);
    } else {
      expect(saveRes.statusCode, saveRes.body).toBe(200);
      expect(liveVersion.number).toBe(2);
      // save won: version 2 is current, receipt pins version 1 → refused.
      expect(row.status).toBe("DRAFT");
      expect(row.currentVersionId).toBe(liveVersion.id);
    }
  });

  it("REFUSES setStatus to IN_REVIEW when the retained receipt contradicts live state", async () => {
    const owner = await seedUser("caller4@t.io");
    const ids = await seedNovel(owner.userId, "caller-ws4");
    const chapter = await makeChapter(owner.cookie, ids, "InReview");
    const fingerprint = await seedHardPolicy(ids.novelId);
    const head = await headRevisionId(ids.novelId);
    const branch = await branchId(ids.novelId);

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
      method: "PATCH",
      url: statusUrl(ids, chapter.id),
      headers: { cookie: owner.cookie },
      payload: { status: "IN_REVIEW" },
    });
    // DRAFT → IN_REVIEW also leaves DRAFT, so the gate applies.
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("REVIEW_STALE");
  });
});
