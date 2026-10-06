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
import { onUnmounted } from "vue";
import { useLocale } from "../../../composables/useLocale";
import { useApi, ApiError } from "../../../composables/useApi";
import { useReadingProgress } from "../../../composables/useReadingProgress";
import { useSyncedReadingProgress } from "../../../composables/useSyncedReadingProgress";
import { useSession } from "../../../composables/useSession";
import { useEngagement } from "../../../composables/useEngagement";
import LikeButton from "../../../components/social/LikeButton.vue";
import sanitizeHtml from "sanitize-html";
import { looksLikeHtml } from "../../../utils/htmlText";

interface ChapterPage {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  publishedVersionNumber: number;
  publishedAt: string;
  // NF-WF-019A (Q8, GAP-068): additive aggregate counts on the frozen
  // 013 shape — optional for backward compatibility with cached data.
  likeCount?: number;
  commentCount?: number;
}
interface NavLink {
  number: number;
  title: string;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();
const { markRead } = useReadingProgress();
const { syncState, loadSyncedProgress, saveProgress } = useSyncedReadingProgress();
const { signedIn, checkSession } = useSession();
const { getEngagement } = useEngagement();

const slug = computed(() => String(route.params.slug ?? ""));
const number = computed(() => Number(route.params.number));
const chapter = ref<ChapterPage | null>(null);
const prevChapter = ref<NavLink | null>(null);
const nextChapter = ref<NavLink | null>(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);
/** Resolved novel id for progress sync (authenticated users only). */
const novelId = ref<string | null>(null);

/** NF-WF-019A: the caller's like state for this chapter. Anonymous
 * readers see the count as static text (buttons render only with a
 * session; the server enforces auth). */
const liked = ref(false);
const likeCount = ref(0);
const likeFailed = ref(false);

/** Manuscript paragraphs: split on blank lines; the first gets the drop cap. */
const paragraphs = computed(() =>
  (chapter.value?.content ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
);

/**
 * NF-WF-015 (Invariant 2, F2): dual-format rendering of the PINNED
 * chapter version's content. Content containing block tags renders as
 * sanitized HTML; plain-text rows never re-saved in HTML keep the legacy
 * blank-line paragraph split with the drop cap — un-migrated chapters
 * render exactly as before.
 *
 * The pinned content was sanitized on write, but rows written before
 * 015 were not — so the reader sanitizes too, with the Invariant 2
 * allowlist mirrored EXACTLY from the server (`sanitizeChapterHtml` in
 * apps/api/src/services/manuscript.ts): the same ten tags, no
 * attributes. The drop cap is CSS-only
 * (`.nf-reader-prose > p:first-of-type::first-letter`) so the allowlist
 * stays attribute-free.
 */
const isHtml = computed(() => looksLikeHtml(chapter.value?.content ?? ""));
const htmlContent = computed(() => {
  const content = chapter.value?.content ?? "";
  if (!isHtml.value) return "";
  return sanitizeHtml(content, {
    allowedTags: ["p", "h2", "blockquote", "strong", "em", "ul", "ol", "li", "hr", "br"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
});

useHead({
  meta: [{ name: "robots", content: "noindex" }],
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function currentScrollRatio(): number | undefined {
  if (typeof window === "undefined" || typeof document === "undefined")
    return undefined;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return undefined;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function onScroll(): void {
  if (!novelId.value) return;
  const ratio = currentScrollRatio();
  saveProgress(novelId.value, number.value, ratio);
}

/**
 * NF-WF-019D: resolve the novel id (authenticated users only) and
 * merge device-local 014 progress with the server row. The merge
 * winner seeds the scroll position; the 014 markRead above is never
 * bypassed (anonymous readers keep zero-sync-network behavior).
 */
async function syncProgress(): Promise<void> {
  try {
    const novel = await api<{ novel: { id: string } }>(
      `/public/novels/${encodeURIComponent(slug.value)}`,
    );
    novelId.value = novel.novel.id;
  } catch {
    return;
  }
  const merged = await loadSyncedProgress(slug.value, novelId.value);
  if (merged && merged.scrollRatio !== null && typeof window !== "undefined") {
    await nextTick();
    const max =
      document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0) window.scrollTo(0, merged.scrollRatio * max);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", onScroll, { passive: true });
  }
}

onMounted(async () => {
  // Kick off the 019D sync in parallel with the chapter load; it only
  // proceeds past the session probe for authenticated users.
  const syncPromise = syncProgress();
  try {
    const data = await api<{
      chapter: ChapterPage;
      prevChapter: NavLink | null;
      nextChapter: NavLink | null;
    }>(`/public/novels/${encodeURIComponent(slug.value)}/chapters/${number.value}`);
    chapter.value = data.chapter;
    prevChapter.value = data.prevChapter;
    nextChapter.value = data.nextChapter;
    // NF-WF-019A: counts ride the Q8 public fields (visible to
    // anonymous readers as static text).
    likeCount.value = data.chapter.likeCount ?? 0;
    // Reading progress (NF-WF-014, Invariant 5): write only on a
    // successful (200) load of the PUBLISHED chapter — never on 404.
    markRead(slug.value, number.value);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound.value = true;
    } else {
      error.value = t("reader.loadFailed");
    }
  } finally {
    loading.value = false;
  }
  await syncPromise;
  // NF-WF-019A: the caller's like state (signed-in readers only; the
  // engagement endpoint 404s for invisible chapters, matching the
  // page's own 404 — no oracle).
  if (!notFound.value && novelId.value) {
    try {
      await checkSession();
      if (signedIn.value) {
        const state = await getEngagement(novelId.value, number.value);
        liked.value = state.liked;
        likeCount.value = state.likeCount;
      }
    } catch {
      /* anonymous render */
    }
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("scroll", onScroll);
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
        <span
          v-if="syncState === 'synced'"
          class="mx-[7px] text-nf-border-strong"
          aria-hidden="true"
          >·</span
        >
        <span
          v-if="syncState === 'synced'"
          :title="t('progressSync.syncedHint')"
          class="text-nf-text-faint"
        >
          {{ t("progressSync.syncedLabel") }}
        </span>
      </p>
      <!-- NF-WF-019A: like affordance for signed-in readers only;
           anonymous readers see the count as static text. -->
      <div class="mt-4 flex items-center gap-2">
        <LikeButton
          v-if="signedIn && novelId"
          :novel-id="novelId"
          :chapter-number="chapter.number"
          :liked="liked"
          :like-count="likeCount"
          @failed="likeFailed = true"
        />
        <p v-else class="text-[13px] tabular-nums text-nf-text-faint">
          {{ t("social.likeCount", { n: likeCount }) }}
        </p>
      </div>
      <p v-if="likeFailed" role="alert" class="mt-2 text-[13px] text-nf-text-dim">
        {{ t("social.actionFailed") }}
      </p>
      <div v-if="isHtml" class="nf-reader-prose mt-10" v-html="htmlContent" />
      <div v-else class="nf-reader-prose mt-10">
        <p v-for="(p, i) in paragraphs" :key="i" :class="{ opening: i === 0 }">{{ p }}</p>
      </div>
      <ReaderChapterNav
        :novel-slug="slug"
        :prev-chapter="prevChapter"
        :next-chapter="nextChapter"
      />
      <!-- NF-WF-019B: chapter comment thread. The list is
           anonymous-readable; the composer and the
           reply/edit/delete/report affordances render only with a
           session (progressive enhancement — the server enforces). -->
      <CommentThread :novel-slug="slug" :chapter-number="number" />
    </article>
  </main>
</template>
