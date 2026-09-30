/**
 * Character intelligence tests (Phase 8, slice 1).
 *
 * The property under test is not "does the helper run" but "can the
 * character's history be trusted". A state history that silently overlaps,
 * a knowledge boundary that reads absence as permission, and an arc whose
 * milestones are out of order all produce prose that contradicts itself
 * hundreds of chapters later, which is the failure this package exists to
 * make impossible.
 */

import { describe, expect, it } from "vitest";
import {
  ARC_STATUSES,
  KNOWLEDGE_SOURCES,
  KNOWLEDGE_STANCES,
  arcProgress,
  knowledgeAt,
  stateAt,
  validateArc,
  validateStateHistory,
  voiceAccess,
  type CharacterArc,
  type KnowledgeRecord,
  type StateRecord,
} from "./character.ts";

describe("vocabulary stays in sync with the schema", () => {
  // Declared locally (a domain package may not import the generated Prisma
  // client). If the schema gains a member and this list is not updated,
  // every exhaustive switch still typechecks while silently mishandling the
  // new value — so pin the sets here.
  it("pins the enum members", () => {
    expect([...KNOWLEDGE_STANCES]).toEqual([
      "KNOWN",
      "SUSPECTED",
      "BELIEVED_FALSE",
      "UNKNOWN",
    ]);
    expect([...KNOWLEDGE_SOURCES]).toEqual([
      "REMEMBERED",
      "DERIVED",
      "LEARNED_IN_WORLD",
      "EXPERIMENTED",
      "TAUGHT",
      "RESEARCHED",
    ]);
    expect([...ARC_STATUSES]).toEqual(["ACTIVE", "RESOLVED", "ABANDONED"]);
  });
});

function state(
  id: string,
  fromChapter: number,
  toChapter: number | null,
  characterId = "c1",
): StateRecord {
  return { id, characterId, fromChapter, toChapter };
}

describe("state history", () => {
  it("accepts disjoint windows", () => {
    const result = validateStateHistory([
      state("a", 1, 10),
      state("b", 10, 20),
      state("c", 20, null),
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a window that overlaps its predecessor", () => {
    const result = validateStateHistory([state("a", 1, 10), state("b", 9, 20)]);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.kind)).toEqual(["OVERLAP"]);
    expect(result.errors[0]?.recordId).toBe("b");
  });

  it("tracks the furthest bound, not the previous window", () => {
    // `[2,3)` is nested inside `[1,10)`; a check that only compared against
    // the immediately preceding window would then see `[5,6)` as clear.
    const result = validateStateHistory([
      state("a", 1, 10),
      state("b", 2, 3),
      state("c", 5, 6),
    ]);
    expect(result.errors.map((e) => e.recordId)).toEqual(["b", "c"]);
  });

  it("rejects anything after an open-ended window", () => {
    const result = validateStateHistory([state("a", 1, null), state("b", 40, 50)]);
    expect(result.errors.map((e) => e.recordId)).toEqual(["b"]);
  });

  it("rejects empty and inverted windows", () => {
    const result = validateStateHistory([state("a", 10, 10), state("b", 0, 5)]);
    expect(result.errors.map((e) => e.kind)).toEqual(["BAD_WINDOW", "BAD_WINDOW"]);
  });

  it("keeps characters independent", () => {
    const result = validateStateHistory([
      state("a", 1, 10, "c1"),
      state("b", 5, 15, "c2"),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("stateAt", () => {
  const records = [state("a", 1, 10), state("b", 10, null)];

  it("treats windows as half-open [from, to)", () => {
    expect(stateAt(records, "c1", 9)?.id).toBe("a");
    expect(stateAt(records, "c1", 10)?.id).toBe("b");
  });

  it("returns null past the end rather than the nearest earlier state", () => {
    // An author who never recorded chapter 40 is not claiming chapter 30
    // still holds — inventing that default is how stale state becomes canon.
    expect(stateAt([state("a", 1, 10)], "c1", 40)).toBeNull();
  });

  it("returns null for an unknown character", () => {
    expect(stateAt(records, "nobody", 5)).toBeNull();
  });
});

function knowledge(
  id: string,
  stance: KnowledgeRecord["stance"],
  fromChapter: number,
  toChapter: number | null,
): KnowledgeRecord {
  return {
    id,
    characterId: "c1",
    factId: "f1",
    stance,
    source: "LEARNED_IN_WORLD",
    fromChapter,
    toChapter,
  };
}

describe("knowledge boundary", () => {
  it("lets a later belief supersede an earlier one without erasing it", () => {
    const records = [
      knowledge("wrong", "BELIEVED_FALSE", 1, 30),
      knowledge("right", "KNOWN", 30, null),
    ];
    expect(knowledgeAt(records, "c1", "f1", 10)?.id).toBe("wrong");
    expect(knowledgeAt(records, "c1", "f1", 30)?.id).toBe("right");
  });

  it("reports no record when the fact is outside every window", () => {
    expect(knowledgeAt([knowledge("a", "KNOWN", 5, 10)], "c1", "f1", 40)).toBeNull();
  });

  it("treats suspicion as usable but not as truth", () => {
    const access = voiceAccess([knowledge("a", "SUSPECTED", 1, null)], "c1", "f1", 5);
    expect(access.accessible).toBe(true);
    expect(access.stance).toBe("SUSPECTED");
    expect(access.source).toBe("LEARNED_IN_WORLD");
  });

  it("lets a character act on a belief that is false", () => {
    const access = voiceAccess(
      [knowledge("a", "BELIEVED_FALSE", 1, null)],
      "c1",
      "f1",
      5,
    );
    expect(access.accessible).toBe(true);
  });

  it("treats an explicit UNKNOWN row as no access at all", () => {
    // The row records that the author checked. Reading it as permission is
    // the bug this distinction exists to prevent.
    const access = voiceAccess([knowledge("a", "UNKNOWN", 1, null)], "c1", "f1", 5);
    expect(access.accessible).toBe(false);
    expect(access.stance).toBe("UNKNOWN");
  });

  it("reports no access and no source when nothing is recorded", () => {
    expect(voiceAccess([], "c1", "f1", 5)).toEqual({
      accessible: false,
      stance: "UNKNOWN",
      source: null,
    });
  });
});

function arc(
  status: CharacterArc["status"],
  chapters: readonly number[],
): CharacterArc {
  return {
    id: "arc1",
    characterId: "c1",
    status,
    milestones: chapters.map((chapter, index) => ({
      id: `m${index}`,
      chapter,
      summary: `beat ${index}`,
    })),
  };
}

describe("arcs", () => {
  it("accepts strictly increasing milestones", () => {
    expect(validateArc(arc("ACTIVE", [1, 12, 40])).ok).toBe(true);
  });

  it("rejects two milestones on one chapter", () => {
    const result = validateArc(arc("ACTIVE", [10, 10]));
    expect(result.errors.map((e) => e.kind)).toEqual(["UNORDERED"]);
  });

  it("rejects a resolved arc with no milestone", () => {
    const result = validateArc(arc("RESOLVED", []));
    expect(result.errors.map((e) => e.kind)).toEqual([
      "RESOLVED_WITHOUT_MILESTONE",
    ]);
  });

  it("rejects a milestone that is not a chapter", () => {
    expect(validateArc(arc("ACTIVE", [0, 5])).errors.map((e) => e.kind)).toEqual([
      "BAD_CHAPTER",
    ]);
  });
});

describe("arcProgress", () => {
  const story = arc("ACTIVE", [5, 20, 90]);

  it("excludes milestones ahead of the chapter", () => {
    const progress = arcProgress(story, 40);
    expect(progress.reached.map((m) => m.chapter)).toEqual([5, 20]);
    expect(progress.total).toBe(3);
    expect(progress.latest?.chapter).toBe(20);
  });

  it("reports no latest before the first milestone", () => {
    const progress = arcProgress(story, 1);
    expect(progress.reached).toEqual([]);
    expect(progress.latest).toBeNull();
  });
});
