/**
 * NF-WF-050B fifth repair — deterministic missing-data checklist tests.
 *
 * GAP-119 finding 4: the checklist must be DERIVED from the same validated
 * current context — including absent/stale receipts, malformed standing and
 * stale evidence — not just the fresh receipt's missingData. Existence alone
 * must not mean "pass".
 *
 * Pure-function tests against deriveChecklist (no DB): construct context,
 * receipt and applicability, assert the derived items. Every item must
 * carry a non-empty explanation, example and nextAction.
 */
import { describe, expect, it } from "vitest";
import {
  deriveChecklist,
  deriveReceiptApplicability,
} from "./scale-decision-routes.ts";
import type {
  ScaleReviewContext,
  ScaleReviewProtocol,
} from "@novelforge/ai-services";

const V1 = "11111111-1111-1111-1111-111111111111";
const B1 = "33333333-3333-3333-3333-333333333333";
const R1 = "44444444-4444-4444-4444-444444444444";
const SET1 = "66666666-6666-6666-6666-666666666666";
const SET_OLD = "77777777-7777-7777-7777-777777777777";
const FP = "a".repeat(64);

function makeContext(overrides: Partial<ScaleReviewContext> = {}): ScaleReviewContext {
  return {
    chapterVersion: { id: V1, content: "<p>Saved.</p>" },
    currentVersionId: V1,
    branch: { id: B1, headRevisionId: R1 },
    headRevisionId: R1,
    latestSet: {
      id: SET1,
      workspaceId: "ws-1",
      novelId: "novel-1",
      chapterVersionId: V1,
      sourceBranchId: B1,
      sourceRevisionId: R1,
      sequence: 1,
      declaration: "CONFLICTS",
      explanation: "expl",
      conflicts: [],
      previousSetId: null,
      actorUserId: "u1",
      createdAt: new Date(),
    },
    policy: {
      id: "p1",
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "because",
      payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 40 } },
    },
    policyFingerprint: FP,
    ...overrides,
  };
}

function makeProtocol(pins: Partial<ScaleReviewProtocol["pins"]> = {}): ScaleReviewProtocol {
  return {
    protocol: 1,
    state: "WITHIN_REACH",
    blocking: false,
    pins: {
      chapterVersionId: V1,
      branchId: B1,
      sourceRevisionId: R1,
      evidenceSetId: SET1,
      policyFingerprint: FP,
      exceptionOutcomeId: null,
      ...pins,
    },
    claims: [],
    missingData: [],
  };
}

function codes(items: Array<{ code: string }>): string[] {
  return items.map((i) => i.code);
}

/**
 * Fake tx for deriveReceiptApplicability: the completeness check resolves
 * the writer's exception via scaleDecisionOutcome.findFirst. Returning null
 * means no applicable exception (matches the mock contexts' null
 * exceptionOutcomeId pins).
 */
const FAKE_TX = {
  scaleDecisionOutcome: { findFirst: async () => null },
} as never;
const FAKE_NOVEL_ID = "novel-1";
const FAKE_WORKSPACE_ID = "workspace-1";

/** Awaitable wrapper: deriveReceiptApplicability is async (sixth repair). */
function applicabilityOf(
  receipt: { scaleReview: ScaleReviewProtocol | null; scaleReviewRaw?: unknown } | null,
  ctx: ScaleReviewContext,
  applicableException: { outcomeId: string; proposalId: string } | null = null,
) {
  return deriveReceiptApplicability(FAKE_TX, FAKE_NOVEL_ID, FAKE_WORKSPACE_ID, receipt, ctx, applicableException);
}

function assertFullText(items: Array<{ code: string; explanation: string; example: string; nextAction: string }>) {
  for (const item of items) {
    expect(item.explanation.trim().length, `${item.code} explanation`).toBeGreaterThan(0);
    expect(item.example.trim().length, `${item.code} example`).toBeGreaterThan(0);
    expect(item.nextAction.trim().length, `${item.code} nextAction`).toBeGreaterThan(0);
  }
}

describe("deriveChecklist", () => {
  it("derives RECEIPT_ABSENT when no receipt exists", async () => {
    const ctx = makeContext();
    const applicability = await applicabilityOf(null, ctx);
    expect(applicability.status).toBe("ABSENT");
    const items = deriveChecklist(ctx, null, applicability);
    expect(codes(items)).toContain("RECEIPT_ABSENT");
    const absent = items.find((i) => i.code === "RECEIPT_ABSENT")!;
    expect(absent.severity).toBe("fail");
    assertFullText(items);
  });

  it("derives RECEIPT_LEGACY when scaleReview is genuinely null", async () => {
    const ctx = makeContext();
    const applicability = await applicabilityOf({ scaleReview: null }, ctx);
    expect(applicability.status).toBe("LEGACY");
    const items = deriveChecklist(ctx, { scaleReview: null }, applicability);
    expect(codes(items)).toContain("RECEIPT_LEGACY");
    assertFullText(items);
  });

  it("derives RECEIPT_STALE (fail) for a malformed non-null stored protocol", async () => {
    // Ninth repair, GAP-119: invalid is never absent. A non-null stored
    // value that the protocol parser rejects is STALE, not LEGACY.
    const ctx = makeContext();
    const malformed = { protocol: 1, state: "BOGUS", blocking: "yes" };
    const applicability = await applicabilityOf(
      { scaleReview: null, scaleReviewRaw: malformed },
      ctx,
    );
    expect(applicability.status).toBe("STALE");
    expect(applicability.reasons).toContain("scaleReview-malformed");
    const items = deriveChecklist(
      ctx,
      { scaleReview: null, scaleReviewRaw: malformed },
      applicability,
    );
    expect(codes(items)).toContain("RECEIPT_STALE");
    expect(codes(items)).not.toContain("RECEIPT_LEGACY");
    const stale = items.find((i) => i.code === "RECEIPT_STALE")!;
    expect(stale.severity).toBe("fail");
    assertFullText(items);
  });

  it("derives RECEIPT_STALE naming the mismatched pins", async () => {
    const ctx = makeContext();
    const protocol = makeProtocol({ evidenceSetId: SET_OLD });
    const applicability = await applicabilityOf({ scaleReview: protocol }, ctx);
    expect(applicability.status).toBe("STALE");
    expect(applicability.reasons).toContain("evidenceSetId");
    const items = deriveChecklist(ctx, { scaleReview: protocol }, applicability);
    const stale = items.find((i) => i.code === "RECEIPT_STALE")!;
    expect(stale).toBeDefined();
    expect(stale.severity).toBe("fail");
    expect(stale.details["reasons"]).toContain("evidenceSetId");
    assertFullText(items);
  });

  it("derives STANDING_ABSENT when no SCALE policy is configured", async () => {
    const ctx = makeContext({ policy: null });
    const items = deriveChecklist(ctx, null, await applicabilityOf(null, ctx));
    expect(codes(items)).toContain("STANDING_ABSENT");
    assertFullText(items);
  });

  it("derives STANDING_MALFORMED when the standing payload does not validate", async () => {
    const ctx = makeContext({
      policy: {
        id: "p1",
        kind: "SCALE",
        hardness: "HARD",
        hardReason: "because",
        payload: { standing: { scale: "BOGUS", access: [], reputation: 40 } },
      },
    });
    const items = deriveChecklist(ctx, null, await applicabilityOf(null, ctx));
    expect(codes(items)).toContain("STANDING_MALFORMED");
    const malformed = items.find((i) => i.code === "STANDING_MALFORMED")!;
    expect(malformed.severity).toBe("fail");
    assertFullText(items);
  });

  it("does not flag malformed standing for a valid empty-access standing", async () => {
    const ctx = makeContext({
      policy: {
        id: "p1",
        kind: "SCALE",
        hardness: "SOFT",
        hardReason: null,
        payload: { standing: { scale: "VILLAGE", access: [], reputation: 50 } },
      },
    });
    const items = deriveChecklist(ctx, null, await applicabilityOf(null, ctx));
    expect(codes(items)).not.toContain("STANDING_MALFORMED");
    expect(codes(items)).not.toContain("STANDING_ABSENT");
  });

  it("derives EVIDENCE_ABSENT when no evidence set exists", async () => {
    const ctx = makeContext({ latestSet: null });
    const items = deriveChecklist(ctx, null, await applicabilityOf(null, ctx));
    expect(codes(items)).toContain("EVIDENCE_ABSENT");
    assertFullText(items);
  });

  it("derives EVIDENCE_STALE when the set source revision differs from the head", async () => {
    const ctx = makeContext({
      latestSet: {
        id: SET1,
        workspaceId: "ws-1",
        novelId: "novel-1",
        chapterVersionId: V1,
        sourceBranchId: B1,
        sourceRevisionId: "99999999-9999-9999-9999-999999999999",
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "expl",
        conflicts: [],
        previousSetId: null,
        actorUserId: "u1",
        createdAt: new Date(),
      },
    });
    const items = deriveChecklist(ctx, null, await applicabilityOf(null, ctx));
    expect(codes(items)).toContain("EVIDENCE_STALE");
    assertFullText(items);
  });

  it("returns the protocol missingData when the receipt is FRESH", async () => {
    // Assessor-consistent fixture: no evidence set -> the deterministic
    // assessor produces INCOMPLETE + MISSING_EVIDENCE_SET (blocking, HARD).
    // The retained protocol must match the assessor output exactly to be
    // FRESH under the shared completeness check (sixth repair).
    const ctx = makeContext({ latestSet: null });
    const protocol: ScaleReviewProtocol = {
      protocol: 1,
      state: "INCOMPLETE",
      blocking: true,
      pins: {
        chapterVersionId: V1,
        branchId: B1,
        sourceRevisionId: R1,
        evidenceSetId: null,
        policyFingerprint: FP,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [
        {
          code: "MISSING_EVIDENCE_SET",
          field: "evidenceSet",
          reason: "No SCALE evidence set exists for this branch/version",
          explanation:
            "SCALE review requires an author-appended evidence set for the current branch and chapter version.",
          example:
            "Example (hypothetical): append an evidence set with ACTION/STAKES/CONSEQUENCE claims, or declare no operative conflict.",
          nextAction:
            "Append a SCALE evidence set via the 050A surface, or declare NO_OPERATIVE_CONFLICT.",
        },
      ],
    };
    const applicability = await applicabilityOf({ scaleReview: protocol }, ctx);
    expect(applicability.status).toBe("FRESH");
    const items = deriveChecklist(ctx, { scaleReview: protocol }, applicability);
    expect(codes(items)).toContain("MISSING_EVIDENCE_SET");
    const md = items.find((i) => i.code === "MISSING_EVIDENCE_SET")!;
    expect(md.severity).toBe("fail");
    expect(md.explanation).toContain("author-appended evidence set");
    assertFullText(items);
  });

  it("labels an internally inconsistent WITHIN_REACH receipt STALE (completeness)", async () => {
    // Sixth repair, GAP-119 finding 2: a WITHIN_REACH receipt with
    // non-empty missingData passes the pin and live-consistency fast-paths
    // but contradicts the deterministic assessor (which never emits
    // missingData for WITHIN_REACH). The shared completeness check must
    // label it STALE so context freshness agrees with the release gate.
    const ctx = makeContext();
    const protocol = makeProtocol();
    protocol.missingData = [
      {
        code: "MISSING_EVIDENCE_SET",
        field: "evidenceSet",
        reason: "No SCALE evidence set exists",
        explanation: "Server explanation.",
        example: "Server example.",
        nextAction: "Server next action.",
      },
    ];
    const applicability = await applicabilityOf({ scaleReview: protocol }, ctx);
    expect(applicability.status).toBe("STALE");
    expect(applicability.reasons).toContain("proof-incomplete");
    const items = deriveChecklist(ctx, { scaleReview: protocol }, applicability);
    expect(codes(items)).toContain("RECEIPT_STALE");
    assertFullText(items);
  });

  it("returns an empty checklist when everything is fresh and complete", async () => {
    const ctx = makeContext();
    const protocol = makeProtocol();
    const applicability = await applicabilityOf({ scaleReview: protocol }, ctx);
    expect(applicability.status).toBe("FRESH");
    const items = deriveChecklist(ctx, { scaleReview: protocol }, applicability);
    expect(items).toEqual([]);
  });
});
