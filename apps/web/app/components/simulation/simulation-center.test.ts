/**
 * NF-WF-021D: Simulation Center component tests.
 *
 * Tests mock at the HTTP/`useApi` boundary (per the contract reviewer's
 * Q5 interpretation). The full loop is covered API-level against the real
 * backend in apps/api.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import SimulationRunList from "./SimulationRunList.vue";
import SimulationRunCreate from "./SimulationRunCreate.vue";
import ProposalReview from "./ProposalReview.vue";
import CivilizationWalkthrough from "./CivilizationWalkthrough.vue";
import type { SimulationRunShape } from "./simulationApi";

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
    ticks: [
      {
        tickNumber: 5,
        stateBefore: { population: 500 },
        stateAfter: { population: 480, foodSecurity: 0.35 },
        events: [{ id: "e-drought", kind: "DROUGHT", tickNumber: 5 }],
        causalLinks: [
          {
            id: "l-1",
            runId: "walkthrough-1",
            eventId: "e-crop",
            causeEventId: "e-drought",
            kind: "DIRECT",
            evidence: {},
          },
        ],
      },
    ],
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
          { id: "build-irrigation", outcome: "Build irrigation", evidence: {}, confidence: 0.7 },
          { id: "maintain-dry-farming", outcome: "Maintain dry farming", evidence: {}, confidence: 0.4 },
        ],
        status: "PROPOSED",
      },
    ],
    events: [{ id: "e-drought", kind: "DROUGHT", tickNumber: 5 }],
    causalLinks: [],
  }),
  resumeIrrigationScenario: () => ({
    runId: "walkthrough-1",
    status: "COMPLETED",
    ticks: [],
    finalState: {
      tick: 20,
      population: 491,
      foodSecurity: 0.7,
      grainSurplus: 120,
      infrastructure: 0.55,
      irrigationKnown: true,
      irrigationBuilt: true,
      irrigationBuildProgress: 0.83,
      droughtActive: false,
    },
    proposals: [],
    events: [],
    causalLinks: [],
  }),
  DROUGHT_TICK: 5,
  PROPOSAL_TICK: 10,
}));

const mockRuns: SimulationRunShape[] = [
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
    pauseReason: null,
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
    pauseReason: null,
    createdAt: "2026-10-06T00:00:00Z",
  },
];

describe("SimulationRunList", () => {
  it("renders runs with status badges", () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: mockRuns, loading: false, loadError: false },
    });
    expect(wrapper.find('[data-testid="sim-run-run-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-run-run-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-run-status-run-1"]').text()).toContain("RUNNING");
    expect(wrapper.find('[data-testid="sim-run-status-run-2"]').text()).toContain("PAUSED_PROPOSAL");
  });

  it("filters by status", async () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: mockRuns, loading: false, loadError: false },
    });
    const select = wrapper.find('[data-testid="sim-status-filter"]');
    await select.setValue("RUNNING");
    expect(wrapper.find('[data-testid="sim-run-run-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-run-run-2"]').exists()).toBe(false);
  });

  it("shows empty state", () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: [], loading: false, loadError: false },
    });
    expect(wrapper.find('[data-testid="sim-no-runs"]').exists()).toBe(true);
  });

  it("emits create and select", async () => {
    const wrapper = mount(SimulationRunList, {
      props: { runs: mockRuns, loading: false, loadError: false },
    });
    await wrapper.find('[data-testid="sim-run-create-open"]').trigger("click");
    expect(wrapper.emitted("create")).toBeTruthy();
    await wrapper.find('[data-testid="sim-run-open-run-1"]').trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["run-1"]);
  });
});

describe("SimulationRunCreate", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("submits create with branch, seed, maxTicks", async () => {
    apiMock.mockResolvedValue({ run: { id: "new-run-1" } });
    const wrapper = mount(SimulationRunCreate, {
      props: {
        open: true,
        workspaceId: "ws-1",
        novelId: "novel-1",
        branches: [{ id: "b-1", name: "main" }],
      },
    });
    await wrapper.find('[data-testid="sim-create-branch"]').setValue("b-1");
    await wrapper.find('[data-testid="sim-create-seed"]').setValue("test-seed");
    await wrapper.find('[data-testid="sim-create-max-ticks"]').setValue(50);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/simulations",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(apiMock.mock.calls[0]![1].body);
    expect(body.branchId).toBe("b-1");
    expect(body.scenario.seed).toBe("test-seed");
    expect(body.scenario.maxTicks).toBe(50);
    expect(wrapper.emitted("created")?.[0]).toEqual(["new-run-1"]);
  });
});

describe("ProposalReview", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  const mockProposal = {
    id: "prop-1",
    runId: "run-1",
    tickNumber: 10,
    kind: "OUTCOME_FORK",
    status: "PROPOSED",
    trigger: "NO_DOMINANT_OUTCOME",
    reason: "Uncertain future",
    rationale: null,
    chosenAlternativeId: null,
    createdAt: "2026-10-06T00:00:00Z",
    alternatives: [
      { id: "alt-a", outcome: { result: "A" }, evidence: {}, confidence: 0.6 },
      { id: "alt-b", outcome: { result: "B" }, evidence: {}, confidence: 0.4 },
    ],
  };

  it("requires explicit choice before approve (no silent default)", async () => {
    apiMock.mockResolvedValue({ proposals: [mockProposal] });
    const wrapper = mount(ProposalReview, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    // Approve without choosing → error, no API call.
    await wrapper.find('[data-testid="sim-proposal-approve-prop-1"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-proposal-decide-error-prop-1"]').exists()).toBe(true);
    expect(apiMock).toHaveBeenCalledTimes(1); // only the list call
  });

  it("approve with explicit choice calls decide with the choice", async () => {
    apiMock.mockResolvedValue({ proposals: [mockProposal] });
    const wrapper = mount(ProposalReview, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    await wrapper.find('[data-testid="sim-proposal-choose-prop-1-alt-a"]').trigger("click");
    apiMock.mockResolvedValue({ proposals: [] });
    await wrapper.find('[data-testid="sim-proposal-approve-prop-1"]').trigger("click");
    await flushPromises();
    const decideCall = apiMock.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("/decide"),
    );
    expect(decideCall).toBeTruthy();
    const body = JSON.parse(((decideCall as unknown[])[1] as { body: string }).body);
    expect(body.approve).toBe(true);
    expect(body.choice).toBe("alt-a");
  });

  it("reject needs no choice", async () => {
    apiMock.mockResolvedValue({ proposals: [mockProposal] });
    const wrapper = mount(ProposalReview, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    apiMock.mockResolvedValue({ proposals: [] });
    await wrapper.find('[data-testid="sim-proposal-reject-prop-1"]').trigger("click");
    await flushPromises();
    const decideCall = apiMock.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("/decide"),
    );
    expect(decideCall).toBeTruthy();
    const body = JSON.parse(((decideCall as unknown[])[1] as { body: string }).body);
    expect(body.approve).toBe(false);
  });
});

describe("CivilizationWalkthrough", () => {
  it("completes setup → drought → proposal → decision → outcomes", async () => {
    const wrapper = mount(CivilizationWalkthrough);
    await flushPromises();

    // Step 0: setup — initial population shown.
    expect(wrapper.find('[data-testid="sim-walkthrough-initial-pop"]').text()).toBe("500");

    // Begin → step 1 (run).
    await wrapper.find('[data-testid="sim-walkthrough-begin"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-walkthrough-content-run"]').exists()).toBe(true);

    // Continue → step 2 (drought).
    await wrapper.find('[data-testid="sim-walkthrough-to-drought"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-walkthrough-drought-callout"]').exists()).toBe(true);

    // Continue → step 3 (proposal).
    await wrapper.find('[data-testid="sim-walkthrough-to-proposal"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-walkthrough-proposal-callout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-walkthrough-alt-build-irrigation"]').exists()).toBe(true);

    // Decide without choice → error.
    await wrapper.find('[data-testid="sim-walkthrough-decide"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-walkthrough-decision-error"]').exists()).toBe(true);

    // Choose + decide → step 4 (outcomes).
    await wrapper.find('[data-testid="sim-walkthrough-choose-build-irrigation"]').trigger("click");
    await wrapper.find('[data-testid="sim-walkthrough-decide"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-walkthrough-content-outcomes"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-walkthrough-final-pop"]').text()).toBe("491");
  });
});

// ---------------------------------------------------------------------------
// NF-WF-024B: SimulationDebugger component tests.
// ---------------------------------------------------------------------------

import SimulationDebugger from "./SimulationDebugger.vue";

describe("024B SimulationDebugger", () => {
  beforeEach(() => {
    apiMock.mockReset();
    // getRun, listBreakpoints, getWatchValues.
    apiMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/breakpoints")) return { breakpoints: [] };
      if (url.endsWith("/watch")) return { watches: [] };
      return {
        run: {
          id: "run-1",
          novelId: "novel-1",
          branchId: "branch-1",
          isSimulationBranch: true,
          status: "RUNNING",
          currentTick: 5,
          maxTicks: 20,
          seed: "test",
          snapshotId: null,
          canonRevisionId: null,
          createdAt: new Date().toISOString(),
          scenario: null,
        },
      };
    });
  });

  it("renders the debugger with no run selected", async () => {
    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: null },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-debugger"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-no-run"]').exists()).toBe(true);
  });

  it("renders breakpoints, watch, replay, and trace sections for a run", async () => {
    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-debug-no-bps"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-no-watches"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-replay-slider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-step"]').exists()).toBe(true);
  });

  it("creates a TICK breakpoint via the form", async () => {
    apiMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST" && url.endsWith("/breakpoints")) {
        return {
          breakpoint: {
            id: "bp-1",
            runId: "run-1",
            kind: "TICK",
            predicate: { tickNumber: 5 },
            watch: false,
            enabled: true,
            createdAt: new Date().toISOString(),
          },
        };
      }
      if (url.endsWith("/breakpoints")) {
        return {
          breakpoints: [
            {
              id: "bp-1",
              runId: "run-1",
              kind: "TICK",
              predicate: { tickNumber: 5 },
              watch: false,
              enabled: true,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
      if (url.endsWith("/watch")) return { watches: [] };
      return {
        run: {
          id: "run-1",
          novelId: "novel-1",
          branchId: "branch-1",
          isSimulationBranch: true,
          status: "RUNNING",
          currentTick: 5,
          maxTicks: 20,
          seed: "test",
          snapshotId: null,
          canonRevisionId: null,
          createdAt: new Date().toISOString(),
          scenario: null,
        },
      };
    });

    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();

    // Select TICK kind (default), set tick number, create.
    await wrapper.find('[data-testid="sim-debug-new-tick"]').setValue(5);
    await wrapper.find('[data-testid="sim-debug-new-create"]').trigger("click");
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/breakpoints"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("event picker lists tick events and trace button mounts the causal chain", async () => {
    // F2 fix: the trace panel must be reachable from the UI.
    apiMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/breakpoints")) return { breakpoints: [] };
      if (url.endsWith("/watch")) return { watches: [] };
      if (url.includes("/ticks/")) {
        return {
          tick: {
            id: "tick-5",
            runId: "run-1",
            tickNumber: 5,
            stateBefore: {},
            stateAfter: {},
            events: [
              { id: "ev-drought", runId: "run-1", tickNumber: 5, kind: "DROUGHT", entityId: null, payload: {} },
              { id: "ev-famine", runId: "run-1", tickNumber: 5, kind: "FAMINE", entityId: "pop-1", payload: {} },
            ],
          },
        };
      }
      return {
        run: {
          id: "run-1",
          novelId: "novel-1",
          branchId: "branch-1",
          isSimulationBranch: true,
          status: "RUNNING",
          currentTick: 5,
          maxTicks: 20,
          seed: "test",
          snapshotId: null,
          canonRevisionId: null,
          pauseReason: null,
          createdAt: new Date().toISOString(),
          scenario: null,
        },
      };
    });

    const wrapper = mount(SimulationDebugger, {
      props: { workspaceId: "ws-1", novelId: "novel-1", runId: "run-1" },
    });
    await flushPromises();

    // Event picker renders with both events.
    expect(wrapper.find('[data-testid="sim-debug-tick-events-label"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-event-ev-drought"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sim-debug-event-ev-famine"]').exists()).toBe(true);

    // Clicking trace mounts the CausalChainView (trace panel reachable).
    await wrapper.find('[data-testid="sim-debug-trace-ev-drought"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sim-debug-trace-back"]').exists()).toBe(true);
    // Back button returns to the picker.
    await wrapper.find('[data-testid="sim-debug-trace-back"]').trigger("click");
    expect(wrapper.find('[data-testid="sim-debug-event-ev-drought"]').exists()).toBe(true);
  });
});
