/**
 * Frozen SCALE review protocol types and policy fingerprint (NF-WF-050B
 * Slice 1, protocol 1).
 *
 * These interfaces are the frozen cross-slice contract between the SCALE
 * context reader (Slice 1), the deterministic reviewer (Slice 2) and the
 * shared API/worker gate (Slice 2). Do not rename fields or widen unions
 * without a contract amendment: receipts persist these shapes in
 * `FinalTextReview.scaleReview` (SQL `scale_review`).
 */
import { createHash } from "node:crypto";

/**
 * Review-time pins. Compared verbatim against fresh context before any
 * verdict is trusted; any mismatch is REVIEW_STALE.
 */
export interface ScaleReviewPins {
  chapterVersionId: string;
  branchId: string;
  sourceRevisionId: string | null;
  evidenceSetId: string | null;
  policyFingerprint: string;
  exceptionOutcomeId: string | null;
}

/** One evidence claim as assessed against the SCALE policy. */
export interface ScaleReviewClaim {
  index: number;
  scale: string;
  reach: string;
  gap: string;
  ok: boolean;
  span: { start: number; end: number };
  quote: string;
  coveredByException: boolean;
}

/** Protocol 1 deterministic SCALE review receipt payload. */
export interface ScaleReviewProtocol {
  protocol: 1;
  state:
    | "NOT_CONFIGURED"
    | "INCOMPLETE"
    | "WITHIN_REACH"
    | "VIOLATION"
    | "EXCEPTED"
    | "NO_OPERATIVE_CONFLICT";
  blocking: boolean;
  pins: ScaleReviewPins;
  claims: ScaleReviewClaim[];
  missingData: Array<{
    code: string;
    field: string;
    reason: string;
    explanation: string;
    example: string;
    nextAction: string;
  }>;
}

/**
 * The approved SCALE policy as read from NarrativePolicy (kind SCALE),
 * reduced to exactly the fields the fingerprint covers. `updatedAt` (and
 * any other mutable bookkeeping) is deliberately absent: the fingerprint
 * must never depend on it, and `id` must never be the sole version signal.
 */
export interface ScalePolicySnapshot {
  id: string;
  /** Policy identity; for the SCALE policy this is the NarrativePolicy kind. */
  kind: string;
  hardness: string;
  hardReason: string | null;
  payload: unknown;
}

/**
 * Recursively sort object keys lexicographically; array order is preserved.
 * `undefined` values are dropped (JSON.stringify semantics).
 */
function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      sorted[key] = canonicalizeJson(v);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 hex fingerprint of the canonical SCALE policy representation.
 *
 * Canonical form: JSON with lexicographically sorted object keys and
 * preserved array order, hashed as UTF-8. The hashed fields are the policy
 * presence (explicit absence), id, kind, hardness, hardReason and payload.
 * `updatedAt`/row identity alone are never used as a policy version:
 * creating, deleting or replacing a policy changes the fingerprint, while
 * a mere timestamp touch cannot. A null/undefined policy fingerprints as
 * the explicit absence representation, never as an empty hash.
 */
export function fingerprintScalePolicy(policy: unknown): string {
  const record =
    policy !== null && typeof policy === "object" && !Array.isArray(policy)
      ? (policy as Record<string, unknown>)
      : {};
  const normalized =
    policy === null || policy === undefined
      ? { absent: true }
      : {
          absent: false,
          id: record.id ?? null,
          kind: record.kind ?? null,
          hardness: record.hardness ?? null,
          hardReason: record.hardReason ?? null,
          payload: record.payload ?? null,
        };
  const canonical = JSON.stringify(canonicalizeJson(normalized));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
