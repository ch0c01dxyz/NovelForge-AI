<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useWorkflowRuns, type WorkflowModelPreferencePreview } from "../../composables/useWorkflowRuns";
import { useLocale } from "../../composables/useLocale";
import ModelPreferenceSelect from "./ModelPreferenceSelect.vue";
const props = defineProps<{ workspaceId: string; workflowId: string; novelId: string; modelValue: Record<string, string>; disabled?: boolean }>();
const emit = defineEmits<{ (event: "update:modelValue", value: Record<string, string>): void; (event: "fingerprint", value: string | null): void }>();
const { t } = useLocale();
const runs = useWorkflowRuns();
const preview = ref<WorkflowModelPreferencePreview | null>(null);
const loading = ref(false);
const failed = ref(false);
let sequence = 0;
async function load(discard = false) {
  const request = ++sequence;
  if (discard) emit("update:modelValue", {});
  emit("fingerprint", null);
  loading.value = true;
  failed.value = false;
  preview.value = null;
  try {
    const result = await runs.previewModelPreferences(props.workspaceId, props.workflowId, props.novelId);
    if (request !== sequence) return;
    preview.value = result;
    emit("fingerprint", result.fingerprint);
  } catch {
    if (request === sequence) failed.value = true;
  } finally {
    if (request === sequence) loading.value = false;
  }
}
function select(stepKey: string, modelRef: string) {
  if (props.disabled) return;
  const choices = { ...props.modelValue };
  if (modelRef) choices[stepKey] = modelRef;
  else delete choices[stepKey];
  emit("update:modelValue", choices);
}
watch(() => [props.workspaceId, props.workflowId, props.novelId], () => { emit("update:modelValue", {});void load(); }, { immediate: true });
onUnmounted(() => { sequence++; });
</script>

<template>
  <details data-testid="workflow-models" class="rounded-lg border border-nf-border bg-nf-bg-1 p-2.5">
    <summary class="cursor-pointer text-[12.5px] font-medium text-nf-text-dim focus-visible:nf-focus">{{ t("workflowModelPreferences.title") }}</summary>
    <p class="mt-2 text-[11.5px] leading-relaxed text-nf-text-faint">{{ t("workflowModelPreferences.hint") }}</p>
    <p v-if="loading" role="status" class="mt-2 text-[12px] text-nf-text-dim">{{ t("common.loading") }}</p>
    <p v-if="failed" role="alert" class="mt-2 text-[12px] text-nf-warn">{{ t("workflowModelPreferences.failed") }}</p>
    <template v-if="preview">
      <p v-if="!preview.steps.length" class="mt-2 text-[12px] text-nf-text-dim">{{ t("workflowModelPreferences.empty") }}</p>
      <div v-for="step in preview.steps" :key="step.stepKey" :data-step-key="step.stepKey" class="mt-3 border-t border-nf-border pt-2">
        <span class="inline-flex rounded-md border border-nf-border bg-nf-bg-2 px-2 py-0.5 text-[10.5px] text-nf-text-dim">{{ t(`workflowModelPreferences.sources.${step.inheritedSource}`) }}</span>
        <ModelPreferenceSelect :model-value="Object.hasOwn(modelValue, step.stepKey) ? modelValue[step.stepKey]! : ''" :workspace-id="workspaceId" :profile="step.profile"
          :inherited-model-ref="step.inheritedModelRef" :field-label="`${step.stepKey} · ${step.definitionKey}`" :automatic-label="t('workflowModelPreferences.inherit')"
          :hint="step.profile" :disabled="disabled" @update:model-value="select(step.stepKey, $event)" />
      </div>
    </template>
    <button type="button" data-testid="workflow-models-reload" :disabled="disabled || loading" class="mt-2 rounded-md border border-nf-border-strong px-2 py-1 text-[11.5px] text-nf-text-dim hover:nf-hover focus-visible:nf-focus disabled:opacity-50" @click="load(true)">{{ t("workflowModelPreferences.reload") }}</button>
  </details>
</template>
