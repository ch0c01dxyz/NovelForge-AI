<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ActionMenu from "../ui/ActionMenu.vue";
const props = defineProps<{ base: string; kind: "GROUP" | "CHARACTER" | "REFERENCE"; modelValue?: string; label: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { api } = useApi(), { t } = useLocale();
const query = ref(""), options = ref<{ id: string; name: string; preview?: string }[]>([]), selectedName = ref("");
const loading = ref(false), failed = ref(false), preview = ref("");
let epoch = 0, timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const stamp = ++epoch; loading.value = true; failed.value = false;
  try {
    const result = await api<typeof options.value>(`${props.base}/story-discoveries/options?kind=${props.kind}&q=${encodeURIComponent(query.value)}${props.modelValue ? `&selected=${encodeURIComponent(props.modelValue)}` : ''}`);
    if (stamp !== epoch) return;
    options.value = result;
    const selected = result.find(o => o.id === props.modelValue);
    if (selected) { selectedName.value = selected.name; preview.value = selected.preview ?? ""; }
  } catch { if (stamp === epoch) failed.value = true; }
  finally { if (stamp === epoch) loading.value = false; }
}
watch(() => [props.base, props.kind], () => { clearTimeout(timer); query.value = ""; options.value = []; selectedName.value = ""; preview.value = ""; void load(); }, { immediate: true });
watch(query, () => { epoch++; clearTimeout(timer); timer = setTimeout(() => { void load(); }, 250); });
watch(() => props.modelValue, value => { if (!value) { selectedName.value = ""; preview.value = ""; } });
onUnmounted(() => { epoch++; clearTimeout(timer); });
function choose(option?: typeof options.value[number]) {
  selectedName.value = option?.name ?? ""; preview.value = option?.preview ?? "";
  emit("update:modelValue", option?.id ?? "");
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <p class="text-xs text-nf-text-dim">{{ label }}</p>
    <ActionMenu :label="label" class="story-identity w-full">
      <template #trigger><span class="truncate">{{ modelValue ? selectedName || t('storySuggestions.selected') : t('storySuggestions.automatic') }}</span></template>
      <div class="p-2"><input v-model="query" type="search" maxlength="100" :aria-label="t('storySuggestions.search')" :placeholder="t('storySuggestions.search')" class="nf-input w-full" :disabled="disabled" @keydown.enter.prevent /></div>
      <button type="button" :disabled="disabled" @click="choose()">{{ t('storySuggestions.automatic') }}</button>
      <button v-for="option in options" :key="option.id" type="button" :disabled="disabled || loading" :aria-pressed="modelValue === option.id" @click="choose(option)">{{ option.name }}</button>
      <p v-if="loading" role="status" class="p-2 text-xs">{{ t('common.loading') }}</p>
      <p v-else-if="!failed && !options.length" class="p-2 text-xs">{{ t('storySuggestions.noMatches') }}</p>
      <button v-if="failed" type="button" :disabled="disabled" @click.stop="load">{{ t('common.retry') }}</button>
      <p class="p-2 text-xs text-nf-text-faint">{{ t('storySuggestions.searchHint') }}</p>
    </ActionMenu>
    <details v-if="preview" class="text-xs text-nf-text-dim"><summary>{{ t('storySuggestions.preview') }}</summary><p class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{{ preview }}</p></details>
  </div>
</template>

<style scoped>
.story-identity :deep(summary) { width: 100%; justify-content: space-between; }
.story-identity :deep(.nf-menu-panel) { left: 0; right: 0; min-width: 0; max-height: 18rem; overflow-y: auto; }
.story-identity :deep(.nf-menu-panel button) { white-space: normal; overflow-wrap: anywhere; }
</style>
