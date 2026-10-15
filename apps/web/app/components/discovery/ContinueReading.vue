<script setup lang="ts">
/**
 * "Continue reading" section (NF-WF-014, Invariant 5).
 *
 * Renders the device-local reading-progress entries (newest first).
 * Entries are resolved lazily: each slug is fetched against the public
 * novel route; entries that 404 are dropped silently (no "removed"
 * oracle — the generic not-found rule applies).
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import { useReadingProgress } from "../../composables/useReadingProgress";

interface Entry {
  slug: string;
  chapterNumber: number;
  title: string;
  authorName: string;
}

const { t } = useLocale();
const { api } = useApi();
const { listProgress, dropProgress } = useReadingProgress();

const entries = ref<Entry[]>([]);
const loading = ref(true);

onMounted(async () => {
  const resolved: Entry[] = [];
  for (const item of listProgress()) {
    try {
      const data = await api<{
        novel: { title: string; author: { displayName: string } };
      }>(`/public/novels/${encodeURIComponent(item.slug)}`);
      resolved.push({
        slug: item.slug,
        chapterNumber: item.chapterNumber,
        title: data.novel.title,
        authorName: data.novel.author.displayName,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Unpublished/archived/never-existed: drop silently (Invariant 5).
        dropProgress(item.slug);
      }
    }
  }
  entries.value = resolved;
  loading.value = false;
});
</script>

<template>
  <section v-if="!loading && entries.length > 0" :aria-label="t('progress.continueReading')">
    <h2 class="nf-section-label !text-nf-text-dim">{{ t("progress.continueReading") }}</h2>
    <ul class="mt-3 space-y-2">
      <li v-for="e in entries" :key="e.slug">
        <NuxtLink
          :to="`/read/${encodeURIComponent(e.slug)}/${e.chapterNumber}`"
          class="flex items-baseline justify-between gap-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3 shadow-nf-sm transition-colors hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
        >
          <span class="min-w-0">
            <span class="block truncate font-nf-literary text-[17px] font-semibold text-nf-text">
              {{ e.title }}
            </span>
            <span class="mt-0.5 block text-[13px] text-nf-text-dim">
              {{ t("reader.byAuthor") }} {{ e.authorName }}
            </span>
          </span>
          <span class="shrink-0 text-[13px] tabular-nums text-nf-text-dim">
            {{ t("progress.stoppedAt", { n: e.chapterNumber }) }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
