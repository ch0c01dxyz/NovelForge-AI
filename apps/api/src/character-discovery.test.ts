import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createAuthService, generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createCharacterDiscoveryServices, parseCharacterCandidates, type DiscoveryView } from "../../../packages/ai-services/src/character-discovery.ts";
import { createPlatformServices } from "../../../packages/ai-services/src/platform.ts";
import { createAuditService } from "../../../packages/ai-services/src/audit.ts";
import { createCharacterServices } from "../../../packages/ai-services/src/characters.ts";
import { createChapterSourceReader } from "../../../packages/ai-services/src/chapter-source.ts";
import { resolveCharacterReference } from "../../../packages/ai-services/src/character-references.ts";
import { createRevisionServices } from "./services/revisions.ts";
import { registerCharacterDiscoveryRoutes } from "./character-discovery-routes.ts";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DB_ROOT = path.join(ROOT, "packages/database");
const TEST_DB = `novelforge_test_character_discovery_${process.pid}`;
const base = new URL(resolveTestDatabaseUrl({ envPath: path.join(ROOT, ".env") }));
const adminUrl = new URL(base); adminUrl.pathname = "/postgres"; base.pathname = `/${TEST_DB}`;
let db: NovelForgeDb, created = false;
const prose = "Mara entered the room. Mara carried a sealed letter.";
const output = JSON.stringify({ candidates: [{ name: "Mara", summary: "A visitor carrying a sealed letter.", quotes: ["Mara entered the room."] }] });
const generate = vi.fn(async () => ({ content: output, generationId: randomUUID(), model: "fixture-boundary" }));
let services: ReturnType<typeof createCharacterDiscoveryServices>;
beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() }); await client.connect();
  try { await client.query(`CREATE DATABASE ${TEST_DB}`); created = true; } finally { await client.end(); }
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: DB_ROOT, env: { ...process.env, DATABASE_URL: base.toString() }, stdio: "pipe" });
  db = createDb(base.toString()); services = createCharacterDiscoveryServices({ db, ai: { generate } });
});
afterAll(async () => {
  await db?.$disconnect();
  if (created) { const client = new pg.Client({ connectionString: adminUrl.toString() }); await client.connect(); try { await client.query(`DROP DATABASE ${TEST_DB}`); } finally { await client.end(); } }
});
async function seed(key = "chapter-creation-review") {
  const id = randomUUID();
  const user = await db.user.create({ data: { email: `${id}@discovery.test`, passwordHash: "fixture-not-a-login", displayName: "Fixture author" } });
  const workspace = await db.workspace.create({ data: { name: "Discovery fixture", slug: id, ownerId: user.id } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  const scope = { actorUserId: user.id, workspaceId: workspace.id, novelId: "" };
  scope.novelId = (await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ ...scope, title: "Discovery fixture", slug: id })).id;
  const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId: scope.novelId, name: "main" } });
  const chapter = await db.chapter.create({ data: { novelId: scope.novelId, number: 1, title: "A visitor", createdById: user.id } });
  const workflow = await db.workflow.create({ data: { key, name: "Fixture workflow", scope: "WORKSPACE", workspaceId: workspace.id, createdById: user.id } });
  const version = await db.workflowVersion.create({ data: { workflowId: workflow.id, number: 1, graph: {}, agentKeys: [], skillKeys: [], createdById: user.id } });
  const run = await db.workflowRun.create({ data: { workflowId: workflow.id, workflowVersionId: version.id, workflowVersionNumber: 1, workspaceId: workspace.id, novelId: scope.novelId, triggeredById: user.id, status: "SUCCEEDED", input: { chapterId: chapter.id, chapterNumber: 1, chapterCreationPins: { chapterId: chapter.id, headRevisionId: branch.headRevisionId } } } });
  const chapterVersion = await db.chapterVersion.create({ data: { chapterId: chapter.id, number: 1, content: prose, wordCount: 10, authorId: user.id, note: JSON.stringify({ creationRunId: run.id }) } });
  await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: chapterVersion.id } });
  const outcome = { json: { prose } };
  await db.workflowStepRun.create({ data: { runId: run.id, stepKey: "write", sequence: 1, kind: "AGENT", status: "SUCCEEDED", output: outcome } });
  const approval = await db.workflowStepRun.create({ data: { runId: run.id, stepKey: "approval", sequence: 2, kind: "HUMAN_APPROVAL", status: "SUCCEEDED", approvalSnapshot: { snapshotHash: "fixture-snapshot", material: { priorOutcomes: { write: outcome } } } } });
  await db.workflowApprovalDecision.create({ data: { runId: run.id, stepRunId: approval.id, stepKey: "approval", decision: "APPROVED", snapshotHash: "fixture-snapshot", pins: {}, decidedById: user.id } });
  return { ...scope, runId: run.id, chapterId: chapter.id, chapterVersionId: chapterVersion.id, branchId: branch.id, head: branch.headRevisionId };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
const pins = (v: DiscoveryView) => ({ batchId: v.id, candidateId: v.candidates[0]!.id, expectedVersion: v.candidates[0]!.version, expectedBranchId: v.sourceBranchId, expectedHeadRevisionId: v.expectedHeadRevisionId, expectedChapterVersionId: v.expectedChapterVersionId! });
async function storyCounts(f: Fixture) { return { characters: await db.character.count({ where: { novelId: f.novelId } }), entities: await db.storyEntity.count({ where: { novelId: f.novelId } }), facts: await db.canonFact.count({ where: { novelId: f.novelId } }), revisions: await db.revision.count({ where: { novelId: f.novelId } }), checkpoints: await db.checkpoint.count({ where: { novelId: f.novelId } }) }; }

describe("generated character proposals", () => {
  it("accepts empty output but refuses invented names, evidence, duplicates, extra fields and oversized output", () => {
    expect(parseCharacterCandidates('{"candidates":[]}', prose)).toEqual([]);
    expect(parseCharacterCandidates(output, prose)[0]?.name).toBe("Mara");
    for (const candidate of [{ name: "Nobody", summary: "Visitor", quotes: [prose] }, { name: "Mara", summary: "Visitor", quotes: ["Invented quotation"] }, { name: "Mara", summary: "Visitor", quotes: [prose], hidden: "policy" }]) expect(() => parseCharacterCandidates(JSON.stringify({ candidates: [candidate] }), prose)).toThrow();
    expect(() => parseCharacterCandidates(JSON.stringify({ candidates: Array(21).fill(JSON.parse(output).candidates[0]) }), prose)).toThrow();
    expect(() => parseCharacterCandidates(JSON.stringify({ candidates: Array(2).fill(JSON.parse(output).candidates[0]) }), prose)).toThrow();
  });
  it("reserves once under concurrent delivery; detection is not approval and GET never generates", async () => {
    const f = await seed(), before = await storyCounts(f), calls = generate.mock.calls.length;
    const both = await Promise.all([services.discover(f), services.discover(f)]);
    expect(both[0].id).toBe(both[1].id); expect(generate.mock.calls.length - calls).toBe(1);
    expect(await storyCounts(f)).toEqual(before);
    const v = await services.get(f); expect(v?.canApprove).toBe(true); expect(generate.mock.calls.length - calls).toBe(1);
  });
  it("approves exactly one linked pair with prechange checkpoint, audit, both changes and rebuild intent; replay never remints after restore", async () => {
    const f = await seed(), v = await services.discover(f), before = await storyCounts(f);
    const approved = await services.approve({ ...f, ...pins(v) });
    const c = approved.candidates[0]!;
    expect(c.status).toBe("APPROVED"); expect(c.checkpointId).toBeTruthy();
    expect((await db.character.findUniqueOrThrow({ where: { id: c.characterId! } })).storyEntityId).toBe(c.storyEntityId);
    const after = await storyCounts(f); expect(after).toEqual({ ...before, characters: before.characters + 1, entities: before.entities + 1, revisions: before.revisions + 1, checkpoints: before.checkpoints + 1 });
    expect(await db.changeSetItem.count({ where: { changeSet: { revisionId: c.revisionId } } })).toBe(2);
    expect(await db.derivedRebuildIntent.count({ where: { sourceRevisionId: c.revisionId } })).toBeGreaterThan(0);
    expect((await services.approve({ ...f, ...pins(v) })).candidates[0]?.characterId).toBe(c.characterId);
    const revisions = createRevisionServices({ db, audit: createAuditService(db) });
    const preview = await revisions.previewRestore({ ...f, checkpointId: c.checkpointId!, scope: "FULL" });
    await revisions.applyRestore({ ...f, restoreOperationId: preview.restoreOperationId });
    expect(await db.character.count({ where: { id: c.characterId } })).toBe(0);
    expect((await services.approve({ ...f, ...pins(v) })).candidates[0]?.status).toBe("APPROVED");
    expect(await db.character.count({ where: { id: c.characterId } })).toBe(0);
  });
  it("editing retains original source and increments CAS; rejected suggestions cannot approve", async () => {
    const f = await seed(), v = await services.discover(f), before = await storyCounts(f);
    const edited = await services.edit({ ...f, ...pins(v), name: "Mara Vale", summary: "Author-reviewed visitor." });
    expect(edited.candidates[0]).toMatchObject({ version: 2, originalName: "Mara", name: "Mara Vale" });
    await expect(services.edit({ ...f, ...pins(v), name: "Stale", summary: "Stale" })).rejects.toMatchObject({ code: "CONFLICT" });
    const rejected = await services.reject({ ...f, ...pins(edited) }); expect(rejected.candidates[0]?.status).toBe("REJECTED");
    await expect(services.approve({ ...f, ...pins(rejected) })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storyCounts(f)).toEqual(before);
  });
  it("blocks approval before human approval, before Apply, after source edits and on stale version/head/branch", async () => {
    const f = await seed(), v = await services.discover(f), before = await storyCounts(f);
    await db.workflowRun.update({ where: { id: f.runId }, data: { status: "AWAITING_APPROVAL" } });
    expect((await services.get(f))?.blockedReason).toBe("APPLY_DRAFT_FIRST");
    await expect(services.approve({ ...f, ...pins(v) })).rejects.toMatchObject({ code: "CONFLICT" });
    await db.workflowRun.update({ where: { id: f.runId }, data: { status: "SUCCEEDED" } });
    await db.chapterVersion.update({ where: { id: f.chapterVersionId }, data: { content: "A changed chapter." } });
    expect((await services.get(f))?.canApprove).toBe(false);
    await expect(services.approve({ ...f, ...pins(v) })).rejects.toMatchObject({ code: "CONFLICT" });
    await db.chapterVersion.update({ where: { id: f.chapterVersionId }, data: { content: prose } });
    for (const changes of [{ expectedHeadRevisionId: randomUUID() }, { expectedChapterVersionId: randomUUID() }, { expectedBranchId: randomUUID() }]) await expect(services.approve({ ...f, ...pins(v), ...changes })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storyCounts(f)).toEqual(before);
  });
  it("refuses cross-tenant and reader decisions and conflicting identities without any story write", async () => {
    const f = await seed(), other = await seed(), v = await services.discover(f);
    await expect(services.get({ ...f, actorUserId: other.actorUserId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.membership.create({ data: { workspaceId: f.workspaceId, userId: other.actorUserId, role: "VIEWER" } });
    await expect(services.get({ ...f, actorUserId: other.actorUserId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(services.approve({ ...f, ...pins(v), actorUserId: other.actorUserId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.storyEntity.create({ data: { novelId: f.novelId, key: "mara", kind: "CHARACTER", name: "Mara", createdById: f.actorUserId } });
    const before = await storyCounts(f);
    expect((await services.get(f))?.candidates[0]?.conflict).toBe("IDENTITY_EXISTS");
    await expect(services.approve({ ...f, ...pins(v) })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storyCounts(f)).toEqual(before);
  });
  it("checkpoint failure rolls back all writes and epoch fencing ignores a late interrupted result", async () => {
    const f = await seed(), v = await services.discover(f), before = await storyCounts(f);
    const failingDb = db.$extends({ query: { checkpoint: { async create() { throw new Error("fixture checkpoint failure"); } } } });
    await expect(createCharacterDiscoveryServices({ db: failingDb as unknown as NovelForgeDb, ai: { generate } }).approve({ ...f, ...pins(v) })).rejects.toThrow("fixture checkpoint failure");
    expect(await storyCounts(f)).toEqual(before);
    const next = await seed();
    let finish!: (value: Awaited<ReturnType<typeof generate>>) => void;
    const delayed = createCharacterDiscoveryServices({ db, ai: { generate: () => new Promise(resolve => { finish = resolve; }) } });
    const pending = delayed.discover(next);
    let row = null;
    for (let i = 0; i < 100 && !row; i++) { row = await db.characterDiscoveryBatch.findUnique({ where: { runId: next.runId } }); if (!row) await new Promise(resolve => setTimeout(resolve, 10)); }
    expect(row).toBeTruthy();
    await db.characterDiscoveryBatch.update({ where: { id: row!.id }, data: { updatedAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await services.get(next))?.status).toBe("UNCERTAIN");
    const retried = await services.discover({ ...next, retry: true }); expect(retried.epoch).toBe(1);
    finish({ content: '{"candidates":[]}', generationId: randomUUID(), model: "late-fixture" }); await pending;
    expect((await services.get(next))?.candidates).toHaveLength(1);
  });
  it("invalid output fails only discovery; empty detection succeeds; no automatic repeat requests", async () => {
    const f = await seed(); generate.mockResolvedValueOnce({ content: "{}", generationId: randomUUID(), model: "fixture" });
    const failed = await services.discover(f); expect(failed.status).toBe("FAILED");
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: f.runId } })).status).toBe("SUCCEEDED");
    const calls = generate.mock.calls.length; await services.discover(f); expect(generate.mock.calls.length).toBe(calls);
    generate.mockResolvedValueOnce({ content: '{"candidates":[]}', generationId: randomUUID(), model: "fixture" });
    expect((await services.discover({ ...f, retry: true })).candidates).toEqual([]);
  });
  it("HTTP enforces session and strict request contracts; forged candidate fields are rejected", async () => {
    const f = await seed(), app = Fastify(); await app.register(cookie);
    registerCharacterDiscoveryRoutes(app, { auth: createAuthService({ users: prismaUserStore(db), sessions: prismaSessionStore(db) }), services });
    const url = `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/runs/${f.runId}/character-discovery`;
    expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(401);
    const token = generateSessionToken(); await db.session.create({ data: { userId: f.actorUserId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60000) } });
    expect((await app.inject({ method: "POST", url, headers: { cookie: `nf_session=${token}` }, payload: { candidates: [] } })).statusCode).toBe(400);
    await app.close();
  });
  it("uses immutable run branch provenance and refuses discovery after a different checkout", async () => {
    const f = await seed();
    const branch = await db.novelBranch.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, name: "other", headRevisionId: f.head } });
    await db.novel.update({ where: { id: f.novelId }, data: { currentBranchId: branch.id } });
    const calls = generate.mock.calls.length;
    await expect(services.discover(f)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(generate.mock.calls.length).toBe(calls);
    expect(await db.characterDiscoveryBatch.count({ where: { runId: f.runId } })).toBe(0);
  });
  it("legacy source keeps chapter identity; a replacement with the same number and prose cannot approve", async () => {
    const f = await seed("chapter-generation-review");
    await db.workflowRun.update({ where: { id: f.runId }, data: { input: { chapterNumber: 1 } } });
    await db.workflowStepRun.create({ data: { runId: f.runId, stepKey: "context", sequence: 3, kind: "RETRIEVAL", status: "SUCCEEDED", output: { json: { headRevisionId: f.head } } } });
    const v = await services.discover(f); expect(v.canApprove).toBe(true);
    await db.chapter.delete({ where: { id: f.chapterId } });
    const replacement = await db.chapter.create({ data: { novelId: f.novelId, number: 1, title: "Replacement", createdById: f.actorUserId } });
    const version = await db.chapterVersion.create({ data: { chapterId: replacement.id, number: 1, content: prose, wordCount: 10, authorId: f.actorUserId } });
    await db.chapter.update({ where: { id: replacement.id }, data: { currentVersionId: version.id } });
    expect((await services.get(f))?.blockedReason).toBe("SOURCE_CHANGED");
    await expect(services.approve({ ...f, ...pins(v) })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("concurrent manual creation and suggestion approval produce one character with controlled conflict", async () => {
    const f = await seed(), v = await services.discover(f);
    const manual = createCharacterServices({ db, audit: createAuditService(db) });
    const results = await Promise.allSettled([services.approve({ ...f, ...pins(v) }), manual.createCharacter({ ...f, key: "mara", name: "Mara", summary: "Manual fixture" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected" && r.reason.code === "CONFLICT")).toHaveLength(1);
    expect(await db.character.count({ where: { novelId: f.novelId, key: "mara" } })).toBe(1);
    const c = await db.character.findFirstOrThrow({ where: { novelId: f.novelId, key: "mara" } });
    expect(await db.storyEntity.count({ where: { novelId: f.novelId } })).toBe(c.storyEntityId ? 1 : 0);
  });
  it("reuses unique stored name aliases and proposes only the author's two new sons", async () => {
    const f = await seed();
    for (const [key, name] of [["sofian-magani", "Sofian Magani"], ["don-juan", "Don Juan (Juan Cleverton)"], ["husein-pratama", "Husein Pratama"]]) await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: key!, name: name!, summary: "Existing author profile", createdById: f.actorUserId } });
    const text = "Sofian welcomed Pak Husein. Juan Cleverton greeted Anton Pratama and Darma Pratama.";
    await db.chapterVersion.update({ where: { id: f.chapterVersionId }, data: { content: text } });
    await db.workflowStepRun.update({ where: { runId_stepKey: { runId: f.runId, stepKey: "approval" } }, data: { approvalSnapshot: { snapshotHash: "fixture-snapshot", material: { priorOutcomes: { write: { json: { prose: text } } } } } } });
    generate.mockResolvedValueOnce({ generationId: randomUUID(), model: "fixture", content: JSON.stringify({ candidates: ["Sofian", "Pak Husein", "Juan Cleverton", "Anton Pratama", "Darma Pratama"].map(name => ({ name, summary: "A person in this chapter", quotes: [text] })) }) });
    const v = await services.discover(f);
    expect(v.status).toBe("SUCCEEDED"); expect(v.candidates.map(c => c.name)).toEqual(["Anton Pratama", "Darma Pratama"]);
    expect(await db.character.count({ where: { novelId: f.novelId } })).toBe(3);
    expect((await resolveCharacterReference(db, f, "Pak Husein")).matches[0]?.key).toBe("husein-pratama");
    const other = await seed(); expect((await resolveCharacterReference(db, other, "Sofian")).kind).toBe("NEW");
  });
  it("never merges ambiguous short names or allows a duplicate identity approval", async () => {
    const f = await seed();
    for (const [key, name] of [["mara-vale", "Mara Vale"], ["mara-river", "Mara River"]]) await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: key!, name: name!, createdById: f.actorUserId } });
    const before = await storyCounts(f), v = await services.discover(f);
    expect(v.candidates[0]?.conflict).toBe("IDENTITY_AMBIGUOUS");
    await expect(services.approve({ ...f, ...pins(v) })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storyCounts(f)).toEqual(before);
  });
  it("pins saved predecessor and relevant existing profile context without any story mutation", async () => {
    const f = await seed();
    await db.chapter.update({ where: { id: f.chapterId }, data: { number: 10 } });
    const previous = await db.chapter.create({ data: { novelId: f.novelId, number: 9, title: "The previous evening", createdById: f.actorUserId } });
    const version = await db.chapterVersion.create({ data: { chapterId: previous.id, number: 1, content: "Don Juan and Sofian ended the evening together.", wordCount: 9, authorId: f.actorUserId } });
    await db.chapter.update({ where: { id: previous.id }, data: { currentVersionId: version.id } });
    const profile = await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "husein", name: "Husein Pratama", summary: "Their uncle", createdById: f.actorUserId } });
    const accented = await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "unrelated-key", name: "José Vale", createdById: f.actorUserId } });
    const keyed = await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "masked-visitor", name: "Adrian Hart", createdById: f.actorUserId } });
    await db.character.create({ data: { workspaceId: f.workspaceId, novelId: f.novelId, key: "guard-commander", name: "Guard Commander (old village)", createdById: f.actorUserId } });
    const before = await storyCounts(f), reader = createChapterSourceReader(db);
    const frame = await reader.load({ ...f, chapterNumber: 10, authorInstructions: "Pak Husein arrives with Anton Pratama and Darma Pratama." });
    expect(frame.previousChapter).toMatchObject({ chapterId: previous.id, versionId: version.id, chapterNumber: 9 });
    expect(frame.text).toContain(version.content); expect(frame.characters[0]).toMatchObject({ id: profile.id, name: "Husein Pratama", summary: "Their uncle" });
    const lowercase = await reader.load({ ...f, chapterNumber: 10, authorInstructions: "pak husein meets jose and masked visitor in the old village." });
    expect(new Set(lowercase.characters.map(c => c.id))).toEqual(new Set([profile.id, accented.id, keyed.id]));
    expect((await resolveCharacterReference(db, f, "Jose")).matches[0]?.id).toBe(accented.id);
    expect((await resolveCharacterReference(db, f, "masked visitor")).matches[0]?.id).toBe(keyed.id);
    expect(await storyCounts(f)).toEqual(before);
    const other = await seed(); await expect(reader.load({ ...f, actorUserId: other.actorUserId, chapterNumber: 10, authorInstructions: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.chapter.update({ where: { id: previous.id }, data: { currentVersionId: null } });
    await expect(reader.load({ ...f, chapterNumber: 10, authorInstructions: "" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
