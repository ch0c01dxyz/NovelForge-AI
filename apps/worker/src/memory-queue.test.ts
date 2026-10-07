import { it, expect } from "vitest";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { memoryRebuildJobId } from "./memory-reconciliation.ts";

it("the real BullMQ queue accepts deterministic chapter and arc rebuild IDs", async () => {
  const connection = new IORedis(process.env.WORKER_IT_REDIS_URL ?? "redis://localhost:6379/15", { maxRetriesPerRequest: null });
  // Unique queue ownership; never consume or drain a production queue.
  const queue = new Queue(`memory-id-check-${crypto.randomUUID()}`, { connection: connection as never });
  const jobs = [];
  try {
    for (const scope of ["chapter:c1", "arc:a1"]) {
      const id = memoryRebuildJobId("n1", scope, "r1");
      const job = await queue.add("rebuild", {}, { jobId: id });
      jobs.push(job);
      expect(job.id).toBe(id);
      expect((await queue.add("rebuild", {}, { jobId: id })).id).toBe(id);
    }
    expect(await queue.getWaitingCount()).toBe(2);
  } finally {
    for (const job of jobs) await job.remove();
    await queue.close();
    await connection.quit();
  }
}, 30_000);
