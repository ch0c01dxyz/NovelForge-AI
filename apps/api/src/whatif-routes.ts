/**
 * What-if routes (M9, NF-WF-024A): evaluated outline-version comparison API.
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in the error handler (platform-routes owns the single
 * app-wide handler).
 *
 * Routes (all additive; requires simulation:read / simulation:manage):
 * - POST   /api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons
 * - POST   /api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons/:comparisonId/run
 * - GET    /api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons
 * - GET    /api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons/:comparisonId
 *
 * There is deliberately NO approve/promote route (024 Invariant 1).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { WhatifServices } from "./services/whatif.ts";
import { WHATIF_MAX_TOKEN_BUDGET } from "./services/whatif.ts";

const uuid = z.string().uuid();
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });
const comparisonParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  comparisonId: uuid,
});

const createComparisonBody = z.object({
  outlineVersionIds: z.array(uuid).min(2).max(5),
  maxChapters: z.number().int().min(1).max(10).optional(),
  tokenBudget: z.number().int().min(1).max(WHATIF_MAX_TOKEN_BUDGET).optional(),
  // Invariant 3: explicit author confirmation required.
  confirmed: z.literal(true),
  // NF-WF-027 (GAP-100): explicit branch ownership. Required — no default.
  branchSelection: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), branchId: uuid }),
    z.object({ mode: z.literal("provision") }),
  ]),
});

export interface WhatifRoutesOptions {
  auth: AuthService;
  services: WhatifServices;
}

export function registerWhatifRoutes(
  app: FastifyInstance,
  { auth, services }: WhatifRoutesOptions,
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
  // app-wide handler mapping Forbidden/NotFound/SimulationError/WhatifError.

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createComparisonBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const comparison = await services.createComparison({
        actorUserId,
        ...params.data,
        outlineVersionIds: body.data.outlineVersionIds,
        ...(body.data.maxChapters === undefined ? {} : { maxChapters: body.data.maxChapters }),
        ...(body.data.tokenBudget === undefined ? {} : { tokenBudget: body.data.tokenBudget }),
        confirmed: body.data.confirmed,
        branchSelection: body.data.branchSelection,
      });
      return reply.code(201).send({ comparison });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons/:comparisonId/run",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = comparisonParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const comparison = await services.runComparison({
        actorUserId,
        ...params.data,
      });
      return reply.send({ comparison });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const comparisons = await services.listComparisons({ actorUserId, ...params.data });
      return reply.send({ comparisons });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/whatif/comparisons/:comparisonId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = comparisonParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const comparison = await services.getComparison({ actorUserId, ...params.data });
      return reply.send({ comparison });
    },
  );
}
