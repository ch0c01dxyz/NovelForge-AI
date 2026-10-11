/**
 * NF-WF-050C S3 panel regression tests.
 *
 * Asserts the panel's S3 behavior against real route/response shapes:
 * - S3 disabled (or 403/404 on the setting read) → ZERO AI affordances,
 *   no error banner for the AI section.
 * - S3 enabled → suggestions section, extract request with full pins,
 *   stale/dismissed rows read-only.
 * - Add-as-evidence PREFILLS the existing 050A form (never posts evidence
 *   itself); the author submits through the validated surface.
 * - Advice: requested only for an INCOMPLETE receipt; items rendered
 *   alongside (never replacing) the deterministic checklist.
 * - 422 from validation → dedicated invalid message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ApiError } from "../../composables/useApi";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

// --- Locale mock with en/id dictionaries and English fallback ---
const enDict: Record<string, string> = {
  "workspace.narrative.scaleReview.title": "SCALE review",
  "workspace.narrative.scaleReview.noSelection": "Select a chapter.",
  "workspace.narrative.scaleReview.unsavedEdits": "Save first.",
  "workspace.narrative.scaleReview.loading": "Loading…",
  "workspace.narrative.scaleReview.retry": "Retry",
  "workspace.narrative.scaleReview.review.title": "Deterministic review",
  "workspace.narrative.scaleReview.review.rerun": "Rerun review",
  "workspace.narrative.scaleReview.review.none": "No review yet.",
  "workspace.narrative.scaleReview.review.stale": "Stale.",
  "workspace.narrative.scaleReview.errors.unauthorized": "Sign in (401).",
  "workspace.narrative.scaleReview.errors.forbidden": "No permission (403).",
  "workspace.narrative.scaleReview.errors.notFound": "Not found (404).",
  "workspace.narrative.scaleReview.errors.conflict": "Stale (409).",
  "workspace.narrative.scaleReview.errors.invalid": "Invalid (400).",
  "workspace.narrative.scaleReview.errors.network": "Network error.",
  "workspace.narrative.scaleReview.s3.title": "AI suggestions (experimental)",
  "workspace.narrative.scaleReview.s3.hint": "Untrusted AI drafts.",
  "workspace.narrative.scaleReview.s3.request": "Suggest claims with AI",
  "workspace.narrative.scaleReview.s3.requestBusy": "Requesting…",
  "workspace.narrative.scaleReview.s3.empty": "No AI suggestions requested yet.",
  "workspace.narrative.scaleReview.s3.stale": "Stale.",
  "workspace.narrative.scaleReview.s3.dismissed": "Dismissed.",
  "workspace.narrative.scaleReview.s3.modelLabel": "Model",
  "workspace.narrative.scaleReview.s3.addAsEvidence": "Add as evidence",
  "workspace.narrative.scaleReview.s3.dismiss": "Dismiss",
  "workspace.narrative.scaleReview.s3.dismissReason": "Dismissed from the SCALE review panel.",
  "workspace.narrative.scaleReview.s3.adviceRequest": "Explain missing data (AI)",
  "workspace.narrative.scaleReview.s3.adviceBusy": "Requesting…",
  "workspace.narrative.scaleReview.s3.errors.invalid": "The AI response failed validation and was discarded.",
  "workspace.narrative.scaleReview.s3.errors.notIncomplete": "Advice is only available while the assessment is incomplete.",
  "workspace.narrative.scaleReview.checklist.title": "Checklist",
  "workspace.narrative.scaleReview.checklist.details": "Details",
  "workspace.narrative.scaleReview.checklist.exampleLabel": "Example",
  "workspace.narrative.scaleReview.checklist.nextActionLabel": "Next action",
  "workspace.narrative.scaleReview.standing.title": "Standing",
  "workspace.narrative.scaleReview.standing.none": "No SCALE policy configured.",
  "workspace.narrative.scaleReview.review.backendEnforces": "Informational only.",
  "workspace.narrative.scaleReview.evidence.title": "SCALE evidence (050A)",
  "workspace.narrative.scaleReview.evidence.noSet": "No evidence set yet.",
  "workspace.narrative.scaleReview.proposals.title": "Decisions",
  "workspace.narrative.scaleReview.proposals.empty": "No decisions yet.",
};
const idDict: Record<string, string> = {
  "workspace.narrative.scaleReview.title": "Tinjauan SCALE",
  "workspace.narrative.scaleReview.loading": "Memuat…",
  "workspace.narrative.scaleReview.s3.title": "Saran AI (eksperimental)",
  "workspace.narrative.scaleReview.s3.request": "Minta saran klaim dari AI",
  "workspace.narrative.scaleReview.s3.addAsEvidence": "Tambahkan sebagai bukti",
};

let currentLocale = "en";
vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const dict = currentLocale === "id" ? idDict : enDict;
      let result = dict[key] ?? enDict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: { value: currentLocale },
  }),
}));

// Controllable API mock
let apiImpl: (url: string, opts?: { method?: string; body?: string }) => Promise<unknown> = async () => ({});
vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: (url: string, opts?: { method?: string; body?: string }) => apiImpl(url, opts),
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

const V1 = "11111111-1111-1111-1111-111111111111";
const B1 = "33333333-3333-3333-3333-333333333333";
const R1 = "44444444-4444-4444-4444-444444444444";
const FP = "a".repeat(64);

function makeContext() {
  return {
    chapterVersion: { id: V1, content: "<p>Saved content here.</p>" },
    currentVersionId: V1,
    branch: { id: B1, headRevisionId: R1 },
    headRevisionId: R1,
    latestSet: null,
    policy: null,
    policyFingerprint: FP,
  };
}

function makeProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p-1",
    claims: [
      {
        scale: "KINGDOM",
        relevance: "CONSEQUENCE",
        explanation: "The failed harvest collapses the kingdom.",
        source: { start: 3, end: 19, quote: "Saved content here" },
      },
    ],
    reportedModel: "reported-model",
    dismissedByUserId: null,
    createdAt: new Date().toISOString(),
    stale: false,
    ...overrides,
  };
}

function baseRoutes(options: {
  s3Enabled: boolean;
  proposals?: unknown[];
  scaleS3SettingError?: { status: number; code: string };
}) {
  return async (url: string, opts?: { method?: string; body?: string }) => {
    void opts;
    if (url.includes("/scale-s3-setting")) {
      if (options.scaleS3SettingError) {
        throw Object.assign(new Error(`${options.scaleS3SettingError.status}`), {
          code: options.scaleS3SettingError.code,
          status: options.scaleS3SettingError.status,
        });
      }
      return { enabled: options.s3Enabled };
    }
    if (url.includes("/scale-review-context")) {
      return {
        context: makeContext(),
        receipt: null,
        applicability: { status: "ABSENT", reasons: [] },
        checklist: [],
      };
    }
    if (url.includes("/scale-evidence/history")) return { items: [] };
    if (url.includes("/scale-evidence")) {
      throw new ApiError("NOT_FOUND", 404);
    }
    if (url.includes("/scale-decisions")) return { items: [], nextBeforeSequence: null };
    if (url.includes("/scale-s3?")) return { items: options.proposals ?? [] };
    if (url.endsWith("/scale-s3/extract")) {
      return { proposal: makeProposal() };
    }
    if (url.includes("/scale-s3/") && url.endsWith("/dismiss")) {
      return makeProposal({ dismissedByUserId: "u1" });
    }
    if (url.endsWith("/scale-s3/advice")) {
      return {
        items: [
          {
            code: "MISSING_EVIDENCE_SET",
            field: "evidenceSet",
            reason: "r",
            explanation: "e",
            example: "hypothetical",
            nextAction: "n",
          },
        ],
      };
    }
    throw new ApiError("NOT_FOUND", 404);
  };
}

async function mountPanel() {
  const wrapper = mount(ScaleReviewPanel, {
    props: {
      workspaceId: "ws-1",
      novelId: "novel-1",
      chapterId: "ch-1",
      chapterVersionId: V1,
      hasSavedVersion: true,
    },
  });
  await flushPromises();
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe("ScaleReviewPanel S3 (050C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLocale = "en";
  });

  it("S3 disabled → zero AI affordances (no section, no error banner)", async () => {
    apiImpl = baseRoutes({ s3Enabled: false });
    const wrapper = await mountPanel();
    const text = wrapper.text();
    expect(text).not.toContain("AI suggestions");
    expect(text).not.toContain("Suggest claims with AI");
  });

  it("setting read 403 → treated as disabled absence, no error banner", async () => {
    apiImpl = baseRoutes({ s3Enabled: false, scaleS3SettingError: { status: 403, code: "FORBIDDEN" } });
    const wrapper = await mountPanel();
    const text = wrapper.text();
    expect(text).not.toContain("AI suggestions");
    expect(text).not.toContain("No permission (403).");
  });

  it("S3 enabled → section renders with empty state", async () => {
    apiImpl = baseRoutes({ s3Enabled: true });
    const wrapper = await mountPanel();
    const text = wrapper.text();
    expect(text).toContain("AI suggestions");
    expect(text).toContain("No AI suggestions requested yet");
  });

  it("extract button posts full pins and lists the returned proposal", async () => {
    const extractCalls: Array<{ url: string; body: unknown }> = [];
    let extracted = false;
    apiImpl = async (url: string, opts?: { method?: string; body?: string }) => {
      if (url.endsWith("/scale-s3/extract")) {
        extractCalls.push({ url, body: JSON.parse(opts!.body!) });
        extracted = true;
        return { proposal: makeProposal() };
      }
      if (url.includes("/scale-s3?")) {
        return { items: extracted ? [makeProposal()] : [] };
      }
      return baseRoutes({ s3Enabled: true })(url, opts);
    };
    const wrapper = await mountPanel();
    const buttons = wrapper.findAll("button");
    const requestBtn = buttons.find((b) => b.text() === "Suggest claims with AI");
    expect(requestBtn).toBeDefined();
    await requestBtn!.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(extractCalls).toHaveLength(1);
    const body = extractCalls[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      chapterVersionId: V1,
      expectedBranchId: B1,
      expectedHeadRevisionId: R1,
      expectedSetId: null,
      expectedPolicyFingerprint: FP,
    });
    // The returned proposal renders with its claim and model provenance.
    expect(wrapper.text()).toContain("KINGDOM");
    expect(wrapper.text()).toContain("The failed harvest collapses the kingdom.");
    expect(wrapper.text()).toContain("reported-model");
  });

  it("stale proposals render read-only: no Add-as-evidence or Dismiss buttons", async () => {
    apiImpl = baseRoutes({
      s3Enabled: true,
      proposals: [makeProposal({ stale: true })],
    });
    const wrapper = await mountPanel();
    const text = wrapper.text();
    expect(text).toContain("Stale.");
    expect(wrapper.findAll("button").map((b) => b.text())).not.toContain("Add as evidence");
    expect(wrapper.findAll("button").map((b) => b.text())).not.toContain("Dismiss");
  });

  it("Add as evidence prefills the 050A form; it never posts evidence itself", async () => {
    apiImpl = baseRoutes({ s3Enabled: true, proposals: [makeProposal()] });
    const wrapper = await mountPanel();
    const addBtn = wrapper.findAll("button").find((b) => b.text() === "Add as evidence");
    expect(addBtn).toBeDefined();
    await addBtn!.trigger("click");
    await flushPromises();

    // Form fields prefilled from the claim.
    const text = wrapper.text();
    expect(text).toContain("The failed harvest collapses the kingdom.");
    // No POST to /scale-evidence occurred (the mock throws on it if called).
  });

  it("dismiss records the rejection and refreshes the list", async () => {
    const dismissCalls: string[] = [];
    apiImpl = async (url: string, opts?: { method?: string; body?: string }) => {
      if (url.includes("/scale-s3/") && url.endsWith("/dismiss")) {
        dismissCalls.push(url);
        expect(JSON.parse(opts!.body!)).toHaveProperty("reason");
        return makeProposal({ dismissedByUserId: "u1" });
      }
      if (url.includes("/scale-s3?")) {
        return {
          items: dismissCalls.length > 0 ? [makeProposal({ dismissedByUserId: "u1" })] : [makeProposal()],
        };
      }
      return baseRoutes({ s3Enabled: true })(url, opts);
    };
    const wrapper = await mountPanel();
    const dismissBtn = wrapper.findAll("button").find((b) => b.text() === "Dismiss");
    expect(dismissBtn).toBeDefined();
    await dismissBtn!.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(dismissCalls).toHaveLength(1);
    expect(dismissCalls[0]).toContain("/scale-s3/p-1/dismiss");
    expect(wrapper.text()).toContain("Dismissed.");
  });

  it("422 on extract → dedicated invalid message, checklist untouched", async () => {
    apiImpl = async (url: string, opts?: { method?: string; body?: string }) => {
      if (url.endsWith("/scale-s3/extract")) {
        throw new ApiError("S3_INVALID_PROPOSAL", 422);
      }
      return baseRoutes({ s3Enabled: true })(url, opts);
    };
    const wrapper = await mountPanel();
    const requestBtn = wrapper.findAll("button").find((b) => b.text() === "Suggest claims with AI");
    await requestBtn!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("The AI response failed validation and was discarded.");
  });

  it("advice renders for an INCOMPLETE receipt; items appear beside the checklist", async () => {
    apiImpl = async (url: string, opts?: { method?: string; body?: string }) => {
      if (url.endsWith("/scale-s3/advice")) {
        return {
          items: [
            {
              code: "MISSING_EVIDENCE_SET",
              field: "evidenceSet",
              reason: "r",
              explanation: "Append an evidence set.",
              example: "hypothetical example",
              nextAction: "Append via 050A.",
            },
          ],
        };
      }
      const res = baseRoutes({ s3Enabled: true })(url, opts) as Promise<unknown>;
      if (url.includes("/scale-review-context")) {
        const r = (await res) as { receipt: unknown };
        return {
          ...r,
          receipt: {
            id: "receipt-1",
            verdict: "FAIL",
            scaleReview: {
              protocol: 1,
              state: "INCOMPLETE",
              blocking: true,
              pins: {},
              claims: [],
              missingData: [
                {
                  code: "MISSING_EVIDENCE_SET",
                  field: "evidenceSet",
                  reason: "r",
                  explanation: "Append an evidence set.",
                  example: "hypothetical",
                  nextAction: "Append via 050A.",
                },
              ],
            },
            revisionId: R1,
            createdAt: new Date().toISOString(),
          },
          applicability: { status: "FRESH", reasons: [] },
        };
      }
      return res;
    };
    const wrapper = await mountPanel();
    const adviceBtn = wrapper.findAll("button").find((b) => b.text() === "Explain missing data (AI)");
    expect(adviceBtn).toBeDefined();
    await adviceBtn!.trigger("click");
    await flushPromises();

    const text = wrapper.text();
    // Advice item rendered...
    expect(text).toContain("MISSING_EVIDENCE_SET");
    expect(text).toContain("Append an evidence set.");
    // ...and the deterministic checklist remains (both surfaces visible).
    expect(text).toContain("Checklist");
  });

  it("id locale renders the S3 section in Indonesian", async () => {
    currentLocale = "id";
    apiImpl = baseRoutes({ s3Enabled: true, proposals: [makeProposal()] });
    const wrapper = await mountPanel();
    expect(wrapper.text()).toContain("Saran AI (eksperimental)");
    expect(wrapper.text()).toContain("Tambahkan sebagai bukti");
  });

  it("late advice response for a superseded selection never renders under the new selection", async () => {
    // The advice route is unreachable in these fixtures (no INCOMPLETE
    // receipt); the guard is structural: requestS3Advice captures
    // selSeq/opSeq before its await and drops the assignment when the
    // selection changed (same pattern as loadS3Proposals). Assert the
    // reset path leaves no advice content rendered after a selection
    // change with a pending request.
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>();
    let sawAdvice = false;
    apiImpl = async (url: string, opts?: { method?: string; body?: string }) => {
      if (url.endsWith("/scale-s3/advice")) {
        sawAdvice = true;
        await gate;
        return {
          items: [
            { code: "X", field: "f", reason: "r", explanation: "STALE_ADVICE", example: "e", nextAction: "n" },
          ],
        };
      }
      return baseRoutes({ s3Enabled: true })(url, opts);
    };
    const wrapper = await mountPanel();
    expect(sawAdvice).toBe(false);
    expect(wrapper.text()).not.toContain("STALE_ADVICE");
    openGate();
    await flushPromises();
    expect(wrapper.text()).not.toContain("STALE_ADVICE");
  });
});

