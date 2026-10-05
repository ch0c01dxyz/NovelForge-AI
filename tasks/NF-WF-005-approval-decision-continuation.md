# Task NF-WF-005: Approval decision and safe continuation

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: READY (contract draft; not yet reviewed)
Milestone / capability IDs: M1 workflow execution; DELIVERY-PLAN NF-WF-005
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-004
VERIFIED (durable execution, sweeper, cancellation); GAP-003 is the owning issue.
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ 1afb5c1 (NF-WF-004 pushed 2026-10-05)
Engram checkpoint topic key / last confirmed observation reference: Engram unavailable
on this host (GAP-021); checkpoints go to docs/implementation/progress.md.

## Goal and reason

A workflow run parked at a `HUMAN_APPROVAL` step (`AWAITING_APPROVAL`,
currently a dead end per GAP-003) can be decided by an authorized approver:
**approve** resumes the *same run* from the parked step; **reject** fails it
with the rejection recorded. Decisions are bound to the exact material
approved (snapshot hash + version pins), persisted exactly once, consumed
exactly once, and audited. The decision path is restart-safe: a crash at any
point leaves the run either undecided (decide is retry-safe) or decided and
resumable by the NF-WF-004 sweeper.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §9 versioning/recovery,
  §10 dev rules, §11 Definition of Done, §12 orchestration, §13 evidence).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [NF-WF-004 contract](./NF-WF-004-durable-workflow-execution.md) (frozen
  `8c73c55d`) — the durable execution substrate this task builds on:
  guarded claims, sweeper (a)/(b), cancellation, idempotency.
- Existing implementation: `packages/workflow-executor/executor.ts`
  (HUMAN_APPROVAL park at ~L495, claim loop, terminal write),
  `apps/api/src/services/workflow-runs.ts` (`enqueueRun`, `cancelRun`,
  `gateWorkspace`), `apps/api/src/definition-routes.ts` (run/cancel routes),
  `packages/auth/authorization.ts` (capability model), Prisma
  `WorkflowRun`/`WorkflowStepRun` models.
- [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md): GAP-003
  (owning issue), GAP-013, GAP-018, GAP-028 (out of scope here).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
This host (Ubuntu 24.04.5, x86_64): pnpm 12.5.1 at `~/.local/bin/pnpm`, Node
v24.20.0, PostgreSQL 16.15 + pgvector 0.6.0 on localhost:5432, Redis 7.0.15
on localhost:6379 (both started manually; no systemd auto-start). Root `.env`
is gitignored and points at scratch `novelforge_test` on localhost.
All test/migration work on scratch `novelforge_test_*` databases only; never
reset a working database. No Docker per project policy.

## Dependencies and evidence

- NF-WF-004 (durable workflow execution): VERIFIED — contract APPROVE round 3,
  implementation `1afb5c1` pushed 2026-10-05, independent diff review
  APPROVE_WITH_FINDINGS (P2 fixed). Provides: guarded PENDING-only claims,
  sweeper (a) RUNNING reset + (b) PENDING-orphan re-enqueue, cancellation,
  one shared `workflow-runs` queue, `{text,json}` outcome envelopes.
- GAP-003 "Approval cannot resume" (OPEN/P1): `HUMAN_APPROVAL` parks
  permanently; no decision/resume routes. Closed by this task with the
  acceptance evidence below.
- Active related issues: GAP-013 (reviewer backend), GAP-018 (migration
  discipline), GAP-028 (production-worker AI wiring — explicitly out of
  scope; approval tests must use deterministic step kinds or the test
  driver, not a production worker AI path).

## Scope

Allowed paths:
- `packages/workflow-executor/executor.ts` (+ its test): park-time snapshot
  persistence; resume continuation (skip decided steps — already implied by
  PENDING-only claims, but must be asserted by test).
- `apps/api/src/services/workflow-runs.ts`: new `decideRun()` (approve /
  reject), snapshot computation helper; extend `gateWorkspace` cap union
  with `workflow:approve`.
- `apps/api/src/definition-routes.ts`: `POST
  /api/workspaces/:workspaceId/workflow-runs/:runId/approve` and `/reject`;
  expose the current approval snapshot on `GET .../workflow-runs/:runId`
  (or a dedicated `GET .../approval`) so the approver can echo
  `expectedSnapshotHash`.
- `packages/auth/authorization.ts` (+ its test): new `workflow:approve`
  capability, granted to OWNER/ADMIN/AUTHOR (mirrors `canon:approve`;
  EDITOR/VIEWER excluded).
- `packages/database/prisma/schema.prisma` + one additive migration:
  `WorkflowApprovalDecision` model and `WorkflowStepRun.approvalSnapshot`
  column (see Migration section).
- Tests: `apps/api/src/definitions.test.ts` (or a new
  `approval-decision.test.ts`), `packages/workflow-executor/executor.test.ts`
  additions.
- Docs: `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`, `ISSUES-AND-GAPS.md` (new problems
  only, per §13 and standing author instruction).

Forbidden paths: everything else, including `packages/auth/*` beyond the
capability addition, `packages/story-versioning/*`, the NF-WF-004 sweeper
semantics, any domain-event producer (GAP-023), UI (NF-WF-007 owns approval
UI), and any change to the terminal-write or cancellation invariants.

Inputs: the parked run row (`AWAITING_APPROVAL`), its parked step row, the
approver's actor identity, `{ expectedSnapshotHash, reason? }`.
Outputs: persisted `WorkflowApprovalDecision` row (exactly one per
`(runId, stepKey)`), guarded status transitions, audit records
(`workflow.run_approved` / `workflow.run_rejected`), and — on approve — a
re-enqueued job that resumes the same run.

Out of scope (with follow-up owner): approval UI (NF-WF-007); editing the
approved text after decision (NF-WF-006/007 — note invariant 3's binding is
what makes later invalidation possible); multi-approver/quorum; approval
expiry/timeout (follow-up task); notifications of pending approvals
(follow-up task); production-worker AI wiring (GAP-028).

## Behavior and invariants

Ten invariants. "Guarded" means a single-statement conditional
`updateMany`/`update` whose `where` includes the expected source status; the
affected-row count decides the outcome. No `@@unique` constraint is the
mechanism — each is a backstop.

### Invariant 1 — Decision routes are authorized and tenant-gated

`POST /api/workspaces/:workspaceId/workflow-runs/:runId/approve` and
`/reject`. Same route style as the cancel route: `requireActor`, zod
params (`workspaceId`, `runId` uuids; 400 `INVALID_INPUT` on failure),
then `gateWorkspace(workspaceId, actorUserId, "workflow:approve")` inside
the service. `workflow:approve` is a new capability in
`packages/auth/authorization.ts`, granted to OWNER/ADMIN/AUTHOR (mirrors
`canon:approve`; EDITOR and VIEWER are excluded). Missing capability →
`ForbiddenError` → 403 (existing mapping). Non-member → `NotFoundError`
→ 404 (existing `gateWorkspace` behavior). Request bodies:
- approve: `{ expectedSnapshotHash: string (64-hex), reason?: string (max 2000) }`
- reject: `{ expectedSnapshotHash: string (64-hex), reason: string (required, 1..2000) }`
A rejection without a reason is 400 — a rejected run must say why.

### Invariant 2 — The approval snapshot is persisted at park time

When the executor parks at a `HUMAN_APPROVAL` step, it writes an
`approvalSnapshot` (Json, nullable column on `WorkflowStepRun`) containing:
- `material`: the rendered `instruction` actually presented, the `outcomes`
  map of all prior steps at park time (their `{text,json}` envelopes), and
  the version pins (`workflowVersionNumber`, and the agent/skill version
  numbers resolved for the run's steps).
- `snapshotHash`: `sha256` over the canonical JSON encoding of `material`
  (sorted keys, UTF-8; the canonicalization function lives in the executor
  package and is unit-tested with a fixed vector).
The parked run's GET response exposes the current `snapshotHash` (and the
material) so the approver's client can echo it. The snapshot is written in
the same step-row update that parks the step — no new transaction scope.

### Invariant 3 — Decisions bind to the snapshot; stale material is refused

The decide transaction compares `expectedSnapshotHash` to the step row's
stored `snapshotHash`. Mismatch → 409 `STALE_APPROVAL`, no state change,
run stays `AWAITING_APPROVAL`. A stored `NULL` snapshot (rows parked before
this task's migration — possible for any run parked between the NF-WF-004
and NF-WF-005 deploys) is an explicit distinct case: → 409
`NO_APPROVAL_SNAPSHOT`, no state change, run stays `AWAITING_APPROVAL`.
Such rows are undecidable, never backfilled: backfilling a hash over
material that was never pinned would manufacture a binding the approver
never saw. This is the mechanism behind "bind decision to final
text/version/source pins" and the DoD rule "any later edit invalidates
approvals/reviews tied to the previous version": if the material changed
after parking (re-rendered instruction, superseded prior outcome, moved
definition version), an approval minted against the old view cannot land.
The comparison and the guarded transitions below are one transaction; the
transaction contains no LLM calls and no awaits across the human
(constitution §9). "Source pins" in GAP-003 is satisfied by this material:
the instruction, the prior-step `{text,json}` outcome envelopes (retrieval
content is bound through the envelopes, and full retrieval provenance
remains reachable via the step row's `RetrievalAudit` linkage), and the
workflow/agent/skill version numbers.

### Invariant 4 — The decision is persisted exactly once and consumed exactly once

One transaction performs, in order:
1. Guarded run transition: `UPDATE WorkflowRun SET status=... WHERE id=$1
   AND status='AWAITING_APPROVAL'` → `PENDING` on approve, `FAILED` on
   reject. Zero affected rows → the run is read to pick the code:
   `CANCELLED` → 409 `RUN_CANCELLED` (cancel won the race — deliberate
   distinct code, not conflated with a decision); anything else →
   409 `ALREADY_DECIDED` (covers duplicate decisions).
2. Guarded step-row transition: the parked step `AWAITING_APPROVAL →
   SUCCEEDED` (approve, decision summary in the row) or `→ FAILED`
   (reject, reason in `errorMessage`). Zero affected rows → the whole
   transaction rolls back (a decision row must never exist while its step
   row is still `AWAITING_APPROVAL` — that corrupt state would strand the
   run `PENDING` with an undecided step the worker cannot claim).
3. Insert the `WorkflowApprovalDecision` row (`@@unique([runId, stepKey])`
   as backstop): `{ runId, stepKey, stepRunId, decision, snapshotHash,
   pins, decidedById, reason, decidedAt }`. A unique violation → the whole
   transaction rolls back.
4. The audit insert (`workflow.run_approved` / `workflow.run_rejected`,
   invariant 9) is part of the same transaction: no decision without its
   audit record.
On approve, `completedAt` stays null (the run is not done); on reject,
`completedAt` is set and `errorMessage` carries the rejection reason.
No second decision can ever be recorded for the same step.

### Invariant 5 — Approve resumes the same run from the parked step

After the decide transaction commits, the route resumes the run in this
exact order: (1) best-effort remove the old job record
(`queue.getJob(runId)` → `remove()`, failure swallowed/logged) — the park
path completes its BullMQ job normally and the queue retains completed
records, so a re-`add()` with the same `jobId` while any record exists is
a silent no-op (BullMQ `addStandardJob`: `EXISTS jobIdKey →
handleDuplicatedJob`) and the approved run would sit `PENDING` forever;
(2) `queue.add("workflow-run", { runId }, { jobId: runId })` — the same
mechanism as `enqueueRun`, reusing the one shared queue. A
remove-vs-sweeper-(b) race is benign: both add with the same `jobId`,
dedup yields one job, and the `PENDING`-only claim single-wins. The worker
claims `PENDING → RUNNING` (guarded, NF-WF-004 invariant 2) and the loop
continues from the first `PENDING` step row: the decided approval step is
`SUCCEEDED` and is skipped; steps after it are still `PENDING` from enqueue
time. The continuation cursor is exactly the step-row statuses — no separate
cursor table, no re-execution of `SUCCEEDED` steps, no re-park at the decided
step. Restart safety composes with NF-WF-004: if the enqueue throws after
commit, the run sits `PENDING` with no job record and sweeper (b) re-enqueues
it within the orphan window; if the process crashes before commit, no decision
was persisted and decide is retry-safe.

### Invariant 6 — Reject is terminal and never resumes

A rejected run is `FAILED` with the reason recorded; its remaining
`PENDING` step rows are left untouched (history shows what never ran) and
the sweeper never touches it (sweeper handles only `RUNNING` and orphaned
`PENDING`). Rejecting an already-terminal or already-decided run → 409.

### Invariant 7 — Cancellation composes with decisions

A parked run remains cancellable (already in `cancelRun`'s guarded set).
Race rule, both directions guarded: if cancel commits first, the run is no
longer `AWAITING_APPROVAL` and decide → 409 `RUN_CANCELLED` when the run
reads `CANCELLED` (`ALREADY_DECIDED` for any other non-`AWAITING_APPROVAL`
state) — invariant 4's code selection; if decide commits first, cancel
follows the normal `PENDING`/`RUNNING` path (NF-WF-004 invariant 5). No path
produces two terminal writes: every transition is guarded on its expected
source status.

### Invariant 8 — The worker never re-decides and never invents approval

The worker treats a `SUCCEEDED` approval step row as an ordinary completed
step. It never auto-approves, never synthesizes a decision row, and never
re-parks at a step whose row is `SUCCEEDED`. A job that finds the run no
longer `PENDING` at claim time exits silently (NF-WF-004 lost-claim rule).

### Invariant 9 — Audit every decision

`workflow.run_approved` / `workflow.run_rejected` audit records carry
`actorUserId`, `snapshotHash`, the version pins, and the reason. (Park time
already emits `workflow.run_awaiting_approval`.) The audit write for a
decision happens in the decide path, not in the worker.

### Invariant 10 — No scope creep at the approval gate

The decide path does not call models, does not re-render instructions, does
not mutate story state, and does not emit domain events. It moves statuses,
persists one decision row, audits, and (on approve) enqueues. Anything the
approver wants changed about the material is a new run or an out-of-scope
edit flow (NF-WF-006/007).

## Acceptance and verification

- [ ] Park → approve → the same run resumes and reaches `SUCCEEDED`; the
  approval step row is `SUCCEEDED` (not re-executed — assert via the step
  execution record, not via absence of error); exactly one decision row;
  the resumed job is actually live (`queue.getJob(runId)` returns a
  waiting/active job, or the resume is driven to completion) — asserting
  `add` was called is not enough, since a retained completed record makes
  re-`add` a silent no-op.
- [ ] Park → reject with reason → run `FAILED`, `errorMessage` contains the
  reason, step row `FAILED`, decision row persisted, no job enqueued, no
  resume.
- [ ] Stale: park → change the material (re-rendered instruction or a
  superseded prior outcome) → approve with the old hash → 409
  `STALE_APPROVAL`; run still `AWAITING_APPROVAL`; then approve with the
  fresh hash → resumes.
- [ ] Snapshotless: seed a parked run whose step row has `approvalSnapshot`
  NULL (the pre-NF-WF-005 shape) → decide → 409 `NO_APPROVAL_SNAPSHOT`;
  run untouched, still `AWAITING_APPROVAL`.
- [ ] Duplicate: approve twice → second returns 409 `ALREADY_DECIDED`;
  exactly one decision row; the run was enqueued exactly once per decision.
- [ ] Sequential approvals: workflow with two `HUMAN_APPROVAL` steps;
  decide the first → resume → parks at the second → decide → completes;
  two decision rows, each bound to its own step's snapshot.
- [ ] Unauthorized: EDITOR/VIEWER without `workflow:approve` → 403;
  non-member → 404; run untouched.
- [ ] Validation: missing `expectedSnapshotHash` → 400; reject without
  reason → 400; malformed uuids → 400.
- [ ] Restart-safe continuation: approve commits, enqueue throws
  (simulated) → run `PENDING` with no job; sweeper (b) re-enqueues within
  the orphan window → run completes. (May simulate via DB state + sweeper
  invocation, as in NF-WF-004; document the simulation.)
- [ ] Resume cursor exactness: multi-step workflow with the approval in the
  middle; after approve, pre-approval steps are not re-executed and
  post-approval steps run exactly once.
- [ ] Cancel race: cancel a parked run → `CANCELLED`; decide after → 409
  `RUN_CANCELLED` (distinct from `ALREADY_DECIDED`); decide-then-cancel
  follows the normal path.
- [ ] Snapshot canonicalization: fixed test vector for `snapshotHash`
  (key order, unicode, nested envelopes).
- [ ] Migration: applies from empty, re-applies cleanly (`IF NOT EXISTS`,
  GAP-018); decision unique constraint rejects a duplicate
  `(runId, stepKey)` insert.
- [ ] Commands: `pnpm lint` clean; `pnpm --filter @novelforge/api typecheck`
  clean; `pnpm --filter @novelforge/worker typecheck` clean;
  `pnpm --filter @novelforge/workflow-executor typecheck` clean; named
  suites green with real counts (zero selected tests is not a pass).
- [ ] Separate review of the submitted diff; findings resolved before
  commit. Contract review (this file) returns APPROVE before dispatch.

Record actual results separately from expectations.

## Migration and rollback

- New model `WorkflowApprovalDecision`: `id` (uuid PK),
  `runId → WorkflowRun` (Cascade — run history owns its decisions),
  `stepRunId → WorkflowStepRun` (Cascade),
  `stepKey` (text), `decision` (enum `APPROVED`/`REJECTED`),
  `snapshotHash` (text), `pins` (Json), `decidedById → User` (SetNull),
  `reason` (text, nullable), `decidedAt` (timestamptz, default now);
  `@@unique([runId, stepKey])` (the unique btree's leftmost column already
  serves `runId`-only lookups; no separate index).
- New nullable column `WorkflowStepRun.approvalSnapshot` (JsonB).
- DDL is purely additive, `IF NOT EXISTS` on every statement (GAP-018);
  single migration file; no backfill (no parked runs can predate the
  column — before this task, parking was a dead end, so any existing
  `AWAITING_APPROVAL` rows simply have no snapshot and are undecidable:
  decide on them → 409 `NO_APPROVAL_SNAPSHOT` (invariant 3), never
  backfilled).
- Deploy order: migrate first, then deploy code. Old code runs fine against
  the migrated schema (nullable column, unused table).
- Rollback: forward-fix only; dropping is a second reviewed migration.

## Documentation and handoff

- Update `docs/implementation/progress.md` (NF-WF-005 section with verified
  counts only), `docs/14-progress/CURRENT.md`, `docs/implementation/test-matrix.md`.
- Record every new technical problem, confusion, blocker, or gap in
  `docs/implementation/ISSUES-AND-GAPS.md` before any workaround or
  completion claim (constitution §13; standing author instruction: all
  obstacles and problems are recorded there).
- Close GAP-003 only with the acceptance evidence above; reference this
  contract's frozen blob.
- Unknowns / risks: approver UX for viewing the snapshot material lives in
  NF-WF-007; the exact "edit invalidates" enforcement for post-decision
  text edits is NF-WF-006/007; two-worker failover for a resumed run is
  covered at the DB CAS level only (as in NF-WF-004).
- Next dependency-ready task: NF-WF-006 (one versioned chapter
  generation/review template; depends on 003 and 005).

## Review record

### Review 1 — 2026-10-05, CHANGES_REQUESTED, applied 2026-10-05

**Scope.** Contract `e6b62e5d` (18,083 bytes), HEAD `1afb5c1`. Eight
findings; all addressed:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | P1 | Resume re-enqueue is a silent no-op when the completed job record is retained (F12 reintroduced on the resume path) | **ACCEPTED.** Invariant 5 now orders: decide commits → best-effort remove old job record → `queue.add` same `jobId`; acceptance asserts the resumed job is actually live |
| F2 | P2 | NULL `approvalSnapshot` behavior unspecified (the real-world staleness case) | **ACCEPTED.** Invariant 3 pins explicit 409 `NO_APPROVAL_SNAPSHOT`, no state change, never backfilled; acceptance item added |
| F3 | P2 | Decide transaction failure modes past step 1 unspecified | **ACCEPTED.** Invariant 4: zero-affected step-2 or unique-violation step-3 → full rollback; only step-1 zero maps to 409 |
| F4 | P3 | `ALREADY_DECIDED` conflates decided with cancel-won-race | **ACCEPTED.** Distinct 409 `RUN_CANCELLED` when the run reads `CANCELLED` |
| F5 | P3 | Audit atomicity unspecified | **ACCEPTED.** Audit insert is step 4 of the decide transaction |
| F6 | P3 | Redundant `@@index([runId])` | **ACCEPTED.** Dropped; unique btree's leftmost column serves it |
| F7 | P3 | No acceptance for sequential approvals | **ACCEPTED.** Two-approval decide-decide-resume case added |
| F8 | P3 | "Source pins" reading | **CONFIRMED.** Material = instruction + outcome envelopes (retrieval bound via envelopes; full provenance via `RetrievalAudit`) + version pins |

### Review 2 — 2026-10-05, CHANGES_REQUESTED, fixed 2026-10-05

**Scope.** Contract `b2272bfc` (22,112 bytes), HEAD `1afb5c1`. Seven of
eight round-1 findings verified fixed as claimed. One new finding:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| N1 | P2 | Invariant 7 contradicted invariant 4 on the cancel-won-race response code (stale pre-F4 sentence survived) | **ACCEPTED.** Invariant 7 corrected to invariant 4's code selection: 409 `RUN_CANCELLED` when the run reads `CANCELLED`, `ALREADY_DECIDED` otherwise |
| N2 | P3 | Resume path has a narrow unrecoverable strand if best-effort `job.remove()` fails while re-`add` no-ops (mirrors NF-WF-004 F2) | **OBSERVATION.** Left as-is per the NF-WF-004 precedent; the liveness acceptance assertion surfaces it in test |

### Review 3 — 2026-10-05, APPROVE

**Scope.** Contract `37a91d1a` (22,238 bytes), HEAD `1afb5c1`. Focused
re-review of N1 only: invariant 7 now matches invariant 4's code selection
and the cancel-race acceptance item exactly; all six
`RUN_CANCELLED`/`ALREADY_DECIDED` occurrences in the file are consistent;
no other section shifted meaning. Contract dispatchable.
