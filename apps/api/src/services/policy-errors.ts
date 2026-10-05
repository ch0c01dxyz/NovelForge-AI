/**
 * NF-WF-010: typed policy refusals.
 *
 * `PolicyError` follows the NF-WF-008 `CanonApplicationError` and
 * NF-WF-009 `MemoryError` precedent: a typed error carrying the
 * machine-readable code, mapped by the platform error handler BEFORE the
 * generic `ConflictError` branch (which can only emit `CONFLICT`).
 *
 * Lives in its own leaf module (no service imports) so narrative.ts
 * (putPolicy), final-text-review.ts, and manuscript.ts (setStatus gate)
 * can all throw it without import cycles.
 */
export type PolicyErrorCode =
  | "MALFORMED_POLICY"
  | "HARD_POLICY_VIOLATION"
  | "REVIEW_STALE";

export class PolicyError extends Error {
  readonly code: PolicyErrorCode;
  readonly statusCode = 409 as const;
  constructor(code: PolicyErrorCode, message: string) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

/**
 * NF-WF-012: typed publication-lifecycle refusals.
 *
 * `PublicationError` follows the `PolicyError` precedent (NF-WF-010): a
 * typed error carrying the machine-readable code, mapped by the platform
 * error handler BEFORE the generic `ConflictError` branch (which can only
 * emit `CONFLICT`). Lives in this leaf module (no service imports) so the
 * publication service can throw it without import cycles.
 */
export type PublicationErrorCode =
  | "ALREADY_PUBLISHED" // schedule/publish a chapter that already has a PUBLISHED publication
  | "NOT_SCHEDULED" // cancel a schedule for a chapter with no SCHEDULED publication
  | "NOVEL_ARCHIVED"; // schedule/publish on an ARCHIVED novel

export class PublicationError extends Error {
  readonly code: PublicationErrorCode;
  readonly statusCode = 409 as const;
  constructor(code: PublicationErrorCode, message: string) {
    super(message);
    this.name = "PublicationError";
    this.code = code;
  }
}
