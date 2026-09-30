/**
 * Story intelligence routes (Phase 6 slice 2 write surface).
 *
 * Same contract as canon-routes and character-routes: workspace-scoped URLs,
 * session-cookie auth, Zod at every boundary, tenant resolution inside the
 * service from the STORED row (a cross-tenant id is a 404, not a 403 — no
 * existence leak).
 *
 * Enum bodies use the domain package's local mirrors (`z.enum(...)` over
 * THREAD_KINDS etc.), not the Prisma enums — the mirrors are pinned by a test,
 * so a schema/vocabulary drift fails there rather than silently widening what
 * this route accepts.
 *
 * No delete routes: causal_edges cascade from story_events, so an event
 * delete would silently take its causal claims with it. See services/story.ts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  CAUSAL_CONFIDENCES,
  PROMISE_STATUSES,
  THREAD_KINDS,
  THREAD_STATUSES,
} from "@novelforge/story-intelligence";
import type { StoryServices } from "./services/story.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const threadParams = z.object({ workspaceId: uuid, novelId: uuid, threadId: uuid });
const promiseParams = z.object({ workspaceId: uuid, novelId: uuid, promiseId: uuid });

// Chapter numbers are 0-based like every other chapter reference in the repo
// (canon's availableFromChapter, character windows). Omitted/null means "not
// reader-visible" (CLAUDE.md §10) — never defaulted to 0, which would make an
// unclassified row visible at chapter 0.
const chapter = z.number().int().min(0).max(100_000);
const nullableChapter = chapter.nullable().optional();

const createEventBody = z.object({
  description: z.string().trim().min(1).max(20_000),
  chapterId: uuid.nullable().optional(),
  availableFromChapter: nullableChapter,
});

const appendTimelineBody = z.object({
  description: z.string().trim().min(1).max(20_000),
  availableFromChapter: nullableChapter,
});

const createThreadBody = z.object({
  kind: z.enum(THREAD_KINDS),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20_000).nullable().optional(),
  // Debt input, 1..5 (StoryThread_importance_1_to_5). A score is derived,
  // never accepted.
  importance: z.number().int().min(1).max(5),
  introducedAtChapter: nullableChapter,
  payoffIntent: z.string().trim().max(20_000).nullable().optional(),
});

const setThreadStatusBody = z.object({
  status: z.enum(THREAD_STATUSES),
  resolvedAtChapter: nullableChapter,
});

const createPromiseBody = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20_000).nullable().optional(),
  importance: z.number().int().min(1).max(5),
  introducedAtChapter: nullableChapter,
  payoffIntent: z.string().trim().max(20_000).nullable().optional(),
});

const transitionPromiseBody = z.object({
  to: z.enum(PROMISE_STATUSES),
  payoffAtChapter: nullableChapter,
});

const createCausalEdgeBody = z.object({
  causeEventId: uuid,
  effectEventId: uuid,
  confidence: z.enum(CAUSAL_CONFIDENCES),
});

export interface StoryRoutesOptions {
  auth: AuthService;
  services: StoryServices;
}

export function registerStoryRoutes(
  app: FastifyInstance,
  { auth, services }: StoryRoutesOptions,
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

  // --- Story events ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story/events", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createEventBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createEvent({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      description: body.data.description,
      chapterId: body.data.chapterId ?? null,
      availableFromChapter: body.data.availableFromChapter ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/story/events", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listEvents({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  // --- Timeline ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story/timeline", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = appendTimelineBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.appendTimelineEvent({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      description: body.data.description,
      availableFromChapter: body.data.availableFromChapter ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/story/timeline", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listTimeline({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  // --- Threads ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story/threads", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createThreadBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createThread({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      kind: body.data.kind,
      title: body.data.title,
      description: body.data.description ?? null,
      importance: body.data.importance,
      introducedAtChapter: body.data.introducedAtChapter ?? null,
      payoffIntent: body.data.payoffIntent ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/story/threads", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listThreads({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/story/threads/:threadId/status",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = threadParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = setThreadStatusBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.setThreadStatus({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        threadId: params.data.threadId,
        status: body.data.status,
        resolvedAtChapter: body.data.resolvedAtChapter ?? null,
      });
    },
  );

  // --- Promises ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story/promises", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createPromiseBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createPromise({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      title: body.data.title,
      description: body.data.description ?? null,
      importance: body.data.importance,
      introducedAtChapter: body.data.introducedAtChapter ?? null,
      payoffIntent: body.data.payoffIntent ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/story/promises", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listPromises({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/story/promises/:promiseId/transition",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = promiseParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = transitionPromiseBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.transitionPromise({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        promiseId: params.data.promiseId,
        to: body.data.to,
        payoffAtChapter: body.data.payoffAtChapter ?? null,
      });
    },
  );

  // --- Causal edges ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story/causal-edges", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createCausalEdgeBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createCausalEdge({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      causeEventId: body.data.causeEventId,
      effectEventId: body.data.effectEventId,
      confidence: body.data.confidence,
    });
    return reply.code(201).send(created);
  });

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/story/causal-edges",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listCausalEdges({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
      });
    },
  );
}
