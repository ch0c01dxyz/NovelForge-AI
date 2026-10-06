/**
 * NF-WF-020C: conservative merge + bulk recovery integration suite.
 *
 * Dedicated `novelforge_test_merge` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database (which includes 020B's branch migration — 020C builds on its
 * pinned shapes).
 *
 * What this suite pins:
 *  - **Taxonomy** — forced divergence yields ≥1 CONFLICT (same fact changed
 *    both sides), ≥1 CLEAN (changed one side), ≥1 ORPHAN_RISK (clean change
 *    whose dependent diverged on the other side); each conflict carries both
 *    versions + base.
 *  - **Apply-on-clean** — one new MERGE revision on the target, merged
 *    entities match the source, the change set records the merge, rebuild
 *    intents are written, `Novel.currentBranchId` is the target.
 *  - **409-on-conflict** — MERGE_CONFLICTS with the preview as evidence,
 *    zero writes (no revision, no moved head, no state change).
 *  - **Bulk rollback** — a PRE_MUTATION checkpoint rewinds covered state in
 *    one action; non-pre-operation kinds and wrong-branch checkpoints are
 *    refused.
 *  - **Negatives** — merge into a non-checked-out branch, a dirty target, a
 *    moved head, and unauthorized roles are all refused; preview is
 *    read-only.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
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
import { advanceForMutation } from "./services/revisions.ts";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_merge";
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
  // Dependents before their referenced rows (Restrict FKs): knowledge ->
  // facts, fact sources -> facts, proposals -> facts/entities.
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
    payload: { title: `Novel ${slug}`, slug },
  });
  expect(novel.statusCode, novel.body).toBe(201);
  return {
    cookie: owner.cookie,
    userId: owner.userId,
    workspaceId,
    novelId: (novel.json() as { id: string }).id,
  };
}

function novelUrl(f: Fixture, suffix: string): string {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${suffix}`;
}

async function createCheckpoint(
  f: Fixture,
  label: string,
  kind = "MANUAL",
): Promise<{ checkpointId: string; revisionId: string }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/checkpoints"),
    headers: { cookie: f.cookie },
    payload: { label, kind },
  });
  expect(res.statusCode, res.body).toBe(201);
  const json = res.json() as { checkpointId: string; revisionId: string };
  return { checkpointId: json.checkpointId, revisionId: json.revisionId };
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

async function createCanonFact(
  tx: { canonFact: { create: (args: never) => Promise<{ id: string }> } },
  f: Fixture,
  predicate: string,
): Promise<string> {
  const entity = await db.storyEntity.create({
    data: {
      novelId: f.novelId,
      kind: "CHARACTER",
      key: `entity-${predicate}-${Date.now()}`,
      name: `entity-${predicate}`,
      createdById: f.userId,
    },
  });
  const fact = await (tx.canonFact.create as (args: unknown) => Promise<{ id: string }>)({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      entityId: entity.id,
      predicate,
      objectText: "true",
      statement: `${predicate} is true`,
      status: "ACTIVE",
      createdById: f.userId,
    },
  });
  return fact.id;
}

// ---------------------------------------------------------------------------
// Merge preview taxonomy
// ---------------------------------------------------------------------------

describe("merge preview taxonomy", () => {
  it("classifies forced divergence: CONFLICT + CLEAN + ORPHAN_RISK, with both versions + base on conflicts", async () => {
    const f = await seedNovel("merge-taxonomy");

    // Baseline on main: two facts (R2), checkpointed (snapshot at R2).
    // - hair-colour: will be changed on BOTH sides → CONFLICT.
    // - fact-a: will be changed on feature, with a dependent diverging on
    //   main → ORPHAN_RISK.
    const { factId, factA } = await db.$transaction(async (tx) => {
      const hairColour = await createCanonFact(tx as never, f, "hair-colour");
      const factAId = await createCanonFact(tx as never, f, "fact-a");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [
          { entityType: "CanonFact", entityId: hairColour, operation: "CREATE" },
          { entityType: "CanonFact", entityId: factAId, operation: "CREATE" },
        ],
      });
      return { factId: hairColour, factA: factAId };
    });
    const base = await createCheckpoint(f, "base");
    const baseRevisionId = base.revisionId;

    // Fork feature from the base.
    const featureId = await createBranch(f, "feature", baseRevisionId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    // Source side (feature): change hair-colour → "blue", change fact-a.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "blue" } });
      await tx.canonFact.update({ where: { id: factA }, data: { objectText: "changed-on-feature" } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [
          { entityType: "CanonFact", entityId: factId, operation: "UPDATE" },
          { entityType: "CanonFact", entityId: factA, operation: "UPDATE" },
        ],
      });
    });
    await createCheckpoint(f, "feature-head");

    // Target side (main): change hair-colour → "red" (CONFLICT), create a
    // main-only fact (CLEAN), add knowledge → fact-a (ORPHAN_RISK trigger).
    await switchBranch(f, mainBranch.id);
    const mainOnlyFactId = await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "red" } });
      const eyeColour = await createCanonFact(tx as never, f, "eye-colour");
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts", "story_entities"],
        items: [
          { entityType: "CanonFact", entityId: factId, operation: "UPDATE" },
          { entityType: "CanonFact", entityId: eyeColour, operation: "CREATE" },
        ],
      });
      return eyeColour;
    });
    const character = await db.character.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        key: `knower-${Date.now()}`,
        name: "knower",
        createdById: f.userId,
      },
    });
    await db.$transaction(async (tx) => {
      const knowledge = await tx.characterKnowledge.create({
        data: {
          characterId: character.id,
          factId: factA,
          stance: "KNOWN",
          source: "LEARNED_IN_WORLD",
          fromChapter: 1,
        },
      });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "knowledge.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["character_knowledge", "characters"],
        items: [{ entityType: "CharacterKnowledge", entityId: knowledge.id, operation: "CREATE" }],
      });
    });
    await createCheckpoint(f, "main-head");

    // Preview the merge (target defaults to checked-out = main).
    const previewRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(previewRes.statusCode, previewRes.body).toBe(200);
    const preview = (previewRes.json() as { preview: Record<string, unknown> }).preview as {
      changes: {
        entityType: string;
        entityId: string;
        kind: string;
        changedOn: string[];
        base?: Record<string, unknown> | null;
        sourceVersion?: Record<string, unknown> | null;
        targetVersion?: Record<string, unknown> | null;
        warning?: string;
      }[];
      summary: { clean: number; conflict: number; deletedModified: number; orphanRisk: number };
      canApply: boolean;
      snapshotsAvailable: boolean;
      baseRevisionId: string;
    };

    // Taxonomy assertions.
    expect(preview.summary.conflict).toBeGreaterThanOrEqual(1);
    expect(preview.summary.clean).toBeGreaterThanOrEqual(1);
    expect(preview.summary.orphanRisk).toBeGreaterThanOrEqual(1);
    expect(preview.canApply).toBe(false);
    expect(preview.snapshotsAvailable).toBe(true);

    // The same-fact-both-sides change is CONFLICT with both versions + base.
    const conflict = preview.changes.find(
      (c) => c.entityId === factId && c.kind === "CONFLICT",
    );
    expect(conflict, JSON.stringify(preview.changes)).toBeDefined();
    expect(conflict!.changedOn).toContain("source");
    expect(conflict!.changedOn).toContain("target");
    expect(conflict!.base).toBeDefined();
    expect(conflict!.sourceVersion).toBeDefined();
    expect(conflict!.targetVersion).toBeDefined();
    // Base had objectText "true"; source set "blue", target set "red".
    expect(conflict!.base!.object_text).toBe("true");
    expect(conflict!.sourceVersion!.object_text).toBe("blue");
    expect(conflict!.targetVersion!.object_text).toBe("red");

    // The main-only fact is CLEAN.
    const clean = preview.changes.find((c) => c.entityId === mainOnlyFactId);
    expect(clean?.kind).toBe("CLEAN");
    expect(clean?.changedOn).toEqual(["target"]);

    // factA: changed on feature, dependent (character_knowledge) diverged on
    // main → ORPHAN_RISK with a warning.
    const orphan = preview.changes.find((c) => c.entityId === factA);
    expect(orphan?.kind).toBe("ORPHAN_RISK");
    expect(orphan?.warning).toMatch(/character_knowledge/);
  });

  it("preview is read-only: no revision, no moved head, no state change", async () => {
    const f = await seedNovel("merge-preview-readonly");
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);

    const before = await db.revision.count({ where: { novelId: f.novelId } });
    const mainBefore = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
      select: { headRevisionId: true },
    });
    const snapshotsBefore = await db.snapshot.count({ where: { novelId: f.novelId } });

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);

    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(before);
    const mainAfter = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
      select: { headRevisionId: true },
    });
    expect(mainAfter.headRevisionId).toBe(mainBefore.headRevisionId);
    expect(await db.snapshot.count({ where: { novelId: f.novelId } })).toBe(snapshotsBefore);
  });
});

// ---------------------------------------------------------------------------
// Merge apply
// ---------------------------------------------------------------------------

describe("merge apply", () => {
  it("clean merge: one MERGE revision on target, entities match source, change set + intents written, currentBranchId = target", async () => {
    const f = await seedNovel("merge-apply-clean");

    // Base fact on main.
    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "merge-me");
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

    // Feature changes the fact.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "from-feature" } });
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

    // Back on main (target), checkpoint so the target head has a snapshot.
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });
    await switchBranch(f, mainBranch.id);
    const mainHeadBefore = mainBranch.headRevisionId;
    await createCheckpoint(f, "main-head");

    const revisionCountBefore = await db.revision.count({ where: { novelId: f.novelId } });

    // Apply the merge.
    const applyRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(applyRes.statusCode, applyRes.body).toBe(200);
    const applied = applyRes.json() as {
      revisionId: string;
      revisionNumber: number;
      checkpointId: string | null;
      targetBranchId: string;
      mergedEntities: number;
    };
    expect(applied.targetBranchId).toBe(mainBranch.id);
    expect(applied.mergedEntities).toBe(1);

    // One new revision, origin MERGE, on the target branch.
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(
      revisionCountBefore + 1,
    );
    const revision = await db.revision.findUniqueOrThrow({ where: { id: applied.revisionId } });
    expect(revision.origin).toBe("MERGE");
    expect(revision.branchId).toBe(mainBranch.id);
    expect(revision.parentRevisionId).not.toBe(mainHeadBefore); // head moved past the checkpoint

    // The merged entity matches the source.
    const fact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(fact.objectText).toBe("from-feature");

    // The change set records the merge.
    const changeSet = await db.changeSet.findUniqueOrThrow({
      where: { revisionId: applied.revisionId },
      include: { items: true },
    });
    expect(changeSet.items.length).toBe(1);
    const firstItem = changeSet.items[0]!;
    expect(firstItem.entityType).toBe("CanonFact");
    expect(firstItem.entityId).toBe(factId);

    // Rebuild intents were queued for the merge revision.
    const intents = await db.derivedRebuildIntent.findMany({
      where: { sourceRevisionId: applied.revisionId },
    });
    expect(intents.length).toBeGreaterThan(0);

    // A PRE_MUTATION checkpoint was captured (Invariant 15).
    expect(applied.checkpointId).not.toBeNull();
    const checkpoint = await db.checkpoint.findUniqueOrThrow({
      where: { id: applied.checkpointId! },
    });
    expect(checkpoint.kind).toBe("PRE_MUTATION");

    // 020B tracking: the target is checked out.
    const novel = await db.novel.findUniqueOrThrow({ where: { id: f.novelId } });
    expect(novel.currentBranchId).toBe(mainBranch.id);
  });

  it("409 MERGE_CONFLICTS with evidence and zero writes on conflict", async () => {
    const f = await seedNovel("merge-apply-conflict");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "conflict-me");
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

    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "feature-value" } });
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

    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });
    await switchBranch(f, mainBranch.id);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "main-value" } });
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

    const revisionCountBefore = await db.revision.count({ where: { novelId: f.novelId } });
    const headBefore = (
      await db.novelBranch.findUniqueOrThrow({ where: { id: mainBranch.id } })
    ).headRevisionId;

    const applyRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(applyRes.statusCode, applyRes.body).toBe(409);
    const body = applyRes.json() as { error: string; evidence?: { changes: unknown[] } };
    expect(body.error).toBe("MERGE_CONFLICTS");
    expect(body.evidence).toBeDefined();
    expect(body.evidence!.changes.length).toBeGreaterThan(0);

    // Zero writes: no revision, head unmoved, state untouched.
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(revisionCountBefore);
    const headAfter = (
      await db.novelBranch.findUniqueOrThrow({ where: { id: mainBranch.id } })
    ).headRevisionId;
    expect(headAfter).toBe(headBefore);
    const fact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(fact.objectText).toBe("main-value");
  });

  it("DELETED_MODIFIED: delete-on-source + change-on-target refuses with evidence and zero writes", async () => {
    const f = await seedNovel("merge-deleted-modified");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "delete-me");
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

    // Source side (feature): DELETE the fact.
    await switchBranch(f, featureId);
    await db.$transaction(async (tx) => {
      await tx.canonFact.delete({ where: { id: factId } });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "fact.delete",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [{ entityType: "CanonFact", entityId: factId, operation: "DELETE" }],
      });
    });
    await createCheckpoint(f, "feature-head");

    // Target side (main): UPDATE the same fact.
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });
    await switchBranch(f, mainBranch.id);
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "main-value" } });
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

    // Preview classifies the change as DELETED_MODIFIED.
    const previewRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/preview`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(previewRes.statusCode, previewRes.body).toBe(200);
    const preview = (previewRes.json() as { preview: Record<string, unknown> }).preview as {
      changes: { entityType: string; entityId: string; kind: string }[];
      summary: { deletedModified: number };
      canApply: boolean;
    };
    const dm = preview.changes.find((c) => c.entityId === factId);
    expect(dm, JSON.stringify(preview.changes)).toBeDefined();
    expect(dm!.kind).toBe("DELETED_MODIFIED");
    expect(preview.summary.deletedModified).toBeGreaterThanOrEqual(1);
    expect(preview.canApply).toBe(false);

    // Apply refuses with MERGE_CONFLICTS and evidence; zero writes.
    const revisionCountBefore = await db.revision.count({ where: { novelId: f.novelId } });
    const headBefore = (
      await db.novelBranch.findUniqueOrThrow({ where: { id: mainBranch.id } })
    ).headRevisionId;
    const applyRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(applyRes.statusCode, applyRes.body).toBe(409);
    const body = applyRes.json() as { error: string; evidence?: { changes: unknown[] } };
    expect(body.error).toBe("MERGE_CONFLICTS");
    expect(body.evidence).toBeDefined();
    expect(body.evidence!.changes.length).toBeGreaterThan(0);
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(revisionCountBefore);
    const headAfter = (
      await db.novelBranch.findUniqueOrThrow({ where: { id: mainBranch.id } })
    ).headRevisionId;
    expect(headAfter).toBe(headBefore);
    // Target state untouched: the fact still exists on main with its value.
    const fact = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(fact.objectText).toBe("main-value");
  });

  it("409 when the target branch is not checked out", async () => {
    const f = await seedNovel("merge-not-on-target");
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    const otherId = await createBranch(f, "other", base.revisionId);

    // Checked out on "other", but merging into "main".
    await switchBranch(f, otherId);
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      payload: { targetBranchId: mainBranch.id },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect((res.json() as { error: string }).error).toBe("NOT_ON_TARGET_BRANCH");
  });

  it("409 when the target head moved (expectedHeadRevisionId)", async () => {
    const f = await seedNovel("merge-moved-head");
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);
    await createCheckpoint(f, "main-head");

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: f.cookie },
      // A bogus expected head: the CAS must refuse.
      payload: { expectedHeadRevisionId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(res.statusCode, res.body).toBe(409);
  });

  it("403 for a viewer (revision:manage required)", async () => {
    const f = await seedNovel("merge-forbidden");
    const viewer = await seedUser("viewer@merge-forbidden.example.com");
    await db.membership.create({
      data: { workspaceId: f.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/branches/${featureId}/merge/apply`),
      headers: { cookie: viewer.cookie },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Bulk rollback
// ---------------------------------------------------------------------------

describe("bulk rollback", () => {
  it("one action rewinds covered state to a PRE_MUTATION checkpoint", async () => {
    const f = await seedNovel("rollback-basic");

    const factId = await db.$transaction(async (tx) => {
      const id = await createCanonFact(tx as never, f, "rollback-me");
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

    // A HIGH operation captures a PRE_MUTATION checkpoint automatically.
    // Simulate a bulk operation: change the fact, which takes a
    // PRE_MUTATION checkpoint via advanceForMutation with a HIGH op.
    const preOp = await db.$transaction(async (tx) => {
      const advanced = await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "ai.bulkRewrite",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [],
      });
      await tx.canonFact.update({ where: { id: factId }, data: { objectText: "bulk-changed" } });
      return advanced;
    });
    expect(preOp.checkpointId).not.toBeNull();

    // The bulk change is live.
    expect(
      (await db.canonFact.findUniqueOrThrow({ where: { id: factId } })).objectText,
    ).toBe("bulk-changed");

    // One-action rollback.
    const rollbackRes = await app.inject({
      method: "POST",
      url: novelUrl(f, `/checkpoints/${preOp.checkpointId!}/rollback`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(rollbackRes.statusCode, rollbackRes.body).toBe(200);
    const rolled = rollbackRes.json() as {
      revisionId: string;
      revisionNumber: number;
      preview: { counts: Record<string, { added: number; removed: number }> };
    };
    expect(rolled.revisionId).toBeDefined();

    // The fact is rewound; history was not rewritten (a new revision exists).
    expect(
      (await db.canonFact.findUniqueOrThrow({ where: { id: factId } })).objectText,
    ).toBe("true");
    const revision = await db.revision.findUniqueOrThrow({ where: { id: rolled.revisionId } });
    expect(revision.origin).toBe("RESTORE");
  });

  it("refuses a checkpoint that is not a pre-operation checkpoint", async () => {
    const f = await seedNovel("rollback-wrong-kind");
    const manual = await createCheckpoint(f, "manual", "MANUAL");

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/checkpoints/${manual.checkpointId}/rollback`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_CHECKPOINT_KIND");
  });

  it("refuses a checkpoint on a branch that is not checked out", async () => {
    const f = await seedNovel("rollback-wrong-branch");
    const base = await createCheckpoint(f, "base");
    const featureId = await createBranch(f, "feature", base.revisionId);

    await switchBranch(f, featureId);
    // A HIGH op on feature captures a PRE_MUTATION checkpoint on feature.
    const preOp = await db.$transaction(async (tx) =>
      advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "feature",
        operation: "ai.bulkRewrite",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [],
      }),
    );

    // Back on main: the feature checkpoint is not on the checked-out branch.
    const mainBranch = await db.novelBranch.findUniqueOrThrow({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
    });
    await switchBranch(f, mainBranch.id);

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, `/checkpoints/${preOp.checkpointId!}/rollback`),
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(409);
    expect((res.json() as { error: string }).error).toBe("NOT_ON_CHECKED_OUT_BRANCH");
  });

  it("lists only recoverable checkpoints", async () => {
    const f = await seedNovel("rollback-list");
    await createCheckpoint(f, "manual", "MANUAL");
    await db.$transaction(async (tx) =>
      advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "ai.bulkRewrite",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [],
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: novelUrl(f, "/recoverable-checkpoints"),
      headers: { cookie: f.cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    const list = (res.json() as { checkpoints: { kind: string }[] }).checkpoints;
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const c of list) {
      expect(["PRE_MUTATION", "PRE_IMPORT", "PRE_GENERATION"]).toContain(c.kind);
    }
  });
});
