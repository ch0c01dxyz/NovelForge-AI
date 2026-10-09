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
import { computed, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  /** Selected chapter ID, or null when nothing is selected. */
  chapterId: string | null;
  /** Saved version UUID, or null when the chapter has unsaved edits / none. */
  chapterVersionId: string | null;
}>();

const { t } = useLocale();
const { api } = useApi();

// --- Types (mirror the frozen server protocol shapes) ---
interface ScaleReviewContext {
  chapterVersion: { id: string; content: string };
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
const proposals = ref<ProposalRow[]>([]);
const proposalsLoading = ref(false);
const proposalsError = ref<string | null>(null);

// Request invalidation: ignore late responses for old selections.
let requestSeq = 0;

const base = () =>
  `/workspaces/${props.workspaceId}/novels/${props.novelId}/chapters/${props.chapterId}`;

const hasSelection = computed(() => props.chapterId !== null);
const hasSavedVersion = computed(
  () => props.chapterId !== null && props.chapterVersionId !== null,
);

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

async function loadContext(): Promise<void> {
  if (!hasSavedVersion.value) {
    loadState.value = "idle";
    context.value = null;
    return;
  }
  const seq = ++requestSeq;
  loadState.value = "loading";
  loadError.value = null;
  loadErrorStatus.value = null;
  try {
    const res = await api<{ context: ScaleReviewContext }>(
      `${base()}/scale-review-context?chapterVersionId=${encodeURIComponent(props.chapterVersionId!)}`,
    );
    if (seq !== requestSeq) return; // stale selection moved on
    context.value = res.context;
    loadState.value = "loaded";
    await loadProposals(seq);
  } catch (e) {
    if (seq !== requestSeq) return;
    loadState.value = "error";
    loadError.value = statusErrorKey(e);
    loadErrorStatus.value = e instanceof ApiError ? e.status : null;
  }
}

async function loadProposals(seq: number): Promise<void> {
  proposalsLoading.value = true;
  proposalsError.value = null;
  try {
    const res = await api<{ items: ProposalRow[]; nextBeforeSequence: number | null }>(
      `${base()}/scale-decisions?chapterVersionId=${encodeURIComponent(props.chapterVersionId!)}&limit=20`,
    );
    if (seq !== requestSeq) return;
    proposals.value = res.items;
  } catch (e) {
    if (seq !== requestSeq) return;
    proposalsError.value = statusErrorKey(e);
  } finally {
    if (seq === requestSeq) proposalsLoading.value = false;
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

const checklist = computed<ChecklistItem[]>(() => {
  const items: ChecklistItem[] = [];
  const ctx = context.value;
  const rv = review.value;
  if (!ctx) return items;

  // 1. SCALE policy configured
  items.push({
    key: "policy",
    label: t("workspace.scaleReview.checklist.policy.label"),
    explanation: t("workspace.scaleReview.checklist.policy.explanation"),
    example: t("workspace.scaleReview.checklist.policy.example"),
    nextAction: t("workspace.scaleReview.checklist.policy.nextAction"),
    status: ctx.policy ? "pass" : "warn",
  });
  // 2. Standing validated
  const standing = (ctx.policy?.payload as { standing?: unknown } | undefined)?.standing;
  items.push({
    key: "standing",
    label: t("workspace.scaleReview.checklist.standing.label"),
    explanation: t("workspace.scaleReview.checklist.standing.explanation"),
    example: t("workspace.scaleReview.checklist.standing.example"),
    nextAction: t("workspace.scaleReview.checklist.standing.nextAction"),
    status: standing ? "pass" : "fail",
  });
  // 3. Evidence set current
  items.push({
    key: "evidence",
    label: t("workspace.scaleReview.checklist.evidence.label"),
    explanation: t("workspace.scaleReview.checklist.evidence.explanation"),
    example: t("workspace.scaleReview.checklist.evidence.example"),
    nextAction: t("workspace.scaleReview.checklist.evidence.nextAction"),
    status: ctx.latestSet ? "pass" : "warn",
  });
  // 4. Missing data (from protocol)
  for (const m of rv?.missingData ?? []) {
    items.push({
      key: `missing-${m.code}`,
      label: m.code,
      explanation: m.explanation,
      example: m.example,
      nextAction: m.nextAction,
      status: "fail",
    });
  }
  // 5. Per-claim reach
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
  if (!hasSavedVersion.value || reviewRunning.value) return;
  reviewRunning.value = true;
  reviewError.value = null;
  try {
    const res = await api<{ scaleReview: ScaleReviewProtocol | null; stale: boolean }>(
      `${base()}/final-text-review`,
      {
        method: "POST",
        body: JSON.stringify({ chapterVersionId: props.chapterVersionId }),
      },
    );
    review.value = res.scaleReview;
    reviewStale.value = res.stale;
  } catch (e) {
    reviewError.value = statusErrorKey(e);
  } finally {
    reviewRunning.value = false;
  }
}

// --- S2 proposal form ---
const proposalKind = ref<"STANDING_CHANGE" | "CHAPTER_EXCEPTION">("CHAPTER_EXCEPTION");
const proposalReason = ref("");
const proposalPayload = ref("{}");
const proposalRunning = ref(false);
const proposalError = ref<string | null>(null);
const proposalDone = ref(false);

function resetProposalForm(): void {
  proposalReason.value = "";
  proposalPayload.value = "{}";
  proposalError.value = null;
  proposalDone.value = false;
}

async function submitProposal(): Promise<void> {
  if (!context.value || proposalRunning.value) return;
  const reason = proposalReason.value.trim();
  if (reason.length < 1 || reason.length > 4000) {
    proposalError.value = t("workspace.scaleReview.proposal.reasonInvalid");
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(proposalPayload.value);
  } catch {
    proposalError.value = t("workspace.scaleReview.proposal.payloadInvalid");
    return;
  }
  proposalRunning.value = true;
  proposalError.value = null;
  try {
    await api(`${base()}/scale-decisions`, {
      method: "POST",
      body: JSON.stringify({
        chapterVersionId: props.chapterVersionId,
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
    proposalDone.value = true;
    const seq = requestSeq;
    await loadProposals(seq);
    // Refresh context: decision head may have changed.
    await loadContext();
  } catch (e) {
    proposalError.value = statusErrorKey(e);
  } finally {
    proposalRunning.value = false;
  }
}

// --- S2 decision form ---
const decisionAction = ref<"APPROVE" | "REJECT" | "ALTERNATIVE">("APPROVE");
const decisionReason = ref("");
const decisionTarget = ref<ProposalRow | null>(null);
const decisionRunning = ref(false);
const decisionError = ref<string | null>(null);

function openDecision(p: ProposalRow): void {
  decisionTarget.value = p;
  decisionAction.value = "APPROVE";
  decisionReason.value = "";
  decisionError.value = null;
}

async function submitDecision(): Promise<void> {
  const target = decisionTarget.value;
  if (!context.value || !target || decisionRunning.value) return;
  const reason = decisionReason.value.trim();
  if (reason.length < 1 || reason.length > 4000) {
    decisionError.value = t("workspace.scaleReview.decision.reasonInvalid");
    return;
  }
  decisionRunning.value = true;
  decisionError.value = null;
  try {
    await api(`${base()}/scale-decisions/${target.id}/decision`, {
      method: "POST",
      body: JSON.stringify({
        chapterVersionId: props.chapterVersionId,
        expectedBranchId: context.value.branch.id,
        expectedHeadRevisionId: context.value.headRevisionId,
        expectedSetId: context.value.latestSet?.id ?? null,
        expectedDecisionId: context.value.decisionHeadId,
        expectedPolicyFingerprint: context.value.policyFingerprint,
        action: decisionAction.value,
        reason,
      }),
    });
    decisionTarget.value = null;
    await loadContext();
  } catch (e) {
    decisionError.value = statusErrorKey(e);
  } finally {
    decisionRunning.value = false;
  }
}

// --- Watchers: invalidate on selection/version change ---
watch(
  () => [props.workspaceId, props.novelId, props.chapterId, props.chapterVersionId],
  () => {
    requestSeq++; // invalidate in-flight
    context.value = null;
    review.value = null;
    proposals.value = [];
    resetProposalForm();
    decisionTarget.value = null;
    loadContext();
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
          @click="loadContext"
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
          <form class="mt-3 flex flex-col gap-2 border-t border-nf-border pt-3" @submit.prevent="submitProposal">
            <h4 class="text-[12.5px] font-semibold text-nf-text">
              {{ t("workspace.scaleReview.proposal.title") }}
            </h4>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.proposal.kindLabel") }}
              <select
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
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.proposal.payloadLabel") }}
              <textarea
                v-model="proposalPayload"
                rows="4"
                spellcheck="false"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12px] text-nf-text focus-visible:nf-focus"
              />
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.proposal.reasonLabel") }}
              <textarea
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
          <form class="mt-2 flex flex-col gap-2" @submit.prevent="submitDecision">
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.scaleReview.decision.actionLabel") }}
              <select
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
                v-model="decisionReason"
                rows="2"
                maxlength="4000"
                required
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
              />
            </label>
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
