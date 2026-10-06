/**
 * Endgame routes (M7, NF-WF-022A): closure ledger, ending gate, debt report.
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
import type { EndgameServices } from "./services/endgame.ts";
import { ENDGAME_CLOSURE_STATUSES } from "./services/endgame.ts";

const uuid = z.string().uuid();
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });
const ledgerParams = z.object({ workspaceId: uuid, novelId: uuid, ledgerId: uuid });

const closureStatus = z.enum(ENDGAME_CLOSURE_STATUSES);

const createLedgerBody = z.object({
  threadId: uuid,
  status: closureStatus,
  criteria: z.string().max(5000).optional(),
  rationale: z.string().max(5000).optional(),
});

const updateLedgerBody = z
  .object({
    status: closureStatus.optional(),
    criteria: z.string().max(5000).nullable().optional(),
    rationale: z.string().max(5000).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.criteria !== undefined || b.rationale !== undefined, {
    message: "at least one field must be provided",
  });

const listQuery = z.object({
  status: closureStatus.optional(),
});

export interface EndgameRoutesOptions {
  auth: AuthService;
  services: EndgameServices;
}

export function registerEndgameRoutes(
  app: FastifyInstance,
  { auth, services }: EndgameRoutesOptions,
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

  app.post("/api/workspaces/:workspaceId/novels/:novelId/endgame/ledger", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createLedgerBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const entry = await services.createLedgerEntry({
      actorUserId,
      ...params.data,
      threadId: body.data.threadId,
      status: body.data.status,
      ...(body.data.criteria === undefined ? {} : { criteria: body.data.criteria }),
      ...(body.data.rationale === undefined ? {} : { rationale: body.data.rationale }),
    });
    return reply.code(201).send({ entry });
  });

  app.patch(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/ledger/:ledgerId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = ledgerParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = updateLedgerBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const entry = await services.updateLedgerEntry({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        ledgerId: params.data.ledgerId,
        ...(body.data.status === undefined ? {} : { status: body.data.status }),
        ...(body.data.criteria === undefined ? {} : { criteria: body.data.criteria }),
        ...(body.data.rationale === undefined ? {} : { rationale: body.data.rationale }),
      });
      return reply.send({ entry });
    },
  );

  app.get("/api/workspaces/:workspaceId/novels/:novelId/endgame/ledger", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = listQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const entries = await services.listLedgerEntries({
      actorUserId,
      ...params.data,
      ...(query.data.status === undefined ? {} : { status: query.data.status }),
    });
    return reply.send({ entries });
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/endgame/gate", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const gateResult = await services.getGate({ actorUserId, ...params.data });
    return reply.send({ gate: gateResult });
  });

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/gate/approve",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const gateResult = await services.approveGate({ actorUserId, ...params.data });
      return reply.send({ gate: gateResult });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/endgame/debt-report",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const report = await services.getDebtReport({ actorUserId, ...params.data });
      return reply.send({ report });
    },
  );
}
