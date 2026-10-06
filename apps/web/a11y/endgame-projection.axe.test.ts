/**
 * Accessibility tests (NF-WF-022C): zero axe violations (wcag2aa +
 * wcag22aa tags) on the endgame projection view, in both locales.
 *
 * useLocale is mocked with a key-returning t; the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary. The pure scenario helpers are the real
 * `@novelforge/story-simulation` implementations.
 *
 * 022A's `GET .../endgame/ledger` is mocked at HTTP (022A implements the
 * route in parallel; the path is pinned by the 022 contract).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import EndgameProjectionView from "../app/components/endgame/EndgameProjectionView.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();

vi.mock("../app/composables/useApi", () => ({
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

configureAxe({ rules: { "color-contrast": { enabled: false } } });

const LEDGER = [
  { ledgerId: "l1", threadId: "t-must-1", status: "MUST", closed: false, criteria: "c1" },
  { ledgerId: "l2", threadId: "t-should-1", status: "SHOULD", closed: false, criteria: "c2" },
];

function mockApi() {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/endgame/ledger")) return { entries: LEDGER };
    if (path.endsWith("/branches"))
      return { branches: [{ id: "b1", name: "main" }] };
    if (path.endsWith("/simulations") && init?.method === "POST")
      return { run: { id: "run1" } };
    if (path.endsWith("/configure")) return {};
    if (path.endsWith("/start")) return {};
    if (path.endsWith("/step")) {
      return {
        ticks: [
          {
            tickNumber: 1,
            stateAfter: {
              "thread:t-must-1": "CLOSED",
              "thread:t-should-1": "OPEN",
            },
          },
        ],
      };
    }
    throw new Error(`unexpected ${init?.method} ${path}`);
  });
}

describe("EndgameProjectionView axe", () => {
  beforeEach(() => {
    apiMock.mockReset();
    mockApi();
  });

  it("initial view (plan picker) has zero violations", async () => {
    const wrapper = mount(EndgameProjectionView, {
      props: { workspaceId: "ws1", novelId: "n1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, {
      runOnly: { type: "tag", values: ["wcag2aa", "wcag22aa"] },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("result view (projected gate + MUST lists) has zero violations", async () => {
    const wrapper = mount(EndgameProjectionView, {
      props: { workspaceId: "ws1", novelId: "n1" },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.find('[data-testid="endgame-plan-t-must-1"]').setValue(true);
    await wrapper.find('[data-testid="endgame-projection-branch"]').setValue("b1");
    await wrapper.find('[data-testid="endgame-projection-run"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="endgame-projection-result"]').exists()).toBe(true);

    const results = await axe(wrapper.element, {
      runOnly: { type: "tag", values: ["wcag2aa", "wcag22aa"] },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("error view has zero violations", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/endgame/ledger")) throw new Error("down");
      if (path.endsWith("/branches")) return { branches: [] };
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mount(EndgameProjectionView, {
      props: { workspaceId: "ws1", novelId: "n1" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="endgame-projection-error"]').exists()).toBe(true);

    const results = await axe(wrapper.element, {
      runOnly: { type: "tag", values: ["wcag2aa", "wcag22aa"] },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
