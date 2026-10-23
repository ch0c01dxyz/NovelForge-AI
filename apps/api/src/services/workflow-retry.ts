import type { NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError, createAuditService, createChapterSourceReader } from "@novelforge/ai-services";
import { requireCapability } from "@novelforge/auth/authorization";
import { compileSchema, extractJson, isBlockedChapterDraft, validateGraph, validateWorkflowModelPreferences } from "@novelforge/validation";
import { resolveAgent, resolveSkill } from "./definition-resolution.ts";
import { canonicalizeJson } from "@novelforge/workflow-executor";

export interface WorkflowRetry { stepKey: string; reason: "TRANSIENT" | "RATE_LIMIT" | "INVALID_AI_OUTPUT" }
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function inspectWorkflowRetry(db: NovelForgeDb, workspaceId: string, runId: string, actorUserId: string) {
  const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorUserId } } });
  if (!membership) throw new NotFoundError("run");
  requireCapability(membership.role, "workflow:run");
  const run = await db.workflowRun.findFirst({ where: { id: runId, workspaceId }, include: { workflow: true, workflowVersion: true, definitionPins: true, steps: { orderBy: { sequence: "asc" }, include: { generation: true } }, decisions: true } });
  if (!run) throw new NotFoundError("run");
  const refuse = () : never => { throw new ConflictError("WORKFLOW_RETRY_UNAVAILABLE"); };
  if (run.status !== "FAILED" || !run.definitionsPinnedAt || !run.modelDefaultsPinnedAt || run.decisions.length) refuse();
  if (run.workflow.workspaceId && run.workflow.workspaceId !== workspaceId || run.workflow.status !== "PUBLISHED") refuse();
  const validated = validateGraph(run.workflowVersion.graph);
  if (!validated.ok) return refuse();
  const graph = validated.value.graph;
  if (!validateWorkflowModelPreferences(run.requestedModelPreferences ?? {}, graph).ok) refuse();
  if (run.steps.length !== validated.value.order.length || run.steps.some((s, i) => s.stepKey !== validated.value.order[i])) refuse();
  const failedIndex = run.steps.findIndex(s => s.status === "FAILED");
  if (failedIndex < 0 || run.steps.slice(failedIndex + 1).some(s => s.status !== "PENDING")) refuse();
  const prefix = run.steps.slice(0, failedIndex);
  if (prefix.some(s => !["SUCCEEDED", "SKIPPED"].includes(s.status) || s.kind === "HUMAN_APPROVAL" || s.approvalSnapshot != null)) refuse();
  if (prefix.some(s => isBlockedChapterDraft(object(s.output).json))) refuse();
  const step = run.steps[failedIndex]!;
  const definition = graph.steps.find(s => s.key === step.stepKey)!;
  if (!["AGENT", "SKILL"].includes(step.kind) || definition.kind !== step.kind || !definition.ref) refuse();
  const agents = new Map<string, Awaited<ReturnType<typeof resolveAgent>>>();
  const skills = new Map<string, Awaited<ReturnType<typeof resolveSkill>>>();
  for (const key of run.workflowVersion.agentKeys) {
    const pin = run.definitionPins.find(p => p.kind === "AGENT" && p.key === key);
    if (!pin?.agentVersionId) return refuse();
    agents.set(key, await resolveAgent(db, workspaceId, key, pin.agentVersionId));
  }
  const skillKeys = new Set([...run.workflowVersion.skillKeys, ...[...agents.values()].flatMap(a => a.skillKeys)]);
  for (const key of skillKeys) {
    const pin = run.definitionPins.find(p => p.kind === "SKILL" && p.key === key);
    if (!pin?.skillVersionId) return refuse();
    skills.set(key, await resolveSkill(db, workspaceId, key, pin.skillVersionId));
  }
  if (run.definitionPins.length !== agents.size + skills.size) refuse();
  if (run.novelModelDefaultsVersionId && !await db.novelModelDefaultsVersion.findFirst({ where: { id: run.novelModelDefaultsVersionId, novelId: run.novelId! } })) refuse();
  const resolved = step.kind === "AGENT" ? agents.get(definition.ref!) : skills.get(definition.ref!);
  if (!resolved || (step.kind === "AGENT" ? step.agentVersionId : step.skillVersionId) !== resolved.versionId) refuse();
  let reason: WorkflowRetry["reason"];
  const generation = step.generation;
  if (!generation || generation.workspaceId !== workspaceId || generation.novelId !== run.novelId) return refuse();
  if (generation.status === "FAILED" && (generation.errorCategory === "TRANSIENT" || generation.errorCategory === "RATE_LIMIT")) reason = generation.errorCategory;
  else if (generation.status === "SUCCEEDED") {
    const schema = resolved!.outputSchema ?? definition.outputSchema;
    if (!schema) return refuse();
    const contract = compileSchema(schema);
    if (!contract.ok) return refuse();
    const content = object(step.output).text;
    if (typeof content !== "string") return refuse();
    const parsed = extractJson(content);
    if (parsed.ok && isBlockedChapterDraft(parsed.value)) return refuse();
    if (parsed.ok && contract.value.validate(parsed.value).length === 0) return refuse();
    reason = "INVALID_AI_OUTPUT";
  } else return refuse();
  if (["chapter-creation-review", "chapter-generation-review"].includes(run.workflow.key)) {
    const input = object(run.input);
    const source = prefix.map(s => object(object(s.output).json)).find(s => s.contextProtocol === "chapter-author-context-v1");
    const saved = object(source?.chapterSource);
    const pins = object(input.chapterCreationPins);
    if (!run.novelId || typeof input.chapterId !== "string" || !Number.isSafeInteger(input.chapterNumber) || typeof input.outlineRef !== "string" || !source || !saved.chapterId) return refuse();
    await db.$queryRaw`SELECT id FROM novels WHERE id = ${run.novelId}::uuid FOR SHARE`;
    await db.$queryRaw`SELECT id FROM chapters WHERE id = ${input.chapterId}::uuid FOR SHARE`;
    await db.$queryRaw`SELECT id FROM outline_versions WHERE id = ${input.outlineRef}::uuid FOR SHARE`;
    const chapter = await db.chapter.findFirst({ where: { id: input.chapterId, novelId: run.novelId, number: Number(input.chapterNumber) } });
    const expectedVersion = run.workflow.key === "chapter-creation-review" ? pins.chapterVersionId : saved.chapterVersionId;
    if (expectedVersion === undefined || !chapter || chapter.currentVersionId !== expectedVersion || (run.workflow.key === "chapter-creation-review" && (chapter.status !== "DRAFT" || pins.chapterId !== chapter.id || pins.chapterNumber !== chapter.number || pins.outlineRef !== input.outlineRef))) return refuse();
    const outline = await db.outlineVersion.findFirst({ where: { id: input.outlineRef, novelId: run.novelId, status: "APPROVED" } });
    if (!outline) return refuse();
    // Reuse the source reader inside the caller's transaction and its row locks.
    const readerDb = { $transaction: (fn: (tx: NovelForgeDb) => unknown) => fn(db) } as unknown as NovelForgeDb;
    const current = await createChapterSourceReader(readerDb).load({ actorUserId, workspaceId, novelId: run.novelId, chapterId: chapter.id, chapterNumber: chapter.number, authorInstructions: typeof input.styleNotes === "string" ? input.styleNotes.trim() : "" });
    // Creation runs already pinned the target version before the source reader exposed it.
    const comparable = { ...current };
    if (!("chapterVersionId" in saved)) {
      delete comparable.chapterVersionId;
      comparable.text = comparable.text.replace(`,"chapterVersionId":${JSON.stringify(current.chapterVersionId)}`, "");
    }
    if (canonicalizeJson(comparable) !== canonicalizeJson(saved) || source.headRevisionId !== current.headRevisionId || (run.workflow.key === "chapter-creation-review" && pins.headRevisionId !== current.headRevisionId)) refuse();
  } else if (run.novelId || graph.steps.some(s => s.kind === "HUMAN_APPROVAL" && prefix.some(p => p.stepKey === s.key))) return refuse();
  return { run, retry: { stepKey: step.stepKey, reason }, prefix };
}

export async function createWorkflowRetry(db: NovelForgeDb, input: { workspaceId: string; actorUserId: string; runId: string }) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM workflow_runs WHERE id = ${input.runId}::uuid FOR UPDATE`;
    const scoped = tx as unknown as NovelForgeDb;
    const membership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId } } });
    if (!membership) throw new NotFoundError("run");
    requireCapability(membership.role, "workflow:run");
    const parent = await tx.workflowRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId } });
    if (!parent) throw new NotFoundError("run");
    const key = `retry:${parent.id}`;
    const existing = await tx.workflowRun.findFirst({ where: { workspaceId: input.workspaceId, idempotencyKey: key } });
    if (existing) {
      const receipt = await tx.auditLog.findFirst({ where: { action: "workflow.run_retried", entityId: existing.id, workspaceId: input.workspaceId, payload: { path: ["sourceRunId"], equals: parent.id } } });
      if (!receipt || existing.workflowVersionId !== parent.workflowVersionId || existing.novelId !== parent.novelId) throw new ConflictError("WORKFLOW_RETRY_UNAVAILABLE");
      return { id: existing.id, deduped: true };
    }
    const { run, retry, prefix } = await inspectWorkflowRetry(scoped, input.workspaceId, input.runId, input.actorUserId);
    const child = await tx.workflowRun.create({ data: { workflowId: run.workflowId, workflowVersionId: run.workflowVersionId, workflowVersionNumber: run.workflowVersionNumber, workspaceId: input.workspaceId, novelId: run.novelId, triggeredById: input.actorUserId, input: run.input as never, requestedModelPreferences: run.requestedModelPreferences as never, definitionsPinnedAt: run.definitionsPinnedAt, modelDefaultsPinnedAt: run.modelDefaultsPinnedAt, novelModelDefaultsVersionId: run.novelModelDefaultsVersionId, idempotencyKey: key } });
    await tx.workflowRunDefinitionPin.createMany({ data: run.definitionPins.map(p => ({ runId: child.id, kind: p.kind, key: p.key, agentVersionId: p.agentVersionId, skillVersionId: p.skillVersionId })) });
    const reused = new Set(prefix.map(s => s.stepKey));
    await tx.workflowStepRun.createMany({ data: run.steps.map(s => ({ runId: child.id, stepKey: s.stepKey, sequence: s.sequence, kind: s.kind, status: reused.has(s.stepKey) ? s.status : "PENDING", agentId: s.agentId, agentVersionId: s.agentVersionId, agentVersionNumber: s.agentVersionNumber, skillId: s.skillId, skillVersionId: s.skillVersionId, skillVersionNumber: s.skillVersionNumber, ...(reused.has(s.stepKey) ? { output: s.output as never, instruction: s.instruction, generationId: s.generationId, latencyMs: s.latencyMs, startedAt: s.startedAt, completedAt: s.completedAt } : {}) })) });
    await createAuditService(scoped).record({ actorUserId: input.actorUserId, workspaceId: input.workspaceId, action: "workflow.run_retried", entityType: "WorkflowRun", entityId: child.id, payload: { sourceRunId: run.id, retryRunId: child.id, ...retry, reusedStepKeys: [...reused] } });
    return { id: child.id, deduped: false };
  }, { timeout: 20_000 });
}
