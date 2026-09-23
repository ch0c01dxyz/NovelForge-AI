/**
 * @novelforge/worker — heartbeat worker lifecycle.
 *
 * Proves Redis connectivity by registering a trivial heartbeat job on a
 * BullMQ queue and waiting for the first completion. Degrades gracefully
 * (logged warning, no crash) when Redis is unreachable: the worker keeps
 * retrying in the background via ioredis retryStrategy (CLAUDE.md §24/§27:
 * bounded retry with backoff, long-running work off the request path).
 *
 * Dependencies (connection/queue/worker constructors) are injectable so the
 * lifecycle logic is unit-testable without a live Redis.
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import type { Env } from "@novelforge/config";

export const HEARTBEAT_QUEUE = "worker-heartbeat";
/** How long to wait for the first heartbeat job to complete before
 * declaring connectivity unproven (worker keeps retrying regardless). */
const FIRST_HEARTBEAT_TIMEOUT_MS = 10_000;
/** Redis ping timeout used for the initial availability probe. */
const PROBE_TIMEOUT_MS = 3_000;

export interface WorkerLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** Minimal surface of an ioredis connection used here. */
export interface RedisLike {
  readonly status: string;
  ping(): Promise<string>;
  quit(): Promise<"OK">;
  disconnect(): void;
  on(event: "error", handler: (err: Error) => void): this;
}

export interface WorkerApp {
  /** True once the first heartbeat job has completed (connectivity proven). */
  readonly proven: boolean;
  /** True after stop() has finished. */
  readonly stopped: boolean;
  stop(): Promise<void>;
}

export interface WorkerDeps {
  createConnection(url: string): RedisLike & ConnectionOptions;
  createQueue(name: string, connection: unknown): QueueFacade;
  createWorker(name: string, connection: unknown): WorkerFacade;
  logger: WorkerLogger;
  probeTimeoutMs: number;
}

export interface QueueFacade {
  add(jobName: string, data: unknown): Promise<unknown>;
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
}

export interface WorkerFacade {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
}

const defaultDeps = (logger: WorkerLogger): WorkerDeps => ({
  createConnection: (url) =>
    new IORedis(url, {
      // Required by BullMQ blocking commands (see bullmq connections docs).
      maxRetriesPerRequest: null,
      // Bounded-growth exponential backoff with jitter, ~1s..20s.
      retryStrategy: (times: number) =>
        Math.min(20_000, Math.max(1_000, 2 ** times * 250)) +
        Math.floor(Math.random() * 250),
      enableOfflineQueue: false,
    }) as unknown as RedisLike & ConnectionOptions,
  createQueue: (name, connection) =>
    new Queue(name, { connection: connection as ConnectionOptions }),
  createWorker: (name, connection) =>
    new Worker(
      name,
      async () => ({ ok: true, at: new Date().toISOString() }),
      { connection: connection as ConnectionOptions },
    ),
  logger,
  probeTimeoutMs: PROBE_TIMEOUT_MS,
});

/** Ping with retries until timeout: a fresh ioredis socket starts in
 * "connecting" and — with enableOfflineQueue:false — rejects commands
 * issued before it is ready. */
async function probe(connection: RedisLike, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      await connection.ping();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  } while (Date.now() < deadline);
  return false;
}

/**
 * Start the heartbeat worker against env.REDIS_URL. Never throws for
 * Redis-unavailability: it logs a warning and leaves the worker retrying.
 */
export async function startWorkerApp(
  env: Env,
  logger: WorkerLogger,
  deps: Partial<WorkerDeps> = {},
): Promise<WorkerApp> {
  const d = { ...defaultDeps(logger), ...deps };
  // One connection per role: Worker issues blocking commands that would
  // stall queue.add on a shared socket (bullmq connections docs).
  const queueConnection = d.createConnection(env.REDIS_URL);
  const workerConnection = d.createConnection(env.REDIS_URL);
  let proven = false;
  let stopped = false;

  queueConnection.on("error", (err) => {
    // ioredis surfaces transient connection errors here; retryStrategy owns
    // reconnection, so log only (prevents unhandled 'error' crashes).
    if (!stopped) d.logger.warn("redis connection error", { message: err.message });
  });
  workerConnection.on("error", (err) => {
    if (!stopped) d.logger.warn("redis connection error", { message: err.message });
  });

  const queue = d.createQueue(HEARTBEAT_QUEUE, queueConnection);
  const worker = d.createWorker(HEARTBEAT_QUEUE, workerConnection);
  worker.on("error", (err) => {
    if (!stopped) d.logger.warn("worker error", { message: String((err as Error)?.message ?? err) });
  });
  worker.on("completed", () => {
    if (!proven) {
      proven = true;
      d.logger.info("redis connectivity proven via heartbeat job");
    }
  });

  const available = await probe(queueConnection, d.probeTimeoutMs);
  if (available) {
    await queue.add("heartbeat", { pid: process.pid, at: new Date().toISOString() });
    d.logger.info("heartbeat job registered", { queue: HEARTBEAT_QUEUE });
    setTimeout(() => {
      if (!proven && !stopped) {
        d.logger.warn("first heartbeat not completed yet; worker keeps retrying");
      }
    }, FIRST_HEARTBEAT_TIMEOUT_MS).unref?.();
  } else {
    d.logger.warn(
      "redis unavailable at startup; heartbeat proof skipped, worker will retry in background",
      { redisUrl: env.REDIS_URL.replace(/\/\/([^:/@\s]+):([^@\s]+)@/, "//$1:[REDACTED]@") },
    );
  }

  return {
    get proven() {
      return proven;
    },
    get stopped() {
      return stopped;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      // Order: stop consuming, stop producing, then release connections.
      await worker.close();
      await queue.close();
      const conns = new Set([workerConnection, queueConnection]);
      for (const conn of conns) {
        if (conn.status !== "end") await conn.quit();
      }
      d.logger.info("worker stopped cleanly");
    },
  };
}
