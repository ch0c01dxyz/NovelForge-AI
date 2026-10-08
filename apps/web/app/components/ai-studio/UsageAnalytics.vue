<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue";
import { useReceipts, type UsageAnalyticsView, type NovelSummary } from "../../composables/useReceipts";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{ workspaceId: string }>();
const { t } = useLocale();
const receipts = useReceipts();
const novels = ref<NovelSummary[]>([]);
const novelId = ref("");
const component = ref("");
const offset = ref(0);
const data = ref<UsageAnalyticsView | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const novelError = ref(false);
const components = ["CHAPTER", "COVER", "LORE", "OUTLINE", "EMBEDDING", "OTHER"];
let request = 0;
let novelRequest = 0;

async function refresh() {
  const current = ++request;
  loading.value = true; error.value = null;
  try {
    const result = await receipts.usageAnalytics(props.workspaceId, {
      novelId: novelId.value || undefined, component: component.value || undefined, limit: 50, offset: offset.value,
    });
    if (current === request) data.value = result;
  } catch {
    if (current === request) { data.value = null; error.value = t("usage.loadError"); }
  } finally { if (current === request) loading.value = false; }
}
async function loadNovels() {
  const current = ++novelRequest;
  novels.value = []; novelError.value = false;
  try { const result = await receipts.listNovels(props.workspaceId); if (current === novelRequest) novels.value = result; }
  catch { if (current === novelRequest) novelError.value = true; }
}
function page(direction: number) { offset.value = Math.max(0, offset.value + direction * 50); void refresh(); }
function retry() { void refresh(); if (novelError.value) void loadNovels(); }
watch([() => props.workspaceId, novelId, component], () => { offset.value = 0; data.value = null; void refresh(); });
watch(() => props.workspaceId, () => { novelId.value = ""; void loadNovels(); });
onMounted(() => { void refresh(); void loadNovels(); });
onUnmounted(() => { ++request; ++novelRequest; });
</script>

<template>
  <section aria-labelledby="usage-title" class="space-y-4">
    <h2 id="usage-title" class="text-[15px] font-semibold text-nf-text">{{ t("usage.title") }}</h2>
    <p class="text-[12.5px] text-nf-text-dim">{{ t("usage.description") }}</p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-[12.5px] text-nf-text-dim">{{ t("usage.novel") }}
        <select v-model="novelId" data-filter="novel" class="ml-2 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1 focus-visible:nf-focus">
          <option value="">{{ t("usage.allNovels") }}</option>
          <option v-for="novel in novels" :key="novel.id" :value="novel.id">{{ novel.title }}</option>
        </select>
      </label>
      <label class="text-[12.5px] text-nf-text-dim">{{ t("usage.component") }}
        <select v-model="component" data-filter="component" class="ml-2 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1 focus-visible:nf-focus">
          <option value="">{{ t("usage.allComponents") }}</option>
          <option v-for="kind in components" :key="kind" :value="kind">{{ t(`usage.components.${kind}`) }}</option>
        </select>
      </label>
      <button data-refresh class="rounded-lg border border-nf-border-strong px-3 py-1 text-[12.5px] text-nf-text focus-visible:nf-focus" @click="retry">{{ t("usage.refresh") }}</button>
    </div>
    <p v-if="novelError" role="alert" class="text-nf-warn">{{ t("usage.novelError") }}</p>
    <p v-if="loading" role="status" class="text-nf-text-faint">{{ t("common.loading") }}</p>
    <p v-else-if="error" role="alert" class="text-nf-warn">{{ error }}</p>
    <div v-else-if="data" class="space-y-4">
      <dl class="grid grid-cols-2 gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4 text-[13px] sm:grid-cols-4">
        <div><dt class="text-nf-text-dim">{{ t("usage.recordedTokens") }}</dt><dd class="mt-1 font-semibold text-nf-text">{{ data.summary.totalTokens }}</dd></div>
        <div><dt class="text-nf-text-dim">{{ t("usage.inputTokens") }}</dt><dd class="mt-1 text-nf-text">{{ data.summary.inputTokens }}</dd></div>
        <div><dt class="text-nf-text-dim">{{ t("usage.outputTokens") }}</dt><dd class="mt-1 text-nf-text">{{ data.summary.outputTokens }}</dd></div>
        <div><dt class="text-nf-text-dim">{{ t("usage.requestsAttempts") }}</dt><dd class="mt-1 text-nf-text">{{ data.summary.requests }} / {{ data.summary.attempts }}</dd></div>
      </dl>
      <p v-if="data.summary.unknownUsageRequests || data.summary.unknownUsageAttempts || data.summary.legacyRequests" role="status" class="rounded-lg border border-nf-border bg-nf-bg-2 p-3 text-[12.5px] text-nf-text-dim">
        {{ t("usage.coverage", { requests: data.summary.unknownUsageRequests, attempts: data.summary.unknownUsageAttempts, legacy: data.summary.legacyRequests }) }}
      </p>
      <p v-if="data.summary.requests === 0" class="text-nf-text-faint">{{ t("usage.empty") }}</p>
      <div v-else class="overflow-x-auto rounded-xl border border-nf-border bg-nf-bg-1">
        <table class="w-full border-collapse text-left text-[12.5px]">
          <caption class="sr-only">{{ t("usage.breakdown") }}</caption>
          <thead><tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
            <th scope="col" class="p-3">{{ t("usage.component") }} / {{ t("usage.task") }}</th>
            <th scope="col" class="p-3">{{ t("usage.artifact") }}</th><th scope="col" class="p-3">{{ t("usage.reportedModel") }}</th>
            <th scope="col" class="p-3">{{ t("usage.inputTokens") }}</th><th scope="col" class="p-3">{{ t("usage.outputTokens") }}</th><th scope="col" class="p-3">{{ t("usage.recordedTokens") }}</th>
          </tr></thead>
          <tbody><tr v-for="(row, index) in data.rows" :key="index" class="border-b border-nf-border/60 text-nf-text-dim">
            <td class="p-3">{{ t(`usage.components.${row.component}`) }}<div class="font-mono text-[11.5px]">{{ row.task }}</div></td>
            <td class="p-3 font-mono text-[11.5px]">{{ row.artifactId ?? t("usage.unattributed") }}</td>
            <td class="p-3">{{ row.model ?? t("usage.unknown") }}</td>
            <td class="p-3">{{ row.inputTokens }}</td><td class="p-3">{{ row.outputTokens }}</td>
            <td class="p-3">{{ row.totalTokens }}<span v-if="row.unknownUsageRecords" class="block text-[11.5px]">{{ t("usage.partial") }}</span><span v-if="row.legacyRecords" class="block text-[11.5px]">{{ t("usage.legacy") }}</span></td>
          </tr></tbody>
        </table>
      </div>
      <div class="flex gap-3">
        <button :disabled="offset === 0" class="rounded-lg border border-nf-border px-3 py-1 text-nf-text-dim disabled:opacity-40 focus-visible:nf-focus" @click="page(-1)">{{ t("usage.previous") }}</button>
        <button :disabled="!data.hasMore" class="rounded-lg border border-nf-border px-3 py-1 text-nf-text-dim disabled:opacity-40 focus-visible:nf-focus" @click="page(1)">{{ t("usage.next") }}</button>
      </div>
    </div>
  </section>
</template>
