<script setup lang="ts">
/**
 * Public novel page (NF-WF-013): an unauthenticated reader opens a
 * published novel by slug, sees the author byline and the list of
 * PUBLISHED chapters only. Draft/scheduled/future metadata never
 * crosses the boundary (Invariant 4).
 *
 * Visual language follows docs/design/writer-workspace: literary serif
 * title, tabular chapter numbers, stone-surface cards.
 */
import { useLocale } from "../../../composables/useLocale";
import { useApi, ApiError } from "../../../composables/useApi";
import { useReadingProgress } from "../../../composables/useReadingProgress";
import { useSession } from "../../../composables/useSession";
import { useEngagement } from "../../../composables/useEngagement";
import BookmarkButton from "../../../components/social/BookmarkButton.vue";
import FollowButton from "../../../components/social/FollowButton.vue";
// GAP-122: Nuxt registers components/reader/NotificationBell.vue as
// ReaderNotificationBell (pathPrefix), so the bare template name needs an
// explicit runtime import.
import NotificationBell from "../../../components/reader/NotificationBell.vue";

interface PublicNovel {
  id: string;
  title: string;
  slug: string;
  // NF-WF-019A (Q8, GAP-068): additive aggregate count on the frozen
  // 013 shape — optional for backward compatibility with cached data.
  followerCount?: number;
  author: { id: string; displayName: string };
}
interface PublishedChapter {
  number: number;
  title: string;
  publishedAt: string;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();
const { getProgress } = useReadingProgress();
const { signedIn, checkSession } = useSession();
const { getEngagement } = useEngagement();

/** NF-WF-019A: the caller's engagement state for this novel. Anonymous
 * readers keep the defaults (buttons hidden, counts from the Q8 public
 * fields). */
const bookmarked = ref(false);
const following = ref(false);
const followerCount = ref(0);
const engagementFailed = ref(false);

const slug = computed(() => String(route.params.slug ?? ""));
const novel = ref<PublicNovel | null>(null);
const chapters = ref<PublishedChapter[]>([]);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

/** "You stopped at chapter N" marker (NF-WF-014, Invariant 5) — the
 * stored chapter number, resolved lazily against the published list.
 * If the stored chapter is no longer published, no marker is shown
 * (the entry is dropped; no "removed" oracle). */
const stoppedAt = computed(() => {
  const entry = getProgress(slug.value);
  if (!entry) return null;
  return chapters.value.some((c) => c.number === entry.chapterNumber)
    ? entry.chapterNumber
    : null;
});

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

onMounted(async () => {
  try {
    const data = await api<{ novel: PublicNovel; chapters: PublishedChapter[] }>(
      `/public/novels/${encodeURIComponent(slug.value)}`,
    );
    novel.value = data.novel;
    chapters.value = data.chapters;
    followerCount.value = data.novel.followerCount ?? 0;
    // NF-WF-019A: engagement affordances only for signed-in readers
    // (Invariant 1). The session probe failing is non-fatal — the
    // page renders as anonymous.
    try {
      await checkSession();
      if (signedIn.value) {
        const state = await getEngagement(data.novel.id);
        bookmarked.value = state.bookmarked;
        following.value = state.following;
        followerCount.value = state.followerCount;
      }
    } catch {
      /* anonymous render */
    }
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
    <div class="mb-6 flex justify-end">
      <NotificationBell />
    </div>
    <div v-if="loading" role="status" class="text-sm text-nf-text-dim">{{ t("reader.loading") }}</div>
    <div v-else-if="notFound" role="alert">
      <h1 class="font-nf-literary text-[30px] font-semibold">{{ t("reader.notFoundTitle") }}</h1>
      <p class="mt-2 text-nf-text-dim">{{ t("reader.notFoundBody") }}</p>
    </div>
    <div v-else-if="error" role="alert" class="text-sm text-nf-text-dim">{{ error }}</div>
    <article v-else-if="novel">
      <div class="nf-overline !text-nf-text-dim">{{ t("reader.novelOverline") }}</div>
      <h1 class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]">
        {{ novel.title }}
      </h1>
      <p class="mt-2 text-[13px] text-nf-text-dim">
        {{ t("reader.byAuthor") }}
        <NuxtLink
          :to="`/read/authors/${novel.author.id}`"
          class="underline hover:text-nf-text focus-visible:nf-focus"
        >
          {{ novel.author.displayName }}
        </NuxtLink>
      </p>
      <!-- NF-WF-019A: engagement affordances for signed-in readers only.
           Anonymous readers see the follower count as static text
           (Invariant 1). -->
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <template v-if="signedIn && novel">
          <BookmarkButton
            :novel-id="novel.id"
            :bookmarked="bookmarked"
            @failed="engagementFailed = true"
          />
          <FollowButton
            :novel-id="novel.id"
            :following="following"
            :follower-count="followerCount"
            @failed="engagementFailed = true"
          />
        </template>
        <p v-else class="text-[13px] tabular-nums text-nf-text-dim">
          {{ t("social.followerCount", { n: followerCount }) }}
        </p>
      </div>
      <p
        v-if="engagementFailed"
        role="alert"
        class="mt-2 text-[13px] text-nf-text-dim"
      >
        {{ t("social.actionFailed") }}
      </p>
      <section aria-label="chapters" class="mt-10">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("reader.chapters") }}</h2>
        <p v-if="stoppedAt !== null" class="mt-3 text-[13px] text-nf-text-dim">
          {{ t("progress.stoppedAtNovel", { n: stoppedAt }) }}
        </p>
        <p v-if="chapters.length === 0" class="mt-4 text-sm text-nf-text-dim">
          {{ t("reader.noChapters") }}
        </p>
        <ol v-else class="mt-4 space-y-2">
          <li v-for="ch in chapters" :key="ch.number">
            <NuxtLink
              :to="`/read/${encodeURIComponent(novel.slug)}/${ch.number}`"
              class="flex items-baseline justify-between gap-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3 shadow-nf-sm hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
            >
              <span class="min-w-0">
                <span class="mr-3 text-sm tabular-nums text-nf-text-dim">{{ ch.number }}</span>
                <span class="font-medium">{{ ch.title }}</span>
              </span>
              <time
                :datetime="ch.publishedAt"
                class="shrink-0 text-[13px] tabular-nums text-nf-text-dim"
              >
                {{ formatDate(ch.publishedAt) }}
              </time>
            </NuxtLink>
          </li>
        </ol>
      </section>
    </article>
  </main>
</template>
