<script setup lang="ts">
/**
 * Retrieval search (NF-WF-016, Invariant 1.7).
 *
 * Searches the research corpus through POST
 * /workspaces/:workspaceId/retrieval/search with mode fixed to AUTHOR
 * (the authoring UI; READER/EDITOR modes belong to other surfaces and
 * are deliberately not offered here). The query is required, limit is
 * bounded 1–100. Results render hit text as plain text (never HTML).
 */
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

interface RetrievalHit {
  chunkId: string;
  referenceId: string;
  referenceVersionId: string;
  referenceTitle: string;
  start: number;
  end: number;
  text: string;
  score: number;
  foundBy: string[];
}

interface SearchResult {
  hits: RetrievalHit[];
  withheldCount: number;
  retrievers: string[];
  mode: string;
  readerChapter: number | null;
  auditId: string;
}

const query = ref("");
const limit = ref(10);
const result = ref<SearchResult | null>(null);
const searching = ref(false);
const searched = ref(false);
const error = ref<string | null>(null);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.research.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.research.errors.notFound");
  return t("workspace.research.errors.unknown");
}

async function search() {
  error.value = null;
  const q = query.value.trim();
  if (!q) {
    error.value = t("workspace.research.search.queryRequired");
    return;
  }
  const n = Number(limit.value);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    error.value = t("workspace.research.search.limitInvalid");
    return;
  }
  searching.value = true;
  try {
    result.value = await api<SearchResult>(`/workspaces/${props.workspaceId}/retrieval/search`, {
      method: "POST",
      body: JSON.stringify({ query: q, novelId: props.novelId, mode: "AUTHOR", limit: n }),
    });
    searched.value = true;
  } catch (e) {
    error.value = errorKey(e);
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <form class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3" @submit.prevent="search">
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.research.search.queryLabel") }}
        <input
          v-model="query"
          type="text"
          maxlength="2000"
          required
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          :placeholder="t('workspace.research.search.queryPlaceholder')"
        />
      </label>
      <div class="flex items-end gap-2">
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.research.search.limitLabel") }}
          <input
            v-model.number="limit"
            type="number"
            min="1"
            max="100"
            class="w-24 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </label>
        <span class="pb-2 text-[11.5px] text-nf-text-faint">{{ t("workspace.research.search.modeNote") }}</span>
        <button
          type="submit"
          :disabled="searching"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{ t("workspace.research.search.submit") }}
        </button>
      </div>
      <p
        v-if="error"
        role="alert"
        class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
      >
        {{ error }}
      </p>
    </form>

    <div v-if="result" class="flex flex-col gap-2">
      <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
        {{ t("workspace.research.search.resultsTitle", { count: result.hits.length }) }}
      </h3>
      <p class="font-mono text-[11px] text-nf-text-faint">
        {{
          t("workspace.research.search.resultMeta", {
            mode: result.mode,
            retrievers: result.retrievers.join(", ") || "—",
            withheld: result.withheldCount,
          })
        }}
      </p>
      <p v-if="!result.hits.length" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.research.search.noResults") }}
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="hit in result.hits"
          :key="hit.chunkId"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="text-[12.5px] font-medium text-nf-text">{{ hit.referenceTitle }}</p>
          <p class="mt-0.5 font-mono text-[11px] text-nf-text-faint">
            {{ t("workspace.research.search.hitMeta", { start: hit.start, end: hit.end, score: hit.score.toFixed(3), by: hit.foundBy.join(", ") }) }}
          </p>
          <p class="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-nf-text-dim">{{ hit.text }}</p>
        </li>
      </ul>
    </div>
    <p v-else-if="searched" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.research.search.noResults") }}
    </p>
  </div>
</template>
