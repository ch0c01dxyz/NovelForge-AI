import { describe, expect, it } from "vitest";
import { CANON_SUMMARY_MAX_PREDICATES, buildCanonSummaryDigest } from "./canon-summary.ts";

describe("buildCanonSummaryDigest", () => {
  it("counts statuses and kinds deterministically", () => {
    const digest = buildCanonSummaryDigest({
      entities: [{ kind: "CHARACTER" }, { kind: "CHARACTER" }, { kind: "PLACE" }],
      facts: [
        { predicate: "has child", status: "ACTIVE" },
        { predicate: "keeps", status: "ACTIVE" },
        { predicate: "has child", status: "ACTIVE" },
        { predicate: "has child", status: "SUPERSEDED" },
        { predicate: "works with", status: "RETRACTED" },
      ],
    });
    expect(digest.entityCount).toBe(3);
    expect(digest.activeFactCount).toBe(3);
    expect(digest.supersededFactCount).toBe(1);
    expect(digest.retractedFactCount).toBe(1);
    expect(digest.entitiesByKind).toEqual({ CHARACTER: 2, PLACE: 1 });
    expect(digest.topPredicates).toEqual([
      { predicate: "has child", count: 2 },
      { predicate: "keeps", count: 1 },
    ]);
    expect(digest.truncatedPredicates).toBe(false);
  });

  it("caps predicates and reports truncation", () => {
    const facts = Array.from({ length: CANON_SUMMARY_MAX_PREDICATES + 1 }, (_, i) => ({
      predicate: `p${String(i).padStart(2, "0")}`,
      status: "ACTIVE" as const,
    }));
    const digest = buildCanonSummaryDigest({ entities: [], facts });
    expect(digest.topPredicates).toHaveLength(CANON_SUMMARY_MAX_PREDICATES);
    expect(digest.truncatedPredicates).toBe(true);
  });

  it("breaks predicate ties by predicate ascending", () => {
    const digest = buildCanonSummaryDigest({
      entities: [],
      facts: [
        { predicate: "zeta", status: "ACTIVE" },
        { predicate: "alpha", status: "ACTIVE" },
        { predicate: "mid", status: "ACTIVE" },
      ],
    });
    expect(digest.topPredicates.map((p) => p.predicate)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("orders by code unit, not host locale", () => {
    const digest = buildCanonSummaryDigest({
      entities: [{ kind: "b" }, { kind: "A" }],
      facts: [
        { predicate: "Zebra", status: "ACTIVE" },
        { predicate: "apple", status: "ACTIVE" },
      ],
    });
    expect(Object.keys(digest.entitiesByKind)).toEqual(["A", "b"]);
    expect(digest.topPredicates.map((p) => p.predicate)).toEqual(["Zebra", "apple"]);
  });

  it("returns an empty digest for an empty canon", () => {
    const digest = buildCanonSummaryDigest({ entities: [], facts: [] });
    expect(digest).toEqual({
      entityCount: 0,
      activeFactCount: 0,
      supersededFactCount: 0,
      retractedFactCount: 0,
      entitiesByKind: {},
      topPredicates: [],
      truncatedPredicates: false,
    });
  });
});
