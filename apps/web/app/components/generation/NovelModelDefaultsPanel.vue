<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ModelPreferenceSelect from "./ModelPreferenceSelect.vue";
const props = defineProps<{ workspaceId: string; novelId: string }>();
interface Defaults { id: string | null; number: number; generationModelRef: string | null; analysisModelRef: string | null }
const { api } = useApi();
const { t } = useLocale();
const version = ref<Defaults | null>(null);
const generation = ref("");
const analysis = ref("");
const reason = ref("");
const loading = ref(false);
const saving = ref(false);
const needsReload = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
let sequence = 0;
const base = () => `/workspaces/${encodeURIComponent(props.workspaceId)}/novels/${encodeURIComponent(props.novelId)}/model-defaults`;
function accept(result: Defaults) {
  version.value = result;
  generation.value = result.generationModelRef ?? "";
  analysis.value = result.analysisModelRef ?? "";
  reason.value = "";
}
async function load() {
  if (saving.value) return;
  const request = ++sequence;
  loading.value = true;
  error.value = null;
  saved.value = false;
  version.value = null;
  try {
    const result = await api<Defaults>(base());
    if (request === sequence) { accept(result); needsReload.value = false; }
  } catch {
    if (request === sequence) error.value = t("novelModelDefaults.loadFailed");
  } finally {
    if (request === sequence) loading.value = false;
  }
}
async function save() {
  if (!version.value || loading.value || saving.value || needsReload.value || !reason.value.trim()) return;
  const request = sequence;
  saving.value = true;
  error.value = null;
  saved.value = false;
  try {
    const result = await api<Defaults>(base(), { method: "PUT", body: JSON.stringify({ expectedVersion: version.value.number, generationModelRef: generation.value || null, analysisModelRef: analysis.value || null, reason: reason.value.trim() }) });
    if (request === sequence) { accept(result); saved.value = true; }
  } catch (cause) {
    if (request !== sequence) return;
    needsReload.value = true;
    error.value = t(cause instanceof ApiError && cause.status === 409 ? "novelModelDefaults.conflict"
      : cause instanceof ApiError && [400, 403, 404].includes(cause.status) ? "novelModelDefaults.saveFailed" : "novelModelDefaults.uncertain");
  } finally {
    if (request === sequence) saving.value = false;
  }
}
watch(() => [props.workspaceId, props.novelId], () => {
  saving.value = false;
  generation.value = "";
  analysis.value = "";
  reason.value = "";
  void load();
}, { immediate: true });
onUnmounted(() => { sequence++; });
</script>

<template>
  <section class="flex flex-col gap-4" :aria-label="t('novelModelDefaults.title')">
    <p class="text-[13px] leading-relaxed text-nf-text-dim">{{ t("novelModelDefaults.description") }}</p>
    <p v-if="loading" role="status" class="text-[13px] text-nf-text-dim">{{ t("common.loading") }}</p>
    <p v-if="error" role="alert" class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-3 text-[13px] text-nf-warn">{{ error }}</p>
    <p v-if="saved" role="status" class="text-[13px] text-nf-text-dim">{{ t("novelModelDefaults.saved") }}</p>
    <form v-if="version && !loading" class="flex flex-col gap-3 rounded-lg border border-nf-border bg-nf-bg-2 p-4" @submit.prevent="save">
      <p data-testid="defaults-version" class="text-[11px] uppercase tracking-wider text-nf-text-faint">{{ t("novelModelDefaults.version") }} {{ version.number }}</p>
      <ModelPreferenceSelect v-model="generation" :workspace-id="workspaceId" profile="CREATIVE_WRITER" :disabled="saving || needsReload"
        :field-label="t('novelModelDefaults.generation')" :automatic-label="t('novelModelDefaults.automatic')" :hint="t('novelModelDefaults.routingHint')" />
      <ModelPreferenceSelect v-model="analysis" :workspace-id="workspaceId" profile="STRUCTURED_EXTRACTOR" :disabled="saving || needsReload"
        :field-label="t('novelModelDefaults.analysis')" :automatic-label="t('novelModelDefaults.automatic')" :hint="t('novelModelDefaults.routingHint')" />
      <label class="flex flex-col gap-1.5 text-[12px] text-nf-text-dim">{{ t("novelModelDefaults.reason") }}
        <textarea v-model="reason" rows="3" maxlength="4000" required :disabled="saving"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus disabled:opacity-50" />
      </label>
      <button type="submit" :disabled="saving || needsReload || !reason.trim()" class="self-start rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50">{{ t(saving ? "common.saving" : "novelModelDefaults.save") }}</button>
    </form>
    <button type="button" data-testid="defaults-reload" :disabled="saving || loading" class="self-start rounded-lg border border-nf-border-strong px-3 py-2 text-[12px] text-nf-text-dim hover:nf-hover focus-visible:nf-focus disabled:opacity-50" @click="load">{{ t("novelModelDefaults.reload") }}</button>
  </section>
</template>
