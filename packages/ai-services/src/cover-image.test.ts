import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { normalizeCoverImage } from "./cover-image.ts";
import { MAX_COVER_BYTES, validateNovelCover } from "./novel-cover.ts";

describe("generated cover normalization", () => {
  it("decodes real pixels, preserves provenance, strips metadata and meets the existing cover boundary", async () => {
    const source = await sharp({ create: { width: 1500, height: 2000, channels: 3, background: "#fc9867" } })
      .png().withMetadata({ orientation: 1 }).toBuffer();
    const result = await normalizeCoverImage(source.toString("base64"));
    const bytes = Buffer.from(result.cover.dataBase64, "base64");
    const metadata = await sharp(bytes).metadata();
    expect(result.originalSha256).toBe(createHash("sha256").update(source).digest("hex"));
    expect(result.originalBytes).toBe(source.length);
    expect(metadata).toMatchObject({ format: "jpeg", width: 1024, height: 1365 });
    expect(metadata.exif).toBeUndefined();
    expect(bytes.length).toBeLessThanOrEqual(MAX_COVER_BYTES);
    expect(validateNovelCover(result.cover)).toEqual(result.cover);
    expect(result.cover.sha256).not.toBe(result.originalSha256);
  });

  it("does not enlarge small images", async () => {
    const source = await sharp({ create: { width: 20, height: 30, channels: 4, background: "transparent" } }).webp().toBuffer();
    const result = await normalizeCoverImage(source.toString("base64"));
    expect(await sharp(Buffer.from(result.cover.dataBase64, "base64")).metadata()).toMatchObject({ width: 20, height: 30 });
  });

  it.each(["", "YR==", "not base64", Buffer.from("not an image").toString("base64"), "A".repeat(16 * 1024 * 1024 + 4)])("refuses invalid or oversized input safely", async encoded => {
    await expect(normalizeCoverImage(encoded)).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER", message: "Generated image could not be safely prepared as a cover" });
  });

  it("refuses a valid image over the decoded pixel bound", async () => {
    const source = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#272822" } }).png().toBuffer();
    await expect(normalizeCoverImage(source.toString("base64"))).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER" });
  });

  it("refuses non-cover formats even when the decoder supports them", async () => {
    const source = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } }).gif().toBuffer();
    await expect(normalizeCoverImage(source.toString("base64"))).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER" });
  });

  it("rejects an actual animated WebP instead of silently taking its first frame", async () => {
    const red = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 30, channels: 3, background: "blue" } }).png().toBuffer();
    const source = await sharp([red, blue], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect(await sharp(source).metadata()).toMatchObject({ pages: 2 });
    await expect(normalizeCoverImage(source.toString("base64"))).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER" });
  });

  it("rejects an APNG control chunk even when the decoder exposes only a PNG first frame", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8, 0); chunk.write("acTL", 4); chunk.writeUInt32BE(1, 8);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 16)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
    const source = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
    expect((await sharp(source).metadata()).format).toBe("png");
    await expect(normalizeCoverImage(source.toString("base64"))).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER" });
  });

  it("fails closed when image processing aborts on its timeout without exposing decoder details", async () => {
    const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const encode = vi.spyOn(sharp.prototype, "toBuffer").mockRejectedValueOnce(new Error("timeout while processing private image"));
    try { await expect(normalizeCoverImage(source.toString("base64"))).rejects.toMatchObject({ code: "INVALID_NOVEL_COVER", message: "Generated image could not be safely prepared as a cover" }); }
    finally { encode.mockRestore(); }
  });
});
