/**
 * NF-WF-050B eighth repair — Item 1: new no-SCALE receipts.
 *
 * A NEW review on a novel with no SCALE rows must emit a pinned
 * NOT_CONFIGURED protocol (never null). Null is reserved for genuine
 * historical (pre-050B) receipts. The gate must compare head for
 * no-SCALE receipts: a later head advance makes the old receipt
 * REVIEW_STALE.
 *
 * Through real callers (Fastify inject):
 * 1. New no-SCALE review produces a pinned NOT_CONFIGURED protocol (not null).
 * 2. A subsequent non-SCALE policy/head change makes it REVIEW_STALE.
 * 3. Genuine historical null receipts retain intended compatibility
 *    (legacy PASS at same head; REVIEW_STALE after head advance).
 *
 * Dedicated scratch DB: novelforge_test_scale_no_scale.
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
import { parseScaleReviewProtocol } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_no_scale";
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
    payload: { content: "<p>No-scale test prose with enough content.</p>", expectedVersion: null },
  });
  expect(save.statusCode, save.body).toBe(200);
  const version = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId: chapter.id },
    orderBy: { number: "desc" },
  });
  return { id: chapter.id, versionId: version.id };
}

function reviewUrl(ids: { workspaceId: string; novelId: string }, chapterId: string): string {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/final-text-review`;
}

function statusUrl(ids: { workspaceId: string; novelId: string }, chapterId: string): string {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/status`;
}

/** Advance the branch head with a non-SCALE policy (COOLDOWN). */
async function putNonScalePolicy(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
): Promise<void> {
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/narrative/policies`,
    headers: { cookie },
    payload: {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 3 },
    },
  });
  expect(res.statusCode, res.body).toBe(200);
}

async function currentHead(novelId: string): Promise<string> {
  const novel = await db.novel.findUniqueOrThrow({
    where: { id: novelId },
    select: { currentBranchId: true },
  });
  const branch = await db.novelBranch.findUniqueOrThrow({
    where: { id: novel.currentBranchId! },
    select: { headRevisionId: true },
  });
  return branch.headRevisionId!;
}

describe("new no-SCALE reviews emit pinned NOT_CONFIGURED (never null)", () => {
  it("a new no-SCALE review produces a pinned NOT_CONFIGURED protocol", async () => {
    const { cookie, userId } = await seedUser("noscale1@example.com");
    const ids = await seedNovel(userId, "noscale-1");
    const ch = await makeChapter(cookie, ids, "Ch 1");

    const res = await app.inject({
      method: "POST",
      url: reviewUrl(ids, ch.id),
      headers: { cookie },
      payload: { chapterVersionId: ch.versionId },
    });
    expect(res.statusCode, res.body).toBe(200);

    const receipt = await db.finalTextReview.findUniqueOrThrow({
      where: { chapterVersionId: ch.versionId },
    });
    // Must NOT be null: new reviews always carry a protocol.
    expect(receipt.scaleReview).not.toBeNull();
    const protocol = parseScaleReviewProtocol(receipt.scaleReview);
    expect(protocol).not.toBeNull();
    expect(protocol!.state).toBe("NOT_CONFIGURED");
    expect(protocol!.blocking).toBe(false);
    // Pins are current and explicit.
    expect(protocol!.pins.chapterVersionId).toBe(ch.versionId);
    expect(protocol!.pins.sourceRevisionId).toBe(receipt.revisionId);
    expect(protocol!.pins.sourceRevisionId).toBe(await currentHead(ids.novelId));
  });

  it("a subsequent non-SCALE head change makes the no-SCALE receipt REVIEW_STALE", async () => {
    const { cookie, userId } = await seedUser("noscale2@example.com");
    const ids = await seedNovel(userId, "noscale-2");
    const ch = await makeChapter(cookie, ids, "Ch 1");

    const review = await app.inject({
      method: "POST",
      url: reviewUrl(ids, ch.id),
      headers: { cookie },
      payload: { chapterVersionId: ch.versionId },
    });
    expect(review.statusCode, review.body).toBe(200);

    // Non-SCALE policy mutation advances the head (same chapter version).
    await putNonScalePolicy(cookie, ids);

    // The old NOT_CONFIGURED receipt pins the old head → gate refuses.
    const st = await app.inject({
      method: "PATCH",
      url: statusUrl(ids, ch.id),
      headers: { cookie },
      payload: { status: "PUBLISHED", chapterVersionId: ch.versionId },
    });
    expect(st.statusCode, st.body).toBe(409);
    expect(st.json()).toMatchObject({ error: "REVIEW_STALE" });
  });

  it("genuine historical null receipts retain compatibility at the same head", async () => {
    const { cookie, userId } = await seedUser("noscale3@example.com");
    const ids = await seedNovel(userId, "noscale-3");
    const ch = await makeChapter(cookie, ids, "Ch 1");
    const head = await currentHead(ids.novelId);

    // Simulate a genuine pre-050B receipt: null scaleReview, PASS verdict.
    await db.finalTextReview.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: ch.versionId,
        revisionId: head,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: [],
        scaleReview: undefined,
      },
    });

    // Same head, no SCALE rows → legacy PASS compatibility.
    const st = await app.inject({
      method: "PATCH",
      url: statusUrl(ids, ch.id),
      headers: { cookie },
      payload: { status: "PUBLISHED", chapterVersionId: ch.versionId },
    });
    expect(st.statusCode, st.body).toBe(200);
  });

  it("a genuine historical null receipt goes REVIEW_STALE after head advance", async () => {
    const { cookie, userId } = await seedUser("noscale4@example.com");
    const ids = await seedNovel(userId, "noscale-4");
    const ch = await makeChapter(cookie, ids, "Ch 1");
    const head = await currentHead(ids.novelId);

    await db.finalTextReview.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: ch.versionId,
        revisionId: head,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: [],
        scaleReview: undefined,
      },
    });

    // Advance the head with a non-SCALE policy mutation.
    await putNonScalePolicy(cookie, ids);

    // The historical null receipt no longer pins the head → REVIEW_STALE.
    const st = await app.inject({
      method: "PATCH",
      url: statusUrl(ids, ch.id),
      headers: { cookie },
      payload: { status: "PUBLISHED", chapterVersionId: ch.versionId },
    });
    expect(st.statusCode, st.body).toBe(409);
    expect(st.json()).toMatchObject({ error: "REVIEW_STALE" });
  });
});
