/**
 * Simulation routes (M6, NF-WF-021A): run lifecycle API.
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in the error handler (platform-routes owns the single
 * app-wide handler).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { SimulationServices } from "./services/simulation.ts";

const uuid = z.string().uuid();
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });
const runParams = z.object({ workspaceId: uuid, novelId: uuid, runId: uuid });
const tickParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  runId: uuid,
  tickNumber: z.coerce.number().int().min(1),
});

const createRunBody = z.object({
  // Optional branch. Omitted → the run is created without a branch and
  // configure 400s NO_BRANCH (contract F3 — 021A does NOT auto-provision).
  branchId: uuid.optional(),
  scenario: z
    .object({
      initialState: z.record(z.string(), z.unknown()).optional(),
      injections: z.record(z.string(), z.array(z.unknown())).optional(),
      seed: z.string().max(100).optional(),
      maxTicks: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
});

const stepBody = z.object({
  ticks: z.number().int().min(1).max(100).optional(),
});

export interface SimulationRoutesOptions {
  auth: AuthService;
  services: SimulationServices;
}

export function registerSimulationRoutes(
  app: FastifyInstance,
  { auth, services }: SimulationRoutesOptions,
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
  // app-wide handler mapping Forbidden/NotFound/SimulationError.

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createRunBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.createRun({
        actorUserId,
        ...params.data,
        ...(body.data.branchId === undefined ? {} : { branchId: body.data.branchId }),
        ...(body.data.scenario === undefined ? {} : { scenario: body.data.scenario }),
      });
      return reply.code(201).send({ run });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const runs = await services.listRuns({ actorUserId, ...params.data });
      return reply.send({ runs });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.getRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/configure",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.configureRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/start",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.startRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/step",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = stepBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.stepRun({
        actorUserId,
        ...params.data,
        ...(body.data.ticks === undefined ? {} : { ticks: body.data.ticks }),
      });
      return reply.send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/pause",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.pauseRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/resume",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.resumeRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/abort",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const run = await services.abortRun({ actorUserId, ...params.data });
      return reply.send({ run });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/ticks/:tickNumber",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = tickParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const tick = await services.getTick({ actorUserId, ...params.data });
      return reply.send({ tick });
    },
  );
}
