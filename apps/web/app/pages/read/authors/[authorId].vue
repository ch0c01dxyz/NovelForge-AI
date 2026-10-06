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
import { useSession } from "../../../composables/useSession";
import { useEngagement } from "../../../composables/useEngagement";
import FollowAuthorButton from "../../../components/social/FollowAuthorButton.vue";

interface AuthorNovel {
  id: string;
  title: string;
  slug: string;
  publishedChapterCount: number;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();
const { signedIn, checkSession } = useSession();
const { getAuthorFollowState } = useEngagement();

const authorId = computed(() => String(route.params.authorId ?? ""));
const displayName = ref("");
const novels = ref<AuthorNovel[]>([]);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

/** NF-WF-019A: the caller's author-follow state (signed-in only). */
const followingAuthor = ref(false);
const authorFollowerCount = ref(0);
const followFailed = ref(false);

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

onMounted(async () => {
  try {
    const data = await api<{
      author: { id: string; displayName: string; followerCount?: number };
      novels: AuthorNovel[];
    }>(
      `/public/authors/${encodeURIComponent(authorId.value)}`,
    );
    displayName.value = data.author.displayName;
    novels.value = data.novels;
    // NF-WF-019A (GAP-070): the author-follower count rides the additive
    // public field (visible to anonymous readers as static text).
    authorFollowerCount.value = data.author.followerCount ?? 0;
    // NF-WF-019A: author-follow affordance for signed-in readers only
    // (the session probe failing is non-fatal — anonymous render).
    try {
      await checkSession();
      if (signedIn.value) {
        const state = await getAuthorFollowState(authorId.value);
        followingAuthor.value = state.followingAuthor;
        authorFollowerCount.value = state.followerCount;
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
      <!-- NF-WF-019A: author-follow affordance for signed-in readers
           only; anonymous readers see the count as static text. -->
      <div class="mt-4 flex items-center gap-2">
        <FollowAuthorButton
          v-if="signedIn"
          :author-id="authorId"
          :following-author="followingAuthor"
          :follower-count="authorFollowerCount"
          @failed="followFailed = true"
        />
        <p v-else class="text-[13px] tabular-nums text-nf-text-faint">
          {{ t("social.authorFollowerCount", { n: authorFollowerCount }) }}
        </p>
      </div>
      <p
        v-if="followFailed"
        role="alert"
        class="mt-2 text-[13px] text-nf-text-dim"
      >
        {{ t("social.actionFailed") }}
      </p>
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
