/**
 * @novelforge/memory — freshness derivation (NF-WF-009, F1, Invariant 2).
 *
 * Freshness is computed, not asserted, from the stored build outcomes.
 * For a scope on the novel's main branch:
 * - Let H = the main branch head revision number, and r = the scope's
 *   newest row by source revision number.
 * - No rows → MISSING.
 * - r.buildStatus = FAILED → FAILED (surfacing lastError, attempts).
 * - r.buildStatus = OK and r.number = H → FRESH.
 * - r.buildStatus = OK and r.number != H → STALE (the projection does
 *   not reflect the head — including the r.number > H case, e.g. after
 *   a restore to an older revision).
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { MemoryFreshness, MemorySummaryStatus } from "./types.ts";
import { mainBranchHead } from "./settle.ts";

export interface ScopeFreshness {
  freshness: MemoryFreshness;
  sourceRevisionId: string | null;
  sourceRevisionNumber: number | null;
  headRevisionId: string;
  headRevisionNumber: number;
  chapterCoverage: number[];
  lastError: string | null;
  attempts: number;
  /** NF-WF-053: stored summary state of the selected row. */
  summaryStatus: MemorySummaryStatus;
  summaryError: string | null;
}

/**
 * Derive a scope's freshness against an explicit as-of revision R
 * (Invariant 7): the newest row with source-revision number ≤ R.number
 * within the same branch. Relative to R: row.number = R.number →
 * FRESH, older → STALE, FAILED rows → FAILED, none → MISSING.
 */
export async function deriveAsOfFreshness(
  db: NovelForgeDb,
  novelId: string,
  scope: string,
  branchId: string,
  revisionNumber: number,
): Promise<ScopeFreshness | null> {
  const head = await mainBranchHead(db, novelId);
  if (!head) return null;
  const rows = await db.memoryProjection.findMany({
    where: {
      novelId,
      scope,
      sourceRevision: { branchId, number: { lte: revisionNumber } },
    },
    select: {
      sourceRevisionId: true,
      buildStatus: true,
      lastError: true,
      attempts: true,
      chapterCoverage: true,
      summaryStatus: true,
      summaryError: true,
      sourceRevision: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) {
    return {
      freshness: "MISSING",
      sourceRevisionId: null,
      sourceRevisionNumber: null,
      headRevisionId: head.headRevisionId,
      headRevisionNumber: head.headRevisionNumber,
      chapterCoverage: [],
      lastError: null,
      attempts: 0,
      summaryStatus: "SKIPPED",
      summaryError: null,
    };
  }
  let newest = rows[0]!;
  for (const row of rows) {
    if (row.sourceRevision.number > newest.sourceRevision.number) newest = row;
  }
  const newestRow = newest;
  if (newestRow.buildStatus === "FAILED") {
    return {
      freshness: "FAILED",
      sourceRevisionId: newestRow.sourceRevisionId,
      sourceRevisionNumber: newestRow.sourceRevision.number,
      headRevisionId: head.headRevisionId,
      headRevisionNumber: head.headRevisionNumber,
      chapterCoverage: newestRow.chapterCoverage,
      lastError: newestRow.lastError,
      attempts: newestRow.attempts,
      summaryStatus: newestRow.summaryStatus,
      summaryError: newestRow.summaryError,
    };
  }
  const freshness: MemoryFreshness =
    newestRow.sourceRevision.number === revisionNumber ? "FRESH" : "STALE";
  return {
    freshness,
    sourceRevisionId: newestRow.sourceRevisionId,
    sourceRevisionNumber: newestRow.sourceRevision.number,
    headRevisionId: head.headRevisionId,
    headRevisionNumber: head.headRevisionNumber,
    chapterCoverage: newestRow.chapterCoverage,
    lastError: null,
    attempts: newestRow.attempts,
    summaryStatus: newestRow.summaryStatus,
    summaryError: newestRow.summaryError,
  };
}

/**
 * Derive a scope's freshness against the novel's main-branch head.
 * Returns null when the novel has no main branch head (no revisions).
 */
export async function deriveFreshness(
  db: NovelForgeDb,
  novelId: string,
  scope: string,
): Promise<ScopeFreshness | null> {
  const head = await mainBranchHead(db, novelId);
  if (!head) return null;
  const rows = await db.memoryProjection.findMany({
    where: { novelId, scope },
    select: {
      sourceRevisionId: true,
      buildStatus: true,
      lastError: true,
      attempts: true,
      chapterCoverage: true,
      summaryStatus: true,
      summaryError: true,
      sourceRevision: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) {
    return {
      freshness: "MISSING",
      sourceRevisionId: null,
      sourceRevisionNumber: null,
      headRevisionId: head.headRevisionId,
      headRevisionNumber: head.headRevisionNumber,
      chapterCoverage: [],
      lastError: null,
      attempts: 0,
      summaryStatus: "SKIPPED",
      summaryError: null,
    };
  }
  // Newest row by source revision number (F1).
  let newest = rows[0]!;
  for (const row of rows) {
    if (row.sourceRevision.number > newest.sourceRevision.number) newest = row;
  }
  if (newest.buildStatus === "FAILED") {
    return {
      freshness: "FAILED",
      sourceRevisionId: newest.sourceRevisionId,
      sourceRevisionNumber: newest.sourceRevision.number,
      headRevisionId: head.headRevisionId,
      headRevisionNumber: head.headRevisionNumber,
      chapterCoverage: newest.chapterCoverage,
      lastError: newest.lastError,
      attempts: newest.attempts,
      summaryStatus: newest.summaryStatus,
      summaryError: newest.summaryError,
    };
  }
  const freshness: MemoryFreshness =
    newest.sourceRevision.number === head.headRevisionNumber ? "FRESH" : "STALE";
  return {
    freshness,
    sourceRevisionId: newest.sourceRevisionId,
    sourceRevisionNumber: newest.sourceRevision.number,
    headRevisionId: head.headRevisionId,
    headRevisionNumber: head.headRevisionNumber,
    chapterCoverage: newest.chapterCoverage,
    lastError: null,
    attempts: newest.attempts,
    summaryStatus: newest.summaryStatus,
    summaryError: newest.summaryError,
  };
}
