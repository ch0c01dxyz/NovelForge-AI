/**
 * NF-WF-024C Part 2 — Token budget unit tests.
 *
 * Pins: MAX_TOKEN_BUDGET is a positive integer; budgets above the max are
 * refused; recording past the bound throws TokenBudgetExceededError;
 * partial spend is tracked accurately.
 *
 * Backends MODEL_UNVERIFIED per GAP-013 (standing).
 */
import { describe, expect, it } from "vitest";
import { MAX_TOKEN_BUDGET, TokenBudget, TokenBudgetExceededError } from "./services/token-budget.ts";

describe("MAX_TOKEN_BUDGET (F10 pinned maximum)", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(MAX_TOKEN_BUDGET)).toBe(true);
    expect(MAX_TOKEN_BUDGET).toBeGreaterThan(0);
  });

  it("is documented as 100_000", () => {
    expect(MAX_TOKEN_BUDGET).toBe(100_000);
  });
});

describe("TokenBudget", () => {
  it("refuses a budget above the pinned maximum", () => {
    expect(() => new TokenBudget(MAX_TOKEN_BUDGET + 1)).toThrow(/exceeds pinned maximum/);
  });

  it("accepts a budget at exactly the maximum", () => {
    const b = new TokenBudget(MAX_TOKEN_BUDGET);
    expect(b.budget).toBe(MAX_TOKEN_BUDGET);
  });

  it("refuses non-positive budgets", () => {
    expect(() => new TokenBudget(0)).toThrow(/positive integer/);
    expect(() => new TokenBudget(-5)).toThrow(/positive integer/);
  });

  it("tracks spend accurately (cost tracking accuracy)", () => {
    const b = new TokenBudget(1000);
    b.record(100, 50);
    expect(b.totalSpent).toBe(150);
    expect(b.remaining).toBe(850);
    expect(b.isExhausted).toBe(false);
    b.record(200, 100);
    expect(b.totalSpent).toBe(450);
    expect(b.remaining).toBe(550);
  });

  it("treats null token counts as zero", () => {
    const b = new TokenBudget(1000);
    b.record(null, null);
    expect(b.totalSpent).toBe(0);
  });

  it("throws TokenBudgetExceededError at the bound (budget enforcement)", () => {
    const b = new TokenBudget(300);
    b.record(100, 50); // 150
    expect(() => b.record(100, 50)).toThrow(TokenBudgetExceededError); // 300 → exhausted
  });

  it("exceeded error carries budget and spent", () => {
    const b = new TokenBudget(100);
    try {
      b.record(60, 50);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TokenBudgetExceededError);
      const err = e as TokenBudgetExceededError;
      expect(err.budget).toBe(100);
      expect(err.spent).toBe(110);
    }
  });

  it("isExhausted reflects the bound without throwing", () => {
    const b = new TokenBudget(100);
    expect(b.isExhausted).toBe(false);
    // Record exactly to the bound minus one, then check.
    b.record(50, 49);
    expect(b.isExhausted).toBe(false);
    expect(() => b.record(1, 0)).toThrow(TokenBudgetExceededError);
    expect(b.isExhausted).toBe(true);
  });
});
