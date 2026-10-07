/**
 * Agent / skill / workflow routes (Phase 4).
 *
 * Two authorization axes, as in Phase 3:
 * - WORKSPACE-scoped definitions are gated by workspace membership and the
 *   matching `*:manage` / `*:read` / `workflow:run` capability;
 * - PLATFORM-scoped definitions need the `platform:define` platform
 *   capability, read from the user row — never from a token claim.
 *
 * The service layer holds the authorization logic; these handlers only
 * validate shape and translate results. A definition id in a URL never
 * decides the scope — the stored row does.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { WorkflowRunStatus } from "@novelforge/database";
import type { PlatformRole } from "@novelforge/auth/authorization";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { DefinitionServices } from "./services/definitions.ts";
import type { WorkflowRunServices } from "./services/workflow-runs.ts";
import { InvalidDefinitionError } from "./services/definitions.ts";

const uuid = z.string().uuid();

const PROFILE_VALUES = [
  "CREATIVE_WRITER",
  "DEEP_PLANNER",
  "CONTINUITY_REVIEWER",
  "FAST_CLASSIFIER",
  "STRUCTURED_EXTRACTOR",
  "LONG_CONTEXT_REVIEWER",
  "EMBEDDING",
] as const;

const keyField = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "key must be lowercase letters, digits and dashes");

/**
 * A structured-output contract. Bounded so an admin cannot store a schema
 * large enough to be a denial-of-service on every run that compiles it;
 * the contract's real validation is `@novelforge/validation`, which fails
 * closed on anything it cannot enforce.
 *
 * Booleans are accepted because `compileSchema` accepts them and the graph
 * path passes them through — `z.record` alone rejected `true`/`false` here
 * while a graph-embedded contract of the same spelling was accepted, so one
 * spelling of "no constraint" worked in one place and was refused with no
 * explanation in another.
 */
const outputSchemaField = z
  .union([z.record(z.string(), z.unknown()), z.boolean()])
  .optional();

const scopeField = z.enum(["PLATFORM", "WORKSPACE"]);

const agentContent = z.object({
  instructions: z.string().trim().min(1).max(20_000),
  modelProfile: z.enum(PROFILE_VALUES),
  skillKeys: z.array(keyField).max(50).optional(),
  outputSchema: outputSchemaField,
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
});

const skillContent = z.object({
  instructions: z.string().trim().min(1).max(20_000),
  modelProfile: z.enum(PROFILE_VALUES),
  outputSchema: outputSchemaField,
});

const createAgentBody = agentContent.extend({
  scope: scopeField.default("WORKSPACE"),
  workspaceId: uuid.optional(),
  key: keyField,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

const createSkillBody = skillContent.extend({
  scope: scopeField.default("WORKSPACE"),
  workspaceId: uuid.optional(),
  key: keyField,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["RETRIEVAL", "ANALYSIS", "TRANSFORM", "VALIDATION"]).optional(),
});

/**
 * The graph is validated by `@novelforge/validation`, not inferred from
 * this shape: `z.unknown()` here keeps the route from rejecting a graph
 * the validator accepts, and from accepting one it rejects. Bounded in
 * size only.
 */
const createWorkflowBody = z.object({
  scope: scopeField.default("WORKSPACE"),
  workspaceId: uuid.optional(),
  novelId: uuid.optional(),
  key: keyField,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  graph: z.unknown(),
});

const addWorkflowVersionBody = z.object({ graph: z.unknown() });

const runWorkflowBody = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  novelId: uuid.optional(),
  // Client-generated idempotency key (opaque, e.g. UUID v4). A repeat POST
  // with the same key returns the existing run (200), never a second row.
  // Null/omitted keeps the legacy per-POST-row behavior.
  idempotencyKey: z.string().max(64).optional(),
});

const listRunsQuery = z.object({
  workflowId: uuid.optional(),
  novelId: uuid.optional(),
  chapterNumber: z.coerce.number().int().positive().optional(),
  // NF-WF-018A (Invariant 1(d)): the approvals inbox needs to list parked
  // runs reliably, so the run list accepts an optional run-status filter,
  // following the existing optional-`workflowId` pattern. The
  // `workflow:read` gate is unchanged.
  status: z.nativeEnum(WorkflowRunStatus).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).refine((query) => query.chapterNumber === undefined || query.novelId !== undefined);

// Definition instructions may be long; the graph carries instructions and
// schemas too. Fastify's 1 MB default would reject payloads the schemas
// above allow, so the limit is raised to match (same footgun the manuscript
// and generation routes document).
const DEFINITION_BODY_LIMIT = 2_000_000;

// Param schemas are written out per route: a shared helper keyed by a
// computed property name degrades to `string | undefined` under
// noUncheckedIndexedAccess, losing the literal types zod infers.
const workspaceParams = z.object({ workspaceId: uuid });
const agentParams = z.object({ agentId: uuid });
const skillParams = z.object({ skillId: uuid });
const workflowParams = z.object({ workflowId: uuid });

export interface DefinitionRoutesOptions {
  auth: AuthService;
  definitions: DefinitionServices;
  runs: WorkflowRunServices;
  platformRoleOf: (userId: string) => Promise<PlatformRole>;
}

export function registerDefinitionRoutes(
  app: FastifyInstance,
  { auth, definitions, runs, platformRoleOf }: DefinitionRoutesOptions,
): void {
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ userId: string; platformRole: PlatformRole } | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return {
      userId: session.userId,
      platformRole: await platformRoleOf(session.userId),
    };
  };

  /**
   * A definition write resolved the scope from the stored row, so an
   * invalid contract or graph surfaces as 400 rather than 500.
   */
  const handleInvalid = (
    err: unknown,
    reply: FastifyReply,
  ): FastifyReply => {
    if (err instanceof InvalidDefinitionError) {
      return reply.code(400).send({ error: "INVALID_DEFINITION", failures: err.failures });
    }
    throw err;
  };

  // ==================== Agents ====================

  app.post("/api/agents", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = createAgentBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const created = await definitions.createAgent({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        scope: body.data.scope,
        ...(body.data.workspaceId ? { workspaceId: body.data.workspaceId } : {}),
        key: body.data.key,
        name: body.data.name,
        ...(body.data.description ? { description: body.data.description } : {}),
        content: {
          instructions: body.data.instructions,
          modelProfile: body.data.modelProfile,
          ...(body.data.skillKeys ? { skillKeys: body.data.skillKeys } : {}),
          ...(body.data.outputSchema ? { outputSchema: body.data.outputSchema } : {}),
          ...(body.data.temperature !== undefined ? { temperature: body.data.temperature } : {}),
          ...(body.data.maxTokens !== undefined ? { maxTokens: body.data.maxTokens } : {}),
        },
      });
      return reply.code(201).send(created);
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.get("/api/workspaces/:workspaceId/agents", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listAgents({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
    });
  });

  app.get("/api/agents/:agentId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = agentParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.getAgent({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      agentId: params.data.agentId,
    });
  });

  app.post("/api/agents/:agentId/versions", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = agentParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = agentContent.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      return await definitions.addAgentVersion({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        agentId: params.data.agentId,
        content: {
          instructions: body.data.instructions,
          modelProfile: body.data.modelProfile,
          ...(body.data.skillKeys ? { skillKeys: body.data.skillKeys } : {}),
          ...(body.data.outputSchema ? { outputSchema: body.data.outputSchema } : {}),
          ...(body.data.temperature !== undefined ? { temperature: body.data.temperature } : {}),
          ...(body.data.maxTokens !== undefined ? { maxTokens: body.data.maxTokens } : {}),
        },
      });
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.post("/api/agents/:agentId/publish", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = agentParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await definitions.publishAgent({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      agentId: params.data.agentId,
    });
    return { status: "ok" };
  });

  // NF-WF-018A (GAP-064): the agent's immutable version history, ascending.
  // Read-only; gated agent:read like the detail route.
  app.get("/api/agents/:agentId/versions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = agentParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listAgentVersions({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      agentId: params.data.agentId,
    });
  });

  // ==================== Skills ====================

  app.post("/api/skills", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = createSkillBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const created = await definitions.createSkill({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        scope: body.data.scope,
        ...(body.data.workspaceId ? { workspaceId: body.data.workspaceId } : {}),
        key: body.data.key,
        name: body.data.name,
        ...(body.data.description ? { description: body.data.description } : {}),
        ...(body.data.category ? { category: body.data.category } : {}),
        content: {
          instructions: body.data.instructions,
          modelProfile: body.data.modelProfile,
          ...(body.data.outputSchema ? { outputSchema: body.data.outputSchema } : {}),
        },
      });
      return reply.code(201).send(created);
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.get("/api/workspaces/:workspaceId/skills", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listSkills({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
    });
  });

  app.get("/api/skills/:skillId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = skillParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.getSkill({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      skillId: params.data.skillId,
    });
  });

  app.post("/api/skills/:skillId/versions", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = skillParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = skillContent.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      return await definitions.addSkillVersion({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        skillId: params.data.skillId,
        content: {
          instructions: body.data.instructions,
          modelProfile: body.data.modelProfile,
          ...(body.data.outputSchema ? { outputSchema: body.data.outputSchema } : {}),
        },
      });
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.post("/api/skills/:skillId/publish", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = skillParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await definitions.publishSkill({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      skillId: params.data.skillId,
    });
    return { status: "ok" };
  });

  // NF-WF-018A (GAP-064): the skill's immutable version history, ascending.
  // Read-only; gated skill:read like the detail route.
  app.get("/api/skills/:skillId/versions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = skillParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listSkillVersions({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      skillId: params.data.skillId,
    });
  });

  // ==================== Workflows ====================

  app.post("/api/workflows", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = createWorkflowBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const created = await definitions.createWorkflow({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        scope: body.data.scope,
        ...(body.data.workspaceId ? { workspaceId: body.data.workspaceId } : {}),
        ...(body.data.novelId ? { novelId: body.data.novelId } : {}),
        key: body.data.key,
        name: body.data.name,
        ...(body.data.description ? { description: body.data.description } : {}),
        graph: body.data.graph,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.get("/api/workspaces/:workspaceId/workflows", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listWorkflows({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
    });
  });

  app.get("/api/workflows/:workflowId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workflowParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.getWorkflow({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      workflowId: params.data.workflowId,
    });
  });

  app.post("/api/workflows/:workflowId/versions", { bodyLimit: DEFINITION_BODY_LIMIT }, async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workflowParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = addWorkflowVersionBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      return await definitions.addWorkflowVersion({
        actorUserId: actor.userId,
        actorPlatformRole: actor.platformRole,
        workflowId: params.data.workflowId,
        graph: body.data.graph,
      });
    } catch (err) {
      return handleInvalid(err, reply);
    }
  });

  app.post("/api/workflows/:workflowId/publish", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workflowParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await definitions.publishWorkflow({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      workflowId: params.data.workflowId,
    });
    return { status: "ok" };
  });

  // NF-WF-018A (GAP-064): the workflow's immutable version history,
  // ascending. Read-only; gated workflow:read like the detail route.
  app.get("/api/workflows/:workflowId/versions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workflowParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return definitions.listWorkflowVersions({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      workflowId: params.data.workflowId,
    });
  });

  // Run history is the execution audit trail: a workflow with runs is
  // refused (409), never deleted with them (20261002 migration, RESTRICT).
  app.delete("/api/workflows/:workflowId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workflowParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await definitions.deleteWorkflow({
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      workflowId: params.data.workflowId,
    });
    return { status: "ok" };
  });

  // ==================== Runs ====================
  //
  // Enqueue, don't execute (NF-WF-004 invariant 1): the run row is created
  // PENDING, one BullMQ job is queued, and the worker drives execution off
  // the request thread. 202 carries the run id and the single-run status
  // URL; it never claims execution. A repeat POST with the same
  // idempotency key returns the existing run with 200.

  app.post(
    "/api/workspaces/:workspaceId/workflows/:workflowId/run",
    { bodyLimit: DEFINITION_BODY_LIMIT },
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = z
        .object({ workspaceId: uuid, workflowId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = runWorkflowBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const { run, deduped, statusUrl } = await runs.enqueueRun({
        actorUserId: actor.userId,
        workspaceId: params.data.workspaceId,
        workflowId: params.data.workflowId,
        ...(body.data.input ? { runInput: body.data.input } : {}),
        ...(body.data.novelId ? { novelId: body.data.novelId } : {}),
        ...(body.data.idempotencyKey ? { idempotencyKey: body.data.idempotencyKey } : {}),
      });
      return reply.code(deduped ? 200 : 202).send({ ...run, statusUrl });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/workflow-runs/:runId/cancel",
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = z
        .object({ workspaceId: uuid, runId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await runs.cancelRun({
        actorUserId: actor.userId,
        workspaceId: params.data.workspaceId,
        runId: params.data.runId,
      });
      return run;
    },
  );

  // ==================== Approval decisions (NF-WF-005) ====================
  //
  // A run parked at a HUMAN_APPROVAL step (AWAITING_APPROVAL) is decided
  // here: approve resumes the same run from the parked step, reject fails
  // it. The decision binds to the park-time snapshot — the client echoes
  // the snapshotHash it read from GET .../workflow-runs/:runId, and a
  // decision minted against a different view of the material is refused
  // (409 STALE_APPROVAL). A rejection must say why (400 without a reason).
  const decideParams = z.object({ workspaceId: uuid, runId: uuid });
  const approveBody = z.object({
    expectedSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().max(2000).optional(),
  });
  const rejectBody = z.object({
    expectedSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().min(1).max(2000),
  });

  app.post(
    "/api/workspaces/:workspaceId/workflow-runs/:runId/approve",
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = decideParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = approveBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await runs.decideRun({
        actorUserId: actor.userId,
        workspaceId: params.data.workspaceId,
        runId: params.data.runId,
        decision: "approve",
        expectedSnapshotHash: body.data.expectedSnapshotHash,
        ...(body.data.reason ? { reason: body.data.reason } : {}),
      });
      return run;
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/workflow-runs/:runId/reject",
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = decideParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = rejectBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await runs.decideRun({
        actorUserId: actor.userId,
        workspaceId: params.data.workspaceId,
        runId: params.data.runId,
        decision: "reject",
        expectedSnapshotHash: body.data.expectedSnapshotHash,
        reason: body.data.reason,
      });
      return run;
    },
  );

  app.get("/api/workspaces/:workspaceId/workflow-runs", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = listRunsQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return runs.listRuns({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
      ...(query.data.workflowId ? { workflowId: query.data.workflowId } : {}),
      ...(query.data.novelId ? { novelId: query.data.novelId } : {}),
      ...(query.data.chapterNumber !== undefined ? { chapterNumber: query.data.chapterNumber } : {}),
      ...(query.data.status ? { status: query.data.status } : {}),
      ...(query.data.limit !== undefined ? { limit: query.data.limit } : {}),
    });
  });

  app.get("/api/workspaces/:workspaceId/workflow-runs/:runId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = z
      .object({ workspaceId: uuid, runId: uuid })
      .safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return runs.getRun({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
      runId: params.data.runId,
    });
  });
}
