<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
/**
 * Run status panel (NF-WF-007 output #2): live run + step rows.
 *
 * Polls the run's statusUrl every 2s while PENDING/RUNNING (paused when
 * the document is hidden) with a monotonic pollSeq guard so a stale
 * response never overwrites newer state. Cancel is offered only while
 * the run is non-terminal; terminal runs never offer cancel.
 * Every step row renders {stepKey, kind, status, latencyMs,
 * errorMessage} in execution order, including SKIPPED rows.
 */
import { useWorkflowRuns, type RunView } from "../../composables/useWorkflowRuns";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import WorkflowRetryAction from "./WorkflowRetryAction.vue";

const props = defineProps<{
  workspaceId: string;
  runId: string | null;
  statusUrl: string | null;
  canConfigure?: boolean;
}>();

const emit = defineEmits<{
  (e: "run-updated", run: RunView): void;
  (e: "cancelled", run: RunView): void;
  (e: "retried", payload: { runId: string; statusUrl: string }): void;
  (e: "configure", runId: string): void;
}>();

const { t } = useLocale();
const { api } = useApi();
const runs = useWorkflowRuns();

const run = ref<RunView | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const cancelling = ref(false);
let poller: { stop: () => void } | null = null;
let responseVersion = 0;
let cancelRequest = 0;

const isTerminal = computed(() => (run.value ? runs.isTerminal(run.value.status) : true));
const canCancel = computed(
  () =>
    run.value !== null &&
    !runs.isTerminal(run.value.status) &&
    run.value.status !== "AWAITING_APPROVAL",
);

const sortedSteps = computed(() =>
  [...(run.value?.steps ?? [])].sort((a, b) => a.sequence - b.sequence),
);

const failedSteps = computed(() =>
  sortedSteps.value.filter((s) => s.status === "FAILED" && s.errorMessage),
);

function statusLabel(status: string): string {
  const key: Record<string, string> = {
    PENDING: "run.pending",
    RUNNING: "run.running",
    AWAITING_APPROVAL: "run.awaitingApproval",
    SUCCEEDED: "run.succeeded",
    FAILED: "run.failed",
    CANCELLED: "run.cancelled",
    SKIPPED: "run.skipped",
  };
  return t(key[status] ?? "run.pending");
}

function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "text-nf-ok";
  if (status === "FAILED") return "text-nf-warn";
  if (status === "RUNNING" || status === "PENDING") return "text-nf-accent-hi";
  return "text-nf-text-faint";
}

function stopPolling() {
  poller?.stop();
  poller = null;
}

function startPolling() {
  stopPolling();
  const pollOnce = async () => {
    if (!props.runId) return null;
    // Prefer the statusUrl when the run was just started; otherwise
    // poll through getRun (history selection).
    if (props.statusUrl) {
      const path = props.statusUrl.replace(/^\/api/, "");
      return api<RunView>(path);
    }
    return runs.getRun(props.workspaceId, props.runId);
  };
  let pollSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    if (typeof document !== "undefined" && document.hidden) {
      timer = setTimeout(tick, 2000);
      return;
    }
    const seq = ++pollSeq;
    try {
      const fresh = await pollOnce();
      if (stopped || seq !== pollSeq || !fresh) return;
      run.value = fresh;
      emit("run-updated", fresh);
      if (!runs.isTerminal(fresh.status) && fresh.status !== "AWAITING_APPROVAL") {
        timer = setTimeout(tick, 2000);
      }
    } catch (e) {
      if (stopped || seq !== pollSeq) return;
      error.value = e instanceof ApiError ? t("errors.loadFailed") : t("errors.network");
    }
  }

  void tick();
  poller = {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

async function load() {
  const version = ++responseVersion;
  run.value = null;
  error.value = null;
  if (!props.runId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const view = await runs.getRun(props.workspaceId, props.runId);
    if (version !== responseVersion) return;
    run.value = view;
    emit("run-updated", view);
    if (!runs.isTerminal(view.status) && view.status !== "AWAITING_APPROVAL") {
      startPolling();
    }
  } catch (e) {
    if (version !== responseVersion) return;
    if (e instanceof ApiError && e.status === 404) error.value = t("review.runGone");
    else error.value = e instanceof ApiError ? t("errors.loadFailed") : t("errors.network");
  } finally {
    if (version === responseVersion) loading.value = false;
  }
}

async function cancel() {
  if (!props.runId || cancelling.value) return;
  const version = ++responseVersion;
  cancelling.value = true;
  const request = ++cancelRequest;
  try {
    stopPolling();
    const view = await runs.cancelRun(props.workspaceId, props.runId);
    if (version !== responseVersion) return;
    run.value = view;
    emit("cancelled", view);
    emit("run-updated", view);
  } catch {
    if (version !== responseVersion) return;
    error.value = t("errors.loadFailed");
  } finally {
    if (request === cancelRequest) cancelling.value = false;
  }
}

watch(
  () => [props.workspaceId, props.runId],
  () => {
    cancelRequest++;
    cancelling.value = false;
    stopPolling();
    void load();
  },
  { immediate: true },
);

onUnmounted(() => { responseVersion++; cancelRequest++; stopPolling(); });

defineExpose({ reload: load, run });
</script>

<template>
  <section aria-label="Run status" class="flex flex-col gap-3">
    <p v-if="loading" role="status" class="text-[13px] text-nf-text-faint">
      {{ t("common.loading") }}
    </p>
    <p v-else-if="error" role="alert" class="text-[13px] text-nf-warn">{{ error }}</p>

    <template v-else-if="run">
      <div class="flex items-center gap-2">
        <span
          role="status"
          class="text-[13px] font-semibold"
          :class="statusClass(run.status)"
        >
          {{ statusLabel(run.status) }}
        </span>
        <div class="flex-1" />
        <button
          v-if="canCancel"
          :disabled="cancelling"
          class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          @click="cancel"
        >
          {{ cancelling ? t("run.cancelling") : t("run.cancelRun") }}
        </button>
      </div>

      <template v-if="run.errorMessage || failedSteps.length">
        <p role="alert" class="text-[12.5px] text-nf-warn">{{ t("run.failedMessage") }}</p>
        <details class="text-[12px] text-nf-text-dim">
          <summary class="cursor-pointer focus-visible:nf-focus">{{ t("run.technicalDetails") }}</summary>
          <p v-if="run.errorMessage" class="mt-2 whitespace-pre-wrap break-words">{{ run.errorMessage }}</p>
          <p v-for="s in failedSteps" :key="s.stepKey" class="mt-2 whitespace-pre-wrap break-words">{{ s.stepKey }}: {{ s.errorMessage }}</p>
        </details>
      </template>

      <WorkflowRetryAction :workspace-id="workspaceId" :run="run" :can-configure="canConfigure" @retried="emit('retried', $event)" @configure="emit('configure', $event)" />
      <div v-if="sortedSteps.length">
        <h3
          class="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
        >
          {{ t("run.steps") }}
        </h3>
        <ol class="flex flex-col gap-1">
          <li
            v-for="s in sortedSteps"
            :key="s.stepKey"
            class="flex items-center gap-2 rounded-md bg-nf-bg-2 px-2.5 py-1.5 text-[12px]"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="statusClass(s.status)"
              aria-hidden="true"
            />
            <span class="font-mono text-[11.5px] text-nf-text-dim">{{ s.stepKey }}</span>
            <span class="truncate text-[11px] text-nf-text-faint">{{ s.kind }}</span>
            <span class="ml-auto shrink-0 tabular-nums text-[11px]" :class="statusClass(s.status)">
              {{ statusLabel(s.status) }}{{ s.latencyMs !== null ? ` · ${s.latencyMs}ms` : "" }}
            </span>
          </li>
        </ol>
      </div>

      <button
        v-if="run.status === 'CANCELLED'"
        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="$emit('run-updated', run!)"
      >
        {{ t("run.startNewRun") }}
      </button>
    </template>
  </section>
</template>
