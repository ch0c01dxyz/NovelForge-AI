<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";

const props = defineProps<{ open: boolean; workspaceId: string }>();
const emit = defineEmits<{ close: [] }>();
const { api } = useApi();
const { t } = useLocale();
const areas = ["SYNOPSIS", "OUTLINE", "STYLE", "CHARACTER", "CHARACTER_STATE", "CHARACTER_ARC", "RELATIONSHIP", "WORLD", "TIMELINE", "RESEARCH", "NARRATIVE", "ENDGAME", "CANON"] as const;
type Area = typeof areas[number];
type JobStatus = "IMPORTING" | "QUEUED" | "RUNNING" | "REVIEW" | "FAILED" | "UNCERTAIN" | "CANCELLED";
interface Job {
  id: string; novelId: string; novelTitle: string; status: JobStatus; areas: Area[];
  totalChunks: number; completedChunks: number; candidateCount: number;
  errorCode: string | null; unknowns: unknown; coverage: unknown;
  expectedHeadRevisionId: string | null; createdAt: string;
}
interface Preview {
  archiveHash: string; warnings: string[];
  novels: { root: string; title: string; chapterCount: number; firstSourceNumber: number; lastSourceNumber: number; hasCover: boolean; warnings: string[] }[];
}
interface Candidate {
  id: string; area: Area; title: string; summary: string; subject: string | null; target: string | null;
  chapterNumber: number | null; citations: { chapterVersionId: string; chapterNumber: number; quote: string }[];
  status: "PENDING" | "APPROVED" | "REJECTED"; version: number; result: unknown;
  details?: { [key: string]: unknown; milestones?: { chapterNumber: number; summary: string }[] };
}
const dialog = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
const file = ref<File | null>(null);
const preview = ref<Preview | null>(null);
const root = ref("");
const selectedAreas = ref<Area[]>([...areas]);
const requestId = ref<string | null>(null);
const uncertain = ref(false);
const busy = ref(false);
const pinsReady = ref(false);
const loading = ref(false);
const error = ref("");
const jobs = ref<Job[]>([]);
const job = ref<Job | null>(null);
const candidates = ref<Candidate[]>([]);
const total = ref(0);
const skip = ref(0);
const take = 10;
const areaFilter = ref("");
const statusFilter = ref("PENDING");
const editing = ref<Candidate | null>(null);
const editTitle = ref("");
const editSummary = ref("");
const editSubject = ref("");
const editTarget = ref("");
const editDetails = ref<NonNullable<Candidate["details"]>>({});
const confirmation = ref<"create" | "cancel" | null>(null);
let mounted = true;
let context = 0;
let candidateRequest = 0;
let poll: ReturnType<typeof setTimeout> | undefined;
const selectedRoot = computed(() => preview.value?.novels.find(novel => novel.root === root.value));
const warnings = computed(() => [...(preview.value?.warnings ?? []), ...(selectedRoot.value?.warnings ?? [])]);
function warningText(value: string): string {
  const chapter = /^Chapter (\d+):\s*(.*)$/.exec(value);
  if (chapter) return `${t("novelDecode.sourceChapter", { number: chapter[1]! })}: ${warningText(chapter[2]!)}`;
  const excluded = /^Source validation excluded (\d+) unsupported suggestions; none were applied\.$/.exec(value);
  if (excluded) return t("novelDecode.excludedSuggestions", { count: excluded[1]! });
  const keys: Record<string, string> = {
    "Novel title derived from source directory name": "titleFromFolder",
    "Cover media type detected from bytes differs from filename extension": "coverType",
    "Declared chapter count differs from archive chapter count": "chapterCountMismatch",
    "Source chapter numbers are not consecutive": "chapterNumberGaps",
    "Further limitations are retained in the chapter-level analysis receipts.": "moreUnknowns",
  };
  if (keys[value]) return t(`novelDecode.warnings.${keys[value]}`);
  if (value.startsWith("Ignored archive metadata: ")) return t("novelDecode.warnings.ignoredMetadata", { name: value.slice(26) });
  return value;
}
const running = computed(() => job.value && ["IMPORTING", "QUEUED", "RUNNING"].includes(job.value.status));
const readyToCreate = computed(() => !!file.value && !!selectedRoot.value && selectedAreas.value.length > 0 && !busy.value);
const progress = computed(() => job.value?.totalChunks ? Math.min(100, Math.round(job.value.completedChunks / job.value.totalChunks * 100)) : 0);
const detailFields = computed(() => {
  switch (editing.value?.area) {
    case "WORLD": return [{ key: "entityKind", values: ["LOCATION", "ORGANIZATION", "FACTION", "ITEM", "RESOURCE", "CONCEPT"] }];
    case "RELATIONSHIP": return [{ key: "stance", values: ["ALLY", "FRIENDLY", "NEUTRAL", "WARY", "HOSTILE", "ENEMY"] }];
    case "NARRATIVE": return [{ key: "recordKind", values: ["THREAD", "PROMISE"] }, ...(editDetails.value.recordKind === "THREAD" ? [{ key: "threadKind", values: ["MYSTERY", "CONFLICT", "QUESTION", "OBJECTIVE", "SUBPLOT"] }] : [])];
    case "ENDGAME": return [{ key: "legacyKind", values: ["CHARACTER", "WORLD", "THEMATIC"] }];
    default: return [];
  }
});
const base = () => `/workspaces/${props.workspaceId}/novel-decodes`;
function message(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === "DECODE_IDENTITY_REVIEW_REQUIRED") return t("novelDecode.identityRequired");
    if (cause.status === 403) return t("novelDecode.forbidden");
    if (cause.status === 409) return t("novelDecode.stale");
    if (cause.status === 413) return t("novelDecode.tooLarge");
    if (cause.status === 400 || cause.status === 422) return t("novelDecode.invalidArchive");
  }
  return t("novelDecode.failed");
}
function close() { if (!busy.value) emit("close"); }
function stopPolling() { if (poll) clearTimeout(poll); poll = undefined; }
function schedule() {
  stopPolling();
  if (mounted && props.open && running.value) poll = setTimeout(() => { void refreshJob(); }, 3000);
}
async function loadJobs() {
  const scope = context;
  try {
    const response = await api<{ jobs: Job[] }>(base());
    if (mounted && props.open && scope === context) jobs.value = response.jobs;
  } catch (cause) { if (mounted && props.open && scope === context) error.value = message(cause); }
}
async function loadCandidates() {
  if (!job.value) return;
  const id = job.value.id, scope = context, request = ++candidateRequest;
  loading.value = true;
  try {
    const query = new URLSearchParams({ skip: String(skip.value), take: String(take) });
    if (areaFilter.value) query.set("area", areaFilter.value);
    if (statusFilter.value) query.set("status", statusFilter.value);
    const result = await api<{ candidates: Candidate[]; total: number }>(`${base()}/${id}/candidates?${query}`);
    if (!mounted || !props.open || scope !== context || request !== candidateRequest || id !== job.value?.id) return;
    candidates.value = result.candidates; total.value = result.total;
  } catch (cause) { if (mounted && props.open && scope === context && request === candidateRequest) error.value = message(cause); }
  finally { if (mounted && request === candidateRequest) loading.value = false; }
}
async function refreshJob() {
  if (!job.value) return;
  const id = job.value.id, scope = context;
  try {
    const result = await api<{ job: Job }>(`${base()}/${id}`);
    if (!mounted || !props.open || scope !== context || id !== job.value?.id) return;
    const changed = result.job.candidateCount !== job.value.candidateCount || result.job.status !== job.value.status;
    job.value = result.job; pinsReady.value = true;
    jobs.value = jobs.value.map(item => item.id === id ? result.job : item);
    if (changed) await loadCandidates();
  } catch (cause) { if (mounted && props.open && scope === context) { error.value = message(cause); pinsReady.value = false; } }
  finally { schedule(); }
}
async function selectJob(item: Job) {
  if (busy.value) return;
  ++context; stopPolling(); editing.value = null; error.value = "";
  job.value = item; pinsReady.value = false; candidates.value = []; total.value = 0; skip.value = 0;
  areaFilter.value = ""; statusFilter.value = "PENDING";
  await refreshJob(); await loadCandidates();
}
async function chooseFile(event: Event) {
  if (busy.value || uncertain.value) return;
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  preview.value = null; root.value = ""; requestId.value = null; error.value = "";
  if (!file.value) return;
  if (!file.value.name.toLowerCase().endsWith(".zip")) { error.value = t("novelDecode.invalidArchive"); return; }
  if (file.value.size > 50 * 1024 * 1024) { error.value = t("novelDecode.tooLarge"); return; }
  const scope = context;
  busy.value = true;
  try {
    const body = new FormData(); body.append("file", file.value);
    const result = await api<Preview>(`${base()}/preview`, { method: "POST", body, headers: {} });
    if (!mounted || scope !== context) return;
    preview.value = result;
    root.value = preview.value.novels[0]?.root ?? "";
  } catch (cause) { if (mounted && scope === context) error.value = message(cause); }
  finally { busy.value = false; }
}
async function createJob() {
  if (!readyToCreate.value || !file.value || !preview.value) return;
  const journalKey = `nf-decode-request:${JSON.stringify([props.workspaceId, preview.value.archiveHash, root.value, [...selectedAreas.value].sort()])}`;
  try {
    const retained = sessionStorage.getItem(journalKey);
    if (!requestId.value && retained && /^[0-9a-f-]{36}$/i.test(retained)) requestId.value = retained;
  } catch { /* Browser storage may be disabled; the open dialog still retains its request ID. */ }
  requestId.value ??= crypto.randomUUID();
  try { sessionStorage.setItem(journalKey, requestId.value); } catch { /* Keep the same in-memory retry identity. */ }
  const scope = context;
  busy.value = true; error.value = "";
  try {
    const body = new FormData();
    body.append("file", file.value); body.append("root", root.value);
    body.append("archiveHash", preview.value.archiveHash);
    body.append("areas", JSON.stringify(selectedAreas.value)); body.append("requestId", requestId.value);
    const response = await api<{ job: Job }>(base(), { method: "POST", body, headers: {} });
    try { sessionStorage.removeItem(journalKey); } catch { /* The confirmed server receipt is authoritative. */ }
    if (!mounted || scope !== context) return;
    uncertain.value = false; confirmation.value = null;
    file.value = null; preview.value = null; requestId.value = null;
    jobs.value = [response.job, ...jobs.value.filter(item => item.id !== response.job.id)];
    job.value = response.job; pinsReady.value = true; skip.value = 0; candidates.value = []; editing.value = null;
    await loadCandidates(); schedule();
  } catch (cause) {
    if (!mounted || scope !== context) return;
    uncertain.value = !(cause instanceof ApiError && cause.status < 500);
    error.value = uncertain.value ? t("novelDecode.uncertainCreate") : message(cause);
    confirmation.value = null;
  } finally { busy.value = false; }
}
async function jobAction(action: "retry" | "cancel") {
  if (!job.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const response = await api<{ job: Job }>(`${base()}/${job.value.id}/${action}`, { method: "POST", body: "{}" });
    job.value = response.job; pinsReady.value = true; await loadCandidates(); await loadJobs(); schedule();
  } catch (cause) { error.value = message(cause); }
  finally { busy.value = false; confirmation.value = null; }
}
function edit(candidate: Candidate) {
  editing.value = candidate; editTitle.value = candidate.title; editSummary.value = candidate.summary;
  editSubject.value = candidate.subject ?? ""; editTarget.value = candidate.target ?? "";
  editDetails.value = { ...(candidate.details ?? {}) };
  nextTick(() => dialog.value?.querySelector<HTMLElement>("[data-testid=decode-edit-title]")?.focus());
}
async function candidateAction(candidate: Candidate, action: "approve" | "reject" | "edit") {
  if (!job.value || busy.value || !pinsReady.value || (action === "edit" && !editing.value)) return;
  busy.value = true; error.value = "";
  try {
    const body = action === "edit"
      ? { expectedVersion: editing.value!.version, title: editTitle.value.trim(), summary: editSummary.value.trim(), subject: editSubject.value.trim() || null, target: editTarget.value.trim() || null, details: { ...editDetails.value } }
      : { expectedVersion: candidate.version, expectedHeadRevisionId: job.value.expectedHeadRevisionId };
    await api(`${base()}/${job.value.id}/candidates/${candidate.id}${action === "edit" ? "" : `/${action}`}`, { method: action === "edit" ? "PATCH" : "POST", body: JSON.stringify(body) });
    editing.value = null;
    // Every decision can change the revision pin used by the next decision.
    await refreshJob(); await loadCandidates();
    if (!candidates.value.length && skip.value > 0) { skip.value = Math.max(0, skip.value - take); await loadCandidates(); }
  } catch (cause) { error.value = message(cause); await refreshJob(); await loadCandidates(); }
  finally { busy.value = false; }
}
function filter() { skip.value = 0; editing.value = null; void loadCandidates(); }
function page(delta: number) { skip.value += delta * take; editing.value = null; void loadCandidates(); }
watch([root, selectedAreas], () => { if (!busy.value && !uncertain.value) requestId.value = null; }, { deep: true });
function detailLines(value: unknown): string[] {
  if (typeof value === "string") return [warningText(value).replace(/^Chapter (\d+):/, (_, number: string) => `${t("novelDecode.sourceChapter", { number })}:`)];
  if (Array.isArray(value)) return value.flatMap(detailLines);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => {
    const label = (areas as readonly string[]).includes(key) ? t(`novelDecode.areas.${key}`) : key;
    if (typeof item === "number" || typeof item === "boolean") return [`${label}: ${String(item)}`];
    return detailLines(item).map(line => `${label}: ${line}`);
  });
  return [];
}
function coverageLines(): string[] {
  if (!job.value) return [];
  const coverage = job.value.coverage && typeof job.value.coverage === "object" && !Array.isArray(job.value.coverage) ? job.value.coverage as Record<string, unknown> : {};
  return areas.flatMap(area => {
    const label = t(`novelDecode.areas.${area}`);
    if (!job.value!.areas.includes(area)) return [t("novelDecode.areaNotSelected", { area: label })];
    const row = coverage[area];
    if (!row || typeof row !== "object" || Array.isArray(row)) return [t("novelDecode.areaNotAnalyzed", { area: label })];
    const counts = row as Record<string, unknown>;
    if (![counts.processedChunks, counts.totalChunks, counts.candidates].every(value => typeof value === "number")) return [t("novelDecode.areaNotAnalyzed", { area: label })];
    return [t("novelDecode.coverageLine", { area: label, completed: counts.processedChunks as number, total: counts.totalChunks as number, candidates: counts.candidates as number })];
  });
}
function nativeDetailLines(candidate: Candidate): string[] {
  return ["entityKind", "stance", "recordKind", "threadKind", "legacyKind", "predicate"].flatMap(key => {
    const value = candidate.details?.[key];
    if (typeof value !== "string" || !value) return [];
    return [`${t(`novelDecode.detailLabels.${key}`)}: ${key === "predicate" ? value : t(`novelDecode.detailValues.${value}`)}`];
  });
}
function keydown(event: KeyboardEvent) {
  if (!props.open || confirmation.value) return;
  if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); }
  else trapDialogFocus(event, dialog.value);
}
watch(() => [props.open, props.workspaceId] as const, async ([open], previous) => {
  ++context; ++candidateRequest; stopPolling();
  if (!open) { opener?.focus(); opener = null; return; }
  if (previous && props.workspaceId !== previous[1]) { file.value = null; preview.value = null; uncertain.value = false; requestId.value = null; job.value = null; jobs.value = []; candidates.value = []; }
  opener = document.activeElement as HTMLElement | null;
  await nextTick(); dialog.value?.focus();
  await loadJobs();
  if (job.value) { await refreshJob(); await loadCandidates(); }
}, { immediate: true, flush: "post" });
onMounted(() => document.addEventListener("keydown", keydown, true));
onUnmounted(() => { mounted = false; ++context; ++candidateRequest; stopPolling(); document.removeEventListener("keydown", keydown, true); });
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5" role="presentation">
    <div class="absolute inset-0 bg-black/65" data-testid="decode-backdrop" @click="close" />
    <section ref="dialog" tabindex="-1" role="dialog" aria-modal="true" :aria-label="t('novelDecode.title')" :inert="confirmation !== null || undefined" class="relative flex max-h-[94dvh] w-full max-w-5xl flex-col rounded-xl border border-nf-border-strong bg-nf-bg-1 text-nf-text shadow-nf-md focus-visible:nf-focus">
      <header class="flex items-start justify-between gap-3 border-b border-nf-border p-4 sm:px-6">
        <div><h2 class="font-serif text-xl font-semibold">{{ t('novelDecode.title') }}</h2><p class="mt-1 max-w-2xl text-[13px] text-nf-text-dim">{{ t('novelDecode.description') }}</p></div>
        <button type="button" :disabled="busy" class="decode-button shrink-0" :aria-label="t('common.close')" @click="close">×</button>
      </header>
      <div class="overflow-y-auto p-4 sm:p-6">
        <p v-if="error" role="alert" class="mb-4 rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-3 text-sm text-nf-warn">{{ error }}</p>
        <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
          <div class="min-w-0 space-y-5">
            <section class="rounded-xl border border-nf-border p-4">
              <h3 class="font-semibold">{{ t('novelDecode.archive') }}</h3>
              <p class="mt-1 text-xs leading-relaxed text-nf-text-dim">{{ t('novelDecode.layout') }}</p>
              <label class="mt-3 block text-sm">{{ t('novelDecode.file') }}<input data-testid="decode-file" type="file" accept=".zip,application/zip" :disabled="busy || uncertain" class="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-nf-border-strong file:bg-nf-bg-2 file:px-3 file:py-2 file:text-nf-text focus-visible:nf-focus" @change="chooseFile" /></label>
              <p v-if="busy" role="status" class="mt-2 text-sm text-nf-text-dim">{{ t('common.loading') }}</p>
              <template v-if="preview">
                <label class="mt-4 block text-sm">{{ t('novelDecode.root') }}<select v-model="root" data-testid="decode-root" class="decode-input mt-1" :disabled="busy || uncertain"><option v-for="novel in preview.novels" :key="novel.root" :value="novel.root">{{ novel.title }} · {{ novel.root || '/' }}</option></select></label>
                <p v-if="selectedRoot" class="mt-2 text-sm text-nf-text-dim">{{ t('novelDecode.previewCount', { count: selectedRoot.chapterCount, first: selectedRoot.firstSourceNumber, last: selectedRoot.lastSourceNumber }) }} · {{ t(selectedRoot.hasCover ? 'novelDecode.coverIncluded' : 'novelDecode.noCover') }}</p>
                <p class="mt-2 text-xs text-nf-text-dim">{{ t('novelDecode.orderHint') }}</p>
                <ul v-if="warnings.length" class="mt-2 list-inside list-disc space-y-1 text-sm text-nf-warn"><li v-for="(warning, index) in warnings" :key="index">{{ warningText(warning) }}</li></ul>
                <p v-if="!preview.novels.length" class="mt-2 text-sm">{{ t('novelDecode.noRoots') }}</p>
                <fieldset class="mt-4" :disabled="busy || uncertain"><legend class="text-sm font-medium">{{ t('novelDecode.analysisAreas') }}</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><label v-for="area in areas" :key="area" class="flex items-center gap-2 rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-sm"><input v-model="selectedAreas" type="checkbox" :value="area" class="accent-nf-accent" />{{ t(`novelDecode.areas.${area}`) }}</label></div></fieldset>
                <p class="mt-3 text-xs leading-relaxed text-nf-text-dim">{{ t('novelDecode.privateHint') }}</p>
                <button type="button" data-testid="decode-create" class="decode-primary mt-3" :disabled="!readyToCreate" @click="confirmation = 'create'">{{ t(uncertain ? 'novelDecode.retrySameImport' : 'novelDecode.create') }}</button>
              </template>
            </section>

            <section v-if="job" class="space-y-4" aria-live="polite">
              <div class="rounded-xl border border-nf-border bg-nf-bg-0 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2"><div><h3 class="font-serif text-lg font-semibold">{{ job.novelTitle }}</h3><p class="mt-1 text-sm text-nf-text-dim">{{ t(`novelDecode.status.${job.status}`) }}</p></div><NuxtLink :to="`/workspaces/${workspaceId}/novels/${job.novelId}`" class="decode-button" @click="close">{{ t('novelDecode.openNovel') }}</NuxtLink></div>
                <progress v-if="job.totalChunks > 0" :value="job.completedChunks" :max="job.totalChunks" :aria-label="t('novelDecode.progress')" class="mt-3 h-2 w-full accent-nf-accent" />
                <p class="mt-2 text-xs text-nf-text-dim">{{ t('novelDecode.chunks', { completed: job.completedChunks, total: job.totalChunks }) }}<span v-if="job.totalChunks > 0"> · {{ progress }}%</span></p>
                <p class="mt-2 text-xs leading-relaxed text-nf-text-dim">{{ t('novelDecode.coverageHint') }}</p>
                <p v-if="job.errorCode || job.status === 'UNCERTAIN'" class="mt-3 text-sm text-nf-warn">{{ t(job.errorCode === 'DECODE_OUTPUT_LIMIT' ? 'novelDecode.outputLimit' : job.status === 'UNCERTAIN' ? 'novelDecode.uncertainJob' : 'novelDecode.analysisFailed') }}</p>
                <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="decode-button" :disabled="busy" @click="refreshJob(); loadCandidates()">{{ t('novelDecode.refresh') }}</button><button v-if="['FAILED', 'UNCERTAIN'].includes(job.status)" type="button" class="decode-button" :disabled="busy" @click="jobAction('retry')">{{ t('novelDecode.retryJob') }}</button><button v-if="running" type="button" class="decode-button" :disabled="busy" @click="confirmation = 'cancel'">{{ t('novelDecode.cancelJob') }}</button></div>
              </div>
              <details class="rounded-lg border border-nf-border p-3"><summary class="cursor-pointer text-sm focus-visible:nf-focus">{{ t('novelDecode.coverage') }}</summary><ul class="mt-2 space-y-1 text-sm text-nf-text-dim"><li v-for="(line, index) in coverageLines()" :key="index">{{ line }}</li></ul><p v-if="!coverageLines().length" class="mt-2 text-sm text-nf-text-dim">{{ t('novelDecode.notAnalyzed') }}</p><p class="mt-2 text-xs text-nf-text-dim">{{ t('novelDecode.notExhaustive') }}</p></details>
              <details class="rounded-lg border border-nf-border p-3"><summary class="cursor-pointer text-sm focus-visible:nf-focus">{{ t('novelDecode.unknowns') }}</summary><ul class="mt-2 space-y-1 text-sm text-nf-text-dim"><li v-for="(line, index) in detailLines(job.unknowns)" :key="index">{{ line }}</li></ul><p v-if="!detailLines(job.unknowns).length" class="mt-2 text-sm text-nf-text-dim">{{ t('novelDecode.noUnknownsReported') }}</p></details>
              <div class="flex flex-wrap items-end gap-3"><label class="min-w-40 flex-1 text-sm">{{ t('novelDecode.areaFilter') }}<select v-model="areaFilter" class="decode-input mt-1" :disabled="busy" @change="filter"><option value="">{{ t('novelDecode.allAreas') }}</option><option v-for="area in areas" :key="area" :value="area">{{ t(`novelDecode.areas.${area}`) }}</option></select></label><label class="min-w-36 flex-1 text-sm">{{ t('novelDecode.statusFilter') }}<select v-model="statusFilter" class="decode-input mt-1" :disabled="busy" @change="filter"><option value="">{{ t('novelDecode.allStatuses') }}</option><option v-for="status in ['PENDING', 'APPROVED', 'REJECTED']" :key="status" :value="status">{{ t(`novelDecode.candidateStatus.${status}`) }}</option></select></label></div>
              <p class="text-xs leading-relaxed text-nf-text-dim">{{ t('novelDecode.reviewHint') }}</p>
              <p v-if="loading" role="status" class="text-sm">{{ t('common.loading') }}</p>
              <p v-else-if="!candidates.length" class="rounded-lg border border-dashed border-nf-border p-5 text-sm text-nf-text-dim">{{ t('novelDecode.emptyCandidates') }}</p>
              <article v-for="candidate in candidates" :key="candidate.id" class="min-w-0 space-y-3 rounded-xl border border-nf-border bg-nf-bg-0 p-4" :data-testid="`decode-candidate-${candidate.id}`">
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-nf-text-dim"><span>{{ t(`novelDecode.areas.${candidate.area}`) }}</span><span>{{ t(`novelDecode.candidateStatus.${candidate.status}`) }}</span></div>
                <template v-if="editing?.id === candidate.id">
                  <label class="block text-sm">{{ t('novelDecode.candidateTitle') }}<input v-model="editTitle" data-testid="decode-edit-title" class="decode-input mt-1" :disabled="busy" /></label>
                  <label class="block text-sm">{{ t('novelDecode.summary') }}<textarea v-model="editSummary" rows="5" class="decode-input mt-1" :disabled="busy" /></label>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-sm">{{ t('novelDecode.subject') }}<input v-model="editSubject" class="decode-input mt-1" :disabled="busy" /></label>
                    <label class="text-sm">{{ t('novelDecode.target') }}<input v-model="editTarget" class="decode-input mt-1" :disabled="busy" /></label>
                  </div>
                  <label v-for="field in detailFields" :key="field.key" class="block text-sm">{{ t(`novelDecode.detailLabels.${field.key}`) }}
                    <select v-model="editDetails[field.key]" class="decode-input mt-1" :disabled="busy"><option :value="undefined">{{ t('novelDecode.notSpecified') }}</option><option v-for="value in field.values" :key="value" :value="value">{{ t(`novelDecode.detailValues.${value}`) }}</option></select>
                  </label>
                  <label v-if="candidate.area === 'CANON'" class="block text-sm">{{ t('novelDecode.detailLabels.predicate') }}<input v-model="editDetails.predicate" maxlength="100" class="decode-input mt-1" :disabled="busy" /></label>
                  <div class="flex gap-2">
                    <button type="button" class="decode-primary" :disabled="busy || !pinsReady || !editTitle.trim() || !editSummary.trim()" @click="candidateAction(candidate, 'edit')">{{ t('common.save') }}</button>
                    <button type="button" class="decode-button" :disabled="busy" @click="editing = null">{{ t('common.cancel') }}</button>
                  </div>
                </template>
                <template v-else><h4 class="break-words font-semibold">{{ candidate.title }}</h4><p class="whitespace-pre-wrap break-words text-sm leading-relaxed">{{ candidate.summary }}</p><p v-if="candidate.subject || candidate.target" class="break-words text-xs text-nf-text-dim">{{ candidate.subject }}<span v-if="candidate.subject && candidate.target"> → </span>{{ candidate.target }}</p><p v-for="line in nativeDetailLines(candidate)" :key="line" class="text-xs text-nf-text-dim">{{ line }}</p></template>
                <div v-if="candidate.area === 'CHARACTER_ARC' && candidate.details?.milestones?.length" class="text-sm"><p class="font-medium">{{ t('novelDecode.milestones') }}</p><ol class="mt-2 list-inside list-decimal space-y-1 text-nf-text-dim"><li v-for="(milestone, index) in candidate.details.milestones" :key="index">{{ t('novelDecode.sourceChapter', { number: milestone.chapterNumber }) }} · {{ milestone.summary }}</li></ol></div>
                <details><summary class="cursor-pointer text-sm text-nf-text-dim focus-visible:nf-focus">{{ t('novelDecode.evidence', { count: candidate.citations.length }) }}</summary><blockquote v-for="(citation, index) in candidate.citations" :key="index" class="mt-3 break-words border-l-2 border-nf-accent/50 pl-3 text-sm"><p class="mb-1 text-xs text-nf-text-dim">{{ t('novelDecode.sourceChapter', { number: citation.chapterNumber }) }}</p><p class="whitespace-pre-wrap">{{ citation.quote }}</p></blockquote><p v-if="!candidate.citations.length" class="mt-2 text-sm text-nf-warn">{{ t('novelDecode.noEvidence') }}</p></details>
                <div v-if="candidate.status === 'PENDING' && editing?.id !== candidate.id" class="flex flex-wrap gap-2">
                  <button type="button" class="decode-primary" :disabled="busy || !pinsReady || !candidate.citations.length || !job.expectedHeadRevisionId" @click="candidateAction(candidate, 'approve')">{{ t('novelDecode.approve') }}</button>
                  <button type="button" class="decode-button" :disabled="busy || !pinsReady" @click="edit(candidate)">{{ t('novelDecode.edit') }}</button>
                  <button type="button" class="decode-button" :disabled="busy || !pinsReady || !job.expectedHeadRevisionId" @click="candidateAction(candidate, 'reject')">{{ t('novelDecode.reject') }}</button>
                </div>
              </article>
              <nav v-if="total > take" class="flex items-center justify-between gap-2" :aria-label="t('novelDecode.pagination')"><button type="button" class="decode-button" :disabled="skip === 0 || loading || busy" @click="page(-1)">{{ t('novelDecode.previous') }}</button><span class="text-xs text-nf-text-dim">{{ t('novelDecode.page', { start: skip + 1, end: Math.min(skip + take, total), total }) }}</span><button type="button" class="decode-button" :disabled="skip + take >= total || loading || busy" @click="page(1)">{{ t('novelDecode.next') }}</button></nav>
            </section>
          </div>
          <aside class="min-w-0 border-t border-nf-border pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0"><div class="flex items-center justify-between gap-2"><h3 class="text-sm font-semibold">{{ t('novelDecode.recent') }}</h3><button type="button" class="decode-button" :disabled="busy" @click="loadJobs">{{ t('novelDecode.refresh') }}</button></div><p v-if="!jobs.length" class="mt-3 text-xs text-nf-text-dim">{{ t('novelDecode.noJobs') }}</p><ul class="mt-3 space-y-2"><li v-for="item in jobs" :key="item.id"><button type="button" class="w-full rounded-lg border p-3 text-left focus-visible:nf-focus disabled:opacity-50" :class="job?.id === item.id ? 'border-nf-accent bg-nf-accent/10' : 'border-nf-border hover:bg-nf-bg-2'" :disabled="busy" @click="selectJob(item)"><span class="block break-words text-sm font-medium">{{ item.novelTitle }}</span><span class="mt-1 block text-xs text-nf-text-dim">{{ t(`novelDecode.status.${item.status}`) }}</span></button></li></ul></aside>
        </div>
      </div>
    </section>
    <ConfirmDialog :open="confirmation !== null" :title="t(confirmation === 'cancel' ? 'novelDecode.cancelJob' : 'novelDecode.confirmTitle')" :body="t(confirmation === 'cancel' ? 'novelDecode.cancelHint' : 'novelDecode.privateHint')" :confirm-label="t(confirmation === 'cancel' ? 'novelDecode.cancelJob' : 'novelDecode.create')" :cancel-label="t('common.cancel')" :busy="busy" @cancel="confirmation = null" @confirm="confirmation === 'cancel' ? jobAction('cancel') : createJob()" />
  </div>
</template>

<style scoped>
.decode-button { border: 1px solid var(--color-nf-border-strong); border-radius: 8px; padding: 7px 11px; font-size: 13px; color: var(--color-nf-text-dim); }
.decode-button:hover { background: var(--color-nf-bg-2); color: var(--color-nf-text); }
.decode-primary { border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; background: var(--color-nf-accent); color: var(--color-nf-accent-ink); }
.decode-input { display: block; width: 100%; min-height: 36px; border: 1px solid var(--color-nf-border-strong); border-radius: 8px; padding: 8px 10px; background: var(--color-nf-bg-0); color: var(--color-nf-text); font-size: 13px; }
.decode-button:disabled, .decode-primary:disabled { opacity: .5; cursor: not-allowed; }
.decode-button:focus-visible, .decode-primary:focus-visible, .decode-input:focus-visible { outline: 2px solid var(--color-nf-accent); outline-offset: 3px; }
@media (max-width: 640px) { .decode-input { font-size: 16px; } }
</style>
