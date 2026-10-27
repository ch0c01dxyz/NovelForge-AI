import type { Env } from "@novelforge/config";
import { createDb } from "@novelforge/database";
import { createAiServices, createAuditService, createGatewayRegistry, createNovelDecodeProcessor } from "@novelforge/ai-services";
import type { WorkerLogger } from "./worker.ts";

/** PostgreSQL is the durable queue. One fenced chunk is processed per tick. */
export function startNovelDecodeWorkerApp(env: Env, logger: WorkerLogger) {
  const db = createDb(env.DATABASE_URL);
  const ai = createAiServices({ db, registry: createGatewayRegistry(db, env.APP_ENCRYPTION_KEY), encryptionKey: env.APP_ENCRYPTION_KEY, audit: createAuditService(db), routingStrategy: env.AI_ROUTING_STRATEGY });
  const processor = createNovelDecodeProcessor({ db, ai });
  let stopped = false, current: Promise<void> | null = null, stopping: Promise<void> | null = null;
  function tick(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (current) return current;
    current = (async () => {
      await processor.recoverExpired();
      const job = await db.novelDecodeJob.findFirst({ where: { status: "QUEUED" }, orderBy: { updatedAt: "asc" }, select: { id: true } });
      if (job) await processor.process(job.id);
    })().catch(() => { logger.warn("novel decoding tick failed; durable progress retained"); }).finally(() => { current = null; });
    return current;
  }
  const timer = setInterval(() => { void tick(); }, 2000); timer.unref();
  void tick();
  return { started: true, tick, stop() {
    stopping ??= (async () => { stopped = true; clearInterval(timer); await current; await db.$disconnect(); })();
    return stopping;
  } };
}
