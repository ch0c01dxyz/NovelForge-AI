# 050B Scope Amendments 21–22 — Independent Review (ninth repair, 2026-10-09)

**Task:** NF-WF-050B (scale review and author decisions), ninth repair
**Type:** Independent scope-amendment review of a separate actor's proposal
record (per contract amendment procedure)
**Status:** REVIEWED — PROPOSED ONLY — AWAITING AUTHOR APPROVAL
**Reviewer:** Amendments 21–22 independent reviewer (separate actor;
distinct from the Items 2+3 implementer and from the Slice 2/3
implementers who authored the proposal record; backends MODEL_UNVERIFIED
per GAP-013)
**Date:** 2026-10-09

**Reviewed commit (input):** `66f9b5b7675ed886e5dc6eb1d61f33f1915c7b59`
(branch `work/nf-wf-050b-scale-review`)

**Proposal record reviewed:**
`docs/14-progress/050B-scope-amendment-review-2026-10-09.md`,
"Amendments 21–22 (ninth repair, 2026-10-09)" section.
The proposal record itself is read-only for this review; it was not
modified.

**Engram:** unavailable (GAP-021); file-based handoff. No session ID is
claimed or invented.

## Exact artifacts reviewed (working-tree bytes at review time)

| Amendment | Path | SHA-256 (exact working-tree bytes) |
|---|---|---|
| 21 | `apps/api/src/scale-no-scale-receipt.test.ts` | `16225b55e50058998a5943c713683f7ff7fa68fbf1b4f3442695dbc7e31cac03` |
| 22 | `apps/api/src/scale-exception-workspace.test.ts` | `9c1f9b7d8c07409afface95083d92957a2bd4ead367dd35d219bdf448305391a` |

- Amendment 21's file was **modified in the working tree** relative to the
  input commit (uncommitted `M`; the 53-line ninth-repair Item 1
  malformed-proof negative was already present in the bytes reviewed).
  The hash above covers those exact bytes, including the Item 1
  extension.
- Amendment 22's file was **clean** relative to the input commit (tracked,
  no working-tree modifications); the hash covers the committed bytes.

## Amendment 21: `apps/api/src/scale-no-scale-receipt.test.ts` (NEW)

**Record claims verified:**
- **Exact path:** `apps/api/src/scale-no-scale-receipt.test.ts` — matches
  the file reviewed.
- **Justification tied to a GAP-119 finding:** VERIFIED against
  `docs/implementation/ISSUES-AND-GAPS.md`.
  - "GAP-119 (seventh repair re-review, finding 1 — P1)" matches the
    register entry "GAP-119 seventh repair re-review — 2026-10-09,
    88883c4", remaining closure requirement 1: "New no-SCALE reviews are
    incorrectly marked legacy (P1). … Always emit NOT_CONFIGURED with
    explicit absence and current pins for new reviews after successful
    context resolution; null is reserved for historical receipts. Add
    real new-review/head-change refusal and genuine historical-null
    compatibility tests."
  - "GAP-119 (eighth repair re-review)" matches the register entry
    "GAP-119 eighth repair re-review — 2026-10-09, 97da59c", remaining
    source blocker (P2): "final-text-review-gate.ts697–710 conflates
    invalid non-null JSON with a genuinely null historical protocol. …
    Reserve legacy compatibility for receipt.scaleReview === null; reject
    non-null parse failures as REVIEW_STALE before compatibility. Add
    real-caller negatives for malformed non-null proof with no SCALE rows
    and current matching head…" The same entry's scope/handoff
    requirement explicitly orders: "Add bounded exact-path amendments for
    scale-no-scale-receipt.test.ts and scale-exception-workspace.test.ts;
    … Obtain separate review with exact input hashes; do not introduce
    another unregistered test file while fixing the boundary." This
    review is that ordered separate review.
- **Verbatim-checked contract allowlist status:** VERIFIED. I read
  `tasks/NF-WF-050B-scale-review-and-author-decisions.md` ("Scope and
  interfaces") directly. The allowed API test paths are exactly
  `apps/api/src/{manuscript,narrative,publication,state-consumers,
  scale-evidence}.test.ts`; the proposed new paths are
  `scale-review.test.ts`, `scale-decisions.test.ts`,
  `scale-review-migration.test.ts`. `scale-no-scale-receipt.test.ts`
  appears in neither list. The record's claim "NOT in the contract's
  explicit allowlist … Amendment REQUIRED — proposed here, not assumed"
  is correct.
- **Semantic change description:** VERIFIED against the file bytes. The
  file contains 5 `it` blocks in one `describe`:
  1. "a new no-SCALE review produces a pinned NOT_CONFIGURED protocol",
  2. "a subsequent non-SCALE head change makes the no-SCALE receipt
     REVIEW_STALE",
  3. "genuine historical null receipts retain compatibility at the same
     head",
  4. "a genuine historical null receipt goes REVIEW_STALE after head
     advance",
  5. "a malformed non-null stored protocol is REVIEW_STALE, never
     legacy" (the ninth-repair Item 1 addition; asserts
     `parseScaleReviewProtocol(malformed)` is null, 409 REVIEW_STALE via
     real Fastify `app.inject` PATCH `.../status`, and no side effects —
     chapter status unchanged, corrupt row preserved).
  This matches the record's "What" paragraph. Real callers
  (`buildApp` + `app.inject`) and a dedicated disposable scratch DB
  (`novelforge_test_scale_no_scale`) are confirmed in the file.

**Test-only, non-weakening:** VERIFIED. The file contains zero `export`
statements (pure test file), imports only test infrastructure (vitest,
`pg`, `@novelforge/database` `createDb`, `buildApp`, ai-services read
helpers), uses no `vi.mock`/`vi.spyOn`, performs no filesystem writes to
production paths, and touches only its disposable scratch database. No
pre-existing passing assertion exists in this new file to weaken.

**Verdict: ACCEPT as proposed amendment.** The amendment is bounded,
documented, correctly tied to the cited GAP-119 findings, correctly
stated as outside the allowlist, and test-only.

## Amendment 22: `apps/api/src/scale-exception-workspace.test.ts` (NEW)

**Record claims verified:**
- **Exact path:** `apps/api/src/scale-exception-workspace.test.ts` —
  matches the file reviewed.
- **Justification tied to a GAP-119 finding:** VERIFIED against
  `docs/implementation/ISSUES-AND-GAPS.md`. "GAP-119 (seventh repair
  re-review, finding 2 — P2)" matches the register entry "GAP-119
  seventh repair re-review — 2026-10-09, 88883c4", remaining closure
  requirement 2: "Strict exception workspace provenance remains
  unchecked (P2). Resolver select/checks … omit both
  proposal.workspaceId and outcome.workspaceId. … Validate both against
  the authorized context workspace; add corrupted-retained-row negatives
  preserving history, plus an owned valid approval control."
- **Verbatim-checked contract allowlist status:** VERIFIED against the
  same "Scope and interfaces" lists cited above.
  `scale-exception-workspace.test.ts` appears in neither the allowed API
  test paths nor the proposed new paths. The record's "NOT in the
  contract's explicit allowlist … Amendment REQUIRED — proposed here,
  not assumed" is correct.
- **Semantic change description:** VERIFIED against the file bytes. The
  file contains exactly 3 `it` blocks, matching the record's "3
  DB-backed tests":
  1. "accepts a valid owned exception (same workspace control)" —
     `resolveApplicableExceptionStrict` with the authorized context
     workspace returns the outcome/proposal (control).
  2. "FAIL CLOSED: foreign proposal.workspaceId is rejected (history
     preserved)" — corrupts the retained proposal row's `workspaceId`,
     asserts the row still exists (history preserved) and the resolver
     returns null.
  3. "FAIL CLOSED: foreign outcome.workspaceId is rejected (history
     preserved)" — same for the outcome row.
  Both `proposal.workspaceId` and `outcome.workspaceId` are validated
  against the authorized context workspace, as claimed. Dedicated
  disposable scratch DB
  (`novelforge_test_scale_exception_workspace`); no working data
  touched.

**Test-only, non-weakening:** VERIFIED. Zero `export` statements; imports
limited to vitest, `pg`, `@novelforge/database` `createDb`, test-DB
helpers, and ai-services read helpers (`createScaleDecisionServices`,
`createAuditService`, `fingerprintScalePolicy`,
`resolveApplicableExceptionStrict`, `readScaleContext`). No mocks, no
production writes. New file; nothing to weaken.

**Verdict: ACCEPT as proposed amendment.** Bounded, documented, correctly
tied to the cited GAP-119 finding, correctly stated as outside the
allowlist, and test-only.

## Observations (non-blocking)

1. **Working-tree production changes adjacent to Amendment 21.** At
   review time the working tree also contains uncommitted production
   changes in `packages/ai-services/src/final-text-review-gate.ts` and
   `apps/api/src/scale-decision-routes.ts` implementing the
   malformed-proof refusal (`scaleReviewRaw` distinction:
   `receipt.scaleReview !== null && !parseScaleReviewProtocol(...)` →
   REVIEW_STALE before any legacy handling; `deriveChecklist`
   RECEIPT_STALE fail vs RECEIPT_LEGACY warn). These changes are
   logically required for Amendment 21's 5th test to pass, but they are
   NOT introduced by Amendment 21 — the amendment regularizes only the
   test-file path, and the record's "Test-only. No production code
   modified" is accurate for the amendment itself. Both production paths
   are verbatim in the contract's "Proposed new paths" allowlist
   (`packages/ai-services/src/final-text-review-gate.ts`,
   `apps/api/src/scale-decision-routes.ts`), so no additional scope
   amendment is required for them. The direction is fail-closed
   (strengthening, not weakening); the related `scale-review-checklist.test.ts`
   (Amendment 11's file) carries +27 uncommitted lines, consistent with
   the sibling Items 2+3 implementer's scope. Flagged here only to keep
   the amendment boundary explicit; no double-scope claim is made.
2. **Re-hash condition (Amendment 21).** `scale-no-scale-receipt.test.ts`
   is concurrently being extended by the sibling ninth-repair Item 1
   implementer and was already modified in the working tree at review
   time. The SHA-256 above (`16225b55…cac03`) covers exactly the bytes
   I reviewed — which already include the malformed-proof negative. If
   the file changes again after this review, the hash MUST be
   re-verified before acceptance; this review does not cover any later
   bytes.
3. Both files follow the project's disposable-scratch-DB convention and
   exercise real boundaries (Fastify inject / direct resolver calls
   inside gate locks), consistent with the contract's "real boundary"
   evidence standard.

## Non-claim of author approval

**This independent review does NOT claim author approval of Amendments
21–22.** Approval is the author's (Klein's) alone to record. The
proposal record itself states (for the 21–22 section): "This record does
NOT claim author approval. Approval must be explicitly recorded by the
author. Until then, GAP-119 remains OPEN on the scope-amendment item."
and "The author (Klein) is requested to: 1. Review the 2 additional
amendments above. 2. Record APPROVE or CHANGES_REQUESTED for the scope
amendments." No approval, identity, or test result is invented in this
report. GAP-119 remains OPEN on the scope-amendment item pending the
author's explicit decision.

## Review method

Read-only: the proposal record, the contract's "Scope and interfaces"
section, both amendment files in full (headers, test bodies, imports),
`git diff`/`git status`/`git log` for working-tree vs commit state, and
the GAP-119 register entries in `docs/implementation/ISSUES-AND-GAPS.md`.
No test was executed (review scope is the amendments, not the
verification battery); no file was modified; the proposal record was not
edited. This reviewer is a separate actor from the Items 2+3
implementer and from the proposal record's authors; backends
MODEL_UNVERIFIED per GAP-013. Engram unavailable (GAP-021) — recorded
here, no session ID invented.
