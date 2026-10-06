<script setup lang="ts">
/**
 * Narrative DNA editor (NF-WF-016, Invariant 1.8).
 *
 * The DNA profile is a free-form record<string, unknown> on the server,
 * so the UI edits it as JSON text with explicit parse-error handling
 * (documented here, not hidden): invalid JSON cannot be saved, and the
 * error names the parse failure. GET .../narrative/dna returns the DNA
 * object or null.
 */
import { ref, onMounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const loading = ref(true);
const loadError = ref<string | null>(null);
const editing = ref(false);
const draft = ref("");
const parseError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.narrative.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.narrative.errors.notFound");
  return t("workspace.narrative.errors.unknown");
}

const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}/narrative/dna`;

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const dna = await api<Record<string, unknown> | null>(base());
    draft.value = dna ? JSON.stringify(dna, null, 2) : "";
  } catch (e) {
    loadError.value = errorKey(e);
  } finally {
    loading.value = false;
  }
}

function startEdit() {
  parseError.value = null;
  saveError.value = null;
  saved.value = false;
  editing.value = true;
}

function parseDraft(): Record<string, unknown> | null {
  parseError.value = null;
  const raw = draft.value.trim();
  if (!raw) {
    parseError.value = t("workspace.narrative.dna.emptyJson");
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      parseError.value = t("workspace.narrative.dna.objectRequired");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    parseError.value = t("workspace.narrative.dna.invalidJson", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function save() {
  saveError.value = null;
  saved.value = false;
  const dna = parseDraft();
  if (!dna) return;
  saving.value = true;
  try {
    await api(base(), { method: "PUT", body: JSON.stringify({ dna }) });
    saved.value = true;
    editing.value = false;
  } catch (e) {
    saveError.value = errorKey(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
        {{ t("workspace.narrative.dna.title") }}
      </h3>
      <button
        v-if="!editing"
        class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="startEdit"
      >
        {{ t("workspace.narrative.dna.edit") }}
      </button>
    </div>

    <p class="text-[12px] leading-relaxed text-nf-text-faint">
      {{ t("workspace.narrative.dna.about") }}
    </p>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.narrative.common.loading") }}
    </p>
    <p
      v-else-if="loadError"
      role="alert"
      class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
    >
      {{ loadError }}
    </p>

    <template v-else>
      <div v-if="!editing" class="flex flex-col gap-2">
        <p v-if="!draft" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.narrative.dna.empty") }}
        </p>
        <pre v-else class="max-h-96 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-3 font-mono text-[12px] leading-relaxed text-nf-text-dim">{{ draft }}</pre>
        <p v-if="saved" role="status" class="text-[12.5px] text-nf-ok">
          {{ t("workspace.narrative.dna.saved") }}
        </p>
      </div>

      <form v-else class="flex flex-col gap-2" @submit.prevent="save">
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.narrative.dna.jsonLabel") }}
          <textarea
            v-model="draft"
            rows="16"
            spellcheck="false"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-nf-text focus-visible:nf-focus"
            :aria-describedby="parseError ? 'dna-parse-error' : undefined"
          />
        </label>
        <p
          v-if="parseError"
          id="dna-parse-error"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ parseError }}
        </p>
        <p
          v-if="saveError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ saveError }}
        </p>
        <div class="flex gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.narrative.dna.save") }}
          </button>
          <button
            type="button"
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="editing = false"
          >
            {{ t("workspace.common.cancel") }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
