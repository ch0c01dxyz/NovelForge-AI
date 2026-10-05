/**
 * @novelforge/memory — deterministic structural rebuild (NF-WF-009).
 *
 * The rebuild is a pure function of (novelId, scope, sourceRevisionId):
 * rebuilding the same scope from the same source revision yields the
 * same structural content (Invariant 1). No model calls — structural
 * memory only (Q1).
 *
 * As-of semantics: facts are filtered by validity window against the
 * scope's chapter context, and by existence at the source revision
 * (createdAt <= R.createdAt). A superseded fact is included iff its
 * successor was created after R (i.e. it was still live at R) —
 * superseded-then facts appear only with their validity windows, per
 * the existing stateAt patterns (Invariant 7). Rejected proposals
 * never create canon facts, so the ACTIVE-filtered read excludes them
 * by construction (Invariant 3).
 *
 * Threads/promises carry no validity windows; they are included by
 * creation time (createdAt <= R.createdAt) with their current status.
 * Status changes after R are an accepted structural approximation,
 * documented here.
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { StructuralMemory } from "./types.ts";
import { parseScope } from "./constants.ts";

export interface BuiltMemory {
  structural: StructuralMemory;
  chapterCoverage: number[];
}

/**
 * Resolve the chapter context for a scope: the chapter number the
 * scope's facts are windowed against, and the chapter coverage list.
 */
async function chapterContext(
  db: NovelForgeDb,
  novelId: string,
  scope: string,
): Promise<{ chapterNumber: number | null; coverage: number[] }> {
  const parsed = parseScope(scope);
  if (!parsed) return { chapterNumber: null, coverage: [] };
  if (parsed.kind === "chapter") {
    const chapter = await db.chapter.findUnique({
      where: { id: parsed.id },
      select: { number: true, novelId: true },
    });
    if (!chapter || chapter.novelId !== novelId) return { chapterNumber: null, coverage: [] };
    const chapters = await db.chapter.findMany({
      where: { novelId, number: { lte: chapter.number } },
      select: { number: true },
      orderBy: { number: "asc" },
    });
    return { chapterNumber: chapter.number, coverage: chapters.map((c) => c.number) };
  }
  // Arc scope: chapters via outline nodes in the saga.
  const nodes = await db.outlineNode.findMany({
    where: { novelId, sagaId: parsed.id, chapterId: { not: null } },
    select: { chapter: { select: { number: true } } },
  });
  const numbers = [
    ...new Set(
      nodes.map((n) => n.chapter?.number).filter((n): n is number => typeof n === "number"),
    ),
  ].sort((a, b) => a - b);
  return {
    chapterNumber: numbers.length > 0 ? (numbers[numbers.length - 1] as number) : null,
    coverage: numbers,
  };
}

/**
 * Build the deterministic structural memory for (novelId, scope) as of
 * sourceRevisionId. Throws on unknown scope or missing revision.
 */
export async function buildStructuralMemory(
  db: NovelForgeDb,
  args: { workspaceId: string; novelId: string; scope: string; sourceRevisionId: string },
): Promise<BuiltMemory> {
  const { novelId, scope, sourceRevisionId } = args;
  const parsed = parseScope(scope);
  if (!parsed) throw new Error(`unknown memory scope: ${scope}`);
  const revision = await db.revision.findUnique({
    where: { id: sourceRevisionId },
    select: { id: true, number: true, createdAt: true, novelId: true },
  });
  if (!revision || revision.novelId !== novelId) {
    throw new Error(`source revision not found for novel: ${sourceRevisionId}`);
  }
  const { chapterNumber, coverage } = await chapterContext(db, novelId, scope);

  // Candidate facts: existed at R, window covers the chapter context.
  const facts = await db.canonFact.findMany({
    where: {
      novelId,
      createdAt: { lte: revision.createdAt },
      ...(chapterNumber !== null
        ? {
            OR: [{ validFromChapter: null }, { validFromChapter: { lte: chapterNumber } }],
          }
        : {}),
    },
    select: {
      id: true,
      entityId: true,
      predicate: true,
      statement: true,
      objectEntityId: true,
      objectText: true,
      status: true,
      validFromChapter: true,
      validUntilChapter: true,
      createdAt: true,
      supersededById: true,
      supersededBy: { select: { createdAt: true } },
    },
    orderBy: [{ entityId: "asc" }, { predicate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const structuralFacts = [];
  for (const f of facts) {
    // Validity window must cover the chapter context (when known).
    if (
      chapterNumber !== null &&
      f.validUntilChapter !== null &&
      f.validUntilChapter <= chapterNumber
    ) {
      continue;
    }
    // As-of status: live at R iff ACTIVE now, or superseded after R.
    if (f.status !== "ACTIVE") {
      const successorAt = f.supersededBy?.createdAt ?? null;
      if (!successorAt || successorAt <= revision.createdAt) continue;
    }
    structuralFacts.push({
      factId: f.id,
      entityId: f.entityId,
      predicate: f.predicate,
      statement: f.statement,
      object:
        f.objectEntityId !== null
          ? { entityId: f.objectEntityId }
          : { text: f.objectText ?? "" },
      validFromChapter: f.validFromChapter,
      validUntilChapter: f.validUntilChapter,
    });
  }

  const threads = await db.storyThread.findMany({
    where: { novelId, createdAt: { lte: revision.createdAt } },
    select: { id: true, kind: true, title: true, status: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const promises = await db.storyPromise.findMany({
    where: { novelId, createdAt: { lte: revision.createdAt } },
    select: { id: true, title: true, status: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return {
    structural: {
      facts: structuralFacts,
      threads: threads.map((t) => ({
        threadId: t.id,
        kind: String(t.kind),
        title: t.title,
        status: String(t.status),
      })),
      promises: promises.map((p) => ({
        promiseId: p.id,
        title: p.title,
        status: String(p.status),
      })),
    },
    chapterCoverage: coverage,
  };
}

/**
 * Process one rebuild for (novelId, scope, sourceRevisionId): idempotent
 * per the dedup key. An existing OK row is a no-op; a FAILED row is
 * retried (attempts increment). Writes OK or FAILED rows; never throws
 * for build failures (they become FAILED rows) — only for programmer
 * errors (unknown scope, missing revision).
 */
export async function processRebuild(
  db: NovelForgeDb,
  args: {
    workspaceId: string;
    novelId: string;
    scope: string;
    sourceRevisionId: string;
  },
): Promise<{ deduped: boolean; ok: boolean }> {
  const { workspaceId, novelId, scope, sourceRevisionId } = args;
  const existing = await db.memoryProjection.findUnique({
    where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId } },
  });
  if (existing && existing.buildStatus === "OK") {
    return { deduped: true, ok: true };
  }
  const attempts = (existing?.attempts ?? 0) + 1;
  let built: BuiltMemory;
  try {
    built = await buildStructuralMemory(db, { workspaceId, novelId, scope, sourceRevisionId });
  } catch (err) {
    // Any throw during the build is recorded as a failed attempt —
    // never a false success (constitution §9).
    const message = err instanceof Error ? err.message : String(err);
    await db.memoryProjection.upsert({
      where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId } },
      update: { buildStatus: "FAILED", lastError: message, attempts, builtAt: new Date() },
      create: {
        workspaceId,
        novelId,
        scope,
        sourceRevisionId,
        buildStatus: "FAILED",
        lastError: message,
        attempts,
        structural: { facts: [], threads: [], promises: [] },
        chapterCoverage: [],
      },
    });
    return { deduped: false, ok: false };
  }
  await db.memoryProjection.upsert({
    where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId } },
    update: {
      buildStatus: "OK",
      lastError: null,
      attempts,
      structural: built.structural as never,
      chapterCoverage: built.chapterCoverage,
      builtAt: new Date(),
    },
    create: {
      workspaceId,
      novelId,
      scope,
      sourceRevisionId,
      buildStatus: "OK",
      attempts,
      structural: built.structural as never,
      chapterCoverage: built.chapterCoverage,
    },
  });
  return { deduped: false, ok: true };
}
