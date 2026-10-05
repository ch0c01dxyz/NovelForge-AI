import { describe, expect, it } from "vitest";
import { diffLines } from "./lineDiff";

describe("diffLines", () => {
  it("marks identical lines as same", () => {
    const out = diffLines("a\nb", "a\nb");
    expect(out.every((l) => l.op === "same")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("marks added and deleted lines", () => {
    const out = diffLines("a\nb\nc", "a\nx\nc");
    expect(out).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "x" },
      { op: "same", text: "c" },
    ]);
  });

  it("handles trailing additions", () => {
    const out = diffLines("a", "a\nb");
    expect(out).toEqual([
      { op: "same", text: "a" },
      { op: "add", text: "b" },
    ]);
  });

  it("handles empty before (whole draft is new)", () => {
    const out = diffLines("", "hello");
    // "" splits to [""], so one del of the empty line + one add.
    expect(out.filter((l) => l.op === "add").map((l) => l.text)).toEqual(["hello"]);
  });
});
