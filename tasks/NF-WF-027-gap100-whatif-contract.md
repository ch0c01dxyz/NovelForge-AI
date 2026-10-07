# NF-WF-027 — GAP-100: What-If Live Comparison Branch Ownership Contract

Status: APPROVED (contract review round 2, 2026-10-07 — v1 CHANGES_REQUESTED 1P1+2P2+3P3, v2 APPROVE)

Task ID: NF-WF-027
Goal: Enable what-if live comparisons to configure their runs through an
explicit, author-selected isolated simulation branch — closing GAP-100.
Milestone / capability IDs: M9 (024A what-if); reuses `simulation:read` /
`simulation:manage` (no new capabilities).
Implementer role / requested and resolved model: TBD at dispatch.
Reviewer role / requested and resolved model: TBD at dispatch (separate actor).
Readiness evidence / unresolved decisions / parent acceptance owner: This
contract; GAP-100 closure check; parent coordinator acceptance.
Frozen review manifest / exact artifact paths and identity: TBD at review.
Baseline revision / local changes to preserve: `eb065cf` (post-pull).
Engram checkpoint topic key / last confirmed observation reference: TBD.

## Normative vs informative

Normative: Goal, Scope, Behavior and invariants, Acceptance and
verification, Migration and rollback. Informative: rationale, examples,
appendices.

## Goal and reason

GAP-100 (BLOCKED / P1): what-if live comparisons cannot configure their
runs. `apps/api/src/services/whatif.ts` `runComparison` creates each
021A run via `simulations.createRun()` without `branchId`; the live path
then calls `simulations.configureRun()`, which throws `NO_BRANCH`
(021A contract F3 — no auto-provisioning). HTTP/UI callers cannot supply
the evaluation-only `stubGenerator`. Every live comparison therefore
aborts.

Fix: give every what-if comparison explicit branch ownership through an
author-selected isolated simulation branch with valid checkpoint and
module prerequisites — never a silent main-branch fallback. The live path
(`configureRun` → `startRun` → `stepRun`) then succeeds on real
prerequisites, and failures are surfaced with typed errors, not silent
aborts.

This is a 024A follow-up. It does not change what-if semantics
(divergence detection, bounded cost, inspect-only); it only repairs the
live execution path's branch provisioning.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol, §13 evidence/issues).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- GAP-100 in `docs/implementation/ISSUES-AND-GAPS.md` (line 2010).
- `tasks/NF-WF-024-advanced-intelligence.md` (024A what-if section:
  goal, six pinned answers, invariants, routes, evaluation).
- `apps/api/src/services/whatif.ts` (current `runComparison` live path;
  `WhatifError` codes; Invariants 1–3).
- `apps/api/src/services/simulation.ts` (`createRun` branchId handling;
  `configureRun` prerequisites 1–4: branch, checkpoint, canon pin,
  module; `NO_BRANCH` / `NO_SNAPSHOT` / `MODULE_NOT_ENABLED`).
- `apps/api/src/whatif-routes.ts` (current HTTP surface; no
  `stubGenerator` from callers).
- `apps/api/src/services/revisions.ts` (`createBranch` — 020B branch
  provisioning; `createCheckpoint` if present).
- `docs/ideas/what-if-outline-simulation.md` (promoted idea draft;
  background only).

## Environment prerequisites

Follow `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md`. Record OS/tool
versions, service endpoints (redacted), scratch DB ownership. Use
disposable test databases for all mutation tests; never reset working
databases. The acceptance test needs a PostgreSQL with pgvector and a
fake (not stub) generation path — see Acceptance.

## Dependencies and evidence

- NF-WF-024A: IMPLEMENTED (what-if services, routes, eval harness).
- NF-WF-021A: IMPLEMENTED (run lifecycle, `configureRun` prerequisites).
- NF-WF-020B: IMPLEMENTED (`createBranch`, checkpoints, branch model).
- Active issue: GAP-100 (BLOCKED / P1) — this task is its owner.
- Related: GAP-098 CLOSED (token budget removed per author decision;
  024A's `WHATIF_MAX_TOKEN_BUDGET` bounded-execution guard is retained
  and unaffected).
- A PLANNED dependency does not make this task READY. This contract
  must be reviewed APPROVE before implementation dispatch.

## Scope

### Allowed paths

- `apps/api/src/services/whatif.ts` — branch selection, provisioning,
  run creation with `branchId`, new error codes.
- `apps/api/src/whatif-routes.ts` — `branchSelection` input on
  `POST .../whatif/comparisons`; error mapping (via existing
  platform-routes handler).
- New additive migration — `whatif_comparison.branchId` (nullable UUID,
  FK to `novel_branch`), `whatif_comparison.branchMode`
  (`'existing' | 'provision'`, nullable for pre-existing rows).
- `apps/api/src/services/revisions.ts` — only if a new checkpoint
  helper is needed for provisioning (prefer existing `createCheckpoint`
  / `createBranch` as-is).
- Tests: `apps/api/src/whatif.test.ts` (new), updates to
  `apps/api/src/whatif.eval.test.ts` only if fixtures need branch
  context (stub path unchanged).
- Web UI: what-if panel branch picker (existing vs. provision new) —
  additive; en/id; §15.
- `docs/implementation/ISSUES-AND-GAPS.md` — GAP-100 status update on
  closure only.

### Forbidden paths

- Silent fallback to the main branch (or any branch the author did not
  explicitly select). If no branch is selected, refuse — do not infer.
- Inferring live success from stub evaluations. The stub path
  (`stubGenerator`) remains test/eval-only; it must not satisfy the
  live-path acceptance.
- Changing divergence detection, token budget semantics, comparison
  lifecycle statuses, or the inspect-only invariant (no
  approve/promote).
- Modifying 021A `configureRun` prerequisites or 020B branch semantics.
- Whole-row semantic apply (GAP-101 territory) — out of scope.
- Any `apps/worker` → `apps/api/src` import (NF-WF-026 invariant).

### Inputs

- `POST .../whatif/comparisons` body gains `branchSelection`:
  ```ts
  branchSelection:
    | { mode: "existing"; branchId: string }  // author picks a branch
    | { mode: "provision" }                   // service provisions one
  ```
  Required (no default). Zod-validated at the route boundary.
- `branchId` references `novel_branch(id)`; must belong to the same
  novel + workspace (tenant gate).
- Provisioned branch name: `simulation-whatif-<comparisonShortId>`
  (matches 021A `isSimulationBranch` convention: `simulation-*` prefix).

### Outputs

- `whatif_comparison` row carries `branchId` + `branchMode`.
- `runComparison` live path creates each 021A run with the stored
  `branchId`; `configureRun` → `startRun` → `stepRun` succeed on real
  prerequisites.
- New typed `WhatifError` codes (4xx/409, mapped by the existing
  platform-routes handler). Naming rule: `WhatifError` codes are
  unprefixed (matching the existing five), EXCEPT where the code
  string collides with a `SimulationError` code — those take a
  `WHATIF_` prefix so the two layers are never confusable in
  logs/handlers. `WhatifError` (what-if validation layer) and
  `SimulationError` (021A run lifecycle) are distinct classes; a
  `SimulationError` escaping from the live run path is not silently
  converted to a `WhatifError`.
  - `MAIN_BRANCH_FORBIDDEN` (400) — selected branch is the novel's
    main branch.
  - `BRANCH_NOT_FOUND` (404) — `existing` branchId unknown or not in
    this novel/workspace.
  - `WHATIF_NO_SNAPSHOT` (409) — `existing` branch has no checkpoint;
    author must create one first (surfaced, not silently fixed).
    Variant: "simulation branch has no head revision" (canon pin
    missing — the branch exists but `headRevisionId` is null; checked
    at run-time re-verification per Invariant 3 step 4).
  - `WHATIF_MODULE_NOT_ENABLED` (409) — simulation module not enabled
    for the novel.
  - `BRANCH_PROVISION_FAILED` (409) — provisioning failed; comparison
    stays DRAFT, no partial branch left behind.
- `WhatifError` constructor update (required): extend the
  `WhatifErrorCode` union with the five new codes and update the
  `statusCode` mapping in `apps/api/src/services/whatif.ts`:
  - `BRANCH_NOT_FOUND` → 404 (alongside `COMPARISON_NOT_FOUND`)
  - `WHATIF_NO_SNAPSHOT` → 409, `WHATIF_MODULE_NOT_ENABLED` → 409,
    `BRANCH_PROVISION_FAILED` → 409 (alongside
    `INVALID_STATUS_TRANSITION`)
  - `MAIN_BRANCH_FORBIDDEN` → 400 (falls through to the existing
    default; documented here so the mapping is explicit, not
    accidental)

### Out of scope

- GAP-101 (semantic merge) — separate task, separate contract.
- Production LLM gateway credentials (author's deployment concern;
  backends MODEL_UNVERIFIED per GAP-013).
- Automatic checkpoint creation on author-selected existing branches
  (explicit author action required; surfaced as `WHATIF_NO_SNAPSHOT`).
- Deleting provisioned simulation branches after completion (they are
  kept for audit/re-run; author deletes via the normal branch flow).
- 021D Simulation Center changes (WHATIF runs stay excluded per 024A
  read-path isolation).

## Behavior and invariants

### Invariant 1 — No canon mutation (024A Invariant 1, restated)

What-if runs never enter the 008 canon pipeline, 009 memory
consolidation, or the approved manuscript. The simulation branch is
never checked out as the live branch. There is no approve/promote
operation on a comparison. The acceptance test asserts zero canon
writes during a live comparison.

### Invariant 2 — Explicit branch ownership; never silent main fallback

Every live comparison runs on a branch the author explicitly selected
(`existing`) or explicitly asked to provision (`provision`). Selecting
the novel's main branch is refused with `MAIN_BRANCH_FORBIDDEN`. A
missing `branchSelection` is `INVALID_INPUT`. No code path may
substitute main (or any other branch) silently.

### Invariant 3 — Prerequisite completeness before execution

`runComparison` live path verifies, in order, before creating runs:
1. Branch exists and belongs to the novel/workspace (`BRANCH_NOT_FOUND`
   otherwise).
2. Branch is not main (`MAIN_BRANCH_FORBIDDEN`).
3. Checkpoint exists on the branch (`WHATIF_NO_SNAPSHOT` otherwise —
   for `provision` mode the service creates branch + checkpoint
   atomically (see Invariant 5); for `existing` mode the author must
   have created one).
4. Branch has a head revision (canon pin; `WHATIF_NO_SNAPSHOT`
   variant "simulation branch has no head revision").
5. Simulation module enabled (`WHATIF_MODULE_NOT_ENABLED`).

Only then are runs created with `branchId` and driven through
`configureRun` → `startRun` → `stepRun`.

### Invariant 4 — Bounded cost unchanged (024A Invariant 3)

`maxChapters` + `tokenBudget` declared up front, explicit author
confirmation (`confirmed: true`, now covering the branch choice),
server-side enforcement. Budget exhaustion → `INCOMPLETE_BUDGET_EXHAUSTED`
(partial results, never silent truncation).

### Invariant 5 — Failure atomicity

- `provision` failure → comparison stays DRAFT; any partially created
  branch is deleted (no orphan simulation branches).
- `existing` validation failure → comparison is not created (create
  path) — fail before the row exists.
- Mid-run failure → existing ABORTED handling (comparison marked
  ABORTED with completed runIds; already in `whatif.ts`).

#### Provision transaction boundary (normative)

"Create branch + create checkpoint" MUST be atomic: either both the
`novel_branch` row and its checkpoint row persist, or neither does.

- **Mechanism (implementer choice, reviewer verifies):**
  - (A) Single `db.$transaction` wrapping both writes. Note: 020B
    `createBranch` uses the ambient `db` client; if the service
    method cannot accept a transaction client, the what-if service
    performs both Prisma writes directly inside the transaction with
    equivalent audit records.
  - (B) Sequential with try/catch: create branch, then create
    checkpoint; on checkpoint failure, delete the branch in a
    compensating delete before throwing `BRANCH_PROVISION_FAILED`.
    The comparison row is created only after both succeed.
- **Checkpoint seam constraint:** 020B `createCheckpoint` refuses a
  `branchId` that is not the checked-out branch (409
  `NOT_ON_CHECKED_OUT_BRANCH` — checkpoints capture live state, and
  live state always reflects the checked-out branch). A provisioned
  simulation branch is never checked out, so the provision path
  CANNOT use the standard `createCheckpoint` service as-is. The
  implementer must use a dedicated seam: either a new service method
  for simulation-branch checkpoints, or direct Prisma checkpoint-row
  creation inside the provision transaction (referencing the source
  revision as the pinned state) with equivalent audit. The 020B
  invariant is not weakened for the normal user-facing path.
- **Orphan mitigation:** If the compensating delete fails
  (mechanism B), or the process crashes between provision-commit and
  comparison-row creation, the orphan branch MUST NOT be silent. The
  service audit-logs the orphan (branch id, comparison attempt id)
  and `BRANCH_PROVISION_FAILED` is still thrown. Orphan candidates
  are detectable: `novel_branch` rows named `simulation-whatif-*`
  with no referencing `whatif_comparison` row. A periodic sweeper is
  out of scope; if the implementer cannot fully prevent orphans, a
  follow-up GAP is recorded — the orphan is never hidden.

### Lifecycle

1. `createComparison` (DRAFT): validate `branchSelection`.
   - `existing`: verify branch exists, not main, has checkpoint, has
     head revision, module enabled. Store `branchId`/`branchMode`.
     Requires `simulation:manage` only (no branch is created).
   - `provision`: create branch `simulation-whatif-<shortid>` from
     current main head + checkpoint, atomically per Invariant 5's
     transaction boundary (note the `createCheckpoint`
     `NOT_ON_CHECKED_OUT_BRANCH` seam constraint — the provision
     path uses the dedicated seam, not the user-facing
     `createCheckpoint` service). Store `branchId`/`branchMode`.
     Requires `simulation:manage` AND `revision:manage` (see
     Authorization). On failure, delete partial branch, throw
     `BRANCH_PROVISION_FAILED`, no row created.
2. `runComparison` (DRAFT/READY → RUNNING → COMPLETED |
   INCOMPLETE_BUDGET_EXHAUSTED | ABORTED): re-verify branch
   prerequisites (branch could have been deleted/modified since
   creation — fail fast with the typed error), create one 021A run per
   outline version with `branchId`, drive the live lifecycle per run,
   detect divergence, persist results.
3. Read paths (`list`/`get`) unchanged, plus `branchId`/`branchMode`
   in the shape.

### Authorization / tenant boundary

- `simulation:manage` for create/run (existing gate); `simulation:read`
  for list/get. Membership 404 for non-members (ADR-0004).
- **Provision mode requires BOTH `simulation:manage` AND
  `revision:manage`.** Rationale: provisioning calls 020B
  `createBranch`, which gates on `revision:manage`
  (`apps/api/src/services/revisions.ts` `createBranch`, line ~2061).
  Bypassing that gate is forbidden (§10). Introducing a
  simulation-only branch-creation seam gated on `simulation:manage`
  alone is a future ADR option, not this task. UX implication
  (documented, not hidden): an author holding `simulation:manage`
  but not `revision:manage` can use `existing` mode but receives
  403 on `provision` mode. The 403 surfaces at `createComparison`
  time (fail fast), never mid-run.
- **Existing mode requires `simulation:manage` only.** Branch reads
  (existence, checkpoint, head revision) are part of simulation
  setup; no branch is created and no `revision:manage` gate is hit.
- Q7 semantic note: `revision:manage` means "rewind story state"
  (`packages/auth/authorization.ts` — reusing it for simulations was
  ruled semantically wrong for the simulation domain). Requiring it
  for provision is gate-reuse on the branch-creation path, not a
  semantic claim: the provisioned branch is a `simulation-*` branch,
  never checked out, never rewound, never entering the canon
  pipeline. A future ADR may introduce a narrower simulation-branch
  capability; until then, the dual gate is the explicit, auditable
  choice.
- Branch must belong to the same `workspaceId` + `novelId`; cross-novel
  `branchId` → `BRANCH_NOT_FOUND` (not leaked).

### Concurrency

- Two concurrent `runComparison` calls on the same comparison: the
  existing status gate (only DRAFT/READY may run) serializes; second
  gets `INVALID_STATUS_TRANSITION`.
- Branch deleted between `createComparison` and `runComparison`:
  re-verification at run time throws `BRANCH_NOT_FOUND`; comparison
  stays DRAFT (retryable after the author fixes the branch).

## Acceptance and verification (15 checks)

- [ ] **Live two-outline comparison (service-level):** seed novel +
  workspace + 2 outline versions + simulation module enabled; create
  comparison with `branchSelection: { mode: "provision" }` and
  `confirmed: true`; run the live path (no `stubGenerator`) with a
  fake generation adapter (not the eval stub — the run must traverse
  `configureRun` → `startRun` → `stepRun`); assert status COMPLETED,
  `runIds.length === 2`, each run has the provisioned `branchId`,
  divergence points computed.
- [ ] **No canon mutation:** capture canon revision counters / covered
  table checksums before and after the live comparison; assert
  unchanged.
- [ ] **Isolation:** assert the provisioned branch name starts with
  `simulation-`, is not the main branch, and the main branch head is
  untouched; assert WHATIF runs excluded from 021D list query.
- [ ] **Existing-branch mode:** create comparison with
  `branchSelection: { mode: "existing", branchId }` on a branch with a
  valid checkpoint; live run succeeds.
- [ ] **Negative — main branch refused:** `existing` with the main
  branch id → 400 `MAIN_BRANCH_FORBIDDEN`; no comparison row created.
- [ ] **Negative — missing checkpoint:** `existing` on a branch
  without checkpoint → 409 `WHATIF_NO_SNAPSHOT`; message tells the author to
  create a checkpoint first.
- [ ] **Negative — missing branchSelection:** create without
  `branchSelection` → 400 `INVALID_INPUT`.
- [ ] **Negative — unknown branch:** `existing` with a foreign/unknown
  `branchId` → 404 `BRANCH_NOT_FOUND`.
- [ ] **Negative — module disabled:** novel without simulation module
  → 409 `WHATIF_MODULE_NOT_ENABLED`.
- [ ] **Failure recovery:** simulate provision failure (e.g., forced
  error in branch creation) → `BRANCH_PROVISION_FAILED`, comparison
  stays DRAFT (or no row), no orphan branch remains
  (`novel_branch` count unchanged).
- [ ] **Stub path regression:** `whatif.eval.test.ts` still passes
  (stub evaluations unaffected; they do not require branches).
- [ ] **Route-level:** `POST .../comparisons` with `branchSelection`
  → 201; `POST .../:id/run` live → 200 with COMPLETED; error codes
  map through the platform-routes handler (no new handler).
- [ ] **Migration:** additive migration applies on empty and populated
  DBs; existing `whatif_comparison` rows get NULL `branchId`/
  `branchMode` (their live path was already broken — documented, not
  silently repaired).
- [ ] Commands: `pnpm --filter @novelforge/api vitest run
  src/whatif.test.ts` (new), `pnpm --filter @novelforge/api vitest
  run src/whatif.eval.test.ts` (regression), `npx tsc --noEmit`
  (apps/api), `pnpm lint`.
- [ ] Separate review of the submitted revision; findings resolved.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass this gate. Do not claim live
deployment success from mocks, fake gateways, or unit tests (evidence
policy §2).

## Migration and rollback

- **Migration (additive, idempotent):** `ALTER TABLE whatif_comparison
  ADD COLUMN branch_id UUID NULL REFERENCES novel_branch(id),
  ADD COLUMN branch_mode TEXT NULL CHECK (branch_mode IN
  ('existing','provision'))`. Reviewed artifact per §10. Existing rows:
  NULL/NULL (their live path never worked — GAP-100; no backfill, no
  silent repair).
- **Rollback:** drop the two columns (data loss: only branch linkage on
  new comparisons; comparisons themselves retained). Code rollback:
  revert service + routes; `branchSelection` becomes unknown input
  (400) — acceptable for a forward-only feature repair.
- **Deployment compatibility:** old code ignores new columns; new code
  requires the migration (startup check or migration gate per project
  convention).
- **Concurrent writers:** branch provisioning uses a unique name
  (`simulation-whatif-<comparisonId-short>`); collision → retry with
  suffix or `BRANCH_PROVISION_FAILED` (no silent overwrite).

## Handoff

- Owner: NF-WF-027 implementer (to be dispatched after contract
  review).
- Reviewer: separate actor (contract review first, then diff review).
- Handoff evidence: this contract file, GAP-100 text, `whatif.ts` /
  `simulation.ts` / `whatif-routes.ts` current revisions, 024A contract
  section.
- New technical problems go to `docs/implementation/ISSUES-AND-GAPS.md`
  (new GAP IDs) before any workaround — per §13, single register.
- Respect recorded scope decisions, including GAP-098 (do not revive
  the removed TokenBudget tracker).
