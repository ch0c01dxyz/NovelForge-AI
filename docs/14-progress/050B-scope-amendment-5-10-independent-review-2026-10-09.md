# 050B Scope Amendment Independent Review — Amendments 5–10 (fifth repair, 2026-10-09)

**Task:** NF-WF-050B (scale review and author decisions)
**Type:** DISTINCT recorded review of Amendments 5–10 (separate from the Slice 3
implementer and from the Amendments 1–4 review record)
**Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
**Reviewer:** Independent scope-amendment reviewer (SEPARATE actor from the Slice 3
implementer; backends MODEL_UNVERIFIED per GAP-013)
**Date:** 2026-10-09
**Input reviewed:** `docs/14-progress/050B-scope-amendment-review-2026-10-09.md`,
"Additional Amendments (fifth repair, 2026-10-09)" section (Amendments 5–10)
**Contract checked:** `tasks/NF-WF-050B-scale-review-and-author-decisions.md`,
"Scope and interfaces" allowlist and "Proposed new paths" list, verbatim
**Input revision (HEAD):** `e8260903999bb05ad31393d0e7eddef9e0c7c300`
(`e826090 Merge remote-tracking branch 'origin/main' into work/nf-wf-050b-scale-review`,
2026-10-09 13:04:18 +0700). Working tree carried modifications and two
untracked files at review time (see Findings).

**Method:** For each amendment: (1) confirmed the file exists at the stated
path and its content matches the description; (2) checked the proposal's
allowlist status VERBATIM against the contract's "Scope and interfaces"
existing-paths list and "Proposed new paths" list; (3) judged whether the
semantic change is bounded / additive / non-weakening; (4) looked for hidden
scope expansion.

---

## Verdicts

### Amendment 5: `apps/web/app/components/workspace/ScalePayloadForm.vue` (NEW)
**Verdict: ACCEPT as proposed amendment.**

- **Existence/content (OBSERVED):** File exists, 228 lines. Script defines a
  `STANDING_CHANGE | CHAPTER_EXCEPTION` typed form with `NARRATIVE_SCALES` of
  8 frozen scales, access-scale checkboxes, reputation input validated as
  integer 0–100, HARD/SOFT hardness select, hard-reason text required for
  HARD, and `CHAPTER_EXCEPTION` claim checkboxes rendered from a `conflicts`
  prop (`Array<{ scale, relevance, explanation }>`). `buildPayload()`
  produces exactly the server-validated shapes; a `reset()` is exposed. The
  component makes no network/API/fetch calls — pure UI plus i18n. Matches the
  proposal description.
- **Allowlist status (VERBATIM):** The proposal correctly records this file
  as NOT in the contract's explicit allowlist. The proposed new paths list
  only `ScaleReviewPanel.vue`, `ScaleReviewPanel.test.ts` and
  `ScaleReviewPanel.axe.test.ts`. Amendment is therefore REQUIRED — correctly
  stated as proposed, not assumed. The only existing files touched are
  `apps/web/app/i18n/{en,id}.ts` (every consumed `workspace.scaleReview.payload.*`
  key verified present in both `en.ts` and `id.ts` at line 848 blocks, with
  en/id parity) — both in the contract's existing-paths allowlist — and
  `ScaleReviewPanel.vue`, which is itself a proposed new path and consumes the
  component via two `ScalePayloadForm` usages (import verified, lines 20/1274/1364).
- **Semantics:** Bounded single new UI file; additive. It replaces the raw
  JSON textareas in the panel, which is the GAP-119-mandated requirement
  ("no raw JSON-only authoring"), not a contract weakening. No behavior change
  to any existing allowed surface beyond the panel consuming it.
- **Hidden scope expansion:** None observed.

### Amendment 6: `apps/api/src/scale-policy-direct.test.ts` (NEW)
**Verdict: ACCEPT as proposed amendment.**

- **Existence/content (OBSERVED):** File exists, 350 lines, 4 active `it()`
  blocks: obsolete-version hardness PUT 409 with zero writes, current-version
  hardness PUT accepted, obsolete-version DELETE 409 with zero writes,
  current-version DELETE accepted. Matches the "4 DB-backed tests" description.
- **Allowlist status (VERBATIM):** Correctly recorded as NOT in the allowlist.
  The existing test-path list permits only
  `{manuscript,narrative,publication,state-consumers,scale-evidence}.test.ts`
  and the proposed new paths list `scale-review.test.ts`,
  `scale-decisions.test.ts`, `scale-review-migration.test.ts`. Amendment
  REQUIRED — correctly stated.
- **Semantics:** Test-only. No production code modified; no existing passing
  assertion weakened; no new exports or global patches.
- **Hidden scope expansion:** None observed.

### Amendment 7: `apps/api/src/scale-review-context.test.ts` (NEW)
**Verdict: ACCEPT as proposed amendment.**

- **Existence/content (OBSERVED):** File exists, 537 lines, 5 active `it()`
  blocks: older-head exception filtering, concurrent version/head advance
  race (no torn context), ABSENT applicability, FRESH applicability, STALE
  applicability naming `sourceRevisionId`. Matches the description.
- **Allowlist status (VERBATIM):** Correctly recorded as NOT in the allowlist
  (same lists as Amendment 6). Amendment REQUIRED — correctly stated.
- **Semantics:** Test-only, Fastify-inject HTTP boundary tests. No production
  code modified; no existing passing assertion weakened.
- **Hidden scope expansion:** None observed.

### Amendment 8: `apps/web/app/components/workspace/ScaleReviewPanel.slice3.test.ts` (NEW)
**Verdict: ACCEPT as proposed amendment.**

- **Existence/content (OBSERVED):** File exists, 602 lines, 12 active `it()`
  blocks. Uses real 050A-shaped fixtures with `conflicts` (not invented
  `claims`), server-computed receipt applicability (stale/fresh pins), en/id
  dictionaries with English fallback, loading/error/stale states, and
  selection-change invalidation. Matches the description.
- **Allowlist status (VERBATIM):** Correctly recorded as NOT in the allowlist;
  proposed new paths list only `ScaleReviewPanel.test.ts` and
  `ScaleReviewPanel.axe.test.ts`. Amendment REQUIRED — correctly stated.
- **Semantics:** Test-only. No production code modified; no existing passing
  assertion weakened.
- **Hidden scope expansion:** None observed.

### Amendment 9: `apps/web/app/components/workspace/ScaleReviewPanel.slice4.test.ts` (NEW)
**Verdict: ACCEPT as proposed amendment, with a documentation correction (see Findings F1).**

- **Existence/content (OBSERVED):** File exists, 792 lines. Content covers
  exactly the stated topics: superseded context/evidence responses completing
  last do not overwrite newer data, typed `ScalePayloadForm` payload shapes
  (STANDING_CHANGE proposal, CHAPTER_EXCEPTION, ALTERNATIVE), en/id
  localization with English fallback, empty `access:[]` permitted (proposal
  and ALTERNATIVE forms), HARD blank hardReason rejected, SOFT blank
  hardReason permitted.
- **Allowlist status (VERBATIM):** Correctly recorded as NOT in the allowlist
  (same as Amendment 8). Amendment REQUIRED — correctly stated.
- **Semantics:** Test-only. No production code modified; no existing passing
  assertion weakened.
- **F1:** The proposal states "7 component tests"; the file contains **12
  active `it()` blocks** (none skipped, verified no `.skip`/commented
  tests). The additional 5 tests are `access:[]`/hardReason edge cases
  within the same stated scope — no scope expansion — but the count in the
  proposal is inaccurate and should be corrected before author approval.
- **Hidden scope expansion:** None observed.

### Amendment 10: `apps/api/src/scale-gate-live-semantics.test.ts` (NEW)
**Verdict: ACCEPT as proposed amendment.**

- **Existence/content (OBSERVED):** File exists, 400 lines, 4 active `it()`
  blocks: NOT_CONFIGURED with matching pins but a configured live policy
  fails closed; NO_OPERATIVE_CONFLICT with matching pins but a CONFLICTS live
  evidence set fails closed; plus two positive controls (genuine
  NOT_CONFIGURED and genuine NO_OPERATIVE_CONFLICT pass). Matches the
  description exactly.
- **Allowlist status (VERBATIM):** Correctly recorded as NOT in the allowlist
  (same lists as Amendment 6). Amendment REQUIRED — correctly stated.
- **Semantics:** Test-only, exercising the shared API/worker gate
  (`checkFinalTextReviewGate`, a proposed new path). No production code
  modified; no existing passing assertion weakened.
- **Hidden scope expansion:** None observed.

---

## Overall Assessment (Amendments 5–10)

All six amendments are **bounded** (each a single new file with a narrow,
well-defined scope), **documented** (path, justification, verbatim allowlist
status, semantic change), and **non-weakening**: five are test-only and the
sixth is a new UI component implementing a GAP-119 requirement with its i18n
keys in already-allowlisted files. None relax contract requirements; none
modify historical migrations, snapshots, receipts, or any production file
outside the allowlist/proposed-new-paths lists. The proposal's allowlist
status claims were checked verbatim against the contract and are correct for
all six.

## Additional Findings

- **F1 (documentation inaccuracy):** Amendment 9's "What" states "7 component
  tests"; `ScaleReviewPanel.slice4.test.ts` contains 12 active tests. The
  topics match the description; no scope expansion. Correct the count before
  author approval.
- **F2 (paths not regularized by this proposal):** At the reviewed HEAD
  (`e826090`) two additional new files exist in the working tree (untracked),
  outside the frozen exact allowlist, that are covered by NEITHER Amendments
  1–10 nor the contract's lists:
  1. `apps/api/src/scale-review-checklist.test.ts` (10 pure-function tests
     against `deriveChecklist`/`deriveReceiptApplicability`, imported from
     `scale-decision-routes.ts`, itself a proposed new path). Test-only.
  2. `apps/web/app/components/workspace/ScaleReviewPanel.slice5.test.ts` (4
     component tests: superseded-mutation reconciliation, server-derived
     checklist consumption). Test-only.
  Both appear test-only (no production modification observed), but the
  proposal's claim that Amendments 5–10 "regularize every such path" is
  incomplete at this HEAD. Recommend Amendments 11–12 (or a further proposal
  entry) regularizing these two test paths before the author decision.
- **F3 (reviewer-scope note):** The remaining modified files at this HEAD
  (`scale-decision-routes.ts`, `scale-decisions.test.ts`,
  `scale-review-context.test.ts`, `ScaleReviewPanel.slice4.test.ts`,
  `ScalePayloadForm.vue`, `ScaleReviewPanel.vue`, `apps/web/app/i18n/en.ts`,
  `apps/web/app/i18n/id.ts`, `packages/ai-services/index.ts`,
  `packages/ai-services/src/final-text-review-gate.ts`,
  `packages/ai-services/src/scale-decisions.ts`, plus the two proposal/review
  docs and ISSUES-AND-GAPS.md) all fall within the contract's existing-paths
  allowlist or proposed new paths, except the two files in F2.

## Author Action Required (Amendments 5–10)

**The author (Klein) is requested to:**
1. Review the 6 amendments above (plus Findings F1–F2).
2. Record APPROVE or CHANGES_REQUESTED for the scope amendments
   (recommendation: correct the Amendment 9 test count per F1; consider
   extending the proposal to cover the two F2 test paths).
3. If approved, the amendments are regularized per the contract procedure.

## Author approval — EXPLICITLY NOT CLAIMED

This review does NOT claim author (Klein) approval of Amendments 5–10.
Approval must be explicitly recorded by the author. Until then, Amendments
5–10 remain PROPOSED, and GAP-119 remains OPEN on the scope-amendment item.

---

**Provenance:** Independent review conducted 2026-10-09 by a separate actor
from the Slice 3 implementer, against the fifth-repair amendment section of
`050B-scope-amendment-review-2026-10-09.md` at HEAD `e826090` (input revision
`e8260903999bb05ad31393d0e7eddef9e0c7c300`). Reviewer identity not invented;
backends MODEL_UNVERIFIED per GAP-013. Evidence classes used:
OBSERVED (file existence, line counts, `it()` counts, grep-verified content),
VERBATIM contract checks against
`tasks/NF-WF-050B-scale-review-and-author-decisions.md`. No test execution was
performed in this review; test counts are static `it()` counts. This review
does not modify the proposal document.
