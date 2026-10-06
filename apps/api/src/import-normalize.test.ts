/**
 * NF-WF-017A: unit tests for the import normalization pipeline
 * (`services/import-normalize.ts`). No DB — pure function tests plus
 * extraction against the real in-repo fixtures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkImportByteCap,
  checkZipBomb,
  detectImportFormat,
  extractPdfText,
  ImportError,
  MAX_DOCX_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_FILE_BYTES,
  mdBodyToHtml,
  normalizeDocxImport,
  normalizeTextImport,
  parseZipCentralDirectory,
  plainTextToHtml,
  splitImportBlocks,
  validateImportFile,
} from "./services/import-normalize.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = path.join(HERE, "..", "test-fixtures", "import");
const read = (name: string): Buffer => readFileSync(path.join(FIXTURES, name));

describe("splitImportBlocks (frozen rules)", () => {
  it("md: ATX #/## split into chapters", () => {
    const parts = splitImportBlocks("# One\nbody one\n## Two\nbody two", "md");
    expect(parts.map((p) => p.title)).toEqual(["One", "Two"]);
    expect(parts[0]!.body.join("\n")).toContain("body one");
  });
  it("md: ### does NOT split", () => {
    const parts = splitImportBlocks("# One\n### Sub\nbody", "md");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.body.join("\n")).toContain("### Sub");
  });
  it("txt: === underlines a title; --- stays content", () => {
    const parts = splitImportBlocks("Chapter One\n=====\nBody.\n---\nStill one.", "txt");
    expect(parts.map((p) => p.title)).toEqual(["Chapter One"]);
    expect(parts[0]!.body.join("\n")).toContain("---");
  });
  it("txt: === with no preceding title line is content", () => {
    const parts = splitImportBlocks("===\nBody only.", "txt");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.body.join("\n")).toContain("===");
  });
  it("trailing heading with no prose becomes no chapter", () => {
    expect(splitImportBlocks("# One\nbody\n# Empty", "md")).toHaveLength(1);
  });
});

describe("plainTextToHtml", () => {
  it("blank-line paragraphs become <p>; single newlines become <br>", () => {
    expect(plainTextToHtml("First line\n\nSecond line")).toBe(
      "<p>First line</p><p>Second line</p>",
    );
    expect(plainTextToHtml("a\nb")).toBe("<p>a<br>b</p>");
  });
  it("escapes markup so it can never be live tags", () => {
    expect(plainTextToHtml('<script>x</script>')).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });
  it("empty input yields empty output", () => {
    expect(plainTextToHtml("")).toBe("");
  });
});

describe("mdBodyToHtml (allowlist constructs only)", () => {
  it("bold/italic/quote/lists/hr/headings map to allowlist tags", () => {
    const html = mdBodyToHtml(
      "**bold** and *italic*\n\n> a quote\n\n- one\n- two\n\n---\n\n### Sub\n\n1. first\n2. second",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<blockquote><p>a quote</p></blockquote>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<h2>Sub</h2>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
  });
  it("code fences, links, images, tables degrade to plain text", () => {
    const html = mdBodyToHtml('```js\nconst x = 1;\n```\n\n[a link](https://x.test)\n\n![alt](pic.png)\n\n| a | b |\n|---|---|\n| c | d |');
    expect(html).not.toContain("<code>");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<table>");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("a link");
    expect(html).toContain("alt");
  });
  it("raw HTML in markdown is escaped, never live", () => {
    const html = mdBodyToHtml('<script>alert(1)</script>\n\n<img src=x onerror=y>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("normalizeTextImport", () => {
  it("md fixture: two parts, HTML bodies", () => {
    const parts = normalizeTextImport(read("sample.md").toString("utf-8"), "md");
    expect(parts.map((p) => p.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(parts[0]!.htmlBody).toContain("<strong>Bold words</strong>");
    expect(parts[0]!.htmlBody).toContain("<hr>");
    expect(parts[1]!.htmlBody).toContain("<h2>A Subheading</h2>");
    // The <script> injection attempt is escaped at conversion and will
    // be stripped at the write path (GAP-061 test asserts the write).
    expect(parts[1]!.htmlBody).not.toContain("<script>");
  });
  it("txt fixture: two parts, === titles, prose paragraphs", () => {
    const parts = normalizeTextImport(read("sample.txt").toString("utf-8"), "txt");
    expect(parts.map((p) => p.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(parts[0]!.htmlBody).toBe(
      "<p>The first chapter begins with plain prose.</p><p>It has multiple paragraphs.</p>",
    );
  });
});

describe("detectImportFormat", () => {
  it("PDF magic wins", () => {
    expect(detectImportFormat(read("sample.pdf"), {}).format).toBe("pdf");
  });
  it("DOCX magic wins", () => {
    const { format, zipEntries } = detectImportFormat(read("sample.docx"), {});
    expect(format).toBe("docx");
    expect(zipEntries.some((e) => e.name === "word/document.xml")).toBe(true);
  });
  it("declared format contradicting magic is rejected", () => {
    expect(() => detectImportFormat(read("sample.pdf"), { declaredFormat: "txt" })).toThrowError(
      expect.objectContaining({ code: "IMPORT_UNSUPPORTED_TYPE" }),
    );
    expect(() => detectImportFormat(read("sample.txt"), { declaredFormat: "pdf" })).toThrowError(
      expect.objectContaining({ code: "IMPORT_UNSUPPORTED_TYPE" }),
    );
  });
  it("text declared md wins; .md filename wins; text/markdown wins", () => {
    expect(detectImportFormat(read("sample.txt"), { declaredFormat: "md" }).format).toBe("md");
    expect(detectImportFormat(read("sample.txt"), { filename: "novel.md" }).format).toBe("md");
    expect(detectImportFormat(read("sample.txt"), { mimeType: "text/markdown" }).format).toBe("md");
    expect(detectImportFormat(read("sample.txt"), {}).format).toBe("txt");
  });
  it("binary without magic is rejected", () => {
    expect(() => detectImportFormat(Buffer.from([0, 1, 2, 3]), {})).toThrowError(
      expect.objectContaining({ code: "IMPORT_UNSUPPORTED_TYPE" }),
    );
  });
  it("non-allowlisted MIME is rejected", () => {
    expect(() =>
      detectImportFormat(read("sample.txt"), { mimeType: "image/png" }),
    ).toThrowError(expect.objectContaining({ code: "IMPORT_UNSUPPORTED_TYPE" }));
  });
  it("a ZIP that is not a DOCX is rejected", () => {
    // Minimal empty ZIP (EOCD only).
    const zip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    expect(() => detectImportFormat(zip, {})).toThrowError(
      expect.objectContaining({ code: "IMPORT_UNSUPPORTED_TYPE" }),
    );
  });
});

describe("checkImportByteCap", () => {
  it("per-format caps", () => {
    expect(() => checkImportByteCap(Buffer.alloc(MAX_TEXT_FILE_BYTES + 1), "txt")).toThrowError(
      expect.objectContaining({ code: "IMPORT_TOO_LARGE" }),
    );
    expect(() => checkImportByteCap(Buffer.alloc(MAX_PDF_BYTES + 1), "pdf")).toThrowError(
      expect.objectContaining({ code: "IMPORT_TOO_LARGE" }),
    );
    expect(() => checkImportByteCap(Buffer.alloc(MAX_DOCX_BYTES + 1), "docx")).toThrowError(
      expect.objectContaining({ code: "IMPORT_TOO_LARGE" }),
    );
    expect(() => checkImportByteCap(Buffer.alloc(MAX_TEXT_FILE_BYTES), "txt")).not.toThrow();
  });
});

describe("checkZipBomb / parseZipCentralDirectory", () => {
  it("real docx parses and passes", () => {
    const entries = parseZipCentralDirectory(read("sample.docx"));
    expect(entries.length).toBeGreaterThan(5);
    expect(() => checkZipBomb(entries, read("sample.docx").length)).not.toThrow();
  });
  it("entry-count cap", () => {
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      name: `f${i}.txt`,
      uncompressedSize: 10,
      compressedSize: 10,
    }));
    expect(() => checkZipBomb(entries, 10_010)).toThrowError(
      expect.objectContaining({ code: "IMPORT_ARCHIVE_UNSAFE" }),
    );
  });
  it("uncompressed-size cap", () => {
    expect(() =>
      checkZipBomb([{ name: "a", uncompressedSize: 60_000_000, compressedSize: 1000 }], 1000),
    ).toThrowError(expect.objectContaining({ code: "IMPORT_ARCHIVE_UNSAFE" }));
  });
  it("compression-ratio cap", () => {
    expect(() =>
      checkZipBomb([{ name: "a", uncompressedSize: 2_000_000, compressedSize: 1000 }], 1000),
    ).toThrowError(expect.objectContaining({ code: "IMPORT_ARCHIVE_UNSAFE" }));
  });
  it("garbage is not a ZIP", () => {
    expect(() => parseZipCentralDirectory(Buffer.from("hello world"))).toThrowError(
      expect.objectContaining({ code: "IMPORT_CORRUPT" }),
    );
  });
});

describe("extractPdfText", () => {
  it("extracts per page; page breaks join with blank lines", async () => {
    const { text, skipped } = await extractPdfText(read("sample.pdf"));
    expect(text).toContain("Chapter One\n===");
    expect(text).toContain("and this is still Chapter One, on page two.");
    expect(skipped).toEqual([]);
  });
  it("scanned/empty PDFs refuse with IMPORT_NO_TEXT", async () => {
    await expect(extractPdfText(read("empty.pdf"))).rejects.toThrowError(
      expect.objectContaining({ code: "IMPORT_NO_TEXT" }),
    );
  });
  it("garbage refuses with IMPORT_CORRUPT", async () => {
    await expect(extractPdfText(Buffer.from("%PDF- not really"))).rejects.toThrowError(
      expect.objectContaining({ code: "IMPORT_CORRUPT" }),
    );
  });
});

describe("normalizeDocxImport", () => {
  it("Heading 1 splits chapters; Heading 2 stays prose h2", async () => {
    const { parts } = await normalizeDocxImport(read("sample.docx"));
    expect(parts.map((p) => p.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(parts[0]!.htmlBody).toContain("<strong>boldly</strong>");
    expect(parts[0]!.htmlBody).toContain("<h2>A Subheading</h2>");
    expect(parts[1]!.htmlBody).toContain("The second chapter carries an image:");
  });
  it("tables, images, footnotes are dropped with a skip notice", async () => {
    const { skipped } = await normalizeDocxImport(read("sample.docx"));
    expect(skipped.join("; ")).toContain("1 table dropped");
    expect(skipped.join("; ")).toContain("1 image dropped");
    expect(skipped.join("; ")).toContain("1 footnote dropped");
  });
  it("garbage refuses with IMPORT_CORRUPT", async () => {
    await expect(
      normalizeDocxImport(Buffer.from("PK\x03\x04garbage")),
    ).rejects.toThrowError(expect.objectContaining({ code: "IMPORT_CORRUPT" }));
  });
});

describe("validateImportFile", () => {
  it("full pipeline validation for each fixture", () => {
    expect(validateImportFile(read("sample.pdf"), {}).format).toBe("pdf");
    expect(validateImportFile(read("sample.docx"), {}).format).toBe("docx");
    expect(validateImportFile(read("sample.md"), { declaredFormat: "md" }).format).toBe("md");
    expect(validateImportFile(read("sample.txt"), {}).format).toBe("txt");
  });
});

describe("ImportError", () => {
  it("is a typed 400", () => {
    const e = new ImportError(400, "IMPORT_NO_TEXT", "nope");
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe("IMPORT_NO_TEXT");
  });
});
