import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import JSZip from "jszip";
import { validateNovelCover } from "@novelforge/ai-services";
import { ImportError, mdBodyToHtml, parseZipCentralDirectory } from "./import-normalize.ts";

export interface NovelZipNovel {
  root: string;
  title: string;
  metadata: Record<string, unknown>;
  chapters: { sourceNumber: number; filename: string; title: string; rawText: string; htmlBody: string }[];
  cover?: { mimeType: string; dataBase64: string };
  warnings: string[];
}

export interface NovelZipArchive {
  archiveHash: string;
  novels: NovelZipNovel[];
  warnings: string[];
}

const MIB = 1024 * 1024;
const LIMITS = { compressed: 50 * MIB, expanded: 200 * MIB, entries: 10_000, chapters: 5000, chapter: MIB, ratio: 200 };
// Author-approved companion bound: metadata JSON also has a 1 MiB ceiling.
const METADATA_MAX = MIB;
interface Entry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  directory: boolean;
}
const unsafe = () => new ImportError(400, "IMPORT_ARCHIVE_UNSAFE", "Novel ZIP contains an unsafe path, entry, or size");
const corrupt = () => new ImportError(400, "IMPORT_CORRUPT", "Novel ZIP is malformed or has invalid contents");
const utf8 = (data: Buffer) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);

function pathKey(name: string): string {
  const normalized = name.normalize("NFKC");
  for (const value of [name, normalized]) {
    if (!value || value.startsWith("/") || value.includes("\\") || value.includes(":") ||
        [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw unsafe();
    const parts = value.replace(/\/$/, "").split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || /[ .]$/.test(part))) throw unsafe();
  }
  return normalized.replace(/\/$/, "").toLowerCase();
}

/** Reuse the import directory parser, then inspect original bytes JSZip sanitizes. */
function inspect(buffer: Buffer): Entry[] {
  if (buffer.length > LIMITS.compressed) throw new ImportError(400, "IMPORT_TOO_LARGE", "Novel ZIP exceeds 50 MiB");
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65558); at--) {
    if (buffer.readUInt32LE(at) === 0x06054b50 && at + 22 + buffer.readUInt16LE(at + 20) === buffer.length) { end = at; break; }
  }
  if (end < 0) throw corrupt();
  const count = buffer.readUInt16LE(end + 10);
  const offset = buffer.readUInt32LE(end + 16);
  const size = buffer.readUInt32LE(end + 12);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) ||
      buffer.readUInt16LE(end + 8) !== count || count === 0xffff || offset === 0xffffffff || size === 0xffffffff || offset + size !== end) throw corrupt();
  if (count > LIMITS.entries) throw unsafe();
  const parsed = parseZipCentralDirectory(buffer);
  const keys = new Set<string>();
  const files = new Set<string>();
  const ranges: Array<[number, number]> = [];
  const entries: Entry[] = [];
  let at = offset;
  let expanded = 0;
  for (const entry of parsed) {
    if (at + 46 > end) throw corrupt();
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw corrupt();
    const rawName = buffer.subarray(at + 46, at + 46 + nameLength);
    const name = utf8(rawName);
    if (name !== entry.name) throw corrupt();
    const key = pathKey(name);
    if (keys.has(key)) throw unsafe();
    keys.add(key);
    const directory = name.endsWith("/");
    if (!directory) files.add(key);
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const mode = (buffer.readUInt32LE(at + 38) >>> 16) & 0xf000;
    if ((flags & ~0x080e) !== 0 || ![0, 8].includes(method) || buffer.readUInt16LE(at + 34) !== 0 ||
        ![0, 0x4000, 0x8000].includes(mode) || (mode === 0x4000 && !directory) || (mode === 0x8000 && directory)) throw unsafe();
    const crc = buffer.readUInt32LE(at + 16);
    const local = buffer.readUInt32LE(at + 42);
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 ||
        buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) throw corrupt();
    const localNameLength = buffer.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    if (start + entry.compressedSize > offset || !buffer.subarray(local + 30, local + 30 + localNameLength).equals(rawName)) throw corrupt();
    if (!(flags & 8) && (buffer.readUInt32LE(local + 14) !== crc ||
        buffer.readUInt32LE(local + 18) !== entry.compressedSize || buffer.readUInt32LE(local + 22) !== entry.uncompressedSize)) throw corrupt();
    if (directory && (entry.uncompressedSize !== 0 || entry.compressedSize !== 0 || crc !== 0)) throw unsafe();
    expanded += entry.uncompressedSize;
    if (expanded > LIMITS.expanded || entry.uncompressedSize > Math.max(1, entry.compressedSize) * LIMITS.ratio) throw unsafe();
    ranges.push([local, start + entry.compressedSize]);
    entries.push({ ...entry, name, directory, crc });
    at = next;
  }
  if (at !== end || entries.length !== count) throw corrupt();
  ranges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < ranges.length; index++) if (ranges[index]![0] < ranges[index - 1]![1]) throw corrupt();
  const ordered = [...keys].sort();
  for (const file of files) {
    const prefix = `${file}/`;
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ordered[middle]! < prefix) low = middle + 1;
      else high = middle;
    }
    if (ordered[low]?.startsWith(prefix)) throw unsafe();
  }
  return entries;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** Stop inflation on actual limits rather than allocating an attacker-sized Buffer. */
function inflate(file: JSZip.JSZipObject, entry: Entry, budget: { bytes: number }, cap: number, retain: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = file.nodeStream("nodebuffer") as Readable;
    const chunks: Buffer[] = [];
    let size = 0;
    let crc = 0xffffffff;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      budget.bytes += chunk.length;
      if (size > cap || size > entry.uncompressedSize || budget.bytes > LIMITS.expanded || size > Math.max(1, entry.compressedSize) * LIMITS.ratio) {
        stream.pause(); stream.destroy(); reject(unsafe()); return;
      }
      for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
      if (retain) chunks.push(chunk);
    });
    stream.once("error", () => reject(corrupt()));
    stream.once("end", () => {
      if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) reject(corrupt());
      else resolve(retain ? Buffer.concat(chunks, size) : Buffer.alloc(0));
    });
  });
}

function ignored(name: string): boolean {
  const parts = name.toLowerCase().split("/");
  return parts.includes("__macosx") || parts.at(-1) === ".ds_store" || parts.at(-1) === "_progress.json" || parts.at(-1)!.startsWith("._");
}

export async function parseNovelZip(buffer: Buffer): Promise<NovelZipArchive> {
  try {
    const entries = inspect(buffer);
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
    const warnings: string[] = [];
    const metadataEntries = entries.filter((entry) => !entry.directory && !ignored(entry.name) && /(^|\/)info\.json$/i.test(entry.name));
    if (!metadataEntries.length) throw corrupt();
    const novels: NovelZipNovel[] = [];
    const roots = metadataEntries.map((entry) => entry.name.slice(0, -"info.json".length).replace(/\/$/, ""));
    const chapterNumbers = new Map(roots.map((root) => [root, new Set<number>()]));
    const covers = new Set<string>();
    // Validate the entire layout and declared per-file limits before inflation.
    const plans = entries.filter((entry) => !entry.directory).map((entry) => {
      const isIgnored = ignored(entry.name);
      if (!isIgnored && /\.(zip|rar|7z|tar|gz)$/i.test(entry.name)) throw unsafe();
      const root = roots.filter((value) => !value || entry.name.startsWith(`${value}/`)).sort((a, b) => b.length - a.length)[0];
      const relative = root === undefined ? "" : entry.name.slice(root ? root.length + 1 : 0);
      if (!isIgnored && (root === undefined || !/^(info\.json|cover\.(jpg|jpeg|png|webp)|chapters\/[^/]+\.md)$/i.test(relative))) throw unsafe();
      const isChapter = /^chapters\//i.test(relative) && !isIgnored;
      if (isChapter) {
        const match = /^(\d{3,})(?:[ ._-]+(.+?))?\.md$/i.exec(relative.slice("chapters/".length));
        if (!match) throw corrupt();
        const number = Number(match[1]);
        const numbers = chapterNumbers.get(root!)!;
        if (!Number.isSafeInteger(number) || numbers.has(number) || numbers.size >= LIMITS.chapters) throw unsafe();
        numbers.add(number);
      }
      if (!isIgnored && /^cover\./i.test(relative)) {
        if (covers.has(root!)) throw unsafe();
        covers.add(root!);
      }
      const cap = isChapter ? LIMITS.chapter : /(^|\/)info\.json$/i.test(entry.name) ? METADATA_MAX
        : !isIgnored && /^cover\./i.test(relative) ? 512 * 1024 : LIMITS.expanded;
      if (entry.uncompressedSize > cap) throw unsafe();
      return { entry, isIgnored, cap };
    });
    if ([...chapterNumbers.values()].some((numbers) => !numbers.size)) throw new ImportError(400, "IMPORT_NO_TEXT", "Novel has no chapter files");
    const budget = { bytes: 0 };
    const contents = new Map<string, Buffer>();
    for (const entry of entries) {
      const file = zip.files[entry.name];
      if (!file || file.dir !== entry.directory || (!entry.directory && file.unsafeOriginalName !== entry.name)) throw corrupt();
    }
    for (const { entry, isIgnored, cap } of plans) {
      const file = zip.files[entry.name]!;
      const data = await inflate(file, entry, budget, cap, !isIgnored);
      if (isIgnored) warnings.push(`Ignored archive metadata: ${entry.name}`);
      else contents.set(entry.name, data);
    }
    for (let index = 0; index < roots.length; index++) {
      const root = roots[index]!;
      const metadata = JSON.parse(utf8(contents.get(metadataEntries[index]!.name)!).replace(/^\uFEFF/, "")) as unknown;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw corrupt();
      const record = metadata as Record<string, unknown>;
      const metadataTitle = [record.title, record.name, record.novel_title, record.original_title]
        .find((value): value is string => typeof value === "string" && !!value.trim());
      const title = metadataTitle?.trim() || root.split("/").at(-1);
      if (!title || title.length > 200) throw corrupt();
      const novel: NovelZipNovel = { root, title, metadata: record, chapters: [], warnings: [] };
      if (!metadataTitle) novel.warnings.push("Novel title derived from source directory name");
      const numbers = new Set<number>();
      for (const [name, data] of contents) {
        if (!name.startsWith(root ? `${root}/` : "")) continue;
        const relative = name.slice(root ? root.length + 1 : 0);
        if (/^cover\./i.test(relative)) {
          if (novel.cover) throw unsafe();
          const extension = relative.split(".").at(-1)!.toLowerCase();
          // Scraper filenames can say .jpg while containing PNG. Bytes are
          // authoritative; the shared validator still rejects invalid images.
          const mimeType = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
            : data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "image/jpeg"
              : data.toString("ascii", 0, 4) === "RIFF" ? "image/webp" : "";
          const cover = validateNovelCover({ mimeType, dataBase64: data.toString("base64") });
          novel.cover = { mimeType: cover.mimeType, dataBase64: cover.dataBase64 };
          const expected = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
          if (cover.mimeType !== expected) novel.warnings.push("Cover media type detected from bytes differs from filename extension");
        } else if (/^chapters\//i.test(relative)) {
          const filename = relative.slice("chapters/".length);
          const match = /^(\d{3,})(?:[ ._-]+(.+?))?\.md$/i.exec(filename);
          if (!match) throw corrupt();
          const sourceNumber = Number(match[1]);
          if (!Number.isSafeInteger(sourceNumber) || numbers.has(sourceNumber)) throw unsafe();
          numbers.add(sourceNumber);
          const rawText = utf8(data);
          if (rawText.includes("\0") || !rawText.trim()) throw new ImportError(400, "IMPORT_NO_TEXT", "A chapter is empty or not textual");
          const chapterTitle = match[2]?.trim() || `Chapter ${sourceNumber}`;
          if (chapterTitle.length > 200) throw corrupt();
          novel.chapters.push({ sourceNumber, filename, title: chapterTitle, rawText, htmlBody: mdBodyToHtml(rawText.replace(/\r\n/g, "\n")) });
          if (novel.chapters.length > LIMITS.chapters) throw unsafe();
        }
      }
      if (!novel.chapters.length) throw new ImportError(400, "IMPORT_NO_TEXT", "Novel has no chapter files");
      novel.chapters.sort((a, b) => a.sourceNumber - b.sourceNumber);
      const declared = record.total_chapters ?? record.chapters_total;
      if (typeof declared === "number" && declared !== novel.chapters.length) novel.warnings.push("Declared chapter count differs from archive chapter count");
      if (novel.chapters.some((c, i) => i > 0 && c.sourceNumber !== novel.chapters[i - 1]!.sourceNumber + 1)) novel.warnings.push("Source chapter numbers are not consecutive");
      novels.push(novel);
    }
    novels.sort((a, b) => a.root.localeCompare(b.root));
    return { archiveHash: createHash("sha256").update(buffer).digest("hex"), novels, warnings };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw corrupt();
  }
}
