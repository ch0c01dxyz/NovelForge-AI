/**
 * @novelforge/memory — shared types (NF-WF-009).
 *
 * Structural-only in 009 (Q1): `summary` is always null and
 * `summaryStatus` always "SKIPPED". The follow-up populates them under
 * Invariant 6's gate.
 */

/** Freshness values, derived per Invariant 2 — never stored. */
export type MemoryFreshness = "FRESH" | "STALE" | "FAILED" | "MISSING";

/** Build outcome stored per (novelId, scope, sourceRevisionId) (F1). */
export type MemoryBuildStatus = "OK" | "FAILED";

export interface StructuralFact {
  factId: string;
  entityId: string;
  predicate: string;
  /** Human-readable rendering; structured columns are authoritative. */
  statement: string;
  object: { entityId: string } | { text: string };
  validFromChapter: number | null;
  validUntilChapter: number | null;
}

export interface StructuralThread {
  threadId: string;
  kind: string;
  title: string;
  status: string;
}

export interface StructuralPromise {
  promiseId: string;
  title: string;
  status: string;
}

export interface StructuralMemory {
  facts: StructuralFact[];
  threads: StructuralThread[];
  promises: StructuralPromise[];
}

export interface MemoryScopeStatus {
  scope: string;
  freshness: MemoryFreshness;
  sourceRevisionId: string | null;
  /** Source revision number, null when MISSING. */
  sourceRevisionNumber: number | null;
  headRevisionId: string;
  headRevisionNumber: number;
  chapterCoverage: number[];
  lastError: string | null;
  attempts: number;
}

export interface MemoryBlock {
  scope: string;
  freshness: Exclude<MemoryFreshness, "MISSING">;
  sourceRevisionId: string;
  /** The source revision's number, for ordering and continuity checks. */
  sourceRevisionNumber: number;
  chapterCoverage: number[];
  structural: StructuralMemory;
  summary: null;
  summaryStatus: "SKIPPED";
  provenance: { revisionId: string; builtAt: string };
}

export interface RecallNovelResult {
  chapterMemory: MemoryBlock | null;
  recentMemory: MemoryBlock[];
  arcMemory: MemoryBlock | null;
  asOf: { revisionId: string; chapter: number | null };
}

/** BullMQ job payload for the memory-rebuild queue (F6). */
export interface MemoryRebuildJobData {
  workspaceId: string;
  novelId: string;
  scope: string;
  sourceRevisionId: string;
}
