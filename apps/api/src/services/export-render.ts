/**
 * NF-WF-017B: export rendering (HTML → retained formats).
 *
 * Source of truth is the frozen 015 sanitized-HTML `ChapterVersion.content`.
 * The export shapes are round-trip pinned by the 017 contract (F1):
 * - TXT: chapter headings in the setext form the frozen TXT importer
 *   splits on (`{n}. {title}` line + `===` underline, no `---`
 *   separators), prose headings as plain lines.
 * - Markdown: chapters as `# N. Title`, prose `h2` rendered as bold
 *   (`**text**`), never `## ` (the frozen md importer treats `##` as a
 *   chapter boundary). `hr` → `---`.
 * - DOCX: chapter titles as Heading styles, prose from the HTML blocks.
 * - PDF: chapter-per-section layout from the HTML blocks.
 * - EPUB: one XHTML content document per chapter, OPF manifest + NCX.
 *
 * Sync download only, with a pinned byte cap (Q8) — whole-novel only
 * (Q6). Async export jobs are a follow-up.
 */

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { topLevelBlocks } from "./import-normalize.ts";

export type ExportFormat = "md" | "txt" | "docx" | "pdf" | "epub";

export interface ExportChapter {
  number: number;
  title: string;
  /** Sanitized HTML (frozen 015 format). */
  content: string;
}

/**
 * Sync-download byte cap (Q8, implementer-pinned). The pre-render estimate
 * is the sum of chapter content bytes; rendering is refused before any
 * document is built when the estimate exceeds the cap. A post-render
 * guard repeats the check on the real buffer.
 */
export const EXPORT_BYTE_CAP = 15_000_000;

export class ExportError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ExportError";
    this.status = status;
    this.code = code;
  }
}

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  md: "md",
  txt: "txt",
  docx: "docx",
  pdf: "pdf",
  epub: "epub",
};

// ---------------------------------------------------------------------------
// HTML → text/markdown helpers (allowlist-aware).
// ---------------------------------------------------------------------------

/** Escape markup so plain-text prose can never become tags downstream. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** Strip every tag to plain text; `<br>` becomes a newline. */
function innerText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
}

/**
 * Inline HTML → inline markdown. Only allowlist inlines exist in the
 * sanitized source (`strong`, `em`, `br`); anything else degrades to
 * text so no markup can leak into the export.
 */
function inlineToMarkdown(inner: string): string {
  const replaced = inner
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_m, t: string) => `**${t}**`)
    .replace(/<em>([\s\S]*?)<\/em>/gi, (_m, t: string) => `*${t}*`);
  return decodeEntities(replaced.replace(/<[^>]+>/g, ""));
}

interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Split inline HTML into text runs for the DOCX/PDF renderers. */
function inlineToRuns(inner: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const token = /(<\/?(?:strong|em)>|<br\s*\/?>)/gi;
  let last = 0;
  let bold = false;
  let italic = false;
  const push = (text: string) => {
    const clean = decodeEntities(text.replace(/<[^>]+>/g, ""));
    if (clean) runs.push({ text: clean, bold, italic });
  };
  let m: RegExpExecArray | null;
  while ((m = token.exec(inner)) !== null) {
    push(inner.slice(last, m.index));
    const tag = m[1]!.toLowerCase();
    if (tag === "<br>" || tag === "<br/>") push("\n");
    else if (tag === "<strong>") bold = true;
    else if (tag === "</strong>") bold = false;
    else if (tag === "<em>") italic = true;
    else if (tag === "</em>") italic = false;
    last = m.index + m[0].length;
  }
  push(inner.slice(last));
  return runs;
}

/** Structured blocks: tag + inline markdown + plain text + runs. */
interface ExportBlock {
  tag: string;
  markdown: string;
  text: string;
  runs: InlineRun[];
  /** Per-item text for ul/ol blocks (parsed from <li>). */
  items: string[];
}

function parseBlocks(content: string): ExportBlock[] {
  const top = topLevelBlocks(content);
  // Plain-text rows (no block tags — e.g. chapters saved via the API
  // without the editor) follow the 013 reader's dual-format rule: treat
  // blank-line-separated runs as paragraphs instead of dropping them.
  if (top.length === 0 && content.trim()) {
    return content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => {
        const text = decodeEntities(p.replace(/<[^>]+>/g, ""));
        return {
          tag: "p",
          markdown: inlineToMarkdown(escapeHtml(p)),
          text,
          runs: inlineToRuns(escapeHtml(p)),
          items: [] as string[],
        };
      });
  }
  return top.map((b) => {
    const items: string[] =
      b.tag === "ul" || b.tag === "ol"
        ? b.inner
            .split(/<\/li>/i)
            .map((part) => innerText(part).trim())
            .filter((t) => t.length > 0)
        : [];
    return {
      tag: b.tag,
      markdown: inlineToMarkdown(b.inner).trim(),
      text: innerText(b.inner).trim(),
      runs: inlineToRuns(b.inner),
      items,
    };
  });
}

// ---------------------------------------------------------------------------
// TXT + Markdown (the round-trip-pinned pair).
// ---------------------------------------------------------------------------

/**
 * TXT export (F1): `{n}. {title}` line + `===` underline — the setext form
 * the frozen TXT importer splits on. No `---` separators (the importer
 * treats them as content).
 */
export function renderTxt(chapters: ExportChapter[]): string {
  return chapters
    .map((c) => {
      const prose = parseBlocks(c.content)
        .map((b) => (b.tag === "ul" || b.tag === "ol" ? b.items.join("\n") : b.text))
        .filter((t) => t.length > 0)
        .join("\n\n");
      return `${c.number}. ${c.title}\n===\n\n${prose}`;
    })
    .join("\n\n");
}

/**
 * Escape prose lines that would otherwise be re-imported as structure:
 * a line starting with `#` becomes a chapter boundary under the frozen
 * md importer, so it is escaped with a backslash on export.
 */
function escapeMdLine(line: string): string {
  return line.startsWith("#") ? `\\${line}` : line;
}

/**
 * Markdown export (F1): chapters as `# N. Title`; prose `h2` as bold
 * (`**text**`), never `## `; `blockquote` → `> `; lists → `- ` / `N. `;
 * `hr` → `---`. Chapters are separated by blank lines only — a `---`
 * separator would re-import as a trailing `<hr>` in the previous
 * chapter's prose.
 */
export function renderMarkdown(chapters: ExportChapter[]): string {
  return chapters
    .map((c) => {
      const out: string[] = [`# ${c.number}. ${c.title}`, ""];
      for (const b of parseBlocks(c.content)) {
        if (!b.markdown && b.tag !== "hr") continue;
        switch (b.tag) {
          case "h2":
            out.push(`**${b.markdown}**`, "");
            break;
          case "blockquote":
            out.push(
              ...b.markdown.split("\n").map((l) => `> ${l}`),
              "",
            );
            break;
          case "ul":
          case "ol": {
            const items = b.items.length > 0 ? b.items : [b.text].filter((t) => t.length > 0);
            items.forEach((item, i) =>
              out.push(b.tag === "ul" ? `- ${item}` : `${i + 1}. ${item}`),
            );
            out.push("");
            break;
          }
          case "hr":
            out.push("---", "");
            break;
          default:
            out.push(
              ...b.markdown.split("\n").map(escapeMdLine),
              "",
            );
        }
      }
      return out.join("\n").trimEnd();
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// DOCX.
// ---------------------------------------------------------------------------

/**
 * Fixed document dates keep generated fixtures byte-deterministic (the
 * in-repo fixtures are committed, not regenerated per run).
 */
const FIXTURE_DATE = new Date("2026-01-01T00:00:00.000Z");

function docxParagraph(
  b: ExportBlock,
  opts: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; indent?: number } = {},
): Paragraph {
  return new Paragraph({
    heading: opts.heading,
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: b.runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: r.bold || opts.heading === HeadingLevel.HEADING_2,
          italics: r.italic,
        }),
    ),
  });
}

export async function renderDocx(
  novelTitle: string,
  chapters: ExportChapter[],
): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const c of chapters) {
    children.push(
      new Paragraph({
        text: `${c.number}. ${c.title}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const b of parseBlocks(c.content)) {
      if (!b.text && b.tag !== "hr") continue;
      switch (b.tag) {
        case "h2":
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: b.text ? [new TextRun({ text: b.text, bold: true })] : [],
            }),
          );
          break;
        case "blockquote":
          children.push(docxParagraph(b, { indent: 720 }));
          break;
        case "hr":
          children.push(
            new Paragraph({
              children: [new TextRun("—".repeat(24))],
            }),
          );
          break;
        default:
          children.push(docxParagraph(b));
      }
    }
  }
  const doc = new Document({
    creator: "NovelForge",
    title: novelTitle,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// PDF (pdf-lib, pure JS — manual text flow, chapter-per-section).
// ---------------------------------------------------------------------------

const PDF_PAGE_WIDTH = 595.28; // A4
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 72;

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter((w) => w.length > 0);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * NF-WF-023B (GAP-062 closure): pre-flight WinAnsi encodability check.
 *
 * The PDF standard fonts are WinAnsi/CP1252-encoded. Rather than
 * hand-rolling the CP1252 table, this probes pdf-lib's own encoder
 * (`font.encodeText`, which is what `drawText`/`widthOfTextAtSize` call
 * internally and what throws `WinAnsi cannot encode ...`). Any text
 * that fails the probe would throw at draw time as a 500; instead we
 * raise the typed refusal here, before any page is drawn.
 *
 * The probe runs over the raw title/content inputs: block text drawn
 * later is a subset of `content` (tags stripped, never added), and the
 * chapter number is digits, so a clean probe guarantees clean draws.
 */
function assertPdfEncodable(
  font: { encodeText(text: string): unknown },
  novelTitle: string,
  chapters: ExportChapter[],
): void {
  const probe = (text: string) => {
    try {
      font.encodeText(text);
    } catch {
      throw new ExportError(
        400,
        "PDF_UNSUPPORTED_CHARACTERS",
        "PDF export supports Latin (WinAnsi) text only; this novel contains characters outside that range. Export as DOCX or EPUB for full Unicode support.",
      );
    }
  };
  probe(novelTitle);
  for (const c of chapters) {
    probe(c.title);
    probe(c.content);
  }
}

export async function renderPdf(
  novelTitle: string,
  chapters: ExportChapter[],
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(novelTitle);
  doc.setCreator("NovelForge");
  doc.setCreationDate(FIXTURE_DATE);
  doc.setModificationDate(FIXTURE_DATE);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // NF-WF-023B (GAP-062 closure): typed refusal for non-WinAnsi prose.
  // The embedded standard fonts are WinAnsi/CP1252-encoded; pdf-lib
  // throws `WinAnsi cannot encode ...` at draw time for anything else
  // (e.g. CJK, emoji), which would surface as a 500. Detect up front —
  // before any page.drawText — and refuse with an actionable 4xx naming
  // the remedy (export as DOCX/EPUB), instead of the 500.
  assertPdfEncodable(regular, novelTitle, chapters);
  const maxWidth = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
  const lineHeight = (size: number) => size * 1.4;

  const newPage = () => {
    const page = doc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
    return { page, y: PDF_PAGE_HEIGHT - PDF_MARGIN };
  };
  let { page, y } = newPage();
  const ensureSpace = (needed: number) => {
    if (y - needed < PDF_MARGIN) {
      ({ page, y } = newPage());
    }
  };
  const drawLines = (
    lines: string[],
    size: number,
    font: typeof regular,
    opts: { indent?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    for (const line of lines) {
      ensureSpace(lineHeight(size));
      page.drawText(line, {
        x: PDF_MARGIN + (opts.indent ?? 0),
        y: y - size,
        size,
        font,
        color: opts.color ?? rgb(0, 0, 0),
      });
      y -= lineHeight(size);
    }
  };

  for (const c of chapters) {
    // Chapter-per-section: every chapter starts on a fresh page (after
    // the first).
    if (doc.getPageCount() > 1 || y < PDF_PAGE_HEIGHT - PDF_MARGIN) {
      ({ page, y } = newPage());
    }
    const titleLines = wrapText(
      `${c.number}. ${c.title}`,
      bold,
      18,
      maxWidth,
    );
    drawLines(titleLines, 18, bold);
    y -= 12;
    for (const b of parseBlocks(c.content)) {
      if (!b.text && b.tag !== "hr") continue;
      switch (b.tag) {
        case "h2":
          y -= 6;
          drawLines(
            wrapText(b.text, bold, 14, maxWidth),
            14,
            bold,
          );
          break;
        case "blockquote":
          drawLines(wrapText(b.text, regular, 11, maxWidth - 24), 11, regular, {
            indent: 24,
          });
          break;
        case "hr":
          ensureSpace(12);
          page.drawLine({
            start: { x: PDF_MARGIN, y: y - 6 },
            end: { x: PDF_PAGE_WIDTH - PDF_MARGIN, y: y - 6 },
            thickness: 1,
            color: rgb(0.6, 0.6, 0.6),
          });
          y -= 12;
          break;
        default:
          drawLines(wrapText(b.text, regular, 11, maxWidth), 11, regular);
      }
      y -= 8;
    }
  }
  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------------------
// EPUB (hand-built on jszip: mimetype first + uncompressed, then the
// container, OPF, NCX, and one XHTML document per chapter).
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderEpub(
  novelTitle: string,
  novelSlug: string,
  chapters: ExportChapter[],
): Promise<Buffer> {
  const zip = new JSZip();
  // The mimetype entry MUST be first and uncompressed (EPUB spec).
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip
    .folder("META-INF")!
    .file(
      "container.xml",
      `<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>`,
    );
  const oebps = zip.folder("OEBPS")!;
  const ids = chapters.map((_, i) => `ch${String(i + 1).padStart(3, "0")}`);
  const manifest = ids
    .map((id) => `    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = ids.map((id) => `    <itemref idref="${id}"/>`).join("\n");
  const ncxPoints = ids
    .map(
      (id, i) =>
        `    <navPoint id="nav-${id}" playOrder="${i + 1}">\n      <navLabel><text>${escapeXml(chapters[i]!.title)}</text></navLabel>\n      <content src="${id}.xhtml"/>\n    </navPoint>`,
    )
    .join("\n");
  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?>\n<package version="2.0" unique-identifier="bookid" xmlns="http://www.idpf.org/2007/opf">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:title>${escapeXml(novelTitle)}</dc:title>\n    <dc:identifier id="bookid">novelforge-${escapeXml(novelSlug)}</dc:identifier>\n    <dc:language>en</dc:language>\n    <dc:creator>NovelForge</dc:creator>\n  </metadata>\n  <manifest>\n    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n${manifest}\n  </manifest>\n  <spine toc="ncx">\n${spine}\n  </spine>\n</package>`,
  );
  oebps.file(
    "toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>\n<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">\n  <head>\n    <meta name="dtb:uid" content="novelforge-${escapeXml(novelSlug)}"/>\n  </head>\n  <docTitle><text>${escapeXml(novelTitle)}</text></docTitle>\n  <navMap>\n${ncxPoints}\n  </navMap>\n</ncx>`,
  );
  chapters.forEach((c, i) => {
    // The chapter docs are XHTML: self-close the void elements the
    // sanitized-HTML source serializes HTML-style (`<br>`, `<hr>`) so the
    // documents stay well-formed XML (the allowlist has no other voids).
    const xhtmlBody = c.content
      .replace(/<br\s*\/?>/gi, "<br/>")
      .replace(/<hr\s*\/?>/gi, "<hr/>");
    oebps.file(
      `${ids[i]}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title>${escapeXml(`${c.number}. ${c.title}`)}</title></head>\n<body>\n<h1>${escapeXml(`${c.number}. ${c.title}`)}</h1>\n${xhtmlBody}\n</body>\n</html>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function renderExport(
  format: ExportFormat,
  novelTitle: string,
  novelSlug: string,
  chapters: ExportChapter[],
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  // Q8 byte cap: estimate BEFORE any document is built. The estimate is
  // the raw source bytes; every renderer is bounded by it.
  const estimate = chapters.reduce(
    (sum, c) => sum + Buffer.byteLength(c.content, "utf8") + Buffer.byteLength(c.title, "utf8"),
    0,
  );
  if (estimate > EXPORT_BYTE_CAP) {
    throw new ExportError(
      413,
      "EXPORT_TOO_LARGE",
      `Export refused: estimated ${estimate} bytes exceeds the ${EXPORT_BYTE_CAP}-byte sync cap (async export is a follow-up)`,
    );
  }
  const contentType = EXPORT_CONTENT_TYPES[format];
  const extension = EXPORT_EXTENSIONS[format];
  let buffer: Buffer;
  switch (format) {
    case "md":
      buffer = Buffer.from(renderMarkdown(chapters), "utf8");
      break;
    case "txt":
      buffer = Buffer.from(renderTxt(chapters), "utf8");
      break;
    case "docx":
      buffer = await renderDocx(novelTitle, chapters);
      break;
    case "pdf":
      buffer = await renderPdf(novelTitle, chapters);
      break;
    case "epub":
      buffer = await renderEpub(novelTitle, novelSlug, chapters);
      break;
  }
  if (buffer.length > EXPORT_BYTE_CAP) {
    throw new ExportError(
      413,
      "EXPORT_TOO_LARGE",
      `Export refused: rendered ${buffer.length} bytes exceeds the ${EXPORT_BYTE_CAP}-byte sync cap (async export is a follow-up)`,
    );
  }
  return { buffer, contentType, extension };
}
