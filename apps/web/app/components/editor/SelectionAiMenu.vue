<script setup lang="ts">
/**
 * SelectionAiMenu (NF-WF-015, Invariant 4): the floating bubble menu that
 * appears over a non-collapsed text selection in the editor.
 *
 * From `@tiptap/vue-3/menus` (v3 stable pin). Lists the six pinned
 * operations; "Ask the writing agent" opens a small prompt input in the
 * same menu. Esc dismisses and returns focus to the editor. Orange +
 * sparkle glyph per DESIGN-TOKENS.md (orange marks every AI affordance).
 */
import { ref, computed } from "vue";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import type { Editor } from "@tiptap/core";
import { useLocale } from "../../composables/useLocale";
import {
  SELECTION_AI_OPERATIONS,
  type SelectionAiOperationKey,
} from "../../utils/selectionAiOperations";

const props = defineProps<{
  editor: Editor | null | undefined;
}>();

const emit = defineEmits<{
  (e: "run-operation", operation: SelectionAiOperationKey): void;
  (e: "run-free-prompt", prompt: string): void;
}>();

const { t } = useLocale();
const operations = computed(() => Object.values(SELECTION_AI_OPERATIONS));

const showPromptInput = ref(false);
const freePrompt = ref("");

function shouldShow(): boolean {
  const ed = props.editor;
  return !!ed && !ed.state.selection.empty && ed.isFocused;
}

function pick(op: SelectionAiOperationKey) {
  emit("run-operation", op);
}

function submitFreePrompt() {
  const prompt = freePrompt.value.trim();
  if (!prompt) return;
  freePrompt.value = "";
  showPromptInput.value = false;
  emit("run-free-prompt", prompt);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    showPromptInput.value = false;
    props.editor?.commands.focus();
  }
}
</script>

<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :should-show="shouldShow"
    :options="{ placement: 'bottom' }"
  >
    <div
      role="menu"
      :aria-label="t('aiAssist.menuLabel')"
      class="flex max-w-[320px] flex-col gap-0.5 rounded-xl border border-nf-border-strong bg-nf-bg-2 p-1.5 shadow-nf-lg"
      @keydown="onKeydown"
    >
      <div class="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
        {{ t("aiAssist.menuTitle") }}
      </div>
      <button
        v-for="op in operations.filter((o) => o.key !== 'free-prompt')"
        :key="op.key"
        type="button"
        role="menuitem"
        class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
        @click="pick(op.key)"
      >
        <svg class="size-3 shrink-0 text-nf-accent-hi" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path
            d="M6 0l1.2 4.1L11 5.2 7.2 6.4 6 10.5 4.8 6.4 1 5.2l3.8-1.1L6 0zm5 8l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z"
          />
        </svg>
        {{ t(op.labelKey) }}
      </button>
      <div v-if="showPromptInput" class="flex flex-col gap-1.5 px-1 pb-1 pt-1">
        <label :for="`free-prompt-input`" class="px-1.5 text-[12px] text-nf-text-dim">
          {{ t("aiAssist.freePromptLabel") }}
        </label>
        <input
          id="free-prompt-input"
          v-model="freePrompt"
          type="text"
          :placeholder="t('aiAssist.freePromptPlaceholder')"
          class="rounded-lg border border-nf-border-strong bg-nf-bg-1 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          @keydown.enter="submitFreePrompt"
        />
        <button
          type="button"
          class="rounded-lg bg-nf-accent px-3 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="!freePrompt.trim()"
          @click="submitFreePrompt"
        >
          {{ t("aiAssist.runFreePrompt") }}
        </button>
      </div>
      <button
        v-else
        type="button"
        role="menuitem"
        class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-nf-accent-hi hover:bg-nf-accent/10 focus-visible:nf-focus"
        @click="showPromptInput = true"
      >
        <svg class="size-3 shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path
            d="M6 0l1.2 4.1L11 5.2 7.2 6.4 6 10.5 4.8 6.4 1 5.2l3.8-1.1L6 0zm5 8l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z"
          />
        </svg>
        {{ t("aiAssist.opFreePrompt") }}
      </button>
    </div>
  </BubbleMenu>
</template>
