/**
 * NF-WF-009 memory routes: revision-derived chapter/arc memory.
 *
 * - `GET  /api/workspaces/:workspaceId/novels/:novelId/memory/status`
 *   → per-scope freshness (novel:read).
 * - `POST /api/workspaces/:workspaceId/novels/:novelId/memory/rebuild`
 *   → enqueue async rebuild jobs, 202 (novel:update). Body
 *   `{simulation: true}` → 400 SIMULATION_SOURCE_REFUSED.
 * - `GET  /api/workspaces/:workspaceId/novels/:novelId/memory/as-of`
 *   → historical retrieval by chapter (settle revision) or explicit
 *   revision id (novel:read). Cross-branch revision → 400 INVALID_INPUT.
 * - `GET  /api/workspaces/:workspaceId/novels/:novelId/memory/global`
 *   → bounded union read of the novel's arc:{sagaId} scopes
 *   (novel:read). Cross-branch as-of revision → 400 INVALID_INPUT.
 *
 * Error mapping lives in platform-routes' ONE setErrorHandler (shared
 * with canon, workflow, revision routes).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { MemoryServices } from "@novelforge/ai-services";

const SESSION_COOKIE = "nf_session";

export interface MemoryRoutesOptions {
  auth: AuthService;
  memory: MemoryServices;
}

const novelParams = z.object({
  workspaceId: z.string().uuid(),
  novelId: z.string().uuid(),
});

const rebuildBody = z.object({
  scope: z.string().optional(),
  revisionId: z.string().uuid().optional(),
  simulation: z.boolean().optional(),
});

const asOfQuery = z.object({
  chapter: z.coerce.number().int().positive().optional(),
  revisionId: z.string().uuid().optional(),
});

const globalQuery = z.object({
  asOfRevisionId: z.string().uuid().optional(),
});

export function registerMemoryRoutes(
  app: FastifyInstance,
  { auth, memory }: MemoryRoutesOptions,
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

  app.get("/api/workspaces/:workspaceId/novels/:novelId/memory/status", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const statuses = await memory.getMemoryStatus(
      actorUserId,
      params.data.workspaceId,
      params.data.novelId,
    );
    return reply.code(200).send({ statuses });
  });

  app.post("/api/workspaces/:workspaceId/novels/:novelId/memory/rebuild", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = rebuildBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = await memory.triggerRebuild(
      actorUserId,
      params.data.workspaceId,
      params.data.novelId,
      body.data,
    );
    return reply.code(202).send(result);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/memory/as-of", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = asOfQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = await memory.readAsOf(
      actorUserId,
      params.data.workspaceId,
      params.data.novelId,
      query.data,
    );
    return reply.code(200).send(result);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/memory/global", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = globalQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const global = await memory.readGlobalMemory(
      actorUserId,
      params.data.workspaceId,
      params.data.novelId,
      query.data,
    );
    return reply.code(200).send({ global });
  });
}
