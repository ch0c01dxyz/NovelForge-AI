/**
 * Relationship routes (Phase 8).
 *
 * Same contract as character-routes. Enum bodies use the domain mirrors, not
 * the Prisma enums.
 *
 * The two Phase 8 exit scenarios read through here: monogamy/harem/polygamy
 * is createBond (POST /relationships/bonds), enemy-to-ally is createStance
 * plus the stanceSince read (POST /relationships/stances, GET .../since).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  BOND_STAGES,
  BOND_STRUCTURES,
  BOND_TRANSITION_KINDS,
  RELATIONSHIP_STANCES,
} from "@novelforge/relationship-intelligence";
import type { RelationshipServices } from "./services/relationships.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const bondParams = z.object({ workspaceId: uuid, novelId: uuid, bondId: uuid });
const chapter = z.coerce.number().int().min(1).max(100_000);
const optionalChapter = z.coerce.number().int().min(1).max(100_000).nullable().optional();

const createStanceBody = z.object({
  fromCharacterId: uuid,
  toCharacterId: uuid,
  stance: z.enum(RELATIONSHIP_STANCES),
  fromChapter: z.number().int().min(1).max(100_000),
  toChapter: optionalChapter,
});

const createBondBody = z.object({
  structure: z.enum(BOND_STRUCTURES),
  memberIds: z.array(uuid).min(1).max(64),
  fromChapter: z.number().int().min(1).max(100_000),
  toChapter: optionalChapter,
});

const addTransitionBody = z.object({
  chapter: z.number().int().min(1).max(100_000),
  stage: z.enum(BOND_STAGES),
  kind: z.enum(BOND_TRANSITION_KINDS),
});

const recordInteractionBody = z.object({
  chapter: z.number().int().min(1).max(100_000),
  // Bounds only; the domain floor (MEANINGFUL_WEIGHT_FLOOR) is the service's
  // call, because "meaningful" is a story rule and not a transport rule.
  weight: z.number().min(0).max(1),
  summary: z.string().trim().max(20_000).nullable().optional(),
});

const pageQuery = z.object({
  take: z.coerce.number().int().min(1).max(1000).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
});

const pairQuery = z.object({
  fromCharacterId: uuid,
  toCharacterId: uuid,
  chapter,
});

export interface RelationshipRoutesOptions {
  auth: AuthService;
  services: RelationshipServices;
}

export function registerRelationshipRoutes(
  app: FastifyInstance,
  { auth, services }: RelationshipRoutesOptions,
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

  // --- Stances (the enemy-to-ally scenario) ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/stances",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createStanceBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createStance({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        fromCharacterId: body.data.fromCharacterId,
        toCharacterId: body.data.toCharacterId,
        stance: body.data.stance,
        fromChapter: body.data.fromChapter,
        toChapter: body.data.toChapter ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/stances",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      // Both directions optional: the whole graph, or one character's edges.
      const query = z
        .object({ fromCharacterId: uuid.nullable().optional(), toCharacterId: uuid.nullable().optional() })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listStances({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        fromCharacterId: query.data.fromCharacterId ?? null,
        toCharacterId: query.data.toCharacterId ?? null,
      });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/stances/at",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = pairQuery.safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const found = await services.stanceAt({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        fromCharacterId: query.data.fromCharacterId,
        toCharacterId: query.data.toCharacterId,
        chapter: query.data.chapter,
      });
      // Null means "no recorded stance at that chapter", which is not the
      // same as "unknown pair" — the service 404s the latter. 204 would
      // collapse the two.
      return reply.code(200).send(found);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/stances/since",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = pairQuery.safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const found = await services.stanceSince({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        fromCharacterId: query.data.fromCharacterId,
        toCharacterId: query.data.toCharacterId,
        chapter: query.data.chapter,
      });
      return reply.code(200).send(found);
    },
  );

  // --- Bonds (the monogamy / harem / polygamy scenario) ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createBondBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createBond({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        structure: body.data.structure,
        memberIds: body.data.memberIds,
        fromChapter: body.data.fromChapter,
        toChapter: body.data.toChapter ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = pageQuery.safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listBonds({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        take: query.data.take ?? 50,
        skip: query.data.skip ?? 0,
      });
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteBond({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
      });
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId/transitions",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = addTransitionBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.addTransition({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
        chapter: body.data.chapter,
        stage: body.data.stage,
        kind: body.data.kind,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId/transitions",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listTransitions({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
      });
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId/stage",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z.object({ chapter }).safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const stage = await services.bondStageAt({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
        chapter: query.data.chapter,
      });
      return reply.code(200).send({ stage });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId/interactions",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = recordInteractionBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.recordInteraction({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
        chapter: body.data.chapter,
        weight: body.data.weight,
        summary: body.data.summary ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/relationships/bonds/:bondId/neglect",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = bondParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const query = z
        .object({ chapter, maxGap: z.coerce.number().int().min(1).max(100_000).optional() })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.neglectReport({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        bondId: params.data.bondId,
        chapter: query.data.chapter,
        ...(query.data.maxGap === undefined ? {} : { maxGap: query.data.maxGap }),
      });
    },
  );
}
