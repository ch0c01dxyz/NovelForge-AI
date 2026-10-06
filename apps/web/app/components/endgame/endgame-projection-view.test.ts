/**
 * Component tests (NF-WF-022C): EndgameProjectionView.
 *
 * Mocks at the HTTP/`useApi` boundary (per the 021D Q5 precedent); the
 * pure scenario helpers (`buildEndgameScenario` /
 * `interpretEndgameProjection`) are the REAL `@novelforge/story-simulation`
 * implementations — deterministic and fast — so the test pins the actual
 * projection semantics end to end through the component.
 *
 * 022A's `GET .../endgame/ledger` is mocked at HTTP (022A implements the
 * route in parallel; the path is pinned by the 022 contract).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import EndgameProjectionView from "./EndgameProjectionView.vue";

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
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const LEDGER = [
  { ledgerId: "l1", threadId: "t-must-1", status: "MUST", closed: false, criteria: "c1" },
  { ledgerId: "l2", threadId: "t-must-2", status: "MUST", closed: true, criteria: "c2" },
  { ledgerId: "l3", threadId: "t-should-1", status: "SHOULD", closed: false, criteria: "c3" },
];

function mockLedgerAndBranches() {
  apiMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/endgame/ledger")) return { entries: LEDGER };
    if (path.endsWith("/branches"))
      return { branches: [{ id: "b1", name: "main" }] };
    throw new Error(`unexpected GET ${path}`);
  });
}

function mountView() {
  return mount(EndgameProjectionView, {
    props: { workspaceId: "ws1", novelId: "n1" },
  });
}

describe("EndgameProjectionView", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("renders ledger entries as close-plan checkboxes with status badges", async () => {
    mockLedgerAndBranches();
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="endgame-plan-t-must-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-plan-t-should-1"]').exists()).toBe(true);
    // Already-closed entries are not selectable.
    expect(wrapper.find('[data-testid="endgame-plan-t-must-2"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("endgame.projection.statusLabels.MUST");
  });

  it("shows an empty state when the ledger has no entries", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/endgame/ledger")) return { entries: [] };
      if (path.endsWith("/branches")) return { branches: [] };
      throw new Error(`unexpected GET ${path}`);
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="endgame-projection-empty"]').exists()).toBe(true);
  });

  it("shows a clean error when the ledger fails to load", async () => {
    apiMock.mockRejectedValue(new Error("network down"));
    const wrapper = mountView();
    await flushPromises();
    const err = wrapper.find('[data-testid="endgame-projection-error"]');
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("network down");
  });

  it("runs the projection through 021A routes and renders the gate verdict", async () => {
    mockLedgerAndBranches();
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.endsWith("/endgame/ledger")) return { entries: LEDGER };
      if (path.endsWith("/branches"))
        return { branches: [{ id: "b1", name: "main" }] };
      if (path.endsWith("/simulations") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        // The scenario carries the endgame injections (no new routes).
        expect(body.scenario.injections["1"][0].kind).toBe(
          "ENDGAME_THREAD_CLOSED",
        );
        return { run: { id: "run1" } };
      }
      if (path.endsWith("/configure")) return {};
      if (path.endsWith("/start")) return {};
      if (path.endsWith("/step")) {
        // One tick closed t-must-1 (the selected plan).
        return {
          ticks: [
            {
              tickNumber: 1,
              stateAfter: {
                "thread:t-must-1": "CLOSED",
                "thread:t-must-2": "CLOSED",
                "thread:t-should-1": "OPEN",
              },
            },
          ],
        };
      }
      throw new Error(`unexpected ${init?.method} ${path}`);
    });

    const wrapper = mountView();
    await flushPromises();

    // Select the open MUST and a branch, then run.
    await wrapper.find('[data-testid="endgame-plan-t-must-1"]').setValue(true);
    await wrapper.find('[data-testid="endgame-projection-branch"]').setValue("b1");
    await wrapper.find('[data-testid="endgame-projection-run"]').trigger("click");
    await flushPromises();

    // 021A lifecycle driven in order: create → configure → start → step.
    const paths = calls.map((c) => c.path);
    expect(paths.filter((p) => p.endsWith("/simulations"))).toHaveLength(1);
    expect(paths.some((p) => p.endsWith("/configure"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/start"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/step"))).toBe(true);

    // t-must-1 and (already closed) t-must-2 are CLOSED → READY.
    const result = wrapper.find('[data-testid="endgame-projection-result"]');
    expect(result.exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-projection-gate"]').text()).toContain(
      "endgame.projection.gateReady",
    );
    expect(wrapper.find('[data-testid="endgame-closed-must-t-must-1"]').exists()).toBe(true);
  });

  it("projects BLOCKED when a MUST stays open (what-if scenario)", async () => {
    mockLedgerAndBranches();
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/endgame/ledger")) return { entries: LEDGER };
      if (path.endsWith("/branches"))
        return { branches: [{ id: "b1", name: "main" }] };
      if (path.endsWith("/simulations") && init?.method === "POST")
        return { run: { id: "run1" } };
      if (path.endsWith("/configure")) return {};
      if (path.endsWith("/start")) return {};
      if (path.endsWith("/step")) {
        // Empty plan: single no-op tick, t-must-1 stays OPEN.
        return {
          ticks: [
            {
              tickNumber: 1,
              stateAfter: {
                "thread:t-must-1": "OPEN",
                "thread:t-must-2": "CLOSED",
                "thread:t-should-1": "OPEN",
              },
            },
          ],
        };
      }
      throw new Error(`unexpected ${init?.method} ${path}`);
    });

    const wrapper = mountView();
    await flushPromises();

    // No plan selected — "what if t-must-1 stays OPEN?"
    await wrapper.find('[data-testid="endgame-projection-branch"]').setValue("b1");
    await wrapper.find('[data-testid="endgame-projection-run"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="endgame-projection-gate"]').text()).toContain(
      "endgame.projection.gateBlocked",
    );
    expect(wrapper.find('[data-testid="endgame-open-must-t-must-1"]').exists()).toBe(true);
  });

  it("surfaces MODULE_NOT_ENABLED as a clean error (not a crash)", async () => {
    const { ApiError } = await import("../../composables/useApi");
    mockLedgerAndBranches();
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/endgame/ledger")) return { entries: LEDGER };
      if (path.endsWith("/branches"))
        return { branches: [{ id: "b1", name: "main" }] };
      if (path.endsWith("/simulations") && init?.method === "POST")
        return { run: { id: "run1" } };
      if (path.endsWith("/configure"))
        throw new ApiError("MODULE_NOT_ENABLED", 400);
      throw new Error(`unexpected ${init?.method} ${path}`);
    });

    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="endgame-plan-t-must-1"]').setValue(true);
    await wrapper.find('[data-testid="endgame-projection-branch"]').setValue("b1");
    await wrapper.find('[data-testid="endgame-projection-run"]').trigger("click");
    await flushPromises();

    const err = wrapper.find('[data-testid="endgame-projection-error"]');
    expect(err.exists()).toBe(true);
    // The key-returning mock `t` makes the component fall back to the raw
    // code — in production this renders the translated
    // `endgame.projection.errors.MODULE_NOT_ENABLED` string. Either way it
    // is a clean inline error, not a crash.
    expect(err.text()).toContain("MODULE_NOT_ENABLED");
    // No result rendered — the run did not complete.
    expect(wrapper.find('[data-testid="endgame-projection-result"]').exists()).toBe(false);
  });
});
