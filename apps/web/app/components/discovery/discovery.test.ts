/**
 * Discovery UI tests (NF-WF-014): NovelCard, GenreChips, SearchBox,
 * ContinueReading render real API data (mocked at the useApi
 * boundary, the 007/013 harness pattern). No mock screens: every
 * assertion is about data the components actually render.
 *
 * Also pins the privacy contract: ContinueReading drops 404 entries
 * silently and never distinguishes them in the UI.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import NovelCard from "./NovelCard.vue";
import GenreChips from "./GenreChips.vue";
import SearchBox from "./SearchBox.vue";
import ContinueReading from "./ContinueReading.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

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

// NuxtLink is Nuxt-provided; render as a plain anchor for assertions.
const stubs = {
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot /></a>',
  },
};

beforeEach(() => {
  apiMock.mockReset();
  localStorage.clear();
});

describe("NovelCard", () => {
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

  it("renders title, author, genre labels, chapter count", () => {
    const w = mount(NovelCard, { props: { novel }, global: { stubs } });
    const text = w.text();
    expect(text).toContain("The Jade Pagoda");
    expect(text).toContain("Li Wei");
    expect(text).toContain("genre.fantasy");
    expect(text).toContain("genre.xianxia");
    expect(text).toContain("reader.chapterCount|n=12");
    const link = w.find("a");
    expect(link.attributes("href")).toBe("/read/jade-pagoda");
  });

  it("renders without genre chips when the novel has none", () => {
    const w = mount(NovelCard, {
      props: { novel: { ...novel, genres: [] } },
      global: { stubs },
    });
    expect(w.find('[aria-label="Genres"]').exists()).toBe(false);
  });
});

describe("GenreChips", () => {
  const facets = [
    { key: "fantasy", count: 3 },
    { key: "action", count: 1 },
  ];

  it("renders one chip per facet with counts and marks the active one", () => {
    const w = mount(GenreChips, {
      props: { facets, active: "fantasy" },
      global: { stubs },
    });
    const buttons = w.findAll("button");
    expect(buttons).toHaveLength(3); // All + 2 facets
    const active = buttons.find((b) => b.attributes("aria-current") === "true");
    expect(active?.text()).toContain("genre.fantasy");
    expect(w.text()).toContain("discover.facetCount|n=3");
  });

  // D5/D2: active and inactive boundaries cannot compete through CSS order,
  // and hover must not restore the previous low-contrast border.
  it.each([null, "fantasy"])("chip boundaries remain distinct with active %s", (selected) => {
    const w = mount(GenreChips, {
      props: { facets, active: selected },
      global: { stubs },
    });
    const buttons = w.findAll("button");
    const active = buttons.find((b) => b.attributes("aria-current") === "true")!;
    const inactive = buttons.filter((b) => b.attributes("aria-current") === undefined);

    expect(active.classes()).toContain("border-nf-accent-hi");
    expect(active.classes()).toContain("text-nf-text");
    expect(active.classes()).not.toContain("border-nf-border");
    expect(active.classes()).not.toContain("border-nf-border-focus");
    expect(active.classes()).not.toContain("text-nf-text-dim");
    expect(active.classes()).not.toContain("hover:border-nf-border-strong");

    for (const chip of inactive) {
      expect(chip.classes()).toContain("border-nf-border-focus");
      expect(chip.classes()).not.toContain("border-nf-border");
      expect(chip.classes()).toContain("text-nf-text-dim");
      expect(chip.classes()).not.toContain("hover:border-nf-border-strong");
      expect(chip.classes()).not.toContain("border-nf-accent-hi");
      expect(chip.classes()).not.toContain("text-nf-text");
    }
  });

  it("emits select on click", async () => {
    const w = mount(GenreChips, {
      props: { facets, active: null },
      global: { stubs },
    });
    await w.findAll("button")[1]!.trigger("click");
    expect(w.emitted("select")).toEqual([["fantasy"]]);
  });
});

describe("SearchBox", () => {
  it("debounces input and clears on Escape", async () => {
    const w = mount(SearchBox, {
      props: { modelValue: "" },
      global: { stubs },
    });
    const input = w.find("input");
    await input.setValue("phoenix");
    expect(w.emitted("update:modelValue")).toBeUndefined();
    await new Promise((r) => setTimeout(r, 350));
    expect(w.emitted("update:modelValue")).toEqual([["phoenix"]]);
    await input.trigger("keydown", { key: "Escape" });
    expect(w.emitted("update:modelValue")).toEqual([["phoenix"], [""]]);
  });
});

describe("ContinueReading", () => {
  it("resolves stored entries and renders continue links", async () => {
    localStorage.setItem(
      "nf:reading-progress:v1",
      JSON.stringify({ "jade-pagoda": { chapterNumber: 4, updatedAt: "2026-10-05T00:00:00Z" } }),
    );
    apiMock.mockResolvedValue({
      novel: { title: "The Jade Pagoda", author: { displayName: "Li Wei" } },
    });
    const w = mount(ContinueReading, { global: { stubs } });
    await flushPromises();
    const text = w.text();
    expect(text).toContain("The Jade Pagoda");
    expect(text).toContain("progress.stoppedAt|n=4");
    const link = w.find("a");
    expect(link.attributes("href")).toBe("/read/jade-pagoda/4");
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("drops 404 entries silently (no 'removed' oracle)", async () => {
    localStorage.setItem(
      "nf:reading-progress:v1",
      JSON.stringify({ "gone-novel": { chapterNumber: 2, updatedAt: "2026-10-05T00:00:00Z" } }),
    );
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", 404));
    const w = mount(ContinueReading, { global: { stubs } });
    await flushPromises();
    // Nothing rendered, no error surfaced, entry removed from storage.
    expect(w.text()).toBe("");
    expect(localStorage.getItem("nf:reading-progress:v1")).toBe("{}");
  });
});
