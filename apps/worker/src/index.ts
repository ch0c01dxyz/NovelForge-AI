/**
 * @novelforge/worker — entrypoint.
 * loadEnv() fails fast on invalid configuration (masked error, no secrets in
 * output). Registers SIGTERM/SIGINT handlers for clean shutdown so an
 * orchestrator stop drains and closes queues/connections rather than killing
 * mid-job. Exit non-zero only on hard startup failure.
 *
 * Runs five workers side by side:
 * - the heartbeat worker (Redis connectivity proof, degrades gracefully);
 * - the `workflow-runs` worker (NF-WF-004: durable workflow execution).
 * - the `memory-rebuild` worker (NF-WF-009: structural memory rebuilds).
 * - the `publication` worker (NF-WF-012: scheduled publication fires +
 *   startup reconciliation of scheduled publications).
 * - the `notifications` worker (NF-WF-019C: novel.chapter_published
 *   fan-out → in-app notification rows).
 */
import { loadEnv } from "@novelforge/config";
import { startWorkerApp, type WorkerLogger } from "./worker.ts";
import { startWorkflowWorkerApp } from "./workflow-jobs.ts";
import { startMemoryWorkerApp } from "./memory-jobs.ts";
import { startPublicationWorkerApp } from "./publication-jobs.ts";
import { startNotificationFanoutWorkerApp } from "./notification-fanout-jobs.ts";
import { startCoverWorkerApp } from "./cover-jobs.ts";

const logger: WorkerLogger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg, meta) => console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
};

const env = loadEnv();
const app = await startWorkerApp(env, logger);
const workflows = await startWorkflowWorkerApp(env, logger);
const memory = await startMemoryWorkerApp(env, logger);
const publication = await startPublicationWorkerApp(env, logger);
// NF-WF-019C: the `notifications` fan-out consumer (novel.chapter_published).
const notifications = await startNotificationFanoutWorkerApp(env, logger);
const covers = await startCoverWorkerApp(env, logger);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown signal received", { signal });
  try {
    await covers.stop();
    await notifications.stop();
    await publication.stop();
    await memory.stop();
    await workflows.stop();
    await app.stop();
    process.exit(0);
  } catch (err) {
    logger.error("error during shutdown", { message: String(err) });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("worker started", {
  queue: "worker-heartbeat",
  proven: app.proven,
  workflowsStarted: workflows.started,
  memoryStarted: memory.started,
  publicationStarted: publication.started,
  notificationsStarted: notifications.started,
  coversStarted: covers.started,
});
