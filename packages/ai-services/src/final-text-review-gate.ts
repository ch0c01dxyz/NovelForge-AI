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
import {
  readScaleContext,
  type ScaleReviewContextTx,
} from "./scale-evidence.ts";
import { fingerprintScalePolicy } from "./scale-review-types.ts";
import type { ScaleReviewProtocol } from "./scale-review-types.ts";

export type GateCode =
  | "REVIEW_STALE"
  | "SCALE_ASSESSMENT_INCOMPLETE"
  | "HARD_POLICY_VIOLATION";

export type GateResult = { ok: true } | { ok: false; code: GateCode };

/** Transaction client surface for the gate. */
export type ReviewGateTx = ScaleReviewContextTx &
  Pick<NovelForgeDb, "finalTextReview" | "scaleDecisionOutcome" | "chapterVersion">;

/**
 * Validate a stored scaleReview payload against the protocol 1 schema.
 * Returns the parsed protocol, or null if invalid/legacy.
 */
export function parseScaleReviewProtocol(raw: unknown): ScaleReviewProtocol | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
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
  if (typeof p.pins !== "object" || p.pins === null) return null;
  if (!Array.isArray(p.claims)) return null;
  if (!Array.isArray(p.missingData)) return null;
  return p as unknown as ScaleReviewProtocol;
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

  // Verify exception pin (if any) is still the applicable approved outcome.
  if (pins.exceptionOutcomeId) {
    const outcome = await tx.scaleDecisionOutcome.findFirst({
      where: {
        id: pins.exceptionOutcomeId,
        novelId,
        chapterVersionId,
        action: "APPROVE",
      },
      select: { id: true },
    });
    if (!outcome) {
      return { ok: false, code: "REVIEW_STALE" };
    }
  }

  // Fresh protocol: apply gate logic.
  const protocol = scaleReview!;
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
