import { describe, expect, it } from "vitest";
import { diffOutlineContent } from "./outlineDiff";

describe("diffOutlineContent", () => {
  it("reports changed leaf paths with before/after", () => {
    const before = { beats: ["a", "b"], title: "Old" };
    const after = { beats: ["a", "c"], title: "Old" };
    const { changes, truncated } = diffOutlineContent(before, after);
    expect(truncated).toBe(false);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "beats[1]",
      kind: "changed",
      before: "b",
      after: "c",
    });
  });

  it("reports added and removed paths", () => {
    const before = { a: 1, gone: true };
    const after = { a: 1, fresh: "x" };
    const { changes } = diffOutlineContent(before, after);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.path === "gone")?.kind).toBe("removed");
    expect(changes.find((c) => c.path === "fresh")?.kind).toBe("added");
  });

  it("returns no changes for identical documents", () => {
    const doc = { beats: ["a"], nested: { x: 1 } };
    const { changes } = diffOutlineContent(doc, JSON.parse(JSON.stringify(doc)));
    expect(changes).toHaveLength(0);
  });

  it("truncates beyond the limit in deterministic order", () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      before[`k${i}`] = 0;
      after[`k${i}`] = 1;
    }
    const { changes, truncated } = diffOutlineContent(before, after, 20);
    expect(changes).toHaveLength(20);
    expect(truncated).toBe(true);
    const paths = changes.map((c) => c.path);
    expect([...paths].sort()).toEqual(paths);
  });

  it("handles nested object paths with dot notation", () => {
    const before = { scenes: [{ summary: "old" }] };
    const after = { scenes: [{ summary: "new" }] };
    const { changes } = diffOutlineContent(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.path).toBe("scenes[0].summary");
  });
});
