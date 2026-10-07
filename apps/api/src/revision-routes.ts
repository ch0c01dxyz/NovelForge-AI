/**
 * Revision routes (M1, NF-WF-002): history, checkpoints, restore preview and
 * apply.
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in the error handler.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
// Error mapping lives in platform-routes' ONE setErrorHandler (shared
// app-wide); revision routes never register a second handler.
import type { RevisionServices } from "./services/revisions.ts";

const uuid = z.string().uuid();
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });
const checkpointParams = z.object({ workspaceId: uuid, novelId: uuid, checkpointId: uuid });
const restoreParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  restoreOperationId: uuid,
});

const createCheckpointBody = z.object({
  label: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).optional(),
  /**
   * The head the client believes is current, or `null` for "no head yet".
   * Optional: an omitted value asserts no expectation and the service reads
   * the head under the lock. See `AdvanceHeadInput.expectedHeadRevisionId`.
   */
  expectedHeadRevisionId: uuid.nullable().optional(),
  /**
   * NF-WF-020B: must be the checked-out branch when provided (F5 default =
   * checked-out). A checkpoint captures live state, which always reflects
   * the checked-out branch — naming another branch is 409
   * `NOT_ON_CHECKED_OUT_BRANCH`.
   */
  branchId: uuid.optional(),
});
const previewRestoreBody = z.object({
  checkpointId: uuid,
  /**
   * NF-WF-020B: must be the checked-out branch when provided (F5 default =
   * checked-out). The checkpoint's branch must match — a cross-branch
   * preview is 400.
   */
  branchId: uuid.optional(),
  /**
   * NF-WF-020A: DOMAIN/ENTITY/SELECTIVE are implemented (selection
   * resolution + dependency analysis). The selection object carries the
   * scope-specific input; omitted fields fall back per scope.
   */
  scope: z.enum(["FULL", "DOMAIN", "ENTITY", "SELECTIVE"]).default("FULL"),
  selection: z
    .object({
      /** DOMAIN scope: one of the 7 pinned domain names. */
      domain: z.string().optional(),
      /** ENTITY scope: the covered table of the named entity. */
      entityType: z.string().optional(),
      /** ENTITY scope: the entity's id. */
      entityId: uuid.optional(),
      /** SELECTIVE scope: covered tables to rewind (non-empty). */
      tables: z.array(z.string()).optional(),
      /** SELECTIVE scope: bare entity ids, resolved against the tables. */
      entityIds: z.array(uuid).optional(),
    })
    .optional(),
});
const applyRestoreBody = z
  .object({
    /**
     * NF-WF-020A: required to apply a DOMAIN/SELECTIVE restore whose
     * preview reported ORPHAN_REFERENCE conflicts. ENTITY never gates.
     */
    acknowledged: z.boolean().optional(),
  })
  .optional();

// ---------------------------------------------------------------------------
// NF-WF-020B: branch lifecycle routes.
// ---------------------------------------------------------------------------

const branchParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  branchId: uuid,
});

const createBranchBody = z.object({
  name: z.string().trim().min(1).max(100),
  /**
   * Fork source: a checkpoint id (its revision becomes the head), a revision
   * id (must have a snapshot), or omitted (the checked-out branch head).
   * Both set is 400.
   */
  fromCheckpointId: uuid.optional(),
  fromRevisionId: uuid.optional(),
});

const switchBranchBody = z.object({
  /**
   * When true, a dirty checked-out branch is auto-checkpointed (MANUAL)
   * before the switch instead of 409 DIRTY_SWITCH.
   */
  autoCheckpoint: z.boolean().optional(),
});

// NF-WF-020C: merge preview/apply bodies. `targetBranchId` defaults to the
// checked-out branch (020B tracking); omitted asserts no expectation on the
// target head, while `expectedHeadRevisionId: null` asserts "no head yet".
// NF-WF-024C: preview accepts optional `mode` ("conservative" default,
// "semantic" = deterministic S1/S2/S3 narrowing of CONFLICT → CLEAN).
const mergePreviewBody = z.object({
  targetBranchId: uuid.optional(),
  mode: z.enum(["conservative", "semantic"]).optional(),
});
const mergeApplyBody = z.object({
  targetBranchId: uuid.optional(),
  expectedHeadRevisionId: uuid.nullable().optional(),
  // NF-WF-028 (GAP-101): optional merge mode. Omitted → "conservative"
  // (020C behavior unchanged). "semantic" = S1/S2/S3 narrowing + resolved-row
  // builder under the branch lock.
  mode: z.enum(["conservative", "semantic"]).optional(),
});

export interface RevisionRoutesOptions {
  auth: AuthService;
  services: RevisionServices;
}

export function registerRevisionRoutes(
  app: FastifyInstance,
  { auth, services }: RevisionRoutesOptions,
): void {
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return session.userId;
  };

  // NOTE: no setErrorHandler here — platform-routes owns the single
  // app-wide handler mapping Forbidden/NotFound/ConflictError. A second
  // registration would silently replace it (Fastify last-wins).

  app.get("/api/workspaces/:workspaceId/novels/:novelId/revisions", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    // NF-WF-020B: optional branch filter (F5 default = checked-out branch).
    const query = z.object({ branchId: uuid.optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const revisions = await services.listRevisions({
      actorUserId,
      ...params.data,
      ...(query.data.branchId === undefined ? {} : { branchId: query.data.branchId }),
    });
    return reply.send({ revisions });
  });

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/checkpoints",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      // NF-WF-020B: optional branch filter (F5 default = checked-out branch).
      const query = z.object({ branchId: uuid.optional() }).safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const checkpoints = await services.listCheckpoints({
        actorUserId,
        ...params.data,
        ...(query.data.branchId === undefined ? {} : { branchId: query.data.branchId }),
      });
      return reply.send({ checkpoints });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/checkpoints",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createCheckpointBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const checkpoint = await services.createCheckpoint({
        actorUserId,
        ...params.data,
        label: body.data.label,
        ...(body.data.note === undefined ? {} : { note: body.data.note }),
        // Omitted means "assert no expectation" and must stay `undefined`:
        // `null` is a real assertion ("no head exists yet"), so collapsing
        // the two here would 409 every checkpoint taken against a baselined
        // novel.
        ...(body.data.expectedHeadRevisionId === undefined
          ? {}
          : { expectedHeadRevisionId: body.data.expectedHeadRevisionId }),
        // NF-WF-020B: F5 default = checked-out branch.
        ...(body.data.branchId === undefined ? {} : { branchId: body.data.branchId }),
      });
      return reply.code(201).send(checkpoint);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/restores/preview",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = previewRestoreBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.previewRestore({
        actorUserId,
        ...params.data,
        checkpointId: body.data.checkpointId,
        scope: body.data.scope,
        ...(body.data.selection === undefined
          ? {}
          : { selection: body.data.selection }),
        // NF-WF-020B: F5 default = checked-out branch.
        ...(body.data.branchId === undefined ? {} : { branchId: body.data.branchId }),
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/checkpoints/:checkpointId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = checkpointParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      // Reading one checkpoint is the same authorized read as the list; the
      // preview is what an author actually opens, so this route exists to
      // 404 an unknown id rather than to add a second projection of it.
      const checkpoints = await services.listCheckpoints({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        take: 1000,
      });
      const found = checkpoints.find((c) => c.id === params.data.checkpointId);
      if (!found) return reply.code(404).send({ error: "NOT_FOUND" });
      return reply.send(found);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/restores/:restoreOperationId/apply",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = restoreParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = applyRestoreBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.applyRestore({
        actorUserId,
        ...params.data,
        ...(body.data?.acknowledged === undefined
          ? {}
          : { acknowledged: body.data.acknowledged }),
      });
      return reply.send(result);
    },
  );

  // -------------------------------------------------------------------------
  // NF-WF-020B: branch lifecycle (temporal model, Invariant 5).
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/branches",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createBranchBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      if (body.data.fromCheckpointId && body.data.fromRevisionId) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      const branch = await services.createBranch({
        actorUserId,
        ...params.data,
        name: body.data.name,
        ...(body.data.fromCheckpointId === undefined
          ? {}
          : { fromCheckpointId: body.data.fromCheckpointId }),
        ...(body.data.fromRevisionId === undefined
          ? {}
          : { fromRevisionId: body.data.fromRevisionId }),
      });
      return reply.code(201).send(branch);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/branches",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const branches = await services.listBranches({
        actorUserId,
        ...params.data,
      });
      return reply.send({ branches });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/branches/:branchId/switch",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = branchParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = switchBranchBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.switchBranch({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        branchId: params.data.branchId,
        autoCheckpoint: body.data.autoCheckpoint ?? false,
      });
      return reply.send(result);
    },
  );

  // -------------------------------------------------------------------------
  // NF-WF-020C: conservative merge + bulk recovery.
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/branches/:branchId/merge/preview",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = branchParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = mergePreviewBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const preview = await services.previewMerge({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        sourceBranchId: params.data.branchId,
        ...(body.data.targetBranchId === undefined
          ? {}
          : { targetBranchId: body.data.targetBranchId }),
        ...(body.data.mode === undefined ? {} : { mode: body.data.mode }),
      });
      return reply.send({ preview });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/branches/:branchId/merge/apply",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = branchParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = mergeApplyBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.applyMerge({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        sourceBranchId: params.data.branchId,
        ...(body.data.targetBranchId === undefined
          ? {}
          : { targetBranchId: body.data.targetBranchId }),
        ...(body.data.expectedHeadRevisionId === undefined
          ? {}
          : { expectedHeadRevisionId: body.data.expectedHeadRevisionId }),
        ...(body.data.mode === undefined ? {} : { mode: body.data.mode }),
      });
      return reply.send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/checkpoints/:checkpointId/rollback",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = checkpointParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.rollbackCheckpoint({
        actorUserId,
        ...params.data,
      });
      return reply.send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/recoverable-checkpoints",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const checkpoints = await services.listRecoverableCheckpoints({
        actorUserId,
        ...params.data,
      });
      return reply.send({ checkpoints });
    },
  );
}
