<script setup lang="ts">
/**
 * Definition detail (NF-WF-018A): the selected agent/skill/workflow with
 * its current-version content, the immutable version history
 * (VersionHistory), a "new version" append dialog, and publish.
 * Every action rides a frozen route; the versions list rides the GAP-064
 * additive route. Edit always appends — nothing is overwritten.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import {
  useAiStudio,
  type DefinitionKind,
  type DefinitionVersionRow,
} from "../../composables/useAiStudio";
import { ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import VersionHistory from "./VersionHistory.vue";
import ModelPreferenceSelect from "../generation/ModelPreferenceSelect.vue";
import ActionMenu from "../ui/ActionMenu.vue";
import { MODEL_PROFILES } from "../../composables/usePlatformAdmin";

const props = defineProps<{
  kind: DefinitionKind;
  id: string;
  canManage: boolean;
  workspaceId: string;
}>();

const emit = defineEmits<{
  (e: "changed"): void;
  (e: "close"): void;
}>();

const { t } = useLocale();
const studio = useAiStudio();

const detail = ref<Record<string, unknown> | null>(null);
const versions = ref<DefinitionVersionRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const dialogOpen = ref(false);
const jsonText = ref("");
const jsonError = ref<string | null>(null);
const submitting = ref(false);
const publishConfirm = ref(false);
const publishing = ref(false);
const published = ref(false);
const jsonField = ref<HTMLTextAreaElement | null>(null);
let loadSequence = 0;
let scopeVersion = 0;
const draft = computed<Record<string, unknown> | null>(() => {
  try { const value = JSON.parse(jsonText.value);return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; }
});
const modelField = computed(() => props.kind === "workflow" ? "defaultModelRef" : "preferredModelRef");
const selectedModel = computed(() => typeof draft.value?.[modelField.value] === "string" ? draft.value[modelField.value] as string : "");
const draftProfile = computed(() => typeof draft.value?.modelProfile === "string" ? draft.value.modelProfile : undefined);
function selectProfile(profile: string) {
  if (props.kind === "workflow" || !draft.value || submitting.value || !props.canManage || !MODEL_PROFILES.some(item => item === profile)) return;
  jsonText.value = JSON.stringify({ ...draft.value, modelProfile: profile }, null, 2);
}
function selectModel(modelRef: string) {
  if (!draft.value || submitting.value || !props.canManage) return;
  jsonText.value = JSON.stringify({ ...draft.value, [modelField.value]: modelRef || null }, null, 2);
}

function contentOf(d: Record<string, unknown>): Record<string, unknown> {
  if (props.kind === "workflow") return { graph: d.graph ?? null, defaultModelRef: d.defaultModelRef ?? null };
  const out: Record<string, unknown> = {
    instructions: d.instructions ?? "",
    modelProfile: d.modelProfile ?? "",
    preferredModelRef: d.preferredModelRef ?? null,
  };
  if (d.skillKeys !== undefined) out.skillKeys = d.skillKeys;
  if (d.outputSchema !== undefined && d.outputSchema !== null)
    out.outputSchema = d.outputSchema;
  if (d.temperature !== undefined && d.temperature !== null)
    out.temperature = d.temperature;
  if (d.maxTokens !== undefined && d.maxTokens !== null)
    out.maxTokens = d.maxTokens;
  return out;
}

async function load() {
  const request = ++loadSequence;
  loading.value = true;
  error.value = null;
  try {
    const [d, v] = await Promise.all([
      studio.getDefinition(props.kind, props.id),
      studio.listVersions(props.kind, props.id),
    ]);
    if (request !== loadSequence) return;
    detail.value = d;
    versions.value = v;
  } catch (err) {
    if (request !== loadSequence) return;
    error.value = err instanceof ApiError ? err.code : "unknown";
  } finally {
    if (request === loadSequence) loading.value = false;
  }
}

function errorMessage(code: string | null): string {
  if (code === "FORBIDDEN") return t("aiStudio.definitions.errors.forbidden");
  if (code === "NOT_FOUND") return t("aiStudio.definitions.errors.notFound");
  if (code === "INVALID_INPUT") return t("aiStudio.definitions.errors.invalid");
  if (code === "INVALID_DEFINITION")
    return t("aiStudio.definitions.errors.invalid");
  return t("aiStudio.definitions.errors.generic", { code: code ?? "unknown" });
}

function openNewVersion() {
  jsonText.value = JSON.stringify(
    detail.value ? contentOf(detail.value) : {},
    null,
    2,
  );
  jsonError.value = null;
  dialogOpen.value = true;
  nextTick(() => jsonField.value?.focus());
}

async function submitVersion() {
  if (submitting.value || !props.canManage) return;
  const version = scopeVersion;
  jsonError.value = null;
  let content: unknown;
  try {
    content = JSON.parse(jsonText.value);
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Invalid content");
  } catch {
    jsonError.value = t("aiStudio.definitions.errors.invalid");
    return;
  }
  submitting.value = true;
  try {
    await studio.addVersion(props.kind, props.id, content);
    if (version !== scopeVersion) return;
    dialogOpen.value = false;
    await load();
    if (version !== scopeVersion) return;
    emit("changed");
  } catch (err) {
    if (version !== scopeVersion) return;
    if (err instanceof ApiError && err.code === "INVALID_DEFINITION") {
      const failures = (err as ApiError & { failures?: string[] }).failures ?? [];
      jsonError.value = t("aiStudio.definitions.errors.invalidDefinition", {
        failures: failures.length ? failures.join("; ") : "invalid content",
      });
    } else {
      jsonError.value = t("aiStudio.definitions.errors.generic", {
        code: err instanceof ApiError ? err.code : "unknown",
      });
    }
  } finally {
    if (version === scopeVersion) submitting.value = false;
  }
}

async function doPublish() {
  if (publishing.value || !props.canManage) return;
  const version = scopeVersion;
  publishConfirm.value = false;
  publishing.value = true;
  try {
    await studio.publishDefinition(props.kind, props.id);
    if (version !== scopeVersion) return;
    published.value = true;
    await load();
    if (version !== scopeVersion) return;
    emit("changed");
  } catch (err) {
    if (version !== scopeVersion) return;
    error.value = err instanceof ApiError ? err.code : "unknown";
  } finally {
    if (version === scopeVersion) publishing.value = false;
  }
}

const status = computed(() => detail.value?.status as string | undefined);

onMounted(load);
watch(() => [props.workspaceId, props.kind, props.id], () => {
  scopeVersion++;dialogOpen.value = false;publishConfirm.value = false;published.value = false;
  submitting.value = false;publishing.value = false;detail.value = null;jsonText.value = "";void load();
});
onUnmounted(() => { scopeVersion++;loadSequence++; });

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && dialogOpen.value && !submitting.value) dialogOpen.value = false;
}
</script>

<template>
  <div class="min-w-0" @keydown="onKeydown">
    <div v-if="loading" class="py-8 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="error" class="py-8 text-center" role="alert">
      <p class="text-nf-warn">{{ errorMessage(error) }}</p>
    </div>
    <div v-else-if="detail" class="space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="break-words text-[17px] font-semibold text-nf-text">
            {{ String(detail.name) }}
          </h2>
          <p class="break-words text-[13px] text-nf-text-faint">
            {{ String(detail.key) }} ·
            {{ t("aiStudio.definitions.version", { version: String(detail.version ?? "—") }) }}
          </p>
        </div>
        <button
          class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12px] text-nf-text-dim focus-visible:nf-focus"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          {{ t("common.close") }}
        </button>
      </div>

      <p v-if="detail.description" class="text-[13px] text-nf-text-dim">
        {{ String(detail.description) }}
      </p>

      <div v-if="published" class="rounded-lg bg-nf-ok/10 px-3 py-2 text-[13px] text-nf-ok" role="status">
        {{ t("aiStudio.definitions.published") }}
      </div>

      <div v-if="props.canManage" class="flex gap-2">
        <button
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          @click="openNewVersion"
        >
          {{ t("aiStudio.definitions.newVersion") }}
        </button>
        <button
          v-if="status === 'DRAFT'"
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="publishing"
          @click="publishConfirm = true"
        >
          {{ t("aiStudio.definitions.publish") }}
        </button>
      </div>

      <div class="overflow-x-auto focus-visible:nf-focus" tabindex="0" role="region" :aria-label="t('aiStudio.definitions.versionHistoryScroll')">
        <VersionHistory :versions="versions" :current-version-id="String(detail.versionId ?? '')" />
      </div>

      <!-- New-version dialog -->
      <div
        v-if="dialogOpen"
        class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="t('aiStudio.definitions.newVersionTitle')"
      >
        <div class="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg">
          <h3 class="mb-1 text-[15px] font-semibold text-nf-text">
            {{ t("aiStudio.definitions.newVersionTitle") }}
          </h3>
          <p class="mb-3 text-[12px] text-nf-text-faint">
            {{ t("aiStudio.definitions.newVersionHint") }}
          </p>
          <div v-if="draft && kind !== 'workflow'" class="mb-3">
            <ActionMenu :label="`${t('aiStudio.creation.profile')}: ${draftProfile ? t(`platformAdmin.profiles.names.${draftProfile}`) : '—'}`" class="w-full">
              <template #trigger>{{ t('aiStudio.creation.profile') }} · {{ draftProfile ? t(`platformAdmin.profiles.names.${draftProfile}`) : '—' }}</template>
              <button v-for="item in MODEL_PROFILES" :key="item" type="button" :data-profile="item" :disabled="submitting || !canManage" :aria-pressed="draftProfile === item" @click="selectProfile(item)">{{ t(`platformAdmin.profiles.names.${item}`) }}</button>
            </ActionMenu>
            <p class="mt-2 text-[12px] text-nf-text-faint">{{ t('aiStudio.definitions.profileHint') }}</p>
          </div>
          <ModelPreferenceSelect v-if="draft && (kind === 'workflow' || draftProfile)" :workspace-id="workspaceId"
            :profile="kind === 'workflow' ? undefined : draftProfile" :model-value="selectedModel" :disabled="submitting"
            :automatic-label="t('workflowModelPreferences.inherit')"
            :field-label="t('aiStudio.definitions.modelLabel')" :hint="t(kind === 'workflow' ? 'aiStudio.definitions.workflowModelHint' : 'aiStudio.definitions.modelHint')"
            @update:model-value="selectModel" />
          <textarea
            ref="jsonField"
            v-model="jsonText"
            :disabled="submitting"
            rows="14"
            spellcheck="false"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[12px] text-nf-text focus-visible:nf-focus"
            :aria-label="t('aiStudio.definitions.contentJson')"
          />
          <p v-if="jsonError" class="mt-2 text-[12px] text-nf-warn" role="alert">
            {{ jsonError }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
              @click="dialogOpen = false"
              :disabled="submitting"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              :disabled="submitting"
              @click="submitVersion"
            >
              {{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>

      <!-- Publish confirm dialog -->
      <div
        v-if="publishConfirm"
        class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="t('aiStudio.definitions.publish')"
      >
        <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg">
          <p class="text-[14px] text-nf-text">
            {{ t("aiStudio.definitions.publishConfirm") }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
              @click="publishConfirm = false"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
              @click="doPublish"
            >
              {{ t("aiStudio.definitions.publish") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
