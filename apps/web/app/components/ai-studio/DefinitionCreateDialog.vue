<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useAiStudio, type DefinitionKind } from "../../composables/useAiStudio";
import { ApiError } from "../../composables/useApi";
import { TEXT_MODEL_PROFILES as MODEL_PROFILES } from "../../composables/usePlatformAdmin";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
import ActionMenu from "../ui/ActionMenu.vue";
import ModelPreferenceSelect from "../generation/ModelPreferenceSelect.vue";
const props = defineProps<{ workspaceId: string; kind: DefinitionKind }>();
const emit = defineEmits<{ close: []; created: [value: { id: string; kind: DefinitionKind; workspaceId: string }] }>();
const { t } = useLocale();
const studio = useAiStudio();
const dialog = ref<HTMLDialogElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const name = ref("");const key = ref("");const description = ref("");const instructions = ref("");
const profile = ref<string>("CREATIVE_WRITER");const modelRef = ref("");
const graphText = ref("");
const busy = ref(false);const error = ref<string | null>(null);
const saved = ref(false);
type Request = { workspaceId: string; kind: DefinitionKind; content: Record<string, unknown> };
const pending = ref<Request | null>(null);
let scopeVersion = 0;
const locked = computed(() => busy.value || saved.value || pending.value !== null);
const valid = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 120 && /^[a-z0-9][a-z0-9-]{0,63}$/.test(key.value.trim()) && description.value.trim().length <= 2000
  && (props.kind === "workflow" ? graphText.value.trim().length > 0 : instructions.value.trim().length > 0 && instructions.value.trim().length <= 20000));
function reset() { scopeVersion++;name.value = "";key.value = "";description.value = "";instructions.value = "";graphText.value = "";modelRef.value = "";profile.value = "CREATIVE_WRITER";pending.value = null;busy.value = false;saved.value = false;error.value = null; }
watch(() => [props.workspaceId, props.kind], reset);
onMounted(() => { dialog.value?.showModal?.();nameInput.value?.focus(); });
onUnmounted(() => { scopeVersion++; });
function close() { if (!busy.value) emit("close"); }
async function perform(request: Request, retry = false) {
  const version = scopeVersion;
  busy.value = true;error.value = null;
  try {
    const created = await studio.createDefinition(request.workspaceId, request.kind, request.content);
    if (version !== scopeVersion) return;
    saved.value = true;
    emit("created", { id: created.id, kind: request.kind, workspaceId: request.workspaceId });
  } catch (failure) {
    if (version !== scopeVersion) return;
    const uncertain = !(failure instanceof ApiError) || failure.status >= 500 || [408, 429].includes(failure.status);
    if (uncertain || retry) { pending.value = request;error.value = t("aiStudio.creation.uncertain"); }
    else error.value = t(failure.status === 409 ? "aiStudio.creation.conflict" : failure.status === 403 ? "aiStudio.definitions.errors.forbidden" : "aiStudio.definitions.errors.invalid");
  } finally { if (version === scopeVersion) busy.value = false; }
}
async function submit() {
  if (!valid.value || locked.value) return;
  let graph: unknown;
  if (props.kind === "workflow") {
    try { graph = JSON.parse(graphText.value);if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw new Error("Invalid graph"); }
    catch { error.value = t("aiStudio.definitions.errors.invalid");return; }
  }
  const content: Record<string, unknown> = { name: name.value.trim(), key: key.value.trim(), ...(description.value.trim() ? { description: description.value.trim() } : {}) };
  if (props.kind === "workflow") { content.graph = graph;content.defaultModelRef = modelRef.value || null; }
  else { content.instructions = instructions.value.trim();content.modelProfile = profile.value;content.preferredModelRef = modelRef.value || null; }
  await perform({ workspaceId: props.workspaceId, kind: props.kind, content });
}
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)])) : value;
}
async function recheck() {
  if (!pending.value || busy.value || saved.value) return;
  const request = pending.value;const version = scopeVersion;busy.value = true;
  try {
    const list = await studio.listDefinitions(request.workspaceId, request.kind);
    const row = list.find(item => item.key === request.content.key && item.scope === "WORKSPACE" && item.workspaceId === request.workspaceId);
    if (version !== scopeVersion) return;
    if (!row) { error.value = t("aiStudio.creation.notFoundYet");return; }
    const actual = await studio.getDefinition(request.kind, row.id);
    if (version !== scopeVersion) return;
    if (actual.scope !== "WORKSPACE" || actual.workspaceId !== request.workspaceId || !Object.entries(request.content).every(([key, expected]) => JSON.stringify(normalized(actual[key])) === JSON.stringify(normalized(expected)))) { error.value = t("aiStudio.creation.conflict");return; }
    saved.value = true;
    emit("created", { id: row.id, kind: request.kind, workspaceId: request.workspaceId });
  } catch { if (version === scopeVersion) error.value = t("aiStudio.creation.uncertain"); }
  finally { if (version === scopeVersion) busy.value = false; }
}
function retry() { if (pending.value && !busy.value && !saved.value) void perform(pending.value, true); }
</script>

<template>
  <dialog ref="dialog" :aria-label="t('aiStudio.creation.title')" :aria-busy="busy" class="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 text-nf-text shadow-nf-lg backdrop:bg-black/60" @cancel.prevent="close" @keydown="trapDialogFocus($event, dialog)">
    <h2 class="font-nf-literary text-xl font-semibold">{{ t('aiStudio.creation.title') }} · {{ t(`aiStudio.kinds.${kind}`) }}</h2>
    <p class="mt-2 text-[13px] text-nf-text-dim">{{ t('aiStudio.creation.hint') }}</p>
    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <label class="block text-[13px] font-medium">{{ t('aiStudio.creation.name') }}<input ref="nameInput" v-model="name" data-testid="definition-name" maxlength="120" required :disabled="locked" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      <label class="block text-[13px] font-medium">{{ t('aiStudio.creation.key') }}<input v-model="key" data-testid="definition-key" maxlength="64" pattern="[a-z0-9][a-z0-9-]{0,63}" required :disabled="locked" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      <p class="text-[12px] text-nf-text-faint">{{ t('aiStudio.creation.keyHint') }}</p>
      <label class="block text-[13px] font-medium">{{ t('aiStudio.creation.description') }}<textarea v-model="description" maxlength="2000" rows="2" :disabled="locked" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      <template v-if="kind !== 'workflow'">
        <ActionMenu :label="`${t('aiStudio.creation.profile')}: ${t(`platformAdmin.profiles.names.${profile}`)}`">
          <template #trigger>{{ t('aiStudio.creation.profile') }} · {{ t(`platformAdmin.profiles.names.${profile}`) }}</template>
          <button v-for="item in MODEL_PROFILES" :key="item" type="button" :data-profile="item" :disabled="locked" :aria-pressed="profile === item" @click="profile = item">{{ t(`platformAdmin.profiles.names.${item}`) }}</button>
        </ActionMenu>
        <label class="block text-[13px] font-medium">{{ t('aiStudio.creation.instructions') }}<textarea v-model="instructions" data-testid="definition-instructions" required maxlength="20000" rows="6" :disabled="locked" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 focus-visible:nf-focus" /></label>
      </template>
      <template v-else>
        <label class="block text-[13px] font-medium">{{ t('aiStudio.creation.graph') }}<textarea v-model="graphText" data-testid="definition-graph" required maxlength="200000" rows="10" spellcheck="false" :disabled="locked" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 font-mono focus-visible:nf-focus" /></label>
        <p class="text-[12px] text-nf-text-faint">{{ t('aiStudio.creation.graphHint') }}</p>
      </template>
      <ModelPreferenceSelect v-model="modelRef" :workspace-id="workspaceId" :profile="kind === 'workflow' ? undefined : profile" :disabled="locked" :field-label="t('aiStudio.definitions.modelLabel')" :automatic-label="t('workflowModelPreferences.inherit')" :hint="t(kind === 'workflow' ? 'aiStudio.definitions.workflowModelHint' : 'aiStudio.definitions.modelHint')" />
      <p v-if="error" role="alert" class="text-[13px] text-nf-warn">{{ error }}</p>
      <div v-if="pending" class="flex flex-wrap gap-2">
        <button type="button" :disabled="busy" data-testid="definition-recheck" class="rounded-lg border border-nf-border-strong px-3 py-2 text-[13px] focus-visible:nf-focus" @click="recheck">{{ t('aiStudio.creation.recheck') }}</button>
        <button type="button" :disabled="busy" data-testid="definition-retry" class="rounded-lg border border-nf-border-strong px-3 py-2 text-[13px] focus-visible:nf-focus" @click="retry">{{ t('aiStudio.creation.retry') }}</button>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" :disabled="busy" class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] focus-visible:nf-focus" @click="close">{{ t(pending ? 'common.close' : 'common.cancel') }}</button>
        <button type="submit" :disabled="!valid || locked" class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50">{{ t(busy ? 'common.saving' : 'aiStudio.creation.create') }}</button>
      </div>
    </form>
  </dialog>
</template>
