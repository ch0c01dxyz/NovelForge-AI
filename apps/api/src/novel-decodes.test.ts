import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import JSZip from "jszip";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createAuditService, createRetrievalServices, createNovelDecodeProcessor } from "@novelforge/ai-services";
import { createNovelDecodeServices } from "./services/novel-decodes.ts";

const TEST_DB = "novelforge_test_novel_decodes";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(ROOT, ".env"));
const url = (name: string) => { const u = new URL(process.env.DATABASE_URL!); u.pathname = `/${name}`; return u.toString(); };
let db: NovelForgeDb;
let scope: { actorUserId: string; workspaceId: string };
let services: ReturnType<typeof createNovelDecodeServices>;
let buffer: Buffer, archiveHash: string;
beforeAll(async () => {
  const admin = new pg.Client({ connectionString: url("postgres") }); await admin.connect();
  try { await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`); await admin.query(`CREATE DATABASE ${TEST_DB}`); } finally { await admin.end(); }
  const dbRoot = path.join(ROOT, "packages/database");
  execFileSync(process.execPath, [path.join(dbRoot, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: dbRoot, stdio: "pipe", env: { ...process.env, DATABASE_URL: url(TEST_DB) } });
  db = createDb(url(TEST_DB));
  services = createNovelDecodeServices({ db, retrievalFor: client => createRetrievalServices({ db: client, audit: createAuditService(client), ai: { embed: async () => { throw new Error("No embedding during candidate application"); } } }) });
  const zip = new JSZip(); zip.file("Book/info.json", JSON.stringify({ title: "The valley", source: "Local test fixture" }));
  zip.file("Book/chapters/000 - Prologue.md", "# Prologue\n\nAria feared the valley.\n\n## A section, not a second chapter\n\nBram waited there.");
  zip.file("Book/chapters/002 - Arrival.md", "# Arrival\n\nAria entered the valley and helped Bram.");
  buffer = await zip.generateAsync({ type: "nodebuffer" });
});
afterAll(async () => { await db?.$disconnect(); });
beforeEach(async () => {
  const user = await db.user.create({ data: { email: `${randomUUID()}@decode.test`, displayName: "Author", passwordHash: "not-an-authentication-fixture" } });
  const workspace = await db.workspace.create({ data: { ownerId: user.id, name: "Decode", slug: randomUUID() } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  scope = { actorUserId: user.id, workspaceId: workspace.id };
  archiveHash = (await services.preview(scope, buffer)).archiveHash;
});
const start = (areas = ["CHARACTER"]) => services.start(scope, { buffer, root: "Book", archiveHash, areas, requestId: randomUUID() });
async function grounded(jobId: string, area = "CHARACTER") {
  const chunk = await db.novelDecodeChunk.findFirstOrThrow({ where: { jobId, processed: false }, orderBy: { ordinal: "asc" } });
  const quote = chunk.text.includes("Aria feared the valley.") ? "Aria feared the valley." : "Aria entered the valley and helped Bram.";
  return { candidates: [{ area, title: "Aria", summary: "A named traveler.", subject: null, target: null, chapterNumber: chunk.chapterNumber, citations: [{ chapterVersionId: chunk.chapterVersionId, chapterNumber: chunk.chapterNumber, quote }], details: {} }], unknowns: [] };
}
describe("durable novel import/decode/review", () => {
  it("retains rejection warnings while only publishing valid observations for review", async () => {
    const { job } = await start();
    const processor = createNovelDecodeProcessor({ db, ai: { generate: async () => {
      const observed = await grounded(job.id);
      return { generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify({ ...observed, candidates: [...observed.candidates, { area: "ITEM", title: "", summary: "", citations: [] }] }) };
    } } });
    await processor.process(job.id);
    const current = (await services.get(scope, job.id)).job;
    expect(current).toMatchObject({ status: "QUEUED", completedChunks: 1, candidateCount: 1 });
    expect(current.unknowns).toEqual(expect.arrayContaining([expect.stringContaining("Source validation excluded 1")]));
    expect((await services.candidates(scope, job.id, { take: 25, skip: 0 })).candidates.map(c => c.area)).toEqual(["CHARACTER"]);
  });
  it("retains but never accepts output stopped at the provider response limit", async () => {
    const { job } = await start();
    const processor = createNovelDecodeProcessor({ db, ai: { generate: async () => ({ generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify(await grounded(job.id)), finishReason: "length" }) } });
    await processor.process(job.id);
    expect((await services.get(scope, job.id)).job).toMatchObject({ status: "FAILED", errorCode: "DECODE_OUTPUT_LIMIT", completedChunks: 0 });
    expect((await services.candidates(scope, job.id, { take: 25, skip: 0 })).total).toBe(0);
    const chunk = await db.novelDecodeChunk.findFirstOrThrow({ where: { jobId: job.id }, orderBy: { ordinal: "asc" } });
    expect(chunk.responses).toEqual([expect.objectContaining({ finishReason: "length" })]);
  });
  it("validates edited details using the immutable area and retains the candidate on rejection", async () => {
    const { job } = await start(["CHARACTER_ARC"]);
    await db.novelDecodeJob.update({ where: { id: job.id }, data: { status: "REVIEW" } });
    const chunks = await db.novelDecodeChunk.findMany({ where: { jobId: job.id }, orderBy: { ordinal: "asc" } });
    const citations = chunks.map(c => ({ chapterVersionId: c.chapterVersionId, chapterNumber: c.chapterNumber, quote: c.text.slice(0, 20) }));
    const details = { milestones: [{ chapterNumber: 1, summary: "Fear" }, { chapterNumber: 2, summary: "Courage" }] };
    const candidate = await db.novelDecodeCandidate.create({ data: { jobId: job.id, chunkId: chunks[1]!.id, area: "CHARACTER_ARC", title: "Aria changes", summary: "Observed development", subject: "Aria", chapterNumber: 2, citations, details } });
    for (const invalid of [{ milestones: Array(9).fill(details.milestones[0]) }, { milestones: [details.milestones[0], { chapterNumber: 2, summary: "x".repeat(2001) }] }]) {
      await expect(services.edit(scope, job.id, candidate.id, { expectedVersion: 1, title: candidate.title, summary: candidate.summary, details: invalid })).rejects.toThrow("DECODE_OUTPUT_INVALID");
    }
    expect((await db.novelDecodeCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).version).toBe(1);
    expect((await services.edit(scope, job.id, candidate.id, { expectedVersion: 1, title: candidate.title, summary: candidate.summary, details })).candidate.version).toBe(2);
  });
  it("imports one file per private chapter, retains source numbering and fences idempotent creation", async () => {
    const input = { buffer, root: "Book", archiveHash, areas: ["CHARACTER"], requestId: randomUUID() };
    const [a, b] = await Promise.all([services.start(scope, input), services.start(scope, input)]);
    expect(a.job.id).toBe(b.job.id); expect(await db.novel.count({ where: { workspaceId: scope.workspaceId } })).toBe(1);
    const chapters = await db.chapter.findMany({ where: { novelId: a.job.novelId }, orderBy: { number: "asc" }, include: { currentVersion: true } });
    expect(chapters.map(c => [c.number, c.title, c.status])).toEqual([[1, "Prologue", "DRAFT"], [2, "Arrival", "DRAFT"]]);
    expect(chapters[0]!.currentVersion!.content).toContain("A section, not a second chapter");
    const stored = await db.novelDecodeJob.findUniqueOrThrow({ where: { id: a.job.id } });
    expect((stored.sourceManifest as { chapters: { sourceNumber: number }[] }).chapters.map(c => c.sourceNumber)).toEqual([0, 2]);
    expect(await db.publication.count({ where: { novelId: a.job.novelId } })).toBe(0);
    expect(await db.canonFact.count({ where: { novelId: a.job.novelId } })).toBe(0);
    await expect(services.start(scope, { ...input, areas: ["STYLE"] })).rejects.toThrow("DECODE_REQUEST_CHANGED");
  });
  it("rejects other tenants and stale archive/source pins", async () => {
    const { job } = await start();
    await expect(services.get({ ...scope, actorUserId: randomUUID() }, job.id)).rejects.toThrow();
    await expect(services.start(scope, { buffer, root: "Book", archiveHash: "0".repeat(64), areas: ["CHARACTER"], requestId: randomUUID() })).rejects.toThrow("DECODE_ARCHIVE_CHANGED");
    await db.novelDecodeJob.update({ where: { id: job.id }, data: { status: "FAILED" } });
    const chapter = await db.chapter.findFirstOrThrow({ where: { novelId: job.novelId } });
    const version = await db.chapterVersion.create({ data: { chapterId: chapter.id, number: 2, content: "<p>Changed source.</p>", wordCount: 2, authorId: scope.actorUserId } });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });
    await expect(services.control(scope, job.id, "retry")).rejects.toThrow("DECODE_SOURCE_CHANGED");
  });
  it("retains successful chunks, resumes failure, and applies one author decision atomically once", async () => {
    const { job } = await start(); let calls = 0, fail = false;
    const processor = createNovelDecodeProcessor({ db, ai: { generate: async () => { calls++; if (fail) throw new Error("Connection interrupted"); return { generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify(await grounded(job.id)) }; } } });
    await processor.process(job.id); fail = true; await processor.process(job.id);
    expect((await services.get(scope, job.id)).job).toMatchObject({ status: "FAILED", completedChunks: 1 });
    await services.control(scope, job.id, "retry"); fail = false; await processor.process(job.id); await processor.process(job.id);
    expect(calls).toBe(3); expect((await services.get(scope, job.id)).job).toMatchObject({ status: "REVIEW", completedChunks: 2 });
    const list = await services.candidates(scope, job.id, { take: 25, skip: 0 }); const candidate = list.candidates[0]!;
    const current = (await services.get(scope, job.id)).job;
    const decision = { expectedVersion: candidate.version, expectedHeadRevisionId: current.expectedHeadRevisionId };
    const a = await services.decide(scope, job.id, candidate.id, decision, true), b = await services.decide(scope, job.id, candidate.id, decision, true);
    expect(a.candidate.result).toEqual(b.candidate.result); expect(await db.character.count({ where: { novelId: job.novelId } })).toBe(1);
    expect(await db.checkpoint.count({ where: { novelId: job.novelId } })).toBeGreaterThan(0);
    const other = list.candidates[1]!;
    await expect(services.edit(scope, job.id, other.id, { expectedVersion: other.version + 1, title: "Aria", summary: "Edit" })).rejects.toThrow();
    const edited = (await services.edit(scope, job.id, other.id, { expectedVersion: other.version, title: "Aria", summary: "An author-reviewed observation." })).candidate;
    const head = (await services.get(scope, job.id)).job.expectedHeadRevisionId;
    expect((await services.decide(scope, job.id, other.id, { expectedVersion: edited.version, expectedHeadRevisionId: head }, false)).candidate.status).toBe("REJECTED");
    expect(await db.publication.count({ where: { novelId: job.novelId } })).toBe(0);
  });
  it("fences a delayed response after cancellation and exposes expired dispatch as uncertain", async () => {
    const { job } = await start(); let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const processor = createNovelDecodeProcessor({ db, ai: { generate: async () => { await blocked; return { generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify(await grounded(job.id)) }; } } });
    const running = processor.process(job.id);
    for (let i = 0; i < 50; i++) { if ((await db.novelDecodeJob.findUniqueOrThrow({ where: { id: job.id } })).status === "RUNNING") break; await new Promise(r => setTimeout(r, 10)); }
    await services.control(scope, job.id, "cancel"); release(); await running;
    expect((await services.get(scope, job.id)).job.status).toBe("CANCELLED"); expect(await db.novelDecodeCandidate.count({ where: { jobId: job.id } })).toBe(0);
    const next = (await start()).job;
    await db.novelDecodeJob.update({ where: { id: next.id }, data: { status: "RUNNING", leaseUntil: new Date(0), leaseToken: randomUUID() } });
    await processor.recoverExpired(); expect((await services.get(scope, next.id)).job.status).toBe("UNCERTAIN");
  });
  it("consolidates synopsis observations without replaying source chunks or exposing partial summaries", async () => {
    const { job } = await start(["SYNOPSIS"]); let sourceCalls = 0, synthesisCalls = 0;
    const processor = createNovelDecodeProcessor({ db, ai: { generate: async () => {
      const chunk = await db.novelDecodeChunk.findFirstOrThrow({ where: { jobId: job.id, processed: false }, orderBy: { ordinal: "asc" } });
      if (chunk.phase === "SOURCE") { sourceCalls++; return { generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify(await grounded(job.id, "SYNOPSIS")) }; }
      synthesisCalls++; const quote = "Aria entered the valley and helped Bram.";
      return { generationId: randomUUID(), model: "test-contract-only", content: JSON.stringify({ candidates: [{ area: "SYNOPSIS", title: "A journey into the valley", summary: "Aria overcomes fear and helps Bram.", subject: null, target: null, chapterNumber: 2, citations: [{ chapterVersionId: chunk.chapterVersionId, chapterNumber: 2, quote }], details: {} }], unknowns: [] }) };
    } } });
    await processor.process(job.id); expect((await services.candidates(scope, job.id, { take: 25, skip: 0 })).total).toBe(0);
    for (let i = 0; i < 8 && (await services.get(scope, job.id)).job.status !== "REVIEW"; i++) await processor.process(job.id);
    expect((await services.get(scope, job.id)).job.status).toBe("REVIEW"); expect(sourceCalls).toBe(2); expect(synthesisCalls).toBe(1);
    const visible = await services.candidates(scope, job.id, { take: 25, skip: 0 }); expect(visible.total).toBe(1); expect(visible.candidates[0]!.summary).toContain("overcomes fear");
    expect(await db.novelDecodeCandidate.count({ where: { jobId: job.id, internal: true, consumed: true } })).toBe(2);
  });
});
