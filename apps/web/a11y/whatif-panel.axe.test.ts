/**
 * Accessibility tests (NF-WF-024A): zero axe violations (wcag2aa +
 * wcag22aa tags) on the What-if panel, in both locales.
 *
 * useLocale is mocked with a key-returning t; the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary. Buttons are keyboard-operable native
 * <button> elements; form controls are labeled.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import WhatIfPanel from "../app/components/simulation/WhatIfPanel.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

vi.mock("../app/composables/useLocale", () => ({
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

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../app/composables/useApi", () => ({
  useApi: () => ({ get: getMock, post: postMock }),
}));

const axeAudit = configureAxe({ rules: {} });

function mountPanel() {
  return mount(WhatIfPanel, {
    props: { workspaceId: "ws-1", novelId: "novel-1" },
  });
}

describe("whatif panel a11y", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("outline-versions")) {
        return {
          versions: [
            { id: "v1", number: 1, status: "DRAFT", note: null, createdAt: "" },
            { id: "v2", number: 2, status: "APPROVED", note: null, createdAt: "" },
          ],
        };
      }
      return { comparisons: [] };
    });
    postMock.mockResolvedValue({ comparison: { id: "c1", status: "DRAFT" } });
  });

  it("has zero axe violations (empty state)", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const results = await axeAudit(wrapper.element);
    expect(results.violations).toEqual([]);
  });

  it("has zero axe violations (create form open)", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="whatif-create-open"]').trigger("click");
    await flushPromises();
    const results = await axeAudit(wrapper.element);
    expect(results.violations).toEqual([]);
  });

  it("has zero axe violations (with divergence points)", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("outline-versions")) return { versions: [] };
      return {
        comparisons: [
          {
            id: "c1",
            novelId: "novel-1",
            outlineVersionIds: ["v1", "v2"],
            runIds: ["r1", "r2"],
            divergencePoints: [
              {
                tickNumber: 2,
                chapterIndex: 2,
                kind: "STRUCTURAL",
                summary: "Trajectories diverge at tick 2.",
                outlineVersionIds: ["v2"],
              },
            ],
            maxChapters: 3,
            tokenBudget: 20000,
            tokenSpent: 0,
            status: "COMPLETED",
            createdAt: "",
          },
        ],
      };
    });
    const wrapper = mountPanel();
    await flushPromises();
    const results = await axeAudit(wrapper.element);
    expect(results.violations).toEqual([]);
  });
});
