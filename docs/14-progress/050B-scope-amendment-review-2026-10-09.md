# 050B Scope Amendment Review Record — 2026-10-09 (Slice 2)

**Task:** NF-WF-050B (scale review and author decisions)
**Type:** Separate scope-amendment review (per contract amendment procedure)
**Status:** RECORDED — AWAITING AUTHOR APPROVAL
**Reviewer:** Slice 2 implementer (separate actor; backends MODEL_UNVERIFIED per GAP-013)
**Date:** 2026-10-09

## Amendments Under Review

The following 4 bounded amendments to the frozen 050B contract (`fed3cea`) are
submitted for separate author approval. Each is documented with its exact path,
justification, allowlist status against the contract's explicit
"Scope and interfaces" lists, and semantic change.

**Correction (2026-10-09, fourth repair):** An earlier version of this record
claimed Amendment 1 was "within the allowed `packages/ai-services/src/`
package." That blanket package-permission claim was incorrect: the contract's
allowlist names exact files, not packages. The corrected allowlist status for
each amendment is recorded below. Historical provenance preserved; the
amendments remain PROPOSED, not approved.

### Amendment 1: `packages/ai-services/src/scale-review-types.ts` (NEW)

**What:** New file containing the frozen protocol 1 types (`ScaleReviewPins`,
`ScaleReviewClaim`, `ScaleReviewProtocol`).

**Justification:** Required by the contract's "freeze exported context/pin/gate
shapes" clause. The types formalize the protocol shapes that were previously
implicit.

**Allowlist status:** NOT in the contract's explicit allowlist. The allowlist
permits `packages/ai-services/src/{scale-evidence,narrative,policy-errors,ai,
revisions,platform}.ts` and `packages/ai-services/index.ts`; a new
`scale-review-types.ts` is not listed. This amendment is therefore REQUIRED
before the file can be considered in-scope — it is proposed here, not assumed.

**Semantic change:** Additive only. New exported types; no existing shapes
modified. No runtime behavior change.

### Amendment 2: `apps/api/src/scale-evidence-migration.test.ts` (MODIFIED)

**What:** Test baseline now excludes post-050A migrations (e.g., 050B) to prevent
FK failures.

**Justification:** The 050A migration test is 050A-focused; 050B has its own
dedicated migration test (`scale-review-migration.test.ts`). Including 050B
migrations in the 050A baseline causes foreign-key failures unrelated to 050A.

**Allowlist status:** NOT in the contract's explicit allowlist. The allowlist
permits `apps/api/src/{manuscript,narrative,publication,state-consumers,
scale-evidence}.test.ts`; `scale-evidence-migration.test.ts` is a different
file and is not listed. This amendment is therefore REQUIRED — proposed here,
not assumed.

**Semantic change:** Test-only. Baseline definition narrowed; no production
code modified. No existing passing assertion weakened (the 050B migrations are
covered by their own dedicated test).

### Amendment 3: `packages/ai-services/src/policy-errors.ts` (MODIFIED)

**What:** Added `SCALE_ASSESSMENT_INCOMPLETE` to the `PolicyErrorCode` union.

**Justification:** Required for the contract's distinct frozen error code.
Mapping "incomplete assessment" to the generic `HARD_POLICY_VIOLATION` would
lose the semantic distinction the contract requires.

**Allowlist status:** IN the contract's explicit allowlist
(`packages/ai-services/src/{...,policy-errors,...}.ts`). No amendment strictly
required for the path; recorded here for completeness because the error-code
addition is a contract-visible semantic change.

**Semantic change:** Additive to the error-code union. No existing codes
modified or removed. No behavior change for existing codes.

### Amendment 4: `packages/database/prisma/migrations/20261008_nf_wf_050b_scale_decisions/migration.sql` (DOCUMENTED)

**What:** Uses TIMESTAMPTZ(3) not TIMESTAMP(3). Documented rationale.

**Justification:** The Prisma schema explicitly declares `@db.Timestamptz(3)`,
which selects TIMESTAMPTZ(3). This is NOT Prisma's default mapping (plain
`DateTime` maps to TIMESTAMP). The explicit declaration is intentional.

**Allowlist status:** The contract permits "one new migration under
`packages/database/prisma/migrations/<new timestamp>_scale_review_decisions/`".
The actual migration directory is `20261008_nf_wf_050b_scale_decisions` — the
name pattern differs from the contract's placeholder. The SQL itself was not
modified by this amendment; only the rationale is documented. Recorded here
because the directory name deviates from the contract's stated pattern.

**Semantic change:** Documentation only. The SQL was already correct;
precision (3) matches the contract. No schema change.

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
