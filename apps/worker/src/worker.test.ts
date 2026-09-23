import { describe, expect, it, vi } from "vitest";
import type { Env } from "@novelforge/config";
import {
  HEARTBEAT_QUEUE,
  startWorkerApp,
  type QueueFacade,
  type RedisLike,
  type WorkerApp,
  type WorkerLogger,
  type WorkerFacade,
} from "./worker.ts";

const env: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://user:[REDACTED:connection_string]@localhost:5432/novelforge",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "novelforge",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: "test",
};

function testLogger() {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } satisfies WorkerLogger as WorkerLogger & {
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    },
  };
}

interface Fake {
  connection: RedisLike & {
    status: string;
    quit: ReturnType<typeof vi.fn>;
    emitError(err: Error): void;
  };
  queue: QueueFacade & { add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  worker: WorkerFacade & {
    close: ReturnType<typeof vi.fn>;
    emit(event: string, ...args: unknown[]): void;
  };
  deps: Parameters<typeof startWorkerApp>[2];
}

function makeFakes(options: { redisAvailable: boolean }): Fake {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const status = { value: options.redisAvailable ? "ready" : "end" };
  const connection = {
    get status() {
      return status.value;
    },
    ping: vi.fn(async () => {
      if (!options.redisAvailable) throw new Error("ECONNREFUSED");
      return "PONG";
    }),
    quit: vi.fn(async () => {
      status.value = "end";
      return "OK" as const;
    }),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return connection;
    }),
    emitError(err: Error) {
      for (const h of handlers.get("error") ?? []) h(err);
    },
  } as unknown as Fake["connection"];

  const workerHandlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const worker = {
    close: vi.fn(async () => {}),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = workerHandlers.get(event) ?? [];
      list.push(handler);
      workerHandlers.set(event, list);
      return worker;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const h of workerHandlers.get(event) ?? []) h(...args);
    },
  } as unknown as Fake["worker"];

  const queue = {
    add: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
    on: vi.fn(),
  } as unknown as Fake["queue"];

  return {
    connection,
    queue,
    worker,
    deps: {
      createConnection: () => connection,
      createQueue: (name) => {
        expect(name).toBe(HEARTBEAT_QUEUE);
        return queue;
      },
      createWorker: (name) => {
        expect(name).toBe(HEARTBEAT_QUEUE);
        return worker;
      },
      probeTimeoutMs: options.redisAvailable ? 1_000 : 1,
    },
  };
}

describe("startWorkerApp — redis available", () => {
  it("registers a heartbeat job and marks connectivity proven on completion", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: true });
    const app = await startWorkerApp(env, logger, fakes.deps);

    expect(fakes.connection.ping).toHaveBeenCalledOnce();
    expect(fakes.queue.add).toHaveBeenCalledWith(
      "heartbeat",
      expect.objectContaining({ pid: expect.any(Number) }),
    );
    expect(app.proven).toBe(false);

    fakes.worker.emit("completed");
    expect(app.proven).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      "redis connectivity proven via heartbeat job",
    );
    await app.stop();
  });
});

describe("startWorkerApp — redis unavailable", () => {
  it("degrades gracefully: warns, does not throw, does not add a job", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: false });
    const app = await startWorkerApp(env, logger, fakes.deps);

    expect(fakes.queue.add).not.toHaveBeenCalled();
    expect(app.proven).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("redis unavailable"),
      expect.any(Object),
    );
    await app.stop();
  });

  it("never leaks credentials into warning logs", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: false });
    const app = await startWorkerApp(
      { ...env, REDIS_URL: "redis://user:[REDACTED:password]@localhost:6379" },
      logger,
      fakes.deps,
    );
    const meta = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => String(c[0]).includes("redis unavailable"),
    )?.[1] as { redisUrl?: string };
    expect(meta?.redisUrl).not.toContain("supersecret");
    expect(meta?.redisUrl).toContain("[REDACTED]");
    await app.stop();
  });

  it("logs (does not crash) on connection error events", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: false });
    const app = await startWorkerApp(env, logger, fakes.deps);
    fakes.connection.emitError(new Error("ECONNRESET"));
    expect(logger.warn).toHaveBeenCalledWith(
      "redis connection error",
      { message: "ECONNRESET" },
    );
    await app.stop();
  });
});

describe("stop() — clean shutdown", () => {
  it("closes worker, queue, and connection in order; is idempotent", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: true });
    const app: WorkerApp = await startWorkerApp(env, logger, fakes.deps);

    await app.stop();
    expect(app.stopped).toBe(true);
    expect(fakes.worker.close).toHaveBeenCalledOnce();
    expect(fakes.queue.close).toHaveBeenCalledOnce();
    expect(fakes.connection.quit).toHaveBeenCalledOnce();
    const workerOrder = fakes.worker.close.mock.invocationCallOrder[0];
    const queueOrder = fakes.queue.close.mock.invocationCallOrder[0];
    const connOrder = fakes.connection.quit.mock.invocationCallOrder[0];
    expect(workerOrder).toBeLessThan(queueOrder!);
    expect(queueOrder).toBeLessThan(connOrder!);

    await app.stop(); // idempotent
    expect(fakes.worker.close).toHaveBeenCalledOnce();
  });

  it("does not double-quit an already ended connection", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: true });
    const app = await startWorkerApp(env, logger, fakes.deps);
    await fakes.connection.quit();
    await app.stop();
    expect(fakes.connection.quit).toHaveBeenCalledOnce();
  });

  it("silences error logging after stop", async () => {
    const { logger } = testLogger();
    const fakes = makeFakes({ redisAvailable: true });
    const app = await startWorkerApp(env, logger, fakes.deps);
    await app.stop();
    (logger.warn as ReturnType<typeof vi.fn>).mockClear();
    fakes.connection.emitError(new Error("late ECONNRESET"));
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// Integration against real Redis — only runs when WORKER_IT_REDIS_URL points
// at a live server (e.g. `docker compose up -d redis` mapped to 16379).
const itUrl = process.env.WORKER_IT_REDIS_URL;
describe.skipIf(!itUrl)("integration — real redis", () => {
  it("proves connectivity via a real heartbeat job and stops cleanly", async () => {
    const { logger } = testLogger();
    const app = await startWorkerApp({ ...env, REDIS_URL: itUrl! }, logger);
    const deadline = Date.now() + 15_000;
    while (!app.proven && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(app.proven).toBe(true);
    await app.stop();
    expect(app.stopped).toBe(true);
  }, 20_000);
});
