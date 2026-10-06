/**
 * Synced reading progress routes (NF-WF-019D).
 *
 * Server-side reading progress for authenticated users: one
 * latest-position row per (user, novel). Last-write-wins by the
 * client's clock — an older or equal `clientUpdatedAt` returns 200
 * with the STORED (newer) row, never regressing it; ties keep the
 * stored row (deterministic). The server never fabricates progress.
 *
 * Authenticated by construction (requireActor → 401 UNAUTHENTICATED),
 * the `/api/reader/*` family pattern from the 019 contract. Progress
 * is private to the owning user (Invariant 4): there is no endpoint
 * exposing another user's row.
 *
 * Engageable check (Invariant 2) is IN the SQL — the 014 precedent:
 * the novel must be publiclyListed (ACTIVE + ≥1 PUBLISHED
 * publication), else 404 {error:"NOT_FOUND"} (no oracle). Rows are
 * retained while a novel is unpublished and invisible until public
 * again.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { NovelForgeDb } from "@novelforge/database";
import { SESSION_COOKIE } from "./auth-routes.ts";

export interface ReaderProgressRouteOptions {
  auth: AuthService;
  db: NovelForgeDb;
}

const progressPutBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().min(1),
  scrollRatio: z.number().min(0).max(1).optional(),
  clientUpdatedAt: z.string().datetime({ offset: true }),
  deviceId: z.string().min(1).max(128).optional(),
});

const progressGetQuery = z.object({
  novelId: z.string().uuid(),
});

const progressDeleteParams = z.object({
  novelId: z.string().uuid(),
});

interface ProgressView {
  novelId: string;
  chapterNumber: number;
  scrollRatio: number | null;
  updatedAt: string;
}

function toProgressView(row: {
  novelId: string;
  chapterNumber: number;
  scrollRatio: number | null;
  updatedAt: Date;
}): ProgressView {
  return {
    novelId: row.novelId,
    chapterNumber: row.chapterNumber,
    scrollRatio: row.scrollRatio,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerReaderProgressRoutes(
  app: FastifyInstance,
  { auth, db }: ReaderProgressRouteOptions,
): void {
  /**
   * Resolve the caller to `{ userId }`, or reply 401.
   * (The ai-routes.ts requireActor pattern; the platform role is not
   * needed here — progress is identity-based, no new capabilities.)
   */
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ userId: string } | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return { userId: session.userId };
  };

  /**
   * Engageable check IN the SQL (Invariant 2, the 014 precedent):
   * ACTIVE novel with ≥1 PUBLISHED publication. Never a post-filter.
   */
  const findEngageableNovelId = async (novelId: string): Promise<string | null> => {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT n.id FROM novels n
      WHERE n.id = ${novelId}::uuid
        AND n.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM publications p
          WHERE p.novel_id = n.id AND p.status = 'PUBLISHED'
        )
    `;
    return rows[0]?.id ?? null;
  };

  /**
   * PUT /api/reader/progress — last-write-wins upsert.
   * 200 { progress } in all cases (stored row wins ties and older
   * writes — no regression, no 409).
   */
  app.put("/api/reader/progress", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = progressPutBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const clientDate = new Date(body.data.clientUpdatedAt);
    if (Number.isNaN(clientDate.getTime()))
      return reply.code(400).send({ error: "INVALID_INPUT" });

    const novelId = await findEngageableNovelId(body.data.novelId);
    if (!novelId) return reply.code(404).send({ error: "NOT_FOUND" });

    const progress = await db.$transaction(async (tx) => {
      const existing = await tx.readingProgress.findUnique({
        where: { userId_novelId: { userId: actor.userId, novelId } },
      });
      // Last-write-wins by client clock: older OR EQUAL timestamps
      // keep the stored row (deterministic tie handling).
      if (existing && existing.updatedAt.getTime() >= clientDate.getTime()) {
        return existing;
      }
      return tx.readingProgress.upsert({
        where: { userId_novelId: { userId: actor.userId, novelId } },
        update: {
          chapterNumber: body.data.chapterNumber,
          scrollRatio: body.data.scrollRatio ?? null,
          deviceId: body.data.deviceId ?? null,
          updatedAt: clientDate,
        },
        create: {
          userId: actor.userId,
          novelId,
          chapterNumber: body.data.chapterNumber,
          scrollRatio: body.data.scrollRatio ?? null,
          deviceId: body.data.deviceId ?? null,
          updatedAt: clientDate,
        },
      });
    });
    return reply.code(200).send({ progress: toProgressView(progress) });
  });

  /**
   * GET /api/reader/progress?novelId= — the caller's own row only
   * (Invariant 4). 200 { progress: {...} | null }.
   */
  app.get("/api/reader/progress", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const query = progressGetQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const row = await db.readingProgress.findUnique({
      where: {
        userId_novelId: { userId: actor.userId, novelId: query.data.novelId },
      },
    });
    return reply.code(200).send({ progress: row ? toProgressView(row) : null });
  });

  /**
   * DELETE /api/reader/progress/:novelId — clears the synced position.
   * Idempotent: deleting a non-existent row is still 204.
   */
  app.delete("/api/reader/progress/:novelId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = progressDeleteParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await db.readingProgress.deleteMany({
      where: { userId: actor.userId, novelId: params.data.novelId },
    });
    return reply.code(204).send();
  });
}
