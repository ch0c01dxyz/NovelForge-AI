import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseNovelZip } from "./novel-zip.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY5cAAAAASUVORK5CYII=";
function novel(zip: JSZip, root = "Novel", metadata: Record<string, unknown> = { title: "Example", source: "https://source.test/story" }) {
  const prefix = root ? `${root}/` : "";
  zip.file(`${prefix}info.json`, JSON.stringify(metadata));
  zip.file(`${prefix}chapters/001 - Opening.md`, "# Opening\n\nFull chapter body.");
  return zip;
}
const bytes = (zip: JSZip) => zip.generateAsync({ type: "nodebuffer", compression: "STORE", platform: "UNIX" });

function central(buffer: Buffer, filename: string): number {
  for (let at = 0; at < buffer.length - 46; at++) {
    if (buffer.readUInt32LE(at) === 0x02014b50 &&
        buffer.toString("utf8", at + 46, at + 46 + buffer.readUInt16LE(at + 28)) === filename) return at;
  }
  throw new Error("Fixture entry missing");
}
function local(buffer: Buffer, at: number) { return buffer.readUInt32LE(at + 42); }

describe("parseNovelZip layout and source fidelity", () => {
  it("reports missing source numbers and metadata count mismatches without inventing chapters", async () => {
    const zip = novel(new JSZip(), "Novel", { title: "Example", total_chapters: 3 });
    zip.file("Novel/chapters/003 - Later.md", "Later chapter.");
    const result = await parseNovelZip(await bytes(zip));
    expect(result.novels[0]!.chapters.map(c => c.sourceNumber)).toEqual([1, 3]);
    expect(result.novels[0]!.warnings).toContain("Declared chapter count differs from archive chapter count");
    expect(result.novels[0]!.warnings).toContain("Source chapter numbers are not consecutive");
  });
  it("preserves one complete chapter per file, internal headings, prologue zero, cover and attribution", async () => {
    const zip = novel(new JSZip());
    const body = "# Opening\r\n\r\nFirst paragraph.\r\n\r\n## Internal scene\r\n\r\nLast paragraph.<script>unsafe()</script>";
    zip.file("Novel/chapters/001 - Opening.md", body);
    zip.file("Novel/chapters/000 - Prologue.md", "# Prologue\n\nBefore the story.");
    zip.file("Novel/chapters/002 - Later.md", "Final full file.");
    zip.file("Novel/cover.png", Buffer.from(PNG, "base64"));
    const buffer = await bytes(zip);
    const result = await parseNovelZip(buffer);
    expect(result.archiveHash).toBe(createHash("sha256").update(buffer).digest("hex"));
    expect(result.novels).toHaveLength(1);
    const parsed = result.novels[0]!;
    expect(parsed.root).toBe("Novel");
    expect(parsed.metadata).toEqual({ title: "Example", source: "https://source.test/story" });
    expect(parsed.chapters.map((chapter) => chapter.sourceNumber)).toEqual([0, 1, 2]);
    expect(parsed.chapters[1]!.rawText).toBe(body);
    expect(parsed.chapters[1]!.filename).toBe("001 - Opening.md");
    expect(parsed.chapters[1]!.htmlBody).toContain("Internal scene");
    expect(parsed.chapters[1]!.htmlBody).toContain("Last paragraph");
    expect(parsed.chapters[1]!.htmlBody).not.toContain("<script>");
    expect(parsed.cover).toEqual({ mimeType: "image/png", dataBase64: PNG });
  });

  it("detects all roots beneath wrappers, including nested novels and alternate metadata keys", async () => {
    const zip = novel(new JSZip(), "wrapper/One", { novel_title: "First", author: "An Author", chapters_total: 1 });
    novel(zip, "wrapper/One/Other", { title: "Nested", title_site: "Original" });
    novel(zip, "wrapper/Two", { name: "Second", custom: { tags: ["retained"] } });
    const result = await parseNovelZip(await bytes(zip));
    expect(result.novels.map((item) => item.root)).toEqual(["wrapper/One", "wrapper/One/Other", "wrapper/Two"]);
    expect(result.novels.map((item) => item.title)).toEqual(["First", "Nested", "Second"]);
    expect(result.novels.every((item) => item.chapters.length === 1)).toBe(true);
    expect(result.novels[2]!.metadata.custom).toEqual({ tags: ["retained"] });
  });

  it("supports direct-root archives and harmless metadata with explicit warnings", async () => {
    const zip = novel(new JSZip(), "");
    zip.file("_progress.json", "{}");
    zip.file(".DS_Store", "metadata");
    zip.file("__MACOSX/._source", "resource fork");
    const result = await parseNovelZip(await bytes(zip));
    expect(result.novels[0]!.root).toBe("");
    expect(result.warnings).toHaveLength(3);
  });

  it("keeps a UTF-8 BOM and Unicode body as source text", async () => {
    const zip = novel(new JSZip(), "Unicode");
    const body = "\uFEFF# Chapter\n\nこんにちは — cerita lengkap.";
    zip.file("Unicode/chapters/001 - Opening.md", Buffer.from(body));
    expect((await parseNovelZip(await bytes(zip))).novels[0]!.chapters[0]!.rawText).toBe(body);
  });

  it("labels a directory-derived title as a fallback without inventing metadata", async () => {
    const parsed = (await parseNovelZip(await bytes(novel(new JSZip(), "Source folder", { source: "retained" })))).novels[0]!;
    expect(parsed.title).toBe("Source folder");
    expect(parsed.metadata).toEqual({ source: "retained" });
    expect(parsed.warnings).toContain("Novel title derived from source directory name");
  });

  it("detects PNG bytes under a scraper's cover.jpg name and records the mismatch", async () => {
    const zip = novel(new JSZip()); zip.file("Novel/cover.jpg", Buffer.from(PNG, "base64"));
    const parsed = (await parseNovelZip(await bytes(zip))).novels[0]!;
    expect(parsed.cover).toEqual({ mimeType: "image/png", dataBase64: PNG });
    expect(parsed.warnings).toContain("Cover media type detected from bytes differs from filename extension");
  });
});

describe("parseNovelZip hostile original names and entry types", () => {
  it.each(["../outside.md", "/absolute.md", "C:/drive.md", "Novel\\chapters\\001.md", "Novel/../escape.md", "Novel/./dot.md", "Novel//empty.md", "Novel/trailing./info.json", "Novel/file:stream"])("rejects original unsafe path %s", async (name) => {
    const zip = novel(new JSZip());
    zip.file(name, "unsafe", { createFolders: false });
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it.each([["Novel", "novel"], ["Caf\u00e9", "Cafe\u0301"]])("rejects normalized/case collisions %s and %s", async (one, two) => {
    const zip = novel(new JSZip(), one);
    novel(zip, two);
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("rejects duplicate exact original names before JSZip can overwrite them", async () => {
    const zip = novel(new JSZip());
    zip.file("Novel/chapters/002 - Opening.md", "Second");
    const buffer = await bytes(zip);
    const at = central(buffer, "Novel/chapters/002 - Opening.md");
    Buffer.from("Novel/chapters/001 - Opening.md").copy(buffer, at + 46);
    Buffer.from("Novel/chapters/001 - Opening.md").copy(buffer, local(buffer, at) + 30);
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("rejects mismatched local names even when central names appear safe", async () => {
    const buffer = await bytes(novel(new JSZip()));
    const at = central(buffer, "Novel/chapters/001 - Opening.md");
    buffer[local(buffer, at) + 30] = "/".charCodeAt(0);
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
  });

  it("rejects a file used as a parent directory even with intervening sibling names", async () => {
    const zip = novel(new JSZip());
    for (const name of ["box", "box-other", "box/story.md"]) zip.file(name, "body", { createFolders: false });
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it.each(["Novel/nested.zip", "Novel/unexpected.exe", "unowned.txt"])("refuses unexpected or nested content %s", async (name) => {
    const zip = novel(new JSZip()); zip.file(name, "not an allowed novel file");
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses Unix symbolic links", async () => {
    const zip = novel(new JSZip());
    zip.file("Novel/chapters/002 - Link.md", "../../target", { unixPermissions: 0o120777 });
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses encrypted central entries before inflation", async () => {
    const buffer = await bytes(novel(new JSZip()));
    const at = central(buffer, "Novel/info.json");
    buffer.writeUInt16LE(buffer.readUInt16LE(at + 8) | 1, at + 8);
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });
});

describe("parseNovelZip corruption and resource boundaries", () => {
  it("refuses CRC corruption", async () => {
    const buffer = await bytes(novel(new JSZip()));
    const at = central(buffer, "Novel/chapters/001 - Opening.md");
    const start = local(buffer, at);
    buffer[start + 30 + buffer.readUInt16LE(start + 26) + buffer.readUInt16LE(start + 28)]! ^= 1;
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
  });

  it("stops actual inflation when declared size understates output", async () => {
    const buffer = await bytes(novel(new JSZip()));
    const at = central(buffer, "Novel/chapters/001 - Opening.md");
    buffer.writeUInt32LE(1, at + 24); buffer.writeUInt32LE(1, local(buffer, at) + 22);
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses a compression ratio exceeding 200:1", async () => {
    const zip = novel(new JSZip());
    zip.file("Novel/chapters/001 - Opening.md", "a".repeat(100_000));
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it.each(["Novel/chapters/001 - Opening.md", "Novel/info.json"])("refuses over-1MiB chapter/metadata %s", async (name) => {
    const zip = novel(new JSZip()); zip.file(name, "x".repeat(1024 * 1024 + 1));
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses declared expansion above 200MiB before inflation", async () => {
    const buffer = await bytes(novel(new JSZip()));
    const at = central(buffer, "Novel/info.json");
    buffer.writeUInt32LE(201 * 1024 * 1024, at + 24);
    buffer.writeUInt32LE(201 * 1024 * 1024, local(buffer, at) + 22);
    await expect(parseNovelZip(buffer)).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses more than 5000 chapter files instead of truncating", async () => {
    const zip = novel(new JSZip());
    for (let number = 2; number <= 5001; number++) zip.file(`Novel/chapters/${String(number).padStart(4, "0")} - More.md`, "Full body");
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses more than 10000 entries", async () => {
    const zip = novel(new JSZip());
    for (let number = 0; number < 10_000; number++) zip.file(`__MACOSX/item${number}`, "", { createFolders: false });
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it("refuses a compressed upload above 50MiB", async () => {
    await expect(parseNovelZip(Buffer.alloc(50 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "IMPORT_TOO_LARGE" });
  });

  it.each(["not a ZIP", "PK\x03\x04"])("maps malformed archives to a typed refusal", async (data) => {
    await expect(parseNovelZip(Buffer.from(data))).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
  });

  it("rejects duplicate source numbers rather than merging files", async () => {
    const zip = novel(new JSZip()); zip.file("Novel/chapters/001 - Duplicate.md", "Different full chapter");
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });

  it.each(["", "\u0000binary", "   \n"])("refuses empty or nontext chapters", async (body) => {
    const zip = novel(new JSZip()); zip.file("Novel/chapters/001 - Opening.md", body);
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_NO_TEXT" });
  });

  it("refuses invalid UTF-8 and malformed metadata", async () => {
    const zip = novel(new JSZip()); zip.file("Novel/chapters/001 - Opening.md", Buffer.from([0xff]));
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
    const malformed = novel(new JSZip()); malformed.file("Novel/info.json", "[]");
    await expect(parseNovelZip(await bytes(malformed))).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
  });

  it("refuses invalid and oversized covers without fetching URLs", async () => {
    const zip = novel(new JSZip()); zip.file("Novel/cover.jpg", "not an image");
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_CORRUPT" });
    zip.file("Novel/cover.jpg", Buffer.alloc(512 * 1024 + 1));
    await expect(parseNovelZip(await bytes(zip))).rejects.toMatchObject({ code: "IMPORT_ARCHIVE_UNSAFE" });
  });
});
