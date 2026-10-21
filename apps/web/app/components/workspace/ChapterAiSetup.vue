<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { useWorkflowRuns } from "../../composables/useWorkflowRuns";
import type { AiChapterSetup } from "../../composables/useAiChapterCreation";
import WorkflowRunModelPreferences from "../generation/WorkflowRunModelPreferences.vue";
const props = defineProps<{ workspaceId: string; novelId: string; busy: boolean }>();
const emit = defineEmits<{ start: [setup: AiChapterSetup] }>();
const { api } = useApi();
const { t } = useLocale();
const workflowId = ref<string | null>(null);
const outlineRef = ref<string | null>(null);
const notes = ref("");
const words = ref(1000);
const models = ref<Record<string, string>>({});
const fingerprint = ref<string | null>(null);
const loading = ref(true);
const error = ref(false);
let mounted = true;
onUnmounted(() => { mounted = false; });
async function load(install = false) {
  loading.value = true; error.value = false;
  try {
    const workflow = install
      ? (await api<{ workflowId: string }>(`/workspaces/${props.workspaceId}/studio/chapter-creation`, { method: "POST", body: "{}" })).workflowId
      : await useWorkflowRuns().resolveWorkflowId(props.workspaceId, "chapter-creation-review");
    const outlines = await api<Array<{ id: string; status: string }>>(`/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/outline-versions`);
    if (!mounted) return;
    workflowId.value = workflow;
    outlineRef.value = outlines.find(outline => outline.status === "APPROVED")?.id ?? null;
  } catch { if (mounted) error.value = true; }
  finally { if (mounted) loading.value = false; }
}
function submit() {
  if (props.busy || !workflowId.value || !outlineRef.value || !fingerprint.value || !Number.isSafeInteger(words.value) || words.value < 1) return;
  emit("start", { workflowId: workflowId.value, outlineRef: outlineRef.value, styleNotes: notes.value.trim(), targetWordCount: words.value, stepModelRefs: { ...models.value }, fingerprint: fingerprint.value });
}
onMounted(() => { void load(); });
</script>
<template>
  <div class="mt-4 space-y-4">
    <p class="text-sm text-nf-text-dim">{{ t('chapterCreation.aiHint') }}</p>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-if="error" role="alert" class="text-sm text-nf-error">{{ t('chapterCreation.setupFailed') }}</p>
    <button v-if="error" type="button" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" :disabled="loading || busy" @click="load()">{{ t('common.retry') }}</button>
    <button v-if="!loading && !workflowId" type="button" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" :disabled="busy" @click="load(true)">{{ t('chapterCreation.setup') }}</button>
    <template v-if="!loading && workflowId">
      <p v-if="!outlineRef" role="alert" class="text-sm text-nf-warn">{{ t('generation.outlineNone') }}</p>
      <label class="block text-sm">{{ t('generation.targetWords') }}<input v-model.number="words" type="number" min="1" :disabled="busy" class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      <label class="block text-sm">{{ t('generation.styleNotes') }}<textarea v-model="notes" rows="3" maxlength="12000" :disabled="busy" :placeholder="t('generation.styleNotesPlaceholder')" class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      <WorkflowRunModelPreferences v-model="models" :workspace-id="workspaceId" :workflow-id="workflowId" :novel-id="novelId" :disabled="busy" @fingerprint="fingerprint = $event" />
      <button type="button" :disabled="busy || !outlineRef || !fingerprint || !Number.isSafeInteger(words) || words < 1" class="w-full rounded-lg bg-nf-accent px-4 py-2.5 font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50" @click="submit">{{ t(busy ? 'generation.starting' : 'chapterCreation.generate') }}</button>
    </template>
  </div>
</template>
