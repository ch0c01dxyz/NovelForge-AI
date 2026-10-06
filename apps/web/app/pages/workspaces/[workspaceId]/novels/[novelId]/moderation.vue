<script setup lang="ts">
/**
 * Comment moderation queue (NF-WF-019B) — workspace side.
 *
 * Staff-only view (workspace members holding the EXISTING `novel:update`
 * capability; Klein's Q2 decision 2026-10-06: the author / novel
 * creator and their staff ARE the moderation team — no platform team).
 * Lists reported comments aggregated per (comment, reason) with
 * reporter COUNTS; reporter identities are never exposed (Invariant 4).
 * Actions: hide / unhide / delete — all audit-logged server-side.
 *
 * The header link on the novel page is role-gated (progressive
 * enhancement); the server enforces membership + `novel:update` on
 * every route (403/404).
 *
 * Visual language follows docs/design/writer-workspace (the §15
 * foundational design).
 */
import { useLocale } from "../../../../../composables/useLocale";
import { useApi, ApiError } from "../../../../../composables/useApi";

interface ReportedComment {
  comment: {
    id: string;
    novelId: string;
    chapterNumber: number;
    parentId: string | null;
    body: string;
    status: "VISIBLE" | "HIDDEN" | "DELETED";
    hiddenByModerator: boolean;
    author: { displayName: string };
    createdAt: string;
    updatedAt: string;
  };
  reason: string;
  reporterCount: number;
  createdAt: string;
}

const route = useRoute();
const { api } = useApi();
const { t } = useLocale();

const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const novelId = computed(() => String(route.params.novelId ?? ""));

const reports = ref<ReportedComment[]>([]);
const loading = ref(true);
const forbidden = ref(false);
const error = ref<string | null>(null);
const statusFilter = ref<string>("ALL");
const actingId = ref<string | null>(null);
const actionError = ref<string | null>(null);

async function load() {
  loading.value = true;
  forbidden.value = false;
  error.value = null;
  try {
    const qs =
      statusFilter.value === "ALL" ? "" : `?status=${statusFilter.value}`;
    const data = await api<{ reports: ReportedComment[] }>(
      `/reader/novels/${novelId.value}/moderation/reports${qs}`,
    );
    reports.value = data.reports;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      forbidden.value = true;
    } else {
      error.value = t("comments.queueLoadFailed");
    }
  } finally {
    loading.value = false;
  }
}

async function act(
  commentId: string,
  action: "hide" | "unhide" | "delete",
) {
  actingId.value = commentId;
  actionError.value = null;
  try {
    if (action === "delete") {
      await api(`/reader/comments/${commentId}`, { method: "DELETE" });
    } else {
      await api<{ comment: ReportedComment["comment"] }>(
        `/reader/comments/${commentId}/${action}`,
        { method: "POST" },
      );
    }
    await load();
  } catch {
    actionError.value = t("comments.queueActionFailed");
  } finally {
    actingId.value = null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

watch(statusFilter, load);
onMounted(load);
</script>

<template>
  <main class="mx-auto max-w-[860px] px-5 py-12 sm:px-10">
    <NuxtLink
      :to="`/workspaces/${workspaceId}/novels/${novelId}`"
      class="text-[13px] text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
    >
      {{ t("comments.backToNovel") }}
    </NuxtLink>
    <div class="nf-overline mt-6">{{ t("comments.queueOverline") }}</div>
    <h1 class="mt-3 font-nf-literary text-[30px] font-semibold leading-[1.2]">
      {{ t("comments.queueTitle") }}
    </h1>
    <p class="mt-2 max-w-[60ch] text-[13px] text-nf-text-dim">
      {{ t("comments.queueHint") }}
    </p>

    <div v-if="loading" role="status" class="mt-8 text-sm text-nf-text-dim">
      {{ t("comments.loading") }}
    </div>
    <div v-else-if="forbidden" role="alert" class="mt-8">
      <p class="text-[14px] text-nf-text">{{ t("comments.queueForbiddenTitle") }}</p>
      <p class="mt-1 text-[13px] text-nf-text-dim">{{ t("comments.queueForbiddenBody") }}</p>
    </div>
    <div v-else-if="error" role="alert" class="mt-8 text-sm text-nf-text-dim">{{ error }}</div>
    <template v-else>
      <div class="mt-6 flex items-center gap-3">
        <label for="status-filter" class="text-[13px] text-nf-text-dim">
          {{ t("comments.queueStatusFilter") }}
        </label>
        <select
          id="status-filter"
          v-model="statusFilter"
          class="rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option value="ALL">{{ t("comments.queueStatusAll") }}</option>
          <option value="VISIBLE">{{ t("comments.statusVisible") }}</option>
          <option value="HIDDEN">{{ t("comments.statusHidden") }}</option>
          <option value="DELETED">{{ t("comments.statusDeleted") }}</option>
        </select>
      </div>

      <p v-if="!reports.length" class="mt-6 text-sm text-nf-text-dim">
        {{ t("comments.queueEmpty") }}
      </p>

      <ol class="mt-4 space-y-4">
        <li
          v-for="r in reports"
          :key="`${r.comment.id}-${r.reason}`"
          class="rounded-lg border border-nf-border bg-nf-bg-1 p-4"
        >
          <article>
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="text-[13px] font-semibold text-nf-text">
                {{ r.comment.author.displayName }}
              </span>
              <span class="text-[12px] text-nf-text-faint">
                {{ t("comments.queueChapter", { n: r.comment.chapterNumber }) }}
              </span>
              <time class="text-[12px] tabular-nums text-nf-text-faint" :datetime="r.comment.createdAt">
                {{ formatDate(r.comment.createdAt) }}
              </time>
              <span class="rounded bg-nf-bg-0 px-1.5 py-px text-[11px] text-nf-text-dim">
                {{ t(`comments.reportReasons.${r.reason}`) }} · {{ t("comments.queueReporterCount", { n: r.reporterCount }) }}
              </span>
              <span class="rounded bg-nf-bg-0 px-1.5 py-px text-[11px] text-nf-text-dim">
                {{ t(`comments.status${r.comment.status.charAt(0)}${r.comment.status.slice(1).toLowerCase()}`) }}
              </span>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-nf-text">{{ r.comment.body }}</p>
            <div v-if="actionError && actingId === r.comment.id" role="alert" class="mt-1 text-[12px] text-nf-text-dim">
              {{ actionError }}
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-if="r.comment.status === 'VISIBLE'"
                class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
                :disabled="actingId === r.comment.id"
                @click="act(r.comment.id, 'hide')"
              >
                {{ t("comments.hide") }}
              </button>
              <button
                v-if="r.comment.status === 'HIDDEN'"
                class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
                :disabled="actingId === r.comment.id"
                @click="act(r.comment.id, 'unhide')"
              >
                {{ t("comments.unhide") }}
              </button>
              <button
                v-if="r.comment.status !== 'DELETED'"
                class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
                :disabled="actingId === r.comment.id"
                @click="act(r.comment.id, 'delete')"
              >
                {{ t("comments.delete") }}
              </button>
            </div>
          </article>
        </li>
      </ol>
    </template>
  </main>
</template>
