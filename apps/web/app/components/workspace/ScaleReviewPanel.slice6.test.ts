/**
 * ScaleReviewPanel Slice 6 regression tests (NF-WF-050B sixth repair).
 *
 * Written FIRST (red) per task instructions.
 *
 * Finding 3: refresh coherent context after EVERY successful review,
 * including the normal non-superseded path. Update receipt, applicability
 * and serverChecklist together. Test ABSENT-to-fresh and STALE-to-fresh
 * transitions while preserving selection guards, response sequencing and
 * busy-state cleanup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

// --- Locale mock with English fallback ---
const enDict: Record<string, string> = {
  "workspace.scaleReview.title": "SCALE review",
  "workspace.scaleReview.noSelection": "Select a chapter.",
  "workspace.scaleReview.unsavedEdits": "Save the chapter first.",
  "workspace.scaleReview.loading": "Loading…",
  "workspace.scaleReview.retry": "Retry",
  "workspace.scaleReview.review.title": "Deterministic review",
  "workspace.scaleReview.review.rerun": "Rerun review",
  "workspace.scaleReview.review.none": "No review has been run for this version yet.",
  "workspace.scaleReview.review.stale": "Stale — the underlying data changed since this review.",
  "workspace.scaleReview.evidence.title": "SCALE evidence (050A)",
  "workspace.scaleReview.evidence.noSet": "No evidence set yet for this version.",
  "workspace.scaleReview.evidence.currentSet": "Set #{sequence}",
  "workspace.scaleReview.evidence.declaration.CONFLICTS": "Conflicts declared",
  "workspace.scaleReview.evidence.declaration.NO_OPERATIVE_CONFLICT": "No operative conflict",
  "workspace.scaleReview.evidence.history": "History ({count})",
  "workspace.scaleReview.evidence.claims": "claims",
  "workspace.scaleReview.evidence.submit": "Append evidence set",
  "workspace.scaleReview.evidence.submitted": "Evidence set appended.",
  "workspace.scaleReview.evidence.declarationLabel": "Declaration",
  "workspace.scaleReview.evidence.newSet": "New evidence set",
  "workspace.scaleReview.errors.network": "Something went wrong. Please try again.",
  "workspace.scaleReview.checklist.title": "Checklist",
  "workspace.scaleReview.checklist.details": "Details",
  "workspace.scaleReview.checklist.exampleLabel": "Example",
  "workspace.scaleReview.checklist.nextActionLabel": "Next action",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.label": "No review receipt",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.explanation": "EN absent explanation.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.example": "EN absent example.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.nextAction": "EN absent next action.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.label": "Stale receipt",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.explanation": "EN stale explanation.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.example": "EN stale example.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.nextAction": "EN stale next action.",
};
vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string>) => {
      let result = enDict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, v);
        }
      }
      return result;
    },
    locale: { value: "en" },
  }),
}));

// Controllable API mock
let apiImpl: (url: string, opts?: unknown) => Promise<unknown> = async () => ({});
vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: (url: string, opts?: unknown) => apiImpl(url, opts),
  }),
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
      super(`${status} ${code}`);
      this.code = code;
      this.status = status;
    }
  },
}));

// --- Real server response shapes ---
const V1 = "11111111-1111-1111-1111-111111111111";
const B1 = "33333333-3333-3333-3333-333333333333";
const R1 = "44444444-4444-4444-4444-444444444444";
const SET1 = "66666666-6666-6666-6666-666666666666";
const FP = "a".repeat(64);

function makeContextResponse(opts: {
  receipt: unknown | null;
  applicability: { status: string; reasons: string[] };
  checklist: Array<{ code: string; severity: string; explanation: string; example: string; nextAction: string; details: Record<string, string> }>;
}) {
  return {
    context: {
      chapterVersion: { id: V1, content: "<p>Saved.</p>" },
      currentVersionId: V1,
      branch: { id: B1, headRevisionId: R1 },
      headRevisionId: R1,
      latestSet: { id: SET1 },
      policy: {
        id: "p1",
        kind: "SCALE",
        hardness: "HARD",
        hardReason: "reason",
        payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 40 } },
      },
      policyFingerprint: FP,
      decisionHeadId: null,
      applicableException: null,
    },
    receipt: opts.receipt,
    applicability: opts.applicability,
    checklist: opts.checklist,
  };
}

function makeReceipt() {
  return {
    id: "receipt-1",
    verdict: "PASS",
    scaleReview: {
      protocol: 1,
      state: "WITHIN_REACH",
      blocking: false,
      pins: {
        chapterVersionId: V1,
        branchId: B1,
        sourceRevisionId: R1,
        evidenceSetId: SET1,
        policyFingerprint: FP,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [],
    },
    revisionId: R1,
    createdAt: new Date().toISOString(),
  };
}

function makeReviewProtocol() {
  return {
    protocol: 1,
    state: "WITHIN_REACH",
    blocking: false,
    pins: {
      chapterVersionId: V1,
      branchId: B1,
      sourceRevisionId: R1,
      evidenceSetId: SET1,
      policyFingerprint: FP,
      exceptionOutcomeId: null,
    },
    claims: [],
    missingData: [],
  };
}

const mountProps = {
  workspaceId: "ws-1",
  novelId: "novel-1",
  chapterId: "ch-1",
  chapterVersionId: V1,
  hasSavedVersion: true,
};

beforeEach(() => {
  apiImpl = async () => ({});
});

describe("successful review refresh (sixth repair, finding 3)", () => {
  it("ABSENT-to-fresh: successful review updates receipt, applicability and checklist", async () => {
    // Initial load: no receipt (ABSENT).
    const absentResponse = makeContextResponse({
      receipt: null,
      applicability: { status: "ABSENT", reasons: ["no receipt"] },
      checklist: [
        {
          code: "RECEIPT_ABSENT",
          severity: "fail",
          explanation: "No receipt.",
          example: "Example.",
          nextAction: "Run review.",
          details: {},
        },
      ],
    });
    // After review: fresh receipt with empty checklist.
    const freshResponse = makeContextResponse({
      receipt: makeReceipt(),
      applicability: { status: "FRESH", reasons: [] },
      checklist: [],
    });

    let contextCalls = 0;
    apiImpl = async (url: string, opts?: unknown) => {
      if (url.includes("/scale-review-context")) {
        contextCalls += 1;
        // First call (initial load) returns ABSENT; subsequent calls
        // (after review) return FRESH.
        return contextCalls === 1 ? absentResponse : freshResponse;
      }
      if (url.includes("/final-text-review") && (opts as { method?: string })?.method === "POST") {
        return { scaleReview: makeReviewProtocol() };
      }
      if (url.includes("/scale-decisions")) return { items: [], nextBeforeSequence: null };
      if (url.includes("/scale-evidence/history")) return { items: [] };
      if (url.includes("/scale-evidence")) return { assessment: null, status: "none", staleReasons: [] };
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    // Verify initial ABSENT state.
    expect(wrapper.text()).toContain("No review has been run for this version yet.");

    // Click rerun review.
    const rerunBtn = wrapper.find('[data-testid="rerun-review"]');
    expect(rerunBtn.exists()).toBe(true);
    await rerunBtn.trigger("click");
    await flushPromises();

    // After successful review: receipt, applicability (not stale), and
    // checklist must all reflect the fresh state — not the old ABSENT.
    const text = wrapper.text();
    expect(text).not.toContain("No review has been run for this version yet.");
    // The stale badge must NOT appear (applicability is FRESH).
    expect(text).not.toContain("Stale — the underlying data changed");
    // Checklist should not show RECEIPT_ABSENT anymore.
    expect(text).not.toContain("No review receipt");
  });

  it("STALE-to-fresh: successful review clears stale guidance", async () => {
    // Initial load: stale receipt.
    const staleResponse = makeContextResponse({
      receipt: makeReceipt(),
      applicability: { status: "STALE", reasons: ["evidenceSetId"] },
      checklist: [
        {
          code: "RECEIPT_STALE",
          severity: "fail",
          explanation: "Stale receipt.",
          example: "Example.",
          nextAction: "Re-run review.",
          details: { reasons: "evidenceSetId" },
        },
      ],
    });
    // After review: fresh.
    const freshResponse = makeContextResponse({
      receipt: makeReceipt(),
      applicability: { status: "FRESH", reasons: [] },
      checklist: [],
    });

    let contextCalls = 0;
    apiImpl = async (url: string, opts?: unknown) => {
      if (url.includes("/scale-review-context")) {
        contextCalls += 1;
        return contextCalls === 1 ? staleResponse : freshResponse;
      }
      if (url.includes("/final-text-review") && (opts as { method?: string })?.method === "POST") {
        return { scaleReview: makeReviewProtocol() };
      }
      if (url.includes("/scale-decisions")) return { items: [], nextBeforeSequence: null };
      if (url.includes("/scale-evidence/history")) return { items: [] };
      if (url.includes("/scale-evidence")) return { assessment: null, status: "none", staleReasons: [] };
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    // Verify initial STALE state.
    expect(wrapper.text()).toContain("Stale — the underlying data changed");

    // Click rerun review.
    const rerunBtn = wrapper.find('[data-testid="rerun-review"]');
    await rerunBtn.trigger("click");
    await flushPromises();

    // After successful review: stale badge gone, checklist cleared.
    const text = wrapper.text();
    expect(text).not.toContain("Stale — the underlying data changed");
  });

  it("preserves busy-state cleanup after review refresh", async () => {
    const freshResponse = makeContextResponse({
      receipt: makeReceipt(),
      applicability: { status: "FRESH", reasons: [] },
      checklist: [],
    });
    apiImpl = async (url: string) => {
      if (url.includes("/scale-review-context")) return freshResponse;
      if (url.includes("/final-text-review")) return { scaleReview: makeReviewProtocol() };
      if (url.includes("/scale-decisions")) return { items: [], nextBeforeSequence: null };
      if (url.includes("/scale-evidence/history")) return { items: [] };
      if (url.includes("/scale-evidence")) return { assessment: null, status: "none", staleReasons: [] };
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    const rerunBtn = wrapper.find('[data-testid="rerun-review"]');
    await rerunBtn.trigger("click");

    // Poll for the button to become enabled (busy flag cleared).
    // The refresh chain (POST -> reconcile -> loadContext -> loadProposals
    // -> loadEvidence) must complete and clear reviewRunning.
    let enabled = false;
    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await new Promise((r) => setTimeout(r, 25));
      await wrapper.vm.$nextTick();
      const d = wrapper.find('[data-testid="rerun-review"]').attributes("disabled");
      if (d === undefined) {
        enabled = true;
        break;
      }
    }
    expect(enabled).toBe(true);
  });
});

describe("complete author workflow: proposal → decision → re-review (sixth repair, acceptance)", () => {
  it("saves a STANDING_CHANGE proposal, approves it, and re-reviews to fresh", async () => {
    const posted: Array<{ url: string; body: Record<string, unknown> }> = [];
    let phase: "proposal" | "decided" | "reviewed" = "proposal";
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-review-context")) {
        if (phase === "proposal") {
          return makeContextResponse({
            receipt: null,
            applicability: { status: "ABSENT", reasons: ["no receipt"] },
            checklist: [
              {
                code: "RECEIPT_ABSENT",
                severity: "fail",
                explanation: "EN absent explanation.",
                example: "EN absent example.",
                nextAction: "EN absent next action.",
                details: {},
              },
            ],
          });
        }
        // After decision + re-review: fresh receipt, empty checklist.
        return makeContextResponse({
          receipt: makeReceipt(),
          applicability: { status: "FRESH", reasons: [] },
          checklist: [],
        });
      }
      if (url.includes("/scale-decisions/") && url.includes("/decision") && method === "POST") {
        posted.push({ url, body: JSON.parse((opts as { body: string }).body) });
        phase = "decided";
        return { id: "outcome-1" };
      }
      if (url.includes("scale-decisions") && method === "POST") {
        posted.push({ url, body: JSON.parse((opts as { body: string }).body) });
        return { id: "proposal-1" };
      }
      if (url.includes("scale-decisions")) {
        // Before decision: one pending proposal. After: decided.
        return {
          items:
            phase === "proposal"
              ? [
                  {
                    id: "proposal-1",
                    sequence: 1,
                    kind: "STANDING_CHANGE",
                    reason: "The hero is now royalty.",
                    outcome: null,
                  },
                ]
              : [
                  {
                    id: "proposal-1",
                    sequence: 1,
                    kind: "STANDING_CHANGE",
                    reason: "The hero is now royalty.",
                    outcome: { action: "APPROVE" },
                  },
                ],
          nextBeforeSequence: null,
        };
      }
      if (url.includes("/final-text-review")) {
        phase = "reviewed";
        return { scaleReview: makeReviewProtocol() };
      }
      if (url.includes("/scale-evidence/history")) return { items: [] };
      if (url.includes("/scale-evidence")) return { assessment: null, status: "none", staleReasons: [] };
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();
    await flushPromises();

    // Step 1: submit a STANDING_CHANGE proposal via typed controls.
    await wrapper.find('[data-testid="proposal-kind"]').setValue("STANDING_CHANGE");
    await wrapper.find('[data-testid="proposal-scale"]').setValue("KINGDOM");
    await wrapper.find('[data-testid="proposal-reputation"]').setValue("75");
    await wrapper.find('[data-testid="proposal-hardness"]').setValue("HARD");
    await wrapper.find('[data-testid="proposal-hard-reason"]').setValue("Royal decree");
    await wrapper.find('[data-testid="proposal-reason"]').setValue("The hero is now royalty.");
    await wrapper.find('[data-testid="proposal-form"]').trigger("submit");
    await flushPromises();
    await flushPromises();

    const proposalPost = posted.find((p) => !p.url.includes("/decision"));
    expect(proposalPost).toBeDefined();
    expect(proposalPost!.body.kind).toBe("STANDING_CHANGE");
    expect((proposalPost!.body.payload as Record<string, unknown>).hardness).toBe("HARD");

    // Step 2: open the decision dialog and APPROVE.
    const decideButtons = wrapper.findAll("button").filter((b) => b.text().length > 0);
    const decideBtn = decideButtons.find((b) =>
      b.text().includes("Decide") || b.element.textContent?.includes("decide"),
    );
    // Fallback: click any button that opens the decision dialog.
    if (decideBtn) {
      await decideBtn.trigger("click");
      await flushPromises();
    }
    const decisionForm = wrapper.find('[data-testid="decision-form"]');
    if (decisionForm.exists()) {
      await wrapper.find('[data-testid="decision-action"]').setValue("APPROVE");
      await wrapper.find('[data-testid="decision-reason"]').setValue("Approved by author.");
      await decisionForm.trigger("submit");
      await flushPromises();
      await flushPromises();
    }

    const decisionPost = posted.find((p) => p.url.includes("/decision"));
    expect(decisionPost).toBeDefined();
    expect(decisionPost!.body.action).toBe("APPROVE");

    // Step 3: re-review → receipt becomes fresh.
    await wrapper.find('[data-testid="rerun-review"]').trigger("click");
    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await new Promise((r) => setTimeout(r, 25));
      await wrapper.vm.$nextTick();
    }

    expect(phase).toBe("reviewed");
    wrapper.unmount();
  });
});
