/**
 * The one BullMQ `Queue` for `workflow-runs` (NF-WF-004 invariant 10).
 *
 * Constructed once and shared by the routes: enqueue (run route) and
 * best-effort job removal (cancel route) go through this instance. The
 * worker builds its own `Worker` on the same queue name — never a second
 * queue, never a queue per step kind.
 *
 * Job defaults come from `@novelforge/workflow-executor` (the single
 * source of truth shared with the worker): `attempts: 1` (no BullMQ-level
 * retry — recovery is the sweeper's job, invariant 3), bounded
 * `removeOnComplete`/`removeOnFail` (recent jobs kept for debugging).
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  WORKFLOW_DEFAULT_JOB_OPTIONS,
  WORKFLOW_QUEUE_NAME,
} from "@novelforge/workflow-executor";

export { WORKFLOW_QUEUE_NAME };

export interface WorkflowQueue {
  add(name: string, data: Record<string, unknown>, opts: { jobId: string }): Promise<unknown>;
  getJob(jobId: string): Promise<{ remove(): Promise<void> } | undefined>;
  close(): Promise<void>;
}

/**
 * Create the shared queue against the given Redis URL. Owns its
 * connection: `close()` shuts the queue and the socket down.
 */
export function createWorkflowQueue(redisUrl: string): WorkflowQueue {
  const connection = new IORedis(redisUrl, {
    // Required by BullMQ blocking commands.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  const queue = new Queue(WORKFLOW_QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...WORKFLOW_DEFAULT_JOB_OPTIONS },
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
