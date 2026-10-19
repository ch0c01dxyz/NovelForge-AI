import type { Editor } from "@tiptap/core";

export interface ReviewTextTarget { span: { start: number; end: number }; quote: string }

export function locateReviewQuote(editor: Editor, source: string, span: ReviewTextTarget["span"], quote: string): { from: number; to: number } | null {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > source.length || !quote.trim()) return null;
  if (normalize(source.slice(span.start, span.end).replace(/<[^>]*>/g, " ")) !== normalize(quote)) return null;
  const visibleQuote = /<[^>]*>/.test(source) ? new DOMParser().parseFromString(quote, "text/html").body.textContent ?? "" : quote;
  const needle = normalize(visibleQuote);
  if (!needle) return null;
  let text = "";
  const positions: number[] = [];
  function append(value: string, pos: number, isText = false) {
    for (let i = 0; i < value.length; i++) {
      const char = /\s/.test(value[i]!) ? " " : value[i]!;
      if (char === " " && text.endsWith(" ")) continue;
      text += char;positions.push(pos + (isText ? i : 0));
    }
  }
  editor.state.doc.descendants((node, pos) => {
    if (node.isBlock || node.type.name === "hardBreak") append(" ", pos);
    if (node.isText) append(node.text ?? "", pos, true);
  });
  const start = text.indexOf(needle);
  // Duplicate prose is ambiguous without a complete raw-HTML-to-editor map.
  if (start < 0 || text.indexOf(needle, start + 1) !== -1) return null;
  return { from: positions[start]!, to: positions[start + needle.length - 1]! + 1 };
}
