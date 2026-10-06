/**
 * Reader engagement UI tests (NF-WF-019A): LikeButton, BookmarkButton,
 * FollowButton, FollowAuthorButton.
 *
 * Mocked at the useApi boundary (the 007/013 harness pattern): the
 * buttons' optimistic UI, rollback on failure, and aria-pressed states
 * are asserted against the real component logic. The session probe is
 * owned by the pages, not the buttons — buttons render only when the
 * page decides a session exists.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import LikeButton from "./LikeButton.vue";
import BookmarkButton from "./BookmarkButton.vue";
import FollowButton from "./FollowButton.vue";
import FollowAuthorButton from "./FollowAuthorButton.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({ api: apiMock }),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(`${status} ${code}`);
      this.name = "ApiError";
    }
  },
}));

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
  }),
}));

beforeEach(() => {
  apiMock.mockReset();
});

const tick = () => flushPromises();

describe("LikeButton", () => {
  it("renders unliked with aria-pressed=false and the count", () => {
    const w = mount(LikeButton, {
      props: { novelId: "n1", chapterNumber: 3, liked: false, likeCount: 7 },
    });
    const btn = w.find("button");
    expect(btn.attributes("aria-pressed")).toBe("false");
    expect(w.text()).toContain("social.like");
    expect(w.text()).toContain("7");
  });

  it("optimistically toggles and POSTs the like", async () => {
    apiMock.mockResolvedValue({});
    const w = mount(LikeButton, {
      props: { novelId: "n1", chapterNumber: 3, liked: false, likeCount: 7 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(w.find("button").attributes("aria-pressed")).toBe("true");
    expect(w.text()).toContain("8");
    expect(apiMock).toHaveBeenCalledWith("/reader/likes", {
      method: "POST",
      body: JSON.stringify({ novelId: "n1", chapterNumber: 3 }),
    });
  });

  it("rolls back and emits failed when the API fails", async () => {
    apiMock.mockRejectedValue(new Error("nope"));
    const w = mount(LikeButton, {
      props: { novelId: "n1", chapterNumber: 3, liked: false, likeCount: 7 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
    expect(w.text()).toContain("7");
    expect(w.emitted("failed")).toHaveLength(1);
  });

  it("unlikes with a DELETE to the chapter-numbered path", async () => {
    apiMock.mockResolvedValue(undefined);
    const w = mount(LikeButton, {
      props: { novelId: "n1", chapterNumber: 3, liked: true, likeCount: 7 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/likes/n1/3", {
      method: "DELETE",
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
  });
});

describe("BookmarkButton", () => {
  it("bookmarks with POST and unbookmarks with DELETE", async () => {
    apiMock.mockResolvedValue({});
    const w = mount(BookmarkButton, {
      props: { novelId: "n1", bookmarked: false },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/bookmarks", {
      method: "POST",
      body: JSON.stringify({ novelId: "n1" }),
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("true");

    apiMock.mockResolvedValue(undefined);
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/bookmarks/n1", {
      method: "DELETE",
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
  });

  it("rolls back on failure", async () => {
    apiMock.mockRejectedValue(new Error("nope"));
    const w = mount(BookmarkButton, {
      props: { novelId: "n1", bookmarked: false },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
    expect(w.emitted("failed")).toHaveLength(1);
  });
});

describe("FollowButton", () => {
  it("follows with POST, shows the follower count, and rolls back on failure", async () => {
    apiMock.mockResolvedValue({});
    const w = mount(FollowButton, {
      props: { novelId: "n1", following: false, followerCount: 41 },
    });
    expect(w.text()).toContain("41");
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/follows", {
      method: "POST",
      body: JSON.stringify({ novelId: "n1" }),
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("true");
    expect(w.text()).toContain("42");
  });

  it("unfollows with DELETE", async () => {
    apiMock.mockResolvedValue(undefined);
    const w = mount(FollowButton, {
      props: { novelId: "n1", following: true, followerCount: 41 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/follows/n1", {
      method: "DELETE",
    });
  });
});

describe("FollowAuthorButton", () => {
  it("follows the author with POST and unfollows with DELETE", async () => {
    apiMock.mockResolvedValue({});
    const w = mount(FollowAuthorButton, {
      props: { authorId: "a1", followingAuthor: false, followerCount: 5 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/author-follows", {
      method: "POST",
      body: JSON.stringify({ authorId: "a1" }),
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("true");
    expect(w.text()).toContain("6");

    apiMock.mockResolvedValue(undefined);
    await w.find("button").trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/reader/author-follows/a1", {
      method: "DELETE",
    });
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
  });

  it("rolls back a refused self-follow (400) without emitting a crash", async () => {
    const apiError = new Error("400 INVALID_INPUT") as Error & {
      status: number;
    };
    apiError.status = 400;
    apiMock.mockRejectedValue(apiError);
    const w = mount(FollowAuthorButton, {
      props: { authorId: "a1", followingAuthor: false, followerCount: 5 },
    });
    await w.find("button").trigger("click");
    await tick();
    expect(w.find("button").attributes("aria-pressed")).toBe("false");
    expect(w.text()).toContain("5");
    expect(w.emitted("failed")).toHaveLength(1);
  });
});
