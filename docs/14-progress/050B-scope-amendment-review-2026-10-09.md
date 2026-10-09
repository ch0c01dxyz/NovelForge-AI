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

## Additional Amendments (fifth repair, 2026-10-09)

GAP-119 fourth repair re-review (finding 6) noted that the independent
amendment report covers Amendments 1–4 but not six additional paths outside
the frozen exact allowlist, introduced during the third/fourth/fifth
repairs. The following Amendments 5–10 regularize every such path. Each is
documented with its exact path, justification, allowlist status against the
contract's explicit "Scope and interfaces" lists, and semantic change.
All remain PROPOSED until the author approves.

### Amendment 5: `apps/web/app/components/workspace/ScalePayloadForm.vue` (NEW)

**What:** New Vue component with typed authoring controls for SCALE
proposal/alternative payloads. Replaces the raw JSON textareas in
`ScaleReviewPanel.vue`. STANDING_CHANGE: scale select (8 frozen scales),
access checkboxes, reputation number (0–100), hardness select, hard-reason
text. CHAPTER_EXCEPTION: claim checkboxes rendered from the current evidence
set's conflicts. `buildPayload()` produces exactly the server-validated
shapes.

**Justification:** GAP-119 required replacing raw JSON-only
standing/exception/alternative authoring with typed controls following the
existing design system. The component is the implementation of that
requirement.

**Allowlist status:** NOT in the contract's explicit allowlist. The proposed
new paths list `ScaleReviewPanel.vue`, `ScaleReviewPanel.test.ts` and
`ScaleReviewPanel.axe.test.ts`; `ScalePayloadForm.vue` is not listed. This
amendment is therefore REQUIRED — proposed here, not assumed.

**Semantic change:** New production UI component (228 lines). No existing
component modified beyond consuming it. i18n keys added to `en.ts`/`id.ts`
(both already in the allowlist). No behavior change for existing surfaces.

### Amendment 6: `apps/api/src/scale-policy-direct.test.ts` (NEW)

**What:** 4 DB-backed tests proving direct SCALE policy hardness PUT/DELETE
refuse obsolete chapter versions (409) with zero policy/revision/checkpoint/
change-set/audit writes.

**Justification:** GAP-119 required obsolete-version refusal for direct
policy mutations with zero-writes proof at the real boundary.

**Allowlist status:** NOT in the contract's explicit allowlist. The allowed
test paths are `{manuscript,narrative,publication,state-consumers,
scale-evidence}.test.ts`; the proposed new paths are `scale-review.test.ts`,
`scale-decisions.test.ts`, `scale-review-migration.test.ts`. This file is
not listed. Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 7: `apps/api/src/scale-review-context.test.ts` (NEW)

**What:** 5 HTTP-boundary tests (Fastify inject) proving the coherent
context snapshot: version resolved inside RepeatableRead transaction,
15-iteration concurrent version+head advance race, ABSENT/FRESH/STALE
applicability, and exception source-revision filtering.

**Justification:** GAP-119 required proving the context is a coherent
snapshot with version/head changes during read.

**Allowlist status:** NOT in the contract's explicit allowlist (same lists
as Amendment 6). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 8: `apps/web/app/components/workspace/ScaleReviewPanel.slice3.test.ts` (NEW)

**What:** 12 component tests proving real 050A assessment/history records
render with `conflicts` (not invented `claims`), server-computed receipt
applicability (stale/fresh pins), Indonesian locale, English fallback,
loading/error/stale states, and selection-change invalidation.

**Justification:** GAP-119 required testing saved assessments/history
against actual server response types and server-computed applicability.

**Allowlist status:** NOT in the contract's explicit allowlist. The proposed
new paths list only `ScaleReviewPanel.test.ts` and
`ScaleReviewPanel.axe.test.ts`. Amendment REQUIRED — proposed here, not
assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 9: `apps/web/app/components/workspace/ScaleReviewPanel.slice4.test.ts` (NEW)

**What:** 12 component tests proving superseded-response rejection
(correction 2026-10-09: the file contains 12 active tests, not 7 as first
recorded)
(older same-selection responses completing last do not overwrite newer
data), typed `ScalePayloadForm` payload shapes, and en/id localization
with English fallback.

**Justification:** GAP-119 required deferred-response tests with older
responses completing last, and typed author-control verification.

**Allowlist status:** NOT in the contract's explicit allowlist (same as
Amendment 8). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 10: `apps/api/src/scale-gate-live-semantics.test.ts` (NEW)

**What:** 4 DB-backed tests exercising the shared API/worker gate
(`checkFinalTextReviewGate`): NOT_CONFIGURED with matching pins but a
configured live policy fails closed; NO_OPERATIVE_CONFLICT with matching
pins but a CONFLICTS live evidence set fails closed; plus two positive
controls (genuine NOT_CONFIGURED and genuine NO_OPERATIVE_CONFLICT pass).

**Justification:** GAP-119 required negative tests validating retained
SCALE state against live policy/evidence semantics at the shared gate
boundary.

**Allowlist status:** NOT in the contract's explicit allowlist (same lists
as Amendment 6). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

## Review Assessment (Amendments 5–10)

All 6 additional amendments are:
- **Bounded:** Each affects a single new file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; 5 are test-only,
  1 is a new UI component implementing a GAP-119 requirement.

## Author Action Required (Amendments 5–10)

**The author (Klein) is requested to:**
1. Review the 6 additional amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

### Amendment 11: `apps/api/src/scale-review-checklist.test.ts` (NEW)

**What:** 10 pure-function tests for `deriveChecklist` (finding 4):
construct context, receipt and applicability, assert the derived
deterministic missing-data checklist carries non-empty explanation, example
and nextAction for absent/stale receipts, malformed standing and stale
evidence.

**Justification:** GAP-119 required the deterministic checklist to be
derived from the same validated current context and consumed by the UI.

**Allowlist status:** NOT in the contract's explicit allowlist (same lists
as Amendment 6). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 12: `apps/web/app/components/workspace/ScaleReviewPanel.slice5.test.ts` (NEW)

**What:** 4 component tests (findings 3 and 4): superseded mutations
reconcile the current selection after a deferred POST commits (a review
finishing against S1 must not display as fresh after an older POST commits
S2); the UI consumes the server's checklist codes with en/id localization
and English fallback.

**Justification:** GAP-119 required deferred-POST reconciliation
regressions and server-derived checklist consumption verification.

**Allowlist status:** NOT in the contract's explicit allowlist (same as
Amendment 8). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

## Review Assessment (Amendments 5–12)

All 8 additional amendments are:
- **Bounded:** Each affects a single new file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; 7 are test-only,
  1 is a new UI component implementing a GAP-119 requirement.

## Author Action Required (Amendments 5–12)

**The author (Klein) is requested to:**
1. Review the 8 additional amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

**This record does NOT claim author approval.** Approval must be explicitly
recorded by the author. Until then, GAP-119 remains OPEN on the scope-amendment
item.

---

**Provenance:** Created 2026-10-09 during NF-WF-050B Slice 2 (third repair).
Implements GAP-119 re-review requirement: "obtain a recorded separate review
and preserve frozen/historical provenance."

**Provenance (Amendments 5–10):** Appended 2026-10-09 during NF-WF-050B
fifth repair (Slice 3). Implements GAP-119 fourth repair re-review finding 6:
"Regularize every additional path outside the frozen allowlist." Amendments
1–4 above are unchanged; their independent review
(`050B-scope-amendment-independent-review-2026-10-09.md`) stands.

### Amendment 13: `apps/api/src/scale-proof-completeness.test.ts` (NEW)

**What:** 5 DB-backed tests (sixth repair, finding 1): the shared complete
proof-consistency check. 4 negatives (WITHIN_REACH/empty-claims/matching-pins
under HARD with ABSENT evidence, STALE evidence, MALFORMED standing,
inconsistent exception/claim coverage) + 1 positive (genuine WITHIN_REACH
with real claims passes).

**Justification:** GAP-119 required negative proofs for absent/stale/malformed
sources and inconsistent exception/claim coverage against the complete
producer/live comparison.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 14: `apps/api/src/scale-context-gate-agreement.test.ts` (NEW)

**What:** DB-backed tests (sixth repair, finding 2): the context endpoint's
applicability agrees with the release gate for contradictory retained
receipts. A gate-rejected receipt is never labeled FRESH by the context
endpoint.

**Justification:** GAP-119 required actual context endpoint responses tested
against gate results, including stale checklist guidance.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 15: `apps/web/app/components/workspace/ScaleReviewPanel.slice6.test.ts` (NEW)

**What:** 3 component tests + 1 author-workflow test (4 total) (sixth
repair, finding 3): successful review refreshes coherent context after
EVERY successful review (ABSENT-to-fresh and STALE-to-fresh transitions
update receipt, applicability and checklist); busy-state cleanup preserved.
Plus 1 complete author-workflow test (proposal → decision → re-review)
against real response shapes.

**Justification:** GAP-119 required ABSENT-to-fresh and STALE-to-fresh
transition proofs and author-workflow acceptance evidence.

**Allowlist status:** NOT in the contract's explicit allowlist (same as
Amendment 8). Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 16: `apps/api/src/scale-gate-callers.test.ts` (NEW)

**What:** 4 DB-backed tests (sixth repair, acceptance): the REAL API route
callers of the shared SCALE gate. PATCH .../status (setStatus) with a
contradictory retained receipt → 409 REVIEW_STALE; genuine receipt from the
real review route → 200; save-vs-setStatus race → consistent outcome, never
a 500; DRAFT→IN_REVIEW with contradictory receipt → 409.

**Justification:** GAP-119 required real caller/lock/race and refusal
evidence through actual API routes, not DB-backed helpers alone.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 17: `apps/worker/src/scale-gate-fire.test.ts` (NEW)

**What:** 3 DB-backed tests (sixth repair, acceptance): the REAL scheduled
worker (`fireScheduledPublication`) with SCALE gate scenarios. Contradictory
retained receipt → refused + REVIEW_STALE + UNPUBLISHED (audit-logged);
genuine legacy PASS receipt with no SCALE rows → published (legacy
compatibility); no receipt → refused + REVIEW_STALE.

**Justification:** GAP-119 required actual scheduled-worker execution with
SCALE gate checks, not mocked workers.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

## Review Assessment (Amendments 13–17)

All 5 additional amendments are:
- **Bounded:** Each affects a single new test file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; all 5 are test-only.

## Author Action Required (Amendments 13–17)

**The author (Klein) is requested to:**
1. Review the 5 additional amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

**This record does NOT claim author approval.** Approval must be explicitly
recorded by the author. Until then, GAP-119 remains OPEN on the scope-amendment
item.

---

*Sixth-repair note (2026-10-09): Amendments 13–17 added by the Slice 3
implementer. A distinct independent review of Amendments 13–17 follows
in a separate record. Engram unavailable (GAP-021); file-based handoff.*

### Amendment 18: `apps/api/src/scale-exception-strict.test.ts` (NEW)

**What:** 8 DB-backed tests (seventh repair, Slice 1): the SHARED strict
applicable-exception resolver (`resolveApplicableExceptionStrict`) at real
caller boundaries — the publication gate (`checkFinalTextReviewGate`) and
the context endpoint. Valid full/partial exception coverage accepted;
corrupted `[0,0]` duplicate indices, out-of-bounds, empty, unknown-key and
non-violating-claim coverage all fail closed with audit history preserved.

**Justification:** GAP-119 (sixth repair re-review, source blocker) required
strict retained exception validation — the loose `claimIndices` casts in
`final-text-review-gate.ts` and `final-text-review.ts` accepted any integer
array. This test file proves the shared resolver at the real gate and
context boundaries.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

**State note (eighth repair):** At the time of this amendment record the file
carries uncommitted changes from the eighth repair's Items 1+2 (7 added
lines: `workspaceId: f.workspaceId` arguments to resolver calls). The
independent reviewer must review the exact bytes at review time; the input
hash below is the current working-tree hash.

### Amendment 19: `apps/api/src/scale-gate-publish.test.ts` (NEW)

**What:** 4 DB-backed tests (seventh repair, Slice 2): the ACTUAL
immediate-publication route (`POST .../publication/publish` →
`publishChapter` → `assertPublishReviewGate` → `checkFinalTextReviewGate`)
via real Fastify inject. Genuine SCALE receipt → 200 PUBLISHED;
contradictory retained receipt → 409 REVIEW_STALE (stays DRAFT, no
publication row); evidence-set pin change → 409; policy-change race →
consistent outcome, never 500.

**Justification:** GAP-119 (sixth repair re-review, acceptance) required
real caller/lock/race and refusal evidence through actual API routes —
the sixth repair's caller suite covered status transitions, not immediate
publication.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 20: `apps/worker/src/scale-gate-fire-scale.test.ts` (NEW)

**What:** 4 DB-backed tests (seventh repair, Slice 2): the REAL scheduled
worker (`fireScheduledPublication`) with FRESH configured SCALE (not
legacy/no-SCALE). Genuine fresh SCALE receipt (computed with the shared
deterministic assessor) → PUBLISHED; contradictory retained receipt →
refused + REVIEW_STALE + UNPUBLISHED (audit-logged); evidence-set and
policy-fingerprint pin changes → refused + UNPUBLISHED.

**Justification:** GAP-119 (sixth repair re-review, acceptance) required
fresh configured-SCALE scheduled-worker success/refusal proofs — the sixth
repair's worker suite covered contradictory refusal and legacy success only.

**Allowlist status:** NOT in the contract's explicit allowlist. Amendment
REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

**Post-review update (2026-10-09, eighth repair final checks) — preserved
historical receipt + subsequent change annotation:** The 18–20 independent
review's exact-artifact receipt for this file is
`a009dd2c1d51d7ae4a57fd98d68fdb46df6c80a82b0b9044d60d25f5d82491ea`.
That receipt covers ONLY the pre-change bytes; it does NOT cover any
subsequent change. After the independent review, the final-checks actor
added ONE additive line to this file (`workspaceId: seed.workspaceId,`
at line 234, inside the `genuineScaleProtocol` helper's
`resolveApplicableExceptionStrict` call — required by the eighth-repair Item 2 signature change;
worker typecheck failed without it). The post-change bytes (as submitted
in 97da59c) hash to
`bdb4f5015a66cef857d07826cc4c47c491262e0e4dc8f6bc15ff320db7b90d9e`.
The change is additive-only (zero removed or modified lines, no
assertion altered); worker 4/4 tests pass on the changed bytes. The
independent reviewer had already flagged this exact re-hash condition.
No claim is made that the old exact-artifact receipt covers the changed
bytes; a separate review of the actual submitted bytes is recorded in
the ninth repair (see Amendment 20 actual-bytes review record).
Author approval remains explicitly unclaimed.

## Review Assessment (Amendments 18–20)

All 3 additional amendments are:
- **Bounded:** Each affects a single new test file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; all 3 are test-only.

## Author Action Required (Amendments 18–20)

**The author (Klein) is requested to:**
1. Review the 3 additional amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

**This record does NOT claim author approval.** Approval must be explicitly
recorded by the author. Until then, GAP-119 remains OPEN on the scope-amendment
item.

---

## Amendments 21–22 (ninth repair, 2026-10-09)

### Amendment 21: `apps/api/src/scale-no-scale-receipt.test.ts` (NEW)

**What:** DB-backed tests (eighth repair, Item 1; extended in ninth repair,
Item 1): NEW reviews on novels with no SCALE rows must emit a pinned
NOT_CONFIGURED protocol (never null); null reserved for genuine historical
(pre-050B) receipts; gate compares head for no-SCALE receipts
(REVIEW_STALE on head advance). Through real callers (Fastify inject):
new no-SCALE review → pinned NOT_CONFIGURED; non-SCALE policy/head change
→ REVIEW_STALE; historical null at same head → legacy PASS; historical
null after head advance → REVIEW_STALE. Ninth-repair Item 1 adds a
malformed non-null stored-protocol negative (refused, no side effects)
reusing this file — no new test file introduced.

**Justification:** GAP-119 (seventh repair re-review, finding 1 — P1)
required new no-SCALE reviews to emit NOT_CONFIGURED with explicit policy
absence and current pins; GAP-119 (eighth repair re-review) requires
malformed non-null proof to be refused as REVIEW_STALE before any legacy
handling, with real-caller negatives in this existing file.

**Allowlist status:** NOT in the contract's explicit allowlist. The allowed
API test paths are `{manuscript,narrative,publication,state-consumers,
scale-evidence}.test.ts`; the proposed new paths are `scale-review.test.ts`,
`scale-decisions.test.ts`, `scale-review-migration.test.ts`. This file is
not listed. Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

### Amendment 22: `apps/api/src/scale-exception-workspace.test.ts` (NEW)

**What:** 3 DB-backed tests (eighth repair, Item 2): the shared strict
exception resolver selects and validates BOTH `proposal.workspaceId` and
`outcome.workspaceId` against the authorized context workspace. Corrupted
retained rows with foreign workspace fields fail closed (null) with audit
history preserved; a valid owned exception (same workspace) is accepted
as control. Disposable database
(`novelforge_test_scale_exception_workspace`); no working data touched.

**Justification:** GAP-119 (seventh repair re-review, finding 2 — P2)
required the strict resolver to validate proposal/outcome workspace
provenance against the authorized context workspace, with
corrupted-retained-row negatives preserving history plus an owned valid
approval control.

**Allowlist status:** NOT in the contract's explicit allowlist. The allowed
API test paths are `{manuscript,narrative,publication,state-consumers,
scale-evidence}.test.ts`; the proposed new paths are `scale-review.test.ts`,
`scale-decisions.test.ts`, `scale-review-migration.test.ts`. This file is
not listed. Amendment REQUIRED — proposed here, not assumed.

**Semantic change:** Test-only. No production code modified. No existing
passing assertion weakened.

## Review Assessment (Amendments 21–22)

Both additional amendments are:
- **Bounded:** Each affects a single new test file with a narrow, well-defined scope.
- **Documented:** Justification and contract impact recorded above.
- **Non-weakening:** None relax contract requirements; both are test-only.
- **No new unregistered files:** the ninth-repair malformed-proof negative
  reuses the Amendment 21 file; no additional test file is introduced.

## Author Action Required (Amendments 21–22)

**The author (Klein) is requested to:**
1. Review the 2 additional amendments above.
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments.
3. If approved, the amendments are regularized per the contract procedure.

**This record does NOT claim author approval.** Approval must be explicitly
recorded by the author. Until then, GAP-119 remains OPEN on the scope-amendment
item.

---

*Eighth-repair note (2026-10-09): Amendments 18–20 added by the Items 3+4
implementer. A distinct independent review of Amendments 18–20 follows
in a separate record. Engram unavailable (GAP-021); file-based handoff.*

---

## Final amendment hash verification (ninth repair, 2026-10-09)

Verified by the Items 2+3 implementer AFTER all implementer edits, against
the actual working-tree bytes (input commit `66f9b5b`):

| Amendment | Exact path | SHA-256 (final) | Independently reviewed |
|---|---|---|---|
| 18 | `apps/api/src/scale-exception-strict.test.ts` | `cd727b5e74cbd97ea0c2cbab46b74c8799fc69faa28b4851ffb65d14cd71e8a9` | 18–20 report ✅ match |
| 19 | `apps/api/src/scale-gate-publish.test.ts` | `71edba2296f3bb4f447ca1890c208666a9fda6bf52cc5092e75a849364641ab8` | 18–20 report ✅ match |
| 20 | `apps/worker/src/scale-gate-fire-scale.test.ts` | `bdb4f5015a66cef857d07826cc4c47c491262e0e4dc8f6bc15ff320db7b90d9e` | Actual-bytes review ✅ ACCEPT (historical `a009dd2c…` covers pre-change bytes only) |
| 21 | `apps/api/src/scale-no-scale-receipt.test.ts` | `16225b55e50058998a5943c713683f7ff7fa68fbf1b4f3442695dbc7e31cac03` | 21–22 report ✅ ACCEPT (re-hash required if the file changes again — the ninth-repair Item 1 sibling slice was still extending this file at review time) |
| 22 | `apps/api/src/scale-exception-workspace.test.ts` | `9c1f9b7d8c07409afface95083d92957a2bd4ead367dd35d219bdf448305391a` | 21–22 report ✅ ACCEPT (clean) |

**Notes:**
- Amendment 21's hash covers the file bytes as extended by the ninth-repair
  Item 1 sibling slice (malformed-proof negative). If the sibling edits this
  file further before commit, the hash must be re-verified.
- Author approval is explicitly NOT claimed for any amendment; GAP-119 stays
  OPEN on the scope-amendment item until the author (Klein) records a decision.
- Engram unavailable (GAP-021); file-based handoff only.
