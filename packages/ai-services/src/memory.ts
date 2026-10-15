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
  ARC_SCOPE_PREFIX,
  MEMORY_ARC_SCOPES_MAX,
  MEMORY_RECENT_CHAPTERS_DEFAULT,
  memoryRebuildJobId,
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
  type GlobalMemoryResult,
  type ArcMemoryEntry,
  type ExcludedArcScope,
  type GlobalMemoryOrderingKey,
} from "@novelforge/memory";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import { NotFoundError } from "./platform.ts";
import { checkedOutBranchId } from "./revisions.ts";

/**
 * Typed memory refusals. Carries the machine-readable memory code as the
 * envelope's error field (mapped in platform-routes' central handler, like
 * CanonApplicationError for 008).
 */
/**
 * Addendum §5 canonical-form guard: canonical uuid = lowercase hex,
 * hyphenated 8-4-4-4-12. Any arc scope whose id part does not match is a
 * non-canonical form (uppercase, braced, empty, non-uuid) — excluded as
 * UNRESOLVABLE_SOURCE, never ranked on divergent text.
 */
const CANONICAL_UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

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
  readGlobalMemory: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    opts: { asOfRevisionId?: string },
  ) => Promise<GlobalMemoryResult>;
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
      // NF-WF-020B (GAP-040): the as-of revision must be on the checked-out
      // branch (Invariant 5) — not hardcoded to `main`. Cross-branch as-of
      // is 400 INVALID_INPUT.
      const checkedOutId = await checkedOutBranchId(db, novelId);
      if (rev.branchId !== checkedOutId) {
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
      const jobId = memoryRebuildJobId(novelId, scope, sourceRevisionId);
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

  /** NF-WF-052: L5 global novel memory — deterministic bounded union read
      of arc:{sagaId} scopes. Disjoint candidate sources: S = every Saga row
      (sole owner of saga-backed candidates), P = orphan arc scopes only
      (projection scope with no backing saga row). One normalized ordering
      key (createdAt, id), one global boundary. Read-only; no storage, no
      model calls (Invariants 1/6/9/11). */
  async function readGlobalMemory(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    opts: { asOfRevisionId?: string } = {},
  ): Promise<GlobalMemoryResult> {
    await gate(workspaceId, novelId, actorUserId, "novel:read");
    const cap = MEMORY_ARC_SCOPES_MAX;

    // As-of resolution — identical semantics to recallNovel (Invariant 7).
    let asOfRevisionId = "";
    let asOf: { branchId: string; number: number } | undefined;
    if (opts.asOfRevisionId !== undefined) {
      const rev = await db.revision.findUnique({
        where: { id: opts.asOfRevisionId },
        select: { id: true, novelId: true, branchId: true, number: true },
      });
      if (!rev || rev.novelId !== novelId) throw new NotFoundError("revision");
      const checkedOutId = await checkedOutBranchId(db, novelId);
      if (rev.branchId !== checkedOutId) {
        throw new MemoryError(400, "INVALID_INPUT", "cross-branch as-of is not supported");
      }
      asOfRevisionId = rev.id;
      asOf = { branchId: rev.branchId, number: rev.number };
    } else {
      const head = await mainBranchHead(db, novelId);
      if (!head) {
        // recallNovel no-head behavior: 200 with an empty union (never 500).
        // Documented short circuit (anomalies amendment 2026-10-15): this
        // path performs NO anomaly/database-health inspection — an empty
        // view is not proof of database health; no metadata policy is added.
        return {
          scopes: [],
          excluded: [],
          overflow: { overCapCount: 0, overCapArcIds: [], firstExcludedOrderingKey: null },
          anomalies: { total: 0, surfaced: [], complete: true },
          asOf: { revisionId: "", chapter: null },
          arcScopesMax: cap,
        };
      }
      asOfRevisionId = head.headRevisionId;
    }

    interface Candidate {
      source: "S" | "P";
      createdAt: Date;
      sagaId: string; // embedded arc id (S: saga uuid; P: scope minus "arc:")
      arcScope: string; // "arc:{uuid}"
    }
    // S: every Saga row of the novel — sole owner of saga-backed candidates.
    const sagaRows = await db.$queryRaw<Array<{ id: string; created_at: Date }>>`
      SELECT id, created_at FROM sagas
      WHERE novel_id = ${novelId}
      ORDER BY created_at ASC, id ASC
      LIMIT ${cap}`;
    // P: orphan arc scopes ONLY (novel-scoped NOT EXISTS against sagas),
    // canonical uuid id part ONLY (addendum §5: non-canonical forms are
    // never ranked — see the detection query below). The LIMIT now applies
    // directly to the canonical population, keeping select/count/prefix in
    // exact agreement (same keyspace, same boundary predicates); canonical
    // text == Postgres uuid bytewise order.
    const orphanRows = await db.$queryRaw<Array<{ scope: string; first_created_at: Date }>>`
      SELECT scope, MIN(created_at) AS first_created_at
      FROM memory_projections
      WHERE novel_id = ${novelId} AND scope LIKE 'arc:%'
        AND substring(memory_projections.scope from 5) ~ ${CANONICAL_UUID_RE}
        AND NOT EXISTS (
          SELECT 1 FROM sagas s
          WHERE s.novel_id = memory_projections.novel_id
            AND s.id::text = substring(memory_projections.scope from 5))
      GROUP BY scope
      ORDER BY MIN(created_at) ASC, scope ASC
      LIMIT ${cap}`;
    // Addendum §5 defensive path — choice documented: EXCLUDE as
    // UNRESOLVABLE_SOURCE, not canonicalization (scope identity is
    // string-based in readBlock, so non-canonical text is never
    // re-attributed to its canonical saga). Properties:
    // - Never ranked: non-canonical keys never enter the merge, the
    //   window, or overflow (disjoint from P above by the regex; S
    //   candidates are canonical saga uuids — no double-surfacing).
    // - Never silent: surfaced in global.anomalies (anomalies amendment
    //   2026-10-15) — bounded + counted; every surfaced entry means
    //   UNRESOLVABLE_SOURCE.
    // - Bounded: surfaced ≤ cap entries; response stays O(cap) and never
    //   grows with the total scope count.
    // - An uppercase variant of a saga-backed scope surfaces here
    //   (raw-text anti-join finds no saga) while the saga itself remains
    //   owned and served by S via its canonical scope.
    // Exact distinct non-canonical scope count (grouped before COUNT; same
    // novel-scoped predicate as the bounded surfaced query below). One
    // aggregate row — not a constant-cost scan.
    const anomalyCountRows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT scope FROM memory_projections
        WHERE novel_id = ${novelId} AND scope LIKE 'arc:%'
          AND substring(memory_projections.scope from 5) !~ ${CANONICAL_UUID_RE}
          AND NOT EXISTS (
            SELECT 1 FROM sagas s
            WHERE s.novel_id = memory_projections.novel_id
              AND s.id::text = substring(memory_projections.scope from 5))
        GROUP BY scope
      ) noncanonical`;
    const anomalyTotal = Number(anomalyCountRows[0]!.n);
    const nonCanonicalRows = await db.$queryRaw<
      Array<{ scope: string; first_created_at: Date }>
    >`
      SELECT scope, MIN(created_at) AS first_created_at
      FROM memory_projections
      WHERE novel_id = ${novelId}
        AND scope LIKE 'arc:%'
        AND substring(memory_projections.scope from 5) !~ ${CANONICAL_UUID_RE}
        AND NOT EXISTS (
          SELECT 1 FROM sagas s
          WHERE s.novel_id = memory_projections.novel_id
            AND s.id::text = substring(memory_projections.scope from 5))
      GROUP BY scope
      ORDER BY MIN(created_at) ASC, scope ASC
      LIMIT ${cap}`;
    const anomalies = {
      total: anomalyTotal,
      surfaced: nonCanonicalRows.map((r) => ({
        arcScope: r.scope,
        sagaId: r.scope.slice(ARC_SCOPE_PREFIX.length),
      })),
      complete: anomalyTotal === nonCanonicalRows.length,
    };
    const sagas: Candidate[] = sagaRows.map((r) => ({
      source: "S",
      createdAt: r.created_at,
      sagaId: r.id,
      arcScope: `${ARC_SCOPE_PREFIX}${r.id}`,
    }));
    const orphans: Candidate[] = orphanRows.map((r) => ({
      source: "P",
      createdAt: r.first_created_at,
      sagaId: r.scope.slice(ARC_SCOPE_PREFIX.length),
      arcScope: r.scope,
    }));

    // Domain agreement (addendum §5): compare id parts as canonical uuid text.
    const uuidText = (c: Candidate): string =>
      c.source === "S" ? c.sagaId : c.arcScope.slice(ARC_SCOPE_PREFIX.length);
    const compareCandidates = (a: Candidate, b: Candidate): number => {
      const ta = a.createdAt.getTime();
      const tb = b.createdAt.getTime();
      if (ta !== tb) return ta < tb ? -1 : 1;
      const ua = uuidText(a);
      const ub = uuidText(b);
      return ua < ub ? -1 : ua > ub ? 1 : 0;
    };
    const candidates: Candidate[] = [];
    let i = 0;
    let j = 0;
    while (i < sagas.length || j < orphans.length) {
      if (
        j >= orphans.length ||
        (i < sagas.length && compareCandidates(sagas[i]!, orphans[j]!) <= 0)
      ) {
        candidates.push(sagas[i++]!);
      } else {
        candidates.push(orphans[j++]!);
      }
    }

    // Overflow — one global boundary, simple two-term sum, GROUP BY-scoped
    // P-side counting (addendum §3–§4). Only when the merged window is full
    // (fewer than CAP total candidates ⟹ both sources exhausted ⟹ zeroed
    // overflow).
    const overflow = {
      overCapCount: 0,
      overCapArcIds: [] as string[],
      firstExcludedOrderingKey: null as GlobalMemoryOrderingKey | null,
    };
    if (candidates.length >= cap) {
      const last = candidates[cap - 1]!;
      const lastCreatedAt = last.createdAt;
      const lastUuid = uuidText(last); // canonical uuid text
      const lastScope = `${ARC_SCOPE_PREFIX}${lastUuid}`; // P-domain projection
      // P-side count: DISTINCT orphan scopes beyond the GLOBAL boundary.
      // COUNT runs over the GROUP BY (one candidate = one scope), never raw
      // rows (one row per build attempt per revision per scope).
      const pBeyond = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*) AS n FROM (
          SELECT scope FROM memory_projections
          WHERE novel_id = ${novelId} AND scope LIKE 'arc:%'
            AND substring(memory_projections.scope from 5) ~ ${CANONICAL_UUID_RE}
            AND NOT EXISTS (
              SELECT 1 FROM sagas s
              WHERE s.novel_id = memory_projections.novel_id
                AND s.id::text = substring(memory_projections.scope from 5))
          GROUP BY scope
          HAVING (MIN(created_at), scope) > (${lastCreatedAt}, ${lastScope})
        ) beyond`;
      // S-side count (one row per saga; WHERE-level disjunction is exact).
      const sBeyond = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*) AS n FROM sagas
        WHERE novel_id = ${novelId}
          AND (created_at > ${lastCreatedAt}
               OR (created_at = ${lastCreatedAt} AND id > ${lastUuid}::uuid))`;
      overflow.overCapCount = Number(pBeyond[0]!.n) + Number(sBeyond[0]!.n);
      // Bounded overflow-prefix retrieval: ≤ 50 per side, app-side merge.
      const pOver = await db.$queryRaw<Array<{ scope: string; first_created_at: Date }>>`
        SELECT scope, MIN(created_at) AS first_created_at
        FROM memory_projections
        WHERE novel_id = ${novelId} AND scope LIKE 'arc:%'
          AND substring(memory_projections.scope from 5) ~ ${CANONICAL_UUID_RE}
          AND NOT EXISTS (
            SELECT 1 FROM sagas s
            WHERE s.novel_id = memory_projections.novel_id
              AND s.id::text = substring(memory_projections.scope from 5))
        GROUP BY scope
        HAVING (MIN(created_at), scope) > (${lastCreatedAt}, ${lastScope})
        ORDER BY MIN(created_at) ASC, scope ASC
        LIMIT 50`;
      const sOver = await db.$queryRaw<Array<{ id: string; created_at: Date }>>`
        SELECT id, created_at FROM sagas
        WHERE novel_id = ${novelId}
          AND (created_at > ${lastCreatedAt}
               OR (created_at = ${lastCreatedAt} AND id > ${lastUuid}::uuid))
        ORDER BY created_at ASC, id ASC
        LIMIT 50`;
      const pOverCands: Candidate[] = pOver.map((r) => ({
        source: "P",
        createdAt: r.first_created_at,
        sagaId: r.scope.slice(ARC_SCOPE_PREFIX.length),
        arcScope: r.scope,
      }));
      const sOverCands: Candidate[] = sOver.map((r) => ({
        source: "S",
        createdAt: r.created_at,
        sagaId: r.id,
        arcScope: `${ARC_SCOPE_PREFIX}${r.id}`,
      }));
      const mergedOver: Candidate[] = [];
      let oi = 0;
      let oj = 0;
      while (oi < sOverCands.length || oj < pOverCands.length) {
        if (
          oj >= pOverCands.length ||
          (oi < sOverCands.length && compareCandidates(sOverCands[oi]!, pOverCands[oj]!) <= 0)
        ) {
          mergedOver.push(sOverCands[oi++]!);
        } else {
          mergedOver.push(pOverCands[oj++]!);
        }
      }
      overflow.overCapArcIds = mergedOver.slice(0, 50).map((c) => c.sagaId);
      const first = mergedOver[0];
      if (first) {
        overflow.firstExcludedOrderingKey = {
          createdAt: first.createdAt.toISOString(),
          // id rendered per source domain: scope string for P, saga uuid for S.
          id: first.source === "P" ? first.arcScope : first.sagaId,
        };
      }
    }

    // Selection + composition (amendment A3/A5; per-scope exclusions only
    // MISSING / UNRESOLVABLE_SOURCE).
    const selected = candidates.slice(0, Math.min(cap, candidates.length));
    const scopes: ArcMemoryEntry[] = [];
    const excluded: ExcludedArcScope[] = [];
    // A5 guard (one bounded query for all selected scopes): a scope with any
    // projection row whose source revision no longer resolves is excluded as
    // UNRESOLVABLE_SOURCE — never merged, never a 500. FK-suppressed tooling
    // can produce such rows; deriveFreshness would null-deref on them.
    const selectedScopes = selected.map((c) => c.arcScope);
    const unresolvable = new Set<string>(
      selectedScopes.length === 0
        ? []
        : (
            await db.$queryRaw<Array<{ scope: string }>>`
            SELECT mp.scope FROM memory_projections mp
            LEFT JOIN revisions r ON r.id = mp.source_revision_id
            WHERE mp.novel_id = ${novelId}
              AND mp.scope = ANY(${selectedScopes})
              AND r.id IS NULL
            GROUP BY mp.scope`
          ).map((r) => r.scope),
    );
    for (const cand of selected) {
      if (unresolvable.has(cand.arcScope)) {
        excluded.push({ arcScope: cand.arcScope, sagaId: cand.sagaId, reason: "UNRESOLVABLE_SOURCE" });
        continue;
      }
      const block = await readBlock(novelId, cand.arcScope, asOf);
      if (!block) {
        // MISSING is a valid state (Invariant 9): saga with no rows, or (as-of)
        // no rows at or below R within the branch.
        excluded.push({ arcScope: cand.arcScope, sagaId: cand.sagaId, reason: "MISSING" });
        continue;
      }
      scopes.push({
        arcScope: block.scope,
        sagaId: cand.sagaId,
        freshness: block.freshness,
        sourceRevisionId: block.sourceRevisionId,
        sourceRevisionNumber: block.sourceRevisionNumber,
        chapterCoverage: block.chapterCoverage,
        structural: block.structural,
        summary: null,
        summaryStatus: "SKIPPED",
        provenance: {
          revisionId: block.provenance.revisionId,
          builtAt: block.provenance.builtAt,
          sourceRevisionNumber: block.sourceRevisionNumber,
          arcScope: block.scope,
          sagaId: cand.sagaId,
        },
      });
    }
    return {
      scopes,
      excluded,
      overflow,
      anomalies,
      asOf: { revisionId: asOfRevisionId, chapter: null },
      arcScopesMax: cap,
    };
  }

  return { recallNovel, getMemoryStatus, triggerRebuild, readAsOf, readGlobalMemory };
}

export type MemoryServices = ReturnType<typeof createMemoryServices>;
