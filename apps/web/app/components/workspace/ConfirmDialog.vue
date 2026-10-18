<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
    <div class="absolute inset-0 bg-black/60" data-testid="confirm-backdrop" @click="onCancel" />
    <section
      ref="dialogRef"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      :aria-label="title"
      class="relative w-full max-w-md rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md focus-visible:nf-focus"
    >
      <h2 class="text-[15px] font-semibold text-nf-text">{{ title }}</h2>
      <p class="mt-2 text-[13px] leading-relaxed text-nf-text-dim">{{ body }}</p>
      <p v-if="error" role="alert" class="mt-2 text-[13px] text-nf-error">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          data-testid="confirm-cancel"
          :disabled="busy"
          class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          @click="onCancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          data-testid="confirm-ok"
          :disabled="busy"
          :class="
            danger
              ? 'rounded-lg border border-nf-error/60 bg-nf-error/15 px-4 py-2 text-[13px] font-semibold text-nf-error hover:bg-nf-error/25 focus-visible:nf-focus'
              : 'rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus'
          "
          @click="onConfirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * ConfirmDialog (NF-WF-016): a small explicit-confirmation dialog used by
 * every destructive workspace action (archive/delete/supersede) and by the
 * outline-version approval decision.
 *
 * Labels arrive as props so every string stays behind the caller's
 * useLocale() keys. Esc dismisses; focus returns to the opener.
 */
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { trapDialogFocus } from "../../utils/trapDialogFocus";

const props = defineProps<{
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Danger styling for destructive confirmations (delete, supersede). */
  danger?: boolean;
  busy?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);

function onCancel() {
  if (props.busy) return;
  emit("cancel");
}

function onConfirm() {
  if (props.busy) return;
  emit("confirm");
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") {
    // Only intercept while this dialog is actually open: the document-level
    // capture listener stays attached for the component's whole lifetime, so
    // an unguarded stopPropagation would swallow Escape meant for any other
    // layered surface (e.g. a manager dialog hosting this confirm).
    if (!props.open) return;
    e.stopPropagation();
    e.preventDefault();
    onCancel();
  } else if (e.key === "Tab") {
    trapDialogFocus(e, dialogRef.value);
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      opener.value = (document.activeElement as HTMLElement | null) ?? null;
      nextTick(() => dialogRef.value?.focus());
    } else if (opener.value) {
      opener.value.focus();
      opener.value = null;
    }
  },
  { flush: "post", immediate: true },
);

onMounted(() => document.addEventListener("keydown", onKeydown, true));
onUnmounted(() => document.removeEventListener("keydown", onKeydown, true));

</script>
