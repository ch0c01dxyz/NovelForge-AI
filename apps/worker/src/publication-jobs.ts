/**
 * NF-WF-012 publication worker: the `publication` BullMQ consumer plus the
 * startup reconciliation pass.
 *
 * The worker (not the API) owns this queue: it runs the single startup
 * reconciliation pass (the API may scale horizontally) and executes the
 * delayed fire-jobs. Execution is deterministic — status flip + pin, no
 * AI — so GAP-028 (production worker AI wiring) does not block it.
 *
 * Module boundary: this module must not import `apps/api/src` (the
 * workflow-jobs.ts rule). The fire transition therefore carries its own
 * minimal head-advance for the C3 LOW path — see `advanceHeadLow` — and
 * its own review-gate check. Both are documented mirrors of the API-side
 * originals; any divergence is a bug (GAP-047).
 *
 * Fire semantics (Invariant 5):
 * - Row still SCHEDULED and due → run the SCHEDULED→PUBLISHED transition
 *   as the scheduling actor (publishedById on the row; authorization was
 *   checked at schedule time — the job executes a stored intent).
 * - Otherwise the job succeeds as a no-op (cancelled/rescheduled after
 *   enqueue — exactly-once is not required, idempotence is).
 * - Review is checked at FIRE time against the version current then.
 * - Deterministic refusal (REVIEW_STALE / HARD_POLICY_VIOLATION at fire
 *   time, or the novel having been archived) → row to UNPUBLISHED,
 *   audit-logged, job succeeds (no zombie schedule).
 * - Transient failure (exception) → the job fails (attempts: 1); the
 *   failed record is retained (removeOnFail: 5000) and the row stays
 *   SCHEDULED; the next startup reconciliation re-enqueues it.
 */
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import {
  PUBLICATION_QUEUE_NAME,
  PUBLICATION_JOB_NAME,
  WORKFLOW_DEFAULT_JOB_OPTIONS,
  type PublicationJobData,
} from "@novelforge/workflow-executor";
import {
  isCoveredTable,
  projectionsForTables,
} from "@novelforge/story-versioning";
import type { WorkerLogger } from "./worker.ts";

export type FireOutcome =
  | { outcome: "published"; publicationId: string }
  | { outcome: "refused"; publicationId: string; code: string }
  | { outcome: "noop"; publicationId: string };

/** Minimal Prisma transaction client surface the fire needs. */
type FireTx = Omit<
  NovelForgeDb,
  | "$connect"
  | "$disconnect"
  | "$on"
  | "$transaction"
  | "$use"
  | "$extends"
>;

/**
 * Minimal C3 head-advance for the LOW path, mirroring `advanceHead`
 * (apps/api/src/services/revisions.ts) — branch lock first (C4), head
 * CAS, revision insert, branch head update, change set + items, rebuild
 * intents. Publication mutations are always LOW (no pre-mutation
 * checkpoint/snapshot); the HIGH path is not mirrored here.
 *
 * Any divergence from advanceHead's LOW path is a bug (GAP-047): the two
 * must produce the same revision chain shape. The UNIQUE(branchId,
 * number) constraint turns a race into a deterministic conflict, never
 * silent corruption.
 */
async function advanceHeadLow(
  tx: FireTx,
  input: {
    workspaceId: string;
    novelId: string;
    actorUserId: string | null;
    operation: string;
    tables: readonly string[];
    items: {
      entityType: string;
      entityId: string;
      operation: "CREATE" | "UPDATE" | "DELETE";
    }[];
  },
): Promise<{ revisionId: string; number: number }> {
  for (const table of input.tables) {
    if (!isCoveredTable(table)) {
      throw new Error(`outside story restore scope: ${table}`);
    }
  }
  const locked = await tx.$queryRawUnsafe<
    { id: string; head_revision_id: string | null }[]
  >(
    `SELECT "id", "head_revision_id" FROM "novel_branches"
     WHERE "novel_id" = $1 AND "name" = 'main' FOR UPDATE`,
    input.novelId,
  );
  const branch = locked[0];
  if (!branch) throw new Error("no baseline exists for this novel");
  let number = 1;
  if (branch.head_revision_id !== null) {
    const head = await tx.revision.findUnique({
      where: { id: branch.head_revision_id },
      select: { number: true },
    });
    if (!head) throw new Error("stale revision: head revision is missing");
    number = head.number + 1;
  }
  const revision = await tx.revision.create({
    data: {
      workspaceId: input.workspaceId,
      novelId: input.novelId,
      branchId: branch.id,
      parentRevisionId: branch.head_revision_id,
      number,
      origin: "MANUAL",
      createdById: input.actorUserId,
    },
    select: { id: true, number: true },
  });
  await tx.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: revision.id },
  });
  const changeSet = await tx.changeSet.create({
    data: {
      revisionId: revision.id,
      workspaceId: input.workspaceId,
      novelId: input.novelId,
    },
    select: { id: true },
  });
  if (input.items.length > 0) {
    await tx.changeSetItem.createMany({
      data: input.items.map((i) => ({
        changeSetId: changeSet.id,
        entityType: i.entityType,
        entityId: i.entityId,
        operation: i.operation,
      })),
    });
  }
  const projections = projectionsForTables(input.tables);
  if (projections.length > 0) {
    await tx.derivedRebuildIntent.createMany({
      data: projections.map((projection: string) => ({
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        projection,
        sourceRevisionId: revision.id,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
  }
  return { revisionId: revision.id, number: revision.number };
}

/**
 * The Invariant 3 gate, worker-side mirror of `assertPublishReviewGate`
 * (apps/api/src/services/manuscript.ts). Returns the refusal code rather
 * than throwing a typed error — the worker branches on it (refused →
 * UNPUBLISHED, job succeeds).
 */
async function checkReviewGate(
  tx: FireTx,
  currentVersionId: string,
): Promise<{ ok: true } | { ok: false; code: "REVIEW_STALE" | "HARD_POLICY_VIOLATION" }> {
  const receipt = await tx.finalTextReview.findUnique({
    where: { chapterVersionId: currentVersionId },
    select: { verdict: true },
  });
  if (!receipt) return { ok: false, code: "REVIEW_STALE" };
  if (receipt.verdict === "FAIL") return { ok: false, code: "HARD_POLICY_VIOLATION" };
  return { ok: true };
}

/**
 * Fire one scheduled publication: the SCHEDULED→PUBLISHED transition as
 * the scheduling actor. Idempotent — a row that is no longer SCHEDULED
 * (cancelled/rescheduled after enqueue) or not yet due is a successful
 * no-op.
 *
 * Deterministic refusals move the row to UNPUBLISHED (audit-logged) and
 * succeed; anything else that throws is a transient failure for BullMQ
 * (the row stays SCHEDULED for reconciliation retry).
 */
export async function fireScheduledPublication(
  db: NovelForgeDb,
  publicationId: string,
  opts: { logger?: WorkerLogger } = {},
): Promise<FireOutcome> {
  const outcome = await db.$transaction(async (tx) => {
    const row = await tx.publication.findUnique({
      where: { id: publicationId },
      select: {
        id: true,
        novelId: true,
        chapterId: true,
        status: true,
        scheduledFor: true,
        publishedById: true,
        novel: { select: { status: true, workspaceId: true } },
      },
    });
    if (!row) throw new Error(`publication ${publicationId} not found`);
    if (row.status !== "SCHEDULED")
      return { outcome: "noop" as const, publicationId };
    if (row.scheduledFor && row.scheduledFor.getTime() > Date.now()) {
      return { outcome: "noop" as const, publicationId };
    }
    // Serialize against concurrent mutations (the saveChapter precedent).
    await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${row.chapterId} FOR UPDATE`;
    const chapter = await tx.chapter.findUnique({
      where: { id: row.chapterId },
      select: { status: true, currentVersionId: true },
    });
    if (!chapter) throw new Error(`chapter ${row.chapterId} not found`);

    const workspaceId = row.novel.workspaceId;
    const refuse = async (
      code: "REVIEW_STALE" | "HARD_POLICY_VIOLATION" | "NOVEL_ARCHIVED",
    ): Promise<FireOutcome> => {
      const advanced = await advanceHeadLow(tx, {
        workspaceId,
        novelId: row.novelId,
        actorUserId: row.publishedById,
        operation: "publication.unpublished",
        tables: ["publications"],
        items: [
          { entityType: "Publication", entityId: row.id, operation: "UPDATE" },
        ],
      });
      await tx.publication.update({
        where: { id: row.id },
        data: {
          status: "UNPUBLISHED",
          scheduledFor: null,
          revisionId: advanced.revisionId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: row.publishedById,
          workspaceId,
          action: "publication.unpublished",
          entityType: "Publication",
          entityId: row.id,
          payload: { reason: code, lapsedSchedule: true } as never,
        },
      });
      opts.logger?.info("scheduled publication refused deterministically", {
        publicationId: row.id,
        code,
      });
      return { outcome: "refused" as const, publicationId: row.id, code };
    };

    if (row.novel.status === "ARCHIVED") return refuse("NOVEL_ARCHIVED");
    // No version at fire time reads as "no receipt for the current
    // version" (constitution §11).
    if (!chapter.currentVersionId) return refuse("REVIEW_STALE");
    const gate = await checkReviewGate(tx, chapter.currentVersionId);
    if (!gate.ok) return refuse(gate.code);

    const advanced = await advanceHeadLow(tx, {
      workspaceId,
      novelId: row.novelId,
      actorUserId: row.publishedById,
      operation: "publication.published",
      tables: ["publications", "chapters"],
      items: [
        { entityType: "Publication", entityId: row.id, operation: "UPDATE" },
        { entityType: "Chapter", entityId: row.chapterId, operation: "UPDATE" },
      ],
    });
    // Q4: automatic DRAFT→ACTIVE on first publish. `novels` is outside
    // restore scope, so the flip rides the transaction but is not a
    // listed table (same rule as the API service).
    const novelActivated = row.novel.status === "DRAFT";
    if (novelActivated) {
      await tx.novel.update({
        where: { id: row.novelId },
        data: { status: "ACTIVE" },
      });
    }
    if (chapter.status !== "PUBLISHED") {
      await tx.chapter.update({
        where: { id: row.chapterId },
        data: { status: "PUBLISHED" },
      });
    }
    await tx.publication.update({
      where: { id: row.id },
      data: {
        status: "PUBLISHED",
        chapterVersionId: chapter.currentVersionId,
        revisionId: advanced.revisionId,
        publishedAt: new Date(),
        scheduledFor: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: row.publishedById,
        workspaceId,
        action: "publication.published",
        entityType: "Publication",
        entityId: row.id,
        payload: {
          novelId: row.novelId,
          chapterId: row.chapterId,
          pinnedVersionId: chapter.currentVersionId,
          firedBySchedule: true,
          ...(novelActivated ? { novelActivated: true } : {}),
        } as never,
      },
    });
    return { outcome: "published" as const, publicationId: row.id };
  });
  return outcome;
}

/** Minimal BullMQ Queue surface the reconciler needs. */
export interface PublicationReconQueue {
  add(
    name: string,
    data: PublicationJobData,
    opts: { jobId: string; delay?: number },
  ): Promise<unknown>;
  getJob(
    jobId: string,
  ): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined>;
}

/**
 * Startup reconciliation (Invariant 5): scan ALL SCHEDULED rows (not only
 * due ones — a future-scheduled row whose job was lost is the real crash
 * window) and ensure each has a live job:
 * - job missing → enqueue (immediate if due, remaining delay if future);
 * - job in `failed` state (retained transient failure) → remove the
 *   failed record FIRST (re-adding against it is a silent no-op — the
 *   P2-6 hazard), then enqueue;
 * - job in any other state (delayed, waiting, active, completed) → leave
 *   alone (no double-enqueue).
 * - `unknown` state (no retrievable state — effectively lost) →
 *   re-enqueue; the fire is idempotent so this is safe.
 *
 * Single startup pass, owned by the worker (P3-ob) — no concurrent
 * reconciler, so remove-then-enqueue is race-free here.
 */
export async function reconcileScheduledPublications({
  db,
  queue,
  logger,
}: {
  db: NovelForgeDb;
  queue: PublicationReconQueue;
  logger?: WorkerLogger;
}): Promise<{ scanned: number; reenqueued: number; leftAlone: number }> {
  const rows = await db.publication.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, novelId: true, chapterId: true, scheduledFor: true },
  });
  let reenqueued = 0;
  let leftAlone = 0;
  for (const row of rows) {
    const job = await queue.getJob(row.id);
    const state = job ? await job.getState() : undefined;
    if (!job || state === "failed" || state === "unknown") {
      if (job) await job.remove();
      const delay = row.scheduledFor
        ? Math.max(0, row.scheduledFor.getTime() - Date.now())
        : 0;
      const data: PublicationJobData = {
        publicationId: row.id,
        novelId: row.novelId,
        chapterId: row.chapterId,
        scheduledFor: row.scheduledFor?.toISOString() ?? new Date().toISOString(),
      };
      await queue.add(PUBLICATION_JOB_NAME, data, {
        jobId: row.id,
        delay,
      });
      reenqueued++;
      logger?.info("publication schedule reconciled", {
        publicationId: row.id,
        previousState: state ?? "missing",
        delayMs: delay,
      });
    } else {
      leftAlone++;
    }
  }
  return { scanned: rows.length, reenqueued, leftAlone };
}

export interface PublicationWorkerDeps {
  createDb: (url: string) => NovelForgeDb;
  createConnection: (url: string) => IORedis;
  createQueue: (name: string, connection: IORedis) => PublicationReconQueue & {
    close(): Promise<void>;
  };
  createWorker: (
    queueName: string,
    handler: (job: { data: PublicationJobData; id?: string }) => Promise<void>,
    connection: IORedis,
  ) => {
    on(event: "error", cb: (err: Error) => void): void;
    on(event: "failed", cb: (job: { id?: string } | undefined, err: Error) => void): void;
    on(event: string, cb: (...args: never[]) => void): void;
    close(): Promise<void>;
  };
  probeTimeoutMs: number;
  logger: WorkerLogger;
}

export function defaultPublicationWorkerDeps(
  logger: WorkerLogger,
): PublicationWorkerDeps {
  return {
    createDb,
    createConnection: (url) =>
      new IORedis(url, { maxRetriesPerRequest: null, enableOfflineQueue: false }),
    createQueue: (name, connection) =>
      new Queue(name, {
        connection: connection as never,
        defaultJobOptions: { ...WORKFLOW_DEFAULT_JOB_OPTIONS },
      }) as never,
    createWorker: (queueName, handler, connection) =>
      new Worker(queueName, handler as never, {
        connection: connection as never,
        concurrency: 4,
      }),
    probeTimeoutMs: 10_000,
    logger,
  };
}

export interface PublicationWorkerApp {
  readonly started: boolean;
  readonly stopped: boolean;
  stop(): Promise<void>;
}

export async function startPublicationWorkerApp(
  env: { DATABASE_URL: string; REDIS_URL: string },
  logger: WorkerLogger,
  deps: Partial<PublicationWorkerDeps> = {},
): Promise<PublicationWorkerApp> {
  const d: PublicationWorkerDeps = { ...defaultPublicationWorkerDeps(logger), ...deps };
  let started = false;
  let stopped = false;

  const db = d.createDb(env.DATABASE_URL);
  const connection = d.createConnection(env.REDIS_URL);

  const onConnError = (err: Error) => {
    if (!stopped) d.logger.warn("publication redis connection error", { message: err.message });
  };
  connection.on("error", onConnError);

  const available = await (async () => {
    const deadline = Date.now() + d.probeTimeoutMs;
    do {
      try {
        await connection.ping();
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    } while (Date.now() < deadline);
    return false;
  })();

  if (!available) {
    d.logger.warn("redis unavailable; publication worker not started", {});
    connection.disconnect();
    await db.$disconnect();
    return {
      get started() {
        return started;
      },
      get stopped() {
        return stopped;
      },
      async stop() {
        stopped = true;
      },
    };
  }

  // The worker owns the single startup reconciliation pass (P3-ob).
  const queue = d.createQueue(PUBLICATION_QUEUE_NAME, connection);
  try {
    const report = await reconcileScheduledPublications({ db, queue, logger: d.logger });
    d.logger.info("publication startup reconciliation complete", report);
  } catch (err) {
    // Reconciliation must not prevent the consumer from starting: a
    // failed pass is logged loudly, and the next restart retries.
    // (A missed schedule here is still safer than no consumer at all.)
    d.logger.error("publication startup reconciliation failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const worker = d.createWorker(
    PUBLICATION_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (!data || typeof data.publicationId !== "string") {
        throw new Error("malformed publication job data");
      }
      const outcome = await fireScheduledPublication(db, data.publicationId, {
        logger: d.logger,
      });
      d.logger.info("publication job processed", {
        publicationId: data.publicationId,
        outcome: outcome.outcome,
        ...(outcome.outcome === "refused" ? { code: outcome.code } : {}),
      });
      // Deterministic refusals succeed (the row is UNPUBLISHED); transient
      // failures throw above → BullMQ retains the failed record and the
      // row stays SCHEDULED for the next reconciliation.
    },
    connection,
  );
  worker.on("error", (err) => {
    if (!stopped) d.logger.warn("publication worker error", { message: err.message });
  });
  worker.on("failed", (job, err) => {
    if (!stopped)
      d.logger.error("publication job failed (transient — row stays SCHEDULED)", {
        jobId: job?.id,
        message: err.message,
      });
  });

  started = true;
  d.logger.info("publication worker started", { queue: PUBLICATION_QUEUE_NAME });

  return {
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await worker.close();
      await queue.close();
      connection.disconnect();
      await db.$disconnect();
    },
  };
}
