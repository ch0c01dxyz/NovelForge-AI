# NF-WF-035 — Post-sync runtime regression repair

Status: IMPLEMENTED / REVIEWED (bounded repair scope). Baseline: e538180, 2026-10-07.
Owner: current Codex implementer. Reviewers: separate review_mutations_034 and review_recovery_034 actors.

## Contract

Goal: close the evidenced regressions in GAP-109 without new product scope.
Reading: constitution, CURRENT, issue register, contracts027–034 and affected service/queue callers.
Inputs/outputs: existing HTTP, simulation, restore and job contracts; preserve signatures and authorization, replace invalid internal BullMQ job identity consistently at both producers.
Allowed: memory constants/service/reconciler and relevant tests; what-if/simulation/revisions/manuscript services and regression tests; scheduled notification queue defaults; shared planning outline-delete lock ordering; shared/API revision create wrapper lock ordering and branch-switch locking; startup/progress/delivery pointers, task amendments and issue evidence.
Forbidden: production database reset, Redis flush/production queue consumption, schema or auth weakening, new model requirements, unreviewed feature expansion.
Invariants: one comparison claimant; provision from explicit main revision with insertion compensation; each committed tick cursor agrees with durable tick/entity state; merge evidence/payloads read the same locked heads; scene FK children cannot bypass capability checks and mutation follows checkout lineage; restore JSON fidelity; deterministic safe queue IDs and recoverable failed builds.
Acceptance: real BullMQ enqueue/dedup regression; failed/completed memory reconciliation; comparison race/provision compensation; batch tick failure/retry; scene alternate lineage; restore coherent=true; semantic apply and debugger regressions; lint/typecheck; independent exact-diff review.
Commands: targeted API/worker vitest, story-versioning tests, pnpm lint/typecheck. Prerequisites: Windows existing nf-pg-5433 and Redis reused, dedicated scratch databases only; Redis tests use unique queues in isolated DB15, never production queues.
Migration: none in this repair; reviewed existing migrations deployed only to disposable test DBs. Reverting job ID format reintroduces the verified BullMQ failure; no canonical data rewritten by repair.
Handoff: CURRENT/GAP-109 hold commands/results and unfinished release/human gates. Engram attribution unavailable per runtime hook; no invented session or claimed save.

## Contract clarifications

NF-WF-033's previous text presumed cursor and tick writes already committed together. Actual implementation commits one transaction per tick. This repair places cursor/status CAS in that same transaction; successful earlier ticks remain committed if a later tick fails, with their correct cursor. A failed tick writes nothing. No complete-batch rollback is claimed.
Memory producer/reconciler now share a SHA256 tuple identity via @novelforge/memory. The old colon-separated identity was rejected by the installed BullMQ. Reconcile completed jobs only when PostgreSQL reports STALE/FAILED; FRESH and live queued jobs remain untouched.

## Verification receipt — current Windows host, 2026-10-07

- Real BullMQ memory ID test: RED before repair (Custom Id cannot contain colon), GREEN after repair (1/1).
- Focused API mutation suite: 82/82 across6 files; what-if/memory31/31 after provisioning regressions; expanded canon/planning/scene/semantic/what-if108/108; final restore/branch/selective/semantic/scene/planning/coherence113/113 across7 files.
- Worker recovery suites46/46 across5 files, including retained completed projection job and scheduled producer retry policy. Earlier connection-close test error fixed; final run has no unhandled error.
- Story-versioning58/58 and pure semantic36/36. These are scoped receipts, not a deduplicated total or full release battery.
- Workspace typecheck exit0 before final locking adjustments; final affected API/shared typechecks exit0. Lint and diff whitespace checks exit0.
- Separate reviewers review_mutations_034 and review_recovery_034: APPROVE after locking/error-handler findings addressed. Reviewers did not run tests.
- GAP-110, human GAP-051, live deployment and final-revision full release battery remain open. No automatic Engram checkpoint claimed; runtime attribution unavailable.
