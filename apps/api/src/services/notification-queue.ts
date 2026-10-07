/**
 * The one BullMQ `Queue` for `notifications` (NF-WF-019C, Invariant 7).
 *
 * Carries the async fan-out jobs for `novel.chapter_published`: the
 * publish path (API immediate publish + the 012 worker fire) enqueues a
 * fan-out job AFTER the PUBLISHED commit and never awaits fan-out —
 * publish latency does not grow with follower count. The worker
 * (`apps/worker/src/notification-fanout-jobs.ts`) builds its own
 * `Worker` on the same queue name — never a second queue.
 *
 * Job defaults (NF-WF-031, GAP-096): bounded retry (`attempts: 3`,
 * exponential backoff base 2000ms) for transient failures. At-most-once
 * delivery is enforced by the partial unique index
 * `notifications_new_chapter_dedup_idx` + `skipDuplicates` in the
 * handler. Failed jobs are retained (5000) for debugging.
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  NOTIFICATION_FANOUT_MAX_ATTEMPTS,
  NOTIFICATION_FANOUT_RETRY_BASE_MS,
  WORKFLOW_DEFAULT_JOB_OPTIONS,
} from "@novelforge/workflow-executor";

export const NOTIFICATION_QUEUE_NAME = "notifications";
export const NOTIFICATION_FANOUT_JOB_NAME = "fanout";

/**
 * The pinned `novel.chapter_published` event payload carried by the
 * fan-out job. The worker resolves the chapter number, the novel's
 * author, and the follower set at execution time.
 */
export interface NotificationFanoutJobData {
  eventName: "novel.chapter_published";
  publicationId: string;
  novelId: string;
  chapterId: string;
}

/** Minimal BullMQ Queue surface the publish paths need. Structurally
 * satisfied by the real `Queue` — no adapter, no BullMQ import in callers. */
export interface NotificationQueue {
  add(
    name: string,
    data: NotificationFanoutJobData,
    opts: { jobId: string },
  ): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Create the shared queue against the given Redis URL. Owns its
 * connection: `close()` shuts the queue and the socket down.
 */
export function createNotificationQueue(redisUrl: string): NotificationQueue {
  const connection = new IORedis(redisUrl, {
    // Required by BullMQ blocking commands.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  const queue = new Queue(NOTIFICATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      ...WORKFLOW_DEFAULT_JOB_OPTIONS,
      // NF-WF-031 (GAP-096): bounded retry for transient failures.
      // Dedup is enforced by the partial unique index; retry is safe.
      attempts: NOTIFICATION_FANOUT_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: NOTIFICATION_FANOUT_RETRY_BASE_MS },
    },
  });
  return {
    add: (name, data, opts) => queue.add(name, data, opts),
    close: async () => {
      await queue.close();
      connection.disconnect();
    },
  };
}
