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

/** Default L2 window: preceding chapters' scopes in recentMemory (F7). */
export const MEMORY_RECENT_CHAPTERS_DEFAULT = 10;

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
