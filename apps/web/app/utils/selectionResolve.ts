/**
 * NF-WF-015 (Invariant 4): stale-selection resolution for selection AI.
 *
 * The author selects text, the suggestion streams, and autosave (or a
 * remote edit resolved through the conflict banner) may change the
 * document between selection and Accept. On Accept the editor re-resolves
 * the captured text in the CURRENT document: if the exact text is still
 * at the captured range it is replaced; otherwise the result is inserted
 * after the current cursor INSTEAD of replacing, with the
 * `aiAssist.staleSelection` notice — never a silent mis-replace.
 */
import type { Editor } from "@tiptap/core";

export interface CapturedSelection {
  from: number;
  to: number;
  text: string;
}

/** Capture the current non-collapsed selection (null when collapsed). */
export function captureSelection(editor: Editor): CapturedSelection | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  return { from, to, text: editor.state.doc.textBetween(from, to, " ", " ") };
}

export type AcceptOutcome = "replaced" | "inserted-after";

/**
 * Apply the AI suggestion with the stale-selection pin. Returns how the
 * suggestion landed so the caller can show the stale-selection notice.
 * The suggestion is inserted as plain text — AI prose, never markup.
 */
export function applySuggestion(
  editor: Editor,
  captured: CapturedSelection,
  suggestion: string,
): AcceptOutcome {
  let stillThere = false;
  try {
    stillThere =
      editor.state.doc.textBetween(captured.from, captured.to, " ", " ") ===
      captured.text;
  } catch {
    // The range is no longer valid (the document shrank) — stale.
    stillThere = false;
  }
  if (stillThere) {
    editor
      .chain()
      .focus()
      .deleteRange({ from: captured.from, to: captured.to })
      .insertContentAt(captured.from, suggestion)
      .run();
    return "replaced";
  }
  editor.chain().focus().insertContentAt(editor.state.selection.head, suggestion).run();
  return "inserted-after";
}
