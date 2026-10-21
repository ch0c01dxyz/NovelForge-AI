<script setup lang="ts">
/**
 * AiSuggestionCard (NF-WF-015, Invariant 4): shows the streamed result of
 * a selection-AI operation with three actions — Accept (replace
 * selection), Insert after, Discard. The AI result NEVER writes to the
 * document or the server directly; the author's Accept is the commit
 * (via `applySuggestion` and the normal save path).
 *
 * Anchored below the selection (fixed position from the selection's
 * viewport rect); Esc discards and returns focus to the editor.
 */
import { onMounted, onBeforeUnmount, computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import type { SelectionAiOperationKey } from "../../utils/selectionAiOperations";

const props = defineProps<{
  operation: SelectionAiOperationKey;
  operationLabelKey: string;
  streaming: boolean;
  result: string;
  originalText?: string;
  /** i18n key for the error state (null when fine). */
  errorKey: string | null;
  anchor: { top: number; left: number } | null;
}>();

const emit = defineEmits<{
  (e: "accept"): void;
  (e: "insert"): void;
  (e: "discard"): void;
}>();

const { t } = useLocale();
const cardRef = ref<HTMLElement | null>(null);
const cardHeight = ref(320);
let resizeObserver: ResizeObserver | null = null;
const unchanged = computed(() => props.operation === "polish-language" && !!props.originalText && props.result.trim() === props.originalText.trim());

const style = computed(() =>
  props.anchor
    ? {
        top: `${Math.max(8, Math.min(props.anchor.top, window.innerHeight - cardHeight.value - 8))}px`,
        left: `${Math.max(8, Math.min(props.anchor.left, window.innerWidth - 360))}px`,
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("discard");
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
  // Focus the card so Esc works immediately and screen readers land on it.
  cardRef.value?.focus();
  if (cardRef.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(([entry]) => { if (entry) cardHeight.value = entry.target.getBoundingClientRect().height; });
    resizeObserver.observe(cardRef.value);
  }
});
onBeforeUnmount(() => { document.removeEventListener("keydown", onKeydown, true);resizeObserver?.disconnect(); });
</script>

<template>
  <div
    ref="cardRef"
    role="dialog"
    :aria-label="t('aiAssist.cardLabel')"
    tabindex="-1"
    :style="style"
    class="fixed z-50 flex max-h-[70vh] w-[min(340px,90vw)] flex-col gap-2 rounded-xl border border-nf-border-strong bg-nf-bg-2 p-3.5 shadow-nf-lg focus-visible:nf-focus"
  >
    <div class="flex items-center gap-2">
      <svg class="size-3.5 shrink-0 text-nf-accent-hi" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path
          d="M6 0l1.2 4.1L11 5.2 7.2 6.4 6 10.5 4.8 6.4 1 5.2l3.8-1.1L6 0zm5 8l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z"
        />
      </svg>
      <h2 class="text-[13px] font-semibold text-nf-text">{{ t(operationLabelKey) }}</h2>
      <span v-if="streaming" role="status" class="ml-auto text-[12px] text-nf-text-faint">
        {{ t("aiAssist.streaming") }}
      </span>
    </div>

    <p v-if="errorKey" role="alert" class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[13px] text-nf-warn">
      {{ t(errorKey) }}
    </p>
    <div v-if="operation === 'polish-language' && originalText" class="overflow-y-auto rounded-lg border border-nf-border bg-nf-bg-1 px-3 py-2 text-[13px] text-nf-text-dim">
      <h3 class="mb-1 font-semibold text-nf-text">{{ t('aiAssist.before') }}</h3>
      <p class="whitespace-pre-wrap">{{ originalText }}</p>
    </div>
    <h3 v-if="operation === 'polish-language'" class="text-[13px] font-semibold">{{ t('aiAssist.proposal') }}</h3>
    <div
      v-if="!errorKey"
      class="overflow-y-auto whitespace-pre-wrap rounded-lg border border-nf-border bg-nf-bg-1 px-3 py-2.5 font-nf-literary text-[14px] leading-[1.7] text-nf-text"
      :aria-live="streaming ? 'off' : 'polite'"
    >
      {{ result || (streaming ? "…" : t("aiAssist.emptyResult")) }}
    </div>
    <p v-if="operation === 'polish-language'" class="text-[12px] text-nf-text-dim">{{ t('aiAssist.polishNotice') }}</p>
    <p v-if="unchanged && !streaming && !errorKey" role="status" class="text-[12px] text-nf-text-dim">{{ t('aiAssist.polishUnchanged') }}</p>

    <div class="flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold focus-visible:nf-focus disabled:opacity-50"
        :class="operation === 'polish-language' ? 'border border-nf-border-strong text-nf-text hover:bg-nf-bg-3' : 'bg-nf-accent text-nf-accent-ink hover:bg-nf-accent-hi'"
        :disabled="streaming || !result.trim() || !!errorKey || unchanged"
        @click="emit('accept')"
      >
        {{ t(operation === 'polish-language' ? 'aiAssist.useSuggestion' : 'aiAssist.accept') }}
      </button>
      <button
        v-if="operation !== 'polish-language'"
        type="button"
        class="flex-1 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        :disabled="streaming || !result || !!errorKey"
        @click="emit('insert')"
      >
        {{ t("aiAssist.insertAfter") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus"
        :class="operation === 'polish-language' ? 'flex-1' : ''"
        @click="emit('discard')"
      >
        {{ t(operation === 'polish-language' ? 'aiAssist.ignoreSuggestion' : 'aiAssist.discard') }}
      </button>
    </div>
  </div>
</template>
