import { randomUUID } from "node:crypto";
import type { NovelForgeDb, InputJsonValue } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { createAuditService, createPlatformServices, createPlanningServices, DECODE_AREAS, decodeChunks, type RetrievalServices, NotFoundError, ConflictError } from "@novelforge/ai-services";
import { parseNovelZip } from "./novel-zip.ts";
import { createManuscriptServices, stripHtmlTags } from "./manuscript.ts";
import { createRevisionServices } from "./revisions.ts";
import { applyNovelDecodeCandidate } from "./novel-decode-apply.ts";
import { validateDecodeDetails, type DecodeObservation } from "@novelforge/ai-services";

export interface DecodeScope { actorUserId: string; workspaceId: string }
type Tx = Omit<NovelForgeDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
/** Compose existing native services inside the same author-decision transaction. */
export function decodeTransactionDb(tx: Tx): NovelForgeDb {
  return new Proxy(tx, { get(target, key) {
    if (key === "$transaction") return async (fn: unknown) => typeof fn === "function" ? fn(decodeTransactionDb(tx)) : Promise.all(fn as Promise<unknown>[]);
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } }) as NovelForgeDb;
}
const json = (v: unknown) => v as InputJsonValue;
const normalizedAreas = (areas: string[]) => [...new Set(areas)].sort();
export function createNovelDecodeServices({ db, retrievalFor }: { db: NovelForgeDb; retrievalFor: (client: NovelForgeDb) => RetrievalServices }) {
  async function gate(scope: DecodeScope, capability: Capability, reader: Pick<NovelForgeDb, "membership"> = db) {
    const member = await reader.membership.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspaceId, userId: scope.actorUserId } } });
    if (!member) throw new NotFoundError("workspace"); requireCapability(member.role, capability);
  }
  async function load(scope: DecodeScope, jobId: string, reader: Pick<NovelForgeDb, "novelDecodeJob" | "membership"> = db, write = false) {
    await gate(scope, write ? "canon:manage" : "novel:read", reader);
    const job = await reader.novelDecodeJob.findFirst({ where: { id: jobId, workspaceId: scope.workspaceId }, include: { novel: { select: { title: true } } } });
    if (!job) throw new NotFoundError("decode job"); return job;
  }
  async function view(job: Awaited<ReturnType<typeof load>>) {
    const branch = await db.novelBranch.findUnique({ where: { id: job.sourceBranchId }, select: { headRevisionId: true } });
    const groups = await db.novelDecodeCandidate.groupBy({ by: ["area"], where: { jobId: job.id, internal: false }, _count: true });
    const sourceTotal = await db.novelDecodeChunk.count({ where: { jobId: job.id, phase: "SOURCE" } });
    const sourceDone = await db.novelDecodeChunk.count({ where: { jobId: job.id, phase: "SOURCE", processed: true } });
    return { id: job.id, novelId: job.novelId, novelTitle: job.novel.title, status: job.status, areas: job.areas, totalChunks: job.totalChunks, completedChunks: job.completedChunks,
      candidateCount: groups.reduce((n, g) => n + g._count, 0), errorCode: job.errorCode, unknowns: job.unknowns,
      coverage: Object.fromEntries((job.areas as string[]).map(area => [area, { processedChunks: sourceDone, totalChunks: sourceTotal, candidates: groups.find(g => g.area === area)?._count ?? 0, exhaustive: false }])),
      expectedHeadRevisionId: branch?.headRevisionId ?? null, createdAt: job.createdAt.toISOString() };
  }
  async function checkSources(tx: Tx, job: { novelId: string; sourceBranchId: string; sourceManifest: unknown }) {
    const manifest = job.sourceManifest as { chapters: { id: string; versionId: string }[] };
    const novel = await tx.novel.findUnique({ where: { id: job.novelId }, select: { currentBranchId: true } });
    if (novel?.currentBranchId !== job.sourceBranchId) throw new ConflictError("DECODE_SOURCE_CHANGED");
    const chapters = await tx.chapter.findMany({ where: { novelId: job.novelId }, select: { id: true, currentVersionId: true } });
    if (chapters.length !== manifest.chapters.length || manifest.chapters.some(p => !chapters.some(c => c.id === p.id && c.currentVersionId === p.versionId))) throw new ConflictError("DECODE_SOURCE_CHANGED");
  }
  return {
    async preview(scope: DecodeScope, buffer: Buffer) {
      await gate(scope, "novel:create"); const archive = await parseNovelZip(buffer);
      return { archiveHash: archive.archiveHash, warnings: archive.warnings, novels: archive.novels.map(n => ({ root: n.root, title: n.title, chapterCount: n.chapters.length, firstSourceNumber: n.chapters[0]!.sourceNumber, lastSourceNumber: n.chapters.at(-1)!.sourceNumber, hasCover: !!n.cover, warnings: n.warnings })) };
    },
    async start(scope: DecodeScope, input: { buffer: Buffer; root: string; archiveHash: string; areas: string[]; requestId: string }) {
      await gate(scope, "novel:create"); await gate(scope, "chapter:create"); await gate(scope, "canon:manage");
      const areas = normalizedAreas(input.areas);
      if (!areas.length || areas.some(a => !DECODE_AREAS.includes(a as typeof DECODE_AREAS[number]))) throw new ConflictError("DECODE_AREAS_INVALID");
      const archive = await parseNovelZip(input.buffer);
      if (archive.archiveHash !== input.archiveHash) throw new ConflictError("DECODE_ARCHIVE_CHANGED");
      const selected = archive.novels.find(n => n.root === input.root); if (!selected) throw new ConflictError("DECODE_ROOT_INVALID");
      const existing = await db.novelDecodeJob.findUnique({ where: { workspaceId_requestId: { workspaceId: scope.workspaceId, requestId: input.requestId } }, include: { novel: { select: { title: true } } } });
      const same = (j: { archiveHash: string; root: string; areas: unknown }) => j.archiveHash === archive.archiveHash && j.root === input.root && JSON.stringify(j.areas) === JSON.stringify(areas);
      if (existing) { if (!same(existing)) throw new ConflictError("DECODE_REQUEST_CHANGED"); return { job: await view(existing) }; }
      const id = await db.$transaction(async tx => {
        const lockKey = `${scope.workspaceId}:${input.requestId}`;
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const prior = await tx.novelDecodeJob.findUnique({ where: { workspaceId_requestId: { workspaceId: scope.workspaceId, requestId: input.requestId } } });
        if (prior) { if (!same(prior)) throw new ConflictError("DECODE_REQUEST_CHANGED"); return prior.id; }
        const client = decodeTransactionDb(tx), audit = createAuditService(client), platform = createPlatformServices({ db: client, audit });
        const { id: novelId } = await platform.createNovel({ ...scope, title: selected.title, slug: `import-${randomUUID()}` });
        const nativeScope = { ...scope, novelId };
        const manuscript = createManuscriptServices(client, audit);
        const imported = await manuscript.importChapterParts({ ...nativeScope, parts: selected.chapters.map(c => ({ title: c.title, rawText: c.rawText, htmlBody: c.htmlBody })) });
        if (imported.created !== selected.chapters.length) throw new ConflictError("DECODE_IMPORT_INCOMPLETE");
        if (selected.cover) await platform.putNovelCover({ ...nativeScope, ...selected.cover, sourceName: "Imported ZIP cover" });
        const metadata = selected.metadata;
        const synopsis = typeof metadata.synopsis === "string" ? metadata.synopsis : typeof metadata.description_site === "string" ? metadata.description_site : null;
        if (synopsis?.trim()) await createPlanningServices({ db: client, audit }).createSynopsis({ ...nativeScope, content: synopsis });
        // Source metadata is attribution, not verified story canon or public metadata.
        await tx.novelSettings.update({ where: { novelId }, data: { settings: { ...(await tx.novelSettings.findUniqueOrThrow({ where: { novelId } })).settings as object, importSource: json({ archiveHash: archive.archiveHash, root: selected.root, metadata, warnings: selected.warnings }) } } });
        const chapters = await tx.chapter.findMany({ where: { novelId }, orderBy: { number: "asc" }, include: { currentVersion: true } });
        const sourceManifest = { chapters: chapters.map((c, i) => ({ id: c.id, versionId: c.currentVersionId!, number: c.number, sourceNumber: selected.chapters[i]!.sourceNumber, filename: selected.chapters[i]!.filename })) };
        const chunkRows = chapters.flatMap(c => decodeChunks(stripHtmlTags(c.currentVersion!.content)).map(text => ({ chapterNumber: c.number, chapterVersionId: c.currentVersionId!, text })));
        const novel = await tx.novel.findUniqueOrThrow({ where: { id: novelId } });
        const job = await tx.novelDecodeJob.create({ data: { workspaceId: scope.workspaceId, actorUserId: scope.actorUserId, novelId, requestId: input.requestId, archiveHash: archive.archiveHash, root: selected.root, sourceBranchId: novel.currentBranchId!, areas, sourceManifest, totalChunks: chunkRows.length, unknowns: archive.warnings.concat(selected.warnings) } });
        await tx.novelDecodeChunk.createMany({ data: chunkRows.map((c, ordinal) => ({ ...c, ordinal, jobId: job.id })) });
        await audit.record({ actorUserId: scope.actorUserId, workspaceId: scope.workspaceId, action: "novel.decode.imported", entityType: "NovelDecodeJob", entityId: job.id, payload: { novelId, chapterCount: chapters.length, chunkCount: chunkRows.length, archiveHash: archive.archiveHash } });
        return job.id;
      }, { timeout: 120000, maxWait: 15000 });
      return { job: await view(await load(scope, id)) };
    },
    async list(scope: DecodeScope) {
      await gate(scope, "novel:read"); const jobs = await db.novelDecodeJob.findMany({ where: { workspaceId: scope.workspaceId }, orderBy: { createdAt: "desc" }, take: 20, include: { novel: { select: { title: true } } } });
      return { jobs: await Promise.all(jobs.map(view)) };
    },
    async get(scope: DecodeScope, id: string) { return { job: await view(await load(scope, id)) }; },
    async control(scope: DecodeScope, id: string, action: "retry" | "cancel") {
      await load(scope, id, db, true);
      await db.$transaction(async tx => {
        const job = await load(scope, id, tx, true);
        if (action === "retry") {
          if (!["FAILED", "UNCERTAIN"].includes(job.status)) throw new ConflictError("DECODE_RETRY_UNAVAILABLE");
          await checkSources(tx, job);
        } else if (!["QUEUED", "RUNNING", "FAILED", "UNCERTAIN"].includes(job.status)) throw new ConflictError("DECODE_CANCEL_UNAVAILABLE");
        const changed = await tx.novelDecodeJob.updateMany({ where: { id, epoch: job.epoch, status: job.status }, data: { status: action === "retry" ? "QUEUED" : "CANCELLED", epoch: { increment: 1 }, leaseToken: null, leaseUntil: null, errorCode: null } });
        if (changed.count !== 1) throw new ConflictError("DECODE_JOB_CHANGED");
        await tx.auditLog.create({ data: { actorUserId: scope.actorUserId, workspaceId: scope.workspaceId, action: `novel.decode.${action}`, entityType: "NovelDecodeJob", entityId: id } });
      }); return this.get(scope, id);
    },
    async candidates(scope: DecodeScope, id: string, filter: { area?: string; status?: string; take: number; skip: number }) {
      await load(scope, id); const where = { jobId: id, internal: false, ...(filter.area ? { area: filter.area } : {}), ...(filter.status ? { status: filter.status } : {}) };
      const [candidates, total] = await Promise.all([db.novelDecodeCandidate.findMany({ where, orderBy: [{ chapterNumber: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: filter.take, skip: filter.skip }), db.novelDecodeCandidate.count({ where })]);
      return { candidates, total };
    },
    async edit(scope: DecodeScope, id: string, candidateId: string, input: { expectedVersion: number; title: string; summary: string; subject?: string | null; target?: string | null; details?: Record<string, unknown> }) {
      await load(scope, id, db, true);
      const { expectedVersion, ...data } = input;
      return db.$transaction(async tx => {
        const job = await load(scope, id, tx, true);
        if (job.status !== "REVIEW") throw new ConflictError("DECODE_REVIEW_NOT_READY");
        const candidate = await tx.novelDecodeCandidate.findFirst({ where: { id: candidateId, jobId: id, internal: false, version: expectedVersion, status: "PENDING" } });
        if (!candidate) throw new ConflictError("DECODE_CANDIDATE_CHANGED");
        try { validateDecodeDetails({ ...candidate, ...data } as unknown as DecodeObservation); }
        catch { throw new ConflictError("DECODE_OUTPUT_INVALID"); }
        const changed = await tx.novelDecodeCandidate.updateMany({ where: { id: candidateId, jobId: id, internal: false, version: expectedVersion, status: "PENDING" }, data: { ...data, details: data.details ? json(data.details) : undefined, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictError("DECODE_CANDIDATE_CHANGED");
        await createAuditService(decodeTransactionDb(tx)).record({ ...scope, action: "novel.decode.candidate-edited", entityType: "NovelDecodeCandidate", entityId: candidateId });
        return { candidate: await tx.novelDecodeCandidate.findUniqueOrThrow({ where: { id: candidateId } }) };
      });
    },
    async decide(scope: DecodeScope, id: string, candidateId: string, input: { expectedVersion: number; expectedHeadRevisionId: string | null }, approve: boolean) {
      const initial = await load(scope, id, db, true);
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${initial.novelId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM novel_branches WHERE id = ${initial.sourceBranchId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM novel_decode_candidates WHERE id = ${candidateId}::uuid AND job_id = ${id}::uuid FOR UPDATE`;
        const job = await load(scope, id, tx, true);
        const candidate = await tx.novelDecodeCandidate.findFirst({ where: { id: candidateId, jobId: id, internal: false } });
        if (!candidate) throw new NotFoundError("candidate");
        const wanted = approve ? "APPROVED" : "REJECTED";
        if (candidate.status === wanted) return { candidate };
        if (candidate.status !== "PENDING" || candidate.version !== input.expectedVersion) throw new ConflictError("DECODE_CANDIDATE_CHANGED");
        if (job.status !== "REVIEW") throw new ConflictError("DECODE_REVIEW_NOT_READY");
        await checkSources(tx, job);
        const branch = await tx.novelBranch.findUniqueOrThrow({ where: { id: job.sourceBranchId } });
        if (branch.headRevisionId !== input.expectedHeadRevisionId) throw new ConflictError("DECODE_SOURCE_CHANGED");
        const client = decodeTransactionDb(tx), audit = createAuditService(client);
        const nativeScope = { ...scope, novelId: job.novelId };
        let result: Record<string, unknown> = {};
        if (approve) {
          await createRevisionServices({ db: client, audit }).createCheckpoint({ ...nativeScope, label: "Before applying decoded novel observation", note: "Author-confirmed source reconstruction; candidate and native mutation commit atomically.", expectedHeadRevisionId: branch.headRevisionId });
          result = await applyNovelDecodeCandidate({ db: client, scope: nativeScope, candidate: { ...candidate, citations: candidate.citations as unknown as { chapterVersionId: string; chapterNumber: number; quote: string }[], details: candidate.details as Record<string, unknown> }, retrieval: retrievalFor(client) });
        }
        const saved = await tx.novelDecodeCandidate.update({ where: { id: candidate.id }, data: { status: wanted, version: { increment: 1 }, result: json(result), decidedById: scope.actorUserId } });
        await audit.record({ ...scope, action: approve ? "novel.decode.candidate-approved" : "novel.decode.candidate-rejected", entityType: "NovelDecodeCandidate", entityId: candidate.id, payload: { novelId: job.novelId, area: candidate.area } });
        return { candidate: saved };
      }, { timeout: 60000, maxWait: 10000 });
    },
  };
}
export type NovelDecodeServices = ReturnType<typeof createNovelDecodeServices>;
