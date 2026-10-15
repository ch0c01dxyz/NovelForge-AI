<script setup lang="ts">
/**
 * Reader notifications inbox (NF-WF-019C): the authenticated reader's
 * private in-app inbox, preference toggles, and the "what's private"
 * panel. Anonymous readers are redirected to sign-in (the inbox is
 * server-gated regardless).
 *
 * Preferences (Klein Q5): the three pinned types default ON; absent row
 * = ON. The master switch is a UI-only affordance — OFF writes
 * enabled:false for all three pinned types, ON writes enabled:true.
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const { api } = useApi();
const { t } = useLocale();

type PinnedType = "NEW_CHAPTER" | "COMMENT_REPLY" | "MODERATION_NOTICE";
const PINNED_TYPES: PinnedType[] = ["NEW_CHAPTER", "COMMENT_REPLY", "MODERATION_NOTICE"];

interface NotificationItem {
  id: string;
  type: PinnedType;
  novelId: string | null;
  chapterNumber: number | null;
  actorDisplayName: string | null;
  createdAt: string;
  readAt: string | null;
}

const items = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const preferences = ref<Record<PinnedType, boolean>>({
  NEW_CHAPTER: true,
  COMMENT_REPLY: true,
  MODERATION_NOTICE: true,
});
const prefsError = ref<string | null>(null);
const savingPrefs = ref(false);

const masterOn = computed(() => PINNED_TYPES.every((ty) => preferences.value[ty]));

function describeItem(n: NotificationItem): string {
  if (n.type === "NEW_CHAPTER") {
    return n.actorDisplayName
      ? t("notifications.newChapter", { author: n.actorDisplayName, n: n.chapterNumber ?? 0 })
      : t("notifications.newChapterNoAuthor", { n: n.chapterNumber ?? 0 });
  }
  if (n.type === "COMMENT_REPLY") {
    return n.actorDisplayName
      ? t("notifications.commentReply", { author: n.actorDisplayName })
      : t("notifications.commentReplyNoAuthor");
  }
  return t("notifications.moderationNotice");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function loadInbox(cursor?: string) {
  const data = await api<{
    notifications: NotificationItem[];
    unreadCount: number;
    page: { nextCursor: string | null };
  }>(`/reader/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
  if (cursor) {
    items.value = [...items.value, ...data.notifications];
  } else {
    items.value = data.notifications;
  }
  unreadCount.value = data.unreadCount;
  nextCursor.value = data.page.nextCursor;
}

async function loadPreferences() {
  const data = await api<{ preferences: { type: PinnedType; enabled: boolean }[] }>(
    "/reader/notifications/preferences",
  );
  for (const p of data.preferences) {
    if (PINNED_TYPES.includes(p.type)) preferences.value[p.type] = p.enabled;
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadInbox(), loadPreferences()]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await navigateTo("/sign-in");
      return;
    }
    error.value = t("notifications.loadFailed");
  } finally {
    loading.value = false;
  }
});

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    await loadInbox(nextCursor.value);
  } catch {
    error.value = t("notifications.loadFailed");
  } finally {
    loadingMore.value = false;
  }
}

async function markRead(id: string) {
  try {
    await api(`/reader/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    const item = items.value.find((n) => n.id === id);
    if (item && !item.readAt) {
      item.readAt = new Date().toISOString();
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  } catch {
    error.value = t("notifications.loadFailed");
  }
}

async function markAllRead() {
  try {
    await api("/reader/notifications/read-all", { method: "POST" });
    for (const n of items.value) n.readAt = n.readAt ?? new Date().toISOString();
    unreadCount.value = 0;
  } catch {
    error.value = t("notifications.loadFailed");
  }
}

async function savePreferences(next: Record<PinnedType, boolean>) {
  savingPrefs.value = true;
  prefsError.value = null;
  const previous = { ...preferences.value };
  preferences.value = { ...next };
  try {
    await api("/reader/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({
        preferences: PINNED_TYPES.map((type) => ({ type, enabled: next[type] })),
      }),
    });
  } catch {
    preferences.value = previous;
    prefsError.value = t("notifications.saveFailed");
  } finally {
    savingPrefs.value = false;
  }
}

async function toggleType(type: PinnedType) {
  await savePreferences({ ...preferences.value, [type]: !preferences.value[type] });
}

async function toggleMaster() {
  const next = !masterOn.value;
  await savePreferences({
    NEW_CHAPTER: next,
    COMMENT_REPLY: next,
    MODERATION_NOTICE: next,
  });
}

useHead({ meta: [{ name: "robots", content: "noindex" }] });
</script>

<template>
  <main class="mx-auto max-w-[700px] px-5 py-12 sm:px-10">
    <div v-if="loading" role="status" class="text-sm text-nf-text-dim">
      {{ t("notifications.loading") }}
    </div>
    <div v-else-if="error" role="alert" class="text-sm text-nf-text-dim">{{ error }}</div>
    <div v-else>
      <div class="nf-overline">{{ t("notifications.inboxOverline") }}</div>
      <div class="mt-3 flex items-center justify-between gap-4">
        <h1 class="font-nf-literary text-[30px] font-semibold leading-[1.2]">
          {{ t("notifications.inboxTitle") }}
        </h1>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="rounded-lg border border-nf-border bg-nf-bg-1 px-3 py-2 text-[13px] text-nf-text-dim shadow-nf-sm hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus"
          @click="markAllRead"
        >
          {{ t("notifications.markAllRead") }}
        </button>
      </div>

      <section aria-label="inbox" class="mt-8">
        <p v-if="items.length === 0" class="text-sm text-nf-text-dim">
          {{ t("notifications.empty") }}
        </p>
        <ol v-else class="space-y-2">
          <li
            v-for="n in items"
            :key="n.id"
            class="flex items-start justify-between gap-4 rounded-lg border px-4 py-3 shadow-nf-sm"
            :class="
              n.readAt
                ? 'border-nf-border bg-nf-bg-1'
                : 'border-nf-border-strong bg-nf-bg-2'
            "
          >
            <div class="min-w-0">
              <p class="text-[14px] leading-snug" :class="n.readAt ? 'text-nf-text-dim' : 'text-nf-text font-medium'">
                {{ describeItem(n) }}
              </p>
              <p class="mt-1 text-[12px] tabular-nums text-nf-text-faint">
                {{ formatDate(n.createdAt) }}
              </p>
            </div>
            <button
              v-if="!n.readAt"
              type="button"
              class="shrink-0 rounded-md px-2 py-1 text-[12px] text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
              @click="markRead(n.id)"
            >
              {{ t("notifications.markRead") }}
            </button>
          </li>
        </ol>
        <button
          v-if="nextCursor"
          type="button"
          :disabled="loadingMore"
          class="mt-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-2 text-[13px] text-nf-text-dim shadow-nf-sm hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          @click="loadMore"
        >
          {{ t("notifications.loadMore") }}
        </button>
      </section>

      <section aria-label="preferences" class="mt-12 border-t border-nf-border pt-8">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("notifications.preferencesTitle") }}</h2>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("notifications.preferencesHint") }}</p>
        <div v-if="prefsError" role="alert" class="mt-3 text-[13px] text-nf-text-dim">
          {{ prefsError }}
        </div>
        <ul class="mt-4 space-y-3">
          <li
            class="flex items-center justify-between gap-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3"
          >
            <div>
              <p class="text-[14px] font-medium">{{ t("notifications.masterSwitch") }}</p>
              <p class="mt-0.5 text-[12px] text-nf-text-dim">
                {{ t("notifications.masterSwitchHint") }}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="masterOn"
              :aria-label="t('notifications.masterSwitch')"
              :disabled="savingPrefs"
              class="relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:nf-focus disabled:opacity-50"
              :class="masterOn ? 'bg-nf-accent' : 'bg-nf-border-strong'"
              @click="toggleMaster"
            >
              <span
                class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                :class="masterOn ? 'translate-x-[22px]' : 'translate-x-0.5'"
                aria-hidden="true"
              />
            </button>
          </li>
          <li
            v-for="ty in PINNED_TYPES"
            :key="ty"
            class="flex items-center justify-between gap-4 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-3"
          >
            <div>
              <p class="text-[14px] font-medium">
                {{
                  ty === "NEW_CHAPTER"
                    ? t("notifications.typeNewChapter")
                    : ty === "COMMENT_REPLY"
                      ? t("notifications.typeCommentReply")
                      : t("notifications.typeModerationNotice")
                }}
              </p>
              <p class="mt-0.5 text-[12px] text-nf-text-dim">
                {{
                  ty === "NEW_CHAPTER"
                    ? t("notifications.typeNewChapterHint")
                    : ty === "COMMENT_REPLY"
                      ? t("notifications.typeCommentReplyHint")
                      : t("notifications.typeModerationNoticeHint")
                }}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="preferences[ty]"
              :aria-label="t(`notifications.type${ty === 'NEW_CHAPTER' ? 'NewChapter' : ty === 'COMMENT_REPLY' ? 'CommentReply' : 'ModerationNotice'}`)"
              :disabled="savingPrefs"
              class="relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:nf-focus disabled:opacity-50"
              :class="preferences[ty] ? 'bg-nf-accent' : 'bg-nf-border-strong'"
              @click="toggleType(ty)"
            >
              <span
                class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                :class="preferences[ty] ? 'translate-x-[22px]' : 'translate-x-0.5'"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>

      <section aria-label="privacy" class="mt-12 border-t border-nf-border pt-8">
        <h2 class="nf-section-label !text-nf-text-dim">{{ t("notifications.privacyTitle") }}</h2>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("notifications.privacyIntro") }}</p>
        <ul class="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-nf-text-dim">
          <li>{{ t("notifications.privacyBookmarks") }}</li>
          <li>{{ t("notifications.privacyCounts") }}</li>
          <li>{{ t("notifications.privacyComments") }}</li>
          <li>{{ t("notifications.privacyStaff") }}</li>
          <li>{{ t("notifications.privacyPreferences") }}</li>
        </ul>
        <p class="mt-4 text-[13px] text-nf-text-dim">{{ t("notifications.inAppOnly") }}</p>
      </section>
    </div>
  </main>
</template>
