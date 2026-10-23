import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createAuthService, generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createStoryDiscoveryServices, parseStoryCandidates } from "../../../packages/ai-services/src/story-discovery.ts";
import { createPlatformServices } from "../../../packages/ai-services/src/platform.ts";
import { createAuditService } from "../../../packages/ai-services/src/audit.ts";
import { createCharacterServices } from "../../../packages/ai-services/src/characters.ts";
import { createCanonServices } from "../../../packages/ai-services/src/canon.ts";
import { createRetrievalServices } from "../../../packages/ai-services/src/retrieval.ts";
import { createRevisionServices } from "./services/revisions.ts";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { registerStoryDiscoveryRoutes } from "./story-discovery-routes.ts";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DB_ROOT = path.join(ROOT, "packages/database");
const TEST_DB = `novelforge_test_story_discovery_${process.pid}`;
const base = new URL(resolveTestDatabaseUrl({ envPath: path.join(ROOT, ".env") }));
const adminUrl = new URL(base); adminUrl.pathname = "/postgres"; base.pathname = `/${TEST_DB}`;
let db: NovelForgeDb, created = false;
const prose = "Husein leads Bhayangkara Surya. Rumput Tuba is a fictional plant.";
const group = { kind: "GROUP", name: "Bhayangkara Surya", summary: "A group led by Husein.", groupKind: "ORGANIZATION", quotes: ["Husein leads Bhayangkara Surya."], members: [{ name: "Husein", role: "LEADER", quote: "Husein leads Bhayangkara Surya." }] };
const research = { kind: "RESEARCH", name: "Rumput Tuba", summary: "An intentionally fictional plant.", quotes: ["Rumput Tuba is a fictional plant."], mode: "FICTIONAL_ADAPTATION" };
const generate = vi.fn(async () => ({ content: JSON.stringify({ candidates: [group, research] }), generationId: randomUUID(), model: "fixture-boundary" }));
let services: ReturnType<typeof createStoryDiscoveryServices>;
beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() }); await client.connect();
  try { await client.query(`CREATE DATABASE ${TEST_DB}`); created = true; } finally { await client.end(); }
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: DB_ROOT, env: { ...process.env, DATABASE_URL: base.toString() }, stdio: "pipe" });
  db = createDb(base.toString()); services = createStoryDiscoveryServices({ db, ai: { generate } });
});
afterAll(async () => {
  await db?.$disconnect();
  if (created) { const client = new pg.Client({ connectionString: adminUrl.toString() }); await client.connect(); try { await client.query(`DROP DATABASE ${TEST_DB}`); } finally { await client.end(); } }
});
async function seed() {
  const id = randomUUID();
  const user = await db.user.create({ data: { email: `${id}@story.test`, passwordHash: "fixture-not-a-login", displayName: "Fixture author" } });
  const workspace = await db.workspace.create({ data: { name: "Story fixture", slug: id, ownerId: user.id } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  const scope = { actorUserId: user.id, workspaceId: workspace.id, novelId: "" };
  scope.novelId = (await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ ...scope, title: "Story fixture", slug: id })).id;
  const entity = await db.storyEntity.create({ data: { novelId: scope.novelId, key: "husein", name: "Husein", kind: "CHARACTER", createdById: user.id } });
  const character = await db.character.create({ data: { workspaceId: workspace.id, novelId: scope.novelId, key: "husein", name: "Husein", storyEntityId: entity.id, createdById: user.id } });
  const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId: scope.novelId, name: "main" } });
  const chapter = await db.chapter.create({ data: { novelId: scope.novelId, number: 1, title: "A group", createdById: user.id } });
  const workflow = await db.workflow.create({ data: { key: "chapter-creation-review", name: "Fixture workflow", scope: "WORKSPACE", workspaceId: workspace.id, createdById: user.id } });
  const version = await db.workflowVersion.create({ data: { workflowId: workflow.id, number: 1, graph: {}, agentKeys: [], skillKeys: [], createdById: user.id } });
  const run = await db.workflowRun.create({ data: { workflowId: workflow.id, workflowVersionId: version.id, workflowVersionNumber: 1, workspaceId: workspace.id, novelId: scope.novelId, triggeredById: user.id, status: "SUCCEEDED", input: { chapterId: chapter.id, chapterNumber: 1, chapterCreationPins: { chapterId: chapter.id, sourceBranchId: branch.id, headRevisionId: branch.headRevisionId } } } });
  const chapterVersion = await db.chapterVersion.create({ data: { chapterId: chapter.id, number: 1, content: prose, wordCount: 12, authorId: user.id, note: JSON.stringify({ creationRunId: run.id }) } });
  await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: chapterVersion.id } });
  const outcome = { json: { prose } };
  await db.workflowStepRun.create({ data: { runId: run.id, stepKey: "write", sequence: 1, kind: "AGENT", status: "SUCCEEDED", output: outcome } });
  const approval = await db.workflowStepRun.create({ data: { runId: run.id, stepKey: "approval", sequence: 2, kind: "HUMAN_APPROVAL", status: "SUCCEEDED", approvalSnapshot: { snapshotHash: "fixture-snapshot", material: { priorOutcomes: { write: outcome } } } } });
  await db.workflowApprovalDecision.create({ data: { runId: run.id, stepRunId: approval.id, stepKey: "approval", decision: "APPROVED", snapshotHash: "fixture-snapshot", pins: {}, decidedById: user.id } });
  return { ...scope, runId: run.id, characterId: character.id, entityId: entity.id, chapterId: chapter.id, chapterVersionId: chapterVersion.id, branchId: branch.id };
}
type View = NonNullable<Awaited<ReturnType<typeof services.get>>>;
const pins = (v: View, index = 0) => ({ batchId: v.id, candidateId: v.candidates[index]!.id, expectedVersion: v.candidates[index]!.version, expectedBranchId: v.expectedBranchId!, expectedHeadRevisionId: v.expectedHeadRevisionId, expectedChapterVersionId: v.expectedChapterVersionId! });

describe("evidence-bound groups and research", () => {
  it("refuses invented evidence, surnames without explicit group names and fabricated scientific verification", () => {
    expect(parseStoryCandidates(JSON.stringify({ candidates: [group, research] }), prose)).toHaveLength(2);
    expect(parseStoryCandidates('{"candidates":[]}', prose)).toEqual([]);
    expect(parseStoryCandidates(JSON.stringify({ candidates: [{ ...research, name: "rumput tuba" }] }), prose)[0]?.name).toBe("Rumput Tuba");
    expect(() => parseStoryCandidates(JSON.stringify({ candidates: [{ ...research, quotes: ["rumput tuba is a fictional plant."] }] }), prose)).toThrow();
    for (const c of [{ ...group, quotes: ["Invented"] }, { ...group, members: [{ name: "Someone", role: "MEMBER", quote: group.quotes[0] }] }, { ...research, mode: "REAL_REFERENCE" }, { ...research, url: "https://invented.invalid" }]) {
      expect(() => parseStoryCandidates(JSON.stringify({ candidates: [c] }), prose)).toThrow();
    }
  });
  it("reserves once; GET and analysis do not approve or write story data", async () => {
    const f = await seed(), calls = generate.mock.calls.length;
    expect(await services.get(f)).toBeNull();
    const both = await Promise.all([services.discover(f), services.discover(f)]);
    expect(both[0]?.id).toBe(both[1]?.id); expect(generate.mock.calls.length - calls).toBe(1);
    expect(await db.canonFact.count({ where: { novelId: f.novelId } })).toBe(0);
    expect(await db.reference.count({ where: { novelId: f.novelId } })).toBe(0);
  });
  it("approves a group and affiliation with checkpoint and citations; Character data shows it; restore preserves decision history", async () => {
    const f = await seed(), v = (await services.discover(f))!;
    const result = await services.decide({ ...f, ...pins(v), action: "APPROVE" });
    const record = result.candidates[0]!.result!;
    expect(record.checkpointId).toBeTruthy();
    const fact = await db.canonFact.findFirstOrThrow({ where: { novelId: f.novelId, predicate: { startsWith: "affiliation:" } } });
    expect(fact.objectEntityId).toBe(record.groupId); expect(fact.entityId).toBe(f.entityId);
    expect(await db.canonFactSource.count({ where: { canonFactId: fact.id } })).toBe(1);
    expect(await db.derivedRebuildIntent.count({ where: { sourceRevisionId: String(record.revisionId) } })).toBeGreaterThan(0);
    const chars = await createCharacterServices({ db, audit: createAuditService(db) }).listCharacters({ ...f, take: 20, skip: 0 });
    expect(chars[0]?.affiliations).toEqual([{ groupId: record.groupId, name: group.name, statement: "Husein is affiliated with Bhayangkara Surya", role: "LEADER" }]);
    expect((await services.decide({ ...f, ...pins(v), action: "APPROVE" })).candidates[0]?.result).toEqual(record);
    const revisions = createRevisionServices({ db, audit: createAuditService(db) });
    const preview = await revisions.previewRestore({ ...f, checkpointId: String(record.checkpointId), scope: "FULL" });
    await revisions.applyRestore({ ...f, restoreOperationId: preview.restoreOperationId });
    expect(await db.storyEntity.count({ where: { id: String(record.groupId) } })).toBe(0);
    expect((await services.decide({ ...f, ...pins(v), action: "APPROVE" })).candidates[0]?.status).toBe("APPROVED");
    expect(await db.canonFact.count({ where: { novelId: f.novelId } })).toBe(0);
  });
  it("reuses an exact existing group, rejects unresolved characters and never silently overwrites an approved role", async () => {
    const f = await seed(), v = (await services.discover(f))!;
    const existing = await db.storyEntity.create({ data: { novelId: f.novelId, name: group.name, key: "surya", kind: "ORGANIZATION", createdById: f.actorUserId } });
    await db.character.update({ where: { id: f.characterId }, data: { storyEntityId: null } });
    await expect(services.decide({ ...f, ...pins(v), action: "APPROVE" })).rejects.toThrow("STORY_CHARACTER_UNRESOLVED");
    await db.character.update({ where: { id: f.characterId }, data: { storyEntityId: f.entityId } });
    await db.canonFact.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, entityId: f.entityId, predicate: `affiliation:${existing.id}`, objectEntityId: existing.id, statement: "Husein belongs to Surya", createdById: f.actorUserId } });
    await db.canonFact.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, entityId: f.entityId, predicate: `affiliation-role:${existing.id}`, objectText: "MEMBER", statement: "A member", createdById: f.actorUserId } });
    await expect(services.decide({ ...f, ...pins(v), action: "APPROVE" })).rejects.toThrow("STORY_AFFILIATION_CONFLICT");
    const audit = createAuditService(db);
    const retrieval = createRetrievalServices({ db, audit, ai: { embed: async () => { throw new Error("Role correction must not invoke embeddings"); } } });
    const canon = createCanonServices({ db, audit, retrieval });
    const correction = await canon.proposeCandidate({ ...f, entityId: f.entityId, predicate: `affiliation-role:${existing.id}`, objectText: "LEADER", statement: "Husein leads Surya", validFromChapter: 1 });
    await canon.approveProposal({ ...f, proposalId: correction.id });
    const fresh = (await services.get(f))!;
    const approved = await services.decide({ ...f, ...pins(fresh), action: "APPROVE" });
    expect(approved.candidates[0]?.result?.groupId).toBe(existing.id);
    expect(await db.storyEntity.count({ where: { novelId: f.novelId, kind: "ORGANIZATION" } })).toBe(1);
  });
  it("creates a draft fictional research note, not canon or a verified scientific claim", async () => {
    const f = await seed(), v = (await services.discover(f))!;
    const approved = await services.decide({ ...f, ...pins(v, 1), action: "APPROVE" });
    const record = approved.candidates[1]!.result!;
    expect(record.verification).toBe("NOT_VERIFIED");
    const ref = await db.reference.findUniqueOrThrow({ where: { id: String(record.referenceId) }, include: { currentVersion: true } });
    expect(ref.status).toBe("DRAFT"); expect(ref.currentVersion?.content).toContain("FICTIONAL_ADAPTATION");
    expect(await db.canonFact.count({ where: { novelId: f.novelId } })).toBe(0);
    expect((await db.chapterVersion.findUniqueOrThrow({ where: { id: f.chapterVersionId } })).content).toBe(prose);
  });
  it("links only an in-scope reference version with an exact supporting quote, without duplicating or rewriting it", async () => {
    const f = await seed(), other = await seed(), v = (await services.discover(f))!;
    const ref = await db.reference.create({ data: { workspaceId: other.workspaceId, novelId: other.novelId, key: "source", title: "Botanical source", kind: "NOTE", createdById: other.actorUserId } });
    const version = await db.referenceVersion.create({ data: { referenceId: ref.id, number: 1, content: "A source excerpt.", contentHash: "fixture", charCount: 17, createdById: other.actorUserId } });
    await db.reference.update({ where: { id: ref.id }, data: { currentVersionId: version.id } });
    const edit = { name: research.name, summary: research.summary, mode: "REAL_REFERENCE" as const, referenceVersionId: version.id, supportingQuote: "A source excerpt." };
    let changed = await services.decide({ ...f, ...pins(v, 1), action: "EDIT", edit });
    await expect(services.decide({ ...f, ...pins(changed, 1), action: "APPROVE" })).rejects.toThrow("reference");
    await db.reference.update({ where: { id: ref.id }, data: { workspaceId: f.workspaceId, novelId: f.novelId } });
    changed = await services.decide({ ...f, ...pins(changed, 1), action: "EDIT", edit: { ...edit, supportingQuote: "Invented" } });
    await expect(services.decide({ ...f, ...pins(changed, 1), action: "APPROVE" })).rejects.toThrow("STORY_REFERENCE_UNSUPPORTED");
    changed = await services.decide({ ...f, ...pins(changed, 1), action: "EDIT", edit });
    expect(await services.options({ ...f, kind: "REFERENCE", q: "Botanical" })).toEqual([{ id: version.id, name: ref.title, preview: version.content }]);
    const newer = await db.referenceVersion.create({ data: { referenceId: ref.id, number: 2, content: "New source text", contentHash: "fixture2", charCount: 15, createdById: f.actorUserId } });
    await db.reference.update({ where: { id: ref.id }, data: { currentVersionId: newer.id } });
    expect(await services.options({ ...f, kind: "REFERENCE", q: "No title matches", selected: version.id })).toEqual([{ id: version.id, name: ref.title, preview: version.content }]);
    await db.reference.create({ data: { workspaceId: other.workspaceId, novelId: other.novelId, key: "other-source", title: "Other source", kind: "NOTE", createdById: other.actorUserId } });
    expect(await services.options({ ...other, kind: "REFERENCE", q: "", selected: version.id })).toEqual([]);
    const approved = await services.decide({ ...f, ...pins(changed, 1), action: "APPROVE" });
    expect(approved.candidates[1]?.result?.referenceVersionId).toBe(version.id);
    expect(await db.reference.count({ where: { novelId: f.novelId } })).toBe(1);
  });
  it("fences changed versions, branches, heads and unapplied drafts; edit/reject never writes canon", async () => {
    const f = await seed(), v = (await services.discover(f))!;
    for (const override of [{ expectedVersion: 99 }, { expectedBranchId: randomUUID() }, { expectedHeadRevisionId: randomUUID() }, { expectedChapterVersionId: randomUUID() }]) {
      await expect(services.decide({ ...f, ...pins(v), ...override, action: "APPROVE" })).rejects.toThrow();
    }
    await db.workflowRun.update({ where: { id: f.runId }, data: { status: "AWAITING_APPROVAL" } });
    expect((await services.get(f))?.blockedReason).toBe("APPLY_DRAFT_FIRST");
    await expect(services.decide({ ...f, ...pins(v), action: "APPROVE" })).rejects.toThrow("STORY_SOURCE_CHANGED");
    const edited = await services.decide({ ...f, ...pins(v), action: "EDIT", edit: { name: "Bhayangkara", summary: "Author edited." } });
    expect(edited.candidates[0]?.original.name).toBe(group.name);
    await expect(services.decide({ ...f, ...pins(v), action: "REJECT" })).rejects.toThrow("STORY_SUGGESTION_CHANGED");
    const rejected = await services.decide({ ...f, ...pins(edited), action: "REJECT" });
    expect(rejected.candidates[0]?.status).toBe("REJECTED");
    expect(await db.canonFact.count({ where: { novelId: f.novelId } })).toBe(0);
  });
  it("denies cross-tenant access and viewer mutation", async () => {
    const f = await seed(), other = await seed(), v = (await services.discover(f))!;
    await expect(services.get({ ...f, actorUserId: other.actorUserId })).rejects.toThrow();
    await expect(services.decide({ ...other, ...pins(v), action: "REJECT" })).rejects.toThrow();
    await db.membership.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.actorUserId } }, data: { role: "VIEWER" } });
    await expect(services.get(f)).rejects.toThrow("canon:read");
    await expect(services.decide({ ...f, ...pins(v), action: "APPROVE" })).rejects.toThrow();
    await expect(services.discover(f)).rejects.toThrow();
  });
  it("ignores nonchapter workflow delivery without spending a model request", async () => {
    const f = await seed();
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: f.runId } });
    await db.workflow.update({ where: { id: run.workflowId }, data: { key: "custom-research" } });
    const calls = generate.mock.calls.length;
    expect(await services.discoverRun(f.runId)).toBeNull();
    expect(generate.mock.calls.length).toBe(calls);
    expect(await db.storyDiscoveryBatch.count({ where: { runId: f.runId } })).toBe(0);
  });
  it("HTTP requires authentication, validates decisions and exposes only safe conflict codes", async () => {
    const f = await seed(), app = Fastify(); await app.register(cookie);
    registerStoryDiscoveryRoutes(app, { auth: createAuthService({ users: prismaUserStore(db), sessions: prismaSessionStore(db) }), services });
    const url = `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/runs/${f.runId}/story-discovery`;
    try {
      expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(401);
      const token = generateSessionToken(); await db.session.create({ data: { userId: f.actorUserId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60000) } });
      const headers = { cookie: `nf_session=${token}` };
      expect((await app.inject({ method: "POST", url, headers, payload: { candidates: [] } })).statusCode).toBe(400);
      const response = await app.inject({ method: "POST", url, headers, payload: {} });
      expect(response.statusCode).toBe(200);
      const view = response.json() as View;
      const approveUrl = `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/story-discoveries/${view.id}/candidates/${view.candidates[0]!.id}/approve`;
      expect((await app.inject({ method: "POST", url: approveUrl, headers, payload: { expectedVersion: 1 } })).statusCode).toBe(400);
      const stale = await app.inject({ method: "POST", url: approveUrl, headers, payload: { expectedVersion: 99, expectedBranchId: view.expectedBranchId, expectedHeadRevisionId: view.expectedHeadRevisionId, expectedChapterVersionId: view.expectedChapterVersionId } });
      expect(stale.statusCode).toBe(409); expect(stale.json()).toEqual({ error: "STORY_SUGGESTION_CHANGED" });
    } finally { await app.close(); }
  });
});
