/**
 * Character routes (Phase 8).
 *
 * Same contract as canon-routes and planning-routes: workspace-scoped URLs,
 * session-cookie auth, Zod at every boundary, tenant resolution inside the
 * service from the STORED row (a cross-tenant id is a 404, not a 403 — no
 * existence leak). List routes take `take`/`skip`.
 *
 * Enum bodies use the domain package's local mirrors (`z.enum(...)` over
 * KNOWLEDGE_STANCES etc.), not the Prisma enums — the mirrors are pinned by
 * a test, so a schema/vocabulary drift fails there rather than silently
 * widening what this route accepts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { ARC_STATUSES, KNOWLEDGE_SOURCES, KNOWLEDGE_STANCES } from "@novelforge/character-intelligence";
import type { CharacterServices } from "@novelforge/ai-services";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const characterParams = z.object({ workspaceId: uuid, novelId: uuid, characterId: uuid });
const arcParams = z.object({ workspaceId: uuid, novelId: uuid, arcId: uuid });

const createCharacterBody = z.object({
  // Lowercase kebab, matching StoryEntity.key — the stable machine identity.
  key: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(20_000).nullable().optional(),
});

const createStateBody = z.object({
  fromChapter: z.number().int().min(1).max(100_000),
  toChapter: z.number().int().min(1).max(100_000).nullable().optional(),
  summary: z.string().trim().min(1).max(20_000),
});

const putKnowledgeBody = z.object({
  factId: uuid,
  stance: z.enum(KNOWLEDGE_STANCES),
  source: z.enum(KNOWLEDGE_SOURCES),
  fromChapter: z.number().int().min(1).max(100_000),
  toChapter: z.number().int().min(1).max(100_000).nullable().optional(),
});

const createArcBody = z.object({
  title: z.string().trim().min(1).max(300),
  status: z.enum(ARC_STATUSES).optional(),
});

const addMilestoneBody = z.object({
  chapter: z.number().int().min(1).max(100_000),
  summary: z.string().trim().min(1).max(20_000),
});

const pageQuery = z.object({
  take: z.coerce.number().int().min(1).max(1000).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
});

export interface CharacterRoutesOptions {
  auth: AuthService;
  services: CharacterServices;
}

export function registerCharacterRoutes(
  app: FastifyInstance,
  { auth, services }: CharacterRoutesOptions,
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

  // --- Characters ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/characters", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createCharacterBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createCharacter({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      key: body.data.key,
      name: body.data.name,
      summary: body.data.summary ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/characters", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = pageQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listCharacters({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      take: query.data.take ?? 50,
      skip: query.data.skip ?? 0,
    });
  });

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteCharacter({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
      });
      return reply.code(204).send();
    },
  );

  // --- Historical state ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/states",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createStateBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createState({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
        fromChapter: body.data.fromChapter,
        toChapter: body.data.toChapter ?? null,
        summary: body.data.summary,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/states",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listStates({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
      });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/states/at",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ chapter: z.coerce.number().int().min(1).max(100_000) })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const found = await services.stateAt({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
        chapter: query.data.chapter,
      });
      // Null is a real answer here, not a 404: the author never recorded a
      // state for that chapter. 204 would lose the distinction from an
      // unknown character (which the service 404s).
      return reply.code(200).send(found);
    },
  );

  // --- Knowledge boundary ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/knowledge",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = putKnowledgeBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.putKnowledge({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
        factId: body.data.factId,
        stance: body.data.stance,
        source: body.data.source,
        fromChapter: body.data.fromChapter,
        toChapter: body.data.toChapter ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/knowledge",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listKnowledge({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
      });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/knowledge/access",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ factId: uuid, chapter: z.coerce.number().int().min(1).max(100_000) })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.voiceAccess({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
        factId: query.data.factId,
        chapter: query.data.chapter,
      });
    },
  );

  // --- Arcs ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/arcs",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createArcBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createArc({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
        title: body.data.title,
        status: body.data.status ?? "ACTIVE",
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/arcs",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = characterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listArcs({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: params.data.characterId,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/arcs/:arcId/milestones",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = arcParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = addMilestoneBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.addMilestone({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        arcId: params.data.arcId,
        chapter: body.data.chapter,
        summary: body.data.summary,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/arcs/:arcId/progress",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = arcParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ chapter: z.coerce.number().int().min(1).max(100_000) })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.arcProgress({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        arcId: params.data.arcId,
        chapter: query.data.chapter,
      });
    },
  );
}
