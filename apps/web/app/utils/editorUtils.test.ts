/**
 * Editor util tests (NF-WF-015):
 * - htmlText: the shared strip rule (mirrors the server), word count,
 *   HTML detection, and legacy plain-text → manuscript HTML conversion.
 * - selectionResolve: the forced-race stale-selection pin — a selection
 *   captured, then the document changed underneath (autosave/remote edit),
 *   then Accept must NOT mis-replace.
 * - selectionAiOperations: the client mirror stays verbatim-identical to
 *   the server source of truth (prompts, pinned task names, bounds).
 */
import { describe, expect, it } from "vitest";
import { markRaw } from "vue";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  stripHtmlTags,
  countWords,
  looksLikeHtml,
  plainTextToHtml,
} from "./htmlText";
import { captureSelection, applySuggestion } from "./selectionResolve";
import {
  SELECTION_AI_OPERATIONS,
  SELECTION_MAX_CHARS,
  SELECTION_CONTEXT_CHARS,
  SELECTION_MAX_TOKENS,
} from "./selectionAiOperations";
import { SELECTION_AI_OPERATIONS as SERVER_OPERATIONS } from "../../../api/src/services/selection-ai";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function editor(content: string): Editor {
  return markRaw(
    new Editor({
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          strike: false,
          underline: false,
          link: false,
          heading: { levels: [2] },
        }),
      ],
      content,
    }),
  );
}

describe("htmlText", () => {
  it("strips tags with the server rule (space per tag, no word fusion)", () => {
    expect(stripHtmlTags("<p>a</p><p>b</p>")).toBe(" a  b ");
    expect(stripHtmlTags("<h2>Title</h2><blockquote>q</blockquote>")).toContain("Title");
    expect(stripHtmlTags("plain")).toBe("plain");
  });

  it("counts words on stripped text", () => {
    expect(countWords("<p>a</p><p>b c</p>")).toBe(3);
    expect(countWords("  ")).toBe(0);
    expect(countWords("")).toBe(0);
    expect(countWords("<p>one</p>")).toBe(1);
  });

  it("detects manuscript HTML vs legacy plain text", () => {
    expect(looksLikeHtml("<p>hi</p>")).toBe(true);
    expect(looksLikeHtml("<h2>T</h2>")).toBe(true);
    expect(looksLikeHtml("<blockquote>q</blockquote>")).toBe(true);
    expect(looksLikeHtml("First line\n\nSecond line")).toBe(false);
    expect(looksLikeHtml("3 < 4 and 5 > 2")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });

  it("converts legacy plain text to manuscript HTML", () => {
    expect(plainTextToHtml("First line\n\nSecond line")).toBe(
      "<p>First line</p><p>Second line</p>",
    );
    expect(plainTextToHtml("a\nb")).toBe("<p>a<br>b</p>");
    // Markup in legacy prose is escaped, never interpreted.
    expect(plainTextToHtml("<script>x</script>")).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
    expect(plainTextToHtml("")).toBe("");
    expect(plainTextToHtml("\n\n  \n\n")).toBe("");
  });
});

describe("selectionResolve (forced-race stale selection)", () => {
  it("replaces when the captured text is still at the captured range", async () => {
    const ed = editor("<p>the quick brown fox</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 5, to: 10 }); // "quick"
    const captured = captureSelection(ed)!;
    expect(captured.text).toBe("quick");
    const outcome = applySuggestion(ed, captured, "slow");
    expect(outcome).toBe("replaced");
    expect(ed.getHTML()).toBe("<p>the slow brown fox</p>");
    ed.destroy();
  });

  it("inserts after the cursor instead of mis-replacing when the document changed", async () => {
    const ed = editor("<p>the quick brown fox</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 5, to: 10 }); // "quick"
    const captured = captureSelection(ed)!;
    // Forced race: autosave (or a remote edit) rewrites the paragraph
    // while the suggestion is streaming — "quick" is no longer at {5,10}.
    ed.commands.setContent("<p>the slow brown fox jumps high</p>");
    ed.commands.setTextSelection({ from: 32, to: 32 }); // cursor at end
    const outcome = applySuggestion(ed, captured, "slow");
    expect(outcome).toBe("inserted-after");
    // The original prose is untouched; the suggestion lands at the cursor.
    expect(ed.getHTML()).toBe("<p>the slow brown fox jumps highslow</p>");
    ed.destroy();
  });

  it("inserts after the cursor when the captured text vanished entirely", async () => {
    const ed = editor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 }); // "hello"
    const captured = captureSelection(ed)!;
    ed.commands.setContent("<p>goodbye world</p>");
    ed.commands.setTextSelection({ from: 1, to: 1 });
    const outcome = applySuggestion(ed, captured, "HELLO");
    expect(outcome).toBe("inserted-after");
    expect(ed.getHTML()).toBe("<p>HELLOgoodbye world</p>");
    ed.destroy();
  });

  it("returns null for a collapsed selection", async () => {
    const ed = editor("<p>hello</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 3, to: 3 });
    expect(captureSelection(ed)).toBeNull();
    ed.destroy();
  });
});

describe("selectionAiOperations client/server mirror", () => {
  it("keeps the six pinned operations verbatim-identical", () => {
    const clientKeys = Object.keys(SELECTION_AI_OPERATIONS).sort();
    const serverKeys = Object.keys(SERVER_OPERATIONS).sort();
    expect(clientKeys).toEqual(serverKeys);
    expect(clientKeys).toEqual([
      "continue-scene",
      "expand",
      "free-prompt",
      "more-dialogue",
      "rewrite-tone",
      "show-dont-tell",
    ]);
    for (const key of clientKeys) {
      const c = SELECTION_AI_OPERATIONS[key as keyof typeof SELECTION_AI_OPERATIONS];
      const s = SERVER_OPERATIONS[key as keyof typeof SERVER_OPERATIONS];
      expect(c.task, `${key}.task`).toBe(s.task);
      expect(c.systemPrompt, `${key}.systemPrompt`).toBe(s.systemPrompt);
    }
  });

  it("pins the transport bounds", () => {
    expect(SELECTION_MAX_CHARS).toBe(2000);
    expect(SELECTION_CONTEXT_CHARS).toBe(1000);
    expect(SELECTION_MAX_TOKENS).toBe(2000);
    // Pinned task names ride the existing generations API.
    expect(SELECTION_AI_OPERATIONS["rewrite-tone"].task).toBe("selection.rewrite-tone");
    expect(SELECTION_AI_OPERATIONS["continue-scene"].task).toBe("selection.continue-scene");
    expect(SELECTION_AI_OPERATIONS["free-prompt"].task).toBe("selection.free-prompt");
  });
});
