# Task NF-WF-030: Memory rebuild reconciliation after Redis loss (GAP-095)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (pending contract review; separate review before implementation)
Milestone / capability IDs: M8 (production operations), NF-WF-023B follow-up
Implementer role / requested and resolved model: TBD (separate actor from contract author)
Reviewer role / requested and resolved model: TBD (separate actor from implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-095 OPEN; parent (coordinator) accepts
Frozen review manifest / exact artifact paths and identity: TBD at implementation
Baseline revision / local changes to preserve: eb065cf (or latest containing it)
Engram checkpoint topic key / last confirmed observation reference: TBD

## Goal and reason

Add durable rebuild-intent reconciliation for the `memory-rebuild` queue so
that memory projections self-heal after Redis loss. Currently, if Redis is
lost, queued rebuild jobs are gone and nothing re-derives them; recovery is
manual via the API. The fix: on worker startup, detect stale memory
projections from PostgreSQL (the source of truth) and re-derive rebuild jobs
for them — idempotently, without false success, and without duplicate
mutations.

This closes GAP-095. It does not change the rebuild logic itself
(`processRebuild` is already idempotent); it adds the missing recovery path.

## Required reading

- [Operating constitution](../../AGENTS.md) (§9 false-success prohibition, §10 development rules, §12 multi-LLM orchestration protocol).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- GAP-095 in [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1930).
- [Job inventory](../../docs/implementation/023B-job-inventory.md) (§3 `memory-rebuild` recovery contract).
- `apps/worker/src/memory-jobs.ts` (worker startup; where reconciliation hooks in).
- `apps/worker/src/publication-jobs.ts` (`reconcileScheduledPublications` — the established startup-reconciliation pattern to mirror).
- `packages/memory/src/freshness.ts` (`deriveFreshness` — the staleness signal).
- `packages/memory/src/rebuild.ts` (`processRebuild` — idempotency via dedup on existing OK rows).
- `apps/api/src/services/memory-queue.ts` (queue creation; jobId format).
- `packages/ai-services/src/memory.ts` (`triggerRebuild` — existing STALE detection + enqueue logic to reuse, not duplicate).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task prerequisites
without Docker; Windows reuses existing running Docker services/data. Use
dedicated disposable test databases for mutation/migration tests. Never reset
working databases for tests.

The acceptance test must simulate Redis loss against a disposable Redis (flush
or restart a test-scoped instance); never flush the shared/dev Redis.

## Dependencies and evidence

- NF-WF-009: IMPLEMENTED (memory worker; `processRebuild` idempotency).
- NF-WF-023B: IMPLEMENTED (job inventory; GAP-095 recorded as follow-up, not a defect fix per 023 Invariant 1).
- NF-WF-026: IMPLEMENTED (memory service now in `@novelforge/ai-services`; `triggerRebuild` STALE logic lives there).
- Active issue: GAP-095 (OPEN, P3).
- No new migrations expected (reconciliation is application logic, not schema).

## Scope

Allowed paths:
- `apps/worker/src/memory-jobs.ts` (hook startup reconciliation into `startMemoryWorkerApp`, mirroring the publication pattern).
- New module for the reconciliation logic (e.g. `apps/worker/src/memory-reconciliation.ts`), or colocated in `memory-jobs.ts` if the implementer justifies it — the function must be unit-testable without a live worker.
- `apps/worker/src/memory-jobs.test.ts` (or new test file) for the reconciliation unit tests and the Redis-loss acceptance test.
- `docs/implementation/023B-job-inventory.md` (update the `memory-rebuild` recovery contract section with the new reconciliation behavior).
- `docs/implementation/ISSUES-AND-GAPS.md` (close GAP-095 with evidence; record any new issues found).

Forbidden paths: everything else, including:
- `packages/memory/src/rebuild.ts` (`processRebuild` logic — already idempotent; do not modify).
- `packages/memory/src/freshness.ts` (`deriveFreshness` — the staleness signal; do not modify).
- `packages/ai-services/src/memory.ts` (`triggerRebuild` — reuse its STALE-detection pattern; do not duplicate its enqueue logic into the worker, extract a shared helper if needed).
- Any new BullMQ queue, any schema migration, any API route changes.
- Marking a scope healthy without a successful rebuild.
- Importing queue factories from `apps/api/src` (e.g. `createMemoryQueue` from `apps/api/src/services/memory-queue.ts`) — violates the NF-WF-026 ESLint `no-restricted-imports` rule; the worker must receive the queue via DI (see "Queue factory DI pattern" below).

Inputs:
- PostgreSQL `memoryProjection` rows (source of truth for staleness).
- `deriveFreshness(db, novelId, scope)` → `"FRESH" | "STALE" | "FAILED" | "MISSING"`.
- The `memory-rebuild` BullMQ queue (via the existing queue factory pattern).

Outputs:
- `reconcileMemoryRebuilds({ db, queue, logger }) → ReconciliationReport` (proposed name; implementer may rename with reviewer approval).
- Re-derived rebuild jobs with deterministic jobIds (`memoryRebuildJobId(novelId, scope, sourceRevisionId)` from @novelforge/memory (SHA256 tuple identity; NF-WF-035 corrects the BullMQ-invalid colon format)), enqueued on the existing queue.

Out of scope:
- Interval sweeper (GAP-095 asks for reconciliation after Redis loss; the bounded fix is startup reconciliation, mirroring `publication`. If the implementer finds startup-only insufficient, record a follow-up GAP rather than expanding scope silently).
- Production Redis HA/persistence configuration (deployment concern).
- Notification fan-out (GAP-096) and publication stuck-job detection (GAP-094) — separate tasks.
- Redis loss mid-run with a long-lived worker (only startup reconciliation is covered; an interval sweeper is a follow-up GAP if needed).

### Queue factory DI pattern

- The implementer MUST add a `createQueue` dependency to `MemoryWorkerDeps` (mirroring the publication worker's DI pattern at `publication-jobs.ts:409,509`): the reconciliation function receives the queue as an injected dependency, never constructs it from `apps/api/src`.
- Explicitly FORBIDDEN: importing `createMemoryQueue` from `apps/api/src/services/memory-queue.ts` (violates the NF-WF-026 ESLint `no-restricted-imports` rule).

## Behavior and invariants

### Happy path
1. Worker starts → `startMemoryWorkerApp` runs startup reconciliation before (or alongside) starting the consumer.
2. Reconciliation queries all novels/scopes with projection rows, calls `deriveFreshness` per scope.
3. For each scope with freshness `"STALE"` (or `"MISSING"` where a rebuild is warranted — see below), enqueue a rebuild job with the deterministic jobId for the head revision.
4. Report counts: `{ checked, stale, requeued, skipped, failed }` (exact shape at implementer's discretion; must be logged). The report SHOULD distinguish FRESH (healthy) from MISSING (not-yet-consumed) in the `skipped` count for operator observability.

### Staleness semantics
- `"STALE"`: projection exists but sourceRevision ≠ head → re-derive rebuild for head revision.
- `"MISSING"`: no projection rows. Per `triggerRebuild`'s Invariant 9 ("materialize when consumed — a scope with no rows stays MISSING until consumed"), MISSING scopes are NOT auto-rebuilt by reconciliation (nothing has asked for them yet). Only STALE scopes are re-derived. (If the reviewer disagrees, this is a contract question, not an implementer decision.)
- `"FAILED"`: newest row is FAILED. Reconciliation re-derives for the **head revision** (same as STALE), not the failed revision: the goal is to catch up to head, and rebuilding the failed revision when head has moved would leave the projection STALE (wasted work). A FAILED row means the last attempt failed, so re-enqueue is correct; `processRebuild` retries the build and the per-job retry budget applies to the new job.
- `"FRESH"`: skip.

### Idempotency (no duplicate mutations)
- JobId is deterministic: `memoryRebuildJobId(novelId, scope, sourceRevisionId)` from @novelforge/memory (SHA256 tuple identity; NF-WF-035 corrects the BullMQ-invalid colon format). BullMQ dedupes on jobId — re-adding an existing job is a no-op (or replaces, never duplicates).
- `processRebuild` additionally dedupes at the DB level: if a row exists with `buildStatus: "OK"` for `(novelId, scope, sourceRevisionId)`, it returns `{ deduped: true }` without rebuilding.
- Reconciliation must be safe to run multiple times (startup is not the only trigger in tests).

### Honest staleness (no false success)
- If the queue is unavailable (Redis down), reconciliation must NOT mark scopes healthy. The staleness signal in the DB is untouched; the next startup (or manual trigger) retries. Log loudly.
- Reconciliation failure must not prevent the worker consumer from starting (mirror the publication pattern: log error, continue; the next restart retries).
- Never write a `buildStatus: "OK"` row without a successful `processRebuild`.

### Concurrency
- Multiple worker instances starting simultaneously: deterministic jobIds make concurrent reconciliation safe (BullMQ dedupes).
- A rebuild job actually running while reconciliation re-enqueues: same jobId → no duplicate; `processRebuild`'s DB-level dedup is the second guard.

### Failure and cancellation
- Redis unavailable at startup: reconciliation logs and skips (like the existing "redis unavailable; memory worker not started" path); staleness remains visible.
- Partial failure (some scopes requeued, others error): report per-scope; do not roll back successes.

## Acceptance and verification

- [ ] `reconcileMemoryRebuilds` (or equivalent) exists, is unit-testable, and is called on memory worker startup.
- [ ] **Redis-loss simulation test** (the core acceptance): seed a novel with a STALE projection (sourceRevision behind head); enqueue the rebuild job; simulate Redis loss (drop queue state — flush test Redis or restart test instance); run reconciliation; assert: (a) the stale scope is detected, (b) a rebuild job is re-derived with the correct deterministic jobId, (c) the job executes to `buildStatus: "OK"`.
- [ ] **No-duplicate test**: run reconciliation twice (or while a job is queued/running); assert no duplicate mutations (single OK row per `(novelId, scope, sourceRevisionId)`; `processRebuild` dedup counter or row count proves it).
- [ ] **No-false-success test**: reconciliation with Redis unavailable → assert no scope is marked healthy (DB rows unchanged), error is logged, worker still starts.
- [ ] **FRESH-scope test**: FRESH scopes are skipped (no job enqueued).
- [ ] Existing memory worker tests pass; `pnpm lint` and typecheck clean for touched packages.
- [ ] Job inventory (`023B-job-inventory.md`) updated: `memory-rebuild` recovery contract now documents startup reconciliation.
- [ ] GAP-095 CLOSED with evidence in ISSUES-AND-GAPS.md.
- [ ] Separate review of the submitted revision; findings resolved.

Record actual results separately from expectations. Zero selected tests or skipped integration checks do not pass a capability gate.

## Migration and rollback

- No schema migration (reconciliation is application logic).
- Deployment compatibility: the worker gains a startup step; if the reconciliation function throws, the worker still starts (publication pattern). No rollback beyond redeploying the previous worker build.
- Existing data: reconciliation only enqueues jobs for STALE scopes; FRESH projections are untouched.

## Documentation and handoff

- Update `docs/implementation/023B-job-inventory.md` (§3 `memory-rebuild` — replace "no sweeper / no startup reconciliation" with the new contract).
- Close GAP-095 in `docs/implementation/ISSUES-AND-GAPS.md` with: evidence (test names + results), the reconciliation report shape, and the honest-staleness guarantee.
- If the implementer discovers that startup-only reconciliation is insufficient (e.g. Redis loss mid-run with a long-lived worker), record a follow-up GAP for an interval sweeper rather than expanding this task's scope.
- Use the playbook handoff; list unknowns and next dependency-ready tasks. Do not claim production readiness or live-deployment success from the Redis-loss simulation.
