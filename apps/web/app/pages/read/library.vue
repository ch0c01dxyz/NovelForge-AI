<script setup lang="ts">
/**
 * Private reading library (NF-WF-019A): the caller's bookmarks, novel
 * follows, and author follows. Requires a session — anonymous readers
 * are redirected to sign-in (Invariant 4: lists are private to the
 * owning user; there is no endpoint for another user's lists).
 *
 * Novel sections reuse the 014 NovelCard component (do not reinvent).
 * Novels with no currently-PUBLISHED chapters render a fallback card
 * (their engagement rows are retained but invisible per Invariant 2;
 * the fallback shows no fabricated dates).
 */
import { useLocale } from "../../composables/useLocale";
import { ApiError } from "../../composables/useApi";
import { useSession } from "../../composables/useSession";
import {
  useEngagement,
  type EnrichedListNovel,
} from "../../composables/useEngagement";
import NovelCard, {
  type NovelCardNovel,
} from "../../components/discovery/NovelCard.vue";

const { t } = useLocale();
const { signedIn, checkSession } = useSession();
const { listBookmarks, listNovelFollows, listAuthorFollows } = useEngagement();

const loading = ref(true);
const loadFailed = ref(false);
const bookmarks = ref<EnrichedListNovel[]>([]);
const novelFollows = ref<EnrichedListNovel[]>([]);
const authorFollows = ref<
  Array<{ authorId: string; author: { id: string; displayName: string } }>
>([]);

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

/** Adapt the enriched list novel to the 014 card shape; null when the
 * novel has no currently-published chapters (the caller renders a
 * fallback instead of fabricating dates). */
function toCard(novel: EnrichedListNovel): NovelCardNovel | null {
  if (!novel.firstPublishedAt || !novel.lastPublishedAt) return null;
  return {
    id: novel.id,
    title: novel.title,
    slug: novel.slug,
    author: novel.author,
    genres: novel.genres,
    publishedChapterCount: novel.publishedChapterCount,
    firstPublishedAt: novel.firstPublishedAt,
    lastPublishedAt: novel.lastPublishedAt,
  };
}

onMounted(async () => {
  try {
    await checkSession();
    if (!signedIn.value) {
      await navigateTo("/sign-in");
      return;
    }
    const [bm, nf, af] = await Promise.all([
      listBookmarks(undefined, 100),
      listNovelFollows(undefined, 100),
      listAuthorFollows(undefined, 100),
    ]);
    bookmarks.value = bm.bookmarks.map((b) => b.novel);
    novelFollows.value = nf.follows.map((f) => f.novel);
    authorFollows.value = af.authorFollows;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await navigateTo("/sign-in");
      return;
    }
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="mx-auto max-w-[900px] px-5 py-12 sm:px-10">
    <div v-if="loading" role="status" class="text-sm text-nf-text-dim">
      {{ t("reader.loading") }}
    </div>
    <div v-else-if="loadFailed" role="alert" class="text-sm text-nf-text-dim">
      {{ t("social.libraryLoadFailed") }}
    </div>
    <div v-else>
      <div class="nf-overline">{{ t("social.libraryOverline") }}</div>
      <h1
        class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]"
      >
        {{ t("social.libraryTitle") }}
      </h1>

      <section aria-label="bookmarks" class="mt-10">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("social.libraryBookmarks") }}</h2>
        <p
          v-if="bookmarks.length === 0"
          class="mt-3 text-sm text-nf-text-dim"
        >
          {{ t("social.libraryEmpty") }}
        </p>
        <div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
          <template v-for="novel in bookmarks" :key="novel.id">
            <NovelCard v-if="toCard(novel)" :novel="toCard(novel)!" />
            <NuxtLink
              v-else
              :to="`/read/${encodeURIComponent(novel.slug)}`"
              class="block rounded-lg border border-nf-border bg-nf-bg-1 p-5 shadow-nf-sm hover:border-nf-border-strong focus-visible:nf-focus"
            >
              <h3
                class="font-nf-literary text-[18px] font-semibold text-nf-text"
              >
                {{ novel.title }}
              </h3>
              <p class="mt-1 text-[13px] text-nf-text-dim">
                {{ t("reader.byAuthor") }} {{ novel.author.displayName }}
              </p>
              <p class="mt-2 text-[13px] text-nf-text-faint">
                {{ t("reader.noChapters") }}
              </p>
            </NuxtLink>
          </template>
        </div>
      </section>

      <section aria-label="novel follows" class="mt-10">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("social.libraryNovelFollows") }}</h2>
        <p
          v-if="novelFollows.length === 0"
          class="mt-3 text-sm text-nf-text-dim"
        >
          {{ t("social.libraryEmpty") }}
        </p>
        <div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
          <template v-for="novel in novelFollows" :key="novel.id">
            <NovelCard v-if="toCard(novel)" :novel="toCard(novel)!" />
            <NuxtLink
              v-else
              :to="`/read/${encodeURIComponent(novel.slug)}`"
              class="block rounded-lg border border-nf-border bg-nf-bg-1 p-5 shadow-nf-sm hover:border-nf-border-strong focus-visible:nf-focus"
            >
              <h3
                class="font-nf-literary text-[18px] font-semibold text-nf-text"
              >
                {{ novel.title }}
              </h3>
              <p class="mt-1 text-[13px] text-nf-text-dim">
                {{ t("reader.byAuthor") }} {{ novel.author.displayName }}
              </p>
              <p class="mt-2 text-[13px] text-nf-text-faint">
                {{ t("reader.noChapters") }}
              </p>
            </NuxtLink>
          </template>
        </div>
      </section>

      <section aria-label="author follows" class="mt-10">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("social.libraryAuthorFollows") }}</h2>
        <p
          v-if="authorFollows.length === 0"
          class="mt-3 text-sm text-nf-text-dim"
        >
          {{ t("social.libraryEmpty") }}
        </p>
        <ul v-else class="mt-4 grid gap-3 sm:grid-cols-2">
          <li v-for="f in authorFollows" :key="f.authorId">
            <NuxtLink
              :to="`/read/authors/${f.authorId}`"
              class="block rounded-lg border border-nf-border bg-nf-bg-1 p-5 shadow-nf-sm transition-colors hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
            >
              <div class="nf-overline">{{ t("reader.authorOverline") }}</div>
              <h3
                class="mt-2 font-nf-literary text-[18px] font-semibold text-nf-text"
              >
                {{ f.author.displayName }}
              </h3>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <p
        v-if="
          bookmarks.length === 0 &&
          novelFollows.length === 0 &&
          authorFollows.length === 0
        "
        class="mt-10 text-sm text-nf-text-dim"
      >
        {{ t("social.libraryEmptyHint") }}
      </p>
    </div>
  </main>
</template>
