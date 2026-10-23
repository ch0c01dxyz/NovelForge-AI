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
import NovelCoverImage from "./NovelCoverImage.vue";

export interface NovelCardNovel {
  id: string;
  title: string;
  slug: string;
  author: { id: string; displayName: string };
  genres: string[];
  /** Reader-facing content rating; null = not set, renders nothing. */
  audience?: string | null;
  coverUrl?: string | null;
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
    class="group grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4 shadow-nf-sm transition-colors hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus sm:grid-cols-[100px_minmax(0,1fr)] sm:p-5"
    :aria-label="props.novel.title"
  >
    <NovelCoverImage :cover-url="props.novel.coverUrl" :title="props.novel.title" />
    <div class="min-w-0 break-words">
      <div class="nf-overline">{{ t("discover.novelOverline") }}</div>
      <h3 class="mt-2 font-nf-literary text-[22px] font-semibold leading-[1.25] text-nf-text">
        {{ props.novel.title }}
      </h3>
      <p class="mt-1 text-[13px] text-nf-text-dim">
        {{ t("reader.byAuthor") }} {{ props.novel.author.displayName }}
      </p>
    </div>
    <div v-if="props.novel.genres.length > 0" class="col-span-2 flex flex-wrap gap-2 px-0.5" aria-label="Genres">
      <span
        v-for="g in props.novel.genres"
        :key="g"
        class="nf-genre-tag rounded-md border border-nf-border bg-nf-bg-3 px-2.5 py-1 text-[12px] leading-4 text-nf-text-dim"
      >
        <span>{{ t(`genre.${g}`) }}</span>
      </span>
    </div>
    <div class="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-nf-border pt-3">
      <p class="text-[12px] tabular-nums text-nf-text-dim">
        {{ t("reader.chapterCount", { n: props.novel.publishedChapterCount }) }}
        <span class="mx-1 text-nf-border-strong" aria-hidden="true">·</span>
        {{ formatDate(props.novel.lastPublishedAt) }}
      </p>
      <span
        v-if="props.novel.audience"
        class="rounded-md border border-nf-warn/30 bg-nf-warn/10 px-2 py-0.5 text-[11px] font-medium text-nf-warn"
        ><span>{{ t(`audience.${props.novel.audience}`) }}</span></span
      >
    </div>
  </NuxtLink>
</template>

<style scoped>
.nf-genre-tag { transform: skewX(-10deg); }
.nf-genre-tag > span { display: block; transform: skewX(10deg); }
</style>
