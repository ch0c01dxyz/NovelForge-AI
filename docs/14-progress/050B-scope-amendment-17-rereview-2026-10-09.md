# NF-WF-050B — Scope Amendment 17 exact-artifact re-review (seventh repair)

- **Task:** Independent re-review of the ACTUAL SUBMITTED bytes of
  `apps/worker/src/scale-gate-fire.test.ts` (Amendment 17), because the
  original 13–17 review recorded a verdict against pre-fix bytes and a P1
  typecheck finding was fixed after that review.
- **Type:** Exact-artifact re-review (byte-level verification).
- **Status:** RECORDED — PROPOSED — AWAITING AUTHOR APPROVAL
- **Reviewer:** Separate actor — independent of the Slice 3 implementer, the
  original 13–17 reviewer, and the hash-correction author. Backends
  MODEL_UNVERIFIED per GAP-013.
- **Date:** 2026-10-09
- **Repo:** `~/workspace/projects/NovelForge-AI`
- **Git HEAD at re-review:** `312c2255cda9decdc64cb09cc3f8bfb20b4312fd`
  (the reviewed file is byte-identical to its state at commit `64168cd`;
  working tree shows no modification to this file).

## Traceable input

| Item | Value |
|---|---|
| File under review | `apps/worker/src/scale-gate-fire.test.ts` |
| File committed in | `64168cd` ("fix(scale): sixth repair of NF-WF-050B against 33db685 review findings") |
| Working-tree status of file | Unmodified since `64168cd` (`git diff 64168cd -- <file>` is empty) |
| SHA-256 of submitted bytes (VERIFIED by `sha256sum`) | `afea22ea5cedd3bd5391d6da18ab6e70707e2741481496eca5d596316c9fb516` |
| Original review-time hash (PRESERVED for provenance, from `docs/14-progress/050B-scope-amendment-13-17-independent-review-2026-10-09.md`, review commit `b502d0f`) | `99c1cc045674787a1f991f2060d80bcaedfbe5a79eb83715699068e8e9971047` |
| Lines | 307 (review-time: 305) |

## Per-item verification results

1. **SHA-256 verification — PASS.** `sha256sum` on the working-tree file
   returns exactly `afea22ea5cedd3bd5391d6da18ab6e70707e2741481496eca5d596316c9fb516`,
   matching the hash of the submitted commit `64168cd`'s blob. The reviewed
   bytes are the submitted bytes.

2. **Content matches Amendment 17's "What" — PASS.** The file contains exactly
   3 `it` blocks (lines 233, 278, 295):
   - (a) REFUSES a contradictory retained receipt → refused + REVIEW_STALE +
     UNPUBLISHED (audit-logged, chapter not published);
   - (b) PUBLISHES with a genuine legacy PASS receipt and no SCALE rows
     (legacy compatibility);
   - (c) REFUSES when the fire-time version has no receipt (refused +
     REVIEW_STALE + UNPUBLISHED).
   This matches the contract's "What" for Amendment 17
   (`docs/14-progress/050B-scope-amendment-review-2026-10-09.md` §Amendment 17).

3. **Exercises the REAL `fireScheduledPublication` (not mocked) — PASS.**
   The file imports `fireScheduledPublication` directly from
   `./publication-jobs.ts` and calls it against a real disposable DB
   (`novelforge_test_scale_gate_fire`). No `vi.mock`, `jest.mock`, or
   `mockImplementation` appears anywhere in the file (grep confirms zero
   occurrences).

4. **Only post-review change is the 2 narrowing-guard lines — PASS
   (byte-level proof).** The guards
   `if (outcome.outcome !== "refused") throw new Error("expected refused outcome");`
   appear at exactly lines 261 and 302 — the positions documented in the
   hash-correction section of the original review. Stronger than the
   correction author's claim: removing exactly those two lines from the
   submitted file reproduces **byte-for-byte** the original review-time hash
   `99c1cc045674787a1f991f2060d80bcaedfbe5a79eb83715699068e8e9971047`.
   Therefore no other logic, test, assertion, or production byte changed
   between the reviewed and submitted artifacts; the P1 fix
   (`error TS2339: Property 'code' does not exist on type 'FireOutcome'` at
   two call sites) is fully explained by these two discriminated-union
   narrowing guards.

5. **Test-only; no production code modification — PASS.** The file is a
   `.test.ts` fixture/caller proof: it only imports production modules
   (`./publication-jobs.ts`, `@novelforge/ai-services`, `@novelforge/database`,
   `./worker.ts` type) and calls them; it writes no production source and
   modifies no production file. (Note: commit `64168cd` itself also touched
   production paths such as `apps/api/src/scale-decision-routes.ts` as part
   of the sixth repair — that production scope was covered by the sixth-repair
   review findings and is OUTSIDE this file's exact-artifact re-review scope.)

6. **Allowlist status — "Amendment REQUIRED" remains correct — PASS.**
   Contract `tasks/NF-WF-050B-scale-review-and-author-decisions.md`, "Scope
   and interfaces": allowed worker paths are only
   `apps/worker/src/{publication-jobs,publication-jobs.test}.ts`; the
   "Proposed new paths" list does not name `scale-gate-fire.test.ts`; and
   "Everything else is forbidden without a separately reviewed amendment."
   Amendment 17 therefore remains PROPOSED via amendment, NOT assumed.

7. **Worker typecheck — PASS (observed).** Ran `pnpm typecheck`
   (`tsc --noEmit`) in `apps/worker` on the submitted bytes on 2026-10-09:
   exit 0, zero errors. This directly resolves the post-review P1 finding
   (TS2339) that motivated the 2-line fix. The 3/3 test results reported by
   the correction author were NOT re-executed by this reviewer (they require
   a live scratch Postgres DB); no claim is made about test execution.

## Verdict

**ACCEPT as proposed.** The submitted bytes (`afea22ea…`) are exactly the
review-time bytes (`99c1cc…`) plus the two documented narrowing-guard lines
(proven byte-for-byte), the content matches Amendment 17's "What", the real
caller is exercised without mocks, the file is test-only, "Amendment
REQUIRED" remains the correct allowlist status, and the worker typecheck is
clean. No new findings; no CHANGES_REQUESTED.

## Author approval — EXPLICITLY NOT CLAIMED

This re-review does NOT claim author (Klein) approval. Amendments 13–17,
including Amendment 17, remain PROPOSED — AWAITING AUTHOR APPROVAL. No
regularization or merge action is implied by this record.

---

## Provenance footer

- This reviewer is a separate actor from: (a) the Slice 3 implementer,
  (b) the original 13–17 independent reviewer, and (c) the hash-correction
  author. Backends MODEL_UNVERIFIED per GAP-013.
- Engram unavailable (GAP-021); file-based handoff only.
- Related records:
  - `docs/14-progress/050B-scope-amendment-13-17-independent-review-2026-10-09.md`
    (original review + hash-correction section, with the historical
    review-time hash `99c1cc…` preserved verbatim);
  - `docs/14-progress/050B-scope-amendment-review-2026-10-09.md` (Amendments
    13–17 text, Amendment 17 "What"/Justification/Allowlist/Semantic change);
  - `tasks/NF-WF-050B-scale-review-and-author-decisions.md` (contract scope
    and allowlist).
- Uncertainty: the review-time bytes (`99c1cc…`) were never committed; they
  survive only as the preserved hash. The byte-level proof (deleting the two
  guard lines reproduces that hash exactly) substitutes for a direct
  two-blob diff and is the strongest available evidence that nothing else
  changed.
