/**
 * Scale appropriateness tests (Phase 9, Task A).
 *
 * Split out of rhythm.test.ts alongside scale.ts, so both stay under the
 * 500-line limit (CLAUDE.md).
 *
 * The property under test: a village protagonist must not be able to settle
 * an imperial dispute, and the rule must refuse to JUDGE reach rather than
 * silently accept a scale it does not know.
 */
import { describe, expect, it } from "vitest";
import { assessScaleAppropriateness, type ProtagonistStanding } from "./scale.ts";

describe("assessScaleAppropriateness", () => {
  const villager: ProtagonistStanding = {
    scale: "VILLAGE",
    access: ["VILLAGE", "TOWN"],
    reputation: 20,
  };

  it("flags a proposal beyond the protagonist's reach, with the gap", () => {
    const assessment = assessScaleAppropriateness(
      { id: "p1", scale: "EMPIRE", summary: "settle the imperial succession" },
      villager,
    );

    expect(assessment.ok).toBe(false);
    expect(assessment.reach).toBe("TOWN");
    expect(assessment.gap).toBe(4); // TOWN -> CITY -> PROVINCE -> KINGDOM -> EMPIRE
    expect(assessment.reason).toContain("EMPIRE");
    expect(assessment.reason).toContain("TOWN");
  });

  it("accepts a proposal within reach", () => {
    const assessment = assessScaleAppropriateness(
      { id: "p2", scale: "TOWN", summary: "the market dispute" },
      villager,
    );

    expect(assessment.ok).toBe(true);
    expect(assessment.gap).toBe(0);
  });

  it("accepts a proposal at the protagonist's own scale even with no access", () => {
    const assessment = assessScaleAppropriateness(
      { id: "p3", scale: "VILLAGE", summary: "the well" },
      { scale: "VILLAGE", access: [], reputation: 5 },
    );

    expect(assessment.ok).toBe(true);
    expect(assessment.gap).toBe(0);
  });

  it("refuses to judge reach when a scale is unknown", () => {
    // An unknown scale has no rank; every comparison against undefined is
    // false, so the unguarded version reports an out-of-reach proposal as ok.
    // The route's z.enum blocks this over HTTP, but this is the exported
    // boundary — a planner assembling standing from model output calls here.
    const unknownProposal = assessScaleAppropriateness(
      { id: "p4", scale: "GALAXY" as never, summary: null },
      villager,
    );
    expect(unknownProposal.ok).toBe(false);
    expect(unknownProposal.reason).toContain("GALAXY");

    const unknownStanding = assessScaleAppropriateness(
      { id: "p5", scale: "EMPIRE", summary: null },
      { scale: "GALAXY" as never, access: [], reputation: 5 },
    );
    expect(unknownStanding.ok).toBe(false);
    expect(unknownStanding.reason).toContain("GALAXY");
  });

  it("ignores a prototype key in access rather than ranking it", () => {
    const assessment = assessScaleAppropriateness(
      { id: "p6", scale: "EMPIRE", summary: null },
      { scale: "VILLAGE", access: ["constructor" as never], reputation: 5 },
    );
    // reach stays VILLAGE — the bogus entry must not extend it.
    expect(assessment.reach).toBe("VILLAGE");
    expect(assessment.ok).toBe(false);
  });

  it("treats a null or non-array access as no access rather than throwing", () => {
    // `access` comes from JSONB. The route's Zod schema forbids null and
    // non-scale members, but a seed or direct write does not go through it,
    // and a TypeError here surfaces as a 500 on an assessment that only
    // needed to report the protagonist's reach.
    for (const access of [null, undefined, "EMPIRE", 7, {}]) {
      const assessment = assessScaleAppropriateness(
        { id: "p8", scale: "EMPIRE", summary: null },
        { scale: "VILLAGE", access: access as never, reputation: 5 },
      );
      expect(assessment.reach, JSON.stringify(access)).toBe("VILLAGE");
      expect(assessment.ok).toBe(false);
    }
  });

  it("says 'step' for a one-step gap and 'steps' beyond it", () => {
    const assessment = assessScaleAppropriateness(
      { id: "p7", scale: "CITY", summary: null },
      { scale: "VILLAGE", access: ["TOWN"], reputation: 20 },
    );
    expect(assessment.gap).toBe(1);
    expect(assessment.reason).toContain("1 scale step beyond");
  });
});
