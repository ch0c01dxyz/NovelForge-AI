/**
 * The one BullMQ `Queue` for `publication` (NF-WF-012 invariant 5).
 *
 * Constructed once and shared by the publication routes: schedule and
 * reschedule enqueue a delayed fire-job (jobId = publication id);
 * cancel/reschedule remove the old job first (`getJob(jobId).remove()`);
 * the worker's startup reconciliation re-enqueues jobs lost to the crash
 * window. The worker builds its own `Worker` on the same queue name —
 * never a second queue.
 *
 * Job defaults mirror `@novelforge/workflow-executor`'s
 * `WORKFLOW_DEFAULT_JOB_OPTIONS`: `attempts: 1` (no BullMQ-level retry —
 * transient failures are re-enqueued by the next startup reconciliation,
 * invariant 5), bounded `removeOnComplete`/`removeOnFail` (recent jobs
 * kept for debugging; the failed record is what reconciliation finds).
 */
import { Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import {
  PUBLICATION_QUEUE_NAME,
  PUBLICATION_JOB_NAME,
  WORKFLOW_DEFAULT_JOB_OPTIONS,
  type PublicationJobData,
} from "@novelforge/workflow-executor";

export { PUBLICATION_QUEUE_NAME, PUBLICATION_JOB_NAME };
export type { PublicationJobData };

/** Minimal BullMQ Job surface the publication lifecycle needs. Structurally
 * satisfied by the real `Job` — no adapter, no BullMQ import in callers. */
export interface PublicationJobHandle {
  getState(): Promise<string>;
  remove(): Promise<void>;
}

export interface PublicationQueue {
  add(
    name: string,
    data: PublicationJobData,
    opts: { jobId: string; delay?: number },
  ): Promise<unknown>;
  getJob(jobId: string): Promise<PublicationJobHandle | undefined>;
  close(): Promise<void>;
}

/**
 * Create the shared queue against the given Redis URL. Owns its
 * connection: `close()` shuts the queue and the socket down.
 */
export function createPublicationQueue(redisUrl: string): PublicationQueue {
  const connection = new IORedis(redisUrl, {
    // Required by BullMQ blocking commands.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  const queue = new Queue(PUBLICATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...WORKFLOW_DEFAULT_JOB_OPTIONS },
  });
  return {
    // `delay` passes through to BullMQ (the scheduled fire time); the
    // facade needs no per-option methods.
    add: (name, data, opts) => queue.add(name, data, opts),
    getJob: async (jobId) => {
      const job: Job | undefined = await queue.getJob(jobId);
      return job ?? undefined;
    },
    close: async () => {
      await queue.close();
      connection.disconnect();
    },
  };
}
