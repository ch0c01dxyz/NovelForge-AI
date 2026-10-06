/**
 * NF-WF-017A: the unified import normalization pipeline.
 *
 * Every retained import format (TXT, Markdown, PDF, DOCX) ends here as
 * import parts whose bodies are HTML. The caller (`importChapters` in
 * manuscript.ts) then runs the SAME write sequence as `saveChapter`:
 * sanitize → strip → count (NF-WF-015 Invariant 2). No import path may
 * write raw content — this is the GAP-061 closure point.
 *
 * Frozen rules (do not change): the md ATX `#`/`##` and txt `===` setext
 * chapter-splitting semantics are extracted byte-identically from
 * `importChapters` into `splitImportBlocks`. 017A extends the format
 * list, not the splitting contract.
 *
 * Imported chapters are source material, never canon (Invariant 4):
 * this module produces prose parts only; no extraction, no proposals,
 * no facts.
 */

import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText as unpdfExtractText } from "unpdf";

/** The four retained import formats (CAP-13). */
export type ImportFormat = "md" | "txt" | "pdf" | "docx";

/** One chapter produced by normalization, ready for the write path. */
export interface ImportPart {
  /** Chapter title (metadata; sliced to 200 chars at the write path). */
  title: string;
  /** The raw (pre-HTML) text — used for the frozen emptiness filters. */
  rawText: string;
  /** HTML body; passes through `sanitizeChapterHtml` at the write path. */
  htmlBody: string;
}

/** Machine-readable import refusal codes (the UI maps these to en/id). */
export type ImportErrorCode =
  | "IMPORT_TOO_LARGE"
  | "IMPORT_UNSUPPORTED_TYPE"
  | "IMPORT_CORRUPT"
  | "IMPORT_ARCHIVE_UNSAFE"
  | "IMPORT_NO_TEXT";

/**
 * Typed 400 refusals for the import file path. The app-wide error handler
 * (platform-routes, never a second handler) maps these to
 * `{ error: code }`; the writer UI maps the code to an actionable en/id
 * message. Never a 500: a hostile file is an expected input, not a bug.
 */
export class ImportError extends Error {
  constructor(
    readonly statusCode: 400,
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------
// Size / type validation pins (all within the route's IMPORT_BODY_LIMIT).
// ---------------------------------------------------------------------------

/** TXT/Markdown file bytes (mirrors the 5M-char paste cap). */
export const MAX_TEXT_FILE_BYTES = 5_000_000;
/** PDF file bytes. */
export const MAX_PDF_BYTES = 10_000_000;
/** DOCX file bytes. */
export const MAX_DOCX_BYTES = 10_000_000;
/** DOCX decompression-bomb limits (ZIP-based format). */
export const DOCX_MAX_UNCOMPRESSED_BYTES = 50_000_000;
export const DOCX_MAX_ENTRIES = 1000;
export const DOCX_MAX_COMPRESSION_RATIO = 100;

const MIME_ALLOWLIST = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Browsers and some clients send octet-stream / omit the header; the
  // magic-byte sniff below is authoritative for binary formats.
  "application/octet-stream",
  "",
]);

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

/** One ZIP central-directory entry (name + declared uncompressed size). */
export interface ZipEntryInfo {
  name: string;
  uncompressedSize: number;
  compressedSize: number;
}

/**
 * Parse the ZIP central directory WITHOUT decompressing anything, so the
 * decompression-bomb check runs before any inflater touches the bytes.
 * Throws ImportError(IMPORT_CORRUPT) when the archive is not a valid ZIP.
 */
export function parseZipCentralDirectory(buffer: Buffer): ZipEntryInfo[] {
  // EOCD: scan the last 64KB+22 bytes for the 0x06054b50 signature.
  const EOCD_SIG = 0x06054b50;
  const scanStart = Math.max(0, buffer.length - 65558);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= scanStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError(400, "IMPORT_CORRUPT", "not a valid ZIP archive");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntryInfo[] = [];
  let p = centralOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) {
      throw new ImportError(400, "IMPORT_CORRUPT", "ZIP central directory is malformed");
    }
    const compressedSize = buffer.readUInt32LE(p + 20);
    const uncompressedSize = buffer.readUInt32LE(p + 24);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf-8");
    entries.push({ name, uncompressedSize, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Decompression-bomb limits for ZIP-based imports (DOCX). Runs on the
 * DECLARED sizes from the central directory, before any decompression.
 */
export function checkZipBomb(entries: ZipEntryInfo[], archiveBytes: number): void {
  if (entries.length > DOCX_MAX_ENTRIES) {
    throw new ImportError(
      400,
      "IMPORT_ARCHIVE_UNSAFE",
      `archive has ${entries.length} entries (max ${DOCX_MAX_ENTRIES})`,
    );
  }
  const uncompressed = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (uncompressed > DOCX_MAX_UNCOMPRESSED_BYTES) {
    throw new ImportError(
      400,
      "IMPORT_ARCHIVE_UNSAFE",
      `archive declares ${uncompressed} uncompressed bytes (max ${DOCX_MAX_UNCOMPRESSED_BYTES})`,
    );
  }
  if (archiveBytes > 0 && uncompressed / archiveBytes > DOCX_MAX_COMPRESSION_RATIO) {
    throw new ImportError(
      400,
      "IMPORT_ARCHIVE_UNSAFE",
      `archive compression ratio exceeds ${DOCX_MAX_COMPRESSION_RATIO}x`,
    );
  }
}

/**
 * Authoritative format detection: magic bytes decide for binary formats;
 * the caller's declared format (manual override in the UI) only
 * disambiguates plain text (md vs txt). A declared format that
 * contradicts the magic bytes is a mistyped file, not a preference.
 */
export function detectImportFormat(
  buffer: Buffer,
  opts: { mimeType?: string; filename?: string; declaredFormat?: ImportFormat } = {},
): { format: ImportFormat; zipEntries: ZipEntryInfo[] } {
  const mime = (opts.mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MIME_ALLOWLIST.has(mime)) {
    throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", `MIME type "${mime}" is not an importable format`);
  }
  const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_MAGIC);
  const isZip = buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC);
  if (isPdf) {
    if (opts.declaredFormat && opts.declaredFormat !== "pdf") {
      throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", "file is a PDF but was declared otherwise");
    }
    return { format: "pdf", zipEntries: [] };
  }
  if (isZip) {
    const entries = parseZipCentralDirectory(buffer);
    checkZipBomb(entries, buffer.length);
    const names = new Set(entries.map((e) => e.name));
    if (names.has("word/document.xml") && names.has("[Content_Types].xml")) {
      if (opts.declaredFormat && opts.declaredFormat !== "docx") {
        throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", "file is a DOCX document but was declared otherwise");
      }
      return { format: "docx", zipEntries: entries };
    }
    throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", "ZIP archive is not a DOCX document");
  }
  // Plain-text path: a binary format must declare itself honestly.
  if (opts.declaredFormat === "pdf" || opts.declaredFormat === "docx") {
    throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", `declared ${opts.declaredFormat} but the bytes are not that format`);
  }
  if (buffer.includes(0)) {
    throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", "file is binary, not importable text");
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ImportError(400, "IMPORT_UNSUPPORTED_TYPE", "file is not valid UTF-8 text");
  }
  if (opts.declaredFormat === "md" || opts.declaredFormat === "txt") {
    return { format: opts.declaredFormat, zipEntries: [] };
  }
  if (opts.filename?.toLowerCase().endsWith(".md")) return { format: "md", zipEntries: [] };
  if (mime === "text/markdown") return { format: "md", zipEntries: [] };
  return { format: "txt", zipEntries: [] };
}

/** Per-format byte caps (within the route's IMPORT_BODY_LIMIT). */
export function checkImportByteCap(buffer: Buffer, format: ImportFormat): void {
  const cap =
    format === "pdf" ? MAX_PDF_BYTES : format === "docx" ? MAX_DOCX_BYTES : MAX_TEXT_FILE_BYTES;
  if (buffer.length > cap) {
    throw new ImportError(
      400,
      "IMPORT_TOO_LARGE",
      `${format} import is ${buffer.length} bytes (max ${cap})`,
    );
  }
}

/**
 * Full server-side file validation for the file-import path: format
 * detection (magic bytes authoritative), per-format byte caps, and the
 * DOCX decompression-bomb check — all BEFORE any extraction or write.
 * The returned ZIP entries feed `normalizeDocxImport` so the archive is
 * parsed once.
 */
export function validateImportFile(
  buffer: Buffer,
  opts: { mimeType?: string; filename?: string; declaredFormat?: ImportFormat } = {},
): { format: ImportFormat; zipEntries: ZipEntryInfo[] } {
  const { format, zipEntries } = detectImportFormat(buffer, opts);
  checkImportByteCap(buffer, format);
  return { format, zipEntries };
}

// ---------------------------------------------------------------------------
// Text → HTML converters (one content contract: sanitized HTML).
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Server-side mirror of the web `plainTextToHtml` util
 * (apps/web/app/utils/htmlText.ts). Blank-line paragraphs become `<p>`,
 * single newlines become `<br>`; markup is escaped so it can never reach
 * the write path as live tags.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Inline Markdown constructs → allowlist tags only. */
function mdInline(text: string): string {
  let out = escapeHtml(text);
  // Links/images degrade to their text — never to non-allowlist tags.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^\w*])_([^_]+)_/g, "$1<em>$2</em>");
  return out;
}

/**
 * Markdown prose body → allowlist HTML. Only allowlist constructs are
 * emitted (h2, strong, em, blockquote, ul/ol/li, hr); code fences,
 * links, images, and tables degrade to plain text.
 */
export function mdBodyToHtml(body: string): string {
  const lines = body.split("\n");
  const html: string[] = [];
  const para: string[] = [];
  const quote: string[] = [];
  const fence: string[] = [];
  let inFence = false;
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(mdInline).join("<br>")}</p>`);
    para.length = 0;
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote>${quote.map((l) => `<p>${mdInline(l)}</p>`).join("")}</blockquote>`);
    }
    quote.length = 0;
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? "ol" : "ul";
      html.push(`<${tag}>${list.items.map((it) => `<li>${mdInline(it)}</li>`).join("")}</${tag}>`);
      list = null;
    }
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inFence) {
        // Code fence degrades to plain text (markers dropped).
        if (fence.length) html.push(`<p>${fence.map(escapeHtml).join("<br>")}</p>`);
        fence.length = 0;
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1] ?? "");
      continue;
    }
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ul ?? ol) {
      flushPara();
      flushQuote();
      const ordered = ol !== null;
      const item = ((ul ?? ol) as RegExpExecArray)[1]!.trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }
    flushQuote();
    flushList();
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      // `---` / `***` → hr (Markdown only; the TXT path keeps `---` as prose).
      flushPara();
      html.push("<hr>");
      continue;
    }
    const h = /^(#{3,})\s+(.+)$/.exec(line);
    if (h) {
      // `#`/`##` are chapter boundaries (handled by the splitter); deeper
      // levels become prose h2 — the deepest heading the allowlist has.
      flushPara();
      html.push(`<h2>${mdInline(h[2]!.trim())}</h2>`);
      continue;
    }
    if (/^\s*\|/.test(line) || /^\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+$/.test(line)) {
      // Markdown table rows / separator rows degrade to plain text.
      flushPara();
      const cells = line.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
      if (cells.replace(/[:\s-]/g, "")) html.push(`<p>${mdInline(cells)}</p>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line);
  }
  if (inFence && fence.length) html.push(`<p>${fence.map(escapeHtml).join("<br>")}</p>`);
  flushQuote();
  flushList();
  flushPara();
  return html.join("");
}

// ---------------------------------------------------------------------------
// Chapter splitting — the FROZEN md/txt rules, extracted byte-identically
// from `importChapters`. 017A extends the format list, never these rules.
// ---------------------------------------------------------------------------

export interface RawImportBlock {
  title: string;
  body: string[];
}

export function splitImportBlocks(text: string, format: "md" | "txt"): RawImportBlock[] {
  const lines = text.split(/\r?\n/);
  // Parse into raw blocks, then flush each to a part. `cur` holds the
  // current block; `push()` emits it only when it has a body, so a
  // trailing heading with no prose does not become an empty chapter.
  const parts: RawImportBlock[] = [];
  const push = (b: RawImportBlock): void => {
    if (b.body.some((l) => l.trim())) parts.push(b);
  };
  let cur: RawImportBlock = { title: "Imported", body: [] };

  for (const line of lines) {
    const md = format === "md" ? /^(#{1,2})\s+(.+)$/.exec(line) : null;
    if (md) {
      push(cur);
      cur = { title: md[2]!.trim(), body: [] };
      continue;
    }
    // TXT: a setext-style underline — the line ABOVE '===' is a
    // title, and whatever precedes it belongs to the previous
    // chapter. Only '=' counts; '---' is ambiguous with a horizontal
    // rule / em-dash run and must stay content.
    if (format === "txt" && /^={3,}$/.test(line.trim())) {
      const last = cur.body[cur.body.length - 1];
      if (last !== undefined && last.trim()) {
        cur.body.pop();
        push(cur);
        cur = { title: last.trim(), body: [] };
        continue;
      }
    }
    cur.body.push(line);
  }
  push(cur);
  return parts;
}

/**
 * TXT/Markdown normalization: frozen split → per-part HTML. PDF-extracted
 * text reuses the TXT rule (page breaks never create chapters).
 */
export function normalizeTextImport(text: string, format: "md" | "txt"): ImportPart[] {
  return splitImportBlocks(text, format).map((b) => {
    const raw = b.body.join("\n");
    return {
      title: b.title,
      rawText: raw,
      htmlBody: format === "md" ? mdBodyToHtml(raw) : plainTextToHtml(raw),
    };
  });
}

// ---------------------------------------------------------------------------
// PDF extraction (unpdf — pure JS, per-page text).
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF, one page at a time. Page breaks are joined
 * with blank lines but NEVER create chapters — chapter splitting reuses
 * the TXT `===` rule on the joined text. Scanned/image-only PDFs throw
 * IMPORT_NO_TEXT (no OCR in 017).
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; skipped: string[] }> {
  let pages: string[];
  try {
    const { text } = await unpdfExtractText(new Uint8Array(buffer));
    pages = Array.isArray(text) ? text : [text];
  } catch {
    throw new ImportError(400, "IMPORT_CORRUPT", "PDF could not be parsed");
  }
  const text = pages.join("\n\n");
  if (!text.trim()) {
    throw new ImportError(
      400,
      "IMPORT_NO_TEXT",
      "PDF has no extractable text (scanned or image-only); OCR is out of scope",
    );
  }
  return { text, skipped: [] };
}

// ---------------------------------------------------------------------------
// DOCX extraction (mammoth + a top-level HTML walker).
// ---------------------------------------------------------------------------

/** Top-level blocks of the mammoth intermediate HTML. */
interface HtmlBlock {
  tag: string;
  raw: string;
  inner: string;
}

const VOID_TAGS = new Set(["br", "hr", "img"]);

/**
 * Split flat HTML into its top-level blocks with a small stack parser.
 * Handles void elements and (rare) nested same-tag structures; comments
 * are stripped first.
 */
export function topLevelBlocks(html: string): HtmlBlock[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const blocks: HtmlBlock[] = [];
  let i = 0;
  const n = clean.length;
  while (i < n) {
    const open = clean.indexOf("<", i);
    if (open < 0) break;
    const close = clean.indexOf(">", open);
    if (close < 0) break;
    const head = clean.slice(open + 1, close).trim();
    i = close + 1;
    if (head.startsWith("/") || head.endsWith("/")) continue;
    const tag = head.replace(/^\//, "").split(/[\s/]/, 1)[0]!.toLowerCase();
    if (!/^[a-z][a-z0-9]*$/.test(tag)) continue;
    if (VOID_TAGS.has(tag)) {
      blocks.push({ tag, raw: clean.slice(open, close + 1), inner: "" });
      continue;
    }
    // Find the matching close tag, respecting nesting of the same tag.
    let depth = 1;
    let j = i;
    let end = -1;
    while (j < n && depth > 0) {
      const o = clean.indexOf("<", j);
      if (o < 0) break;
      const c = clean.indexOf(">", o);
      if (c < 0) break;
      const h = clean.slice(o + 1, c).trim();
      const t = h.replace(/^\//, "").split(/[\s/]/, 1)[0]!.toLowerCase();
      if (!h.startsWith("/") && !h.endsWith("/") && t === tag && !VOID_TAGS.has(t)) depth++;
      else if (h.startsWith("/") && t === tag) {
        depth--;
        if (depth === 0) end = c + 1;
      }
      j = c + 1;
    }
    if (end < 0) break;
    blocks.push({ tag, raw: clean.slice(open, end), inner: clean.slice(i, end - (`</${tag}>`.length)) });
    i = end;
  }
  return blocks;
}

/** Tag-stripped text of an HTML fragment (titles, emptiness checks). */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * DOCX → import parts. Word Heading 1 styles become chapter titles,
 * Heading 2 stays a prose `h2` (allowlist). Tables, images, footnotes,
 * comments, and tracked changes are dropped with a per-import skip
 * notice (Q5) — full DOCX fidelity is a document-conversion product,
 * not a manuscript importer.
 */
export async function normalizeDocxImport(
  buffer: Buffer,
): Promise<{ parts: ImportPart[]; skipped: string[] }> {
  const skipped: string[] = [];
  let droppedImages = 0;
  let value: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: ["p[style-name='Heading 1'] => h1", "p[style-name='Heading 2'] => h2"],
        // Images are dropped, not embedded: counted here for the notice.
        convertImage: mammoth.images.imgElement(() => {
          droppedImages++;
          return null;
        }),
      },
    );
    value = result.value;
  } catch {
    throw new ImportError(400, "IMPORT_CORRUPT", "DOCX could not be parsed");
  }

  let docXml = "";
  let commentsDropped = false;
  try {
    // Tracked-change / comment detection: cheap scans of the raw XML.
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file("word/document.xml");
    if (file) docXml = await file.async("string");
    const commentsFile = zip.file("word/comments.xml");
    if (commentsFile) {
      const commentsXml = await commentsFile.async("string");
      commentsDropped = /<w:comment[\s>]/.test(commentsXml);
    }
  } catch {
    // Detection is best-effort; the conversion already succeeded.
  }
  if (commentsDropped) skipped.push("comments dropped");
  if (/<w:(ins|del)\b/.test(docXml)) skipped.push("tracked changes dropped");

  const parts: ImportPart[] = [];
  let cur: { title: string; blocks: string[] } | null = null;
  let tables = 0;
  let footnotes = 0;
  const flush = () => {
    if (cur) {
      parts.push({ title: cur.title, rawText: htmlToText(cur.blocks.join("")), htmlBody: cur.blocks.join("") });
      cur = null;
    }
  };
  for (const b of topLevelBlocks(value)) {
    if (b.tag === "h1") {
      flush();
      cur = { title: htmlToText(b.inner), blocks: [] };
      continue;
    }
    if (b.tag === "table") {
      tables++;
      continue;
    }
    if (b.tag === "ol" && /id="footnote-/.test(b.raw)) {
      footnotes += (b.raw.match(/<li\b/g) ?? []).length;
      continue;
    }
    if (b.tag === "img") continue; // counted by convertImage
    // Footnote reference superscripts: dropped with the footnote notice.
    const noRefs = b.raw.replace(/<sup>\s*<a[^>]*href="#footnote-\d+"[^>]*>[\s\S]*?<\/a>\s*<\/sup>/g, "");
    if (!cur) cur = { title: "Imported", blocks: [] };
    cur.blocks.push(noRefs);
  }
  flush();
  if (tables) skipped.push(`${tables} table${tables > 1 ? "s" : ""} dropped`);
  if (droppedImages) skipped.push(`${droppedImages} image${droppedImages > 1 ? "s" : ""} dropped`);
  if (footnotes) skipped.push(`${footnotes} footnote${footnotes > 1 ? "s" : ""} dropped`);
  return { parts, skipped };
}
