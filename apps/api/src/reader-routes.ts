/**
 * Reader engagement routes (NF-WF-019A): bookmark / novel-follow /
 * author-follow / chapter-like, plus the per-user engagement state and
 * the caller's private lists.
 *
 * Auth boundary (Invariant 1): every route here requires a session —
 * the `requireActor` pattern (nf_session cookie → auth.validateSession
 * → 401 {error:"UNAUTHENTICATED"}). There is no anonymous path; the
 * anonymous surface is exclusively the frozen `/api/public/*` routes
 * (plus the ruled Q8 additive count fields, served there).
 *
 * Validation is Zod → 400 INVALID_INPUT; service errors map:
 * NotFoundError → 404 NOT_FOUND (no oracle), EngagementInputError →
 * 400 INVALID_INPUT. This module never registers a second global
 * error handler.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  EngagementInputError,
  type EngagementServices,
} from "./services/reader-engagement.ts";
import { NotFoundError } from "./services/platform.ts";

const uuid = z.string().uuid();
const chapterNumber = z.coerce.number().int().min(1);
const cursor = z.string().min(1).max(2000).optional();
const limit = z.coerce.number().int().min(1).max(100).optional();

const novelIdBody = z.object({ novelId: uuid });
const authorIdBody = z.object({ authorId: uuid });
const likeBody = z.object({ novelId: uuid, chapterNumber });
const engagementQuery = z.object({
  novelId: uuid,
  chapterNumber: chapterNumber.optional(),
});
const authorStateQuery = z.object({ authorId: uuid });
const listQuery = z.object({ cursor, limit });

export interface ReaderEngagementRoutesOptions {
  auth: AuthService;
  services: EngagementServices;
}

export function registerReaderEngagementRoutes(
  app: FastifyInstance,
  { auth, services }: ReaderEngagementRoutesOptions,
): void {
  /**
   * Resolve the caller to a userId, or reply 401. Reader engagement is
   * identity-based (no new capabilities per Invariant 8); the caller's
   * own rows are the only readable lists (Invariant 4).
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
   * Service error → HTTP mapping for this module's routes.
   */
  async function run(
    reply: FastifyReply,
    fn: () => Promise<unknown>,
    successCode = 200,
  ) {
    try {
      const result = await fn();
      return reply.code(successCode).send(result ?? null);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return reply.code(404).send({ error: "NOT_FOUND" });
      }
      if (error instanceof EngagementInputError) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      throw error;
    }
  }

  const invalidInput = (reply: FastifyReply) =>
    reply.code(400).send({ error: "INVALID_INPUT" });

  // --- Bookmarks ---

  app.post("/api/reader/bookmarks", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const body = novelIdBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return run(reply, async () => ({
      bookmark: await services.bookmarkNovel({ userId, ...body.data }),
    }));
  });

  app.delete("/api/reader/bookmarks/:novelId", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = novelIdBody.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    return run(
      reply,
      async () => {
        await services.unbookmarkNovel({ userId, ...params.data });
      },
      204,
    );
  });

  app.get("/api/reader/bookmarks", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = listQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.listBookmarks({
        userId,
        cursor: query.data.cursor,
        limit: query.data.limit ?? 20,
      }),
    );
  });

  // --- Novel follows ---

  app.post("/api/reader/follows", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const body = novelIdBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return run(reply, async () => ({
      follow: await services.followNovel({ userId, ...body.data }),
    }));
  });

  app.delete("/api/reader/follows/:novelId", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = novelIdBody.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    return run(
      reply,
      async () => {
        await services.unfollowNovel({ userId, ...params.data });
      },
      204,
    );
  });

  app.get("/api/reader/follows", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = listQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.listNovelFollows({
        userId,
        cursor: query.data.cursor,
        limit: query.data.limit ?? 20,
      }),
    );
  });

  // --- Author follows ---

  app.post("/api/reader/author-follows", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const body = authorIdBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return run(reply, async () => ({
      authorFollow: await services.followAuthor({ userId, ...body.data }),
    }));
  });

  app.delete("/api/reader/author-follows/:authorId", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = authorIdBody.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    return run(
      reply,
      async () => {
        await services.unfollowAuthor({ userId, ...params.data });
      },
      204,
    );
  });

  app.get("/api/reader/author-follows", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = listQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.listAuthorFollows({
        userId,
        cursor: query.data.cursor,
        limit: query.data.limit ?? 20,
      }),
    );
  });

  // --- Chapter likes ---

  app.post("/api/reader/likes", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const body = likeBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return run(reply, async () => ({
      like: await services.likeChapter({ userId, ...body.data }),
    }));
  });

  app.delete(
    "/api/reader/likes/:novelId/:chapterNumber",
    async (request, reply) => {
      const userId = await requireActor(request, reply);
      if (!userId) return;
      const params = likeBody.safeParse(request.params);
      if (!params.success) return invalidInput(reply);
      return run(
        reply,
        async () => {
          await services.unlikeChapter({ userId, ...params.data });
        },
        204,
      );
    },
  );

  // --- Per-user engagement state ---

  /**
   * GET /api/reader/engagement?novelId=&chapterNumber= — the caller's
   * per-user state plus aggregates for one page render. Requires a
   * session; anonymous callers use the Q8 public count fields instead.
   */
  app.get("/api/reader/engagement", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = engagementQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.engagement({ userId, ...query.data }),
    );
  });

  /**
   * GET /api/reader/engagement/author?authorId= — the caller's
   * author-follow state plus the aggregate follower count. No other
   * user's state ever leaves this endpoint (Invariant 4).
   */
  app.get("/api/reader/engagement/author", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = authorStateQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.authorFollowState({ userId, ...query.data }),
    );
  });
}
