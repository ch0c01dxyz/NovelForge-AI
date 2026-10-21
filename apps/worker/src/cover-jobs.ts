import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import type { Env } from "@novelforge/config";
import { createDb } from "@novelforge/database";
import { GatewayManager } from "@novelforge/ai-core";
import { COVER_QUEUE_NAME, createCoverGenerationServices, createGatewayRegistry } from "@novelforge/ai-services";
import type { WorkerLogger } from "./worker.ts";

/** BullMQ lease recovery fences the old executor; only still-pending slots dispatch. */
export async function startCoverWorkerApp(env: Env, logger: WorkerLogger, options: { prefix?: string } = {}) {
  const db = createDb(env.DATABASE_URL);
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true });
  try { await connection.connect(); }
  catch (error) { connection.disconnect(); await db.$disconnect(); throw error; }
  const queue = new Queue(COVER_QUEUE_NAME, { connection, ...options });
  const enqueue = async (batchId: string, revision: number) => {
    await queue.add("generate", { batchId, revision }, { jobId: `${batchId}-${revision}`, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 });
  };
  const services = createCoverGenerationServices({ db, manager: new GatewayManager(createGatewayRegistry(db, env.APP_ENCRYPTION_KEY), { defaultStrategy: env.AI_ROUTING_STRATEGY }), enqueue });
  const worker = new Worker<{ batchId: string; revision: number }>(COVER_QUEUE_NAME,
    job => services.process(job.data.batchId, job.data.revision), { connection, concurrency: 1, autorun: false, ...options });
  let stopped = false;
  let reconciling = false;
  async function reconcile() {
    if (reconciling || stopped) return;
    reconciling = true;
    try {
      const batches = await db.coverGenerationBatch.findMany({ where: { items: { some: { state: { in: ["PENDING", "RUNNING"] } } } },
        orderBy: { updatedAt: "asc" }, take: 100, select: { id: true, queueRevision: true } });
      for (const batch of batches) {
        const job = await queue.getJob(`${batch.id}-${batch.queueRevision}`);
        if (job) {
          const state = await job.getState();
          if (state !== "failed" && state !== "completed") continue;
          await job.remove();
        }
        await enqueue(batch.id, batch.queueRevision);
      }
    } finally { reconciling = false; }
  }
  worker.on("error", () => { if (!stopped) logger.error("cover worker transport error"); });
  worker.on("failed", job => { if (!stopped) logger.warn("cover job failed; pending items remain recoverable", { jobId: job?.id }); });
  try {
    await connection.ping();
    await reconcile();
    void worker.run().catch(() => { if (!stopped) logger.error("cover worker stopped unexpectedly"); });
    await worker.waitUntilReady();
  } catch (error) {
    await worker.close(); await queue.close(); connection.disconnect(); await db.$disconnect();
    throw error;
  }
  const timer = setInterval(() => { void reconcile().catch(() => logger.warn("cover queue reconciliation failed")); }, 30_000);
  timer.unref();
  logger.info("cover worker started", { queue: COVER_QUEUE_NAME, concurrency: 1 });
  return { started: true, async stop() { stopped = true; clearInterval(timer); await worker.close(); await queue.close(); connection.disconnect(); await db.$disconnect(); } };
}
