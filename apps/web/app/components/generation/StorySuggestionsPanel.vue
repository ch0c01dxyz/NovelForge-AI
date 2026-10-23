<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";
import StoryIdentitySelect from "./StoryIdentitySelect.vue";
interface Member { name: string; quote: string; role: "MEMBER" | "LEADER"; characterId?: string }
interface Candidate {
  id: string; kind: "GROUP" | "RESEARCH"; name: string; summary: string; quotes: string[];
  status: "PENDING" | "APPROVED" | "REJECTED"; version: number; members?: Member[];
  mode?: string; existingEntityId?: string; referenceVersionId?: string; supportingQuote?: string;
}
interface View {
  id: string; runId: string; chapterId: string; status: string; candidates: Candidate[];
  canManage: boolean; canApprove: boolean; canManageReferences: boolean; blockedReason: string | null;
  expectedBranchId: string; expectedHeadRevisionId: string | null; expectedChapterVersionId: string | null;
}
const props = defineProps<{ workspaceId: string; novelId: string; chapterId: string; runId: string; currentVersion: number | null; runStatus?: string }>();
const { api } = useApi(), { t } = useLocale();
const data = ref<View | null>(null), loading = ref(false), busy = ref(false), error = ref("");
const editing = ref<Candidate | null>(null), confirmation = ref<{ retry?: boolean; candidate?: Candidate } | null>(null);
let epoch = 0, readEpoch = 0, timer: ReturnType<typeof setTimeout> | undefined;
const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}`;
const endpoint = () => `${base()}/runs/${props.runId}/story-discovery`;
function accept(view: View | null) {
  data.value = view?.runId === props.runId && view.chapterId === props.chapterId ? view : null;
  clearTimeout(timer);
  if (data.value?.status === "RUNNING") timer = setTimeout(() => { void read(); }, 2500);
}
async function read() {
  const scope = epoch, stamp = ++readEpoch; loading.value = true;
  try { const result = await api<View | null>(endpoint()); if (scope === epoch && stamp === readEpoch) accept(result); }
  catch { if (scope === epoch && stamp === readEpoch) error.value = t('storySuggestions.failed'); }
  finally { if (scope === epoch && stamp === readEpoch) loading.value = false; }
}
watch(() => [props.workspaceId, props.novelId, props.chapterId, props.runId], () => {
  epoch++; clearTimeout(timer); data.value = null; editing.value = null; confirmation.value = null; error.value = ""; busy.value = false; void read();
}, { immediate: true });
watch(() => [props.currentVersion, props.runStatus], () => { void read(); });
onUnmounted(() => { epoch++; readEpoch++; clearTimeout(timer); });
function edit(candidate: Candidate) { editing.value = JSON.parse(JSON.stringify(candidate)); error.value = ""; }
const errors: Record<string, string> = {
  STORY_CHARACTER_UNRESOLVED: 'characterNeeded', STORY_IDENTITY_AMBIGUOUS: 'identityNeeded',
  STORY_AFFILIATION_CONFLICT: 'affiliationConflict', STORY_REFERENCE_REQUIRED: 'referenceNeeded',
  STORY_REFERENCE_UNSUPPORTED: 'quoteNeeded', STORY_SOURCE_CHANGED: 'sourceChanged',
};
async function mutate(action: "analyze" | "retry" | "edit" | "approve" | "reject", candidate?: Candidate) {
  if (busy.value) return;
  const scope = epoch, view = data.value;
  if (!["analyze", "retry"].includes(action) && (!view || !candidate)) return;
  let body: unknown = action === "retry" ? { retry: true } : {};
  if (candidate) body = { expectedVersion: candidate.version };
  if (action === "approve") body = { expectedVersion: candidate!.version, expectedBranchId: view!.expectedBranchId, expectedHeadRevisionId: view!.expectedHeadRevisionId, expectedChapterVersionId: view!.expectedChapterVersionId };
  if (action === "edit") {
    const c = editing.value!;
    body = { expectedVersion: c.version, edit: { name: c.name, summary: c.summary,
      ...(c.kind === "GROUP" ? { existingEntityId: c.existingEntityId || null, members: c.members?.map(m => ({ ...m, characterId: m.characterId || undefined })) } : { mode: c.mode, referenceVersionId: c.referenceVersionId || null, supportingQuote: c.supportingQuote ?? "" }) } };
  }
  const url = ["analyze", "retry"].includes(action) ? endpoint() : `${base()}/story-discoveries/${view!.id}/candidates/${candidate!.id}${action === "edit" ? "" : `/${action}`}`;
  busy.value = true; error.value = ""; readEpoch++; clearTimeout(timer);
  try {
    const result = await api<View>(url, { method: action === "edit" ? "PATCH" : "POST", body: JSON.stringify(body) });
    if (scope !== epoch) return;
    readEpoch++; accept(result); editing.value = null; confirmation.value = null;
  } catch (e) {
    if (scope !== epoch) return;
    const key = e instanceof ApiError ? errors[e.code] ?? (e.status === 409 ? 'changed' : e.status === 403 ? 'noAccess' : 'failed') : 'failed';
    error.value = t(`storySuggestions.${key}`); confirmation.value = null;
    await read();
  } finally { if (scope === epoch) busy.value = false; }
}
function confirm() { const c = confirmation.value; if (c) void mutate(c.retry ? "retry" : "approve", c.candidate); }
</script>

<template>
  <section class="mt-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4" :aria-label="t('storySuggestions.title')">
    <h3 class="text-sm font-semibold text-nf-text">{{ t('storySuggestions.title') }}</h3>
    <p class="mt-1 text-xs leading-relaxed text-nf-text-dim">{{ t('storySuggestions.description') }}</p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-nf-error">{{ error }}</p>
    <p v-if="loading || data?.status === 'RUNNING'" role="status" class="mt-3 text-sm text-nf-text-dim">{{ t('common.loading') }}</p>
    <button v-if="!data && !loading" type="button" class="nf-btn mt-3" :disabled="busy" @click="mutate('analyze')">{{ t('storySuggestions.analyze') }}</button>
    <template v-if="data && ['FAILED', 'UNCERTAIN'].includes(data.status)">
      <p class="mt-3 text-xs text-nf-text-dim">{{ t('storySuggestions.interrupted') }}</p>
      <button type="button" class="nf-btn mt-2" :disabled="busy || !data.canManage" @click="confirmation = { retry: true }">{{ t('common.retry') }}</button>
    </template>
    <template v-if="data?.status === 'SUCCEEDED'">
      <p v-if="!data.candidates.length" class="mt-3 text-sm text-nf-text-dim">{{ t('storySuggestions.empty') }}</p>
      <p v-else-if="data.blockedReason" class="mt-3 text-xs text-nf-warn">{{ t(data.blockedReason === 'APPLY_DRAFT_FIRST' ? 'newCharacters.applyFirst' : 'storySuggestions.sourceChanged') }}</p>
      <article v-for="candidate in data.candidates" :key="candidate.id" class="mt-3 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <span class="rounded border border-nf-border px-2 py-1 text-[11px] text-nf-accent-hi">{{ t(`storySuggestions.${candidate.kind === 'GROUP' ? 'group' : candidate.mode || 'NEEDS_SOURCE'}`) }}</span>
        <template v-if="editing?.id !== candidate.id">
          <h4 class="mt-2 text-sm font-semibold">{{ candidate.name }}</h4><p class="mt-1 whitespace-pre-wrap text-sm text-nf-text-dim">{{ candidate.summary }}</p>
          <p v-for="member in candidate.members" :key="member.name" class="mt-2 text-xs">{{ member.name }} · {{ t(`storySuggestions.${member.role}`) }}</p>
          <p v-if="candidate.existingEntityId || candidate.referenceVersionId" class="mt-2 text-xs text-nf-accent-hi">{{ t('storySuggestions.linked') }}</p>
        </template>
        <form v-else class="mt-3 space-y-3" @submit.prevent="mutate('edit', candidate)">
          <fieldset :disabled="busy" class="space-y-3">
          <label class="block text-xs">{{ t('storySuggestions.name') }}<input v-model="editing.name" required maxlength="300" class="nf-input mt-1 w-full" /></label>
          <label class="block text-xs">{{ t('newCharacters.summary') }}<textarea v-model="editing.summary" required maxlength="2000" rows="3" class="nf-input mt-1 w-full" /></label>
          <template v-if="editing.kind === 'GROUP'">
            <StoryIdentitySelect v-model="editing.existingEntityId" :base="base()" kind="GROUP" :label="t('storySuggestions.existingGroup')" :disabled="busy" />
            <div v-for="(member, i) in editing.members" :key="i" class="space-y-2 rounded border border-nf-border p-2">
              <StoryIdentitySelect :model-value="member.characterId ?? ''" :base="base()" kind="CHARACTER" :label="`${t('storySuggestions.character')}: ${member.name}`" :disabled="busy" @update:model-value="member.characterId = $event" />
              <label class="block text-xs">{{ t('storySuggestions.role') }}<select v-model="member.role" class="nf-input mt-1 w-full"><option value="MEMBER">{{ t('storySuggestions.MEMBER') }}</option><option value="LEADER">{{ t('storySuggestions.LEADER') }}</option></select></label>
              <blockquote class="text-xs text-nf-text-dim">{{ member.quote }}</blockquote>
            </div>
          </template>
          <template v-else>
            <label class="block text-xs">{{ t('storySuggestions.sourceType') }}<select v-model="editing.mode" class="nf-input mt-1 w-full"><option v-for="mode in ['NEEDS_SOURCE', 'FICTIONAL_ADAPTATION', 'REAL_REFERENCE']" :key="mode" :value="mode">{{ t(`storySuggestions.${mode}`) }}</option></select></label>
            <StoryIdentitySelect v-model="editing.referenceVersionId" :base="base()" kind="REFERENCE" :label="t('storySuggestions.existingReference')" :disabled="busy" />
            <label v-if="editing.referenceVersionId" class="block text-xs">{{ t('storySuggestions.supportingQuote') }}<textarea v-model="editing.supportingQuote" required maxlength="2000" rows="3" class="nf-input mt-1 w-full" /></label>
          </template>
          <div class="flex flex-wrap gap-2"><button class="nf-btn nf-btn-primary" type="submit" :disabled="busy">{{ t('newCharacters.save') }}</button><button class="nf-btn" type="button" :disabled="busy" @click="editing = null">{{ t('newCharacters.cancel') }}</button></div>
          </fieldset>
        </form>
        <details class="mt-3 text-xs text-nf-text-dim"><summary class="cursor-pointer">{{ t('newCharacters.evidence') }}</summary><blockquote v-for="(quote, i) in candidate.quotes" :key="i" class="mt-2 border-l-2 border-nf-accent pl-3">{{ quote }}</blockquote></details>
        <div v-if="candidate.status === 'PENDING' && editing?.id !== candidate.id" class="mt-3 flex flex-wrap gap-2">
          <button type="button" :data-testid="`story-approve-${candidate.id}`" class="nf-btn nf-btn-primary" :disabled="busy || !!data.blockedReason || !(candidate.kind === 'GROUP' ? data.canApprove : data.canManageReferences)" @click="confirmation = { candidate }">{{ t('newCharacters.approve') }}</button>
          <button type="button" :data-testid="`story-edit-${candidate.id}`" class="nf-btn" :disabled="busy || !data.canManage" @click="edit(candidate)">{{ t('newCharacters.edit') }}</button>
          <button type="button" :data-testid="`story-reject-${candidate.id}`" class="nf-btn" :disabled="busy || !data.canManage" @click="mutate('reject', candidate)">{{ t('newCharacters.reject') }}</button>
        </div>
        <p v-else-if="candidate.status !== 'PENDING'" role="status" class="mt-3 text-xs text-nf-text-dim">{{ t(`storySuggestions.${candidate.status}`) }}</p>
      </article>
    </template>
    <ConfirmDialog :open="!!confirmation" :busy="busy" :title="t(confirmation?.retry ? 'common.retry' : 'newCharacters.approve')" :body="t(confirmation?.retry ? 'newCharacters.retryWarning' : confirmation?.candidate?.kind === 'GROUP' ? 'storySuggestions.approveGroup' : 'storySuggestions.approveResearch')" :confirm-label="t(confirmation?.retry ? 'common.retry' : 'newCharacters.approve')" :cancel-label="t('newCharacters.cancel')" @confirm="confirm" @cancel="confirmation = null" />
  </section>
</template>

<style scoped>
.nf-btn { min-height: 36px; border: 1px solid var(--color-nf-border-strong); border-radius: 8px; background: var(--color-nf-bg-3); padding: 7px 12px; font-size: 13px; color: var(--color-nf-text); }
.nf-btn:enabled:hover { border-color: var(--color-nf-border-focus); }
.nf-btn:focus-visible { outline: 2px solid var(--color-nf-accent-hi); outline-offset: 2px; }
.nf-btn-primary { background: var(--color-nf-accent); color: var(--color-nf-accent-ink); font-weight: 600; }
.nf-btn:disabled { opacity: .5; }
</style>
