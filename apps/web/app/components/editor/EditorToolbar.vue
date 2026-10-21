<script setup lang="ts">
/**
 * EditorToolbar (NF-WF-015, Invariant 3): the mockup's static row becomes
 * real — B, I, H2, quote map to Tiptap commands; "Rewrite tone" (orange,
 * sparkle glyph per DESIGN-TOKENS.md) is the toolbar entry point to
 * selection AI. Buttons carry aria-labels and the `focus-visible:nf-focus`
 * convention; active states re-render on editor transactions.
 */
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type { Editor } from "@tiptap/core";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  editor: Editor | null | undefined;
}>();

const emit = defineEmits<{
  (e: "rewrite-tone"): void;
  (e: "polish-language"): void;
}>();

const { t } = useLocale();

/** Bumped on every editor transaction so isActive() re-evaluates. */
const tick = ref(0);
function onTransaction() {
  tick.value += 1;
}

watch(
  () => props.editor,
  (ed, prev) => {
    prev?.off("transaction", onTransaction);
    ed?.on("transaction", onTransaction);
  },
  { immediate: true },
);
onBeforeUnmount(() => props.editor?.off("transaction", onTransaction));

function active(mark: string, attrs?: Record<string, unknown>): boolean {
  void tick.value;
  return props.editor?.isActive(mark, attrs ?? {}) ?? false;
}
const boldActive = computed(() => active("bold"));
const italicActive = computed(() => active("italic"));
const h2Active = computed(() => active("heading", { level: 2 }));
const quoteActive = computed(() => active("blockquote"));
const canPolish = computed(() => { void tick.value;return !!props.editor?.isEditable; });

function run(fn: (ed: Editor) => void) {
  const ed = props.editor;
  if (ed) fn(ed);
}

const btnBase =
  "rounded-md px-2 py-1 text-[12.5px] font-semibold text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-40";
const btnOn = "bg-nf-bg-3 text-nf-text";
</script>

<template>
  <div
    role="toolbar"
    :aria-label="t('editor.toolbarLabel')"
    class="flex flex-wrap items-center gap-0.5"
  >
    <button type="button" class="rounded-md px-2 py-1 text-[12.5px] font-semibold text-nf-accent-hi hover:bg-nf-accent/10 focus-visible:nf-focus disabled:opacity-40" :disabled="!canPolish" :title="t('aiAssist.polishHint')" @mousedown.prevent @click="emit('polish-language')">{{ t('aiAssist.opPolishLanguage') }}</button>
    <button
      @mousedown.prevent
      type="button"
      :class="[btnBase, boldActive && btnOn]"
      :aria-label="t('editor.bold')"
      :aria-pressed="boldActive"
      :disabled="!editor"
      @click="run((ed) => ed.chain().focus().toggleBold().run())"
    >
      B
    </button>
    <button
      @mousedown.prevent
      type="button"
      :class="[btnBase, italicActive && btnOn, 'font-nf-literary italic']"
      :aria-label="t('editor.italic')"
      :aria-pressed="italicActive"
      :disabled="!editor"
      @click="run((ed) => ed.chain().focus().toggleItalic().run())"
    >
      I
    </button>
    <button
      @mousedown.prevent
      type="button"
      :class="[btnBase, h2Active && btnOn]"
      :aria-label="t('editor.heading2')"
      :aria-pressed="h2Active"
      :disabled="!editor"
      @click="run((ed) => ed.chain().focus().toggleHeading({ level: 2 }).run())"
    >
      H2
    </button>
    <button
      @mousedown.prevent
      type="button"
      :class="[btnBase, quoteActive && btnOn]"
      :aria-label="t('editor.quote')"
      :aria-pressed="quoteActive"
      :disabled="!editor"
      @click="run((ed) => ed.chain().focus().toggleBlockquote().run())"
    >
      <span aria-hidden="true">“ ”</span>
    </button>
    <span class="mx-1.5 h-5 w-px bg-nf-border" aria-hidden="true" />
    <button
      @mousedown.prevent
      type="button"
      :aria-label="t('aiAssist.opRewriteTone')"
      :disabled="!editor"
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold text-nf-accent-hi hover:bg-nf-accent/10 focus-visible:nf-focus disabled:opacity-40"
      @click="emit('rewrite-tone')"
    >
      <svg
        class="size-3"
        viewBox="0 0 12 12"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M6 0l1.2 4.1L11 5.2 7.2 6.4 6 10.5 4.8 6.4 1 5.2l3.8-1.1L6 0zm5 8l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z"
        />
      </svg>
      {{ t("aiAssist.opRewriteTone") }}
    </button>
  </div>
</template>
