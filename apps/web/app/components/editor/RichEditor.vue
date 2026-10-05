<script setup lang="ts">
/**
 * RichEditor (NF-WF-015, Invariant 1): the Tiptap v3 manuscript editor.
 *
 * Replaces the 007 `<textarea>`. `useEditor`/`EditorContent` from
 * `@tiptap/vue-3`; the schema is restricted to the manuscript subset
 * (paragraph, heading level 2, bold, italic, blockquote, lists, hard
 * break, hr — no tables, no embeds, no links). The editor is
 * client-only (ProseMirror needs the DOM); the page wraps it in
 * `<ClientOnly>`.
 *
 * The page keeps owning `content`/`version`/`saveState`/`saveNow`: the
 * editor emits `update:modelValue` (sanitized-HTML string via
 * `getHTML()`) on Tiptap `onUpdate`. The isSame guard
 * (`editor.getHTML() === value` → skip `setContent`) plus the
 * suppressEmit flag keep programmatic loads (chapter switch, conflict
 * reload) from marking the document dirty or moving the cursor.
 */
import { watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { looksLikeHtml, plainTextToHtml } from "../../utils/htmlText";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const props = defineProps<{
  modelValue: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", html: string): void;
  (e: "editor-ready", editor: Editor): void;
  (e: "blur"): void;
}>();

let suppressEmit = false;

const editor = useEditor({
  extensions: [
    // Manuscript subset (Invariant 1): everything the server allowlist
    // keeps, nothing it strips. code/codeBlock (`<code>`, `<pre>`),
    // strike (`<s>`), underline (`<u>`) and links (`<a>`) are disabled
    // so the editor cannot produce tags `sanitizeChapterHtml` removes.
    StarterKit.configure({
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: false,
      heading: { levels: [2] },
    }),
  ],
  // Legacy chapters (pre-015 textarea writer) store plain text with
  // blank-line paragraph separators; the editor needs manuscript HTML.
  content: looksLikeHtml(props.modelValue)
    ? props.modelValue
    : plainTextToHtml(props.modelValue),
  editorProps: {
    attributes: {
      class: "nf-editor-prose",
      ...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {}),
    },
  },
  onCreate: ({ editor: ed }) => emit("editor-ready", ed),
  onUpdate: ({ editor: ed }) => {
    if (suppressEmit) return;
    emit("update:modelValue", ed.getHTML());
  },
  onBlur: () => emit("blur"),
});

watch(
  () => props.modelValue,
  (value) => {
    const ed = editor.value;
    const incoming = looksLikeHtml(value) ? value : plainTextToHtml(value);
    if (!ed || ed.getHTML() === incoming) return; // isSame guard
    suppressEmit = true;
    try {
      ed.commands.setContent(incoming);
    } finally {
      suppressEmit = false;
    }
  },
);
</script>

<template>
  <EditorContent :editor="editor" />
</template>

<style scoped>
/* Manuscript prose inside the ProseMirror view: the design's literary
   serif voice (17.5px/1.85, the textarea's measure). Design tokens via
   the Tailwind v4 theme variables (main.css @theme). */
:deep(.nf-editor-prose) {
  font-family: var(--font-nf-literary);
  font-size: 17.5px;
  line-height: 1.85;
  color: var(--color-nf-text);
  outline: none;
  min-height: 24rem;
}
:deep(.nf-editor-prose p) {
  margin: 0 0 1em;
}
:deep(.nf-editor-prose h2) {
  font-size: 1.35em;
  font-weight: 600;
  line-height: 1.4;
  margin: 1.4em 0 0.7em;
}
:deep(.nf-editor-prose blockquote) {
  border-left: 2px solid var(--color-nf-border-strong);
  padding-left: 1em;
  margin: 0 0 1em;
  color: var(--color-nf-text-dim);
}
:deep(.nf-editor-prose ul),
:deep(.nf-editor-prose ol) {
  margin: 0 0 1em;
  padding-left: 1.5em;
}
:deep(.nf-editor-prose hr) {
  border: none;
  border-top: 1px solid var(--color-nf-border);
  margin: 1.5em 0;
}
:deep(.nf-editor-prose:focus-visible) {
  outline: 2px solid var(--color-nf-accent-hi);
  outline-offset: 4px;
  border-radius: 4px;
}
/* DESIGN-TOKENS.md: selection in prose — accent-dim bg + 2px inset left
   accent bar. */
:deep(.nf-editor-prose ::selection) {
  background: color-mix(in srgb, var(--color-nf-accent) 30%, transparent);
  box-shadow: inset 2px 0 0 var(--color-nf-accent);
}
</style>
