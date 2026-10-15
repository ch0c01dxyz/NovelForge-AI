# Task NF-WF-051: Memory reconciliation interval sweeper (GAP-095 follow-up)

## Verification clarification — 2026-10-14

The approved integration's independent review identified an overstatement in
the historical stop-test checklist below. The production contract permits an
already-started reconciliation pass to finish. Verify that stop clears the
interval and prevents new passes; assert a frozen enqueue count only after
awaiting existing passes. The revised test controls interval ticks and awaits
real reconciliation promises instead of assuming a fixed database latency.
This clarification supersedes only the checklist's "zero enqueues after stop"
wording; it does not change the shutdown behavior or other frozen requirements.

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (pending contract review; separate review before implementation)
Milestone / capability IDs: M8 (production operations); NF-WF-030 follow-up
Implementer role / requested and resolved model: TBD (separate actor from contract author)
Reviewer role / requested and resolved model: TBD (separate actor from implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: parent (coordinator) accepts
Frozen review manifest / exact artifact paths and identity: TBD at implementation
Baseline revision / local changes to preserve: 50609c0 (worktree `.nf-batch-worktrees/scopeB-memsweeper` at HEAD)
Engram checkpoint topic key / last confirmed observation reference: TBD (`novelforge-ai/nf-wf-051-memsweeper`)

## Goal and reason

NF-WF-030 shipped startup-only reconciliation for the `memory-rebuild`
queue: a long-lived worker that loses Redis mid-run has no recovery path
until the next process restart — queued jobs are gone and STALE/FAILED
projections stay stale indefinitely. The NF-WF-030 contract itself
anticipated this ("an interval sweeper is a follow-up GAP if needed").

This task adds ONLY the interval: after the existing startup pass,
`startMemoryWorkerApp` re-runs the SAME reconciliation function on a timer
(every 60s, unref'd, cleared on stop). The sweep re-derives rebuild jobs
for STALE/FAILED scopes so memory projections self-heal during the
worker's lifetime, idempotently, without false success, and with bounded
scanning per tick.

Design contract in this file; implementation is Phase 2 after APPROVE.
This is a repeat of the proven publication pattern (`PUBLICATION_SWEEPER_INTERVAL_MS`
/ `sweepDuePublications`, NF-WF-029) applied to the memory worker: timer
wiring only, no new reconciliation logic.

## Required reading

- [Operating constitution](../../AGENTS.md) (§9 false-success prohibition, reuse over rewrite).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Task NF-WF-030](./NF-WF-030-gap095-memory-reconciliation.md) — the boundary: startup
  reconciliation EXISTS (shipped); this task adds ONLY the interval. Re-read its
  Behavior/Invariant sections; every guarantee there (deterministic jobIds, remove-first
  for retained failed jobs, MISSING never auto-rebuilt, no false success) carries over
  unchanged because the same function runs.
- `apps/worker/src/memory-reconciliation.ts` — `reconcileMemoryRebuilds({ db, queue, logger })`;
  reused VERBATIM, not modified.
- `apps/worker/src/memory-jobs.ts` — `startMemoryWorkerApp` / `MemoryWorkerDeps`; where the
  timer wires in.
- `apps/worker/src/publication-jobs.ts:620-640,715-722` — the established interval pattern
  (`setInterval` + `unref?.()`, `stopped` guard, catch-and-log per pass, `clearInterval`
  in `stop()`).
- `apps/worker/src/publication-jobs.test.ts:439-604` — the test patterns to mirror
  (real scratch DB + mock queue; timer-wiring test with fake deps).
- `packages/memory/src/constants.ts` — where the interval constant lives.

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Actual environment: Windows 11 (win32 10.0.26200), pnpm workspace, worktree
`.nf-batch-worktrees/scopeB-memsweeper` (detached HEAD 50609c0). Test DB:
dedicated disposable scratch database created/dropped by the test on the
running instance at `postgresql://novelforge:novelforge@localhost:5433`
(`nf-pg-5433`); the test connects to the `postgres` admin DB only to
`DROP DATABASE IF EXISTS` / `CREATE DATABASE` its own scratch DB — the
supplied `novelforge` DB is never migrated or reset. The acceptance DB is
never touched. No Redis needed in tests: the queue is mocked (BullMQ
dedup semantics simulated in-memory, mirroring `memory-reconciliation.test.ts`),
the Redis connection is a fake with `ping → PONG`.

## Dependencies and evidence

- NF-WF-030: IMPLEMENTED — `reconcileMemoryRebuilds` + startup wiring +
  `MemoryWorkerDeps.createQueue` DI all exist at baseline 50609c0.
- NF-WF-029: IMPLEMENTED — the publication sweeper this task mirrors
  (interval constant in worker module there; here the constant lives in
  `@novelforge/memory` per the frozen slice contract).
- No active issue ID for this follow-up yet; coordinator records it in
  ISSUES-AND-GAPS.md (shared docs are coordinator-owned in this batch).

## Scope

Allowed paths (exhaustive — exactly three):
- `packages/memory/src/constants.ts`
  - Add one export: `MEMORY_RECONCILE_INTERVAL_MS = 60_000` (next to the
    existing rebuild constants). It flows out of `@novelforge/memory`
    via the existing `export * from "./constants.ts"` — no index.ts edit.
- `apps/worker/src/memory-jobs.ts`
  - `MemoryWorkerDeps` gains `reconcileIntervalMs: number`;
    `defaultMemoryWorkerDeps` sets it to `MEMORY_RECONCILE_INTERVAL_MS`
    (imported from `@novelforge/memory`).
  - In `startMemoryWorkerApp`, after the existing startup-reconciliation
    try/catch and before the ready log: `setInterval` tick that (a) returns
    if `stopped`, (b) returns if `queue` is undefined (queue factory failed
    at startup — the tick must never dereference it), (c) otherwise calls
    the existing `reconcileMemoryRebuilds({ db, queue, logger: d.logger })`
    with `.catch(err => d.logger.error("memory reconciliation sweep failed", …))`
    so one failed pass never kills the timer. Timer handle `.unref?.()`.
    Log the sweeper start with the interval value.
  - `stop()`: `clearInterval(reconcileTimer)` before the existing teardown
    (`worker.close()` → `queue?.close()` → `connection.disconnect()` →
    `db.$disconnect()`).
- `apps/worker/src/memory-sweeper.test.ts` (NEW — the only new file)
  - Mirrors `publication-jobs.test.ts:439-604` patterns: real disposable
    scratch DB for staleness/freshness reality, mock queue with BullMQ
    dedup semantics, fake Redis connection/worker for wiring tests.
    Required coverage is enumerated in "Acceptance and verification".

Forbidden paths — everything else, explicitly including:
- `apps/worker/src/memory-reconciliation.ts` — the reconciliation function
  is reused VERBATIM; no edits (its behavior is NF-WF-030-reviewed).
- `packages/memory/src/rebuild.ts`, `packages/memory/src/freshness.ts`,
  `packages/memory/src/index.ts`, any `apps/api/src/**` import.
- Any schema/Prisma migration; any `DerivedRebuildIntent` read/write; any
  LLM call; any outbox/notification change.
- A second reconcile implementation (no `sweepStaleMemoryScopes` clone —
  the interval calls `reconcileMemoryRebuilds`).
- `apps/worker/src/index.ts`, `apps/worker/src/worker.ts` (no new exports
  needed; tests import module files directly like the existing suites).
- Shared docs (`docs/implementation/ISSUES-AND-GAPS.md`,
  `docs/implementation/023B-job-inventory.md`, `docs/14-progress/*`) —
  coordinator-owned in this batch; the implementer reports evidence and
  the coordinator updates shared docs. No frozen-contract text edits.

Inputs:
- `reconcileMemoryRebuilds({ db, queue, logger })` at its current NF-WF-030
  revision (report shape: `{ checked, stale, requeued, skippedFresh,
  skippedMissing, failed }`).
- `MEMORY_REBUILD_QUEUE_NAME`, `memoryRebuildJobId` from `@novelforge/memory`.
- PostgreSQL `memoryProjection` rows via the existing distinct-pair scan
  (the only per-tick read; see Bounded scanning invariant).

Outputs:
- `MemoryWorkerDeps.reconcileIntervalMs` (number, default 60_000) — test DI seam.
- A repeating bounded reconciliation pass in `startMemoryWorkerApp` —
  consumer-visible as: STALE/FAILED memory projections heal within one
  interval of a mid-run Redis loss, without worker restart.
- New test file `apps/worker/src/memory-sweeper.test.ts` — vitest suite,
  run by `pnpm --filter @novelforge/worker test`.

Out of scope (retained requirements, owner: coordinator / future task):
- Redis HA/persistence config; per-scope jitter/backoff on the interval;
  metrics/alerting on `failed` counts; restarting queue creation if the
  factory failed at startup (the guard skips ticks instead — documented
  limitation: a worker whose queue factory failed at startup never sweeps;
  startup reconciliation already logged loudly and the next process
  restart retries).
- Job-inventory/docs updates for the sweeper (coordinator applies from the
  implementation report).

## Behavior and invariants

Happy path: worker starts → startup reconciliation (unchanged) → every
`reconcileIntervalMs` the tick runs the same `reconcileMemoryRebuilds`
pass against the same `db`/`queue`. Each pass derives freshness per
distinct (novelId, scope) pair and re-derives rebuild jobs for STALE and
FAILED scopes with deterministic jobIds (`memoryRebuildJobId(novelId,
scope, headRevisionId)`); BullMQ dedupes; live (waiting/active) jobs are
left alone; retained `failed`/`completed`/`unknown` job records are
removed first, then re-added (P2-6 hazard, already implemented).

Invariants (all inherited from NF-WF-030 by reuse; the new ones marked NEW):
- Idempotent: overlapping passes (timer tick during a still-running
  previous pass, or two workers) enqueue no duplicate jobs — deterministic
  jobIds + the pass's getJob-state check. (NEW test, existing behavior.)
- Timer survival (NEW): a pass that throws (e.g. Redis down mid-run —
  `queue.add` rejects) is caught and logged per pass; the interval fires
  again on schedule; the next tick retries and recovers when Redis
  returns. A failed pass never marks anything healthy — the DB staleness
  signal (`memoryProjection` rows) is untouched by construction (the pass
  only reads DB).
- No false success (inherited, re-proven at interval cadence): no pass
  writes `buildStatus: "OK"`; only `processRebuild` (via the queue
  consumer) writes OK rows. After repeated failed passes there must be no
  OK row for the head revision.
- Queue-undefined guard (NEW): if `d.createQueue(connection)` threw at
  startup, `queue` is undefined; ticks return without throwing (no
  unhandled rejection); `stop()` still completes.
- stop() semantics (NEW): `clearInterval` runs before teardown; after
  `stop()` resolves, no further pass starts; in-flight pass may finish
  (it only reads DB and enqueues idempotently — safe).
- FRESH scopes skipped (`skippedFresh`); MISSING scopes never auto-rebuilt
  (Invariant 9: materialize-when-consumed) — inherited, re-proven.
- Bounded scanning (NEW test of existing behavior): each pass reads only
  the pairs `db.memoryProjection.findMany({ select: { novelId, scope,
  workspaceId }, distinct: ["novelId", "scope"] })` returns — distinct on
  `(novelId, scope)` only, with `workspaceId` taken from the first row
  per pair — then one freshness derivation per pair. No unbounded read of
  novels/revisions/projections per tick; multiple rows for one scope
  collapse to one pair.
- Interval value: 60s, matching `PUBLICATION_SWEEPER_INTERVAL_MS` and
  `WORKFLOW_SWEEPER_INTERVAL_MS` (consistency; memory staleness is not
  sub-minute critical). Timer is `unref`'d so it never holds the event
  loop open (worker shutdown is governed by `stop()`).
- Concurrency: same guarantees as startup reconciliation (deterministic
  jobIds make concurrent passes safe); `stopped` guard prevents post-stop
  scheduling.

Failure and cancellation: per-pass exceptions are logged
(`"memory reconciliation sweep failed"`), never propagate to an unhandled
rejection, never stop the timer, never stop the consumer. Per-scope errors
inside the pass are counted in `report.failed` (existing behavior).

## Acceptance and verification

Test file `apps/worker/src/memory-sweeper.test.ts` must cover (mirroring
`publication-jobs.test.ts:439-604` patterns):

- [ ] Overlapping sweeps enqueue no duplicate jobs: `Promise.all` of two
      `reconcileMemoryRebuilds` calls (dedup-semantics mock queue) against a
      seeded STALE projection. Deterministic assertion (mirrors the
      concurrent-sweep test in `publication-jobs.test.ts`, ~line 560): the
      distinct set of added jobIds is exactly
      `{ memoryRebuildJobId(novelId, scope, headRevisionId) }`, the mock
      queue holds exactly 1 job for it, and
      `r1.requeued + r2.requeued === 2` — both passes may observe
      `getJob === undefined` under concurrency and both enqueue; the
      guarantee is that every enqueue carries the same deterministic jobId
      (BullMQ dedupes to one live job). Timing-dependent "second pass sees
      the live job and reports requeued: 0" must NOT be asserted.
- [ ] stop() clears the timer: `startMemoryWorkerApp` with injected deps
      (real scratch DB with a STALE projection, stateless mock queue whose
      `getJob` always returns undefined so every pass re-enqueues, fake
      connection `ping → PONG`, fake worker, `reconcileIntervalMs: 50`) →
      enqueue count grows across startup pass + ticks; after `app.stop()`,
      count frozen (zero enqueues after stop).
- [ ] Repeated Redis failure then recovery (real scratch DB, STALE seed,
      mock queue whose `add` rejects for the first N passes): startup pass +
      first ticks all fail — `logger.error` called, timer survives (later
      tick observed), `memoryProjection` rows unchanged (still only the
      stale row, no OK row for headRevisionId — no false buildStatus OK),
      then `add` allowed → next tick enqueues the deterministic jobId.
- [ ] FRESH scopes skipped: seeded FRESH projection → pass reports
      `skippedFresh ≥ 1`, `requeued: 0`, no job added.
- [ ] MISSING scopes never auto-rebuilt: a `(novelId, scope)` pair that
      HAS `memoryProjection` rows but whose novel has no main-branch head
      (head-less novel fixture → `deriveFreshness` returns null) →
      counted in `skippedMissing`, and no job exists for
      `memoryRebuildJobId(novelId, thatScope, head)`. (A scope with NO
      projection rows is not a valid fixture — such pairs never enter the
      distinct-pair scan, so an absence-assert there cannot fail.)
- [ ] Bounded scanning: multiple `memoryProjection` rows for one
      (novelId, scope) → exactly one pair checked (`report.checked`
      counts distinct pairs); repeated tick rescans the same bounded set
      (no per-tick growth in scanned pairs).
- [ ] Default interval constant + DI override: `MEMORY_RECONCILE_INTERVAL_MS
      === 60_000`; `defaultMemoryWorkerDeps(logger).reconcileIntervalMs ===
      60_000`; a short injected `reconcileIntervalMs` demonstrably drives
      multiple ticks (the stop()-test doubles as the override exercise).

Commands (run from the worktree root; `DATABASE_URL` as in Environment):

- [ ] `DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge
      pnpm --filter @novelforge/worker exec vitest run
      src/memory-sweeper.test.ts src/memory-reconciliation.test.ts
      src/memory-jobs.test.ts` → all green (new suite + focused memory
      regression).
- [ ] `… vitest run src/publication-jobs.test.ts` → unchanged green
      (cross-worker regression proof; the mirror-pattern source).
- [ ] `pnpm --filter @novelforge/memory typecheck && pnpm --filter
      @novelforge/worker typecheck` → clean.
- [ ] `pnpm lint` (eslint from worktree root) → clean for the three
      touched/new files.
- [ ] Separate review of the submitted revision; findings resolved.

Record actual results separately from expectations. Zero selected tests or
skipped integration checks do not pass a capability gate.

## Migration and rollback

No schema migration (timer wiring is application logic). Deployment
compatibility: the worker gains one interval timer; the tick is
catch-guarded and unref'd, so it cannot prevent shutdown or crash the
process. Rollback: redeploy the previous worker build; no data effects
(the sweeper only reads DB and enqueues idempotent jobs). Populated-DB
behavior: first tick after deploy re-derives jobs for any STALE/FAILED
scope that lost its queued job to a mid-run Redis loss — exactly the
startup pass's behavior, repeated. Empty DB: pass scans zero pairs.

## Documentation and handoff

Use the playbook's Engram save/recovery protocol (topic key
`novelforge-ai/nf-wf-051-memsweeper`): save at the phase boundary
(contract drafted → review) and at implementation completion, with
task/worktree/role, revision/diff, evidence, unfinished steps, issue IDs,
review state. Never claim an unconfirmed save.

Coordinator-owned updates after implementation (implementer reports
evidence; does not edit shared docs): `docs/implementation/023B-job-inventory.md`
§3 `memory-rebuild` recovery contract gains the interval sweeper line;
the GAP-095 follow-up entry in ISSUES-AND-GAPS.md is recorded/closed with
test names + results; `docs/14-progress` per coordinator process.

Unknowns/risks: none blocking — the reconciliation function and both
sibling sweeper patterns already exist; the only new code is timer wiring
plus one test suite. Next dependency-ready task: none (leaf task).
