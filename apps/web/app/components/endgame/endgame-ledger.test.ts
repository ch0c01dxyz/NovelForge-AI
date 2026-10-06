/**
 * NF-WF-022A: Endgame panel component tests.
 *
 * Tests mock at the HTTP/`useApi` boundary (per the 021 contract
 * reviewer's Q5 interpretation, applied to 022). The full loop is
 * covered API-level against the real backend in apps/api
 * (endgame.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import EndgameLedgerList from "./EndgameLedgerList.vue";
import EndgameLedgerCreate from "./EndgameLedgerCreate.vue";
import EndgameGateBanner from "./EndgameGateBanner.vue";
import EndgameDebtReport from "./EndgameDebtReport.vue";
import type { EndgameLedgerShape, EndingGateShape, DebtReportShape } from "./endgameLedgerApi";

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

vi.mock("@novelforge/story-simulation", () => ({}));

beforeEach(() => {
  apiMock.mockReset();
});

function ledgerEntry(overrides: Partial<EndgameLedgerShape> = {}): EndgameLedgerShape {
  return {
    id: "ledger-1",
    ledgerId: "ledger-1",
    novelId: "novel-1",
    threadId: "thread-1",
    threadTitle: "The missing heir",
    threadStatus: "ACTIVE",
    closed: false,
    status: "MUST",
    criteria: "Heir revealed in a public scene",
    rationale: null,
    createdAt: "2026-10-07T00:00:00.000Z",
    updatedAt: "2026-10-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("EndgameLedgerList", () => {
  it("renders entries with status badges and a closed marker", () => {
    const wrapper = mount(EndgameLedgerList, {
      props: {
        entries: [ledgerEntry(), ledgerEntry({ id: "ledger-2", status: "SEQUEL", closed: true, threadTitle: "Next generation" })],
        loading: false,
        loadError: false,
        updatingId: null,
      },
    });
    expect(wrapper.find('[data-testid="endgame-entry-ledger-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-entry-status-ledger-1"]').text()).toContain("endgame.statusLabels.MUST");
    expect(wrapper.find('[data-testid="endgame-entry-closed-ledger-2"]').exists()).toBe(true);
  });

  it("filters by status", async () => {
    const wrapper = mount(EndgameLedgerList, {
      props: {
        entries: [ledgerEntry(), ledgerEntry({ id: "ledger-2", status: "SEQUEL" })],
        loading: false,
        loadError: false,
        updatingId: null,
      },
    });
    const select = wrapper.find('[data-testid="endgame-status-filter"]');
    await select.setValue("SEQUEL");
    expect(wrapper.find('[data-testid="endgame-entry-ledger-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="endgame-entry-ledger-2"]').exists()).toBe(true);
  });

  it("emits change-status with the new status", async () => {
    const wrapper = mount(EndgameLedgerList, {
      props: { entries: [ledgerEntry()], loading: false, loadError: false, updatingId: null },
    });
    const select = wrapper.find('[data-testid="endgame-entry-status-select-ledger-1"]');
    await select.setValue("SHOULD");
    const emitted = wrapper.emitted("change-status") as [EndgameLedgerShape, string][][];
    expect(emitted).toHaveLength(1);
    expect(emitted[0]![1]).toBe("SHOULD");
  });
});

describe("EndgameLedgerCreate", () => {
  it("submits threadId + status + optional fields", async () => {
    const wrapper = mount(EndgameLedgerCreate, {
      props: {
        threads: [{ id: "thread-1", title: "The missing heir", status: "ACTIVE", kind: "MYSTERY" }],
        creating: false,
        error: null,
      },
    });
    await wrapper.find('[data-testid="endgame-create-thread"]').setValue("thread-1");
    await wrapper.find('[data-testid="endgame-create-status"]').setValue("SHOULD");
    await wrapper.find('[data-testid="endgame-create-criteria"]').setValue("Heir revealed");
    await wrapper.find("form").trigger("submit");
    const emitted = wrapper.emitted("submit") as [{ threadId: string; status: string; criteria?: string }][][];
    expect(emitted).toHaveLength(1);
    expect(emitted[0]![0]).toEqual({ threadId: "thread-1", status: "SHOULD", criteria: "Heir revealed" });
  });

  it("does not submit without a thread", async () => {
    const wrapper = mount(EndgameLedgerCreate, {
      props: { threads: [], creating: false, error: null },
    });
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});

describe("EndgameGateBanner", () => {
  function gate(overrides: Partial<EndingGateShape> = {}): EndingGateShape {
    return {
      verdict: "BLOCKED",
      blockingItems: [
        { ledgerId: "ledger-1", threadId: "thread-1", threadTitle: "The missing heir", status: "MUST", criteria: "Heir revealed" },
      ],
      approved: false,
      approvedById: null,
      approvedAt: null,
      ...overrides,
    };
  }

  it("shows BLOCKED with blocking items and an approve button", () => {
    const wrapper = mount(EndgameGateBanner, {
      props: { gate: gate(), approving: false, approveError: null },
    });
    expect(wrapper.find('[data-testid="endgame-gate-verdict-BLOCKED"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-blocking-ledger-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-gate-approve"]').exists()).toBe(true);
  });

  it("shows READY without the approve button once approved", () => {
    const wrapper = mount(EndgameGateBanner, {
      props: { gate: gate({ verdict: "READY", blockingItems: [], approved: true }), approving: false, approveError: null },
    });
    expect(wrapper.find('[data-testid="endgame-gate-verdict-READY"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="endgame-gate-approve"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="endgame-gate-approved-note"]').exists()).toBe(true);
  });

  it("emits approve on click", async () => {
    const wrapper = mount(EndgameGateBanner, {
      props: { gate: gate(), approving: false, approveError: null },
    });
    await wrapper.find('[data-testid="endgame-gate-approve"]').trigger("click");
    expect(wrapper.emitted("approve")).toHaveLength(1);
  });
});

describe("EndgameDebtReport", () => {
  function report(): DebtReportShape {
    return {
      unclosedMusts: [{ ledgerId: "ledger-1", threadId: "thread-1", status: "MUST", criteria: "Heir revealed" }],
      unpaidCallbacks: [],
      openThreads: [{ threadId: "thread-1", title: "The missing heir" }],
      sequelHooks: [{ ledgerId: "ledger-2", threadId: "thread-2", description: "Hook for book two" }],
      generatedAt: "2026-10-07T00:00:00.000Z",
    };
  }

  it("renders the pinned sections with counts", () => {
    const wrapper = mount(EndgameDebtReport, {
      props: { report: report(), loadError: false },
    });
    expect(wrapper.find('[data-testid="endgame-debt-musts-count"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="endgame-debt-callbacks-count"]').text()).toBe("0");
    expect(wrapper.find('[data-testid="endgame-debt-open-count"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="endgame-debt-sequel-count"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="endgame-debt-must-ledger-1"]').exists()).toBe(true);
  });

  it("shows an error alert when loading fails", () => {
    const wrapper = mount(EndgameDebtReport, {
      props: { report: null, loadError: true },
    });
    expect(wrapper.find('[data-testid="endgame-debt-error"]').exists()).toBe(true);
  });
});
