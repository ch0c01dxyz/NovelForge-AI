<script setup lang="ts">
import BrandLogo from "../../../../../components/ui/BrandLogo.vue";
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
import { nextTick, shallowRef } from "vue";
import ActionMenu from "../../../../../components/ui/ActionMenu.vue";
const chapterNavigationOpen = ref(false);
const generationRailOpen = ref(false);
import { useChapterGeneration } from "../../../../../composables/useChapterGeneration";
import { useWorkflowRuns, type RunView } from "../../../../../composables/useWorkflowRuns";
import { useLocale } from "../../../../../composables/useLocale";
import { ApiError } from "../../../../../composables/useApi";
import { useSelectionAi } from "../../../../../composables/useSelectionAi";
import type { Editor } from "@tiptap/core";
import {
  SELECTION_AI_OPERATIONS,
  SELECTION_MAX_CHARS,
  type SelectionAiOperationKey,
} from "../../../../../utils/selectionAiOperations";
import {
  captureSelection,
  applySuggestion,
} from "../../../../../utils/selectionResolve";
import { countWords as countWordsStripped, stripHtmlTags } from "../../../../../utils/htmlText";
import { locateReviewQuote, type ReviewTextTarget } from "../../../../../utils/reviewText";
import FinalTextReviewPanel, { type FinalTextReviewResult } from "../../../../../components/workspace/FinalTextReviewPanel.vue";
// GAP-120: runtime component imports. Nuxt registers components/ subdirectory
// files with directory-prefixed names (GenerationApprovalDialog,
// EditorRichEditor, …), so bare template names here need explicit imports.
// Type-only imports are erased at runtime and do not register a component.
import ApprovalDialog from "../../../../../components/generation/ApprovalDialog.vue";
import ChapterCreateDialog from "../../../../../components/workspace/ChapterCreateDialog.vue";
import { useAiChapterCreation, type AiChapterSetup } from "../../../../../composables/useAiChapterCreation";
import { draftTitle } from "../../../../../utils/draftSelect";
import ChapterActions from "../../../../../components/workspace/ChapterActions.vue";
import GenerationPanel from "../../../../../components/generation/GenerationPanel.vue";
import RunStatusPanel from "../../../../../components/generation/RunStatusPanel.vue";
import OutlineMovedNotice from "../../../../../components/generation/OutlineMovedNotice.vue";
import DraftDiffView from "../../../../../components/generation/DraftDiffView.vue";
import FindingsPanel from "../../../../../components/generation/FindingsPanel.vue";
import ProposalsPanel from "../../../../../components/generation/ProposalsPanel.vue";
import ApplyBar from "../../../../../components/generation/ApplyBar.vue";
import NewCharactersPanel from "../../../../../components/generation/NewCharactersPanel.vue";
import StorySuggestionsPanel from "../../../../../components/generation/StorySuggestionsPanel.vue";
import RichEditor from "../../../../../components/editor/RichEditor.vue";
import EditorToolbar from "../../../../../components/editor/EditorToolbar.vue";
import SceneNav from "../../../../../components/editor/SceneNav.vue";
import ConflictBanner from "../../../../../components/editor/ConflictBanner.vue";
import SelectionAiMenu from "../../../../../components/editor/SelectionAiMenu.vue";
import AiSuggestionCard from "../../../../../components/editor/AiSuggestionCard.vue";
// ---------- NF-WF-018A: AI Studio ----------
import { useAiStudio, type WorkspaceRole } from "../../../../../composables/useAiStudio";
import { usePlatformAdmin } from "../../../../../composables/usePlatformAdmin";
// ---------- NF-WF-017 import dialog ----------
import ImportDialog from "../../../../../components/import-export/ImportDialog.vue";
import ExportPicker from "../../../../../components/import-export/ExportPicker.vue";
// ---------- NF-WF-016 workspace panels ----------
import WorkspaceDrawer from "../../../../../components/workspace/WorkspaceDrawer.vue";
import NovelDiscoveryEditor from "../../../../../components/workspace/NovelDiscoveryEditor.vue";
import NovelCoverEditor from "../../../../../components/workspace/NovelCoverEditor.vue";
import CharacterPanel from "../../../../../components/workspace/CharacterPanel.vue";
import RelationshipPanel from "../../../../../components/workspace/RelationshipPanel.vue";
import WorldPanel from "../../../../../components/workspace/WorldPanel.vue";
import CanonReviewPanel from "../../../../../components/workspace/CanonReviewPanel.vue";
import TimelinePanel from "../../../../../components/workspace/TimelinePanel.vue";
import PlanningPanel from "../../../../../components/workspace/PlanningPanel.vue";
import ResearchPanel from "../../../../../components/workspace/ResearchPanel.vue";
import NarrativePanel from "../../../../../components/workspace/NarrativePanel.vue";
import NovelModelDefaultsPanel from "../../../../../components/generation/NovelModelDefaultsPanel.vue";
import HealthMemoryPanel from "../../../../../components/workspace/HealthMemoryPanel.vue";

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
interface SceneSummary {
  id: string;
  number: number;
  title: string;
  summary: string | null;
}

const route = useRoute();
const { api } = useApi();
const { t, locale, setLocale } = useLocale();
const gen = useChapterGeneration();
const runs = useWorkflowRuns();
const aiStudio = useAiStudio();

// ---------- NF-WF-018A: AI Studio nav ----------
// The member role gates the AI Studio header link (VIEWER sees nothing);
// the studio page re-gates per tab. The server enforces every capability.
const studioRole = ref<WorkspaceRole | null>(null);
const showStudioLink = computed(
  () => studioRole.value !== null && studioRole.value !== "VIEWER",
);

// ---------- NF-WF-018B: platform admin nav ----------
// The platform role gates the admin header link; the admin page and every
// platform route enforce SUPER_ADMIN server-side. Hidden for everyone
// else (progressive enhancement only).
const platformAdmin = usePlatformAdmin();
const platformRole = ref<"SUPER_ADMIN" | null>(null);
const showAdminLink = computed(() => platformRole.value === "SUPER_ADMIN");

// ---------- NF-WF-019B: comment moderation nav ----------
// Staff = workspace members holding the existing `novel:update`
// capability (Klein's Q2 decision 2026-10-06: no platform moderation
// team). The link is role-gated (progressive enhancement only); the
// moderation page and every moderation route enforce membership +
// `novel:update` server-side.
const showModerationLink = computed(
  () =>
    studioRole.value !== null &&
    ["OWNER", "ADMIN", "AUTHOR", "EDITOR"].includes(studioRole.value),
);

const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const novelId = computed(() => String(route.params.novelId ?? ""));
const base = computed(() => `/workspaces/${workspaceId.value}/novels/${novelId.value}`);

const chapters = ref<ChapterSummary[]>([]);
const chapterSort = ref<"oldest" | "newest">("oldest");
const sortedChapters = computed(() =>
  [...chapters.value].sort((a, b) =>
    chapterSort.value === "newest" ? b.number - a.number : a.number - b.number,
  ),
);
const activeId = ref<string | null>(null);
const aiCreation = useAiChapterCreation();
const aiCreationChapterId = ref<string | null>(null);
const reviewedAiTitle = computed(() => gen.selectedRun.value?.workflowKey === "chapter-creation-review" ? draftTitle(gen.review.value?.draft.draft ?? null) : undefined);
const chapterSelecting = ref(false);
const content = ref("");
const version = ref<number | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const reviewAction = ref<"save" | "publish" | "draft" | null>(null);
const reviewNotice = ref<string | null>(null);
const finalReview = ref<{ chapterId: string; version: number | null; text: string; result: FinalTextReviewResult } | null>(null);
const reviewHighlight = ref<{ from: number; to: number } | null>(null);
const reviewNavigationError = ref<string | null>(null);
const finalReviewStale = computed(() => !!finalReview.value && (finalReview.value.chapterId !== activeId.value || finalReview.value.version !== version.value || finalReview.value.text !== content.value || saveState.value !== "saved"));
watch([content, version, activeId], () => { reviewHighlight.value = null;reviewNavigationError.value = null;reviewNotice.value = null; });
const saveState = ref<"saved" | "dirty" | "saving" | "conflict">("saved");

const activeChapter = computed(
  () => chapters.value.find((c) => c.id === activeId.value) ?? null,
);
// NF-WF-015: the footer count uses the server strip rule — tags are not
// words (`<p>a</p><p>b</p>` → 2).
const wordCount = computed(() => countWordsStripped(content.value));

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

// ---------- NF-WF-015 rich editor state ----------
/** The live Tiptap editor instance (set on RichEditor's editor-ready).
 * shallowRef: the editor is a stateful class instance — it must not be
 * made deeply reactive. */
const editorRef = shallowRef<Editor | null>(null);
/**
 * Invariant 5: the conflict the banner is showing — the fresh server
 * version + content the author's save collided with. Null when resolved.
 * Autosave pauses while this is non-null.
 */
const conflictServer = ref<{ version: number | null; content: string } | null>(null);
const comparing = ref(false);
/** Transient author-facing notice (selection AI / stale selection). */
const aiNotice = ref<string | null>(null);
/** Scene anchors per chapter id (Invariant 6). */
const scenesByChapter = ref<Record<string, SceneSummary[]>>({});
const activeSceneId = ref<string | null>(null);
/** Viewport anchor for the suggestion card (below the selection). */
const suggestionAnchor = ref<{ top: number; left: number } | null>(null);
const selAi = useSelectionAi();

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
    !gen.review.value.blocked &&
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
  const selected = selectSeq;
  const chapterId = activeId.value;
  const target = base.value;
  const current = () => !disposed && selected === selectSeq && chapterId === activeId.value && target === base.value && run.id === reviewRunId.value;
  // Pin the diff against the chapter's server version at review time.
  // NF-WF-015: the diff view is text-only — strip HTML from the base.
  try {
    const detail = await api<ChapterDetail>(`${target}/chapters/${chapterId}`);
    if (!current()) return;
    gen.diffPinnedVersion.value = detail.currentVersion;
    diffBaseText.value = stripHtmlTags(detail.content);
  } catch {
    if (!current()) return;
    gen.diffPinnedVersion.value = version.value;
    diffBaseText.value = stripHtmlTags(content.value);
  }
  if (!current()) return;
  decideState.value = { kind: "ok" };
  await gen.loadReview(workspaceId.value, novelId.value, run);
}

const diffBaseText = ref("");

function onRunSelected(runId: string) {
  if (reviewRunId.value === runId) { runPanel.value?.reload(); return; }
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

async function configureFailedRun(runId: string) {
  generationRailOpen.value = true;
  await generationPanel.value?.prepareFailedRun(runId);
  await nextTick();
  document.getElementById("writer-generation")?.scrollTo({ top: 0, behavior: "smooth" });
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

async function onApplied(newVersion: number, appliedTitle?: string) {
  version.value = newVersion;
  const chapter = activeChapter.value;
  if (chapter) {
    chapter.currentVersion = newVersion;
    if (appliedTitle !== undefined) chapter.title = appliedTitle;
    else if (reviewedAiTitle.value) chapter.title = reviewedAiTitle.value;
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
  diffBaseText.value = stripHtmlTags(detail.content);
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
  reviewNotice.value = null;
  reviewHighlight.value = null;finalReview.value = null;reviewNavigationError.value = null;
  if (saveState.value === "dirty" && !saveInFlight) await saveNow();
  if (saveInFlight || saveState.value !== "saved") {
    error.value = t("recovery.saveBeforeLeaving");
    return;
  }
  // Switching chapters resets the generation review context.
  reviewRunId.value = null;
  reviewStatusUrl.value = null;
  gen.selectedRun.value = null;
  gen.clearReview();
  decideState.value = { kind: "ok" };
  // NF-WF-015: chapter switch clears editor-scoped state too.
  conflictServer.value = null;
  comparing.value = false;
  activeSceneId.value = null;
  aiNotice.value = null;
  selAi.reset();
  suggestionAnchor.value = null;
  const seq = ++selectSeq;
  const target = base.value;
  chapterSelecting.value = true;
  try {
  const detail = await api<ChapterDetail>(`${target}/chapters/${id}`);
  // A newer selection won the race — drop this stale response.
  if (seq !== selectSeq || disposed || target !== base.value) return false;
  activeId.value = id;
  content.value = detail.content;
  version.value = detail.currentVersion;
  saveState.value = "saved";
  error.value = null;
  // NF-WF-015: load scene anchors for the active chapter + its
  // neighbours (the SceneNav lists adjacent chapters' scenes).
  await loadScenesFor([id, ...adjacentChapterIds(id)]);
  return true;
  } catch {
    if (seq === selectSeq && !disposed) error.value = t("errors.loadFailed");
    return false;
  } finally {
    if (seq === selectSeq) chapterSelecting.value = false;
  }
}

/** Chapter ids adjacent by number (for the scene navigator). */
function adjacentChapterIds(id: string): string[] {
  const sorted = [...chapters.value].sort((a, b) => a.number - b.number);
  const idx = sorted.findIndex((c) => c.id === id);
  return [sorted[idx - 1]?.id, sorted[idx + 1]?.id].filter(
    (x): x is string => !!x,
  );
}

async function loadScenesFor(chapterIds: string[]) {
  const entries = await Promise.all(
    chapterIds.map(async (chapterId): Promise<[string, SceneSummary[]]> => {
      try {
        const scenes = await api<SceneSummary[]>(
          `${base.value}/chapters/${chapterId}/scenes`,
        );
        return [chapterId, scenes];
      } catch {
        return [chapterId, []];
      }
    }),
  );
  for (const [chapterId, scenes] of entries) {
    scenesByChapter.value[chapterId] = scenes;
  }
}

const chapterCreateOpen = ref(false);
const chapterCreating = ref(false);
const chapterCreateError = ref<string | null>(null);
const chapterCreateUncertain = ref(false);
const chapterCreateOpener = ref<HTMLElement | null>(null);
const confirmedCreatedChapterId = ref<string | null>(null);
async function prepareChapterMutation() {
  if (chapterSelecting.value) return false;
  if (saveCompletion) await saveCompletion;
  if (saveState.value === "dirty") await saveNow();
  if (disposed || saveInFlight || saveState.value !== "saved") { error.value = t("recovery.saveBeforeLeaving"); return false; }
  return true;
}
function onChapterRenamed(result: { id: string; title: string; currentVersion: number | null }) {
  const chapter = chapters.value.find(c => c.id === result.id);
  if (chapter) { chapter.title = result.title; chapter.currentVersion = result.currentVersion; }
  if (activeId.value === result.id) {
    version.value = result.currentVersion;
    finalReview.value = null; reviewNotice.value = null; reviewHighlight.value = null;
    gen.clearReview();
  }
}
async function onChapterDeleted(id: string) {
  const index = sortedChapters.value.findIndex(c => c.id === id);
  const adjacent = sortedChapters.value[index + 1] ?? sortedChapters.value[index - 1];
  chapters.value = chapters.value.filter(c => c.id !== id);
  try {
    if (activeId.value === id) {
      if (adjacent) await selectChapter(adjacent.id);
      else {
        activeId.value = null; content.value = ""; version.value = null; saveState.value = "saved";
        finalReview.value = null; reviewNotice.value = null; reviewHighlight.value = null; gen.clearReview();
      }
    }
    await loadChapters();
  } catch { error.value = t("chapterActions.refreshFailed"); }
  await nextTick();
  if (!disposed) (document.querySelector('#writer-chapters [aria-current="true"]') as HTMLElement | null
    ?? document.querySelector<HTMLElement>('#writer-chapters [data-testid="chapter-list"]'))?.focus();
}
async function openChapterCreate(event: Event) {
  const opener = event.currentTarget as HTMLElement | null;
  if (chapterCreating.value || chapterSelecting.value) return;
  if (saveCompletion) await saveCompletion;
  if (saveState.value === "dirty") await saveNow();
  if (disposed || saveState.value !== "saved") { error.value = t("recovery.saveBeforeLeaving"); return; }
  try { await aiCreation.restore(); } catch { error.value = t("generation.recoveryFailed");return; }
  if (chapterCreateUncertain.value || confirmedCreatedChapterId.value) {
    try { await loadChapters(); } catch { error.value = t("errors.createChapterFailed"); return; }
  }
  chapterCreateOpener.value = opener;
  chapterCreateError.value = null;
  chapterCreateUncertain.value = false;
  confirmedCreatedChapterId.value = null;
  chapterCreateOpen.value = true;
}
async function closeChapterCreate() {
  if (chapterCreating.value) return;
  chapterCreateOpen.value = false;
  await nextTick(); chapterCreateOpener.value?.focus();
}
async function createChapter({ title }: { title: string }) {
  if (chapterCreating.value || chapterSelecting.value || chapterCreateUncertain.value || confirmedCreatedChapterId.value || !title.trim() || title.trim().length > 200) return;
  const target = base.value;
  chapterCreating.value = true;
  chapterCreateError.value = null;
  try {
    const { id } = await api<{ id: string; number: number }>(
      `${target}/chapters`,
      { method: "POST", body: JSON.stringify({ title: title.trim() }) },
    );
    if (disposed || target !== base.value) return;
    confirmedCreatedChapterId.value = id;
    chapterCreateOpen.value = false;
    try {
      await loadChapters();
      if (activeId.value !== id && !await selectChapter(id)) error.value = t("chapterCreation.refreshFailed");
    } catch { error.value = t("chapterCreation.refreshFailed"); }
    await nextTick(); chapterCreateOpener.value?.focus();
  } catch (e) {
    if (disposed || target !== base.value) return;
    chapterCreateUncertain.value = !(e instanceof ApiError) || e.status >= 500;
    chapterCreateError.value = t(chapterCreateUncertain.value ? "chapterCreation.uncertain" : "errors.createChapterFailed");
  } finally {
    chapterCreating.value = false;
  }
}

async function createAiChapter(setup?: AiChapterSetup) {
  if (chapterCreating.value || chapterSelecting.value || saveState.value !== "saved") return;
  const target = base.value;
  const wid = workspaceId.value;
  const nid = novelId.value;
  chapterCreating.value = true;
  chapterCreateError.value = null;
  try {
    const result = await aiCreation.start(wid, nid, t("chapterCreation.pendingTitle"), setup, async id => {
      if (disposed || target !== base.value) throw new Error("Chapter scope changed");
      aiCreationChapterId.value = id;
      await loadChapters();
      if (disposed || target !== base.value || !await selectChapter(id)) throw new Error("Reserved chapter could not be opened");
    }, () => !disposed && target === base.value);
    if (disposed || target !== base.value) return;
    chapterCreateOpen.value = false;
    generationRailOpen.value = true;
    await onRunStarted({ runId: result.run.id, statusUrl: result.statusUrl });
  } catch {
    if (disposed || target !== base.value) return;
    chapterCreateError.value = t(aiCreation.pending.value ? "chapterCreation.resumeHint" : "chapterCreation.startFailed");
    if (!aiCreation.pending.value && aiCreationChapterId.value) {
      chapterCreateOpen.value = false;
      generationRailOpen.value = true;
      error.value = t("chapterCreation.startFailed");
    }
  } finally { chapterCreating.value = false; }
}

async function resolveAiReservation() {
  if (chapterCreating.value || saveState.value !== "saved") return;
  const target = base.value;
  chapterCreating.value = true;
  try {
    const chapter = await aiCreation.resolveReservation(workspaceId.value, novelId.value);
    if (disposed || target !== base.value) return;
    chapterCreateOpen.value = false;
    await loadChapters();
    if (chapter) await selectChapter(chapter.id);
    reviewNotice.value = t(chapter ? "chapterCreation.resolvedExisting" : "chapterCreation.resolvedDeleted");
  } catch { if (!disposed && target === base.value) chapterCreateError.value = t("chapterCreation.receiptFailed"); }
  finally { chapterCreating.value = false; }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let saveInFlight = false;
let saveCompletion: Promise<void> | null = null;
// Monotonic token: only the newest selectChapter response may write state.
let selectSeq = 0;
let disposed = false;
onUnmounted(() => { disposed = true; clearTimeout(timer); });
onBeforeRouteLeave(() => {
  if (!chapterCreating.value && !chapterSelecting.value && !saveInFlight && saveState.value === "saved") return true;
  error.value = t("recovery.saveBeforeLeaving");
  return false;
});

function onInput() {
  if (chapterSelecting.value) {
    // A late edit still belongs to the old buffer: cancel the pending selection.
    selectSeq += 1;
    chapterSelecting.value = false;
  }
  reviewNotice.value = null;
  reviewHighlight.value = null;reviewNavigationError.value = null;
  // NF-WF-015: autosave pauses while a version conflict is unresolved —
  // only the banner's explicit actions proceed.
  if (saveState.value === "conflict") return;
  saveState.value = "dirty";
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), 1500); // 1.5s debounce
}

/** RichEditor → page: user typed; the editor owns the HTML string. */
function onEditorInput(html: string) {
  content.value = html;
  onInput();
}

function onEditorBlur() {
  if (saveState.value === "dirty") void saveNow();
}

async function saveNow() {
  if (chapterSelecting.value) return;
  const chapter = activeChapter.value;
  if (!chapter || saveInFlight || saveState.value === "conflict") return;
  const savingId = chapter.id;
  const savingContent = content.value;
  let newerEdits = false;
  saveInFlight = true;
  let finishSave!: () => void;
  const completion = new Promise<void>(resolve => { finishSave = resolve; });
  saveCompletion = completion;
  clearTimeout(timer);
  saveState.value = "saving";
  try {
    const result = await api<{ version: number; wordCount: number }>(
      `${base.value}/chapters/${chapter.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: savingContent,
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
      newerEdits = content.value !== savingContent;
      saveState.value = newerEdits ? "dirty" : "saved";
      error.value = null;
    }
  } catch (e) {
    if (activeId.value !== savingId) return; // stale save, chapter moved on
    if (e instanceof ApiError && e.status === 409) {
      // NF-WF-015 (Invariant 5, F3): the 409 envelope is identical for a
      // version conflict and a published-immutable chapter, so
      // disambiguate by refetching chapter status. PUBLISHED → the
      // existing unpublish-first message (no banner, no keep-mine);
      // otherwise the conflict banner (never a silent refetch — 007's
      // page dropped the author's unsaved text here).
      try {
        const detail = await api<ChapterDetail>(`${base.value}/chapters/${savingId}`);
        if (detail.status === "PUBLISHED") {
          version.value = detail.currentVersion;
          error.value = t("chapters.blockedPublished");
          saveState.value = "dirty"; // keep the author's text; retry on next edit
        } else {
          conflictServer.value = {
            version: detail.currentVersion,
            content: detail.content,
          };
          saveState.value = "conflict";
        }
      } catch {
        saveState.value = "dirty";
        error.value = t("errors.saveFailed");
      }
    } else {
      saveState.value = "dirty"; // keep the text; retry on next edit
      error.value = t("errors.saveFailed");
    }
  } finally {
    saveInFlight = false;
    finishSave();
    if (saveCompletion === completion) saveCompletion = null;
    if (newerEdits && activeId.value === savingId) {
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 1500);
    }
  }
}

// ---------- NF-WF-015 conflict resolution (explicit actions) ----------
async function resolveKeepMine() {
  if (!activeId.value || !conflictServer.value) return;
  // Re-PUT the local HTML with the fresh server version as
  // expectedVersion (overwrites; same `chapter:update` capability).
  version.value = conflictServer.value.version;
  conflictServer.value = null;
  comparing.value = false;
  saveState.value = "dirty";
  await saveNow();
}

async function resolveLoadTheirs() {
  conflictServer.value = null;
  comparing.value = false;
  if (activeId.value) await selectChapter(activeId.value);
}

function resolveCompare() {
  comparing.value = true;
}

// ---------- NF-WF-015 selection AI ----------
function onEditorReady(ed: Editor) {
  editorRef.value = ed;
}

function runSelectionOperation(op: SelectionAiOperationKey, freePrompt?: string) {
  if (chapterSelecting.value) return;
  if (op === "polish-language" && activeChapter.value?.status === "PUBLISHED") { aiNotice.value = t("apply.blockedPublished");return; }
  if (op === "polish-language" && saveState.value === "conflict") { aiNotice.value = t("aiAssist.polishStale");return; }
  if (op === "polish-language" && reviewAction.value) return;
  const ed = editorRef.value;
  if (!ed) return;
  const sel = captureSelection(ed, op === "polish-language");
  if (!sel) {
    // Toolbar "Rewrite tone" with a collapsed selection: prompt to select.
    aiNotice.value = t(op === "polish-language" ? "aiAssist.polishSelectParagraph" : "editor.selectTextFirst");
    return;
  }
  if (op === "polish-language" && sel.text.length > SELECTION_MAX_CHARS) { aiNotice.value = t("aiAssist.selectionTooLong");return; }
  aiNotice.value = null;
  try {
    // Anchor the suggestion card below the selection.
    const coords = ed.view.coordsAtPos(sel.to);
    suggestionAnchor.value = {
      top: coords.bottom + 8,
      left: Math.max(8, coords.left - 160),
    };
  } catch {
    suggestionAnchor.value = null;
  }
  void selAi.run({
    workspaceId: workspaceId.value,
    novelId: novelId.value,
    chapterId: activeChapter.value?.id,
    editor: ed,
    operation: op,
    freePrompt,
  });
}

function closeSuggestion(refocusEditor: boolean) {
  selAi.reset();
  suggestionAnchor.value = null;
  if (refocusEditor) editorRef.value?.commands.focus();
}

function onSuggestionAccept() {
  const ed = editorRef.value;
  const captured = selAi.captured.value;
  const suggestion = selAi.result.value;
  if (!ed || !captured || !suggestion) return;
  // Stale-selection pin: the editor re-resolves the captured text in the
  // CURRENT document; a miss falls back to insert-after with a notice.
  const polish = selAi.activeRequest.value?.operation === "polish-language";
  if (polish && suggestion.trim() === captured.text.trim()) { closeSuggestion(true);return; }
  if (polish && (!ed.isEditable || chapterSelecting.value || activeChapter.value?.status === "PUBLISHED" || reviewAction.value || saveState.value === "conflict" || selAi.streaming.value || selAi.errorKey.value)) return;
  const outcome = applySuggestion(ed, captured, suggestion, polish);
  if (outcome === "stale") { aiNotice.value = t("aiAssist.polishStale");closeSuggestion(false);return; }
  if (outcome === "inserted-after") aiNotice.value = t("aiAssist.staleSelection");
  closeSuggestion(false);
  // applySuggestion fires onUpdate → onEditorInput → dirty + autosave.
}

function onSuggestionInsert() {
  const ed = editorRef.value;
  const suggestion = selAi.result.value;
  if (!ed || !suggestion) return;
  // Q6: "Continue scene" lands after the selection — insert at the cursor.
  ed.chain().focus().insertContentAt(ed.state.selection.head, suggestion).run();
  closeSuggestion(false);
}

// ---------- NF-WF-015 scene CRUD (page prompts, route calls) ----------
async function onSelectScene(payload: { chapterId: string; sceneId: string }) {
  if (payload.chapterId !== activeId.value) {
    await selectChapter(payload.chapterId);
  }
  activeSceneId.value = payload.sceneId;
}

async function onAddScene(payload: { chapterId: string }) {
  const title = globalThis.prompt(t("scenes.sceneTitlePrompt"));
  if (!title?.trim()) return;
  try {
    await api(`${base.value}/chapters/${payload.chapterId}/scenes`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim() }),
    });
    await loadScenesFor([payload.chapterId]);
  } catch {
    error.value = t("scenes.createFailed");
  }
}

async function onRenameScene(payload: { chapterId: string; sceneId: string }) {
  const scenes = scenesByChapter.value[payload.chapterId] ?? [];
  const current = scenes.find((s) => s.id === payload.sceneId)?.title ?? "";
  const title = globalThis.prompt(t("scenes.sceneTitlePrompt"), current);
  if (title === null || !title.trim() || title.trim() === current) return;
  try {
    await api(`${base.value}/chapters/${payload.chapterId}/scenes/${payload.sceneId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: title.trim() }),
    });
    await loadScenesFor([payload.chapterId]);
  } catch {
    error.value = t("scenes.updateFailed");
  }
}

async function onDeleteScene(payload: { chapterId: string; sceneId: string }) {
  if (!globalThis.confirm(t("scenes.deleteConfirm"))) return;
  try {
    await api(`${base.value}/chapters/${payload.chapterId}/scenes/${payload.sceneId}`, {
      method: "DELETE",
    });
    if (activeSceneId.value === payload.sceneId) activeSceneId.value = null;
    await loadScenesFor([payload.chapterId]);
  } catch {
    // NF-WF-034 (GAP-055): the route no longer emits 409 for linked beats
    // (cascade) — any failure falls through to the generic message.
    error.value = t("scenes.deleteFailed");
  }
}

async function onMoveScene(payload: {
  chapterId: string;
  sceneId: string;
  direction: "up" | "down";
}) {
  const scenes = [...(scenesByChapter.value[payload.chapterId] ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  const idx = scenes.findIndex((s) => s.id === payload.sceneId);
  if (idx < 0) return;
  const target = payload.direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= scenes.length) return;
  try {
    // `number` is the desired 1-based position; the service renumbers.
    await api(`${base.value}/chapters/${payload.chapterId}/scenes/${payload.sceneId}`, {
      method: "PATCH",
      body: JSON.stringify({ number: target + 1 }),
    });
    await loadScenesFor([payload.chapterId]);
  } catch {
    error.value = t("scenes.updateFailed");
  }
}

// ---------- NF-WF-016 authoring workspace ----------
// One drawer hosts the nine domain panels (Invariant 1). The story-structure
// nav (design mockup :655-663, extended per Invariant 7a) opens them; the
// header outline button opens planning. No AI calls here — the panels are
// deterministic authoring UI over the frozen routes.
type WorkspacePanelKey =
  | "cover"
  | "discovery"
  | "characters"
  | "relationships"
  | "world"
  | "timeline"
  | "canon"
  | "research"
  | "planning"
  | "narrative"
  | "models"
  | "health";

const workspacePanel = ref<WorkspacePanelKey | null>(null);
// ---------- NF-WF-017A: import dialog ----------
const importDialogOpen = ref(false);
// NF-WF-017B: export picker dialog state.
const exportPickerOpen = ref(false);
async function onImported() {
  await loadChapters();
}

const workspaceNavItems: { key: WorkspacePanelKey; labelKey: string }[] = [
  { key: "discovery", labelKey: "workspace.nav.discovery" },
  { key: "cover", labelKey: "workspace.nav.cover" },
  { key: "characters", labelKey: "workspace.nav.characters" },
  { key: "relationships", labelKey: "workspace.nav.relationships" },
  { key: "world", labelKey: "workspace.nav.world" },
  { key: "timeline", labelKey: "workspace.nav.timeline" },
  { key: "canon", labelKey: "workspace.nav.canon" },
  { key: "research", labelKey: "workspace.nav.research" },
  { key: "planning", labelKey: "workspace.nav.planning" },
  { key: "narrative", labelKey: "workspace.nav.narrative" },
  { key: "models", labelKey: "workspace.nav.models" },
  { key: "health", labelKey: "workspace.nav.health" },
];

const workspacePanelTitle = computed(() =>
  workspacePanel.value ? t(`workspace.nav.${workspacePanel.value}`) : "",
);

/** Continuity-guardian state: the footer's "Canon in sync" binding. */
const healthFindingCount = ref<number | null>(null);

async function loadHealth() {
  try {
    const res = await api<{ findings: { severity: string }[] }>(
      `${base.value}/story-health`,
    );
    healthFindingCount.value = res.findings.length;
  } catch {
    // Health is advisory, never blocking: a failed check shows "unknown",
    // never a false "in sync".
    healthFindingCount.value = null;
  }
}

const healthLabel = computed(() => {
  if (healthFindingCount.value === null) return t("workspace.health.summary.unknown");
  if (healthFindingCount.value === 0) return t("workspace.health.summary.inSync");
  return t("workspace.health.summary.findings", { n: healthFindingCount.value });
});

function openWorkspacePanel(key: WorkspacePanelKey) {
  workspacePanel.value = key;
}

// NF-WF-016 follow-up: "Go to" from the unresolved-identity register.
// character → Characters panel focused on that character; entity → Canon
// panel; timelineEvent → Timeline panel. The machine must not decide the
// fix, only open the page where the author decides it.
function goToUnresolvedTarget(target: { kind: string; id: string; rule: string }) {
  const panelMap: Record<string, WorkspacePanelKey> = {
    character: "characters",
    entity: "canon",
    timelineEvent: "timeline",
  };
  const panel = panelMap[target.kind];
  if (!panel) return;
  openWorkspacePanel(panel);
  gotoEntityId.value = target.id;
}
const gotoEntityId = ref<string | null>(null);

function closeWorkspacePanel() {
  const wasHealth = workspacePanel.value === "health";
  workspacePanel.value = null;
  gotoEntityId.value = null;
  if (wasHealth) void loadHealth();
}

onMounted(async () => {
  // NF-WF-018A: best-effort role fetch for the AI Studio link; a failure
  // only hides the link (the studio page re-checks).
  aiStudio.getWorkspaceRole(workspaceId.value).then(
    (r) => (studioRole.value = r),
    () => (studioRole.value = null),
  );
  // NF-WF-018B: best-effort platform-role fetch for the admin link; a
  // failure only hides the link (the admin page re-checks).
  platformAdmin.getPlatformRole().then(
    (r) => (platformRole.value = r),
    () => (platformRole.value = null),
  );
  try {
    await loadChapters();
    void loadHealth();
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
  await saveAndReview(true);
}

async function returnToDraft() {
  if (chapterSelecting.value || !activeChapter.value || reviewAction.value) return;
  const chapter = activeChapter.value;
  const target = base.value;
  reviewAction.value = "draft";
  error.value = null;
  try {
    if (saveCompletion) await saveCompletion;
    if (saveState.value === "dirty") await saveNow();
    if (disposed || target !== base.value || activeId.value !== chapter.id) return;
    if (saveState.value !== "saved") { error.value = t("recovery.saveBeforeLeaving");return; }
    await api(`${target}/chapters/${chapter.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "DRAFT", expectedVersion: version.value }) });
    if (disposed || target !== base.value || activeId.value !== chapter.id) return;
    chapter.status = "DRAFT";
    reviewNotice.value = t("chapterDraft.saved");
  } catch (e) {
    if (!disposed && target === base.value && activeId.value === chapter.id) error.value = t(e instanceof ApiError && e.status === 409 ? "chapterDraft.stale" : "chapterDraft.failed");
  } finally { reviewAction.value = null; }
}

function showReviewText(target: ReviewTextTarget) {
  if (!finalReview.value || finalReviewStale.value || !editorRef.value) return;
  const range = locateReviewQuote(editorRef.value, finalReview.value.text, target.span, target.quote);
  if (!range) { reviewNavigationError.value = t("reviewIssues.unlocatable");return; }
  reviewNavigationError.value = null;
  reviewHighlight.value = range;
  generationRailOpen.value = false;
  editorRef.value.chain().focus().setTextSelection(range).scrollIntoView().run();
}

async function saveAndReview(publishAfter = false) {
  if (chapterSelecting.value) return;
  const chapter = activeChapter.value;
  if (!chapter || reviewAction.value) return;
  const selected = selectSeq;
  const novelBase = base.value;
  reviewAction.value = publishAfter ? "publish" : "save";
  reviewNotice.value = null;
  error.value = null;
  try {
    if (saveCompletion) await saveCompletion;
    if (saveState.value !== "saved") await saveNow();
    if (disposed || selected !== selectSeq || activeId.value !== chapter.id || base.value !== novelBase || saveState.value !== "saved") return;
    const savedText = content.value, savedVersion = version.value;
    const stillCurrent = () => !disposed && selected === selectSeq && activeId.value === chapter.id && base.value === novelBase && saveState.value === "saved" && content.value === savedText && version.value === savedVersion;
    const chapterBase = `${novelBase}/chapters/${chapter.id}`;
    const { context } = await api<{ context: { chapterVersion: { id: string; content: string }; currentVersionId: string | null } }>(`${chapterBase}/scale-review-context`);
    if (!stillCurrent()) return;
    if (!context.chapterVersion.id || context.chapterVersion.id !== context.currentVersionId || context.chapterVersion.content !== savedText) {
      error.value = t("errors.publishReviewStale");
      return;
    }
    // Native deterministic review creates the exact-version receipt; the
    // publication transaction still rechecks every live policy/head pin.
    const review = await api<FinalTextReviewResult>(`${chapterBase}/final-text-review`, {
      method: "POST",
      body: JSON.stringify({ chapterVersionId: context.chapterVersion.id }),
    });
    if (!stillCurrent()) return;
    if (review.chapterVersionId === context.chapterVersion.id && (review.verdict === "PASS" || review.verdict === "FAIL")) {
      finalReview.value = { chapterId: chapter.id, version: savedVersion, text: savedText, result: review };
      reviewHighlight.value = null;reviewNavigationError.value = null;
      if (review.verdict === "FAIL") generationRailOpen.value = true;
    }
    if (review.verdict !== "PASS" || review.chapterVersionId !== context.chapterVersion.id) {
      error.value = t(review.verdict === "FAIL" ? "errors.publishHardViolation" : "errors.publishReviewStale");
      return;
    }
    if (publishAfter) {
      await api(`${chapterBase}/publication/publish`, {
        method: "POST",
        body: JSON.stringify({ expectedChapterVersionId: context.chapterVersion.id }),
      });
      chapter.status = "PUBLISHED";
    } else {
      reviewNotice.value = t("common.savedAndReviewed");
    }
  } catch (e) {
    if (disposed || selected !== selectSeq || activeId.value !== chapter.id || base.value !== novelBase) return;
    if (e instanceof ApiError) {
      if (e.status === 403) {
        error.value = t("errors.publishForbidden");
        return;
      }
      if (e.code === "REVIEW_STALE") {
        error.value = t("errors.publishReviewStale");
        return;
      }
      if (e.code === "HARD_POLICY_VIOLATION") {
        error.value = t("errors.publishHardViolation");
        return;
      }
    }
    error.value = t("errors.publishFailed");
  } finally {
    reviewAction.value = null;
  }
}
</script>

<template>
  <div class="nf-writer-shell grid h-dvh grid-cols-1 grid-rows-[52px_minmax(0,1fr)_30px] bg-nf-bg-0 text-nf-text">
    <header
      class="nf-writer-header flex items-center gap-3.5 border-b border-nf-border bg-nf-bg-1 px-5 shadow-nf-sm"
    >
      <NuxtLink
        to="/author"
        class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight hover:opacity-80 focus-visible:nf-focus"
      >
        <BrandLogo compact />
      </NuxtLink>
      <span class="hidden min-w-0 flex-1 truncate border-l border-nf-border pl-4 text-[13px] text-nf-text-dim md:block">{{ activeChapter?.title }}</span>
      <div class="flex-1 md:hidden" />
      <button class="nf-chapters-toggle rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px]" :aria-expanded="chapterNavigationOpen" aria-controls="writer-chapters" @click="chapterNavigationOpen = !chapterNavigationOpen">{{ t("chapters.title") }}</button>
      <ActionMenu class="nf-mobile-story-menu" data-testid="mobile-story-menu" :label="t('workspace.nav.menu')">
        <template #trigger>
          <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          <span>{{ t("workspace.nav.menu") }}</span>
        </template>
        <button v-for="item in workspaceNavItems" :key="item.key" type="button" :data-story-panel="item.key"
          :aria-pressed="workspacePanel === item.key" @click="openWorkspacePanel(item.key)">{{ t(item.labelKey) }}</button>
      </ActionMenu>
      <!-- NF-WF-016: the header outline button opens the planning panel
           (design mockup outline-btn :601). -->
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        :aria-label="t('workspace.nav.planning')"
        data-writer-action="planning"
        @click="openWorkspacePanel('planning')"
      >
        {{ t("workspace.nav.planning") }}
      </button>
      <ActionMenu :label="t('workspace.tools')">
      <button class="nf-mobile-action text-nf-text-dim" @click="openWorkspacePanel('planning')">{{ t("workspace.nav.planning") }}</button>
      <button class="nf-mobile-action text-nf-text-dim" :disabled="chapterSelecting || !activeChapter || reviewAction !== null" @click="saveAndReview()">{{ t(reviewAction === 'save' ? 'common.reviewing' : 'common.save') }}</button>
      <!-- NF-WF-018A: AI Studio link — hidden for VIEWER (role-gated,
           progressive enhancement; the server enforces). -->
      <NuxtLink
        v-if="showStudioLink"
        :to="`/workspaces/${workspaceId}/ai-studio?novelId=${novelId}`"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="ai-studio-link"
      >
        {{ t("aiStudio.navLink") }}
      </NuxtLink>
      <!-- NF-WF-018B: platform admin link — SUPER_ADMIN only (progressive
           enhancement; the admin page and routes enforce server-side). -->
      <NuxtLink
        v-if="showAdminLink"
        to="/admin"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="admin-link"
      >
        {{ t("platformAdmin.title") }}
      </NuxtLink>
      <!-- NF-WF-019B: comment moderation link — staff only (role-gated,
           progressive enhancement; the moderation page and every
           moderation route enforce membership + `novel:update`
           server-side). -->
      <NuxtLink
        v-if="showModerationLink"
        :to="`/workspaces/${workspaceId}/novels/${novelId}/moderation`"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="moderation-link"
      >
        {{ t("comments.queueNavLink") }}
      </NuxtLink>
      <!-- NF-WF-021D: Simulation Center link — workspace members only
           (progressive enhancement; the simulation page and every
           simulation route enforce membership + `simulation:read`
           server-side). -->
      <NuxtLink
        :to="`/workspaces/${workspaceId}/novels/${novelId}/simulation`"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="simulation-link"
      >
        {{ t("simulation.title") }}
      </NuxtLink>
      <!-- NF-WF-022A: Endgame panel link — workspace members only
           (progressive enhancement; the endgame page and every
           endgame route enforce membership + `endgame:read`
           server-side). -->
      <NuxtLink
        :to="`${base}/recovery`"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="recovery-link"
      >
        {{ t("recovery.title") }}
      </NuxtLink>
      <NuxtLink
        :to="`/workspaces/${workspaceId}/novels/${novelId}/endgame`"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        data-testid="endgame-link"
      >
        {{ t("endgame.title") }}
      </NuxtLink>
      <button class="nf-generation-toggle text-nf-text-dim" :aria-expanded="generationRailOpen" aria-controls="writer-generation" @click="generationRailOpen = !generationRailOpen">{{ t("generation.title") }}</button>
      </ActionMenu>
      <div
        class="flex items-center gap-1 rounded-lg border border-nf-border p-0.5 text-[12px]"
        role="group"
        aria-label="Language"
        data-writer-action="language"
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
      <button class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
        :disabled="chapterSelecting || !activeChapter || reviewAction !== null || saveState === 'saving'"
        :title="t('chapterDraft.hint')" data-testid="writer-draft" data-writer-action="draft" @click="returnToDraft">{{ t(reviewAction === 'draft' ? 'common.saving' : 'chapterDraft.label') }}</button>
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        :disabled="chapterSelecting || !activeChapter || reviewAction !== null"
        data-writer-action="save"
        @click="saveAndReview()"
      >
        {{ t(reviewAction === 'save' ? 'common.reviewing' : 'common.save') }}
      </button>
      <button
        class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        :disabled="chapterSelecting || !activeChapter || saveState === 'saving' || reviewAction !== null"
        data-testid="writer-publish"
        @click="publish"
      >
        {{ t(reviewAction === 'publish' ? "header.publishing" : "header.publish") }}
      </button>
    </header>

    <div
      class="nf-writer-grid grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[264px_1fr] xl:grid-cols-[264px_1fr_312px]"
      :data-chapters-open="chapterNavigationOpen"
      :data-generation-open="generationRailOpen"
    >
      <nav id="writer-chapters" :aria-label="t('chapters.title')" class="nf-writer-chapters hidden min-h-0 max-h-full overflow-y-auto border-r border-nf-border bg-nf-bg-1 px-2.5 py-4 lg:block">
        <div class="mb-2 flex flex-wrap items-center gap-2 px-2.5 pb-2">
          <span
            class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >{{ t("chapters.title") }}</span
          >
          <button
            class="rounded border border-nf-border-strong px-1.5 text-[13px] leading-5 text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('header.newChapter')"
            :title="t('header.newChapter')"
            :disabled="chapterCreating || chapterSelecting"
            @click="openChapterCreate"
          >
            <svg class="mr-1 inline size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>{{ t('chapterCreation.add') }}
          </button>
          <button
            class="rounded border border-nf-border-strong px-1.5 text-[13px] leading-5 text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('importExport.import.button')"
            :title="t('importExport.import.button')"
            data-testid="import-open"
            @click="importDialogOpen = true"
          >
            <svg class="mr-1 inline size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M4 12v5h12v-5" /></svg>{{ t('chapterCreation.import') }}
          </button>
          <button
            class="rounded border border-nf-border-strong px-1.5 text-[13px] leading-5 text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('importExport.export.button')"
            :title="t('importExport.export.button')"
            data-testid="export-open"
            @click="exportPickerOpen = true"
          >
            <svg class="mr-1 inline size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3v10m-4-4 4 4 4-4M4 13v4h12v-4" /></svg>{{ t('chapterCreation.export') }}
          </button>
        </div>
        <div class="mb-3 px-2.5">
          <p class="mb-1 text-[12px] text-nf-text-dim">{{ t("chapters.sortLabel") }}</p>
          <ActionMenu :label="t('chapters.sortLabel')" data-testid="chapter-sort" class="nf-chapter-sort w-full">
            <template #trigger>{{ t(chapterSort === 'oldest' ? 'chapters.oldestFirst' : 'chapters.newestFirst') }}</template>
            <div role="group" :aria-label="t('chapters.sortLabel')">
              <button v-for="order in (['oldest', 'newest'] as const)" :key="order" type="button" class="block w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-nf-bg-2 focus-visible:nf-focus" :class="chapterSort === order ? 'bg-nf-accent/10 text-nf-accent-hi' : 'text-nf-text-dim'" :aria-pressed="chapterSort === order" @click="chapterSort = order">{{ t(order === 'oldest' ? 'chapters.oldestFirst' : 'chapters.newestFirst') }}</button>
            </div>
          </ActionMenu>
        </div>
        <div data-testid="chapter-list" role="region" :aria-label="t('chapters.list')" tabindex="0" class="max-h-[20dvh] overflow-y-scroll overscroll-contain rounded-md [scrollbar-gutter:stable] focus-visible:nf-focus sm:max-h-[40dvh]">
          <p v-if="loading" class="px-2.5 text-[13px] text-nf-text-faint">{{ t("common.loading") }}</p>
          <p v-else-if="!chapters.length" class="px-2.5 text-[13px] text-nf-text-faint">
            {{ t("chapters.empty") }}
          </p>
          <div
            v-for="c in sortedChapters"
            :key="c.id"
            :data-chapter-number="c.number"
            class="flex w-full items-center gap-1 rounded-md text-[13px]"
            :class="
              c.id === activeId
                ? 'border-l-2 border-nf-accent bg-nf-accent/10 font-semibold text-nf-accent-hi'
                : 'text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
            "
          >
            <button :disabled="chapterCreating || chapterSelecting" :aria-current="c.id === activeId ? 'true' : undefined" class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left focus-visible:nf-focus disabled:opacity-60" @click="selectChapter(c.id)">
            <span class="truncate">{{ c.number }} — {{ c.title }}</span>
            <span
              class="ml-auto shrink-0 rounded bg-nf-bg-0 px-1.5 py-px text-[11px] tabular-nums text-nf-text-faint"
            >
              {{ c.wordCount.toLocaleString() }}
            </span>
            </button>
            <ChapterActions :base="base" :chapter="c" :before-change="prepareChapterMutation" @changed="onChapterRenamed" @deleted="onChapterDeleted" />
          </div>
        </div>
        <!-- NF-WF-016: the story-structure nav (design mockup :655-663,
             extended per Invariant 7a) opens the authoring workspace
             panels in a drawer. -->
        <div class="mb-2 mt-6 px-2.5 pb-2">
          <span
            class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >{{ t("workspace.nav.story") }}</span
          >
        </div>
        <button
          v-for="item in workspaceNavItems"
          :key="item.key"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          :class="workspacePanel === item.key ? 'bg-nf-accent/10 font-semibold text-nf-accent-hi' : ''"
          @click="openWorkspacePanel(item.key)"
        >
          <span class="truncate">{{ t(item.labelKey) }}</span>
        </button>
      </nav>

      <main class="flex min-h-0 min-w-0 flex-col bg-nf-bg-0">
        <div :inert="chapterSelecting" class="flex items-center gap-2 border-b border-nf-border bg-nf-bg-1 px-6 py-2">
          <EditorToolbar :editor="editorRef" @rewrite-tone="() => runSelectionOperation('rewrite-tone')" @polish-language="() => runSelectionOperation('polish-language')" />
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
          <p v-if="chapterSelecting" role="status" class="px-6 py-4 text-[13px] text-nf-text-dim">{{ t("common.loading") }}</p>
          <p
            v-if="error"
            role="alert"
            class="mx-auto mt-6 max-w-[700px] rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-4 py-3 text-[13px] text-nf-warn"
          >
            {{ error }}
          </p>

          <p v-if="reviewNotice" role="status" data-testid="save-review-result" class="mx-auto mt-6 max-w-[700px] rounded-lg border border-nf-ok/40 bg-nf-ok/10 px-4 py-3 text-[13px] text-nf-ok">{{ reviewNotice }}</p>

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
            <p v-if="reviewedAiTitle && !gen.review.value.blocked" class="mt-3 text-base font-semibold text-nf-text">{{ t('chapterCreation.chapterTitle') }}: {{ reviewedAiTitle }}</p>
            <DraftDiffView
              :draft-prose="gen.review.value.prose"
              :blocked="gen.review.value.blocked"
              :base-text="diffBaseText"
              :pinned-version="gen.diffPinnedVersion.value"
              :ordinal="gen.review.value.draft.ordinal"
              :total="gen.review.value.draft.total"
            />
            <FindingsPanel :findings="gen.review.value.findings" />
            <ProposalsPanel
              :proposals="gen.review.value.proposals"
              :workspace-id="workspaceId"
              :novel-id="novelId"
              :run-id="gen.review.value.runId"
              :chapter-number="gen.review.value.chapterNumber"
            />

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
              :draft-title="reviewedAiTitle"
              :chapter-title="activeChapter.title"
              @applied="onApplied"
              @reload-rediff="onReloadRediff"
              @continue-next="onContinueNext"
            />
            <NewCharactersPanel
              v-if="activeChapter && !gen.review.value.blocked"
              :workspace-id="workspaceId"
              :novel-id="novelId"
              :chapter-id="activeChapter.id"
              :run-id="gen.review.value.runId"
              :current-version="version"
              :run-status="gen.selectedRun.value?.status ?? ''"
            />
            <StorySuggestionsPanel
              v-if="activeChapter && !gen.review.value.blocked"
              :workspace-id="workspaceId" :novel-id="novelId" :chapter-id="activeChapter.id"
              :run-id="gen.review.value.runId" :current-version="version"
              :run-status="gen.selectedRun.value?.status ?? ''"
            />
          </div>

          <div v-if="activeChapter" class="mx-auto max-w-[700px] px-6 pb-24 pt-[52px] lg:px-10">
            <div
              class="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-nf-accent-hi"
            >
              <SceneNav
                :chapters="chapters"
                :active-chapter-id="activeId"
                :scenes-by-chapter="scenesByChapter"
                :active-scene-id="activeSceneId"
                @select-scene="onSelectScene"
                @add-scene="onAddScene"
                @rename-scene="onRenameScene"
                @delete-scene="onDeleteScene"
                @move-scene="onMoveScene"
              />
              <span class="h-px flex-1 bg-gradient-to-r from-nf-border-strong to-transparent" />
            </div>
            <h1 class="mb-2 font-nf-literary text-3xl font-semibold leading-tight">
              {{ activeChapter.title }}
            </h1>
            <div class="mb-8 text-[13px] tabular-nums text-nf-text-faint">
              {{ activeChapter.status }} · {{ wordCount.toLocaleString() }} {{ t("chapters.words") }}
            </div>
            <ConflictBanner
              v-if="conflictServer"
              :server-version="conflictServer.version"
              @keep-mine="resolveKeepMine"
              @load-theirs="resolveLoadTheirs"
              @compare="resolveCompare"
            />
            <div
              v-if="comparing && conflictServer"
              class="mb-8 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
            >
              <DraftDiffView
                :draft-prose="stripHtmlTags(content)"
                :base-text="stripHtmlTags(conflictServer.content)"
                :pinned-version="conflictServer.version"
                :ordinal="1"
                :total="1"
              />
              <button
                type="button"
                class="mt-3 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
                @click="comparing = false"
              >
                {{ t("conflict.closeCompare") }}
              </button>
            </div>
            <p
              v-if="aiNotice"
              role="status"
              class="mb-4 flex items-center gap-2 rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-2.5 text-[13px] text-nf-text-dim"
            >
              <span class="flex-1">{{ aiNotice }}</span>
              <button
                type="button"
                class="rounded px-1 text-nf-text-faint hover:text-nf-text focus-visible:nf-focus"
                :aria-label="t('common.close')"
                @click="aiNotice = null"
              >
                ✕
              </button>
            </p>
            <ClientOnly>
              <RichEditor
                :read-only="chapterSelecting"
                :model-value="content"
                :review-highlight="reviewHighlight"
                :aria-label="t('chapters.editorPlaceholder')"
                @update:modelValue="onEditorInput"
                @editor-ready="onEditorReady"
                @blur="onEditorBlur"
              />
              <template #fallback>
                <div class="font-nf-literary text-[17.5px] leading-[1.85] text-nf-text">
                  {{ stripHtmlTags(content) }}
                </div>
              </template>
            </ClientOnly>
            <SelectionAiMenu
              :editor="editorRef"
              @run-operation="(op: SelectionAiOperationKey) => runSelectionOperation(op)"
              @run-free-prompt="(prompt: string) => runSelectionOperation('free-prompt', prompt)"
            />
            <AiSuggestionCard
              v-if="selAi.activeRequest.value"
              :operation="selAi.activeRequest.value.operation"
              :operation-label-key="
                SELECTION_AI_OPERATIONS[selAi.activeRequest.value.operation].labelKey
              "
              :streaming="selAi.streaming.value"
              :result="selAi.result.value"
              :original-text="selAi.captured.value?.text"
              :error-key="selAi.errorKey.value"
              :anchor="suggestionAnchor"
              @accept="onSuggestionAccept"
              @insert="onSuggestionInsert"
              @discard="() => closeSuggestion(true)"
            />
          </div>
          <p v-else-if="!loading" class="px-6 py-10 text-center text-sm text-nf-text-faint">
            {{ t("chapters.selectPrompt") }}
          </p>
        </div>
      </main>

      <aside
        id="writer-generation"
        :aria-label="t('generation.title')"
        class="nf-writer-generation hidden overflow-y-auto border-l border-nf-border bg-nf-bg-1 px-4 py-5 xl:block"
      >
        <FinalTextReviewPanel :review="finalReview?.chapterId === activeId ? finalReview.result : null" :stale="finalReviewStale" :navigation-error="reviewNavigationError" @show="showReviewText" />
        <GenerationPanel
          ref="generationPanel"
          :creation-mode="activeId === aiCreationChapterId"
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
            can-configure
            @configure="configureFailedRun"
            @run-updated="onRunUpdated"
            @retried="onRunStarted"
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
        <!-- NF-WF-016: the continuity-guardian binding — "Canon in sync"
             reflects the live evaluateHealth state, never a cached claim. -->
        <button
          class="flex items-center gap-1.5 focus-visible:nf-focus"
          :aria-label="healthLabel"
          @click="openWorkspacePanel('health')"
        >
          <span
            class="text-[9px]"
            :class="
              healthFindingCount === null
                ? 'text-nf-text-faint'
                : healthFindingCount === 0
                  ? 'text-nf-ok'
                  : 'text-nf-warn'
            "
            >●</span
          >
          <span class="font-semibold text-nf-text-dim">{{ healthLabel }}</span>
        </button>
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

    <!-- NF-WF-016: the authoring workspace drawer. One panel at a time;
         the panels are deterministic UI over the frozen domain routes. -->
    <WorkspaceDrawer
      :open="workspacePanel !== null"
      :title="workspacePanelTitle"
      @close="closeWorkspacePanel"
    >
      <CharacterPanel
        v-if="workspacePanel === 'characters'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :focus-character-id="gotoEntityId"
      />
      <RelationshipPanel
        v-else-if="workspacePanel === 'relationships'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <WorldPanel
        v-else-if="workspacePanel === 'world'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <TimelinePanel
        v-else-if="workspacePanel === 'timeline'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <CanonReviewPanel
        v-else-if="workspacePanel === 'canon'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <NovelDiscoveryEditor
        v-else-if="workspacePanel === 'discovery'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <NovelCoverEditor v-else-if="workspacePanel === 'cover'" :workspace-id="workspaceId" :novel-id="novelId" />
      <ResearchPanel
        v-else-if="workspacePanel === 'research'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <PlanningPanel
        v-else-if="workspacePanel === 'planning'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
      <NarrativePanel
        v-else-if="workspacePanel === 'narrative'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :chapter-id="activeId"
        :chapter-version-id="null"
        :has-saved-version="activeId !== null && saveState === 'saved'"
      />
      <NovelModelDefaultsPanel v-else-if="workspacePanel === 'models'" :workspace-id="workspaceId" :novel-id="novelId" />
      <HealthMemoryPanel
        v-else-if="workspacePanel === 'health'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        @goto="goToUnresolvedTarget"
      />
    </WorkspaceDrawer>
    <!-- NF-WF-017B: export picker -->
    <ExportPicker
      :open="exportPickerOpen"
      :workspace-id="workspaceId"
      :novel-id="novelId"
      @close="exportPickerOpen = false"
    />
    <ChapterCreateDialog v-if="chapterCreateOpen" :busy="chapterCreating" :error="chapterCreateError" :uncertain="chapterCreateUncertain" :workspace-id="workspaceId" :novel-id="novelId" :pending-ai="!!aiCreation.pending.value" :can-resolve-ai="!!aiCreation.pending.value" @manual="createChapter" @ai="createAiChapter" @resume-ai="createAiChapter()" @resolve-ai="resolveAiReservation" @close="closeChapterCreate" />
    <!-- NF-WF-017A: import dialog -->
    <ImportDialog
      :open="importDialogOpen"
      :workspace-id="workspaceId"
      :novel-id="novelId"
      @close="importDialogOpen = false"
      @imported="onImported"
    />
  </div>
</template>
