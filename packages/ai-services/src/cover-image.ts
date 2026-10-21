import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_GENERATED_IMAGE_BASE64_LENGTH, MAX_GENERATED_IMAGE_BYTES } from "@novelforge/ai-core";
import { InvalidNovelCoverError, MAX_COVER_BYTES, validateNovelCover, type NovelCover } from "./novel-cover.ts";

/** Generated output is untrusted; manual uploads retain their existing strict boundary. */
export async function normalizeCoverImage(dataBase64: string): Promise<{
  cover: NovelCover; originalSha256: string; originalBytes: number;
}> {
  const invalid = () => new InvalidNovelCoverError("Generated image could not be safely prepared as a cover");
  if (!dataBase64.length || dataBase64.length > MAX_GENERATED_IMAGE_BASE64_LENGTH ||
    dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) throw invalid();
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length > MAX_GENERATED_IMAGE_BYTES || bytes.toString("base64") !== dataBase64) throw invalid();
  try {
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages ?? 1) !== 1 || metadata.loop !== undefined) throw invalid();
    // libvips may expose only the first APNG frame; inspect actual PNG chunks.
    if (metadata.format === "png") {
      for (let at = 8; at + 12 <= bytes.length;) {
        if (bytes.toString("ascii", at + 4, at + 8) === "acTL") throw invalid();
        at += bytes.readUInt32BE(at) + 12;
      }
    }
    const output = await image.rotate().resize({ width: 1024, height: 1536, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#272822" }).jpeg({ quality: 80 }).timeout({ seconds: 10 }).toBuffer();
    if (output.length > MAX_COVER_BYTES) throw invalid();
    return {
      cover: validateNovelCover({ mimeType: "image/jpeg", dataBase64: output.toString("base64") }),
      originalSha256: createHash("sha256").update(bytes).digest("hex"), originalBytes: bytes.length,
    };
  } catch { throw invalid(); }
}
