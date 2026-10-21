import { describe, expect, it } from "vitest";
import { selectDraft, draftProse } from "./draftSelect";

function step(stepKey: string, status: string, prose?: string) {
  return {
    stepKey,
    status,
    output: prose !== undefined ? { json: { prose } } : undefined,
  };
}

describe("selectDraft", () => {
  it("selects write when it is the only succeeded producer", () => {
    const sel = selectDraft([step("write", "SUCCEEDED", "hello")], {});
    expect(sel.winner).toBe("write");
    expect(sel.ordinal).toBe(1);
    expect(sel.total).toBe(1);
    expect(sel.pending).toBe(false);
    expect(draftProse(sel.draft)).toBe("hello");
  });

  it("prefers rewrite_2 over rewrite_1 over write (latest-available)", () => {
    const sel = selectDraft(
      [
        step("write", "SUCCEEDED", "v1"),
        step("rewrite_1", "SUCCEEDED", "v2"),
        step("rewrite_2", "SUCCEEDED", "v3"),
      ],
      {},
    );
    expect(sel.winner).toBe("rewrite_2");
    expect(sel.ordinal).toBe(3);
    expect(sel.total).toBe(3);
    expect(draftProse(sel.draft)).toBe("v3");
  });

  it("falls back to rewrite_1 when rewrite_2 did not succeed", () => {
    const sel = selectDraft(
      [step("write", "SUCCEEDED", "v1"), step("rewrite_1", "SUCCEEDED", "v2")],
      {},
    );
    expect(sel.winner).toBe("rewrite_1");
    expect(sel.ordinal).toBe(2);
    expect(sel.total).toBe(2);
  });

  it("is pending (never fabricates) when no producer succeeded", () => {
    const sel = selectDraft([step("write", "RUNNING")], {});
    expect(sel.winner).toBeNull();
    expect(sel.draft).toBeNull();
    expect(sel.pending).toBe(true);
    expect(draftProse(sel.draft)).toBeNull();
  });

  it("falls back to the snapshot outcomes map when no step rows exist", () => {
    const sel = selectDraft([], {
      write: { json: { prose: "from-snapshot" } },
    });
    expect(sel.winner).toBe("write");
    expect(draftProse(sel.draft)).toBe("from-snapshot");
  });

  it("draftProse returns null for non-prose drafts", () => {
    expect(draftProse({ notProse: 1 })).toBeNull();
    expect(draftProse(null)).toBeNull();
  });
  it("does not expose an explicitly blocked artifact as chapter prose", () => {
    expect(draftProse({ prose: "Diagnostic report", status: "blocked" })).toBeNull();
    expect(draftProse({ prose: "Diagnostic report", blocker: "Missing outline" })).toBeNull();
    expect(draftProse({ prose: "Real story", blocker: null })).toBe("Real story");
  });
});
