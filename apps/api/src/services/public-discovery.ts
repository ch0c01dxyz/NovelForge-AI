/**
 * Public discovery services (NF-WF-014): anonymous novel listing, genre
 * facets, and published-only search — the discovery half of M4.
 *
 * Conventions: anonymous by construction (no auth object — callers are
 * the anonymous public routes; the member genre route passes an
 * already-authorized actor). Visibility is 012's rule lifted to
 * listing/search and enforced IN THE SQL (the retrieval service's
 * Invariant 3 precedent: "Tenant and spoiler boundaries are enforced in
 * the QUERY, not after it"). The search corpus is PUBLISHED pins only
 * via chapterVersionId, never currentVersionId; the GIN indexes are
 * functional (auto-maintained, no driftable index table).
 *
 * Raw SQL uses $queryRawUnsafe with positional parameters: ORDER BY
 * clauses and keyset conditions are dynamic fragments that cannot be
 * bound as parameters. All user input reaches the query as bound
 * parameters or as allow-listed fragments (sort keys are an enum).
 *
 * Genre limit: max 5 per novel (Klein's 2026-10-06 amendment, up from 3).
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import {
  areKnownGenreKeys,
  MAX_GENRES_PER_NOVEL,
} from "../discovery/genres.ts";

export type DiscoverySort = "recent" | "title" | "chapters";
export type DiscoverySearchType = "novel" | "chapter" | "all";

export const DISCOVERY_SORTS: readonly DiscoverySort[] = [
  "recent",
  "title",
  "chapters",
] as const;

export const DISCOVERY_SEARCH_TYPES: readonly DiscoverySearchType[] = [
  "novel",
  "chapter",
  "all",
] as const;

export interface DiscoveryNovel {
  id: string;
  title: string;
  slug: string;
  author: { id: string; displayName: string };
  genres: string[];
  /** Reader-facing content rating; null = author has not set one. */
  audience: string | null;
  publishedChapterCount: number;
  firstPublishedAt: string;
  lastPublishedAt: string;
}

export interface DiscoveryPage {
  cursor: string | null;
  hasMore: boolean;
}

export interface GenreFacet {
  key: string;
  count: number;
}

export interface DiscoverySearchHit {
  type: "novel" | "chapter";
  novel: {
    id: string;
    title: string;
    slug: string;
    author: { id: string; displayName: string };
  };
  chapter: { number: number; title: string } | null;
  snippet: string | null;
  rank: number;
}

/** Opaque cursor: base64url(JSON) of the keyset position. */
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface CursorPosition {
  sort: DiscoverySort;
  key: string | number;
  id: string;
}

function parseCursor(
  cursor: string,
  sort: DiscoverySort,
): CursorPosition | null {
  const raw = decodeCursor(cursor);
  if (!raw) return null;
  const { key, id } = raw;
  if (typeof id !== "string" || id.length === 0) return null;
  if (sort === "chapters") {
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0)
      return null;
  } else if (typeof key !== "string" || key.length === 0) {
    return null;
  }
  return { sort, key: key as string | number, id };
}

/**
 * Escape HTML, then restore the API's own <mark> tags (the only markup
 * the UI may render as HTML from a trusted server source).
 */
export function escapeSnippet(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

/** The 012 visibility rule, lifted to listing/search, in SQL. */
const PUBLISHED_NOVEL_WHERE = `n.status = 'ACTIVE' AND EXISTS (
  SELECT 1 FROM publications p2
  WHERE p2.novel_id = n.id AND p2.status = 'PUBLISHED'
)`;

interface ListedRow {
  id: string;
  title: string;
  slug: string;
  genres: string[];
  audience: string | null;
  authorId: string;
  authorName: string;
  publishedChapterCount: number;
  firstPublishedAt: Date;
  lastPublishedAt: Date;
}

interface NovelHitRow {
  novelId: string;
  novelTitle: string;
  novelSlug: string;
  authorId: string;
  authorName: string;
  rank: number;
  sortAt: Date;
}

interface ChapterHitRow {
  novelId: string;
  novelTitle: string;
  novelSlug: string;
  authorId: string;
  authorName: string;
  chapterNumber: number;
  chapterTitle: string;
  snippet: string | null;
  rank: number;
  sortAt: Date;
}

export function createPublicDiscoveryServices({ db }: { db: NovelForgeDb }) {
  /** Membership gate — 404 for non-members (ADR-0004), then capability. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
    return novel;
  }

  function orderByFor(sort: DiscoverySort): string {
    // sort is an allow-listed enum — safe as a raw fragment.
    switch (sort) {
      case "title":
        return `"l"."title" ASC, "l"."id" ASC`;
      case "chapters":
        return `"l"."publishedChapterCount" DESC, "l"."id" ASC`;
      case "recent":
      default:
        return `"l"."lastPublishedAt" DESC, "l"."id" ASC`;
    }
  }

  return {
    /**
     * Anonymous novel listing: ACTIVE novels with ≥1 PUBLISHED
     * publication only. Keyset (cursor) pagination — stable under
     * concurrent publishing (no duplicates/skips between pages).
     */
    async listPublicNovels({
      genre,
      sort = "recent",
      limit = 20,
      cursor,
    }: {
      genre?: string;
      sort?: DiscoverySort;
      limit?: number;
      cursor?: string;
    }): Promise<{ novels: DiscoveryNovel[]; page: DiscoveryPage }> {
      let cursorPos: CursorPosition | null = null;
      if (cursor !== undefined) {
        cursorPos = parseCursor(cursor, sort);
        if (!cursorPos) throw new Error("INVALID_CURSOR");
      }

      const values: unknown[] = [];
      const conditions: string[] = [];
      if (genre !== undefined) {
        values.push(genre);
        conditions.push(`($${values.length} = ANY("l"."genres"))`);
      }
      if (cursorPos) {
        const keyIdx = values.length + 1;
        const idIdx = values.length + 2;
        if (cursorPos.sort === "title") {
          values.push(cursorPos.key, cursorPos.id);
          conditions.push(
            `("l"."title" > $${keyIdx} OR ("l"."title" = $${keyIdx} AND "l"."id" > $${idIdx}))`,
          );
        } else if (cursorPos.sort === "chapters") {
          values.push(cursorPos.key, cursorPos.id);
          conditions.push(
            `("l"."publishedChapterCount" < $${keyIdx} OR ("l"."publishedChapterCount" = $${keyIdx} AND "l"."id" > $${idIdx}))`,
          );
        } else {
          values.push(new Date(cursorPos.key as string), cursorPos.id);
          conditions.push(
            `("l"."lastPublishedAt" < $${keyIdx} OR ("l"."lastPublishedAt" = $${keyIdx} AND "l"."id" > $${idIdx}))`,
          );
        }
      }
      values.push(limit + 1);
      const limitIdx = values.length;

      const sql = `
        WITH l AS (
          SELECT n.id, n.title, n.slug, n.genres, n.audience,
                 u.id AS "authorId", u.display_name AS "authorName",
                 COUNT(p.id) FILTER (WHERE p.status = 'PUBLISHED')::int AS "publishedChapterCount",
                 MIN(p.published_at) FILTER (WHERE p.status = 'PUBLISHED') AS "firstPublishedAt",
                 MAX(p.published_at) FILTER (WHERE p.status = 'PUBLISHED') AS "lastPublishedAt"
          FROM novels n
          JOIN users u ON u.id = n.created_by_id
          LEFT JOIN publications p ON p.novel_id = n.id
          WHERE ${PUBLISHED_NOVEL_WHERE}
          GROUP BY n.id, u.id
        )
        SELECT * FROM l
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY ${orderByFor(sort)}
        LIMIT $${limitIdx}
      `;
      const rows = await db.$queryRawUnsafe<ListedRow[]>(sql, ...values);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      let nextCursor: string | null = null;
      if (hasMore && last) {
        const key =
          sort === "title"
            ? last.title
            : sort === "chapters"
              ? last.publishedChapterCount
              : last.lastPublishedAt.toISOString();
        nextCursor = encodeCursor({ key, id: last.id });
      }
      return {
        novels: page.map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          author: { id: r.authorId, displayName: r.authorName },
          genres: r.genres ?? [],
          audience: r.audience ?? null,
          publishedChapterCount: r.publishedChapterCount,
          firstPublishedAt: r.firstPublishedAt.toISOString(),
          lastPublishedAt: r.lastPublishedAt.toISOString(),
        })),
        page: { cursor: nextCursor, hasMore },
      };
    },

    /**
     * Genre facets: every taxonomy key carried by at least one
     * publicly-visible novel, with its count, ordered by count desc.
     * Keys with zero public novels are omitted (minimal response).
     */
    async publicGenreFacets(): Promise<GenreFacet[]> {
      const rows = await db.$queryRawUnsafe<
        Array<{ key: string; count: number }>
      >(
        `SELECT g.key AS key, COUNT(*)::int AS count
         FROM novels n, unnest(n.genres) AS g(key)
         WHERE ${PUBLISHED_NOVEL_WHERE}
         GROUP BY g.key
         ORDER BY count DESC, g.key ASC`,
      );
      return rows.map((r) => ({ key: r.key, count: r.count }));
    },

    /**
     * Published-only search. The corpus is PUBLISHED pins only
     * (chapterVersionId, never currentVersionId); novel title/author
     * matches join novels through the same visibility predicate. A
     * draft title, an unpublished chapter's phrase, or a SCHEDULED
     * chapter's content returns the identical empty result as
     * gibberish — same query path, no early branches on novel
     * existence.
     */
    async searchPublic({
      q,
      type = "all",
      limit = 10,
    }: {
      q: string;
      type?: DiscoverySearchType;
      limit?: number;
    }): Promise<DiscoverySearchHit[]> {
      const tsq = `plainto_tsquery('english', $1)`;
      const hits: Array<DiscoverySearchHit & { sortAt: number }> = [];

      if (type === "novel" || type === "all") {
        const rows = await db.$queryRawUnsafe<NovelHitRow[]>(
          `SELECT n.id AS "novelId", n.title AS "novelTitle", n.slug AS "novelSlug",
                  u.id AS "authorId", u.display_name AS "authorName",
                  GREATEST(
                    ts_rank(to_tsvector('english', n.title), ${tsq}),
                    ts_rank(to_tsvector('english', u.display_name), ${tsq})
                  ) AS rank,
                  (SELECT MAX(p2.published_at) FROM publications p2
                   WHERE p2.novel_id = n.id AND p2.status = 'PUBLISHED') AS "sortAt"
           FROM novels n
           JOIN users u ON u.id = n.created_by_id
           WHERE ${PUBLISHED_NOVEL_WHERE}
             AND (to_tsvector('english', n.title) @@ ${tsq}
                  OR to_tsvector('english', u.display_name) @@ ${tsq})
           ORDER BY rank DESC, "sortAt" DESC
           LIMIT $2`,
          q,
          limit,
        );
        for (const r of rows) {
          hits.push({
            type: "novel",
            novel: {
              id: r.novelId,
              title: r.novelTitle,
              slug: r.novelSlug,
              author: { id: r.authorId, displayName: r.authorName },
            },
            chapter: null,
            snippet: null,
            rank: Number(r.rank),
            sortAt: new Date(r.sortAt).getTime(),
          });
        }
      }

      if (type === "chapter" || type === "all") {
        const rows = await db.$queryRawUnsafe<ChapterHitRow[]>(
          `SELECT n.id AS "novelId", n.title AS "novelTitle", n.slug AS "novelSlug",
                  u.id AS "authorId", u.display_name AS "authorName",
                  c.number AS "chapterNumber", c.title AS "chapterTitle",
                  ts_headline('english', pc.stripped, ${tsq},
                    'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MinWords=10, MaxWords=25') AS snippet,
                  GREATEST(
                    ts_rank(to_tsvector('english', pc.stripped), ${tsq}),
                    ts_rank(to_tsvector('english', c.title), ${tsq})
                  ) AS rank,
                  pc."sortAt" AS "sortAt"
           FROM (
             SELECT p.chapter_id AS "chapterId",
                    p.novel_id AS "novelId",
                    -- NF-WF-017C (Invariant 3, Q7 decision of record):
                    -- SQL-side tag strip — the shared strip rule
                    -- (<[^>]*> -> one space) in SQL, computed once
                    -- per published version, so tags never become index
                    -- lexemes and never appear in snippets. A stored
                    -- stripped column is the 023/024 performance
                    -- follow-up (schema change, needs an ADR).
                    regexp_replace(cv.content, '<[^>]*>', ' ', 'g') AS stripped,
                    p.published_at AS "sortAt"
             FROM chapter_versions cv
             JOIN publications p ON p.chapter_version_id = cv.id AND p.status = 'PUBLISHED'
           ) pc
           JOIN chapters c ON c.id = pc."chapterId"
           JOIN novels n ON n.id = pc."novelId" AND n.status = 'ACTIVE'
           JOIN users u ON u.id = n.created_by_id
           WHERE to_tsvector('english', pc.stripped) @@ ${tsq}
              OR to_tsvector('english', c.title) @@ ${tsq}
           ORDER BY rank DESC, "sortAt" DESC
           LIMIT $2`,
          q,
          limit,
        );
        for (const r of rows) {
          hits.push({
            type: "chapter",
            novel: {
              id: r.novelId,
              title: r.novelTitle,
              slug: r.novelSlug,
              author: { id: r.authorId, displayName: r.authorName },
            },
            chapter: { number: r.chapterNumber, title: r.chapterTitle },
            snippet: r.snippet === null ? null : escapeSnippet(r.snippet),
            rank: Number(r.rank),
            sortAt: new Date(r.sortAt).getTime(),
          });
        }
      }

      // Flat ranked list (contract Q7): rank desc, ties by recency.
      hits.sort((a, b) => b.rank - a.rank || b.sortAt - a.sortAt);
      return hits.slice(0, limit).map(({ sortAt: _sortAt, ...hit }) => hit);
    },

    /**
     * Member genre authoring: author-set taxonomy on a novel.
     * `novel:update` capability; unknown novel → 404; unknown keys or
     * more than MAX_GENRES_PER_NOVEL → rejected by the caller (400).
     */
    async setNovelGenres({
      actorUserId,
      workspaceId,
      novelId,
      genres,
    }: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      genres: string[];
    }): Promise<{ genres: string[] }> {
      await gate(workspaceId, novelId, actorUserId, "novel:update");
      const deduped = [...new Set(genres)];
      if (!areKnownGenreKeys(deduped) || deduped.length > MAX_GENRES_PER_NOVEL) {
        throw new Error("INVALID_GENRES");
      }
      const updated = await db.novel.update({
        where: { id: novelId },
        data: { genres: deduped },
        select: { genres: true },
      });
      return { genres: updated.genres };
    },

    /**
     * Author-set reader-facing content rating (workspace management slice,
     * 2026-10-18). `null` clears it. Same capability and refusal shape as
     * setNovelGenres; the value is validated against the Audience enum by
     * the route's Zod schema before this runs — the non-null re-check here
     * is a backstop for direct service callers.
     */
    async setNovelAudience({
      actorUserId,
      workspaceId,
      novelId,
      audience,
    }: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      audience: "teen" | "mature" | "adult" | null;
    }): Promise<{ audience: string | null }> {
      await gate(workspaceId, novelId, actorUserId, "novel:update");
      if (audience !== null && !["teen", "mature", "adult"].includes(audience)) {
        throw new Error("INVALID_AUDIENCE");
      }
      const updated = await db.novel.update({
        where: { id: novelId },
        data: { audience },
      });
      return { audience: updated.audience ?? null };
    },
  };
}

export type PublicDiscoveryServices = ReturnType<
  typeof createPublicDiscoveryServices
>;
