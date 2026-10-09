# 050B Scope Amendment Review — Amendments 11–12 + Amendment 9 Correction (Independent Review, 2026-10-09)

**Task:** NF-WF-050B (scale review and author decisions)
**Type:** DISTINCT recorded review of Amendments 11–12 and the Amendment 9 test-count correction in the scope amendment proposal
**Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
**Reviewer:** Independent scope-amendment reviewer — a SEPARATE actor from the Slice 3 implementer (backends MODEL_UNVERIFIED per GAP-013). This review does not reuse the Slice 2 reviewer's Amendment 1–4 record nor the Amendments 5–10 record; it is a fresh read of the files and the contract.
**Date:** 2026-10-09
**Input reviewed:** `docs/14-progress/050B-scope-amendment-review-2026-10-09.md` (Amendments 11, 12, Amendment 9 correction note), checked verbatim against the frozen 050B contract `tasks/NF-WF-050B-scale-review-and-author-decisions.md` ("Scope and interfaces" / "Proposed new paths")
**Input revision:** HEAD `e826090` (merge of `origin/main` into `work/nf-wf-050b-scale-review`)

## Amendment 11: `apps/api/src/scale-review-checklist.test.ts` (NEW) — APPROVED (proposed)

**What the proposal says:** 10 pure-function tests for `deriveChecklist` (finding 4): construct context, receipt and applicability; assert the derived deterministic missing-data checklist carries non-empty explanation, example and nextAction for absent/stale receipts, malformed standing and stale evidence. Justification: GAP-119 required the deterministic checklist to be derived from the same validated current context and consumed by the UI. Allowlist status: NOT in the contract's explicit allowlist (same lists as Amendment 6). Semantic change: test-only; no production code modified; no existing passing assertion weakened.

**Verification evidence (reviewer read the file):**
- File exists at the stated path (8,357 bytes; committed as untracked `??`).
- Contains exactly **10 active `it(` blocks**, zero skips/todos (grep count 10; no `it.skip`/`describe.skip`/`xit`/`it.todo`).
- Content matches the description: tests `deriveChecklist`/`deriveReceiptApplicability` against constructed context/receipt/applicability fixtures covering `RECEIPT_ABSENT`, `RECEIPT_LEGACY`, `RECEIPT_STALE` (naming mismatched pins, severity `fail`, `details.reasons` containing `evidenceSetId`), `STANDING_ABSENT`, `STANDING_MALFORMED`, a negative control (valid empty-access standing flags neither), `EVIDENCE_ABSENT`, `EVIDENCE_STALE`, FRESH receipt returning the protocol's `missingData` verbatim, and an empty checklist for fresh-and-complete. The `assertFullText` helper enforces non-empty explanation/example/nextAction on every returned item — exactly the stated claim.
- **Allowlist verbatim check:** Contract "Allowed existing paths" permits only `apps/api/src/{manuscript,narrative,publication,state-consumers,scale-evidence}.test.ts`; "Proposed new paths" permits only `scale-review.test.ts`, `scale-decisions.test.ts`, `scale-review-migration.test.ts`. `scale-review-checklist.test.ts` appears in neither list. The proposal's "NOT in the contract's explicit allowlist" claim is **correct verbatim** — the amendment is genuinely required before the file is in-scope.
- **Bounded / additive / non-weakening:** New test-only file. It imports `deriveChecklist`/`deriveReceiptApplicability` from `./scale-decision-routes.ts` — which is itself a contract-proposed new path, not an out-of-scope production file. No production file is created or modified by this amendment. No existing assertion is altered or weakened. Pure-function tests (no DB), consistent with the AGENTS.md rule for disposable/non-persistent test surfaces.

**Hidden scope expansion check:** None found. The file adds coverage only; it introduces no production module, no new capability, no fixture change.

## Amendment 12: `apps/web/app/components/workspace/ScaleReviewPanel.slice5.test.ts` (NEW) — APPROVED (proposed)

**What the proposal says:** 4 component tests (findings 3 and 4): superseded mutations reconcile the current selection after a deferred POST commits (a review finishing against S1 must not display as fresh after an older POST commits S2); the UI consumes the server's checklist codes with en/id localization and English fallback. Justification: GAP-119 required deferred-POST reconciliation regressions and server-derived checklist consumption verification. Allowlist status: NOT in the contract's explicit allowlist (same as Amendment 8). Semantic change: test-only; no production code modified; no existing passing assertion weakened.

**Verification evidence (reviewer read the file):**
- File exists at the stated path (13,894 bytes; committed as untracked `??`).
- Contains exactly **4 active `it(` blocks**, zero skips/todos (grep count 4; no `it.skip`/`describe.skip`/`xit`/`it.todo`).
- Content matches the description: (1) deferred evidence POST to S2 resolved after a review against S1 completes → UI must render the `review.stale` label (superseded-mutation reconciliation); (2) server-derived checklist rendered in English from i18n keys, asserting the old existence-based label ("SCALE policy configured") is gone; (3) Indonesian rendering with `id` locale strings; (4) English fallback to server text for an unknown code (`SOME_FUTURE_CODE`).
- **Allowlist verbatim check:** Contract "Proposed new paths" lists only `ScaleReviewPanel.vue`, `ScaleReviewPanel.test.ts`, `ScaleReviewPanel.axe.test.ts` for this component. `ScaleReviewPanel.slice5.test.ts` appears in neither list. The proposal's "NOT in the contract's explicit allowlist" claim is **correct verbatim**.
- **Bounded / additive / non-weakening:** New test-only file. It mounts `ScaleReviewPanel.vue` (contract-proposed path) and mocks `useLocale`/`useApi`; i18n dictionaries live only in the mock, not in production `en.ts`/`id.ts` (both allowlisted anyway). No production file created or modified by this amendment; no existing assertion weakened. en/id localization with English fallback complies with the project UI-localization rule (AGENTS.md §10).

**Hidden scope expansion check:** None found. Test-only; no production surface added.

## Amendment 9 test-count correction — CONFIRMED

The proposal's correction note states Amendment 9's file (`apps/web/app/components/workspace/ScaleReviewPanel.slice4.test.ts`) contains **12 active tests, not 7 as first recorded**. Reviewer verification: **12 active `it(` blocks**, zero skips/todos. The correction is accurate; the historical error (7) is preserved in the proposal rather than silently rewritten, consistent with the project provenance rule.

## Author approval — EXPLICITLY NOT CLAIMED

The author is **Klein**. This review records only the reviewer's assessment of the proposed amendments; it does **NOT** claim author approval. Amendments 9, 11 and 12 remain **PROPOSED**. Per the contract's amendment procedure, Klein must record APPROVE or CHANGES_REQUESTED; until then GAP-119 remains OPEN on the scope-amendment item. The proposal doc (`050B-scope-amendment-review-2026-10-09.md`) was **not modified** by this review.

## Additional findings

1. **No findings against the amendments.** Both are test-only additions covering GAP-119 findings 3/4, narrowly scoped to one file each, with no production changes, no allowlist misstatement, and no weakening of existing assertions.
2. **Observation (not a finding):** the slice5 file header states "Written FIRST (red) per task instructions." Whether red-phase tests were run against the unfixed component is not evidenced in the file; this is a test-discipline observation, not a scope issue, and does not affect this amendment review.
3. **Observation (not a finding):** working-tree `git status` shows the two amendment files as untracked (`??`) alongside other branch modifications; this review covers only the two amendment files plus the Amendment 9 count correction, not the rest of the branch diff.

## Verdict summary

- **Amendment 11** (`apps/api/src/scale-review-checklist.test.ts`): path exists, 10 active tests as described, allowlist status correct verbatim (not listed — amendment required), test-only, no hidden scope expansion → **APPROVED as PROPOSED (awaiting author approval).**
- **Amendment 12** (`apps/web/app/components/workspace/ScaleReviewPanel.slice5.test.ts`): path exists, 4 active tests as described, allowlist status correct verbatim (not listed — amendment required), test-only, no hidden scope expansion → **APPROVED as PROPOSED (awaiting author approval).**
- **Amendment 9 correction**: file has 12 active `it(` blocks and no skips → **correction CONFIRMED.**

---

**Provenance:** Written 2026-10-09 by an independent scope-amendment reviewer (separate actor from the Slice 3 implementer; backends MODEL_UNVERIFIED per GAP-013). Based on a fresh read of `docs/14-progress/050B-scope-amendment-review-2026-10-09.md` (Amendments 11–12, Amendment 9 correction note), verbatim comparison against the "Scope and interfaces" / "Proposed new paths" lists in `tasks/NF-WF-050B-scale-review-and-author-decisions.md`, direct reads of the three test files, and `it(` counts plus skip-pattern greps at HEAD `e826090`. The proposal doc was not modified. Author (Klein) approval is explicitly not claimed; all amendments remain PROPOSED.
