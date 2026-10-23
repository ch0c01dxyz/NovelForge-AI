import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TEXT_SAFEGUARDS, withTextSafeguards } from "./text-safeguards.ts";

describe("shared text safeguards", () => {
  it("preserves custom contracts and verbatim Indonesian instructions without mutating callers", () => {
    const messages = Object.freeze([
      Object.freeze({ role: "system" as const, content: 'Return {"cast":[],"purpose":""}; keep identifiers.' }),
      Object.freeze({ role: "user" as const, content: "Rumput Tuba adalah tanaman fiksi. Ikuti outline Anton dan Darma." }),
    ]);
    const result = withTextSafeguards(messages);
    expect(result.slice(1)).toEqual(messages);
    expect(result[1]).not.toBe(messages[0]);
    expect(result[0]!.role).toBe("system");
    expect(result[0]!.content).toContain(TEXT_SAFEGUARDS.version);
    expect(createHash("sha256").update(result[0]!.content).digest("hex")).toBe(TEXT_SAFEGUARDS.sha256);
  });
});
