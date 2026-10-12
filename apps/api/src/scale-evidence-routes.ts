/**
 * SCALE evidence routes (NF-WF-050A, S1): version-bound author assessments
 * of operative conflicts in one saved chapter version.
 *
 * Same conventions as manuscript routes: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service
 * errors mapped once in the app-wide error handler.
 *
 * Reads require `chapter:read`. Writes require BOTH `chapter:update` and
 * `canon:manage` (enforced here and in the service layer).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import {
  createScaleEvidenceServices,
  ScaleEvidenceValidationError,
  type ScaleEvidenceServices,
} from "@novelforge/ai-services";
import { NotFoundError } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";

const uuid = z.string().uuid();
const scaleEvidenceParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  chapterId: uuid,
});

const historyQuery = z.object({
  chapterVersionId: uuid,
  beforeSequence: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Strict POST body: all fields required; expectedHeadRevisionId and
// expectedSetId are REQUIRED nullable UUIDs (not optional). Client cannot
// set actor, sequence, timestamp or branch.
const appendSetBody = z
  .object({
    chapterVersionId: uuid,
    expectedBranchId: uuid,
    expectedHeadRevisionId: uuid.nullable(),
    expectedSetId: uuid.nullable(),
    declaration: z.enum(["CONFLICTS", "NO_OPERATIVE_CONFLICT"]),
    explanation: z.string(),
    conflicts: z.array(z.unknown()),
    // 050C amendment 1: optional S3 proposal provenance. Bare UUID — the
    // service validates existence/pins under the append locks.
    sourceProposalId: uuid.optional(),
  })
  .strict();

// 4,000,000-byte route body limit so valid bounded claim arrays, Unicode
// and JSON escaping fit; field/count limits are enforced independently.
const APPEND_BODY_LIMIT = 4_000_000;

export interface ScaleEvidenceRoutesOptions {
  auth: AuthService;
  db: NovelForgeDb;
}

export function registerScaleEvidenceRoutes(
  app: FastifyInstance,
  { auth, db }: ScaleEvidenceRoutesOptions,
): void {
  const services: ScaleEvidenceServices = createScaleEvidenceServices({ db });

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

  /**
   * Capability gate. Membership/novel absence is a 404 (tenant-safe);
   * authenticated members lacking a capability get 403 via ForbiddenError.
   */
  const requireCapabilities = async (
    workspaceId: string,
    novelId: string,
    actorUserId: string,
    caps: Capability[],
  ): Promise<void> => {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    for (const cap of caps) {
      requireCapability(membership.role, cap);
    }
  };

  // NOTE: no setErrorHandler here — platform-routes owns the single
  // app-wide handler mapping Forbidden/NotFound/ConflictError. A second
  // registration would silently replace it (Fastify last-wins).

  const base =
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-evidence";

  app.get(base, async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = scaleEvidenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await requireCapabilities(params.data.workspaceId, params.data.novelId, actorUserId, [
      "chapter:read",
    ]);
    try {
      return await services.readCurrent({ actorUserId, ...params.data });
    } catch (error) {
      // Corrupt retained rows fail explicitly with 400 (not 500).
      if (error instanceof ScaleEvidenceValidationError) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: error.message });
      }
      throw error;
    }
  });

  app.get(`${base}/history`, async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = scaleEvidenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = historyQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await requireCapabilities(params.data.workspaceId, params.data.novelId, actorUserId, [
      "chapter:read",
    ]);
    try {
      return await services.listHistory({
        actorUserId,
        ...params.data,
        chapterVersionId: query.data.chapterVersionId,
        beforeSequence: query.data.beforeSequence,
        limit: query.data.limit,
      });
    } catch (error) {
      // Corrupt retained rows fail explicitly with 400 (not 500).
      if (error instanceof ScaleEvidenceValidationError) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: error.message });
      }
      throw error;
    }
  });

  app.post(base, { bodyLimit: APPEND_BODY_LIMIT }, async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = scaleEvidenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = appendSetBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await requireCapabilities(params.data.workspaceId, params.data.novelId, actorUserId, [
      "chapter:update",
      "canon:manage",
    ]);
    try {
      const set = await services.appendSet({
        actorUserId,
        ...params.data,
        chapterVersionId: body.data.chapterVersionId,
        expectedBranchId: body.data.expectedBranchId,
        expectedHeadRevisionId: body.data.expectedHeadRevisionId,
        expectedSetId: body.data.expectedSetId,
        declaration: body.data.declaration,
        explanation: body.data.explanation,
        conflicts: body.data.conflicts,
        sourceProposalId: body.data.sourceProposalId,
      });
      return reply.code(201).send(set);
    } catch (error) {
      // Claim/schema validation failures map to 400 (contract: "Invalid
      // schema/quote returns existing 400 validation mapping"). Stale
      // expectations (ConflictError) propagate to the app-wide 409 handler.
      if (error instanceof ScaleEvidenceValidationError) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: error.message });
      }
      throw error;
    }
  });
}
