/**
 * @novelforge/worker — memory job tests (NF-WF-009).
 *
 * Unit tests with injected deps: the deterministic rebuild core is
 * covered in `@novelforge/memory` and the API integration suite. These
 * cover the worker wiring: job validation, processRebuild invocation,
 * graceful degradation when Redis is unavailable, and clean shutdown.
 */
import { describe, expect, it, vi } from "vitest";
import { startMemoryWorkerApp } from "./memory-jobs.ts";
import type { WorkerLogger } from "./worker.ts";
import { MEMORY_REBUILD_QUEUE_NAME } from "@novelforge/memory";

function testLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("startMemoryWorkerApp", () => {
  it("degrades gracefully when Redis is unavailable", async () => {
    const logger = testLogger();
    const db = { $disconnect: vi.fn() } as unknown as import("@novelforge/database").NovelForgeDb;
    const connection = {
      ping: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
    const app = await startMemoryWorkerApp(
      { DATABASE_URL: "postgresql://localhost:5432/x", REDIS_URL: "redis://localhost:6379" },
      logger,
      {
        createDb: () => db,
        createConnection: () => connection,
        probeTimeoutMs: 500,
      },
    );
    expect(app.started).toBe(false);
    await app.stop();
    expect(db.$disconnect).toHaveBeenCalled();
  });

  it("runs processRebuild for a well-formed job and rejects malformed data", async () => {
    const logger = testLogger();
    const db = { $disconnect: vi.fn() } as unknown as import("@novelforge/database").NovelForgeDb;
    const connection = {
      ping: vi.fn(async () => "PONG"),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
    let handler: ((job: { data: unknown }) => Promise<void>) | null = null;
    const worker = {
      on: vi.fn(),
      close: vi.fn(async () => {}),
    };
    const processRebuild = vi.fn(async () => ({ deduped: false, ok: true }));
    const app = await startMemoryWorkerApp(
      { DATABASE_URL: "postgresql://localhost:5432/x", REDIS_URL: "redis://localhost:6379" },
      logger,
      {
        createDb: () => db,
        createConnection: () => connection,
        createWorker: (queueName, h) => {
          expect(queueName).toBe(MEMORY_REBUILD_QUEUE_NAME);
          handler = h as never;
          return worker as never;
        },
        processRebuild: processRebuild as never,
        probeTimeoutMs: 500,
      },
    );
    expect(app.started).toBe(true);
    expect(handler).not.toBeNull();

    await handler!({
      data: {
        workspaceId: "ws",
        novelId: "novel",
        scope: "chapter:abc",
        sourceRevisionId: "rev",
      },
    });
    expect(processRebuild).toHaveBeenCalledWith(db, {
      workspaceId: "ws",
      novelId: "novel",
      scope: "chapter:abc",
      sourceRevisionId: "rev",
    });

    await expect(handler!({ data: { novelId: "novel" } })).rejects.toThrow(
      "malformed memory-rebuild job data",
    );

    await app.stop();
    expect(worker.close).toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalled();
  });
});
