<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";

interface Candidate { id: string; name: string; summary: string; quotes: string[]; status: string; version: number; conflict?: string | null }
interface View { id: string; runId: string; chapterId: string; status: string; candidates: Candidate[]; canApprove: boolean; blockedReason: string | null; sourceBranchId: string; expectedHeadRevisionId: string | null; expectedChapterVersionId: string | null }
const props = defineProps<{ workspaceId: string; novelId: string; chapterId: string; runId: string; currentVersion: number | null; runStatus?: string }>();
const { api } = useApi(), { t } = useLocale();
const data = ref<View | null>(null), busy = ref(false), loading = ref(false), error = ref("");
const editId = ref<string | null>(null), name = ref(""), summary = ref("");
const confirmation = ref<{ action: "approve" | "retry"; candidate?: Candidate } | null>(null);
let epoch = 0, readEpoch = 0, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}`;
const endpoint = () => `${base()}/runs/${props.runId}/character-discovery`;
const valid = (scope: number) => !disposed && scope === epoch;
function accept(result: View | null, scope: number) {
  if (!valid(scope)) return;
  data.value = result?.runId === props.runId && result.chapterId === props.chapterId ? result : null;
  clearTimeout(timer);
  if (data.value?.status === "RUNNING") timer = setTimeout(() => { void read(false); }, 2500);
}
async function read(detect: boolean) {
  const scope = epoch, stamp = ++readEpoch, url = endpoint();
  loading.value = true;
  try {
    let result = await api<View | null>(url);
    if (!valid(scope) || stamp !== readEpoch) return;
    if (!result && detect) result = await api<View>(url, { method: "POST", body: JSON.stringify({}) });
    if (stamp === readEpoch) accept(result, scope);
  } catch (e) { if (valid(scope)) error.value = t(e instanceof ApiError && e.status === 403 ? "newCharacters.noAccess" : "newCharacters.failed"); }
  finally { if (valid(scope)) loading.value = false; }
}
watch(() => [props.workspaceId, props.novelId, props.chapterId, props.runId], () => {
  epoch++; clearTimeout(timer); data.value = null; editId.value = null; confirmation.value = null; error.value = ""; busy.value = false;
  void read(true);
}, { immediate: true });
watch(() => [props.currentVersion, props.runStatus], () => { void read(false); });
onUnmounted(() => { disposed = true; epoch++; clearTimeout(timer); });
function edit(candidate: Candidate) { editId.value = candidate.id; name.value = candidate.name; summary.value = candidate.summary; error.value = ""; }
async function mutate(action: "edit" | "approve" | "reject" | "retry", candidate?: Candidate) {
  if (busy.value || !data.value) return;
  const scope = epoch;
  const body = action === "retry" ? { retry: true } : action === "edit" ? { expectedVersion: candidate!.version, name: name.value.trim(), summary: summary.value.trim() } : action === "approve" ? { expectedVersion: candidate!.version, expectedHeadRevisionId: data.value.expectedHeadRevisionId, expectedChapterVersionId: data.value.expectedChapterVersionId, expectedBranchId: data.value.sourceBranchId } : { expectedVersion: candidate!.version };
  const url = action === "retry" ? endpoint() : `${base()}/character-discoveries/${data.value.id}/candidates/${candidate!.id}${action === "edit" ? "" : `/${action}`}`;
  busy.value = true; error.value = ""; readEpoch++; clearTimeout(timer);
  try {
    const result = await api<View>(url, { method: action === "edit" ? "PATCH" : "POST", body: JSON.stringify(body) });
    if (!valid(scope)) return;
    readEpoch++; accept(result, scope); editId.value = null; confirmation.value = null;
  } catch (e) {
    if (!valid(scope)) return;
    error.value = t(e instanceof ApiError && e.status === 409 ? "newCharacters.changed" : "newCharacters.failed");
    confirmation.value = null;
    // A lost response may already have committed. Read, never resend automatically.
    await read(false);
  } finally { if (valid(scope)) busy.value = false; }
}
function confirm() { const pending = confirmation.value; if (pending) void mutate(pending.action, pending.candidate); }
const reasonKey = (reason: string | null) => reason === "NO_ACCESS" ? "noAccess" : reason === "APPLY_DRAFT_FIRST" ? "applyFirst" : "sourceChanged";
</script>

<template>
  <section class="mt-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4" :aria-label="t('newCharacters.title')">
    <h3 class="text-sm font-semibold text-nf-text">{{ t('newCharacters.title') }}</h3>
    <p class="mt-1 text-xs leading-relaxed text-nf-text-dim">{{ t('newCharacters.description') }}</p>
    <p v-if="error" role="alert" class="mt-2 text-sm text-nf-error">{{ error }}</p>
    <p v-if="loading || data?.status === 'RUNNING'" role="status" class="mt-3 text-sm text-nf-text-dim">{{ t('newCharacters.loading') }}</p>
    <template v-if="data && ['FAILED', 'UNCERTAIN'].includes(data.status)">
      <p class="mt-3 text-sm text-nf-text-dim">{{ t(data.status === 'UNCERTAIN' ? 'newCharacters.uncertain' : 'newCharacters.failed') }}</p>
      <button type="button" data-testid="character-analysis-retry" class="nf-btn mt-2" :disabled="busy" @click="confirmation = { action: 'retry' }">{{ t('newCharacters.retry') }}</button>
    </template>
    <template v-if="data?.status === 'SUCCEEDED'">
      <p v-if="!data.candidates.length" class="mt-3 text-sm text-nf-text-dim">{{ t('newCharacters.empty') }}</p>
      <p v-else-if="data.blockedReason && data.candidates.some(candidate => candidate.status === 'PENDING')" class="mt-3 text-xs text-nf-warning">{{ t(`newCharacters.${reasonKey(data.blockedReason)}`) }}</p>
      <article v-for="candidate in data.candidates" :key="candidate.id" class="mt-3 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <template v-if="editId !== candidate.id">
          <h4 class="text-sm font-semibold text-nf-text">{{ candidate.name }}</h4>
          <p class="mt-1 whitespace-pre-wrap text-sm text-nf-text-dim">{{ candidate.summary }}</p>
        </template>
        <form v-else class="space-y-3" @submit.prevent="mutate('edit', candidate)">
          <fieldset :disabled="busy" class="space-y-3">
          <label class="block text-xs text-nf-text-dim">{{ t('newCharacters.name') }}<input v-model="name" data-testid="character-name" required maxlength="300" class="nf-input mt-1 w-full" /></label>
          <label class="block text-xs text-nf-text-dim">{{ t('newCharacters.summary') }}<textarea v-model="summary" data-testid="character-summary" required maxlength="2000" rows="3" class="nf-input mt-1 w-full" /></label>
          <div class="flex flex-wrap gap-2"><button type="submit" class="nf-btn nf-btn-primary" :disabled="busy || !name.trim() || !summary.trim()">{{ t('newCharacters.save') }}</button><button type="button" class="nf-btn" :disabled="busy" @click="editId = null">{{ t('newCharacters.cancel') }}</button></div>
          </fieldset>
        </form>
        <details class="mt-2 text-xs text-nf-text-dim"><summary class="cursor-pointer focus-visible:nf-focus">{{ t('newCharacters.evidence') }}</summary><blockquote v-for="(quote, i) in candidate.quotes" :key="i" class="mt-2 border-l-2 border-nf-accent pl-3">{{ quote }}</blockquote></details>
        <p v-if="candidate.conflict" class="mt-2 text-xs text-nf-warning">{{ t(candidate.conflict === 'CHARACTER_EXISTS' ? 'newCharacters.characterExists' : candidate.conflict === 'IDENTITY_AMBIGUOUS' ? 'newCharacters.identityAmbiguous' : 'newCharacters.identityExists') }}</p>
        <div v-if="candidate.status === 'PENDING' && editId !== candidate.id" class="mt-3 flex flex-wrap gap-2">
          <button type="button" :data-testid="`character-approve-${candidate.id}`" class="nf-btn nf-btn-primary" :disabled="busy || !data.canApprove || !!candidate.conflict" @click="confirmation = { action: 'approve', candidate }">{{ t('newCharacters.approve') }}</button>
          <button type="button" :data-testid="`character-edit-${candidate.id}`" class="nf-btn" :disabled="busy || data.blockedReason === 'NO_ACCESS'" @click="edit(candidate)">{{ t('newCharacters.edit') }}</button>
          <button type="button" :data-testid="`character-reject-${candidate.id}`" class="nf-btn text-nf-error" :disabled="busy || data.blockedReason === 'NO_ACCESS'" @click="mutate('reject', candidate)">{{ t('newCharacters.reject') }}</button>
        </div>
        <p v-else-if="candidate.status !== 'PENDING'" role="status" class="mt-2 text-xs text-nf-text-dim">{{ t(candidate.status === 'APPROVED' ? 'newCharacters.approved' : 'newCharacters.rejected') }}</p>
      </article>
    </template>
    <ConfirmDialog :open="confirmation !== null" :busy="busy" :title="t(confirmation?.action === 'retry' ? 'newCharacters.retry' : 'newCharacters.approveTitle')" :body="t(confirmation?.action === 'retry' ? 'newCharacters.retryWarning' : 'newCharacters.approveWarning')" :confirm-label="t(confirmation?.action === 'retry' ? 'newCharacters.retry' : 'newCharacters.approve')" :cancel-label="t('newCharacters.cancel')" @confirm="confirm" @cancel="confirmation = null" />
  </section>
</template>

<style scoped>
.nf-btn { min-height: 36px; border: 1px solid var(--color-nf-border-strong); border-radius: 8px; background: var(--color-nf-bg-3); padding: 7px 12px; font-size: 13px; color: var(--color-nf-text); }
.nf-btn:enabled:hover { background: var(--color-nf-bg-2); border-color: var(--color-nf-border-focus); }
.nf-btn:focus-visible { outline: 2px solid var(--color-nf-accent-hi); outline-offset: 2px; }
.nf-btn-primary { background: var(--color-nf-accent); color: var(--color-nf-accent-ink); font-weight: 600; }
.nf-btn-primary:enabled:hover { background: var(--color-nf-accent-hi); }
.text-nf-warning { color: var(--color-nf-warn); }
</style>
