/**
 * Reader engagement services (NF-WF-019A): bookmark / novel-follow /
 * author-follow / chapter-like.
 *
 * All writes are authenticated (the route layer's requireActor owns the
 * 401) and idempotent: dedup keys are DB unique constraints, so a
 * repeat engagement returns 200 with the same state and never a
 * duplicate row or a 409.
 *
 * Engagement is gated by the 014 predicate (Invariant 2) IN the SQL:
 * a novel is engageable iff `status = 'ACTIVE'` AND it has at least one
 * PUBLISHED publication; a chapter is engageable iff its publication is
 * PUBLISHED. Invisible targets 404 {error:"NOT_FOUND"} — the 013
 * no-oracle rule, never a 401/403 oracle.
 *
 * Counters (`Novel.followerCount`, `Chapter.likeCount`) are maintained
 * in the SAME transaction as the write via
 * `INSERT ... ON CONFLICT DO NOTHING` + conditional `UPDATE`, so
 * concurrent writers cannot double-count; decrements are
 * `GREATEST(n-1, 0)` and can never go negative. Reads serve counts only
 * on visible targets, so stored counters never leak engagement for
 * unpublished content (Invariant 2: rows are retained while
 * unpublished, invisible until public again).
 *
 * Privacy (Invariant 4): lists return the caller's own rows only —
 * there is no endpoint that lists another user's engagement. Counts
 * are public aggregates.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { NotFoundError } from "./platform.ts";

/** 400 INVALID_INPUT for engagement input refusals (self-follow). */
export class EngagementInputError extends Error {
  readonly code = "INVALID_INPUT" as const;
  constructor(message: string) {
    super(message);
  }
}

/** Opaque cursor: base64url(JSON) of the (createdAt, id) keyset position. */
export function encodeEngagementCursor(payload: {
  createdAt: string;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeEngagementCursor(cursor: string): {
  createdAt: string;
  id: string;
} | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const { createdAt, id } = parsed as Record<string, unknown>;
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export interface EngagementPage {
  cursor: string | null;
  hasMore: boolean;
}

export interface EngagementServices {
  bookmarkNovel(input: { userId: string; novelId: string }): Promise<{
    novelId: string;
    createdAt: string;
  }>;
  unbookmarkNovel(input: { userId: string; novelId: string }): Promise<void>;
  listBookmarks(input: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    bookmarks: Array<{
      novelId: string;
      novel: {
        id: string;
        title: string;
        slug: string;
        genres: string[];
        author: { id: string; displayName: string };
        publishedChapterCount: number;
        firstPublishedAt: string | null;
        lastPublishedAt: string | null;
      };
      createdAt: string;
    }>;
    page: EngagementPage;
  }>;
  followNovel(input: { userId: string; novelId: string }): Promise<{
    novelId: string;
    createdAt: string;
  }>;
  unfollowNovel(input: { userId: string; novelId: string }): Promise<void>;
  listNovelFollows(input: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    follows: Array<{
      novelId: string;
      novel: {
        id: string;
        title: string;
        slug: string;
        genres: string[];
        author: { id: string; displayName: string };
        publishedChapterCount: number;
        firstPublishedAt: string | null;
        lastPublishedAt: string | null;
      };
      createdAt: string;
    }>;
    page: EngagementPage;
  }>;
  followAuthor(input: { userId: string; authorId: string }): Promise<{
    authorId: string;
    author: { id: string; displayName: string };
    createdAt: string;
  }>;
  unfollowAuthor(input: { userId: string; authorId: string }): Promise<void>;
  listAuthorFollows(input: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    authorFollows: Array<{
      authorId: string;
      author: { id: string; displayName: string };
      createdAt: string;
    }>;
    page: EngagementPage;
  }>;
  authorFollowState(input: { userId: string; authorId: string }): Promise<{
    followingAuthor: boolean;
    followerCount: number;
  }>;
  likeChapter(input: {
    userId: string;
    novelId: string;
    chapterNumber: number;
  }): Promise<{ novelId: string; chapterNumber: number; createdAt: string }>;
  unlikeChapter(input: {
    userId: string;
    novelId: string;
    chapterNumber: number;
  }): Promise<void>;
  engagement(input: {
    userId: string;
    novelId: string;
    chapterNumber?: number;
  }): Promise<{
    bookmarked: boolean;
    following: boolean;
    liked: boolean;
    likeCount: number;
    commentCount: number;
    followerCount: number;
  }>;
}

export function createEngagementServices({
  db,
}: {
  db: NovelForgeDb;
}): EngagementServices {
  type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

  /**
   * The 014 predicate in the query: novel is ACTIVE and has >= 1
   * PUBLISHED publication. Returns the novel's id + followerCount, or
   * null for every invisible/nonexistent case (no oracle).
   */
  async function engageableNovel(
    client: Tx | NovelForgeDb,
    novelId: string,
  ): Promise<{ id: string; followerCount: number } | null> {
    return client.novel.findFirst({
      where: {
        id: novelId,
        status: "ACTIVE",
        publications: { some: { status: "PUBLISHED" } },
      },
      select: { id: true, followerCount: true },
    });
  }

  /**
   * The 013 public-author predicate: a User who has >= 1 public novel
   * (ACTIVE novel with >= 1 PUBLISHED chapter) — the same author the
   * frozen `/api/public/authors/:authorId` route resolves. Anything
   * else 404s exactly like a nonexistent user (no oracle).
   */
  async function publicAuthor(
    client: Tx | NovelForgeDb,
    authorId: string,
  ): Promise<{ id: string; displayName: string } | null> {
    const user = await client.user.findFirst({
      where: {
        id: authorId,
        createdNovels: {
          some: {
            status: "ACTIVE",
            chapters: { some: { publication: { status: "PUBLISHED" } } },
          },
        },
      },
      select: { id: true, displayName: true },
    });
    return user;
  }

  /** PUBLISHED chapter within an engageable novel, or null. */
  async function publishedChapter(
    client: Tx | NovelForgeDb,
    novelId: string,
    chapterNumber: number,
  ): Promise<{ likeCount: number; commentCount: number } | null> {
    const novel = await engageableNovel(client, novelId);
    if (!novel) return null;
    const chapter = await client.chapter.findFirst({
      where: {
        novelId,
        number: chapterNumber,
        publication: { status: "PUBLISHED" },
      },
      select: { likeCount: true, commentCount: true },
    });
    return chapter;
  }

  /** Keyset page over one engagement table (createdAt desc, id desc). */
  async function keysetPage<T extends { id: string; createdAt: Date }>(
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, "desc">>;
      take: number;
    }) => Promise<T[]>,
    where: Record<string, unknown>,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ rows: T[]; page: EngagementPage }> {
    const cursorPos = cursor ? decodeEngagementCursor(cursor) : null;
    if (cursor && !cursorPos) throw new EngagementInputError("invalid cursor");
    const whereWithCursor: Record<string, unknown> = cursorPos
      ? {
          ...where,
          OR: [
            { createdAt: { lt: new Date(cursorPos.createdAt) } },
            {
              createdAt: new Date(cursorPos.createdAt),
              id: { lt: cursorPos.id },
            },
          ],
        }
      : where;
    const rows = await findMany({
      where: whereWithCursor,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      rows: pageRows,
      page: {
        cursor: hasMore
          ? encodeEngagementCursor({
              createdAt: pageRows[limit - 1]!.createdAt.toISOString(),
              id: pageRows[limit - 1]!.id,
            })
          : null,
        hasMore,
      },
    };
  }

  /**
   * The enriched novel sub-object for engagement lists (GAP-074): the
   * pinned `{ id, title, slug }` plus the published-visible card fields
   * the 014 NovelCard needs on the `/read/library` page. All enriched
   * fields are published-visible data (publishedChapterCount counts
   * PUBLISHED chapters only; the dates are null when the novel
   * currently has none). No per-user state, no frozen 013 shape.
   */
  interface EnrichedNovel {
    id: string;
    title: string;
    slug: string;
    genres: string[];
    author: { id: string; displayName: string };
    publishedChapterCount: number;
    firstPublishedAt: string | null;
    lastPublishedAt: string | null;
  }

  const enrichedNovelSelect = {
    id: true,
    title: true,
    slug: true,
    genres: true,
    createdBy: { select: { id: true, displayName: true } },
    chapters: {
      where: { publication: { status: "PUBLISHED" as const } },
      select: { publication: { select: { publishedAt: true } } },
    },
  } as const;

  interface EnrichedNovelRow {
    id: string;
    title: string;
    slug: string;
    genres: string[];
    createdBy: { id: string; displayName: string };
    chapters: Array<{ publication: { publishedAt: Date | null } | null }>;
  }

  function toEnrichedNovel(row: EnrichedNovelRow): EnrichedNovel {
    const publishedAts = row.chapters
      .map((c) => c.publication?.publishedAt?.getTime())
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b);
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      genres: row.genres,
      author: { id: row.createdBy.id, displayName: row.createdBy.displayName },
      publishedChapterCount: publishedAts.length,
      firstPublishedAt:
        publishedAts.length > 0
          ? new Date(publishedAts[0]!).toISOString()
          : null,
      lastPublishedAt:
        publishedAts.length > 0
          ? new Date(publishedAts[publishedAts.length - 1]!).toISOString()
          : null,
    };
  }

  interface BookmarkListRow {
    id: string;
    createdAt: Date;
    novelId: string;
    novel: EnrichedNovelRow;
  }

  interface NovelFollowListRow {
    id: string;
    createdAt: Date;
    novelId: string;
    novel: EnrichedNovelRow;
  }

  interface AuthorFollowListRow {
    id: string;
    createdAt: Date;
    authorId: string;
    author: { id: string; displayName: string };
  }

  return {
    async bookmarkNovel({ userId, novelId }) {
      return db.$transaction(async (tx) => {
        const novel = await engageableNovel(tx, novelId);
        if (!novel) throw new NotFoundError("novel");
        // ON CONFLICT DO NOTHING makes the write itself the idempotency
        // primitive: concurrent duplicates collapse to the unique
        // constraint, and the loser gets row-count 0 (no 409, no race).
        await tx.$executeRaw`
          INSERT INTO bookmarks (id, user_id, novel_id)
          VALUES (gen_random_uuid(), ${userId}::uuid, ${novelId}::uuid)
          ON CONFLICT (user_id, novel_id) DO NOTHING`;
        const row = await tx.bookmark.findUniqueOrThrow({
          where: { userId_novelId: { userId, novelId } },
          select: { novelId: true, createdAt: true },
        });
        return { novelId: row.novelId, createdAt: row.createdAt.toISOString() };
      });
    },

    async unbookmarkNovel({ userId, novelId }) {
      // Idempotent: deleting a nonexistent row is still 204 (the
      // contract's Invariant 3) — no visibility check on delete.
      await db.$executeRaw`
        DELETE FROM bookmarks
        WHERE user_id = ${userId}::uuid AND novel_id = ${novelId}::uuid`;
    },

    async listBookmarks({ userId, cursor, limit }) {
      const { rows, page } = await keysetPage<BookmarkListRow>(
        (args) =>
          db.bookmark.findMany({ ...args, select: {
            id: true,
            createdAt: true,
            novelId: true,
            novel: { select: enrichedNovelSelect },
          } }),
        { userId },
        cursor,
        limit,
      );
      return {
        bookmarks: rows.map((r) => ({
          novelId: r.novelId,
          novel: toEnrichedNovel(r.novel),
          createdAt: r.createdAt.toISOString(),
        })),
        page,
      };
    },

    async followNovel({ userId, novelId }) {
      return db.$transaction(async (tx) => {
        const novel = await engageableNovel(tx, novelId);
        if (!novel) throw new NotFoundError("novel");
        const inserted: number = await tx.$executeRaw`
          INSERT INTO novel_follows (id, user_id, novel_id)
          VALUES (gen_random_uuid(), ${userId}::uuid, ${novelId}::uuid)
          ON CONFLICT (user_id, novel_id) DO NOTHING`;
        if (Number(inserted) > 0) {
          await tx.$executeRaw`
            UPDATE novels SET follower_count = follower_count + 1
            WHERE id = ${novelId}::uuid`;
        }
        const row = await tx.novelFollow.findUniqueOrThrow({
          where: { userId_novelId: { userId, novelId } },
          select: { novelId: true, createdAt: true },
        });
        return { novelId: row.novelId, createdAt: row.createdAt.toISOString() };
      });
    },

    async unfollowNovel({ userId, novelId }) {
      await db.$transaction(async (tx) => {
        const deleted: number = await tx.$executeRaw`
          DELETE FROM novel_follows
          WHERE user_id = ${userId}::uuid AND novel_id = ${novelId}::uuid`;
        if (Number(deleted) > 0) {
          await tx.$executeRaw`
            UPDATE novels SET follower_count = GREATEST(follower_count - 1, 0)
            WHERE id = ${novelId}::uuid`;
        }
      });
    },

    async listNovelFollows({ userId, cursor, limit }) {
      const { rows, page } = await keysetPage<NovelFollowListRow>(
        (args) =>
          db.novelFollow.findMany({ ...args, select: {
            id: true,
            createdAt: true,
            novelId: true,
            novel: { select: enrichedNovelSelect },
          } }),
        { userId },
        cursor,
        limit,
      );
      return {
        follows: rows.map((r) => ({
          novelId: r.novelId,
          novel: toEnrichedNovel(r.novel),
          createdAt: r.createdAt.toISOString(),
        })),
        page,
      };
    },

    async followAuthor({ userId, authorId }) {
      if (userId === authorId)
        throw new EngagementInputError("cannot follow yourself");
      return db.$transaction(async (tx) => {
        const author = await publicAuthor(tx, authorId);
        if (!author) throw new NotFoundError("author");
        await tx.$executeRaw`
          INSERT INTO author_follows (id, user_id, author_id)
          VALUES (gen_random_uuid(), ${userId}::uuid, ${authorId}::uuid)
          ON CONFLICT (user_id, author_id) DO NOTHING`;
        const row = await tx.authorFollow.findUniqueOrThrow({
          where: { userId_authorId: { userId, authorId } },
          select: { authorId: true, createdAt: true },
        });
        return {
          authorId: row.authorId,
          author: { id: author.id, displayName: author.displayName },
          createdAt: row.createdAt.toISOString(),
        };
      });
    },

    async unfollowAuthor({ userId, authorId }) {
      await db.$executeRaw`
        DELETE FROM author_follows
        WHERE user_id = ${userId}::uuid AND author_id = ${authorId}::uuid`;
    },

    async listAuthorFollows({ userId, cursor, limit }) {
      const { rows, page } = await keysetPage<AuthorFollowListRow>(
        (args) =>
          db.authorFollow.findMany({
            ...args,
            select: {
              id: true,
              createdAt: true,
              authorId: true,
              author: { select: { id: true, displayName: true } },
            },
          }),
        { userId },
        cursor,
        limit,
      );
      return {
        authorFollows: rows.map((r) => ({
          authorId: r.authorId,
          author: r.author,
          createdAt: r.createdAt.toISOString(),
        })),
        page,
      };
    },

    async authorFollowState({ userId, authorId }) {
      const author = await publicAuthor(db, authorId);
      if (!author) throw new NotFoundError("author");
      const [following, followerCount] = await Promise.all([
        db.authorFollow.findUnique({
          where: { userId_authorId: { userId, authorId } },
          select: { id: true },
        }),
        // No counter column on User (Invariant 4) — aggregate query.
        db.authorFollow.count({ where: { authorId } }),
      ]);
      return { followingAuthor: following !== null, followerCount };
    },

    async likeChapter({ userId, novelId, chapterNumber }) {
      return db.$transaction(async (tx) => {
        const chapter = await publishedChapter(tx, novelId, chapterNumber);
        if (!chapter) throw new NotFoundError("chapter");
        const inserted: number = await tx.$executeRaw`
          INSERT INTO chapter_likes (id, user_id, novel_id, chapter_number)
          VALUES (gen_random_uuid(), ${userId}::uuid, ${novelId}::uuid, ${chapterNumber})
          ON CONFLICT (user_id, novel_id, chapter_number) DO NOTHING`;
        if (Number(inserted) > 0) {
          await tx.$executeRaw`
            UPDATE chapters SET like_count = like_count + 1
            WHERE novel_id = ${novelId}::uuid AND number = ${chapterNumber}`;
        }
        const row = await tx.chapterLike.findUniqueOrThrow({
          where: {
            userId_novelId_chapterNumber: { userId, novelId, chapterNumber },
          },
          select: { novelId: true, chapterNumber: true, createdAt: true },
        });
        return {
          novelId: row.novelId,
          chapterNumber: row.chapterNumber,
          createdAt: row.createdAt.toISOString(),
        };
      });
    },

    async unlikeChapter({ userId, novelId, chapterNumber }) {
      await db.$transaction(async (tx) => {
        const deleted: number = await tx.$executeRaw`
          DELETE FROM chapter_likes
          WHERE user_id = ${userId}::uuid
            AND novel_id = ${novelId}::uuid
            AND chapter_number = ${chapterNumber}`;
        if (Number(deleted) > 0) {
          await tx.$executeRaw`
            UPDATE chapters SET like_count = GREATEST(like_count - 1, 0)
            WHERE novel_id = ${novelId}::uuid AND number = ${chapterNumber}`;
        }
      });
    },

    async engagement({ userId, novelId, chapterNumber }) {
      const novel = await engageableNovel(db, novelId);
      if (!novel) throw new NotFoundError("novel");
      const [bookmark, follow] = await Promise.all([
        db.bookmark.findUnique({
          where: { userId_novelId: { userId, novelId } },
          select: { id: true },
        }),
        db.novelFollow.findUnique({
          where: { userId_novelId: { userId, novelId } },
          select: { id: true },
        }),
      ]);
      let liked = false;
      let likeCount = 0;
      let commentCount = 0;
      if (chapterNumber !== undefined) {
        const chapter = await publishedChapter(db, novelId, chapterNumber);
        if (!chapter) throw new NotFoundError("chapter");
        likeCount = chapter.likeCount;
        commentCount = chapter.commentCount;
        liked =
          (await db.chapterLike.findUnique({
            where: {
              userId_novelId_chapterNumber: { userId, novelId, chapterNumber },
            },
            select: { id: true },
          })) !== null;
      }
      return {
        bookmarked: bookmark !== null,
        following: follow !== null,
        liked,
        likeCount,
        commentCount,
        followerCount: novel.followerCount,
      };
    },
  };
}
