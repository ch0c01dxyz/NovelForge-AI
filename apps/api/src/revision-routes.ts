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
});
const previewRestoreBody = z.object({
  checkpointId: uuid,
  /**
   * Only FULL is accepted in M1; DOMAIN/ENTITY/SELECTIVE are refused by name
   * with a 409 rather than rejected as malformed input (C7).
   */
  scope: z.enum(["FULL", "DOMAIN", "ENTITY", "SELECTIVE"]).default("FULL"),
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
    const revisions = await services.listRevisions({
      actorUserId,
      ...params.data,
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
      const checkpoints = await services.listCheckpoints({
        actorUserId,
        ...params.data,
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
      const result = await services.applyRestore({
        actorUserId,
        ...params.data,
      });
      return reply.send(result);
    },
  );
}
