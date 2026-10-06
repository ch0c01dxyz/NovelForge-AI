/**
 * TimelinePanel tests (NF-WF-016): the tab container switches between the
 * five timeline tabs, each tab is labelled through useLocale, and tab
 * buttons follow the ARIA tabs keyboard pattern.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TimelinePanel from "./TimelinePanel.vue";

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

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
});

const props = { workspaceId: "ws", novelId: "novel" };

describe("TimelinePanel", () => {
  it("renders the five tab labels through useLocale", async () => {
    const w = mount(TimelinePanel, { props });
    await flushPromises();
    const tabs = w.findAll("[data-testid='panel-tab']");
    expect(tabs).toHaveLength(5);
    expect(w.text()).toContain("workspace.timeline.tabs.events");
    expect(w.text()).toContain("workspace.timeline.tabs.timeline");
    expect(w.text()).toContain("workspace.timeline.tabs.threads");
    expect(w.text()).toContain("workspace.timeline.tabs.promises");
    expect(w.text()).toContain("workspace.timeline.tabs.edges");
    w.unmount();
  });

  it("starts on the events tab and switches tabs on click", async () => {
    const w = mount(TimelinePanel, { props });
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.events.empty");
    await w.findAll("[data-testid='panel-tab']")[2]!.trigger("click");
    expect(w.text()).toContain("workspace.timeline.threads.empty");
    expect(w.text()).toContain("workspace.timeline.threads.noLinkingNote");
    await w.findAll("[data-testid='panel-tab']")[4]!.trigger("click");
    expect(w.text()).toContain("workspace.timeline.edges.empty");
    w.unmount();
  });

  it("marks the selected tab with aria-selected", async () => {
    const w = mount(TimelinePanel, { props });
    await flushPromises();
    const tabs = w.findAll("[data-testid='panel-tab']");
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    expect(tabs[1]!.attributes("aria-selected")).toBe("false");
    w.unmount();
  });

  it("moves between tabs with the arrow keys", async () => {
    const w = mount(TimelinePanel, { props, attachTo: document.body });
    await flushPromises();
    const first = w.findAll("[data-testid='panel-tab']")[0]!;
    await first.trigger("keydown", { key: "ArrowRight" });
    const tabs = w.findAll("[data-testid='panel-tab']");
    expect(tabs[1]!.attributes("aria-selected")).toBe("true");
    expect(w.text()).toContain("workspace.timeline.timelineEntries.empty");
    w.unmount();
  });
});
