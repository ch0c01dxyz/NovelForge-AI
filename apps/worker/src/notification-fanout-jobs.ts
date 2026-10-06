/**
 * NF-WF-019C notification fan-out worker: the `notifications` BullMQ
 * consumer for the pinned `novel.chapter_published` event.
 *
 * The publish paths (the API immediate publish + the 012 worker fire)
 * enqueue a fan-out job AFTER the PUBLISHED commit and never await
 * fan-out — publish latency does not grow with follower count
 * (Invariant 7). This worker resolves the notification set, honors
 * preferences, and inserts notifications in bounded batches.
 *
 * Notification set: novel followers ∪ author followers (the novel's
 * `createdBy` user), deduped — a user following both gets ONE
 * notification. Users who disabled NEW_CHAPTER are skipped at insert
 * time (absent preference row = pinned default ON, Klein Q5).
 *
 * Module boundary: this module must not import `apps/api/src` (the
 * workflow-jobs.ts rule). The preference-default semantics are
 * deliberately mirrored here; any divergence from the API's
 * `isEnabled` (services/notifications.ts) is a bug.
 *
 * Fan-out semantics:
 * - The chapter must be PUBLISHED at execution time; otherwise the job
 *   succeeds as a no-op (no fabricated notifications — Invariant 7).
 * - Batches are bounded (≤ 500 rows per createMany).
 * - Notifications are best-effort social data, never story truth: a
 *   transient failure throws (attempts: 1 — the failed record is
 *   retained for debugging); there is no startup reconciliation for
 *   fan-out, so a crash between the PUBLISHED commit and the enqueue
 *   loses that event's notifications. This is documented, not silent.
 */
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { WORKFLOW_DEFAULT_JOB_OPTIONS } from "@novelforge/workflow-executor";
import type { WorkerLogger } from "./worker.ts";

export const NOTIFICATION_QUEUE_NAME = "notifications";
export const NOTIFICATION_FANOUT_JOB_NAME = "fanout";

/** Bounded fan-out batch size (Invariant 7: ≤ 500/batch). */
export const FANOUT_BATCH_SIZE = 500;

/**
 * The pinned `novel.chapter_published` event payload carried by the
 * fan-out job (mirrors the API's NotificationFanoutJobData — the two
 * must stay shape-identical; the worker cannot import apps/api/src).
 */
export interface NotificationFanoutJobData {
  eventName: "novel.chapter_published";
  publicationId: string;
  novelId: string;
  chapterId: string;
}

export interface FanoutOutcome {
  notified: number;
  /** Targets skipped (opted-out of NEW_CHAPTER). */
  skipped: number;
}

/**
 * Resolve the fan-out targets for a published chapter and insert one
 * NEW_CHAPTER notification per recipient (deduped across novel-follow
 * and author-follow). Honors NEW_CHAPTER preferences at insert time.
 */
export async function fanoutChapterPublished(
  db: NovelForgeDb,
  data: NotificationFanoutJobData,
  opts: { batchSize?: number } = {},
): Promise<FanoutOutcome> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? FANOUT_BATCH_SIZE, 1), FANOUT_BATCH_SIZE);
  if (data.eventName !== "novel.chapter_published") {
    throw new Error(`unknown notification event ${String(data.eventName)}`);
  }
  // The chapter must be PUBLISHED at execution time — otherwise the
  // notification would be fabricated (Invariant 7).
  const chapter = await db.chapter.findUnique({
    where: { id: data.chapterId },
    select: { number: true, status: true, novelId: true },
  });
  if (!chapter || chapter.status !== "PUBLISHED" || chapter.novelId !== data.novelId) {
    return { notified: 0, skipped: 0 };
  }
  const novel = await db.novel.findUnique({
    where: { id: data.novelId },
    select: { createdById: true },
  });
  if (!novel) return { notified: 0, skipped: 0 };

  // Novel followers ∪ author followers, deduped (the 019A pinned
  // tables; a user following both gets ONE notification).
  const [novelFollows, authorFollows] = await Promise.all([
    db.novelFollow.findMany({
      where: { novelId: data.novelId },
      select: { userId: true },
    }),
    db.authorFollow.findMany({
      where: { authorId: novel.createdById },
      select: { userId: true },
    }),
  ]);
  const targets = new Set<string>();
  for (const r of novelFollows) targets.add(r.userId);
  for (const r of authorFollows) targets.add(r.userId);
  if (targets.size === 0) return { notified: 0, skipped: 0 };

  // Honor NEW_CHAPTER preferences: absent row = pinned default ON
  // (the mirror of the API's isEnabled — any divergence is a bug).
  const optedOut = await db.notificationPreference.findMany({
    where: {
      userId: { in: [...targets] },
      type: "NEW_CHAPTER",
      enabled: false,
    },
    select: { userId: true },
  });
  const optedOutIds = new Set(optedOut.map((r) => r.userId));
  const recipients = [...targets].filter((id) => !optedOutIds.has(id));

  let notified = 0;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    await db.notification.createMany({
      data: batch.map((userId) => ({
        userId,
        type: "NEW_CHAPTER" as const,
        novelId: data.novelId,
        chapterNumber: chapter.number,
        actorUserId: novel.createdById,
      })),
    });
    notified += batch.length;
  }
  return { notified, skipped: targets.size - notified };
}

/** Minimal BullMQ Queue surface the notification fan-out needs. */
export interface NotificationFanoutQueue {
  add(name: string, data: NotificationFanoutJobData, opts: { jobId: string }): Promise<unknown>;
  close(): Promise<void>;
}

export interface NotificationFanoutWorkerDeps {
  createDb: (url: string) => NovelForgeDb;
  createConnection: (url: string) => IORedis;
  createQueue: (name: string, connection: IORedis) => NotificationFanoutQueue;
  createWorker: (
    queueName: string,
    handler: (job: { data: NotificationFanoutJobData; id?: string }) => Promise<void>,
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

export function defaultNotificationFanoutWorkerDeps(
  logger: WorkerLogger,
): NotificationFanoutWorkerDeps {
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
        concurrency: 2,
      }),
    probeTimeoutMs: 10_000,
    logger,
  };
}

export interface NotificationFanoutWorkerApp {
  readonly started: boolean;
  readonly stopped: boolean;
  stop(): Promise<void>;
}

export async function startNotificationFanoutWorkerApp(
  env: { DATABASE_URL: string; REDIS_URL: string },
  logger: WorkerLogger,
  deps: Partial<NotificationFanoutWorkerDeps> = {},
): Promise<NotificationFanoutWorkerApp> {
  const d: NotificationFanoutWorkerDeps = {
    ...defaultNotificationFanoutWorkerDeps(logger),
    ...deps,
  };
  let started = false;
  let stopped = false;

  const db = d.createDb(env.DATABASE_URL);
  const connection = d.createConnection(env.REDIS_URL);

  const onConnError = (err: Error) => {
    if (!stopped)
      d.logger.warn("notification fan-out redis connection error", {
        message: err.message,
      });
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
    d.logger.warn("redis unavailable; notification fan-out worker not started", {});
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

  const queue = d.createQueue(NOTIFICATION_QUEUE_NAME, connection);

  const worker = d.createWorker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (!data || data.eventName !== "novel.chapter_published") {
        throw new Error("malformed notification fan-out job data");
      }
      const outcome = await fanoutChapterPublished(db, data);
      d.logger.info("notification fan-out job processed", {
        jobId: job.id,
        novelId: data.novelId,
        chapterId: data.chapterId,
        ...outcome,
      });
    },
    connection,
  );
  worker.on("error", (err) => {
    if (!stopped) d.logger.warn("notification fan-out worker error", { message: err.message });
  });
  worker.on("failed", (job, err) => {
    if (!stopped)
      d.logger.error("notification fan-out job failed (best-effort — dropped)", {
        jobId: job?.id,
        message: err.message,
      });
  });

  started = true;
  d.logger.info("notification fan-out worker started", { queue: NOTIFICATION_QUEUE_NAME });

  return {
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    async stop() {
      stopped = true;
      await worker.close();
      await queue.close();
      connection.disconnect();
      await db.$disconnect();
    },
  };
}
