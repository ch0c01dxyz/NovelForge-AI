# Task NF-WF-004: durable workflow execution using existing BullMQ/executor

Status: **PLANNED** — not dispatchable. Do not start coding from this file
until it is separately reviewed.
Project language: English for all authored/revised project artifacts and
generated project content; follow the constitution for provenance and overrides.
Milestone / capability IDs: M2 / durable execution, per
[DELIVERY-PLAN](../docs/implementation/DELIVERY-PLAN.md).
Implementer role / requested and resolved model: unassigned. Use the model
selected by the author at dispatch; record runtime evidence, not assumed
identity. No historical model pairing constrains this task.
Reviewer role / requested and resolved model: unassigned; a separate reviewer
must read the exact submitted diff. Reviewer backend identity is UNVERIFIED
(GAP-013).
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-002F
returned VERIFIED for the evidenced M1 foundation scope only (2026-10-04);
NF-WF-004 depends on NF-WF-002 and on the NF-WF-003 compiler for the RETRIEVAL
step's context path. 002E stays PLANNED until a consumer is designed.
Frozen contract manifest: to be frozen at review submission; it must include
the whole of `workflow-runs.ts` and the new worker job module, not excerpts —
the contract's claims about single-claim execution and cancellation checks are
whole-file negative claims.
Baseline revision / local changes to preserve: HEAD `6fd0f0b` (NF-WF-003
committed); this task must not stash, reset or revert it.
Engram checkpoint topic key / last confirmed observation reference: no
authoritative session binding on this host; use progress fallback (GAP-021,
per-boundary).

## Goal and reason

Workflow runs must survive the request that started them: a run enqueued
through the API executes to completion on the worker even if the API
restarts, a duplicate enqueue never executes twice, a run can be cancelled,
and every step's resolved definition identity is persisted.

**The measured problem.** Three facts from the tree:

1. `run()` in `apps/api/src/services/workflow-runs.ts` executes the whole
   step loop **synchronously inside the POST request**
   (`definition-routes.ts:463`, `reply.code(201)` at `:470` — 201 for a run
   that may still be executing). A dropped connection, a request timeout,
   or an API restart leaves the run row in `RUNNING` with no owner and no
   recovery path; the client cannot distinguish "still running" from
   "orphaned".
2. There is **no idempotency**: re-POSTing the run endpoint creates a
   second `WorkflowRun` row and executes the graph again. There is **no
   cancellation**: `CANCELLED` exists in `WorkflowRunStatus`
   (`schema.prisma:546`) but no code path ever writes it (verified by
   search — the only writers are the run loop's SUCCEEDED/FAILED/
   AWAITING_APPROVAL assignments).
3. BullMQ exists (`bullmq@5` in `apps/worker/package.json:14`) but the
   worker (`apps/worker/src/worker.ts`) only runs a **heartbeat** job.
   Nothing in the repository enqueues or executes workflow work on BullMQ.

`WorkflowRun`/`WorkflowStepRun` already persist step outcomes and resolved
definition versions (`schema.prisma:723`, `:761`; `@@unique([runId,
stepKey])`), which is the durable record this task builds on — it does not
need a schema change to record execution.

## Required reading

- [Operating constitution](../AGENTS.md) — §9 (versioning/recovery: no
  model call or human wait inside a DB transaction; required checkpoint
  before high-impact mutation), §11 (definition of done), §12
  (orchestration protocol).
- [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- ADR-0013 (workflow delivery/recovery).
- Source to read before designing anything: the whole of
  `apps/api/src/services/workflow-runs.ts` (1009 lines — the executor this
  task durabilifies), `apps/api/src/definition-routes.ts` around the run
  route (`:449-472`), `apps/worker/src/worker.ts` (196 lines — the BullMQ
  lifecycle to extend), `packages/database/prisma/schema.prisma`
  `WorkflowRun` (`:723`) / `WorkflowStepRun` (`:761`) /
  `WorkflowRunStatus` (`:537`) / `StepRunStatus` (`:550`).
- Existing tests: `apps/api/src/definitions.test.ts` (workflow run
  coverage), `apps/worker/src/worker.test.ts` (heartbeat lifecycle).

## Dependencies and evidence

- **NF-WF-002 / G-01** — accepted 2026-10-04 for the evidenced foundation
  scope only. This task consumes the revision primitives only where a step
  performs a covered mutation; it does not change them.
- **NF-WF-003** — committed `494a796`. The RETRIEVAL step now compiles
  through the shared compiler; this task must not regress that path (the
  F5 HTTP-level divergence test in `orchestrator.test.ts` is the guard).
- Active issues from
  [ISSUES-AND-GAPS](../docs/implementation/ISSUES-AND-GAPS.md):
  - **GAP-004** (cross-domain recovery, OPEN/P1) — this task must not claim
    to close it.
  - **GAP-013** (OPEN/P2) — record actual reviewer actor/tool evidence;
    MODEL_UNVERIFIED stays unless proven.
  - **GAP-018** (OPEN/P2) — this task authorizes no migration. If a
    migration becomes necessary, stop and return for a new contract.
  - **GAP-023** (OPEN) — do not build a domain-event producer or outbox
    here; 002E stays PLANNED.

## Scope decision — RESOLVED (author, 2026-10-05)

**A: worker executes.** The route creates the run row as `PENDING`, enqueues
a BullMQ job (`jobId = run.id`), and returns 202. A worker-side job handler
claims the run and drives the existing step loop. Design B (API executes,
worker supervises) is rejected: it does not satisfy the goal ("must survive
the request that started them") because long runs still die with the
request. All invariants below are written for A.

## Scope

Allowed paths (confirmed at review):

- `packages/workflow-executor/*` — **new package** holding the durable
  execution core: the step-driving loop (moved from `workflow-runs.ts`,
  not duplicated), the guarded run/step claim transitions, the
  cancellation checks, and the restart-recovery scan. It exposes typed
  factory functions taking injected deps (`db`, definition resolvers,
  compiler ports, gateway step runner) and imports no HTTP, no BullMQ
  queue construction, and no process-specific lifecycle. This resolves
  the worker-construction problem: `apps/api` and `apps/worker` both
  depend on this package and construct it with their own dep sets, so
  no relative `../../api/src/...` import ever crosses the §10 module
  boundary. (Author decision 2026-10-05.)
- `apps/worker/src/workflow-jobs.ts` — **one new module**: the BullMQ job
  handler. It constructs the executor from `packages/workflow-executor`
  with worker-side deps and drives one claimed run. It must not import
  HTTP; it reuses the service factories via the package.
- `apps/worker/src/worker.ts` — register the `workflow-runs` queue worker
  alongside the heartbeat; reuse the existing connection lifecycle.
- `apps/worker/package.json` — no new runtime deps (bullmq already
  present); add the `@novelforge/workflow-executor` workspace dep.
- `apps/api/src/services/workflow-runs.ts` — split `run()` into
  `enqueueRun()` (validate exactly as today, create PENDING run row **and
  PENDING step rows for every step in the validated order**, enqueue job,
  return run id) and `cancelRun()` (guarded → CANCELLED). The inline step
  loop moves to `packages/workflow-executor`; this module keeps the
  route-facing validation, tenant gates, and row writes.
- `apps/api/src/services/workflow-queue.ts` — **new module** (concrete
  path; no fallback): the one BullMQ `Queue` instance for `workflow-runs`,
  constructed once and shared by the routes. Queue options live here.
- `apps/api/package.json` — add `bullmq` (the route constructs the
  `Queue`; `apps/api` has no bullmq dep today).
- `apps/api/src/definition-routes.ts` — the run route calls
  `enqueueRun()` and returns **202** (not 201 — the run has not executed);
  add `POST .../runs/:runId/cancel`.
- `packages/database/prisma/schema.prisma` + one migration — add
  `WorkflowRun.idempotencyKey` (`String?`, nullable) with a unique index
  on `(workspaceId, idempotencyKey)` (partial: `WHERE idempotencyKey IS
  NOT NULL`). Additive and nullable: no backfill, no existing-row
  rewrite. Per GAP-018 the migration is a reviewed artifact; the plan is
  stated in "Migration and rollback".
- Tests: `apps/api/src/definitions.test.ts` (run route: 202, enqueue,
  idempotency-key dedup, cancel), `apps/worker/src/workflow-jobs.test.ts`
  (new: claim, idempotency, restart, cancellation, no-double-commit),
  `packages/workflow-executor/` unit tests (guarded transitions), and
  `apps/api/src/orchestrator.test.ts` (the F5 divergence test must stay
  green — the RETRIEVAL path now executes off-request).
- Docs: this task, CURRENT.md, progress.md, test-matrix.md,
  ISSUES-AND-GAPS.md.

Forbidden paths: everything else — in particular `packages/auth/*`, the
AWAITING_APPROVAL resume path (NF-WF-005 owns it), any UI, any
domain-event producer/outbox (GAP-023), and any relative import from
`apps/worker` into `apps/api/src`.

Inputs: the existing `run()` input shape (`actorUserId`, `workspaceId`,
`workflowId`, `runInput`, `novelId`) **plus an optional
`idempotencyKey`** (client-generated opaque string, e.g. UUID v4; max 64
chars, validated). The enqueue payload is exactly this plus the created
`runId`. Semantics: two POSTs with the same non-null
`(workspaceId, idempotencyKey)` return the **same** run row (the second
returns 200 with the existing run, never a second row); a null key keeps
today's behavior (a new row per POST) and is documented as such.

Outputs: the run row (now created PENDING), step rows as today (status,
resolved definition versions, generation links, outputs), and a
cancellation record. The 202 response carries the run id and a status
URL; it must not claim execution.

Out of scope, each with its own owner: approval/resume (NF-WF-005);
chapter generation template (NF-WF-006); domain events (002E);
human-approval UX.

## Behavior and invariants

1. **Enqueue, don't execute.** The POST run route validates exactly as
   today (published gate, version resolution, novel binding), then:
   if `idempotencyKey` is non-null, look up
   `(workspaceId, idempotencyKey)` — a hit returns the existing run with
   **200** (never a second row); a miss (or null key) creates the run row
   with status `PENDING` **and PENDING `WorkflowStepRun` rows for every
   step in the validated topological order**, in the same transaction.
   Race safety: two concurrent POSTs with the same key can both miss the
   lookup — the partial unique index is the backstop, and the loser of
   the unique violation re-reads the winner's row and returns it with
   200 (never a second row, never a 500).
   Then it enqueues one BullMQ job with `jobId = run.id` on the
   `workflow-runs` queue and returns **202** with the run id and the
   existing single-run status URL. It must not execute any step. A null
   key keeps today's per-POST-row behavior and is documented as such.
   Queue options (in `workflow-queue.ts`): `attempts: 1` (no BullMQ-level
   retry — recovery is the sweeper's job, invariant 3),
   `removeOnComplete: 1000`, `removeOnFail: 5000` (bounded Redis growth
   with recent jobs kept for debugging), `lockDuration: 300_000`
   (5 minutes — a slow AGENT model call must not be reaped as stalled;
   a genuinely stalled lock is re-queued by BullMQ and goes through the
   claim guard, which is safe only because of invariant 3's reset).
2. **Single claim.** The worker handler claims the run with a guarded
   transition (`UPDATE workflow_runs SET status='RUNNING' WHERE id=$1
   AND status='PENDING'`); only the claim winner drives the loop. A
   handler that loses the claim exits silently. The same guarded-claim
   pattern applies per step before executing a step with side effects:
   `UPDATE workflow_step_runs SET status='RUNNING' WHERE run_id=$1 AND
   step_key=$2 AND status='PENDING'` — only the winner executes; the
   loser skips. The PENDING step rows are created by `enqueueRun` (see
   invariant 1), so the claim never races creation; the
   `@@unique([runId, stepKey])` constraint is the backstop, not the
   mechanism. This is the no-double-commit mechanism under BullMQ's
   at-least-once delivery. Steps never reached (untaken branches) have
   their pre-created PENDING rows updated to `SKIPPED` by the worker as
   the loop passes them — no step row sits PENDING forever in run
   history.
3. **Restart recovery.** Recovery runs at worker startup **and** on a
   bounded sweeper interval of 60 seconds (both, not either — startup
   covers deploys, the interval covers crashes without restart). The
   scan finds:
   (a) `RUNNING` runs whose job is not live, and
   (b) `PENDING` runs older than 5 minutes with no job record at all
   (the crash-between-row-and-enqueue orphan).
   Liveness predicate: `queue.getJob(runId)` returns null, or the job
   is in `completed`/`failed` state. For (a), the sweeper acts in this
   exact order: (1) liveness check; (2) atomically reset `RUNNING →
   PENDING` with a guarded update (`WHERE id=$1 AND status='RUNNING'`)
   — this is the step invariant 2 needs: without the reset, a
   re-enqueued job could never claim its row; (3) best-effort remove
   the dead job record (`job.remove()`), because a retained
   completed/failed record makes a re-`add()` with the same `jobId` a
   silent no-op — without this removal the run would sit PENDING
   forever; (4) re-enqueue with the same `jobId` (a no-op if the old
   job record still exists and is live, which is the safe direction).
   Steps whose rows are already `SUCCEEDED` are skipped — the loop
   consults persisted step rows, not memory, when deciding what remains.
4. **Duplicate delivery is a no-op at two levels.** Row level: the
   `(workspaceId, idempotencyKey)` unique constraint — a repeated POST
   with the same key returns the existing run (200), never a second
   row. Job level: BullMQ `jobId = run.id` dedupes re-enqueue (sweeper,
   redelivery); the guarded run/step claims dedupe execution. A test
   must cover both: POST the same idempotency key twice → one row;
   enqueue the same `jobId` twice and crash a handler mid-step →
   exactly-once visible effects.
5. **Cancellation.** `POST .../runs/:runId/cancel` by an authorized actor
   transitions `PENDING`/`RUNNING`/`AWAITING_APPROVAL` → `CANCELLED`
   via a guarded update; `SUCCEEDED`/`FAILED`/`CANCELLED` refuse with
   409. (AWAITING_APPROVAL is cancellable: the run is parked with no
   worker executing it, so marking it CANCELLED abandons it cleanly;
   resume stays NF-WF-005's.) The route then best-effort removes the
   queued job (`queue.getJob(runId)` → `remove()`); the worker, which
   checks cancellation between steps and before each step claim, stops
   the loop on observing it and **skips the terminal status write**
   (the final `SUCCEEDED`/`FAILED` update is conditioned on "not
   stopped for cancellation", so a mid-loop cancel is never overwritten).
   Because a cancel can also land after the last step completes but
   before the terminal write — a window no between-steps check observes
   — the worker performs one final cancellation read immediately before
   the terminal status write. Retrying cancel while `PENDING`/`RUNNING`
   returns the current `CANCELLED` state (safe to retry); once terminal
   it is 409 — "idempotent" in the retry-safe sense, not in the HTTP
   sense.
6. **Persisted step/source identity.** Every step row records the
   resolved definition versions exactly as today (agent/skill ids +
   version numbers, generation links). The worker resolves through the
   same `resolveAgentFor`/`resolveSkillFor` paths the route used — a
   definition edited mid-run must not silently change what the run
   executes; the pinned versions are the record.
7. **No model call or human wait inside a DB transaction** (§9). The
   claim guards are single-statement guarded UPDATEs, not held
   transactions around step execution.
8. **AWAITING_APPROVAL is untouched.** A run that parks at a
   HUMAN_APPROVAL step keeps today's semantics (halted, `completedAt`
   null) — resume is NF-WF-005. This task must not invent a resume.
9. **Tenant and authorization boundaries** are the route's, as today:
   the enqueue validates workspace/novel/actor exactly like `run()` did;
   the worker never re-decides authorization, it executes the enqueued
   run id.
10. **No new queue per concern.** One `workflow-runs` queue, one job
    type. Do not invent a queue per step kind or per workflow.

## Acceptance and verification

- [ ] Observable result through the real caller: POST the run route →
      202 with run id (200 with existing run on idempotency-key repeat);
      the run reaches SUCCEEDED via the worker (not the request thread);
      GET run shows step rows with pinned versions.
- [ ] **Negative test — idempotency key.** POST the same
      `(workspaceId, idempotencyKey)` twice; assert one run row, second
      response 200 with the existing run. POST without a key twice;
      assert two rows (documented behavior).
- [ ] **Negative test — restart.** Kill the worker mid-run (after ≥1
      step SUCCEEDED); restart; assert the run completes with no step
      executed twice (step row counts per `stepKey`).
- [ ] **Negative test — PENDING orphan.** Create the PENDING row (and
      step rows) then crash before `queue.add`; run the recovery scan;
      assert the run is enqueued and completes.
- [ ] **Negative test — duplicate delivery.** Enqueue the same `jobId`
      twice; assert one run execution (one RUNNING→terminal transition,
      no duplicate side-effecting step rows).
- [ ] **Negative test — no double commit.** Two handlers race the same
      step claim; assert exactly one executes (guarded UPDATE winner).
- [ ] **Negative test — cancellation.** Cancel a RUNNING run; assert no
      further steps execute, the terminal write does not overwrite
      CANCELLED, and the job is gone; cancel a terminal run → 409;
      cancel an AWAITING_APPROVAL run → CANCELLED.
- [ ] **Negative test — orphaned RUNNING.** A run stuck RUNNING with no
      live job is reset to PENDING and re-enqueued on the recovery scan,
      then completes.
- [ ] The NF-WF-003 F5 divergence test stays green (RETRIEVAL through
      the shared compiler, off-request).
- [ ] Named commands, prerequisites, and expected outcome recorded with
      actual results. Zero selected tests do not pass a gate.
- [ ] Separate review of the submitted revision; findings resolved.

## Required commands and safe prerequisites

Redis must be reachable (the worker already degrades without it — this
task's tests require it). Name the queue, the worker command, and the
scratch DB. Never run `db:test:prepare` on live data. After the new
tests exist, run the workflow-related suites plus `pnpm lint` and
`pnpm --filter @novelforge/api typecheck` and `pnpm --filter
@novelforge/worker typecheck`; record actual results.

## Migration and rollback

**One migration is authorized** (author decision 2026-10-05, required by
the idempotency-key design): add `WorkflowRun.idempotencyKey`
(`String?`, nullable, `@map("idempotency_key")`) with a partial unique
index `@@unique([workspaceId, idempotencyKey])` filtered to
`WHERE idempotency_key IS NOT NULL`. Per GAP-018 this migration is a
reviewed artifact; the deploy plan:

- DDL is purely additive, in a single migration file:
  `ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS idempotency_key
  TEXT` (nullable, no default, no backfill) followed by
  `CREATE UNIQUE INDEX IF NOT EXISTS
  workflow_runs_workspace_idempotency_key_uidx ON workflow_runs
  (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
  Plain (non-`CONCURRENTLY`) index creation is chosen deliberately:
  Prisma runs multi-statement migrations in a single transaction and
  PostgreSQL rejects `CONCURRENTLY` inside a transaction block, while
  a partial index over a brand-new, mostly-NULL column builds in
  milliseconds with only a brief lock — the concurrent-build machinery
  buys nothing here. No existing row is rewritten.
- Deploy order: migrate first, then deploy code that writes the column.
  Old code (without the column) runs fine against the migrated schema
  because the column is nullable and unwritten.
- Post-deploy check: `\d workflow_runs` shows the column; the partial
  index exists; inserting two rows with the same
  `(workspace_id, idempotency_key)` raises a unique violation while two
  nulls do not.
- Rollback: forward-fix only — dropping the column is a second reviewed
  migration; no automatic destructive rollback.

A failed `migrate deploy` is partially applied (GAP-018): the two
statements above must each be re-runnable (`IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS`) so a retry converges instead of dying
half-applied. This task must not reset or restore any database. The
restart-recovery path (invariant 3) is the runtime rollback story: a
failed deploy must not leave a run permanently RUNNING.

## Documentation and handoff

Update CURRENT.md, progress.md, test-matrix.md with verified scope only;
record failures/uncertainty in ISSUES-AND-GAPS.md before any workaround.
Save an Engram checkpoint under the runtime-confirmed identity at each
boundary; if unavailable, preserve the handoff here and in progress, and
log it as a GAP (GAP-021, per-boundary). Never claim an unconfirmed save.

## Known unknowns (resolved 2026-10-05 except where noted)

- **Worker service factories — RESOLVED.** New package
  `packages/workflow-executor` holds the durable execution core with
  injected deps; `apps/api` and `apps/worker` both depend on it and
  construct it with their own dep sets. No cross-app relative imports.
  (Author decision; review F1.)
- **BullMQ job retention — RESOLVED.** `attempts: 1`,
  `removeOnComplete: 1000`, `removeOnFail: 5000`, stated in invariant 1.
  Recovery is the sweeper's job, not BullMQ retries.
- **Long AGENT steps vs. job timeouts — RESOLVED.**
  `lockDuration: 300_000` (5 min); a stalled lock re-queues through the
  claim guard, which is safe because of invariant 3's RUNNING→PENDING
  reset.
- **The 201→202 change — verified non-issue.** No web client invokes the
  run route (reviewer-verified); the 202 response carries the run id and
  the existing single-run status URL.
- **Remaining unknown:** the exact BullMQ v5 `queue.getJob(runId)` state
  mapping the sweeper uses for "no live job" must be verified against the
  installed 5.x at implementation time — but the liveness predicate
  (null, or completed/failed) is now written in the contract (invariant
  3), so this is implementation detail, not architecture.

## Review record

### Review 1 — 2026-10-05, CHANGES_REQUESTED, being applied

**Scope.** Contract draft `dd9a1be7` (15,608 bytes), read-only review
against HEAD `6fd0f0b`. Reviewer: separate subagent actor, Muse Spark
family, backend MODEL_UNVERIFIED (GAP-013).

**What verified clean.** All three problem-statement facts (synchronous
`run()`, zero CANCELLED writers / zero jobId usage, heartbeat-only
worker); schema sufficiency (no migration needed for the specified
design — since superseded by the F2 decision below); 201→202 a
non-issue (no web caller); invariants 7/9/10; constitution/GAP
compliance; 003/005 consistency.

**Findings and dispositions.**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | P1 | Worker service-factory construction undecided and unimplementable under allowed paths | **ACCEPTED.** Author decision 2026-10-05: new `packages/workflow-executor` package with injected deps; both apps depend on it. Allowed/forbidden paths updated |
| F2 | P1 | Re-POST idempotency promise unimplementable (`jobId = run.id` differs per POST); contract forbade the key | **ACCEPTED.** Author decision 2026-10-05: add optional `idempotencyKey` request field; `(workspaceId, idempotencyKey)` unique partial index; repeat returns 200 with existing run. One additive migration authorized with GAP-018 plan |
| F3 | P1 | Invariants 2/3 contradict: re-enqueued RUNNING rows can never claim | **ACCEPTED.** Invariant 3 now states the atomic RUNNING→PENDING reset before re-enqueue |
| F4 | P2 | PENDING orphans (crash between row and `queue.add`) have no recovery | **ACCEPTED.** Invariant 3 covers PENDING > 5 min with no job; acceptance test added |
| F5 | P2 | Sweeper trigger/liveness/retention undefined | **ACCEPTED.** Startup + 60s interval; liveness = `getJob` null/completed/failed; `attempts: 1`, `removeOnComplete: 1000`, `removeOnFail: 5000`, `lockDuration: 300_000` |
| F6 | P2 | Cancelled-final-write race (unguarded terminal update overwrites CANCELLED) | **ACCEPTED.** Worker skips terminal write when stopped for cancellation |
| F7 | P3 | Who creates PENDING step rows, when | **ACCEPTED.** `enqueueRun` creates them for all steps in the validated order, same transaction as the run row |
| F8 | P3 | "Idempotent" cancel vs 409-on-terminal wording | **ACCEPTED.** Reworded: retry-safe while PENDING/RUNNING, 409 once terminal |
| F9 | P3 | Who removes the BullMQ job on cancel | **ACCEPTED.** Route best-effort removes after status transition; worker stops on observing cancellation |
| F10 | P3 | `bullmq` missing from api deps; void `workflow.ts` fallback | **ACCEPTED.** `bullmq` added to api scope; concrete `services/workflow-queue.ts`; fallback removed |
| F11 | P3 | Cancelling AWAITING_APPROVAL unspecified | **ACCEPTED.** Allowed → CANCELLED (parked run, no worker executing); 409 only for SUCCEEDED/FAILED/CANCELLED |

**Re-review scope.** Changed portions only: scope decision, scope paths,
invariants 1–5, acceptance list, migration section, known unknowns.

### Review 2 — 2026-10-05, CHANGES_REQUESTED, being applied

**Scope.** Contract `bb7f9997` (24,666 bytes). All eleven round-1 findings
verified fixed. Five new findings, all being applied:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F12 | P1 | Sweeper re-enqueue deadlocks: retained completed/failed job records make re-`add()` a silent no-op | **ACCEPTED.** Invariant 3 now orders: liveness check → RUNNING→PENDING reset → best-effort dead-job removal → re-add |
| F13 | P2 | `CREATE INDEX CONCURRENTLY` cannot run in Prisma's transactional multi-statement migration | **ACCEPTED.** DDL uses plain `CREATE UNIQUE INDEX IF NOT EXISTS` (justified: partial index over new mostly-NULL column builds in ms) and `ADD COLUMN IF NOT EXISTS` |
| F14 | P3 | Idempotency-key lookup→create race on concurrent POSTs | **ACCEPTED.** Unique-violation loser re-reads the winner's row, returns 200 |
| F15 | P3 | Cancel landing after last step but before terminal write unobserved | **ACCEPTED.** Final cancellation read immediately before the terminal status write |
| F16 | P3 | Pre-created PENDING rows for untaken branches would sit PENDING forever | **ACCEPTED.** Worker updates unreachable steps' rows to SKIPPED |
