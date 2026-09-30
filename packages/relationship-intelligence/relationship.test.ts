/**
 * Relationship intelligence tests (Phase 8, slice 1).
 *
 * These carry the phase's two named exit scenarios: the
 * monogamy/harem/polygamy structure checks and the enemy-to-ally turn.
 * Both are tested as the author would hit them, not as the helpers are
 * shaped — the question is whether the engine refuses a contradiction and
 * records a turn, not whether a function returns an object.
 */

import { describe, expect, it } from "vitest";
import {
  BOND_STAGES,
  BOND_STRUCTURES,
  BOND_TRANSITION_KINDS,
  MEANINGFUL_WEIGHT_FLOOR,
  RELATIONSHIP_STANCES,
  bondStageAt,
  neglectReport,
  stanceAt,
  stanceSince,
  validateBondLifecycle,
  validateBondStructures,
  validateStanceHistory,
  type Bond,
  type BondTransition,
  type MeaningfulInteraction,
  type StanceRecord,
} from "./relationship.ts";

describe("vocabulary stays in sync with the schema", () => {
  // Declared locally (a domain package may not import the generated Prisma
  // client). If the schema gains a member and this list is not updated,
  // every exhaustive switch still typechecks while silently mishandling the
  // new value — so pin the sets here.
  it("pins the enum members", () => {
    expect([...RELATIONSHIP_STANCES]).toEqual([
      "ALLY",
      "FRIENDLY",
      "NEUTRAL",
      "WARY",
      "HOSTILE",
      "ENEMY",
    ]);
    expect([...BOND_STRUCTURES]).toEqual([
      "MONOGAMY",
      "POLYGAMY",
      "POLYAMORY",
      "HAREM",
      "REVERSE_HAREM",
      "POLITICAL_MARRIAGE",
      "CUSTOM",
    ]);
    expect([...BOND_STAGES]).toEqual([
      "ATTRACTION",
      "COURTSHIP",
      "COMMITMENT",
      "MARRIAGE",
      "LEGACY",
    ]);
    expect([...BOND_TRANSITION_KINDS]).toEqual(["ADVANCE", "REGRESS", "SEVER"]);
  });
});

function stance(
  id: string,
  from: string,
  to: string,
  value: StanceRecord["stance"],
  fromChapter: number,
  toChapter: number | null,
): StanceRecord {
  return {
    id,
    fromCharacterId: from,
    toCharacterId: to,
    stance: value,
    fromChapter,
    toChapter,
  };
}

describe("directional stance history", () => {
  it("records an enemy-to-ally turn as two spans, not an overwrite", () => {
    const records = [
      stance("feud", "alice", "bob", "ENEMY", 1, 40),
      stance("turn", "alice", "bob", "ALLY", 40, null),
    ];
    expect(validateStanceHistory(records).ok).toBe(true);
    expect(stanceAt(records, "alice", "bob", 12)?.stance).toBe("ENEMY");
    expect(stanceAt(records, "alice", "bob", 40)?.stance).toBe("ALLY");
  });

  it("dates the turn so 'they became allies' is an event", () => {
    const records = [
      stance("feud", "alice", "bob", "ENEMY", 1, 40),
      stance("turn", "alice", "bob", "ALLY", 40, null),
    ];
    expect(stanceSince(records, "alice", "bob", 90)).toBe(40);
    expect(stanceSince(records, "alice", "bob", 12)).toBe(1);
  });

  it("keeps a one-sided feud one-sided", () => {
    // A symmetric model cannot represent the scene the whole turn depends
    // on: alice hostile, bob oblivious.
    const records = [
      stance("a", "alice", "bob", "HOSTILE", 1, null),
      stance("b", "bob", "alice", "FRIENDLY", 1, null),
    ];
    expect(validateStanceHistory(records).ok).toBe(true);
    expect(stanceAt(records, "alice", "bob", 5)?.stance).toBe("HOSTILE");
    expect(stanceAt(records, "bob", "alice", 5)?.stance).toBe("FRIENDLY");
  });

  it("rejects two spans covering one chapter for one direction", () => {
    const result = validateStanceHistory([
      stance("a", "alice", "bob", "WARY", 1, 20),
      stance("b", "alice", "bob", "ALLY", 10, 30),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["OVERLAP"]);
    expect(result.errors[0]?.recordId).toBe("b");
  });

  it("rejects a stance toward oneself", () => {
    const result = validateStanceHistory([
      stance("a", "alice", "alice", "ALLY", 1, null),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["SELF_REFERENCE"]);
  });

  it("rejects an empty or inverted window", () => {
    const result = validateStanceHistory([
      stance("a", "alice", "bob", "WARY", 5, 5),
      stance("b", "alice", "carol", "WARY", 0, 3),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["BAD_WINDOW", "BAD_WINDOW"]);
  });

  it("returns null for an unrecorded direction", () => {
    expect(stanceAt([], "alice", "bob", 5)).toBeNull();
    expect(stanceSince([], "alice", "bob", 5)).toBeNull();
  });
});

function bond(
  id: string,
  structure: Bond["structure"],
  memberIds: readonly string[],
  fromChapter = 1,
  toChapter: number | null = null,
): Bond {
  return { id, structure, memberIds, fromChapter, toChapter };
}

describe("bond structures (monogamy / harem / polygamy)", () => {
  it("accepts a monogamous pair", () => {
    expect(validateBondStructures([bond("m", "MONOGAMY", ["a", "b"])]).ok).toBe(true);
  });

  it("rejects a monogamous bond with three members", () => {
    const result = validateBondStructures([bond("m", "MONOGAMY", ["a", "b", "c"])]);
    expect(result.errors.map((e) => e.kind)).toEqual(["TOO_MANY_MEMBERS"]);
  });

  it("rejects the same member listed twice", () => {
    const result = validateBondStructures([bond("m", "MONOGAMY", ["a", "a"])]);
    expect(result.errors.map((e) => e.kind)).toEqual(["DUPLICATE_MEMBER"]);
  });

  it("rejects a member of two concurrent monogamous bonds", () => {
    const result = validateBondStructures([
      bond("m1", "MONOGAMY", ["a", "b"], 1, 30),
      bond("m2", "MONOGAMY", ["a", "c"], 20, 40),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["EXCLUSIVITY_CONFLICT"]);
    expect(result.errors[0]?.bondId).toBe("m2");
  });

  it("accepts sequential monogamy — a widow may remarry", () => {
    const result = validateBondStructures([
      bond("m1", "MONOGAMY", ["a", "b"], 1, 30),
      bond("m2", "MONOGAMY", ["a", "c"], 30, null),
    ]);
    expect(result.ok).toBe(true);
  });

  it("does not cap a harem", () => {
    // "Harem" describes a shape, not an instruction that every character
    // becomes a love interest. Five members is a harem.
    const result = validateBondStructures([
      bond("h", "HAREM", ["a", "b", "c", "d", "e"]),
      bond("r", "REVERSE_HAREM", ["z", "y", "x"]),
    ]);
    expect(result.ok).toBe(true);
  });

  it("does not cap polygamy or polyamory", () => {
    const result = validateBondStructures([
      bond("p", "POLYGAMY", ["a", "b", "c"]),
      bond("q", "POLYAMORY", ["d", "e", "f", "g"]),
    ]);
    expect(result.ok).toBe(true);
  });

  it("lets a political marriage coexist with a love match", () => {
    // POLITICAL_MARRIAGE names why a bond exists, not how many a character
    // may hold. Refusing this would be the engine writing the story.
    const result = validateBondStructures([
      bond("duty", "POLITICAL_MARRIAGE", ["a", "b"], 1, null),
      bond("love", "MONOGAMY", ["a", "c"], 10, null),
    ]);
    expect(result.ok).toBe(true);
  });

  it("leaves CUSTOM structures entirely to the author", () => {
    const result = validateBondStructures([
      bond("x", "CUSTOM", ["a", "b", "c", "d"]),
      bond("y", "CUSTOM", ["a", "e"]),
    ]);
    expect(result.ok).toBe(true);
  });
});

function transition(
  id: string,
  chapter: number,
  stage: BondTransition["stage"],
  kind: BondTransition["kind"],
): BondTransition {
  return { id, chapter, stage, kind };
}

describe("bond lifecycle", () => {
  it("accepts a forward progression", () => {
    const result = validateBondLifecycle([
      transition("t1", 3, "ATTRACTION", "ADVANCE"),
      transition("t2", 12, "COURTSHIP", "ADVANCE"),
      transition("t3", 40, "MARRIAGE", "ADVANCE"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("allows an arranged marriage to skip courtship", () => {
    const result = validateBondLifecycle([
      transition("t1", 3, "ATTRACTION", "ADVANCE"),
      transition("t2", 4, "MARRIAGE", "ADVANCE"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("catches a regression mislabeled as an advance", () => {
    // The silent rewind: the caller only ever writes ADVANCE, so the bond
    // decays while the record claims it grew.
    const result = validateBondLifecycle([
      transition("t1", 10, "MARRIAGE", "ADVANCE"),
      transition("t2", 20, "COURTSHIP", "ADVANCE"),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["MISLABELED_REGRESSION"]);
  });

  it("catches an advance mislabeled as a regression", () => {
    const result = validateBondLifecycle([
      transition("t1", 10, "COURTSHIP", "ADVANCE"),
      transition("t2", 20, "MARRIAGE", "REGRESS"),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["MISLABELED_ADVANCE"]);
  });

  it("accepts a labeled regression", () => {
    const result = validateBondLifecycle([
      transition("t1", 10, "MARRIAGE", "ADVANCE"),
      transition("t2", 20, "COURTSHIP", "REGRESS"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects two transitions on one chapter", () => {
    const result = validateBondLifecycle([
      transition("t1", 10, "ATTRACTION", "ADVANCE"),
      transition("t2", 10, "COURTSHIP", "ADVANCE"),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["UNORDERED"]);
  });

  it("refuses to revive a severed bond", () => {
    const result = validateBondLifecycle([
      transition("t1", 10, "MARRIAGE", "ADVANCE"),
      transition("t2", 20, "MARRIAGE", "SEVER"),
      transition("t3", 30, "COURTSHIP", "ADVANCE"),
    ]);
    expect(result.errors.map((e) => e.kind)).toEqual(["TRANSITION_AFTER_SEVER"]);
  });
});

describe("bondStageAt", () => {
  const transitions = [
    transition("t1", 3, "ATTRACTION", "ADVANCE"),
    transition("t2", 12, "COURTSHIP", "ADVANCE"),
    transition("t3", 40, "MARRIAGE", "ADVANCE"),
  ];

  it("reports the stage in force at a chapter", () => {
    expect(bondStageAt(transitions, 20)).toBe("COURTSHIP");
    expect(bondStageAt(transitions, 40)).toBe("MARRIAGE");
  });

  it("reports null before the bond begins", () => {
    expect(bondStageAt(transitions, 1)).toBeNull();
  });

  it("reports null after a sever", () => {
    const severed = [...transitions, transition("t4", 50, "MARRIAGE", "SEVER")];
    expect(bondStageAt(severed, 60)).toBeNull();
    expect(bondStageAt(severed, 45)).toBe("MARRIAGE");
  });
});

function interaction(
  id: string,
  chapter: number,
  weight: number,
): MeaningfulInteraction {
  return { id, chapter, weight };
}

describe("neglect is measured on evidence, not presence", () => {
  it("does not let a crowd scene reset the clock", () => {
    // Forty chapters of being in the same room and saying nothing is
    // exactly the neglect the author wants surfaced.
    const report = neglectReport(
      [interaction("i1", 3, 0.9), interaction("i2", 38, 0)],
      40,
      20,
    );
    expect(report.lastMeaningfulChapter).toBe(3);
    expect(report.chaptersSinceMeaningful).toBe(37);
    expect(report.neglected).toBe(true);
  });

  it("resets the clock on a real interaction", () => {
    const report = neglectReport(
      [interaction("i1", 3, 0.9), interaction("i2", 38, 0.6)],
      40,
      20,
    );
    expect(report.chaptersSinceMeaningful).toBe(2);
    expect(report.neglected).toBe(false);
  });

  it("counts a weight exactly at the floor", () => {
    const report = neglectReport([interaction("i1", 39, MEANINGFUL_WEIGHT_FLOOR)], 40);
    expect(report.lastMeaningfulChapter).toBe(39);
  });

  it("does not accuse an author of neglecting a thread they have not started", () => {
    expect(neglectReport([], 40)).toEqual({
      lastMeaningfulChapter: null,
      chaptersSinceMeaningful: null,
      neglected: false,
    });
  });

  it("ignores interactions that have not happened yet", () => {
    const report = neglectReport([interaction("future", 90, 0.9)], 40);
    expect(report.lastMeaningfulChapter).toBeNull();
    expect(report.neglected).toBe(false);
  });

  it("treats a gap of exactly maxGap as still alive", () => {
    const report = neglectReport([interaction("i1", 20, 0.9)], 40, 20);
    expect(report.neglected).toBe(false);
  });
});
