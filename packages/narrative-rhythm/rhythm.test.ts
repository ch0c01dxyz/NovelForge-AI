/**
 * Narrative rhythm rule tests (Phase 9, Task A).
 *
 * The property under test is not "does the helper run" but "can the
 * author's rhythm policy be trusted":
 *
 *  - a drama window that tells the author to insert drama turns a SOFT
 *    preference (ADR-009, NARRATIVE-RHYTHM.md Principle) into the
 *    forbidden cron-like rule, so the assertion is made on the GUIDANCE
 *    TEXT, not merely on the state;
 *  - a cooldown that misses a same-type beat lets the repetition the
 *    window exists to prevent;
 *  - an antagonist progression that accepts a backward step hides a
 *    character who is defeated before they are confronted;
 *  - a repetition finding without evidence is a vibe, and
 *    STORY-INTELLIGENCE.md §Story Health requires evidence;
 *  - a scale check that accepts anything lets a village protagonist
 *    settle an imperial dispute.
 */
import { describe, expect, it } from "vitest";
import {
  assessDramaWindow,
  checkCooldown,
  detectRepeatedSequence,
  validateAntagonistProgression,
  type AntagonistProgression,
  type BeatRecord,
  type DramaBeat,
  type DramaPolicy,
} from "./rhythm.ts";
import {
  ANTAGONIST_OUTCOMES,
  ANTAGONIST_ROLES,
  ANTAGONIST_STAGES,
  DRAMA_DENSITIES,
  DRAMA_TYPES,
  DRAMA_WINDOW_STATES,
  NARRATIVE_POLICY_KINDS,
  NARRATIVE_SCALES,
  POLICY_HARDNESSES,
} from "./vocabulary.ts";

describe("vocabulary stays in sync with the schema", () => {
  // Declared locally (a domain package may not import the generated
  // Prisma client). If the schema gains a member and this list is not
  // updated, every exhaustive switch still typechecks while silently
  // mishandling the new value — so pin the sets here.
  it("pins the enum members", () => {
    expect([...DRAMA_TYPES]).toEqual([
      "SOCIAL",
      "PERSONAL",
      "ROMANCE",
      "POLITICAL",
      "ECONOMIC",
      "SCHOLARLY",
      "MILITARY",
      "FAMILY",
      "IDEOLOGICAL",
      "CUSTOM",
    ]);
    expect([...DRAMA_DENSITIES]).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect([...ANTAGONIST_ROLES]).toEqual([
      "MAIN",
      "ARC",
      "TEMPORARY",
      "RIVAL",
      "IDEOLOGICAL",
      "POLITICAL",
      "PERSONAL",
      "COMPETITOR",
    ]);
    expect([...ANTAGONIST_STAGES]).toEqual([
      "INTRODUCTION",
      "MOTIVATION",
      "FRICTION",
      "UNDERESTIMATION",
      "ESCALATION",
      "CONFRONTATION",
      "DEFEAT",
      "CONSEQUENCE",
      "RESOLUTION",
    ]);
    expect([...ANTAGONIST_OUTCOMES]).toEqual([
      "REGRET",
      "RESENTMENT",
      "RETREAT",
      "LOSS_OF_STATUS",
      "EXILE",
      "DEATH",
      "NEUTRALITY",
      "RESPECT",
      "REDEMPTION",
      "ALLIANCE",
      "SUBORDINATION",
      "FUTURE_REVENGE",
    ]);
    expect([...NARRATIVE_SCALES]).toEqual([
      "PERSONAL",
      "FAMILY",
      "VILLAGE",
      "TOWN",
      "CITY",
      "PROVINCE",
      "KINGDOM",
      "EMPIRE",
    ]);
    expect([...DRAMA_WINDOW_STATES]).toEqual([
      "RECENT",
      "IN_GAP",
      "EXTENDED_CALM",
      "BEYOND_EXTENDED_CALM",
    ]);
    // Pinned here rather than in services/narrative.ts, which used to declare
    // its own copies of both.
    expect([...NARRATIVE_POLICY_KINDS]).toEqual(["DRAMA_GAP", "COOLDOWN", "SCALE"]);
    expect([...POLICY_HARDNESSES]).toEqual(["SOFT", "HARD"]);
  });
});

/**
 * The spec's Principle, made assertable: a soft rhythm preference must not
 * come back as an instruction. Word-level, because a planner that reads
 * "insert drama now" will do exactly that.
 */
const IMPERATIVES = ["should", "must", "insert", "add ", "need", "consider", "time for", "now"];

function expectNoImperative(guidance: string) {
  for (const word of IMPERATIVES) {
    expect(guidance.toLowerCase()).not.toContain(word);
  }
}

describe("assessDramaWindow", () => {
  /** The roadmap's exit criterion scenario, verbatim. */
  const lowDensity: DramaPolicy = {
    density: "LOW",
    typicalGap: { min: 30, max: 50 },
    extendedGap: { min: 70, max: 140 },
    strictInterval: false,
  };

  it("reports IN_GAP for a low-density policy at 31 chapters, without instructing", () => {
    const window = assessDramaWindow({ policy: lowDensity, chaptersSinceDrama: 31 });
    if ("problem" in window) throw new Error(`unexpected problem: ${window.problem}`);

    expect(window.state).toBe("IN_GAP");
    expect(window.strict).toBe(false);
    expect(window.guidance).toContain("30-50");
    expectNoImperative(window.guidance);
  });

  it("still instructs nothing when the author asked for a strict interval", () => {
    const strict: DramaPolicy = { ...lowDensity, strictInterval: true };
    const window = assessDramaWindow({ policy: strict, chaptersSinceDrama: 31 });
    if ("problem" in window) throw new Error(`unexpected problem: ${window.problem}`);

    // strict raises the signal the planner sees; it does not turn prose
    // into a command.
    expect(window.strict).toBe(true);
    expect(window.state).toBe("IN_GAP");
    expectNoImperative(window.guidance);
  });

  it("instructs nothing even when the story has been calm past the extended gap", () => {
    // The tempting case: past every authored band. The doc forbids a
    // "drama every N chapters" rule, so this must still be an observation.
    const window = assessDramaWindow({ policy: lowDensity, chaptersSinceDrama: 200 });
    if ("problem" in window) throw new Error(`unexpected problem: ${window.problem}`);

    expect(window.state).toBe("BEYOND_EXTENDED_CALM");
    expect(window.guidance).toContain("140");
    expectNoImperative(window.guidance);
  });

  it("walks the authored bands in order", () => {
    const stateAt = (chaptersSinceDrama: number) => {
      const window = assessDramaWindow({ policy: lowDensity, chaptersSinceDrama });
      if ("problem" in window) throw new Error(`unexpected problem: ${window.problem}`);
      return window.state;
    };
    expect(stateAt(0)).toBe("RECENT");
    expect(stateAt(29)).toBe("RECENT");
    expect(stateAt(30)).toBe("IN_GAP");
    expect(stateAt(50)).toBe("IN_GAP");
    expect(stateAt(51)).toBe("EXTENDED_CALM");
    expect(stateAt(140)).toBe("EXTENDED_CALM");
    expect(stateAt(141)).toBe("BEYOND_EXTENDED_CALM");
  });

  it("reports a malformed policy instead of inventing a band", () => {
    const broken = { ...lowDensity, typicalGap: { min: 50, max: 30 } };
    expect(assessDramaWindow({ policy: broken, chaptersSinceDrama: 31 })).toEqual({
      problem: "MALFORMED_POLICY",
    });
  });

  it("does not claim the extended calm before it starts", () => {
    // The band is tMax+1..eMax, but the authored extended calm is
    // eMin..eMax. With 30-50 / 70-140, chapters 51-69 are past the typical
    // gap and BELOW eMin — the guidance must not say they are inside it.
    const window = assessDramaWindow({ policy: lowDensity, chaptersSinceDrama: 51 });
    if ("problem" in window) throw new Error(`unexpected problem: ${window.problem}`);
    expect(window.state).toBe("EXTENDED_CALM");
    expect(window.guidance).not.toContain("inside the authored extended calm");
    // 140 IS inside eMin..eMax, so the ceiling statement is the honest one.
    expect(window.guidance).toContain("140");
  });

  it("rejects a non-boolean strictInterval rather than silently coercing it", () => {
    const broken = { ...lowDensity, strictInterval: "yes" as unknown as boolean };
    expect(assessDramaWindow({ policy: broken, chaptersSinceDrama: 40 })).toEqual({
      problem: "MALFORMED_POLICY",
    });
  });

  it("rejects a chapter count that is not a chapter", () => {
    // A planner assembling this from model output is the caller; -1 and 1.5
    // are both caller bugs, and both would otherwise fall into a band.
    expect(assessDramaWindow({ policy: lowDensity, chaptersSinceDrama: -1 })).toEqual({
      problem: "MALFORMED_POLICY",
    });
    expect(assessDramaWindow({ policy: lowDensity, chaptersSinceDrama: 1.5 })).toEqual({
      problem: "MALFORMED_POLICY",
    });
  });
});

describe("checkCooldown", () => {
  const policy = { windowChapters: 10 };
  const history: DramaBeat[] = [
    { id: "b1", type: "POLITICAL", chapter: 100 },
    { id: "b2", type: "MILITARY", chapter: 104 },
  ];

  it("refuses a second same-type beat inside the window, naming the blocker", () => {
    const decision = checkCooldown({ id: "b3", type: "POLITICAL", chapter: 106 }, history, policy);

    expect(decision.allowed).toBe(false);
    expect(decision.conflictsWith).toEqual({ beatId: "b1", chapter: 100, distance: 6 });
    expect(decision.reason).toContain("chapter 100");
  });

  it("accepts a same-type beat outside the window", () => {
    const decision = checkCooldown({ id: "b3", type: "POLITICAL", chapter: 110 }, history, policy);

    expect(decision.allowed).toBe(true);
    expect(decision.conflictsWith).toBeNull();
  });

  it("never blocks a different type, however close", () => {
    const decision = checkCooldown({ id: "b3", type: "ROMANCE", chapter: 101 }, history, policy);
    expect(decision.allowed).toBe(true);
  });

  it("blocks a back-fill before an existing beat — the same repetition, mirrored", () => {
    // Forward-only comparison let this through: 12 - 15 is negative, the loop
    // skipped it, and two MILITARY beats 3 chapters apart were accepted.
    const decision = checkCooldown(
      { id: "b3", type: "MILITARY", chapter: 102 },
      [{ id: "b2", type: "MILITARY", chapter: 104 }],
      policy,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.conflictsWith).toEqual({ beatId: "b2", chapter: 104, distance: 2 });
  });

  it("allows exactly windowChapters apart — the window is a minimum distance", () => {
    // The field doc used to say "chapters after a beat", which would make 110
    // blocked for a beat at 100 with window 10. The code has always allowed
    // it, and this pins that as the intended reading.
    const decision = checkCooldown({ id: "b3", type: "POLITICAL", chapter: 110 }, history, policy);
    expect(decision.allowed).toBe(true);
  });

  it("names the NEAREST blocker, not the first or the farthest", () => {
    // Every history above holds one same-type beat, so the selection rule was
    // never exercised: `>` vs `<` (nearest vs farthest) both stayed green.
    const two: DramaBeat[] = [
      { id: "far", type: "POLITICAL", chapter: 100 },
      { id: "near", type: "POLITICAL", chapter: 104 },
    ];
    const decision = checkCooldown({ id: "b3", type: "POLITICAL", chapter: 106 }, two, policy);
    expect(decision.allowed).toBe(false);
    expect(decision.conflictsWith).toEqual({ beatId: "near", chapter: 104, distance: 2 });
  });

  it("blocks a same-type beat that lands AFTER the candidate, and says which side", () => {
    const decision = checkCooldown(
      { id: "b3", type: "POLITICAL", chapter: 102 },
      [{ id: "b9", type: "POLITICAL", chapter: 104 }],
      policy,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.conflictsWith).toEqual({ beatId: "b9", chapter: 104, distance: 2 });
    expect(decision.reason).toContain("after chapter 102");
  });

  it("treats a malformed window as no window rather than as a closed one", () => {
    // Unreachable over HTTP (putPolicy refuses a non-positive window), so the
    // pure function is the only place this branch is pinned. It reads as
    // "nothing configured", which is why the service re-probes the stored
    // payload before calling here.
    for (const windowChapters of [0, -1, 1.5, Number.NaN]) {
      const decision = checkCooldown({ id: "b3", type: "POLITICAL", chapter: 101 }, history, {
        windowChapters,
      });
      expect(decision.allowed, String(windowChapters)).toBe(true);
      expect(decision.conflictsWith).toBeNull();
    }
  });
});

describe("validateAntagonistProgression", () => {
  const forward: AntagonistProgression = {
    role: "ARC",
    stages: [
      "INTRODUCTION",
      "MOTIVATION",
      "FRICTION",
      "UNDERESTIMATION",
      "ESCALATION",
      "CONFRONTATION",
      "DEFEAT",
      "CONSEQUENCE",
      "RESOLUTION",
    ],
  };

  it("accepts a forward-only progression", () => {
    const result = validateAntagonistProgression(forward);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("refuses a backward step", () => {
    const result = validateAntagonistProgression({
      role: "ARC",
      stages: ["INTRODUCTION", "MOTIVATION", "ESCALATION", "FRICTION"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        problem: "BACKWARD_STAGE",
        index: 4,
        message: "FRICTION (rank 2) is reached after a later stage (rank 4)",
      },
    ]);
  });

  it("refuses an unknown stage rather than comparing undefined", () => {
    const result = validateAntagonistProgression({
      role: "RIVAL",
      stages: ["INTRODUCTION", "BETRAYAL" as never],
    });
    expect(result.errors.map((e) => e.problem)).toEqual(["UNKNOWN_STAGE"]);
  });

  it("refuses a prototype key rather than ranking it", () => {
    // The rank map is an object literal, so "constructor" reads back as a
    // function. An `=== undefined` guard misses it, clobbers previousRank,
    // and lets the real backward step through. Caught, the sequence reports
    // the bogus key AND the backward step it was hiding.
    for (const key of ["constructor", "toString", "hasOwnProperty"]) {
      const result = validateAntagonistProgression({
        role: "ARC",
        stages: ["ESCALATION", key as never, "FRICTION"],
      });
      expect(result.errors.map((e) => e.problem), key).toEqual([
        "UNKNOWN_STAGE",
        "BACKWARD_STAGE",
      ]);
    }
  });

  it("refuses a TEMPORARY antagonist with no explicit purpose", () => {
    const result = validateAntagonistProgression({
      role: "TEMPORARY",
      stages: ["INTRODUCTION", "FRICTION", "CONFRONTATION", "RESOLUTION"],
      spanChapters: 12,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.problem)).toEqual(["MISSING_PURPOSE"]);
  });

  it("refuses a TEMPORARY antagonist spanning outside 5-20 chapters", () => {
    const result = validateAntagonistProgression({
      role: "TEMPORARY",
      stages: ["INTRODUCTION", "RESOLUTION"],
      purpose: "to force the protagonist out of the village",
      spanChapters: 40,
    });

    expect(result.errors.map((e) => e.problem)).toEqual(["SPAN_OUT_OF_BOUNDS"]);
  });

  it("accepts a TEMPORARY antagonist with a purpose and a bounded span", () => {
    const result = validateAntagonistProgression({
      role: "TEMPORARY",
      stages: ["INTRODUCTION", "FRICTION", "CONFRONTATION", "RESOLUTION"],
      purpose: "to force the protagonist out of the village",
      spanChapters: 12,
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports MISSING_SPAN when a TEMPORARY antagonist has no end chapter", () => {
    // spanOf(from, null) is null, not 0 — an antagonist still in play has an
    // unknown span. The service treats this as advisory (HARD_ANTAGONIST_
    // PROBLEMS excludes it), so the row lands with the note attached.
    const result = validateAntagonistProgression({
      role: "TEMPORARY",
      stages: ["INTRODUCTION", "FRICTION"],
      purpose: "hold the border arc open",
      spanChapters: null,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.problem)).toEqual(["MISSING_SPAN"]);
  });

  it("imposes no span requirement on a non-temporary role", () => {
    const result = validateAntagonistProgression({ role: "MAIN", stages: ["INTRODUCTION"] });
    expect(result.ok).toBe(true);
  });
});

describe("detectRepeatedSequence", () => {
  const SEQUENCE = ["underestimate", "provoke", "demonstrates", "humiliation"];
  const beats: BeatRecord[] = [
    { id: "c12", kind: "underestimate", chapter: 12 },
    { id: "c12b", kind: "provoke", chapter: 12 },
    { id: "c13", kind: "demonstrates", chapter: 13 },
    { id: "c13b", kind: "humiliation", chapter: 13 },
    { id: "c40", kind: "underestimate", chapter: 40 },
    { id: "c40b", kind: "provoke", chapter: 40 },
    { id: "c41", kind: "demonstrates", chapter: 41 },
    { id: "c41b", kind: "humiliation", chapter: 41 },
  ];

  it("names the concrete beat ids and chapters that produced the finding", () => {
    const finding = detectRepeatedSequence(beats, SEQUENCE);
    if (finding === null) throw new Error("expected a finding");

    // The assertion is on the EVIDENCE, not merely that a finding exists
    // (ADR-012 / STORY-INTELLIGENCE.md §Story Health).
    expect(finding.evidence).toEqual([
      { beatId: "c12", chapter: 12 },
      { beatId: "c12b", chapter: 12 },
      { beatId: "c13", chapter: 13 },
      { beatId: "c13b", chapter: 13 },
      { beatId: "c40", chapter: 40 },
      { beatId: "c40b", chapter: 40 },
      { beatId: "c41", chapter: 41 },
      { beatId: "c41b", chapter: 41 },
    ]);
    expect(finding.occurrences).toBe(2);
    expect(finding.severity).toBe("INFO");
    expect(finding.message).toContain("12, 12, 13, 13, 40, 40, 41, 41");
  });

  it("recommends variation rather than banning the trope", () => {
    const finding = detectRepeatedSequence(beats, SEQUENCE);
    if (finding === null) throw new Error("expected a finding");
    expect(finding.suggestion).toContain("Vary");
    expect(finding.suggestion.toLowerCase()).not.toContain("never");
  });

  it("escalates severity at three occurrences", () => {
    const third = beats
      .slice(0, 4)
      .map((b) => ({ ...b, id: `${b.id}z`, chapter: b.chapter + 200 }));
    const finding = detectRepeatedSequence([...beats, ...third], SEQUENCE);
    if (finding === null) throw new Error("expected a finding");
    expect(finding.occurrences).toBe(3);
    expect(finding.severity).toBe("WARNING");
  });

  it("returns nothing for a trope used once — not a pattern", () => {
    expect(detectRepeatedSequence(beats.slice(0, 4), SEQUENCE)).toBeNull();
  });

  it("cannot be driven below its own definition of a pattern", () => {
    // One occurrence, asked for explicitly. `matches.length < minOccurrences`
    // would pass with minOccurrences 1, emitting a "repeats 1 times" finding
    // the rule itself calls meaningless; 0 would emit one with no evidence.
    expect(detectRepeatedSequence(beats.slice(0, 4), SEQUENCE, 1)).toBeNull();
    expect(detectRepeatedSequence(beats.slice(0, 4), SEQUENCE, 0)).toBeNull();
    expect(detectRepeatedSequence(beats.slice(0, 4), SEQUENCE, -5)).toBeNull();
  });

  it("has no pattern to find in an empty sequence", () => {
    // Unreachable over HTTP — the route forces sequence.min(1) — so this is
    // the only pin on the guard. Without it, `[]` matches at every position
    // and "repeats N times" would report a pattern made of nothing.
    expect(detectRepeatedSequence(beats, [])).toBeNull();
  });
});
