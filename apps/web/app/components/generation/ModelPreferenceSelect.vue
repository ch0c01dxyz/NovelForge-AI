<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ActionMenu from "../ui/ActionMenu.vue";
const props = defineProps<{ workspaceId: string; profile?: string; modelValue: string; disabled?: boolean; fieldLabel?: string; automaticLabel?: string; hint?: string; inheritedModelRef?: string | null }>();
const emit = defineEmits<{ (event: "update:modelValue", value: string): void }>();
interface ModelOption { modelRef: string | null; providerModelId: string; displayName: string | null; gatewayId: string; gatewayName?: string; selectable: boolean; unavailableReason?: string | null }
const { api } = useApi();
const { t } = useLocale();
const options = ref<ModelOption[]>([]);
const loading = ref(false);
const failed = ref(false);
const query = ref("");const limit = ref(100);const searchInput = ref<HTMLInputElement | null>(null);
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return options.value.filter(option => `${option.displayName ?? ''} ${option.providerModelId} ${option.gatewayName ?? ''} ${option.gatewayId}`.toLocaleLowerCase().includes(needle));
});
const visible = computed(() => filtered.value.slice(0, limit.value));
watch(query, () => { limit.value = 100; });
async function toggle(event: Event) {
  const menu = event.target as HTMLDetailsElement;
  if (!menu.open) { query.value = "";return; }
  await nextTick();if (menu.open) searchInput.value?.focus();
}
let sequence = 0;
const effectiveChoice = computed(() => props.modelValue || props.inheritedModelRef || "");
const missing = computed(() => effectiveChoice.value && !options.value.some(option => option.selectable && option.modelRef === effectiveChoice.value));
const label = (option: ModelOption) => `${option.displayName || option.providerModelId} · ${option.providerModelId} · ${option.gatewayName || option.gatewayId}`;
const selectedLabel = computed(() => {
  const selected = options.value.find(option => option.modelRef === effectiveChoice.value);
  const modelLabel = selected ? label(selected) : `${t("modelPreference.unavailable")} — ${effectiveChoice.value}`;
  return !props.modelValue ? `${props.automaticLabel ?? t("modelPreference.automatic")}${effectiveChoice.value ? ` · ${modelLabel}` : ''}` : modelLabel;
});
async function load() {
  const request = ++sequence;
  loading.value = true;
  failed.value = false;
  options.value = [];
  query.value = "";limit.value = 100;
  try {
    const result = await api<ModelOption[]>(`/workspaces/${encodeURIComponent(props.workspaceId)}/model-catalog${props.profile ? `?profile=${encodeURIComponent(props.profile)}` : ''}`);
    if (request === sequence) options.value = result.filter(option => option.selectable && option.modelRef);
  } catch {
    if (request === sequence) failed.value = true;
  } finally {
    if (request === sequence) loading.value = false;
  }
}
watch(() => [props.workspaceId, props.profile], load, { immediate: true });
onUnmounted(() => { sequence++; });
</script>

<template>
  <div class="my-2 flex flex-col gap-1.5">
    <div class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
      {{ fieldLabel ?? t("modelPreference.label") }}
      <ActionMenu :label="`${fieldLabel ?? t('modelPreference.label')}: ${selectedLabel}`" class="nf-model-preference w-full" @toggle="toggle">
        <template #trigger><span class="min-w-0 truncate">{{ selectedLabel }}</span></template>
        <div class="sticky top-0 z-10 bg-nf-bg-2 p-2">
          <input ref="searchInput" v-model="query" type="search" :aria-label="t('modelPreference.search')" :placeholder="t('modelPreference.search')" class="w-full min-w-0 rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus" @keydown.enter.prevent />
          <p role="status" class="mt-1 text-[11.5px] text-nf-text-faint">{{ t('modelPreference.resultCount', { shown: visible.length, count: filtered.length, total: options.length }) }}</p>
        </div>
        <button type="button" data-model-ref="" :aria-pressed="!modelValue" :disabled="disabled || loading" @click="emit('update:modelValue', '')">{{ automaticLabel ?? t("modelPreference.automatic") }}</button>
        <button v-for="option in visible" :key="JSON.stringify([option.gatewayId, option.providerModelId])" type="button" :data-model-ref="option.modelRef"
          :aria-pressed="modelValue === option.modelRef" :disabled="disabled || loading || !option.selectable || !option.modelRef" @click="option.modelRef && emit('update:modelValue', option.modelRef)">{{ label(option) }}</button>
        <p v-if="!loading && !failed && query.trim() && !filtered.length" class="px-3 py-2 text-[12px] text-nf-text-dim">{{ t('modelPreference.noMatches') }}</p>
        <button v-if="visible.length < filtered.length" type="button" @click.stop="limit += 100">{{ t('modelPreference.showMore') }}</button>
      </ActionMenu>
    </div>
    <p class="text-[11.5px] leading-relaxed text-nf-text-faint">{{ hint ?? t("modelPreference.hint") }}</p>
    <p v-if="loading" role="status" class="text-[12px] text-nf-text-dim">{{ t("common.loading") }}</p>
    <div v-else-if="failed" role="alert" class="text-[12px] text-nf-warn">
      {{ t("modelPreference.loadFailed") }}
      <button type="button" :disabled="disabled" class="ml-1 rounded border border-nf-border px-2 py-1 hover:nf-hover focus-visible:nf-focus" @click="load">{{ t("common.retry") }}</button>
    </div>
    <p v-else-if="!options.length" class="text-[12px] text-nf-text-dim">{{ t("modelPreference.empty") }}</p>
    <p v-if="missing && !loading" role="status" class="text-[12px] text-nf-warn">{{ t("modelPreference.stale") }}</p>
  </div>
</template>

<style scoped>
.nf-model-preference :deep(summary) { width: 100%; justify-content: space-between; }
.nf-model-preference :deep(.nf-menu-panel) { left: 0; right: 0; min-width: 0; max-height: 18rem; overflow-y: auto; }
.nf-model-preference :deep(.nf-menu-panel button) { white-space: normal; overflow-wrap: anywhere; }
</style>
