/**
 * PlanningPanel tests (NF-WF-016): the tab container switches between the
 * five planning tabs; labels come through useLocale.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PlanningPanel from "./PlanningPanel.vue";

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
  apiMock.mockImplementation((path: string) => {
    if (path.includes("/planning/sagas")) return Promise.resolve([]);
    if (path.includes("/planning/horizon")) return Promise.resolve(null);
    if (path.includes("/planning/outline-versions"))
      return Promise.resolve([{ id: "v1", status: "DRAFT" }]);
    return Promise.resolve([]);
  });
});

const props = { workspaceId: "ws", novelId: "novel" };

describe("PlanningPanel", () => {
  it("renders the five tab labels through useLocale", async () => {
    const w = mount(PlanningPanel, { props });
    await flushPromises();
    const tabs = w.findAll("[data-testid='panel-tab']");
    expect(tabs).toHaveLength(5);
    expect(w.text()).toContain("workspace.planning.tabs.synopses");
    expect(w.text()).toContain("workspace.planning.tabs.sagas");
    expect(w.text()).toContain("workspace.planning.tabs.nodes");
    expect(w.text()).toContain("workspace.planning.tabs.versions");
    expect(w.text()).toContain("workspace.planning.tabs.horizon");
    w.unmount();
  });

  it("switches between tabs, keeping the approval decision in the versions tab", async () => {
    const w = mount(PlanningPanel, { props });
    await flushPromises();
    const tabs = w.findAll("[data-testid='panel-tab']");
    // Starts on the synopses tab.
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    // NOTE: sections are v-show toggled. Never call isVisible() on a hidden
    // section before switching tabs: jsdom caches getComputedStyle on first
    // read, so a pre-switch visibility read poisons post-switch results.
    await tabs[3]!.trigger("click");
    await flushPromises();
    expect(tabs[3]!.attributes("aria-selected")).toBe("true");
    expect(w.find("#panel-versions").isVisible()).toBe(true);
    const versionsSection = w.find("#panel-versions");
    expect(versionsSection.text()).toContain("workspace.planning.versions.status.DRAFT");
    // Approval separation: the approval decision label lives in the versions tab.
    expect(versionsSection.find("[data-testid='approval-decision']").exists()).toBe(true);
    expect(versionsSection.text()).toContain("workspace.planning.versions.approval.heading");

    await tabs[2]!.trigger("click");
    await flushPromises();
    expect(tabs[2]!.attributes("aria-selected")).toBe("true");
    expect(w.find("#panel-nodes").isVisible()).toBe(true);
    const nodesSection = w.find("#panel-nodes");
    expect(nodesSection.text()).toContain("workspace.planning.nodes.empty");
    expect(nodesSection.text()).not.toContain("workspace.planning.versions.approval.heading");
    w.unmount();
  });
});
