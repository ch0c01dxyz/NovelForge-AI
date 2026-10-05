/**
 * Memory services (NF-WF-009): revision-derived chapter/arc memory.
 *
 * Structural-only (Q1): deterministic projections of canon facts,
 * thread states, and promise states, pinned to source revisions.
 * The deterministic core lives in `@novelforge/memory` (shared with
 * the worker); this module adds the API-layer wiring: `recallNovel`
 * for the context compiler, status reads, rebuild triggers (BullMQ),
 * and as-of reads — with server-side auth (Invariant 11).
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  MEMORY_RECENT_CHAPTERS_DEFAULT,
  chapterScope,
  parseScope,
  deriveFreshness,
  deriveAsOfFreshness,
  mainBranchHead,
  settleRev,
  type MemoryBlock,
  type MemoryFreshness,
  type MemoryScopeStatus,
  type RecallNovelResult,
} from "@novelforge/memory";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import { NotFoundError } from "./platform.ts";

/**
 * Typed memory refusals. Carries the machine-readable memory code as the
 * envelope's error field (mapped in platform-routes' central handler, like
 * CanonApplicationError for 008).
 */
export class MemoryError extends Error {
  constructor(
    readonly statusCode: 400 | 404,
    readonly code: "SIMULATION_SOURCE_REFUSED" | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "MemoryError";
  }
}

export interface MemoryQueue {
  add(name: string, data: Record<string, unknown>, opts: { jobId: string }): Promise<unknown>;
}

export interface RecallNovelOptions {
  chapter: number;
  revisionId?: string;
  recentChapters?: number;
}

export function createMemoryServices(deps: {
  db: NovelForgeDb;
  queue: MemoryQueue;
}): {
  recallNovel: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    opts: RecallNovelOptions,
  ) => Promise<RecallNovelResult>;
  getMemoryStatus: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
  ) => Promise<MemoryScopeStatus[]>;
  triggerRebuild: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    body: { scope?: string; revisionId?: string; simulation?: boolean },
  ) => Promise<{ accepted: true; scopes: string[] }>;
  readAsOf: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    query: { chapter?: number; revisionId?: string },
  ) => Promise<RecallNovelResult>;
} {
  const { db, queue } = deps;

  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
  }

  /** Read one scope's block (null when MISSING). As-of mode (Invariant 7):
      the newest row with source-revision number ≤ the requested
      revision's, within the same branch — never a row newer than R. */
  async function readBlock(
    novelId: string,
    scope: string,
    asOf?: { branchId: string; number: number },
  ): Promise<MemoryBlock | null> {
    const freshness = asOf
      ? await deriveAsOfFreshness(db, novelId, scope, asOf.branchId, asOf.number)
      : await deriveFreshness(db, novelId, scope);
    if (!freshness || freshness.freshness === "MISSING" || !freshness.sourceRevisionId) {
      return null;
    }
    const row = await db.memoryProjection.findUnique({
      where: {
        novelId_scope_sourceRevisionId: {
          novelId,
          scope,
          sourceRevisionId: freshness.sourceRevisionId,
        },
      },
    });
    if (!row) return null;
    return {
      scope,
      freshness: freshness.freshness as Exclude<MemoryFreshness, "MISSING">,
      sourceRevisionId: row.sourceRevisionId,
      sourceRevisionNumber: freshness.sourceRevisionNumber ?? 0,
      chapterCoverage: row.chapterCoverage,
      structural: row.structural as unknown as MemoryBlock["structural"],
      summary: null,
      summaryStatus: "SKIPPED",
      provenance: { revisionId: row.sourceRevisionId, builtAt: row.builtAt.toISOString() },
    };
  }

  async function chapterIdFor(novelId: string, chapterNumber: number): Promise<string | null> {
    const chapter = await db.chapter.findFirst({
      where: { novelId, number: chapterNumber },
      select: { id: true },
    });
    return chapter?.id ?? null;
  }

  async function recallNovel(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    opts: RecallNovelOptions,
  ): Promise<RecallNovelResult> {
    await gate(workspaceId, novelId, actorUserId, "novel:read");
    const recentLimit = Math.min(
      opts.recentChapters ?? MEMORY_RECENT_CHAPTERS_DEFAULT,
      MEMORY_RECENT_CHAPTERS_DEFAULT,
    );

    // Resolve the as-of revision: explicit revisionId wins; else the
    // main head (F9). Cross-branch revisionIds are rejected (F4); the
    // revision's (branchId, number) pins the row selection for as-of
    // reads so they never return a row newer than requested (Invariant 7).
    let asOfRevisionId: string;
    let asOf: { branchId: string; number: number } | undefined;
    const asOfChapter: number | null = opts.chapter;
    if (opts.revisionId) {
      const rev = await db.revision.findUnique({
        where: { id: opts.revisionId },
        select: { id: true, novelId: true, branchId: true, number: true },
      });
      if (!rev || rev.novelId !== novelId) throw new NotFoundError("revision");
      const branch = await db.novelBranch.findUnique({
        where: { id: rev.branchId },
        select: { name: true },
      });
      if (!branch || branch.name !== "main") {
        throw new MemoryError(400, "INVALID_INPUT", "cross-branch as-of is not supported");
      }
      asOfRevisionId = rev.id;
      asOf = { branchId: rev.branchId, number: rev.number };
    } else {
      const head = await mainBranchHead(db, novelId);
      if (!head) {
        return {
          chapterMemory: null,
          recentMemory: [],
          arcMemory: null,
          asOf: { revisionId: "", chapter: opts.chapter },
        };
      }
      asOfRevisionId = head.headRevisionId;
    }

    const chapterId = await chapterIdFor(novelId, opts.chapter);
    const chapterMemory = chapterId ? await readBlock(novelId, chapterScope(chapterId), asOf) : null;

    // L2: preceding chapters' scopes, ascending, bounded (F7).
    const recentMemory: MemoryBlock[] = [];
    for (let n = Math.max(1, opts.chapter - recentLimit); n < opts.chapter; n++) {
      const id = await chapterIdFor(novelId, n);
      if (!id) continue;
      const block = await readBlock(novelId, chapterScope(id), asOf);
      if (block) recentMemory.push(block);
    }

    // L3/L4: the chapter's arc scope via outline nodes.
    let arcMemory: MemoryBlock | null = null;
    const chapterRow = await db.chapter.findFirst({
      where: { novelId, number: opts.chapter },
      select: { id: true },
    });
    const node = chapterRow
      ? await db.outlineNode.findFirst({
          where: { novelId, chapterId: chapterRow.id },
          select: { sagaId: true },
        })
      : null;
    if (node?.sagaId) {
      arcMemory = await readBlock(novelId, `arc:${node.sagaId}`, asOf);
    }

    return {
      chapterMemory,
      recentMemory,
      arcMemory,
      asOf: { revisionId: asOfRevisionId, chapter: asOfChapter },
    };
  }

  async function getMemoryStatus(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
  ): Promise<MemoryScopeStatus[]> {
    await gate(workspaceId, novelId, actorUserId, "novel:read");
    // Scopes = every scope with at least one projection row.
    const scopes = await db.memoryProjection.findMany({
      where: { novelId },
      select: { scope: true },
      distinct: ["scope"],
    });
    const statuses: MemoryScopeStatus[] = [];
    for (const { scope } of scopes) {
      const f = await deriveFreshness(db, novelId, scope);
      if (!f) continue;
      statuses.push({
        scope,
        freshness: f.freshness,
        sourceRevisionId: f.sourceRevisionId,
        sourceRevisionNumber: f.sourceRevisionNumber,
        headRevisionId: f.headRevisionId,
        headRevisionNumber: f.headRevisionNumber,
        chapterCoverage: f.chapterCoverage,
        lastError: f.lastError,
        attempts: f.attempts,
      });
    }
    return statuses;
  }

  async function triggerRebuild(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    body: { scope?: string; revisionId?: string; simulation?: boolean },
  ): Promise<{ accepted: true; scopes: string[] }> {
    await gate(workspaceId, novelId, actorUserId, "novel:update");
    // Invariant 8 (enforceable scope): an explicit simulation source
    // is refused; no memory row is written.
    if (body.simulation === true) {
      throw new MemoryError(
        400,
        "SIMULATION_SOURCE_REFUSED",
        "simulation sources cannot feed memory",
      );
    }
    if (body.scope !== undefined) {
      const parsed = parseScope(body.scope);
      if (!parsed) {
        throw new MemoryError(400, "INVALID_INPUT", "unknown memory scope");
      }
      // The scope's id must belong to this novel (tenant isolation).
      if (parsed.kind === "chapter") {
        const chapter = await db.chapter.findFirst({
          where: { id: parsed.id, novelId },
          select: { id: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
      } else {
        const saga = await db.saga.findFirst({
          where: { id: parsed.id, novelId },
          select: { id: true },
        });
        if (!saga) throw new NotFoundError("saga");
      }
    }
    let sourceRevisionId = body.revisionId;
    if (sourceRevisionId !== undefined) {
      const rev = await db.revision.findUnique({
        where: { id: sourceRevisionId },
        select: { id: true, novelId: true },
      });
      if (!rev || rev.novelId !== novelId) throw new NotFoundError("revision");
    } else {
      const head = await mainBranchHead(db, novelId);
      if (!head) {
        throw new MemoryError(400, "INVALID_INPUT", "novel has no revisions");
      }
      sourceRevisionId = head.headRevisionId;
    }

    // Resolve scopes: explicit scope, else every scope with a STALE
    // projection at the head (Invariant 9: materialize when consumed —
    // a scope with no rows stays MISSING until consumed).
    let scopes: string[];
    if (body.scope) {
      scopes = [body.scope];
    } else {
      const rows = await db.memoryProjection.findMany({
        where: { novelId },
        select: { scope: true },
        distinct: ["scope"],
      });
      scopes = [];
      for (const { scope } of rows) {
        const f = await deriveFreshness(db, novelId, scope);
        if (f && f.freshness === "STALE") scopes.push(scope);
      }
    }

    for (const scope of scopes) {
      const jobId = `memory-rebuild:${novelId}:${scope}:${sourceRevisionId}`;
      await queue.add(
        "rebuild",
        { workspaceId, novelId, scope, sourceRevisionId },
        { jobId },
      );
    }
    return { accepted: true, scopes };
  }

  async function readAsOf(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    query: { chapter?: number; revisionId?: string },
  ): Promise<RecallNovelResult> {
    await gate(workspaceId, novelId, actorUserId, "novel:read");
    if (query.revisionId !== undefined) {
      return recallNovel(actorUserId, workspaceId, novelId, {
        chapter: query.chapter ?? 0,
        revisionId: query.revisionId,
      });
    }
    if (query.chapter !== undefined) {
      // Chapter N resolves to its settle revision (Invariant 5).
      const settled = await settleRev(db, novelId, query.chapter);
      if (!settled) {
        throw new MemoryError(400, "INVALID_INPUT", "chapter is not settled");
      }
      return recallNovel(actorUserId, workspaceId, novelId, {
        chapter: query.chapter,
        revisionId: settled.revisionId,
      });
    }
    throw new MemoryError(400, "INVALID_INPUT", "chapter or revisionId is required");
  }

  return { recallNovel, getMemoryStatus, triggerRebuild, readAsOf };
}

export type MemoryServices = ReturnType<typeof createMemoryServices>;
