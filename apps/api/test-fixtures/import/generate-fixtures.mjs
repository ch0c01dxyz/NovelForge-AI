/**
 * NF-WF-017A: generates the real in-repo import fixtures (PDF, DOCX).
 * The TXT and Markdown fixtures are hand-written (sample.txt, sample.md);
 * PDF and DOCX must be real files, so this script builds them with
 * pdf-lib and the `docx` package (both devDependencies, fixture-only —
 * never shipped to the app runtime).
 *
 * Run: `node test-fixtures/import/generate-fixtures.mjs`
 * from apps/api. The generated files are committed; re-run only when a
 * fixture's prose needs to change.
 */
/* global console, Buffer */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

const dir = dirname(fileURLToPath(import.meta.url));

async function generatePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const draw = (page, lines, startY = 750) => {
    let y = startY;
    for (const { text, bold } of lines) {
      page.drawText(text, { x: 50, y, size: 12, font: bold ? fontBold : font, color: rgb(0, 0, 0) });
      y -= 18;
    }
    return y;
  };
  // Page 1: Chapter One begins here and CONTINUES onto page 2, proving
  // that page breaks do not create chapters (the TXT `===` rule splits).
  const p1 = doc.addPage([612, 792]);
  draw(p1, [
    { text: "Chapter One", bold: true },
    { text: "===" },
    { text: "" },
    { text: "The first chapter begins on page one of the PDF." },
    { text: "It keeps going across the page boundary," },
    { text: "because page breaks never split chapters." },
  ]);
  // Page 2: Chapter One continues, then Chapter Two starts via `===`.
  const p2 = doc.addPage([612, 792]);
  draw(p2, [
    { text: "and this is still Chapter One, on page two." },
    { text: "" },
    { text: "Chapter Two", bold: true },
    { text: "===" },
    { text: "" },
    { text: "The second chapter arrives with its own prose." },
    { text: "Bold words mean nothing to a plain PDF extractor." },
  ]);
  const bytes = await doc.save();
  writeFileSync(join(dir, "sample.pdf"), bytes);
  console.log("wrote sample.pdf", bytes.length, "bytes");
}

async function generateBlankPdf() {
  // A valid PDF with a single empty page: extraction must yield no text,
  // so the import refuses with IMPORT_NO_TEXT (no OCR in 017).
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  writeFileSync(join(dir, "empty.pdf"), bytes);
  console.log("wrote empty.pdf", bytes.length, "bytes");
}

async function generateDocx() {
  // A 1x1 transparent PNG: images must be dropped with a skip notice.
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const doc = new Document({
    footnotes: {
      1: { children: [new Paragraph({ children: [new TextRun("A footnote, dropped with a notice.")] })] },
    },
    sections: [
      {
        children: [
          new Paragraph({ text: "Chapter One", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun("The first chapter "),
              new TextRun({ text: "boldly", bold: true }),
              new TextRun(" and "),
              new TextRun({ text: "softly", italics: true }),
              new TextRun(" begins."),
            ],
          }),
          new Paragraph({ text: "A Subheading", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "Prose under a prose-level heading stays one chapter." }),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph("a")] })] }),
            ],
          }),
          new Paragraph({ text: "Chapter Two", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun("The second chapter carries an image: "),
              new ImageRun({ data: png1x1, transformation: { width: 1, height: 1 }, type: "png" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun("And a footnote reference."),
              new FootnoteReferenceRun(1),
            ],
          }),
        ],
      },
    ],
  });
  const bytes = await Packer.toBuffer(doc);
  writeFileSync(join(dir, "sample.docx"), bytes);
  console.log("wrote sample.docx", bytes.length, "bytes");
}

await generatePdf();
await generateBlankPdf();
await generateDocx();
