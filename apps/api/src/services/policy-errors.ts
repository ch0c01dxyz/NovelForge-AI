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

/**
 * NF-WF-019B: typed rate-limit refusals for reader social writes.
 *
 * `RateLimitError` follows the `PolicyError` precedent: a typed error
 * carrying the machine-readable code, mapped by the platform error
 * handler to 429 with the code as the envelope's error field. Lives in
 * this leaf module (no service imports) so the comment service can
 * throw it without import cycles.
 *
 * The burst limit (1 comment / 10s / user) is enforced by the app-wide
 * @fastify/rate-limit with a per-route override (the auth
 * register/login precedent); the DAILY limits below are enforced in
 * the service via DB counts (deterministic per-user accounting the
 * in-memory limiter cannot give across restarts).
 */
export type RateLimitErrorCode =
  | "COMMENT_DAILY_LIMIT" // > 100 comments / 24h / user
  | "REPORT_DAILY_LIMIT"; // > 20 reports / 24h / user

export class RateLimitError extends Error {
  readonly code: RateLimitErrorCode;
  readonly statusCode = 429 as const;
  constructor(code: RateLimitErrorCode, message: string) {
    super(message);
    this.name = "RateLimitError";
    this.code = code;
  }
}
