<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
const props = defineProps<{ workspaceId: string; novelId: string; characterId: string }>();
const emit = defineEmits<{ (event: "linked"): void }>();
interface Candidate { id: string; name: string; key: string }
interface Options {
  character: { id: string; name: string; storyEntityId: string | null };
  branchId: string; headRevisionId: string | null; candidates: Candidate[]; hasMore: boolean;
}
const { api } = useApi(); const { t } = useLocale();
const open = ref(false), loading = ref(false), saving = ref(false), confirming = ref(false), uncertain = ref(false);
const error = ref(""); const query = ref(""); const selected = ref("");
const options = ref<Options | null>(null); const dialog = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const choice = computed(() => options.value?.candidates.find(candidate => candidate.id === selected.value));
const base = () => `/workspaces/${encodeURIComponent(props.workspaceId)}/novels/${encodeURIComponent(props.novelId)}/characters/${encodeURIComponent(props.characterId)}`;
let sequence = 0;
function dismiss() { if (!saving.value) { sequence++; open.value = false; trigger.value?.focus(); } }
function keydown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape") { event.preventDefault(); dismiss(); }
  trapDialogFocus(event, dialog.value);
}
watch(open, async value => {
  if (value) { document.addEventListener("keydown", keydown); await nextTick(); if (open.value) dialog.value?.focus(); }
  else document.removeEventListener("keydown", keydown);
});
function failure(cause: unknown): string {
  if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return t("characterIdentity.forbidden");
  if (cause instanceof ApiError && cause.status === 404) return t("characterIdentity.notFound");
  return t("characterIdentity.loadFailed");
}
async function load(append = false) {
  const request = ++sequence; loading.value = true; error.value = ""; confirming.value = false; selected.value = "";
  const previous = options.value;
  const params = new URLSearchParams({ q: query.value.trim(), take: "50", skip: String(append ? previous?.candidates.length ?? 0 : 0) });
  try {
    const result = await api<Options>(`${base()}/identity-options?${params}`);
    if (request !== sequence) return;
    if (result.character.storyEntityId) { emit("linked"); dismiss(); return; }
    const sameSource = previous?.branchId === result.branchId && previous?.headRevisionId === result.headRevisionId;
    options.value = { ...result, candidates: append && sameSource ? [...previous!.candidates, ...result.candidates] : result.candidates };
    uncertain.value = false;
  } catch (cause) { if (request === sequence) { error.value = failure(cause); options.value = null; } }
  finally { if (request === sequence) loading.value = false; }
}
async function show() {
  options.value = null; query.value = ""; selected.value = ""; uncertain.value = false; confirming.value = false;
  open.value = true; await load();
}
async function review() {
  if (!choice.value) return;
  confirming.value = true; await nextTick();
  dialog.value?.querySelector<HTMLElement>('[data-testid="identity-confirmation"]')?.focus();
}
async function link() {
  if (!options.value || !choice.value || !confirming.value || saving.value || uncertain.value) return;
  const request = ++sequence; saving.value = true; error.value = "";
  try {
    await api(`${base()}/story-entity`, { method: "PUT", body: JSON.stringify({ storyEntityId: choice.value.id, expectedBranchId: options.value.branchId, expectedHeadRevisionId: options.value.headRevisionId }) });
    if (request !== sequence) return;
    saving.value = false; emit("linked"); dismiss();
  } catch (cause) {
    if (request !== sequence) return;
    confirming.value = false; selected.value = "";
    if (cause instanceof ApiError && cause.status === 409) { options.value = null; error.value = t("characterIdentity.conflict"); }
    else if (cause instanceof ApiError && [400, 401, 403, 404].includes(cause.status)) { options.value = null; error.value = failure(cause); }
    else { uncertain.value = true; error.value = t("characterIdentity.uncertain"); }
  } finally { if (request === sequence) saving.value = false; }
}
watch(() => [props.workspaceId, props.novelId, props.characterId], () => { sequence++; open.value = false; options.value = null; saving.value = false; });
onUnmounted(() => { sequence++; document.removeEventListener("keydown", keydown); });
</script>

<template>
  <button ref="trigger" type="button" data-testid="identity-open" class="rounded-lg border border-nf-accent/50 bg-nf-accent/10 px-3 py-1.5 text-[12px] font-medium text-nf-accent-hi hover:bg-nf-accent/20 focus-visible:nf-focus" @click="show">{{ t("characterIdentity.action") }}</button>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="dismiss">
    <section ref="dialog" role="dialog" aria-modal="true" :aria-label="t('characterIdentity.title')" tabindex="-1" class="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md focus-visible:nf-focus">
      <h2 class="font-nf-literary text-lg text-nf-text">{{ t("characterIdentity.title") }}</h2>
      <p class="mt-2 text-sm leading-relaxed text-nf-text-dim">{{ t("characterIdentity.explanation") }}</p>
      <p v-if="options" class="mt-3 text-sm font-semibold text-nf-text">{{ options.character.name }}</p>
      <p v-if="loading" role="status" class="mt-3 text-sm text-nf-text-dim">{{ t("common.loading") }}</p>
      <p v-if="error" role="alert" class="mt-3 rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-3 text-sm text-nf-warn">{{ error }}</p>
      <button v-if="uncertain" type="button" data-testid="identity-check" :disabled="loading" class="mt-3 rounded-lg border border-nf-border-strong px-3 py-2 text-sm text-nf-text focus-visible:nf-focus disabled:opacity-50" @click="load()">{{ t("characterIdentity.check") }}</button>
      <template v-else-if="!confirming">
        <form class="mt-4 flex gap-2" @submit.prevent="load()">
          <input v-model="query" type="search" maxlength="120" :aria-label="t('characterIdentity.search')" :placeholder="t('characterIdentity.search')" :disabled="loading" class="min-w-0 flex-1 rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 text-sm text-nf-text focus-visible:nf-focus" />
          <button type="submit" :disabled="loading" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm text-nf-text focus-visible:nf-focus disabled:opacity-50">{{ t("characterIdentity.searchButton") }}</button>
        </form>
        <p class="mt-2 text-xs text-nf-text-faint">{{ t("characterIdentity.noAutomaticMatch") }}</p>
        <p v-if="options && !options.candidates.length && !loading" class="mt-3 text-sm text-nf-text-dim">{{ t("characterIdentity.empty") }}</p>
        <ul v-if="options" class="mt-3 max-h-64 space-y-2 overflow-y-auto">
          <li v-for="candidate in options.candidates" :key="candidate.id">
            <button type="button" data-testid="identity-option" :aria-pressed="selected === candidate.id" :disabled="loading" class="flex w-full flex-col rounded-lg border p-3 text-left text-sm focus-visible:nf-focus disabled:opacity-50" :class="selected === candidate.id ? 'border-nf-accent bg-nf-accent/10 text-nf-text' : 'border-nf-border bg-nf-bg-0 text-nf-text-dim hover:border-nf-border-strong'" @click="selected = candidate.id">
              <span class="font-medium">{{ candidate.name }}</span><span class="mt-1 break-all text-xs text-nf-text-faint">{{ candidate.key }}</span>
            </button>
          </li>
        </ul>
        <button v-if="options?.hasMore" type="button" data-testid="identity-more" :disabled="loading" class="mt-2 rounded-lg border border-nf-border-strong px-3 py-2 text-sm text-nf-text focus-visible:nf-focus disabled:opacity-50" @click="load(true)">{{ t("characterIdentity.more") }}</button>
      </template>
      <div v-else-if="choice && options" data-testid="identity-confirmation" tabindex="-1" class="mt-4 rounded-lg border border-nf-accent/30 bg-nf-bg-0 p-4 text-sm text-nf-text focus-visible:nf-focus">
        <p>{{ t("characterIdentity.confirmation", { character: options.character.name, entity: choice.name }) }}</p>
        <p class="mt-1 break-all text-xs text-nf-text-dim">{{ choice.key }}</p>
        <p class="mt-3 leading-relaxed text-nf-text-dim">{{ t("characterIdentity.safety") }}</p>
      </div>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" :disabled="saving" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm text-nf-text-dim focus-visible:nf-focus disabled:opacity-50" @click="dismiss">{{ t(uncertain ? "common.close" : "common.cancel") }}</button>
        <button v-if="!confirming" type="button" data-testid="identity-review" :disabled="!choice || loading || uncertain" class="rounded-lg bg-nf-accent px-3 py-2 text-sm font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50" @click="review">{{ t("characterIdentity.review") }}</button>
        <template v-else>
          <button type="button" :disabled="saving" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm text-nf-text-dim focus-visible:nf-focus disabled:opacity-50" @click="confirming = false">{{ t("characterIdentity.back") }}</button>
          <button type="button" data-testid="identity-confirm" :disabled="saving" class="rounded-lg bg-nf-accent px-3 py-2 text-sm font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50" @click="link">{{ saving ? t("common.loading") : t("characterIdentity.confirm") }}</button>
        </template>
      </div>
    </section>
  </div>
</template>
