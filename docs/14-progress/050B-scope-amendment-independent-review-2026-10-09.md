# 050B Scope Amendment Independent Review — 2026-10-09

**Task:** NF-WF-050B (scale review and author decisions), fourth repair
**Type:** DISTINCT recorded review of the 4 scope amendments (per contract amendment procedure)
**Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
**Reviewer:** Independent scope-amendment reviewer — a SEPARATE actor from the
Slice 2 implementer and the Slice 3 implementer; backends MODEL_UNVERIFIED per GAP-013
**Date:** 2026-10-09
**Input reviewed:** `docs/14-progress/050B-scope-amendment-review-2026-10-09.md`
(contract `fed3cea`, branch `work/nf-wf-050b-scale-review`)

## Method

For each of the 4 amendments I verified:
1. The file exists at the stated path and its content matches the description.
2. The allowlist status stated in the proposal doc, checked verbatim against the
   contract's "Scope and interfaces" lists (tasks/NF-WF-050B-scale-review-and-author-decisions.md).
3. Whether the semantic change is truly bounded / additive / non-weakening.
4. Whether any hidden scope expansion is present.

## Verdicts

### Amendment 1: `packages/ai-services/src/scale-review-types.ts` — ACCEPT (as proposed amendment)

- **File exists:** YES. Introduced in commit `1ad5c47` ("feat(scale): implement
  NF-WF-050B SCALE review and author decisions"); re-exported from
  `packages/ai-services/index.ts` line 126 (index.ts is an allowed path).
- **Content match:** YES, with one note (see finding F1 below). The file
  contains the frozen protocol 1 types `ScaleReviewPins`, `ScaleReviewClaim`,
  and `ScaleReviewProtocol`, exactly as described.
- **Allowlist status in proposal doc: CORRECT.** The contract allowlist names
  exact files for ai-services: `scale-evidence`, `narrative`, `policy-errors`,
  `ai`, `revisions`, `platform`.ts plus `index.ts`. `scale-review-types.ts`
  is not listed, and it is also NOT among the contract's "Proposed new paths"
  (`scale-decisions.ts`, `final-text-review-gate.ts` are; `scale-review-types.ts`
  is not). The proposal doc's statement that an amendment is REQUIRED is correct.
- **Semantics:** Additive only. The 3 named interfaces are new exports; no
  existing shapes modified. Bounded to a single file.
- **Blanket package-permission correction:** CONFIRMED. The proposal doc's
  fourth-repair correction explicitly withdraws the earlier claim that the file
  was "within the allowed `packages/ai-services/src/` package", and states the
  correct file-level allowlist status. The correction is accurate.

### Amendment 2: `apps/api/src/scale-evidence-migration.test.ts` — ACCEPT (as proposed amendment)

- **File exists:** YES.
- **Content match:** YES. The test defines `MIGRATION_050A = "20261008_nf_wf_050a_scale_evidence"`
  and `MIGRATIONS_AFTER_050A = ["20261008_nf_wf_050b_scale_decisions"]`, and
  `makeTempPrismaHome()` removes post-050A migrations from the private temp
  Prisma homes used for both the empty and populated baseline cases (comments
  at lines 38, 75–77).
- **Allowlist status in proposal doc: CORRECT.** The contract permits
  `apps/api/src/{manuscript,narrative,publication,state-consumers,scale-evidence}.test.ts`.
  `scale-evidence-migration.test.ts` is a different file and is not listed.
  The proposal doc's statement that an amendment is REQUIRED is correct.
- **Semantics:** Test-only. The baseline definition is narrowed; no production
  code is modified. No existing passing assertion is weakened: the 050B
  migrations are covered by their own dedicated test
  (`apps/api/src/scale-review-migration.test.ts`, verified to exist), which is
  in the contract's proposed-new-paths list.

### Amendment 3: `packages/ai-services/src/policy-errors.ts` — ACCEPT (as proposed amendment)

- **File exists:** YES.
- **Content match:** YES. `PolicyErrorCode` is now the union of
  `"MALFORMED_POLICY"`, `"HARD_POLICY_VIOLATION"`, `"REVIEW_STALE"`, and the new
  `"SCALE_ASSESSMENT_INCOMPLETE"` (line 13–17). All 3 pre-existing codes are
  present and unchanged; nothing removed.
- **Allowlist status in proposal doc: CORRECT.** `policy-errors.ts` IS in the
  contract's explicit allowlist for ai-services. The proposal doc correctly
  states that no amendment is strictly required for the path and that it is
  recorded here for completeness as a contract-visible semantic change.
- **Semantics:** Additive to the error-code union. No existing codes modified
  or removed; no behavior change for existing codes. The typed code keeps the
  "incomplete assessment" refusal distinct from `HARD_POLICY_VIOLATION` per the
  contract's distinct-frozen-error-code requirement.

### Amendment 4: `packages/database/prisma/migrations/20261008_nf_wf_050b_scale_decisions/migration.sql` — ACCEPT (as proposed amendment)

- **File exists:** YES (migration directory `20261008_nf_wf_050b_scale_decisions`,
  SQL file 194 lines).
- **Content match:** YES. The SQL creates two `TIMESTAMPTZ(3)` columns
  (`created_at`, lines 44 and 128) and carries the documented rationale in the
  header comment (lines 8–15): explicit `@db.Timestamptz(3)` in the schema
  (verified in `schema.prisma`, `ScaleDecisionProposal` and `ScaleDecisionOutcome`
  models) selects TIMESTAMPTZ(3); plain TIMESTAMP would drift from the schema.
- **Allowlist status in proposal doc: CORRECT.** The contract permits "one new
  migration under `packages/database/prisma/migrations/<new timestamp>_scale_review_decisions/`".
  The actual directory name `20261008_nf_wf_050b_scale_decisions` deviates from
  the contract's placeholder pattern — the proposal doc records this deviation
  accurately rather than glossing over it.
- **Semantics:** Documentation only. The SQL was not modified by this amendment;
  only the rationale is documented. No schema change.

## Blanket package-permission claim: corrected — CONFIRMED

The proposal doc's fourth-repair correction explicitly retracts the earlier
blanket "within the allowed `packages/ai-services/src/` package" claim and
records the correct file-level status per amendment. I independently verified
the correction against the contract allowlist: the contract names exact files,
not packages, and `scale-review-types.ts` is absent from both the allowed
existing paths and the proposed new paths. The correction is accurate and
provenance-preserving (the superseded claim is retained as historical record,
not rewritten).

## Author approval — EXPLICITLY NOT CLAIMED

**This review does NOT constitute author (Klein) approval.** The 4 amendments
remain PROPOSED until Klein approves them per the contract's amendment
procedure. Verdicts above are scoped strictly to: file existence/content match,
allowlist-status accuracy, and bounded/additive/non-weakening semantics as a
reviewed amendment proposal.

## Additional findings

- **F1 (minor, documentation accuracy):** Amendment 1 describes the file as
  containing the frozen protocol 1 types. The file also contains an additional
  `ScalePolicySnapshot` interface and a runtime helper `fingerprintScalePolicy`
  (canonical JSON → SHA-256). This is a superset of the description, not hidden
  scope expansion: the fingerprint produces the `policyFingerprint` pin declared
  in `ScaleReviewPins`, so it is directly in service of the frozen protocol.
  The description would be more accurate as "frozen protocol 1 types and the
  policy fingerprint function that computes one of the frozen pins." No
  verdict impact; the file is bounded and additive.
- **F2 (none — positive control):** No other files outside the 4 amended paths
  were introduced by the amendments. `scale-review-types.ts`'s re-export from
  `index.ts` uses an already-allowed path.
- **F3 (none — positive control):** Amendment 4's documented rationale matches
  the schema source of truth; TIMESTAMPTZ(3) is consistent with the 050A
  precedent of explicit `@db.Timestamptz(n)` annotations. Nothing to correct.

---

**Provenance:** Created 2026-10-09 as the DISTINCT independent scope-amendment
review for the NF-WF-050B fourth repair, separate from the Slice 2 implementer's
amendment record and the Slice 3 implementer. Does not modify
`050B-scope-amendment-review-2026-10-09.md`. Not committed (per instructions).
