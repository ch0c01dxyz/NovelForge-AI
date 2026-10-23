<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useWorkflowRuns, type WorkflowRetry } from "../../composables/useWorkflowRuns";
import { useLocale } from "../../composables/useLocale";
import { ApiError } from "../../composables/useApi";
const props = defineProps<{ workspaceId: string; run: { id: string; status: string; retry?: WorkflowRetry }; canConfigure?: boolean }>();
const emit = defineEmits<{ (e: "retried", payload: { runId: string; statusUrl: string }): void; (e: "configure", runId: string): void }>();
const { t } = useLocale();
const runs = useWorkflowRuns();
const busy = ref(false), blocked = ref(false), error = ref("");
let epoch = 0;
const eligible = computed(() => props.run.status === "FAILED" && !!props.run.retry);
const configurable = computed(() => props.run.status === "FAILED" && !props.run.retry && props.canConfigure);
watch(() => [props.workspaceId, props.run.id], () => { epoch++; busy.value = false; blocked.value = false; error.value = ""; });
onUnmounted(() => { epoch++; });
async function retry() {
  if (!eligible.value || busy.value || blocked.value) return;
  const stamp = epoch, workspaceId = props.workspaceId, runId = props.run.id;
  busy.value = true; error.value = "";
  try {
    const result = await runs.retryRun(workspaceId, runId);
    if (stamp !== epoch) return;
    emit("retried", { runId: result.id, statusUrl: result.statusUrl });
  } catch (failure) {
    if (stamp !== epoch) return;
    if (failure instanceof ApiError && [400, 401, 403, 404, 409].includes(failure.status)) {
      blocked.value = true;
      error.value = failure.status === 409 ? "run.retryChanged" : "run.retryUnavailable";
    } else error.value = "run.retryUncertain";
  } finally { if (stamp === epoch) busy.value = false; }
}
</script>

<template>
  <div v-if="eligible" class="space-y-2 rounded-lg border border-nf-accent-border bg-nf-accent-dim p-3" :aria-busy="busy">
    <p class="text-[12.5px] leading-relaxed text-nf-text">{{ t(run.retry?.reason === 'INVALID_AI_OUTPUT' ? 'run.retryInvalidOutput' : 'run.retryConnection') }}</p>
    <p class="text-[11.5px] text-nf-text-dim">{{ t("run.retryPreserved") }}</p>
    <p v-if="error" role="alert" class="text-[12.5px] text-nf-warn">{{ t(error) }}</p>
    <button type="button" :disabled="busy || blocked" class="inline-flex min-h-9 items-center gap-2 rounded-lg bg-nf-accent px-3 py-2 text-[12.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50" data-testid="retry-failed-step" @click="retry">
      <svg class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8a6 6 0 1 0 .1 3M16 3v5h-5" /></svg>
      {{ t(busy ? "run.retrying" : "run.retryStep") }}
    </button>
  </div>
  <div v-else-if="configurable" class="space-y-2 rounded-lg border border-nf-accent-border bg-nf-accent-dim p-3">
    <p class="text-[12.5px] leading-relaxed text-nf-text">{{ t("run.configureRecovery") }}</p>
    <p class="text-[11.5px] text-nf-text-dim">{{ t("run.configureRestart") }}</p>
    <button type="button" class="inline-flex min-h-9 items-center gap-2 rounded-lg bg-nf-accent px-3 py-2 text-[12.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus" data-testid="configure-failed-run" @click="emit('configure', run.id)">{{ t("run.configureRetry") }}</button>
  </div>
</template>
