# 050B Scope Amendment Review Record — 2026-10-09 (Slice 2)

**Task:** NF-WF-050B (scale review and author decisions)  
**Type:** Separate scope-amendment review (per contract amendment procedure)  
**Status:** RECORDED — AWAITING AUTHOR APPROVAL  
**Reviewer:** Slice 2 implementer (separate actor; backends MODEL_UNVERIFIED per GAP-013)  
**Date:** 2026-10-09

## Amendments Under Review

The following 4 bounded amendments to the frozen 050B contract (`fed3cea`) are
submitted for separate author approval. Each is documented with its justification
and contract impact.

### Amendment 1: `packages/ai-services/src/scale-review-types.ts` (NEW)

**What:** New file containing the frozen protocol 1 types (`ScaleReviewPins`,
`ScaleReviewClaim`, `ScaleReviewProtocol`).

**Justification:** Required by the contract's "freeze exported context/pin/gate
shapes" clause. The types formalize the protocol shapes that were previously
implicit.

**Contract impact:** Within the allowed `packages/ai-services/src/` package.
No contract violation. Additive only — no existing shapes modified.

### Amendment 2: `apps/api/src/scale-evidence-migration.test.ts` (MODIFIED)

**What:** Test baseline now excludes post-050A migrations (e.g., 050B) to prevent
FK failures.

**Justification:** The 050A migration test is 050A-focused; 050B has its own
dedicated migration test (`scale-review-migration.test.ts`). Including 050B
migrations in the 050A baseline causes foreign-key failures unrelated to 050A.

**Contract impact:** Test-only change. No production code modified. Bounded to
the test baseline definition.

### Amendment 3: `packages/ai-services/src/policy-errors.ts` (MODIFIED)

**What:** Added `SCALE_ASSESSMENT_INCOMPLETE` to the `PolicyErrorCode` union.

**Justification:** Required for the contract's distinct frozen error code.
Mapping "incomplete assessment" to the generic `HARD_POLICY_VIOLATION` would
lose the semantic distinction the contract requires.

**Contract impact:** Additive to the error code union. No existing codes
modified or removed.

### Amendment 4: `packages/database/prisma/migrations/20261008_nf_wf_050b_scale_decisions/migration.sql` (DOCUMENTED)

**What:** Uses TIMESTAMPTZ(3) not TIMESTAMP(3). Documented rationale.

**Justification:** The Prisma schema explicitly declares `@db.Timestamptz(3)`,
which selects TIMESTAMPTZ(3). This is NOT Prisma's default mapping (plain
`DateTime` maps to TIMESTAMP). The explicit declaration is intentional.

**Contract impact:** Precision (3) matches the contract. Timezone-awareness is
additive and does not change contract semantics. Same pattern as 050A's explicit
`@db.Timestamptz(6)`. Documentation only — the SQL was already correct.

## Review Assessment

All 4 amendments are:
- **Bounded:** Each affects a single file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; all are additive or
  clarifying.

## Prior Review Context

These amendments were included in the repaired diff reviewed by the independent
repair reviewer (verdict: APPROVE_WITH_FINDINGS, 2026-10-09), whose report noted
them as "bounded, documented, do not weaken the contract". However, that was
part of the overall diff review, NOT a dedicated scope-amendment approval per
the contract's amendment procedure.

## Author Action Required

**The author (Klein) is requested to:**
1. Review the 4 amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

**This record does NOT claim author approval.** Approval must be explicitly
recorded by the author. Until then, GAP-119 remains OPEN on the scope-amendment
item.

---

**Provenance:** Created 2026-10-09 during NF-WF-050B Slice 2 (third repair).
Implements GAP-119 re-review requirement: "obtain a recorded separate review
and preserve frozen/historical provenance."
