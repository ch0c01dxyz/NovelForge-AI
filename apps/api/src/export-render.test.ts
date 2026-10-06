/**
 * NF-WF-017B: export rendering unit suite (no DB).
 *
 * Covers the 017B acceptance at the renderer level:
 * - F1 round-trip-safe shapes: TXT setext headings (no `---`
 *   separators), Markdown `# N. Title` + prose h2 as `**bold**`
 *   (never `## `)
 * - round-trip: export → the frozen `splitImportBlocks` yields the same
 *   chapters (order, titles, prose intact)
 * - PDF/DOCX/EPUB structural validity + chapter content presence
 * - the pinned sync byte cap (Q8): EXPORT_TOO_LARGE, 413
 * - committed fixtures are byte-stable for txt/md
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractText as unpdfExtractText } from "unpdf";
import {
  EXPORT_BYTE_CAP,
  ExportError,
  renderDocx,
  renderEpub,
  renderExport,
  renderMarkdown,
  renderPdf,
  renderTxt,
  type ExportChapter,
} from "./services/export-render.ts";
import { splitImportBlocks, normalizeTextImport } from "./services/import-normalize.ts";
import { stripHtmlTags } from "./services/manuscript.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = path.join(HERE, "..", "test-fixtures", "export");

const chapters: ExportChapter[] = JSON.parse(
  readFileSync(path.join(FIXTURES, "chapters.json"), "utf8"),
);

/**
 * Prose equality for the round-trip: whitespace-normalized, with the
 * frozen strip-rule's inline-tag spacing artifact neutralized
 * (`stripHtmlTags` replaces each tag with a space, so `<em>slowly</em>,`
 * strips to "slowly ,"). Plain-text exports cannot carry inline markup;
 * the words and their order are what must survive.
 */
function normalizedProse(html: string): string {
  return stripHtmlTags(html)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

describe("renderTxt (F1 setext shape)", () => {
  it("emits chapter headings the frozen TXT importer splits on", () => {
    const out = renderTxt(chapters);
    expect(out).toContain("1. The Beginning\n===\n");
    expect(out).toContain("2. The Road\n===\n");
    expect(out).not.toContain("---");
    expect(out).not.toMatch(/^# /m);
  });

  it("renders prose h2 as a plain line and strips inline markup", () => {
    const out = renderTxt(chapters);
    expect(out).toContain("\nA New Path\n");
    expect(out).toContain("The wind howled through the dark forest.");
    expect(out).not.toContain("<strong>");
  });

  it("round-trips through the frozen TXT splitter: same chapters, titles, prose", () => {
    const out = renderTxt(chapters);
    const blocks = splitImportBlocks(out, "txt");
    expect(blocks.map((b) => b.title)).toEqual(["1. The Beginning", "2. The Road"]);
    blocks.forEach((b, i) => {
      const reimported = normalizeTextImport(out, "txt")[i]!;
      expect(normalizedProse(reimported.htmlBody)).toBe(normalizedProse(chapters[i]!.content));
    });
  });
});

describe("renderMarkdown (F1 ATX shape)", () => {
  it("keeps `# N. Title` for chapters and renders prose h2 as bold, never `## `", () => {
    const out = renderMarkdown(chapters);
    expect(out).toContain("# 1. The Beginning");
    expect(out).toContain("# 2. The Road");
    expect(out).toContain("**A New Path**");
    expect(out).not.toMatch(/^## /m);
    expect(out).toContain("> Do not look back.");
    expect(out).toContain("- First item");
    expect(out).toContain("- Second item");
  });

  it("has no chapter `---` separators (they would re-import as <hr> prose)", () => {
    const out = renderMarkdown(chapters);
    // The only `---` allowed is the real <hr> block.
    expect(out.match(/^---$/gm)?.length).toBe(1);
  });

  it("round-trips through the frozen md splitter: same chapters, titles, prose", () => {
    const out = renderMarkdown(chapters);
    const blocks = splitImportBlocks(out, "md");
    expect(blocks.map((b) => b.title)).toEqual(["1. The Beginning", "2. The Road"]);
    const reimported = normalizeTextImport(out, "md");
    reimported.forEach((part, i) => {
      expect(normalizedProse(part.htmlBody)).toBe(normalizedProse(chapters[i]!.content));
    });
  });
});

describe("plain-text rows (reader dual-format rule)", () => {
  it("renders plain-text content as paragraphs instead of dropping it", () => {
    const plain: ExportChapter[] = [
      { number: 1, title: "Alpha", content: "alpha content" },
      { number: 2, title: "Beta", content: "first para\n\nsecond para" },
    ];
    const md = renderMarkdown(plain);
    expect(md).toContain("# 1. Alpha");
    expect(md).toContain("alpha content");
    expect(md).toContain("first para");
    expect(md).toContain("second para");
    const txt = renderTxt(plain);
    expect(txt).toContain("1. Alpha\n===\n\nalpha content");
    expect(txt).toContain("first para\n\nsecond para");
  });
});

describe("renderDocx", () => {
  it("produces a valid .docx containing the chapters in order", async () => {
    const buffer = await renderDocx("Fixture Novel", chapters);
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    const zip = await JSZip.loadAsync(buffer);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("The Beginning");
    expect(doc).toContain("The Road");
    expect(doc.indexOf("The Beginning")).toBeLessThan(doc.indexOf("The Road"));
    expect(doc).toContain("A New Path");
    expect(doc).toContain("Do not look back.");
  });
});

describe("renderPdf", () => {
  it("produces a valid PDF whose extracted text contains the chapters", async () => {
    const buffer = await renderPdf("Fixture Novel", chapters);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const { text } = await unpdfExtractText(new Uint8Array(buffer));
    const joined = (Array.isArray(text) ? text : [text]).join("\n");
    expect(joined).toContain("The Beginning");
    expect(joined).toContain("The Road");
    expect(joined).toContain("A New Path");
  });
});

describe("renderEpub", () => {
  it("produces a valid EPUB: mimetype first + stored, container, OPF, NCX, chapter docs", async () => {
    const buffer = await renderEpub("Fixture Novel", "fixture-novel", chapters);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
    const container = await zip.file("META-INF/container.xml")!.async("string");
    expect(container).toContain("OEBPS/content.opf");
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain("<dc:title>Fixture Novel</dc:title>");
    expect(opf).toContain('href="ch001.xhtml"');
    expect(opf).toContain('href="ch002.xhtml"');
    const ncx = await zip.file("OEBPS/toc.ncx")!.async("string");
    expect(ncx).toContain("The Beginning");
    const ch1 = await zip.file("OEBPS/ch001.xhtml")!.async("string");
    expect(ch1).toContain("<h1>1. The Beginning</h1>");
    expect(ch1).toContain("The wind howled");
  });
});

describe("renderExport byte cap (Q8)", () => {
  it("refuses exports beyond the pinned cap with EXPORT_TOO_LARGE (413)", async () => {
    const huge: ExportChapter[] = [
      { number: 1, title: "Huge", content: `<p>${"x".repeat(EXPORT_BYTE_CAP)}</p>` },
    ];
    await expect(renderExport("md", "T", "t", huge)).rejects.toMatchObject({
      name: "ExportError",
      code: "EXPORT_TOO_LARGE",
      status: 413,
    });
    await expect(renderExport("txt", "T", "t", huge)).rejects.toBeInstanceOf(ExportError);
  });

  it("returns content-type and extension per format", async () => {
    const { contentType, extension } = await renderExport("md", "T", "t", chapters);
    expect(contentType).toBe("text/markdown; charset=utf-8");
    expect(extension).toBe("md");
    const pdf = await renderExport("pdf", "T", "t", chapters);
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.extension).toBe("pdf");
  });
});

describe("committed fixtures", () => {
  it("txt/md samples are byte-stable", () => {
    expect(renderTxt(chapters)).toBe(readFileSync(path.join(FIXTURES, "sample.txt"), "utf8"));
    expect(renderMarkdown(chapters)).toBe(
      readFileSync(path.join(FIXTURES, "sample.md"), "utf8"),
    );
  });

  it("pdf/docx/epub samples validate structurally", async () => {
    const pdf = readFileSync(path.join(FIXTURES, "sample.pdf"));
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const docx = await JSZip.loadAsync(readFileSync(path.join(FIXTURES, "sample.docx")));
    expect(await docx.file("word/document.xml")!.async("string")).toContain("The Beginning");
    const epub = await JSZip.loadAsync(readFileSync(path.join(FIXTURES, "sample.epub")));
    expect(await epub.file("OEBPS/content.opf")!.async("string")).toContain(
      "<dc:title>Novel export-fixture</dc:title>",
    );
  });
});
