import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import pg from "pg";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createAuthService, generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createCharacterServices } from "../../../packages/ai-services/src/characters.ts";
import { createPlatformServices } from "../../../packages/ai-services/src/platform.ts";
import { createAuditService } from "../../../packages/ai-services/src/audit.ts";
import { createCanonServices } from "../../../packages/ai-services/src/canon.ts";
import type { RetrievalServices } from "../../../packages/ai-services/src/retrieval.ts";
import { registerCharacterRoutes } from "./character-routes.ts";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { createStoryHealthServices } from "./services/story-health.ts";
import { createRevisionServices } from "./services/revisions.ts";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DB_ROOT = path.join(ROOT, "packages/database");
const TEST_DB = `novelforge_test_character_identity_${process.pid}`;
const base = new URL(resolveTestDatabaseUrl({ envPath: path.join(ROOT, ".env") }));
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
base.pathname = `/${TEST_DB}`;
const TEST_URL = base.toString();
let created = false;
let db: NovelForgeDb;
let app: FastifyInstance;
let services: ReturnType<typeof createCharacterServices>;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE ${TEST_DB}`); created = true; }
  finally { await admin.end(); }
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: DB_ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: "pipe",
  });
  db = createDb(TEST_URL);
  services = createCharacterServices({ db, audit: createAuditService(db) });
  app = Fastify(); await app.register(cookie);
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { code?: string }).code;
    return reply.code(code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 500).send({ error: code ?? "INTERNAL_ERROR" });
  });
  registerCharacterRoutes(app, {
    auth: createAuthService({ users: prismaUserStore(db), sessions: prismaSessionStore(db) }), services,
  });
});
afterAll(async () => {
  await app?.close(); await db?.$disconnect();
  if (created) {
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try { await admin.query(`DROP DATABASE ${TEST_DB}`); }
    finally { await admin.end(); }
  }
});

async function seed() {
  const unique = randomUUID();
  const user = await db.user.create({ data: { email: `${unique}@identity.test`, passwordHash: "fixture-not-a-login", displayName: "Identity fixture author" } });
  const workspace = await db.workspace.create({ data: { name: "Identity fixture", slug: unique, ownerId: user.id } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  const scope = { actorUserId: user.id, workspaceId: workspace.id, novelId: "" };
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ ...scope, title: "Identity fixture novel", slug: unique });
  scope.novelId = novel.id;
  const entity = await db.storyEntity.create({ data: { novelId: novel.id, kind: "CHARACTER", key: "entity-person", name: "Same name", createdById: user.id } });
  const character = await services.createCharacter({ ...scope, key: "character-person", name: "Same name", summary: null });
  const token = generateSessionToken();
  await db.session.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  const route = `/api/workspaces/${workspace.id}/novels/${novel.id}/characters/${character.id}`;
  const options = await services.getIdentityOptions({ ...scope, characterId: character.id, take: 50, skip: 0 });
  const input = { storyEntityId: entity.id, expectedBranchId: options.branchId, expectedHeadRevisionId: options.headRevisionId };
  return { ...scope, characterId: character.id, entityId: entity.id, route, cookie: `nf_session=${token}`, input };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
const link = async (f: Fixture, input: Record<string, unknown> = f.input, requestCookie = f.cookie) => app.inject({ method: "PUT", url: `${f.route}/story-entity`, headers: { cookie: requestCookie }, payload: input });
async function counts(novelId: string) {
  return {
    revisions: await db.revision.count({ where: { novelId } }), checkpoints: await db.checkpoint.count({ where: { novelId } }),
    changes: await db.changeSet.count({ where: { novelId } }), snapshots: await db.snapshot.count({ where: { novelId } }),
    intents: await db.derivedRebuildIntent.count({ where: { novelId } }),
    audits: await db.auditLog.count({ where: { action: "character.identity-linked", payload: { path: ["novelId"], equals: novelId } } }),
  };
}

describe("explicit character identity boundary", () => {
  it("lists only unclaimed same-novel CHARACTER choices with bounded searchable stable pagination; GET never links", async () => {
    const f = await seed();
    await db.storyEntity.create({ data: { novelId: f.novelId, kind: "LOCATION", key: "wrong-kind", name: "Same name", createdById: f.actorUserId } });
    const claimed = await db.storyEntity.create({ data: { novelId: f.novelId, kind: "CHARACTER", key: "claimed", name: "Same name", createdById: f.actorUserId } });
    await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "claimed-person", name: "Claimed person", storyEntityId: claimed.id, createdById: f.actorUserId } });
    await db.storyEntity.create({ data: { novelId: f.novelId, kind: "CHARACTER", key: "second-free", name: "Zeta", createdById: f.actorUserId } });
    const before = await counts(f.novelId);
    const first = await app.inject({ method: "GET", url: `${f.route}/identity-options?take=1`, headers: { cookie: f.cookie } });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().character).toEqual({ id: f.characterId, name: "Same name", storyEntityId: null });
    expect(first.json().candidates).toEqual([{ id: f.entityId, name: "Same name", key: "entity-person" }]);
    expect(first.json().hasMore).toBe(true);
    const search = await app.inject({ method: "GET", url: `${f.route}/identity-options?q=SECOND-FREE&take=1`, headers: { cookie: f.cookie } });
    expect(search.json().candidates.map((row: { key: string }) => row.key)).toEqual(["second-free"]);
    expect(search.json().hasMore).toBe(false);
    expect(await counts(f.novelId)).toEqual(before);
    expect((await db.character.findUniqueOrThrow({ where: { id: f.characterId } })).storyEntityId).toBeNull();
  });

  it("links only after explicit PUT, pins the null-link preimage and removes health warning without changing knowledge; restore recovers null", async () => {
    const f = await seed();
    const fact = await db.canonFact.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, entityId: f.entityId, predicate: "has-role", objectText: "Witness", statement: "The person is a witness.", createdById: f.actorUserId } });
    await db.characterKnowledge.create({ data: { characterId: f.characterId, factId: fact.id, stance: "KNOWN", source: "LEARNED_IN_WORLD", fromChapter: 1 } });
    const knowledge = await db.characterKnowledge.findMany({ where: { characterId: f.characterId } });
    const health = createStoryHealthServices({ db, audit: createAuditService(db) });
    const unresolved = () => health.unresolvedIdentities(f);
    expect((await unresolved()).some((finding) => finding.affectedEntities.some((entity) => entity.id === f.characterId))).toBe(true);
    const response = await link(f); expect(response.statusCode, response.body).toBe(200);
    const result = response.json(); expect(result.checkpointId).toBeTruthy();
    const checkpoint = await db.checkpoint.findUniqueOrThrow({ where: { id: result.checkpointId }, include: { snapshot: true } });
    const rows = (checkpoint.snapshot.payload as { characters: { id: string; story_entity_id: string | null }[] }).characters;
    expect(rows.find((row) => row.id === f.characterId)?.story_entity_id).toBeNull();
    expect(checkpoint.revisionId).toBe(f.input.expectedHeadRevisionId);
    expect(await db.characterKnowledge.findMany({ where: { characterId: f.characterId } })).toEqual(knowledge);
    expect((await unresolved()).some((finding) => finding.affectedEntities.some((entity) => entity.id === f.characterId))).toBe(false);
    expect(await db.changeSetItem.count({ where: { changeSet: { revisionId: result.revisionId }, entityId: f.characterId, operation: "UPDATE" } })).toBe(1);
    expect(await db.derivedRebuildIntent.count({ where: { sourceRevisionId: result.revisionId, projection: "character" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "character.identity-linked", entityId: f.characterId } })).toBe(1);
    const revisions = createRevisionServices({ db });
    const preview = await revisions.previewRestore({ ...f, checkpointId: result.checkpointId, scope: "FULL" });
    await revisions.applyRestore({ ...f, restoreOperationId: preview.restoreOperationId });
    expect((await db.character.findUniqueOrThrow({ where: { id: f.characterId } })).storyEntityId).toBeNull();
    expect(await db.characterKnowledge.findMany({ where: { characterId: f.characterId } })).toEqual(knowledge);
    expect(await db.revision.findUnique({ where: { id: result.revisionId } })).not.toBeNull();
  });

  it("same-ID replay tolerates its original pre-link head without duplicating history, and GET exposes the current link", async () => {
    const f = await seed(); expect((await link(f)).statusCode).toBe(200);
    const before = await counts(f.novelId);
    const replay = await link(f); expect(replay.statusCode, replay.body).toBe(200); expect(replay.json().checkpointId).toBeNull();
    expect(await counts(f.novelId)).toEqual(before);
    const options = await app.inject({ method: "GET", url: `${f.route}/identity-options`, headers: { cookie: f.cookie } });
    expect(options.json().character.storyEntityId).toBe(f.entityId);
    expect(options.json().candidates.some((row: { id: string }) => row.id === f.entityId)).toBe(false);
  });

  it("rejects unauthenticated/read-only actors and foreign scope without partial history", async () => {
    const f = await seed(); const foreign = await seed(); const before = await counts(f.novelId);
    expect((await link(f, f.input, "")).statusCode).toBe(401);
    expect((await link(f, { ...f.input, storyEntityId: foreign.entityId })).statusCode).toBe(404);
    expect((await link(f, f.input, foreign.cookie)).statusCode).toBe(404);
    await db.membership.create({ data: { userId: foreign.actorUserId, workspaceId: f.workspaceId, role: "EDITOR" } });
    expect((await link(f, f.input, foreign.cookie)).statusCode).toBe(403);
    expect(await counts(f.novelId)).toEqual(before);
  });

  it("refuses wrong-kind, claimed identity and relinking without checkpoint/revision/audit leftovers", async () => {
    const f = await seed();
    const wrong = await db.storyEntity.create({ data: { novelId: f.novelId, kind: "LOCATION", key: "place", name: "Place", createdById: f.actorUserId } });
    const before = await counts(f.novelId);
    expect((await link(f, { ...f.input, storyEntityId: wrong.id })).statusCode).toBe(409);
    await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "other", name: "Other", storyEntityId: f.entityId, createdById: f.actorUserId } });
    expect((await link(f)).statusCode).toBe(409);
    expect(await counts(f.novelId)).toEqual(before);
    await db.character.update({ where: { id: f.characterId }, data: { storyEntityId: wrong.id } });
    expect((await link(f)).statusCode).toBe(409);
    expect(await counts(f.novelId)).toEqual(before);
  });

  it("rejects stale non-null/null head and changed checkout before any mutation", async () => {
    const f = await seed(); const before = await counts(f.novelId);
    for (const expectedHeadRevisionId of [null, randomUUID()]) expect((await link(f, { ...f.input, expectedHeadRevisionId })).statusCode).toBe(409);
    const alternate = await db.novelBranch.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, name: "alternate" } });
    await db.novel.update({ where: { id: f.novelId }, data: { currentBranchId: alternate.id } });
    expect((await link(f)).statusCode).toBe(409);
    expect(await counts(f.novelId)).toEqual(before);
  });

  it("links on the actual checked-out non-main branch without moving the main head", async () => {
    const f = await seed();
    const mainBefore = await db.novelBranch.findUniqueOrThrow({ where: { id: f.input.expectedBranchId } });
    const alternate = await db.novelBranch.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, name: "alternate", headRevisionId: mainBefore.headRevisionId } });
    await db.novel.update({ where: { id: f.novelId }, data: { currentBranchId: alternate.id } });
    const options = await services.getIdentityOptions({ ...f, take: 50, skip: 0 });
    expect(options.branchId).toBe(alternate.id);
    const result = await link(f, { ...f.input, expectedBranchId: options.branchId, expectedHeadRevisionId: options.headRevisionId });
    expect(result.statusCode, result.body).toBe(200);
    expect((await db.revision.findUniqueOrThrow({ where: { id: result.json().revisionId } })).branchId).toBe(alternate.id);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: mainBefore.id } })).headRevisionId).toBe(mainBefore.headRevisionId);
    expect((await db.checkpoint.findUniqueOrThrow({ where: { id: result.json().checkpointId } })).branchId).toBe(alternate.id);
  });

  it("requires strict body/head identity and bounded queries at the HTTP boundary", async () => {
    const f = await seed();
    for (const input of [{ storyEntityId: f.entityId }, { ...f.input, expectedHeadRevisionId: "guess" }, { ...f.input, automatic: true }]) expect((await link(f, input)).statusCode).toBe(400);
    for (const query of ["take=51", "take=0", "skip=100001", `q=${"a".repeat(121)}`, "unrecognized=true"]) {
      expect((await app.inject({ method: "GET", url: `${f.route}/identity-options?${query}`, headers: { cookie: f.cookie } })).statusCode).toBe(400);
    }
  });

  it("two independent DB clients claiming the same identity have one winner and one complete history", async () => {
    const f = await seed();
    const second = await services.createCharacter({ ...f, key: "second-character", name: "Second", summary: null });
    const options = await services.getIdentityOptions({ ...f, take: 50, skip: 0 });
    const input = { ...f.input, expectedHeadRevisionId: options.headRevisionId };
    const otherDb = createDb(TEST_URL);
    try {
      const otherServices = createCharacterServices({ db: otherDb, audit: createAuditService(otherDb) });
      const before = await counts(f.novelId);
      const results = await Promise.allSettled([
        services.linkStoryEntity({ ...f, ...input }),
        otherServices.linkStoryEntity({ ...f, ...input, characterId: second.id }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected" && result.reason.code === "CONFLICT")).toHaveLength(1);
      const after = await counts(f.novelId);
      expect(after.revisions - before.revisions).toBe(1); expect(after.checkpoints - before.checkpoints).toBe(1); expect(after.audits - before.audits).toBe(1);
      expect(await db.character.count({ where: { storyEntityId: f.entityId } })).toBe(1);
    } finally { await otherDb.$disconnect(); }
  });

  it("required checkpoint failure aborts the link, head advance, change-set, rebuild intent and audit together", async () => {
    const f = await seed(); const before = await counts(f.novelId);
    const failingDb = db.$extends({ query: { checkpoint: { async create() { throw new Error("fixture checkpoint storage failure"); } } } });
    const failingService = createCharacterServices({ db: failingDb as unknown as NovelForgeDb, audit: createAuditService(db) });
    await expect(failingService.linkStoryEntity({ ...f, ...f.input })).rejects.toThrow("fixture checkpoint storage failure");
    expect(await counts(f.novelId)).toEqual(before);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: f.input.expectedBranchId } })).headRevisionId).toBe(f.input.expectedHeadRevisionId);
    expect((await db.character.findUniqueOrThrow({ where: { id: f.characterId } })).storyEntityId).toBeNull();
  });

  it("concurrent entity deletion versus link returns a controlled conflict with no orphan link history", async () => {
    const f = await seed(); const before = await counts(f.novelId);
    const deleter = new pg.Client({ connectionString: TEST_URL });
    await deleter.connect();
    try {
      await deleter.query("BEGIN");
      await deleter.query("SET LOCAL deadlock_timeout = '5s'");
      await deleter.query("DELETE FROM story_entities WHERE id = $1", [f.entityId]);
      const pendingLink = Promise.resolve(link(f));
      let waiting = false;
      for (let index = 0; index < 100; index++) {
        await deleter.query("SELECT pg_stat_clear_snapshot()");
        const activity = await deleter.query("SELECT pid FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock' AND query LIKE 'UPDATE%characters%';", [TEST_DB]);
        if (activity.rows.length) { waiting = true; break; }
        await delay(10);
      }
      expect(waiting).toBe(true);
      // Reproduce the legacy delete's entity->branch order against the link's branch->FK order.
      const branchLock = deleter.query("SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE", [f.input.expectedBranchId]);
      const response = await pendingLink;
      expect(response.statusCode, response.body).toBe(409);
      await branchLock; await deleter.query("COMMIT");
      expect(await counts(f.novelId)).toEqual(before);
      expect((await db.character.findUniqueOrThrow({ where: { id: f.characterId } })).storyEntityId).toBeNull();
    } finally { await deleter.query("ROLLBACK"); await deleter.end(); }
  });

  it("cannot delete an explicitly linked identity, preserving the character's unrelated knowledge and all link history", async () => {
    const f = await seed();
    const subject = await db.storyEntity.create({ data: { novelId: f.novelId, kind: "LOCATION", key: "knowledge-subject", name: "Town", createdById: f.actorUserId } });
    const fact = await db.canonFact.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, entityId: subject.id, predicate: "has-weather", objectText: "Rainy", statement: "The town is rainy.", createdById: f.actorUserId } });
    await db.characterKnowledge.create({ data: { characterId: f.characterId, factId: fact.id, stance: "KNOWN", source: "LEARNED_IN_WORLD", fromChapter: 1 } });
    expect((await link(f)).statusCode).toBe(200);
    const before = await counts(f.novelId);
    const knowledge = await db.characterKnowledge.findMany({ where: { characterId: f.characterId } });
    const canon = createCanonServices({ db, audit: createAuditService(db), retrieval: {} as RetrievalServices });
    await expect(canon.deleteEntity({ ...f, entityId: f.entityId })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("linked to a character") });
    expect(await counts(f.novelId)).toEqual(before);
    expect((await db.character.findUniqueOrThrow({ where: { id: f.characterId } })).storyEntityId).toBe(f.entityId);
    expect(await db.characterKnowledge.findMany({ where: { characterId: f.characterId } })).toEqual(knowledge);
    expect(await db.storyEntity.findUnique({ where: { id: f.entityId } })).not.toBeNull();
  });

  it("production delete and link on independent clients serialize to one valid winner without deadlock or orphan history", async () => {
    const f = await seed(); const before = await counts(f.novelId);
    const otherDb = createDb(TEST_URL);
    try {
      const canon = createCanonServices({ db: otherDb, audit: createAuditService(otherDb), retrieval: {} as RetrievalServices });
      const results = await Promise.allSettled([services.linkStoryEntity({ ...f, ...f.input }), canon.deleteEntity({ ...f, entityId: f.entityId })]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected" && ["CONFLICT", "NOT_FOUND"].includes(result.reason.code))).toHaveLength(1);
      const linked = results[0]!.status === "fulfilled";
      const after = await counts(f.novelId);
      expect(after.revisions - before.revisions).toBe(1);
      expect(after.checkpoints - before.checkpoints).toBe(linked ? 1 : 0);
      expect(after.audits - before.audits).toBe(linked ? 1 : 0);
      const character = await db.character.findUniqueOrThrow({ where: { id: f.characterId } });
      expect(character.storyEntityId).toBe(linked ? f.entityId : null);
      expect(await db.storyEntity.findUnique({ where: { id: f.entityId } })).toEqual(linked ? expect.objectContaining({ id: f.entityId }) : null);
    } finally { await otherDb.$disconnect(); }
  });
});
