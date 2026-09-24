/**
 * Error classification — decides whether a failure may be retried
 * (CLAUDE.md §27: retries bounded, only plausibly-transient errors).
 *
 * The category is the *only* thing routing consults; the raw provider
 * error never propagates to callers or logs (CLAUDE.md §26: never expose
 * internal provider details; §14: never leak credentials).
 */

export type ErrorCategory =
  | "TRANSIENT"
  | "RATE_LIMIT"
  | "AUTH"
  | "INVALID_REQUEST"
  | "UNSUPPORTED"
  | "DETERMINISTIC"
  | "INTERNAL";

/** Categories a bounded retry/fallback may act on. */
const RETRYABLE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  "TRANSIENT",
  "RATE_LIMIT",
]);

export function isRetryable(category: ErrorCategory): boolean {
  return RETRYABLE.has(category);
}

/**
 * Whether a failure is attributable to the gateway instance (as opposed
 * to the request or the caller). Only these may count against the
 * circuit breaker: a malformed request or a user cancellation would fail
 * identically on every gateway, so penalizing an instance for them would
 * take healthy providers out of rotation.
 */
export function isGatewayFault(category: ErrorCategory): boolean {
  return category !== "INVALID_REQUEST" && category !== "DETERMINISTIC";
}

/**
 * A classified gateway failure. `message` is always safe to persist —
 * construct it from the category, never from a raw provider body.
 */
export class GatewayError extends Error {
  constructor(
    readonly category: ErrorCategory,
    message: string,
    /** HTTP status when the failure came from a response. */
    readonly status?: number,
    /** Whether the failure happened before any bytes were received. */
    readonly partial = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Map an HTTP status to a category.
 *
 * 408/409/425/429/5xx are plausibly transient; 401/403 are auth; 400/422
 * are the caller's fault and must never be retried; 404 on a model is
 * UNSUPPORTED (retrying the same model cannot help — fallback to a
 * different model may).
 */
export function classifyStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  if (status === 408 || status === 409 || status === 425) return "TRANSIENT";
  if (status >= 500) return "TRANSIENT";
  if (status === 404) return "UNSUPPORTED";
  if (status >= 400) return "INVALID_REQUEST";
  return "INTERNAL";
}

/**
 * Classify a thrown transport error (fetch/undici). AbortError from our
 * own timeout is TRANSIENT; a caller-cancelled request is DETERMINISTIC
 * (retrying a cancelled request is wrong).
 *
 * A genuine network failure (ECONNRESET/ENOTFOUND/"fetch failed") is
 * TRANSIENT. Any OTHER unexpected throw is a programmer error in our own
 * code, not a provider condition: it is classified INTERNAL so it is not
 * retried and does not penalize the gateway (retrying a bug on another
 * gateway multiplies the damage and marks healthy providers unhealthy).
 */
export function classifyThrown(err: unknown, timedOut: boolean): ErrorCategory {
  if (timedOut) return "TRANSIENT";
  if (err instanceof GatewayError) return err.category;
  if (err instanceof Error && err.name === "AbortError") return "DETERMINISTIC";
  if (isNetworkError(err)) return "TRANSIENT";
  return "INTERNAL";
}

/**
 * Recognise a transport-level failure. undici surfaces connection
 * problems either as a TypeError("fetch failed") with a `cause`, or as a
 * Node system error carrying a `code`.
 */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && NETWORK_CODES.has(code)) return true;
  if (err.message === "fetch failed") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && NETWORK_CODES.has(causeCode)) return true;
  }
  return false;
}

const NETWORK_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** Safe, non-leaking message per category. */
export function messageFor(category: ErrorCategory, status?: number): string {
  switch (category) {
    case "TRANSIENT":
      return "gateway temporarily unavailable";
    case "RATE_LIMIT":
      return "gateway rate limit exceeded";
    case "AUTH":
      return "gateway authentication failed";
    case "INVALID_REQUEST":
      return "request rejected by gateway";
    case "UNSUPPORTED":
      return "model or capability not supported by gateway";
    case "DETERMINISTIC":
      return "request cancelled";
    case "INTERNAL":
      return status ? `gateway error (status ${status})` : "gateway error";
  }
}
