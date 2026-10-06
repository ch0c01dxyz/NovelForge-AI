/**
 * Unit tests for the NF-WF-017C offset-mapping rule (Invariant 3).
 *
 * `stripHtmlWithOffsetMap` is defined by the frozen 015 strip rule:
 * its `stripped` output must be byte-identical to `stripHtmlTags`
 * on every input, and `toStripped` must map each raw offset to the
 * stripped offset of the same position.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeQuoteWhitespace,
  stripHtmlTags,
  stripHtmlWithOffsetMap,
  strippedContentIncludes,
  verifyEvidenceQuote,
} from "./services/manuscript.ts";

describe("stripHtmlWithOffsetMap", () => {
  const cases = [
    "",
    "plain text, no tags",
    "<p>one paragraph</p>",
    "<p>His hair was <strong>black</strong> as ink.</p>",
    "<p><strong>the</strong> dark forest</p>",
    "<h2>Title</h2><p>a</p><p>b</p><hr><p>c<br>d</p>",
    "<blockquote><em>nested <strong>deep</strong></em></blockquote>",
    "<ul><li>one</li><li>two</li></ul>",
    "a < b and c > d (the strip rule treats <...> as a tag wherever it matches)",
    "<p>trailing",
    "leading</p>",
    "<p></p>",
  ];
  for (const html of cases) {
    it(`stripped is byte-identical to stripHtmlTags: ${JSON.stringify(html).slice(0, 40)}`, () => {
      expect(stripHtmlWithOffsetMap(html).stripped).toBe(stripHtmlTags(html));
    });
  }

  it("maps offsets: text chars identity, tag interiors to the replacement space", () => {
    const html = "<p>ab</p>";
    const { stripped, toStripped } = stripHtmlWithOffsetMap(html);
    expect(stripped).toBe(" ab ");
    // `<p>` occupies raw 0..2 -> the space at stripped 0.
    expect(toStripped(0)).toBe(0);
    expect(toStripped(2)).toBe(0);
    // `ab` at raw 3..4 -> stripped 1..2.
    expect(toStripped(3)).toBe(1);
    expect(toStripped(4)).toBe(2);
    // `</p>` at raw 5..8 -> the space at stripped 3.
    expect(toStripped(5)).toBe(3);
    expect(toStripped(8)).toBe(3);
    // End boundary maps to the stripped length.
    expect(toStripped(9)).toBe(4);
    expect(toStripped(html.length)).toBe(stripped.length);
  });

  it("is monotone non-decreasing on every input", () => {
    for (const html of cases) {
      const { toStripped } = stripHtmlWithOffsetMap(html);
      let prev = -1;
      for (let i = 0; i <= html.length; i++) {
        const cur = toStripped(i);
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    }
  });

  it("maps a mid-document span across several tags", () => {
    const html = "<p>His hair was <strong>black</strong> as ink.</p>";
    const { stripped, toStripped } = stripHtmlWithOffsetMap(html);
    const start = html.indexOf("black");
    const end = start + "black".length;
    expect(stripped.slice(toStripped(start), toStripped(end))).toBe("black");
  });
});

describe("normalizeQuoteWhitespace", () => {
  it("collapses runs and trims ends", () => {
    expect(normalizeQuoteWhitespace(" the  dark\nforest ")).toBe("the dark forest");
    expect(normalizeQuoteWhitespace("already clean")).toBe("already clean");
  });
});

describe("verifyEvidenceQuote", () => {
  it("accepts exact matches on plain text (frozen 008 rule)", () => {
    expect(verifyEvidenceQuote("His hair was black as ink.", 13, 18, "black")).toBe(true);
    expect(verifyEvidenceQuote("His hair was black as ink.", 13, 18, "blue")).toBe(false);
  });

  it("accepts a quote split by inline tags (GAP-053 example)", () => {
    const content = "<p><strong>the</strong> dark forest</p>";
    expect(verifyEvidenceQuote(content, 0, content.length, "the dark forest")).toBe(true);
  });

  it("accepts an exact prose span inside HTML crossing no tag boundary", () => {
    const content = "<p>His hair was <strong>black</strong> as ink.</p>";
    const start = content.indexOf("black");
    expect(verifyEvidenceQuote(content, start, start + 5, "black")).toBe(true);
  });

  it("refuses a quote genuinely absent from the prose", () => {
    const content = "<p><strong>the</strong> dark forest</p>";
    expect(verifyEvidenceQuote(content, 0, content.length, "the red forest")).toBe(false);
  });

  it("refuses when the span covers the wrong prose", () => {
    const content = "<p><strong>the</strong> dark forest</p>";
    // Raw span (0,14) covers `<p><strong>the` -> stripped "  the".
    expect(verifyEvidenceQuote(content, 0, 14, "the dark")).toBe(false);
    expect(verifyEvidenceQuote(content, 0, 14, "the")).toBe(true);
  });
});

describe("strippedContentIncludes", () => {
  const content = "<p>Wren swore the <strong>oath of silence</strong> beneath the old oak.</p>";
  it("matches exact substrings (frozen behavior)", () => {
    expect(strippedContentIncludes(content, "beneath the old oak")).toBe(true);
  });
  it("matches quotes split by inline tags", () => {
    expect(strippedContentIncludes(content, "Wren swore the oath of silence")).toBe(true);
  });
  it("does not match absent quotes", () => {
    expect(strippedContentIncludes(content, "Wren swore the oath of noise")).toBe(false);
  });
  it("does not match tag names as prose", () => {
    // "strong" appears only as a tag, never as prose.
    expect(strippedContentIncludes("<p>plain</p>", "strong")).toBe(false);
  });
});
