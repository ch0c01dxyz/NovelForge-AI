# NF-WF-039 — Final revision release verification

Status: AUTOMATED_VERIFIED / REPORT_REVIEWED. Execution revision: 712cca6; failed68facd7 retained.
Owner: current Codex verifier. Reviewer: separate review_mutations_034 actor.
Goal: run a fresh sequential automated battery after reviewed NF-WF-035–038.
Preserve the failed36519e2 attempt and NF-WF-023's stop-on-new-defect rule;
this is its explicit verification follow-up, not a retroactive green receipt.
Reading: constitution, NF-WF-023 green definition/failure handling, CURRENT,
ENVIRONMENT-PREFLIGHT, issue register, historical release reports.
Dependencies: reviewed parser fix038; no product edits during the battery.
Allowed: test commands and dedicated scratch databases; this task, release report,
CURRENT/start/delivery pointers and issue evidence. Forbidden: production database
reset, Redis flush, model-attributed Engram writes without runtime binding,
skipped/failed tests counted as success, inline product fixes, fabricated human/live proof.
Inputs/outputs: pinned committed revision and current Windows services; exact command,
exit/file/test counts, failure detail, automated verdict and remaining release gates.
Invariants: no overlapping suite invocations; strict sequential lint, API/web
typechecks, full API/web suites, sequential E2E and all axe files. If a suite fails,
stop battery, record failure and use a separately reviewed repair task before a
fresh verification attempt. Internal independent test files may use runner defaults;
API uses --no-file-parallelism for fixed scratch DB isolation.
Acceptance: all7 executed automated checks pass, zero new unresolved defects;
counts/failures retained; separate report review. Human GAP-051 and missing live
deployment prerequisites stay open and prevent unconditional release acceptance.
Commands: pnpm lint; API exec tsc; web exec vue-tsc; full API/web vitest; pnpm e2e;
web vitest a11y. Additional production build/pure/worker checks are separately labeled.
Prerequisites: existing PostgreSQL5433/Redis6379 reused; dedicated test DBs only;
RedisDB15 for actual queue integration; no production queues consumed.
Migration: existing migrations only to disposable DBs; no schema changes. Rollback:
none for verification; retain immutable logs and failed attempts. Engram attribution
unavailable; task/CURRENT are fallback context.

Contract/report APPROVE by review_mutations_034, 2026-10-07. Pin the task
commit at execution; no product code changes during this battery.

Failed Windows boundary (2026-10-07): lint/API/web typechecks exit0; API56/57
files and1033/1034 tests. GAP-114 stopped the battery; later stages did not run.
TEMP/novelforge-release-68facd7 retains logs/results. NF040 repairs it separately.

Reviewed execution amendment (review_recovery_034 APPROVE, 2026-10-07): the
next committed revision runs API with --no-file-parallelism --exclude 'src/e2e/**',
then the dedicated pnpm e2e stage as already ordered. Reconcile54 non-E2E plus3
E2E files = all57 API files; report two runs, never a monolithic suite receipt.
This avoids duplicate long-novel fixture builds; no test is omitted or filtered
inside those files. All seven stages remain sequential and stop on failure.

Completed boundary: lint/API/web typechecks0; API non-E2E54 files1014/1014;
web79 files477/477; dedicated E2E3 files20/20; axe20 files91/91; additional
Nuxt production build0. All sequential, no suite skipped. Execution25134
completed0; TEMP/novelforge-release-712cca6 retains logs/results. Full API
inventory57 files1034 tests is covered in two runs. Automated green only;
human/live gates and source-audited older gaps remain open. Engram runtime
attribution unavailable; report/CURRENT are fallback context.

Final evidence/report review APPROVE by separate review_mutations_034 actor,
2026-10-07: all eight retained exit codes, file/test counts and sequential
timestamps checked read-only. No independent test rerun or release approval
claimed. Final handoff commit changes documentation only; tested code remains712cca6.
