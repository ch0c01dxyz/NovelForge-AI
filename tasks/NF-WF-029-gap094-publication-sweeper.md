# Task NF-WF-029: Publication interval sweeper (GAP-094)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (pending contract review; separate review before implementation)
Milestone / capability IDs: M8 (production operations; NF-WF-023B follow-up)
Implementer role / requested and resolved model: TBD (separate actor from drafter/reviewer)
Reviewer role / requested and resolved model: TBD (separate actor from drafter/implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-094; coordinator acceptance
Frozen review manifest / exact artifact paths and identity: N/A (pre-implementation)
Baseline revision / local changes to preserve: eb065cf (or newer that contains it); no local changes expected
Engram checkpoint topic key / last confirmed observation reference: N/A (fallback to task/CURRENT record per template)

## Goal and reason

Close GAP-094: a publication stuck SCHEDULED past its due time must be
detected and re-enqueued within a bounded interval, not only at the next
worker deploy/restart. Add an interval sweeper to the publication worker
that reuses the existing remove-first-then-enqueue reconciliation pattern,
bounded to due rows, safe against concurrent workers.

This is P3 infrastructure work. Its dependency is NF-WF-012 (publication
release contract) and the 023B job inventory (recovery contracts).

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12 multi-LLM orchestration protocol)
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md)
- [GAP-094](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1922)
- [023B job inventory](../../docs/implementation/023B-job-inventory.md) (publication recovery contract, §2)
- `apps/worker/src/publication-jobs.ts` (startup reconciliation `reconcileScheduledPublications`, lines 345–401; `startPublicationWorkerApp`, lines 461+)
- `apps/worker/src/workflow-jobs.ts` (reference: `runRecoverySweep` + 60s interval timer, lines 99–116, 332–340)
- `packages/workflow-executor/ports.ts:212` (`WORKFLOW_SWEEPER_INTERVAL_MS = 60_000`)

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task prerequisites
without Docker; Windows reuses existing running Docker services/data. List
permission/network/credential blockers; never reset working databases for tests.

Tests use disposable scratch databases and isolated BullMQ queues (per 023B
R1/R2 precedent: `023b-r1-test`, `023b-r2-test` style disposable queue names).
Do not run the sweeper against a production Redis.

## Dependencies and evidence

- NF-WF-012: IMPLEMENTED (publication release contract; the fire transition is idempotent; jobId = publication id)
- NF-WF-023B: IMPLEMENTED (job inventory; recovery contracts documented; R1/R2 recovery tests PASS)
- GAP-094: OPEN (P3) — this task closes it
- Active related gaps: GAP-095 (memory-rebuild, separate task), GAP-096 (notifications, separate task). Do not touch those queues in this task.

## Scope

### Allowed paths

- `apps/worker/src/publication-jobs.ts`:
  - New exported constant `PUBLICATION_SWEEPER_INTERVAL_MS` (value: 60_000, matching `WORKFLOW_SWEEPER_INTERVAL_MS`; justification in Behavior §Invariant 3).
  - New exported function `sweepDuePublications({ db, queue, logger, now? })` — bounded reconciliation pass over SCHEDULED rows past due (see Behavior). The `now?` parameter defaults to `new Date()` when not provided (for test injection).
  - Wire the interval timer into `startPublicationWorkerApp` (mirroring the workflow-runs pattern: startup pass + `setInterval`, `timer.unref?.()`, guard on `stopped`).
  - `PublicationWorkerDeps` may gain an optional `sweeperIntervalMs` (default `PUBLICATION_SWEEPER_INTERVAL_MS`) for test injection.
- `apps/worker/src/publication-jobs.test.ts`: new tests for the sweeper (see Acceptance).

### Forbidden paths

- Everything else, including:
  - `apps/worker/src/workflow-jobs.ts`, `memory-jobs.ts`, `notification-fanout-jobs.ts` (other queues' recovery is out of scope — GAP-095/096 are separate tasks).
  - `apps/api/src/**` (no API changes; the sweeper is worker-owned per the 023B contract).
  - Database migrations (no schema change; uses existing `publications` table + existing indexes).
  - Changing publication fire semantics, the SCHEDULED→PUBLISHED transition, or the startup reconciliation behavior (Invariant 1).
  - Unbounded scans: the interval pass must NOT scan all SCHEDULED rows (see Invariant 2).

### Inputs

- `publications` table rows with `status = "SCHEDULED"` and `scheduledFor <= now` (bounded query).
- BullMQ `publication` queue (`PublicationReconQueue` port — same interface as startup reconciliation).
- Existing `reconcileScheduledPublications` logic (the remove-first-then-enqueue pattern) — reuse, do not reimplement.

### Outputs

- `sweepDuePublications` function returning a sweep report `{ scanned, reenqueued, leftAlone }` (same shape as `reconcileScheduledPublications` for log consistency).
- Interval timer in `startPublicationWorkerApp` (startup + every 60s).
- Tests proving stuck-job detection, re-enqueue, and no-duplicate-fire under concurrency.

### Out of scope

- GAP-095 (memory-rebuild reconciliation) — separate task (Role F).
- GAP-096 (notifications fan-out retry) — separate task (Role G).
- Health-check-driven reconciliation as an alternative trigger (the interval sweeper is the chosen mechanism; the contract does not require both).
- Changing the 60s interval (if the implementer finds evidence it is wrong, record a finding and amend — do not silently change).

## Behavior and invariants

### Happy path

Every 60s (and once at startup via the existing reconciliation), the
sweeper queries SCHEDULED publications past due, checks each row's
BullMQ job state via `queue.getJob(row.id)`, and re-enqueues
(remove-first-then-enqueue) any row whose job is missing, `failed`, or
`unknown`. Rows with a live job (delayed, waiting, active, completed)
are left alone.

### Invariant 1 — Reuse, don't rewrite the reconciliation pattern

The sweeper MUST reuse the exact remove-first-then-enqueue logic from
`reconcileScheduledPublications` (the P2-6 hazard: re-adding against a
`failed` job record is a silent no-op). Either extract the per-row
reconcile logic into a shared helper used by both the startup pass and
the interval sweeper, or have the sweeper call the same code path.
The startup reconciliation behavior must not change.

### Invariant 2 — Bounded resource usage

The interval query MUST be bounded: `WHERE status = "SCHEDULED" AND
scheduledFor <= now` (not the startup pass's unbounded "all SCHEDULED
rows"). Rationale: the startup pass scans all rows once to catch
future-scheduled rows whose jobs were lost (the crash window); the
interval pass only needs due rows because future rows still have time
for their delayed jobs to fire. A deployment with 10,000 future
scheduled publications must not pay a full scan every 60s.

### Invariant 3 — Interval justification

`PUBLICATION_SWEEPER_INTERVAL_MS = 60_000` (60s), matching
`WORKFLOW_SWEEPER_INTERVAL_MS`. Justification: (a) consistency with the
existing sweeper reduces operational surprise; (b) publication fire
is time-sensitive but not sub-minute critical (scheduled fire times
are author-set, typically minutes/hours ahead); (c) 60s bounds the
GAP-094 detection latency to ≤ 60s + startup, vs. unbounded today.

### Invariant 4 — Idempotent recovery (no double-fire)

Re-enqueue MUST use the existing pattern: `jobId = publication id`
(BullMQ deduplicates by jobId) + remove-first-then-enqueue for
`failed`/`unknown` states. The fire handler is idempotent (already
fired → no-op success per 023B §2). The sweeper must never cause two
live `fire` jobs for the same publication.

### Invariant 5 — Safe against concurrent workers

Two worker processes running the sweeper concurrently must not
double-enqueue. The `jobId`-based dedup + the getJob-state-check
before enqueue provides the safety: if worker A enqueues job X and
worker B's sweep sees job X as `delayed`/`waiting`, B leaves it alone.
The per-row check-then-act is not atomic, but the consequence of a
race is at most a redundant remove-then-enqueue (same jobId → no
duplicate job), never a double fire (fire is idempotent).

### Invalid input / edge cases

- Row with `scheduledFor = NULL`: treat as due immediately (delay 0), matching the startup reconciliation's `Math.max(0, ...)` fallback.
- Row that transitions to PUBLISHED/UNPUBLISHED between the query and the job check: the fire handler's idempotency (row no longer SCHEDULED → no-op) covers this; the sweeper should still skip re-enqueue if a fresh read shows non-SCHEDULED (defensive, not required).
- Redis unavailable during a sweep pass: log loudly, do not crash the worker, do not mark the sweep as successful; the next interval retries (mirrors the startup reconciliation's "log loudly, don't prevent consumer" posture).

### Failure and cancellation

- A sweep pass that throws must not kill the interval timer; log the error and continue on the next tick (mirrors `runRecoverySweep`'s error handling which logs and rethrows — but for the interval, the timer must survive; catch inside the tick).
- Per-row error handling note for the implementer: if one row's `remove()` throws, the sweep loop aborts and remaining rows wait for the next 60s pass. This matches the existing startup reconciliation behavior. If the implementer adds per-row try/catch, document it as a behavior difference.
- On worker `stop()`: clear the interval timer (mirror the workflow-runs `stopped` guard + timer cleanup).

## Acceptance and verification

- [ ] `sweepDuePublications` exists, is exported, and queries only `SCHEDULED` + past-due rows (bounded; verify the WHERE clause in code review).
- [ ] Test: a publication stuck SCHEDULED past due with no BullMQ job is detected and re-enqueued within one sweep pass (assert `reenqueued: 1`, job exists with correct jobId and delay ≈ 0).
- [ ] Test: a SCHEDULED publication with a live delayed job (future `scheduledFor`) is left alone (assert `leftAlone: 1`, no duplicate job).
- [ ] Test: a SCHEDULED past-due publication with a `failed` job record is re-enqueued via remove-first-then-enqueue (assert the failed record is removed, exactly 1 live job, no silent no-op).
- [ ] Test (edge case): a SCHEDULED past-due publication with an `unknown` job state is re-enqueued via remove-first-then-enqueue (assert the stale record is removed, exactly 1 live job).
- [ ] Test (edge case): a SCHEDULED publication with `scheduledFor = NULL` is treated as due immediately and re-enqueued with delay ≈ 0 (matching the startup reconciliation's `Math.max(0, ...)` fallback).
- [ ] Test: concurrent sweeps (two overlapping `sweepDuePublications` calls) do not create duplicate jobs (assert exactly 1 job per publication id after both complete).
- [ ] Test: the interval timer is wired in `startPublicationWorkerApp` (assert via `sweeperIntervalMs` dep injection with a short interval, or via code review + startup log).
- [ ] `PUBLICATION_SWEEPER_INTERVAL_MS = 60_000` is exported and used as the default.
- [ ] Existing `publication-jobs.test.ts` suite still passes (no regression in startup reconciliation or fire handler).
- [ ] `pnpm lint` and `npx tsc --noEmit` (apps/worker) clean.
- [ ] Separate review of the submitted diff; findings resolved.
- [ ] GAP-094 CLOSED with evidence (sweep report + test results).

Record actual results separately from expectations. Zero selected tests or
skipped integration checks do not pass a capability gate.

## Migration and rollback

- **Existing data:** none — no schema change, no data migration. The sweeper reads existing `publications` rows.
- **Populated/empty database paths:** empty table → sweep returns `{ scanned: 0, ... }`, no-op. Populated → bounded query.
- **Concurrent writers:** the API may schedule/cancel publications while the sweeper runs; the jobId dedup + fire idempotency cover races (Invariant 5).
- **Baseline revision:** eb065cf (or newer containing it).
- **Deployment compatibility:** the sweeper is additive — a worker without it (old binary) and a worker with it can coexist; both use the same jobId pattern. No flag day.
- **Rollback:** remove the interval timer wiring (one-line revert in `startPublicationWorkerApp`); the startup reconciliation remains. No data cleanup needed.

## Documentation and handoff

- Update `docs/implementation/023B-job-inventory.md` §2 (publication recovery contract): change "no interval sweeper" to describe the 60s sweeper; update the "Stuck job" bullet.
- Record GAP-094 CLOSED in `docs/implementation/ISSUES-AND-GAPS.md` with evidence (test results, sweep report shape).
- Use the playbook's Engram save/recovery protocol. Include task/worktree/role, current revision/diff, completed evidence, unfinished step, next action, issue IDs and review state. If Engram fails, keep this compact handoff in the existing task/CURRENT record and log the problem in ISSUES-AND-GAPS.md.
- Update `docs/14-progress/CURRENT.md` with verified scope per the template.
- List unknowns, blocked checks, observed versus inferred findings, risks, and the next dependency-ready task. Do not claim full platform completion.
