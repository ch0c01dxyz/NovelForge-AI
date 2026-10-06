/**
 * Endgame callback + legacy routes (M7, NF-WF-022B).
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in the error handler (platform-routes owns the single
 * app-wide handler).
 *
 * 022B owns these routes; 022A owns GET .../endgame/debt-report (NOT built
 * here — 022A's debt report reads endgame_callbacks as a read-model).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { EndgameCallbackServices } from "./services/endgame-callbacks.ts";

const uuid = z.string().uuid();
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });

const createCallbackBody = z.object({
  setupEventId: uuid,
  payoffEventId: uuid.optional(),
  description: z.string().max(5000).optional(),
});

const listCallbacksQuery = z.object({
  status: z.enum(["PENDING", "PAID"]).optional(),
});

const recordLegacyBody = z.object({
  kind: z.enum(["CHARACTER", "WORLD", "THEMATIC"]),
  subjectId: uuid.optional(),
  description: z.string().min(1).max(10000),
});

const listLegaciesQuery = z.object({
  kind: z.enum(["CHARACTER", "WORLD", "THEMATIC"]).optional(),
});

export interface EndgameCallbackRoutesOptions {
  auth: AuthService;
  services: EndgameCallbackServices;
}

export function registerEndgameCallbackRoutes(
  app: FastifyInstance,
  { auth, services }: EndgameCallbackRoutesOptions,
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
  // app-wide handler mapping Forbidden/NotFound/EndgameError.

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/callbacks",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createCallbackBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const callback = await services.createCallback({
        actorUserId,
        ...params.data,
        setupEventId: body.data.setupEventId,
        ...(body.data.payoffEventId === undefined
          ? {}
          : { payoffEventId: body.data.payoffEventId }),
        ...(body.data.description === undefined
          ? {}
          : { description: body.data.description }),
      });
      return reply.code(201).send({ callback });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/callbacks",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = listCallbacksQuery.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const callbacks = await services.listCallbacks({
        actorUserId,
        ...params.data,
        ...(query.data.status === undefined ? {} : { status: query.data.status }),
      });
      return reply.send({ callbacks });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/callbacks/unpaid",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const callbacks = await services.listUnpaidCallbacks({
        actorUserId,
        ...params.data,
      });
      return reply.send({ callbacks });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/legacy",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = recordLegacyBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const legacy = await services.recordLegacy({
        actorUserId,
        ...params.data,
        kind: body.data.kind,
        ...(body.data.subjectId === undefined ? {} : { subjectId: body.data.subjectId }),
        description: body.data.description,
      });
      return reply.code(201).send({ legacy });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/legacy",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = listLegaciesQuery.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const legacies = await services.listLegacies({
        actorUserId,
        ...params.data,
        ...(query.data.kind === undefined ? {} : { kind: query.data.kind }),
      });
      return reply.send({ legacies });
    },
  );
}
