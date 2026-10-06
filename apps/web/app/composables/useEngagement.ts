/**
 * Engagement API client (NF-WF-019A): thin wrappers over the
 * authenticated /api/reader/* engagement routes. Every call requires a
 * session — the server replies 401 for anonymous callers, which the
 * buttons surface as the sign-in prompt.
 */
import { useApi } from "./useApi";

export interface EngagementState {
  bookmarked: boolean;
  following: boolean;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  followerCount: number;
}

export interface AuthorFollowState {
  followingAuthor: boolean;
  followerCount: number;
}

export interface EngagementListPage {
  cursor: string | null;
  hasMore: boolean;
}

export interface EnrichedListNovel {
  id: string;
  title: string;
  slug: string;
  genres: string[];
  author: { id: string; displayName: string };
  publishedChapterCount: number;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
}

export function useEngagement() {
  const { api } = useApi();

  async function getEngagement(
    novelId: string,
    chapterNumber?: number,
  ): Promise<EngagementState> {
    const query =
      chapterNumber === undefined
        ? `?novelId=${encodeURIComponent(novelId)}`
        : `?novelId=${encodeURIComponent(novelId)}&chapterNumber=${chapterNumber}`;
    return api<EngagementState>(`/reader/engagement${query}`);
  }

  async function getAuthorFollowState(
    authorId: string,
  ): Promise<AuthorFollowState> {
    return api<AuthorFollowState>(
      `/reader/engagement/author?authorId=${encodeURIComponent(authorId)}`,
    );
  }

  async function setBookmark(novelId: string, on: boolean): Promise<void> {
    if (on) {
      await api(`/reader/bookmarks`, {
        method: "POST",
        body: JSON.stringify({ novelId }),
      });
    } else {
      await api(`/reader/bookmarks/${encodeURIComponent(novelId)}`, {
        method: "DELETE",
      });
    }
  }

  async function setNovelFollow(novelId: string, on: boolean): Promise<void> {
    if (on) {
      await api(`/reader/follows`, {
        method: "POST",
        body: JSON.stringify({ novelId }),
      });
    } else {
      await api(`/reader/follows/${encodeURIComponent(novelId)}`, {
        method: "DELETE",
      });
    }
  }

  async function setAuthorFollow(authorId: string, on: boolean): Promise<void> {
    if (on) {
      await api(`/reader/author-follows`, {
        method: "POST",
        body: JSON.stringify({ authorId }),
      });
    } else {
      await api(`/reader/author-follows/${encodeURIComponent(authorId)}`, {
        method: "DELETE",
      });
    }
  }

  async function setLike(
    novelId: string,
    chapterNumber: number,
    on: boolean,
  ): Promise<void> {
    if (on) {
      await api(`/reader/likes`, {
        method: "POST",
        body: JSON.stringify({ novelId, chapterNumber }),
      });
    } else {
      await api(
        `/reader/likes/${encodeURIComponent(novelId)}/${chapterNumber}`,
        { method: "DELETE" },
      );
    }
  }

  async function listBookmarks(cursor?: string, limit = 20): Promise<{
    bookmarks: Array<{
      novelId: string;
      novel: EnrichedListNovel;
      createdAt: string;
    }>;
    page: EngagementListPage;
  }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return api(`/reader/bookmarks?${params.toString()}`);
  }

  async function listNovelFollows(cursor?: string, limit = 20): Promise<{
    follows: Array<{
      novelId: string;
      novel: EnrichedListNovel;
      createdAt: string;
    }>;
    page: EngagementListPage;
  }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return api(`/reader/follows?${params.toString()}`);
  }

  async function listAuthorFollows(cursor?: string, limit = 20): Promise<{
    authorFollows: Array<{
      authorId: string;
      author: { id: string; displayName: string };
      createdAt: string;
    }>;
    page: EngagementListPage;
  }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return api(`/reader/author-follows?${params.toString()}`);
  }

  return {
    getEngagement,
    getAuthorFollowState,
    setBookmark,
    setNovelFollow,
    setAuthorFollow,
    setLike,
    listBookmarks,
    listNovelFollows,
    listAuthorFollows,
  };
}
