import { describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createWorkflowJobHandler, startWorkflowWorkerApp } from "./workflow-jobs.ts";
import type { NovelForgeDb } from "@novelforge/database";
import type { WorkflowExecutor } from "@novelforge/workflow-executor";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
describe("independent character discovery delivery", () => {
  it("production assembly uses distinct queues; a pending discovery never occupies the chapter processor", async () => {
    const processors = new Map<string, (job: { data: { runId: string } }) => Promise<void>>();
    const queues = new Map<string, ReturnType<typeof vi.fn>>();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const discovery = vi.fn(() => pending);
    const executor = { executeRun: vi.fn(async () => ({ claimed: true, status: "AWAITING_APPROVAL" })), recoverStaleRuns: vi.fn(async () => ({ resetRuns: [], requeuedRuns: [], orphanEnqueues: [] })) };
    const app = await startWorkflowWorkerApp({ DATABASE_URL: "fixture", REDIS_URL: "fixture", APP_ENCRYPTION_KEY: "fixture" }, logger, {
      createDb: () => ({ $disconnect: async () => {} }) as unknown as NovelForgeDb,
      createExecutor: () => executor as unknown as WorkflowExecutor,
      createDiscovery: () => ({ discoverRun: discovery }),
      createConnection: () => ({ ping: async () => "PONG", disconnect: () => {}, on() { return this; } }) as never,
      createQueue: name => { const add = vi.fn(async () => ({})); queues.set(name, add); return { add, getJob: async () => null, close: async () => {} }; },
      createWorker: (name, processor) => { processors.set(name, processor); return { on: () => {}, close: async () => {} }; },
    });
    try {
      await processors.get("workflow-runs")!({ data: { runId: "chapter" } });
      expect(discovery).not.toHaveBeenCalled();
      expect(queues.get("character-discoveries")).toHaveBeenCalledWith("discover", { runId: "chapter" }, { jobId: "chapter" });
      const sidecar = processors.get("character-discoveries")!({ data: { runId: "chapter" } });
      executor.executeRun.mockResolvedValueOnce({ claimed: true, status: "SUCCEEDED" });
      await processors.get("workflow-runs")!({ data: { runId: "chapter" } });
      expect(executor.executeRun).toHaveBeenCalledTimes(2);
      finish(); await sidecar;
    } finally { finish(); await app.stop(); }
  });
  it("real BullMQ resumes the same chapter job while discovery is deferred on another queue", async () => {
    const connection = new IORedis(process.env.WORKER_IT_REDIS_URL ?? "redis://127.0.0.1:6399", { maxRetriesPerRequest: null });
    const prefix = `nf-character-sidecar-test-${process.pid}-${Date.now()}`;
    const chapters = new Queue("chapters", { connection, prefix }), discoveries = new Queue("discoveries", { connection, prefix });
    let release!: () => void, started!: () => void;
    const startedSignal = new Promise<void>(resolve => { started = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let state = "AWAITING_APPROVAL";
    const executor = { executeRun: async () => ({ claimed: true, status: state }) } as unknown as WorkflowExecutor;
    const chapterWorker = new Worker("chapters", createWorkflowJobHandler({ executor, logger, enqueueCharacterDiscovery: runId => discoveries.add("discover", { runId }, { jobId: runId }) }), { connection, prefix });
    const discoveryWorker = new Worker("discoveries", async () => { started(); await delayed; }, { connection, prefix });
    try {
      await Promise.all([chapterWorker.waitUntilReady(), discoveryWorker.waitUntilReady()]);
      await chapters.add("chapter", { runId: "same-run" }, { jobId: "same-run", removeOnComplete: 100 });
      await startedSignal;
      for (let i = 0; i < 100 && (await chapters.getJob("same-run"))?.finishedOn === undefined; i++) await new Promise(r => setTimeout(r, 10));
      expect(await (await chapters.getJob("same-run"))?.getState()).toBe("completed");
      expect(await (await discoveries.getJob("same-run"))?.getState()).toBe("active");
      state = "SUCCEEDED";
      await (await chapters.getJob("same-run"))!.remove();
      await chapters.add("chapter", { runId: "same-run" }, { jobId: "same-run", removeOnComplete: 100 });
      for (let i = 0; i < 100 && (await chapters.getJob("same-run"))?.finishedOn === undefined; i++) await new Promise(r => setTimeout(r, 10));
      expect(await (await chapters.getJob("same-run"))?.getState()).toBe("completed");
      expect(await (await discoveries.getJob("same-run"))?.getState()).toBe("active");
    } finally { release(); await chapterWorker.close(); await discoveryWorker.close(); await chapters.obliterate(); await discoveries.obliterate(); await chapters.close(); await discoveries.close(); connection.disconnect(); }
  });
});
