/**
 * Failure shape shared by every validator in this package.
 *
 * A failure is data, not an exception: callers decide whether a problem is
 * a 400 (bad admin input), a rejected AI output, or a broken run. `path`
 * points at the offending value using JSON-Pointer-style segments so a
 * failure can be reported against the exact field to fix.
 */
export interface ValidationFailure {
  /** Location of the offending value; "$" for the value itself. */
  path: string;
  /** Stable machine-readable reason (safe to branch on). */
  code: string;
  /** Human-readable explanation. Never contains secrets or provider bodies. */
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failures: ValidationFailure[] };

/** Convenience for the common "return this failure" path. */
export function fail(
  path: string,
  code: string,
  message: string,
): { ok: false; failures: ValidationFailure[] } {
  return { ok: false, failures: [{ path, code, message }] };
}

/** Join a JSON-Pointer style path segment onto a base path. */
export function at(base: string, segment: string | number): string {
  return base === "$" ? `$.${segment}` : `${base}.${segment}`;
}
