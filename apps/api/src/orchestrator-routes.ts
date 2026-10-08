/**
 * AI Orchestrator routes (milestone).
 *
 * The lifecycle entry point: the caller names an agent and an instruction,
 * and the orchestrator resolves the definition, compiles context, and runs
 * the generation. Distinct from `/generations`, which takes a fully
 * assembled message list and is the transport for callers that already
 * know what they want to send.
 *
 * Errors are mapped by the app-wide error handler in platform-routes.ts
 * (403/404/409/502), so a route here never formats one itself.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { GENERATION_COMPONENTS } from "@novelforge/ai-core";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { OrchestratorServices } from "./services/orchestrator.ts";

const uuid = z.string().uuid();
const workspaceParams = z.object({ workspaceId: uuid });

const generateBody = z.object({
  agentKey: z.string().trim().min(1).max(200),
  component: z.enum(GENERATION_COMPONENTS).optional(),
  artifactId: uuid.optional(),
  instruction: z.string().min(1).max(200_000),
  novelId: uuid.optional(),
  contextQuery: z.string().max(2000).optional(),
});

// The instruction alone is allowed to be 200k chars; Fastify's 1 MB default
// would 413 a schema-valid payload before Zod ran.
const GENERATE_BODY_LIMIT = 4_000_000;

export interface OrchestratorRoutesOptions {
  auth: AuthService;
  services: OrchestratorServices;
}

export function registerOrchestratorRoutes(
  app: FastifyInstance,
  { auth, services }: OrchestratorRoutesOptions,
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

  app.post(
    "/api/workspaces/:workspaceId/generate",
    { bodyLimit: GENERATE_BODY_LIMIT },
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = generateBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.generate({
        actorUserId: actor,
        workspaceId: params.data.workspaceId,
        ...body.data,
      });
      return reply.code(201).send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/generate/stream",
    { bodyLimit: GENERATE_BODY_LIMIT },
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = generateBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

      const abort = new AbortController();
      const onClose = () => abort.abort();

      // Everything that can fail closed (capability, novel tenancy,
      // definition resolution, contract refusal) fails HERE, before a
      // status code is committed, so it reaches the caller as a real
      // 403/404/409 rather than an SSE error event.
      const { generationId, stream, status } = await services.generateStream({
        actorUserId: actor,
        workspaceId: params.data.workspaceId,
        signal: abort.signal,
        ...body.data,
      });

      // Registered only AFTER the call above returned, because that call is
      // where every fail-closed refusal happens — attaching the listener
      // first would leave it on the socket of a request answered with a
      // plain 409/404/403, retaining a closure and a controller for a
      // stream that never existed.
      reply.raw.on("close", onClose);

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Proxies must not buffer a stream.
        "x-accel-buffering": "no",
      });
      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      send("generation", { generationId });

      try {
        for await (const delta of stream) {
          send("delta", { delta });
        }
        const outcome = await status();
        send("done", { generationId, status: outcome });
      } catch (err) {
        // The stream already sent a 200, so the failure is reported as an
        // event. `status()` has persisted the real outcome (INCOMPLETE
        // when content was emitted, FAILED otherwise).
        const outcome = await status();
        send("error", {
          generationId,
          status: outcome,
          error: err instanceof Error ? err.name : "ERROR",
        });
      } finally {
        reply.raw.end();
      }
      // The response is written directly to the socket; tell Fastify not
      // to also try to serialize a payload.
      return reply;
    },
  );
}
