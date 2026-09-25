/**
 * Chunker tests (Phase 5).
 *
 * The property under test is not "does it split nicely" but "can a
 * citation be trusted": every chunk's text must be exactly the source
 * span it claims, chunks must not overlap or reorder, and no chunk may
 * exceed the budget. A citation that resolves to the wrong text is worse
 * than no citation, so these are correctness tests, not formatting ones.
 */
import { describe, expect, it } from "vitest";
import { chunkText, resolveChunkSpan, verifyChunks, DEFAULT_MAX_CHARS } from "./chunk.ts";

function ok(text: string, options?: Parameters<typeof chunkText>[1]) {
  const r = chunkText(text, options);
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.failures)}`);
  return r.value;
}

/** The invariant every chunk list must satisfy. */
function expectSound(text: string, options?: Parameters<typeof chunkText>[1]) {
  const chunks = ok(text, options);
  expect(verifyChunks(text, chunks)).toEqual([]);
  return chunks;
}

describe("chunkText", () => {
  it("returns nothing for blank input", () => {
    expect(ok("")).toEqual([]);
    expect(ok("   \n\n  \t ")).toEqual([]);
  });

  it("keeps a short document as one chunk", () => {
    const chunks = expectSound("A single short paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("A single short paragraph.");
    expect(chunks[0]!.start).toBe(0);
  });

  it("splits on paragraph boundaries", () => {
    const a = "First paragraph.";
    const b = "Second paragraph.";
    const chunks = expectSound(`${a}\n\n${b}`);
    expect(chunks.map((c) => c.text)).toEqual([a, b]);
    expect(chunks[1]!.start).toBe(a.length + 2);
  });

  it("splits on line boundaries when a paragraph is oversized", () => {
    const lines = Array.from({ length: 6 }, (_, i) => `Line ${i} ${"x".repeat(30)}`);
    const chunks = expectSound(lines.join("\n"), { maxChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(80);
  });

  it("prefers sentence boundaries inside a single huge line", () => {
    const sentence = "This is a sentence of moderate length. ";
    const chunks = expectSound(sentence.repeat(20).trim(), { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every piece but the last should end at a sentence terminator (the
    // terminator plus its trailing space), not mid-word.
    for (const c of chunks.slice(0, -1)) {
      expect(c.text.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  it("hard-splits text with no boundary at all", () => {
    // A minified blob: no newline, no sentence terminator, longer than the
    // budget. It must still be cut, and the pieces must rejoin to the whole.
    const blob = "a".repeat(500);
    const chunks = expectSound(blob, { maxChars: 120 });
    expect(chunks.length).toBe(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(120);
    expect(chunks.map((c) => c.text).join("")).toBe(blob);
  });

  it("never exceeds maxChars, whatever the input", () => {
    const inputs = [
      "word ".repeat(2000),
      "para\n\n".repeat(500),
      `${"y".repeat(5000)}`,
      `line\n${"z".repeat(3000)}\n\nshort`,
      "mixed. Short.\n\n" + "long sentence here. ".repeat(300),
    ];
    for (const input of inputs) {
      const chunks = expectSound(input, { maxChars: 200 });
      for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(200);
    }
  });

  it("tiles the source so every span resolves to its own text", () => {
    const text = "Alpha one.\n\nBeta two is longer here.\n\nGamma three.".repeat(7);
    const chunks = expectSound(text, { maxChars: 150 });
    for (const c of chunks) {
      expect(resolveChunkSpan(text, c)).toEqual({
        text: c.text,
        start: c.start,
        end: c.end,
      });
    }
    // Ordered, non-overlapping.
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.start).toBeGreaterThanOrEqual(chunks[i - 1]!.end);
    }
  });

  it("is deterministic", () => {
    const text = "One.\n\nTwo.\n\nThree.".repeat(40);
    const first = ok(text, { maxChars: 90 });
    const second = ok(text, { maxChars: 90 });
    expect(first).toEqual(second);
  });

  it("does not lose text: segments rejoin to the original modulo separators", () => {
    const text = "First para here.\n\nSecond para here.\n\nThird one.";
    const chunks = expectSound(text, { maxChars: 25 });
    // Stripping all whitespace must account for every non-space character.
    const strip = (s: string) => s.replace(/\s+/g, "");
    expect(chunks.map((c) => strip(c.text)).join("")).toBe(strip(text));
  });

  it("merges a short trailing fragment when minChars is set", () => {
    const text = `${"A".repeat(60)}\n\nok`;
    const withoutMin = ok(text, { maxChars: 100 });
    expect(withoutMin).toHaveLength(2);
    const withMin = ok(text, { maxChars: 100, minChars: 10 });
    expect(withMin).toHaveLength(1);
    expect(withMin[0]!.text).toContain("ok");
  });

  it("does not merge past maxChars when honouring minChars", () => {
    const text = `${"A".repeat(80)}\n\n${"B".repeat(80)}`;
    const chunks = expectSound(text, { maxChars: 100, minChars: 50 });
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(100);
  });

  it("handles CRLF and trailing separators", () => {
    const chunks = expectSound("One.\r\n\r\nTwo.\r\n\r\n");
    expect(chunks.map((c) => c.text)).toEqual(["One.", "Two."]);
  });

  it("rejects a nonsensical budget rather than guessing", () => {
    expect(chunkText("x", { maxChars: 0 }).ok).toBe(false);
    expect(chunkText("x", { maxChars: -1 }).ok).toBe(false);
    expect(chunkText("x", { maxChars: 1.5 }).ok).toBe(false);
    expect(chunkText("x", { minChars: 200, maxChars: 100 }).ok).toBe(false);
  });

  it("has a sane default budget", () => {
    expect(DEFAULT_MAX_CHARS).toBeGreaterThan(0);
    const chunks = ok("word ".repeat(2000));
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  });
});

describe("verifyChunks", () => {
  it("catches a span that does not match its text", () => {
    const text = "hello world";
    const failures = verifyChunks(text, [{ index: 0, text: "goodbye", start: 0, end: 7 }]);
    expect(failures.map((f) => f.code)).toContain("CHUNK_TEXT_MISMATCH");
  });

  it("catches an out-of-bounds span", () => {
    const failures = verifyChunks("short", [{ index: 0, text: "short", start: 0, end: 999 }]);
    expect(failures.map((f) => f.code)).toContain("CHUNK_BAD_SPAN");
  });

  it("catches overlap and misordering", () => {
    const text = "abcdefghij";
    const failures = verifyChunks(text, [
      { index: 0, text: "abcdef", start: 0, end: 6 },
      { index: 1, text: "defghij", start: 3, end: 10 },
    ]);
    expect(failures.map((f) => f.code)).toContain("CHUNK_OVERLAP");
  });

  it("catches a wrong index", () => {
    const failures = verifyChunks("abc", [{ index: 5, text: "abc", start: 0, end: 3 }]);
    expect(failures.map((f) => f.code)).toContain("CHUNK_BAD_INDEX");
  });
});

describe("resolveChunkSpan", () => {
  it("returns null for a stale citation instead of throwing", () => {
    expect(resolveChunkSpan("short", { start: 0, end: 999 })).toBeNull();
    expect(resolveChunkSpan("short", { start: 4, end: 4 })).toBeNull();
    expect(resolveChunkSpan("short", { start: -1, end: 2 })).toBeNull();
  });

  it("resolves a valid span", () => {
    expect(resolveChunkSpan("hello world", { start: 6, end: 11 })).toEqual({
      text: "world",
      start: 6,
      end: 11,
    });
  });
});
