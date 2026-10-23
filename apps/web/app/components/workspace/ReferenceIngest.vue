<script setup lang="ts">
/**
 * Reference detail + ingest shell (NF-WF-016, Invariant 1.7).
 *
 * Owns one reference: its versions (add version), publish (explicit
 * confirmation; POST .../publish → {status:"ok"}), and the per-VERSION
 * ingest trigger with an optional `availableFromChapter` spoiler
 * boundary. Ingestion is per-version and idempotent: re-ingesting the
 * same version is a no-op, ingesting a newer version replaces the
 * projection. The result is displayed verbatim (text, never HTML).
 *
 * Never presents the reference as canon (Invariant 1.7).
 */
import { ref, onMounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  referenceId: string;
}>();

const emit = defineEmits<{
  (e: "published"): void;
}>();

const { t } = useLocale();
const { api } = useApi();

interface ReferenceVersionView {
  id: string;
  version: number;
  note: string | null;
  charCount: number | null;
  ingested: boolean;
  createdAt: string;
}

interface ReferenceDetail {
  id: string;
  key: string;
  title: string;
  kind: string;
  source: string | null;
  status: string;
  version: number | null;
  chunkCount: number;
  content: string | null;
  versions: ReferenceVersionView[];
}

const detail = ref<ReferenceDetail | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const showVersionForm = ref(false);
const versionForm = ref({ content: "", note: "" });
const versionError = ref<string | null>(null);
const versionSaving = ref(false);

const confirmingPublish = ref(false);
const publishError = ref<string | null>(null);
const publishing = ref(false);

const ingestChapter = ref("");
const ingestTarget = ref<string | null>(null);
const ingestResult = ref<string | null>(null);
const ingestError = ref<string | null>(null);
const ingesting = ref(false);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.research.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.research.errors.notFound");
  return t("workspace.research.errors.unknown");
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    detail.value = await api<ReferenceDetail>(`/references/${props.referenceId}`);
  } catch (e) {
    loadError.value = errorKey(e);
  } finally {
    loading.value = false;
  }
}

async function addVersion() {
  versionError.value = null;
  if (!versionForm.value.content.trim()) {
    versionError.value = t("workspace.research.ingest.versionContentRequired");
    return;
  }
  versionSaving.value = true;
  try {
    await api(`/references/${props.referenceId}/versions`, {
      method: "POST",
      body: JSON.stringify({
        content: versionForm.value.content,
        ...(versionForm.value.note.trim() ? { note: versionForm.value.note.trim() } : {}),
      }),
    });
    versionForm.value = { content: "", note: "" };
    showVersionForm.value = false;
    await load();
  } catch (e) {
    versionError.value = errorKey(e);
  } finally {
    versionSaving.value = false;
  }
}

async function publish() {
  publishError.value = null;
  publishing.value = true;
  try {
    await api<{ status: string }>(`/references/${props.referenceId}/publish`, { method: "POST" });
    confirmingPublish.value = false;
    await load();
    emit("published");
  } catch (e) {
    publishError.value = errorKey(e);
  } finally {
    publishing.value = false;
  }
}

async function ingest(versionId: string) {
  ingestError.value = null;
  ingestResult.value = null;
  const raw = ingestChapter.value.trim();
  if (raw && !/^\d+$/.test(raw)) {
    ingestError.value = t("workspace.research.ingest.availableFromChapterInvalid");
    return;
  }
  ingestTarget.value = versionId;
  ingesting.value = true;
  try {
    const body = raw ? { availableFromChapter: Number(raw) } : {};
    const result = await api<unknown>(`/reference-versions/${versionId}/ingest`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    ingestResult.value = JSON.stringify(result, null, 2);
  } catch (e) {
    ingestError.value = errorKey(e);
  } finally {
    ingesting.value = false;
    ingestTarget.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
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

    <template v-else-if="detail">
      <div class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2">
        <p class="text-[13px] font-semibold text-nf-text">{{ detail.title }}</p>
        <p class="mt-0.5 font-mono text-[11px] text-nf-text-faint">
          {{ detail.key }} · {{ t(`workspace.research.library.kind.${detail.kind}`) }} ·
          {{ t(`workspace.research.library.status.${detail.status}`) }} ·
          {{ t("workspace.research.library.chunks", { count: detail.chunkCount }) }}
        </p>
        <p v-if="detail.source" class="mt-1 break-words text-[12px] text-nf-text-dim">{{ detail.source }}</p>
      </div>

      <section v-if="detail.content" :aria-label="t('workspace.research.library.contentLabel')" class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <h3 class="mb-2 text-[12px] font-semibold text-nf-text-dim">{{ t("workspace.research.library.contentLabel") }}</h3>
        <div class="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nf-text">{{ detail.content }}</div>
      </section>

      <!-- Publish -->
      <div v-if="detail.status !== 'ACTIVE'" class="flex flex-col gap-2">
        <div v-if="!confirmingPublish">
          <button
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            :disabled="publishing"
            @click="confirmingPublish = true"
          >
            {{ t("workspace.research.ingest.publish") }}
          </button>
        </div>
        <div
          v-else
          role="alertdialog"
          :aria-label="t('workspace.research.ingest.publishConfirmTitle')"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2"
        >
          <p class="text-[12.5px] text-nf-text">{{ t("workspace.research.ingest.publishConfirm") }}</p>
          <div class="mt-2 flex gap-2">
            <button
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              :disabled="publishing"
              @click="publish"
            >
              {{ t("workspace.common.confirm") }}
            </button>
            <button
              class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="confirmingPublish = false"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
        </div>
        <p
          v-if="publishError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ publishError }}
        </p>
      </div>

      <!-- Versions -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
            {{ t("workspace.research.ingest.versionsTitle") }}
          </h3>
          <button
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-expanded="showVersionForm"
            @click="showVersionForm = !showVersionForm"
          >
            {{ t("workspace.research.ingest.addVersion") }}
          </button>
        </div>

        <form
          v-if="showVersionForm"
          class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3"
          @submit.prevent="addVersion"
        >
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.research.ingest.versionContentLabel") }}
            <textarea
              v-model="versionForm.content"
              rows="6"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.research.ingest.versionNoteLabel") }}
            <input
              v-model="versionForm.note"
              type="text"
              maxlength="1000"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <p
            v-if="versionError"
            role="alert"
            class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
          >
            {{ versionError }}
          </p>
          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="versionSaving"
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            >
              {{ t("workspace.research.ingest.addVersionSubmit") }}
            </button>
            <button
              type="button"
              class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="showVersionForm = false"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
        </form>

        <div class="flex flex-col gap-1 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2">
          <label class="flex items-center gap-2 text-[12px] text-nf-text-dim">
            {{ t("workspace.research.ingest.availableFromChapterLabel") }}
            <input
              v-model="ingestChapter"
              type="text"
              inputmode="numeric"
              :placeholder="t('workspace.research.ingest.availableFromChapterPlaceholder')"
              class="w-28 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <p class="text-[11px] text-nf-text-faint">{{ t("workspace.research.ingest.availableFromChapterHint") }}</p>
        </div>
        <p v-if="!detail.versions.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.research.ingest.noVersions") }}
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="v in detail.versions"
            :key="v.id"
            class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
          >
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-medium text-nf-text">
                  {{ t("workspace.research.ingest.versionNumber", { n: v.version }) }}
                  <span v-if="v.ingested" class="text-nf-ok">· {{ t("workspace.research.ingest.ingested") }}</span>
                </p>
                <p v-if="v.note" class="mt-0.5 text-[12px] text-nf-text-dim">{{ v.note }}</p>
              </div>
              <button
                class="shrink-0 rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
                :disabled="ingesting"
                @click="ingest(v.id)"
              >
                {{ t("workspace.research.ingest.ingestSubmit") }}
              </button>
            </div>
          </li>
        </ul>

        <p
          v-if="ingestError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ ingestError }}
        </p>
        <div v-if="ingestResult" class="flex flex-col gap-1">
          <p class="text-[12px] font-medium text-nf-text-dim">{{ t("workspace.research.ingest.resultTitle") }}</p>
          <pre class="max-h-48 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ ingestResult }}</pre>
        </div>
        <p class="text-[11.5px] text-nf-text-faint">{{ t("workspace.research.ingest.idempotentNote") }}</p>
      </div>
    </template>
  </div>
</template>
