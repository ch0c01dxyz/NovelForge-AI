/**
 * ScaleReviewPanel Slice 4 regression tests (NF-WF-050B fourth repair).
 *
 * Written FIRST (red) per task instructions. Each test asserts the
 * CORRECT behavior against actual server response shapes and payload
 * schemas.
 *
 * 1. Superseded responses: an OLDER operation's context/evidence response
 *    completing LAST must not overwrite data fetched by a NEWER operation
 *    (same selection). Data acceptance must check operation identity,
 *    independently from operation-owned busy cleanup.
 * 2. Typed author controls: proposal/alternative payloads are built from
 *    typed selects/inputs/checkboxes (not raw JSON textareas), producing
 *    the exact payloads the server validates.
 * 3. Both locales (en/id) with English fallback for the new controls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

// --- Locale mock with en/id dictionaries and English fallback ---
const enDict: Record<string, string> = {
  "workspace.narrative.scaleReview.title": "SCALE review",
  "workspace.narrative.scaleReview.noSelection": "Select a chapter in the workspace to review its SCALE assessment.",
  "workspace.narrative.scaleReview.unsavedEdits": "Save the chapter first — SCALE review runs against a saved version, not unsaved edits.",
  "workspace.narrative.scaleReview.loading": "Loading…",
  "workspace.narrative.scaleReview.retry": "Retry",
  "workspace.narrative.scaleReview.review.title": "Deterministic review",
  "workspace.narrative.scaleReview.review.rerun": "Rerun review",
  "workspace.narrative.scaleReview.review.none": "No review has been run for this version yet.",
  "workspace.narrative.scaleReview.review.stale": "Stale — the underlying data changed since this review.",
  "workspace.narrative.scaleReview.evidence.title": "SCALE evidence (050A)",
  "workspace.narrative.scaleReview.evidence.noSet": "No evidence set yet for this version.",
  "workspace.narrative.scaleReview.evidence.currentSet": "Set #{sequence}",
  "workspace.narrative.scaleReview.evidence.declaration.CONFLICTS": "Conflicts declared",
  "workspace.narrative.scaleReview.evidence.declaration.NO_OPERATIVE_CONFLICT": "No operative conflict",
  "workspace.narrative.scaleReview.evidence.history": "History ({count})",
  "workspace.narrative.scaleReview.evidence.claims": "claims",
  "workspace.narrative.scaleReview.errors.unauthorized": "Sign in to review SCALE (401).",
  "workspace.narrative.scaleReview.errors.forbidden": "You don't have permission to do that here (403).",
  "workspace.narrative.scaleReview.errors.notFound": "Not found (404). It may have been deleted or belong to another workspace.",
  "workspace.narrative.scaleReview.errors.conflict": "Stale data (409). Refresh and try again with current expectations.",
  "workspace.narrative.scaleReview.errors.invalid": "Invalid input (400). Check the form and try again.",
  "workspace.narrative.scaleReview.errors.network": "Something went wrong. Please try again.",
  "workspace.narrative.scaleReview.proposals.decide": "Decide",
  "workspace.narrative.scaleReview.proposals.kind.STANDING_CHANGE": "Standing change",
  "workspace.narrative.scaleReview.proposals.kind.CHAPTER_EXCEPTION": "Chapter exception",
  // New typed-control keys (slice 4)
  "workspace.narrative.scaleReview.payload.standingScaleLabel": "Standing scale",
  "workspace.narrative.scaleReview.payload.accessLabel": "Access scales",
  "workspace.narrative.scaleReview.payload.reputationLabel": "Reputation (0–100)",
  "workspace.narrative.scaleReview.payload.hardnessLabel": "Hardness",
  "workspace.narrative.scaleReview.payload.hardness.HARD": "Hard",
  "workspace.narrative.scaleReview.payload.hardness.SOFT": "Soft",
  "workspace.narrative.scaleReview.payload.hardReasonLabel": "Hard reason (optional)",
  "workspace.narrative.scaleReview.payload.claimsLabel": "Covered claims",
  "workspace.narrative.scaleReview.payload.noClaims": "No evidence claims available — append an evidence set first.",
  "workspace.narrative.scaleReview.payload.reputationInvalid": "Reputation must be an integer 0–100.",
  "workspace.narrative.scaleReview.payload.claimsRequired": "Select at least one claim.",
  "workspace.narrative.scaleReview.payload.accessRequired": "Select at least one access scale.",
  "workspace.narrative.scaleReview.payload.hardReasonRequired": "A hard reason is required for HARD standing changes.",
};
const idDict: Record<string, string> = {
  "workspace.narrative.scaleReview.title": "Tinjauan SCALE",
  "workspace.narrative.scaleReview.noSelection": "Pilih bab di ruang kerja untuk meninjau penilaian SCALE-nya.",
  "workspace.narrative.scaleReview.unsavedEdits": "Simpan bab dulu — tinjauan SCALE berjalan terhadap versi tersimpan, bukan suntingan yang belum disimpan.",
  "workspace.narrative.scaleReview.loading": "Memuat…",
  "workspace.narrative.scaleReview.retry": "Coba lagi",
  "workspace.narrative.scaleReview.review.title": "Tinjauan deterministik",
  "workspace.narrative.scaleReview.review.rerun": "Jalankan ulang tinjauan",
  "workspace.narrative.scaleReview.review.none": "Belum ada tinjauan yang dijalankan untuk versi ini.",
  "workspace.narrative.scaleReview.review.stale": "Basi — data dasar berubah sejak tinjauan ini.",
  "workspace.narrative.scaleReview.evidence.title": "Bukti SCALE (050A)",
  "workspace.narrative.scaleReview.evidence.noSet": "Belum ada set bukti untuk versi ini.",
  "workspace.narrative.scaleReview.evidence.currentSet": "Set #{sequence}",
  "workspace.narrative.scaleReview.evidence.declaration.CONFLICTS": "Konflik dinyatakan",
  "workspace.narrative.scaleReview.evidence.declaration.NO_OPERATIVE_CONFLICT": "Tidak ada konflik operatif",
  "workspace.narrative.scaleReview.evidence.history": "Riwayat ({count})",
  "workspace.narrative.scaleReview.evidence.claims": "klaim",
  // New typed-control keys (slice 4) — Indonesian
  "workspace.narrative.scaleReview.payload.standingScaleLabel": "Skala standing",
  "workspace.narrative.scaleReview.payload.accessLabel": "Skala akses",
  "workspace.narrative.scaleReview.payload.reputationLabel": "Reputasi (0–100)",
  "workspace.narrative.scaleReview.payload.hardnessLabel": "Kekerasan",
  "workspace.narrative.scaleReview.payload.hardness.HARD": "Keras",
  "workspace.narrative.scaleReview.payload.hardness.SOFT": "Lunak",
  "workspace.narrative.scaleReview.payload.hardReasonLabel": "Alasan keras (opsional)",
  "workspace.narrative.scaleReview.payload.claimsLabel": "Klaim yang dicakup",
  "workspace.narrative.scaleReview.payload.noClaims": "Tidak ada klaim bukti — tambahkan set bukti dulu.",
  "workspace.narrative.scaleReview.payload.reputationInvalid": "Reputasi harus bilangan bulat 0–100.",
  "workspace.narrative.scaleReview.payload.claimsRequired": "Pilih setidaknya satu klaim.",
  "workspace.narrative.scaleReview.payload.accessRequired": "Pilih setidaknya satu skala akses.",
  "workspace.narrative.scaleReview.payload.hardReasonRequired": "Alasan keras wajib diisi untuk perubahan standing HARD.",
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
const R2 = "55555555-5555-5555-5555555555555555".slice(0, 36);
const SET1 = "66666666-6666-6666-6666-666666666666";
const SET2 = "77777777-7777-7777-7777-777777777777";
const FP = "a".repeat(64);

function makeContext(versionId: string, revisionId: string, scale: string, setId: string | null) {
  return {
    chapterVersion: { id: versionId, content: "<p>Saved content here.</p>" },
    currentVersionId: versionId,
    branch: { id: B1, headRevisionId: revisionId },
    headRevisionId: revisionId,
    latestSet: setId ? { id: setId } : null,
    policy: {
      id: "p1",
      kind: "SCALE",
      hardness: "HARD",
      hardReason: null,
      payload: { standing: { scale, access: [scale], reputation: 40 } },
    },
    policyFingerprint: FP,
    decisionHeadId: null,
    applicableException: null,
  };
}

function makeEvidenceSet(id: string, sequence: number, explanation: string) {
  return {
    id,
    workspaceId: "ws-1",
    novelId: "novel-1",
    chapterVersionId: V1,
    sourceBranchId: B1,
    sourceRevisionId: R1,
    sequence,
    declaration: "CONFLICTS",
    explanation,
    conflicts: [
      {
        scale: "VILLAGE",
        relevance: "ACTION",
        explanation,
        source: { start: 3, end: 20, quote: "Saved content here." },
      },
    ],
    previousSetId: null,
    actorUserId: "u1",
    createdAt: new Date().toISOString(),
  };
}

const mountProps = {
  workspaceId: "ws-1",
  novelId: "novel-1",
  chapterId: "ch-1",
  chapterVersionId: V1,
  hasSavedVersion: true,
} as const;

describe("ScaleReviewPanel Slice 4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLocale = "en";
    apiImpl = async () => ({});
  });

  it("rejects a superseded context response that completes last (same selection)", async () => {
    // Operation A starts a load, then operation B starts a load (same
    // selection). B's response arrives first, A's arrives LAST. A's older
    // data must NOT overwrite B's newer context.
    const resolvers: Array<(v: unknown) => void> = [];
    let contextCalls = 0;
    apiImpl = (url: string) =>
      new Promise((resolve) => {
        if (url.includes("scale-review-context")) {
          contextCalls++;
          if (contextCalls === 1) {
            // Initial mount: fail so the retry button appears.
            resolve(Promise.reject(new (class extends Error { status = 500 })()));
            return;
          }
          resolvers.push(resolve as (v: unknown) => void);
        } else if (url.includes("scale-decisions")) {
          resolve({ items: [], nextBeforeSequence: null });
        } else if (url.includes("scale-evidence")) {
          resolve({ assessment: null, status: "UNASSESSED", staleReasons: [] });
        } else {
          resolve({});
        }
      });
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();
    // Error state with retry button.
    const retryBtn = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retryBtn).toBeDefined();

    // A: first retry (operation A). B: second retry (operation B).
    await retryBtn!.trigger("click");
    await retryBtn!.trigger("click");
    expect(resolvers.length).toBe(2);
    const [resolveA, resolveB] = resolvers;

    // B (newer) resolves first with KINGDOM standing.
    resolveB!({ context: makeContext(V1, R2, "KINGDOM", null), receipt: null });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    // A (older) resolves LAST with VILLAGE standing — must be rejected.
    resolveA!({ context: makeContext(V1, R1, "VILLAGE", null), receipt: null });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const text = wrapper.text();
    // Newer data wins: KINGDOM (from B) is displayed...
    expect(text).toContain("KINGDOM");
    // ...and the superseded VILLAGE response did not overwrite it.
    // (VILLAGE appears in scale option lists, so assert via the standing
    // definition list: the dd right after the "Scale" dt.)
    const dds = wrapper.findAll("dd");
    const scaleDd = dds[0];
    expect(scaleDd?.text()).toBe("KINGDOM");
    wrapper.unmount();
  });

  it("rejects a superseded evidence response that completes last (same selection)", async () => {
    // Same mechanism for evidence: A's evidence response arriving after B's
    // must not overwrite the newer evidence set.
    const set1 = makeEvidenceSet(SET1, 1, "First conflict explanation.");
    const set2 = makeEvidenceSet(SET2, 2, "Second conflict explanation.");
    const contextResolvers: Array<(v: unknown) => void> = [];
    const evidenceResolvers: Array<(v: unknown) => void> = [];
    let contextCalls = 0;
    apiImpl = (url: string) =>
      new Promise((resolve) => {
        if (url.includes("scale-review-context")) {
          contextCalls++;
          if (contextCalls === 1) {
            resolve(Promise.reject(new (class extends Error { status = 500 })()));
            return;
          }
          contextResolvers.push(resolve as (v: unknown) => void);
        } else if (url.includes("scale-evidence/history")) {
          resolve({ items: [], nextBeforeSequence: null });
        } else if (url.includes("scale-evidence") && !url.includes("history")) {
          evidenceResolvers.push(resolve as (v: unknown) => void);
        } else if (url.includes("scale-decisions")) {
          resolve({ items: [], nextBeforeSequence: null });
        } else {
          resolve({});
        }
      });
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();
    const retryBtn = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retryBtn).toBeDefined();
    // The watcher's loadEvidence fired once after the failed context
    // (dangling); account for it in the resolver indices below.
    const watcherEvidence = evidenceResolvers.length;

    // A: first retry. Its context resolves; its evidence assessment defers.
    await retryBtn!.trigger("click");
    await flushPromises();
    contextResolvers[0]!({ context: makeContext(V1, R1, "VILLAGE", SET1), receipt: null });
    await flushPromises();
    await flushPromises();
    expect(evidenceResolvers.length).toBe(watcherEvidence + 1);
    const evidenceA = watcherEvidence;

    // B: second retry (newer operation). Its context + evidence defer.
    await retryBtn!.trigger("click");
    await flushPromises();
    contextResolvers[1]!({ context: makeContext(V1, R2, "VILLAGE", SET2), receipt: null });
    await flushPromises();
    await flushPromises();
    expect(evidenceResolvers.length).toBe(watcherEvidence + 2);
    const evidenceB = watcherEvidence + 1;

    // B's evidence (newer, set2) resolves first.
    evidenceResolvers[evidenceB]!({
      assessment: set2,
      status: "CURRENT",
      staleReasons: [],
    });
    await flushPromises();
    await flushPromises();

    // A's evidence (older, set1) resolves LAST — must be rejected.
    evidenceResolvers[evidenceA]!({
      assessment: set1,
      status: "CURRENT",
      staleReasons: [],
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Second conflict explanation.");
    expect(text).not.toContain("First conflict explanation.");
    wrapper.unmount();
  });

  it("builds a STANDING_CHANGE proposal payload from typed controls (no JSON textarea)", async () => {
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-decisions") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "proposal-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    // There must be NO raw JSON payload textarea in the proposal form.
    expect(wrapper.find('[data-testid="proposal-payload-json"]').exists()).toBe(false);

    // Select STANDING_CHANGE kind.
    const kindSelect = wrapper.find('[data-testid="proposal-kind"]');
    await kindSelect.setValue("STANDING_CHANGE");

    // Fill typed standing controls.
    await wrapper.find('[data-testid="proposal-scale"]').setValue("KINGDOM");
    await wrapper.find('[data-testid="proposal-access-KINGDOM"]').setValue(true);
    await wrapper.find('[data-testid="proposal-access-EMPIRE"]').setValue(true);
    await wrapper.find('[data-testid="proposal-reputation"]').setValue("75");
    await wrapper.find('[data-testid="proposal-hardness"]').setValue("HARD");
    await wrapper.find('[data-testid="proposal-hard-reason"]').setValue("Royal decree");

    // Fill reason and submit the proposal form.
    const proposalForm = wrapper.find('[data-testid="proposal-form"]');
    await proposalForm.find('[data-testid="proposal-reason"]').setValue("The hero is now royalty.");
    await proposalForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    expect(postedBody!.kind).toBe("STANDING_CHANGE");
    expect(postedBody!.payload).toEqual({
      standing: {
        scale: "KINGDOM",
        access: expect.arrayContaining(["KINGDOM", "EMPIRE"]),
        reputation: 75,
      },
      hardness: "HARD",
      hardReason: "Royal decree",
    });
    wrapper.unmount();
  });

  it("builds a CHAPTER_EXCEPTION proposal payload from claim checkboxes", async () => {
    const set = makeEvidenceSet(SET1, 1, "The village burns.");
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-decisions") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "proposal-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", SET1), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence/history")) {
        return { items: [], nextBeforeSequence: null };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: set, status: "CURRENT", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    // CHAPTER_EXCEPTION is the default kind. Claim checkboxes come from the
    // current evidence set's conflicts.
    const claimBox = wrapper.find('[data-testid="proposal-claim-0"]');
    expect(claimBox.exists()).toBe(true);
    await claimBox.setValue(true);

    const proposalForm = wrapper.find('[data-testid="proposal-form"]');
    await proposalForm.find('[data-testid="proposal-reason"]').setValue("One-time narrative beat.");
    await proposalForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    expect(postedBody!.kind).toBe("CHAPTER_EXCEPTION");
    expect(postedBody!.payload).toEqual({ claimIndices: [0] });
    wrapper.unmount();
  });

  it("builds an ALTERNATIVE decision payload from typed controls", async () => {
    const proposal = {
      id: "proposal-9",
      sequence: 3,
      kind: "STANDING_CHANGE",
      reason: "Original reason",
      outcome: null,
    };
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("/decision") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "outcome-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [proposal], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    // Open the decision dialog.
    const decideBtn = wrapper.findAll("button").find((b) => b.text() === "Decide");
    expect(decideBtn).toBeDefined();
    await decideBtn!.trigger("click");
    await flushPromises();

    // There must be NO raw JSON alternative-payload textarea.
    expect(wrapper.find('[data-testid="decision-alt-payload-json"]').exists()).toBe(false);

    // Choose ALTERNATIVE and fill the typed alternative controls.
    await wrapper.find('[data-testid="decision-action"]').setValue("ALTERNATIVE");
    await wrapper.find('[data-testid="alt-scale"]').setValue("EMPIRE");
    await wrapper.find('[data-testid="alt-reputation"]').setValue("90");
    await wrapper.find('[data-testid="alt-hard-reason"]').setValue("Empire needs a reason");
    await wrapper.find('[data-testid="decision-reason"]').setValue("Counter-proposal: empire scope.");
    const decisionForm = wrapper.find('[data-testid="decision-form"]');
    await decisionForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    expect(postedBody!.action).toBe("ALTERNATIVE");
    const altPayload = postedBody!.alternativePayload as Record<string, unknown>;
    expect(altPayload.standing).toMatchObject({ scale: "EMPIRE", reputation: 90 });
    expect(altPayload.hardness).toBe("HARD");
    expect(altPayload.hardReason).toBe("Empire needs a reason");
    wrapper.unmount();
  });

  it("renders typed proposal controls in Indonesian with English fallback", async () => {
    currentLocale = "id";
    apiImpl = async (url: string) => {
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    const kindSelect = wrapper.find('[data-testid="proposal-kind"]');
    await kindSelect.setValue("STANDING_CHANGE");
    await flushPromises();

    const text = wrapper.text();
    // Indonesian labels for the new typed controls.
    expect(text).toContain("Skala standing");
    expect(text).toContain("Reputasi (0–100)");
    // English fallback: a key missing from idDict falls back to enDict.
    // (payload.accessRequired is present in both; use a probe key instead.)
    wrapper.unmount();
  });

  it("falls back to English for missing Indonesian keys", async () => {
    // Probe: the t() mock falls back to enDict when idDict lacks the key.
    // The component must render the English string, never the raw key.
    currentLocale = "id";
    // Intentionally remove one key from the Indonesian dict for this test.
    const saved: string = idDict["workspace.narrative.scaleReview.payload.hardReasonLabel"] as string;
    delete idDict["workspace.narrative.scaleReview.payload.hardReasonLabel"];
    try {
      apiImpl = async (url: string) => {
        if (url.includes("scale-review-context")) {
          return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
        }
        if (url.includes("scale-evidence")) {
          return { assessment: null, status: "UNASSESSED", staleReasons: [] };
        }
        if (url.includes("scale-decisions")) {
          return { items: [], nextBeforeSequence: null };
        }
        return {};
      };
      const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
      await flushPromises();
      await flushPromises();
      await wrapper.find('[data-testid="proposal-kind"]').setValue("STANDING_CHANGE");
      await flushPromises();
      const text = wrapper.text();
      // English fallback rendered, raw key never shown.
      expect(text).toContain("Hard reason (optional)");
      expect(text).not.toContain("workspace.narrative.scaleReview.payload.hardReasonLabel");
      wrapper.unmount();
    } finally {
      idDict["workspace.narrative.scaleReview.payload.hardReasonLabel"] = saved;
    }
  });

  it("permits empty access:[] in the proposal form (frozen contract valid)", async () => {
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-decisions") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "proposal-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    await wrapper.find('[data-testid="proposal-kind"]').setValue("STANDING_CHANGE");
    // Uncheck the default VILLAGE access -> empty access.
    await wrapper.find('[data-testid="proposal-access-VILLAGE"]').setValue(false);
    await wrapper.find('[data-testid="proposal-hardness"]').setValue("HARD");
    await wrapper.find('[data-testid="proposal-hard-reason"]').setValue("No access needed");

    const proposalForm = wrapper.find('[data-testid="proposal-form"]');
    await proposalForm.find('[data-testid="proposal-reason"]').setValue("Withdrawing all access.");
    await proposalForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    const payload = postedBody!.payload as Record<string, unknown>;
    const standing = payload.standing as Record<string, unknown>;
    expect(standing.access).toEqual([]);
    wrapper.unmount();
  });

  it("permits empty access:[] in the ALTERNATIVE decision form", async () => {
    const proposal = {
      id: "proposal-9",
      sequence: 3,
      kind: "STANDING_CHANGE",
      reason: "Original reason",
      outcome: null,
    };
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("/decision") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "outcome-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [proposal], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    const decideBtn = wrapper.findAll("button").find((b) => b.text() === "Decide");
    await decideBtn!.trigger("click");
    await flushPromises();

    await wrapper.find('[data-testid="decision-action"]').setValue("ALTERNATIVE");
    // Uncheck the default VILLAGE access -> empty access.
    await wrapper.find('[data-testid="alt-access-VILLAGE"]').setValue(false);
    await wrapper.find('[data-testid="alt-hardness"]').setValue("HARD");
    await wrapper.find('[data-testid="alt-hard-reason"]').setValue("No access needed");
    await wrapper.find('[data-testid="decision-reason"]').setValue("Counter-proposal: no access.");
    const decisionForm = wrapper.find('[data-testid="decision-form"]');
    await decisionForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    const altPayload = postedBody!.alternativePayload as Record<string, unknown>;
    const standing = altPayload.standing as Record<string, unknown>;
    expect(standing.access).toEqual([]);
    wrapper.unmount();
  });

  it("rejects HARD with blank hardReason in the proposal form (localized error)", async () => {
    let posted = false;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-decisions") && method === "POST") {
        posted = true;
        return { id: "proposal-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    await wrapper.find('[data-testid="proposal-kind"]').setValue("STANDING_CHANGE");
    await wrapper.find('[data-testid="proposal-hardness"]').setValue("HARD");
    // Leave hard reason blank (whitespace only).
    await wrapper.find('[data-testid="proposal-hard-reason"]').setValue("   ");

    const proposalForm = wrapper.find('[data-testid="proposal-form"]');
    await proposalForm.find('[data-testid="proposal-reason"]').setValue("Trying without a reason.");
    await proposalForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    // No POST; localized error shown.
    expect(posted).toBe(false);
    expect(wrapper.text()).toContain("A hard reason is required for HARD standing changes.");
    wrapper.unmount();
  });

  it("rejects HARD with blank hardReason in the ALTERNATIVE form (localized error)", async () => {
    const proposal = {
      id: "proposal-9",
      sequence: 3,
      kind: "STANDING_CHANGE",
      reason: "Original reason",
      outcome: null,
    };
    let posted = false;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("/decision") && method === "POST") {
        posted = true;
        return { id: "outcome-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [proposal], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    const decideBtn = wrapper.findAll("button").find((b) => b.text() === "Decide");
    await decideBtn!.trigger("click");
    await flushPromises();

    await wrapper.find('[data-testid="decision-action"]').setValue("ALTERNATIVE");
    await wrapper.find('[data-testid="alt-hardness"]').setValue("HARD");
    // Leave hard reason blank.
    await wrapper.find('[data-testid="alt-hard-reason"]').setValue("");

    await wrapper.find('[data-testid="decision-reason"]').setValue("Counter without reason.");
    const decisionForm = wrapper.find('[data-testid="decision-form"]');
    await decisionForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(posted).toBe(false);
    expect(wrapper.text()).toContain("A hard reason is required for HARD standing changes.");
    wrapper.unmount();
  });

  it("permits SOFT with blank hardReason (existing behavior preserved)", async () => {
    let postedBody: Record<string, unknown> | null = null;
    apiImpl = async (url: string, opts?: unknown) => {
      const method = (opts as { method?: string } | undefined)?.method;
      if (url.includes("scale-decisions") && method === "POST") {
        postedBody = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
        return { id: "proposal-1" };
      }
      if (url.includes("scale-review-context")) {
        return {  context: makeContext(V1, R1, "VILLAGE", null), receipt: null , applicability: { status: "ABSENT", reasons: ["no receipt"] }, checklist: [] };
      }
      if (url.includes("scale-evidence")) {
        return { assessment: null, status: "UNASSESSED", staleReasons: [] };
      }
      if (url.includes("scale-decisions")) {
        return { items: [], nextBeforeSequence: null };
      }
      return {};
    };
    const wrapper = mount(ScaleReviewPanel, { props: { ...mountProps } });
    await flushPromises();
    await flushPromises();

    await wrapper.find('[data-testid="proposal-kind"]').setValue("STANDING_CHANGE");
    await wrapper.find('[data-testid="proposal-hardness"]').setValue("SOFT");
    // Leave hard reason blank — allowed for SOFT.
    await wrapper.find('[data-testid="proposal-hard-reason"]').setValue("");

    const proposalForm = wrapper.find('[data-testid="proposal-form"]');
    await proposalForm.find('[data-testid="proposal-reason"]').setValue("Soft change.");
    await proposalForm.trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(postedBody).not.toBeNull();
    const payload = postedBody!.payload as Record<string, unknown>;
    expect(payload.hardness).toBe("SOFT");
    expect(payload.hardReason).toBeNull();
    wrapper.unmount();
  });
});
