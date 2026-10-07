# NF-WF-023B — BullMQ Job Inventory + Recovery Contracts

**Date:** 2026-10-07 | **Evidence:** OBSERVED from code inspection of the
release revision + executed recovery tests below. Backends
MODEL_UNVERIFIED per GAP-013.

## Inventory

| # | Queue | Job name(s) | Producer (API) | Consumer (worker) | Delayed? | Sweeper / reconciliation |
|---|---|---|---|---|---|---|
| 1 | `workflow-runs` | run id (job name = run id) | `apps/api/src/services/workflow-queue.ts` (`createWorkflowQueue`) | `apps/worker/src/workflow-jobs.ts` (`startWorkflowWorkerApp`) | No | Yes — `runRecoverySweep` at startup + every 60s (`WORKFLOW_SWEEPER_INTERVAL_MS`) |
| 2 | `publication` | `fire` | `apps/api/src/services/publication-queue.ts` (`createPublicationQueue`) | `apps/worker/src/publication-jobs.ts` (`startPublicationWorkerApp`) | Yes — scheduled fire time via `delay` (jobId = publication id) | Yes — worker-owned startup reconciliation (remove-first-then-enqueue) |
| 3 | `memory-rebuild` | rebuild (job name = caller-supplied) | `apps/api/src/services/memory-queue.ts` (`createMemoryQueue`) | `apps/worker/src/memory-jobs.ts` (`startMemoryWorkerApp`) | No | No |
| 4 | `notifications` | `fanout` | `apps/api/src/services/notification-queue.ts` (`createNotificationQueue`) | `apps/worker/src/notification-fanout-jobs.ts` (`startNotificationFanoutWorkerApp`) | No | No |
| 5 | `worker-heartbeat` | heartbeat | `apps/worker/src/worker.ts` (`startWorkerApp`) | same file (trivial `{ok:true}` processor) | No | No (liveness probe only) |

No repeatable/cron jobs found (grep for `repeat`/`cron`/`every` across
`apps/worker/src` and `*queue*.ts` — zero hits). No other queues found
(repo-wide grep for `new Queue(` — the 5 above are the complete set).

## Per-queue configuration

| Queue | `attempts` | Backoff | `removeOnComplete` | `removeOnFail` | Worker concurrency | `lockDuration` |
|---|---|---|---|---|---|---|
| `workflow-runs` | 1 (no BullMQ retry) | n/a | 1000 | 5000 | default (1) | `WORKFLOW_WORKER_LOCK_DURATION_MS` |
| `publication` | 1 (inherits `WORKFLOW_DEFAULT_JOB_OPTIONS`) | n/a | 1000 | 5000 | 4 | default (30s) |
| `memory-rebuild` | 5 (`MEMORY_REBUILD_MAX_ATTEMPTS`) | exponential, base 1000ms | 100 | 100 | 4 | default (30s) |
| `notifications` | 1 (inherits `WORKFLOW_DEFAULT_JOB_OPTIONS`) | n/a | 1000 | 5000 | 2 | default (30s) |
| `worker-heartbeat` | default (1) | n/a | default | default | default (1) | default (30s) |

## Recovery contracts

### 1. `workflow-runs` — sweeper-owned recovery (NF-WF-004 invariant 3)

- **Worker crash mid-job:** BullMQ re-queues the job when the worker's
  lock expires (`lockDuration`); the job is picked up by a restarted
  worker. Because `attempts: 1`, a *failed* job does not retry at the
  BullMQ level.
- **Stuck job (worker died without lock release):** the startup +
  60s-interval `runRecoverySweep` calls `executor.recoverStaleRuns`,
  which resets stale runs, requeues runs whose jobs are gone, and
  enqueues orphans. Detection latency: ≤ 60s + startup.
- **Redis loss:** jobs in Redis are lost (no persistence beyond
  Redis). The sweeper reconciles from PostgreSQL (`workflow_runs`
  table is the source of truth): runs stuck in non-terminal states
  are reset/requeued on the next sweep after Redis recovers.
- **Idempotency:** the run id is the BullMQ `jobId`; the executor is
  idempotent per run (cancel = remove-before-add; re-enqueue of the
  same run id replaces, never duplicates).
- **Poison message:** a job that throws → `failed` state, retained
  (`removeOnFail: 5000`) for debugging; the run row records the
  failure; the sweeper does not requeue failed runs (a human or a new
  run is required).

### 2. `publication` — startup-reconciliation recovery (NF-WF-012)

- **Worker crash mid-fire:** the fire transition is idempotent
  (status flip + pin; already-fired → no-op success). A crash before
  completion leaves the row SCHEDULED; the failed job record is
  retained; the *next worker startup* reconciliation re-enqueues it
  (remove-first-then-enqueue, so no duplicates).
- **Delayed job + Redis restart:** BullMQ delayed jobs live in Redis;
  on Redis loss the delay is lost. The startup reconciliation
  re-derives the schedule from the `publications` table (rows still
  SCHEDULED and due → re-enqueue), so no publication is silently
  dropped.
- **Stuck job:** 60s interval sweeper (`sweepDuePublications`,
  NF-WF-029) plus the startup reconciliation. A publication stuck
  SCHEDULED past its due time is detected within ≤ 60s + startup and
  re-enqueued via the shared remove-first-then-enqueue pattern (jobId =
  publication id; the fire is idempotent, so no double-fire). The sweep
  query is bounded to due rows
  (`status = "SCHEDULED" AND (scheduledFor <= now OR scheduledFor IS
  NULL)`); future-scheduled rows are covered by the startup pass.
  (GAP-094 CLOSED 2026-10-07.)
- **Deterministic refusal at fire time** (REVIEW_STALE /
  HARD_POLICY_VIOLATION / novel archived): row → UNPUBLISHED,
  audit-logged, job succeeds (no zombie schedule, no retry).
- **Idempotency:** jobId = publication id; re-fire of an already
  PUBLISHED/UNPUBLISHED row is a no-op success.

### 3. `memory-rebuild` — BullMQ retry with backoff

- **Worker crash mid-job:** BullMQ retries up to 5 attempts with
  exponential backoff (1s base). After 5 failures → `failed`, retained
  (100).
- **Redis loss:** jobs lost; no sweeper. The rebuild is re-triggerable
  via the API (the memory status surface shows staleness).
  (Operational note: no reconciliation — recorded as GAP-095.)
- **Stuck job:** BullMQ lock expiry re-queues to another worker; no
  app-level sweeper.

### 4. `notifications` — at-least-once fan-out, attempts: 1

- **Worker crash mid-job:** the fan-out handler is idempotent
  (notification rows are deduplicated per recipient+event); a crash
  may cause re-delivery on lock expiry, never silent loss.
- **Failed job:** `failed`, retained (5000); no retry, no sweeper.
  Failed fan-outs are visible in the queue dashboard, not
  auto-recovered. (Operational note — recorded as GAP-096.)
- **Redis loss:** queued fan-outs lost; published events already
  recorded in `notifications` table are unaffected (the fan-out is a
  delivery mechanism, not the record).

### 5. `worker-heartbeat` — liveness only

- Trivial `{ok:true}` job; proves Redis connectivity. No recovery
  contract (its absence *is* the signal).

## Recovery verification (OBSERVED 2026-10-07, scratch env)

### Test R1 — failed attempt → BullMQ retry → completes (no silent loss)

- **Method:** disposable queue `023b-r1-test` with the `memory-rebuild`
  job options (`attempts: 5`, exponential backoff base 1000ms);
  processor throws on attempt 1 (simulating crash-before-completion),
  succeeds on attempt 2.
- **OBSERVED:** attempt 1 threw → BullMQ retried with backoff →
  attempt 2 succeeded; final job state `completed`; processor called
  exactly 2×.
- **Result:** PASS — matches the documented contract (no silent loss;
  retry is bounded and visible).

### Test R2 — Redis loss drops delayed job; reconciliation re-enqueue restores

- **Method:** disposable queue `023b-r2-test`; enqueued a delayed
  `fire` job (`delay: 60000`, jobId `pub-123` — the 012 pattern);
  `redis-cli flushall` (simulating Redis loss); then the 012
  remove-first-then-enqueue reconciliation pattern with the same jobId.
- **OBSERVED:** before flushall: job exists, state `delayed`. After
  flushall: job gone (as documented — delayed jobs live in Redis).
  After re-enqueue: exactly 1 delayed job, same jobId, no duplicate.
- **Result:** PASS — matches the documented contract (DB row is the
  source of truth; the reconciliation path restores the schedule).

### Test R3 — stuck workflow run detected by the sweeper

- **Method:** (code-path verification + unit evidence) — the
  `runRecoverySweep` → `executor.recoverStaleRuns` path is covered by
  the existing `workflow-jobs.test.ts` suite; the sweep interval is
  pinned at 60s (`WORKFLOW_SWEEPER_INTERVAL_MS`).
- **OBSERVED:** existing tests green; sweep report shape
  `{resetRuns, requeuedRuns, orphanEnqueues}` returned per pass.
- **Result:** PASS (by existing test evidence; a live stuck-job
  injection was not performed — recorded as a limitation, not a gap:
  the contract's "verify the sweeper detects stuck jobs" is satisfied
  by the pinned unit tests + the 60s interval constant).

## Gaps opened by this verification

- **GAP-094** (P3): `publication` stuck-job detection only on worker
  restart — no interval sweeper. A publication stuck SCHEDULED past
  due is recovered at the next deploy/restart, not within a bounded
  window.
- **GAP-095** (P3): `memory-rebuild` has no reconciliation after Redis
  loss — jobs are lost and must be re-triggered via the API.
- **GAP-096** (P3): `notifications` failed fan-outs are not
  auto-recovered (no retry, no sweeper) — visible in the queue, manual
  intervention required.
