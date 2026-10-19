import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { locateReviewQuote } from "./reviewText";

describe("review text navigation", () => {
  it("locates a verified quote across formatting without changing the manuscript", () => {
    const source = "<p>The <strong>city</strong> falls.</p>";
    const editor = new Editor({ extensions: [StarterKit], content: source });
    const before = editor.getHTML();
    const range = locateReviewQuote(editor, source, { start: source.indexOf("<strong>"), end: source.indexOf("</p>") }, "city falls.");
    expect(range).not.toBeNull();
    expect(editor.state.doc.textBetween(range!.from, range!.to)).toBe("city falls.");
    expect(editor.getHTML()).toBe(before);editor.destroy();
  });
  it("refuses a mismatched span, duplicate quote and missing text", () => {
    const source = "<p>echo echo</p>";
    const editor = new Editor({ extensions: [StarterKit], content: source });
    expect(locateReviewQuote(editor, source, { start: 3, end: 7 }, "echo")).toBeNull();
    expect(locateReviewQuote(editor, source, { start: 3, end: 7 }, "other")).toBeNull();
    expect(locateReviewQuote(editor, source, { start: -1, end: 70 }, "echo")).toBeNull();editor.destroy();
  });
});
