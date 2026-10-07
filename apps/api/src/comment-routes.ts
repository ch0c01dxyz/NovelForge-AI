/**
 * Reader comment routes (NF-WF-019B): `/api/reader/comments*`.
 *
 * Auth boundary (contract Invariant 1): every WRITE requires a valid
 * session (the `ai-routes.ts` `requireActor` pattern → 401
 * `{error:"UNAUTHENTICATED"}`); the comment LIST is anonymous-readable
 * (no session required). `/api/public/*` is untouched.
 *
 * Rate limits (Q1): the comment burst limit (1 / 10s / user) is the
 * per-route @fastify/rate-limit override (the auth register/login
 * precedent). It is keyed on the session cookie (falling back to IP
 * for anonymous requests) so one user's burst does not consume another
 * user's budget — the plugin's in-memory store is shared per app
 * instance. The DAILY limits (100 comments / 20 reports per 24h per
 * user) are enforced in the service via DB counts (deterministic
 * per-user accounting) as typed `RateLimitError` (429).
 *
 * Error mapping lives in platform-routes' ONE setErrorHandler (shared
 * with the rest of the platform): NotFoundError → 404, ForbiddenError
 * → 403, RateLimitError → 429. INVALID_BODY / INVALID_PARENT are
 * mapped to 400 `{error:"INVALID_INPUT"}` at the route layer.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { AuthService } from "@novelforge/auth";
import {
  createCommentServices,
  REPORT_REASONS,
  COMMENT_STATUSES,
  type CommentStatus,
  type ReportReason,
} from "./services/comments.ts";
import type { AuditService } from "@novelforge/ai-services";
import type { NovelForgeDb } from "@novelforge/database";

const uuid = z.string().uuid();

const postCommentBody = z.object({
  novelId: uuid,
  chapterNumber: z.number().int().min(1),
  body: z.string(),
  parentId: uuid.optional().nullable(),
});

const listCommentsQuery = z.object({
  novelId: uuid,
  chapterNumber: z.coerce.number().int().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const editCommentBody = z.object({
  body: z.string(),
});

const reportBody = z.object({
  reason: z.enum(REPORT_REASONS),
});

const commentIdParams = z.object({ commentId: uuid });
const novelIdParams = z.object({ novelId: uuid });
const reportsQuery = z.object({
  status: z.enum(COMMENT_STATUSES).optional(),
});

export interface CommentRoutesOptions {
  auth: AuthService;
  db: NovelForgeDb;
  audit: AuditService;
}

export function registerCommentRoutes(
  app: FastifyInstance,
  { auth, db, audit }: CommentRoutesOptions,
): void {
  const services = createCommentServices({ db, audit });

  /**
   * Resolve the caller to a userId, or reply 401. Same session-cookie
   * pattern as the other platform route families.
   */
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
   * Best-effort actor resolution for the anonymous-readable list:
   * a present session identifies the viewer (for own-HIDDEN
   * visibility and staff visibility); its absence is fine.
   */
  const optionalActor = async (
    request: FastifyRequest,
  ): Promise<string | null> => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return null;
    try {
      const session = await auth.validateSession(token);
      return session?.userId ?? null;
    } catch {
      return null;
    }
  };

  const invalidInput = (reply: FastifyReply) =>
    reply.code(400).send({ error: "INVALID_INPUT" });

  // --- Comments ---

  app.post(
    "/api/reader/comments",
    {
      config: {
        // Q1 burst limit: 1 comment / 10s / user (the auth
        // register/login per-route precedent). Keyed on the session
        // cookie so users do not share a budget; anonymous requests
        // (which 401 below) fall back to IP.
        rateLimit: {
          max: 1,
          timeWindow: "10 seconds",
          keyGenerator: (request: FastifyRequest) =>
            request.cookies[SESSION_COOKIE] ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const userId = await requireActor(request, reply);
      if (!userId) return;
      const body = postCommentBody.safeParse(request.body);
      if (!body.success) return invalidInput(reply);
      try {
        const result = await services.postComment({
          userId,
          novelId: body.data.novelId,
          chapterNumber: body.data.chapterNumber,
          body: body.data.body,
          parentId: body.data.parentId ?? null,
        });
        return reply.code(201).send(result);
      } catch (e) {
        if (e instanceof Error && (e.message === "INVALID_BODY" || e.message === "INVALID_PARENT")) {
          return invalidInput(reply);
        }
        throw e;
      }
    },
  );

  app.get("/api/reader/comments", async (request, reply) => {
    const query = listCommentsQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    const viewerUserId = await optionalActor(request);
    const result = await services.listComments({
      novelId: query.data.novelId,
      chapterNumber: query.data.chapterNumber,
      cursor: query.data.cursor,
      limit: query.data.limit,
      viewerUserId,
    });
    return reply.code(200).send(result);
  });

  app.patch("/api/reader/comments/:commentId", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = commentIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    const body = editCommentBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    try {
      const result = await services.editComment({
        userId,
        commentId: params.data.commentId,
        body: body.data.body,
      });
      return reply.code(200).send(result);
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_BODY") {
        return invalidInput(reply);
      }
      // Ownership/edit-window refusal (the service throws a sentinel —
      // not a capability, so authorization.ts stays untouched).
      if (e instanceof Error && e.message === "FORBIDDEN_EDIT") {
        return reply.code(403).send({ error: "FORBIDDEN" });
      }
      throw e;
    }
  });

  app.delete("/api/reader/comments/:commentId", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = commentIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    await services.deleteComment({ userId, commentId: params.data.commentId });
    return reply.code(204).send();
  });

  // --- Reports ---

  app.post("/api/reader/comments/:commentId/reports", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = commentIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    const body = reportBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    const result = await services.reportComment({
      userId,
      commentId: params.data.commentId,
      reason: body.data.reason as ReportReason,
    });
    // Dedup: a repeat report by the same reporter returns 200 with
    // the same row (never 409, never a duplicate row).
    return reply.code(result.deduped ? 200 : 201).send({ report: result.report });
  });

  // --- Staff moderation (workspace members holding `novel:update`,
  // resolved server-side; Klein's Q2 decision — no platform team) ---

  app.get(
    "/api/reader/novels/:novelId/moderation/reports",
    async (request, reply) => {
      const userId = await requireActor(request, reply);
      if (!userId) return;
      const params = novelIdParams.safeParse(request.params);
      if (!params.success) return invalidInput(reply);
      const query = reportsQuery.safeParse(request.query);
      if (!query.success) return invalidInput(reply);
      const result = await services.listReports({
        userId,
        novelId: params.data.novelId,
        status: query.data.status as CommentStatus | undefined,
      });
      return reply.code(200).send(result);
    },
  );

  app.post("/api/reader/comments/:commentId/hide", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = commentIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    const result = await services.hideComment({
      userId,
      commentId: params.data.commentId,
    });
    return reply.code(200).send(result);
  });

  app.post("/api/reader/comments/:commentId/unhide", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = commentIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    const result = await services.unhideComment({
      userId,
      commentId: params.data.commentId,
    });
    return reply.code(200).send(result);
  });
}
