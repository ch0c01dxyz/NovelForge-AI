/**
 * Canon primitives (Phase 6).
 *
 * Pure and IO-free. This package is a DOMAIN package (ADR-0001): it may
 * import contracts/shared/story-core/validation and NOTHING else — no
 * Prisma, no HTTP, no provider. Every function here is a rule that can be
 * stated without touching a database, which is what makes the rules
 * testable in isolation and testable *at all* when the alternative is a
 * service method that needs a migrated database to run.
 *
 * The enum-shaped unions are declared locally rather than imported from
 * the generated Prisma client, because importing it would cross the
 * boundary. They must stay in sync with schema.prisma; a unit test pins
 * the member sets.
 *
 * See docs/adr/ADR-0008-canon-authority.md.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const CANON_FACT_STATUSES = ["ACTIVE", "SUPERSEDED", "RETRACTED"] as const;
export type CanonFactStatus = (typeof CANON_FACT_STATUSES)[number];

export const CONFLICT_KINDS = ["FUNCTIONAL_CONFLICT"] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export const SOURCE_KINDS = ["CHAPTER", "REFERENCE"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** What a proposal turns out to be, relative to existing canon. */
export const PROPOSAL_CLASSES = ["NEW", "DUPLICATE", "FUNCTIONAL_CONFLICT"] as const;
export type ProposalClass = (typeof PROPOSAL_CLASSES)[number];

/**
 * How well-supported a claim is (CLAUDE.md §21).
 *
 * Ordered weakest-last, so `answerBasis` can take a minimum over the
 * evidence with a plain ordinal comparison.
 */
export const CLAIM_BASES = ["ESTABLISHED_FACT", "INFERENCE", "SUGGESTION"] as const;
export type ClaimBasis = (typeof CLAIM_BASES)[number];

const BASIS_ORDINAL: Record<ClaimBasis, number> = {
  ESTABLISHED_FACT: 0,
  INFERENCE: 1,
  SUGGESTION: 2,
};

// ---------------------------------------------------------------------------
// Subject identity
// ---------------------------------------------------------------------------

/**
 * The stable machine key for a story subject.
 *
 * Canon facts are keyed by `(novel, entity, predicate)`, so the identity of
 * a subject has to be derived the same way on every path — an author typing
 * a name, an importer reading one, a later extraction pass proposing one.
 * Two spellings that normalize to the same key are the SAME entity, which
 * is what stops "Ling Fan" and "ling  fan" becoming two subjects with
 * independent canon.
 *
 * Deliberately conservative: case, surrounding and repeated whitespace,
 * diacritics and punctuation all fold, but nothing else does. It does NOT
 * attempt fuzzy matching — a typo is a different key, because silently
 * merging two names is worse than asking. (ADR-0008 §5.)
 *
 * Returns "" for input with no usable characters; callers must reject that
 * rather than persist an empty key.
 */
export function canonicalSubjectKey(name: string): string {
  return name
    .normalize("NFKD")
    // Strip combining marks so "é" and "e" fold together.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ---------------------------------------------------------------------------
// The object of a claim
// ---------------------------------------------------------------------------

/** A claim's object: exactly one of an entity reference or a literal. */
export type ClaimObject =
  | { objectEntityId: string; objectText?: undefined }
  | { objectText: string; objectEntityId?: undefined };

export type ObjectForm =
  | { ok: true; object: ClaimObject }
  | { ok: false; reason: "MISSING" | "AMBIGUOUS" | "EMPTY" };

/**
 * Resolve a claim's object, enforcing the same rule as the database CHECK
 * (CanonFact_object_exactly_one / CanonProposal_object_exactly_one).
 *
 * Checked here as well as in the schema so a caller gets a 400 naming the
 * problem instead of a 500 from a constraint violation. The database
 * constraint remains the authority — this is a fast, clear failure, not a
 * substitute. An empty-string literal is rejected because it is
 * indistinguishable from "unset" once trimmed, and would occupy a live
 * uniqueness slot with no content.
 */
export function resolveObject(input: {
  objectEntityId?: string | null;
  objectText?: string | null;
}): ObjectForm {
  const entityId = input.objectEntityId ?? null;
  const text = input.objectText ?? null;

  if (entityId !== null && text !== null) return { ok: false, reason: "AMBIGUOUS" };
  if (entityId === null && text === null) return { ok: false, reason: "MISSING" };
  if (entityId !== null) {
    return entityId.trim() === ""
      ? { ok: false, reason: "EMPTY" }
      : { ok: true, object: { objectEntityId: entityId } };
  }
  const trimmed = (text ?? "").trim();
  return trimmed === ""
    ? { ok: false, reason: "EMPTY" }
    : { ok: true, object: { objectText: trimmed } };
}

/**
 * Do two claims assert the same object?
 *
 * Used for duplicate detection. Comparison is on the structured object, not
 * on `statement`: the statement is a display rendering and comparing it
 * would let two spellings of one fact look like a conflict, or let a
 * reworded contradiction look like a duplicate.
 */
export function sameObject(a: ClaimObject, b: ClaimObject): boolean {
  if (a.objectEntityId !== undefined && b.objectEntityId !== undefined) {
    return a.objectEntityId === b.objectEntityId;
  }
  if (a.objectText !== undefined && b.objectText !== undefined) {
    // Case- and whitespace-insensitive: "Black" and "black" are one claim.
    return normalizeLiteral(a.objectText) === normalizeLiteral(b.objectText);
  }
  return false;
}

function normalizeLiteral(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type ProposalClassResult =
  | { class: "NEW" }
  | { class: "DUPLICATE"; liveFactId: string }
  | { class: "FUNCTIONAL_CONFLICT"; liveFactId: string };

/**
 * Classify a proposed claim against the live fact for the same
 * (entity, predicate), if one exists.
 *
 * Three outcomes, and the distinction matters:
 *
 * - NEW — nothing live makes this claim. The only class that could ever be
 *   auto-approved, because there is nothing to contradict.
 * - DUPLICATE — identical to what is already canon. NOT a conflict; there
 *   is no disagreement to surface. Callers reject it rather than storing a
 *   proposal, so a duplicate can never be mistaken for a fresh claim by an
 *   approval gate that keys on "no conflict recorded".
 * - FUNCTIONAL_CONFLICT — a different value for the same subject and
 *   predicate. This is the case CLAUDE.md §4/§5 requires be *surfaced*:
 *   the proposal must stay un-approved and carry the conflicting fact id,
 *   and the live fact must be left untouched.
 *
 * `liveFact` is the caller's responsibility to fetch correctly — one ACTIVE
 * fact per (novel, entity, predicate), which the database enforces via
 * canon_facts_live. If two are somehow passed, the first wins; the index
 * makes that unreachable.
 */
export function classifyProposal(
  candidate: ClaimObject,
  liveFact: { id: string; object: ClaimObject } | null,
): ProposalClassResult {
  if (liveFact === null) return { class: "NEW" };
  return sameObject(candidate, liveFact.object)
    ? { class: "DUPLICATE", liveFactId: liveFact.id }
    : { class: "FUNCTIONAL_CONFLICT", liveFactId: liveFact.id };
}

// ---------------------------------------------------------------------------
// Evidence and answer basis
// ---------------------------------------------------------------------------

/** One piece of support for an answer, tagged with where it came from. */
export type Evidence =
  | {
      kind: "CANON_FACT";
      factId: string;
      status: CanonFactStatus;
      /**
       * True when the row was reconstructed for an as-of query rather than
       * read as the current truth. A reconstructed row is by definition not
       * "what is true now", so it cannot ground an ESTABLISHED_FACT claim
       * even when its status is ACTIVE.
       */
      asOfReconstruction: boolean;
    }
  | {
      kind: "CHAPTER";
      chapterVersionId: string;
      chapterNumber: number;
      start: number;
      end: number;
      excerpt: string;
      /** A draft is real but not yet committed to the story's published record. */
      published: boolean;
    }
  | {
      kind: "REFERENCE_CHUNK";
      referenceVersionId: string;
      start: number;
      end: number;
      excerpt: string;
    }
  | { kind: "CANDIDATE"; proposalId: string };

/** What a single piece of evidence can support, at best. */
export function evidenceBasis(evidence: Evidence): ClaimBasis {
  switch (evidence.kind) {
    case "CANON_FACT":
      return evidence.status === "ACTIVE" && !evidence.asOfReconstruction
        ? "ESTABLISHED_FACT"
        : "INFERENCE";
    case "CHAPTER":
      // A published chapter is a fact of the story's record (CLAUDE.md §5:
      // published chapter facts sit just under approved canon). A draft is
      // the author's working state, not the record.
      return evidence.published ? "ESTABLISHED_FACT" : "INFERENCE";
    case "CANDIDATE":
      // A candidate is by definition not yet canon (CLAUDE.md §2.13).
      return "INFERENCE";
    case "REFERENCE_CHUNK":
      // A reference is external guidance, never story truth (CLAUDE.md §3).
      return "SUGGESTION";
  }
}

export type AnswerBasis =
  | { insufficient: true; basis: null; evidenceCount: 0 }
  | { insufficient: false; basis: ClaimBasis; evidenceCount: number };

/**
 * The basis of an answer: the WEAKEST basis among its evidence.
 *
 * Minimum, never maximum. Taking the strongest would let one approved fact
 * launder a chain that also rests on a candidate row into
 * ESTABLISHED_FACT — presenting inference as canon, which CLAUDE.md §21
 * forbids outright. One candidate row anywhere in the chain demotes the
 * whole answer to INFERENCE.
 *
 * Zero evidence is `insufficient`, which means "no evidence was found" and
 * NOT "the claim is false". Those are different answers and conflating
 * them is how a Story Brain starts asserting negatives it cannot know.
 */
export function answerBasis(evidence: readonly Evidence[]): AnswerBasis {
  if (evidence.length === 0) return { insufficient: true, basis: null, evidenceCount: 0 };
  let weakest: ClaimBasis = "ESTABLISHED_FACT";
  for (const item of evidence) {
    const basis = evidenceBasis(item);
    if (BASIS_ORDINAL[basis] > BASIS_ORDINAL[weakest]) weakest = basis;
  }
  return { insufficient: false, basis: weakest, evidenceCount: evidence.length };
}

// ---------------------------------------------------------------------------
// Source spans
// ---------------------------------------------------------------------------

export type SpanCheck =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: "NOT_FOUND" | "EMPTY" | "ORDERED" };

/**
 * Locate `quote` in `source` and return the span, or explain why it cannot
 * be cited.
 *
 * This is what makes evidence resolvable rather than asserted: the stored
 * (start, end) must satisfy `source.slice(start, end) === quote`. An
 * unlocatable quote is refused instead of being stored with a best-effort
 * offset — a citation that points at the wrong text is worse than no
 * citation, because it looks like proof.
 *
 * The FIRST occurrence wins. For an ambiguous quote that is a real
 * limitation: the span is verifiable but not necessarily the occurrence the
 * author meant. Callers wanting a specific occurrence must pass an
 * unambiguous quote.
 */
export function locateQuote(source: string, quote: string): SpanCheck {
  if (quote === "") return { ok: false, reason: "EMPTY" };
  const start = source.indexOf(quote);
  if (start < 0) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, start, end: start + quote.length };
}

/** Verify a stored span against the text it claims to describe. */
export function verifySpan(source: string, start: number, end: number): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end <= start || end > source.length) return false;
  return true;
}

/**
 * The spoiler boundary of a canon fact, in the shape the shared `canView`
 * predicate expects.
 *
 * Kept here rather than imported so the caller does not have to know that
 * canon and chunks happen to share a predicate — but the semantics are
 * identical and the SQL that enforces it is the same clause, deliberately.
 * `null` means not reader-visible at all.
 */
export function canonBoundary(availableFromChapter: number | null | undefined): {
  availableFromChapter: number | null;
} {
  return {
    availableFromChapter:
      typeof availableFromChapter === "number" && Number.isInteger(availableFromChapter)
        ? availableFromChapter
        : null,
  };
}
