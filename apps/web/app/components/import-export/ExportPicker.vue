<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
    <div class="absolute inset-0 bg-black/60" data-testid="export-backdrop" @click="onCancel" />
    <section
      ref="dialogRef"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="t('importExport.export.dialogTitle')"
      class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md focus-visible:nf-focus"
    >
      <h2 class="text-[15px] font-semibold text-nf-text">{{ t("importExport.export.dialogTitle") }}</h2>
      <p class="mt-1 text-[13px] leading-relaxed text-nf-text-dim">
        {{ t("importExport.export.dialogDescription") }}
      </p>

      <fieldset class="mt-4">
        <legend class="mb-2 text-[13px] font-medium text-nf-text">
          {{ t("importExport.export.formatLabel") }}
        </legend>
        <div class="grid grid-cols-1 gap-1.5">
          <label
            v-for="f in FORMATS"
            :key="f.value"
            class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] focus-visible:nf-focus"
            :class="
              format === f.value
                ? 'border-nf-accent/60 bg-nf-accent/10 text-nf-text'
                : 'border-nf-border-strong text-nf-text-dim hover:text-nf-text'
            "
            :data-testid="`export-format-${f.value}`"
          >
            <input
              v-model="format"
              type="radio"
              name="export-format"
              :value="f.value"
              class="mt-0.5 accent-nf-accent"
            />
            <span>
              <span class="block font-medium text-nf-text">{{ f.label }}</span>
              <span class="block text-[12px] text-nf-text-faint">{{ f.hint }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <p class="mt-3 text-[12px] text-nf-text-faint">
        {{ t("importExport.export.sizeNotice") }}
      </p>

      <p
        v-if="status === 'error'"
        role="alert"
        data-testid="export-error"
        class="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[13px] text-red-200"
      >
        {{ errorMessage }}
      </p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
          @click="onCancel"
        >
          {{ t("common.cancel") }}
        </button>
        <button
          type="button"
          data-testid="export-download"
          :disabled="status === 'downloading'"
          class="rounded-lg bg-nf-bg-2 px-3 py-1.5 text-[13px] font-medium text-nf-text hover:bg-nf-bg-3 disabled:opacity-50 focus-visible:nf-focus"
          @click="onDownload"
        >
          {{ status === "downloading" ? t("importExport.export.downloading") : t("importExport.export.download") }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * ExportPicker (NF-WF-017B): the author-facing export UI on the writer
 * page. Format selection (the five retained export formats), sync
 * download via an object URL, and typed-error → en/id message mapping.
 *
 * Esc dismisses; focus returns to the opener. Import/export are not AI
 * affordances, so no orange (design tokens §AI-orange restriction).
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";

type ExportFormatValue = "md" | "txt" | "docx" | "pdf" | "epub";

const props = defineProps<{
  open: boolean;
  workspaceId: string;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useLocale();

const dialogRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);
const format = ref<ExportFormatValue>("md");
const status = ref<"idle" | "downloading" | "error">("idle");
const errorCode = ref<string | null>(null);

const FORMATS: { value: ExportFormatValue; label: string; hint: string }[] = [
  { value: "md", label: "Markdown", hint: "Plain-text manuscript, round-trip safe" },
  { value: "txt", label: "TXT", hint: "Plain text, chapter headings as setext" },
  { value: "docx", label: "DOCX", hint: "Word document with heading styles" },
  { value: "pdf", label: "PDF", hint: "Paginated document, one section per chapter" },
  { value: "epub", label: "EPUB", hint: "E-book, one document per chapter" },
];

const errorMessage = computed(() => {
  if (!errorCode.value) return "";
  if (errorCode.value === "EXPORT_TOO_LARGE") {
    return t("importExport.export.errors.EXPORT_TOO_LARGE");
  }
  if (errorCode.value === "INVALID_INPUT") return t("importExport.export.errors.invalid");
  return t("importExport.export.errors.generic", { code: errorCode.value });
});

function exportUrl(): string {
  // The useApi convention: callers pass the path WITHOUT the `/api`
  // prefix; the fetch adds it.
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/export?format=${format.value}`;
}

async function onDownload() {
  status.value = "downloading";
  errorCode.value = null;
  try {
    // Binary download — useApi is JSON-only, so fetch directly and reuse
    // the {error: CODE} envelope for the typed 400/413 refusals.
    const res = await fetch(`/api${exportUrl()}`, { credentials: "same-origin" });
    if (!res.ok) {
      let code = String(res.status);
      try {
        code = ((await res.json()) as { error?: string }).error ?? code;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(code);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    emit("close");
  } catch (e) {
    status.value = "error";
    errorCode.value = e instanceof Error ? e.message : "UNKNOWN";
  } finally {
    if (status.value === "downloading") status.value = "idle";
  }
}

function onCancel() {
  status.value = "idle";
  errorCode.value = null;
  emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") onCancel();
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      opener.value = document.activeElement as HTMLElement | null;
      status.value = "idle";
      errorCode.value = null;
      window.addEventListener("keydown", onKeydown);
      await nextTick();
      dialogRef.value?.focus();
    } else {
      window.removeEventListener("keydown", onKeydown);
      opener.value?.focus();
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
