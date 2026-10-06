/**
 * NF-WF-021B: Causal evidence and uncertainty-as-proposal routes.
 *
 * Same conventions as the other route modules: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service errors
 * mapped once in platform-routes' error handler.
 *
 * These routes are 021B's additive surface. 021A owns `simulation-routes.ts`
 * (run lifecycle); this module owns the causal/proposal surface. Both are
 * registered in app.ts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
// Error mapping lives in platform-routes' ONE setErrorHandler (shared
// app-wide); causality routes never register a second handler.
import type {
  CausalityServices,
  CausalKind,
  DivergenceTrigger,
  OutcomeAlternative,
} from "./services/simulation-causality.ts";

const uuid = z.string().uuid();
const runParams = z.object({ workspaceId: uuid, novelId: uuid, runId: uuid });
const eventParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  runId: uuid,
  eventId: uuid,
});
const proposalParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  runId: uuid,
  proposalId: uuid,
});

const causalKind = z.enum(["DIRECT", "ENABLING", "PREVENTING"]);
const divergenceTrigger = z.enum([
  "THRESHOLD_SPAN",
  "NO_DOMINANT_OUTCOME",
  "COUNTERFACTUAL_UNCERTAINTY",
]);

const outcomeAlternative = z.object({
  id: z.string().min(1).max(100),
  outcome: z.unknown(),
  evidence: z.unknown(),
  confidence: z.number().min(0).max(1),
});

const createLinkBody = z.object({
  eventId: uuid,
  causeEventId: uuid.optional(),
  causeStateRef: z.unknown().optional(),
  kind: causalKind,
  evidence: z.unknown(),
});

const createProposalBody = z.object({
  tickNumber: z.number().int().min(0),
  alternatives: z.array(outcomeAlternative).min(2),
  trigger: divergenceTrigger,
  reason: z.string().min(1).max(2000),
});

const decideProposalBody = z.object({
  /** The chosen alternative's id (required when approve=true). */
  choice: z.string().min(1).max(100).optional(),
  rationale: z.string().max(2000).optional(),
  /** True = approve the chosen alternative; false = reject the proposal. */
  approve: z.boolean(),
});

export interface CausalityRoutesOptions {
  auth: AuthService;
  services: CausalityServices;
}

export function registerCausalityRoutes(
  app: FastifyInstance,
  { auth, services }: CausalityRoutesOptions,
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
  // app-wide handler mapping SimulationCausalityError. A second
  // registration would silently replace it (Fastify last-wins).

  // --- Causal links ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/causal-links",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createLinkBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.createCausalLink({
        actorUserId,
        ...params.data,
        eventId: body.data.eventId,
        causeEventId: body.data.causeEventId,
        causeStateRef: body.data.causeStateRef,
        kind: body.data.kind as CausalKind,
        evidence: body.data.evidence,
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/events/:eventId/causes",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = eventParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ maxDepth: z.coerce.number().int().min(1).max(20).optional() })
        .safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const chain = await services.getCausalChain({
        actorUserId,
        ...params.data,
        ...(query.data.maxDepth === undefined ? {} : { maxDepth: query.data.maxDepth }),
      });
      return reply.send({ chain });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/events/:eventId/counterfactuals",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = eventParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const counterfactuals = await services.getCounterfactuals({
        actorUserId,
        ...params.data,
      });
      return reply.send({ counterfactuals });
    },
  );

  // --- Proposals (uncertainty, never silently resolved) ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/proposals",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createProposalBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.createProposal({
        actorUserId,
        ...params.data,
        tickNumber: body.data.tickNumber,
        alternatives: body.data.alternatives as OutcomeAlternative[],
        trigger: body.data.trigger as DivergenceTrigger,
        reason: body.data.reason,
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/proposals",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = runParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ status: z.enum(["PROPOSED", "APPROVED", "REJECTED"]).optional() })
        .safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const proposals = await services.listProposals({
        actorUserId,
        ...params.data,
        ...(query.data.status === undefined ? {} : { status: query.data.status }),
      });
      return reply.send({ proposals });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/proposals/:proposalId/decide",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = proposalParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = decideProposalBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      // Approving requires an explicit choice — there is no default.
      if (body.data.approve && !body.data.choice) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      const result = await services.decideProposal({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        proposalId: params.data.proposalId,
        choice: body.data.choice ?? "",
        rationale: body.data.rationale,
        approve: body.data.approve,
      });
      return reply.send(result);
    },
  );
}
