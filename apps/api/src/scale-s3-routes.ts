/**
 * SCALE S3 assistance routes (NF-WF-050C): per-novel enablement, untrusted
 * extraction proposals and transient missing-data advice.
 *
 * Same conventions as the 050B decision routes: session auth, Zod
 * validation, membership tenant gate (404 for non-members), uuid params,
 * route-local mapping for the typed ScaleS3Error (platform-routes owns the
 * single app-wide setErrorHandler). ConflictError/NotFoundError propagate
 * to the app-wide 409/404 handler; BadGatewayError propagates to the
 * app-wide 502 mapping.
 *
 * Reads/extraction/dismissal require `chapter:read` AND `canon:read`
 * (proposing is not approving). Setting changes require `canon:manage`
 * (deliberately stricter than novel:update). All enforced in the service.
 *
 * Gate order (extract/advice): 401 → 404 foreign → 403 capability →
 * 400 shape → 409 S3_DISABLED → 409 S3_NOT_CONFIGURED → 409 stale →
 * model call. Disabled or failed preconditions make ZERO model calls.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { NovelForgeDb } from "@novelforge/database";
import {
  createScaleS3Services,
  parseScaleReviewProtocol,
  type AuditService,
  type ScaleS3Services,
} from "@novelforge/ai-services";
import { ScaleS3Error } from "@novelforge/ai-services";
import type { AiServices } from "@novelforge/ai-services";
import { ConflictError } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";

const uuid = z.string().uuid();

const scaleS3NovelParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
});

const scaleS3ChapterParams = scaleS3NovelParams.extend({
  chapterId: uuid,
});

const scaleS3ProposalParams = scaleS3ChapterParams.extend({
  proposalId: uuid,
});

// Full-pin expectations, same shape as the 050A appendSet contract.
const expectationsSchema = z
  .object({
    chapterVersionId: uuid,
    expectedBranchId: uuid,
    expectedHeadRevisionId: uuid.nullable(),
    expectedSetId: uuid.nullable(),
    expectedPolicyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    preferredModelRef: uuid.optional(),
  })
  .strict();

const extractBody = expectationsSchema;
const adviceBody = expectationsSchema;

const dismissBody = z
  .object({ reason: z.string().trim().min(1).max(4000) })
  .strict();

const settingBody = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().min(1).max(4000),
  })
  .strict();

const listQuery = z.object({
  chapterVersionId: uuid,
  before: z.string().datetime().optional(),
  beforeId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function parseOr400<T>(
  schema: z.ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): { ok: true; value: T } | { ok: false } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    reply.code(400).send({ error: "INVALID_INPUT" });
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

async function requireSession(
  auth: AuthService,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? await auth.validateSession(token) : null;
  if (!session) {
    reply.code(401).send({ error: "UNAUTHORIZED" });
    return null;
  }
  return session.userId;
}

/** Route-local mapping for typed S3 refusals; everything else propagates. */
function mapScaleS3Error(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof ScaleS3Error) {
    reply.code(error.statusCode).send({ error: error.code });
    return true;
  }
  return false;
}

/** Log a refusal reason server-side (the 409 envelope carries no message). */
function logRefusal(req: FastifyRequest, error: unknown): void {
  if (error instanceof Error) req.log.warn({ reason: error.message }, "scale-s3 refusal");
}

export function registerScaleS3Routes(
  app: FastifyInstance,
  deps: {
    db: NovelForgeDb;
    auth: AuthService;
    audit: AuditService;
    ai: Pick<AiServices, "generate">;
  },
): void {
  const s3: ScaleS3Services = createScaleS3Services({
    db: deps.db,
    audit: deps.audit,
    ai: deps.ai,
  });
  const novelBase =
    "/api/workspaces/:workspaceId/novels/:novelId";
  const chapterBase = `${novelBase}/chapters/:chapterId`;

  // GET setting
  app.get(`${novelBase}/scale-s3-setting`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3NovelParams, req.params, reply);
    if (!params.ok) return;
    try {
      return reply.code(200).send(
        await s3.getSetting({
          actorUserId: userId,
          workspaceId: params.value.workspaceId,
          novelId: params.value.novelId,
        }),
      );
    } catch (error) {
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });

  // PUT setting
  app.put(`${novelBase}/scale-s3-setting`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3NovelParams, req.params, reply);
    if (!params.ok) return;
    const body = parseOr400(settingBody, req.body, reply);
    if (!body.ok) return;
    try {
      return reply.code(200).send(
        await s3.putSetting({
          actorUserId: userId,
          workspaceId: params.value.workspaceId,
          novelId: params.value.novelId,
          enabled: body.value.enabled,
          reason: body.value.reason,
        }),
      );
    } catch (error) {
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });

  // POST extract
  app.post(`${chapterBase}/scale-s3/extract`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3ChapterParams, req.params, reply);
    if (!params.ok) return;
    const body = parseOr400(extractBody, req.body, reply);
    if (!body.ok) return;
    try {
      const result = await s3.extract({
        actorUserId: userId,
        workspaceId: params.value.workspaceId,
        novelId: params.value.novelId,
        chapterId: params.value.chapterId,
        ...body.value,
      });
      return reply.code(201).send(result);
    } catch (error) {
      logRefusal(req, error);
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });

  // POST advice — transient; the SERVER derives the deterministic checklist
  // items from the latest receipt (never client-supplied). The service runs
  // its own gate order (401/404/403/400 → S3_DISABLED → S3_NOT_CONFIGURED →
  // stale) BEFORE the receipt check here, so the refusal codes follow the
  // frozen order.
  app.post(`${chapterBase}/scale-s3/advice`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3ChapterParams, req.params, reply);
    if (!params.ok) return;
    const body = parseOr400(adviceBody, req.body, reply);
    if (!body.ok) return;
    try {
      await s3.gateAdvice({
        actorUserId: userId,
        workspaceId: params.value.workspaceId,
        novelId: params.value.novelId,
        chapterId: params.value.chapterId,
        ...body.value,
      });
      const receipt = await deps.db.finalTextReview.findFirst({
        where: { chapterVersionId: body.value.chapterVersionId },
        orderBy: { createdAt: "desc" },
        select: { scaleReview: true },
      });
      const protocol = receipt ? parseScaleReviewProtocol(receipt.scaleReview) : null;
      if (!protocol || protocol.state !== "INCOMPLETE" || protocol.missingData.length === 0) {
        throw new ConflictError(
          "no incomplete SCALE assessment exists for this chapter version",
        );
      }
      const result = await s3.advise({
        actorUserId: userId,
        workspaceId: params.value.workspaceId,
        novelId: params.value.novelId,
        chapterId: params.value.chapterId,
        ...body.value,
        missingData: protocol.missingData,
      });
      return reply.code(200).send(result);
    } catch (error) {
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });

  // GET proposals (chapter-scoped pagination, stale-marked)
  app.get(`${chapterBase}/scale-s3`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3ChapterParams, req.params, reply);
    if (!params.ok) return;
    const query = parseOr400(listQuery, req.query, reply);
    if (!query.ok) return;
    try {
      return reply.code(200).send(
        await s3.list({
          actorUserId: userId,
          workspaceId: params.value.workspaceId,
          novelId: params.value.novelId,
          chapterId: params.value.chapterId,
          chapterVersionId: query.value.chapterVersionId,
          before: query.value.before,
          beforeId: query.value.beforeId,
          limit: query.value.limit,
        }),
      );
    } catch (error) {
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });

  // POST dismiss — the recorded author rejection (idempotent).
  app.post(`${chapterBase}/scale-s3/:proposalId/dismiss`, async (req, reply) => {
    const userId = await requireSession(deps.auth, req, reply);
    if (!userId) return;
    const params = parseOr400(scaleS3ProposalParams, req.params, reply);
    if (!params.ok) return;
    const body = parseOr400(dismissBody, req.body, reply);
    if (!body.ok) return;
    try {
      return reply.code(200).send(
        await s3.dismiss({
          actorUserId: userId,
          workspaceId: params.value.workspaceId,
          novelId: params.value.novelId,
          chapterId: params.value.chapterId,
          proposalId: params.value.proposalId,
          reason: body.value.reason,
        }),
      );
    } catch (error) {
      if (mapScaleS3Error(reply, error)) return;
      throw error;
    }
  });
}
