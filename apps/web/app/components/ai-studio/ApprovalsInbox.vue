<script setup lang="ts">
/**
 * Approvals inbox (NF-WF-018A): runs parked at HUMAN_APPROVAL steps.
 * The list rides the additive `?status=AWAITING_APPROVAL` filter
 * (Invariant 1(d)); approve/reject calls the frozen 005 decide routes
 * with the park-time `expectedSnapshotHash` echoed from the run detail.
 * The 005 409 codes (STALE_APPROVAL / NO_APPROVAL_SNAPSHOT /
 * ALREADY_DECIDED / RUN_CANCELLED) surface actionably.
 */
import { ref, computed, onMounted, nextTick } from "vue";
import {
  useAiStudio,
  DecisionError,
  type RunSummary,
  type RunDetail,
  type StepView,
} from "../../composables/useAiStudio";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  canDecide: boolean;
}>();

const emit = defineEmits<{
  (e: "decided", runId: string): void;
}>();

const { t } = useLocale();
const studio = useAiStudio();

const parked = ref<RunSummary[]>([]);
const loading = ref(false);
const listError = ref<string | null>(null);
const selected = ref<RunDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

const dialogMode = ref<"approve" | "reject" | null>(null);
const reason = ref("");
const deciding = ref(false);
const decideError = ref<string | null>(null);
const decideOk = ref(false);
const dialogRef = ref<HTMLDivElement | null>(null);

const parkedStep = computed<StepView | null>(() => {
  if (!selected.value) return null;
  return (
    selected.value.steps.find(
      (s) => s.status === "AWAITING_APPROVAL" && s.approvalSnapshot !== null,
    ) ?? null
  );
});

const snapshotHash = computed(
  () => parkedStep.value?.approvalSnapshot?.snapshotHash ?? null,
);

function refusalMessage(code: string): string {
  const key = `aiStudio.approvals.errors.${code}`;
  const msg = t(key);
  return msg === key ? t("aiStudio.approvals.errors.generic", { code }) : msg;
}

async function refresh() {
  loading.value = true;
  listError.value = null;
  try {
    parked.value = await studio.listRuns(props.workspaceId, {
      status: "AWAITING_APPROVAL",
      limit: 100,
    });
  } catch (err) {
    listError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

async function selectRun(runId: string) {
  detailLoading.value = true;
  detailError.value = null;
  decideError.value = null;
  decideOk.value = false;
  try {
    selected.value = await studio.getRun(props.workspaceId, runId);
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    detailLoading.value = false;
  }
}

function openDialog(mode: "approve" | "reject") {
  if (!snapshotHash.value) {
    decideError.value = refusalMessage("NO_APPROVAL_SNAPSHOT");
    return;
  }
  dialogMode.value = mode;
  reason.value = "";
  decideError.value = null;
  nextTick(() => {
    const target = dialogRef.value?.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus();
  });
}

function canConfirm(): boolean {
  if (dialogMode.value === "reject") return reason.value.trim().length > 0;
  return dialogMode.value !== null;
}

async function confirmDecision() {
  if (!selected.value || !dialogMode.value || !snapshotHash.value) return;
  if (!canConfirm()) return;
  deciding.value = true;
  decideError.value = null;
  try {
    await studio.decideRun(
      props.workspaceId,
      selected.value.id,
      dialogMode.value,
      snapshotHash.value,
      dialogMode.value === "reject"
        ? reason.value.trim()
        : reason.value.trim() || undefined,
    );
    dialogMode.value = null;
    decideOk.value = true;
    emit("decided", selected.value.id);
    selected.value = null;
    await refresh();
  } catch (err) {
    if (err instanceof DecisionError) {
      decideError.value = refusalMessage(err.refusalCode);
    } else {
      decideError.value = refusalMessage("generic");
    }
  } finally {
    deciding.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && dialogMode.value) dialogMode.value = null;
}

onMounted(refresh);

defineExpose({ refresh });
</script>

<template>
  <section aria-labelledby="approvals-heading" @keydown="onKeydown">
    <h2 id="approvals-heading" class="mb-3 text-[15px] font-semibold text-nf-text">
      {{ t("aiStudio.approvals.title") }}
    </h2>

    <div v-if="loading" class="py-6 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="listError" class="py-6 text-center" role="alert">
      <p class="text-nf-warn">{{ listError }}</p>
      <button
        class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] focus-visible:nf-focus"
        @click="refresh"
      >
        {{ t("common.retry") }}
      </button>
    </div>
    <p v-else-if="parked.length === 0" class="py-6 text-center text-nf-text-faint">
      {{ t("aiStudio.approvals.empty") }}
    </p>

    <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <ul class="divide-y divide-nf-border/60 rounded-xl border border-nf-border">
        <li v-for="r in parked" :key="r.id">
          <button
            class="block w-full px-3 py-2.5 text-left hover:bg-nf-bg-2 focus-visible:nf-focus"
            :data-testid="`parked-${r.id}`"
            :class="{ 'bg-nf-accent/10': selected?.id === r.id }"
            @click="selectRun(r.id)"
          >
            <span class="block truncate text-[14px] font-medium text-nf-text">
              {{ r.workflowKey }}
            </span>
            <span class="block truncate text-[12px] text-nf-text-faint">
              {{ t("aiStudio.runs.workflowVersion", { version: r.workflowVersionNumber ?? "—" }) }}
            </span>
          </button>
        </li>
      </ul>

      <div class="rounded-xl border border-nf-border bg-nf-bg-1 p-4">
        <div v-if="detailLoading" class="py-6 text-center text-nf-text-faint" role="status">
          {{ t("common.loading") }}
        </div>
        <div v-else-if="detailError" class="py-6 text-center" role="alert">
          <p class="text-nf-warn">{{ detailError }}</p>
        </div>
        <div v-else-if="decideOk" class="py-6 text-center text-nf-ok" role="status">
          {{ t("aiStudio.approvals.decided") }}
        </div>
        <div v-else-if="selected && parkedStep">
          <h3 class="text-[14px] font-semibold text-nf-text">
            {{ t("aiStudio.approvals.parkedStep") }}:
            <span class="font-mono">{{ parkedStep.stepKey }}</span>
          </h3>
          <h4 class="mt-3 text-[12px] font-semibold text-nf-text-faint">
            {{ t("aiStudio.approvals.instruction") }}
          </h4>
          <p class="mt-1 whitespace-pre-wrap text-[13px] text-nf-text">
            {{ parkedStep.approvalSnapshot?.material.instruction }}
          </p>
          <div
            v-if="Object.keys(parkedStep.approvalSnapshot?.material.priorOutcomes ?? {}).length"
            class="mt-3"
          >
            <h4 class="text-[12px] font-semibold text-nf-text-faint">
              {{ t("aiStudio.approvals.priorOutcomes") }}
            </h4>
            <ul class="mt-1 space-y-1">
              <li
                v-for="(outcome, key) in parkedStep.approvalSnapshot?.material.priorOutcomes"
                :key="key"
                class="rounded bg-nf-bg-2 px-2 py-1 text-[12px] text-nf-text-dim"
              >
                <span class="font-mono font-semibold">{{ key }}:</span>
                {{ String(outcome.text ?? JSON.stringify(outcome.json)).slice(0, 200) }}
              </li>
            </ul>
          </div>

          <div v-if="props.canDecide" class="mt-4 flex gap-2">
            <button
              class="rounded-lg bg-nf-accent px-4 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
              @click="openDialog('approve')"
            >
              {{ t("aiStudio.approvals.approve") }}
            </button>
            <button
              class="rounded-lg border border-nf-warn/60 px-4 py-1.5 text-[13px] font-semibold text-nf-warn hover:bg-nf-warn/10 focus-visible:nf-focus"
              @click="openDialog('reject')"
            >
              {{ t("aiStudio.approvals.reject") }}
            </button>
          </div>
          <p v-if="decideError" class="mt-3 text-[13px] text-nf-warn" role="alert">
            {{ decideError }}
          </p>
        </div>
        <p v-else class="py-6 text-center text-nf-text-faint">
          {{ t("aiStudio.approvals.empty") }}
        </p>
      </div>
    </div>

    <!-- Decide confirm dialog -->
    <div
      v-if="dialogMode"
      ref="dialogRef"
      class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogMode === 'approve' ? t('aiStudio.approvals.approveTitle') : t('aiStudio.approvals.rejectTitle')"
    >
      <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg">
        <h3 class="mb-2 text-[15px] font-semibold text-nf-text">
          {{ dialogMode === "approve" ? t("aiStudio.approvals.approveTitle") : t("aiStudio.approvals.rejectTitle") }}
        </h3>
        <p class="text-[13px] text-nf-text-dim">
          {{ dialogMode === "approve" ? t("aiStudio.approvals.confirmApprove") : t("aiStudio.approvals.confirmReject") }}
        </p>
        <label class="mt-3 block text-[12px] font-semibold text-nf-text">
          {{ t("aiStudio.approvals.reasonLabel") }}
          <span v-if="dialogMode === 'reject'" class="text-nf-warn">*</span>
          <textarea
            v-model="reason"
            rows="3"
            class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            :placeholder="dialogMode === 'reject' ? t('aiStudio.approvals.reasonPlaceholder') : t('aiStudio.approvals.reasonOptional')"
          />
        </label>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
            @click="dialogMode = null"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold focus-visible:nf-focus disabled:opacity-50"
            data-autofocus
            :class="dialogMode === 'approve' ? 'bg-nf-accent text-nf-accent-ink hover:bg-nf-accent-hi' : 'bg-nf-warn text-nf-accent-ink hover:bg-nf-warn/90'"
            :disabled="!canConfirm() || deciding"
            @click="confirmDecision"
          >
            {{ dialogMode === "approve" ? t("aiStudio.approvals.approve") : t("aiStudio.approvals.reject") }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
