# Task NF-WF-047D: Populated-Upgrade Safety (GAP-018) — Missing-Input Receipt

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: BLOCKED (no authorized sanitized dump available; contract reviewed
APPROVE 2026-10-08, no findings — missing-input receipt accepted)
Milestone / capability IDs: M8 / CAP-03 (populated upgrade), CAP-19
Implementer role / requested and resolved model: not dispatched — blocked on
missing input (no implementation authorized without the dump)
Reviewer role / requested and resolved model: separate subagent actor to
review this missing-input receipt; serving identity MODEL_UNVERIFIED per
GAP-013
Readiness evidence / unresolved decisions / parent acceptance owner: parent
coordinator `047-coordinator`; parent acceptance: local author. The populated
upgrade cannot be proven safe without the author's sanitized dump.
Frozen review manifest / exact artifact paths and identity: this contract
file only (missing-input receipt; no implementation artifacts)
Baseline revision / local changes to preserve: branch
`work/nf-wf047-isolated-smoke` from `87fea3c` (origin/main tip, verified).
Do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference:
`novelforge-ai/nf-wf-047/047D/<role>`; Engram MCP is UNAVAILABLE on this
host (GAP-021) — fallback records kept in this task file; no session ID
invented.

## Goal and reason

Prove populated-upgrade safety for GAP-018 (the `20260930_phase6_evidence_fk_hardening`
migration partially applies on a populated database, permanently stripping two
RESTRICT constraints). This contract records the BLOCKED state: the required
input is missing, so no populated-upgrade evidence is claimed.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10, §12, §13) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [External follow-up workflow](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md) — 047D section and Resume boundary (2026-10-08).
- [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md) — GAP-018 row.
- [Backup/restore runbook](../11-deployment/BACKUP-RESTORE-RUNBOOK.md).

## Missing input (exact)

The 047D diagnosis requires an **authorized sanitized dump**: a PostgreSQL
dump of a populated database whose `_prisma_migrations` ledger matches the
repository's migration set, sanitized of private data, explicitly authorized
by the local author for this investigation.

**Status 2026-10-08:** no such dump is available on this host. Checked:
`/tmp/*.dump`, `/tmp/*.sql`, `~/workspace` for sanitized/dump artifacts —
none found. The historical `.local-backup-novelforge-dev-20261002.sql`
referenced in GAP-018 is not present on this host and predates the current
migration set (40 migrations vs the dump's 10).

## What this BLOCKED state means

- GAP-018 remains OPEN. The partial-apply mechanism (two leading
  `DROP CONSTRAINT` statements commit, then `CREATE INDEX` fails) is
  DOCUMENTED from the GAP-018 row, not re-proven here.
- **Synthetic fixtures cannot close this gap.** An empty-database migration
  or a synthetic populated fixture does not reproduce the historical
  ledger mismatch and proves nothing about the production upgrade path.
  No synthetic evidence is claimed as populated-upgrade acceptance.
- The known workaround (`prisma migrate resolve --applied
  20260930_phase6_evidence_fk_hardening`) is documented to cost the two
  RESTRICT constraints; any receipt built on it is not a faithful
  post-deploy schema.

## Scope

Allowed paths: this contract file only.
Forbidden: every other file, including migrations, historical migration
edits, `prisma migrate resolve` invocations against any database, and any
synthetic populated-upgrade demonstration presented as gap closure.

## Independent work that continues

D's blocked state blocks only D. Per the workflow resume boundary, the
following proceed independently: the 047E GAP-117 isolated worker-smoke
follow-up (separately reviewed scope amendment), and the author's local
product decisions (GAP-039/063), human GAP-051, live credentials, and
deployment approval.

## Acceptance

- [x] This missing-input receipt is independently reviewed (APPROVE —
  2026-10-08, separate reviewer actor, no findings; backends
  MODEL_UNVERIFIED per GAP-013).
- [x] GAP-018 recorded as BLOCKED with the exact missing input (coordinator-owned register).
- [x] No populated-upgrade claim appears anywhere in this task's output.
- [x] Unblock condition stated: author provides an authorized sanitized dump
      whose `_prisma_migrations` matches the repository's 40 migrations.

## Checkpoint (Engram unavailable — GAP-021)

Fallback checkpoint: 047D contract drafted 2026-10-08 as missing-input
receipt. No dump available; GAP-018 BLOCKED. Independent review
completed 2026-10-08: APPROVE, no findings.
