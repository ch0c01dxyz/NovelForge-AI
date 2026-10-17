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
import { randomUUID } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import type {
  ArcSummarizerRawOutput,
  MemorySummarizerPort,
  StructuralMemory,
} from "./types.ts";
import {
  SUMMARIZER_VERSION,
  parseScope,
} from "./constants.ts";
import { validateArcSummary } from "./validate.ts";

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
 * per the dedup key (§10). An existing OK row is a no-op; a FAILED row is
 * retried (attempts increment). Writes OK or FAILED rows; never throws
 * for build failures (they become FAILED rows) — only for programmer
 * errors (unknown scope, missing revision).
 *
 * NF-WF-053: when `summarizer` is bound and the scope is an arc scope,
 * the summary lifecycle runs AFTER the structural write and OUTSIDE any
 * transaction (Invariant 6): dedup classification → structural upsert →
 * claim CAS → ONE model call → deterministic validation → identity-fenced
 * result CAS. Forced jobs carry a consumed `retryIntentId` (§8). Summary
 * failure never degrades structural availability.
 */
export async function processRebuild(
  db: NovelForgeDb,
  args: {
    workspaceId: string;
    novelId: string;
    scope: string;
    sourceRevisionId: string;
    force?: boolean;
    retryIntentId?: string;
    actorUserId?: string;
  },
  summarizer?: MemorySummarizerPort,
): Promise<{ deduped: boolean; ok: boolean }> {
  const { workspaceId, novelId, scope, sourceRevisionId, force, retryIntentId, actorUserId } = args;
  const isArc = parseScope(scope)?.kind === "arc";

  // Forced jobs without an intent are INVALID JOB DATA (§8.2(1)):
  // deterministic refusal — no structural work, no claim, no model call.
  if (force === true && typeof retryIntentId !== "string") {
    return { deduped: true, ok: false };
  }

  const existing = await db.memoryProjection.findUnique({
    where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId } },
  });
  // §10 dedup classification — all cases require a structurally OK row
  // (FAILED structural rows always re-attempt their structural build).
  if (existing && existing.buildStatus === "OK") {
    // Cases 1-2: non-arc scope, or no summarizer bound (structural-only DI).
    if (!isArc || !summarizer) {
      return { deduped: true, ok: true };
    }
    const currentVersion = existing.summarizerVersion === SUMMARIZER_VERSION;
    // Case 3: current-version OK cache hit — force never re-summarizes a good summary.
    if (currentVersion && existing.summaryStatus === "OK") {
      return { deduped: true, ok: true };
    }
    // Case 4: unforced duplicate delivery of a terminal current-version FAILED.
    if (currentVersion && existing.summaryStatus === "FAILED" && force !== true) {
      return { deduped: true, ok: false };
    }
    // Case 5 (§8.2(4), BEFORE any structural work): consumed forced intent.
    if (
      currentVersion &&
      existing.summaryStatus === "FAILED" &&
      force === true &&
      existing.summaryRetryIds.includes(retryIntentId as string)
    ) {
      return { deduped: true, ok: false };
    }
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  let built: BuiltMemory;
  try {
    built = await buildStructuralMemory(db, { workspaceId, novelId, scope, sourceRevisionId });
  } catch (err) {
    // Any throw during the build is recorded as a failed attempt —
    // never a false success (constitution §9). Summary columns stay
    // untouched (structural failure ≠ summary failure).
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

  // §9.2 step 2: structural upsert (first-row creation) BEFORE claiming.
  // Never sets, clears, or depends on any summary column.
  const row = await db.memoryProjection.upsert({
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

  // Chapter scopes (and structural-only executions) stop here.
  if (!isArc || !summarizer) {
    return { deduped: false, ok: true };
  }

  // §9.2 step 3: claim CAS (outside any transaction).
  const claimId = randomUUID();
  const claim = await db.memoryProjection.updateMany({
    where: {
      novelId,
      scope,
      sourceRevisionId,
      OR: [
        // Fresh, expired-claim, or pre-migration rows at ANY stored version.
        { summaryStatus: "SKIPPED" },
        // Version invalidation (§9.5): stale-version FAILED/OK re-summarize.
        {
          summaryStatus: { in: ["FAILED", "OK"] },
          summarizerVersion: { not: SUMMARIZER_VERSION },
        },
        // Forced arm (§8.2(2)): current-version FAILED with an unconsumed intent.
        ...(force === true
          ? [
              {
                summaryStatus: "FAILED" as const,
                NOT: { summaryRetryIds: { has: retryIntentId } },
              },
            ]
          : []),
      ],
    },
    data: {
      summaryStatus: "SUMMARIZING",
      summarizerVersion: SUMMARIZER_VERSION,
      summaryClaimedAt: new Date(),
      summaryClaimId: claimId,
      summaryError: null,
    },
  });
  if (claim.count === 0) {
    // Lost the race, no claimable state, or the intent is already consumed.
    return { deduped: false, ok: false };
  }

  // §6 item 1: the model call happens AFTER the claim committed and
  // OUTSIDE any database transaction (none is held here).
  let raw: ArcSummarizerRawOutput;
  try {
    raw = await summarizer.summarize({
      workspaceId,
      novelId,
      scope,
      rowId: row.id,
      structural: built.structural,
      ...(actorUserId ? { actorUserId } : { actorUserId: "" }),
    });
  } catch (err) {
    // Terminal FAILED: gateway terminal class, attempt-plan exhaustion, or
    // execute-time authorization refusal (zero calls/rows platform-wide —
    // the gate threw before the Generation row existed). No retry here.
    const message = err instanceof Error ? err.message : String(err);
    await resultCas("FAILED", { summaryError: `summarizer failed: ${message}` });
    return { deduped: false, ok: false };
  }

  // §13.1: fail-closed deterministic validation BEFORE any summary write.
  const registeredEntities = await db.storyEntity.findMany({
    where: { novelId },
    select: { id: true, name: true },
  });
  const verdict = validateArcSummary({
    raw: raw.content,
    structural: built.structural,
    registeredEntities,
  });
  if (!verdict.valid) {
    await resultCas("FAILED", { summaryError: verdict.reason });
    return { deduped: false, ok: false };
  }

  const written = await resultCas("OK", {
    summary: verdict.summary,
    summaryCoveredFactIds: verdict.coveredFactIds,
    summarizerModelProfile: raw.modelProfile,
    summarizerPromptVersion: raw.promptVersion,
    summaryGenerationId: raw.generationId,
  });
  // result.count === 0 → claim lost/expired/replaced: the result is
  // DISCARDED (§9.3); usage records remain retained (§12.3).
  return { deduped: false, ok: written > 0 };

  /** §9.3 identity-fenced result write; both arms share the fence. */
  async function resultCas(
    arm: "OK" | "FAILED",
    data: {
      summary?: string;
      summaryCoveredFactIds?: string[];
      summarizerModelProfile?: string;
      summarizerPromptVersion?: string;
      summaryGenerationId?: string;
      summaryError?: string;
    },
  ): Promise<number> {
    const result = await db.memoryProjection.updateMany({
      where: {
        novelId,
        scope,
        sourceRevisionId,
        summaryStatus: "SUMMARIZING",
        summaryClaimId: claimId,
        summarizerVersion: SUMMARIZER_VERSION,
      },
      data: {
        ...(arm === "OK"
          ? {
              summary: data.summary ?? null,
              summaryStatus: "OK",
              summaryError: null,
              summaryCoveredFactIds: data.summaryCoveredFactIds ?? [],
              summarizerModelProfile: (data.summarizerModelProfile ?? null) as never,
              summarizerPromptVersion: data.summarizerPromptVersion ?? null,
              summaryGenerationId: data.summaryGenerationId ?? null,
            }
          : {
              summary: null,
              summaryStatus: "FAILED",
              summaryError: data.summaryError ?? "summary failed",
              summaryCoveredFactIds: [],
              summaryGenerationId: null,
            }),
        summaryClaimId: null,
        // §8.2(3): a forced terminal outcome consumes the intent atomically.
        ...(force === true ? { summaryRetryIds: { push: retryIntentId as string } } : {}),
      },
    });
    return result.count;
  }
}
