/**
 * ApprovalsInbox component tests (NF-WF-018A).
 *
 * - Lists AWAITING_APPROVAL runs through the `?status=` filter.
 * - Approve calls decideRun with the park-time snapshotHash echoed from
 *   the run detail (never a guessed hash).
 * - A 409 STALE_APPROVAL surfaces the actionable message (not a raw
 *   code), and the run stays listed.
 * - Reject requires a reason; the confirm button stays disabled without one.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ApprovalsInbox from "./ApprovalsInbox.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => {
    // A minimal locale table: the refusal-message lookup in the component
    // treats a key whose translation equals the key as missing, so the
    // actionable codes the test asserts on must exist here.
    const table: Record<string, string> = {
      "aiStudio.approvals.errors.STALE_APPROVAL":
        "The approval snapshot changed since this run was parked. Reload the run and review the new snapshot before deciding.",
    };
    return {
      t: (path: string, params?: Record<string, string | number>) => {
        const s = table[path];
        if (s !== undefined) return s;
        let out = path;
        if (params) for (const [k, v] of Object.entries(params)) out += `|${k}=${v}`;
        return out;
      },
      locale: { value: "en" },
      setLocale: vi.fn(),
    };
  },
}));

const parkedRuns = [
  {
    id: "run-1",
    workflowId: "wf-1",
    workflowKey: "chapter-draft",
    workflowVersionNumber: 2,
    novelId: null,
    status: "AWAITING_APPROVAL",
    stepCount: 2,
    startedAt: "2026-10-06T00:00:00Z",
    completedAt: null,
  },
];

const runDetail = {
  ...parkedRuns[0],
  input: {},
  output: null,
  errorMessage: null,
  steps: [
    {
      stepKey: "human-review",
      sequence: 1,
      kind: "HUMAN_APPROVAL",
      status: "AWAITING_APPROVAL",
      agentKey: null,
      agentVersionNumber: null,
      skillKey: null,
      skillVersionNumber: null,
      generationId: null,
      output: null,
      errorMessage: null,
      latencyMs: null,
      approvalSnapshot: {
        material: {
          instruction: "Review the draft chapter.",
          priorOutcomes: {},
          workflowVersionNumber: 2,
          agentVersions: {},
          skillVersions: {},
        },
        snapshotHash: "a".repeat(64),
      },
    },
  ],
};

const listRunsMock = vi.fn();
const getRunMock = vi.fn();
const decideRunMock = vi.fn();

vi.mock("../../composables/useAiStudio", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../composables/useAiStudio")>();
  class TestDecisionError extends Error {
    constructor(
      readonly refusalCode: string,
      readonly status: number,
    ) {
      super(`${status} ${refusalCode}`);
      this.name = "DecisionError";
    }
  }
  // The factory is hoisted: expose the class for the test body to throw.
  (globalThis as Record<string, unknown>).__TestDecisionError = TestDecisionError;
  return {
    ...original,
    DecisionError: TestDecisionError,
    useAiStudio: () => ({
      listRuns: listRunsMock,
      getRun: getRunMock,
      decideRun: decideRunMock,
    }),
  };
});

const TestDecisionError = () =>
  (globalThis as Record<string, unknown>).__TestDecisionError as new (
    refusalCode: string,
    status: number,
  ) => Error;

function mountInbox(props: Record<string, unknown> = {}) {
  return mount(ApprovalsInbox, {
    props: { workspaceId: "ws-1", canDecide: true, ...props },
    attachTo: document.body,
  });
}

describe("ApprovalsInbox", () => {
  beforeEach(() => {
    listRunsMock.mockReset().mockResolvedValue(parkedRuns);
    getRunMock.mockReset().mockResolvedValue(runDetail);
    decideRunMock.mockReset().mockResolvedValue(runDetail);
    document.body.innerHTML = "";
  });

  it("lists parked runs through the ?status= filter", async () => {
    const wrapper = mountInbox();
    await flushPromises();
    expect(listRunsMock).toHaveBeenCalledWith("ws-1", {
      status: "AWAITING_APPROVAL",
      limit: 100,
    });
    expect(wrapper.text()).toContain("chapter-draft");
  });

  it("approve echoes the park-time snapshotHash from the run detail", async () => {
    const wrapper = mountInbox();
    await flushPromises();
    await wrapper.find("[data-testid='parked-run-1']").trigger("click");
    await flushPromises();
    const approve = wrapper
      .findAll("button")
      .find((b) => b.text().includes("aiStudio.approvals.approve"));
    await approve!.trigger("click");
    await flushPromises();
    const confirms = wrapper
      .findAll("button")
      .filter((b) => b.text() === "aiStudio.approvals.approve");
    // The dialog confirm is the last match (the dialog renders after the detail).
    const confirm = confirms[confirms.length - 1]!;
    await confirm.trigger("click");
    await flushPromises();
    expect(decideRunMock).toHaveBeenCalledWith(
      "ws-1",
      "run-1",
      "approve",
      "a".repeat(64),
      undefined,
    );
  });

  it("a STALE_APPROVAL refusal surfaces the actionable message", async () => {
    decideRunMock.mockRejectedValue(new (TestDecisionError())("STALE_APPROVAL", 409));
    const wrapper = mountInbox();
    await flushPromises();
    await wrapper.find("[data-testid='parked-run-1']").trigger("click");
    await flushPromises();
    const approve = wrapper
      .findAll("button")
      .find((b) => b.text().includes("aiStudio.approvals.approve"));
    await approve!.trigger("click");
    await flushPromises();
    const confirms = wrapper
      .findAll("button")
      .filter((b) => b.text() === "aiStudio.approvals.approve");
    // The dialog confirm is the last match (the dialog renders after the detail).
    const confirm = confirms[confirms.length - 1]!;
    await confirm.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("snapshot changed since this run was parked");
    // The run is still listed — the refusal did not silently drop it.
    expect(listRunsMock).toHaveBeenCalledTimes(1);
  });

  it("reject requires a reason before the confirm button enables", async () => {
    const wrapper = mountInbox();
    await flushPromises();
    await wrapper.find("[data-testid='parked-run-1']").trigger("click");
    await flushPromises();
    const reject = wrapper
      .findAll("button")
      .find((b) => b.text().includes("aiStudio.approvals.reject"));
    await reject!.trigger("click");
    await flushPromises();
    const confirm = wrapper.find("[data-autofocus]");
    expect((confirm.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.find("textarea").setValue("Not good enough");
    await flushPromises();
    expect((confirm.element as HTMLButtonElement).disabled).toBe(false);
    await confirm.trigger("click");
    await flushPromises();
    expect(decideRunMock).toHaveBeenCalledWith(
      "ws-1",
      "run-1",
      "reject",
      "a".repeat(64),
      "Not good enough",
    );
  });

  it("hides decide buttons when canDecide is false", async () => {
    const wrapper = mountInbox({ canDecide: false });
    await flushPromises();
    await wrapper.find("[data-testid='parked-run-1']").trigger("click");
    await flushPromises();
    const buttons = wrapper.findAll("button").map((b) => b.text());
    expect(buttons.some((t) => t.includes("aiStudio.approvals.approve"))).toBe(false);
    expect(buttons.some((t) => t.includes("aiStudio.approvals.reject"))).toBe(false);
  });
});
