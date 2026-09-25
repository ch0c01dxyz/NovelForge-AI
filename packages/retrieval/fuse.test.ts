/**
 * Hybrid fusion tests (Phase 5).
 *
 * The properties that matter: an item both retrievers found must beat one
 * only a single retriever found, the output must be deterministic, and a
 * malformed list must be rejected rather than silently mis-weighted.
 */
import { describe, expect, it } from "vitest";
import { fuse, DEFAULT_RRF_K, type Hit } from "./fuse.ts";

function hits(...ids: string[]): Hit[] {
  return ids.map((id, i) => ({ id, rank: i + 1, score: 1 - i / 10 }));
}

function ok(options: Parameters<typeof fuse>[0]) {
  const r = fuse(options);
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.failures)}`);
  return r.value;
}

describe("fuse", () => {
  it("ranks an item both retrievers found above either one's top hit", () => {
    // The whole point of hybrid: agreement beats a single confident list.
    const fused = ok({
      lists: {
        LEXICAL: hits("lex-only", "both"),
        VECTOR: hits("vec-only", "both"),
      },
    });
    expect(fused[0]!.id).toBe("both");
    expect(fused[0]!.foundBy).toEqual(["LEXICAL", "VECTOR"]);
  });

  it("keeps relative order within a single list", () => {
    const fused = ok({ lists: { LEXICAL: hits("a", "b", "c") } });
    expect(fused.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("records every retriever's rank and score as evidence", () => {
    const fused = ok({
      lists: {
        LEXICAL: [{ id: "x", rank: 1, score: 0.9, detail: "matched: forge" }],
        VECTOR: [
          { id: "v1", rank: 1, score: 0.81 },
          { id: "v2", rank: 2, score: 0.79 },
          { id: "x", rank: 3, score: 0.77 },
        ],
      },
    });
    const x = fused.find((r) => r.id === "x")!;
    expect(x.foundBy).toEqual(["LEXICAL", "VECTOR"]);
    expect(x.contributions).toEqual([
      { retriever: "LEXICAL", rank: 1, score: 0.9, detail: "matched: forge" },
      { retriever: "VECTOR", rank: 3, score: 0.77 },
    ]);
    expect(x.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1) + 1 / (DEFAULT_RRF_K + 3), 10);
  });

  it("is independent of the order the lists were built in", () => {
    const a = ok({ lists: { LEXICAL: hits("p", "q"), VECTOR: hits("q", "p") } });
    const b = ok({ lists: { VECTOR: hits("q", "p"), LEXICAL: hits("p", "q") } });
    expect(a).toEqual(b);
  });

  it("breaks ties deterministically by id", () => {
    // Same rank in different lists → identical scores. Without an explicit
    // tiebreak the order would depend on Map insertion order.
    const fused = ok({ lists: { LEXICAL: hits("z"), VECTOR: hits("a") } });
    expect(fused.map((r) => r.id)).toEqual(["a", "z"]);
    // And the reverse input gives the same answer.
    const reversed = ok({ lists: { VECTOR: hits("a"), LEXICAL: hits("z") } });
    expect(reversed.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("handles an empty or absent list", () => {
    expect(ok({ lists: {} })).toEqual([]);
    expect(ok({ lists: { LEXICAL: [] } })).toEqual([]);
    expect(ok({ lists: { LEXICAL: hits("a"), VECTOR: [] } })).toHaveLength(1);
  });

  it("filters by agreement when minRetrievers is set", () => {
    const fused = ok({
      lists: { LEXICAL: hits("lex-only", "both"), VECTOR: hits("vec-only", "both") },
      minRetrievers: 2,
    });
    expect(fused.map((r) => r.id)).toEqual(["both"]);
  });

  it("applies limit after ordering", () => {
    const fused = ok({ lists: { LEXICAL: hits("a", "b", "c", "d") }, limit: 2 });
    expect(fused.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("lets k change how sharply the top dominates", () => {
    // The effect is on the gap between ADJACENT ranks in one list:
    // 1/(k+1) - 1/(k+2). A small k makes rank 1 worth far more than rank 2;
    // a large k flattens the field toward uniform.
    const lists = { LEXICAL: hits("a", "b", "c") };
    const sharp = ok({ lists, k: 1 });
    const flat = ok({ lists, k: 1000 });
    const gap = (r: typeof sharp) => r[0]!.score - r[1]!.score;

    expect(gap(sharp)).toBeGreaterThan(gap(flat));
    expect(gap(flat)).toBeGreaterThan(0);
    // Order is preserved either way — k tunes emphasis, not correctness.
    expect(sharp.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(flat.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects a hit whose declared rank contradicts its position", () => {
    // Otherwise a caller could pass rank 1 for a hit at the bottom and
    // silently over-weight it.
    const r = fuse({ lists: { LEXICAL: [{ id: "a", rank: 5 }, { id: "b", rank: 2 }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("FUSE_RANK_MISMATCH");
  });

  it("rejects malformed options rather than guessing", () => {
    for (const options of [
      { lists: {}, k: 0 },
      { lists: {}, k: -1 },
      { lists: {}, k: 1.5 },
      { lists: {}, minRetrievers: 0 },
      { lists: {}, minRetrievers: 3 },
      { lists: {}, limit: 0 },
    ]) {
      expect(fuse(options).ok).toBe(false);
    }
  });

  it("rejects an empty hit id", () => {
    const r = fuse({ lists: { LEXICAL: [{ id: "", rank: 1 }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("FUSE_BAD_HIT_ID");
  });

  it("rejects a repeated id within one list rather than double-counting it", () => {
    // The test previously asserted the OPPOSITE — that a repeat is merged
    // into one result with foundBy ["LEXICAL","LEXICAL"] and a doubled
    // score. That is the defect, not the contract: RRF contributes one
    // reciprocal rank per retriever per document, so a repeat inflated the
    // score and made a single-leg hit satisfy `minRetrievers: 2`.
    const r = fuse({ lists: { LEXICAL: hits("dup", "dup") } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("FUSE_DUPLICATE_HIT");
  });

  it("counts distinct retrievers, so one leg cannot satisfy minRetrievers 2", () => {
    const r = fuse({ lists: { LEXICAL: hits("x", "x") }, minRetrievers: 2 });
    // Rejected outright — previously this returned the hit, claiming it was
    // found by two retrievers when only one had run.
    expect(r.ok).toBe(false);
  });

  it("fails closed when lists is missing, rather than throwing", () => {
    // Every other malformed option returns a structured failure; the one
    // mandatory field used to dereference and throw a TypeError.
    const r = fuse({ k: 60 } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("FUSE_BAD_LISTS");
  });
});
