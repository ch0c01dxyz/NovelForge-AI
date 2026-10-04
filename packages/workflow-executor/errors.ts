/**
 * @novelforge/workflow-executor — error taxonomy.
 *
 * The executor runs in the worker, never behind the API error handler, so
 * these classes exist only to classify failures for the persisted
 * `errorMessage`. They deliberately mirror the `code` literals of the
 * API's platform errors (`apps/api/src/services/platform.ts`) because the
 * injected definition resolvers throw THOSE classes — and the classifier
 * below duck-types on `code`, never on class identity, so a resolver's
 * `ConflictError("agent ... is not published")` still contributes its
 * message instead of degrading to "workflow step failed".
 *
 * The API must not import these: its routes keep using the platform
 * errors, whose `instanceof` mapping in the error handler is load-bearing.
 */
import { GatewayError } from "@novelforge/ai-core";

export class ExecutorConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "ExecutorConflictError";
  }
}

export class ExecutorNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "ExecutorNotFoundError";
  }
}

/**
 * True when the error's message is safe to persist on the run row and
 * serve to the client: classified gateway failures and the API's
 * client-error taxonomy. Everything else degrades to "workflow step
 * failed" with the detail kept server-side (the same rule the
 * request-thread executor applied).
 */
export function isClientSafeError(err: unknown): boolean {
  if (err instanceof GatewayError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === "CONFLICT" || code === "NOT_FOUND" || code === "BAD_GATEWAY";
}

/** Prisma unique-violation (P2002), duck-typed like the API's own helper. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}
