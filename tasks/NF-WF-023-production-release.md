# NF-WF-023 — Production Operations and Release Verification

Status: IMPLEMENTATION PRESENT / RELEASE ACCEPTANCE OPEN (2026-10-07).
Operations implementation is committed in 4edf1e8; the historical release battery did not complete. Rerun the battery on the current host after NF-WF-025. Do not dispatch a duplicate implementation or infer green release gates.
Historical contract status: PLANNED.

## Normative vs informative

Normative: the contract sections (Goal, Scope, Behavior and invariants,
Child sections, Acceptance). Informative: rationale, examples, and
appendices.

## Goal and reason

Prove the platform is safe to ship. NF-WF-023 is the production
release gate for everything built in M0–M7 (workflows 014–022): it
verifies that backups actually restore, that every migration applies
cleanly on a fresh database, that tenant isolation holds across all
new tables, that background jobs recover from crashes, that the API
meets resource budgets, and that the entire test battery is green
under a precise, auditable definition of "green".

023 is verification, not feature work. It ships no new product
behavior. Defects found during verification are recorded as GAPs and
fixed only through the two narrowly-scoped, pre-authorized closures
below (GAP-062, GAP-076); everything else goes to a follow-up task.

This is M8. Its dependency is the promised scope of 014–022, all
IMPLEMENTED + PUSHED.

## Required reading

- `AGENTS.md` (constitution, especially §10 development rules, §15
  foundational design)
- `docs/06-ai/MODEL-EVIDENCE-POLICY.md` (evidence labels are mandatory
  in 023 — every claim is OBSERVED from an executed run, never
  INFERRED from code reading)
- `docs/implementation/DELIVERY-PLAN.md` (the 023 row)
- `docs/11-deployment/DEPLOYMENT.md` (existing backup/upgrade notes)
- `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (host provisioning;
  GAP-065 applies)
- `apps/web/a11y/AUDIT-014.md` (GAP-051: the screen-reader item is
  PENDING HUMAN VERIFICATION)
- GAP-051, GAP-062, GAP-076 in
  `docs/implementation/ISSUES-AND-GAPS.md`

## Environment prerequisites

Standard: PostgreSQL 16 + pgvector 0.6.0, Redis 7, pnpm, on the dev
host per ENVIRONMENT-PREFLIGHT. GAP-065 applies (re-apply
`novelforge_test` role + `vector` in `template1` after any VM
replacement). All 023 work uses disposable scratch databases only —
never production data, never a shared dev database.

## Dependencies and evidence

- 014–022: IMPLEMENTED + PUSHED (the promised scope under
  verification)
- `/health` (liveness) and `/ready` (readiness) probes already exist
  (`apps/api/src/app.ts`) — no new probe routes needed

## Child split

Per the delivery-plan multi-child rule, NF-WF-023 splits into three
independently reviewable children. Each child has its own contract
section below, its own implementer, its own diff review, and its own
commit. Completion of NF-WF-023 requires all three.

| Child | Scope | Independent verifiability |
|---|---|---|
| **023A — Data safety** | Backup/restore drill; migration integrity on a fresh DB; tenant-isolation audit across all 014–022 tables | Verifiable without jobs or the full battery: run the drill, run `migrate deploy` from zero, run the isolation negative tests |
| **023B — Operational readiness** | Job recovery (BullMQ crash/stuck behavior); resource/load budgets; GAP-062 closure (PDF 500 on non-WinAnsi prose) | Verifiable without the full battery: kill a worker mid-job and observe recovery; measure budgets; assert the PDF route no longer 500s |
| **023C — Release acceptance** | The full evidence battery under the pinned "green" definition; automated a11y pass + human screen-reader gate (GAP-051); GAP-076 e2e-harness race fix | Verifiable as the battery itself: every suite listed in §"Green" definition passes, sequentially, with recorded counts |

**Build order:** 023A and 023B in parallel; 023C after (it executes
the full battery, which subsumes the others' surfaces).

## Scope

### Allowed

- Backup/restore drill on scratch data (`pg_dump` → fresh DB →
  verify row counts, app boot, key queries); the procedure documented
  as a runbook
- Fresh-database migration run: `prisma migrate deploy` from zero,
  all 014–022 migrations, in order, zero failures
- Tenant-isolation audit: every table added in 014–022 gets a
  negative test (cross-workspace read → 404/403); code audit for
  missing `workspaceId`/`novelId` filters
- Job inventory + recovery verification: enumerate every BullMQ queue
  / worker / sweeper; verify crash recovery and stuck-job handling
  with simulated failures (test-only)
- Resource budgets: define per-route p50/p95 latency budgets and DB
  query budgets on a pinned fixture; measure; record exceedances as
  GAPs (no silent tuning of the app to meet budgets)
- GAP-062 closure: exactly one of the GAP's two closure options —
  typed refusal for unencodable prose (preferred, minimal) or
  Unicode font embedding (only with an ADR for the packaging
  decision). The 500 on valid input must not ship.
- GAP-076 closure: make `getE2E()` setup race-safe (test harness
  only — file lock, single setup per worker run, or equivalent)
- Full evidence battery per the pinned "green" definition
- Automated a11y: run every axe suite; zero violations; en+id
  parity spot-check on 014–022 surfaces

### Forbidden

- New product features, new API routes, new capabilities, schema
  changes (beyond the zero-migration rule below)
- Weakening any invariant from 014–022 (023 proves them, never
  relaxes them)
- Fixing discovered defects inline beyond the two pre-authorized
  closures (GAP-062, GAP-076) — everything else becomes a GAP for a
  follow-up task
- Tuning app code to meet load budgets (budgets are observations;
  exceedances are GAPs)
- Running the battery against production data or a shared database
- Claiming "green" from a partial run, a concurrent run (see
  Invariant 4), or a stale receipt

### Inputs

- The 014–022 codebase at the release revision
- Scratch PostgreSQL + Redis on the dev host
- The existing test suites (API vitest, web vitest, e2e, axe)

### Outputs

- Backup/restore runbook (`docs/11-deployment/` or
  `docs/implementation/`)
- Migration-from-zero evidence log
- Tenant-isolation audit report (table × test result)
- Job inventory + recovery test evidence
- Resource budget table (route × p50/p95 × budget × pass/fail)
- Full battery report with per-suite counts (the "green" checklist,
  all boxes ticked with OBSERVED evidence)
- Release decision: SHIP / SHIP_WITH_KNOWN_GAPS / NO_SHIP, with the
  gap list

### Out of scope (with follow-up owner)

- New features or UX work (future workflows)
- The human screen-reader pass itself (GAP-051) — 023 verifies the
  automated half and records the manual pass as a release gate owned
  by a human auditor; agents cannot perform it
- Production deployment execution (the release engineer, after 023)
- Load testing beyond the pinned budgets (a dedicated perf task, if
  needed)

## Behavior and invariants

### Invariant 1 — Verification only
023 changes no product behavior. The only code changes permitted are
the two pre-authorized closures (GAP-062 typed refusal, GAP-076
harness race fix), each narrowly scoped and separately reviewed. Any
other defect found becomes a GAP; it is not fixed inside 023.

### Invariant 2 — No invariant weakening
023 must not relax, reinterpret, or silently drop any invariant
pinned by 014–022. The battery is evidence that the invariants hold,
not an occasion to renegotiate them.

### Invariant 3 — Evidence honesty
Per MODEL-EVIDENCE-POLICY: every 023 claim is labeled. Test results
are OBSERVED from executed runs with recorded context (revision,
date, environment). Environment-blocked suites are reported as
BLOCKED with the blocker, never as passes and never silently
skipped. No inherited counts: a suite is green only when it ran
green in 023.

### Invariant 4 — Sequential battery
The full API vitest suite and `pnpm e2e` (or per-file e2e runs) are
NEVER executed concurrently (GAP-076 procedural lesson: concurrent
scratch-DB teardown corrupts results). 023C runs the battery
strictly sequentially and records the order.

### Invariant 5 — Scratch data only
Backup drill, migration runs, isolation tests, and load measurements
use disposable scratch databases. 023 never reads or writes
production data. The drill restores into a fresh scratch DB, never
over an existing one.

### Invariant 6 — Design, i18n, a11y
023 adds no user-facing UI. If a child needs any UI surface (none
planned), §15 foundational design, en+id parity, and axe zero
violations apply.

## "Green" definition (pinned)

"Green" for the 023 release battery means ALL of the following,
executed sequentially on the release revision, with per-suite counts
recorded:

1. `pnpm lint` (repo lint): exit 0.
2. `npx tsc --noEmit` (apps/api): exit 0.
3. `npx vue-tsc --noEmit` (apps/web): exit 0.
4. API vitest suite: every test file passes; **0 failed tests**; the
   report lists files run and tests passed.
5. Web vitest suite: every test file passes; **0 failed tests**; the
   report lists files run and tests passed.
6. e2e: every e2e file passes via sequential per-file runs (the
   GAP-076 fix may additionally make the single `pnpm e2e` command
   reliable; until proven, per-file sequential is the method of
   record).
7. Axe suites (all `*.axe.test.ts`): **zero violations** (wcag2aa +
   wcag22aa).
8. No new GAPs opened during 023C's battery execution except
   environment-blocked items with recorded evidence (which fail the
   battery until the environment is fixed — they do not waive it).
   GAPs opened by 023A/023B's verification work are expected outputs
   that feed the release decision's known-gap list; they do not fail
   the battery.

A single failed test, a skipped suite without a recorded
environment blocker, or a concurrent run invalidates "green".

## Child 023A — Data safety

### Goal

Prove the data layer is safe: backups restore, migrations apply from
zero, and tenants cannot see each other's rows.

### Backup/restore drill

- Seed a scratch DB with representative data (novels, chapters,
  revisions, branches, simulation runs, endgame ledgers — covering
  014–022 tables).
- `pg_dump` (custom format) → restore into a **fresh** scratch DB.
- Verify: per-table row counts match; the API boots against the
  restored DB (`/ready` 200); a pinned set of key queries (novel
  read, chapter read, revision history, branch switch) returns
  identical results before/after.
- Document the exact commands as a runbook
  (`docs/11-deployment/BACKUP-RESTORE-RUNBOOK.md` or equivalent).

### Migration integrity

- `prisma migrate deploy` against an empty database: all migrations
  apply in order with zero failures.
- Verify the GAP-030 idempotency pattern holds on re-run
  (`migrate deploy` twice → second run is a no-op, no errors).
- Record the migration count and the deploy log.

### Tenant-isolation audit

- Inventory every table added in 014–022 (from the migrations).
- For each table: a negative test asserting cross-workspace access
  is refused (404 for non-members per ADR-0004, 403 for wrong role).
  Tables readable only through scoped services get a service-level
  negative test instead; the audit records which.
- Code audit: grep for Prisma queries on the new tables missing a
  `workspaceId`/`novelId` filter; each finding is a GAP (P1 if
  exploitable).

### Routes

None new. (`/health`, `/ready` already exist.)

### Web UI

None.

### Migration

None. (023A verifies migrations; it does not add any.)

### Acceptance — 023A

- [ ] Backup/restore drill completes; row counts match; `/ready`
  200 on the restored DB; key queries identical; runbook written.
- [ ] `migrate deploy` from zero: all migrations apply, zero
  failures; re-run is a clean no-op; log recorded.
- [ ] Isolation audit: every 014–022 table has a passing negative
  test (or a recorded service-level equivalent); zero unfiltered
  queries found (or each found query is a GAP with severity).
- [ ] No product code changes (Invariant 1); no schema changes.

## Child 023B — Operational readiness

### Goal

Prove the platform behaves under failure and under load: jobs
recover, budgets are measured, and the known PDF 500 (GAP-062) is
closed.

### Job inventory and recovery

- Inventory every BullMQ queue, worker, delayed job, and sweeper
  (004 workflow executor, 012 publication queue/scheduler, memory
  queue, notification queue, and any others found during inventory).
- For each: document the recovery contract (what happens on worker
  crash mid-job, on Redis restart, on a stuck job — retry policy,
  idempotency key behavior, poison-message handling).
- Verify with simulated failures (test-only): kill a worker
  mid-job → the job recovers per its contract (completes, retries
  with backoff, or moves to failed with a recorded receipt — never
  silently lost, never double-applied where idempotency is
  promised).
- Stuck-job detection: verify the sweeper/reconciliation (004, 012)
  detects and recovers jobs stuck beyond their expected window;
  record the detection latency.

### Resource/load budgets

- Pin a measurement fixture (novel size, chapter count, revision
  depth — documented so the numbers are reproducible).
- Measure, on the dev host, p50/p95 latency for a pinned set of
  critical routes (auth, novel read, chapter read/write, revision
  history, branch switch, export, simulation step, endgame
  debt-report) and DB query counts for the heaviest operations.
- Record a budget table: route × p50 × p95 × budget × pass/fail.
  Budgets are set from the measurements plus headroom and recorded
  as observations; any route exceeding its budget becomes a GAP
  (the app is NOT tuned to meet budgets inside 023 — Invariant 1).

### GAP-062 closure

- The `GET .../export?format=pdf` 500 on non-WinAnsi prose must not
  ship. Implement exactly one closure option from the GAP:
  - **Preferred (minimal):** typed refusal — detect unencodable
    characters before rendering and return an actionable 4xx with
    a message naming the remedy (e.g. export as DOCX/EPUB), instead
    of the 500. No new font assets, no ADR needed.
  - **Alternative:** embed a Unicode-capable font — only with an
    ADR recording the packaging decision (font asset in
    `apps/api`).
- Tests: WinAnsi prose still renders (no regression); CJK/emoji
  prose returns the typed refusal (or renders, if the font option
  is taken); the 500 is gone.
- This is the only product-code change in 023B; it is separately
  diff-reviewed as part of 023B.

### Routes

None new. (GAP-062's typed refusal rides the existing export route's
error shape.)

### Web UI

None. (If the typed refusal needs a UI string, it reuses existing
i18n error patterns with en+id parity.)

### Migration

None.

### Acceptance — 023B

- [ ] Job inventory complete; every queue/worker/sweeper has a
  documented recovery contract.
- [ ] Simulated worker-kill recovery verified per contract; no job
  silently lost; no double-apply where idempotency is promised.
- [ ] Stuck-job detection verified; detection latency recorded.
- [ ] Budget table recorded (p50/p95 per pinned route on the pinned
  fixture); exceedances are GAPs, not silent passes.
- [ ] GAP-062 closed: PDF export no longer 500s on non-WinAnsi
  prose (typed refusal or Unicode rendering, per the chosen
  option); WinAnsi rendering unregressed.
- [ ] No other product code changes (Invariant 1); no schema
  changes.

## Child 023C — Release acceptance

### Goal

Execute the full evidence battery under the pinned "green"
definition, run the automated accessibility pass, fix the e2e
harness race (GAP-076), and render the release decision.

### GAP-076 closure (e2e harness race fix)

- Make `getE2E()` in `apps/api/src/e2e/setup.ts` race-safe: the
  terminate/drop/create sequence must not kill an in-flight fixture
  build from another test file's setup. Allowed approaches: a file
  lock, single setup per worker run, or skipping the terminate when
  the caller is in the same OS process tree. Test-harness code
  only — no product changes.
- Verify: `pnpm e2e` as a single command completes reliably
  (multiple consecutive runs, or the race is proven gone by
  construction + a stress run). Until the single command is proven
  reliable, sequential per-file runs remain the method of record
  for the battery.

### Full evidence battery

Execute, strictly sequentially (Invariant 4), on the release
revision:

1. `pnpm lint` → exit 0.
2. `npx tsc --noEmit` (apps/api) → exit 0.
3. `npx vue-tsc --noEmit` (apps/web) → exit 0.
4. Full API vitest suite → 0 failures; record files/tests.
5. Full web vitest suite → 0 failures; record files/tests.
6. e2e (per-file sequential, or single `pnpm e2e` if the GAP-076
   fix is proven) → all files pass; record files/tests.
7. All axe suites → zero violations.

Record per-suite counts in the battery report. Battery failure handling
(distinguishing the three cases per Invariant 1):
- *Pre-authorized fix (GAP-062/076) or environment fix:* the battery
  re-runs after the fix within 023.
- *New defect (not pre-authorized):* the battery STOPS; the defect
  becomes a GAP; no re-run occurs in 023; the release decision is
  NO_SHIP (or SHIP_WITH_KNOWN_GAPS if the gap is assessed non-blocking,
  with severity and owner recorded).
- *Environment-blocked suite:* fails the battery per Box 8 (does not
  waive it); re-run permitted after the environment is repaired.

### Accessibility

- Run every `*.axe.test.ts` suite: zero violations (wcag2aa +
  wcag22aa), en+id.
- GAP-051: the automated half is verified here. The manual
  screen-reader pass (NVDA + Firefox / VoiceOver + Safari) cannot
  be performed by agents — 023C records it as an explicit release
  gate owned by a human auditor, updates `apps/web/a11y/AUDIT-014.md`
  (and any sibling audit docs) with the gate status, and the
  release decision reflects it (SHIP_WITH_KNOWN_GAPS at best until
  the human pass completes).

### Release decision

Render one of: **SHIP** / **SHIP_WITH_KNOWN_GAPS** / **NO_SHIP**,
with:
- The completed "green" checklist (all boxes ticked with OBSERVED
  evidence, or the specific failing box named).
- The known-gap list (open GAPs at release time, with severity and
  owner).
- The human screen-reader gate status (GAP-051).

### Routes

None new.

### Web UI

None.

### Migration

None.

### Acceptance — 023C

- [ ] GAP-076 closed: `getE2E()` race-safe; single-command `pnpm e2e`
  proven reliable or per-file sequential pinned as the method.
- [ ] Battery executed sequentially per the "green" definition;
  per-suite counts recorded; all 8 boxes ticked (or the failing
  box named with its GAP).
- [ ] Axe suites: zero violations across all suites.
- [ ] GAP-051: automated half verified; human screen-reader pass
  recorded as an explicit release gate with a named owner; audit
  docs updated.
- [ ] Release decision rendered (SHIP / SHIP_WITH_KNOWN_GAPS /
  NO_SHIP) with the gap list.
- [ ] No product code changes outside the GAP-076 harness fix
  (Invariant 1); no schema changes.

## Acceptance and verification (parent)

- [ ] All three children IMPLEMENTED with diff reviews.
- [ ] "Green" definition satisfied: all 8 boxes ticked with
  OBSERVED evidence (or the release decision is NO_SHIP with named
  causes).
- [ ] Backup/restore runbook exists and the drill evidence is
  recorded.
- [ ] Tenant-isolation audit: zero unaddressed P1 findings.
- [ ] GAP-062 closed (no PDF 500 on valid input).
- [ ] GAP-076 closed (e2e harness race-safe).
- [ ] GAP-051: human screen-reader gate recorded with owner (agents
  do not claim it).
- [ ] No invariant from 014–022 weakened (Invariant 2).
- [ ] Backends MODEL_UNVERIFIED per GAP-013 (standing).
