/**
 * @novelforge/worker — entrypoint.
 * loadEnv() fails fast on invalid configuration (masked error, no secrets in
 * output). Registers SIGTERM/SIGINT handlers for clean shutdown so an
 * orchestrator stop drains and closes queues/connections rather than killing
 * mid-job. Exit non-zero only on hard startup failure.
 */
import { loadEnv } from "@novelforge/config";
import { startWorkerApp, type WorkerLogger } from "./worker.ts";

const logger: WorkerLogger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg, meta) => console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
};

const env = loadEnv();
const app = await startWorkerApp(env, logger);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown signal received", { signal });
  try {
    await app.stop();
    process.exit(0);
  } catch (err) {
    logger.error("error during shutdown", { message: String(err) });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("worker started", { queue: "worker-heartbeat", proven: app.proven });
