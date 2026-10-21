<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
/**
 * Generation panel (NF-WF-007 output #1): start form + run history.
 *
 * Start flow (Invariant 2.1–2.2): resolve the workflow id by key
 * "chapter-generation-review"; read the APPROVED outline version →
 * outlineRef; POST the run route with a fresh uuid-v4 idempotencyKey
 * per intentional start (double-submit → 200, one row). Starting while
 * another run for the chapter is AWAITING_APPROVAL shows a warning
 * naming the parked run — never auto-cancels (Q3: cancel lives only on
 * the run panel; the warning deep-links to it).
 */
import { useWorkflowRuns } from "../../composables/useWorkflowRuns";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import type { OutlineVersionView } from "../../composables/useChapterGeneration";
import WorkflowRunModelPreferences from "./WorkflowRunModelPreferences.vue";
import { readWorkflowStart, saveWorkflowStart, clearWorkflowStart, type PendingWorkflowStart } from "../../utils/workflowStartJournal";

interface ChapterRef {
  id: string;
  number: number;
  title: string;
  status: string;
  currentVersion: number | null;
}

interface RunHistoryItem {
  id: string;
  novelId: string | null;
  status: string;
  input: unknown;
  startedAt: string;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  chapter: ChapterRef | null;
  creationMode?: boolean;
}>();

const emit = defineEmits<{
  (e: "run-selected", runId: string): void;
  (e: "run-started", payload: { runId: string; statusUrl: string }): void;
}>();

const { t } = useLocale();
const runs = useWorkflowRuns();

const workflowId = ref<string | null>(null);
const templateMissing = ref(false);
const outlines = ref<OutlineVersionView[]>([]);
const outlineId = ref<string>("");
const targetWords = ref<string>("");
const styleNotes = ref("");
const stepModelRefs = ref<Record<string, string>>({});
const modelPreferenceFingerprint = ref<string | null>(null);
const history = ref<RunHistoryItem[]>([]);
let selectionVersion = 0;
let historyRequest = 0;
let restoredHistorySelection = false;
const starting = ref(false);
const preparingRetry = ref(false);
const retryNotice = ref(false);
const creationWorkflow = ref(false);
let retrySetupRequest = 0;
const loading = ref(true);
const error = ref<string | null>(null);
const startError = ref<string | null>(null);
const pendingStart = ref<PendingWorkflowStart | null>(null);
const uncertainStart = ref(false);
const recoveryReady = ref(false);
const recoveryFailed = ref(false);
const actorUserId = ref<string | null>(null);
let mounted = true;
let recoveryRequest = 0;
async function restoreStart() {
  const request = ++recoveryRequest;
  recoveryReady.value = false;
  recoveryFailed.value = false;
  pendingStart.value = null;
  uncertainStart.value = false;
  actorUserId.value = null;
  try {
    const { api } = useApi();
    const session = await api<{ userId: string }>("/auth/session");
    if (!mounted || request !== recoveryRequest) return;
    const restored = readWorkflowStart(session.userId);
    actorUserId.value = session.userId;
    pendingStart.value = restored;
    uncertainStart.value = restored !== null;
    recoveryReady.value = true;
  } catch {
    if (mounted && request === recoveryRequest) recoveryFailed.value = true;
  }
}
onMounted(() => { void restoreStart(); });

const approvedOutline = computed(
  () => outlines.value.find((o) => o.status === "APPROVED") ?? null,
);

function inputChapterNumber(item: RunHistoryItem): number | null {
  const input = item.input as Record<string, unknown> | null | undefined;
  const n = input?.chapterNumber;
  return typeof n === "number" ? n : null;
}

/** Verify provenance even when the server has already filtered the list. */
const chapterHistory = computed(() =>
  history.value.filter((r) => {
    const input = r.input as { chapterId?: unknown } | null;
    return r.novelId === props.novelId && inputChapterNumber(r) === props.chapter?.number &&
      (input?.chapterId == null || input.chapterId === props.chapter?.id);
  }),
);
const parkedRun = computed(() => chapterHistory.value.find((r) => r.status === "AWAITING_APPROVAL") ?? null);

async function refresh(version: number) {
  if (!props.chapter) { loading.value = false; return; }
  loading.value = true;
  error.value = null;
  try {
    const wid = await runs.resolveWorkflowId(props.workspaceId, props.creationMode ? "chapter-creation-review" : "chapter-generation-review");
    if (version !== selectionVersion) return;
    workflowId.value = wid;
    creationWorkflow.value = !!props.creationMode;
    templateMissing.value = wid === null;
  } catch (e) {
    if (version !== selectionVersion) return;
    if (!(e instanceof ApiError)) error.value = t("errors.network");
    else error.value = t("errors.loadFailed");
  } finally {
    if (version === selectionVersion) loading.value = false;
  }
}

async function loadOutlinesAndHistory() {
  if (!props.chapter || !workflowId.value) return;
  const version = selectionVersion;
  const request = ++historyRequest;
  const { workspaceId, novelId, chapter } = props;
  try {
    const { api } = useApi();
    const [ovs, hs] = await Promise.all([
      api<OutlineVersionView[]>(
        `/workspaces/${workspaceId}/novels/${novelId}/planning/outline-versions`,
      ),
      runs.listRuns({ workspaceId, novelId, chapterNumber: chapter.number, limit: 100 }),
    ]);
    if (version !== selectionVersion || request !== historyRequest) return;
    outlines.value = ovs;
    const approved = ovs.find((o) => o.status === "APPROVED");
    outlineId.value = approved?.id ?? "";
    history.value = hs.map((h) => ({
      id: h.id,
      novelId: h.novelId,
      status: h.status,
      input: h.input,
      startedAt: h.startedAt,
    }));
    if (!restoredHistorySelection) {
      restoredHistorySelection = true;
      const latest = chapterHistory.value.find(r => ["AWAITING_APPROVAL", "SUCCEEDED"].includes(r.status));
      if (latest) emit("run-selected", latest.id);
    }
  } catch (e) {
    if (version !== selectionVersion || request !== historyRequest) return;
    error.value = e instanceof ApiError ? t("errors.loadFailed") : t("errors.network");
  }
}

async function startRun() {
  if (starting.value || preparingRetry.value || !recoveryReady.value) return;
  const version = selectionVersion;
  starting.value = true;
  startError.value = null;
  try {
    const { api } = useApi();
    const session = await api<{ userId: string }>("/auth/session");
    if (!mounted) return;
    if (session.userId !== actorUserId.value) { await restoreStart();return; }
    if (!pendingStart.value) {
    if (version !== selectionVersion) return;
    if (!props.chapter || !workflowId.value || !modelPreferenceFingerprint.value) return;
    const input: Record<string, unknown> = { chapterNumber: props.chapter.number, outlineRef: outlineId.value };
    if (creationWorkflow.value) input.chapterId = props.chapter.id;
    const words = Number.parseInt(targetWords.value, 10);
    if (Number.isFinite(words) && words > 0) input.targetWordCount = words;
    if (styleNotes.value.trim()) input.styleNotes = styleNotes.value.trim();
    const pending: PendingWorkflowStart = { actorUserId: session.userId, chapterId: props.chapter.id, chapterTitle: props.chapter.title, request: {
      workspaceId: props.workspaceId, workflowId: workflowId.value, novelId: props.novelId, input,
      ...(Object.keys(stepModelRefs.value).length ? { stepModelRefs: { ...stepModelRefs.value } } : {}),
      expectedModelPreferenceFingerprint: modelPreferenceFingerprint.value,
      idempotencyKey: runs.newIdempotencyKey(),
    } };
    saveWorkflowStart(pending);
    pendingStart.value = pending;
    } else saveWorkflowStart(pendingStart.value);
  } catch {
    recoveryReady.value = false;
    recoveryFailed.value = true;
    return;
  } finally {
    starting.value = false;
  }
  if (!pendingStart.value || !mounted) return;
  const pending = pendingStart.value;
  const { request } = pending;
  starting.value = true;
  startError.value = null;
  uncertainStart.value = false;
  try {
    const { run, statusUrl } = await runs.startRun(request);
    clearWorkflowStart(pending);
    pendingStart.value = null;
    if (!mounted || version !== selectionVersion || request.novelId !== props.novelId || request.workspaceId !== props.workspaceId || pending.chapterId !== props.chapter?.id) return;
    emit("run-started", { runId: run.id, statusUrl });
    await loadOutlinesAndHistory();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status >= 500 || [401, 403, 404, 408, 429].includes(e.status)) {
      uncertainStart.value = true;
      return;
    }
    try { clearWorkflowStart(pending); } catch { recoveryReady.value = false;recoveryFailed.value = true;return; }
    pendingStart.value = null;
    if (version !== selectionVersion) return;
    if (e instanceof ApiError && e.status === 409) {
      modelPreferenceFingerprint.value = null;
      startError.value = t("workflowModelPreferences.changed");
    } else startError.value = t("generation.startFailed");
  } finally {
    starting.value = false;
  }
}

async function prepareFailedRun(runId: string) {
  if (starting.value || preparingRetry.value || pendingStart.value || !props.chapter) return;
  const version = selectionVersion;
  const request = ++retrySetupRequest;
  const { workspaceId, novelId, chapter } = props;
  const current = () => mounted && version === selectionVersion && request === retrySetupRequest;
  preparingRetry.value = true;retryNotice.value = false;startError.value = null;
  try {
    const run = await runs.getRun(workspaceId, runId);
    if (!current()) return;
    const input = run.input as Record<string, unknown> | null;
    const strict = run.workflowKey === "chapter-creation-review";
    if (run.status !== "FAILED" || run.novelId !== novelId || !input || input.chapterNumber !== chapter.number || (strict && input.chapterId !== chapter.id) || !["chapter-generation-review", "chapter-creation-review"].includes(run.workflowKey)) throw new Error("Failed run does not target this chapter");
    const preview = await runs.previewModelPreferences(workspaceId, run.workflowId, novelId);
    if (!current()) return;
    modelPreferenceFingerprint.value = null;
    workflowId.value = run.workflowId;creationWorkflow.value = strict;
    await nextTick();
    if (!current()) return;
    const choices = { ...run.requestedModelPreferences?.stepModelRefs };
    const preferred = run.requestedModelPreferences?.preferredModelRef;
    if (preferred) for (const step of preview.steps) if (!Object.hasOwn(choices, step.stepKey)) choices[step.stepKey] = preferred;
    stepModelRefs.value = choices;
    styleNotes.value = typeof input.styleNotes === "string" ? input.styleNotes : "";
    targetWords.value = typeof input.targetWordCount === "number" ? String(input.targetWordCount) : "";
    modelPreferenceFingerprint.value = preview.fingerprint;
    await loadOutlinesAndHistory();
    if (current()) retryNotice.value = true;
  } catch { if (current()) startError.value = t("generation.reuseFailedError"); }
  finally { if (request === retrySetupRequest) preparingRetry.value = false; }
}

function runStatusLabel(status: string): string {
  const key: Record<string, string> = {
    PENDING: "run.pending",
    RUNNING: "run.running",
    AWAITING_APPROVAL: "run.awaitingApproval",
    SUCCEEDED: "run.succeeded",
    FAILED: "run.failed",
    CANCELLED: "run.cancelled",
  };
  return t(key[status] ?? "run.pending");
}

watch(
  [() => props.workspaceId, () => props.novelId, () => props.chapter?.id, () => props.chapter?.number, () => props.creationMode],
  () => {
    const version = ++selectionVersion;
    restoredHistorySelection = false;
    retrySetupRequest++;preparingRetry.value = false;retryNotice.value = false;
    workflowId.value = null;
    stepModelRefs.value = {};
    modelPreferenceFingerprint.value = null;
    templateMissing.value = false;
    outlines.value = [];
    outlineId.value = "";
    error.value = null;
    startError.value = null;
    history.value = [];
    void refresh(version).then(() => {
      if (version === selectionVersion) return loadOutlinesAndHistory();
    });
  },
  { immediate: true },
);
onUnmounted(() => { mounted = false;selectionVersion++;recoveryRequest++; });

defineExpose({ refresh: loadOutlinesAndHistory });
</script>

<template>
  <section aria-label="Generation" class="flex flex-col gap-4">
    <h2
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("generation.title") }}
    </h2>

    <div v-if="recoveryFailed" role="alert" class="rounded-lg border border-nf-warn/40 px-3 py-2 text-[12.5px] text-nf-warn">
      <p>{{ t("generation.recoveryFailed") }}</p>
      <button type="button" class="mt-2 underline focus-visible:nf-focus" @click="restoreStart">{{ t("generation.recheckRecovery") }}</button>
    </div>

    <div v-if="uncertainStart" role="alert" class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn">
      <p>{{ t("generation.startUncertain") }}</p>
      <p v-if="pendingStart" class="mt-1">{{ t("generation.previousChapter") }} {{ pendingStart.request.input.chapterNumber }} · {{ pendingStart.chapterTitle }}</p>
      <button data-testid="retry-workflow-start" :disabled="starting || !recoveryReady" class="mt-2 rounded-md border border-nf-border-strong px-3 py-1.5 hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="startRun">{{ t("generation.retryStart") }}</button>
    </div>

    <p v-if="loading" role="status" class="text-[13px] text-nf-text-faint">
      {{ t("common.loading") }}
    </p>
    <p v-else-if="error" role="alert" class="text-[13px] text-nf-warn">{{ error }}</p>

    <template v-else>
      <p v-if="templateMissing" role="alert" class="text-[13px] text-nf-warn">
        {{ t("generation.noTemplate") }}
      </p>

      <template v-else-if="chapter">
        <div
          v-if="parkedRun"
          role="alert"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-nf-warn"
        >
          {{ t("generation.parkedWarning") }}
          <button
            class="mt-1 block underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
            @click="emit('run-selected', parkedRun!.id)"
          >
            {{ t("generation.viewParkedRun") }}
          </button>
        </div>

        <div class="flex flex-col gap-2.5">
          <label class="flex flex-col gap-1 text-[12.5px]">
            <span class="font-medium text-nf-text-dim">{{ t("generation.outlineLabel") }}</span>
            <!-- Author decision 2026-10-05 (review F2): runs start only from
                 the APPROVED outline version — no version picker. At most one
                 APPROVED version exists per novel (backend invariant). -->
            <span
              v-if="approvedOutline"
              class="rounded-lg border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text"
            >v{{ approvedOutline.number }} — {{ approvedOutline.status }}{{ approvedOutline.note ? ` · ${approvedOutline.note}` : "" }}</span>
            <span
              v-else
              class="rounded-lg border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text-dim"
            >{{ t("generation.outlineNone") }}</span>
          </label>

          <label class="flex flex-col gap-1 text-[12.5px]">
            <span class="font-medium text-nf-text-dim">{{ t("generation.targetWords") }}</span>
            <input
              v-model="targetWords"
              :disabled="starting || preparingRetry || !!pendingStart"
              type="number"
              min="1"
              class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>

          <label class="flex flex-col gap-1 text-[12.5px]">
            <span class="font-medium text-nf-text-dim">{{ t("generation.styleNotes") }}</span>
            <textarea
              v-model="styleNotes"
              :disabled="starting || preparingRetry || !!pendingStart"
              rows="2"
              :placeholder="t('generation.styleNotesPlaceholder')"
              class="resize-none rounded-lg border border-nf-border-strong bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>

          <WorkflowRunModelPreferences v-if="workflowId" v-model="stepModelRefs" :workspace-id="workspaceId" :workflow-id="workflowId" :novel-id="novelId"
            :disabled="starting || preparingRetry || !!pendingStart" @fingerprint="value => { modelPreferenceFingerprint = value; if (value) startError = null; }" />
          <button
            :disabled="starting || preparingRetry || !recoveryReady || !!pendingStart || !outlineId || !modelPreferenceFingerprint"
            class="rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            @click="startRun"
          >
            {{ starting ? t("generation.starting") : t("generation.startRun") }}
          </button>
          <p v-if="startError" role="alert" class="text-[12.5px] text-nf-warn">
            {{ startError }}
          </p>
          <p v-if="retryNotice" role="status" class="text-[12.5px] text-nf-text-dim">{{ t('generation.reuseReady') }}</p>
        </div>

        <div>
          <h3
            class="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
          >
            {{ t("generation.runHistory") }}
          </h3>
          <p v-if="!chapterHistory.length" class="text-[12.5px] text-nf-text-faint">
            {{ t("generation.noRuns") }}
          </p>
          <ul v-else class="flex flex-col gap-1">
            <li v-for="r in chapterHistory" :key="r.id">
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
                @click="emit('run-selected', r.id)"
              >
                <span class="truncate font-mono text-[11.5px]">{{ r.id.slice(0, 8) }}</span>
                <span class="ml-auto shrink-0">{{ runStatusLabel(r.status) }}</span>
              </button>
              <button v-if="r.status === 'FAILED'" type="button" :data-retry-run="r.id" :disabled="starting || preparingRetry || !!pendingStart" :aria-label="`${t('generation.reuseFailed')} · ${r.id.slice(0, 8)}`"
                class="ml-2 rounded-md border border-nf-border-strong px-2 py-1 text-[11.5px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="prepareFailedRun(r.id)">{{ t('generation.reuseFailed') }}</button>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </section>
</template>
