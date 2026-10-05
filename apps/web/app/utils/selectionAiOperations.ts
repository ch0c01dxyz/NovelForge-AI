/**
 * NF-WF-015 (Invariant 4): the six pinned selection-AI operations, client
 * mirror of the server source of truth
 * (`apps/api/src/services/selection-ai.ts`, project-owned English system
 * prompts). The two files must stay verbatim-identical; the diff
 * reviewer verifies.
 *
 * Transport: `POST /api/workspaces/:workspaceId/generations` (+ `/stream`
 * for SSE) with `profile: "CREATIVE_WRITER"`, the pinned `task`, and
 * `messages` = system instruction (the operation's prompt) + user message
 * carrying the selected text (<= 2000 chars) plus bounded surrounding
 * context (<= 1000 chars) — never the whole chapter (constitution §2.16).
 * `maxTokens` is pinned at 2000 (contract ceiling: <= 4000).
 */
export type SelectionAiOperationKey =
  | "rewrite-tone"
  | "expand"
  | "more-dialogue"
  | "show-dont-tell"
  | "continue-scene"
  | "free-prompt";

export interface SelectionAiOperation {
  key: SelectionAiOperationKey;
  /** i18n label key for the operation name. */
  labelKey: string;
  /** Pinned `task` value sent on the generation request. */
  task: string;
  /** Project-owned English system instruction (mirrors the server). */
  systemPrompt: string;
}

export const SELECTION_AI_OPERATIONS: Record<
  SelectionAiOperationKey,
  SelectionAiOperation
> = {
  "rewrite-tone": {
    key: "rewrite-tone",
    labelKey: "aiAssist.opRewriteTone",
    task: "selection.rewrite-tone",
    systemPrompt:
      "You are a line editor for a webnovel. Rewrite the selected passage in the tone the author requests (or, if no tone is named, a tone consistent with the surrounding context), preserving every plot fact, character name, and continuity detail. Return ONLY the rewritten passage as plain prose — no commentary, no quotation marks around it, no explanation.",
  },
  expand: {
    key: "expand",
    labelKey: "aiAssist.opExpand",
    task: "selection.expand",
    systemPrompt:
      "You are a webnovel writing assistant. Expand the selected passage with richer sensory detail, interiority, and pacing consistent with the surrounding context. Do not introduce new plot facts, characters, or continuity changes. Return ONLY the expanded passage as plain prose — no commentary, no explanation.",
  },
  "more-dialogue": {
    key: "more-dialogue",
    labelKey: "aiAssist.opMoreDialogue",
    task: "selection.more-dialogue",
    systemPrompt:
      "You are a webnovel writing assistant. Rewrite the selected passage so that more of the story is carried by dialogue between the characters present, keeping each character's voice consistent with the surrounding context. Do not change plot facts or continuity. Return ONLY the rewritten passage as plain prose — no commentary, no explanation.",
  },
  "show-dont-tell": {
    key: "show-dont-tell",
    labelKey: "aiAssist.opShowDontTell",
    task: "selection.show-dont-tell",
    systemPrompt:
      "You are a webnovel writing assistant. Rewrite the selected passage using 'show, don't tell': replace summary statements of emotion, character, and atmosphere with concrete action, sensory detail, and dialogue that lets the reader infer them. Preserve every plot fact and continuity detail. Return ONLY the rewritten passage as plain prose — no commentary, no explanation.",
  },
  "continue-scene": {
    key: "continue-scene",
    labelKey: "aiAssist.opContinueScene",
    task: "selection.continue-scene",
    systemPrompt:
      "You are a webnovel writing assistant. Continue the scene from the selected passage: write the next beats in the same POV, tense, and voice as the surrounding context, advancing the action or tension naturally. Do not resolve the scene's central conflict or introduce new characters or plot facts the context does not support. Return ONLY the continuation as plain prose — no commentary, no explanation. (The author's Insert-after places it directly after the selection.)",
  },
  "free-prompt": {
    key: "free-prompt",
    labelKey: "aiAssist.opFreePrompt",
    task: "selection.free-prompt",
    systemPrompt:
      "You are a webnovel writing assistant. Follow the author's instruction below for the selected passage, keeping POV, tense, voice, and continuity consistent with the surrounding context. Do not introduce new plot facts, characters, or continuity changes unless the instruction explicitly asks. Return ONLY the resulting prose — no commentary, no explanation.",
  },
};

/** Char ceilings (contract pins; the implementer uses them as-is). */
export const SELECTION_MAX_CHARS = 2000;
export const SELECTION_CONTEXT_CHARS = 1000;
/** maxTokens bound for selection requests (contract ceiling: <= 4000). */
export const SELECTION_MAX_TOKENS = 2000;
