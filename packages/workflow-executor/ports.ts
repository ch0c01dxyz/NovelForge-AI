/**
 * @novelforge/workflow-executor — injected dependency ports.
 *
 * The durable execution core never imports HTTP, BullMQ constructors, or
 * process lifecycle. Every external capability arrives through these
 * structural ports, so `apps/api` and `apps/worker` construct the executor
 * with their own dep sets and no relative import ever crosses the app
 * boundary (NF-WF-004 scope decision A).
 */
import type { ModelProfile, GenerationComponent } from "@novelforge/ai-core";

/**
 * The narrow port to the AI path. `AiServices.generate` satisfies it.
 * Declared structurally so tests can drive the executor without a gateway.
 */
export interface StepGenerator {
  generate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    task: string;
    component?: GenerationComponent;
    artifactId?: string;
    profile: ModelProfile;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ generationId: string; content: string; model: string }>;
}

/**
 * The narrow port to the knowledge index. `RetrievalServices.search`
 * satisfies it.
 */
export interface StepRetriever {
  search(input: {
    actorUserId: string;
    workspaceId: string;
    query: string;
    novelId?: string;
    mode?: unknown;
    readerChapter?: number;
    limit?: number;
    stepRunId?: string;
  }): Promise<{
    hits: Array<{
      chunkId: string;
      referenceId: string;
      referenceVersionId: string;
      referenceTitle: string;
      start: number;
      end: number;
      text: string;
      score: number;
      foundBy: string[];
    }>;
    withheldCount: number;
    retrievers: string[];
    mode: string;
    auditId: string;
  }>;
}

/**
 * A definition pinned to the version the run executes. Structural copy of
 * the shapes in `apps/api/src/services/definition-resolution.ts` — the
 * API passes its own resolvers, so the package never imports that module.
 */
export interface ResolvedAgent {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  skillKeys: string[];
  outputSchema: unknown;
  temperature: number | null;
  maxTokens: number | null;
}

export interface ResolvedSkill {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  outputSchema: unknown;
}

/** Definition resolution, injected so the worker reuses the API's paths. */
export interface DefinitionResolvers {
  resolveAgent(workspaceId: string, key: string): Promise<ResolvedAgent>;
  resolveSkill(workspaceId: string, key: string): Promise<ResolvedSkill>;
}

/**
 * The compiled context one RETRIEVAL step produces. Carries exactly what
 * the executor needs: the dispatch gate, the tier blocks with provenance,
 * the rendered text, and the retrieval metadata for the step row.
 */
export interface CompiledStepContext {
  canDispatch: boolean;
  blocks: Array<{
    tier: number;
    status: string;
    provenance: unknown;
    rows: unknown;
  }>;
  overflow?: { name: string; reason: string } | null;
  storyPosition: unknown;
  headRevisionId: string | null;
  referenceMeta?: { retrievers: string[]; withheldCount: number } | null;
  retrievalAuditId?: string | null;
  /** Rendered context text: what a later AGENT step receives as `$steps.k.text`. */
  text: string;
}

/**
 * The shared context compiler, bound by the API to its tier-reader
 * instances. The executor calls `compile`; it never sees the concrete
 * port types (which live in `apps/api`).
 */
export interface ContextCompilerPort {
  compile(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    instruction: string;
    contextQuery: string;
    mode: "AUTHOR";
    searchReferencesWithoutNovel: boolean;
  }): Promise<CompiledStepContext>;
}

/** Append-only audit sink. `createAuditService(db)` satisfies it. */
export interface AuditPort {
  record(entry: {
    actorUserId?: string | null;
    workspaceId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    payload?: unknown;
  }): Promise<void>;
}

/** Optional diagnostic sink for details that must not reach a client. */
export interface DebugPort {
  error?: (message: string, meta: unknown) => void;
}

// ---------------------------------------------------------------------------
// Queue surface for restart recovery (invariant 3).
// ---------------------------------------------------------------------------

/** The one queue this task owns. */
export const WORKFLOW_QUEUE_NAME = "workflow-runs";

/**
 * NF-WF-012: the one BullMQ queue for scheduled publications. The API
 * enqueues delayed fire-jobs (jobId = publication id); the worker
 * executes them deterministically (no AI — GAP-028 does not block it).
 * Defined here alongside WORKFLOW_QUEUE_NAME so the API and the worker
 * share one source of truth (the NF-WF-012 contract pins the location).
 */
export const PUBLICATION_QUEUE_NAME = "publication";

/**
 * NF-WF-012: the BullMQ job name for a scheduled publication fire. The
 * worker's processor handles every job on the publication queue; the
 * name is informational (observability) — the jobId (= publication id)
 * is the dedupe/cancellation key.
 */
export const PUBLICATION_JOB_NAME = "fire";

/**
 * NF-WF-012: the BullMQ job payload for a scheduled publication fire.
 * The job executes a stored intent: authorization was checked at
 * schedule time, so the worker does not re-authorize — the scheduler
 * (publishedById, stored on the row) is recorded as the actor.
 */
export interface PublicationJobData {
  publicationId: string;
  novelId: string;
  chapterId: string;
  /** UTC ISO-8601 the schedule was created for. */
  scheduledFor: string;
}

/**
 * Job defaults for the `workflow-runs` queue (NF-WF-004 invariant 1):
 * - `attempts: 1` — no BullMQ-level retry; recovery is the sweeper's job.
 * - `removeOnComplete: 1000` / `removeOnFail: 5000` — bounded Redis
 *   growth with recent jobs kept for debugging.
 */
export const WORKFLOW_DEFAULT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

/**
 * Worker-side: a slow AGENT model call must not be reaped as stalled
 * (5 minutes). A genuinely stalled lock re-queues through the claim
 * guard, which is safe because of invariant 3's RUNNING→PENDING reset.
 * This is a BullMQ Worker option (not a Queue option); it lives here so
 * the API and the worker share one source of truth.
 */
export const WORKFLOW_WORKER_LOCK_DURATION_MS = 300_000;

/** How often the sweeper scans for stale runs (invariant 3). */
export const WORKFLOW_SWEEPER_INTERVAL_MS = 60_000;

/** Age after which a PENDING run with no job is a crash orphan (invariant 3). */
export const WORKFLOW_PENDING_ORPHAN_AGE_MS = 5 * 60_000;

/**
 * NF-WF-031 (GAP-096): bounded retry for the `notifications` fan-out
 * queue. Notifications are best-effort social data (never story truth);
 * 3 attempts with exponential backoff (2s base, ~6s total window)
 * covers transient DB blips without hammering a struggling database.
 * At-most-once delivery is enforced by the partial unique index
 * `notifications_new_chapter_dedup_idx` (see migration
 * 20261007_nf_wf_031_notification_dedup) + `skipDuplicates` in the
 * fan-out handler — retry without dedup would double-deliver.
 * Lives here so the API (producer) and the worker (consumer) share one
 * source of truth.
 */
export const NOTIFICATION_FANOUT_MAX_ATTEMPTS = 3;

/** Base delay for exponential backoff between notification fan-out retries. */
export const NOTIFICATION_FANOUT_RETRY_BASE_MS = 2000;

/** Minimal BullMQ Job surface the sweeper needs. Structurally satisfied
 * by the real `Job` — no adapter, no BullMQ import in the package. */
export interface RecoveryJobPort {
  getState(): Promise<string>;
  remove(): Promise<void>;
}

/** Minimal BullMQ Queue surface the sweeper needs. */
export interface RecoveryQueuePort {
  getJob(jobId: string): Promise<RecoveryJobPort | undefined | null>;
  add(name: string, data: unknown, opts: { jobId: string }): Promise<unknown>;
}

/** What the sweeper did, for observability and tests. */
export interface RecoveryReport {
  resetRuns: string[];
  requeuedRuns: string[];
  orphanEnqueues: string[];
}
