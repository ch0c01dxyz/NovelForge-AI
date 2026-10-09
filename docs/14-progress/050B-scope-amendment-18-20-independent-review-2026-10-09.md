# 050B Scope Amendment Independent Review — Amendments 18–20 (2026-10-09)

**Task:** NF-WF-050B (scale review and author decisions), eighth repair
**Type:** Separate scope-amendment review per the contract amendment procedure
**Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
**Date:** 2026-10-09

## Actor identity

This review was performed by a SEPARATE actor from the Items 3+4 implementer
who authored Amendments 18–20 and their implementation files. This reviewer
did not write, modify, or execute the reviewed files. Backends are
MODEL_UNVERIFIED per GAP-013. Engram unavailable (GAP-021); file-based
handoff only — no session ID is claimed.

## Traceable input

- **Repo:** `~/workspace/projects/NovelForge-AI`, branch
  `work/nf-wf-050b-scale-review`
- **Commit at review time (HEAD):** `12fadbf32275561aa7a2e20cd7a0299b37d72775`
- **Frozen contract:** `tasks/NF-WF-050B-scale-review-and-author-decisions.md`
  (allowlist verbatim-checked: "Scope and interfaces" § at lines 35–57,
  "Proposed new paths" at lines 59–68, "Everything else is forbidden
  without a separately reviewed amendment." at line 70)
- **Amendment proposal record:**
  `docs/14-progress/050B-scope-amendment-review-2026-10-09.md`
  (Amendments 18–20; includes the eighth-repair state note for Amendment 18)

### Reviewed bytes (SHA-256)

| Amendment | Exact path | SHA-256 of exact reviewed bytes | Tree state |
|---|---|---|---|
| 18 | `apps/api/src/scale-exception-strict.test.ts` | `cd727b5e74cbd97ea0c2cbab46b74c8799fc69faa28b4851ffb65d14cd71e8a9` | Working tree; 7 uncommitted lines vs commit `88883c4` (see State note) |
| 19 | `apps/api/src/scale-gate-publish.test.ts` | `71edba2296f3bb4f447ca1890c208666a9fda6bf52cc5092e75a849364641ab8` | Tracked, working tree clean (== committed bytes) |
| 20 | `apps/worker/src/scale-gate-fire-scale.test.ts` | `a009dd2c1d51d7ae4a57fd98d68fdb46df6c80a82b0b9044d60d25f5d82491ea` | Tracked, working tree clean (== committed bytes) |

File line counts: 549 / 465 / 414. Test counts (grep `it(`): 8 / 4 / 4,
matching the proposal record. No `it.skip`/`it.only`/`describe.skip` in any
file.

**State note (Amendment 18):** Per the proposal's state note, the file carries
uncommitted changes from the eighth repair's Items 1+2. The uncommitted diff
(`git diff`) was inspected line-by-line: exactly 7 added lines, all of the
form `workspaceId: f.workspaceId` added to `resolveApplicableExceptionStrict`
call arguments; zero removed or modified lines. The review above covers the
CURRENT working-tree bytes (SHA-256 recorded above), not the committed
version.

## Method

For each amendment file, this reviewer independently:

1. **Exact path match** — confirmed the file exists at the exact path recorded
   in the proposal record (byte-identical path strings).
2. **Verbatim allowlist check** — read the contract's "Scope and interfaces"
   allowlist (lines 35–57) and "Proposed new paths" (lines 59–68) directly
   from `tasks/NF-WF-050B-scale-review-and-author-decisions.md` and checked
   each file name against BOTH lists verbatim. The allowed existing API test
   paths are only `{manuscript,narrative,publication,state-consumers,
   scale-evidence}.test.ts`; the allowed worker paths are only
   `{publication-jobs,publication-jobs.test}.ts`; the proposed new test paths
   are only `scale-review.test.ts`, `scale-decisions.test.ts`,
   `scale-review-migration.test.ts` (+ web panel paths). None of the three
   reviewed names appear in either list — each requires an amendment, and
   each is proposed here rather than assumed.
3. **Bounded** — verified each is a single new `*.test.ts` file whose content
   matches the proposal's "What" description and stays within the described
   narrow scope (DB-backed boundary tests on a dedicated disposable database;
   no UI, migration, or contract-shape changes).
4. **Non-weakening** — verified each file is test-only (imports existing
   production modules; defines no production symbols, edits no production
   files). All assertions inspected: they are strict fail-closed assertions
   (exact `toBeNull()` on corrupted resolvers, `ok === false`, exact status
   `409` with typed `REVIEW_STALE`, `PUBLISHED`/`UNPUBLISHED` state pins,
   audit-log reason checks). The one race test (Amendment 19) permits `200`
   OR `409` but asserts "never 500" plus state/outcome consistency — this is
   the correct invariant for a race, not a weakened assertion.
5. **Hash** — recorded SHA-256 of the exact reviewed bytes (above) so the
   reviewed content is traceable.

This review was static (exact bytes). Test execution was not part of this
amendment review; execution evidence belongs to the implementer's reports and
the separate repair-diff review.

## Verdicts

### Amendment 18: `apps/api/src/scale-exception-strict.test.ts` — ACCEPT (as proposed amendment)

- Exact path matches the amendment record. ✔
- NOT in the contract's explicit allowlist (verbatim check of both lists). ✔
- Bounded: single new test file; 8 DB-backed tests of the shared strict
  exception resolver at the real gate and context boundaries, matching the
  proposal's "What" (valid full/partial coverage accepted; corrupted
  `[0,0]` duplicate, out-of-bounds, empty, unknown-key, non-violating-claim
  coverage all fail closed with audit history preserved). ✔
- Non-weakening: test-only; the 7 uncommitted `workspaceId` lines are
  additive call arguments tracking the sibling production signature, zero
  removed lines; no assertion relaxed. ✔
- **Observation (not a finding):** the uncommitted `workspaceId` additions
  track the eighth repair's Items 1+2 production signature change, which is
  outside this review's scope (separate slice). If the author approves this
  amendment on the current bytes, the hash above identifies the reviewed
  content; if the file changes again, re-hash before approval.

### Amendment 19: `apps/api/src/scale-gate-publish.test.ts` — ACCEPT (as proposed amendment)

- Exact path matches the amendment record. ✔
- NOT in the contract's explicit allowlist (verbatim check of both lists). ✔
- Bounded: single new test file; 4 DB-backed tests of the actual
  immediate-publication route (`POST .../publication/publish` via real
  Fastify inject), matching the proposal's "What" (genuine receipt →
  200 PUBLISHED; contradictory receipt → 409 REVIEW_STALE, stays DRAFT, no
  publication row; evidence-set pin change → 409; policy-change race →
  consistent 200/typed-409, never 500). ✔
- Non-weakening: test-only; assertions are exact status codes, typed error
  codes, and DB state pins. ✔

### Amendment 20: `apps/worker/src/scale-gate-fire-scale.test.ts` — ACCEPT (as proposed amendment)

- Exact path matches the amendment record. ✔
- NOT in the contract's explicit allowlist (verbatim check of both lists —
  worker allowlist covers only `publication-jobs` / `publication-jobs.test.ts`). ✔
- Bounded: single new test file; 4 DB-backed tests of the real
  `fireScheduledPublication` with fresh configured SCALE, matching the
  proposal's "What" (genuine fresh receipt → PUBLISHED; contradictory
  retained receipt → refused + REVIEW_STALE + UNPUBLISHED + audit-logged;
  evidence-set and policy-fingerprint pin changes → refused + UNPUBLISHED). ✔
- Non-weakening: test-only; strict fail-closed assertions including the
  audit-log `publication.unpublished` / `REVIEW_STALE` reason check. ✔

## Author approval — EXPLICITLY NOT CLAIMED

This record does NOT claim author approval. **Klein** is requested to:

1. Review Amendments 18–20 above (and the accept verdicts of this
   independent review).
2. Record APPROVE or CHANGES_REQUESTED for each scope amendment.
3. If approved, the amendments are regularized per the contract procedure.

Until explicit author approval is recorded, GAP-119 remains OPEN on the
scope-amendment item.

## Provenance

Independent review performed 2026-10-09 during NF-WF-050B eighth repair, by
a separate actor from the Items 3+4 implementer (backends MODEL_UNVERIFIED
per GAP-013). This record covers Amendments 18–20 ONLY. No hashes or
verdicts are backfilled for Amendments 1–17; their existing independent
review records stand unchanged. The reviewed files were not modified by
this reviewer.
