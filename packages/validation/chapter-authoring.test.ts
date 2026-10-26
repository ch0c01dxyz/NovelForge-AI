import { describe, expect, it } from "vitest";
import { resolveChapterAuthoring, chapterDraftLengthError, chapterReviewError } from "./chapter-authoring.ts";

describe("chapter authoring policy", () => {
  it("keeps an unconfigured novel unrestricted", () => {
    expect(resolveChapterAuthoring({ voice: "quiet" })).toEqual({});
    expect(chapterDraftLengthError("Pendek.", undefined)).toBeNull();
  });
  it("retains the higher explicit minimum and scoped profile", () => {
    expect(resolveChapterAuthoring({ chapterAuthoring: { minimumWordCount: 2500, storyProfile: "Preserve causality." } }, 3000))
      .toEqual({ minimumWordCount: 3000, storyProfile: "Preserve causality." });
    expect(resolveChapterAuthoring({ chapterAuthoring: { minimumWordCount: 2500 } }, 1000).minimumWordCount).toBe(2500);
  });
  it.each([0, -1, 1.5, "2500", null, 100001, Infinity])("rejects invalid minimum %s", value => {
    expect(() => resolveChapterAuthoring({}, value)).toThrow(/minimumWordCount/);
    expect(() => resolveChapterAuthoring({ chapterAuthoring: { minimumWordCount: value } })).toThrow(/minimumWordCount/);
  });
  it("rejects malformed profiles without dropping them silently", () => {
    expect(() => resolveChapterAuthoring({ chapterAuthoring: [] })).toThrow();
    expect(() => resolveChapterAuthoring({ chapterAuthoring: { storyProfile: 5 } })).toThrow();
    expect(() => resolveChapterAuthoring({ chapterAuthoring: { storyProfile: "a".repeat(12001) } })).toThrow();
  });
  it("counts Indonesian text and adjacent HTML paragraphs at the exact boundary", () => {
    const prose = '<p>“Aku pulang,” katanya.</p><p>Sofian mengangguk perlahan.</p>';
    expect(chapterDraftLengthError(prose, 6)).toBeNull();
    expect(chapterDraftLengthError(prose, 5)).toBeNull();
    expect(chapterDraftLengthError(prose, 7)).toContain("received 6");
    expect(chapterDraftLengthError("   ", 1)).toContain("received 0");
  });
  it("rejects contradictory and unresolved reviews without silently downgrading findings", () => {
    const findings = [{ severity: "major", remediation: "Withdraw this finding" }];
    expect(chapterReviewError({ findings, needsCorrection: false }, false)).toContain("INCONSISTENT");
    expect(chapterReviewError({ findings, needsCorrection: true }, false)).toBeNull();
    expect(chapterReviewError({ findings, needsCorrection: true }, true)).toContain("UNRESOLVED");
    expect(chapterReviewError({ findings: [], needsCorrection: true }, true)).toContain("UNRESOLVED");
    expect(chapterReviewError({ findings: [{ severity: "minor" }], needsCorrection: false }, true)).toBeNull();
    expect(chapterReviewError({ prose: "Draft" }, true)).toBeNull();
  });
});
