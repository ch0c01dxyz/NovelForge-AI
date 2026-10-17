<script setup lang="ts">
/**
 * Public discovery page (NF-WF-014): browse published novels, genre
 * facets, and published-only search — the discovery half of M4.
 *
 * Search is a section of this page (implementer's pinned choice,
 * contract Invariant 6). All data is public/anonymous: ACTIVE novels
 * with ≥1 PUBLISHED publication; search corpus is PUBLISHED pins only.
 * No drafts, no author tools, no AI content (same spoiler boundary as
 * 013). Visual language follows the §15 foundational design.
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import NovelCard, { type NovelCardNovel } from "../../components/discovery/NovelCard.vue";
import GenreChips, { type GenreFacet } from "../../components/discovery/GenreChips.vue";
import SearchBox from "../../components/discovery/SearchBox.vue";
import ContinueReading from "../../components/discovery/ContinueReading.vue";

interface SearchHit {
  type: "novel" | "chapter";
  novel: { id: string; title: string; slug: string; author: { id: string; displayName: string } };
  chapter: { number: number; title: string } | null;
  snippet: string | null;
  rank: number;
}

type SortKey = "recent" | "title" | "chapters";

const { api } = useApi();
const { t } = useLocale();

const novels = ref<NovelCardNovel[]>([]);
const facets = ref<GenreFacet[]>([]);
const activeGenre = ref<string | null>(null);
const sort = ref<SortKey>("recent");
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const loadFailed = ref(false);

const searchQuery = ref("");
const searchResults = ref<SearchHit[]>([]);
const searchLoading = ref(false);
const searchDone = ref(false);

useHead({
  title: "Browse",
  meta: [{ name: "robots", content: "noindex" }],
});

async function fetchNovels(reset: boolean): Promise<void> {
  if (reset) {
    loading.value = true;
    loadFailed.value = false;
  } else {
    loadingMore.value = true;
  }
  try {
    const params = new URLSearchParams();
    if (activeGenre.value) params.set("genre", activeGenre.value);
    params.set("sort", sort.value);
    params.set("limit", "20");
    if (!reset && cursor.value) params.set("cursor", cursor.value);
    const data = await api<{
      novels: NovelCardNovel[];
      page: { cursor: string | null; hasMore: boolean };
    }>(`/public/novels?${params.toString()}`);
    novels.value = reset ? data.novels : [...novels.value, ...data.novels];
    cursor.value = data.page.cursor;
    hasMore.value = data.page.hasMore;
  } catch {
    if (reset) loadFailed.value = true;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function fetchFacets(): Promise<void> {
  try {
    const data = await api<{ genres: GenreFacet[] }>("/public/genres");
    facets.value = data.genres;
  } catch {
    facets.value = [];
  }
}

function onGenreSelect(key: string | null): void {
  activeGenre.value = key;
  cursor.value = null;
  void fetchNovels(true);
}

function onSortChange(e: Event): void {
  sort.value = (e.target as HTMLSelectElement).value as SortKey;
  cursor.value = null;
  void fetchNovels(true);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  const trimmed = q.trim();
  searchDone.value = false;
  if (trimmed.length < 2) {
    searchResults.value = [];
    return;
  }
  searchLoading.value = true;
  searchTimer = setTimeout(async () => {
    try {
      const data = await api<{ results: SearchHit[] }>(
        `/public/search?q=${encodeURIComponent(trimmed)}&limit=10`,
      );
      searchResults.value = data.results;
    } catch {
      searchResults.value = [];
    } finally {
      searchLoading.value = false;
      searchDone.value = true;
    }
  }, 150);
});

onMounted(() => {
  void fetchNovels(true);
  void fetchFacets();
});
</script>

<template>
  <main class="mx-auto max-w-[700px] px-5 py-12 sm:px-10">
    <a href="#browse-main" class="sr-only focus:not-sr-only focus-visible:nf-focus">
      {{ t("discover.skipToContent") }}
    </a>
    <div id="browse-main">
      <div class="nf-overline">{{ t("discover.pageOverline") }}</div>
      <h1 class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]">
        {{ t("discover.pageTitle") }}
      </h1>

      <ContinueReading class="mt-8" />

      <section class="mt-10" :aria-label="t('discover.searchSection')">
        <SearchBox v-model="searchQuery" />
        <div
          v-if="searchQuery.trim().length >= 2"
          class="mt-4"
          role="status"
          aria-live="polite"
        >
          <p v-if="searchLoading" class="text-sm text-nf-text-dim">{{ t("discover.loading") }}</p>
          <template v-else-if="searchDone">
            <p class="text-[13px] tabular-nums text-nf-text-dim">
              {{ t("discover.resultsCount", { n: searchResults.length }) }}
            </p>
            <ul v-if="searchResults.length > 0" class="mt-3 space-y-2">
              <li v-for="(hit, i) in searchResults" :key="`${hit.type}-${hit.novel.id}-${hit.chapter?.number ?? 0}-${i}`">
                <NuxtLink
                  :to="hit.type === 'novel'
                    ? `/read/${encodeURIComponent(hit.novel.slug)}`
                    : `/read/${encodeURIComponent(hit.novel.slug)}/${hit.chapter!.number}`"
                  class="block rounded-lg border border-nf-border-focus bg-nf-bg-1 p-4 shadow-nf-sm transition-colors hover:bg-nf-bg-2 focus-visible:nf-focus"
                >
                  <p class="text-[12px] uppercase tracking-[0.14em] text-nf-accent-hi">
                    {{ hit.type === "novel" ? t("discover.novelResult") : t("discover.chapterResult") }}
                  </p>
                  <p class="mt-1 font-nf-literary text-[18px] font-semibold text-nf-text">
                    {{ hit.type === "novel" ? hit.novel.title : hit.chapter!.title }}
                  </p>
                  <p class="mt-0.5 text-[13px] text-nf-text-dim">
                    {{ hit.novel.title }}
                    <span v-if="hit.type === 'chapter'" class="tabular-nums">
                      · {{ t("reader.chapterOverline", { n: hit.chapter!.number }) }}
                    </span>
                  </p>
                  <p
                    v-if="hit.snippet"
                    class="mt-2 text-[14px] leading-[1.7] text-nf-text-dim"
                    v-html="hit.snippet"
                  />
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="mt-2 text-sm text-nf-text-dim">{{ t("discover.noResults") }}</p>
          </template>
        </div>
      </section>

      <section class="mt-12" :aria-label="t('discover.browseSection')">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("discover.browseSection") }}</h2>
        <div class="mt-3">
          <GenreChips :facets="facets" :active="activeGenre" @select="onGenreSelect" />
        </div>
        <div class="mt-4 flex items-center gap-3">
          <label for="discover-sort" class="text-[13px] text-nf-text-dim">{{ t("discover.sortLabel") }}</label>
          <select
            id="discover-sort"
            :value="sort"
            class="min-h-[44px] rounded-lg border border-nf-border-focus bg-nf-bg-1 px-3 text-[14px] text-nf-text focus-visible:nf-focus"
            @change="onSortChange"
          >
            <option value="recent">{{ t("discover.sortRecent") }}</option>
            <option value="title">{{ t("discover.sortTitle") }}</option>
            <option value="chapters">{{ t("discover.sortChapters") }}</option>
          </select>
        </div>

        <div v-if="loading" role="status" class="mt-6 text-sm text-nf-text-dim">{{ t("discover.loading") }}</div>
        <div v-else-if="loadFailed" role="alert" class="mt-6 text-sm text-nf-text-dim">{{ t("discover.loadFailed") }}</div>
        <div v-else-if="novels.length === 0" class="mt-6">
          <p class="text-sm text-nf-text-dim">{{ t("discover.emptyShelf") }}</p>
        </div>
        <ul v-else class="mt-6 grid gap-4 sm:grid-cols-2" aria-live="polite">
          <li v-for="novel in novels" :key="novel.id">
            <NovelCard :novel="novel" />
          </li>
        </ul>
        <div v-if="hasMore && !loading" class="mt-6 text-center">
          <button
            type="button"
            :disabled="loadingMore"
            class="min-h-[44px] rounded-lg border border-nf-border-focus px-6 py-2.5 text-[14px] text-nf-text transition-colors hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            @click="fetchNovels(false)"
          >
            {{ loadingMore ? t("discover.loading") : t("discover.loadMore") }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
