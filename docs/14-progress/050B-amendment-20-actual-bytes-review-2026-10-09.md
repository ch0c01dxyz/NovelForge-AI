# NF-WF-050B Amendment 20 — Actual-Bytes Independent Review

**Date:** 2026-10-09
**Artifact:** `apps/worker/src/scale-gate-fire-scale.test.ts`
**Review scope:** Amendment 20 (ninth repair) — the post-review additive change to the worker test file

## Reviewer identity

- **Role:** WORKER BYTES REVIEWER — separate actor, distinct from the Items 2+3 implementer.
- **Backend:** MODEL_UNVERIFIED per GAP-013.
- **Author of this review:** the worker bytes reviewer (this document's sole author). The task author is **Klein** — this review carries **no claim of author approval**.

## Engram

Engram is unavailable (GAP-021). No session ID is invented or recorded.

## Reviewed revision

- **Repo:** `~/workspace/projects/NovelForge-AI`
- **Branch:** `work/nf-wf-050b-scale-review`
- **HEAD (input revision):** `66f9b5b7675ed886e5dc6eb1d61f33f1915c7b59`
  ("Merge remote-tracking branch 'origin/main' into work/nf-wf-050b-scale-review")
- The test file is **unmodified in the working tree** relative to HEAD (not listed in `git status --short`).
- The additive change itself entered in commit `97da59c` ("fix(scale): eighth repair — GAP-119 seventh repair re-review findings"); no later commit touched this file (`git log --follow` shows `97da59c`, `88883c4`, `64168cd` only).

## Exact bytes reviewed

**SHA-256 (computed independently with `sha256sum` on the actual current file bytes):**

```
bdb4f5015a66cef857d07826cc4c47c491262e0e4dc8f6bc15ff320db7b90d9e
```

This matches the expected current hash. It differs from the historical hash below — as it must.

## Historical hash — preserved, not superseded

```
a009dd2c1d51d7ae4a57fd98d68fdb46df6c80a82b0b9044d60d25f5d82491ea
```

This hash covers the **pre-change bytes only**. It is independently confirmed to equal the file bytes at commit `88883c4`:

```
git show 88883c4:apps/worker/src/scale-gate-fire-scale.test.ts | sha256sum
→ a009dd2c1d51d7ae4a57fd98d68fdb46df6c80a82b0b9044d60d25f5d82491ea
```

The 18–20 review's exact-artifact receipt for `a009dd2c…` **does not cover the changed bytes** (`bdb4f501…`). This review is the independent byte-level record for the changed artifact.

## Byte-level change vs the historical hash

`git diff 88883c4 97da59c -- apps/worker/src/scale-gate-fire-scale.test.ts` shows **exactly one additive line** — no deletions, no modifications:

```diff
@@ -231,6 +231,7 @@ async function genuineScaleProtocol(seed: Seed): Promise<ScaleReviewProtocol> {
   });
   const exception = await resolveApplicableExceptionStrict(db as never, {
     novelId: seed.novelId,
+    workspaceId: seed.workspaceId,
     context,
   });
   return computeExpectedScaleProtocol({
```

- Added line (current file line 234): `    workspaceId: seed.workspaceId,`
- Location: the `resolveApplicableExceptionStrict` call inside the `genuineScaleProtocol` helper.
- Rationale corroborated: the eighth-repair Item 2 signature change made `workspaceId` a **required** field of the resolver input (`input: { novelId: string; workspaceId: string; context: ScaleReviewContext }` in `packages/ai-services/src/final-text-review-gate.ts`, with the doc comment "Authorized context workspace — both proposal and outcome must belong to it."). Without this line the worker typecheck fails — the additive line is a type-conformance fix, not a behavior change to the test.

## Test-only confirmation

The artifact is a vitest test file (`describe`/`it`/`expect` from `vitest`, `*.test.ts`) that imports the production `fireScheduledPublication` from `./publication-jobs.ts` and exercises it against a dedicated scratch DB (`novelforge_test_scale_gate_fire_scale`) with Prisma migrate-deploy in `beforeAll` and table cleanup in `beforeEach`. It contains **no production source changes** — only the test file was reviewed and only test bytes changed.

The four DB-backed tests, all with assertions intact and unweakened:

1. **"PUBLISHES with a genuine fresh SCALE receipt"** — genuine receipt computed from live context with the shared deterministic assessor → `outcome === "published"`, publication row `PUBLISHED`, chapter `PUBLISHED`.
2. **"REFUSES a contradictory retained receipt under fresh configured SCALE"** — contradictory `WITHIN_REACH` retained receipt → `outcome === "refused"`, `code === "REVIEW_STALE"`, publication `UNPUBLISHED`, audit log `publication.unpublished` with payload reason `REVIEW_STALE`, chapter not `PUBLISHED`.
3. **"REFUSES when the evidence set changes after the receipt (pin change)"** — superseding evidence set (sequence 2) → `refused` + `REVIEW_STALE` + `UNPUBLISHED`.
4. **"REFUSES when the policy changes after the receipt (fingerprint pin change)"** — policy update → `refused` + `REVIEW_STALE` + `UNPUBLISHED`.

No assertion was weakened by the change: the diff touches only the helper's resolver call arguments, outside every test body and every `expect`.

## Verdict

**ACCEPT** on the actual submitted bytes.

- Current bytes hash `bdb4f501…` verified independently.
- Historical hash `a009dd2c…` verified to equal the pre-change bytes at `88883c4`; its receipt does not cover the changed bytes, and is not claimed to.
- The delta is provably one additive line supplying a required `workspaceId` to `resolveApplicableExceptionStrict`, matching the Item 2 resolver signature change; all test logic and assertions are byte-identical.
- File remains test-only; no production code modified by this change.

## Explicit non-claims

- This review does **not** claim author approval. The author is **Klein**; acceptance of the repair remains his decision.
- This review does **not** claim the 18–20 exact-artifact receipt (`a009dd2c…`) covers the changed bytes.
- This review does **not** claim test execution results — it is a byte-level and static review only. (Per project convention, another host's test results are never current evidence.)
- No source file, test file, proposal record, or 18–20 review record was modified in producing this review.
