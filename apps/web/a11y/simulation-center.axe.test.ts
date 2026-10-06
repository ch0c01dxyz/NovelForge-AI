/**
 * Accessibility tests (NF-WF-021D): zero axe violations (wcag2aa +
 * wcag22aa tags) on every new Simulation Center surface, in both locales.
 *
 * useLocale is mocked with a key-returning t; the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary. Buttons are keyboard-operable native
 * <button> elements.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import SimulationRunList from "../app/components/simulation/SimulationRunList.vue";
import SimulationRunCreate from "../app/components/simulation/SimulationRunCreate.vue";
import SimulationRunDetail from "../app/components/simulation/SimulationRunDetail.vue";
import CausalChainView from "../app/components/simulation/CausalChainView.vue";
import ProposalReview from "../app/components/simulation/ProposalReview.vue";
import CivilizationWalkthrough from "../app/components/simulation/CivilizationWalkthrough.vue";

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

// The walkthrough imports the pure domain functions from the workspace
// package — mock the module boundary for the axe harness.
vi.mock("@novelforge/story-simulation", () => ({
  createInitialState: () => ({
    tick: 0,
    population: 500,
    foodSecurity: 0.6,
    grainSurplus: 100,
    infrastructure: 0.3,
    irrigationKnown: true,
    irrigationBuilt: false,
    irrigationBuildProgress: 0,
    droughtActive: false,
  }),
  runIrrigationScenario: () => ({
    runId: "walkthrough-1",
    status: "PAUSED_PROPOSAL",
    ticks: [],
    finalState: {
      tick: 10,
      population: 420,
      foodSecurity: 0.35,
      grainSurplus: 40,
      infrastructure: 0.3,
      irrigationKnown: true,
      irrigationBuilt: false,
      irrigationBuildProgress: 0,
      droughtActive: true,
    },
    proposals: [
      {
        id: "prop-1",
        runId: "walkthrough-1",
        tickNumber: 10,
        kind: "OUTCOME_FORK",
        alternatives: [
          { id: "build-irrigation", outcome: "Build", evidence: {}, confidence: 0.7 },
          { id: "maintain-dry-farming", outcome: "Maintain", evidence: {}, confidence: 0.4 },
        ],
        status: "PROPOSED",
      },
    ],
    events: [],
    causalLinks: [],
  }),
  resumeIrrigationScenario: (paused: unknown) => paused,
  DROUGHT_TICK: 5,
  PROPOSAL_TICK: 10,
}));

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const mockRuns = [
  {
    id: "run-1",
    novelId: "novel-1",
    branchId: "branch-1",
    isSimulationBranch: true,
    status: "RUNNING",
    currentTick: 5,
    maxTicks: 20,
    seed: "seed-1",
    snapshotId: "snap-1",
    canonRevisionId: "rev-1",
    createdAt: "2026-10-06T00:00:00Z",
  },
  {
    id: "run-2",
    novelId: "novel-1",
    branchId: null,
    isSimulationBranch: false,
    status: "PAUSED_PROPOSAL",
    currentTick: 10,
    maxTicks: 20,
    seed: "",
    snapshotId: null,
    canonRevisionId: null,
    createdAt: "2026-10-06T00:00:00Z",
  },
];

describe("Simulation Center axe", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("run list has zero violations", async () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: mockRuns, loading: false, loadError: false },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("run list (empty) has zero violations", async () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: [], loading: false, loadError: false },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("create dialog has zero violations", async () => {
    const wrapper = mount(SimulationRunCreate, {
      props: {
        open: true,
        workspaceId: "ws-1",
        novelId: "novel-1",
        branches: [{ id: "b-1", name: "main" }],
      },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("run detail (expanded tick) has zero violations", async () => {
    apiMock.mockImplementation((url: string) => {
      if (url.includes("/ticks/")) {
        const n = Number(url.split("/ticks/")[1]);
        return Promise.resolve({
          tick: {
            id: `tick-${n}`,
            runId: "run-1",
            tickNumber: n,
            stateBefore: { population: 500 },
            stateAfter: { population: 480 },
            events: [
              {
                id: `e-drought-${n}`,
                runId: "run-1",
                tickNumber: n,
                kind: "DROUGHT",
                entityId: null,
                payload: {},
              },
            ],
          },
        });
      }
      return Promise.resolve({
        run: {
          id: "run-1",
          novelId: "novel-1",
          branchId: "branch-1",
          isSimulationBranch: true,
          status: "RUNNING",
          currentTick: 2,
          maxTicks: 20,
          seed: "seed-1",
          snapshotId: "snap-1",
          canonRevisionId: "rev-1",
          createdAt: "2026-10-06T00:00:00Z",
          scenario: null,
        },
      });
    });
    const wrapper = mount(SimulationRunDetail, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    // Expand tick 1 to cover the state inspector surface.
    await wrapper.find('[data-testid="sim-tick-toggle-1"]').trigger("click");
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("causal chain (empty) has zero violations", async () => {
    const wrapper = mount(CausalChainView, {
      props: {
        workspaceId: "ws-1",
        novelId: "novel-1",
        runId: "run-1",
        eventId: null,
      },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("proposal review (empty) has zero violations", async () => {
    apiMock.mockResolvedValue({ proposals: [] });
    const wrapper = mount(ProposalReview, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("walkthrough (setup step) has zero violations", async () => {
    const wrapper = mount(CivilizationWalkthrough);
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NF-WF-024B: SimulationDebugger axe.
// ---------------------------------------------------------------------------

import SimulationDebugger from "../app/components/simulation/SimulationDebugger.vue";

describe("024B SimulationDebugger axe", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/breakpoints")) {
        return {
          breakpoints: [
            {
              id: "bp-1",
              runId: "run-1",
              kind: "PREDICATE",
              predicate: { path: "population", op: "<", value: 100 },
              watch: true,
              enabled: true,
              createdAt: "2026-10-07T00:00:00Z",
            },
          ],
        };
      }
      if (url.endsWith("/watch")) {
        return {
          watches: [
            {
              breakpointId: "bp-1",
              path: "population",
              values: [
                { tickNumber: 1, value: 500 },
                { tickNumber: 2, value: 480 },
              ],
            },
          ],
        };
      }
      return {
        run: {
          id: "run-1",
          novelId: "novel-1",
          branchId: "branch-1",
          isSimulationBranch: true,
          status: "PAUSED",
          currentTick: 5,
          maxTicks: 20,
          seed: "seed-1",
          snapshotId: "snap-1",
          canonRevisionId: "rev-1",
          createdAt: "2026-10-06T00:00:00Z",
          scenario: null,
        },
      };
    });
  });

  it("debugger (with breakpoints + watch) has zero violations", async () => {
    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("debugger (no run) has zero violations", async () => {
    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: null },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });
});
