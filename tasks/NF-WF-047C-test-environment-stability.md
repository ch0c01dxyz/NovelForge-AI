# Task NF-WF-047C: Test Environment Stability (GAP-081/082)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: VERIFIED for the bounded three-caller repair. Submission `89d57f5`
contains the parseEnv repair and eight committed regressions from `e0cc98f`.
Local source diff review APPROVE and scoped verification passed on 2026-10-08;
the author accepted integration. Historical milestones are retained below.
Milestone / capability IDs: M8 / CAP-19 (repeatable test setup)
Implementer role / requested and resolved model: Phase 1 (diagnosis) and Phase 2
(pilot repair) — separate subagent actors dispatched by the 047 coordinator
(different actors from the contract author and reviewers); serving identities
MODEL_UNVERIFIED per GAP-013. Scope-amendment repair implementer: separate
subagent actor (same identity note); reported READY FOR DIFF REVIEW.
Reviewer role / requested and resolved model: contract reviewer, Phase 1
diagnostic reviewer, and Phase 2 diff reviewer — separate subagent actors
dispatched by the 047 coordinator (each different from the contract author
and the implementers); serving identities MODEL_UNVERIFIED per GAP-013.
Verdicts: contract APPROVE (4 P3); Phase 1 diagnostic APPROVE (1 P3);
Phase 2 scope APPROVED; Phase 2 diff APPROVE (no findings). Scope-amendment
reviewer: separate subagent actor (same identity note); verdict
APPROVE_WITH_FINDINGS (1P2+3P3 folded in). Final source diff review of the
repair: APPROVE by separate local actor `review_mutations_034` on 2026-10-08.
No new serving-model identity is asserted by this review record.
Readiness evidence / unresolved decisions / parent acceptance owner: 047A audit confirmed GAP-081/082 are workaround-only with undiagnosed root cause → 047C PROCEED (workflow 047C section). Parent coordinator `047-coordinator`; parent acceptance: local author.
Frozen review manifest: submitted source revision `89d57f5`, repair `e0cc98f`.
- `apps/api/src/test-utils/resolve-test-database-url.ts` — blob `166392ad5b89dd1d6534c276c8cf4c6766205b13`.
- `apps/api/src/test-utils/resolve-test-database-url.test.ts` — blob `91c68f660bedf6e70653d03b82104cdb8ed025a4`.
- Caller paths at that revision: `apps/api/src/branches.test.ts`,
  `apps/api/src/selective-restore.test.ts`, `apps/api/src/e2e/setup.ts`.
- Diagnostic: `tasks/NF-WF-047C-diagnostic-receipt.md` — blob `a7cd59d541e0aaedf680681a75811a4ccfc9b547`.
The contract is identified by path and submission revision, without self-hashing.
Baseline: external branch submitted through `89d57f5`; the author accepted
local integration on 2026-10-08. Earlier no-merge instructions remain
historical external-worker boundaries; subsequent workers still require local acceptance.
Engram checkpoint topic key / last confirmed observation reference: `novelforge-ai/nf-wf-047/047C/<role>`; confirm save success; if unavailable, report GAP-021 and keep the fallback in this task file.

## Goal and reason

Diagnose why test-database configuration intermittently fails (GAP-081/082)
and repair the proven defect with the smallest change. The explicit
`DATABASE_URL` export workaround is stable but bypasses the loader — it is
not proof the loader is correct. A stable workaround must not masquerade as
a fixed defect.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10, §12, §13) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [External follow-up workflow](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md) — 047C section, Global constraints, Review focus, Execution order.
- [Environment preflight](../11-deployment/ENVIRONMENT-PREFLIGHT.md).
- [ADR-0003](../adr/ADR-0003-database-architecture.md) §8 (test-database policy).
- [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md) — GAP-081 (line ~1801), GAP-082 (line ~1809).
- [047A audit](../../tasks/NF-WF-047A-gap-evidence-audit.md) — GAP-081/082 dispositions.

## Environment prerequisites

Follow ENVIRONMENT-PREFLIGHT.md. Ubuntu native services (no Docker);
PostgreSQL 16 + pgvector and Redis running locally. Record actual OS/tool
versions and service endpoints (redacted). Use owned disposable databases
(`novelforge_test_*`); never reset a shared database or flush shared Redis.
Never print connection strings. Never alter credentials to hide a loader
defect.

## Dependencies and evidence

- Depends on: NF-WF-047A (disposition confirmed — READY).
- Blocks: none (047E proceeds on runtime evidence after accepted C changes,
  or explicitly limited).
- Active issues: GAP-081, GAP-082 (both OPEN, workaround-only).
- Record new technical problems in ISSUES-AND-GAPS.md through the
  coordinator before any workaround; reference those IDs here.

## Scope

Initial allowed paths (diagnosis): this contract file and a diagnostic
receipt owned by the implementer. Read-only inspection of all loaders and
callers (no edits until the scope is frozen and separately reviewed):
- All `process.loadEnvFile` call sites (~60 files per `git grep`; the
  `if (!process.env.DATABASE_URL)` guard pattern in ~58 of them).
- Named affected files: `apps/api/src/selective-restore.test.ts`,
  `apps/api/src/branches.test.ts`, `apps/api/src/e2e/setup.ts`,
  `apps/api/src/e2e/run.ts`.
- `packages/database/scripts/prepare-test-db.ts`.
- `apps/api/vitest.config.ts` and package scripts that invoke vitest.
- Repo-root `.env` (key names only; never values).

Post-diagnosis allowed paths (only if reproducible and separately reviewed):
the exact implementation/test paths frozen in the scope-freeze amendment
to this contract. Forbidden until then: every other file, including all
production code, migrations, and unrelated test files.

Out of scope: product features, new dependencies, historical migration
edits, CI configuration changes (proposal only, author-owned), and any
change to live credentials.

## Behavior and invariants

**Established mechanism (OBSERVED, verified 2026-10-07):**
- `process.loadEnvFile()` never overrides existing environment variables
  (proven on Node v24.20.0: parent-set value wins over the file value).
- Every test loader uses `if (!process.env.DATABASE_URL) {
  process.loadEnvFile(<repo-root .env>) }` — the `.env` file is consulted
  only when `DATABASE_URL` is entirely absent (ADR-0003 §8: "Tests load
  repo-root `.env` only when `DATABASE_URL` is not set").
- Consequence: a stale `DATABASE_URL` in the parent shell (e.g. exported
  earlier in the session with a superseded password) silently wins over a
  correct repo-root `.env`. No signal tells the operator their `.env` edit
  was ignored. This matches both gap reports: GAP-081's `.env` password
  verified correct via direct `psql` while the test failed auth; GAP-082's
  password "reset multiple times during the session" with each `ALTER USER`
  working transiently (each reset invalidates any previously exported URL).
- The "working-directory under pnpm" hypothesis in GAP-082 is refuted for
  the test files: paths derive from `import.meta.url` (`path.join(HERE,
  "..", "..", "..", ".env")`), not from cwd — absolute and correct under
  any launcher.

**What remains UNKNOWN (the implementer must determine):**
- Whether the stale parent `DATABASE_URL` is the SOLE cause in all
  reported incidents, or whether an additional mechanism exists (e.g. a
  pnpm script wrapper injecting the variable, a race in parallel workers).
- The exact provenance of the stale value in each historical incident
  (shell history is not available retroactively — record as UNKNOWN where
  it cannot be established).

**Invariants the fix must preserve:**
- ADR-0003 §8: CI passes `DATABASE_URL` explicitly; the `.env` fallback
  exists for local runs. The fix must not break either path.
- Scratch safety: test URLs are rewritten to disposable databases via the
  `withDb()` pathname pattern; the fix must never cause a test to silently
  select a live/production database.
- Secret hygiene: no connection string (or password-bearing URL) in logs,
  receipts, diffs, or error messages. Sanitized metadata only
  (user/host/database name, never credentials).

## Acceptance and verification

### Phase 1 — Diagnosis (reproduction matrix)

Run with sanitized host metadata (record repo/package cwd, never secrets):

| # | Condition | Expected per current code |
|---|---|---|
| D1 | `DATABASE_URL` absent, valid repo-root `.env` present | Loads from `.env`; tests connect |
| D2 | `DATABASE_URL` explicitly valid (exported) | Uses the exported value; `.env` ignored |
| D3 | `DATABASE_URL` stale/invalid (wrong password), valid `.env` present | OBSERVED: stale value wins silently; auth fails; `.env` ignored |
| D4 | `DATABASE_URL` absent, placeholder `.env` (GAP-105 pattern) | Fails (invalid URL) — record the exact error |
| D5 | `DATABASE_URL` absent, `.env` missing | Fails loudly: "DATABASE_URL not set and repo-root .env not found" |
| D6 | Under `pnpm vitest` vs `npx vitest` (same shell, no exported URL) | Record whether behavior differs; inspect pnpm script env if it does |

- [ ] D1–D6 executed and recorded with OBSERVED outcomes (not inferred).
- [ ] Each OBSERVED failure distinguished from historical hypotheses.
- [ ] If NOT reproducible: report the checked matrix and its limitation;
      do NOT invent a fix. The contract closes as "diagnosed: not
      reproducible on current host" with the matrix as evidence.

### Phase 2 — Scoped repair (only if Phase 1 reproduces)

- [ ] Responsible shared layer identified (current hypothesis: the
      `if (!DATABASE_URL)` guard + non-overriding `loadEnvFile`
      composition across ~60 duplicated call sites) with ALL consumers
      enumerated.
- [ ] Exact implementation/test paths frozen in a scope-freeze amendment
      to this contract; separate review precedes any edit.
- [ ] Smallest fix preserving ADR-0003 §8, host policy, and scratch
      safety. Candidate directions (implementer selects with reasons;
      reviewer validates): (a) a single shared `resolveTestDatabaseUrl()`
      helper replacing the ~60 duplicated blocks, emitting a loud
      sanitized warning when a parent-provided URL differs from the
      repo-root `.env` URL; (b) documentation-only standing note if the
      diagnosis shows the defect is purely operational (stale exports)
      with no code defect to fix — a workaround documented as a workaround,
      not a fix.
- [ ] Regression negatives: missing connection fails clearly; invalid
      connection fails clearly (no silent fallback); no path silently
      selects a non-test database; no secret leakage in any new
      message/log.

### Phase 3 — Runtime checks

- [ ] After scope freeze: named affected test files
      (`src/selective-restore.test.ts`, `src/branches.test.ts`) run via
      `pnpm --filter @novelforge/api exec vitest run
      src/selective-restore.test.ts src/branches.test.ts
      --no-file-parallelism` (serialize; shared scratch DB names).
- [ ] After a fix: API typecheck (`pnpm --filter @novelforge/api
      typecheck`) and lint on changed files, both exit 0.
- [ ] No blanket test-directory write access; no unrelated suites run
      "for confidence" outside the frozen scope.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

No product migration. Rollback: `git revert` of the fix commit restores
the previous loader behavior; the documented explicit-export host
configuration remains as the fallback. Never delete `.env` or rewrite
shared credentials as part of this task.

## Documentation and handoff

Use the Engram save/recovery protocol under topic
`novelforge-ai/nf-wf-047/047C/<role>`; confirm save success. If Engram is
unavailable, report GAP-021 and keep the fallback in this task file; never
invent or reuse a session ID.

The implementer's handoff includes: the Phase 1 matrix with OBSERVED
outcomes, the provenance finding (or UNKNOWN with reasons), the frozen
scope (exact paths) or the not-reproducible report, the selected fix with
reasons, regression-negative results, typecheck/lint receipts, and any
deviation from this contract. Follow
[MULTI-LLM-ORCHESTRATION.md](../06-ai/MULTI-LLM-ORCHESTRATION.md).

List unknowns, blocked checks, observed-vs-inferred findings, risks, and
the next dependency-ready task. Do not claim full platform completion.
GAP-081/082 closure is coordinator-owned (shared register); this task
provides the diagnosis/fix evidence only.

## Scope-freeze amendment (implementer, 2026-10-08 — Phase 1 reproduced, D3)

**Diagnosis:** Phase 1 reproduces the stale-parent-`DATABASE_URL` mechanism (D3). The loader mechanism itself is correct; the defect is the *silent* precedence + the ~56 duplicated guard blocks offering no signal. Diagnostic receipt: `tasks/NF-WF-047C-diagnostic-receipt.md`.

**Phase 2 direction (implementer recommendation, reviewer to validate):**
(a) Pilot a single shared helper implementing the hardened pattern already proven in `apps/api/src/simulation-causality.test.ts` (absent-or-placeholder → load `.env` → loud failure if still absent/placeholder), PLUS a sanitized warning when a parent-provided URL differs from the repo-root `.env` URL. Migrate the two named affected files as the pilot; the remaining ~53 files are follow-up, explicitly out of this scope. (b) Documentation-only remains the fallback if review finds the pilot unjustified — a workaround documented as a workaround, not a fix.

**Frozen Phase 2 paths (exact):**
- NEW: `apps/api/src/test-utils/resolve-test-database-url.ts` (single shared helper; no other new files)
- EDIT: `apps/api/src/selective-restore.test.ts` (replace guard block with helper call)
- EDIT: `apps/api/src/branches.test.ts` (replace guard block with helper call)
- EDIT: `apps/api/src/e2e/setup.ts` (replace guard block with helper call)
- Forbidden in Phase 2: all other 53 guard sites, production code, `packages/database/prisma.config.ts` (separate latent issue — record as new GAP if pursued), `apps/api/src/server.ts` (not a defect), migrations, CI config.

**Phase 2 acceptance (additive to contract):** the helper emits a loud sanitized warning (no credentials) when parent URL ≠ `.env` URL; missing/placeholder still fails loudly; ADR-0003 §8 both paths preserved; typecheck + lint exit 0; the two migrated test files pass.

**STOP — no implementation edits made.** Coordinator to dispatch separate review of this scope-freeze before any edit.

## Scope amendment (2026-10-08, reviewed-findings repair)

**Trigger:** post-push review of branch tip `a83be72` identified findings in
the 047C Phase 2 deliverable. This amendment adds the exact repair scope; the
frozen contract above is otherwise unchanged (append-only, NF-WF-045/047B
precedent).

**Baseline:** branch `work/nf-wf047-external-follow-up`; reviewed tip
`a83be72`; actual HEAD `a83be72` (verified 2026-10-08; one workstream file
modified — this amendment — no unrelated local changes to preserve). Origin fetch deferred to push time (private repo needs
auth; one passphrase covers fetch+push). Do NOT merge to main.

**Finding 1 — custom dotenv parser.** `readEnvFileDatabaseUrl` in
`apps/api/src/test-utils/resolve-test-database-url.ts` scans the `.env` file
line-by-line for `DATABASE_URL=`. It mishandles: quoted values (quotes
retained in the compared value → spurious mismatch warnings), `export`
prefixes (line not matched → comparison skipped → stale-parent signal
missed), and whitespace/comments around `=` (line not matched → signal
missed). The comparison feeds only the sanitized warning, but a wrong parse
either warns spuriously or misses the GAP-081/082 signal entirely.

**Repair (exact paths):**
- EDIT: `apps/api/src/test-utils/resolve-test-database-url.ts` — replace the
  custom parser with `node:util.parseEnv` (stdlib on Node v24.20.0; handles
  quotes, `export`, whitespace, comments). Preserve: explicit parent
  `DATABASE_URL` precedence via `process.loadEnvFile` non-override semantics;
  placeholder handling; loud failures; sanitized warning (never print
  credentials); never silently select another database. `parseEnv` output is
  used for the sanitized parent-vs-file comparison only; it must never be
  assigned into `process.env` (that would silently break parent precedence).
- NEW: `apps/api/src/test-utils/resolve-test-database-url.test.ts` —
  committed regression tests (exact scope below).
- EDIT: `docs/implementation/ISSUES-AND-GAPS.md` — GAP-081/082 evidence
  correction (coordinator-owned; see Finding 2).
- EDIT: `tasks/NF-WF-047C-test-environment-stability.md` — this amendment +
  handoff reconciliation (Finding 3).
- EDIT: `tasks/NF-WF-047A-gap-evidence-audit.md`,
  `tasks/NF-WF-047E-native-release-preparation.md`,
  `tasks/NF-WF-047F-scale-quota-proposals.md` — handoff reconciliation only.
- Forbidden: all other files, including the remaining ~53 loader call
  sites, production code, migrations, CI config.

**Test scope (exact, frozen):** the new test file covers —
1. Quoted assignment: `DATABASE_URL="postgresql://..."` → quotes stripped;
   equal parent/file values → no mismatch warning.
2. `export DATABASE_URL="..."` syntax → parsed; differing parent value →
   warning fires.
3. Whitespace/comments: `  DATABASE_URL = postgresql://...  # comment`
   (space around `=`) → parsed; differing parent value → warning fires.
   (The old parser does not match this line → signal missed → FAIL on old.)
4. Equal parent/file values → no mismatch warning.
5. Different parent/file values → warning fires; warning text contains no
   credential material (assert password substring and `://` absent).
6. Missing `DATABASE_URL` (absent parent + missing file) → throws the
   documented "not found" error.
7. Placeholder value (parent absent, file holds the placeholder marker) →
   throws the documented placeholder error.
8. Invalid configuration (empty-string parent; a file from which no valid
   `DATABASE_URL` can be extracted — note `parseEnv` is lenient and never
   throws, so this relies on the loud-throw path) → explicit failure; no
   silent fallback; no secret leakage in any message.
- TDD demonstration: run the new tests against the OLD helper first; the
  parser cases (1–3) must FAIL (recorded as evidence); then apply the fix;
  all pass.
- Tests use temp `.env` files and save/restore `process.env.DATABASE_URL`;
  no database connection is made (dummy URLs only).

**Finding 2 — GAP-081/082 evidence overclaim.** The closure entries claim
"root cause diagnosed and repaired" as a confirmed historical cause and
imply a platform-wide fix. Correction (coordinator): describe the bounded
three-caller improvement; preserve UNKNOWN historical provenance (exact
stale values not retroactively establishable; D3 reproduces the mechanism,
not the historical incidents); record the ~53 unmigrated call sites as
remaining work; do not claim a platform-wide fix or confirmed historical
cause.

**Finding 3 — stale handoffs.** Reconcile Status, Implementer/Reviewer role
lines, Frozen review manifest, and review records in 047A/C/E/F with actual
evidence. Record observed actor separation (separate subagent actors;
identities MODEL_UNVERIFIED per GAP-013); never invent actor identities or
review approval; keep pending reviews explicitly pending.

**Verification:** new helper tests; `src/selective-restore.test.ts` +
`src/branches.test.ts` (serialized); API typecheck; lint on changed files.
Independent diff review of the final diff before commit. Commit + push the
work branch (passphrase at that time); do not merge to main.

**Engram:** unavailable on this host (GAP-021); task-file fallback records
in this contract. No session ID invented.

## Local acceptance receipt — 2026-10-08

OBSERVED on `89d57f5` using the existing Windows PostgreSQL16 Docker5433
and Redis6379 services, dedicated scratch databases and no author-data reset:

- `pnpm --filter @novelforge/api exec vitest run src/test-utils/resolve-test-database-url.test.ts src/selective-restore.test.ts src/branches.test.ts --no-file-parallelism`: exit0, three files, 32/32 tests (eight helper regressions).
- `pnpm --filter @novelforge/api exec tsc --noEmit`: exit0.
- `pnpm exec eslint apps/api/src/test-utils/resolve-test-database-url.ts apps/api/src/test-utils/resolve-test-database-url.test.ts apps/api/src/selective-restore.test.ts apps/api/src/branches.test.ts apps/api/src/e2e/setup.ts`: exit0.

Logs: host `TEMP/novelforge-review-89d57f5`. The source review by the separate
`review_mutations_034` actor approved both prior P2 repairs and found one P3
stale-handoff issue, corrected by this acceptance amendment. No fresh full
API/worker/web battery, E2E loop, build, live provider or production acceptance
is claimed. Integration handoff edits affect documentation only.

Historical pre-submission manifest: at `a83be72`, helper blob `68309dd4`
and contract blob `ef76bf3a` preceded the repair; the new test and amended
helper were then uncommitted and final review pending. Those descriptions
were accurate for that boundary and do not describe the accepted submission.
The earlier STOP scope-freeze note is historical; the later reviewed scope
amendment and submitted repair supersede it.
