# Task NF-WF-047E: Native Release Preparation (limited — 047D blocked)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE, 1 P3 process note non-blocking)
Milestone / capability IDs: M8 / CAP-19 (repeatable test setup), CAP-20 (release evidence)
Implementer role / requested and resolved model: (to be assigned — separate actor from contract author and reviewer)
Reviewer role / requested and resolved model: (to be assigned — separate actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: 047D is BLOCKED (no authorized sanitized dump available per workflow 047D section); 047E runs in its explicitly limited form. Parent coordinator `047-coordinator`; parent acceptance: local author. No production acceptance authority is claimed or delegated by this task.
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch; a review manifest must not hash itself)
Baseline revision / local changes to preserve: branch `work/nf-wf047-external-follow-up` at current HEAD (verify before dispatch); preserve existing local changes; do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference: `novelforge-ai/nf-wf-047/047E/<role>`; confirm save success; if unavailable, report GAP-021 and keep the fallback in this task file.

## Goal and reason

Produce **native release-preparation evidence** — not a release decision —
for the integrated candidate on Ubuntu, in the explicitly limited form the
workflow defines for when 047D is blocked: "Runtime evidence after accepted
C/D changes, or explicitly limited when D is blocked."

This is a design contract for an evidence-gathering task, not an
implementation task and not a release gate. The observable result is a
receipt that (a) records the native environment and build/typecheck/test
outcomes, (b) exercises scratch backup/restore and a production-start
smoke on private local endpoints, and (c) **explicitly names every gate
that remains unavailable** rather than implying readiness by omission.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10, §12, §13) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [External follow-up workflow](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md) — 047E section, Global constraints, Review focus, Execution order, 047D section.
- [Environment preflight](../11-deployment/ENVIRONMENT-PREFLIGHT.md).
- [Deployment](../11-deployment/DEPLOYMENT.md) — M8 production release evidence section.
- [Backup/restore runbook](../11-deployment/BACKUP-RESTORE-RUNBOOK.md).
- [NF-WF-023 release contracts](../implementation/023C-battery-report.md) (release evidence structure precedent).
- [047C diagnostic receipt](../../tasks/NF-WF-047C-diagnostic-receipt.md) — DATABASE_URL loader behavior and the shared resolver (`apps/api/src/test-utils/resolve-test-database-url.ts`).
- [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md) — GAP-027 (verify-clone Docker check), GAP-018/047D (populated upgrade), GAP-051 (human screen-reader), GAP-039/063 (author SCALE/quota decisions).

## Environment prerequisites

Follow ENVIRONMENT-PREFLIGHT.md. Ubuntu native only — **no Docker** (per
workflow global constraints). Record actual versions, not assumed ones:

- OS/arch, Node, pnpm (`pnpm --version`, `node --version`)
- PostgreSQL + pgvector (`pg_lsclusters`, `SELECT extversion FROM pg_extension WHERE extname='vector'`)
- Redis (`redis-cli ping`, `redis-server --version`)
- Safe local endpoints actually bound (redact nothing that is already
  private; never print credentials or connection strings)
- Scratch ownership: named disposable databases (`novelforge_test_*`),
  queues/keys and ports owned by this task; never reset a shared database
  or flush shared Redis (workflow global constraint)

Database access uses the 047C shared resolver
(`apps/api/src/test-utils/resolve-test-database-url.ts`) or an explicit
valid `DATABASE_URL` export. If the loader misbehaves, reproduce per the
047C D1–D6 matrix and record through the coordinator (new GAP if proven) —
do not silently work around it and claim the checks passed.

## Dependencies and evidence

- **047D: BLOCKED.** No authorized sanitized dump is available. Populated-upgrade
  evidence is therefore BLOCKED, not absent-by-oversight; the receipt must
  label it BLOCKED explicitly. Synthetic or empty-database migration success
  does not substitute (workflow review focus #4).
- **047C:** accepted changes (shared test DATABASE_URL resolver) are the
  runtime basis for this task's database access. Record the 047C commit.
- **047A/047B/047F:** no implementation dependency; their dispositions inform
  which gates are documented as unavailable (SCALE/quota proposals are
  author-decision inputs, not release evidence).
- Active issue IDs: GAP-018 (populated upgrade, owner GAP for the 047D
  block), GAP-027 (verify-clone Docker check is not native acceptance),
  GAP-051 (human screen-reader gate), GAP-039/063 (author SCALE/quota
  decisions). Record new technical problems in ISSUES-AND-GAPS through the
  coordinator **before** any workaround; reference those IDs instead of
  maintaining another issue description.

A PLANNED dependency does not make this task READY. This task is READY only
after separate contract review (APPROVE) per the workflow dispatch table.

## Scope

Allowed paths:
- This contract: `tasks/NF-WF-047E-native-release-preparation.md`
- Own receipt: `docs/implementation/047E-native-release-receipt.md`
  (created by the implementer; proposed runbook amendments live in the
  receipt — the coordinator owns shared-doc edits)
- Test execution only: existing suites, drills and smoke checks named
  below. No source, test, migration, config or runbook edits.

Forbidden paths: everything else, including production code, migrations,
historical migration files, `.env`/credentials, shared records
(ISSUES-AND-GAPS, CURRENT, DELIVERY-PLAN, START-HERE, the workflow doc —
coordinator-owned), and any deployment execution.

Inputs: repository at the frozen baseline revision; package scripts as
currently configured (inspect before execution — see command inventory);
`BACKUP-RESTORE-RUNBOOK.md` drill procedure; DEPLOYMENT.md M8 evidence
list (used as a checklist, not as a claim of coverage).

Outputs: the receipt with environment record, per-command results,
drill evidence, smoke evidence, the explicit unavailable-gate list, and
proposed runbook amendments (if any).

Out of scope (with follow-up owner):
- Populated-upgrade evidence — BLOCKED, owner: whoever provides an
  authorized sanitized dump (047D).
- Live-provider behavior — unavailable, owner: author (live credentials).
- 2,500-chapter / mission-scale acceptance — unavailable; the
  300-chapter fixture is explicitly not mission-scale evidence
  (workflow review focus #5). Owner: author.
- Human screen-reader acceptance (GAP-051) — unavailable, owner: author.
- Production deployment approval and execution — owner: author.
- SCALE/quota policy selection (GAP-039/063) — proposal-only under
  047F, decision owner: author.

## Behavior and invariants

**Happy path:** the receipt records a complete native evidence set —
environment, builds, typechecks, suites, drill, smoke — each with command,
revision, exit code, counts and duration; unavailable gates are named;
the reviewer approves the exact receipt.

**Command inventory** (inspect current package scripts before execution;
do not assume these strings are current):

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

Note: `@novelforge/api` `build` is `tsc --noEmit` (typecheck, not a
bundle); `@novelforge/web` `build` is `nuxt build`. Record what each
command actually does — do not label a typecheck a "build".

**Suite selection:** run the API suite, worker suite and web suite in
full unless the receipt justifies a named selection with reason. Do NOT
use root `vitest run --passWithNoTests` as proof of suite execution
(workflow 047E). Serialize suites that share hardcoded scratch database
names (workflow dispatch section); never run two suites against the same
scratch DB concurrently.

**Backup/restore drill:** follow `BACKUP-RESTORE-RUNBOOK.md` §1–§3
against scratch databases only: `pg_dump -Fc`, restore into a fresh
empty database, row-count parity per table, app boot against the
restored DB with `/ready` → 200, and the pinned key-query set.
Record dump size, migration count, table parity (n/n) and probe results.

**Production-start smoke:** use the actual configured startup commands
(`pnpm --filter @novelforge/api start`, `pnpm --filter @novelforge/worker start`)
with a **dedicated test configuration** on **private local endpoints**
(loopback only; no externally reachable ports). Inspect health/readiness
semantics (`/ready`, `/health`) before declaring smoke PASS. The worker
must be observed processing at least one queued job (BullMQ) or the
smoke is incomplete — record which. Any LLM call during smoke is
**explicitly MOCK evidence**; label it as such in the receipt.

**GAP-027:** `scripts/verify-clone.sh` ends with a mandatory Docker
check. On native Ubuntu this check cannot pass and must NOT be used as
native acceptance. Reference GAP-027 in the receipt; do not silently
skip the script's failing stage and claim it passed (workflow 047E).

**Failure handling:** retain failed attempts in the receipt — a failed
attempt is evidence, not a non-event. A transient flake may be retried
once with the failing test identified; a second failure is a real
failure. Missing, skipped or blocked checks are labeled as such and
never counted as passing (evidence policy).

**After integration:** rerun applicable checks once on the final code
revision; retain the pre-integration attempt records alongside the
final ones; mark any check that cannot rerun as blocked/skipped with
reason. Historical results are not evidence for the revised code.

## Acceptance and verification

- [ ] Environment record: OS/arch, Node, pnpm, PostgreSQL+pgvector,
      Redis versions; safe local endpoints; scratch ownership named.
- [ ] `pnpm lint` exit 0 (record duration).
- [ ] API/worker/web typechecks exit 0 (record which script each ran).
- [ ] API/worker/web builds executed; what each produced recorded
      honestly (typecheck vs bundle).
- [ ] API suite, worker suite, web suite executed per the inventory;
      file/test counts, skips and failures recorded; no
      `--passWithNoTests` masquerading as execution.
- [ ] Scratch backup/restore drill per the runbook: dump size,
      migration count, table parity n/n, `/ready` 200 on restored DB,
      pinned key-query parity.
- [ ] Production-start smoke on private local endpoints with dedicated
      test config: API `/ready`+`/health`, worker job observed;
      any LLM call labeled MOCK.
- [ ] Unavailable gates listed explicitly: populated-upgrade (BLOCKED
      per 047D/GAP-018), live-provider, author budget, target-scale
      (300-chapter fixture ≠ mission-scale), human GAP-051, deployment
      approval, SCALE/quota decisions (GAP-039/063).
- [ ] GAP-027 referenced; `verify-clone.sh` Docker check explicitly not
      claimed as native acceptance.
- [ ] Failed attempts retained; blocked/skipped checks labeled.
- [ ] After integration: applicable checks rerun once on the final
      revision; both attempt records retained.
- [ ] Separate review of the submitted receipt; findings resolved.
- [ ] No release-readiness claim appears anywhere in the receipt.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

No migration. No production database touched; drills use disposable
scratch databases only; restore targets are fresh empty databases per
the runbook (never over a live database). Rollback: delete scratch
databases/queues created by this task; the receipt is reverted by a
normal Git revert. No deployment is performed, so no deployment
rollback is needed.

## Documentation and handoff

Use the playbook's Engram save/recovery protocol under
`novelforge-ai/nf-wf-047/047E/<role>`; confirm save success. Include
task/worktree/role, current revision/diff, completed evidence,
unfinished step, next action, issue IDs and review state. Save at
meaningful boundaries and before planned clear, handoff or end of
turn; recover and verify against the repository after reset. If Engram
fails, keep the compact handoff in this task file and log the problem
in ISSUES-AND-GAPS.md through the coordinator. Never claim an
unconfirmed save.

The receipt (`docs/implementation/047E-native-release-receipt.md`) is
the handoff artifact: environment record, per-command evidence table,
drill evidence, smoke evidence, unavailable-gate list, proposed runbook
amendments (if any), unknowns, blocked checks, and the explicit
statement that this is preparation evidence, not a release decision.
List observed versus inferred findings, risks, and the next
dependency-ready task (047E rerun after integration, per the workflow).
Do not claim full platform completion.

Unknowns (to be resolved or recorded by the implementer):
- Whether the worker suite has environment-sensitive tests on this
  host (record selection and any skips with reason).
- Whether the production-start smoke's worker job observation needs a
  seeded queue entry (record the mechanism used).
- Any deviation between the workflow's command inventory and current
  package scripts (record actuals).
