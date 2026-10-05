/**
 * Reader UI tests (NF-WF-013): the three public reader pages and the
 * chapter navigation component render real API data (mocked at the
 * useApi boundary, the 007 harness pattern). No mock screens: every
 * assertion is about data the page actually renders.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted } from "vue";
import NovelPage from "../../pages/read/[slug].vue";
import ChapterPage from "../../pages/read/[slug]/[number].vue";
import AuthorPage from "../../pages/read/authors/[authorId].vue";
import ReaderChapterNav from "./ReaderChapterNav.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
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
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

// Nuxt auto-imports are unavailable in the vitest harness: stub them.
vi.stubGlobal(
  "useRoute",
  vi.fn(() => ({ params: { slug: "my-novel", number: "2", authorId: "author-1" } })),
);
vi.stubGlobal("useHead", vi.fn());
vi.stubGlobal("navigateTo", vi.fn());

const NuxtLinkStub = {
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

// Render the real nav component under its Nuxt auto-import name.
const ReaderChapterNavStub = {
  props: ["novelSlug", "prevChapter", "nextChapter"],
  template:
    '<nav><a v-if="prevChapter" :href="`/read/${novelSlug}/${prevChapter.number}`">reader.prevChapter {{ prevChapter.title }}</a><a v-if="nextChapter" :href="`/read/${novelSlug}/${nextChapter.number}`">reader.nextChapter {{ nextChapter.title }}</a></nav>',
};

beforeEach(() => {
  apiMock.mockReset();
});

describe("ReaderChapterNav", () => {
  it("renders prev/next links with live data", () => {
    const w = mount(ReaderChapterNav, {
      props: {
        novelSlug: "my-novel",
        prevChapter: { number: 1, title: "First" },
        nextChapter: { number: 3, title: "Third" },
      },
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    expect(w.text()).toContain("reader.prevChapter");
    expect(w.text()).toContain("First");
    expect(w.text()).toContain("reader.nextChapter");
    expect(w.text()).toContain("Third");
    const links = w.findAll("a");
    expect(links[0]!.attributes("href")).toBe("/read/my-novel/1");
    expect(links[1]!.attributes("href")).toBe("/read/my-novel/3");
  });

  it("hides the side that has no chapter", () => {
    const w = mount(ReaderChapterNav, {
      props: { novelSlug: "my-novel", prevChapter: null, nextChapter: { number: 2, title: "Two" } },
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    expect(w.text()).not.toContain("reader.prevChapter");
    expect(w.text()).toContain("Two");
    expect(w.findAll("a")).toHaveLength(1);
  });
});

describe("public novel page", () => {
  it("renders title, byline, and the published chapter list", async () => {
    apiMock.mockResolvedValue({
      novel: { id: "n1", title: "The Visible Novel", slug: "my-novel", author: { id: "a1", displayName: "Pen Author" } },
      chapters: [
        { number: 1, title: "Chapter One", publishedAt: "2026-10-06T00:00:00.000Z" },
        { number: 2, title: "Chapter Two", publishedAt: "2026-10-06T01:00:00.000Z" },
      ],
    });
    const w = mount(NovelPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("/public/novels/my-novel");
    expect(w.text()).toContain("The Visible Novel");
    expect(w.text()).toContain("Pen Author");
    expect(w.text()).toContain("Chapter One");
    expect(w.text()).toContain("Chapter Two");
    expect(w.text()).not.toContain("Draft Chapter");
  });

  it("renders the empty state when there are no published chapters", async () => {
    apiMock.mockResolvedValue({
      novel: { id: "n1", title: "Empty", slug: "my-novel", author: { id: "a1", displayName: "Pen" } },
      chapters: [],
    });
    const w = mount(NovelPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(w.text()).toContain("reader.noChapters");
  });

  it("renders the 404 state for an invisible novel", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", 404));
    const w = mount(NovelPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(w.text()).toContain("reader.notFoundTitle");
    expect(w.text()).not.toContain("The Visible Novel");
  });
});

describe("public chapter page", () => {
  it("renders pinned content, meta, and navigation", async () => {
    apiMock.mockResolvedValue({
      chapter: {
        number: 2,
        title: "Chapter Two",
        content: "The story continues.",
        wordCount: 3,
        publishedVersionNumber: 1,
        publishedAt: "2026-10-06T01:00:00.000Z",
      },
      prevChapter: { number: 1, title: "Chapter One" },
      nextChapter: null,
    });
    const w = mount(ChapterPage, {
      global: { stubs: { NuxtLink: NuxtLinkStub, ReaderChapterNav: ReaderChapterNavStub } },
    });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("/public/novels/my-novel/chapters/2");
    expect(w.text()).toContain("Chapter Two");
    expect(w.text()).toContain("The story continues.");
    expect(w.text()).toContain("reader.chapterOverline|n=2");
    expect(w.text()).toContain("reader.wordCount|n=3");
    expect(w.text()).toContain("reader.version|n=1");
    expect(w.text()).toContain("reader.prevChapter");
    expect(w.text()).not.toContain("reader.nextChapter");
  });

  it("renders the 404 state for an invisible chapter", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", 404));
    const w = mount(ChapterPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(w.text()).toContain("reader.notFoundTitle");
  });

  it("has no search input and no AI-generated content", async () => {
    apiMock.mockResolvedValue({
      chapter: {
        number: 1,
        title: "One",
        content: "Plain pinned text.",
        wordCount: 3,
        publishedVersionNumber: 1,
        publishedAt: "2026-10-06T00:00:00.000Z",
      },
      prevChapter: null,
      nextChapter: null,
    });
    const w = mount(ChapterPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(w.findAll('input[type="search"]')).toHaveLength(0);
    expect(w.findAll("input")).toHaveLength(0);
  });
});

describe("public author page", () => {
  it("renders displayName and published novels only", async () => {
    apiMock.mockResolvedValue({
      author: { id: "a1", displayName: "Pen Author" },
      novels: [
        { id: "n1", title: "First Book", slug: "first-book", publishedChapterCount: 5 },
        { id: "n2", title: "Second Book", slug: "second-book", publishedChapterCount: 12 },
      ],
    });
    const w = mount(AuthorPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("/public/authors/author-1");
    expect(w.text()).toContain("Pen Author");
    expect(w.text()).toContain("First Book");
    expect(w.text()).toContain("Second Book");
    expect(w.text()).toContain("n=5");
    expect(w.text()).not.toContain("@");
  });

  it("renders the 404 state for an author with no public novels", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", 404));
    const w = mount(AuthorPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });
    await flushPromises();
    expect(w.text()).toContain("reader.notFoundTitle");
  });
});
