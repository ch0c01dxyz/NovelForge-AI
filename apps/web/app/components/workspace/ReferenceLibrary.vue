<script setup lang="ts">
/**
 * Reference library (NF-WF-016, Invariant 1.7).
 *
 * Lists workspace-scoped references and creates new ones. Selecting a
 * reference opens its detail shell (ReferenceIngest), which owns
 * versions, publish, and the ingest trigger. No file upload here
 * (Invariant 7/Q7): content is pasted text; ingestion UX is CRUD +
 * publish + ingest trigger only.
 *
 * The non-canon boundary ("References are never canon") is labelled by
 * the parent ResearchPanel; this component never presents a reference as
 * canon.
 */
import { ref, onMounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import ReferenceIngest from "./ReferenceIngest.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const KINDS = ["NOTE", "GUIDE", "RESEARCH", "STYLE", "GLOSSARY", "IMPORTED"] as const;

export interface ReferenceView {
  id: string;
  workspaceId: string;
  novelId: string | null;
  key: string;
  title: string;
  kind: string;
  source: string | null;
  status: string;
  version: number | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

const references = ref<ReferenceView[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const showCreate = ref(false);

const form = ref({ key: "", title: "", kind: "NOTE", source: "", content: "" });
const formError = ref<string | null>(null);
const saving = ref(false);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.research.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.research.errors.notFound");
  return t("workspace.research.errors.unknown");
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    references.value = await api<ReferenceView[]>(`/workspaces/${props.workspaceId}/references`);
  } catch (e) {
    loadError.value = errorKey(e);
  } finally {
    loading.value = false;
  }
}

function validKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(key.trim());
}

async function create() {
  formError.value = null;
  if (!validKey(form.value.key)) {
    formError.value = t("workspace.research.library.keyInvalid");
    return;
  }
  if (!form.value.title.trim()) {
    formError.value = t("workspace.research.library.titleRequired");
    return;
  }
  saving.value = true;
  try {
    const created = await api<ReferenceView>(`/workspaces/${props.workspaceId}/references`, {
      method: "POST",
      body: JSON.stringify({
        novelId: props.novelId,
        key: form.value.key.trim(),
        title: form.value.title.trim(),
        kind: form.value.kind,
        ...(form.value.source.trim() ? { source: form.value.source.trim() } : {}),
        content: form.value.content,
      }),
    });
    references.value = [created, ...references.value];
    form.value = { key: "", title: "", kind: "NOTE", source: "", content: "" };
    showCreate.value = false;
  } catch (e) {
    formError.value = errorKey(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="selectedId" class="flex flex-col gap-2">
      <button
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="selectedId = null"
      >
        ← {{ t("workspace.research.library.back") }}
      </button>
      <ReferenceIngest :reference-id="selectedId" @published="load" />
    </div>

    <template v-else>
      <div class="flex items-center justify-between">
        <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
          {{ t("workspace.research.library.title") }}
        </h3>
        <button
          class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          @click="showCreate = !showCreate"
          :aria-expanded="showCreate"
        >
          {{ t("workspace.research.library.newReference") }}
        </button>
      </div>

      <form
        v-if="showCreate"
        class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3"
        @submit.prevent="create"
      >
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.research.library.keyLabel") }}
            <input
              v-model="form.key"
              type="text"
              maxlength="64"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              :placeholder="t('workspace.research.library.keyPlaceholder')"
            />
            <span class="text-[11px] text-nf-text-faint">{{ t("workspace.research.library.keyHint") }}</span>
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.research.library.kindLabel") }}
            <select
              v-model="form.kind"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="k in KINDS" :key="k" :value="k">
                {{ t(`workspace.research.library.kind.${k}`) }}
              </option>
            </select>
          </label>
        </div>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.research.library.titleLabel") }}
          <input
            v-model="form.title"
            type="text"
            maxlength="300"
            required
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.research.library.sourceLabel") }}
          <input
            v-model="form.source"
            type="text"
            maxlength="2000"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.research.library.contentLabel") }}
          <textarea
            v-model="form.content"
            rows="6"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.research.library.contentPlaceholder')"
          />
        </label>
        <p
          v-if="formError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ formError }}
        </p>
        <div class="flex gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.research.library.createSubmit") }}
          </button>
          <button
            type="button"
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="showCreate = false"
          >
            {{ t("workspace.common.cancel") }}
          </button>
        </div>
      </form>

      <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.research.common.loading") }}
      </p>
      <p
        v-else-if="loadError"
        role="alert"
        class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
      >
        {{ loadError }}
      </p>
      <p v-else-if="!references.length" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.research.library.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="r in references"
          :key="r.id"
          class="flex items-center gap-3 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-nf-text">{{ r.title }}</p>
            <p class="mt-0.5 font-mono text-[11px] text-nf-text-faint">
              {{ r.key }} · {{ t(`workspace.research.library.kind.${r.kind}`) }} ·
              {{ t(`workspace.research.library.status.${r.status}`) }}
              <span v-if="r.chunkCount"> · {{ t("workspace.research.library.chunks", { count: r.chunkCount }) }}</span>
            </p>
          </div>
          <button
            class="shrink-0 rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="selectedId = r.id"
          >
            {{ t("workspace.research.library.open") }}
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
