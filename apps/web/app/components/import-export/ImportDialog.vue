<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
    <div class="absolute inset-0 bg-black/60" data-testid="import-backdrop" @click="onCancel" />
    <section
      ref="dialogRef"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="t('importExport.import.dialogTitle')"
      class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md focus-visible:nf-focus"
    >
      <h2 class="text-[15px] font-semibold text-nf-text">{{ t("importExport.import.dialogTitle") }}</h2>
      <p class="mt-1 text-[13px] leading-relaxed text-nf-text-dim">
        {{ t("importExport.import.dialogDescription") }}
      </p>

      <div v-if="status !== 'success'" class="mt-4">
        <div role="tablist" :aria-label="t('importExport.import.dialogTitle')" class="flex gap-1 rounded-lg bg-nf-bg-2 p-1">
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'file'"
            data-testid="import-tab-file"
            class="flex-1 rounded-md px-3 py-1.5 text-[13px] focus-visible:nf-focus"
            :class="tab === 'file' ? 'bg-nf-bg-0 font-semibold text-nf-text' : 'text-nf-text-dim hover:text-nf-text'"
            @click="tab = 'file'"
          >
            {{ t("importExport.import.fileTab") }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'paste'"
            data-testid="import-tab-paste"
            class="flex-1 rounded-md px-3 py-1.5 text-[13px] focus-visible:nf-focus"
            :class="tab === 'paste' ? 'bg-nf-bg-0 font-semibold text-nf-text' : 'text-nf-text-dim hover:text-nf-text'"
            @click="tab = 'paste'"
          >
            {{ t("importExport.import.pasteTab") }}
          </button>
        </div>

        <div v-if="tab === 'file'" class="mt-4 space-y-3">
          <div>
            <label for="import-file-input" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("importExport.import.chooseFile") }}
            </label>
            <input
              id="import-file-input"
              ref="fileInputRef"
              type="file"
              accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              data-testid="import-file-input"
              class="block w-full text-[13px] text-nf-text-dim file:mr-3 file:rounded-lg file:border file:border-nf-border-strong file:bg-nf-bg-2 file:px-3 file:py-1.5 file:text-[13px] file:text-nf-text hover:file:bg-nf-bg-3 focus-visible:nf-focus"
              @change="onFileChange"
            />
            <p class="mt-1 text-[12px] text-nf-text-faint">{{ t("importExport.import.dropHint") }}</p>
          </div>
          <div v-if="file" class="flex items-center gap-3">
            <p class="text-[13px] text-nf-text-dim" data-testid="import-detected">
              {{ t("importExport.import.formatDetected", { format: (detectedFormat ?? "?").toUpperCase() }) }}
            </p>
            <label class="ml-auto flex items-center gap-2 text-[13px] text-nf-text-dim">
              {{ t("importExport.import.formatOverride") }}
              <select
                v-model="formatOverride"
                data-testid="import-format-override"
                class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-2 py-1 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="auto">{{ t("importExport.import.formatAuto") }}</option>
                <option value="md">Markdown</option>
                <option value="txt">TXT</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
            </label>
          </div>
        </div>

        <div v-else class="mt-4 space-y-3">
          <div>
            <label for="import-paste-text" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("importExport.import.pasteTab") }}
            </label>
            <textarea
              id="import-paste-text"
              v-model="pasteText"
              rows="8"
              data-testid="import-paste-text"
              :placeholder="t('importExport.import.pastePlaceholder')"
              class="block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-3 text-[13px] leading-relaxed text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
          <fieldset class="flex gap-4">
            <legend class="sr-only">{{ t("importExport.import.formatOverride") }}</legend>
            <label class="flex items-center gap-1.5 text-[13px] text-nf-text-dim">
              <input v-model="pasteFormat" type="radio" value="md" class="accent-nf-accent" />
              {{ t("importExport.import.pasteFormatMd") }}
            </label>
            <label class="flex items-center gap-1.5 text-[13px] text-nf-text-dim">
              <input v-model="pasteFormat" type="radio" value="txt" class="accent-nf-accent" />
              {{ t("importExport.import.pasteFormatTxt") }}
            </label>
          </fieldset>
        </div>

        <p
          v-if="status === 'error'"
          role="alert"
          data-testid="import-error"
          class="mt-3 rounded-lg border border-nf-error/60 bg-nf-error/15 px-3 py-2 text-[13px] text-nf-error"
        >
          {{ errorMessage }}
        </p>
      </div>

      <div v-else class="mt-4 space-y-3" aria-live="polite">
        <p class="text-[13px] font-medium text-nf-text" data-testid="import-success">
          {{ t("importExport.import.successChapters", { count: result?.created ?? 0 }) }}
        </p>
        <div v-if="result?.skipped?.length">
          <p class="text-[13px] font-medium text-nf-text-dim">{{ t("importExport.import.skippedTitle") }}</p>
          <ul class="mt-1 list-inside list-disc text-[13px] text-nf-text-dim">
            <li v-for="s in result.skipped" :key="s">{{ s }}</li>
          </ul>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          v-if="status !== 'success'"
          type="button"
          data-testid="import-cancel"
          class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          :disabled="status === 'uploading'"
          @click="onCancel"
        >
          {{ t("common.cancel") }}
        </button>
        <button
          v-if="status !== 'success'"
          type="button"
          data-testid="import-submit"
          class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          :disabled="!canSubmit || status === 'uploading'"
          @click="onSubmit"
        >
          {{ status === "uploading" ? t("importExport.import.importing") : t("importExport.import.startImport") }}
        </button>
        <button
          v-else
          type="button"
          data-testid="import-done"
          class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
          @click="onDone"
        >
          {{ t("common.close") }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * ImportDialog (NF-WF-017A): the author-facing import UI on the writer
 * page. File tab (format auto-detection by extension/MIME with a manual
 * override) and paste tab (the frozen JSON {text, format} shape). The
 * server validates everything authoritatively; this dialog maps the
 * typed 400 codes to actionable en/id messages.
 *
 * Esc dismisses; focus returns to the opener. Import/export are not AI
 * affordances, so no orange (design tokens §AI-orange restriction).
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

type DetectedFormat = "md" | "txt" | "pdf" | "docx";

const props = defineProps<{
  open: boolean;
  workspaceId: string;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "imported"): void;
}>();

const { t } = useLocale();
const { api } = useApi();

const dialogRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const tab = ref<"file" | "paste">("file");
const file = ref<File | null>(null);
const detectedFormat = ref<DetectedFormat | null>(null);
const formatOverride = ref<"auto" | DetectedFormat>("auto");
const pasteText = ref("");
const pasteFormat = ref<"md" | "txt">("md");
const status = ref<"idle" | "uploading" | "success" | "error">("idle");
const errorCode = ref<string | null>(null);
const result = ref<{ created: number; skipped: string[] } | null>(null);

const EXTENSION_FORMATS: Record<string, DetectedFormat> = {
  md: "md",
  markdown: "md",
  txt: "txt",
  pdf: "pdf",
  docx: "docx",
};

function detectFormat(name: string, mime: string): DetectedFormat | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (EXTENSION_FORMATS[ext]) return EXTENSION_FORMATS[ext];
  if (mime === "text/markdown") return "md";
  if (mime === "text/plain") return "txt";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return null;
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0] ?? null;
  file.value = f;
  detectedFormat.value = f ? detectFormat(f.name, f.type) : null;
  formatOverride.value = "auto";
  status.value = "idle";
  errorCode.value = null;
}

const effectiveFormat = computed<DetectedFormat | null>(() =>
  formatOverride.value === "auto" ? detectedFormat.value : formatOverride.value,
);

const canSubmit = computed(() =>
  tab.value === "file" ? !!file.value && !!effectiveFormat.value : pasteText.value.trim().length > 0,
);

const ERROR_KEYS = [
  "IMPORT_TOO_LARGE",
  "IMPORT_UNSUPPORTED_TYPE",
  "IMPORT_CORRUPT",
  "IMPORT_ARCHIVE_UNSAFE",
  "IMPORT_NO_TEXT",
];

const errorMessage = computed(() => {
  if (!errorCode.value) return "";
  if (ERROR_KEYS.includes(errorCode.value)) {
    return t(`importExport.import.errors.${errorCode.value}`);
  }
  if (errorCode.value === "NO_FILE") return t("importExport.import.errors.noFile");
  if (errorCode.value === "INVALID_INPUT") return t("importExport.import.errors.invalid");
  return t("importExport.import.errors.generic", { code: errorCode.value });
});

async function onSubmit() {
  if (!canSubmit.value || status.value === "uploading") return;
  status.value = "uploading";
  errorCode.value = null;
  try {
    if (tab.value === "file") {
      if (!file.value || !effectiveFormat.value) {
        errorCode.value = "NO_FILE";
        status.value = "error";
        return;
      }
      const form = new FormData();
      form.append("file", file.value, file.value.name);
      form.append("format", effectiveFormat.value);
      // The useApi composable would set a JSON content-type for any body;
      // overriding with {} lets fetch set the multipart boundary itself.
      const res = await api<{ created: number; skipped: string[] }>(
        `/workspaces/${props.workspaceId}/novels/${props.novelId}/chapters/import/file`,
        { method: "POST", body: form, headers: {} },
      );
      result.value = res;
    } else {
      const res = await api<{ created: number; skipped: string[] }>(
        `/workspaces/${props.workspaceId}/novels/${props.novelId}/chapters/import`,
        { method: "POST", body: JSON.stringify({ text: pasteText.value, format: pasteFormat.value }) },
      );
      result.value = res;
    }
    status.value = "success";
  } catch (e) {
    status.value = "error";
    errorCode.value = e instanceof ApiError ? e.code : "UNKNOWN";
  }
}

function reset() {
  tab.value = "file";
  file.value = null;
  detectedFormat.value = null;
  formatOverride.value = "auto";
  pasteText.value = "";
  pasteFormat.value = "md";
  status.value = "idle";
  errorCode.value = null;
  result.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function onCancel() {
  if (status.value === "uploading") return;
  emit("close");
}

function onDone() {
  emit("imported");
  emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    onCancel();
  }
}

watch(
  () => props.open,
  (open) => {
    // GAP-120: `immediate: true` runs this on the server during SSR, where
    // `document` is undefined — guard both branches before touching it.
    if (typeof document === "undefined") return;
    if (open) {
      opener.value = (document.activeElement as HTMLElement | null) ?? null;
      nextTick(() => dialogRef.value?.focus());
      document.addEventListener("keydown", onKeydown);
    } else {
      document.removeEventListener("keydown", onKeydown);
      if (opener.value) {
        opener.value.focus();
        opener.value = null;
      }
      nextTick(reset);
    }
  },
  { immediate: true },
);

onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>
