import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createAuditService, createChapterSourceReader, createPlatformServices } from "@novelforge/ai-services";
import { createWorkflowExecutor } from "../../../packages/workflow-executor/index.ts";
import { createWorkflowRunServices } from "./services/workflow-runs.ts";
import { resolveAgent, resolveSkill } from "./services/definition-resolution.ts";
import type { WorkflowQueue } from "./services/workflow-queue.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { registerDefinitionRoutes, type DefinitionRoutesOptions } from "./definition-routes.ts";
import { registerPlatformRoutes, type PlatformRoutesOptions } from "./platform-routes.ts";

// Actual PostgreSQL/executor regressions; the generation port is deterministic.
const name = `novelforge_test_retry_${Date.now()}`;
const base = new URL(process.env.DATABASE_URL!);
base.pathname = "/postgres";
const target = new URL(base); target.pathname = `/${name}`;
let db: NovelForgeDb;
let admin: pg.Client;
beforeAll(async () => {
  admin = new pg.Client({ connectionString: base.toString() }); await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const root = path.resolve(import.meta.dirname, "../../../packages/database");
  execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: target.toString() }, stdio: "pipe" });
  db = createDb(target.toString());
}, 120_000);
afterAll(async () => {
  await db?.$disconnect();
  if (admin) { await admin.query(`DROP DATABASE ${name}`); await admin.end(); }
});

async function fixture() {
  const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@retry.test`, passwordHash: "test", displayName: "Retry test" } });
  const workspace = await db.workspace.create({ data: { ownerId: user.id, name: "Retry", slug: crypto.randomUUID() } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  const agent = await db.agent.create({ data: { workspaceId: workspace.id, key: "writer", name: "Writer", createdById: user.id, status: "PUBLISHED" } });
  const version = await db.agentVersion.create({ data: { agentId: agent.id, number: 1, instructions: "test", modelProfile: "CREATIVE_WRITER", skillKeys: [], outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, createdById: user.id } });
  await db.agent.update({ where: { id: agent.id }, data: { currentVersionId: version.id } });
  const workflow = await db.workflow.create({ data: { workspaceId: workspace.id, key: "retry-test", name: "Retry", status: "PUBLISHED", createdById: user.id } });
  const graph = { steps: [{ key: "write", kind: "AGENT", ref: "writer", instruction: "write" }, { key: "review", kind: "AGENT", ref: "writer", instruction: "review" }], edges: [{ from: "write", to: "review" }], maxSteps: 4 };
  const wv = await db.workflowVersion.create({ data: { workflowId: workflow.id, number: 1, graph, agentKeys: ["writer"], skillKeys: [], createdById: user.id } });
  await db.workflow.update({ where: { id: workflow.id }, data: { currentVersionId: wv.id } });
  const jobs: string[] = []; let queueFails = false; let invalid = true; let transport: "TRANSIENT" | "RATE_LIMIT" | "AUTH" | null = null;
  const queue = { add: async (_: string, data: { runId: string }) => { if (queueFails) throw new Error("queue offline"); jobs.push(data.runId); }, getJob: async () => undefined } as unknown as WorkflowQueue;
  const audit = createAuditService(db);
  const service = createWorkflowRunServices({ db, audit, queue });
  const calls: string[] = [];
  const executor = createWorkflowExecutor({ db, audit, chapterSource: createChapterSourceReader(db), resolvers: { resolveAgent: (ws, key, id) => resolveAgent(db, ws, key, id), resolveSkill: (ws, key, id) => resolveSkill(db, ws, key, id) }, generate: { generate: async input => {
    calls.push(input.task);
    const failure = input.task.endsWith(":review") ? transport : null;
    const generation = await db.generation.create({ data: { workspaceId: workspace.id, task: input.task, userId: user.id, modelProfile: "CREATIVE_WRITER", status: failure ? "FAILED" : "SUCCEEDED", errorCategory: failure ?? "NONE" } });
    if (failure) throw Object.assign(new Error("classified transport failure"), { generationId: generation.id });
    return { generationId: generation.id, model: "test", content: input.task.endsWith(":review") && invalid ? "{}" : '{"ok":true}' };
  } } });
  const scope = { actorUserId: user.id, workspaceId: workspace.id };
  const queued = await service.enqueueRun({ ...scope, workflowId: workflow.id });
  return { db, user, workspace, workflow, wv, agent, version, service, executor, queue, jobs, calls, scope, runId: queued.run.id, setValid: () => { invalid = false; }, failQueue: (fail: boolean) => { queueFails = fail; }, setTransport: (v: typeof transport) => { transport = v; } };
}

describe("manual workflow retry", () => {
  it("pins the stored novel policy over forged caller policy and retains it after DNA changes", async () => {
    const f = await fixture();
    await db.workflow.update({ where: { id: f.workflow.id }, data: { key: "chapter-generation-review" } });
    const novel = await db.novel.create({ data: { workspaceId: f.workspace.id, createdById: f.user.id, title: "Scoped policy", slug: "scoped-policy" } });
    await db.narrativeDnaProfile.create({ data: { novelId: novel.id, dna: { voice: "quiet", chapterAuthoring: { minimumWordCount: 2500, storyProfile: "Stored policy" } } } });
    const queued = await f.service.enqueueRun({ ...f.scope, workflowId: f.workflow.id, novelId: novel.id, runInput: { targetWordCount: 1000, minimumWordCount: 1, chapterAuthoring: { storyProfile: "Forged policy", minimumWordCount: 1 } } });
    const read = await db.workflowRun.findUniqueOrThrow({ where: { id: queued.run.id } });
    expect(read.input).toMatchObject({ minimumWordCount: 2500, targetWordCount: 2500, chapterAuthoring: { minimumWordCount: 2500, storyProfile: "Stored policy" } });
    await db.narrativeDnaProfile.update({ where: { novelId: novel.id }, data: { dna: { chapterAuthoring: { minimumWordCount: 3000, storyProfile: "Later policy" } } } });
    expect((await db.workflowRun.findUniqueOrThrow({ where: { id: queued.run.id } })).input).toEqual(read.input);
    await expect(f.service.enqueueRun({ ...f.scope, workflowId: f.workflow.id, novelId: novel.id, runInput: { minimumWordCount: "2500" } })).rejects.toThrow("minimumWordCount");
  });
  it("authenticates the retry route and returns 202 then 200 with the same status URL", async () => {
    const f = await fixture(); await f.executor.executeRun(f.runId);
    const app = Fastify(); await app.register(cookie);
    const auth = { validateSession: async () => ({ userId: f.user.id }) } as unknown as DefinitionRoutesOptions["auth"];
    await registerPlatformRoutes(app, { auth, services: {} as PlatformRoutesOptions["services"] });
    registerDefinitionRoutes(app, { auth, definitions: {} as DefinitionRoutesOptions["definitions"], runs: f.service, platformRoleOf: async () => null });
    const url = `/api/workspaces/${f.workspace.id}/workflow-runs/${f.runId}/retry`;
    try {
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
      const headers = { cookie: "nf_session=temporary-test-token" };
      const first = await app.inject({ method: "POST", url, headers });
      expect(first.statusCode).toBe(202);
      const second = await app.inject({ method: "POST", url, headers });
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(first.json().id);
      expect(first.json().statusUrl).toBe(`/api/workspaces/${f.workspace.id}/workflow-runs/${first.json().id}`);
    } finally { await app.close(); }
  });
  it.each(["VALIDATOR", "HUMAN_APPROVAL", "BLOCKED_DRAFT", "UNSAFE_PREFIX"])("refuses %s without creating a child", async variant => {
    const f = await fixture(); await f.executor.executeRun(f.runId);
    const failed = await db.workflowStepRun.findFirstOrThrow({ where: { runId: f.runId, status: "FAILED" } });
    if (variant === "VALIDATOR" || variant === "HUMAN_APPROVAL") await db.workflowStepRun.update({ where: { id: failed.id }, data: { kind: variant } });
    if (variant === "BLOCKED_DRAFT") await db.workflowStepRun.update({ where: { id: failed.id }, data: { output: { text: JSON.stringify({ prose: "", status: "blocked" }), json: null } } });
    if (variant === "UNSAFE_PREFIX") await db.workflowStepRun.updateMany({ where: { runId: f.runId, status: "SUCCEEDED" }, data: { kind: "HUMAN_APPROVAL" } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    expect(await db.workflowRun.count({ where: { idempotencyKey: `retry:${f.runId}` } })).toBe(0);
  });
  it("validates actual saved chapter source, refuses changed chapter/outline/head and retains old creation pins", async () => {
    const f = await fixture(); await f.executor.executeRun(f.runId);
    const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({ ...f.scope, title: "Retry story", slug: crypto.randomUUID() });
    const fullNovel = await db.novel.findUniqueOrThrow({ where: { id: novel.id }, include: { currentBranch: true } });
    const chapter = await db.chapter.create({ data: { novelId: novel.id, number: 1, title: "Placeholder", createdById: f.user.id } });
    const outline = await db.outlineVersion.create({ data: { novelId: novel.id, number: 1, status: "APPROVED", content: [], createdById: f.user.id } });
    const source = await createChapterSourceReader(db).load({ ...f.scope, novelId: novel.id, chapterId: chapter.id, chapterNumber: 1, authorInstructions: "" });
    // Model the source format saved before chapterVersionId was exposed.
    const legacy = { ...source }; delete legacy.chapterVersionId;
    legacy.text = legacy.text.replace(',"chapterVersionId":null', "");
    await db.workflow.update({ where: { id: f.workflow.id }, data: { key: "chapter-creation-review" } });
    const graph = { steps: [{ key: "write", kind: "RETRIEVAL", instruction: "context" }, { key: "review", kind: "AGENT", ref: "writer", instruction: "review" }], edges: [{ from: "write", to: "review" }], maxSteps: 4 };
    await db.workflowVersion.update({ where: { id: f.wv.id }, data: { graph } });
    await db.workflowRun.update({ where: { id: f.runId }, data: { novelId: novel.id, input: { chapterId: chapter.id, chapterNumber: 1, outlineRef: outline.id, chapterCreationPins: { chapterId: chapter.id, chapterNumber: 1, chapterVersionId: null, outlineRef: outline.id, headRevisionId: fullNovel.currentBranch!.headRevisionId } } } });
    const steps = await db.workflowStepRun.findMany({ where: { runId: f.runId }, orderBy: { sequence: "asc" } });
    await db.workflowStepRun.update({ where: { id: steps[0]!.id }, data: { kind: "RETRIEVAL", output: { text: legacy.text, json: { chapterSource: legacy, contextProtocol: "chapter-author-context-v1", headRevisionId: source.headRevisionId } } } });
    await db.generation.update({ where: { id: steps[1]!.generationId! }, data: { novelId: novel.id } });
    expect((await f.service.getRun({ ...f.scope, runId: f.runId })).retry?.reason).toBe("INVALID_AI_OUTPUT");
    await db.chapter.update({ where: { id: chapter.id }, data: { status: "PUBLISHED" } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    await db.chapter.update({ where: { id: chapter.id }, data: { status: "DRAFT" } });
    await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "DRAFT" } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "APPROVED" } });
    await db.novelBranch.update({ where: { id: source.sourceBranchId }, data: { headRevisionId: null } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    await db.novelBranch.update({ where: { id: source.sourceBranchId }, data: { headRevisionId: source.headRevisionId } });
    const child = await f.service.retryRun({ ...f.scope, runId: f.runId });
    // A later source edit must still block the queued child before a model call.
    await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "DRAFT" } });
    const calls = f.calls.length; await f.executor.executeRun(child.run.id);
    expect(f.calls).toHaveLength(calls);
    expect((await f.service.getRun({ ...f.scope, runId: child.run.id })).status).toBe("FAILED");
    const queuedCount = f.jobs.length;
    const lostResponse = await f.service.retryRun({ ...f.scope, runId: f.runId });
    expect(lostResponse.deduped).toBe(true);
    expect(lostResponse.run.id).toBe(child.run.id);
    expect(f.jobs).toHaveLength(queuedCount);
  });
  it("reuses validated prefix, deduplicates concurrent submissions, preserves original history and audits child", async () => {
    const f = await fixture(); await f.executor.executeRun(f.runId);
    const original = await db.workflowRun.findUniqueOrThrow({ where: { id: f.runId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    expect((await f.service.getRun({ ...f.scope, runId: f.runId })).retry).toEqual({ stepKey: "review", reason: "INVALID_AI_OUTPUT" });
    const results = await Promise.all([f.service.retryRun({ ...f.scope, runId: f.runId }), f.service.retryRun({ ...f.scope, runId: f.runId })]);
    expect(results.map(r => r.run.id)).toEqual([results[0]!.run.id, results[0]!.run.id]);
    expect(results.filter(r => r.deduped)).toHaveLength(1);
    f.setValid(); await f.executor.executeRun(results[0]!.run.id);
    expect(f.calls.filter(t => t.endsWith(":write"))).toHaveLength(1);
    expect(f.calls.filter(t => t.endsWith(":review"))).toHaveLength(2);
    expect((await f.service.getRun({ ...f.scope, runId: results[0]!.run.id })).status).toBe("SUCCEEDED");
    await db.workflow.update({ where: { id: f.workflow.id }, data: { status: "ARCHIVED" } });
    const queuedCount = f.jobs.length;
    expect((await f.service.retryRun({ ...f.scope, runId: f.runId })).run.id).toBe(results[0]!.run.id);
    expect(f.jobs).toHaveLength(queuedCount);
    expect(await db.workflowRun.findUniqueOrThrow({ where: { id: f.runId }, include: { steps: { orderBy: { sequence: "asc" } } } })).toEqual(original);
    expect(await db.auditLog.count({ where: { action: "workflow.run_retried", entityId: results[0]!.run.id } })).toBe(1);
  });
  it.each(["TRANSIENT", "RATE_LIMIT"] as const)("exposes typed %s failure and leaves a recoverable child after queue failure", async category => {
    const f = await fixture(); f.setTransport(category); await f.executor.executeRun(f.runId);
    expect((await f.service.getRun({ ...f.scope, runId: f.runId })).retry?.reason).toBe(category);
    f.failQueue(true); await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("queue offline");
    const child = await db.workflowRun.findFirstOrThrow({ where: { idempotencyKey: `retry:${f.runId}` } });
    expect(child.status).toBe("PENDING");
    f.failQueue(false); f.setTransport(null); f.setValid();
    await db.workflowRun.update({ where: { id: child.id }, data: { startedAt: new Date(Date.now() - 6 * 60_000) } });
    const recovered = await f.executor.recoverStaleRuns(f.queue as unknown as Parameters<typeof f.executor.recoverStaleRuns>[0]);
    expect(recovered.orphanEnqueues).toContain(child.id);
    const retried = await f.service.retryRun({ ...f.scope, runId: f.runId });
    expect(retried.deduped).toBe(true); expect(retried.run.id).toBe(child.id);
    await f.executor.executeRun(child.id); expect(f.calls.filter(t => t.endsWith(":write"))).toHaveLength(1);
  });
  it("refuses auth failures, revoked capability, cross-tenant access, missing pins and valid output failures", async () => {
    const f = await fixture(); f.setTransport("AUTH"); await f.executor.executeRun(f.runId);
    expect((await f.service.getRun({ ...f.scope, runId: f.runId })).retry).toBeUndefined();
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    await expect(f.service.retryRun({ ...f.scope, workspaceId: crypto.randomUUID(), runId: f.runId })).rejects.toThrow();
    await db.membership.update({ where: { workspaceId_userId: { workspaceId: f.workspace.id, userId: f.user.id } }, data: { role: "VIEWER" } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow();
    await db.membership.update({ where: { workspaceId_userId: { workspaceId: f.workspace.id, userId: f.user.id } }, data: { role: "OWNER" } });
    const step = await db.workflowStepRun.findFirstOrThrow({ where: { runId: f.runId, status: "FAILED" } });
    await db.generation.update({ where: { id: step.generationId! }, data: { status: "SUCCEEDED", errorCategory: "NONE" } });
    await db.workflowStepRun.update({ where: { id: step.id }, data: { output: { text: '{"ok":true}', json: null } } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
    await db.workflowRun.update({ where: { id: f.runId }, data: { definitionsPinnedAt: null } });
    await expect(f.service.retryRun({ ...f.scope, runId: f.runId })).rejects.toThrow("WORKFLOW_RETRY_UNAVAILABLE");
  });
});
