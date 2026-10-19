import { createHash } from "node:crypto";

export const MAX_COVER_BYTES = 512 * 1024;
export const MAX_COVER_BASE64_LENGTH = 4 * Math.ceil(MAX_COVER_BYTES / 3);

export interface NovelCover {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
  sha256: string;
  sourceName?: string;
}

export class InvalidNovelCoverError extends Error {
  readonly code = "INVALID_NOVEL_COVER";
}

/** Cover is display configuration, excluded from story snapshots. */
export function validateNovelCover(input: {
  mimeType: string;
  dataBase64: string;
  sourceName?: string;
}): NovelCover {
  const { mimeType, dataBase64, sourceName } = input;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(mimeType) ||
    !dataBase64.length || dataBase64.length > MAX_COVER_BASE64_LENGTH ||
    dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64) ||
    (sourceName !== undefined && (!sourceName.length || sourceName.length > 200 || [...sourceName].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === "/" || c === "\\")))
  ) throw new InvalidNovelCoverError("cover must be a base64 JPEG, PNG or WebP of at most 512 KiB");
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length > MAX_COVER_BYTES || bytes.toString("base64") !== dataBase64) {
    throw new InvalidNovelCoverError("invalid or oversized cover encoding");
  }
  const jpeg = bytes.length >= 16 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) &&
    bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
  const png = bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR" && bytes.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  const webp = bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.readUInt32LE(4) === bytes.length - 8 && bytes.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16));
  if (!(mimeType === "image/jpeg" ? jpeg : mimeType === "image/png" ? png : webp)) {
    throw new InvalidNovelCoverError("cover signature does not match its media type");
  }
  return { mimeType: mimeType as NovelCover["mimeType"], dataBase64,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(sourceName !== undefined ? { sourceName } : {}) };
}

export function novelCoverUrl(workspaceId: string, novelId: string, sha256: string): string {
  return `/api/workspaces/${workspaceId}/novels/${novelId}/cover?v=${sha256}`;
}
