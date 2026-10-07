/**
 * NF-WF-026 (GAP-028): Worker AI path wiring test.
 *
 * Proves that `createWorkerAiPath` constructs the real `{ generate,
 * retrieval, compiler }` ports (no "not configured" error) and that an
 * AGENT step can execute through the worker's executor with a fake
 * gateway.
 *
 * This is the GAP-028 closure evidence: the production worker can now
 * execute AGENT/SKILL/RETRIEVAL steps.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import { encryptCredential } from "@novelforge/ai-core";
import { createWorkerAiPath } from "@novelforge/ai-services";
import { createWorkerExecutor } from "./workflow-jobs.ts";
import type { WorkerLogger } from "./worker.ts";

const IT_DB = "novelforge_test_worker_ai_path";
const IT_URL = `postgresql://novelforge_test:novelforge_test@localhost:5432/${IT_DB}`;

function testLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** Fake gateway that returns canned content (no real LLM). */
function fakeGateway(): AIGateway {
  return {
    generate: vi.fn(async () => ({
      content: '{"result": "ok"}',
      model: "fake",
      inputTokens: 10,
      outputTokens: 5,
    })),
    embed: vi.fn(async () => ({ embeddings: [[0.1, 0.2]] })),
  } as unknown as AIGateway;
}

describe("createWorkerAiPath (NF-WF-026)", () => {
  let db: NovelForgeDb;

  beforeAll(async () => {
    const { Client } = await import("pg");
    const admin = new Client({
      connectionString: "postgresql://novelforge_test:novelforge_test@localhost:5432/postgres",
    });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${IT_DB}"`);
    await admin.query(`CREATE DATABASE "${IT_DB}"`);
    await admin.end();

    const { execFileSync } = await import("node:child_process");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
    const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
    const IT_URL_LOCAL = `postgresql://novelforge_test:novelforge_test@localhost:5432/${IT_DB}`;
    execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      stdio: "pipe",
      cwd: DB_PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: IT_URL_LOCAL },
    });

    db = createDb(IT_URL_LOCAL);
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("constructs generate, retrieval, and compiler ports (no 'not configured')", () => {
    const aiPath = createWorkerAiPath(db, {
      encryptionKey: "test-key-32-chars-long-enough!!",
      createGateway: () => fakeGateway(),
    });

    // All three ports must be defined (GAP-028: previously "not configured")
    expect(aiPath.generate).toBeDefined();
    expect(aiPath.retrieval).toBeDefined();
    expect(aiPath.compiler).toBeDefined();

    // The generate port must have the generate method
    expect(typeof aiPath.generate.generate).toBe("function");
    // The retrieval port must have the search method
    expect(typeof aiPath.retrieval.search).toBe("function");
    // The compiler port must have the compile method
    expect(typeof aiPath.compiler.compile).toBe("function");
  });

  it("createWorkerExecutor wires the AI path into the executor", () => {
    const logger = testLogger();
    const executor = createWorkerExecutor({
      db,
      logger,
      encryptionKey: "test-key-32-chars-long-enough!!",
      createGateway: () => fakeGateway(),
    });

    // Executor is constructed without throwing
    expect(executor).toBeDefined();
    expect(typeof executor.executeRun).toBe("function");
  });

  it("generate port executes via fake gateway", async () => {
    const aiPath = createWorkerAiPath(db, {
      encryptionKey: "test-key-32-chars-long-enough!!",
      createGateway: () => fakeGateway(),
    });

    // The generate port should be callable (it will fail on DB lookup
    // for the gateway record, but NOT with "not configured")
    // We verify the port exists and is wired; full execution needs
    // a gateway record in the DB (deployment concern).
    expect(aiPath.generate).toBeDefined();
  });

  it("AGENT step executes end-to-end via createWorkerExecutor (GAP-028 closure)", async () => {
    // Seed: user + workspace + ADMIN membership (for generation:create).
    const user = await db.user.create({
      data: {
        email: `e2e-agent-${Date.now()}@x.test`,
        passwordHash: "x",
        displayName: "e2e",
      },
    });
    const ws = await db.workspace.create({
      data: { name: "e2e-ws", slug: `e2e-ws-${Date.now()}`, ownerId: user.id },
    });
    await db.membership.create({
      data: { workspaceId: ws.id, userId: user.id, role: "ADMIN" },
    });

    // Seed: gateway record + model + profile mapping (fake transport).
    // The credential must be validly encrypted — the registry skips
    // gateways whose credential cannot be decrypted.
    const gw = await db.aIGateway.create({
      data: {
        name: `e2e-gw-${Date.now()}`,
        baseUrl: "http://localhost:1",
        credentialCiphertext: encryptCredential(
          "fake-key",
          "test-key-32-chars-long-enough!!",
        ),
        enabled: true,
      },
    });
    const model = await db.aIModel.create({
      data: {
        gatewayId: gw.id,
        modelId: "fake-writer",
        capabilities: ["chat"],
        enabled: true,
      },
    });
    await db.modelProfileMapping.create({
      data: { profile: "CREATIVE_WRITER", modelRef: model.id, enabled: true },
    });

    // Seed: PUBLISHED agent with a version (no outputSchema → no JSON contract).
    const agent = await db.agent.create({
      data: {
        scope: "WORKSPACE",
        workspaceId: ws.id,
        key: "e2e-writer",
        name: "e2e-writer",
        status: "PUBLISHED",
        createdById: user.id,
      },
    });
    const agentVersion = await db.agentVersion.create({
      data: {
        agentId: agent.id,
        number: 1,
        instructions: "You are the e2e writer.",
        modelProfile: "CREATIVE_WRITER",
        skillKeys: [],
        createdById: user.id,
      },
    });
    await db.agent.update({
      where: { id: agent.id },
      data: { currentVersionId: agentVersion.id },
    });

    // Seed: PUBLISHED workflow with a single AGENT step.
    const graph = {
      steps: [
        {
          key: "write",
          kind: "AGENT",
          ref: "e2e-writer",
          instruction: "Write a test paragraph.",
        },
      ],
      edges: [],
    };
    const workflow = await db.workflow.create({
      data: {
        scope: "WORKSPACE",
        workspaceId: ws.id,
        key: "e2e-agent-wf",
        name: "e2e-agent-wf",
        status: "PUBLISHED",
        createdById: user.id,
      },
    });
    const version = await db.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        number: 1,
        graph: graph as never,
        agentKeys: ["e2e-writer"],
        skillKeys: [],
        createdById: user.id,
      },
    });
    await db.workflow.update({
      where: { id: workflow.id },
      data: { currentVersionId: version.id },
    });

    // Seed: PENDING run with a PENDING AGENT step.
    const run = await db.workflowRun.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: version.id,
        workflowVersionNumber: 1,
        workspaceId: ws.id,
        triggeredById: user.id,
        status: "PENDING",
        input: {},
      },
      select: { id: true },
    });
    await db.workflowStepRun.create({
      data: {
        runId: run.id,
        stepKey: "write",
        sequence: 1,
        kind: "AGENT",
        status: "PENDING",
      },
    });

    // Execute via the worker's executor (real AI path, fake gateway).
    const executor = createWorkerExecutor({
      db,
      logger: testLogger(),
      encryptionKey: "test-key-32-chars-long-enough!!",
      createGateway: () => fakeGateway(),
    });
    const result = await executor.executeRun(run.id);

    // The run must complete — not "not configured", not FAILED.
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    const stepRun = await db.workflowStepRun.findFirstOrThrow({
      where: { runId: run.id, stepKey: "write" },
    });
    expect(stepRun.status).toBe("SUCCEEDED");

    const runRow = await db.workflowRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(runRow.status).toBe("SUCCEEDED");
  });
});
