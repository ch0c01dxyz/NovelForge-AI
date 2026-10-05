<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Approval dialog (NF-WF-007 output #6): approve/reject, hash echo.
 *
 * The dialog shows the snapshot hash being approved (truncated, full on
 * demand) and binds the decision to the snapshot read the review derived
 * from — it MUST NOT silently re-fetch and re-approve after a 409
 * (Invariant 2.5, Invariant 5). Reject requires a reason (backend 400s
 * without it). Accessibility (Invariant 10): real <dialog>, focus trap,
 * Esc cancels, focus returns to the invoking control on close.
 */
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  open: boolean;
  snapshotHash: string;
  deciding: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "approve", reason: string | undefined): void;
  (e: "reject", reason: string): void;
}>();

const { t } = useLocale();
const dialogEl = ref<HTMLDialogElement | null>(null);
const reason = ref("");
const mode = ref<"approve" | "reject">("approve");
const reasonError = ref(false);
const showFullHash = ref(false);
let invoker: HTMLElement | null = null;

const shortHash = computed(() =>
  props.snapshotHash.length > 16
    ? `${props.snapshotHash.slice(0, 8)}…${props.snapshotHash.slice(-8)}`
    : props.snapshotHash,
);

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Tab" || !dialogEl.value) return;
  // Focus trap: cycle within the dialog.
  const focusables = dialogEl.value.querySelectorAll<HTMLElement>(
    'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
  );
  const list = [...focusables].filter((el) => !el.hasAttribute("disabled"));
  if (!list.length) return;
  const first = list[0]!;
  const last = list[list.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      invoker = document.activeElement as HTMLElement | null;
      reason.value = "";
      mode.value = "approve";
      reasonError.value = false;
      showFullHash.value = false;
      nextTick(() => {
        dialogEl.value?.showModal();
        dialogEl.value?.querySelector<HTMLElement>("button")?.focus();
      });
    } else {
      dialogEl.value?.close();
      invoker?.focus?.();
      invoker = null;
    }
  },
);

function submit() {
  if (mode.value === "reject" && !reason.value.trim()) {
    reasonError.value = true;
    return;
  }
  reasonError.value = false;
  const r = reason.value.trim();
  if (mode.value === "approve") emit("approve", r ? r : undefined);
  else emit("reject", r);
}

function onCancel(e: Event) {
  // <dialog> fires `cancel` on Esc — route it through the close emit so
  // focus returns to the invoking control.
  e.preventDefault();
  emit("close");
}
</script>

<template>
  <dialog
    ref="dialogEl"
    aria-labelledby="approval-title"
    class="rounded-xl border border-nf-border-strong bg-nf-bg-1 p-0 text-nf-text shadow-nf-md backdrop:bg-black/60"
    @cancel="onCancel"
    @keydown="onKeydown"
    @click.self="emit('close')"
  >
    <form
      method="dialog"
      class="flex w-[min(480px,92vw)] flex-col gap-4 p-5"
      @submit.prevent="submit"
    >
      <h2 id="approval-title" class="text-[15px] font-semibold">
        {{ t("review.title") }}
      </h2>

      <div class="text-[12.5px]">
        <span class="text-nf-text-faint">{{ t("review.hashLabel") }}:</span>
        <code class="ml-1 font-mono text-[12px] text-nf-text-dim">{{
          showFullHash ? snapshotHash : shortHash
        }}</code>
        <button
          type="button"
          class="ml-2 text-[12px] text-nf-accent-hi underline underline-offset-2 focus-visible:nf-focus"
          @click="showFullHash = !showFullHash"
        >
          {{ t("review.showFullHash") }}
        </button>
      </div>

      <p class="rounded-lg border border-nf-accent/40 bg-nf-accent/10 px-3 py-2 text-[12px] leading-relaxed text-nf-accent-hi">
        {{ t("review.textAcceptance") }}
      </p>

      <div class="flex gap-2" role="radiogroup" aria-label="Decision">
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'approve'"
          class="flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold focus-visible:nf-focus"
          :class="
            mode === 'approve'
              ? 'border-nf-accent bg-nf-accent/15 text-nf-accent-hi'
              : 'border-nf-border-strong text-nf-text-dim hover:bg-nf-bg-2'
          "
          @click="mode = 'approve'"
        >
          {{ t("review.approve") }}
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'reject'"
          class="flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold focus-visible:nf-focus"
          :class="
            mode === 'reject'
              ? 'border-nf-warn bg-nf-warn/15 text-nf-warn'
              : 'border-nf-border-strong text-nf-text-dim hover:bg-nf-bg-2'
          "
          @click="mode = 'reject'"
        >
          {{ t("review.reject") }}
        </button>
      </div>

      <label class="flex flex-col gap-1 text-[12.5px]">
        <span class="font-medium text-nf-text-dim">{{ t("review.reasonLabel") }}</span>
        <textarea
          v-model="reason"
          rows="2"
          :placeholder="
            mode === 'reject' ? t('review.reasonRequiredPlaceholder') : t('review.reasonOptional')
          "
          :aria-invalid="reasonError"
          class="resize-none rounded-lg border border-nf-border-strong bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
        />
        <span v-if="reasonError" role="alert" class="text-[12px] text-nf-warn">
          {{ t("review.reasonRequired") }}
        </span>
      </label>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          :disabled="deciding"
          @click="emit('close')"
        >
          {{ t("common.cancel") }}
        </button>
        <button
          type="submit"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="deciding"
        >
          {{
            deciding
              ? mode === "reject"
                ? t("review.rejecting")
                : t("review.approving")
              : mode === "reject"
                ? t("review.reject")
                : t("review.approve")
          }}
        </button>
      </div>
    </form>
  </dialog>
</template>
