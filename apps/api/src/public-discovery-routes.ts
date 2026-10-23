/**
 * Public discovery routes (NF-WF-014): the anonymous discovery surface —
 * novel listing, genre facets, and published-only search — plus the
 * single member genre-authoring route.
 *
 * Conventions mirror public-routes.ts for the anonymous routes: no auth
 * object, no requireActor hook, no 401 path. Anonymous is the only mode;
 * a session cookie (if present) is ignored and changes nothing.
 * The member genre route follows publication-routes.ts (session auth →
 * 401 UNAUTHENTICATED; membership tenant gate → 404 in the service;
 * Zod → 400 INVALID_INPUT; the app-wide error handler owns error
 * mapping — this module never registers a second one).
 *
 * Visibility is the 012 rule lifted to listing/search and enforced IN
 * THE SQL (service layer). No-oracle: empty listing → 200 (not 404);
 * searches that match nothing → 200 { results: [] } regardless of what
 * is invisible.
 *
 * Genre limit: max 5 per novel (Klein's 2026-10-06 amendment, up from 3).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { PublicDiscoveryServices } from "./services/public-discovery.ts";
import {
  DISCOVERY_SORTS,
  DISCOVERY_SEARCH_TYPES,
  type DiscoverySort,
  type DiscoverySearchType,
} from "./services/public-discovery.ts";
import {
  GENRE_KEYS,
  GENRE_TAXONOMY,
  MAX_GENRES_PER_NOVEL,
} from "./discovery/genres.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });

const novelsQuery = z.object({
  genre: z
    .string()
    .refine((g) => GENRE_KEYS.has(g), { message: "unknown genre key" })
    .optional(),
  sort: z.enum(DISCOVERY_SORTS as unknown as [DiscoverySort, ...DiscoverySort[]]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).optional(),
});

const searchQuery = z.object({
  // Empty (after trim) or >200 chars → 400 INVALID_INPUT (Invariant 1).
  q: z.string().trim().min(1).max(200),
  type: z
    .enum(DISCOVERY_SEARCH_TYPES as unknown as [DiscoverySearchType, ...DiscoverySearchType[]])
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const genreKey = z
  .string()
  .refine((g) => GENRE_KEYS.has(g), { message: "unknown genre key" });

const genresBody = z.object({
  // Dedupe first, then enforce the cap (contract Invariant 4).
  genres: z
    .array(z.string())
    .transform((arr) => [...new Set(arr)])
    .pipe(z.array(genreKey).max(MAX_GENRES_PER_NOVEL)),
});

const audienceBody = z.object({
  audience: z.enum(["teen", "mature", "adult"]).nullable(),
});

export interface PublicDiscoveryRoutesOptions {
  auth: AuthService;
  services: PublicDiscoveryServices;
}

export function registerPublicDiscoveryRoutes(
  app: FastifyInstance,
  { auth, services }: PublicDiscoveryRoutesOptions,
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

  // NOTE: no setErrorHandler here — platform-routes owns the single
  // app-wide handler (same convention as public-routes.ts).

  app.get("/api/public/novels/:novelId/cover", async (request, reply) => {
    const params = z.object({ novelId: uuid }).safeParse(request.params);
    const query = z.object({ v: z.string().regex(/^[a-f0-9]{64}$/).optional() }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const cover = await services.getPublicCover(params.data.novelId);
    if (!cover || (query.data.v && query.data.v !== cover.sha256)) return reply.code(404).send({ error: "NOT_FOUND" });
    const etag = `"${cover.sha256}"`;
    reply.header("Cache-Control", "no-cache").header("ETag", etag).header("X-Content-Type-Options", "nosniff");
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.type(cover.mimeType).send(Buffer.from(cover.dataBase64, "base64"));
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/reader-details", async (request, reply) => {
    const actorUserId = await requireActor(request, reply); if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.getReaderDetails({ actorUserId, ...params.data });
  });
  app.patch("/api/workspaces/:workspaceId/novels/:novelId/reader-details", async (request, reply) => {
    const actorUserId = await requireActor(request, reply); if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    const body = z.object({ publicSynopsis: z.string().max(6000), expectedPublicSynopsis: z.string().max(6000).nullable() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.setPublicSynopsis({ actorUserId, ...params.data, ...body.data });
  });

  /**
   * GET /api/public/novels — anonymous novel listing. ACTIVE novels
   * with ≥1 PUBLISHED publication only. Cursor pagination
   * (?limit=1-50 default 20, ?cursor=opaque), filters
   * ?genre=<taxonomy key>, ?sort=recent|title|chapters (default
   * recent). Empty shelf → 200 (never 404 — not an oracle).
   */
  app.get("/api/public/novels", async (request, reply) => {
    const query = novelsQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const result = await services.listPublicNovels({
        genre: query.data.genre,
        sort: query.data.sort ?? "recent",
        limit: query.data.limit ?? 20,
        cursor: query.data.cursor,
      });
      return reply.code(200).send(result);
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_CURSOR") {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      throw e;
    }
  });

  /**
   * PATCH /api/workspaces/:workspaceId/novels/:novelId/audience — the
   * author-set reader-facing content rating (`novel:update` capability;
   * null clears). Unknown novel/non-member → 404; without the
   * capability → 403; unknown value → 400.
   */
  app.patch(
    "/api/workspaces/:workspaceId/novels/:novelId/audience",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = audienceBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      try {
        const result = await services.setNovelAudience({
          actorUserId,
          workspaceId: params.data.workspaceId,
          novelId: params.data.novelId,
          audience: body.data.audience,
        });
        return reply.code(200).send(result);
      } catch (e) {
        if (e instanceof Error && e.message === "INVALID_AUDIENCE") {
          return reply.code(400).send({ error: "INVALID_INPUT" });
        }
        throw e;
      }
    },
  );

  /**
   * GET /api/public/genres — genre facets: every taxonomy key carried
   * by at least one publicly-visible novel, with counts, count desc.
   * (The full frozen taxonomy list lives in the web i18n `genre:`
   * section; this route carries discoverable facets only.)
   */
  app.get("/api/public/genres", async (_request, reply) => {
    const genres = await services.publicGenreFacets();
    return reply.code(200).send({ genres });
  });

  /**
   * GET /api/public/search — published-only search. Corpus = PUBLISHED
   * pins only (chapterVersionId, never currentVersionId). No results →
   * 200 { results: [] } regardless of what is invisible (no oracle).
   */
  app.get("/api/public/search", async (request, reply) => {
    const query = searchQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const results = await services.searchPublic({
      q: query.data.q,
      type: query.data.type ?? "all",
      limit: query.data.limit ?? 10,
    });
    return reply.code(200).send({ results });
  });

  /**
   * PATCH /api/workspaces/:workspaceId/novels/:novelId/genres — the
   * only member route of this task. Author-set taxonomy (max 5,
   * known keys, deduped); `novel:update` capability. Unknown keys →
   * 400; without the capability → 403; unknown novel/non-member → 404.
   */
  app.patch(
    "/api/workspaces/:workspaceId/novels/:novelId/genres",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = genresBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      try {
        const result = await services.setNovelGenres({
          actorUserId,
          workspaceId: params.data.workspaceId,
          novelId: params.data.novelId,
          genres: body.data.genres,
        });
        return reply.code(200).send(result);
      } catch (e) {
        if (e instanceof Error && e.message === "INVALID_GENRES") {
          return reply.code(400).send({ error: "INVALID_INPUT" });
        }
        throw e;
      }
    },
  );
}

/** The frozen taxonomy list for tests/docs (server returns keys only). */
export { GENRE_TAXONOMY };
