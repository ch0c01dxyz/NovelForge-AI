<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useAiStudio } from "../../composables/useAiStudio";
import { ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
const props = defineProps<{ workspaceId: string }>();
const emit = defineEmits<{ installed: [value: { workspaceId: string; workflowId: string }] }>();
const studio = useAiStudio();const { t } = useLocale();
const confirmed = ref(false), busy = ref(false), success = ref(false);
const error = ref("");let scope = 0;
watch(() => props.workspaceId, () => { scope++;confirmed.value = false;busy.value = false;success.value = false;error.value = ""; });
onUnmounted(() => { scope++; });
async function install() {
  if (!confirmed.value || busy.value || success.value) return;
  const version = scope, target = props.workspaceId;busy.value = true;error.value = "";
  try {
    const result = await studio.installStarterPack(target);
    if (version !== scope) return;
    success.value = true;emit("installed", { workspaceId: target, workflowId: result.workflowId });
  } catch (failure) {
    if (version !== scope) return;
    error.value = failure instanceof ApiError && failure.code === "STARTER_PACK_KEY_CONFLICT"
      ? `${t('studioStarter.conflict')} ${failure.definitionKey ?? ''}`
      : t('studioStarter.failed');
  } finally { if (version === scope) busy.value = false; }
}
</script>

<template>
  <details class="mb-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4">
    <summary class="cursor-pointer text-[14px] font-semibold text-nf-text focus-visible:nf-focus">{{ t('studioStarter.title') }}</summary>
    <p class="mt-3 text-[13px] text-nf-text-dim">{{ t('studioStarter.description') }}</p>
    <p class="mt-2 text-[12px] text-nf-text-faint">{{ t('studioStarter.safety') }}</p>
    <label class="mt-3 flex items-start gap-2 text-[13px] text-nf-text"><input v-model="confirmed" type="checkbox" :disabled="busy || success" class="mt-1 accent-nf-accent focus-visible:nf-focus" />{{ t('studioStarter.confirm') }}</label>
    <button type="button" :disabled="!confirmed || busy || success" class="mt-3 rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50" @click="install">{{ t(busy ? 'common.saving' : 'studioStarter.install') }}</button>
    <p v-if="success" role="status" class="mt-3 text-[13px] text-nf-text">{{ t('studioStarter.success') }}</p>
    <p v-if="error" role="alert" class="mt-3 break-words text-[13px] text-nf-warn">{{ error }}</p>
  </details>
</template>
