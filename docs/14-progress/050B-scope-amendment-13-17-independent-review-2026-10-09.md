# Independent Scope Amendment Review — NF-WF-050B Amendments 13–17 (2026-10-09)

**Task:** NF-WF-050B (scale review and author decisions), sixth repair
**Type:** Separate scope-amendment review per the contract's amendment procedure
**Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
**Reviewer:** Independent scope-amendment reviewer — a SEPARATE actor from the
Slice 3 implementer; backends MODEL_UNVERIFIED per GAP-013
**Date:** 2026-10-09

## Traceable input

- Repo: `~/workspace/projects/NovelForge-AI`
- `git rev-parse HEAD` at review time: `b502d0f55a9f1ab277d39b4074fa4bad62abe769`
- Amendment source reviewed: `docs/14-progress/050B-scope-amendment-review-2026-10-09.md`
  (Amendments 13–17 section, "sixth-repair note")
- Frozen contract checked: `tasks/NF-WF-050B-scale-review-and-author-decisions.md`
  ("Scope and interfaces" § and "Proposed new paths" §)
- Working tree state: all 5 amendment files are UNTRACKED new files (`git status`
  shows `??` for each). They do not modify any existing file.
- SHA-256 of reviewed files:
  - `apps/api/src/scale-proof-completeness.test.ts`:
    `0c71e0751bee5ccc9466d3b4e68af2bdfa9bccf7c7fa9ebcefdd31ddfc148887`
  - `apps/api/src/scale-context-gate-agreement.test.ts`:
    `4f7e8532f67604af3587c2d91210d7fb243b4d26671319e5a88ecd208930e1ad`
  - `apps/web/app/components/workspace/ScaleReviewPanel.slice6.test.ts`:
    `4c117edd3431ac0eb8945027ad5e1f50bdb83d2de4182996a93e880991d9a268`
  - `apps/api/src/scale-gate-callers.test.ts`:
    `8cfcd4f30caad08d9994378d9b98f9507292897982edd017b3a73faa407258cd`
  - `apps/worker/src/scale-gate-fire.test.ts`:
    `99c1cc045674787a1f991f2060d80bcaedfbe5a79eb83715699068e8e9971047`

## Per-amendment verdicts

### Amendment 13: `apps/api/src/scale-proof-completeness.test.ts` — ACCEPT as proposed

1. **Exists:** yes (531 lines, untracked new file).
2. **Content matches "What":** yes. Exactly 5 `it` blocks:
   - NEGATIVE: WITHIN_REACH/empty-claims/matching-pins under HARD with ABSENT evidence fails closed
   - NEGATIVE: ... with STALE evidence fails closed
   - NEGATIVE: ... with MALFORMED standing fails closed
   - NEGATIVE: inconsistent exception/claim coverage fails closed
   - POSITIVE: genuine WITHIN_REACH with real claims passes
   Matches the claimed "4 negatives + 1 positive". Exercises the shared
   `checkFinalTextReviewGate` DB-backed on a dedicated disposable DB
   (`novelforge_test_scale_proof_complete`).
3. **Allowlist:** NOT in the contract's explicit allowlist. Allowed test paths
   are `{manuscript,narrative,publication,state-consumers,scale-evidence}.test.ts`;
   proposed new paths are `scale-review.test.ts`, `scale-decisions.test.ts`,
   `scale-review-migration.test.ts`. This file is none of those.
   "Amendment REQUIRED" is the correct status.
4. **Bounded/additive/non-weakening:** test-only new file; no production logic
   modified; no existing assertions weakened. No `.skip`/`.todo` found;
   assertions are real (6 `expect` calls observed; count is low because the
   file asserts on structured gate-result fields per test).

### Amendment 14: `apps/api/src/scale-context-gate-agreement.test.ts` — ACCEPT as proposed

1. **Exists:** yes (397 lines, untracked new file).
2. **Content matches "What":** yes. 2 `it` blocks:
   - "labels a gate-rejected contradictory receipt STALE (not FRESH) via the endpoint"
   - "labels a genuinely fresh receipt FRESH via the endpoint and passes the gate"
   The amendment claims no specific test count ("DB-backed tests"); 2 tests
   cover the claimed agreement (reject→STALE, genuine→FRESH+gate-pass),
   including stale checklist guidance per the file's stated purpose. Tests run
   against the ACTUAL context endpoint (Fastify inject) vs the ACTUAL shared gate.
3. **Allowlist:** NOT in the contract's explicit allowlist (same lists as
   Amendment 13). "Amendment REQUIRED" is the correct status.
4. **Bounded/additive/non-weakening:** test-only new file; dedicated disposable
   DB (`novelforge_test_scale_ctx_gate`); no production logic modified.

### Amendment 15: `apps/web/app/components/workspace/ScaleReviewPanel.slice6.test.ts` — ACCEPT, with one count correction in the amendment record

1. **Exists:** yes (458 lines, untracked new file).
2. **Content matches "What" — with a count correction:** the file contains
   exactly **4** `it` blocks total:
   - ABSENT-to-fresh: successful review updates receipt, applicability and checklist
   - STALE-to-fresh: successful review clears stale guidance
   - preserves busy-state cleanup after review refresh
   - saves a STANDING_CHANGE proposal, approves it, and re-reviews to fresh
     (the complete author-workflow test)
   The amendment's "What" says "**4** component tests ... **Plus 1** complete
   author-workflow test", which implies 5 tests and overstates the file by one.
   The correct phrasing is "3 component tests (ABSENT-to-fresh, STALE-to-fresh,
   busy-state cleanup) plus 1 complete author-workflow test — 4 total".
   All claimed scenarios ARE present; this is a prose-count error in the
   amendment record, not a gap in coverage.
3. **Allowlist:** NOT in the contract's explicit allowlist. Proposed new web
   paths are only `ScaleReviewPanel.vue`, `ScaleReviewPanel.test.ts`,
   `ScaleReviewPanel.axe.test.ts`. "Amendment REQUIRED" is the correct status.
4. **Bounded/additive/non-weakening:** test-only new file; tests the panel
   component against real response shapes; no production logic modified.

### Amendment 16: `apps/api/src/scale-gate-callers.test.ts` — ACCEPT as proposed

1. **Exists:** yes (416 lines, untracked new file).
2. **Content matches "What":** yes. Exactly 4 `it` blocks:
   - REFUSES a contradictory retained receipt: 409 REVIEW_STALE through the real route
   - PUBLISHES with a genuine receipt from the real review route (positive control)
   - RACE: save (new version) vs setStatus — gate sees the locked version, never a 500
   - REFUSES setStatus to IN_REVIEW when the retained receipt contradicts live state
   Matches the claimed "4 DB-backed tests" covering PATCH .../status setStatus
   409, genuine 200, save-vs-setStatus race, DRAFT→IN_REVIEW refusal — via the
   real route (`assertPublishReviewGate` in `manuscript.ts`), not helpers alone.
3. **Allowlist:** NOT in the contract's explicit allowlist (same lists as
   Amendment 13). "Amendment REQUIRED" is the correct status.
4. **Bounded/additive/non-weakening:** test-only new file; dedicated disposable
   DB (`novelforge_test_scale_gate_callers`); no production logic modified.

### Amendment 17: `apps/worker/src/scale-gate-fire.test.ts` — ACCEPT as proposed

1. **Exists:** yes (305 lines, untracked new file).
2. **Content matches "What":** yes. Exactly 3 `it` blocks:
   - REFUSES a contradictory retained receipt: refused + REVIEW_STALE + UNPUBLISHED
   - PUBLISHES with a genuine legacy PASS receipt and no SCALE rows (legacy compatibility)
   - REFUSES when the fire-time version has no receipt (existing behavior, re-verified)
   Matches the claimed "3 DB-backed tests" for the REAL `fireScheduledPublication`
   caller (not mocked workers).
3. **Allowlist:** NOT in the contract's explicit allowlist. Allowed worker paths
   are only `apps/worker/src/{publication-jobs,publication-jobs.test}.ts`.
   "Amendment REQUIRED" is the correct status.
4. **Bounded/additive/non-weakening:** test-only new file; dedicated disposable
   DB (`novelforge_test_scale_gate_fire`); no production logic modified.

## Review assessment

All 5 amendments are:
- **Bounded:** each is a single new test file with a narrow, well-defined scope
  (shared-gate proof consistency, context/gate agreement, UI refresh/author
  workflow, real API route callers, real worker fire).
- **Documented:** justification tied to GAP-119 sixth-repair findings 1–3 and
  acceptance items, with allowlist status recorded.
- **Non-weakening:** none relax contract requirements; all 5 are test-only,
  additive files. None modify production code or weaken existing assertions.
- **One correction requested:** Amendment 15's "What" prose count should read
  "3 component tests + 1 author-workflow test (4 total)" instead of
  "4 component tests ... Plus 1". The scenarios themselves are all present.

## Uncertainty recorded

- Review scope was limited to existence, content/purpose match, allowlist
  status, and bounded/additive/non-weakening properties. The reviewer did NOT
  execute the test suites and makes no claim that the tests pass.
- Contract review was based on the "Scope and interfaces" and "Proposed new
  paths" sections read at the cited paths; any amendment elsewhere in the
  contract text that names these files was not exhaustively searched — none was
  observed.

## Author approval — EXPLICITLY NOT CLAIMED

**This record does NOT claim author approval.** Approval of Amendments 13–17
must be explicitly recorded by the author, Klein. Until then, Amendments 13–17
remain PROPOSED per the contract's amendment procedure, and GAP-119 remains
OPEN on the scope-amendment item.

**Status: RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL (Klein)**

---

*Provenance: Independent scope-amendment review of Amendments 13–17, conducted
2026-10-09 by a reviewer actor separate from the Slice 3 implementer; backends
MODEL_UNVERIFIED per GAP-013. File-based handoff (Engram unavailable, GAP-021).*
