# Review request — NF-WF-001 round 3 (verification of the round-2 corrections)

You are the **independent reviewer**. Do not edit files. Do not implement
anything. Read and judge only.

This is the third review of the same contract. Rounds 1 and 2 both returned
CHANGES_REQUESTED. Round 2 verified all eight round-1 corrections and raised
five findings of its own; those five have now been corrected. **Your scope is
bounded: verify those five corrections, and check that correcting them did not
break anything they touch.** A full re-review of the contract is explicitly
*not* wanted — see "Out of scope" below.

## Step 0 — report your identity first

Before any other work, run exactly this and print the raw output:

```
git rev-parse HEAD
env | grep -i '^ANTHROPIC'
```

Then state, in your first output line, the model identifier you believe you are
running as, or `MODEL_UNVERIFIED`.

Be aware of what this is: an environment self-report, **not** backend proof. In
round 1 the worker read `ANTHROPIC_DEFAULT_HAIKU_MODEL` and reported
`bansosmontera/deepseek-v4.1-flash`; in round 2 the worker read
`ANTHROPIC_DEFAULT_FABLE_MODEL` and reported `glm-5.3-flash`. Two different
names from two different variables. If you can obtain stronger evidence of the
actual serving model — a gateway response field, a `/v1/models` listing, a
provider header — print it raw and say so. Otherwise say plainly that identity
is unverified. Do not resolve the discrepancy by asserting you are the
requested model.

## The five round-2 findings, and what was changed

Verify each. Answer VERIFIED / REFUTED / UNCERTAIN with file:line evidence.
A correction that is present but does not actually fix the finding is REFUTED,
not VERIFIED.

1. **P1 — NF-WF-002 scope vs its own invariant.**
   Finding: the task's allowed paths listed only
   `{canon,planning,manuscript}.ts`, but C3's LOW-impact operations span
   `story.ts`, `characters.ts`, `relationships.ts` and `narrative.ts`, so the
   task's "head CAS on every covered mutation" invariant was unimplementable
   as scoped.
   Change: allowed paths expanded, with the C3 ownership named per service.
   Check: does the scope now cover **every** service that owns a C3 operation,
   with no service left out and none added that owns none? Cross-check the
   C3 operation list against the actual service files under
   `apps/api/src/services/`. The finding's own wording was that the invariant
   was unimplementable *as written* — confirm the invariant and the scope are
   now consistent in both directions.

2. **P2 — restore silently discards post-boundary state content.**
   Finding: C7 step 2 deletes covered rows created after the boundary;
   `change_set_items` store no before-image and audit payloads hold only
   ids/predicate, so that content is unrecoverable except via later
   snapshots — and the contract never said so, while "later history remains
   readable" reads as if nothing is lost.
   Change: C7 states the loss and requires the preview to tell the author.
   Check: is the statement *accurate* — does the change log genuinely lack a
   before-image in the schema as frozen by C2? Is the loss correctly scoped
   (which tables, which rows), and does it now conflict with any surviving
   sentence that still implies full recoverability? Search C7 and C11 for
   claims that were left unqualified.

3. **P3 — enum count.** `checkpoints.kind` reuses `RevisionOrigin`; the text
   said the seven checkpoint types were that enum's values "minus `RESTORE`"
   while itself naming `BASELINE`. Now reads "nine values minus `RESTORE` and
   `BASELINE`".
   Check: count the actual `RevisionOrigin` values in C2 and confirm the
   arithmetic and the prose agree.

4. **P3 — overstated Prisma limitation.** The `String`+CHECK rationale for
   `ChangeSetItem.operation` claimed Prisma cannot express a single-column
   closed set. It can — this schema has many Prisma enums. The rationale was
   rewritten on churn and load-bearing grounds.
   Check: does the new rationale still contain any impossibility claim it
   cannot support? Count the `enum` declarations in `schema.prisma` and
   confirm the cited number.

5. **P3 — stale evidence row.** `docs/implementation/test-matrix.md` G-01
   still read "REVIEW_PENDING — reviewer gateway unavailable" after two
   reviews had run.
   Check: does the row now match reality, and does any other row or file still
   carry the superseded `REVIEW_PENDING` state? Grep for it.

## Regression check

Correcting the above touched C2, C7 and the NF-WF-002 scope. Confirm the
corrections did not invalidate what round 2 verified:

- C1 coverage (56/56, no duplicate, no omission) — re-run the set-diff.
- C4 CAS ordering.
- C8 baseline split.
- C6 dedup.
- Relative links in every changed file resolve.
- No contract placeholder or unresolved field left in NF-WF-002.

## Out of scope

Do not re-litigate the contract's architecture, re-open round-1 findings, or
propose new design. The contract is frozen. If you find a defect outside the
five above, report it in one line under "Other observations" — do not expand
it into a finding. The review loop is regressive by construction (every edit
invalidates the review that prompted it), so this round exists to close it,
not to extend it.

## Output format

```
REVIEWER MODEL: <id or MODEL_UNVERIFIED, with the evidence you actually have>
HEAD: <sha>
VERDICT: VERIFIED | CHANGES_REQUESTED
```

`VERIFIED` means the five corrections are correct and nothing round 2 verified
regressed. Then a numbered findings list for anything that is not VERIFIED:
`severity (P0/P1/P2/P3) | file:line | claim | evidence | required change`.
Then "checks run" with exact commands and results. Then "unknowns".

If a correction is correct, say so in one line and move on. Do not pad.
