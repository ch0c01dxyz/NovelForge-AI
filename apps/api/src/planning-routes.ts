/**
 * Planning routes (Phase 7).
 *
 * Same contract as canon-routes: workspace-scoped URLs, session-cookie
 * auth, Zod at every boundary, tenant resolution inside the service from
 * the STORED row (a cross-tenant id is a 404, not a 403 — no existence
 * leak). List routes take `take`/`skip` — planning tables are the ones
 * meant to grow into thousands of rows (one outline node per planned
 * chapter), so an unpaginated findMany here would be a defect, not a
 * shortcut.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  OUTLINE_NODE_KINDS,
  PLANNING_KINDS,
} from "@novelforge/planning";
import type { PlanningServices } from "./services/planning.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });

const createSynopsisBody = z.object({
  content: z.string().trim().min(1).max(20_000),
});

const createSagaBody = z.object({
  kind: z.enum(PLANNING_KINDS),
  title: z.string().trim().min(1).max(300),
  parentId: uuid.nullable().optional(),
  intent: z.string().trim().max(2000).nullable().optional(),
});

const createOutlineNodeBody = z.object({
  sagaId: uuid,
  kind: z.enum(OUTLINE_NODE_KINDS),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(4000).nullable().optional(),
  order: z.number().int().min(0).max(100_000),
  chapterId: uuid.nullable().optional(),
  sceneId: uuid.nullable().optional(),
});

const createOutlineDraftBody = z.object({
  // Absent or null would otherwise reach the service as an untyped blob and
  // be persisted as an empty draft; the service stores content verbatim.
  content: z.unknown().refine((v) => v !== undefined && v !== null),
  note: z.string().trim().max(2000).nullable().optional(),
});

const putHorizonBody = z.object({
  policy: z.unknown(),
});

/**
 * NF-WF-002D: the HIGH outline routes accept the caller's head expectation
 * (C12.1 tri-state). Both are body-less today, so the schema is parsed against
 * `request.body ?? {}` and an empty body stays compatible.
 */
const expectedHeadBody = z.object({
  expectedHeadRevisionId: uuid.nullable().optional(),
});

// Query-string params arrive as strings, so every numeric field is coerced.
const pageQuery = z.object({
  take: z.coerce.number().int().min(1).max(100_000).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
});

export interface PlanningRoutesOptions {
  auth: AuthService;
  services: PlanningServices;
}

export function registerPlanningRoutes(
  app: FastifyInstance,
  { auth, services }: PlanningRoutesOptions,
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

  // --- Synopses ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/planning/synopses", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createSynopsisBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createSynopsis({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/planning/synopses", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({
        // z.stringbool, not z.coerce.boolean: Boolean("false") is true.
        includeArchived: z.stringbool().optional(),
        ...pageQuery.shape,
      })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listSynopses({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      includeArchived: query.data.includeArchived ?? false,
      take: query.data.take ?? 100,
      skip: query.data.skip ?? 0,
    });
  });

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/synopses/:synopsisId/archive",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ synopsisId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.archiveSynopsis({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        synopsisId: params.data.synopsisId,
      });
      return reply.code(204).send();
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/synopses/:synopsisId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ synopsisId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteSynopsis({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        synopsisId: params.data.synopsisId,
      });
      return reply.code(204).send();
    },
  );

  // --- Sagas ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/planning/sagas", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createSagaBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createSaga({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
      parentId: body.data.parentId ?? null,
      intent: body.data.intent ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/planning/sagas", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = pageQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listSagas({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      take: query.data.take ?? 100,
      skip: query.data.skip ?? 0,
    });
  });

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/sagas/:sagaId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ sagaId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteSaga({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        sagaId: params.data.sagaId,
      });
      return reply.code(204).send();
    },
  );

  // --- Outline nodes ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/planning/outline-nodes", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createOutlineNodeBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createOutlineNode({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
      summary: body.data.summary ?? null,
      chapterId: body.data.chapterId ?? null,
      sceneId: body.data.sceneId ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/planning/outline-nodes", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({ sagaId: uuid.optional(), ...pageQuery.shape })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listOutlineNodes({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      sagaId: query.data.sagaId ?? null,
      take: query.data.take ?? 100,
      skip: query.data.skip ?? 0,
    });
  });

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/outline-nodes/:outlineNodeId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ outlineNodeId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteOutlineNode({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        outlineNodeId: params.data.outlineNodeId,
      });
      return reply.code(204).send();
    },
  );

  // --- Outline versions ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/planning/outline-versions", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createOutlineDraftBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createOutlineDraft({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      content: body.data.content,
      note: body.data.note ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/planning/outline-versions", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = pageQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listOutlineVersions({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      take: query.data.take ?? 100,
      skip: query.data.skip ?? 0,
    });
  });

  // Approve is a CAS against the DRAFT status inside a transaction; a
  // concurrent approval loses as a 409 CONFLICT, not a raw P2002.
  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/outline-versions/:versionId/approve",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ versionId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = expectedHeadBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.approveOutlineVersion({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        versionId: params.data.versionId,
        // Preserve the tri-state: omitted must stay `undefined`, `null` is a
        // real assertion ("no head exists yet").
        ...(body.data.expectedHeadRevisionId === undefined
          ? {}
          : { expectedHeadRevisionId: body.data.expectedHeadRevisionId }),
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/planning/outline-versions/supersede",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = expectedHeadBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.supersedeApprovedOutline({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        ...(body.data.expectedHeadRevisionId === undefined
          ? {}
          : { expectedHeadRevisionId: body.data.expectedHeadRevisionId }),
      });
      return reply.code(204).send();
    },
  );

  // --- Planning horizon ---

  app.get("/api/workspaces/:workspaceId/novels/:novelId/planning/horizon", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.getHorizon({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  app.put("/api/workspaces/:workspaceId/novels/:novelId/planning/horizon", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = putHorizonBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.putHorizon({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
    });
  });
}
