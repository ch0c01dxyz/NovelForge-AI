/**
 * NF-WF-010 state-consumer routes: story health and final-text review.
 *
 * - `GET  /api/workspaces/:workspaceId/novels/:novelId/story-health`
 *   → evidence-backed health findings (canon:read). Query `chapter?: int`
 *   (story-time pin), `revisionId?: uuid` (revision-time pin; the
 *   temporal-negative rule excludes rows born after R). Body
 *   `{simulation: true}` is not applicable to GET — the service-level
 *   `simulation` flag is refused with 400 SIMULATION_SOURCE_REFUSED.
 * - `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/final-text-review`
 *   → synchronous review of an immutable chapter version (canon:read).
 *   Body `{ chapterVersionId: uuid }` — the version MUST belong to
 *   `chapterId`, else 400 INVALID_INPUT. 200 carries the ReviewVerdict
 *   plus the stored receipt id. REVIEW_STALE is not emitted here under
 *   the synchronous default (it is the setStatus gate's code).
 * - `GET  /api/workspaces/:workspaceId/novels/:novelId/story-health/unresolved`
 *   → the UNRESOLVED_IDENTITY register (canon:read).
 *
 * Error mapping lives in platform-routes' ONE setErrorHandler
 * (PolicyError → 409 {error: CODE}, checked before ConflictError).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { StoryHealthServices } from "./services/story-health.ts";
import type { FinalTextReviewServices } from "./services/final-text-review.ts";

const SESSION_COOKIE = "nf_session";

export interface StoryHealthRoutesOptions {
  auth: AuthService;
  health: StoryHealthServices;
  review: FinalTextReviewServices;
}

const novelParams = z.object({
  workspaceId: z.string().uuid(),
  novelId: z.string().uuid(),
});

const chapterParams = z.object({
  workspaceId: z.string().uuid(),
  novelId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

const healthQuery = z.object({
  chapter: z.coerce.number().int().positive().optional(),
  revisionId: z.string().uuid().optional(),
  simulation: z.coerce.boolean().optional(),
});

const reviewBody = z.object({
  chapterVersionId: z.string().uuid(),
  simulation: z.boolean().optional(),
});

export function registerStoryHealthRoutes(
  app: FastifyInstance,
  { auth, health, review }: StoryHealthRoutesOptions,
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

  app.get("/api/workspaces/:workspaceId/novels/:novelId/story-health", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = healthQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = await health.evaluateHealth({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...(query.data.chapter !== undefined ? { chapter: query.data.chapter } : {}),
      ...(query.data.revisionId !== undefined ? { asOfRevisionId: query.data.revisionId } : {}),
      ...(query.data.simulation !== undefined ? { simulation: query.data.simulation } : {}),
    });
    return reply.code(200).send(result);
  });

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/story-health/unresolved",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const unresolved = await health.unresolvedIdentities({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
      });
      return reply.code(200).send({ unresolved });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/final-text-review",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = chapterParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = reviewBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const verdict = await review.reviewFinalText({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        chapterId: params.data.chapterId,
        chapterVersionId: body.data.chapterVersionId,
        ...(body.data.simulation !== undefined ? { simulation: body.data.simulation } : {}),
      });
      return reply.code(200).send(verdict);
    },
  );
}
