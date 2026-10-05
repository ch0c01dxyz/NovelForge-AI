<script setup lang="ts">
/**
 * Public author page (NF-WF-013): displayName + published novels only.
 * No email, no workspace names, no member lists, no draft counts
 * (Invariant 4).
 *
 * Visual language follows docs/design/writer-workspace: literary serif
 * name, stone-surface novel cards, tabular counts.
 */
import { useLocale } from "../../../composables/useLocale";
import { useApi, ApiError } from "../../../composables/useApi";

interface AuthorNovel {
  id: string;
  title: string;
  slug: string;
  publishedChapterCount: number;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();

const authorId = computed(() => String(route.params.authorId ?? ""));
const displayName = ref("");
const novels = ref<AuthorNovel[]>([]);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

onMounted(async () => {
  try {
    const data = await api<{ author: { id: string; displayName: string }; novels: AuthorNovel[] }>(
      `/public/authors/${encodeURIComponent(authorId.value)}`,
    );
    displayName.value = data.author.displayName;
    novels.value = data.novels;
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
    <div v-else>
      <div class="nf-overline">{{ t("reader.authorOverline") }}</div>
      <h1 class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]">
        {{ displayName }}
      </h1>
      <section aria-label="novels" class="mt-10">
        <h2 class="nf-section-label">{{ t("reader.publishedNovels") }}</h2>
        <ul class="mt-4 space-y-2">
          <li v-for="n in novels" :key="n.id">
            <NuxtLink
              :to="`/read/${encodeURIComponent(n.slug)}`"
              class="flex items-baseline justify-between gap-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3 shadow-nf-sm hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
            >
              <span class="font-medium">{{ n.title }}</span>
              <span class="shrink-0 text-[13px] tabular-nums text-nf-text-faint">
                {{ t("reader.chapterCount", { n: n.publishedChapterCount }) }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
