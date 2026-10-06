/**
 * Accessibility tests (NF-WF-022A): zero axe violations (wcag2aa +
 * wcag22aa tags) on every new Endgame panel surface.
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
import EndgameLedgerList from "../app/components/endgame/EndgameLedgerList.vue";
import EndgameLedgerCreate from "../app/components/endgame/EndgameLedgerCreate.vue";
import EndgameGateBanner from "../app/components/endgame/EndgameGateBanner.vue";
import EndgameDebtReport from "../app/components/endgame/EndgameDebtReport.vue";

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
    t: (path: string) => path,
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

vi.mock("@novelforge/story-simulation", () => ({}));

configureAxe({ rules: {} });

beforeEach(() => {
  apiMock.mockReset();
});

const entry = {
  id: "ledger-1",
  ledgerId: "ledger-1",
  novelId: "novel-1",
  threadId: "thread-1",
  threadTitle: "The missing heir",
  threadStatus: "ACTIVE",
  closed: false,
  status: "MUST" as const,
  criteria: "Heir revealed in a public scene",
  rationale: null,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
};

describe("endgame a11y", () => {
  it("ledger list has zero violations", async () => {
    const wrapper = mount(EndgameLedgerList, {
      props: { entries: [entry], loading: false, loadError: false, updatingId: null },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("create dialog has zero violations", async () => {
    const wrapper = mount(EndgameLedgerCreate, {
      props: {
        threads: [{ id: "thread-1", title: "The missing heir", status: "ACTIVE", kind: "MYSTERY" }],
        creating: false,
        error: null,
      },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("gate banner (BLOCKED) has zero violations", async () => {
    const wrapper = mount(EndgameGateBanner, {
      props: {
        gate: {
          verdict: "BLOCKED",
          blockingItems: [
            { ledgerId: "ledger-1", threadId: "thread-1", threadTitle: "The missing heir", status: "MUST", criteria: "Heir revealed" },
          ],
          approved: false,
          approvedById: null,
          approvedAt: null,
        },
        approving: false,
        approveError: null,
      },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("debt report has zero violations", async () => {
    const wrapper = mount(EndgameDebtReport, {
      props: {
        report: {
          unclosedMusts: [{ ledgerId: "ledger-1", threadId: "thread-1", status: "MUST", criteria: "Heir revealed" }],
          unpaidCallbacks: [],
          openThreads: [{ threadId: "thread-1", title: "The missing heir" }],
          sequelHooks: [],
          generatedAt: "2026-10-07T00:00:00.000Z",
        },
        loadError: false,
      },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
