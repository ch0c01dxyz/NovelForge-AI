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
  /** NF-WF-053: stored summary state of the current head row. */
  summaryStatus: MemorySummaryStatus;
  summaryError: string | null;
}

/** NF-WF-053: summary lifecycle of a MemoryProjection row (Invariant 6).
 * Independent of MemoryBuildStatus — a FAILED summary never degrades
 * structural availability. */
export type MemorySummaryStatus = "SKIPPED" | "SUMMARIZING" | "FAILED" | "OK";

/** NF-WF-053 §13.2: who/what produced the stored summary. */
export interface MemorySummaryProvenance {
  summarizerVersion: string;
  modelProfile: string;
  promptVersion: string;
  /** Acting member recorded on the CURRENT selected Generation row. */
  actorUserId: string | null;
}

export interface MemoryBlock {
  scope: string;
  freshness: Exclude<MemoryFreshness, "MISSING">;
  sourceRevisionId: string;
  /** The source revision's number, for ordering and continuity checks. */
  sourceRevisionNumber: number;
  chapterCoverage: number[];
  structural: StructuralMemory;
  summary: string | null;
  summaryStatus: MemorySummaryStatus;
  summaryCoveredFactIds: string[];
  summaryProvenance: MemorySummaryProvenance | null;
  provenance: { revisionId: string; builtAt: string };
}

export interface RecallNovelResult {
  chapterMemory: MemoryBlock | null;
  recentMemory: MemoryBlock[];
  arcMemory: MemoryBlock | null;
  asOf: { revisionId: string; chapter: number | null };
}

/** BullMQ job payload for the memory-rebuild queue (F6).
 * NF-WF-053 additive fields: `force`/`retryIntentId` are set ONLY by the
 * explicit manual path (§8.2(1)); `actorUserId` records the enqueue-time
 * actor for execute-time authorization (§14.2). */
export interface MemoryRebuildJobData {
  workspaceId: string;
  novelId: string;
  scope: string;
  sourceRevisionId: string;
  force?: boolean;
  /** REQUIRED whenever force is true; one fresh UUID per accepted manual request. */
  retryIntentId?: string;
  actorUserId?: string;
}

/** NF-WF-052: per-scope exclusion reasons for the L5 global union read.
 * OVER_CAP is intentionally absent: over-cap arcs are reported only through
 * the bounded `overflow` aggregate, never entry-by-entry. */
export type GlobalMemoryExclusionReason = "MISSING" | "UNRESOLVABLE_SOURCE";

/** NF-WF-052: normalized deterministic ordering key. `id` is rendered per
 * source domain: saga uuid for saga-backed candidates, the scope string
 * `"arc:{uuid}"` for orphan-scope candidates. */
export interface GlobalMemoryOrderingKey {
  createdAt: string;
  id: string;
}

/** NF-WF-052: bounded aggregate for candidates beyond MEMORY_ARC_SCOPES_MAX. */
export interface GlobalMemoryOverflow {
  overCapCount: number;
  overCapArcIds: string[]; // first 50 in ordering order; overCapCount is authoritative
  firstExcludedOrderingKey: GlobalMemoryOrderingKey | null;
}

/** NF-WF-052: per-entry provenance (amendment A5). */
export interface GlobalMemoryProvenance {
  revisionId: string;
  builtAt: string;
  sourceRevisionNumber: number;
  arcScope: string;
  sagaId: string;
}

/** NF-WF-052: one included arc-scope entry (structural-only, Q1).
 * NF-WF-053: gains the four summary fields (§13.2). */
export interface ArcMemoryEntry {
  arcScope: string;
  sagaId: string;
  freshness: Exclude<MemoryFreshness, "MISSING">;
  sourceRevisionId: string;
  sourceRevisionNumber: number;
  chapterCoverage: number[];
  structural: StructuralMemory;
  summary: string | null;
  summaryStatus: MemorySummaryStatus;
  summaryCoveredFactIds: string[];
  summaryProvenance: MemorySummaryProvenance | null;
  provenance: GlobalMemoryProvenance;
}

export interface ExcludedArcScope {
  arcScope: string;
  sagaId: string;
  reason: GlobalMemoryExclusionReason;
}

/** NF-WF-052 anomalies amendment (2026-10-15): bounded non-canonical scope
 * diagnostics. Every surfaced entry means UNRESOLVABLE_SOURCE; the constant
 * reason is intentionally omitted from the entry shape. Raw sagaId is
 * diagnostic text and does not prove a valid/existing Saga identifier. */
export interface GlobalMemoryAnomalyEntry {
  arcScope: string;
  sagaId: string;
}

export interface GlobalMemoryAnomalies {
  /** Exact distinct non-canonical scope count for the inspected view
   * (grouped before COUNT; 1-row aggregate). */
  total: number;
  /** At most MEMORY_ARC_SCOPES_MAX entries, (MIN(created_at), scope) order,
   * raw text preserved. */
  surfaced: GlobalMemoryAnomalyEntry[];
  /** true iff total === surfaced.length. */
  complete: boolean;
}

/** NF-WF-052: L5 global-novel memory union read (pure composition; no
 * stored projection — Invariant 9). */
export interface GlobalMemoryResult {
  scopes: ArcMemoryEntry[];
  excluded: ExcludedArcScope[];
  overflow: GlobalMemoryOverflow;
  anomalies: GlobalMemoryAnomalies;
  asOf: { revisionId: string; chapter: null };
  arcScopesMax: number;
}

/**
 * NF-WF-053 §6: summarizer port invoked by `processRebuild` AFTER the
 * structural build/upsert and OUTSIDE any database transaction. The port
 * performs the model call (through the normal generate/manager/gateway
 * path) and returns the RAW model output; validation happens in
 * `@novelforge/memory` (fail-closed, before any summary write).
 */
export interface ArcSummarizerRequest {
  workspaceId: string;
  novelId: string;
  scope: string;
  /** MemoryProjection row id — the Generation artifactId. */
  rowId: string;
  structural: StructuralMemory;
  /** Enqueue-time actor; re-authorized at execution by the generate gate. */
  actorUserId: string;
}

/** Raw (unvalidated) model output plus durable call attribution. */
export interface ArcSummarizerRawOutput {
  content: string;
  generationId: string;
  modelProfile: string;
  promptVersion: string;
}

export interface MemorySummarizerPort {
  summarize(req: ArcSummarizerRequest): Promise<ArcSummarizerRawOutput>;
}

/** NF-WF-053 §13.1: registered entity used for the no-uncovered-entity
 * closure check. */
export interface RegisteredEntityName {
  id: string;
  name: string;
}

export type ArcSummaryValidationResult =
  | { valid: true; summary: string; coveredFactIds: string[] }
  | { valid: false; reason: string };
