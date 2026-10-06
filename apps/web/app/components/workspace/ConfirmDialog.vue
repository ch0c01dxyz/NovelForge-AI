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
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          data-testid="confirm-cancel"
          class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          @click="onCancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          data-testid="confirm-ok"
          :class="
            danger
              ? 'rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-[13px] font-semibold text-red-200 hover:bg-red-950/70 focus-visible:nf-focus'
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

const props = defineProps<{
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Danger styling for destructive confirmations (delete, supersede). */
  danger?: boolean;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);

function onCancel() {
  emit("cancel");
}

function onConfirm() {
  emit("confirm");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("cancel");
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
  { flush: "post" },
);

onMounted(() => document.addEventListener("keydown", onKeydown, true));
onUnmounted(() => document.removeEventListener("keydown", onKeydown, true));

</script>
