/**
 * Reading library page tests (NF-WF-019A): the private /read/library
 * page renders the caller's bookmarks, novel follows, and author
 * follows; anonymous readers are redirected to sign-in.
 *
 * Mocked at the useApi boundary (the 007/013 harness pattern).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted } from "vue";
import LibraryPage from "./library.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();
const navigateToMock = vi.fn();

vi.stubGlobal("useRoute", vi.fn(() => ({ params: {} })));
vi.stubGlobal("useHead", vi.fn());
vi.stubGlobal("navigateTo", navigateToMock);

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

const NuxtLinkStub = {
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

const novelA = {
  id: "n1",
  title: "Novel One",
  slug: "novel-one",
  genres: ["fantasy"],
  author: { id: "a1", displayName: "Pen Author" },
  publishedChapterCount: 3,
  firstPublishedAt: "2026-10-01T00:00:00.000Z",
  lastPublishedAt: "2026-10-05T00:00:00.000Z",
};

const novelB = {
  id: "n2",
  title: "Novel Two",
  slug: "novel-two",
  genres: [],
  author: { id: "a2", displayName: "Other Author" },
  publishedChapterCount: 0,
  firstPublishedAt: null,
  lastPublishedAt: null,
};

function mockSignedIn() {
  apiMock.mockImplementation(async (path: string) => {
    const p = String(path);
    if (p === "/auth/session") return { userId: "u1" };
    if (p.startsWith("/reader/bookmarks"))
      return {
        bookmarks: [{ novelId: "n1", novel: novelA, createdAt: "2026-10-06T00:00:00.000Z" }],
        page: { cursor: null, hasMore: false },
      };
    if (p.startsWith("/reader/follows"))
      return {
        follows: [{ novelId: "n2", novel: novelB, createdAt: "2026-10-06T00:00:00.000Z" }],
        page: { cursor: null, hasMore: false },
      };
    if (p.startsWith("/reader/author-follows"))
      return {
        authorFollows: [
          { authorId: "a1", author: { id: "a1", displayName: "Pen Author" }, createdAt: "2026-10-06T00:00:00.000Z" },
        ],
        page: { cursor: null, hasMore: false },
      };
    throw new Error(`unexpected api call: ${p}`);
  });
}

beforeEach(() => {
  apiMock.mockReset();
  navigateToMock.mockReset();
});

describe("reading library page", () => {
  it("renders the caller's bookmarks, novel follows, and author follows", async () => {
    mockSignedIn();
    const w = mount(LibraryPage, {
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    await flushPromises();
    const text = w.text();
    expect(text).toContain("social.libraryTitle");
    expect(text).toContain("Novel One");
    expect(text).toContain("Novel Two");
    expect(text).toContain("Pen Author");
    // The unpublished novel renders the fallback card (no fabricated dates).
    expect(text).toContain("reader.noChapters");
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("redirects anonymous readers to sign-in", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    mount(LibraryPage, {
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    await flushPromises();
    expect(navigateToMock).toHaveBeenCalledWith("/sign-in");
  });

  it("shows the empty hint when the reader has no engagement", async () => {
    apiMock.mockImplementation(async (path: string) => {
      const p = String(path);
      if (p === "/auth/session") return { userId: "u1" };
      if (p.startsWith("/reader/bookmarks")) return { bookmarks: [], page: { cursor: null, hasMore: false } };
      if (p.startsWith("/reader/follows")) return { follows: [], page: { cursor: null, hasMore: false } };
      if (p.startsWith("/reader/author-follows"))
        return { authorFollows: [], page: { cursor: null, hasMore: false } };
      throw new Error(`unexpected api call: ${p}`);
    });
    const w = mount(LibraryPage, {
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    await flushPromises();
    expect(w.text()).toContain("social.libraryEmptyHint");
  });
});
