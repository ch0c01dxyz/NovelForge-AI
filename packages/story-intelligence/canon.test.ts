/**
 * Canon primitive tests (Phase 6).
 *
 * The property under test is not "does the helper run" but "can a claim be
 * trusted": a subject key that folds two names into one is a silent canon
 * merge, and an answer basis that takes the strongest evidence instead of
 * the weakest presents inference as approved canon. Both are correctness
 * tests, not formatting ones.
 */
import { describe, expect, it } from "vitest";
import {
  answerBasis,
  CANON_FACT_STATUSES,
  canonicalSubjectKey,
  canonBoundary,
  CLAIM_BASES,
  classifyProposal,
  CONFLICT_KINDS,
  evidenceBasis,
  locateQuote,
  PROPOSAL_CLASSES,
  resolveObject,
  sameObject,
  SOURCE_KINDS,
  verifySpan,
  type ClaimObject,
  type Evidence,
} from "./canon.ts";

const entity = (id: string): ClaimObject => ({ objectEntityId: id });
const text = (value: string): ClaimObject => ({ objectText: value });

describe("vocabulary stays in sync with the schema", () => {
  // These unions are declared locally (a domain package may not import the
  // generated Prisma client). If the schema gains a member and this list is
  // not updated, every exhaustive switch over the union still typechecks
  // while silently mishandling the new value — so pin the sets here.
  it("pins the enum members", () => {
    expect([...CANON_FACT_STATUSES]).toEqual(["ACTIVE", "SUPERSEDED", "RETRACTED"]);
    expect([...CONFLICT_KINDS]).toEqual(["FUNCTIONAL_CONFLICT"]);
    expect([...SOURCE_KINDS]).toEqual(["CHAPTER", "REFERENCE"]);
    expect([...PROPOSAL_CLASSES]).toEqual(["NEW", "DUPLICATE", "FUNCTIONAL_CONFLICT"]);
    expect([...CLAIM_BASES]).toEqual(["ESTABLISHED_FACT", "INFERENCE", "SUGGESTION"]);
  });
});

describe("canonicalSubjectKey", () => {
  it("folds the spellings that must be one subject", () => {
    const key = canonicalSubjectKey("Ling Fan");
    for (const variant of ["ling fan", "  Ling   Fan  ", "LING FAN", "Ling-Fan", "ling_fan"]) {
      expect(canonicalSubjectKey(variant), variant).toBe(key);
    }
    expect(key).toBe("ling-fan");
  });

  it("folds diacritics", () => {
    expect(canonicalSubjectKey("Café Noir")).toBe(canonicalSubjectKey("Cafe Noir"));
  });

  it("does NOT fold a typo — merging two names silently is worse than asking", () => {
    expect(canonicalSubjectKey("Ling Fan")).not.toBe(canonicalSubjectKey("Lin Fan"));
  });

  it("returns empty for input with no usable characters, so callers must reject it", () => {
    for (const input of ["", "   ", "!!!", "---"]) {
      expect(canonicalSubjectKey(input), JSON.stringify(input)).toBe("");
    }
  });

  it("caps length so a pathological name cannot blow up a unique index key", () => {
    expect(canonicalSubjectKey("a".repeat(500)).length).toBe(120);
  });
});

describe("resolveObject — mirrors the database CHECK", () => {
  it("accepts exactly one form", () => {
    expect(resolveObject({ objectEntityId: "abc" })).toEqual({
      ok: true,
      object: { objectEntityId: "abc" },
    });
    expect(resolveObject({ objectText: "black" })).toEqual({
      ok: true,
      object: { objectText: "black" },
    });
  });

  it("refuses both-set and neither-set", () => {
    expect(resolveObject({ objectEntityId: "a", objectText: "b" })).toEqual({
      ok: false,
      reason: "AMBIGUOUS",
    });
    expect(resolveObject({})).toEqual({ ok: false, reason: "MISSING" });
    expect(resolveObject({ objectEntityId: null, objectText: null })).toEqual({
      ok: false,
      reason: "MISSING",
    });
  });

  it("refuses an empty literal — it would occupy a live slot with no content", () => {
    expect(resolveObject({ objectText: "   " })).toEqual({ ok: false, reason: "EMPTY" });
    expect(resolveObject({ objectEntityId: "  " })).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("trims the literal it accepts", () => {
    expect(resolveObject({ objectText: "  black  " })).toEqual({
      ok: true,
      object: { objectText: "black" },
    });
  });
});

describe("sameObject", () => {
  it("compares entity objects by id", () => {
    expect(sameObject(entity("a"), entity("a"))).toBe(true);
    expect(sameObject(entity("a"), entity("b"))).toBe(false);
  });

  it("compares literals case- and whitespace-insensitively", () => {
    expect(sameObject(text("Black"), text("black"))).toBe(true);
    expect(sameObject(text("black  hair"), text("black hair"))).toBe(true);
    expect(sameObject(text("black"), text("white"))).toBe(false);
  });

  it("never reports an entity and a literal as the same", () => {
    expect(sameObject(entity("a"), text("a"))).toBe(false);
  });
});

describe("classifyProposal", () => {
  it("is NEW when nothing live exists", () => {
    expect(classifyProposal(text("black"), null)).toEqual({ class: "NEW" });
  });

  it("is DUPLICATE for the same claim, and carries the live id", () => {
    expect(classifyProposal(text("black"), { id: "f1", object: text("Black") })).toEqual({
      class: "DUPLICATE",
      liveFactId: "f1",
    });
  });

  it("is FUNCTIONAL_CONFLICT for a different value — the case that must be surfaced", () => {
    expect(classifyProposal(text("white"), { id: "f1", object: text("black") })).toEqual({
      class: "FUNCTIONAL_CONFLICT",
      liveFactId: "f1",
    });
  });

  it("treats an entity-vs-literal disagreement as a conflict, not a duplicate", () => {
    expect(classifyProposal(text("b"), { id: "f1", object: entity("b") })).toEqual({
      class: "FUNCTIONAL_CONFLICT",
      liveFactId: "f1",
    });
  });

  it("only NEW is free of a live fact — the gate keys on that, not on 'no conflict'", () => {
    // A DUPLICATE must not be storable as a proposal: an approval gate that
    // checks "conflict_kind IS NULL" would otherwise auto-approve it into a
    // unique-index violation.
    expect(classifyProposal(text("black"), { id: "f1", object: text("black") }).class).not.toBe(
      "NEW",
    );
  });
});

describe("answerBasis — minimum over evidence, never maximum", () => {
  const activeFact: Evidence = {
    kind: "CANON_FACT",
    factId: "f1",
    status: "ACTIVE",
    asOfReconstruction: false,
  };
  const candidate: Evidence = { kind: "CANDIDATE", proposalId: "p1" };
  const publishedChapter: Evidence = {
    kind: "CHAPTER",
    chapterVersionId: "v1",
    chapterNumber: 12,
    start: 0,
    end: 5,
    excerpt: "hello",
    published: true,
  };
  const chunk: Evidence = {
    kind: "REFERENCE_CHUNK",
    referenceVersionId: "rv1",
    start: 0,
    end: 5,
    excerpt: "hello",
  };

  it("zero evidence is insufficient — which means 'not found', not 'false'", () => {
    expect(answerBasis([])).toEqual({ insufficient: true, basis: null, evidenceCount: 0 });
  });

  it("one candidate row demotes an otherwise-established chain to INFERENCE", () => {
    const result = answerBasis([activeFact, publishedChapter, candidate]);
    expect(result.insufficient).toBe(false);
    expect(result.basis).toBe("INFERENCE");
    expect(result.evidenceCount).toBe(3);
  });

  it("never launders a chain into ESTABLISHED_FACT via its strongest member", () => {
    expect(answerBasis([activeFact, chunk]).basis).toBe("SUGGESTION");
  });

  it("an approved fact alone is established", () => {
    expect(answerBasis([activeFact]).basis).toBe("ESTABLISHED_FACT");
  });

  it("a superseded fact is inference even though it is stored", () => {
    expect(
      answerBasis([{ ...activeFact, status: "SUPERSEDED" } as Evidence]).basis,
    ).toBe("INFERENCE");
  });

  it("an as-of reconstruction is inference even when the row is ACTIVE", () => {
    // Reconstructed history answers "what was true then", not "what is true
    // now", so it cannot ground a present-tense established claim.
    expect(answerBasis([{ ...activeFact, asOfReconstruction: true } as Evidence]).basis).toBe(
      "INFERENCE",
    );
  });

  it("a draft chapter is inference, a published one is established", () => {
    expect(evidenceBasis({ ...publishedChapter, published: false } as Evidence)).toBe("INFERENCE");
    expect(evidenceBasis(publishedChapter)).toBe("ESTABLISHED_FACT");
  });

  it("a reference chunk is only ever a suggestion — references are not canon", () => {
    expect(evidenceBasis(chunk)).toBe("SUGGESTION");
  });
});

describe("locateQuote / verifySpan — what makes a citation resolvable", () => {
  it("locates a quote and returns a span that slices back to it", () => {
    const source = "The sky was red that evening.";
    const found = locateQuote(source, "sky was red");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(source.slice(found.start, found.end)).toBe("sky was red");
  });

  it("refuses an unlocatable quote rather than guessing an offset", () => {
    expect(locateQuote("abc", "zzz")).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(locateQuote("abc", "")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("verifySpan rejects a span that cannot describe text", () => {
    const source = "0123456789";
    expect(verifySpan(source, 0, 5)).toBe(true);
    expect(verifySpan(source, 5, 5)).toBe(false); // empty
    expect(verifySpan(source, 5, 4)).toBe(false); // reversed
    expect(verifySpan(source, -1, 4)).toBe(false); // negative
    expect(verifySpan(source, 0, 11)).toBe(false); // past the end
    expect(verifySpan(source, 0.5, 4)).toBe(false); // non-integer
  });
});

describe("canonBoundary — deny-by-default", () => {
  it("passes a real chapter through", () => {
    expect(canonBoundary(400)).toEqual({ availableFromChapter: 400 });
    expect(canonBoundary(0)).toEqual({ availableFromChapter: 0 });
  });

  it("maps absent or malformed boundaries to null, which canView withholds", () => {
    for (const input of [null, undefined, 1.5, NaN]) {
      expect(canonBoundary(input as number | null | undefined)).toEqual({
        availableFromChapter: null,
      });
    }
  });
});
