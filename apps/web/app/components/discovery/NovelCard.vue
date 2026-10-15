<script setup lang="ts">
/**
 * Novel card for the discovery page (NF-WF-014, Invariant 6/8).
 *
 * Published-novel data only: title, author byline, genre chips,
 * published chapter count, last-published date. No draft data, no
 * author tools, no AI content. Follows the §15 foundational design
 * (stone surfaces, literary serif titles, tabular meta).
 */
import { useLocale } from "../../composables/useLocale";

export interface NovelCardNovel {
  id: string;
  title: string;
  slug: string;
  author: { id: string; displayName: string };
  genres: string[];
  publishedChapterCount: number;
  firstPublishedAt: string;
  lastPublishedAt: string;
}

const props = defineProps<{ novel: NovelCardNovel }>();
const { t } = useLocale();

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
</script>

<template>
  <NuxtLink
    :to="`/read/${encodeURIComponent(props.novel.slug)}`"
    class="group block rounded-lg border border-nf-border bg-nf-bg-1 p-5 shadow-nf-sm transition-colors hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
    :aria-label="props.novel.title"
  >
    <div class="nf-overline">{{ t("discover.novelOverline") }}</div>
    <h3 class="mt-2 font-nf-literary text-[22px] font-semibold leading-[1.25] text-nf-text">
      {{ props.novel.title }}
    </h3>
    <p class="mt-1 text-[13px] text-nf-text-dim">
      {{ t("reader.byAuthor") }} {{ props.novel.author.displayName }}
    </p>
    <div v-if="props.novel.genres.length > 0" class="mt-3 flex flex-wrap gap-1.5" aria-label="Genres">
      <span
        v-for="g in props.novel.genres"
        :key="g"
        class="rounded-full border border-nf-border px-2.5 py-0.5 text-[12px] text-nf-text-dim"
      >
        {{ t(`genre.${g}`) }}
      </span>
    </div>
    <p class="mt-3 text-[13px] tabular-nums text-nf-text-dim">
      {{ t("reader.chapterCount", { n: props.novel.publishedChapterCount }) }}
      <span class="mx-[7px] text-nf-border-strong" aria-hidden="true">·</span>
      {{ formatDate(props.novel.lastPublishedAt) }}
    </p>
  </NuxtLink>
</template>
