/**
 * Selection-AI orchestration (NF-WF-015, Invariant 4).
 *
 * Runs a pinned operation against the existing generations
 * API (`POST /api/workspaces/:workspaceId/generations/stream`, SSE) with
 * `profile: "CREATIVE_WRITER"` and the pinned `task`. Selection text is
 * capped at 2000 chars and surrounding context at 1000 chars — never the
 * whole chapter (constitution §2.16). `maxTokens` is pinned at 2000
 * (contract ceiling: <= 4000).
 *
 * The result NEVER writes to the document or the server directly: the
 * AiSuggestionCard's Accept is the commit, via `applySuggestion` (the
 * stale-selection pin) and the normal editor → saveNow path.
 *
 * GAP-028 does not block this: selection AI rides the API-served
 * `generate` path, not the production worker. If no model is routed
 * (`NoRouteError` → 409), the card shows the actionable "no model
 * configured" state — no retry loop, no silent failure.
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import {
  SELECTION_AI_OPERATIONS,
  SELECTION_MAX_CHARS,
  SELECTION_CONTEXT_CHARS,
  SELECTION_MAX_TOKENS,
  type SelectionAiOperationKey,
} from "../utils/selectionAiOperations";
import { captureSelection, type CapturedSelection } from "../utils/selectionResolve";

export interface SelectionAiRequest {
  operation: SelectionAiOperationKey;
  task: string;
  selectionChars: number;
}

interface RunOptions {
  workspaceId: string;
  novelId: string;
  chapterId?: string;
  editor: Editor;
  operation: SelectionAiOperationKey;
  freePrompt?: string;
}

/** Bounded surrounding context: text around the selection, ≤ 1000 chars. */
function surroundingContext(editor: Editor, sel: CapturedSelection): string {
  const docSize = editor.state.doc.content.size;
  const before = editor.state.doc.textBetween(Math.max(0, sel.from - 1200), sel.from, " ", " ");
  const after = editor.state.doc.textBetween(sel.to, Math.min(docSize, sel.to + 1200), " ", " ");
  return `${before} ${after}`.trim().slice(0, SELECTION_CONTEXT_CHARS);
}

export function useSelectionAi() {
  const streaming = ref(false);
  const result = ref("");
  /** i18n key for the current error state (null when fine). */
  const errorKey = ref<string | null>(null);
  const activeRequest = ref<SelectionAiRequest | null>(null);
  const captured = ref<CapturedSelection | null>(null);
  let abort: AbortController | null = null;

  function cancel() {
    abort?.abort();
    abort = null;
    streaming.value = false;
  }

  function reset() {
    cancel();
    result.value = "";
    errorKey.value = null;
    activeRequest.value = null;
    captured.value = null;
  }

  async function run(opts: RunOptions): Promise<void> {
    reset();
    const op = SELECTION_AI_OPERATIONS[opts.operation];
    const sel = captureSelection(opts.editor, opts.operation === "polish-language");
    if (!sel) {
      errorKey.value = opts.operation === "polish-language" ? "aiAssist.polishSelectParagraph" : "editor.selectTextFirst";
      return;
    }
    if (opts.operation === "polish-language" && sel.text.length > SELECTION_MAX_CHARS) {
      errorKey.value = "aiAssist.selectionTooLong";
      return;
    }
    const selection = sel.text.slice(0, SELECTION_MAX_CHARS);
    const context = surroundingContext(opts.editor, sel);
    const userContent =
      opts.operation === "free-prompt"
        ? `Author instruction: ${(opts.freePrompt ?? "").slice(0, 500)}\n\nSelected passage:\n${selection}\n\nSurrounding context:\n${context}`
        : `Selected passage:\n${selection}\n\nSurrounding context:\n${context}`;

    captured.value = sel;
    activeRequest.value = {
      operation: opts.operation,
      task: op.task,
      selectionChars: selection.length,
    };
    streaming.value = true;

    const controller = new AbortController();
    abort = controller;
    let completed = false;
    try {
      const res = await fetch(
        `/api/workspaces/${opts.workspaceId}/generations/stream`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            task: op.task,
            profile: "CREATIVE_WRITER",
            novelId: opts.novelId,
            component: "CHAPTER",
            artifactId: opts.chapterId,
            messages: [
              { role: "system", content: op.systemPrompt },
              { role: "user", content: userContent },
            ],
            maxTokens: SELECTION_MAX_TOKENS,
          }),
          signal: controller.signal,
        },
      );
      if (abort !== controller) return;
      if (!res.ok) {
        let code = String(res.status);
        try {
          code = (await res.json() as { error?: string }).error ?? code;
        } catch {
          /* non-JSON error body */
        }
        if (abort !== controller) return;
        // NoRouteError → 409: no model is routed for CREATIVE_WRITER —
        // the actionable state, not a retry loop.
        errorKey.value = res.status === 409 ? "aiAssist.noModel" : "aiAssist.requestFailed";
        void code;
        streaming.value = false;
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (abort !== controller) return;
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = /^event: (.+)$/m.exec(chunk)?.[1]?.trim();
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          let data: { delta?: string; status?: string } | null = null;
          try {
            data = dataLine ? (JSON.parse(dataLine.slice(5)) as { delta?: string; status?: string }) : null;
          } catch {
            data = null;
          }
          if (event === "delta" && data?.delta) result.value += data.delta;
          else if (event === "error") errorKey.value = "aiAssist.requestFailed";
          else if (event === "done") completed = data?.status === "SUCCEEDED";
        }
      }
      if (opts.operation === "polish-language" && !completed) errorKey.value = "aiAssist.incompleteSuggestion";
    } catch (e) {
      // AbortError: the author closed the card mid-stream — not an error.
      if (abort === controller && (e as Error).name !== "AbortError") errorKey.value = "aiAssist.requestFailed";
    } finally {
      if (abort === controller) { streaming.value = false;abort = null; }
    }
  }

  return { streaming, result, errorKey, activeRequest, captured, run, cancel, reset };
}
