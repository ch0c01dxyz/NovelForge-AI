/**
 * @novelforge/ai-services — manuscript helpers (extracted from apps/api/src/services/manuscript.ts).
 *
 * NF-WF-026 (GAP-028): `verifyEvidenceQuote` is needed by the moved canon.ts.
 * Extracted verbatim with its dependencies; the full manuscript.ts module
 * stays in apps/api/src.
 */

export function stripHtmlWithOffsetMap(html: string): {
  stripped: string;
  toStripped: (rawOffset: number) => number;
} {
  const tagRe = /<[^>]*>/g;
  const parts: string[] = [];
  const map: number[] = [];
  let raw = 0;
  let strippedLen = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    for (let i = raw; i < m.index; i++) {
      map[i] = strippedLen + (i - raw);
    }
    parts.push(html.slice(raw, m.index));
    strippedLen += m.index - raw;
    for (let i = m.index; i < m.index + m[0].length; i++) {
      map[i] = strippedLen;
    }
    parts.push(" ");
    strippedLen += 1;
    raw = m.index + m[0].length;
  }
  for (let i = raw; i <= html.length; i++) {
    map[i] = strippedLen + (i - raw);
  }
  parts.push(html.slice(raw));
  const stripped = parts.join("");
  return {
    stripped,
    toStripped: (rawOffset: number) => map[rawOffset] ?? stripped.length,
  };
}

/**
 * NF-WF-017C (Invariant 3): whitespace normalization for quote
 * verification. The strip rule replaces each tag with a space, so a
 * quote spanning an inline-tag boundary carries a whitespace artifact
 * that is not part of the prose (`<strong>the</strong> dark forest`
 * strips to ` the  dark forest`). Collapsing whitespace runs (and
 * trimming ends) compares what the reader sees; it never loosens
 * non-whitespace content.
 */

export function normalizeQuoteWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * NF-WF-017C (Invariant 3): strip-aware evidence-quote verification.
 *
 * `start`/`end` are raw-content offsets into the stored
 * (sanitized-HTML) `content`; `quote` is prose. The raw span is mapped
 * onto tag-stripped text through the shared strip rule and compared:
 * exact first (the frozen 008 rule — plain-text rows and spans that do
 * not cross tag boundaries verify exactly as before), then the
 * whitespace-normalized fallback for the tag-boundary space artifact.
 * A quote that is not the span's prose under either comparison fails.
 *
 * Bounds are not checked here: callers run the frozen `verifySpan` on
 * the raw content first (its bounds semantics are unchanged).
 */

export function verifyEvidenceQuote(
  content: string,
  start: number,
  end: number,
  quote: string,
): boolean {
  const { stripped, toStripped } = stripHtmlWithOffsetMap(content);
  const sStart = toStripped(start);
  const sEnd = toStripped(end);
  if (sStart > sEnd) return false;
  const spanText = stripped.slice(sStart, sEnd);
  if (spanText === quote) return true;
  return (
    normalizeQuoteWhitespace(spanText) === normalizeQuoteWhitespace(quote)
  );
}
