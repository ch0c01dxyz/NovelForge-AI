/**
 * Manuscript routes (Phase 2): chapters + immutable versions.
 *
 * Same conventions as platform routes: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service
 * errors mapped once in the error handler.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
// Error mapping lives in platform-routes' ONE setErrorHandler (shared
// app-wide); manuscript routes never register a second handler.
import type { ManuscriptServices } from "./services/manuscript.ts";

const uuid = z.string().uuid();
const chapterParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  chapterId: uuid,
});
const novelScopeParams = z.object({ workspaceId: uuid, novelId: uuid });

const createChapterBody = z.object({
  title: z.string().trim().min(1).max(200),
});
const saveChapterBody = z.object({
  content: z.string().max(1_000_000),
  note: z.string().trim().max(200).optional(),
  expectedVersion: z.number().int().min(0).nullable(),
});
const setStatusBody = z.object({
  status: z.enum(["IN_REVIEW", "PUBLISHED"]),
});
// NF-WF-015 (Invariant 6): minimal scene CRUD. Scenes are structural
// anchors (title/summary/number) — no scene content, no versioning.
const sceneScopeParams = chapterParams;
const sceneParams = chapterParams.extend({ sceneId: uuid });
const createSceneBody = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(5000).optional(),
  number: z.number().int().min(1).optional(),
});
const updateSceneBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(5000).nullable().optional(),
    number: z.number().int().min(1).optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.summary !== undefined || v.number !== undefined,
    { message: "empty patch" },
  );

// Fastify's default bodyLimit is 1 MB; the save and import routes accept
// more, so without a per-route limit a valid payload 413s before Zod ever
// runs.
//
// The limits are UTF-8 BYTES; the schemas cap CHARACTERS (1M content, 5M
// imported text). CJK costs 3 bytes per character and JSON escaping adds
// more, so each limit is 3x its schema cap — the smallest values under
// which the advertised character caps are actually reachable.
const SAVE_BODY_LIMIT = 3_000_000;
const IMPORT_BODY_LIMIT = 15_000_000;

export interface ManuscriptRoutesOptions {
  auth: AuthService;
  services: ManuscriptServices;
}

export function registerManuscriptRoutes(
  app: FastifyInstance,
  { auth, services }: ManuscriptRoutesOptions,
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

  app.post("/api/workspaces/:workspaceId/novels/:novelId/chapters", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createChapterBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const chapter = await services.createChapter({
      actorUserId,
      ...params.data,
      title: body.data.title,
    });
    return reply.code(201).send(chapter);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/chapters", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listChapters({ actorUserId, ...params.data });
  });

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.getChapter({ actorUserId, ...params.data });
    },
  );

  app.put(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId",
    { bodyLimit: SAVE_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = saveChapterBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.saveChapter({
        actorUserId,
        ...params.data,
        ...body.data,
      });
      return result;
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteChapter({ actorUserId, ...params.data });
      return { status: "ok" };
    },
  );

  app.patch(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/status",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = setStatusBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.setStatus({ actorUserId, ...params.data, status: body.data.status });
      return { status: "ok" };
    },
  );

  // --- NF-WF-015 scene anchors (minimal CRUD, Invariant 6) ---
  // Same conventions: session auth, Zod → 400, membership 404 gate,
  // `chapter:update` capability, the app-wide error handler.

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scenes",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = sceneScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listScenes({ actorUserId, ...params.data });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scenes",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = sceneScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createSceneBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const scene = await services.createScene({
        actorUserId,
        ...params.data,
        ...body.data,
      });
      return reply.code(201).send(scene);
    },
  );

  app.patch(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scenes/:sceneId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = sceneParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = updateSceneBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.updateScene({ actorUserId, ...params.data, ...body.data });
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scenes/:sceneId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = sceneParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteScene({ actorUserId, ...params.data });
      return { status: "ok" };
    },
  );

  const importBody = z.object({
    text: z.string().min(1).max(5_000_000),
    format: z.enum(["md", "txt"]),
    // NF-WF-002D: `chapters.import` is HIGH, so it carries the caller's head
    // expectation (C12.1 tri-state). The text/format fields stay required.
    expectedHeadRevisionId: uuid.nullable().optional(),
  });

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/versions",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listVersions({ actorUserId, ...params.data });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/versions/:versionNumber/restore",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams
        .extend({ versionNumber: z.coerce.number().int().min(1) })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const { versionNumber, ...scope } = params.data;
      const result = await services.restoreVersion({
        actorUserId,
        ...scope,
        versionNumber,
      });
      return result;
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/import",
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelScopeParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = importBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.importChapters({
        actorUserId,
        ...params.data,
        ...body.data,
      });
      return reply.code(201).send(result);
    },
  );

  app.get("/api/workspaces/:workspaceId/novels/:novelId/export", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelScopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const { filename, content } = await services.exportNovel({
      actorUserId,
      ...params.data,
    });
    return reply
      .header("content-disposition", `attachment; filename="${filename}"`)
      .type("text/markdown; charset=utf-8")
      .send(content);
  });
}
