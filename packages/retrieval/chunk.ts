/**
 * Text chunking (Phase 5).
 *
 * Pure, no IO. Chunking is the step that decides what a citation can point
 * at, so it must be deterministic and lossless in the sense that matters:
 * every chunk carries the character offsets it came from, and the offsets
 * of consecutive chunks tile the source without gaps or overlap. A
 * citation into a chunk can therefore be resolved back to an exact span of
 * the original document, which is what "evidence-bearing" requires
 * (docs/12-roadmap Phase 5: "retrieval is evidence-bearing").
 *
 * Boundaries are chosen in this order:
 *   1. paragraph (blank line) — the natural unit of prose;
 *   2. line — for structured text with no blank lines;
 *   3. sentence — for a paragraph longer than the budget;
 *   4. hard split at the budget — for text with no boundary at all
 *      (a minified file, a single 50k-character line).
 *
 * A chunk is never larger than `maxChars`. That is a hard guarantee, not a
 * preference: an embedding model has a fixed input window, and silently
 * truncating an oversized chunk would drop content from the index while
 * leaving the citation pointing at text nobody embedded.
 */
import { at, type ValidationFailure, type ValidationResult } from "@novelforge/validation";

export interface Chunk {
  /** 0-based position within the document. */
  index: number;
  /** The chunk text, exactly as it appears in the source. */
  text: string;
  /** Inclusive start offset into the source string. */
  start: number;
  /** Exclusive end offset into the source string. */
  end: number;
}

export interface ChunkOptions {
  /**
   * Hard upper bound on chunk length, in characters. Must be positive.
   * Defaults to 1200 — comfortably inside a typical 512-token embedding
   * window while keeping chunks large enough to be self-contained prose.
   */
  maxChars?: number;
  /**
   * Chunks shorter than this are merged into the previous chunk when that
   * does not breach `maxChars`. Prevents a stray heading or a one-word
   * line from becoming its own low-signal vector. Defaults to 0 (off).
   */
  minChars?: number;
}

export const DEFAULT_MAX_CHARS = 1200;

/**
 * Paragraph and line separators.
 *
 * `\r` is tolerated because a Windows-authored .txt or a DOCX conversion
 * produces CRLF, and a separator that only matched `\n\n` left such a
 * document as ONE chunk — no paragraph boundary ever matched, so the whole
 * file went into the index as a single oversized vector.
 */
const PARAGRAPH_SEP = /\r?\n[ \t]*\r?\n/;
const LINE_SEP = /\r?\n/;

/**
 * Sentence boundary: terminator followed by whitespace. Deliberately
 * simple — an abbreviation split ("Mr. Smith" → "Mr." + "Smith") costs a
 * slightly worse boundary, not a wrong result, so a full sentence
 * tokenizer is not worth its weight here.
 */
const SENTENCE_END_SOURCE = String.raw`[.!?…]["')\]]*\s`;

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Split `text` into `{ text, start }` pieces on a separator regex, in ONE
 * forward pass.
 *
 * Re-finding each piece with `indexOf` would be exact but quadratic — a
 * 2500-chapter novel is large enough for that to matter — so the offsets
 * come from the separator matches themselves.
 */
function splitSpans(
  text: string,
  separator: RegExp,
  base: number,
): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let prevEnd = 0;
  // A fresh regex per call: a shared /g literal carries `lastIndex` across
  // calls, which turns a re-entrant or repeated use into a skipped match.
  const re = new RegExp(separator.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // A zero-length match cannot advance `lastIndex`; bail rather than loop.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    out.push({ text: text.slice(prevEnd, m.index), start: base + prevEnd });
    prevEnd = m.index + m[0].length;
  }
  out.push({ text: text.slice(prevEnd), start: base + prevEnd });
  return out;
}

/**
 * Sentence boundaries within one run, as offsets just past each terminator.
 */
function sentenceCuts(text: string): number[] {
  const cuts: number[] = [];
  const re = new RegExp(SENTENCE_END_SOURCE, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) cuts.push(m.index + m[0].length);
  return cuts;
}

/**
 * Split one oversized run of text into pieces of at most `maxChars`,
 * preferring sentence boundaries and falling back to a hard split.
 *
 * Returns `{ text, start }` pairs with `start` relative to the original
 * document.
 */
function splitOversized(
  text: string,
  base: number,
  maxChars: number,
): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const cuts = sentenceCuts(text);

  let cursor = 0;
  let cutIdx = 0;
  while (cursor < text.length) {
    if (text.length - cursor <= maxChars) {
      out.push({ text: text.slice(cursor), start: base + cursor });
      break;
    }
    const limit = cursor + maxChars;
    // The latest sentence boundary that still fits; none → hard split.
    let cut = -1;
    while (cutIdx < cuts.length && cuts[cutIdx]! <= limit) {
      if (cuts[cutIdx]! > cursor) cut = cuts[cutIdx]!;
      cutIdx += 1;
    }
    if (cut <= cursor) cut = limit;
    out.push({ text: text.slice(cursor, cut), start: base + cursor });
    cursor = cut;
  }
  return out;
}

/**
 * Chunk a document.
 *
 * Offsets are into the ORIGINAL `text` (including any whitespace between
 * chunks), so `text.slice(chunk.start, chunk.end)` always equals
 * `chunk.text`. Leading/trailing whitespace of a chunk is excluded from
 * `text` but included in the span it covers, which is why the two are
 * tracked separately rather than derived from one another.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): ValidationResult<Chunk[]> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const minChars = options.minChars ?? 0;

  if (!Number.isInteger(maxChars) || maxChars < 1) {
    return {
      ok: false,
      failures: [
        {
          path: "$.maxChars",
          code: "CHUNK_BAD_MAX_CHARS",
          message: "maxChars must be a positive integer",
        },
      ],
    };
  }
  if (!Number.isInteger(minChars) || minChars < 0 || minChars > maxChars) {
    return {
      ok: false,
      failures: [
        {
          path: "$.minChars",
          code: "CHUNK_BAD_MIN_CHARS",
          message: "minChars must be an integer between 0 and maxChars",
        },
      ],
    };
  }

  if (isBlank(text)) return { ok: true, value: [] };

  // ---- 1. candidate segments: paragraphs, then lines ----
  type Seg = { text: string; start: number };
  const segments: Seg[] = [];

  for (const para of splitSpans(text, PARAGRAPH_SEP, 0)) {
    if (isBlank(para.text)) continue;
    if (para.text.length <= maxChars) {
      segments.push(para);
      continue;
    }

    // Too long for one chunk: prefer line boundaries inside it.
    for (const line of splitSpans(para.text, LINE_SEP, para.start)) {
      if (isBlank(line.text)) continue;
      if (line.text.length <= maxChars) {
        segments.push(line);
      } else {
        for (const piece of splitOversized(line.text, line.start, maxChars)) {
          segments.push(piece);
        }
      }
    }
  }

  // ---- 2. assemble, merging short segments into their neighbour ----
  //
  // A segment shorter than `minChars` is not worth its own embedding — a
  // heading or a stray line produces a low-signal vector — so it is
  // appended to the pending chunk when that fits. Checking only the
  // pending side was wrong: a short TRAILING segment stayed its own chunk,
  // which is the case `minChars` exists to prevent.
  const chunks: Chunk[] = [];
  let pending: { text: string; start: number; end: number } | null = null;

  const flush = (): void => {
    if (!pending) return;
    chunks.push({
      index: chunks.length,
      text: pending.text,
      start: pending.start,
      end: pending.end,
    });
    pending = null;
  };

  for (const seg of segments) {
    if (!pending) {
      pending = { text: seg.text, start: seg.start, end: seg.start + seg.text.length };
      continue;
    }
    // Annotated: without it TS reports a circular inference (TS7022),
    // because `pending` is both read here and reassigned in the closure
    // above. The type is obvious; the annotation just breaks the cycle.
    const merged: string = `${pending.text}\n\n${seg.text}`;
    const wantMerge = pending.text.length < minChars || seg.text.length < minChars;
    if (wantMerge && merged.length <= maxChars) {
      pending = { text: merged, start: pending.start, end: seg.start + seg.text.length };
      continue;
    }
    flush();
    pending = { text: seg.text, start: seg.start, end: seg.start + seg.text.length };
  }
  flush();

  return { ok: true, value: chunks };
}

/**
 * Resolve a citation back to its source span. Throws nothing: an
 * out-of-range chunk is a `null`, because a caller resolving a stale
 * citation must be able to fall back rather than crash a request.
 */
export function resolveChunkSpan(
  text: string,
  chunk: Pick<Chunk, "start" | "end">,
): { text: string; start: number; end: number } | null {
  if (chunk.start < 0 || chunk.end > text.length || chunk.start >= chunk.end) return null;
  return { text: text.slice(chunk.start, chunk.end), start: chunk.start, end: chunk.end };
}

/**
 * Assert the tiling property that makes a citation trustworthy: chunks are
 * ordered, non-overlapping, within bounds, and each one's text is exactly
 * what its span contains. Exported because the ingest path should check
 * this before persisting rather than trusting the chunker.
 */
export function verifyChunks(text: string, chunks: Chunk[]): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  let prevEnd = 0;

  chunks.forEach((c, i) => {
    const path = at("$.chunks", i);
    if (c.index !== i) {
      failures.push({ path: at(path, "index"), code: "CHUNK_BAD_INDEX", message: `expected index ${i}` });
    }
    if (c.start < 0 || c.end > text.length || c.start >= c.end) {
      failures.push({
        path,
        code: "CHUNK_BAD_SPAN",
        message: `span [${c.start}, ${c.end}) is outside the source`,
      });
      return;
    }
    if (c.start < prevEnd) {
      failures.push({ path, code: "CHUNK_OVERLAP", message: "chunks must not overlap or reorder" });
    }
    if (text.slice(c.start, c.end) !== c.text) {
      failures.push({
        path,
        code: "CHUNK_TEXT_MISMATCH",
        message: "chunk text does not match its source span",
      });
    }
    prevEnd = c.end;
  });

  return failures;
}
