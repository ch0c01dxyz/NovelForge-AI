/**
 * NF-WF-028 (GAP-101): semantic apply integration tests.
 *
 * Tests the mode-aware apply path: preview/apply agreement, merged-content
 * correctness, coupled-field refusal, stale-head regression, and
 * conservative default preservation.
 *
 * Uses a dedicated scratch database (novelforge_test_semantic_apply).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { advanceForMutation } from "./services/revisions.ts";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_semantic_apply";
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
  APP_ENCRYPTION_KEY: "unit-test-encryption-key",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

let db: NovelForgeDb;
let app: FastifyInstance;

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake", capabilities: ["chat"] }];
    },
    async generate() {
      return { content: "{}", model: "fake", inputTokens: 1, outputTokens: 1, finishReason: "stop" };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed(req) {
      return { vectors: req.input.map(() => []), model: "fake", inputTokens: req.input.length };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  } as AIGateway;
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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.restoreOperation.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.checkpoint.deleteMany();
  await db.snapshot.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.characterKnowledge.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonProposal.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.character.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.updateMany({ data: { currentBranchId: null } });
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

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

async function seedNovel(slug: string): Promise<Fixture> {
  const owner = await seedUser(`${slug}@example.com`);
  const ws = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: { cookie: owner.cookie },
    payload: { name: slug, slug },
  });
  expect(ws.statusCode, ws.body).toBe(201);
  const workspaceId = (ws.json() as { id: string }).id;

  const novel = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels`,
    headers: { cookie: owner.cookie },
    payload: { title: slug, slug },
  });
  expect(novel.statusCode, novel.body).toBe(201);
  const novelId = (novel.json() as { id: string }).id;
  return { cookie: owner.cookie, userId: owner.userId, workspaceId, novelId };
}

function novelUrl(f: Fixture, p: string): string {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${p}`;
}

async function createCanonFact(
  tx: never,
  f: Fixture,
  predicate: string,
): Promise<string> {
  const entity = await db.storyEntity.create({
    data: {
      novelId: f.novelId,
      kind: "CHARACTER",
      key: `entity-${predicate}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${predicate}-entity`,
      createdById: f.userId,
    },
  });
  const fact = await (tx as unknown as { canonFact: { create: (args: unknown) => Promise<{ id: string }> } }).canonFact.create({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      entityId: entity.id,
      predicate,
      objectText: "base-text",
      statement: "Base statement.",
      status: "ACTIVE",
      createdById: f.userId,
    },
  });
  return fact.id;
}

async function createCheckpoint(f: Fixture, label: string) {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/checkpoints"),
    headers: { cookie: f.cookie },
    payload: { label, kind: "MANUAL" },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; revisionId: string };
}

async function createBranch(f: Fixture, name: string, fromRevisionId: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/branches"),
    headers: { cookie: f.cookie },
    payload: { name, fromRevisionId },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { branchId: string }).branchId;
}

async function switchBranch(f: Fixture, branchId: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, `/branches/${branchId}/switch`),
    headers: { cookie: f.cookie },
    // Auto-checkpoint: direct test mutations bypass the API, so the branch
    // is dirty; the auto-checkpoint also leaves a snapshot at the head,
    // which the merge needs.
    payload: { autoCheckpoint: true },
  });
  expect(res.statusCode, res.body).toBe(200);
}

// ---------------------------------------------------------------------------
// S3 preview/apply agreement
// ---------------------------------------------------------------------------

describe("semantic apply — S3 preview/apply agreement", () => {
  it("semantic preview canApply:true → apply with mode:semantic succeeds, both sides preserved", async () => {
    const f = await seedNovel("sem-s3-agree");

    // Base fact on main, checkpointed.
    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "s3-fact");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [{ entityType: "CanonFact", entityId: id, operation: "CREATE" }],
      });
      return id;
    });
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    // Source (feature): change object_text only.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({
        where: { id: factId },
        data: { objectText: "source-text" },
      });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "feature-head");

    // Target (main): change statement only (disjoint field → S3).
    await switchBranch(f, mainBranch.id);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({
        where: { id: factId },
        data: { statement: "Target statement." },
      });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "main-head");

    // Conservative preview: CONFLICT (both sides changed the same entity).
    const conPreview = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(conPreview.statusCode).toBe(200);
    const conBody = conPreview.json() as { preview: { canApply: boolean; summary: { conflict: number } } };
    expect(conBody.preview.summary.conflict).toBe(1);
    expect(conBody.preview.canApply).toBe(false);

    // Semantic preview: narrowed → canApply true.
    const semPreview = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semPreview.statusCode).toBe(200);
    const semBody = semPreview.json() as {
      preview: {
        canApply: boolean;
        summary: { conflict: number; clean: number };
        changes: { kind: string; semanticRule?: string }[];
      };
    };
    expect(semBody.preview.summary.conflict).toBe(0);
    expect(semBody.preview.canApply).toBe(true);
    expect(semBody.preview.changes[0]!.semanticRule).toBe("S3");

    // Apply WITHOUT mode → 409 (conservative default unchanged).
    const conApply = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(conApply.statusCode).toBe(409);
    expect((conApply.json() as { error: string }).error).toBe("MERGE_CONFLICTS");

    // Apply WITH mode:semantic → 200, both sides' edits preserved.
    const semApply = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semApply.statusCode, semApply.body).toBe(200);

    const mergedFact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(mergedFact.objectText).toBe("source-text"); // source's field
    expect(mergedFact.statement).toBe("Target statement."); // target's field
  });
});

// ---------------------------------------------------------------------------
// S1 preview/apply agreement
// ---------------------------------------------------------------------------

describe("semantic apply — S1 preview/apply agreement", () => {
  it("identical change on both sides → semantic apply succeeds", async () => {
    const f = await seedNovel("sem-s1-agree");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "s1-fact");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [{ entityType: "CanonFact", entityId: id, operation: "CREATE" }],
      });
      return id;
    });
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    // Both sides make the IDENTICAL change.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "same-change" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "feature-head");

    await switchBranch(f, mainBranch.id);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "same-change" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "main-head");

    const semPreview = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semPreview.statusCode).toBe(200);
    const semBody = semPreview.json() as {
      preview: { canApply: boolean; changes: { semanticRule?: string }[] };
    };
    expect(semBody.preview.canApply).toBe(true);
    expect(semBody.preview.changes[0]!.semanticRule).toBe("S1");

    const semApply = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semApply.statusCode, semApply.body).toBe(200);

    const mergedFact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(mergedFact.objectText).toBe("same-change");
  });
});

// ---------------------------------------------------------------------------
// True-conflict refusal (stays CONFLICT in semantic mode)
// ---------------------------------------------------------------------------

describe("semantic apply — true conflict refusal", () => {
  it("overlapping edits stay CONFLICT; semantic apply → 409 MERGE_CONFLICTS", async () => {
    const f = await seedNovel("sem-conflict-refuse");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "conflict-fact");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [{ entityType: "CanonFact", entityId: id, operation: "CREATE" }],
      });
      return id;
    });
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    // Source: change object_text to X.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "source-wins" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "feature-head");

    // Target: change object_text to Y (same field, different value).
    await switchBranch(f, mainBranch.id);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "target-wins" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "main-head");

    // Semantic preview keeps it CONFLICT (no rule proves it safe).
    const semPreview = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semPreview.statusCode).toBe(200);
    const semBody = semPreview.json() as {
      preview: { canApply: boolean; summary: { conflict: number } };
    };
    expect(semBody.preview.summary.conflict).toBe(1);
    expect(semBody.preview.canApply).toBe(false);

    // Semantic apply → 409 MERGE_CONFLICTS (never silently cleared).
    const semApply = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic" },
    });
    expect(semApply.statusCode).toBe(409);
    expect((semApply.json() as { error: string }).error).toBe("MERGE_CONFLICTS");

    // Target's value is untouched (no partial write).
    const fact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(fact.objectText).toBe("target-wins");
  });
});

// ---------------------------------------------------------------------------
// Stale-head regression (020C behavior preserved)
// ---------------------------------------------------------------------------

describe("semantic apply — stale-head regression", () => {
  it("apply with stale expectedHeadRevisionId → 409", async () => {
    const f = await seedNovel("sem-stale-head");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "stale-fact");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [{ entityType: "CanonFact", entityId: id, operation: "CREATE" }],
      });
      return id;
    });
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    // Source: disjoint-field change (S3-eligible).
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "source-text" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "UPDATE" }],
      });
    });
    await createCheckpoint(f, "feature-head");

    // Target: no changes (clean merge), checkpoint for snapshot.
    await switchBranch(f, mainBranch.id);
    const staleHead = mainBranch.headRevisionId;
    await createCheckpoint(f, "main-head");

    // Move the target head forward (another commit).
    await db.$transaction(async (tx) => {
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "noop",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: [],
        items: [],
      });
    });

    // Apply with the STALE head → typed 409 (CAS).
    const staleApply = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: { mode: "semantic", expectedHeadRevisionId: staleHead },
    });
    expect(staleApply.statusCode).toBe(409);
  });
});
