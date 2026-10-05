<script setup lang="ts">
/**
 * Public chapter reading page (NF-WF-013): renders the PINNED published
 * version's content — no summaries, no AI-generated content, no search
 * box (Invariant 8).
 *
 * Visual language follows docs/design/writer-workspace: chapter overline
 * (accent-hi, the design's single allowed gradient), literary serif
 * title 30px, tabular meta line, manuscript prose 17.5px/1.85 with a
 * drop cap on the opening paragraph.
 */
import { useLocale } from "../../../composables/useLocale";
import { useApi, ApiError } from "../../../composables/useApi";

interface ChapterPage {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  publishedVersionNumber: number;
  publishedAt: string;
}
interface NavLink {
  number: number;
  title: string;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();

const slug = computed(() => String(route.params.slug ?? ""));
const number = computed(() => Number(route.params.number));
const chapter = ref<ChapterPage | null>(null);
const prevChapter = ref<NavLink | null>(null);
const nextChapter = ref<NavLink | null>(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

/** Manuscript paragraphs: split on blank lines; the first gets the drop cap. */
const paragraphs = computed(() =>
  (chapter.value?.content ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
);

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

onMounted(async () => {
  try {
    const data = await api<{
      chapter: ChapterPage;
      prevChapter: NavLink | null;
      nextChapter: NavLink | null;
    }>(`/public/novels/${encodeURIComponent(slug.value)}/chapters/${number.value}`);
    chapter.value = data.chapter;
    prevChapter.value = data.prevChapter;
    nextChapter.value = data.nextChapter;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound.value = true;
    } else {
      error.value = t("reader.loadFailed");
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="mx-auto max-w-[700px] px-5 py-12 sm:px-10">
    <div v-if="loading" role="status" class="text-sm text-nf-text-dim">{{ t("reader.loading") }}</div>
    <div v-else-if="notFound" role="alert">
      <h1 class="font-nf-literary text-[30px] font-semibold">{{ t("reader.notFoundTitle") }}</h1>
      <p class="mt-2 text-nf-text-dim">{{ t("reader.notFoundBody") }}</p>
    </div>
    <div v-else-if="error" role="alert" class="text-sm text-nf-text-dim">{{ error }}</div>
    <article v-else-if="chapter">
      <NuxtLink
        :to="`/read/${encodeURIComponent(slug)}`"
        class="text-[13px] text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
      >
        {{ t("reader.backToNovel") }}
      </NuxtLink>
      <div class="nf-overline mt-6">{{ t("reader.chapterOverline", { n: chapter.number }) }}</div>
      <h1 class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]">
        {{ chapter.title }}
      </h1>
      <p class="mt-2 text-[13px] tabular-nums text-nf-text-faint">
        {{ formatDate(chapter.publishedAt) }}
        <span class="mx-[7px] text-nf-border-strong" aria-hidden="true">·</span>
        {{ t("reader.wordCount", { n: chapter.wordCount }) }}
        <span class="mx-[7px] text-nf-border-strong" aria-hidden="true">·</span>
        {{ t("reader.version", { n: chapter.publishedVersionNumber }) }}
      </p>
      <div class="nf-reader-prose mt-10">
        <p v-for="(p, i) in paragraphs" :key="i" :class="{ opening: i === 0 }">{{ p }}</p>
      </div>
      <ReaderChapterNav
        :novel-slug="slug"
        :prev-chapter="prevChapter"
        :next-chapter="nextChapter"
      />
    </article>
  </main>
</template>
