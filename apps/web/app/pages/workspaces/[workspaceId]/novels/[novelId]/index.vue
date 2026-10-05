<script setup lang="ts">
/**
 * Writer workspace (Phase 2 + NF-WF-007). Layout per docs/design/writer-workspace
 * + DESIGN-TOKENS.md: header / nav | editor | context rail / status footer.
 *
 * Data comes from the manuscript API; autosave PUTs a new immutable
 * version with the optimistic-concurrency expectedVersion and handles 409
 * (someone else saved first) by refetching rather than clobbering.
 *
 * NF-WF-007 adds the chapter generation loop in the right rail
 * (GenerationPanel + RunStatusPanel) and a review area above the editor:
 * outline-moved notice (Q2), versioned draft diff, findings, proposals
 * (Candidate Canon), snapshot-bound approve/reject, and the guarded
 * apply bar. Every surface drives the real NF-WF-004/005/006 backend.
 */
import { useChapterGeneration } from "../../../../../composables/useChapterGeneration";
import { useWorkflowRuns, type RunView } from "../../../../../composables/useWorkflowRuns";
import { useLocale } from "../../../../../composables/useLocale";
import { ApiError } from "../../../../../composables/useApi";
import type RunStatusPanel from "../../../../../components/generation/RunStatusPanel.vue";
import type GenerationPanel from "../../../../../components/generation/GenerationPanel.vue";

interface ChapterSummary {
  id: string;
  number: number;
  title: string;
  status: string;
  wordCount: number;
  currentVersion: number | null;
}
interface ChapterDetail extends ChapterSummary {
  content: string;
}

const route = useRoute();
const { api } = useApi();
const { t, locale, setLocale } = useLocale();
const gen = useChapterGeneration();
const runs = useWorkflowRuns();

const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const novelId = computed(() => String(route.params.novelId ?? ""));
const base = computed(() => `/workspaces/${workspaceId.value}/novels/${novelId.value}`);

const chapters = ref<ChapterSummary[]>([]);
const activeId = ref<string | null>(null);
const content = ref("");
const version = ref<number | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const saveState = ref<"saved" | "dirty" | "saving" | "conflict">("saved");

const activeChapter = computed(
  () => chapters.value.find((c) => c.id === activeId.value) ?? null,
);
const wordCount = computed(() =>
  content.value.trim() ? content.value.trim().split(/\s+/).length : 0,
);

const saveLabel = computed(
  () =>
    ({
      saved: t("common.saved"),
      dirty: t("common.dirty"),
      saving: t("common.saving"),
      conflict: t("common.conflict"),
    })[saveState.value],
);

// ---------- NF-WF-007 generation loop state ----------
const reviewRunId = ref<string | null>(null);
const reviewStatusUrl = ref<string | null>(null);
const dialogOpen = ref(false);
const deciding = ref(false);
/** Invariant 5 decide-error states. */
const decideState = ref<
  | { kind: "ok" }
  | { kind: "stale" }
  | { kind: "nosnapshot" }
  | { kind: "cancelled" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "error" }
>({ kind: "ok" });
const runPanel = ref<InstanceType<typeof RunStatusPanel> | null>(null);
const generationPanel = ref<InstanceType<typeof GenerationPanel> | null>(null);

const showReview = computed(
  () =>
    gen.review.value !== null &&
    (gen.selectedRun.value?.status === "AWAITING_APPROVAL" ||
      gen.selectedRun.value?.status === "SUCCEEDED"),
);
const canDecide = computed(
  () =>
    gen.selectedRun.value?.status === "AWAITING_APPROVAL" &&
    gen.review.value !== null &&
    decideState.value.kind !== "forbidden",
);

function onRunUpdated(run: RunView) {
  gen.selectedRun.value = run;
  if (run.status === "AWAITING_APPROVAL" && gen.review.value?.runId !== run.id) {
    void loadReviewFor(run);
  } else if (run.status === "SUCCEEDED" && gen.review.value?.runId !== run.id) {
    // Approved earlier (or decided elsewhere): still reviewable for apply.
    void loadReviewFor(run);
  } else if (run.status === "FAILED" || run.status === "CANCELLED") {
    gen.clearReview();
  }
}

async function loadReviewFor(run: RunView) {
  // Pin the diff against the chapter's server version at review time.
  try {
    const detail = await api<ChapterDetail>(`${base.value}/chapters/${activeId.value}`);
    gen.diffPinnedVersion.value = detail.currentVersion;
    diffBaseText.value = detail.content;
  } catch {
    gen.diffPinnedVersion.value = version.value;
    diffBaseText.value = content.value;
  }
  decideState.value = { kind: "ok" };
  await gen.loadReview(workspaceId.value, novelId.value, run);
}

const diffBaseText = ref("");

function onRunSelected(runId: string) {
  reviewRunId.value = runId;
  reviewStatusUrl.value = null; // RunStatusPanel loads via getRun; no poll URL needed
  gen.clearReview();
}

async function onRunStarted(payload: { runId: string; statusUrl: string }) {
  reviewRunId.value = payload.runId;
  reviewStatusUrl.value = payload.statusUrl;
  gen.clearReview();
  decideState.value = { kind: "ok" };
}

async function decide(decision: "approve" | "reject", reason: string | undefined) {
  const model = gen.review.value;
  if (!model || deciding.value) return;
  deciding.value = true;
  try {
    const updated = await runs.decideRun({
      workspaceId: workspaceId.value,
      runId: model.runId,
      decision,
      expectedSnapshotHash: model.snapshot.snapshotHash,
      ...(reason ? { reason } : {}),
    });
    dialogOpen.value = false;
    gen.selectedRun.value = updated;
    decideState.value = { kind: "ok" };
    // After approve the run resumes from the parked step; reload the run
    // panel so it resumes polling to SUCCEEDED (apply bar appears there).
    // After reject the run is FAILED — render the terminal state.
    if (decision === "approve") runPanel.value?.reload();
    else onRunUpdated(updated);
    generationPanel.value?.refresh();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === "STALE_APPROVAL") {
        // Re-read the run, recompute from the NEW snapshot, require
        // fresh review — never auto-retry the approve.
        decideState.value = { kind: "stale" };
        dialogOpen.value = false;
        const fresh = await runs.getRun(workspaceId.value, model.runId);
        gen.selectedRun.value = fresh;
        await loadReviewFor(fresh);
      } else if (e.code === "NO_APPROVAL_SNAPSHOT") {
        decideState.value = { kind: "nosnapshot" };
        dialogOpen.value = false;
      } else if (e.code === "RUN_CANCELLED") {
        decideState.value = { kind: "cancelled" };
        dialogOpen.value = false;
        const fresh = await runs.getRun(workspaceId.value, model.runId);
        onRunUpdated(fresh);
      } else if (e.code === "ALREADY_DECIDED") {
        // Benign duplicate click: refetch, render current state.
        dialogOpen.value = false;
        decideState.value = { kind: "ok" };
        const fresh = await runs.getRun(workspaceId.value, model.runId);
        onRunUpdated(fresh);
      } else if (e.status === 403) {
        decideState.value = { kind: "forbidden" };
        dialogOpen.value = false;
      } else if (e.status === 404) {
        decideState.value = { kind: "gone" };
        dialogOpen.value = false;
      } else {
        decideState.value = { kind: "error" };
      }
    } else {
      decideState.value = { kind: "error" };
    }
  } finally {
    deciding.value = false;
  }
}

function decideMessage(): string | null {
  switch (decideState.value.kind) {
    case "stale":
      return t("review.staleApproval");
    case "nosnapshot":
      return t("review.noSnapshot");
    case "cancelled":
      return t("review.runCancelled");
    case "forbidden":
      return t("review.noPermission");
    case "gone":
      return t("review.runGone");
    case "error":
      return t("review.decideFailed");
    default:
      return null;
  }
}

async function onApplied(newVersion: number) {
  version.value = newVersion;
  const chapter = activeChapter.value;
  if (chapter) {
    chapter.currentVersion = newVersion;
    // Re-pin the diff: the applied draft is now the chapter text.
    gen.diffPinnedVersion.value = newVersion;
    diffBaseText.value = gen.review.value?.prose ?? diffBaseText.value;
    content.value = gen.review.value?.prose ?? content.value;
    chapter.wordCount = wordCount.value;
  }
  saveState.value = "saved";
}

async function onReloadRediff() {
  if (!activeId.value) return;
  const detail = await api<ChapterDetail>(`${base.value}/chapters/${activeId.value}`);
  content.value = detail.content;
  version.value = detail.currentVersion;
  const chapter = activeChapter.value;
  if (chapter) chapter.currentVersion = detail.currentVersion;
  gen.diffPinnedVersion.value = detail.currentVersion;
  diffBaseText.value = detail.content;
  saveState.value = "saved";
}

async function onContinueNext() {
  const current = activeChapter.value;
  if (!current) return;
  const next = [...chapters.value]
    .sort((a, b) => a.number - b.number)
    .find((c) => c.number > current.number);
  if (next) {
    reviewRunId.value = null;
    gen.selectedRun.value = null;
    gen.clearReview();
    await selectChapter(next.id);
  }
}

function onApprove(reason: string | undefined) {
  void decide("approve", reason);
}

function onReject(reason: string) {
  void decide("reject", reason);
}

function onCancelled() {
  gen.clearReview();
  generationPanel.value?.refresh();
}

// ---------- existing manuscript behavior (unchanged) ----------
async function loadChapters() {
  chapters.value = await api<ChapterSummary[]>(`${base.value}/chapters`);
  if (!activeId.value && chapters.value.length) {
    await selectChapter(chapters.value[0]!.id);
  }
}

async function selectChapter(id: string) {
  // Switching chapters resets the generation review context.
  reviewRunId.value = null;
  reviewStatusUrl.value = null;
  gen.selectedRun.value = null;
  gen.clearReview();
  decideState.value = { kind: "ok" };
  // Flush unsaved text for the chapter we're leaving before switching.
  if (saveState.value === "dirty") await saveNow();
  const seq = ++selectSeq;
  activeId.value = id;
  const detail = await api<ChapterDetail>(`${base.value}/chapters/${id}`);
  // A newer selection won the race — drop this stale response.
  if (seq !== selectSeq) return;
  content.value = detail.content;
  version.value = detail.currentVersion;
  saveState.value = "saved";
  error.value = null;
}

async function createChapter() {
  const title = globalThis.prompt(t("header.newChapter"));
  if (!title?.trim()) return;
  try {
    const { id } = await api<{ id: string; number: number }>(
      `${base.value}/chapters`,
      { method: "POST", body: JSON.stringify({ title: title.trim() }) },
    );
    await loadChapters();
    await selectChapter(id);
  } catch {
    error.value = t("errors.createChapterFailed");
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
// Monotonic token: only the newest selectChapter response may write state.
let selectSeq = 0;
onUnmounted(() => clearTimeout(timer));

function onInput() {
  saveState.value = "dirty";
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), 1500); // 1.5s debounce
}

async function saveNow() {
  const chapter = activeChapter.value;
  if (!chapter || saveState.value === "saving") return;
  const savingId = chapter.id;
  clearTimeout(timer);
  saveState.value = "saving";
  try {
    const result = await api<{ version: number; wordCount: number }>(
      `${base.value}/chapters/${chapter.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: content.value,
          expectedVersion: version.value,
        }),
      },
    );
    chapter.currentVersion = result.version;
    chapter.wordCount = result.wordCount;
    // The user may have switched chapters while this save was in flight;
    // only the still-active chapter may touch the live editor state.
    if (activeId.value === savingId) {
      version.value = result.version;
      saveState.value = "saved";
      error.value = null;
    }
  } catch (e) {
    if (activeId.value !== savingId) return; // stale save, chapter moved on
    if (e instanceof ApiError && e.status === 409) {
      // Stale version or published chapter: refetch instead of clobbering.
      saveState.value = "conflict";
      await selectChapter(savingId);
    } else {
      saveState.value = "dirty"; // keep the text; retry on next edit
      error.value = t("errors.saveFailed");
    }
  }
}

onMounted(async () => {
  try {
    await loadChapters();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await navigateTo(
        `/sign-in?redirect=${encodeURIComponent(route.fullPath)}`,
      );
      return;
    }
    error.value = t("errors.loadManuscriptFailed");
  } finally {
    loading.value = false;
  }
});

async function publish() {
  const chapter = activeChapter.value;
  if (!chapter) return;
  if (saveState.value !== "saved") await saveNow();
  // Never publish unsaved or conflicted text — the version on the server
  // is what gets frozen, so a failed save must abort the publish.
  if (saveState.value !== "saved") return;
  try {
    await api(`${base.value}/chapters/${chapter.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    chapter.status = "PUBLISHED";
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 403
        ? t("errors.publishForbidden")
        : t("errors.publishFailed");
  }
}
</script>

<template>
  <div class="grid h-dvh grid-rows-[52px_1fr_30px] bg-nf-bg-0 text-nf-text">
    <header
      class="flex items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 shadow-nf-sm"
    >
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight hover:opacity-80 focus-visible:nf-focus"
      >
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </NuxtLink>
      <div class="flex-1" />
      <div
        class="flex items-center gap-1 rounded-lg border border-nf-border p-0.5 text-[12px]"
        role="group"
        aria-label="Language"
      >
        <button
          v-for="l in (['en', 'id'] as const)"
          :key="l"
          class="rounded-md px-2 py-0.5 uppercase focus-visible:nf-focus"
          :class="locale === l ? 'bg-nf-accent/20 font-semibold text-nf-accent-hi' : 'text-nf-text-faint hover:text-nf-text'"
          :aria-pressed="locale === l"
          @click="setLocale(l)"
        >
          {{ l }}
        </button>
      </div>
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        :disabled="saveState === 'saved'"
        @click="saveNow"
      >
        {{ t("common.save") }}
      </button>
      <button
        class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        :disabled="!activeChapter || saveState === 'saving'"
        @click="publish"
      >
        {{ t("header.publish") }}
      </button>
    </header>

    <div
      class="grid min-h-0 grid-cols-1 lg:grid-cols-[264px_1fr] xl:grid-cols-[264px_1fr_340px]"
    >
      <nav class="hidden overflow-y-auto border-r border-nf-border bg-nf-bg-1 p-4 lg:block">
        <div class="mb-2 flex items-center justify-between px-2.5 pb-2">
          <span
            class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >{{ t("chapters.title") }}</span
          >
          <button
            class="rounded border border-nf-border-strong px-1.5 text-[13px] leading-5 text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('header.newChapter')"
            @click="createChapter"
          >
            +
          </button>
        </div>
        <p v-if="loading" class="px-2.5 text-[13px] text-nf-text-faint">{{ t("common.loading") }}</p>
        <p v-else-if="!chapters.length" class="px-2.5 text-[13px] text-nf-text-faint">
          {{ t("chapters.empty") }}
        </p>
        <button
          v-for="c in chapters"
          :key="c.id"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] focus-visible:nf-focus"
          :class="
            c.id === activeId
              ? 'border-l-2 border-nf-accent bg-nf-accent/10 font-semibold text-nf-accent-hi'
              : 'text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
          "
          @click="selectChapter(c.id)"
        >
          <span class="truncate">{{ c.number }} — {{ c.title }}</span>
          <span
            class="ml-auto shrink-0 rounded bg-nf-bg-0 px-1.5 py-px text-[11px] tabular-nums text-nf-text-faint"
          >
            {{ c.wordCount.toLocaleString() }}
          </span>
        </button>
      </nav>

      <main class="flex min-w-0 flex-col bg-nf-bg-0">
        <div class="flex items-center gap-2 border-b border-nf-border bg-nf-bg-1 px-6 py-2">
          <span class="text-[12.5px] font-semibold text-nf-text-dim">B</span>
          <span class="font-nf-literary text-[12.5px] font-bold italic text-nf-text-dim">I</span>
          <span class="text-[12.5px] font-semibold text-nf-text-dim">H2</span>
          <div class="flex-1" />
          <span class="flex items-center gap-1.5 text-[12px] tabular-nums text-nf-text-faint">
            <span
              class="text-[9px]"
              :class="saveState === 'saved' ? 'text-nf-ok' : 'text-nf-accent-hi'"
              >●</span
            >
            {{ saveLabel }}<template v-if="version !== null"> · v{{ version }}</template>
          </span>
        </div>

        <div class="flex-1 overflow-y-auto">
          <p
            v-if="error"
            role="alert"
            class="mx-auto mt-6 max-w-[700px] rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-4 py-3 text-[13px] text-nf-warn"
          >
            {{ error }}
          </p>

          <!-- NF-WF-007 review area -->
          <div
            v-if="showReview && gen.review.value"
            class="mx-auto flex max-w-[760px] flex-col gap-4 px-6 pt-6 lg:px-10"
          >
            <OutlineMovedNotice
              v-if="gen.outlineMoved.value?.moved"
              :from-version-number="gen.outlineMoved.value.fromNumber"
              :to-version-number="gen.outlineMoved.value.toNumber"
              :changes="gen.outlineMoved.value.changes"
              :truncated="gen.outlineMoved.value.truncated"
            />
            <DraftDiffView
              :draft-prose="gen.review.value.prose"
              :base-text="diffBaseText"
              :pinned-version="gen.diffPinnedVersion.value"
              :ordinal="gen.review.value.draft.ordinal"
              :total="gen.review.value.draft.total"
            />
            <FindingsPanel :findings="gen.review.value.findings" />
            <ProposalsPanel :proposals="gen.review.value.proposals" />

            <p
              v-if="decideMessage()"
              role="alert"
              class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-4 py-3 text-[13px] text-nf-warn"
            >
              {{ decideMessage() }}
            </p>

            <div v-if="canDecide" class="flex gap-2">
              <button
                class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
                @click="dialogOpen = true"
              >
                {{ t("review.title") }}
              </button>
            </div>

            <ApplyBar
              v-if="activeChapter"
              :workspace-id="workspaceId"
              :novel-id="novelId"
              :chapter-id="activeChapter.id"
              :chapter-number="activeChapter.number"
              :chapter-status="activeChapter.status"
              :current-version="version"
              :diff-pinned-version="gen.diffPinnedVersion.value"
              :save-state="saveState"
              :run-status="gen.selectedRun.value?.status ?? null"
              :run-id="gen.selectedRun.value?.id ?? null"
              :draft-prose="gen.review.value.prose"
              @applied="onApplied"
              @reload-rediff="onReloadRediff"
              @continue-next="onContinueNext"
            />
          </div>

          <div v-if="activeChapter" class="mx-auto max-w-[700px] px-6 py-10 lg:px-10">
            <div
              class="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-nf-accent-hi"
            >
              {{ t("chapters.chapter") }} {{ activeChapter.number }}
              <span class="h-px flex-1 bg-gradient-to-r from-nf-border-strong to-transparent" />
            </div>
            <h1 class="mb-2 font-nf-literary text-3xl font-semibold leading-tight">
              {{ activeChapter.title }}
            </h1>
            <div class="mb-8 text-[13px] tabular-nums text-nf-text-faint">
              {{ activeChapter.status }} · {{ wordCount.toLocaleString() }} {{ t("chapters.words") }}
            </div>
            <textarea
              v-model="content"
              rows="18"
              :aria-label="t('chapters.editorPlaceholder')"
              class="w-full resize-none border-none bg-transparent font-nf-literary text-[17.5px] leading-[1.85] text-nf-text outline-none placeholder:text-nf-text-faint focus-visible:nf-focus"
              :placeholder="t('chapters.editorPlaceholder')"
              @input="onInput"
              @blur="saveState === 'dirty' && saveNow()"
            />
          </div>
          <p v-else-if="!loading" class="px-6 py-10 text-center text-sm text-nf-text-faint">
            {{ t("chapters.selectPrompt") }}
          </p>
        </div>
      </main>

      <aside
        class="hidden overflow-y-auto border-l border-nf-border bg-nf-bg-1 px-4 py-5 xl:block"
      >
        <GenerationPanel
          ref="generationPanel"
          :workspace-id="workspaceId"
          :novel-id="novelId"
          :chapter="
            activeChapter
              ? {
                  id: activeChapter.id,
                  number: activeChapter.number,
                  title: activeChapter.title,
                  status: activeChapter.status,
                  currentVersion: version,
                }
              : null
          "
          @run-selected="onRunSelected"
          @run-started="onRunStarted"
        />
        <div v-if="reviewRunId" class="mt-5 border-t border-nf-border pt-4">
          <RunStatusPanel
            ref="runPanel"
            :workspace-id="workspaceId"
            :run-id="reviewRunId"
            :status-url="reviewStatusUrl"
            @run-updated="onRunUpdated"
            @cancelled="onCancelled"
          />
        </div>
      </aside>
    </div>

    <footer
      class="flex items-center gap-5 border-t border-nf-border bg-nf-bg-1 px-5 text-[11.5px] tabular-nums text-nf-text-faint"
    >
      <span>{{ t("chapters.version") }} <b class="font-semibold text-nf-text-dim">v{{ version ?? "—" }}</b></span>
      <span>{{ t("chapters.words") }} <b class="font-semibold text-nf-text-dim">{{ wordCount.toLocaleString() }}</b></span>
      <div class="ml-auto hidden gap-5 sm:flex">
        <span>
          {{ t("chapters.chapter") }}
          <b class="font-semibold text-nf-text-dim">{{ activeChapter?.number ?? "—" }}</b>
        </span>
      </div>
    </footer>

    <ApprovalDialog
      :open="dialogOpen"
      :snapshot-hash="gen.review.value?.snapshot.snapshotHash ?? ''"
      :deciding="deciding"
      @close="dialogOpen = false"
      @approve="onApprove"
      @reject="onReject"
    />
  </div>
</template>
