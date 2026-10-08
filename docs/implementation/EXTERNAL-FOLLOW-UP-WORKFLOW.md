# NF-WF-047: External Follow-up Implementation Plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` when installed. Otherwise execute the same
> task-by-task gates through the project's Multi-LLM Implementation Playbook;
> no additional harness plugin is a prerequisite.

**Goal:** reconcile remaining evidence, repair proven test-environment defects,
and prepare release evidence without making the author's product or deployment decisions.

**Architecture:** reuse existing services, tests, migrations and runbooks. A
coordinator owns shared records; bounded workers submit independently reviewed
artifacts. Product proposals and missing-input investigations cannot masquerade
as implemented fixes.

**Tech stack:** the repository-pinned Node/pnpm toolchain, TypeScript, Vitest,
PostgreSQL with pgvector, Redis and Nuxt. Ubuntu uses native services, without Docker.

**Spec:** [delivery plan](DELIVERY-PLAN.md), [current evidence](../14-progress/CURRENT.md),
[issue register](ISSUES-AND-GAPS.md), and [implementation playbook](../06-ai/MULTI-LLM-ORCHESTRATION.md).

Status: PLANNED execution package; a reviewed plan is not implementation evidence.
Plan review: APPROVE on 2026-10-07 by the separate `review_mutations_034`
actor; reviewed artifacts are this workflow and its START-HERE/CURRENT/
DELIVERY-PLAN pointers. This does not replace individual child contract reviews.
Baseline: accepted integration `6bfe1df`. Fetch current `main`, verify this commit
is an ancestor, and record the actual execution baseline and local changes.
Owner: external coordinator actor `047-coordinator`; parent acceptance: local author.
Child owners: `047A-implementer` through `047F-implementer`.
Separate child reviewers: `047A-reviewer` through `047F-reviewer`.
These are intended role assignments, not claims that workers have been dispatched.
Record actual actor/session handles and requested/resolved models before dispatch;
unknown serving identities remain `MODEL_UNVERIFIED`.
Engram topic: `novelforge-ai/nf-wf-047/<child>/<role>`; no save is claimed by this plan.

## Resume boundary — accepted integration, 2026-10-08

Latest accepted documentation: isolated-smoke submission `9fe1443`.
D's missing-input receipt and E's corrected procedure/reported rerun now
exist on main. The previous dispatch paragraph below is historical; do not
recreate these outputs. Resume only the unresolved GAP-018 input and GAP-117
evidence-acceptance steps listed in CURRENT. Documentation review does not
close either runtime gate or authorize deployment.

Submission `89d57f5` is integrated with author acceptance. A/B audit and
amendment, C's reviewed parser repair and F's decision brief are complete
within their bounded scopes. Do not replay the original launcher below.
C's local receipt is32/32 scoped tests plus API typecheck and affected-file
lint; E's larger Ubuntu receipt is reported evidence, not a fresh local rerun.

Resume with D's missing-input receipt (no populated-upgrade closure without
the authorized sanitized dump) and a separately reviewed E scope amendment
for GAP-117: the earlier smoke drained shared Redis jobs and cannot establish
owned queue isolation. Rerun only the affected worker smoke against verified
dedicated native Redis and scratch PostgreSQL resources; freeze exact config,
job, log and cleanup ownership before starting workers. Keep SCALE/quota,
human accessibility, live credentials and production decisions local.
Prepare a new work branch from current main, submit independently reviewed
receipts and push for local acceptance. Do not merge main externally.

## Global constraints

- Read START-HERE and one operating constitution. Write project artifacts,
  task contracts, prompts and commit/PR descriptions in English. UI remains
  localized through `en`/`id` resources and English fallback.
- Follow [environment preflight](../11-deployment/ENVIRONMENT-PREFLIGHT.md).
  Install only missing Ubuntu prerequisites natively; never install Docker.
  Windows reuses existing Docker services and preserves their data.
- Tests, migration reproduction and drills use owned disposable databases,
  queues, ports and storage. Never reset a shared database or flush shared Redis.
- The author retains SCALE/quota decisions, human screen-reader acceptance,
  live credentials, local Engram hook configuration and production deployment approval.
- Keep one writer per file. Separate actors review exact submitted diffs.
  Self-review, changing roles, or `/clear` does not establish independent review.
- Use no more workers than independent tasks justify. Up to ten actors may be
  available; five are sufficient for the first parallel wave, including coordinator
  and reviewer. A reviewer handles submissions sequentially and never reviews its own work.
- Preserve historical evidence. Do not recreate completed NF-WF-041–046 work
  or the author-removed GAP-098 cost tracker.
- No new architecture, dependencies, production features or historical migration
  edits are authorized by a diagnostic task. Escalate conflicts with evidence.

## Review focus

1. A stale OPEN label must not trigger reimplementation of a working feature.
2. A missing dump or credential is BLOCKED, not a passing migration/live test.
3. Environment variables, working directories and parallel workers may disagree;
   reproduce the source of a failure before editing a loader or resetting credentials.
4. A successful empty-database migration does not prove populated upgrade safety.
5. A mock gateway, axe suite or 300-chapter fixture does not establish live-provider,
   human screen-reader or 2,500-chapter acceptance.

## Dispatch and ownership

The coordinator creates each child's contract from
[TASK-TEMPLATE](../../tasks/templates/TASK-TEMPLATE.md) at the exact task path below.
Fill required reading, dependency receipts, input/output versions, allowed paths,
negative checks, commands/prerequisites, migration/rollback effects, roles and
handoff identity. Freeze the contract commit and obtain separate review before
marking a child READY. Routine reviewed work proceeds within this scope;
unresolved product/architecture decisions stay blocked.

| Child | Contract/output path | Dependency and initial state |
| --- | --- | --- |
| 047A | `tasks/NF-WF-047A-gap-evidence-audit.md` | First; prepare and review contract before dispatch |
| 047B | `tasks/NF-WF-047B-fixture-contract-amendment.md` | After A confirms GAP-042 remains unresolved |
| 047C | `tasks/NF-WF-047C-test-environment-stability.md` | After A confirms GAP-081/082 dispositions |
| 047D | `tasks/NF-WF-047D-populated-upgrade-safety.md` | Diagnosis conditional on an authorized sanitized dump; otherwise BLOCKED |
| 047E | `tasks/NF-WF-047E-native-release-preparation.md` | Runtime evidence after accepted C/D changes, or explicitly limited when D is blocked |
| 047F | `tasks/NF-WF-047F-scale-quota-proposals.md` | Proposal-only after A; implementation BLOCKED on local decisions |

Only `047-coordinator` writes ISSUES-AND-GAPS, CURRENT, DELIVERY-PLAN,
START-HERE and this workflow during external execution. Workers report findings
to the coordinator; the coordinator records issue IDs **before** affected
workarounds or completion claims. Workers may write their own task receipts.
Reviewer findings remain in the owning task, referencing the single issue register.

Use isolated worktrees for workers. Serialize all API/E2E suites that share
hardcoded scratch database names, and serialize migration/drill workloads.
Do not assume distinct worktrees isolate PostgreSQL or Redis. The coordinator
owns a runtime test schedule; use scoped queues/keys and inspect test prerequisites.

## 047A — Reconcile the remaining evidence

Milestone: M0/M8; capabilities: CAP-01–21 evidence maintenance.
Inputs: current issue entries, capability ledger, task receipts, code and Git history.
Required reading: CURRENT, ISSUES-AND-GAPS, DELIVERY-PLAN and referenced task receipts.
Allowed writes: own contract/report only; shared-record changes go through the coordinator.
Forbidden: production code, migrations, historical receipt rewriting and unsupported closures.

- [ ] Compare each currently unresolved label with the latest verified receipt.
  Inspect later updates before interpreting an initial register row as current.
- [ ] Produce a disposition table: issue/capability, current source or receipt,
  actual remaining work, owner/dependency, and closure evidence or UNKNOWN.
- [ ] Check GAP-013/014/018/021/023/027/042/081/082/084/090 explicitly;
  also inspect other unresolved entries rather than declaring this list exhaustive.
- [ ] Separate real missing behavior from documentation debt and host-specific observations.
- [ ] Preserve GAP-023's no-consumer constraint: no speculative outbox implementation.
- [ ] A separate reviewer challenges proposed closures and scope reductions.

Acceptance: every proposed closure has an exact receipt and resolved review;
unknowns stay open. Do not fabricate runtime results during a source-only audit.
Checks: `git diff --check`, referenced path/commit checks, and source/caller inspection.
Migration/rollback: none; documentation only, reverted by a normal Git revert.

## 047B — Amend GAP-042 without changing fixture semantics

Milestone: M3/M8; capability: CAP-20 contract accuracy.
Read: GAP-042, NF-WF-011 Invariant3, `long-novel.fixture.ts` and
`long-novel.measure.test.ts` under `apps/api/src/e2e/`.
Allowed writes: own contract and `tasks/NF-WF-011-author-preview-e2e.md` only.
Output: dated amendment explicitly superseding the exact-30 claim with at least
30 revisions, preserving attribution through real mutations and recording actual counts.

- [ ] Preserve the original invariant as historical text with a supersession reference.
- [ ] Reconcile the misleading "10 chapters per revision" explanation and
  `30 revisions × 7 scopes` rationale with the actual minimum/measurement semantics.
- [ ] Verify the existing guard refuses counts below `FIXTURE_REVISIONS`;
  do not remove revision writes, lower the floor, reduce the dataset or invent a count.
- [ ] Separate review confirms this amendment does not weaken temporal/recovery evidence.

Checks: source inspection and `git diff --check`; rerun
`pnpm --filter @novelforge/api exec vitest run src/e2e/long-novel.measure.test.ts --no-file-parallelism`
only if fresh runtime fixture evidence is required. Record selection, prerequisites and results.
Migration/rollback: none; documentation only. Code changes need a separately reviewed scope amendment.

## 047C — Diagnose and repair test-environment instability

Milestone: M8; capability: CAP-19 repeatable test setup.
Inputs: GAP-081/082, current environment preflight, API test loaders and database preparation scripts.
Initial allowed writes: own contract/diagnostic receipt only. Read all loaders/callers
found by `rg`, including `selective-restore.test.ts`, `branches.test.ts`, API/E2E
setup and `packages/database/scripts/prepare-test-db.ts`.

- [ ] Reproduce with sanitized host metadata: repository/package cwd, variable
  absent, explicit valid variable, stale/invalid variable, and placeholder `.env`.
  Never print connection strings or alter credentials to hide a loader defect.
- [ ] Distinguish OBSERVED failure from historical hypotheses about password resets.
  A stable explicit-export workaround is not proof of a corrected loader.
- [ ] If not reproducible, report the checked matrix and limitation; do not invent a fix.
- [ ] If reproducible, identify the responsible shared layer and all consumers.
  Freeze exact implementation/test paths in the same child contract; separate review
  precedes edits. Make the smallest fix, preserving host policy and scratch safety.
- [ ] Run regression negatives: a missing/invalid connection must fail clearly,
  must not silently select a live database, and must not leak secrets.

Runtime checks use the named affected test files after the scope is frozen;
examples already exist: `pnpm --filter @novelforge/api exec vitest run src/selective-restore.test.ts src/branches.test.ts --no-file-parallelism`.
After a fix, run API typecheck and lint. No blanket test-directory write access.
Migration/rollback: no product migration; retain previous loader behavior by Git revert
and documented explicit host configuration. Never delete `.env` or rewrite shared credentials.

## 047D — Prove populated-upgrade safety

Milestone: M8; capabilities: CAP-03/19; owner issue: GAP-018.
Inputs: an authorized sanitized dump, its hash/migration ledger, repository migrations,
and an empty-database comparison. Without the dump, output a precise missing-input
receipt and continue independent children; synthetic tests cannot close the historical gap.
Allowed initial writes: own diagnosis/remediation-plan receipt only.
Read: GAP-018, backup/restore runbook, Prisma configuration/schema and
`20260930_phase6_evidence_fk_hardening/migration.sql`.

- [ ] Record source-dump provenance without publishing private data or the dump.
- [ ] Reproduce only in disposable databases; inspect the two RESTRICT foreign keys
  before and after failed deploy and any historical resolve workaround.
- [ ] Compare migration ledgers, schema and orphan checks with an empty-schema deploy.
- [ ] Propose a repair that preserves already-applied migration checksums, data and
  evidence constraints. A new migration alone cannot bypass an earlier failing migration.
- [ ] Freeze reviewed SQL/runbook/test paths before any repair. Do not edit historical
  migration files or run `migrate resolve --applied` merely to make a receipt green.
  An architecture/history-policy conflict requires an ADR recommendation to the local owner.
- [ ] Verify populated and empty upgrades, both citation-delete refusals, source
  orphan checks and a schema comparison with explained environment-only differences.

Commands: use the existing `pnpm --filter @novelforge/database db:deploy` only
with a verified disposable DATABASE_URL; `pg_dump`, `pg_restore` and `psql`
operate on recorded owned targets. A failure receipt is retained, not counted as PASS.
Rollback: retain an untouched source copy and pre-repair scratch backup; rehearse
recovery there. Production repair/deployment remains local-author controlled.

## 047E — Prepare native release evidence

Milestone: M8; capabilities: CAP-19/20; no production acceptance authority.
Read: DEPLOYMENT, ENVIRONMENT-PREFLIGHT, BACKUP-RESTORE-RUNBOOK, package scripts,
and NF-WF-023 release contracts. Allowed writes: own receipt and proposed runbook
amendments in that receipt; the coordinator owns shared documentation edits.

- [ ] Record Ubuntu/tool/service versions, safe local endpoints and scratch ownership.
- [ ] Reuse compatible services; install missing native prerequisites only.
- [ ] Verify lint, API/worker/web types and builds, selected workers and API/web suites.
- [ ] Exercise scratch backup/restore and production-start smoke on private local
  endpoints with dedicated test configuration. Mock LLM calls are explicitly MOCK evidence.
- [ ] Identify live-provider, author budget, target-scale, human and deployment gates
  that remain unavailable. A 300-chapter fixture is not mission-scale acceptance.
- [ ] After integration, rerun applicable checks once on the final code revision;
  retain failed attempts and mark blocked/skipped checks explicitly.

Existing command inventory (inspect current package scripts before execution):

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm --filter @novelforge/api typecheck
pnpm --filter @novelforge/worker typecheck
pnpm --filter @novelforge/web typecheck
pnpm --filter @novelforge/api build
pnpm --filter @novelforge/worker build
pnpm --filter @novelforge/web build
pnpm --filter @novelforge/api exec vitest run --no-file-parallelism
pnpm --filter @novelforge/worker exec vitest run --no-file-parallelism
pnpm --filter @novelforge/web test
```

Use actual configured startup commands/endpoints from the deployment docs and
scripts; inspect health/authentication semantics before declaring smoke PASS.
Do not use root `--passWithNoTests` as proof of suite execution. The current
`scripts/verify-clone.sh` ends with a Docker check; it is not a native-Ubuntu
acceptance runner. Use the explicit native checks above and reference GAP-027;
do not silently skip that script's failing stage and claim it passed.
Migration/rollback: disposable drills only; no production migration/deployment.

## 047F — Research SCALE and quota options, without selecting policy

Milestone: M3/M5/M8; capabilities: CAP-06/14; owner issues: GAP-039/063.
Allowed writes: own proposal/contract only. Read final-text-review, narrative policy,
gateway adapter/management callers and the relevant database models/specifications.

- [ ] Trace SCALE validation and final-review consumers; distinguish declared
  standing, extracted claim and author-approved proposal sources.
- [ ] Propose concrete alternatives with verdict behavior, provenance, stale-version
  handling, HARD/SOFT implications, authorization and negative acceptance cases.
- [ ] Trace quota sources available through existing gateway interfaces. Separate
  provider quota observations from local token budgets and author-removed GAP-098.
- [ ] Define unknown/unavailable, freshness/reset windows, gateway/model scope,
  permissions and UI behavior without inventing provider APIs or live credentials.
- [ ] Recommend one option for each issue with evidence and tradeoffs. Cite official
  external documentation if needed; unverified support stays UNKNOWN.

Acceptance: a reviewed decision brief suitable for the local author, not a CLOSED
implementation gap. No schema, adapter, API/UI or policy changes. After a local
decision is recorded, create a separate bounded implementation contract.
Migration/rollback: none for proposals; disclose possible effects of each option.

## Execution order and completion gates

1. **Preflight:** verify Git state, baseline, actual runtime/tool access and Engram
   registration. Create `work/nf-wf047-external-follow-up`; preserve local edits.
2. **Audit first:** prepare/review/execute 047A. Coordinator applies separately
   reviewed dispositions to shared records, retaining historical context.
3. **Parallel wave:** B amendment, C diagnosis and F proposals can proceed in
   separate worktrees with a shared reviewer. D diagnosis runs only if its dump
   is available; serialized database ownership still applies.
4. **Bounded repairs:** freeze C/D exact scopes from discoveries, review contracts,
   execute authorized fixes and obtain independent exact-diff review. Missing inputs
   block those children only; do not broaden another child to absorb them silently.
5. **Release preparation:** E verifies the integrated candidate after relevant fixes.
   If D is blocked, clearly label populated-upgrade evidence BLOCKED rather than
   claiming the overall release ready. Product proposal decisions remain local.
6. **Handoff:** coordinator records final base/head, manifest, actor separation,
   commands/results, issue dispositions, migration risks and pending local actions.
   Commit and push the reviewed work branch; do not merge to main or deploy.

At meaningful boundaries, before reset and at final handoff, save compact Engram
checkpoints only under the authoritative current runtime binding and confirm success.
If unavailable, report/update GAP-021 and save the fallback in the owning task;
never invent/reuse a session ID or claim automatic `/clear` capture. After reset,
read the relevant checkpoint, then verify Git/contracts/files before resuming.

Final manifest lists exact artifact paths and commit/blob identities without
self-hashing. Distinguish reviewed proposals, verified fixes, blocked checks and
author acceptance. Changed source/test code invalidates review of affected portions.

## Launcher prompt

```text
Execute NF-WF-047 from docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md.
Read START-HERE.md, one constitution, CURRENT.md and the evidence policy first.
Verify current main contains 6bfe1df, record the actual baseline, and create
work/nf-wf047-external-follow-up without discarding local work.

Start with 047A. Prepare each child contract from TASK-TEMPLATE, assign actual
separate implementer/reviewer actors, and review/freeze it before dispatch.
Then run independent B/C/F work in isolated worktrees; D requires an authorized
sanitized dump. Serialize shared-database tests. Up to ten actors are available;
use only those justified by independent work. Follow native Ubuntu preflight;
do not install Docker.

Write project artifacts in English. Apply MODEL-EVIDENCE-POLICY: verify callers,
record problems in ISSUES-AND-GAPS through the coordinator, preserve failed
receipts, and never treat missing/skipped checks as passing. Use Engram with
the confirmed runtime binding; otherwise document GAP-021 and a task fallback.

Keep SCALE/quota decisions, human screen-reader acceptance, live credentials,
local harness changes and production deployment with the author. Complete
ready independent tasks, obtain exact-diff review, verify the final candidate,
and commit/push the work branch with a concise handoff. Do not merge main.
```
