/**
 * NF-WF-050B Slice 2 — deterministic SCALE review tests (red proof).
 *
 * Tests the 8-row decision table:
 * - VILLAGE standing vs KINGDOM claim: HARD fails, SOFT advises
 * - Missing set, stale set/head, missing standing, malformed HARD payload
 * - Quiet chapter (NO_OPERATIVE_CONFLICT)
 * - Exceptions covering only some violations cannot release gate
 */
import { describe, it, expect } from "vitest";
import { assessScaleDeterministic } from "@novelforge/ai-services";
import type { ScaleReviewContext } from "@novelforge/ai-services";
import { fingerprintScalePolicy } from "@novelforge/ai-services";

function makeContext(overrides: Partial<ScaleReviewContext> = {}): ScaleReviewContext {
  const policy = {
    id: "policy-1",
    kind: "SCALE",
    hardness: "HARD",
    hardReason: "test",
    payload: {
      standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
    },
  };
  return {
    chapterVersion: { id: "v1", content: "<p>test</p>" },
    currentVersionId: "v1",
    branch: { id: "b1", headRevisionId: "r1" },
    headRevisionId: "r1",
    latestSet: {
      id: "set-1",
      sourceRevisionId: "r1",
      claims: [],
    } as never,
    policy,
    policyFingerprint: fingerprintScalePolicy(policy),
    ...overrides,
  };
}

describe("assessScaleDeterministic", () => {
  it("NOT_CONFIGURED when no policy", () => {
    const result = assessScaleDeterministic({
      context: makeContext({ policy: null, policyFingerprint: fingerprintScalePolicy(null) }),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("NOT_CONFIGURED");
    expect(result.blocking).toBe(false);
  });

  it("INCOMPLETE when HARD policy has malformed standing (fail closed)", () => {
    const policy = {
      id: "p1",
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "test",
      payload: { standing: { scale: "INVALID" } },
    };
    const result = assessScaleDeterministic({
      context: makeContext({ policy, policyFingerprint: fingerprintScalePolicy(policy) }),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("INCOMPLETE");
    expect(result.blocking).toBe(true);
    expect(result.missingData[0]!.code).toBe("MALFORMED_STANDING");
  });

  it("INCOMPLETE when SOFT policy has malformed standing (advisory only)", () => {
    const policy = {
      id: "p1",
      kind: "SCALE",
      hardness: "SOFT",
      hardReason: null,
      payload: { standing: { scale: "INVALID" } },
    };
    const result = assessScaleDeterministic({
      context: makeContext({ policy, policyFingerprint: fingerprintScalePolicy(policy) }),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("INCOMPLETE");
    expect(result.blocking).toBe(false);
  });

  it("VIOLATION when VILLAGE standing vs KINGDOM claim (HARD blocks)", () => {
    const result = assessScaleDeterministic({
      context: makeContext(),
      claims: [
        { index: 0, scale: "KINGDOM", span: { start: 0, end: 10 }, quote: "kingdom" },
      ],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("VIOLATION");
    expect(result.blocking).toBe(true);
    expect(result.claims[0]!.ok).toBe(false);
  });

  it("WITHIN_REACH when claim inside access", () => {
    const policy = {
      id: "p1",
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "test",
      payload: {
        standing: { scale: "VILLAGE", access: ["VILLAGE", "KINGDOM"], reputation: 50 },
      },
    };
    const result = assessScaleDeterministic({
      context: makeContext({ policy, policyFingerprint: fingerprintScalePolicy(policy) }),
      claims: [
        { index: 0, scale: "KINGDOM", span: { start: 0, end: 10 }, quote: "kingdom" },
      ],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("WITHIN_REACH");
    expect(result.blocking).toBe(false);
  });

  it("EXCEPTED when exception covers all violations", () => {
    const result = assessScaleDeterministic({
      context: makeContext(),
      claims: [
        { index: 0, scale: "KINGDOM", span: { start: 0, end: 10 }, quote: "kingdom" },
      ],
      exceptionCoveredIndices: [0],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("EXCEPTED");
    expect(result.blocking).toBe(false);
    expect(result.claims[0]!.coveredByException).toBe(true);
  });

  it("VIOLATION when exception covers only some violations", () => {
    const result = assessScaleDeterministic({
      context: makeContext(),
      claims: [
        { index: 0, scale: "KINGDOM", span: { start: 0, end: 10 }, quote: "k1" },
        { index: 1, scale: "KINGDOM", span: { start: 20, end: 30 }, quote: "k2" },
      ],
      exceptionCoveredIndices: [0], // only first covered
      noOperativeConflict: false,
    });
    expect(result.state).toBe("VIOLATION");
    expect(result.blocking).toBe(true);
  });

  it("NO_OPERATIVE_CONFLICT for quiet chapter with valid policy", () => {
    const result = assessScaleDeterministic({
      context: makeContext(),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: true,
    });
    expect(result.state).toBe("NO_OPERATIVE_CONFLICT");
    expect(result.blocking).toBe(false);
  });

  it("stale quiet evidence holds HARD review (never silent NO_OPERATIVE_CONFLICT)", () => {
    // Regression (GAP-119): an old quiet declaration pinned to a previous head
    // must HOLD a HARD review — it must never silently gain a receipt pinned
    // to the newer head via NO_OPERATIVE_CONFLICT.
    const staleSet = {
      id: "set-stale",
      sourceRevisionId: "r-old", // != head "r1": stale
      declaration: "NO_OPERATIVE_CONFLICT",
      claims: [],
    } as never;
    const result = assessScaleDeterministic({
      context: makeContext({ latestSet: staleSet }),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: true, // caller derived this from the stale set's declaration
    });
    expect(result.state).toBe("INCOMPLETE");
    expect(result.blocking).toBe(true);
    expect(result.missingData[0]!.code).toBe("STALE_EVIDENCE_SET");
  });

  it("INCOMPLETE when no evidence set (HARD blocks)", () => {
    const result = assessScaleDeterministic({
      context: makeContext({ latestSet: null }),
      claims: [],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    expect(result.state).toBe("INCOMPLETE");
    expect(result.blocking).toBe(true);
    expect(result.missingData[0]!.code).toBe("MISSING_EVIDENCE_SET");
  });

  it("access: [] is valid explicit data", () => {
    const policy = {
      id: "p1",
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "test",
      payload: {
        standing: { scale: "VILLAGE", access: [], reputation: 50 },
      },
    };
    const result = assessScaleDeterministic({
      context: makeContext({ policy, policyFingerprint: fingerprintScalePolicy(policy) }),
      claims: [
        { index: 0, scale: "VILLAGE", span: { start: 0, end: 10 }, quote: "village" },
      ],
      exceptionCoveredIndices: [],
      noOperativeConflict: false,
    });
    // VILLAGE claim at VILLAGE scale is within reach (own scale)
    expect(result.state).toBe("WITHIN_REACH");
  });
});
