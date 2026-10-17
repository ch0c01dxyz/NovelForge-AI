import { createHash } from "node:crypto";
/**
 * @novelforge/memory — revision-derived chapter/arc memory (NF-WF-009).
 *
 * Named constants for the memory rebuild pipeline. The BullMQ
 * `memory-rebuild` queue is the durable transport (NF-WF-004 pattern);
 * rebuilds are bounded async work, never in-request.
 */

/** BullMQ queue name for memory rebuild jobs (F6). */
export const MEMORY_REBUILD_QUEUE_NAME = "memory-rebuild";

/** Max BullMQ attempts per rebuild job before the intent goes FAILED (F6). */
export const MEMORY_REBUILD_MAX_ATTEMPTS = 5;

/** Base backoff between rebuild retries, exponential (F6). */
export const MEMORY_REBUILD_RETRY_BASE_MS = 1000;

/**
 * NF-WF-051: interval between memory reconciliation sweeps in the worker
 * (mid-run Redis-loss recovery, re-running the NF-WF-030 startup pass).
 * Matches PUBLICATION_SWEEPER_INTERVAL_MS / WORKFLOW_SWEEPER_INTERVAL_MS.
 */
export const MEMORY_RECONCILE_INTERVAL_MS = 60_000;

/** Default L2 window: preceding chapters' scopes in recentMemory (F7). */
export const MEMORY_RECENT_CHAPTERS_DEFAULT = 10;

/** NF-WF-052: max arc-scope candidates considered per global memory read
 * (hard bound, not configuration plumbing). */
export const MEMORY_ARC_SCOPES_MAX = 20;

/** Scope key prefixes (Invariant 9). */
export const CHAPTER_SCOPE_PREFIX = "chapter:";
export const ARC_SCOPE_PREFIX = "arc:";

export function chapterScope(chapterId: string): string {
  return `${CHAPTER_SCOPE_PREFIX}${chapterId}`;
}

export function arcScope(arcId: string): string {
  return `${ARC_SCOPE_PREFIX}${arcId}`;
}

export function parseScope(scope: string): { kind: "chapter" | "arc"; id: string } | null {
  if (scope.startsWith(CHAPTER_SCOPE_PREFIX) && scope.length > CHAPTER_SCOPE_PREFIX.length) {
    return { kind: "chapter", id: scope.slice(CHAPTER_SCOPE_PREFIX.length) };
  }
  if (scope.startsWith(ARC_SCOPE_PREFIX) && scope.length > ARC_SCOPE_PREFIX.length) {
    return { kind: "arc", id: scope.slice(ARC_SCOPE_PREFIX.length) };
  }
  return null;
}

/** Shared deterministic BullMQ-safe identity; scopes contain colons. */
export function memoryRebuildJobId(novelId: string, scope: string, sourceRevisionId: string): string {
  return `memory-rebuild-${createHash("sha256").update(JSON.stringify([novelId, scope, sourceRevisionId])).digest("hex")}`;
}

/**
 * NF-WF-053 §8.1a: force-specific transport identity for manual forced
 * retries. Includes the retry intent so a fresh intent is a fresh jobId —
 * BullMQ's retained-job duplicate suppression can never silently drop a
 * NEW forced request. BullMQ-level redelivery re-presents the SAME job
 * (same intent), funneling into the row-local consumed-intent check.
 */
export function memoryForcedRebuildJobId(
  novelId: string,
  scope: string,
  sourceRevisionId: string,
  retryIntentId: string,
): string {
  return `memory-rebuild-forced-${createHash("sha256").update(JSON.stringify([novelId, scope, sourceRevisionId, retryIntentId])).digest("hex")}`;
}

/** NF-WF-053: summarizer cache-key component (Invariant 6 item 6). */
export const SUMMARIZER_VERSION = "arc-sum-v1";

/** NF-WF-053: prompt template version, persisted on row + Generation. */
export const SUMMARIZER_PROMPT_VERSION = "arc-sum-prompt-v1";

/**
 * NF-WF-053 §11.5: per-logical-call gateway attempt cap for summaries,
 * passed to generate as `maxAttempts`. Sized to cover the author's seven
 * configured text candidates so later fallbacks stay reachable; a smaller
 * value would silently truncate the candidate plan.
 */
export const MEMORY_SUMMARY_MAX_ATTEMPTS = 7;

/**
 * NF-WF-053 §9.4: age bound for one live claim (crashed-claimant
 * recovery). Bounds the duplicate-call window of ONE claim only, not the
 * cumulative number of gateway calls (§11.3 honesty).
 */
export const MEMORY_SUMMARY_CLAIM_TTL_MS = 10 * 60_000;

/** NF-WF-053 §13.1: validated summary text length ceiling. */
export const MEMORY_SUMMARY_MAX_CHARS = 6000;

/** NF-WF-053 §13.1: required section headings in the generated summary. */
export const ARC_SUMMARY_SECTION_HEADINGS = ["## Arc state", "## Threads", "## Promises"] as const;

/** NF-WF-053 §12.1: Generation.task pin for arc summary calls. */
export const MEMORY_ARC_SUMMARY_TASK = "MEMORY_ARC_SUMMARY";
