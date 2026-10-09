<script setup lang="ts">
/**
 * SCALE review panel (NF-WF-050B): deterministic SCALE review, author
 * standing/exception decisions and the shared publication gate status.
 *
 * Receives the workspace's selected chapter from NarrativePanel (which
 * index.vue wires with the actual saved version context). No selection or
 * unsaved edits -> a clear save/select instruction, never invented IDs.
 *
 * Uses the scale-review-context API to fetch server-derived IDs. Offsets
 * and quotes refer to the saved sanitized HTML's UTF-16 positions; the
 * server validates every claim/proposal. UI status is informational only;
 * the backend independently enforces every mutation and release gate.
 *
 * No AI calls, settings or guidance (050C owns those).
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import ScalePayloadForm from "./ScalePayloadForm.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  /** Selected chapter ID, or null when nothing is selected. */
  chapterId: string | null;
  /**
   * Saved version UUID, or null when the server should derive the current
   * saved version. The context endpoint resolves it server-side.
   */
  chapterVersionId: string | null;
  /**
   * True when the selected chapter has a saved version (not dirty/unsaved).
   * When false with a selected chapter, shows the save-first instruction.
   */
  hasSavedVersion?: boolean;
}>();

const { t } = useLocale();
const { api } = useApi();

// --- Types (mirror the frozen server protocol shapes) ---
interface ScaleReviewContext {
  chapterVersion: { id: string; content: string };
  currentVersionId: string | null;
  branch: { id: string; headRevisionId: string | null };
  headRevisionId: string | null;
  latestSet: { id: string } | null;
  policy: {
    id: string;
    kind: string;
    hardness: "HARD" | "SOFT";
    hardReason: string | null;
    payload: unknown;
  } | null;
  policyFingerprint: string;
  decisionHeadId: string | null;
  applicableException: { outcomeId: string; proposalId: string } | null;
}

interface ScaleReviewProtocol {
  protocol: 1;
  state:
    | "NOT_CONFIGURED"
    | "INCOMPLETE"
    | "WITHIN_REACH"
    | "VIOLATION"
    | "EXCEPTED"
    | "NO_OPERATIVE_CONFLICT";
  blocking: boolean;
  pins: {
    chapterVersionId: string;
    branchId: string;
    sourceRevisionId: string | null;
    evidenceSetId: string | null;
    policyFingerprint: string;
    exceptionOutcomeId: string | null;
  };
  claims: Array<{
    index: number;
    scale: string;
    reach: string;
    gap: string;
    ok: boolean;
    span: { start: number; end: number };
    quote: string;
    coveredByException: boolean;
  }>;
  missingData: Array<{
    code: string;
    field: string;
    reason: string;
    explanation: string;
    example: string;
    nextAction: string;
  }>;
}

interface ScaleReviewContextResponse {
  context: ScaleReviewContext;
  receipt: {
    id: string;
    verdict: "PASS" | "FAIL";
    scaleReview: ScaleReviewProtocol | null;
    revisionId: string;
    createdAt: string;
  } | null;
  /** Server-derived receipt applicability (GAP-119 sixth repair). */
  applicability: {
    status: "ABSENT" | "LEGACY" | "STALE" | "FRESH";
    reasons: string[];
  };
  /** Server-derived deterministic checklist (GAP-119 fifth repair). */
  checklist: Array<{
    code: string;
    severity: "fail" | "warn";
    explanation: string;
    example: string;
    nextAction: string;
    details: Record<string, string>;
  }>;
}

interface ProposalRow {
  id: string;
  sequence: number;
  kind: "STANDING_CHANGE" | "CHAPTER_EXCEPTION";
  payload: unknown;
  reason: string;
  proposerUserId: string;
  createdAt: string;
  outcome: {
    id: string;
    sequence: number;
    action: "APPROVE" | "REJECT" | "ALTERNATIVE";
    actorUserId: string;
    reason: string;
    createdAt: string;
  } | null;
}

// --- State ---
type LoadState = "idle" | "loading" | "loaded" | "error";
const loadState = ref<LoadState>("idle");
const loadError = ref<string | null>(null);
const loadErrorStatus = ref<number | null>(null);
const context = ref<ScaleReviewContext | null>(null);
const review = ref<ScaleReviewProtocol | null>(null);
const reviewStale = ref(false);
/**
 * Server-derived deterministic checklist for the current context
 * (GAP-119 fifth repair, finding 4). Consumed verbatim — the UI never
 * invents existence-based pass/warn labels.
 */
const serverChecklist = ref<ScaleReviewContextResponse["checklist"]>([]);
const proposals = ref<ProposalRow[]>([]);
const proposalsLoading = ref(false);
const proposalsError = ref<string | null>(null);

// Selection identity: bumped ONLY on selection change or unmount.
// Guards against applying late responses to a different chapter/version.
let selectionSeq = 0;
// Operation identity: bumped at the start of each top-level operation
// (load, rerun, submit). Separate from selection so a concurrent
// successful mutation cannot suppress another operation's busy cleanup.
// Internal refresh helpers receive the parent's IDs and never bump.
let operationSeq = 0;
// Unmount guard: never update state after unmount.
let isUnmounted = false;
onUnmounted(() => {
  isUnmounted = true;
  selectionSeq++; // invalidate any in-flight requests
});

const base = () =>
  `/workspaces/${props.workspaceId}/novels/${props.novelId}/chapters/${props.chapterId}`;

const hasSelection = computed(() => props.chapterId !== null);
// Server derives the current saved version when chapterVersionId is null;
// hasSavedVersion indicates the chapter is saved (not dirty).
const hasSavedVersion = computed(
  () => props.chapterId !== null && (props.hasSavedVersion ?? props.chapterVersionId !== null),
);
// The effective version ID: prop or server-derived from context response.
const effectiveVersionId = ref<string | null>(props.chapterVersionId);
// Latest review receipt from the context snapshot (null = none yet).
const receipt = ref<ScaleReviewContextResponse["receipt"]>(null);

function statusErrorKey(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return t("workspace.scaleReview.errors.unauthorized");
    if (e.status === 403) return t("workspace.scaleReview.errors.forbidden");
    if (e.status === 404) return t("workspace.scaleReview.errors.notFound");
    if (e.status === 409) return t("workspace.scaleReview.errors.conflict");
    if (e.status === 400) return t("workspace.scaleReview.errors.invalid");
  }
  return t("workspace.scaleReview.errors.network");
}

async function loadContext(selSeq: number, opSeq: number): Promise<void> {
  if (!hasSavedVersion.value) {
    loadState.value = "idle";
    context.value = null;
    receipt.value = null;
    effectiveVersionId.value = null;
    return;
  }
  loadState.value = "loading";
  loadError.value = null;
  loadErrorStatus.value = null;
  try {
    // chapterVersionId is optional: the server derives the current saved
    // version when omitted (server-derived, never client-invented).
    const versionParam = props.chapterVersionId
      ? `?chapterVersionId=${encodeURIComponent(props.chapterVersionId)}`
      : "";
    const res = await api<ScaleReviewContextResponse>(
      `${base()}/scale-review-context${versionParam}`,
    );
    // Recheck scope after await: stale selection, superseded operation, or
    // unmounted → drop. An older operation's response must never overwrite
    // data fetched by a newer operation (same selection). This data
    // acceptance is independent from operation-owned busy cleanup.
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    context.value = res.context;
    receipt.value = res.receipt;
    // Server-derived deterministic checklist — consumed verbatim below.
    serverChecklist.value = res.checklist ?? [];
    // Store the server-derived version ID for subsequent calls.
    effectiveVersionId.value = res.context.chapterVersion.id;
    // Sync the review display from the receipt's protocol (truthful).
    review.value = res.receipt?.scaleReview ?? null;
    // Server-computed applicability from the coherent snapshot — never
    // unconditional freshness. Uses the server's shared completeness check
    // (GAP-119 sixth repair), not the client-side pin check, so context
    // freshness agrees with the release gate. Falls back to stale when the
    // server omits applicability (defensive; the real endpoint always sends it).
    reviewStale.value = res.applicability?.status !== "FRESH";
    loadState.value = "loaded";
    await loadProposals(selSeq, opSeq);
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    loadState.value = "error";
    loadError.value = statusErrorKey(e);
    loadErrorStatus.value = e instanceof ApiError ? e.status : null;
  }
}

/**
 * Retry button handler: starts a fresh top-level load operation with
 * current selection identity and a new operation identity.
 */
async function retryLoad(): Promise<void> {
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  await loadContext(selSeq, opSeq);
  // Abort the chain when superseded: a newer operation owns the refresh now.
  if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
  await loadEvidence(selSeq, opSeq);
}

/**
 * Reconcile the current selection after a successful mutation, even when the
 * mutation's own operation was superseded by a newer operation (GAP-119 fifth
 * repair, finding 3). Uses a FRESH read identity so the refresh is accepted;
 * never touches busy flags owned by other operations (busy cleanup stays
 * selection-guarded per the third-repair P1-1 fix).
 *
 * Without this, a review could finish against S1 while an older evidence
 * POST later commits S2 — leaving the S1 review displayed as fresh.
 */
async function reconcileSelection(): Promise<void> {
  if (isUnmounted) return;
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  await loadContext(selSeq, opSeq);
  if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
  await loadEvidence(selSeq, opSeq);
}

async function loadProposals(selSeq: number, opSeq: number): Promise<void> {
  const versionId = effectiveVersionId.value;
  if (!versionId) return;
  proposalsLoading.value = true;
  proposalsError.value = null;
  try {
    const res = await api<{ items: ProposalRow[]; nextBeforeSequence: number | null }>(
      `${base()}/scale-decisions?chapterVersionId=${encodeURIComponent(versionId)}&limit=20`,
    );
    // Reject superseded responses: an older operation must not overwrite
    // the proposal list fetched by a newer operation (same selection).
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    proposals.value = res.items;
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    proposalsError.value = statusErrorKey(e);
  } finally {
    if (selSeq === selectionSeq && !isUnmounted) proposalsLoading.value = false;
  }
}

// --- Review state display ---
const stateKey = computed(() =>
  review.value ? `workspace.scaleReview.state.${review.value.state}` : "",
);
const stateLabel = computed(() =>
  review.value ? t(stateKey.value) : "",
);

// --- Standing display helpers ---
const standingScale = computed(() => {
  const s = (context.value?.policy?.payload as { standing?: { scale?: string } } | undefined)?.standing;
  return s?.scale ?? "—";
});
const standingAccess = computed(() => {
  const s = (context.value?.policy?.payload as { standing?: { access?: string[] } } | undefined)?.standing;
  const access = s?.access ?? [];
  return access.length > 0 ? access.join(", ") : "—";
});
const standingReputation = computed(() => {
  const s = (context.value?.policy?.payload as { standing?: { reputation?: number } } | undefined)?.standing;
  return s?.reputation ?? "—";
});

// --- Checklist (deterministic, from the frozen protocol) ---
interface ChecklistItem {
  key: string;
  label: string;
  explanation: string;
  example: string;
  nextAction: string;
  status: "pass" | "fail" | "warn" | "info";
}

/**
 * Localize one field of a server-derived checklist item. Falls back to the
 * server's English text when no translation exists for the code (English
 * fallback for present and future codes alike).
 */
function checklistText(
  code: string,
  field: "label" | "explanation" | "example" | "nextAction",
  fallback: string,
): string {
  const key = `workspace.scaleReview.checklist.items.${code}.${field}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

const checklist = computed<ChecklistItem[]>(() => {
  const items: ChecklistItem[] = [];
  const ctx = context.value;
  const rv = review.value;
  if (!ctx) return items;

  // Server-derived deterministic checklist (GAP-119 fifth repair, finding 4):
  // consume the server result verbatim. Existence alone is never "pass" —
  // the server derives items for absent/stale receipts, malformed standing
  // and stale evidence from the same validated context.
  for (const entry of serverChecklist.value) {
    items.push({
      key: `server-${entry.code}`,
      label: checklistText(entry.code, "label", entry.code),
      explanation: checklistText(entry.code, "explanation", entry.explanation),
      example: checklistText(entry.code, "example", entry.example),
      nextAction: checklistText(entry.code, "nextAction", entry.nextAction),
      status: entry.severity === "fail" ? "fail" : "warn",
    });
  }
  // Per-claim reach (from the receipt protocol data).
  for (const c of rv?.claims ?? []) {
    items.push({
      key: `claim-${c.index}`,
      label: t("workspace.scaleReview.checklist.claim.label", { index: String(c.index) }),
      explanation: c.gap || t("workspace.scaleReview.checklist.claim.withinReach"),
      example: c.quote,
      nextAction: c.ok
        ? t("workspace.scaleReview.checklist.claim.noAction")
        : t("workspace.scaleReview.checklist.claim.nextAction"),
      status: c.ok ? "pass" : c.coveredByException ? "warn" : "fail",
    });
  }
  return items;
});

// --- Rerun review ---
const reviewRunning = ref(false);
const reviewError = ref<string | null>(null);

async function rerunReview(): Promise<void> {
  const versionId = effectiveVersionId.value;
  if (!hasSavedVersion.value || reviewRunning.value || !versionId) return;
  // Separate selection and operation identity. This rerun owns an
  // operation identity for response acceptance; busy cleanup is guarded by
  // selection only (a concurrent different-type operation must never
  // suppress it).
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  reviewRunning.value = true;
  reviewError.value = null;
  try {
    // Server returns ReviewVerdict (no `stale` field — never read invented fields).
    const res = await api<{ scaleReview: ScaleReviewProtocol | null }>(
      `${base()}/final-text-review`,
      {
        method: "POST",
        body: JSON.stringify({ chapterVersionId: versionId }),
      },
    );
    // Recheck scope after await. The review committed server-side (receipt
    // upsert) whether or not THIS operation was superseded: refresh the
    // coherent context with a fresh read identity so receipt, applicability,
    // and server checklist update together from the server (GAP-119 sixth
    // repair, finding 3). This handles ABSENT-to-fresh and STALE-to-fresh
    // transitions on the normal non-superseded path too; loadContext syncs
    // review/reviewStale truthfully from the server's receipt.
    if (selSeq !== selectionSeq || isUnmounted) return;
    await reconcileSelection();
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    reviewError.value = statusErrorKey(e);
  } finally {
    // Clear if the selection is still current. Operation identity is NOT
    // checked here: every operation guards re-entry via its own busy flag,
    // so a concurrent different-type operation must never suppress this
    // cleanup. (Selection change clears all busy flags in the watcher.)
    if (selSeq === selectionSeq && !isUnmounted) {
      reviewRunning.value = false;
    }
  }
}

// --- S2 proposal form ---
const proposalKind = ref<"STANDING_CHANGE" | "CHAPTER_EXCEPTION">("CHAPTER_EXCEPTION");
const proposalReason = ref("");
// Typed payload form (replaces the raw JSON textarea): builds the exact
// payload the server validates via buildPayload().
const proposalPayloadForm = ref<InstanceType<typeof ScalePayloadForm> | null>(null);
const proposalRunning = ref(false);
const proposalError = ref<string | null>(null);
const proposalDone = ref(false);

function resetProposalForm(): void {
  proposalReason.value = "";
  proposalPayloadForm.value?.reset();
  proposalError.value = null;
  proposalDone.value = false;
}

async function submitProposal(): Promise<void> {
  const versionId = effectiveVersionId.value;
  if (!context.value || proposalRunning.value || !versionId) return;
  const reason = proposalReason.value.trim();
  if (reason.length < 1 || reason.length > 4000) {
    proposalError.value = t("workspace.scaleReview.proposal.reasonInvalid");
    return;
  }
  // Build the typed payload from the structured form controls (no raw JSON).
  const built = proposalPayloadForm.value?.buildPayload();
  if (!built || built.error) {
    proposalError.value = built?.error ?? t("workspace.scaleReview.errors.invalid");
    return;
  }
  const payload = built.payload;
  // Separate selection and operation identity.
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  proposalRunning.value = true;
  proposalError.value = null;
  try {
    await api(`${base()}/scale-decisions`, {
      method: "POST",
      body: JSON.stringify({
        chapterVersionId: versionId,
        expectedBranchId: context.value.branch.id,
        expectedHeadRevisionId: context.value.headRevisionId,
        expectedSetId: context.value.latestSet?.id ?? null,
        expectedDecisionId: context.value.decisionHeadId,
        expectedPolicyFingerprint: context.value.policyFingerprint,
        kind: proposalKind.value,
        payload,
        reason,
      }),
    });
    // Recheck scope after await. If THIS operation was superseded by a newer
    // operation, the proposal still committed server-side: reconcile the
    // current selection with a fresh read identity so the UI never displays
    // pre-commit data as current.
    if (selSeq !== selectionSeq || isUnmounted) return;
    if (opSeq !== operationSeq) {
      await reconcileSelection();
      return;
    }
    proposalDone.value = true;
    await loadProposals(selSeq, opSeq);
    // Recheck scope again before the next refresh in the chain.
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    // Refresh context: decision head may have changed. Internal call —
    // reuses this operation's identity (no new bump).
    await loadContext(selSeq, opSeq);
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    proposalError.value = statusErrorKey(e);
  } finally {
    // Clear if the selection is still current. Operation identity is NOT
    // checked: a concurrent different-type operation must never suppress
    // this operation's own busy cleanup.
    if (selSeq === selectionSeq && !isUnmounted) {
      proposalRunning.value = false;
    }
  }
}

// --- S2 decision form ---
const decisionAction = ref<"APPROVE" | "REJECT" | "ALTERNATIVE">("APPROVE");
const decisionReason = ref("");
// Typed alternative-payload form (replaces the raw JSON textarea).
const altPayloadForm = ref<InstanceType<typeof ScalePayloadForm> | null>(null);
const decisionTarget = ref<ProposalRow | null>(null);
const decisionRunning = ref(false);
const decisionError = ref<string | null>(null);

function openDecision(p: ProposalRow): void {
  decisionTarget.value = p;
  decisionAction.value = "APPROVE";
  decisionReason.value = "";
  // The alternative form remounts via :key on decisionTarget; reset after tick.
  decisionError.value = null;
}

async function submitDecision(): Promise<void> {
  const target = decisionTarget.value;
  const versionId = effectiveVersionId.value;
  if (!context.value || !target || decisionRunning.value || !versionId) return;
  const reason = decisionReason.value.trim();
  if (reason.length < 1 || reason.length > 4000) {
    decisionError.value = t("workspace.scaleReview.decision.reasonInvalid");
    return;
  }
  // ALTERNATIVE requires a new strictly validated payload of the same kind,
  // built from the typed alternative controls (no raw JSON).
  let alternativePayload: unknown = undefined;
  if (decisionAction.value === "ALTERNATIVE") {
    const built = altPayloadForm.value?.buildPayload();
    if (!built || built.error) {
      decisionError.value = built?.error ?? t("workspace.scaleReview.errors.invalid");
      return;
    }
    alternativePayload = built.payload;
  }
  // Separate selection and operation identity.
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  decisionRunning.value = true;
  decisionError.value = null;
  try {
    // Note: chapterVersionId is FORBIDDEN by the strict route schema (.strict()).
    // The route knows the chapter from URL params; version comes from context.
    const body: Record<string, unknown> = {
      expectedBranchId: context.value.branch.id,
      expectedHeadRevisionId: context.value.headRevisionId,
      expectedDecisionId: context.value.decisionHeadId,
      expectedPolicyFingerprint: context.value.policyFingerprint,
      expectedVersionId: context.value.currentVersionId,
      expectedSetId: context.value.latestSet?.id ?? null,
      action: decisionAction.value,
      reason,
    };
    if (decisionAction.value === "ALTERNATIVE") {
      body.alternativePayload = alternativePayload;
    }
    await api(`${base()}/scale-decisions/${target.id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    // Recheck scope after await. If THIS operation was superseded by a newer
    // operation, the decision still committed server-side: reconcile the
    // current selection with a fresh read identity so the UI never displays
    // pre-commit data as current.
    if (selSeq !== selectionSeq || isUnmounted) return;
    if (opSeq !== operationSeq) {
      await reconcileSelection();
      return;
    }
    decisionTarget.value = null;
    // Internal refresh — reuses this operation's identity (no new bump).
    await loadContext(selSeq, opSeq);
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    decisionError.value = statusErrorKey(e);
  } finally {
    // Clear if the selection is still current. Operation identity is NOT
    // checked: a concurrent different-type operation must never suppress
    // this operation's own busy cleanup.
    if (selSeq === selectionSeq && !isUnmounted) {
      decisionRunning.value = false;
    }
  }
}

// --- 050A evidence authoring ---
// Frozen 050A claim shape: { scale, relevance, explanation, source: { start, end, quote } }
// Server field name is `conflicts` (ScaleEvidenceSetRecord.conflicts), never `claims`.
interface EvidenceClaim {
  scale: string;
  relevance: "ACTION" | "STAKES" | "CONSEQUENCE";
  explanation: string;
  source: { start: number; end: number; quote: string };
}

interface EvidenceSet {
  id: string;
  sequence: number;
  declaration: "CONFLICTS" | "NO_OPERATIVE_CONFLICT";
  explanation: string;
  conflicts: EvidenceClaim[];
  createdAt: string;
}

const evidenceSet = ref<EvidenceSet | null>(null);
const evidenceHistory = ref<EvidenceSet[]>([]);
const evidenceLoading = ref(false);
const evidenceError = ref<string | null>(null);

// Claim form (structured, not raw JSON-only)
const claimScale = ref("PERSONAL");
const claimRelevance = ref<"ACTION" | "STAKES" | "CONSEQUENCE">("ACTION");
const claimExplanation = ref("");
const claimSpanStart = ref("");
const claimSpanEnd = ref("");
const claimQuote = ref("");
const evidenceDeclaration = ref<"CONFLICTS" | "NO_OPERATIVE_CONFLICT">("CONFLICTS");
const evidenceExplanation = ref("");
const evidenceRunning = ref(false);
const evidenceFormError = ref<string | null>(null);
const evidenceDone = ref(false);

const NARRATIVE_SCALES = ["PERSONAL", "FAMILY", "VILLAGE", "TOWN", "CITY", "PROVINCE", "KINGDOM", "EMPIRE"];

async function loadEvidence(selSeq: number, opSeq: number): Promise<void> {
  const versionId = effectiveVersionId.value;
  if (!versionId) return;
  evidenceLoading.value = true;
  evidenceError.value = null;
  try {
    // GET /scale-evidence returns the assessment response:
    // { assessment, status, staleReasons, ... } — NOT { set, history }.
    // History is a separate endpoint: GET /scale-evidence/history
    const res = await api<{
      assessment: EvidenceSet | null;
      status: string;
      staleReasons: string[];
    }>(`${base()}/scale-evidence`);
    // Recheck scope after await: stale selection or superseded operation → drop.
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    evidenceSet.value = res.assessment;
    // Load history from the separate endpoint
    const histRes = await api<{ items: EvidenceSet[] }>(
      `${base()}/scale-evidence/history?chapterVersionId=${encodeURIComponent(versionId)}&limit=20`,
    );
    // Recheck scope after await before applying.
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    evidenceHistory.value = histRes.items ?? [];
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    // 404 means no evidence yet — not an error state.
    if (e instanceof ApiError && e.status === 404) {
      evidenceSet.value = null;
      evidenceHistory.value = [];
    } else {
      evidenceError.value = statusErrorKey(e);
    }
  } finally {
    if (selSeq === selectionSeq && !isUnmounted) evidenceLoading.value = false;
  }
}

function resetEvidenceForm(): void {
  claimScale.value = "PERSONAL";
  claimRelevance.value = "ACTION";
  claimExplanation.value = "";
  claimSpanStart.value = "";
  claimSpanEnd.value = "";
  claimQuote.value = "";
  evidenceExplanation.value = "";
  evidenceFormError.value = null;
  evidenceDone.value = false;
}

async function submitEvidence(): Promise<void> {
  const versionId = effectiveVersionId.value;
  if (!context.value || evidenceRunning.value || !versionId) return;

  // Build the claim from structured fields (server validates everything).
  // Frozen 050A claim shape: { scale, relevance, explanation, source: { start, end, quote } }
  // Quiet (NO_OPERATIVE_CONFLICT) has no claims, so no quote/span required.
  const claims: EvidenceClaim[] = [];
  if (evidenceDeclaration.value === "CONFLICTS") {
    const start = parseInt(claimSpanStart.value, 10);
    const end = parseInt(claimSpanEnd.value, 10);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      evidenceFormError.value = t("workspace.scaleReview.evidence.spanInvalid");
      return;
    }
    if (!claimQuote.value.trim()) {
      evidenceFormError.value = t("workspace.scaleReview.evidence.quoteRequired");
      return;
    }
    if (!claimExplanation.value.trim()) {
      evidenceFormError.value = t("workspace.scaleReview.evidence.explanationRequired");
      return;
    }
    claims.push({
      scale: claimScale.value,
      relevance: claimRelevance.value,
      explanation: claimExplanation.value.trim(),
      source: { start, end, quote: claimQuote.value },
    });
  }

  // Separate selection and operation identity.
  const selSeq = selectionSeq;
  const opSeq = ++operationSeq;
  evidenceRunning.value = true;
  evidenceFormError.value = null;
  try {
    await api(`${base()}/scale-evidence`, {
      method: "POST",
      body: JSON.stringify({
        chapterVersionId: versionId,
        expectedBranchId: context.value.branch.id,
        expectedHeadRevisionId: context.value.headRevisionId,
        expectedSetId: context.value.latestSet?.id ?? null,
        declaration: evidenceDeclaration.value,
        explanation: evidenceExplanation.value.trim(),
        conflicts: claims,
      }),
    });
    // Recheck scope after await. If THIS operation was superseded by a newer
    // operation, the evidence set still committed server-side: reconcile the
    // current selection with a fresh read identity so the UI never displays
    // pre-commit data (e.g. an S1 review) as current after S2 commits.
    if (selSeq !== selectionSeq || isUnmounted) return;
    if (opSeq !== operationSeq) {
      await reconcileSelection();
      return;
    }
    evidenceDone.value = true;
    resetEvidenceForm();
    evidenceDone.value = true;
    // Refresh context: latest set changed, review is now stale.
    // Internal calls — reuse this operation's identity (no new bump).
    await loadContext(selSeq, opSeq);
    // Recheck scope again before the next refresh in the chain.
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    await loadEvidence(selSeq, opSeq);
  } catch (e) {
    if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
    evidenceFormError.value = statusErrorKey(e);
  } finally {
    // Clear if the selection is still current. Operation identity is NOT
    // checked: a concurrent different-type operation must never suppress
    // this operation's own busy cleanup.
    if (selSeq === selectionSeq && !isUnmounted) {
      evidenceRunning.value = false;
    }
  }
}

// --- Watchers: invalidate on selection/version/save-state change ---
watch(
  () => [props.workspaceId, props.novelId, props.chapterId, props.chapterVersionId, props.hasSavedVersion],
  () => {
    selectionSeq++; // invalidate in-flight (selection identity only)
    const selSeq = selectionSeq;
    const opSeq = ++operationSeq; // this load chain owns an operation identity
    // Drop stale in-flight mutation state for the old selection; the
    // seq-guarded continuations above will no-op instead of touching the
    // new selection's state.
    reviewRunning.value = false;
    proposalRunning.value = false;
    decisionRunning.value = false;
    evidenceRunning.value = false;
    context.value = null;
    receipt.value = null;
    review.value = null;
    reviewStale.value = false;
    serverChecklist.value = [];
    proposals.value = [];
    evidenceSet.value = null;
    evidenceHistory.value = [];
    effectiveVersionId.value = props.chapterVersionId;
    resetProposalForm();
    resetEvidenceForm();
    decisionTarget.value = null;
    loadContext(selSeq, opSeq).then(() => {
      // Abort the chained evidence load when superseded: a newer operation
      // owns the refresh now.
      if (opSeq !== operationSeq || selSeq !== selectionSeq || isUnmounted) return;
      return loadEvidence(selSeq, opSeq);
    });
  },
  { immediate: true },
);

function statusClass(status: ChecklistItem["status"]): string {
  switch (status) {
    case "pass":
      return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
    case "fail":
      return "border-nf-danger/40 bg-nf-danger/10 text-nf-danger";
    case "warn":
      return "border-nf-warn/40 bg-nf-warn/10 text-nf-warn";
    default:
      return "border-nf-border bg-nf-bg-2 text-nf-text-dim";
  }
}
</script>

<template>
  <section
    :aria-label="t('workspace.scaleReview.title')"
    class="flex flex-col gap-3"
  >
    <h2 class="text-[14px] font-semibold text-nf-text">
      {{ t("workspace.scaleReview.title") }}
    </h2>

    <!-- No selection -->
    <p
      v-if="!hasSelection"
      class="rounded-lg border border-nf-border bg-nf-bg-2 p-3 text-[12.5px] leading-relaxed text-nf-text-dim"
    >
      {{ t("workspace.scaleReview.noSelection") }}
    </p>

    <!-- Unsaved edits / no version -->
    <p
      v-else-if="!hasSavedVersion"
      class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-3 text-[12.5px] leading-relaxed text-nf-warn"
    >
      {{ t("workspace.scaleReview.unsavedEdits") }}
    </p>

    <template v-else>
      <!-- Loading -->
      <p
        v-if="loadState === 'loading'"
        role="status"
        class="text-[12.5px] text-nf-text-dim"
      >
        {{ t("workspace.scaleReview.loading") }}
      </p>

      <!-- Error -->
      <div
        v-else-if="loadState === 'error'"
        role="alert"
        class="rounded-lg border border-nf-danger/40 bg-nf-danger/10 p-3"
      >
        <p class="text-[12.5px] text-nf-danger">{{ loadError }}</p>
        <button
          type="button"
          class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] font-medium text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
          @click="retryLoad"
        >
          {{ t("workspace.scaleReview.retry") }}
        </button>
      </div>

      <!-- Loaded -->
      <template v-else-if="loadState === 'loaded' && context">
        <!-- Standing summary -->
        <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <h3 class="text-[13px] font-semibold text-nf-text">
            {{ t("workspace.scaleReview.standing.title") }}
          </h3>
          <dl
            v-if="context.policy"
            class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]"
          >
            <dt class="text-nf-text-dim">{{ t("workspace.scaleReview.standing.scale") }}</dt>
            <dd class="font-mono text-nf-text">
              {{ standingScale }}
            </dd>
            <dt class="text-nf-text-dim">{{ t("workspace.scaleReview.standing.access") }}</dt>
            <dd class="font-mono text-nf-text">
              {{ standingAccess }}
            </dd>
            <dt class="text-nf-text-dim">{{ t("workspace.scaleReview.standing.reputation") }}</dt>
            <dd class="font-mono text-nf-text">
              {{ standingReputation }}
            </dd>
            <dt class="text-nf-text-dim">{{ t("workspace.scaleReview.standing.hardness") }}</dt>
            <dd class="font-mono text-nf-text">{{ context.policy.hardness }}</dd>
          </dl>
          <p v-else class="mt-2 text-[12.5px] text-nf-text-dim">
            {{ t("workspace.scaleReview.standing.none") }}
          </p>
          <p
            v-if="context.policy?.hardReason"
            class="mt-2 text-[12px] italic text-nf-text-dim"
          >
            {{ context.policy.hardReason }}
          </p>
        </div>

        <!-- Review state + rerun -->
        <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold text-nf-text">
              {{ t("workspace.scaleReview.review.title") }}
            </h3>
            <button
              type="button"
              data-testid="rerun-review"
              :disabled="reviewRunning"
              class="rounded-lg bg-nf-accent px-3 py-1.5 text-[12.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              @click="rerunReview"
            >
              {{ t("workspace.scaleReview.review.rerun") }}
            </button>
          </div>
          <p v-if="review" class="mt-2 text-[12.5px]">
            <span
              class="inline-block rounded-full border px-2.5 py-0.5 font-medium"
              :class="review.blocking ? 'border-nf-danger/40 bg-nf-danger/10 text-nf-danger' : 'border-nf-ok/40 bg-nf-ok/10 text-nf-ok'"
            >
              {{ stateLabel }}
            </span>
            <span v-if="reviewStale" class="ml-2 text-nf-warn">
              {{ t("workspace.scaleReview.review.stale") }}
            </span>
          </p>
          <p v-else class="mt-2 text-[12.5px] text-nf-text-dim">
            {{ t("workspace.scaleReview.review.none") }}
          </p>
          <p
            v-if="reviewError"
            role="alert"
            class="mt-2 rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12px] text-nf-warn"
          >
            {{ reviewError }}
          </p>
          <p class="mt-2 text-[11.5px] leading-relaxed text-nf-text-faint">
            {{ t("workspace.scaleReview.review.backendEnforces") }}
          </p>
        </div>

        <!-- 050A evidence authoring -->
        <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <h3 class="text-[13px] font-semibold text-nf-text">
            {{ t("workspace.scaleReview.evidence.title") }}
          </h3>

          <p
            v-if="evidenceLoading"
            role="status"
            class="mt-2 text-[12.5px] text-nf-text-dim"
          >
            {{ t("workspace.scaleReview.loading") }}
          </p>
          <p
            v-else-if="evidenceError"
            role="alert"
            class="mt-2 text-[12.5px] text-nf-danger"
          >
            {{ evidenceError }}
          </p>
          <template v-else>
            <!-- Current set -->
            <div v-if="evidenceSet" class="mt-2 rounded-md border border-nf-border bg-nf-bg-0 p-2.5">
              <p class="text-[12.5px] font-semibold text-nf-text">
                {{ t("workspace.scaleReview.evidence.currentSet", { sequence: String(evidenceSet.sequence) }) }}
                ·
                {{ t(`workspace.scaleReview.evidence.declaration.${evidenceSet.declaration}`) }}
              </p>
              <p class="mt-1 text-[12px] leading-relaxed text-nf-text-dim">{{ evidenceSet.explanation }}</p>
              <ul v-if="evidenceSet.conflicts.length > 0" class="mt-2 flex flex-col gap-1.5">
                <li
                  v-for="(c, i) in evidenceSet.conflicts"
                  :key="i"
                  class="rounded border border-nf-border px-2 py-1.5 text-[12px]"
                >
                  <p class="font-mono font-medium text-nf-text">#{{ i }} {{ c.scale }} [{{ c.relevance }}]</p>
                  <p class="mt-0.5 text-nf-text-dim">{{ c.explanation }}</p>
                  <p class="mt-0.5 font-mono text-[11.5px] text-nf-text-faint">
                    [{{ c.source.start }}–{{ c.source.end }}] “{{ c.source.quote }}”
                  </p>
                </li>
              </ul>
            </div>
            <p v-else class="mt-2 text-[12.5px] text-nf-text-dim">
              {{ t("workspace.scaleReview.evidence.noSet") }}
            </p>

            <!-- History -->
            <details v-if="evidenceHistory.length > 0" class="mt-2 text-[12.5px]">
              <summary class="cursor-pointer font-medium text-nf-text focus-visible:nf-focus">
                {{ t("workspace.scaleReview.evidence.history", { count: String(evidenceHistory.length) }) }}
              </summary>
              <ul class="mt-1.5 flex flex-col gap-1.5">
                <li
                  v-for="h in evidenceHistory"
                  :key="h.id"
                  class="rounded border border-nf-border px-2 py-1.5 text-[12px] text-nf-text-dim"
                >
                  #{{ h.sequence }} · {{ t(`workspace.scaleReview.evidence.declaration.${h.declaration}`) }} ·
                  {{ h.conflicts.length }} {{ t("workspace.scaleReview.evidence.claims") }}
                </li>
              </ul>
            </details>

            <!-- New set form (structured, not raw JSON-only) -->
            <form
              data-testid="evidence-form"
              class="mt-3 flex flex-col gap-2 border-t border-nf-border pt-3"
              @submit.prevent="submitEvidence"
            >
              <h4 class="text-[12.5px] font-semibold text-nf-text">
                {{ t("workspace.scaleReview.evidence.newSet") }}
              </h4>
              <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                {{ t("workspace.scaleReview.evidence.declarationLabel") }}
                <select
                  v-model="evidenceDeclaration"
                  data-testid="evidence-declaration"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                >
                  <option value="CONFLICTS">{{ t("workspace.scaleReview.evidence.declaration.CONFLICTS") }}</option>
                  <option value="NO_OPERATIVE_CONFLICT">{{ t("workspace.scaleReview.evidence.declaration.NO_OPERATIVE_CONFLICT") }}</option>
                </select>
              </label>
              <template v-if="evidenceDeclaration === 'CONFLICTS'">
                <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                  {{ t("workspace.scaleReview.evidence.scaleLabel") }}
                  <select
                    v-model="claimScale"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
                  >
                    <option v-for="s in NARRATIVE_SCALES" :key="s" :value="s">{{ s }}</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                  {{ t("workspace.scaleReview.evidence.relevanceLabel") }}
                  <select
                    v-model="claimRelevance"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
                  >
                    <option value="ACTION">ACTION</option>
                    <option value="STAKES">STAKES</option>
                    <option value="CONSEQUENCE">CONSEQUENCE</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                  {{ t("workspace.scaleReview.evidence.claimExplanationLabel") }}
                  <input
                    v-model="claimExplanation"
                    type="text"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                  />
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                    {{ t("workspace.scaleReview.evidence.spanStartLabel") }}
                    <input
                      v-model="claimSpanStart"
                      type="number"
                      min="0"
                      class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                    {{ t("workspace.scaleReview.evidence.spanEndLabel") }}
                    <input
                      v-model="claimSpanEnd"
                      type="number"
                      min="1"
                      class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
                    />
                  </label>
                </div>
                <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                  {{ t("workspace.scaleReview.evidence.quoteLabel") }}
                  <textarea
                    v-model="claimQuote"
                    rows="2"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text focus-visible:nf-focus"
                  />
                  <span class="text-[11.5px] text-nf-text-faint">
                    {{ t("workspace.scaleReview.evidence.quoteHint") }}
                  </span>
                </label>
              </template>
              <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
                {{ t("workspace.scaleReview.evidence.explanationLabel") }}
                <textarea
                  v-model="evidenceExplanation"
                  rows="2"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
                />
              </label>
              <div>
                <button
                  type="submit"
                  :disabled="evidenceRunning"
                  class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
                >
                  {{ t("workspace.scaleReview.evidence.submit") }}
                </button>
              </div>
              <p
                v-if="evidenceFormError"
                role="alert"
                class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12px] text-nf-warn"
              >
                {{ evidenceFormError }}
              </p>
              <p
                v-if="evidenceDone"
                role="status"
                class="rounded-md border border-nf-ok/40 bg-nf-ok/10 px-2.5 py-1.5 text-[12px] text-nf-ok"
              >
                {{ t("workspace.scaleReview.evidence.submitted") }}
              </p>
            </form>
          </template>
        </div>

        <!-- Deterministic checklist -->
        <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <h3 class="text-[13px] font-semibold text-nf-text">
            {{ t("workspace.scaleReview.checklist.title") }}
          </h3>
          <ul class="mt-2 flex flex-col gap-2">
            <li
              v-for="item in checklist"
              :key="item.key"
              class="rounded-md border p-2.5"
              :class="statusClass(item.status)"
            >
              <p class="text-[12.5px] font-semibold">{{ item.label }}</p>
              <p class="mt-1 text-[12px] leading-relaxed opacity-90">{{ item.explanation }}</p>
              <details class="mt-1 text-[12px]">
                <summary class="cursor-pointer font-medium focus-visible:nf-focus">
                  {{ t("workspace.scaleReview.checklist.details") }}
                </summary>
                <p class="mt-1 leading-relaxed">
                  <span class="font-medium">{{ t("workspace.scaleReview.checklist.exampleLabel") }}:</span>
                  {{ item.example }}
                </p>
                <p class="mt-1 leading-relaxed">
                  <span class="font-medium">{{ t("workspace.scaleReview.checklist.nextActionLabel") }}:</span>
                  {{ item.nextAction }}
                </p>
              </details>
            </li>
          </ul>
        </div>

        <!-- S2 proposals -->
        <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <h3 class="text-[13px] font-semibold text-nf-text">
            {{ t("workspace.scaleReview.proposals.title") }}
          </h3>

          <p
            v-if="proposalsLoading"
            role="status"
            class="mt-2 text-[12.5px] text-nf-text-dim"
          >
            {{ t("workspace.scaleReview.loading") }}
          </p>
          <p
            v-else-if="proposalsError"
            role="alert"
            class="mt-2 text-[12.5px] text-nf-danger"
          >
            {{ proposalsError }}
          </p>
          <ul v-else-if="proposals.length > 0" class="mt-2 flex flex-col gap-2">
            <li
              v-for="p in proposals"
              :key="p.id"
              class="rounded-md border border-nf-border bg-nf-bg-0 p-2.5"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-[12.5px] font-semibold text-nf-text">
                  #{{ p.sequence }} · {{ t(`workspace.scaleReview.proposals.kind.${p.kind}`) }}
                </p>
                <span
                  v-if="p.outcome"
                  class="rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
                  :class="p.outcome.action === 'APPROVE'
                    ? 'border-nf-ok/40 bg-nf-ok/10 text-nf-ok'
                    : p.outcome.action === 'REJECT'
                      ? 'border-nf-danger/40 bg-nf-danger/10 text-nf-danger'
                      : 'border-nf-warn/40 bg-nf-warn/10 text-nf-warn'"
                >
                  {{ t(`workspace.scaleReview.proposals.action.${p.outcome.action}`) }}
                </span>
                <span
                  v-else
                  class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11.5px] font-medium text-nf-text-dim"
                >
                  {{ t("workspace.scaleReview.proposals.pending") }}
                </span>
              </div>
              <p class="mt-1 text-[12px] leading-relaxed text-nf-text-dim">{{ p.reason }}</p>
              <button
                v-if="!p.outcome"
                type="button"
                class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1 text-[12px] font-medium text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
                @click="openDecision(p)"
              >
                {{ t("workspace.scaleReview.proposals.decide") }}
              </button>
            </li>
          </ul>
          <p v-else class="mt-2 text-[12.5px] text-nf-text-dim">
            {{ t("workspace.scaleReview.proposals.empty") }}
          </p>

          <!-- New proposal form -->
          <form
            data-testid="proposal-form"
            class="mt-3 flex flex-col gap-2 border-t border-nf-border pt-3"
            @submit.prevent="submitProposal"
          >
            <h4 class="text-[12.5px] font-semibold text-nf-text">
              {{ t("workspace.scaleReview.proposal.title") }}
            </h4>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.proposal.kindLabel") }}
              <select
                data-testid="proposal-kind"
                v-model="proposalKind"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="CHAPTER_EXCEPTION">
                  {{ t("workspace.scaleReview.proposals.kind.CHAPTER_EXCEPTION") }}
                </option>
                <option value="STANDING_CHANGE">
                  {{ t("workspace.scaleReview.proposals.kind.STANDING_CHANGE") }}
                </option>
              </select>
            </label>
            <!-- Typed payload controls (no raw JSON): the payload is built
                 from structured inputs matching the server's strict schema. -->
            <ScalePayloadForm
              ref="proposalPayloadForm"
              :kind="proposalKind"
              :conflicts="evidenceSet?.conflicts ?? []"
              testid-prefix="proposal"
            />
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.proposal.reasonLabel") }}
              <textarea
                data-testid="proposal-reason"
                v-model="proposalReason"
                rows="2"
                maxlength="4000"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
              />
            </label>
            <div>
              <button
                type="submit"
                :disabled="proposalRunning"
                class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              >
                {{ t("workspace.scaleReview.proposal.submit") }}
              </button>
            </div>
            <p
              v-if="proposalError"
              role="alert"
              class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12px] text-nf-warn"
            >
              {{ proposalError }}
            </p>
            <p
              v-if="proposalDone"
              role="status"
              class="rounded-md border border-nf-ok/40 bg-nf-ok/10 px-2.5 py-1.5 text-[12px] text-nf-ok"
            >
              {{ t("workspace.scaleReview.proposal.submitted") }}
            </p>
          </form>
        </div>

        <!-- Decision dialog (inline) -->
        <div
          v-if="decisionTarget"
          role="dialog"
          aria-modal="true"
          :aria-label="t('workspace.scaleReview.decision.title')"
          class="rounded-lg border border-nf-accent/40 bg-nf-bg-2 p-3"
        >
          <h3 class="text-[13px] font-semibold text-nf-text">
            {{ t("workspace.scaleReview.decision.title") }} — #{{ decisionTarget.sequence }}
          </h3>
          <form
            data-testid="decision-form"
            class="mt-2 flex flex-col gap-2"
            @submit.prevent="submitDecision"
          >
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.decision.actionLabel") }}
              <select
                data-testid="decision-action"
                v-model="decisionAction"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="APPROVE">{{ t("workspace.scaleReview.proposals.action.APPROVE") }}</option>
                <option value="REJECT">{{ t("workspace.scaleReview.proposals.action.REJECT") }}</option>
                <option value="ALTERNATIVE">{{ t("workspace.scaleReview.proposals.action.ALTERNATIVE") }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.decision.reasonLabel") }}
              <textarea
                data-testid="decision-reason"
                v-model="decisionReason"
                rows="2"
                maxlength="4000"
                required
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
              />
            </label>
            <div
              v-if="decisionAction === 'ALTERNATIVE'"
              class="flex flex-col gap-1"
            >
              <p class="text-[12px] text-nf-text-dim">
                {{ t("workspace.scaleReview.decision.alternativePayloadLabel") }}
              </p>
              <!-- Typed alternative controls: same kind as the proposal,
                   no raw JSON. Remounts per proposal via :key. -->
              <ScalePayloadForm
                ref="altPayloadForm"
                :key="decisionTarget.id"
                :kind="decisionTarget.kind"
                :conflicts="evidenceSet?.conflicts ?? []"
                testid-prefix="alt"
              />
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="decisionRunning"
                class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              >
                {{ t("workspace.scaleReview.decision.submit") }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] font-medium text-nf-text hover:bg-nf-bg-0 focus-visible:nf-focus"
                @click="decisionTarget = null"
              >
                {{ t("workspace.scaleReview.decision.cancel") }}
              </button>
            </div>
            <p
              v-if="decisionError"
              role="alert"
              class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12px] text-nf-warn"
            >
              {{ decisionError }}
            </p>
          </form>
        </div>
      </template>
    </template>
  </section>
</template>
