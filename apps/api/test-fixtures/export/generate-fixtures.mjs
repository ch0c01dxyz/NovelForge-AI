/**
 * NF-WF-017B: generate the committed export fixtures.
 *
 * Run: `node --experimental-transform-types generate-fixtures.mjs`
 * from this directory. Writes sample.md, sample.txt, sample.pdf,
 * sample.docx, sample.epub from the pinned chapters.json input.
 *
 * The txt/md samples are byte-compared by the test suite; the
 * pdf/docx/epub samples are validated structurally (they embed
 * generation timestamps in core properties).
 */
/* global console */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderDocx,
  renderEpub,
  renderMarkdown,
  renderPdf,
  renderTxt,
} from "../../src/services/export-render.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const chapters = JSON.parse(readFileSync(join(dir, "chapters.json"), "utf8"));

writeFileSync(join(dir, "sample.md"), renderMarkdown(chapters));
console.log("wrote sample.md");
writeFileSync(join(dir, "sample.txt"), renderTxt(chapters));
console.log("wrote sample.txt");

writeFileSync(join(dir, "sample.pdf"), await renderPdf("Novel export-fixture", chapters));
console.log("wrote sample.pdf");
writeFileSync(join(dir, "sample.docx"), await renderDocx("Novel export-fixture", chapters));
console.log("wrote sample.docx");
writeFileSync(
  join(dir, "sample.epub"),
  await renderEpub("Novel export-fixture", "export-fixture", chapters),
);
console.log("wrote sample.epub");
