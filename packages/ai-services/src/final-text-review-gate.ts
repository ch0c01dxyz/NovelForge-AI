/**
 * NF-WF-050B Slice 2 — shared transactional SCALE review gate.
 *
 * `checkFinalTextReviewGate` is the single transactional receipt-applicability
 * check used by BOTH the API (`assertPublishReviewGate`, `setStatus`) and the
 * publication worker. It replaces the worker's independent verdict-only logic.
 *
 * Transaction-client-only helper: the caller MUST hold the lock order
 * (novel NO KEY UPDATE → branch UPDATE → chapter UPDATE) before calling.
 * This helper re-reads current context, validates protocol/schema, and checks
 * ALL pins before trusting any verdict.
 *
 * Gate codes:
 * - REVIEW_STALE: invalid/mismatched pins, legacy/null receipt with SCALE rows,
 *   or version/branch/head changed since review
 * - SCALE_ASSESSMENT_INCOMPLETE: fresh INCOMPLETE with HARD policy
 * - HARD_POLICY_VIOLATION: fresh proved HARD failure (VIOLATION state, blocking)
 *
 * When SCALE is absent, legacy non-SCALE PASS/FAIL compatibility is preserved;
 * no new SCALE proof is inferred.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { NARRATIVE_SCALES } from "@novelforge/narrative-rhythm";
import {
  readScaleContext,
  type ScaleReviewContext,
  type ScaleReviewContextTx,
} from "./scale-evidence.ts";
import type { ScaleReviewProtocol, ScaleReviewPins } from "./scale-review-types.ts";
import {
  assessScaleDeterministic,
  type AssessmentClaimInput,
} from "./scale-decisions.ts";

export type GateCode =
  | "REVIEW_STALE"
  | "SCALE_ASSESSMENT_INCOMPLETE"
  | "HARD_POLICY_VIOLATION";

export type GateResult = { ok: true } | { ok: false; code: GateCode };

/** Transaction client surface for the gate. */
export type ReviewGateTx = ScaleReviewContextTx &
  Pick<NovelForgeDb, "finalTextReview" | "scaleDecisionOutcome" | "chapterVersion">;

/**
 * Validate a stored scaleReview payload against the FULL protocol 1 schema.
 * Returns the parsed protocol, or null if invalid/legacy.
 *
 * GAP-119: validates ALL fields, types and enums — not just top-level shape.
 * A shallow cast could let a malformed retained protocol pass the gate.
 */
/**
 * Validate a stored scaleReview payload against the FULL frozen protocol 1
 * schema. Returns the parsed protocol, or null if invalid/legacy.
 *
 * GAP-119 (fourth repair): validates ALL fields, types, enums and state
 * semantics — not just top-level shape. Unknown fields are rejected at every
 * level; scale/reach must be members of the frozen 8-scale vocabulary; span
 * bounds must be integers with 0 <= start < end; quotes must be non-empty.
 * A shallow cast could let a malformed or self-contradictory retained
 * protocol pass the gate.
 *
 * State semantics (mirroring what assessScaleDeterministic can produce):
 * - WITHIN_REACH: every claim ok:true, none coveredByException, blocking false
 * - EXCEPTED: every claim ok:true, at least one coveredByException, blocking false
 * - VIOLATION: at least one uncovered ok:false claim
 * - INCOMPLETE: no claims, non-empty missingData
 * - NOT_CONFIGURED / NO_OPERATIVE_CONFLICT: no claims, no missingData, blocking false
 * Anything else is contradictory proof and fails closed (null).
 */
function hasExactKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  const objKeys = Object.keys(obj);
  return objKeys.length === keys.length && keys.every((k) => k in obj);
}

const PIN_KEYS = [
  "chapterVersionId",
  "branchId",
  "sourceRevisionId",
  "evidenceSetId",
  "policyFingerprint",
  "exceptionOutcomeId",
] as const;

const CLAIM_KEYS = [
  "index",
  "scale",
  "reach",
  "gap",
  "ok",
  "span",
  "quote",
  "coveredByException",
] as const;

const SPAN_KEYS = ["start", "end"] as const;

const MISSING_DATA_KEYS = [
  "code",
  "field",
  "reason",
  "explanation",
  "example",
  "nextAction",
] as const;

const PROTOCOL_KEYS = ["protocol", "state", "blocking", "pins", "claims", "missingData"] as const;

const VALID_SCALES: ReadonlySet<string> = new Set(NARRATIVE_SCALES as readonly string[]);

function isUuidOrNull(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v.length > 0);
}

function isValidPins(pins: unknown): pins is ScaleReviewPins {
  if (typeof pins !== "object" || pins === null || Array.isArray(pins)) return false;
  const p = pins as Record<string, unknown>;
  if (!hasExactKeys(p, PIN_KEYS)) return false;
  if (typeof p.chapterVersionId !== "string" || p.chapterVersionId.length === 0) return false;
  if (typeof p.branchId !== "string" || p.branchId.length === 0) return false;
  if (!isUuidOrNull(p.sourceRevisionId)) return false;
  if (!isUuidOrNull(p.evidenceSetId)) return false;
  if (typeof p.policyFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(p.policyFingerprint)) return false;
  if (!isUuidOrNull(p.exceptionOutcomeId)) return false;
  return true;
}

function isValidSpan(span: unknown): boolean {
  if (typeof span !== "object" || span === null || Array.isArray(span)) return false;
  const s = span as Record<string, unknown>;
  if (!hasExactKeys(s, SPAN_KEYS)) return false;
  if (typeof s.start !== "number" || !Number.isInteger(s.start) || s.start < 0) return false;
  if (typeof s.end !== "number" || !Number.isInteger(s.end)) return false;
  if ((s.end as number) <= (s.start as number)) return false;
  return true;
}

function isValidClaim(c: unknown): boolean {
  if (typeof c !== "object" || c === null || Array.isArray(c)) return false;
  const claim = c as Record<string, unknown>;
  if (!hasExactKeys(claim, CLAIM_KEYS)) return false;
  if (typeof claim.index !== "number" || !Number.isInteger(claim.index) || claim.index < 0) return false;
  if (typeof claim.scale !== "string" || !VALID_SCALES.has(claim.scale)) return false;
  if (typeof claim.reach !== "string" || !VALID_SCALES.has(claim.reach)) return false;
  if (typeof claim.gap !== "string" || !/^\d+$/.test(claim.gap)) return false;
  if (typeof claim.ok !== "boolean") return false;
  if (!isValidSpan(claim.span)) return false;
  if (typeof claim.quote !== "string" || claim.quote.trim().length === 0) return false;
  if (typeof claim.coveredByException !== "boolean") return false;
  return true;
}

function isValidMissingData(m: unknown): boolean {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
  const item = m as Record<string, unknown>;
  if (!hasExactKeys(item, MISSING_DATA_KEYS)) return false;
  for (const field of MISSING_DATA_KEYS) {
    if (typeof item[field] !== "string") return false;
  }
  return true;
}

/**
 * Validate claim/state consistency. The deterministic assessor can only
 * produce specific claim shapes per state; anything else is contradictory
 * retained proof and must never pass.
 */
function isStateSemanticallyValid(
  state: string,
  blocking: boolean,
  claims: Array<{ ok: boolean; coveredByException: boolean }>,
  missingDataLength: number,
): boolean {
  const uncoveredFailures = claims.filter((c) => !c.ok && !c.coveredByException);
  const covered = claims.filter((c) => c.coveredByException);
  const anyNotOk = claims.some((c) => !c.ok);
  switch (state) {
    case "WITHIN_REACH":
      // All claims within reach, none covered: every claim ok, none excepted.
      return !anyNotOk && covered.length === 0 && blocking === false;
    case "EXCEPTED":
      // All violations covered: every claim ok, at least one excepted.
      return !anyNotOk && covered.length > 0 && blocking === false;
    case "VIOLATION":
      // At least one proved uncovered violation remains.
      return uncoveredFailures.length > 0;
    case "INCOMPLETE":
      // No claims assessed; the checklist explains what is missing.
      return claims.length === 0 && missingDataLength > 0;
    case "NOT_CONFIGURED":
    case "NO_OPERATIVE_CONFLICT":
      return claims.length === 0 && missingDataLength === 0 && blocking === false;
    default:
      return false;
  }
}

export function parseScaleReviewProtocol(raw: unknown): ScaleReviewProtocol | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (!hasExactKeys(p, PROTOCOL_KEYS)) return null;
  if (p.protocol !== 1) return null;
  const validStates = new Set([
    "NOT_CONFIGURED",
    "INCOMPLETE",
    "WITHIN_REACH",
    "VIOLATION",
    "EXCEPTED",
    "NO_OPERATIVE_CONFLICT",
  ]);
  if (typeof p.state !== "string" || !validStates.has(p.state)) return null;
  if (typeof p.blocking !== "boolean") return null;
  if (!isValidPins(p.pins)) return null;
  if (!Array.isArray(p.claims) || !p.claims.every(isValidClaim)) return null;
  if (!Array.isArray(p.missingData) || !p.missingData.every(isValidMissingData)) return null;
  if (
    !isStateSemanticallyValid(
      p.state as string,
      p.blocking as boolean,
      p.claims as Array<{ ok: boolean; coveredByException: boolean }>,
      (p.missingData as unknown[]).length,
    )
  ) {
    return null;
  }
  return p as unknown as ScaleReviewProtocol;
}

/**
 * Validate live hardness/state consistency (fail closed).
 * A retained protocol claiming INCOMPLETE with blocking:false while the LIVE
 * policy is HARD is inconsistent — treat as invalid (never pass).
 */
export function isProtocolLiveConsistent(
  protocol: ScaleReviewProtocol,
  liveHardness: "HARD" | "SOFT" | null,
): boolean {
  // HARD policy + INCOMPLETE state must always block. If the retained protocol
  // says otherwise, it's stale or tampered — fail closed.
  if (protocol.state === "INCOMPLETE" && liveHardness === "HARD" && !protocol.blocking) {
    return false;
  }
  // HARD policy + VIOLATION must always block.
  if (protocol.state === "VIOLATION" && liveHardness === "HARD" && !protocol.blocking) {
    return false;
  }
  return true;
}

/**
 * Validate retained SCALE state against ACTUAL live policy/evidence semantics
 * (fail closed).
 *
 * Internal schema validity and matching pins are insufficient: a retained
 * protocol can be schema-valid with verbatim-matching pins yet claim a state
 * the live context contradicts (stale or fabricated proof). The producer
 * (`assessScaleDeterministic`) can only emit:
 * - NOT_CONFIGURED when no SCALE policy is configured, and
 * - NO_OPERATIVE_CONFLICT when the live evidence set declares
 *   NO_OPERATIVE_CONFLICT.
 * A retained proof contradicting either live fact is never trusted.
 */
export function isProtocolLiveStateConsistent(
  protocol: ScaleReviewProtocol,
  live: {
    /** True when a SCALE policy row is currently configured. */
    policyConfigured: boolean;
    /** Declaration of the live latest evidence set; null when none exists. */
    evidenceDeclaration: "CONFLICTS" | "NO_OPERATIVE_CONFLICT" | null;
  },
): boolean {
  // NOT_CONFIGURED proof with a configured live policy: the proof no longer
  // describes reality (policy configured after review, or fabricated).
  if (protocol.state === "NOT_CONFIGURED" && live.policyConfigured) {
    return false;
  }
  // NO_OPERATIVE_CONFLICT proof requires a live NO_OPERATIVE_CONFLICT
  // declaration. A CONFLICTS (or absent) live set contradicts the proof.
  if (
    protocol.state === "NO_OPERATIVE_CONFLICT" &&
    live.evidenceDeclaration !== "NO_OPERATIVE_CONFLICT"
  ) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Complete producer/live proof consistency (NF-WF-050B sixth repair, GAP-119)
// ---------------------------------------------------------------------------

/**
 * Strict applicable-exception resolution (NF-WF-050B seventh repair, GAP-119).
 *
 * ONE resolver shared by the review producer (`final-text-review.ts`), the
 * gate (`checkFinalTextReviewGate` / `checkRetainedProofCompleteness`), and
 * context (`deriveReceiptApplicability`). Replaces the loose `claimIndices`
 * casts that accepted any integer array.
 *
 * Resolution follows the receipt writer's EXACT logic: the LATEST (by
 * sequence) APPROVE outcome for a CHAPTER_EXCEPTION proposal matching
 * (novel, version, branch, kind, head). If the latest does not match
 * provenance, NO exception applies — even if an older one would.
 *
 * Strict validation (all must hold, else null — fail closed):
 * - Current complete evidence (latestSet exists) and valid standing
 *   (policy exists). Without these, coverage is meaningless.
 * - Proposal/outcome ownership: the outcome's proposal agrees on
 *   novel/chapter/branch; proposal kind is CHAPTER_EXCEPTION.
 * - Source provenance: proposal.sourceRevisionId, evidenceSetId and
 *   policyFingerprint match the live context.
 * - Exact payload keys (`claimIndices` only); nonempty, unique, bounded
 *   claim indices (0 <= i < live claim count).
 * - Coverage refers to ACTUAL violating claims: each covered index must be
 *   ok:false in the live assessment (run without coverage).
 *
 * Malformed historical approvals return null WITHOUT deleting or rewriting
 * audit history — the records stay; they're just not trusted.
 */
export interface StrictExceptionResolution {
  outcomeId: string;
  proposalId: string;
  coveredIndices: number[];
}

export async function resolveApplicableExceptionStrict(
  tx: Pick<NovelForgeDb, "scaleDecisionOutcome">,
  input: {
    novelId: string;
    /** Authorized context workspace — both proposal and outcome must belong to it. */
    workspaceId: string;
    context: ScaleReviewContext;
  },
): Promise<StrictExceptionResolution | null> {
  const { novelId, workspaceId, context } = input;
  const latestSet = context.latestSet;
  const policy = context.policy;

  // Current complete evidence and valid standing are prerequisites.
  // Without a validated live set or policy, exception coverage is meaningless.
  if (!latestSet || !policy) return null;
  const liveClaimCount = latestSet.conflicts.length;
  if (liveClaimCount === 0) return null;

  // Writer's exact resolution: LATEST (by sequence) APPROVE outcome for a
  // CHAPTER_EXCEPTION proposal matching (novel, version, branch, kind, head).
  const outcome = await tx.scaleDecisionOutcome.findFirst({
    where: {
      novelId,
      chapterVersionId: context.chapterVersion.id,
      sourceBranchId: context.branch.id,
      action: "APPROVE",
      proposal: {
        kind: "CHAPTER_EXCEPTION",
        sourceRevisionId: context.headRevisionId,
      },
    },
    orderBy: { sequence: "desc" },
    select: {
      id: true,
      proposalId: true,
      novelId: true,
      workspaceId: true,
      chapterVersionId: true,
      sourceBranchId: true,
      proposal: {
        select: {
          id: true,
          novelId: true,
          workspaceId: true,
          chapterVersionId: true,
          sourceBranchId: true,
          kind: true,
          sourceRevisionId: true,
          payload: true,
          evidenceSetId: true,
          policyFingerprint: true,
        },
      },
    },
  });
  if (!outcome) return null;

  // Proposal/outcome ownership: the outcome's proposal must agree on
  // novel/chapter/branch, and the proposal kind must be CHAPTER_EXCEPTION.
  const proposal = outcome.proposal;
  if (
    proposal.novelId !== outcome.novelId ||
    proposal.chapterVersionId !== outcome.chapterVersionId ||
    proposal.sourceBranchId !== outcome.sourceBranchId ||
    proposal.kind !== "CHAPTER_EXCEPTION"
  ) {
    return null;
  }

  // Workspace provenance (eighth repair, GAP-119 P2): BOTH the outcome and
  // the proposal must belong to the authorized context workspace.
  // Independent database FKs allow inconsistent historical tenant fields;
  // a retained exception with foreign workspace fields fails closed.
  if (outcome.workspaceId !== workspaceId || proposal.workspaceId !== workspaceId) {
    return null;
  }

  // Source provenance: must match the live context.
  if (
    proposal.sourceRevisionId !== context.headRevisionId ||
    proposal.evidenceSetId !== latestSet.id ||
    proposal.policyFingerprint !== context.policyFingerprint
  ) {
    return null;
  }

  // Strict payload validation: exact keys, nonempty, unique, bounded.
  const payload = proposal.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const payloadKeys = Object.keys(payload as Record<string, unknown>);
  if (payloadKeys.length !== 1 || payloadKeys[0] !== "claimIndices") {
    return null;
  }
  const indices = (payload as { claimIndices: unknown }).claimIndices;
  if (!Array.isArray(indices) || indices.length === 0) {
    return null;
  }
  const seen = new Set<number>();
  for (const i of indices) {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= liveClaimCount) {
      return null;
    }
    if (seen.has(i as number)) {
      return null; // duplicate index (e.g. [0,0]) — malformed
    }
    seen.add(i as number);
  }
  const coveredIndices = indices as number[];

  // Coverage must refer to ACTUAL violating claims: run the deterministic
  // assessor WITHOUT coverage and require each covered index to be ok:false
  // in the live assessment. Covering a non-violating claim is malformed.
  const claims: AssessmentClaimInput[] = latestSet.conflicts.map((c, idx) => ({
    index: idx,
    scale: c.scale,
    span: { start: c.source.start, end: c.source.end },
    quote: c.source.quote,
  }));
  const baseline = assessScaleDeterministic({
    context,
    claims,
    exceptionCoveredIndices: [],
    noOperativeConflict: latestSet.declaration === "NO_OPERATIVE_CONFLICT",
  });
  const violating = new Set(
    baseline.claims.filter((c) => !c.ok).map((c) => c.index),
  );
  for (const i of coveredIndices) {
    if (!violating.has(i)) {
      return null;
    }
  }

  return {
    outcomeId: outcome.id,
    proposalId: outcome.proposalId,
    coveredIndices,
  };
}

/**
 * Compute the EXPECTED protocol 1 from validated live context + applicable
 * exception coverage, reusing the deterministic assessor
 * (`assessScaleDeterministic`) — the same producer the receipt writer uses.
 *
 * The assessor handles all cases including no-policy (NOT_CONFIGURED) and
 * no-set (INCOMPLETE); it never returns null. The `exceptionOutcomeId` pin
 * placeholder ("applicable") is replaced with the caller-provided actual
 * outcome ID, mirroring the writer.
 */
export function computeExpectedScaleProtocol(input: {
  context: ScaleReviewContext;
  exceptionCoveredIndices: number[];
  applicableExceptionOutcomeId: string | null;
}): ScaleReviewProtocol {
  const { context, exceptionCoveredIndices, applicableExceptionOutcomeId } = input;

  // Build claim inputs from the validated latest set — the same mapping the
  // receipt writer uses (050A claims have { scale, source: { start, end, quote } }).
  const claims: AssessmentClaimInput[] = (context.latestSet?.conflicts ?? []).map(
    (c, idx) => ({
      index: idx,
      scale: c.scale,
      span: { start: c.source.start, end: c.source.end },
      quote: c.source.quote,
    }),
  );
  const assessed = assessScaleDeterministic({
    context,
    claims,
    exceptionCoveredIndices,
    noOperativeConflict:
      context.latestSet?.declaration === "NO_OPERATIVE_CONFLICT",
  });
  // Patch the exception outcome pin (resolved by caller per assessor contract).
  return {
    ...assessed,
    pins: { ...assessed.pins, exceptionOutcomeId: applicableExceptionOutcomeId },
  };
}

/**
 * Compare the complete normalized protocol between a retained receipt and
 * the freshly-assessed expectation. Returns the list of mismatched fields
 * (empty = complete match).
 *
 * All of state, blocking, claims, missingData, AND pins must match exactly.
 * An internally valid JSON shape is not proof of a complete live assessment —
 * the retained proof must MATCH what the deterministic assessor produces
 * from validated live context right now.
 */
export function diffRetainedProof(
  retained: ScaleReviewProtocol,
  expected: ScaleReviewProtocol,
): string[] {
  const mismatches: string[] = [];
  if (retained.state !== expected.state) mismatches.push("state");
  if (retained.blocking !== expected.blocking) mismatches.push("blocking");

  // Pins: all six must match verbatim.
  const rp = retained.pins;
  const ep = expected.pins;
  if (rp.chapterVersionId !== ep.chapterVersionId) mismatches.push("pins.chapterVersionId");
  if (rp.branchId !== ep.branchId) mismatches.push("pins.branchId");
  if (rp.sourceRevisionId !== ep.sourceRevisionId) mismatches.push("pins.sourceRevisionId");
  if (rp.evidenceSetId !== ep.evidenceSetId) mismatches.push("pins.evidenceSetId");
  if (rp.policyFingerprint !== ep.policyFingerprint) mismatches.push("pins.policyFingerprint");
  if (rp.exceptionOutcomeId !== ep.exceptionOutcomeId) mismatches.push("pins.exceptionOutcomeId");

  // Claims: length and every field of every claim.
  if (retained.claims.length !== expected.claims.length) {
    mismatches.push("claims.length");
  } else {
    for (let i = 0; i < retained.claims.length; i++) {
      const rc = retained.claims[i]!;
      const ec = expected.claims[i]!;
      if (
        rc.index !== ec.index ||
        rc.scale !== ec.scale ||
        rc.reach !== ec.reach ||
        rc.gap !== ec.gap ||
        rc.ok !== ec.ok ||
        rc.span.start !== ec.span.start ||
        rc.span.end !== ec.span.end ||
        rc.quote !== ec.quote ||
        rc.coveredByException !== ec.coveredByException
      ) {
        mismatches.push(`claims[${i}]`);
      }
    }
  }

  // MissingData: length and every field of every item.
  if (retained.missingData.length !== expected.missingData.length) {
    mismatches.push("missingData.length");
  } else {
    for (let i = 0; i < retained.missingData.length; i++) {
      const rm = retained.missingData[i]!;
      const em = expected.missingData[i]!;
      if (
        rm.code !== em.code ||
        rm.field !== em.field ||
        rm.reason !== em.reason ||
        rm.explanation !== em.explanation ||
        rm.example !== em.example ||
        rm.nextAction !== em.nextAction
      ) {
        mismatches.push(`missingData[${i}]`);
      }
    }
  }

  return mismatches;
}

/**
 * Shared complete-consistency check result.
 * - "match": retained proof matches the live assessment exactly.
 * - "mismatch": retained proof contradicts the live assessment (fail closed);
 *   `reasons` names the mismatched fields.
 */
export type ProofCompletenessResult =
  | { status: "match" }
  | { status: "mismatch"; reasons: string[] };

/**
 * Shared complete-consistency check (NF-WF-050B sixth repair, GAP-119).
 *
 * Reuses the deterministic assessor to compute the EXPECTED protocol from
 * validated live context + applicable exception coverage (writer's exact
 * exception resolution), then compares the complete normalized protocol
 * (state, blocking, claims, missingData, pins) against the retained receipt.
 *
 * This is the single authoritative proof-consistency check shared between
 * publication gates (`checkFinalTextReviewGate`) and context applicability
 * (`deriveReceiptApplicability`). It subsumes the isolated
 * `isProtocolLiveConsistent` / `isProtocolLiveStateConsistent` fast-paths
 * (kept for backward compatibility and cheap early rejection).
 */
export async function checkRetainedProofCompleteness(
  tx: Pick<NovelForgeDb, "scaleDecisionOutcome">,
  input: {
    novelId: string;
    workspaceId: string;
    context: ScaleReviewContext;
    retained: ScaleReviewProtocol;
  },
): Promise<ProofCompletenessResult> {
  const { novelId, workspaceId, context, retained } = input;

  const exception = await resolveApplicableExceptionStrict(tx, {
    novelId,
    workspaceId,
    context,
  });
  const expected = computeExpectedScaleProtocol({
    context,
    exceptionCoveredIndices: exception?.coveredIndices ?? [],
    applicableExceptionOutcomeId: exception?.outcomeId ?? null,
  });

  const mismatches = diffRetainedProof(retained, expected);
  if (mismatches.length > 0) {
    return { status: "mismatch", reasons: mismatches };
  }
  return { status: "match" };
}

/**
 * Check the final-text review gate transactionally.
 *
 * The caller must hold: novel NO KEY UPDATE → branch UPDATE → chapter UPDATE.
 * Re-reads current context and the receipt; validates ALL pins verbatim.
 */
export async function checkFinalTextReviewGate(
  tx: ReviewGateTx,
  input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
  },
): Promise<GateResult> {
  const { workspaceId, novelId, chapterId, chapterVersionId } = input;

  // Re-read current context (fresh pins).
  let context;
  try {
    context = await readScaleContext(tx, {
      workspaceId,
      novelId,
      chapterId,
      chapterVersionId,
    });
  } catch {
    // Version/branch missing → stale (never publish on unknown state).
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Headless participating branch → REVIEW_STALE (no receipt writes elsewhere).
  if (context.headRevisionId === null) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Read the receipt.
  const receipt = await tx.finalTextReview.findUnique({
    where: { chapterVersionId },
    select: {
      verdict: true,
      revisionId: true,
      scaleReview: true,
      hardViolations: true,
    },
  });

  if (!receipt) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Check if any SCALE rows exist (policy or evidence).
  const scalePolicy = await tx.narrativePolicy.findUnique({
    where: { novelId_kind: { novelId, kind: "SCALE" } },
    select: { id: true },
  });
  const hasScaleRows = scalePolicy !== null || context.latestSet !== null;

  const scaleReview = parseScaleReviewProtocol(receipt.scaleReview);

  // Malformed non-null stored proof is NOT a legacy receipt — invalid is
  // never absent. Refuse before any legacy handling (ninth repair, GAP-119).
  if (receipt.scaleReview !== null && !scaleReview) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Legacy/null receipt with SCALE rows → REVIEW_STALE. (After the
  // malformed check above, !scaleReview implies receipt.scaleReview === null.)
  if (receipt.scaleReview === null && hasScaleRows) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // No SCALE: legacy compatibility ONLY for genuine historical receipts
  // (receipt.scaleReview === null, pre-050B) — never for malformed proof.
  // The receipt must still pin the current head. A later head advance
  // (e.g. a non-SCALE HARD policy mutation) makes the old receipt
  // REVIEW_STALE. New reviews always carry a NOT_CONFIGURED protocol
  // (never null), so this path is only reachable for historical rows.
  if (receipt.scaleReview === null && !hasScaleRows) {
    if (receipt.revisionId !== context.headRevisionId) {
      return { ok: false, code: "REVIEW_STALE" };
    }
    return receipt.verdict === "PASS"
      ? { ok: true }
      : { ok: false, code: "HARD_POLICY_VIOLATION" };
  }

  // Fresh protocol: complete producer/live consistency (GAP-119 sixth repair).
  // Reuses the deterministic assessor to compute the EXPECTED protocol from
  // validated live context + applicable exception coverage (writer's exact
  // exception resolution), then compares the complete normalized protocol
  // (state, blocking, claims, missingData, pins). This single authoritative
  // check subsumes the verbatim pin verification, exception-pin check, and
  // the isolated live-consistency fast-paths below.
  const protocol = scaleReview!;
  const completeness = await checkRetainedProofCompleteness(tx, {
    novelId,
    workspaceId,
    context,
    retained: protocol,
  });
  if (completeness.status === "mismatch") {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Fast-path isolated checks (kept for backward compatibility; the complete
  // check above is authoritative and subsumes them).
  // GAP-119: live hardness/state consistency (fail closed). A retained
  // protocol claiming non-blocking INCOMPLETE/VIOLATION under a live HARD
  // policy is inconsistent — never pass.
  const liveHardness = context.policy
    ? (context.policy.hardness as "HARD" | "SOFT")
    : null;
  if (!isProtocolLiveConsistent(protocol, liveHardness)) {
    return { ok: false, code: "REVIEW_STALE" };
  }
  // GAP-119: retained state vs live policy/evidence semantics (fail closed).
  // A schema-valid, pin-matching NOT_CONFIGURED proof under a configured
  // policy, or NO_OPERATIVE_CONFLICT proof against a CONFLICTS live
  // declaration, is stale or fabricated — never pass.
  if (
    !isProtocolLiveStateConsistent(protocol, {
      policyConfigured: context.policy !== null,
      evidenceDeclaration: context.latestSet?.declaration ?? null,
    })
  ) {
    return { ok: false, code: "REVIEW_STALE" };
  }
  if (protocol.state === "INCOMPLETE" && protocol.blocking) {
    return { ok: false, code: "SCALE_ASSESSMENT_INCOMPLETE" };
  }
  if (protocol.state === "VIOLATION" && protocol.blocking) {
    return { ok: false, code: "HARD_POLICY_VIOLATION" };
  }

  // Non-blocking states pass the SCALE gate; legacy verdict still applies.
  // (Existing non-SCALE hard failures still block an otherwise WITHIN_REACH.)
  if (receipt.verdict === "FAIL") {
    // Check if the FAIL is from non-SCALE hard violations.
    const hardViolations = receipt.hardViolations as unknown[];
    if (Array.isArray(hardViolations) && hardViolations.length > 0) {
      // If SCALE protocol says blocking, we already returned above.
      // Non-SCALE hard failures block.
      return { ok: false, code: "HARD_POLICY_VIOLATION" };
    }
  }

  return { ok: true };
}
