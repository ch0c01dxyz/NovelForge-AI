/**
 * The one BullMQ `Queue` for `memory-rebuild` (NF-WF-009, F6).
 *
 * Constructed once and shared by the memory routes: the rebuild route
 * enqueues through this instance. The worker builds its own `Worker`
 * on the same queue name — never a second queue.
 *
 * Job defaults: bounded attempts with exponential backoff (F6);
 * `removeOnComplete`/`removeOnFail` keep recent jobs for debugging.
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  MEMORY_REBUILD_QUEUE_NAME,
  MEMORY_REBUILD_MAX_ATTEMPTS,
  MEMORY_REBUILD_RETRY_BASE_MS,
} from "@novelforge/memory";

export { MEMORY_REBUILD_QUEUE_NAME };

export interface MemoryQueue {
  add(name: string, data: Record<string, unknown>, opts: { jobId: string }): Promise<unknown>;
  getJob(jobId: string): Promise<{ remove(): Promise<void> } | undefined>;
  close(): Promise<void>;
}

/**
 * Create the shared queue against the given Redis URL. Owns its
 * connection: `close()` shuts the queue and the socket down.
 */
export function createMemoryQueue(redisUrl: string): MemoryQueue {
  const connection = new IORedis(redisUrl, {
    // Required by BullMQ blocking commands.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  const queue = new Queue(MEMORY_REBUILD_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: MEMORY_REBUILD_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: MEMORY_REBUILD_RETRY_BASE_MS },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
  return {
    add: (name, data, opts) => queue.add(name, data, opts),
    getJob: (jobId) => queue.getJob(jobId),
    close: async () => {
      await queue.close();
      connection.disconnect();
    },
  };
}
