/**
 * Spoiler control tests (Phase 5).
 *
 * This is a security boundary, so the tests are written from the attacker's
 * side: what input makes an unpublished chapter reachable? The deny-by-
 * default cases matter more than the happy path — a reader-mode query that
 * leaks chapter 400 is the failure this module exists to prevent, and it
 * would not be caught by testing only well-formed requests.
 */
import { describe, expect, it } from "vitest";
import { canView, visibleTo, canReadDrafts, parseViewMode } from "./spoiler.ts";

describe("canView", () => {
  const at = (chapter: number | null) => ({ availableFromChapter: chapter });

  it("lets an author and an editor see everything", () => {
    // An editor checking chapter 3 for foreshadowing needs the chapter 400
    // notes; hiding them would make continuity work impossible.
    for (const mode of ["AUTHOR", "EDITOR"] as const) {
      expect(canView(at(400), { mode })).toBe(true);
      expect(canView(at(null), { mode })).toBe(true);
    }
  });

  it("withholds future information from a reader", () => {
    expect(canView(at(400), { mode: "READER", readerChapter: 3 })).toBe(false);
  });

  it("allows an item at or before the reader's position", () => {
    expect(canView(at(3), { mode: "READER", readerChapter: 3 })).toBe(true);
    expect(canView(at(1), { mode: "READER", readerChapter: 3 })).toBe(true);
    expect(canView(at(0), { mode: "READER", readerChapter: 0 })).toBe(true);
  });

  it("withholds anything with no boundary from a reader", () => {
    // An unclassified item is not assumed safe. This is the default that
    // makes the whole module deny-by-default.
    expect(canView(at(null), { mode: "READER", readerChapter: 9999 })).toBe(false);
  });

  it("treats a reader with no recorded position as being at the start", () => {
    // Defaulting the other way would expose the entire novel on a missing
    // field, which is the shape of a real bug.
    expect(canView(at(0), { mode: "READER" })).toBe(true);
    expect(canView(at(1), { mode: "READER" })).toBe(false);
    expect(canView(at(400), { mode: "READER" })).toBe(false);
  });

  it("refuses a nonsensical reader position rather than coercing it", () => {
    for (const at_ of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(canView(at(0), { mode: "READER", readerChapter: at_ })).toBe(false);
    }
  });
});

describe("visibleTo", () => {
  it("filters a mixed list down to what the reader has reached", () => {
    const items = [
      { id: "a", availableFromChapter: 1 },
      { id: "b", availableFromChapter: 5 },
      { id: "c", availableFromChapter: null },
      { id: "d", availableFromChapter: 3 },
    ];
    expect(visibleTo(items, { mode: "READER", readerChapter: 3 }).map((i) => i.id)).toEqual([
      "a",
      "d",
    ]);
    expect(visibleTo(items, { mode: "AUTHOR" }).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves the order it was given", () => {
    // Ranking happened upstream; filtering must not reshuffle it.
    const items = [
      { id: "z", availableFromChapter: 0 },
      { id: "y", availableFromChapter: 0 },
      { id: "x", availableFromChapter: 0 },
    ];
    expect(visibleTo(items, { mode: "READER", readerChapter: 0 }).map((i) => i.id)).toEqual([
      "z",
      "y",
      "x",
    ]);
  });

  it("does not mutate the input", () => {
    const items = [{ id: "a", availableFromChapter: 1 }];
    visibleTo(items, { mode: "READER", readerChapter: 0 });
    expect(items).toHaveLength(1);
  });
});

describe("canReadDrafts", () => {
  it("limits unpublished prose to authors and editors", () => {
    expect(canReadDrafts("AUTHOR")).toBe(true);
    expect(canReadDrafts("EDITOR")).toBe(true);
    expect(canReadDrafts("READER")).toBe(false);
  });
});

describe("parseViewMode", () => {
  it("accepts the three known modes", () => {
    expect(parseViewMode("AUTHOR")).toBe("AUTHOR");
    expect(parseViewMode("EDITOR")).toBe("EDITOR");
    expect(parseViewMode("READER")).toBe("READER");
  });

  it("falls back to the most restrictive mode for anything else", () => {
    // A typo or a missing parameter must not widen access.
    for (const raw of [undefined, null, "", "author", "ADMIN", "SUPER_ADMIN", 42, {}, ["AUTHOR"]]) {
      expect(parseViewMode(raw)).toBe("READER");
    }
  });
});
