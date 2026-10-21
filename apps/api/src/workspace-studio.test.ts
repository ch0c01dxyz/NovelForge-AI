import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, expect, it } from "vitest";
import pg from "pg";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { CHAPTER_GENERATION_REVIEW, WORKSPACE_STARTER_SKILLS } from "@novelforge/workflow-templates";
import { createDbDefinitionResolvers, createWorkflowExecutor } from "@novelforge/workflow-executor";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";

const database = "novelforge_test_workspace_studio";
const base = new URL(process.env.DATABASE_URL!);
base.pathname = `/${database}`;
const url = base.toString();
let db: NovelForgeDb;
let app: FastifyInstance;
beforeAll(async () => {
  const adminUrl = new URL(url);adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();
  const root = fileURLToPath(new URL("../../../packages/database/", import.meta.url));
  execFileSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  db = createDb(url);
  app = await buildApp({ NODE_ENV: "test", PORT: 3002, DATABASE_URL: url, REDIS_URL: "redis://localhost:6399", S3_ENDPOINT: "http://localhost:9000", S3_REGION: "us-east-1", S3_BUCKET: "test", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", OMNIROUTE_BASE_URL: "http://localhost:20128", OMNIROUTE_API_KEY: "test", APP_ENCRYPTION_KEY: "test-starter-key", AI_ROUTING_STRATEGY: "PRIORITY" }, { db, workflowQueue: { add: async () => ({ id: "fixture" }), getJob: async () => undefined, close: async () => {} } });
}, 60000);
afterAll(async () => { await app?.close();await db?.$disconnect(); });

async function fixture(role: "OWNER" | "ADMIN" | "AUTHOR" = "OWNER") {
  const tag = crypto.randomUUID();
  const user = await db.user.create({ data: { email: `${tag}@example.test`, displayName: "Starter proof", passwordHash: "not-a-login" } });
  const workspace = await db.workspace.create({ data: { name: "Starter proof", slug: tag, ownerId: user.id } });
  await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role } });
  const token = generateSessionToken();
  await db.session.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { workspaceId: workspace.id, cookie: `nf_session=${token}`, userId: user.id };
}
function install(f: { workspaceId: string; cookie: string }) {
  return app.inject({ method: "POST", url: `/api/workspaces/${f.workspaceId}/studio/starter-pack`, headers: { cookie: f.cookie }, payload: {} });
}

it("installs the strict creation workflow without altering legacy definitions and rejects unauthorized or conflicting setup", async () => {
  const f = await fixture();
  expect((await install(f)).statusCode).toBe(200);
  const before = await db.agentVersion.findMany({ where: { agent: { workspaceId: f.workspaceId } }, orderBy: { id: "asc" } });
  const setup = (who = f) => app.inject({ method: "POST", url: `/api/workspaces/${who.workspaceId}/studio/chapter-creation`, headers: { cookie: who.cookie }, payload: {} });
  const created = await setup();expect(created.statusCode).toBe(200);
  expect(created.json().created).toBe(true);
  expect((await setup()).json()).toEqual({ ...created.json(), created: false });
  expect(await db.agentVersion.findMany({ where: { agent: { workspaceId: f.workspaceId } }, orderBy: { id: "asc" } })).toEqual(before);
  expect(await db.workflowVersion.count({ where: { workflow: { workspaceId: f.workspaceId } } })).toBe(2);
  expect((await setup(await fixture("AUTHOR"))).statusCode).toBe(403);
  expect((await setup({ ...f, cookie: "" })).statusCode).toBe(401);
  await db.workflowVersion.update({ where: { id: (await db.workflow.findUniqueOrThrow({ where: { id: created.json().workflowId } })).currentVersionId! }, data: { graph: { steps: [], edges: [] } } });
  expect((await setup()).statusCode).toBe(409);
  expect(await db.auditLog.count({ where: { workspaceId: f.workspaceId, action: "studio.chapter_creation.installed" } })).toBe(1);
});

it("rejects missing/stale/foreign creation targets before enqueue and records only server-resolved source pins", async () => {
  const f = await fixture();expect((await install(f)).statusCode).toBe(200);
  const headers = { cookie: f.cookie };
  const setup = await app.inject({ method: "POST", url: `/api/workspaces/${f.workspaceId}/studio/chapter-creation`, headers, payload: {} });
  const created = await app.inject({ method: "POST", url: `/api/workspaces/${f.workspaceId}/novels`, headers, payload: { title: "Creation pins", slug: "creation-pins" } });
  expect(created.statusCode).toBe(201);const novelId = created.json().id;
  const chapterResponse = await app.inject({ method: "POST", url: `/api/workspaces/${f.workspaceId}/novels/${novelId}/chapters`, headers, payload: { title: "Pending" } });
  expect(chapterResponse.statusCode).toBe(201);const chapter = chapterResponse.json();
  const route = `/api/workspaces/${f.workspaceId}/workflows/${setup.json().workflowId}/run`;
  const run = (input: Record<string, unknown>) => app.inject({ method: "POST", url: route, headers, payload: { novelId, input } });
  expect((await run({ chapterId: chapter.id, chapterNumber: chapter.number, outlineRef: crypto.randomUUID() })).statusCode).toBe(409);
  const outline = await db.outlineVersion.create({ data: { novelId, number: 1, status: "APPROVED", content: [], createdById: f.userId } });
  const input = { chapterId: chapter.id, chapterNumber: chapter.number, outlineRef: outline.id };
  expect((await run({ ...input, chapterId: crypto.randomUUID() })).statusCode).toBe(409);
  expect((await run({ ...input, chapterNumber: 2 })).statusCode).toBe(409);
  await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "SUPERSEDED" } });
  expect((await run(input)).statusCode).toBe(409);
  expect(await db.workflowRun.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "APPROVED" } });
  const queued = await run({ ...input, chapterCreationPins: { headRevisionId: "forged" } });
  expect(queued.statusCode).toBe(202);
  const stored = await db.workflowRun.findUniqueOrThrow({ where: { id: queued.json().id } });
  expect(stored.input).toMatchObject({ ...input, chapterCreationPins: { ...input, chapterVersionId: null, workflowVersionNumber: 1 } });
  expect((stored.input as { chapterCreationPins: { headRevisionId: string } }).chapterCreationPins.headRevisionId).not.toBe("forged");
  await db.outlineVersion.update({ where: { id: outline.id }, data: { status: "SUPERSEDED" } });
  let modelCalls = 0, compilerCalls = 0;
  const executor = createWorkflowExecutor({ db, audit: { record: async () => {} }, resolvers: createDbDefinitionResolvers(db),
    retrieval: {} as never, compiler: { compile: async () => { compilerCalls++;throw Error("Must not compile stale creation"); } },
    generate: { generate: async () => { modelCalls++;throw Error("Must not dispatch stale creation"); } } });
  expect((await executor.executeRun(stored.id)).status).toBe("FAILED");
  expect(modelCalls).toBe(0);expect(compilerCalls).toBe(0);
});

it("installs published workspace versions, reuses exact content, and never runs or writes stories", async () => {
  const f = await fixture();
  const before = [await db.novel.count(), await db.chapter.count(), await db.workflowRun.count(), await db.generation.count()];
  const first = await install(f);expect(first.statusCode).toBe(200);
  const agents = await db.agent.findMany({ where: { workspaceId: f.workspaceId }, include: { currentVersion: true, versions: true } });
  expect(agents).toHaveLength(5);
  const skills = await db.skill.findMany({ where: { workspaceId: f.workspaceId }, include: { currentVersion: true, versions: true } });
  expect(skills).toHaveLength(2);
  expect(skills.map(s => s.key).sort()).toEqual(["chapter-context-distillation", "chapter-continuity-check"]);
  for (const skill of skills) {
    expect(skill.scope).toBe("WORKSPACE");expect(skill.status).toBe("PUBLISHED");expect(skill.versions).toHaveLength(1);
    expect(skill.currentVersion?.number).toBe(1);expect(skill.currentVersion?.outputSchema).toBeTruthy();
  }
  for (const agent of agents) {
    const spec = CHAPTER_GENERATION_REVIEW.agents.find(a => a.key === agent.key)!;
    expect(agent.scope).toBe("WORKSPACE");expect(agent.status).toBe("PUBLISHED");
    expect(agent.versions).toHaveLength(1);expect(agent.currentVersion?.instructions).toBe(spec.instructions);
  }
  const workflow = await db.workflow.findFirstOrThrow({ where: { workspaceId: f.workspaceId }, include: { currentVersion: true, versions: true } });
  expect(workflow.status).toBe("PUBLISHED");expect(workflow.novelId).toBeNull();
  expect(workflow.currentVersion?.graph).toEqual(CHAPTER_GENERATION_REVIEW.graph);expect(workflow.versions).toHaveLength(1);
  expect((await install(f)).json()).toEqual({ ...first.json(), created: false });
  expect(await db.agentVersion.count({ where: { agent: { workspaceId: f.workspaceId } } })).toBe(5);
  expect(await db.skillVersion.count({ where: { skill: { workspaceId: f.workspaceId } } })).toBe(2);
  expect(await db.auditLog.count({ where: { workspaceId: f.workspaceId, action: "studio.starter_pack.installed" } })).toBe(1);
  expect([await db.novel.count(), await db.chapter.count(), await db.workflowRun.count(), await db.generation.count()]).toEqual(before);
});

it("concurrent installs return one identity and one set of versions", async () => {
  const f = await fixture("ADMIN");
  const results = await Promise.all([install(f), install(f), install(f)]);
  expect(results.map(r => r.statusCode)).toEqual([200, 200, 200]);
  expect(new Set(results.map(r => r.json().workflowId)).size).toBe(1);
  expect(await db.skillVersion.count({ where: { skill: { workspaceId: f.workspaceId } } })).toBe(2);
  expect(await db.agent.count({ where: { workspaceId: f.workspaceId } })).toBe(5);
  expect(await db.workflowVersion.count({ where: { workflow: { workspaceId: f.workspaceId } } })).toBe(1);
});

it("refuses a customized key atomically without publishing, overwriting or partial installation", async () => {
  const f = await fixture();
  const custom = await app.inject({ method: "POST", url: "/api/agents", headers: { cookie: f.cookie }, payload: { scope: "WORKSPACE", workspaceId: f.workspaceId, key: CHAPTER_GENERATION_REVIEW.agents[4]!.key, name: "My custom role", instructions: "Keep this custom role", modelProfile: "CREATIVE_WRITER" } });
  expect(custom.statusCode).toBe(201);
  const before = await db.agent.findMany({ where: { workspaceId: f.workspaceId }, include: { versions: true } });
  const result = await install(f);expect(result.statusCode).toBe(409);
  expect(result.body).toContain(CHAPTER_GENERATION_REVIEW.agents[4]!.key);
  expect(await db.agent.findMany({ where: { workspaceId: f.workspaceId }, include: { versions: true } })).toEqual(before);
  expect(await db.workflow.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  expect(await db.auditLog.count({ where: { workspaceId: f.workspaceId, action: "studio.starter_pack.installed" } })).toBe(0);
});

it("rejects unauthorized roles, foreign workspaces, missing sessions and malformed workspace IDs", async () => {
  const author = await fixture("AUTHOR"), owner = await fixture();
  expect((await install(author)).statusCode).toBe(403);
  expect((await install({ ...author, workspaceId: owner.workspaceId })).statusCode).toBe(404);
  expect((await install({ ...owner, cookie: "" })).statusCode).toBe(401);
  expect((await install({ ...owner, workspaceId: "bad" })).statusCode).toBe(400);
  expect(await db.agent.count({ where: { workspaceId: { in: [author.workspaceId, owner.workspaceId] } } })).toBe(0);
});

it("does not change previously installed versions after author edits", async () => {
  const f = await fixture();expect((await install(f)).statusCode).toBe(200);
  const agent = await db.agent.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
  const old = await db.agentVersion.findMany({ where: { agentId: agent.id } });
  const edit = await app.inject({ method: "POST", url: `/api/agents/${agent.id}/versions`, headers: { cookie: f.cookie }, payload: { instructions: "Author changed instructions", modelProfile: "CREATIVE_WRITER" } });
  expect(edit.statusCode).toBe(200);
  expect((await install(f)).statusCode).toBe(409);
  expect(await db.agentVersion.findMany({ where: { agentId: agent.id, number: 1 } })).toEqual(old);
  expect(await db.agentVersion.count({ where: { agentId: agent.id } })).toBe(2);
});

it("rolls back every definition if the transactional audit write fails", async () => {
  const f = await fixture();
  await db.$executeRawUnsafe(`CREATE FUNCTION refuse_starter_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'studio.starter_pack.installed' THEN RAISE EXCEPTION 'fixture audit refusal'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER refuse_starter_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION refuse_starter_audit()`);
  try {
    expect((await install(f)).statusCode).toBe(500);
    expect(await db.agent.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.agentVersion.count({ where: { agent: { workspaceId: f.workspaceId } } })).toBe(0);
    expect(await db.workflow.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.skill.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER refuse_starter_audit ON audit_logs");
    await db.$executeRawUnsafe("DROP FUNCTION refuse_starter_audit()");
  }
  expect((await install(f)).statusCode).toBe(200);
});

it("preserves a colliding custom workflow and unrelated platform definitions", async () => {
  const f = await fixture();
  const platform = await db.agent.create({ data: { scope: "PLATFORM", key: "chapter-planner", name: "Existing platform role", createdById: f.userId } });
  const custom = await app.inject({ method: "POST", url: "/api/workflows", headers: { cookie: f.cookie }, payload: { workspaceId: f.workspaceId, key: CHAPTER_GENERATION_REVIEW.key, name: "My workflow", graph: { steps: [{ key: "approve", kind: "HUMAN_APPROVAL" }], edges: [], maxSteps: 1 } } });
  expect(custom.statusCode).toBe(201);
  const result = await install(f);expect(result.statusCode).toBe(409);expect(result.json()).toEqual({ error: "STARTER_PACK_KEY_CONFLICT", definitionKey: "workflow/chapter-generation-review" });
  expect(await db.agent.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  expect(await db.agent.findUnique({ where: { id: platform.id } })).toEqual(platform);
  expect(await db.workflow.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  expect(await db.skill.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
});

it("adds only missing skills to a legacy pack and resolves executable immutable skill versions", async () => {
  const f = await fixture();
  for (const spec of CHAPTER_GENERATION_REVIEW.agents) {
    const response = await app.inject({ method: "POST", url: "/api/agents", headers: { cookie: f.cookie }, payload: { ...spec, workspaceId: f.workspaceId } });
    expect(response.statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/agents/${response.json().id}/publish`, headers: { cookie: f.cookie } })).statusCode).toBe(200);
  }
  const workflow = await app.inject({ method: "POST", url: "/api/workflows", headers: { cookie: f.cookie }, payload: { workspaceId: f.workspaceId, key: CHAPTER_GENERATION_REVIEW.key, name: CHAPTER_GENERATION_REVIEW.name, description: CHAPTER_GENERATION_REVIEW.description, graph: CHAPTER_GENERATION_REVIEW.graph } });
  expect(workflow.statusCode).toBe(201);
  expect((await app.inject({ method: "POST", url: `/api/workflows/${workflow.json().id}/publish`, headers: { cookie: f.cookie } })).statusCode).toBe(200);
  const before = { agents: await db.agentVersion.findMany({ where: { agent: { workspaceId: f.workspaceId } }, orderBy: { id: "asc" } }), workflow: await db.workflowVersion.findMany({ where: { workflowId: workflow.json().id } }) };
  const result = await install(f);expect(result.statusCode).toBe(200);expect(result.json()).toEqual({ workflowId: workflow.json().id, created: true });
  expect(await db.agentVersion.findMany({ where: { agent: { workspaceId: f.workspaceId } }, orderBy: { id: "asc" } })).toEqual(before.agents);
  expect(await db.workflowVersion.findMany({ where: { workflowId: workflow.json().id } })).toEqual(before.workflow);
  const resolvers = createDbDefinitionResolvers(db);
  for (const spec of WORKSPACE_STARTER_SKILLS) {
    const skill = await resolvers.resolveSkill(f.workspaceId, spec.key);
    expect(skill.instructions).toBe(spec.instructions);expect(skill.modelProfile).toBe(spec.modelProfile);expect(skill.outputSchema).toEqual(spec.outputSchema);
  }
  expect((await install(f)).json()).toEqual({ workflowId: workflow.json().id, created: false });
});

it("preserves a custom skill key and rolls back all missing pack definitions", async () => {
  const f = await fixture(), spec = WORKSPACE_STARTER_SKILLS[1];
  const custom = await app.inject({ method: "POST", url: "/api/skills", headers: { cookie: f.cookie }, payload: { workspaceId: f.workspaceId, key: spec.key, name: "My continuity skill", instructions: "Preserve author instructions", modelProfile: "CONTINUITY_REVIEWER", category: "VALIDATION" } });
  expect(custom.statusCode).toBe(201);
  const before = await db.skill.findMany({ where: { workspaceId: f.workspaceId }, include: { versions: true } });
  const result = await install(f);expect(result.statusCode).toBe(409);expect(result.json()).toEqual({ error: "STARTER_PACK_KEY_CONFLICT", definitionKey: `skill/${spec.key}` });
  expect(await db.skill.findMany({ where: { workspaceId: f.workspaceId }, include: { versions: true } })).toEqual(before);
  expect(await db.agent.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  expect(await db.workflow.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  expect(await db.auditLog.count({ where: { workspaceId: f.workspaceId, action: "studio.starter_pack.installed" } })).toBe(0);
});
