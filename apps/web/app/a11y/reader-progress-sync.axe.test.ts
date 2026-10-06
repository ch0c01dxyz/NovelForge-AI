/**
 * Accessibility tests (NF-WF-019D, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on the reader page's "synced"
 * progress indicator in both locales.
 *
 * The indicator is a non-interactive text span (title tooltip); this
 * pins that it introduces no violations when visible.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { axe, configureAxe } from "vitest-axe";
import ReaderChapterPage from "../pages/read/[slug]/[number].vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);
vi.stubGlobal("nextTick", nextTick);
// Nuxt auto-imports (the page uses useRoute/useHead without imports).
vi.stubGlobal("useRoute", () => ({ params: { slug: "jade-pagoda", number: "3" } }));
vi.stubGlobal("useHead", () => {});

// Real i18n resources (both locales), minimal interpolation.
function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string = tFor(en);

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({ t: (p: string, params?: Record<string, string | number>) => currentT(p, params) }),
}));

const apiMock = vi.fn();
vi.mock("../composables/useApi", () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
      super(`${status} ${code}`);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  }
  return {
    useApi: () => ({ api: apiMock }),
    ApiError: MockApiError,
  };
});

vi.mock("../composables/useReadingProgress", () => ({
  useReadingProgress: () => ({
    markRead: vi.fn(),
    getProgress: () => null,
    dropProgress: vi.fn(),
    listProgress: () => [],
  }),
}));

// syncState is driven by the test: "synced" shows the indicator.
let mockSyncState = ref("synced");
vi.mock("../composables/useSyncedReadingProgress", () => ({
  useSyncedReadingProgress: () => ({
    syncState: mockSyncState,
    hasSession: async () => true,
    loadSyncedProgress: async () => ({ chapterNumber: 3, scrollRatio: null }),
    saveProgress: vi.fn(),
    clearSyncedProgress: async () => {},
    flushQueue: async () => {},
  }),
}));

const stubs = {
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot /></a>',
  },
  ReaderChapterNav: { template: "<nav></nav>" },
};

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const chapterPayload = {
  chapter: {
    number: 3,
    title: "The Third Bell",
    content: "First paragraph.\n\nSecond paragraph.",
    wordCount: 5,
    publishedVersionNumber: 2,
    publishedAt: "2026-10-01T00:00:00.000Z",
  },
  prevChapter: null,
  nextChapter: null,
};

beforeEach(() => {
  apiMock.mockReset();
  localStorage.clear();
  mockSyncState = ref("synced");
  apiMock.mockImplementation(async (path: string) => {
    if (path.includes("/chapters/")) return chapterPayload;
    if (path.includes("/public/novels/")) return { novel: { id: "n1" }, chapters: [] };
    const err = new Error("404 NOT_FOUND") as Error & { status: number };
    err.status = 404;
    throw err;
  });
});

describe.each([
  ["en", en],
  ["id", id],
] as const)("axe: reader page synced indicator (%s)", (name, locale) => {
  it("has no violations when the indicator is visible", async () => {
    currentT = tFor(locale);
    const w = mount(ReaderChapterPage, {
      global: { stubs, attachTo: document.body } as never,
    });
    // Wait for the chapter load + sync merge.
    await new Promise((r) => setTimeout(r, 100));
    await nextTick();
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    // The indicator is actually rendered.
    expect(w.text()).toContain(tFor(locale)("progressSync.syncedLabel"));
    w.unmount();
  });

  it("has no violations when the indicator is hidden (anonymous)", async () => {
    currentT = tFor(locale);
    mockSyncState = ref("anonymous");
    const w = mount(ReaderChapterPage, {
      global: { stubs, attachTo: document.body } as never,
    });
    await new Promise((r) => setTimeout(r, 100));
    await nextTick();
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    expect(w.text()).not.toContain(tFor(locale)("progressSync.syncedLabel"));
    w.unmount();
  });
});
