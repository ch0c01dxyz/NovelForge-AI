/**
 * ScaleReviewPanel Slice 5 regression tests (NF-WF-050B fifth repair).
 *
 * Written FIRST (red) per task instructions. Each test asserts the
 * CORRECT behavior against actual server response shapes.
 *
 * Finding 3: superseded mutations must reconcile. A review finishes against
 * S1, then an older evidence POST commits S2. The UI must NOT continue
 * displaying the S1 review as fresh — it must reconcile the current
 * selection with a fresh read identity.
 *
 * Finding 4: the checklist is server-derived. The UI consumes the server's
 * checklist codes (never existence-based labels), with en/id localization
 * and English fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

// --- Locale mock with en/id dictionaries and English fallback ---
const enDict: Record<string, string> = {
  "workspace.scaleReview.title": "SCALE review",
  "workspace.scaleReview.noSelection": "Select a chapter in the workspace to review its SCALE assessment.",
  "workspace.scaleReview.unsavedEdits": "Save the chapter first — SCALE review runs against a saved version, not unsaved edits.",
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
  // Server-derived checklist item keys (slice 5)
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.label": "No review receipt",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.explanation": "EN explanation for absent receipt.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.example": "EN example for absent receipt.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.nextAction": "EN next action for absent receipt.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.label": "Review receipt is stale",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.explanation": "EN explanation for stale receipt.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.example": "EN example for stale receipt.",
  "workspace.scaleReview.checklist.items.RECEIPT_STALE.nextAction": "EN next action for stale receipt.",
};
const idDict: Record<string, string> = {
  "workspace.scaleReview.title": "Tinjauan SCALE",
  "workspace.scaleReview.review.stale": "Basi — data berubah sejak tinjauan ini.",
  "workspace.scaleReview.checklist.title": "Daftar periksa",
  "workspace.scaleReview.checklist.details": "Detail",
  "workspace.scaleReview.checklist.exampleLabel": "Contoh",
  "workspace.scaleReview.checklist.nextActionLabel": "Tindakan",
  // Server-derived checklist item keys (slice 5) — Indonesian
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.label": "Tidak ada receipt tinjauan",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.explanation": "Penjelasan ID untuk receipt yang hilang.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.example": "Contoh ID untuk receipt yang hilang.",
  "workspace.scaleReview.checklist.items.RECEIPT_ABSENT.nextAction": "Tindakan ID untuk receipt yang hilang.",
};

let currentLocale = "en";
vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const dict = currentLocale === "id" ? idDict : enDict;
      let result = dict[key] ?? enDict[key] ?? key; // English fallback
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, v);
        }
      }
      return result;
    },
    locale: { value: currentLocale },
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
const SET2 = "77777777-7777-7777-7777-777777777777";
const FP = "a".repeat(64);

function makeContext(setId: string | null) {
  return {
    chapterVersion: { id: V1, content: "<p>Saved content here.</p>" },
    currentVersionId: V1,
    branch: { id: B1, headRevisionId: R1 },
    headRevisionId: R1,
    latestSet: setId ? { id: setId } : null,
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
  };
}

function makeReceipt(setId: string) {
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
        evidenceSetId: setId,
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

function makeReviewProtocol(setId: string) {
  return {
    protocol: 1,
    state: "WITHIN_REACH",
    blocking: false,
    pins: {
      chapterVersionId: V1,
      branchId: B1,
      sourceRevisionId: R1,
      evidenceSetId: setId,
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
} as const;

describe("ScaleReviewPanel Slice 5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLocale = "en";
    apiImpl = async () => ({});
  });

  it("reconciles after a superseded evidence POST commits a newer set (S1 review must not stay fresh)", async () => {
    // Server-side truth: the latest committed evidence set.
    let committedSetId: string | null = SET1;
    let resolvePost: ((v: unknown) => void) | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-evidence") && method === "POST") {
        // Deferred POST: commits S2 only when the test resolves it.
        return new Promise((resolve) => {
          resolvePost = (v: unknown) => {
            committedSetId = SET2;
            resolve(v);
          };
        });
      }
      if (url.includes("scale-review-context")) {
        return {
          context: makeContext(committedSetId),
          receipt: makeReceipt(SET1),
          checklist: [],
        };
      }
      if (url.includes("final-text-review") && method === "POST") {
        return { scaleReview: makeReviewProtocol(SET1) };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    // 1. Start the evidence POST (older operation; deferred).
    const evidenceForm = wrapper.find('[data-testid="evidence-form"]');
    expect(evidenceForm.exists()).toBe(true);
    const declaration = evidenceForm.find('[data-testid="evidence-declaration"]');
    await declaration.setValue("NO_OPERATIVE_CONFLICT");
    await evidenceForm.trigger("submit");
    await flushPromises();
    expect(resolvePost).not.toBeNull();

    // 2. A newer review finishes against S1 while the POST is in flight.
    const rerunButton = wrapper.find('[data-testid="rerun-review"]');
    expect(rerunButton.exists()).toBe(true);
    await rerunButton.trigger("click");
    await flushPromises();
    // Review displayed and NOT stale: receipt pins S1, context latestSet S1.
    expect(wrapper.text()).not.toContain(enDict["workspace.scaleReview.review.stale"]);

    // 3. The older POST now commits S2 server-side.
    resolvePost!({ id: SET2 });
    await flushPromises();
    await flushPromises();

    // 4. The UI must reconcile: the S1 review is now stale, never fresh.
    expect(wrapper.text()).toContain(enDict["workspace.scaleReview.review.stale"]);
    wrapper.unmount();
  });

  it("renders the server-derived checklist in English", async () => {
    apiImpl = async (url: string) => {
      if (url.includes("scale-review-context")) {
        return {
          context: makeContext(null),
          receipt: null,
          checklist: [
            {
              code: "RECEIPT_ABSENT",
              severity: "fail",
              explanation: "Server EN explanation.",
              example: "Server EN example.",
              nextAction: "Server EN next action.",
              details: {},
            },
          ],
        };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    const text = wrapper.text();
    // Localized from i18n (not the server's English text, not existence labels).
    expect(text).toContain("No review receipt");
    expect(text).toContain("EN explanation for absent receipt.");
    expect(text).toContain("EN example for absent receipt.");
    expect(text).toContain("EN next action for absent receipt.");
    // The old existence-based labels must be gone.
    expect(text).not.toContain("SCALE policy configured");
    wrapper.unmount();
  });

  it("renders the server-derived checklist in Indonesian", async () => {
    currentLocale = "id";
    apiImpl = async (url: string) => {
      if (url.includes("scale-review-context")) {
        return {
          context: makeContext(null),
          receipt: null,
          checklist: [
            {
              code: "RECEIPT_ABSENT",
              severity: "fail",
              explanation: "Server EN explanation.",
              example: "Server EN example.",
              nextAction: "Server EN next action.",
              details: {},
            },
          ],
        };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Tidak ada receipt tinjauan");
    expect(text).toContain("Penjelasan ID untuk receipt yang hilang.");
    wrapper.unmount();
  });

  it("falls back to the server English text for checklist codes without a translation", async () => {
    apiImpl = async (url: string) => {
      if (url.includes("scale-review-context")) {
        return {
          context: makeContext(null),
          receipt: null,
          checklist: [
            {
              code: "SOME_FUTURE_CODE",
              severity: "warn",
              explanation: "Server English explanation.",
              example: "Server English example.",
              nextAction: "Server English next action.",
              details: {},
            },
          ],
        };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };

    const wrapper = mount(ScaleReviewPanel, { props: mountProps });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Server English explanation.");
    expect(text).toContain("Server English example.");
    expect(text).toContain("Server English next action.");
    wrapper.unmount();
  });
});
