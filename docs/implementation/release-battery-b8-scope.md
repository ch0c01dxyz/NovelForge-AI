# Batch 8 Scope C — release-battery-b8 named scope (coordinator-filed 2026-10-14)

Status: SCOPE FILED, NOT EXECUTED. Execution is a separate dispatch decision (battery takes >1h; running it unrequested would exceed this batch's mandate). This file records the named scope so the next dispatch can execute it verbatim.

Source: read-only mapping by RelVerifyMap scout (evidence inventory of 16 criteria). Full inventory preserved in session artifact agent://RelVerifyMap.

## Identity
HEAD `50609c0d2704380ac2b48fa5eb01164fe8e858ca` + sha256 per working-tree artifact changed since 712cca6. Commit not authorized/required (local evidence standard, START-HERE correction 2026-10-14).

## Genuinely missing criteria (why a battery is owed)
- Last full battery evidence is 712cca6 (NF-WF-039 receipt, docs/implementation/039-release-verification-2026-10-07.md). Batch-4/5/6/8 repairs (label patch, D1/D2/D5 class changes, timer/mocks) postdate it with only focused re-runs.
- Worker suite and the 15 package unit suites have NEVER appeared in any battery.
- `pnpm -r typecheck` and worker typecheck were never explicit battery criteria.

## Stages (sequential, stop-on-failure, no overlapping invocations — GAP-066)
1. `pnpm lint`
2. `pnpm -r --workspace-concurrency=1 typecheck`
3. `pnpm --filter @novelforge/api exec vitest run --no-file-parallelism --exclude 'src/e2e/**'`
4. `pnpm e2e` (dedicated scratch DB `novelforge_test_e2e`)
5. `pnpm --filter @novelforge/web test` (includes a11y/axe files — one run covers web + axe)
6. `pnpm --filter @novelforge/worker test` (first battery inclusion)
7. `pnpm -r --workspace-concurrency=1 --filter '!@novelforge/api' --filter '!@novelforge/web' --filter '!@novelforge/worker' run test` (first package sweep; concurrency 1 avoids scratch-DB collisions)

## Scratch-DB rule
Suite-owned `novelforge_test_<name>`; e2e owns `novelforge_test_e2e`; any new mutation test uses `novelforge_test_b8_<purpose>`. NEVER `novelforge_acceptance_050b`. RedisDB15 only if a named queue-integration stage is added. No Redis flush, no Docker restart, no migration run (preflight GO 45/45 2026-10-14 is reused readiness, not authorization).

## Exclusions
- No e2e beyond stage 4's 3 files without separate authorization; no live gateway.
- No repeat of migration preflight, NF-WF-050C acceptance/live evidence, or author sign-off (all RETAINED).
- GAP-051 human screen-reader pass and deployment stay out (author decisions, deferred/standing).

## Hash recording (no staging/commit)
git rev-parse HEAD; git status --porcelain; git stash list;
git diff --name-only HEAD + git ls-files --others --exclude-standard → per-file SHA256.
Freeze logs to TEMP/novelforge-release-<rev> per the 039 pattern.
