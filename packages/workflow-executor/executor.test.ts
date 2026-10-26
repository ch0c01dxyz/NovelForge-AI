/**
 * @novelforge/workflow-executor unit tests (NF-WF-004).
 *
 * Dedicated novelforge_test_workflow_executor db. Covers the guarded
 * claim transitions (the no-double-commit mechanism), cancellation, and
 * restart-recovery adoption — the invariants the worker depends on.
 * No test reaches a real provider: `generate` is a controllable fake.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createWorkflowExecutor,
  claimRunForExecution,
  claimStepForExecution,
  resetRunForRecovery,
  isRunCancelled,
  canonicalizeJson,
  hashApprovalMaterial,
  type WorkflowExecutor,
} from "./index.ts";

const TEST_DB = process.env.NF049_TEST_DB ?? "novelforge_test_workflow_executor";
if (TEST_DB !== "novelforge_test_workflow_executor" && !/^nf049_[a-z0-9_]+$/.test(TEST_DB)) throw new Error("Unowned analytics test database");
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found");
  }
}
const BASE_URL = process.env.DATABASE_URL!;
const TEST_URL = (() => {
  const u = new URL(BASE_URL);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
})();

let db: NovelForgeDb;
let executor: WorkflowExecutor;
/** How many generate calls have started. */
let generateCalls = 0;

beforeAll(async () => {
  const adminUrl = new URL(BASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
  executor = createWorkflowExecutor({
    db,
    audit: { record: async () => {} },
    resolvers: {
      resolveAgent: async () => {
        throw new Error("no agents in unit tests");
      },
      resolveSkill: async () => {
        throw new Error("no skills in unit tests");
      },
    },
    generate: {
      generate: async () => {
        generateCalls += 1;
        return { generationId: crypto.randomUUID(), content: "fake", model: "fake" };
      },
    },
  });
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  generateCalls = 0;
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
});

let seedCounter = 0;

async function seedWorkflow(graph: unknown): Promise<{
  workspaceId: string;
  userId: string;
  workflowId: string;
  versionId: string;
}> {
  seedCounter += 1;
  const tag = `${Date.now()}-${seedCounter}`;
  const user = await db.user.create({
    data: { email: `u-${tag}@x.test`, passwordHash: "x", displayName: "u" },
  });
  const ws = await db.workspace.create({
    data: { name: "ws", slug: `ws-${tag}`, ownerId: user.id },
  });
  const workflow = await db.workflow.create({
    data: {
      scope: "WORKSPACE",
      workspaceId: ws.id,
      key: "wf",
      name: "wf",
      status: "PUBLISHED",
      createdById: user.id,
    },
  });
  const version = await db.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      number: 1,
      graph: graph as never,
      agentKeys: [],
      skillKeys: [],
      createdById: user.id,
    },
  });
  await db.workflow.update({
    where: { id: workflow.id },
    data: { currentVersionId: version.id },
  });
  return { workspaceId: ws.id, userId: user.id, workflowId: workflow.id, versionId: version.id };
}

async function seedRun(
  seed: { workspaceId: string; userId: string; workflowId: string; versionId: string },
  graph: { steps: Array<{ key: string; kind: string }>; edges: Array<unknown> },
  status = "PENDING",
): Promise<string> {
  const run = await db.workflowRun.create({
    data: {
      workflowId: seed.workflowId,
      workflowVersionId: seed.versionId,
      workflowVersionNumber: 1,
      workspaceId: seed.workspaceId,
      triggeredById: seed.userId,
      status: status as never,
      input: {},
    },
    select: { id: true },
  });
  let seq = 0;
  for (const step of graph.steps) {
    seq += 1;
    await db.workflowStepRun.create({
      data: {
        runId: run.id,
        stepKey: step.key,
        sequence: seq,
        kind: step.kind,
        status: "PENDING",
      },
    });
  }
  return run.id;
}

const TWO_TRANSFORMS = {
  steps: [
    { key: "a", kind: "TRANSFORM", inputs: { v: "$input.x" } },
    { key: "b", kind: "TRANSFORM", inputs: { v: "$steps.a.json" } },
  ],
  edges: [{ from: "a", to: "b" }],
};

describe("generation usage attribution", () => {
  it.each([
    { stepKey: "review_final", json: { findings: [{ severity: "major" }], needsCorrection: false }, code: "AI_CHAPTER_REVIEW_INCONSISTENT" },
    { stepKey: "review_final", json: { findings: [], needsCorrection: true }, code: "AI_CHAPTER_REVIEW_UNRESOLVED" },
    { stepKey: "write", json: { prose: "Dua kata." }, code: "AI_CHAPTER_TOO_SHORT" },
  ])("blocks invalid recovered $stepKey without a new model call", async ({ stepKey, json, code }) => {
    const graph = { steps: [{ key: stepKey, kind: "TRANSFORM", inputs: {} }, { key: "approval", kind: "HUMAN_APPROVAL" }], edges: [{ from: stepKey, to: "approval" }] };
    const seed = await seedWorkflow(graph);
    await db.workflow.update({ where: { id: seed.workflowId }, data: { key: "chapter-generation-review" } });
    const runId = await seedRun(seed, graph, "RUNNING");
    await db.workflowRun.update({ where: { id: runId }, data: { input: { minimumWordCount: 3 } } });
    const output = { text: JSON.stringify(json), json };
    await db.workflowStepRun.updateMany({ where: { runId, stepKey }, data: { status: "SUCCEEDED", output } });
    expect(await resetRunForRecovery(db, runId)).toBe(true);
    expect((await executor.executeRun(runId)).status).toBe("FAILED");
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).errorMessage).toContain(code);
    expect((await db.workflowStepRun.findUniqueOrThrow({ where: { runId_stepKey: { runId, stepKey } } })).output).toEqual(output);
    expect((await db.workflowStepRun.findUniqueOrThrow({ where: { runId_stepKey: { runId, stepKey: "approval" } } })).status).toBe("PENDING");
    expect(generateCalls).toBe(0);
  });
  it.each([
    ...["write", "rewrite_1", "rewrite_2"].map(stepKey => ({ stepKey, response: { prose: "Dua kata." }, code: "AI_CHAPTER_TOO_SHORT" })),
    { stepKey: "review_vs", response: { findings: [{ severity: "major" }], needsCorrection: false }, code: "AI_CHAPTER_REVIEW_INCONSISTENT" },
    { stepKey: "review_final", response: { findings: [{ severity: "blocking" }], needsCorrection: true }, code: "AI_CHAPTER_REVIEW_UNRESOLVED" },
    { stepKey: "review_final", response: { findings: [], needsCorrection: true }, code: "AI_CHAPTER_REVIEW_UNRESOLVED" },
  ])("blocks invalid $stepKey ($code) before any successor", async ({ stepKey, response, code }) => {
    const outputSchema = "prose" in response
      ? { type: "object", required: ["prose"], properties: { prose: { type: "string" } } }
      : { type: "object", required: ["findings", "needsCorrection"], properties: { findings: { type: "array", items: { type: "object" } }, needsCorrection: { type: "boolean" } } };
    const graph = { steps: [{ key: "context", kind: "RETRIEVAL", instruction: "Compile chapter context" }, { key: stepKey, kind: "AGENT", ref: "writer", outputSchema }, { key: "approval", kind: "HUMAN_APPROVAL" }], edges: [{ from: "context", to: stepKey }, { from: stepKey, to: "approval" }] };
    const seed = await seedWorkflow(graph);
    await db.workflow.update({ where: { id: seed.workflowId }, data: { key: "chapter-generation-review" } });
    await db.workflowVersion.update({ where: { id: seed.versionId }, data: { agentKeys: ["writer"] } });
    const novel = await db.novel.create({ data: { workspaceId: seed.workspaceId, createdById: seed.userId, title: "Length boundary", slug: "length" } });
    const chapter = await db.chapter.create({ data: { novelId: novel.id, createdById: seed.userId, number: 1, title: "Chapter" } });
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { novelId: novel.id, input: { chapterNumber: 1, minimumWordCount: 3, chapterAuthoring: { storyProfile: "Keep the debt reserve separate." } } } });
    const agent = await db.agent.create({ data: { workspaceId: seed.workspaceId, key: "writer", name: "Writer", createdById: seed.userId } });
    const av = await db.agentVersion.create({ data: { agentId: agent.id, number: 1, instructions: "Write", modelProfile: "CREATIVE_WRITER", skillKeys: [], createdById: seed.userId } });
    let instruction = "";
    const driver = createWorkflowExecutor({ db, audit: { record: async () => {} },
      chapterSource: { load: async () => ({ chapterId: chapter.id, chapterNumber: 1, sourceBranchId: crypto.randomUUID(), headRevisionId: null, previousChapter: null, characters: [], ambiguousNames: [], text: "Source fixture" }) },
      retrieval: {} as never,
      compiler: { compile: async () => ({ canDispatch: true, text: "Context", blocks: [], storyPosition: 0, headRevisionId: null }) },
      resolvers: {
        resolveAgent: async () => ({ id: agent.id, key: "writer", versionId: av.id, versionNumber: 1, instructions: "Write", modelProfile: "CREATIVE_WRITER", skillKeys: [], outputSchema: null, temperature: null, maxTokens: null }),
        resolveSkill: async () => { throw Error("No skill"); },
      },
      generate: { generate: async input => {
        instruction = input.messages.map(message => typeof message.content === "string" ? message.content : "").join("\n");
        const generation = await db.generation.create({ data: { workspaceId: seed.workspaceId, task: input.task, modelProfile: input.profile, status: "SUCCEEDED" } });
        return { generationId: generation.id, content: JSON.stringify(response), model: "fixture" };
      } },
    });
    expect((await driver.executeRun(runId)).status).toBe("FAILED");
    expect(instruction).toContain("Keep the debt reserve separate.");
    expect(instruction).toContain("at least 3 words");
    const failed = await db.workflowStepRun.findUniqueOrThrow({ where: { runId_stepKey: { runId, stepKey } } });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toContain(code);
    expect((await db.workflowStepRun.findUniqueOrThrow({ where: { runId_stepKey: { runId, stepKey: "approval" } } })).status).toBe("PENDING");
    expect((await db.chapter.findUniqueOrThrow({ where: { id: chapter.id } })).currentVersionId).toBeNull();
  });
  it.each([undefined, "LORE"])("forwards chapter identity and explicit component override %s", async usageComponent => {
    const graph = { steps: [{ key: "context", kind: "RETRIEVAL", instruction: "Compile chapter context" }, { key: "write", kind: "AGENT", ref: "writer", ...(usageComponent ? { usageComponent } : {}) }], edges: [{ from: "context", to: "write" }] };
    const seed = await seedWorkflow(graph);
    await db.workflow.update({ where: { id: seed.workflowId }, data: { key: "chapter-generation-review" } });
    await db.workflowVersion.update({ where: { id: seed.versionId }, data: { agentKeys: ["writer"] } });
    const novel = await db.novel.create({ data: { workspaceId: seed.workspaceId, createdById: seed.userId, title: "Usage novel", slug: "usage" } });
    const chapter = await db.chapter.create({ data: { novelId: novel.id, createdById: seed.userId, number: 1, title: "Chapter" } });
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { novelId: novel.id, input: { chapterNumber: 1 } } });
    const calls: Array<Record<string, unknown>> = [];
    const agent = await db.agent.create({ data: { workspaceId: seed.workspaceId, key: "writer", name: "Writer", createdById: seed.userId } });
    const agentVersion = await db.agentVersion.create({ data: { agentId: agent.id, number: 1, instructions: "Write", modelProfile: "CREATIVE_WRITER", skillKeys: [], createdById: seed.userId } });
    const driver = createWorkflowExecutor({ db, audit: { record: async () => {} },
      chapterSource: { load: async () => ({ chapterId: chapter.id, chapterNumber: 1, sourceBranchId: crypto.randomUUID(), headRevisionId: null, previousChapter: null, characters: [], ambiguousNames: [], text: "Source fixture" }) },
      retrieval: {} as never,
      compiler: { compile: async () => ({ canDispatch: true, text: "Compiler fixture", blocks: [], storyPosition: 0, headRevisionId: null }) },
      resolvers: {
        resolveAgent: async () => ({ id: agent.id, key: "writer", versionId: agentVersion.id, versionNumber: 1,
          instructions: "Write", modelProfile: "CREATIVE_WRITER", skillKeys: [], outputSchema: null, temperature: null, maxTokens: null }),
        resolveSkill: async () => { throw new Error("No skills expected"); },
      },
      generate: { generate: async input => {
        calls.push(input);
        const generation = await db.generation.create({ data: { workspaceId: input.workspaceId, novelId: input.novelId, task: input.task, component: input.component, artifactId: input.artifactId, modelProfile: input.profile, status: "SUCCEEDED" } });
        return { generationId: generation.id, content: "text", model: "served" };
      } },
    });
    expect((await driver.executeRun(runId)).status).toBe("SUCCEEDED");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ novelId: novel.id, artifactId: chapter.id, component: usageComponent ?? "CHAPTER", task: "workflow:chapter-generation-review:write" });
  });
});

describe("structured model responses", () => {
  const objectSchema = { type: "object", properties: { purpose: { type: "string", minLength: 1 } }, required: ["purpose"] };
  async function fixture(schema: unknown, response: string, agentSchema: unknown = null) {
    const graph = { steps: [{ key: "plan", kind: "AGENT", ref: "planner", ...(schema == null ? {} : { outputSchema: schema }) }, { key: "next", kind: "TRANSFORM", inputs: { plan: "$steps.plan.json" } }], edges: [{ from: "plan", to: "next" }] };
    const seed = await seedWorkflow(graph);
    await db.workflowVersion.update({ where: { id: seed.versionId }, data: { agentKeys: ["planner"] } });
    const agent = await db.agent.create({ data: { workspaceId: seed.workspaceId, key: "planner", name: "Planner", createdById: seed.userId } });
    const version = await db.agentVersion.create({ data: { agentId: agent.id, number: 1, instructions: "Plan the chapter.", modelProfile: "DEEP_PLANNER", skillKeys: [], createdById: seed.userId } });
    const runId = await seedRun(seed, graph);const calls: Array<Record<string, unknown>> = [];
    const driver = createWorkflowExecutor({ db, audit: { record: async () => {} }, resolvers: {
      resolveAgent: async () => ({ id: agent.id, key: "planner", versionId: version.id, versionNumber: 1, instructions: version.instructions, modelProfile: "DEEP_PLANNER", skillKeys: [], outputSchema: agentSchema, temperature: null, maxTokens: null }),
      resolveSkill: async () => { throw Error("No skills"); },
    }, generate: { generate: async input => {
      calls.push(input);
      const generation = await db.generation.create({ data: { workspaceId: seed.workspaceId, task: input.task, modelProfile: input.profile, status: "SUCCEEDED" } });
      return { generationId: generation.id, content: response, model: "fixture" };
    } } });
    const result = await driver.executeRun(runId);
    const rows = await db.workflowStepRun.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
    return { result, calls, rows };
  }
  it("requests JSON-object transport and states the effective contract in the system message", async () => {
    const proof = await fixture(objectSchema, '{"purpose":"Find the letter"}');
    expect(proof.result.status).toBe("SUCCEEDED");expect(proof.calls).toHaveLength(1);
    expect(proof.calls[0]!.outputMode).toBe("json_object");
    const instruction = (proof.calls[0]!.messages as Array<{ content: string }>)[0]!.content;
    expect(JSON.parse(instruction.split("Output contract (authoritative):\n")[1]!.split("\n")[0]!)).toEqual(objectSchema);
  });
  it("uses the resolved immutable definition's output contract rather than a different step contract", async () => {
    const effective = { type: "object", properties: { result: { type: "string" } }, required: ["result"] };
    const proof = await fixture(objectSchema, '{"result":"Definition output"}', effective);
    expect(proof.result.status).toBe("SUCCEEDED");
    const instruction = (proof.calls[0]!.messages as Array<{ content: string }>)[0]!.content;
    expect(JSON.parse(instruction.split("Output contract (authoritative):\n")[1]!.split("\n")[0]!)).toEqual(effective);
  });
  it.each([null, { type: "array", items: { type: "string" } }])("preserves plain and array response transports: %j", async schema => {
    const proof = await fixture(schema, schema === null ? "Plain text" : '["a"]');
    expect(proof.result.status).toBe("SUCCEEDED");expect(proof.calls[0]!.outputMode).toBeUndefined();
  });
  it.each(['{"properties":{"purpose":{"type":"string"}},"required":["purpose"]}', 'No JSON response'])('retains rejected output and generation attribution without retrying or running successors: %s', async response => {
    const proof = await fixture(objectSchema, response);
    expect(proof.result.status).toBe("FAILED");expect(proof.calls).toHaveLength(1);
    expect(proof.rows[0]!.status).toBe("FAILED");
    expect(proof.rows[0]!.generationId).not.toBeNull();
    expect(proof.rows[0]!.instruction).not.toBeNull();
    expect(proof.rows[0]!.output).toEqual({ text: response, json: null });
    expect(proof.rows[1]!.status).not.toBe("SUCCEEDED");
  });
  it("rejects an invalid resolved contract before model dispatch", async () => {
    const proof = await fixture(objectSchema, '{}', { type: "object", unsupportedConstraint: true });
    expect(proof.result.status).toBe("FAILED");expect(proof.calls).toHaveLength(0);
  });
  it("rejects a schema-valid blocked chapter draft and retains it without advancing", async () => {
    const response = JSON.stringify({ prose: "A diagnostic instead of a chapter.", status: "blocked", blocker: "Outline unavailable" });
    const proof = await fixture({ type: "object", properties: { prose: { type: "string" } }, required: ["prose"] }, response);
    expect(proof.result.status).toBe("FAILED");expect(proof.calls).toHaveLength(1);
    expect(proof.rows[0]!.output).toEqual({ text: response, json: null });
    expect(proof.rows[0]!.errorMessage).toContain("AI_CHAPTER_DRAFT_BLOCKED");
    expect(proof.rows[1]!.status).not.toBe("SUCCEEDED");
  });
  it("passes bounded compiled story text alongside provenance through the JSON consumed by chapter steps", async () => {
    const graph = { steps: [{ key: "compile_context", kind: "RETRIEVAL", instruction: "Compile bounded story" }, { key: "next", kind: "TRANSFORM", inputs: { context: "$steps.compile_context.json" } }], edges: [{ from: "compile_context", to: "next" }] };
    const seed = await seedWorkflow(graph),runId = await seedRun(seed, graph);
    const driver = createWorkflowExecutor({ db, audit: { record: async () => {} }, resolvers: { resolveAgent: async () => { throw Error("No agent"); }, resolveSkill: async () => { throw Error("No skill"); } }, retrieval: { search: async () => { throw Error("Compiler owns retrieval"); } }, compiler: { compile: async () => ({ canDispatch: true, text: "Hard canon: the sealed letter remains unopened.", blocks: [{ tier: 3, status: "PRESENT", provenance: { selectedIds: ["fact"] }, rows: [] }], storyPosition: 1, headRevisionId: null }) } });
    expect((await driver.executeRun(runId)).status).toBe("SUCCEEDED");
    const row = await db.workflowStepRun.findFirstOrThrow({ where: { runId, stepKey: "next" } });
    expect(row.output).toMatchObject({ json: { context: { storyContext: "Hard canon: the sealed letter remains unopened.", blocks: [{ selectedIds: ["fact"] }] } } });
  });
});

describe("chapter author instructions", () => {
  it.each(["chapter-generation-review", "chapter-creation-review"])("preserves exact notes and pinned predecessor/profile context through every AI stage of %s", async key => {
    const graph = { steps: [{ key: "compile_context", kind: "RETRIEVAL", instruction: "Compile story" }, ...["plan", "write", "rewrite_1", "review_final"].map(key => ({ key, kind: "AGENT", ref: "writer", instruction: "Perform this stage" }))], edges: ["compile_context", "plan", "write", "rewrite_1"].map((from, i) => ({ from, to: ["plan", "write", "rewrite_1", "review_final"][i]! })) };
    const seed = await seedWorkflow(graph);
    await db.workflow.update({ where: { id: seed.workflowId }, data: { key } });
    await db.workflowVersion.update({ where: { id: seed.versionId }, data: { agentKeys: ["writer"] } });
    const novel = await db.novel.create({ data: { workspaceId: seed.workspaceId, createdById: seed.userId, title: "Outline continuity fixture", slug: "outline" } });
    const branch = await db.novelBranch.create({ data: { workspaceId: seed.workspaceId, novelId: novel.id, name: "main" } });
    const revision = await db.revision.create({ data: { workspaceId: seed.workspaceId, novelId: novel.id, branchId: branch.id, number: 1, origin: "MANUAL" } });
    await db.novelBranch.update({ where: { id: branch.id }, data: { headRevisionId: revision.id } });
    await db.novel.update({ where: { id: novel.id }, data: { currentBranchId: branch.id } });
    const chapter = await db.chapter.create({ data: { novelId: novel.id, number: 10, title: "Reserved chapter", createdById: seed.userId } });
    const outline = await db.outlineVersion.create({ data: { novelId: novel.id, number: 1, content: {}, status: "APPROVED", createdById: seed.userId } });
    const notes = "Don Juan wakes to a knock. Pak Husein brings Anton Pratama and Darma Pratama. They eat breakfast, prepare the fish mixture, then leave for the river.";
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { novelId: novel.id, input: { chapterId: chapter.id, chapterNumber: 10, outlineRef: outline.id, styleNotes: notes, ...(key === "chapter-creation-review" ? { chapterCreationPins: { chapterId: chapter.id, chapterNumber: 10, chapterVersionId: null, outlineRef: outline.id, headRevisionId: revision.id } } : {}) } } });
    const agent = await db.agent.create({ data: { workspaceId: seed.workspaceId, key: "writer", name: "Writer", createdById: seed.userId } });
    const av = await db.agentVersion.create({ data: { agentId: agent.id, number: 1, instructions: "Use the supplied chapter instructions.", modelProfile: "CREATIVE_WRITER", skillKeys: [], createdById: seed.userId } });
    const frame = { chapterId: chapter.id, chapterNumber: 10, sourceBranchId: branch.id, headRevisionId: revision.id, previousChapter: { chapterId: crypto.randomUUID(), chapterNumber: 9, title: "Previous evening", status: "PUBLISHED", versionId: crypto.randomUUID(), version: 2, excerpt: "Don Juan and Sofian ended the evening together.", truncated: false }, characters: [{ id: crypto.randomUUID(), key: "husein", name: "Husein Pratama", storyEntityId: null, summary: "Existing uncle profile", summaryTruncated: false }], ambiguousNames: [], text: "Saved chapter9 v2: previous evening. Existing Husein Pratama profile." };
    const prompts: string[] = [], compilerInstructions: string[] = [];
    const driver = createWorkflowExecutor({ db, audit: { record: async () => {} }, resolvers: { resolveAgent: async () => ({ id: agent.id, key: "writer", versionId: av.id, versionNumber: 1, instructions: av.instructions, modelProfile: "CREATIVE_WRITER", skillKeys: [], outputSchema: null, temperature: null, maxTokens: null }), resolveSkill: async () => { throw Error("No skills"); } },
      chapterSource: { load: async input => { expect(input.authorInstructions).toBe(notes); return frame; } },
      retrieval: {} as never, compiler: { compile: async input => { compilerInstructions.push(input.instruction); return { canDispatch: true, text: "Existing approved outline", blocks: [{ tier: 2, status: "PRESENT", provenance: {}, rows: [] }], storyPosition: 9, headRevisionId: revision.id }; } },
      generate: { generate: async input => { prompts.push(input.messages[1]!.content); expect(input.promptVersion).toBe("chapter-author-context-v1"); const generation = await db.generation.create({ data: { workspaceId: seed.workspaceId, novelId: novel.id, task: input.task, modelProfile: input.profile, status: "SUCCEEDED" } }); return { content: "Proposed stage output", generationId: generation.id, model: "fixture" }; } },
    });
    expect((await driver.executeRun(runId)).status).toBe("SUCCEEDED");
    expect(prompts).toHaveLength(4);
    for (const prompt of [...prompts, ...compilerInstructions]) { expect(prompt).toContain(notes); expect(prompt).toContain(frame.text); }
    const persisted = await db.workflowStepRun.findUniqueOrThrow({ where: { runId_stepKey: { runId, stepKey: "compile_context" } } });
    expect(persisted.output).toMatchObject({ json: { authorInstructions: notes, contextProtocol: "chapter-author-context-v1", chapterSource: { previousChapter: { versionId: frame.previousChapter.versionId }, characters: frame.characters } } });
  });
});

describe("guarded claims", () => {
  it("claimRunForExecution has exactly one winner", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    const results = await Promise.all([
      claimRunForExecution(db, runId),
      claimRunForExecution(db, runId),
      claimRunForExecution(db, runId),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("RUNNING");
  });

  it("claimRunForExecution fails when the run is not PENDING", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    expect(await claimRunForExecution(db, runId)).toBe(false);
    expect(await claimRunForExecution(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("claimStepForExecution has exactly one winner (no double commit)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    const results = await Promise.all([
      claimStepForExecution(db, runId, "a"),
      claimStepForExecution(db, runId, "a"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("resetRunForRecovery moves RUNNING → PENDING atomically", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    expect(await resetRunForRecovery(db, runId)).toBe(true);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("PENDING");
    // Second reset is a no-op: the row is no longer RUNNING.
    expect(await resetRunForRecovery(db, runId)).toBe(false);
  });

  it("isRunCancelled reflects the row", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    expect(await isRunCancelled(db, runId)).toBe(false);
    await db.workflowRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });
    expect(await isRunCancelled(db, runId)).toBe(true);
  });
});

describe("executeRun", () => {
  it("drives a TRANSFORM chain to SUCCEEDED and records outcomes", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    await db.workflowRun.update({ where: { id: runId }, data: { input: { x: "hello" } } });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.stepCount).toBe(2);
    expect((run.output as Record<string, unknown>)["b"]).toEqual({ v: { v: "hello" } });

    const steps = await db.workflowStepRun.findMany({
      where: { runId },
      orderBy: { sequence: "asc" },
    });
    expect(steps.map((s) => s.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    // Outcomes are stored as envelopes for recovery.
    expect((steps[0]!.output as { text: string }).text).toBe("hello");
  });

  it("exits silently when the run claim is lost", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(false);
    expect(generateCalls).toBe(0);
  });

  it("marks untaken branches SKIPPED (no PENDING row left behind)", async () => {
    const graph = {
      steps: [
        { key: "check", kind: "CONDITION", condition: { path: "$input.go", equals: true } },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
      ],
    };
    const seed = await seedWorkflow(graph);
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { input: { go: false } } });

    await executor.executeRun(runId);
    const steps = await db.workflowStepRun.findMany({ where: { runId } });
    expect(steps.find((s) => s.stepKey === "yes")!.status).toBe("SKIPPED");
    expect(steps.find((s) => s.stepKey === "no")!.status).toBe("SUCCEEDED");
    expect(steps.every((s) => s.status !== "PENDING")).toBe(true);
  });

  it("branches a CONDITION on a one-level nested json field (NF-WF-006)", async () => {
    // producer's json outcome is { v: <input flag> }; the CONDITION reads
    // $steps.producer.json.v — the bounded-correction mechanism.
    const graph = {
      steps: [
        { key: "producer", kind: "TRANSFORM", inputs: { v: "$input.flag" } },
        {
          key: "check",
          kind: "CONDITION",
          condition: { path: "$steps.producer.json.v", equals: true },
        },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "producer", to: "check" },
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
      ],
    };
    for (const [flag, winner] of [
      [true, "yes"],
      [false, "no"],
    ] as const) {
      const seed = await seedWorkflow(graph);
      const runId = await seedRun(seed, graph);
      await db.workflowRun.update({ where: { id: runId }, data: { input: { flag } } });
      await executor.executeRun(runId);
      const steps = await db.workflowStepRun.findMany({ where: { runId } });
      expect(steps.find((s) => s.stepKey === winner)!.status).toBe("SUCCEEDED");
      expect(steps.find((s) => s.stepKey === (winner === "yes" ? "no" : "yes"))!.status).toBe(
        "SKIPPED",
      );
    }
  });

  it("resolves a missing nested field to undefined (takes the false branch)", async () => {
    const graph = {
      steps: [
        { key: "producer", kind: "TRANSFORM", inputs: { v: "$input.flag" } },
        {
          key: "check",
          kind: "CONDITION",
          condition: { path: "$steps.producer.json.absent", equals: true },
        },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "producer", to: "check" },
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
      ],
    };
    const seed = await seedWorkflow(graph);
    const runId = await seedRun(seed, graph);
    await db.workflowRun.update({ where: { id: runId }, data: { input: { flag: true } } });
    await executor.executeRun(runId);
    const steps = await db.workflowStepRun.findMany({ where: { runId } });
    // undefined === true is false: the missing field pins the false branch.
    expect(steps.find((s) => s.stepKey === "no")!.status).toBe("SUCCEEDED");
    expect(steps.find((s) => s.stepKey === "yes")!.status).toBe("SKIPPED");
  });

  it("skips the terminal write when stopped for cancellation", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS);
    // Cancel before the drive: the between-steps check stops the loop.
    await db.workflowRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(false);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "CANCELLED",
    );
  });

  it("adopts already-SUCCEEDED steps on recovery without re-executing", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    // Simulate a crash after step "a": its row is SUCCEEDED with an outcome.
    await db.workflowStepRun.updateMany({
      where: { runId, stepKey: "a" },
      data: {
        status: "SUCCEEDED",
        output: { text: "hello", json: { v: "hello" } },
        completedAt: new Date(),
      },
    });
    // The sweeper's reset comes first (RUNNING → PENDING); only then the
    // worker claims and resumes.
    expect(await resetRunForRecovery(db, runId)).toBe(true);

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    // Step "a" was not re-executed (still one row), step "b" used its outcome.
    expect(await db.workflowStepRun.count({ where: { runId, stepKey: "a" } })).toBe(1);
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect((run.output as Record<string, unknown>)["b"]).toEqual({ v: { v: "hello" } });
    expect(run.stepCount).toBe(2);
  });
});

describe("recoverStaleRuns", () => {
  function fakeQueue(jobs: Map<string, "completed" | "failed" | "waiting">) {
    const added: Array<{ jobId: string }> = [];
    const removed: string[] = [];
    return {
      added,
      removed,
      queue: {
        getJob: async (jobId: string) => {
          const state = jobs.get(jobId);
          if (!state) return null;
          return {
            getState: async () => state,
            remove: async () => {
              removed.push(jobId);
              jobs.delete(jobId);
            },
          };
        },
        add: async (_name: string, _data: unknown, opts: { jobId: string }) => {
          // BullMQ semantics: re-adding an existing jobId is a silent no-op.
          if (jobs.has(opts.jobId)) return { id: opts.jobId };
          jobs.set(opts.jobId, "waiting");
          added.push({ jobId: opts.jobId });
          return { id: opts.jobId };
        },
      },
    };
  }

  it("resets an orphaned RUNNING run and re-enqueues it (dead job removed first)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    // The job died: record retained as failed (attempts: 1).
    const jobs = new Map([[runId, "failed" as const]]);
    const { added, removed, queue } = fakeQueue(jobs);

    const report = await executor.recoverStaleRuns(queue);
    expect(report.resetRuns).toEqual([runId]);
    expect(report.requeuedRuns).toEqual([runId]);
    // F12: the dead record is removed BEFORE re-add, or the re-add no-ops.
    expect(removed).toEqual([runId]);
    expect(added).toEqual([{ jobId: runId }]);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "PENDING",
    );

    // And the recovered run completes.
    const result = await executor.executeRun(runId);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("leaves a RUNNING run with a live job alone", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "RUNNING");
    const jobs = new Map([[runId, "waiting" as const]]);
    const { added, queue } = fakeQueue(jobs);

    const report = await executor.recoverStaleRuns(queue);
    expect(report.resetRuns).toEqual([]);
    expect(added).toEqual([]);
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
      "RUNNING",
    );
  });

  it("enqueues a PENDING orphan (row without any job record)", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "PENDING");
    // Age the row past the 5-minute orphan threshold. Via Prisma (JS
    // Date), not raw SQL: the column is `timestamp without time zone`
    // and the session tz would skew a `now()`-based UPDATE.
    await db.workflowRun.update({
      where: { id: runId },
      data: { startedAt: new Date(Date.now() - 6 * 60_000) },
    });
    const { added, queue } = fakeQueue(new Map());

    const report = await executor.recoverStaleRuns(queue);
    expect(report.orphanEnqueues).toEqual([runId]);
    expect(added).toEqual([{ jobId: runId }]);
  });

  it("does not treat a fresh PENDING run as an orphan", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "PENDING");
    const { added, queue } = fakeQueue(new Map());

    const report = await executor.recoverStaleRuns(queue);
    expect(report.orphanEnqueues).toEqual([]);
    expect(added).toEqual([]);
    expect(runId).toBeTruthy();
  });
  it("recovers approval delivery that raced a retained completed park job", async () => {
    const seed = await seedWorkflow(TWO_TRANSFORMS);
    const runId = await seedRun(seed, TWO_TRANSFORMS, "PENDING");
    await db.workflowRun.update({ where: { id: runId }, data: { startedAt: new Date(Date.now() - 6 * 60_000) } });
    const { added, removed, queue } = fakeQueue(new Map([[runId, "completed" as const]]));
    const report = await executor.recoverStaleRuns(queue);
    expect(report.orphanEnqueues).toEqual([runId]);
    expect(removed).toEqual([runId]);
    expect(added).toEqual([{ jobId: runId }]);
    expect((await executor.executeRun(runId)).status).toBe("SUCCEEDED");
  });
});

describe("approval snapshot (NF-WF-005)", () => {
  const APPROVAL_GRAPH = {
    steps: [
      { key: "draft", kind: "TRANSFORM", inputs: { v: "$input.x" } },
      { key: "review", kind: "HUMAN_APPROVAL", instruction: "Approve the draft" },
      { key: "final", kind: "TRANSFORM", inputs: { v: "$steps.draft.json" } },
    ],
    edges: [
      { from: "draft", to: "review" },
      { from: "review", to: "final" },
    ],
  };

  it("canonicalizeJson sorts keys recursively (fixed vector)", () => {
    const material = {
      instruction: "Approve the draft: héllo",
      priorOutcomes: { a: { text: "x", json: { v: 1 } } },
      workflowVersionNumber: 3,
      agentVersions: { writer: 2 },
      skillVersions: {},
    };
    expect(canonicalizeJson(material)).toBe(
      '{"agentVersions":{"writer":2},"instruction":"Approve the draft: héllo","priorOutcomes":{"a":{"json":{"v":1},"text":"x"}},"skillVersions":{},"workflowVersionNumber":3}',
    );
  });

  it("hashApprovalMaterial matches the fixed sha256 vector", () => {
    const material = {
      instruction: "Approve the draft: héllo",
      priorOutcomes: { a: { text: "x", json: { v: 1 } } },
      workflowVersionNumber: 3,
      agentVersions: { writer: 2 },
      skillVersions: {},
    };
    expect(hashApprovalMaterial(material)).toBe(
      "4da4268402993a7056f08b931e324fecc68dd298b1e78e51760478eb6caac36a",
    );
    // Key order in the input must not matter.
    expect(
      hashApprovalMaterial({
        skillVersions: {},
        agentVersions: { writer: 2 },
        workflowVersionNumber: 3,
        priorOutcomes: { a: { json: { v: 1 }, text: "x" } },
        instruction: "Approve the draft: héllo",
      }),
    ).toBe(
      "4da4268402993a7056f08b931e324fecc68dd298b1e78e51760478eb6caac36a",
    );
  });

  it("persists the approval snapshot in the same write that parks the step", async () => {
    const seed = await seedWorkflow(APPROVAL_GRAPH);
    const runId = await seedRun(seed, APPROVAL_GRAPH);
    await db.workflowRun.update({
      where: { id: runId },
      data: { input: { x: "hello" } },
    });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("AWAITING_APPROVAL");

    const step = await db.workflowStepRun.findFirstOrThrow({
      where: { runId, stepKey: "review" },
    });
    expect(step.status).toBe("AWAITING_APPROVAL");
    const snapshot = step.approvalSnapshot as {
      material: {
        instruction: string;
        priorOutcomes: Record<string, { text: string | null; json: unknown }>;
        workflowVersionNumber: number;
        agentVersions: Record<string, number>;
        skillVersions: Record<string, number>;
      };
      snapshotHash: string;
    };
    expect(snapshot).not.toBeNull();
    // The material binds what the approver saw.
    expect(snapshot.material.instruction).toBe("Approve the draft");
    expect(snapshot.material.priorOutcomes["draft"]).toBeDefined();
    expect(snapshot.material.workflowVersionNumber).toBe(1);
    expect(snapshot.material.agentVersions).toEqual({});
    expect(snapshot.material.skillVersions).toEqual({});
    // The hash is the canonical sha256 of the material.
    expect(snapshot.snapshotHash).toBe(hashApprovalMaterial(snapshot.material));
    expect(snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips the decided approval step on resume and runs post-approval steps once", async () => {
    const seed = await seedWorkflow(APPROVAL_GRAPH);
    const runId = await seedRun(seed, APPROVAL_GRAPH);
    await db.workflowRun.update({
      where: { id: runId },
      data: { input: { x: "hello" } },
    });
    await executor.executeRun(runId);

    const before = await db.workflowStepRun.findMany({ where: { runId } });
    const draftCompletedAt = before.find((s) => s.stepKey === "draft")!.completedAt;

    // Simulate the decide path: the approval step is SUCCEEDED (with its
    // decision row), the run is PENDING again — the resume cursor.
    const reviewRow = before.find((s) => s.stepKey === "review")!;
    await db.workflowStepRun.update({
      where: { id: reviewRow.id },
      data: {
        status: "SUCCEEDED",
        output: { text: null, json: { decision: "APPROVED" } },
        completedAt: new Date(),
      },
    });
    await db.workflowApprovalDecision.create({
      data: {
        runId,
        stepRunId: reviewRow.id,
        stepKey: "review",
        decision: "APPROVED",
        snapshotHash: "h",
        pins: {},
        reason: null,
      },
    });
    await db.workflowRun.update({ where: { id: runId }, data: { status: "PENDING" } });

    const result = await executor.executeRun(runId);
    expect(result.claimed).toBe(true);
    expect(result.status).toBe("SUCCEEDED");

    const after = await db.workflowStepRun.findMany({ where: { runId } });
    // The pre-approval step was not re-executed: same row, same completedAt.
    const draftAfter = after.find((s) => s.stepKey === "draft")!;
    expect(after.filter((s) => s.stepKey === "draft")).toHaveLength(1);
    expect(draftAfter.completedAt?.getTime()).toBe(draftCompletedAt?.getTime());
    // The decided approval step was not re-parked: still SUCCEEDED, one row.
    expect(after.filter((s) => s.stepKey === "review")).toHaveLength(1);
    expect(after.find((s) => s.stepKey === "review")!.status).toBe("SUCCEEDED");
    // The post-approval step ran exactly once.
    expect(after.find((s) => s.stepKey === "final")!.status).toBe("SUCCEEDED");
    const run = await db.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("SUCCEEDED");
  });
});
