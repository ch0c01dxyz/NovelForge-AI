/**
 * Public reader routes (NF-WF-013): the anonymous public surface for
 * published content — the reader-facing half of milestone M4.
 *
 * Conventions mirror publication-routes.ts MINUS auth: no auth object,
 * no requireActor hook, no 401 path. Anonymous is the only mode; a
 * session cookie (if present) is ignored and changes nothing
 * (no-oracle Invariant 5). Validation is Zod → 400 INVALID_INPUT; the
 * app-wide error handler in platform-routes.ts owns error mapping — this
 * module never registers a second one.
 *
 * Response shapes are the frozen NF-WF-012 contract
 * (tasks/NF-WF-012-publication-release-contract.md §"Contract with
 * NF-WF-013") plus the three GAP-049-recorded additive extensions
 * (author byline on the novel shape, prev/next chapter navigation,
 * the author route). All 012-pinned fields are present and unchanged.
 *
 * Visibility is 012's isPubliclyVisible alone (ACTIVE novel + PUBLISHED
 * publication). Every invisible case → the identical
 * 404 {error: "NOT_FOUND"} — no auth-state branching, no existence
 * oracle (Invariant 5).
 *
 * Out of scope (NF-WF-014): public listing/search/discovery. No
 * /api/public/search here; the reader has no search box.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PublicationServices } from "./services/publication.ts";

const slug = z.string().min(1).max(200);
const uuid = z.string().uuid();

const novelParams = z.object({ slug });
const chapterParams = z.object({
  slug,
  // Chapter number: positive int. Zod coercion is off, so parse the
  // raw path segment explicitly.
  number: z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .refine((n) => n >= 1, { message: "number must be a positive int" }),
});
const authorParams = z.object({ authorId: uuid });

export interface PublicReaderRoutesOptions {
  services: PublicationServices;
}

export function registerPublicReaderRoutes(
  app: FastifyInstance,
  { services }: PublicReaderRoutesOptions,
): void {
  const notFound = () => ({ error: "NOT_FOUND" });

  /**
   * GET /api/public/novels/:slug — public novel page data.
   * 200 {novel: {id, title, slug, author: {id, displayName}},
   *      chapters: [{number, title, publishedAt}]}.
   * PUBLISHED chapters only, ordered by number ascending (Invariant 4).
   */
  app.get("/api/public/novels/:slug", async (request, reply) => {
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const novel = await services.resolvePublicNovelBySlug({
      novelSlug: params.data.slug,
    });
    if (!novel) return reply.code(404).send(notFound());
    const chapters = await services.listPublishedChapters({ novelId: novel.id });
    return reply.code(200).send({ novel, chapters });
  });

  /**
   * GET /api/public/novels/:slug/chapters/:number — public chapter page.
   * Novel-first resolution (Invariant 2): the novel is resolved FIRST by
   * slug (earliest-created ACTIVE wins — exactly the novel route's
   * resolution), then the chapter is looked up within THAT novel only.
   * Content comes from the PINNED chapterVersionId, never
   * currentVersionId (012 Invariant 4).
   * prev/next are computed over PUBLISHED chapters only.
   */
  app.get("/api/public/novels/:slug/chapters/:number", async (request, reply) => {
    const params = chapterParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const resolved = await services.resolvePublicChapterNovelFirst({
      novelSlug: params.data.slug,
      chapterNumber: params.data.number,
    });
    if (!resolved) return reply.code(404).send(notFound());
    return reply.code(200).send({
      chapter: resolved.chapter,
      prevChapter: resolved.prevChapter,
      nextChapter: resolved.nextChapter,
    });
  });

  /**
   * GET /api/public/authors/:authorId — public author page.
   * 200 {author: {id, displayName},
   *      novels: [{id, title, slug, publishedChapterCount}]}.
   * novels: ACTIVE novels with ≥1 PUBLISHED publication, earliest
   * publishedAt first (the implementer-chosen order, pinned here).
   * Never email, never workspace/member/draft data (Invariant 4).
   */
  app.get("/api/public/authors/:authorId", async (request, reply) => {
    const params = authorParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const resolved = await services.resolvePublicAuthor({
      authorId: params.data.authorId,
    });
    if (!resolved) return reply.code(404).send(notFound());
    return reply.code(200).send(resolved);
  });
}
