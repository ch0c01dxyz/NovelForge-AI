/**
 * Simulation debugger routes (M9, NF-WF-024B): breakpoints, watch,
 * deterministic time-travel replay, debug-step.
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in the error handler (platform-routes owns the single
 * app-wide handler).
 *
 * These routes are 024B's additive surface. 021A owns `simulation-routes.ts`
 * (run lifecycle); 021B owns `simulation-causality-routes.ts`; this module
 * owns the debugger surface. All are registered in app.ts.
 *
 * Capabilities (024 contract §Capabilities — no new capabilities):
 * - `simulation:read` for list/replay/watch (read-only).
 * - `simulation:manage` for breakpoint mutations and debug-step.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type {
  DebuggerServices,
  BreakpointKind,
  BreakpointPredicate,
} from "./services/simulation-debugger.ts";
import type { SimulationServices } from "./services/simulation.ts";

const uuid = z.string().uuid();
const runParams = z.object({ workspaceId: uuid, novelId: uuid, runId: uuid });
const breakpointParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  runId: uuid,
  breakpointId: uuid,
});

const breakpointKind = z.enum(["TICK", "PREDICATE", "ON_PROPOSAL"]);

const tickPredicate = z.object({
  tickNumber: z.number().int().min(1),
});

const predicatePredicate = z.object({
  path: z.string().min(1).max(500),
  op: z.enum([">", "<", ">=", "<=", "==", "!="]),
  value: z.unknown(),
});

const createBreakpointBody = z.object({
  kind: breakpointKind,
  // TICK: { tickNumber }. PREDICATE: { path, op, value }. ON_PROPOSAL: omitted.
  predicate: z.union([tickPredicate, predicatePredicate]).nullable().optional(),
  watch: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const replayBody = z.object({
  toTick: z.number().int().min(1),
});

export interface DebuggerRoutesOptions {
  auth: AuthService;
  services: DebuggerServices;
  /** 021A simulation services (for debug-step's stepFn). */
  simulationServices: SimulationServices;
}

export function registerDebuggerRoutes(
  app: FastifyInstance,
  { auth, services, simulationServices }: DebuggerRoutesOptions,
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
  // app-wide handler mapping DebuggerError/SimulationError. A second
  // handler would shadow it.

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/breakpoints",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createBreakpointBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const bp = await services.createBreakpoint({
        actorUserId,
        ...params.data,
        kind: body.data.kind as BreakpointKind,
        predicate: (body.data.predicate ?? null) as
          | BreakpointPredicate
          | { tickNumber: number }
          | null,
        ...(body.data.watch === undefined ? {} : { watch: body.data.watch }),
        ...(body.data.enabled === undefined ? {} : { enabled: body.data.enabled }),
      });
      return reply.code(201).send({ breakpoint: bp });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/breakpoints",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const breakpoints = await services.listBreakpoints({ actorUserId, ...params.data });
      return reply.send({ breakpoints });
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/breakpoints/:breakpointId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = breakpointParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteBreakpoint({ actorUserId, ...params.data });
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/replay",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = replayBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.replayRun({
        actorUserId,
        ...params.data,
        toTick: body.data.toTick,
      });
      return reply.send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/watch",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const watches = await services.getWatchValues({ actorUserId, ...params.data });
      return reply.send({ watches });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/debug-step",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.debugStep({
        actorUserId,
        ...params.data,
        stepFn: (args) => simulationServices.stepRun(args),
      });
      return reply.send(result);
    },
  );
}
