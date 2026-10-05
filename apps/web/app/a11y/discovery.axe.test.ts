/**
 * Accessibility tests (NF-WF-014, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every discovery surface in
 * both locales. The checked-in suite is the automated half of the
 * audit; the manual checklist (keyboard, named screen reader,
 * contrast, viewports, reduced motion, 200% zoom, lang) lives at
 * apps/web/a11y/AUDIT-014.md.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import NovelCard from "../components/discovery/NovelCard.vue";
import GenreChips from "../components/discovery/GenreChips.vue";
import SearchBox from "../components/discovery/SearchBox.vue";
import ContinueReading from "../components/discovery/ContinueReading.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

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
vi.mock("../composables/useApi", () => ({
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

const stubs = {
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot /></a>',
  },
};

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const novel = {
  id: "n1",
  title: "The Jade Pagoda",
  slug: "jade-pagoda",
  author: { id: "a1", displayName: "Li Wei" },
  genres: ["fantasy", "xianxia"],
  publishedChapterCount: 12,
  firstPublishedAt: "2026-09-01T00:00:00.000Z",
  lastPublishedAt: "2026-10-01T00:00:00.000Z",
};

const facets = [
  { key: "fantasy", count: 3 },
  { key: "action", count: 1 },
];

beforeEach(() => {
  apiMock.mockReset();
  localStorage.clear();
});

describe.each([
  ["en", en],
  ["id", id],
] as const)("axe: discovery surfaces (%s)", (name, locale) => {
  it("NovelCard has no violations", async () => {
    currentT = tFor(locale);
    const w = mount(NovelCard, { props: { novel }, global: { stubs }, attachTo: document.body });
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    w.unmount();
  });

  it("GenreChips has no violations", async () => {
    currentT = tFor(locale);
    const w = mount(GenreChips, {
      props: { facets, active: "fantasy" },
      global: { stubs },
      attachTo: document.body,
    });
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    w.unmount();
  });

  it("SearchBox has no violations", async () => {
    currentT = tFor(locale);
    const w = mount(SearchBox, {
      props: { modelValue: "" },
      global: { stubs },
      attachTo: document.body,
    });
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    w.unmount();
  });

  it("ContinueReading has no violations", async () => {
    currentT = tFor(locale);
    localStorage.setItem(
      "nf:reading-progress:v1",
      JSON.stringify({ "jade-pagoda": { chapterNumber: 4, updatedAt: "2026-10-05T00:00:00Z" } }),
    );
    apiMock.mockResolvedValue({
      novel: { title: "The Jade Pagoda", author: { displayName: "Li Wei" } },
    });
    const w = mount(ContinueReading, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    w.unmount();
  });

  it(`locale label (${name})`, () => {
    expect(name).toMatch(/^(en|id)$/);
  });
});
