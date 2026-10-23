<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ModelPreferenceSelect from "../generation/ModelPreferenceSelect.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{ workspaceId: string; novelId: string }>();
const emit = defineEmits<{ changed: [coverUrl: string | null] }>();
const { api } = useApi(); const { t } = useLocale();
type Candidate = { id: string; slot: number; state: string; imageUrl: string | null; payloadExpiredAt?: string | null; canDelete?: boolean; errorCategory?: string | null; resumeExisting?: boolean; progress?: { queuePosition?: number; waitSeconds?: number } | null };
type Batch = { id: string; count: number; status: string; expectedCoverHash: string | null; enqueueError?: boolean; items: Candidate[]; prompt?: string; notes?: string; style?: string; preferredModelRef?: string | null };
type Brief = { prompt: string; sourceFingerprint: string; expectedCoverHash: string | null; coverUrl: string | null; recommendedStyles: string[] };
type CoverVersion = { id: string; number: number; sha256: string | null; payloadExpiredAt?: string | null };
const styles = ["3d", "artistic", "sketch", "2d", "manga", "manhua", "manhwa", "custom"];
const base = computed(() => `/workspaces/${encodeURIComponent(props.workspaceId)}/novels/${encodeURIComponent(props.novelId)}`);
const brief = ref<Brief | null>(null), prompt = ref(""), notes = ref(""), count = ref(1), style = ref("manhwa"), model = ref("");
const batch = ref<Batch | null>(null), batches = ref<{ id: string; count: number; style: string }[]>([]), history = ref<CoverVersion[]>([]);
const selected = ref(""), error = ref(""), notice = ref(""), loading = ref(true), busy = ref(false), pendingRequest = ref<string | null>(null);
const confirmation = ref<{ kind: "apply" | "retry" | "check" | "restore" | "remove"; id: string } | null>(null);
let epoch = 0, batchSequence = 0; let timer: ReturnType<typeof setTimeout> | undefined;
let journalKey: string | null = null;
function savePending(value: string | null) {
  pendingRequest.value = value;
  try { if (journalKey) { if (value) sessionStorage.setItem(journalKey, value); else sessionStorage.removeItem(journalKey); } }
  catch { /* In-memory recovery still works when browser storage is unavailable. */ }
}
const active = computed(() => batch.value && ["PENDING", "RUNNING"].includes(batch.value.status));
const locked = computed(() => busy.value || !!pendingRequest.value || !!active.value);
const dialogBody = computed(() => t(`coverGeneration.${confirmation.value?.kind === "remove" ? "removeWarning" : confirmation.value?.kind === "check" ? "checkWarning" : confirmation.value?.kind === "retry" ? "retryWarning" : confirmation.value?.kind === "restore" ? "restoreWarning" : "applyWarning"}`));
function itemMessage(item: Candidate) {
  if (item.state === "UNCERTAIN") return t("coverGeneration.itemUncertain");
  const keys: Record<string, string> = { RATE_LIMIT: "itemRateLimited", INVALID_REQUEST: "itemInvalidResponse", AUTH: "itemProviderAccess" };
  return t(`coverGeneration.${keys[item.errorCategory ?? ""] ?? "itemFailed"}`);
}
function message(cause: unknown) {
  if (cause instanceof ApiError) {
    if (["COVER_IMAGE_EXPIRED", "COVER_VERSION_EXPIRED"].includes(cause.code)) return t("coverGeneration.imageExpired");
    if (cause.code === "COVER_IMAGE_PROTECTED") return t("coverGeneration.imageProtected");
    if (cause.code === "COVER_SOURCE_CHANGED") return t("coverGeneration.sourceChanged");
    if (["COVER_CHANGED", "COVER_ALREADY_REPLACED"].includes(cause.code)) return t("coverGeneration.coverChanged");
    if (["COVER_MODEL_UNAVAILABLE", "NO_ROUTE"].includes(cause.code)) return t("coverGeneration.modelUnavailable");
    if (cause.status === 403 || cause.status === 404) return t("coverGeneration.noAccess");
    if (cause.code === "COVER_STILL_RUNNING") return t("coverGeneration.stillRunning");
  }
  return t("coverGeneration.actionFailed");
}
function stopPoll() { if (timer) clearTimeout(timer); timer = undefined; }
function schedule() { stopPoll(); if (active.value) timer = setTimeout(() => { void refreshBatch(); }, 2500); }
async function refreshBatch(id = batch.value?.id) {
  if (!id) return; const current = epoch, request = ++batchSequence;
  try { const result = await api<Batch>(`${base.value}/cover-generations/${id}`); if (current !== epoch || request !== batchSequence) return;
    if (batch.value?.id !== result.id && !pendingRequest.value) {
      if (result.prompt !== undefined) prompt.value = result.prompt;
      if (result.notes !== undefined) notes.value = result.notes;
      if (result.style !== undefined) style.value = result.style;
      if (result.preferredModelRef !== undefined) model.value = result.preferredModelRef ?? "";
      count.value = result.count;
    }
    batch.value = result; schedule(); }
  catch (cause) { if (current === epoch) { stopPoll(); error.value = message(cause); } }
}
async function refreshContext() {
  const current = epoch;
  try { const result = await api<Brief>(`${base.value}/cover-brief`); if (current === epoch) { brief.value = result; notice.value = t("coverGeneration.contextRefreshed"); } }
  catch (cause) { if (current === epoch) error.value = message(cause); }
}
async function load() {
  const current = ++epoch; stopPoll(); loading.value = true; error.value = ""; notice.value = ""; batch.value = null; selected.value = ""; pendingRequest.value = null; confirmation.value = null;
  brief.value = null; batches.value = []; history.value = []; busy.value = false; journalKey = null;
  prompt.value = ""; notes.value = ""; model.value = ""; count.value = 1;
  try {
    const [context, saved, versions, session] = await Promise.all([api<Brief>(`${base.value}/cover-brief`), api<typeof batches.value>(`${base.value}/cover-generations`), api<CoverVersion[]>(`${base.value}/cover-history`), api<{ userId: string }>("/auth/session")]);
    if (current !== epoch) return; brief.value = context; prompt.value = context.prompt; batches.value = saved; history.value = versions;
    if (typeof session.userId === "string") {
      journalKey = `nf-cover-request:${session.userId}:${props.workspaceId}:${props.novelId}`;
      try {
        const stored = sessionStorage.getItem(journalKey);
        if (stored) {
          const draft = JSON.parse(stored);
          if (typeof draft.prompt === "string" && draft.prompt.length <= 16000 && typeof draft.notes === "string" && draft.notes.length <= 4000 && typeof draft.idempotencyKey === "string" && Number.isInteger(draft.count) && draft.count >= 1 && draft.count <= 9 && styles.includes(draft.style)) {
            pendingRequest.value = stored; prompt.value = draft.prompt; notes.value = draft.notes; count.value = draft.count; style.value = draft.style; model.value = draft.preferredModelRef ?? ""; error.value = t("coverGeneration.requestUncertain");
          } else sessionStorage.removeItem(journalKey);
        }
      } catch { /* Storage is optional; never replay an unreadable journal. */ }
    }
    if (saved[0]) await refreshBatch(saved[0].id);
  } catch (cause) { if (current === epoch) error.value = message(cause); }
  finally { if (current === epoch) loading.value = false; }
}
async function generate(recover = false) {
  if (busy.value || !brief.value) return;
  if (!recover && (!Number.isInteger(count.value) || count.value < 1 || count.value > 9 || !prompt.value.trim())) { error.value = t("coverGeneration.invalidInput"); return; }
  const current = epoch; busy.value = true; error.value = ""; notice.value = "";
  if (!recover) savePending(JSON.stringify({ count: count.value, style: style.value, notes: notes.value, prompt: prompt.value, ...(model.value ? { preferredModelRef: model.value } : {}), idempotencyKey: crypto.randomUUID(), expectedSourceFingerprint: brief.value.sourceFingerprint }));
  try {
    const result = await api<Batch>(`${base.value}/cover-generations`, { method: "POST", body: pendingRequest.value! });
    if (current !== epoch) return; batch.value = result; selected.value = ""; savePending(null);
    if (!batches.value.some(saved => saved.id === result.id)) batches.value.unshift({ id: result.id, count: result.count, style: style.value }); schedule();
  } catch (cause) {
    if (current !== epoch) return;
    if (cause instanceof ApiError && cause.status < 500) { savePending(null); error.value = message(cause); }
    else error.value = t("coverGeneration.requestUncertain");
  } finally { if (current === epoch) busy.value = false; }
}
async function change(action: "cancel" | "resume") {
  if (!batch.value || busy.value) return; const current = epoch; busy.value = true; error.value = "";
  try { const result = await api<Batch>(`${base.value}/cover-generations/${batch.value.id}/${action}`, { method: "POST" }); if (current === epoch) { batch.value = result; schedule(); } }
  catch (cause) { if (current === epoch) error.value = message(cause); }
  finally { if (current === epoch) busy.value = false; }
}
async function confirm() {
  const action = confirmation.value; if (!action || busy.value || !brief.value) return;
  batchSequence++; stopPoll();
  const current = epoch; busy.value = true; error.value = "";
  try {
    if (action.kind === "remove") {
      const result = await api<Batch>(`${base.value}/cover-generations/${batch.value!.id}/items/${action.id}`, { method: "DELETE" });
      if (current !== epoch) return;
      batch.value = result; if (selected.value === action.id) selected.value = "";
      notice.value = t("coverGeneration.removed");
    } else if (action.kind === "retry" || action.kind === "check") {
      const result = await api<Batch>(`${base.value}/cover-generations/${batch.value!.id}/items/${action.id}/retry`, { method: "POST", body: JSON.stringify({ acknowledgeUncertain: action.kind === "retry" }) });
      if (current !== epoch) return; batch.value = result; schedule();
    } else {
      const url = action.kind === "apply" ? `${base.value}/cover-generations/${batch.value!.id}/items/${action.id}/apply` : `${base.value}/cover-history/${action.id}/restore`;
      const result = await api<{ coverUrl: string | null; sha256: string | null }>(url, { method: "POST", body: JSON.stringify({ expectedCoverHash: brief.value.expectedCoverHash }) });
      if (current !== epoch) return; brief.value = { ...brief.value, expectedCoverHash: result.sha256, coverUrl: result.coverUrl }; emit("changed", result.coverUrl); notice.value = t("coverGeneration.applied");
      const versions = await api<CoverVersion[]>(`${base.value}/cover-history`); if (current !== epoch) return; history.value = versions;
      await refreshBatch();
    }
    confirmation.value = null;
  } catch (cause) { if (current === epoch) error.value = message(cause); }
  finally { if (current === epoch) busy.value = false; }
}
watch(() => [props.workspaceId, props.novelId], load, { immediate: true });
onUnmounted(() => { epoch++; stopPoll(); });
</script>

<template>
  <section class="space-y-6" data-testid="novel-cover-editor" :aria-label="t('workspace.nav.cover')">
    <p class="text-sm leading-relaxed text-nf-text-dim">{{ t('coverGeneration.description') }}</p>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-if="error" role="alert" class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-3 text-sm text-nf-warn">{{ error }}</div>
    <p v-if="notice" role="status" class="text-sm text-nf-success">{{ notice }}</p>
    <button v-if="!loading && !brief" type="button" class="nf-cover-button" @click="load">{{ t('common.retry') }}</button>
    <template v-if="!loading && brief">
      <div class="flex items-start gap-4 rounded-xl border border-nf-border bg-nf-bg-0 p-4">
        <img v-if="brief.coverUrl" :src="brief.coverUrl" :alt="t('coverGeneration.currentCover')" class="aspect-[2/3] w-24 rounded-lg object-cover" />
        <div v-else class="flex aspect-[2/3] w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-nf-border p-2 text-center text-xs text-nf-text-faint">{{ t('coverGeneration.noCover') }}</div>
        <div><h3 class="font-nf-literary text-lg text-nf-text">{{ t('coverGeneration.currentCover') }}</h3><p class="mt-2 text-xs leading-relaxed text-nf-text-dim">{{ t('coverGeneration.preserveCurrent') }}</p></div>
      </div>
      <form class="space-y-4" @submit.prevent="generate()">
        <ModelPreferenceSelect v-model="model" :workspace-id="workspaceId" profile="IMAGE_GENERATOR" :disabled="locked" :field-label="t('coverGeneration.model')" :hint="t('coverGeneration.modelHint')" />
        <fieldset :disabled="locked" class="space-y-2"><legend class="mb-2 text-sm font-semibold text-nf-text">{{ t('coverGeneration.style') }}</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label v-for="option in styles" :key="option" class="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors" :class="style === option ? 'border-nf-accent bg-nf-accent/10 text-nf-text' : 'border-nf-border bg-nf-bg-0 text-nf-text-dim hover:border-nf-border-strong'">
              <span class="flex items-center gap-2"><input v-model="style" type="radio" name="cover-style" :value="option" class="accent-nf-accent" />{{ t(`coverGeneration.styles.${option}`) }}</span>
              <span v-if="brief.recommendedStyles.includes(option)" data-testid="cover-recommendation" class="w-fit rounded-full border border-nf-accent/30 bg-nf-accent/10 px-2 py-0.5 text-[10px] text-nf-accent" :title="t('coverGeneration.recommendationReason')">{{ t('coverGeneration.recommended') }}</span>
            </label>
          </div>
        </fieldset>
        <label class="block text-sm text-nf-text-dim">{{ t('coverGeneration.count') }}<input v-model.number="count" data-testid="cover-count" type="number" min="1" max="9" step="1" required :disabled="locked" class="nf-cover-input mt-1 w-24" /></label>
        <label class="block text-sm text-nf-text-dim">{{ t('coverGeneration.prompt') }}<textarea v-model="prompt" data-testid="cover-prompt" rows="7" maxlength="16000" required :disabled="locked" class="nf-cover-input mt-1 w-full resize-y" /></label>
        <label class="block text-sm text-nf-text-dim">{{ t('coverGeneration.notes') }}<textarea v-model="notes" data-testid="cover-notes" rows="3" maxlength="4000" :disabled="locked" :placeholder="t('coverGeneration.notesPlaceholder')" class="nf-cover-input mt-1 w-full resize-y" /></label>
        <div class="flex flex-wrap gap-2">
          <button type="submit" :disabled="locked" class="nf-cover-button border-nf-accent/50 bg-nf-accent/15 text-nf-accent">{{ t('coverGeneration.generate') }}</button>
          <button type="button" :disabled="locked" class="nf-cover-button" @click="refreshContext">{{ t('coverGeneration.refreshContext') }}</button>
          <button v-if="pendingRequest" type="button" data-testid="cover-recover-request" :disabled="busy" class="nf-cover-button" @click="generate(true)">{{ t('coverGeneration.recoverRequest') }}</button>
        </div>
      </form>
      <section v-if="batch" aria-labelledby="cover-results-heading" class="space-y-3 border-t border-nf-border pt-5">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 id="cover-results-heading" class="font-nf-literary text-lg">{{ t('coverGeneration.results') }}</h3><span role="status" class="rounded-full border border-nf-border bg-nf-bg-2 px-2 py-1 text-xs">{{ t(`coverGeneration.states.${batch.status}`) }}</span></div>
        <div class="flex flex-wrap gap-2"><button type="button" class="nf-cover-button" :disabled="busy" @click="refreshBatch()">{{ t('coverGeneration.refreshResults') }}</button><button v-if="active" type="button" class="nf-cover-button" :disabled="busy" @click="change('cancel')">{{ t('coverGeneration.cancel') }}</button><button v-if="batch.enqueueError" type="button" class="nf-cover-button" :disabled="busy" @click="change('resume')">{{ t('coverGeneration.resume') }}</button></div>
        <p v-if="batch.enqueueError" class="text-sm text-nf-warn">{{ t('coverGeneration.queueFailed') }}</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <article v-for="item in batch.items" :key="item.id" class="min-w-0 rounded-xl border bg-nf-bg-0 p-2" :class="selected === item.id ? 'border-nf-accent ring-1 ring-nf-accent/30' : 'border-nf-border'">
            <label v-if="item.imageUrl" class="block cursor-pointer"><img :src="item.imageUrl" :alt="t('coverGeneration.candidate', { slot: item.slot })" class="aspect-[2/3] w-full rounded-lg object-cover" loading="lazy" /><span class="mt-2 flex items-center gap-2 text-xs"><input v-model="selected" :data-testid="`cover-candidate-${item.id}`" type="radio" name="cover-candidate" :value="item.id" class="accent-nf-accent" />{{ t('coverGeneration.candidate', { slot: item.slot }) }}</span></label>
            <div v-else class="flex aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-nf-border p-2 text-center text-xs text-nf-text-dim">{{ t(item.payloadExpiredAt ? 'coverGeneration.payloadRemoved' : `coverGeneration.states.${item.state}`) }}</div>
            <button v-if="item.canDelete && item.imageUrl" type="button" :data-testid="`cover-remove-${item.id}`" class="nf-cover-button mt-2 w-full text-xs" :disabled="busy || !!active" @click="confirmation = { kind: 'remove', id: item.id }">{{ t('coverGeneration.removeCandidate') }}</button>
            <p v-if="item.errorCategory" class="mt-2 text-xs leading-relaxed text-nf-warn">{{ itemMessage(item) }}</p>
            <p v-if="item.progress?.queuePosition !== undefined" class="mt-2 text-xs text-nf-text-dim">{{ t('coverGeneration.queuePosition', { position: item.progress.queuePosition }) }}</p>
            <p v-if="item.progress?.waitSeconds !== undefined" class="mt-1 text-xs text-nf-text-dim">{{ t('coverGeneration.estimatedWait', { minutes: Math.ceil(item.progress.waitSeconds / 60) }) }}</p>
            <button v-if="['FAILED', 'UNCERTAIN'].includes(item.state)" type="button" class="nf-cover-button mt-2 w-full text-xs" :disabled="busy || !!active" @click="confirmation = { kind: item.resumeExisting ? 'check' : 'retry', id: item.id }">{{ t(item.resumeExisting ? 'coverGeneration.checkExisting' : 'common.retry') }}</button>
          </article>
        </div>
        <button type="button" class="nf-cover-button border-nf-accent/50 bg-nf-accent/15 text-nf-accent" :disabled="busy || !selected" @click="confirmation = { kind: 'apply', id: selected }">{{ t('coverGeneration.apply') }}</button>
      </section>
      <details v-if="batches.length" class="rounded-xl border border-nf-border p-3"><summary class="cursor-pointer text-sm text-nf-text-dim">{{ t('coverGeneration.previousBatches') }}</summary><div class="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto"><button v-for="(saved, index) in batches" :key="saved.id" type="button" class="nf-cover-button text-left" :disabled="busy || !!active" @click="selected = ''; refreshBatch(saved.id)">{{ t('coverGeneration.batch', { number: batches.length - index, count: saved.count }) }}</button></div></details>
      <details v-if="history.length" class="rounded-xl border border-nf-border p-3"><summary class="cursor-pointer text-sm text-nf-text-dim">{{ t('coverGeneration.history') }}</summary><p class="mt-2 text-xs leading-relaxed text-nf-text-dim">{{ t('coverGeneration.retentionHint') }}</p><ol class="mt-3 max-h-48 space-y-2 overflow-y-auto"><li v-for="version in history" :key="version.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-nf-bg-0 p-2 text-xs"><span>{{ t(version.sha256 ? 'coverGeneration.version' : 'coverGeneration.emptyVersion', { number: version.number }) }}<span v-if="version.payloadExpiredAt" class="ml-2 text-nf-text-dim">{{ t('coverGeneration.payloadRemoved') }}</span></span><button type="button" class="nf-cover-button" :disabled="busy || !!version.payloadExpiredAt" @click="confirmation = { kind: 'restore', id: version.id }">{{ t('coverGeneration.restore') }}</button></li></ol></details>
    </template>
    <ConfirmDialog :open="!!confirmation" :title="t('coverGeneration.confirmTitle')" :body="dialogBody" :confirm-label="t('coverGeneration.confirm')" :cancel-label="t('common.cancel')" :busy="busy" :error="error" @confirm="confirm" @cancel="confirmation = null" />
  </section>
</template>

<style scoped>
.nf-cover-input { border: 1px solid var(--color-nf-border-strong); border-radius: 8px; background: var(--color-nf-bg-0); padding: 10px 12px; color: var(--color-nf-text); font-size: 13px; }
.nf-cover-button { border: 1px solid var(--color-nf-border-strong); border-radius: 8px; padding: 8px 12px; font-size: 12px; transition: background .15s; }
.nf-cover-button:hover:not(:disabled) { background: var(--color-nf-bg-2); }
.nf-cover-input:focus-visible, .nf-cover-button:focus-visible { outline: 2px solid var(--color-nf-accent); outline-offset: 3px; }
.nf-cover-input:disabled, .nf-cover-button:disabled { opacity: .5; cursor: not-allowed; }
</style>
