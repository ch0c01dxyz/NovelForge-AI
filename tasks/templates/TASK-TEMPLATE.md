# Task NF-WF-NNN: <one measurable outcome>

Status: PLANNED | READY | IN_PROGRESS | REVIEW_PENDING | CHANGES_REQUESTED | BLOCKED | VERIFIED
Milestone / capability IDs:
Implementer role / requested and resolved model:
Reviewer role / requested and resolved model:
Readiness evidence / unresolved decisions / parent acceptance owner:
Frozen review manifest / exact artifact paths and identity:
Baseline revision / local changes to preserve:
Engram checkpoint topic key / last confirmed observation reference:

## Goal and reason

State the observable result and user need. Distinguish a design contract from
an implemented feature. Do not dispatch this unfilled template.

## Required reading

- [Operating constitution](../../AGENTS.md) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- Relevant accepted ADR and exact domain specification sections.
- Existing implementation, callers, tests and preceding contract artifact.

## Dependencies and evidence

List task IDs, required contract versions, evidence links, and dispatch
blockers. A PLANNED dependency does not make this task READY.
List active issue IDs from [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
Record new technical problems/confusion there before a workaround; reference
those IDs instead of maintaining another issue description.

## Scope

Allowed paths: exact existing or proposed files/directories.
Forbidden paths: everything else, including unrelated migrations/features.
Inputs: exact type/schema/function/source versions; distinguish new contracts.
Outputs: exact type/schema/function/artifact and its consumer.
Name diagnostic/error and verification paths explicitly; "affected tests" is
not an allowed-path contract. Distinguish task readiness, reviewer verdict,
issue state and parent acceptance. A review manifest must not hash itself.
Out of scope: exclusions with a follow-up owner for retained requirements.

## Behavior and invariants

Specify happy path, invalid input, authorization/tenant boundary, missing or
stale source, retry/idempotency, concurrency, failure and cancellation as
applicable. Include context/evidence rules for AI and recoverability for
story mutations. Do not delegate architecture uncertainty to the model.

## Acceptance and verification

- [ ] Observable result through the real caller/UI/API.
- [ ] Named negative scenarios and expected results.
- [ ] Commands that exist, prerequisites, selected tests, expected outcome.
- [ ] Contract/migration/recovery checks appropriate to the change.
- [ ] Separate review of the submitted revision; findings resolved.

Record actual results separately from expectations. Zero selected tests or
skipped integration checks do not pass a capability gate.

## Migration and rollback

Address existing data, populated/empty database paths, concurrent writers,
baseline revision, deployment compatibility, and non-destructive recovery.
Write “none” only with a reason. Never silently reset an existing database.

## Documentation and handoff

Use the playbook's Engram save/recovery protocol. Include task/worktree/role,
current revision/diff, completed evidence, unfinished step, next action, issue
IDs and review state. Save at meaningful boundaries and before planned clear,
handoff or end of turn; recover and verify against the repository after reset.
If Engram fails, keep this compact handoff in the existing task/progress record
and log the problem in ISSUES-AND-GAPS.md. Never claim an unconfirmed save.

Update affected specs and CURRENT/progress/test-matrix with verified scope.
Use the [playbook handoff](../../docs/06-ai/MULTI-LLM-ORCHESTRATION.md).
List unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task. Do not claim full platform completion.
