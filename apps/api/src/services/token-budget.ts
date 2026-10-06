/**
 * NF-WF-024C Part 2 — Measured cost: token budget enforcement.
 *
 * Every AI operation records token usage (inputTokens/outputTokens on the
 * Generation row — pre-existing). This module adds the budget side:
 * a pinned maximum and a runtime tracker that halts work at the bound.
 *
 * 024 Invariant 3 (Bounded cost): execution halts at the bound; partial
 * results are marked incomplete, never silently truncated. The bound is
 * enforced server-side, not by the LLM.
 */

/**
 * The absolute maximum token budget for any single bounded AI operation.
 *
 * Pinned in code per 024 contract review F10: the maximum is a deliberate
 * product decision, not left to implementer judgment at each call site.
 * Callers specify a (smaller) budget per operation; it must not exceed this.
 *
 * 100,000 tokens ≈ a bounded what-if comparison (3 chapters × ~2KB prose
 * plus context) with headroom. Larger operations must be split or get an
 * explicit author override via a contract amendment — not a code change.
 */
export const MAX_TOKEN_BUDGET = 100_000;

/** Error thrown when a token budget is exceeded. */
export class TokenBudgetExceededError extends Error {
  readonly budget: number;
  readonly spent: number;
  constructor(budget: number, spent: number) {
    super(
      `token budget exhausted: spent ${spent} of ${budget} tokens; ` +
        `partial results are marked incomplete, never silently truncated`,
    );
    this.name = "TokenBudgetExceededError";
    this.budget = budget;
    this.spent = spent;
  }
}

/**
 * Runtime tracker for a bounded AI operation's token spend.
 *
 * Usage:
 *   const budget = new TokenBudget(50_000); // throws if > MAX_TOKEN_BUDGET
 *   budget.record(inputTokens, outputTokens); // throws TokenBudgetExceededError at the bound
 *   budget.isExhausted(); // check without throwing
 */
export class TokenBudget {
  readonly budget: number;
  private spent = 0;

  constructor(budget: number) {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new Error(`token budget must be a positive integer, got ${budget}`);
    }
    if (budget > MAX_TOKEN_BUDGET) {
      throw new Error(
        `token budget ${budget} exceeds pinned maximum ${MAX_TOKEN_BUDGET}; ` +
          `split the operation or request a contract amendment`,
      );
    }
    this.budget = budget;
  }

  /** Total tokens recorded so far. */
  get totalSpent(): number {
    return this.spent;
  }

  /** Remaining tokens before the bound. */
  get remaining(): number {
    return Math.max(0, this.budget - this.spent);
  }

  get isExhausted(): boolean {
    return this.spent >= this.budget;
  }

  /**
   * Record tokens from one AI call. Throws TokenBudgetExceededError when
   * the bound is reached — the caller must mark partial results incomplete.
   */
  record(inputTokens: number | null, outputTokens: number | null): void {
    const total = (inputTokens ?? 0) + (outputTokens ?? 0);
    this.spent += total;
    if (this.spent >= this.budget) {
      throw new TokenBudgetExceededError(this.budget, this.spent);
    }
  }
}
