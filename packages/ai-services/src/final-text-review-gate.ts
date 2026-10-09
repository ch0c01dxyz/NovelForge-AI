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
  type ScaleReviewContextTx,
} from "./scale-evidence.ts";
import { fingerprintScalePolicy } from "./scale-review-types.ts";
import type { ScaleReviewProtocol, ScaleReviewPins } from "./scale-review-types.ts";

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

  // Legacy/null receipt with SCALE rows → REVIEW_STALE.
  if (!scaleReview && hasScaleRows) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // No SCALE: preserve legacy non-SCALE PASS/FAIL compatibility.
  if (!scaleReview && !hasScaleRows) {
    return receipt.verdict === "PASS"
      ? { ok: true }
      : { ok: false, code: "HARD_POLICY_VIOLATION" };
  }

  // Validate ALL pins verbatim.
  const pins = scaleReview!.pins;
  if (
    pins.chapterVersionId !== chapterVersionId ||
    pins.branchId !== context.branch.id ||
    pins.sourceRevisionId !== context.headRevisionId ||
    pins.evidenceSetId !== (context.latestSet?.id ?? null) ||
    pins.policyFingerprint !== context.policyFingerprint
  ) {
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Verify exception pin: resolve the LATEST applicable approved
  // CHAPTER_EXCEPTION outcome and require it to match the pin EXACTLY.
  // Applicability requires: kind=CHAPTER_EXCEPTION, head matches current,
  // policy fingerprint matches, set ID matches, version and branch match.
  // A stale pin (superseded by a newer outcome, or mismatched pins) is
  // REVIEW_STALE — the author must re-review.
  const latestApplicableOutcome = await tx.scaleDecisionOutcome.findFirst({
    where: {
      novelId,
      chapterVersionId,
      sourceBranchId: context.branch.id,
      action: "APPROVE",
      proposal: {
        kind: "CHAPTER_EXCEPTION",
        sourceRevisionId: context.headRevisionId,
        evidenceSetId: context.latestSet?.id ?? null,
        policyFingerprint: context.policyFingerprint,
      },
    },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });
  const expectedExceptionId = latestApplicableOutcome?.id ?? null;
  if (pins.exceptionOutcomeId !== expectedExceptionId) {
    // Pin mismatch: either a stale pin, a revoked/superseded exception,
    // or an exception that no longer applies to the current head/policy/set.
    return { ok: false, code: "REVIEW_STALE" };
  }

  // Fresh protocol: apply gate logic.
  const protocol = scaleReview!;
  // GAP-119: live hardness/state consistency (fail closed). A retained
  // protocol claiming non-blocking INCOMPLETE/VIOLATION under a live HARD
  // policy is inconsistent — never pass.
  const liveHardness = context.policy
    ? (context.policy.hardness as "HARD" | "SOFT")
    : null;
  if (!isProtocolLiveConsistent(protocol, liveHardness)) {
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
