<script setup lang="ts">
/**
 * Chapter comment thread (NF-WF-019B).
 *
 * Renders on the public chapter page (`/read/[slug]/[number]`). The
 * comment LIST is anonymous-readable; the composer and the
 * reply/edit/delete/report affordances render only with a session
 * (progressive enhancement — the server enforces auth, rate limits,
 * and the 15-minute edit window). Threading is depth <= 1 (top-level
 * + one reply level); bodies render as escaped text with line breaks
 * preserved (Vue text interpolation — markup in a body is data, never
 * markup).
 *
 * Visual language follows docs/design/writer-workspace (the §15
 * foundational design): the same tokens as the reader page
 * (nf-overline, text-nf-text-dim, focus-visible:nf-focus).
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

interface CommentAuthor {
  displayName: string;
}
interface ReaderComment {
  id: string;
  novelId: string;
  chapterNumber: number;
  parentId: string | null;
  body: string;
  status: "VISIBLE" | "HIDDEN" | "DELETED";
  hiddenByModerator: boolean;
  author: CommentAuthor;
  replies?: ReaderComment[];
  replyCount?: number;
  createdAt: string;
  updatedAt: string;
}

const REPORT_REASONS = ["SPAM", "HARASSMENT", "SPOILER", "OFF_TOPIC", "OTHER"] as const;

const props = defineProps<{
  novelSlug: string;
  chapterNumber: number;
}>();

const { api } = useApi();
const { t } = useLocale();

const novelId = ref<string | null>(null);
const comments = ref<ReaderComment[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref<string | null>(null);
const sessionUserId = ref<string | null>(null);

const composerBody = ref("");
const posting = ref(false);
const postError = ref<string | null>(null);

const replyingTo = ref<string | null>(null);
const replyBody = ref("");
const replyError = ref<string | null>(null);

const editingId = ref<string | null>(null);
const editBody = ref("");
const editError = ref<string | null>(null);

const deletingId = ref<string | null>(null);
const deleteError = ref<string | null>(null);

const reportingId = ref<string | null>(null);
const reportReason = ref<string>("SPAM");
const reportError = ref<string | null>(null);
const reportDone = ref(false);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** True when the comment is the viewer's own (edit/delete affordances). */
const ownIds = computed(() => {
  const ids = new Set<string>();
  const mine = (c: ReaderComment) => {
    // The server never exposes userIds of other users (Invariant 4);
    // ownership is tracked client-side from our own successful writes.
    if (writtenIds.value.has(c.id)) ids.add(c.id);
    for (const r of c.replies ?? []) if (writtenIds.value.has(r.id)) ids.add(r.id);
  };
  for (const c of comments.value) mine(c);
  return ids;
});
const writtenIds = ref(new Set<string>());

async function detectSession() {
  try {
    const session = await api<{ userId: string }>(`/auth/session`);
    sessionUserId.value = session.userId;
  } catch {
    sessionUserId.value = null;
  }
}

async function loadFirst() {
  loading.value = true;
  loadError.value = null;
  try {
    const novel = await api<{ novel: { id: string } }>(
      `/public/novels/${encodeURIComponent(props.novelSlug)}`,
    );
    novelId.value = novel.novel.id;
    await detectSession();
    await loadPage(null);
  } catch {
    loadError.value = t("comments.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function loadPage(after: string | null) {
  if (!novelId.value) return;
  if (after) loadingMore.value = true;
  try {
    const qs = new URLSearchParams({
      novelId: novelId.value,
      chapterNumber: String(props.chapterNumber),
      limit: "20",
    });
    if (after) qs.set("cursor", after);
    const data = await api<{
      comments: ReaderComment[];
      page: { cursor: string | null; hasMore: boolean };
    }>(`/reader/comments?${qs.toString()}`);
    if (after) comments.value.push(...data.comments);
    else comments.value = data.comments;
    cursor.value = data.page.cursor;
    hasMore.value = data.page.hasMore;
  } catch {
    loadError.value = t("comments.loadFailed");
  } finally {
    loadingMore.value = false;
  }
}

function postErrorFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return t("comments.rateLimited");
    if (e.code === "COMMENT_DAILY_LIMIT") return t("comments.dailyLimited");
    if (e.code === "INVALID_INPUT") return t("comments.invalidBody");
    if (e.status === 401) return t("comments.signInPrompt");
  }
  return t("comments.postFailed");
}

async function postComment() {
  if (!novelId.value || posting.value) return;
  posting.value = true;
  postError.value = null;
  try {
    const data = await api<{ comment: ReaderComment }>(`/reader/comments`, {
      method: "POST",
      body: JSON.stringify({
        novelId: novelId.value,
        chapterNumber: props.chapterNumber,
        body: composerBody.value,
      }),
    });
    writtenIds.value = new Set(writtenIds.value).add(data.comment.id);
    composerBody.value = "";
    comments.value.push(data.comment);
  } catch (e) {
    postError.value = postErrorFor(e);
  } finally {
    posting.value = false;
  }
}

async function postReply(parentId: string) {
  if (!novelId.value) return;
  replyError.value = null;
  try {
    const data = await api<{ comment: ReaderComment }>(`/reader/comments`, {
      method: "POST",
      body: JSON.stringify({
        novelId: novelId.value,
        chapterNumber: props.chapterNumber,
        body: replyBody.value,
        parentId,
      }),
    });
    writtenIds.value = new Set(writtenIds.value).add(data.comment.id);
    const parent = comments.value.find((c) => c.id === parentId);
    if (parent) {
      parent.replies = [...(parent.replies ?? []), data.comment];
      parent.replyCount = (parent.replyCount ?? 0) + 1;
    }
    replyingTo.value = null;
    replyBody.value = "";
  } catch (e) {
    replyError.value = postErrorFor(e);
  }
}

function startEdit(c: ReaderComment) {
  editingId.value = c.id;
  editBody.value = c.body;
  editError.value = null;
}

async function saveEdit(id: string) {
  editError.value = null;
  try {
    const data = await api<{ comment: ReaderComment }>(
      `/reader/comments/${id}`,
      { method: "PATCH", body: JSON.stringify({ body: editBody.value }) },
    );
    const apply = (c: ReaderComment): ReaderComment =>
      c.id === id
        ? { ...c, body: data.comment.body, updatedAt: data.comment.updatedAt }
        : { ...c, replies: c.replies?.map(apply) };
    comments.value = comments.value.map(apply);
    editingId.value = null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      editError.value = t("comments.editWindowExpired");
    } else if (e instanceof ApiError && e.code === "INVALID_INPUT") {
      editError.value = t("comments.invalidBody");
    } else {
      editError.value = t("comments.postFailed");
    }
  }
}

async function confirmDelete(id: string) {
  deleteError.value = null;
  try {
    await api(`/reader/comments/${id}`, { method: "DELETE" });
    const apply = (c: ReaderComment): ReaderComment =>
      c.id === id
        ? { ...c, body: "[deleted]", status: "DELETED", hiddenByModerator: false }
        : { ...c, replies: c.replies?.map(apply) };
    comments.value = comments.value.map(apply);
    deletingId.value = null;
  } catch {
    deleteError.value = t("comments.postFailed");
  }
}

async function submitReport(id: string) {
  reportError.value = null;
  reportDone.value = false;
  try {
    await api(`/reader/comments/${id}/reports`, {
      method: "POST",
      body: JSON.stringify({ reason: reportReason.value }),
    });
    reportDone.value = true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      reportError.value = t("comments.reportDailyLimited");
    } else {
      reportError.value = t("comments.postFailed");
    }
  }
}

function closeReportDialog() {
  reportingId.value = null;
  reportReason.value = "SPAM";
  reportError.value = null;
  reportDone.value = false;
}

onMounted(loadFirst);
</script>

<template>
  <section aria-labelledby="comments-heading" class="mt-14 border-t border-nf-border pt-8">
    <h2 id="comments-heading" class="nf-overline">{{ t("comments.title") }}</h2>

    <div v-if="loading" role="status" class="mt-4 text-sm text-nf-text-dim">
      {{ t("comments.loading") }}
    </div>
    <div v-else-if="loadError" role="alert" class="mt-4 text-sm text-nf-text-dim">
      {{ loadError }}
    </div>
    <template v-else>
      <p v-if="!comments.length" class="mt-4 text-sm text-nf-text-dim">
        {{ t("comments.empty") }}
      </p>

      <ol class="mt-4 space-y-5">
        <li v-for="c in comments" :key="c.id">
          <article class="rounded-lg border border-nf-border bg-nf-bg-1 p-4">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold text-nf-text">{{ c.author.displayName }}</span>
              <time class="text-[12px] tabular-nums text-nf-text-faint" :datetime="c.createdAt">
                {{ formatDate(c.createdAt) }}
              </time>
              <span
                v-if="c.hiddenByModerator"
                class="rounded bg-nf-bg-0 px-1.5 py-px text-[11px] text-nf-text-dim"
              >
                {{ t("comments.hiddenNotice") }}
              </span>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-nf-text">{{ c.body }}</p>

            <!-- Reply thread (depth <= 1: no reply affordance on replies). -->
            <ol v-if="c.replies?.length" class="mt-3 space-y-3 border-l-2 border-nf-border pl-4">
              <li v-for="r in c.replies" :key="r.id">
                <article>
                  <div class="flex items-baseline gap-2">
                    <span class="text-[13px] font-semibold text-nf-text">{{ r.author.displayName }}</span>
                    <time class="text-[12px] tabular-nums text-nf-text-faint" :datetime="r.createdAt">
                      {{ formatDate(r.createdAt) }}
                    </time>
                    <span
                      v-if="r.hiddenByModerator"
                      class="rounded bg-nf-bg-0 px-1.5 py-px text-[11px] text-nf-text-dim"
                    >
                      {{ t("comments.hiddenNotice") }}
                    </span>
                  </div>
                  <template v-if="editingId === r.id">
                    <label class="mt-2 block text-[12px] text-nf-text-dim" :for="`edit-${r.id}`">
                      {{ t("comments.edit") }}
                    </label>
                    <textarea
                      :id="`edit-${r.id}`"
                      v-model="editBody"
                      rows="3"
                      maxlength="5000"
                      class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 text-[14px] text-nf-text focus-visible:nf-focus"
                    />
                    <div v-if="editError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ editError }}</div>
                    <div class="mt-2 flex gap-2">
                      <button
                        class="rounded-lg bg-nf-accent px-3 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
                        @click="saveEdit(r.id)"
                      >
                        {{ t("comments.save") }}
                      </button>
                      <button
                        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                        @click="editingId = null"
                      >
                        {{ t("comments.cancel") }}
                      </button>
                    </div>
                  </template>
                  <p v-else class="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-nf-text">{{ r.body }}</p>
                  <div v-if="sessionUserId" class="mt-2 flex flex-wrap gap-3 text-[12px]">
                    <button
                      v-if="ownIds.has(r.id) && r.status === 'VISIBLE' && editingId !== r.id"
                      class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                      @click="startEdit(r)"
                    >
                      {{ t("comments.edit") }}
                    </button>
                    <button
                      v-if="ownIds.has(r.id) && r.status !== 'DELETED' && deletingId !== r.id"
                      class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                      @click="deletingId = r.id"
                    >
                      {{ t("comments.delete") }}
                    </button>
                    <button
                      v-if="r.status === 'VISIBLE'"
                      class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                      @click="reportingId = r.id"
                    >
                      {{ t("comments.report") }}
                    </button>
                  </div>
                  <div v-if="deletingId === r.id" class="mt-2 rounded-lg border border-nf-border-strong p-3">
                    <p class="text-[13px] text-nf-text">{{ t("comments.deleteConfirm") }}</p>
                    <div class="mt-2 flex gap-2">
                      <button
                        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                        @click="confirmDelete(r.id)"
                      >
                        {{ t("comments.delete") }}
                      </button>
                      <button
                        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                        @click="deletingId = null"
                      >
                        {{ t("comments.cancel") }}
                      </button>
                    </div>
                    <div v-if="deleteError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ deleteError }}</div>
                  </div>
                </article>
              </li>
            </ol>

            <!-- Top-level actions. -->
            <div v-if="sessionUserId" class="mt-3 flex flex-wrap gap-3 text-[12px]">
              <button
                v-if="c.status === 'VISIBLE'"
                class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                @click="replyingTo = replyingTo === c.id ? null : c.id"
              >
                {{ t("comments.reply") }}
              </button>
              <button
                v-if="ownIds.has(c.id) && c.status === 'VISIBLE' && editingId !== c.id"
                class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                @click="startEdit(c)"
              >
                {{ t("comments.edit") }}
              </button>
              <button
                v-if="ownIds.has(c.id) && c.status !== 'DELETED' && deletingId !== c.id"
                class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                @click="deletingId = c.id"
              >
                {{ t("comments.delete") }}
              </button>
              <button
                v-if="c.status === 'VISIBLE'"
                class="text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
                @click="reportingId = c.id"
              >
                {{ t("comments.report") }}
              </button>
            </div>

            <!-- Inline reply composer (top-level only). -->
            <div v-if="replyingTo === c.id" class="mt-3">
              <label class="block text-[12px] text-nf-text-dim" :for="`reply-${c.id}`">
                {{ t("comments.replyPlaceholder") }}
              </label>
              <textarea
                :id="`reply-${c.id}`"
                v-model="replyBody"
                rows="3"
                maxlength="5000"
                class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 text-[14px] text-nf-text focus-visible:nf-focus"
              />
              <div v-if="replyError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ replyError }}</div>
              <div class="mt-2 flex gap-2">
                <button
                  class="rounded-lg bg-nf-accent px-3 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
                  @click="postReply(c.id)"
                >
                  {{ t("comments.post") }}
                </button>
                <button
                  class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="replyingTo = null"
                >
                  {{ t("comments.cancel") }}
                </button>
              </div>
            </div>

            <!-- Top-level edit composer. -->
            <div v-if="editingId === c.id" class="mt-3">
              <label class="block text-[12px] text-nf-text-dim" :for="`edit-${c.id}`">
                {{ t("comments.edit") }}
              </label>
              <textarea
                :id="`edit-${c.id}`"
                v-model="editBody"
                rows="3"
                maxlength="5000"
                class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 text-[14px] text-nf-text focus-visible:nf-focus"
              />
              <div v-if="editError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ editError }}</div>
              <div class="mt-2 flex gap-2">
                <button
                  class="rounded-lg bg-nf-accent px-3 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
                  @click="saveEdit(c.id)"
                >
                  {{ t("comments.save") }}
                </button>
                <button
                  class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="editingId = null"
                >
                  {{ t("comments.cancel") }}
                </button>
              </div>
            </div>

            <!-- Delete confirm (top-level). -->
            <div v-if="deletingId === c.id" class="mt-3 rounded-lg border border-nf-border-strong p-3">
              <p class="text-[13px] text-nf-text">{{ t("comments.deleteConfirm") }}</p>
              <div class="mt-2 flex gap-2">
                <button
                  class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="confirmDelete(c.id)"
                >
                  {{ t("comments.delete") }}
                </button>
                <button
                  class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="deletingId = null"
                >
                  {{ t("comments.cancel") }}
                </button>
              </div>
              <div v-if="deleteError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ deleteError }}</div>
            </div>
          </article>
        </li>
      </ol>

      <button
        v-if="hasMore"
        class="mt-6 rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        :disabled="loadingMore"
        @click="loadPage(cursor)"
      >
        {{ t("comments.loadMore") }}
      </button>

      <!-- Composer: session users only (progressive enhancement). -->
      <div v-if="sessionUserId" class="mt-8">
        <label class="nf-overline block" for="comment-composer">{{ t("comments.composerLabel") }}</label>
        <textarea
          id="comment-composer"
          v-model="composerBody"
          rows="4"
          maxlength="5000"
          :placeholder="t('comments.composerPlaceholder')"
          class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-3 text-[14px] text-nf-text focus-visible:nf-focus"
        />
        <div v-if="postError" role="alert" class="mt-1 text-[12px] text-nf-text-dim">{{ postError }}</div>
        <button
          class="mt-2 rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="posting || !composerBody.trim()"
          @click="postComment"
        >
          {{ t("comments.post") }}
        </button>
      </div>
      <p v-else class="mt-8 text-sm text-nf-text-dim">
        {{ t("comments.signInPrompt") }}
      </p>
    </template>

    <!-- Report dialog. -->
    <div
      v-if="reportingId"
      class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('comments.reportTitle')"
      @click.self="closeReportDialog"
    >
      <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-6">
        <h3 class="text-[16px] font-semibold text-nf-text">{{ t("comments.reportTitle") }}</h3>
        <div v-if="reportDone" role="status" class="mt-3 text-sm text-nf-text-dim">
          {{ t("comments.reportThanks") }}
        </div>
        <template v-else>
          <fieldset class="mt-3">
            <legend class="sr-only">{{ t("comments.reportTitle") }}</legend>
            <label
              v-for="reason in REPORT_REASONS"
              :key="reason"
              class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-nf-border px-3 py-2.5 text-[13px] text-nf-text hover:bg-nf-bg-2 [&:not(:first-child)]:mt-2"
            >
              <input
                v-model="reportReason"
                type="radio"
                name="report-reason"
                :value="reason"
                class="mt-0.5 accent-[var(--color-nf-accent)]"
              />
              <span>
                <span class="font-semibold">{{ t(`comments.reportReasons.${reason}`) }}</span>
                <span class="block text-[12px] text-nf-text-dim">{{ t(`comments.reportReasons.${reason}Hint`) }}</span>
              </span>
            </label>
          </fieldset>
          <div v-if="reportError" role="alert" class="mt-2 text-[12px] text-nf-text-dim">{{ reportError }}</div>
          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
              @click="closeReportDialog"
            >
              {{ t("comments.cancel") }}
            </button>
            <button
              class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
              @click="submitReport(reportingId)"
            >
              {{ t("comments.report") }}
            </button>
          </div>
        </template>
        <div v-if="reportDone" class="mt-4 flex justify-end">
          <button
            class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="closeReportDialog"
          >
            {{ t("comments.close") }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
