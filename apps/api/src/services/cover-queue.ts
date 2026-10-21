import { Queue } from "bullmq";
import IORedis from "ioredis";
import { COVER_QUEUE_NAME } from "@novelforge/ai-services";

export interface CoverQueue { enqueue(batchId: string, revision: number): Promise<void>; close(): Promise<void> }
export function createCoverQueue(redisUrl: string, prefix?: string): CoverQueue {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableOfflineQueue: false });
  const queue = new Queue(COVER_QUEUE_NAME, { connection, ...(prefix ? { prefix } : {}) });
  return {
    async enqueue(batchId, revision) { await queue.add("generate", { batchId, revision }, { jobId: `${batchId}-${revision}`, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 }); },
    async close() { await queue.close(); connection.disconnect(); },
  };
}
