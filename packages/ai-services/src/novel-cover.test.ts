import { describe, expect, it } from "vitest";
import { InvalidNovelCoverError, MAX_COVER_BYTES, validateNovelCover } from "./novel-cover.ts";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=";

describe("novel cover validation", () => {
  it("hashes a PNG and preserves its exact canonical encoding", () => {
    const cover = validateNovelCover({ mimeType: "image/png", dataBase64: png, sourceName: "cover.png" });
    expect(cover).toMatchObject({ mimeType: "image/png", dataBase64: png, sourceName: "cover.png" });
    expect(cover.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    { mimeType: "image/svg+xml", dataBase64: png },
    { mimeType: "image/jpeg", dataBase64: png },
    { mimeType: "image/png", dataBase64: png + "\n" },
    { mimeType: "image/png", dataBase64: png.slice(0, -1) },
    { mimeType: "image/png", dataBase64: "AA=A" },
    { mimeType: "image/png", dataBase64: "AB==" },
    { mimeType: "image/png", dataBase64: png, sourceName: "../cover.png" },
    { mimeType: "image/png", dataBase64: png, sourceName: "bad\n.png" },
    { mimeType: "image/png", dataBase64: Buffer.alloc(MAX_COVER_BYTES + 1).toString("base64") },
    { mimeType: "image/png", dataBase64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") },
  ])("refuses malformed, mismatched or oversized content %#", input => {
    expect(() => validateNovelCover(input)).toThrow(InvalidNovelCoverError);
  });
  it("bounds a full-size base64 validation without recursive regexp overflow", () => {
    expect(() => validateNovelCover({ mimeType: "image/png", dataBase64: Buffer.alloc(MAX_COVER_BYTES).toString("base64") })).toThrow(InvalidNovelCoverError);
  });
});
