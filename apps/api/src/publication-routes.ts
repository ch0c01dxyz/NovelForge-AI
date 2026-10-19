/**
 * Publication routes (NF-WF-012): the release lifecycle for chapters and
 * the archive lifecycle for novels.
 *
 * Same conventions as manuscript-routes.ts: session auth → 401
 * UNAUTHENTICATED; membership tenant gate → 404 (service layer);
 * Zod validation → 400 INVALID_INPUT; uuid params; service errors mapped
 * once in the app-wide error handler (platform-routes owns the single
 * setErrorHandler — this module never registers a second one).
 *
 * No public reader routes here — those are NF-WF-013's. The 013 shapes
 * are pinned in the contract; 012 only provides the service predicates
 * (isPubliclyVisible / resolvePublicChapter).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
// Error mapping lives in platform-routes' ONE setErrorHandler (shared
// app-wide); publication routes never register a second handler.
import type { PublicationServices } from "./services/publication.ts";

const uuid = z.string().uuid();
const chapterParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  chapterId: uuid,
});
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const publishBody = z.object({ expectedChapterVersionId: uuid.optional() });

// ISO-8601 with offset, parseable and strictly in the future. A past or
// unparseable time is 400 INVALID_INPUT at the route level (Invariant 5)
// — never a silent immediate publish.
const scheduleBody = z.object({
  scheduledFor: z
    .string()
    .refine(
      (s) => {
        const t = Date.parse(s);
        return !Number.isNaN(t) && t > Date.now();
      },
      { message: "scheduledFor must be a future ISO-8601 timestamp" },
    ),
});

export interface PublicationRoutesOptions {
  auth: AuthService;
  services: PublicationServices;
}

export function registerPublicationRoutes(
  app: FastifyInstance,
  { auth, services }: PublicationRoutesOptions,
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
  // app-wide handler mapping Forbidden/NotFound/ConflictError,
  // PolicyError and PublicationError. A second registration would
  // silently replace it (Fastify last-wins).

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/schedule",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = scheduleBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.schedulePublication({
        actorUserId,
        ...params.data,
        scheduledFor: body.data.scheduledFor,
      });
      return reply.code(201).send(result);
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/schedule",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.cancelScheduledPublication({
        actorUserId,
        ...params.data,
      });
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/publish",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = publishBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.publishChapter({
        actorUserId,
        ...params.data,
        ...body.data,
      });
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/unpublish",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.unpublishChapter({
        actorUserId,
        ...params.data,
      });
      return reply.code(200).send(result);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.getPublicationStatus({
        actorUserId,
        ...params.data,
      });
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/archive",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.archiveNovel({
        actorUserId,
        ...params.data,
      });
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/unarchive",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.unarchiveNovel({
        actorUserId,
        ...params.data,
      });
      return reply.code(200).send(result);
    },
  );
}
