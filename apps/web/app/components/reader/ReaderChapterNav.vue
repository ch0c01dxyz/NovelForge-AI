<script setup lang="ts">
/**
 * ReaderChapterNav (NF-WF-013): prev/next chapter navigation for the
 * public reader. Renders live API data only — prev/next are computed
 * server-side over PUBLISHED chapters, so navigation can never leak an
 * unpublished number (Invariant 4).
 *
 * Visual language follows docs/design/writer-workspace: stone-surface
 * cards, tracked section labels, tabular numbers.
 */
import { useLocale } from "../../composables/useLocale";

interface NavLink {
  number: number;
  title: string;
}

defineProps<{
  novelSlug: string;
  prevChapter: NavLink | null;
  nextChapter: NavLink | null;
}>();

const { t } = useLocale();

function chapterUrl(novelSlug: string, number: number): string {
  return `/read/${encodeURIComponent(novelSlug)}/${number}`;
}
</script>

<template>
  <nav
    aria-label="chapter"
    class="mt-12 flex items-start justify-between gap-4 border-t border-nf-border pt-8"
  >
    <NuxtLink
      v-if="prevChapter"
      :to="chapterUrl(novelSlug, prevChapter.number)"
      class="w-[45%] rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3 text-left shadow-nf-sm hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
    >
      <span class="nf-section-label block">{{ t("reader.prevChapter") }}</span>
      <span class="mt-1 block truncate text-sm font-medium text-nf-text">
        <span class="mr-2 tabular-nums text-nf-text-faint">{{ prevChapter.number }}</span
        >{{ prevChapter.title }}
      </span>
    </NuxtLink>
    <span v-else class="w-[45%]" aria-hidden="true" />

    <NuxtLink
      v-if="nextChapter"
      :to="chapterUrl(novelSlug, nextChapter.number)"
      class="w-[45%] rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3 text-right shadow-nf-sm hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
    >
      <span class="nf-section-label block">{{ t("reader.nextChapter") }}</span>
      <span class="mt-1 block truncate text-sm font-medium text-nf-text">
        {{ nextChapter.title }}
        <span class="ml-2 tabular-nums text-nf-text-faint">{{ nextChapter.number }}</span>
      </span>
    </NuxtLink>
    <span v-else class="w-[45%]" aria-hidden="true" />
  </nav>
</template>
