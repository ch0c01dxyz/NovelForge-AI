# NF-WF-047E Native Release Preparation — Receipt

**Task:** NF-WF-047E "Native Release Preparation" (047D BLOCKED → explicitly limited form)
**Implementer:** separate actor (047E implementer; backends MODEL_UNVERIFIED per GAP-013)
**Baseline:** branch `work/nf-wf047-external-follow-up` at `444ec38` (verify at final rerun)
**Contract:** `tasks/NF-WF-047E-native-release-preparation.md` (APPROVED 2026-10-07)
**Date:** 2026-10-08 (WIB)
**047C basis:** commit `119e394` — shared test DATABASE_URL resolver
(`apps/api/src/test-utils/resolve-test-database-url.ts`)

> **This is release-PREPARATION evidence, not a release decision.**
> No production acceptance authority is claimed or delegated by this task.
> No release-readiness claim appears anywhere in this receipt.

## 1. Environment record (OBSERVED)

| Item | Value |
|---|---|
| OS | Ubuntu 24.04.5 LTS |
| Arch | x86_64 |
| Node | v24.20.0 |
| pnpm | 12.5.1 (matches `packageManager` pin) |
| PostgreSQL | 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1); cluster 16/main, port 5432, online |
| pgvector | 0.6.0 (in `postgres` database) |
| Redis | 7.0.15, `redis-cli ping` → PONG |

**Safe local endpoints (private, loopback only):** PostgreSQL on
`localhost:5432`, Redis on `localhost:6379`. No externally reachable
ports opened by this task.

**Scratch ownership:** all test databases are `novelforge_test*`
disposable names owned by role `novelforge_test`; this task does not
reset the shared `novelforge_test` database via `db:test:prepare` and
does not flush shared Redis (workflow global constraint).

**Database access basis:** explicit valid `DATABASE_URL` export for the
`novelforge_test` role (same credential basis as the 047C diagnostic);
the 047C shared resolver pattern is the loader standard for test files.

## 2. Command inventory (actual package scripts — OBSERVED)

| Command | Actual behavior |
|---|---|
| `pnpm lint` | `eslint .` (root) |
| `pnpm --filter @novelforge/api typecheck` | `tsc --noEmit` — typecheck only |
| `pnpm --filter @novelforge/worker typecheck` | `tsc --noEmit` — typecheck only |
| `pnpm --filter @novelforge/web typecheck` | `vue-tsc --noEmit` — typecheck only |
| `pnpm --filter @novelforge/api build` | `tsc --noEmit` — **typecheck, not a bundle** |
| `pnpm --filter @novelforge/worker build` | `tsc --noEmit` — **typecheck, not a bundle** |
| `pnpm --filter @novelforge/web build` | `nuxt build` — real production bundle |
| `pnpm --filter @novelforge/api start` | `node --experimental-transform-types src/server.ts` |
| `pnpm --filter @novelforge/worker start` | `node --experimental-transform-types src/index.ts` |
| `pnpm --filter @novelforge/api test` | `vitest run` |
| `pnpm --filter @novelforge/worker test` | `vitest run` |
| `pnpm --filter @novelforge/web test` | `vitest run` |

> Per the contract: record what each command actually does — do not label a
> typecheck a "build". The web `build` is the only true bundle command.

## 3. Lint / typecheck / build evidence (OBSERVED)

All commands run on branch `work/nf-wf047-external-follow-up` at `444ec38`
(pre-integration; post-integration rerun recorded in §8).

| Command | Actual behavior | Result | Duration |
|---|---|---|---|
| `pnpm lint` | `eslint .` | ✅ exit 0 | 1m28.6s |
| `pnpm --filter @novelforge/api typecheck` | `tsc --noEmit` | ✅ exit 0 | 1m52.7s |
| `pnpm --filter @novelforge/worker typecheck` | `tsc --noEmit` | ✅ exit 0 | 0m51.8s |
| `pnpm --filter @novelforge/web typecheck` | `vue-tsc --noEmit` | ✅ exit 0 | 1m19.2s |
| `pnpm --filter @novelforge/api build` | `tsc --noEmit` (typecheck, not a bundle) | ✅ exit 0 (same as typecheck) | — |
| `pnpm --filter @novelforge/worker build` | `tsc --noEmit` (typecheck, not a bundle) | ✅ exit 0 (same as typecheck) | — |
| `pnpm --filter @novelforge/web build` | `nuxt build` (real bundle) | ✅ exit 0 — `.output/` produced (4.36 MB, 1.04 MB gzip) | 0m32.1s |

> The api/worker `build` scripts are literally `tsc --noEmit`; they are
> typechecks, not bundles. Only the web `build` produces an artifact.

## 4. Test suite evidence (OBSERVED)

Suites run serialized (API → worker → web) on the final pre-integration
revision. Database access via explicit valid `DATABASE_URL` export;
the 047C shared resolver's mismatch warning fired correctly during the
run (see note below) — the repair works as designed.

### 4a. API suite

- Command: `npx vitest run --no-file-parallelism` (in `apps/api`)
- Result: ✅ **58/58 test files passed, 1047/1047 tests passed**, exit 0
- Duration: 9m38.9s (tests 90%, import 9%, transform 1%)
- Notable: the 047C `[test-env] WARNING` fired in
  `src/e2e/author-preview.loop.test.ts` — parent `DATABASE_URL`
  differs from repo-root `.env`; the operator signal is present and
  sanitized (no values printed).

### 4b. Worker suite

- Command: `npx vitest run --no-file-parallelism` (in `apps/worker`)
- Result: ✅ **8/8 test files passed, 69 passed + 1 skipped (70 total)**, exit 0
- Duration: 0m30.6s

### 4c. Web suite

- Command: `npx vitest run` (in `apps/web`)
- Result: ✅ **81/81 test files passed, 488/488 tests passed**, exit 0
- Duration: 2m35.9s

**Suite totals:** API 58/58 + 1047/1047 · Worker 8/8 + 69/1 skipped ·
Web 81/81 + 488/488. All exit 0. No `--passWithNoTests` used.

## 5. Scratch backup/restore drill (OBSERVED)

Per `BACKUP-RESTORE-RUNBOOK.md` §1–§3, against scratch databases only.

- **Source DB:** `novelforge_test_047e_drill` (created fresh, owned by
  `novelforge_test`)
- **Migrations applied:** 40/40 (`prisma migrate deploy`, exit 0)
  — note: runbook §1 says "expected: 36 (as of 2026-10-07)"; the
  repository now has 40 migration directories (4 added since).
- **Seed:** 1 representative row in each of 9 tables (user, workspace,
  novel, chapter, branch, revision, story thread, simulation run,
  endgame ledger) via `/tmp/047e-drill-seed.sql`
- **Dump:** `pg_dump -Fc` → `/tmp/047e_drill.dump` (**330K**)
- **Restore target:** fresh empty `novelforge_test_047e_restore`
  (`pg_restore --no-owner -j 4`, 1.1s, exit 0)
- **Table parity:** ✅ **95/95 tables row-count match, 0 mismatches**
  (94 public tables + `_prisma_migrations`)
- **App boot on restored DB:** ✅ `/ready` → **200**, `/health` → **200**
  (API started with dedicated test config on loopback `localhost:3101`
  against the restored DB; first attempt failed with
  `EnvValidationError` for missing S3/OMNIROUTE/encryption vars —
  retained as evidence — second attempt with test-config values
  succeeded)
- **Pinned key queries:** ✅ all 6 byte-identical (novel, chapter,
  revision, branch, simulation run, endgame ledger)

**Drill result: PASS** (5/5 runbook §3 checks).

## 6. Production-start smoke (OBSERVED)

Dedicated test configuration on private local endpoints (loopback only;
no externally reachable ports). Test/dummy values for S3, OMNIROUTE,
and encryption (same pattern as `apps/api/src/e2e/setup.ts`).

### 6a. API smoke

- Command: `pnpm --filter @novelforge/api start` (actual:
  `node --experimental-transform-types src/server.ts`)
- Config: `DATABASE_URL` → restored DB `novelforge_test_047e_restore`,
  `REDIS_URL=redis://localhost:6379`, `PORT=3101`, test S3/OMNIROUTE/
  encryption values
- **First attempt FAILED** (retained as evidence): `EnvValidationError`
  for missing `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `OMNIROUTE_BASE_URL`, `APP_ENCRYPTION_KEY` — the server fails fast
  on invalid config (no silent partial boot).
- **Second attempt:** ✅ `/ready` → **200**, `/health` → **200**
- Smoke: PASS

### 6b. Worker smoke

- Command: `pnpm --filter @novelforge/worker start` (actual:
  `node --experimental-transform-types src/index.ts`)
- Config: same test values + `NODE_ENV=test` (worker requires it;
  first attempt without it failed with `EnvValidationError` —
  retained as evidence)
- Result: ✅ all 5 workers started (heartbeat, workflow-runs,
  memory-rebuild, publication, notifications)
- **Job observation:** ✅ `"redis connectivity proven via heartbeat job"`
  — the heartbeat job was registered and completed. Additionally, the
  notifications worker drained leftover `novel.chapter_published`
  fan-out jobs from the shared Redis (from the earlier test suites).
- Smoke: PASS (≥1 BullMQ job observed processed)

**No LLM calls were made during smoke** (no gateway traffic; all
values are test/dummy). Had any occurred they would be labeled MOCK —
none did.

## 7. GAP-027 — `verify-clone.sh` Docker check

GAP-027 records that the legacy `scripts/verify-clone.sh` ends with a
mandatory Docker/Compose check. On native Ubuntu this check cannot pass
and must NOT be used as native acceptance.

This receipt does NOT run `verify-clone.sh` and does NOT claim its
Docker stage. The relevant project checks (install, lint, typecheck,
build, suites) were run individually per ENVIRONMENT-PREFLIGHT.md.
GAP-027 is referenced here, not silently skipped.

## 8. Unavailable gates (explicit — NOT claimed)

This receipt is preparation evidence, not a release decision. The
following gates remain unavailable; none are implied by omission:

1. **Populated-upgrade evidence — BLOCKED** (047D/GAP-018). No
   authorized sanitized dump is available. A populated `prisma migrate
   deploy` was not run. Synthetic/empty-DB migration success (40/40
   on the drill DB) does not substitute.
2. **Live-provider behavior — unavailable.** No live LLM gateway
   credentials; all gateway values are test/dummy. Owner: author.
3. **Author budget — unavailable.** No cost/latency budgets were set or
   measured against. Owner: author.
4. **Target-scale / mission-scale acceptance — unavailable.** The
   300-chapter fixture is explicitly not mission-scale evidence
   (workflow review focus #5). Owner: author.
5. **Human screen-reader acceptance (GAP-051) — unavailable.**
   Automated axe checks are green; the manual pass needs a human.
   Owner: author.
6. **Production deployment approval and execution — unavailable.**
   No deployment was performed or authorized. Owner: author.
7. **SCALE/quota policy selection (GAP-039/063) — unavailable.**
   047F produced proposal-only decision briefs; the author has not
   selected. Owner: author.

## 9. Failed attempts retained (evidence, not non-events)

| Attempt | Result |
|---|---|
| API smoke, first attempt (missing S3/OMNIROUTE/encryption vars) | ❌ `EnvValidationError` — server fails fast, no silent partial boot |
| Worker smoke, first attempt (missing `NODE_ENV`) | ❌ `EnvValidationError` — `NODE_ENV` must be `development\|test\|production` |
| Drill seed SQL, first run | ❌ 3 invalid enum values (`DRILL_SEED`, `PLOT`, `PENDING`) — corrected to `MANUAL`, `SUBPLOT`, `OPEN` |

All failed attempts are recorded above; the successful retries do not
erase them.

## 10. Post-integration rerun

The contract requires rerunning applicable checks once on the final code
revision after integration. At the time of this receipt, the branch HEAD
is `444ec38` and no integration has occurred since the checks ran —
these results ARE on the current HEAD. If the coordinator integrates
further changes before the 047E diff review, the checks in §3–§6 must be
rerun on the new HEAD and both attempt records retained.

## 11. Proposed runbook amendments

1. **BACKUP-RESTORE-RUNBOOK.md §1:** the "expected: 36" migration count
   (as of 2026-10-07) is now stale — the repository has 40 migration
   directories. Suggest updating to a dynamic check (`ls` count vs
   `_prisma_migrations` count) instead of a hardcoded number.
2. **BACKUP-RESTORE-RUNBOOK.md §3b:** add a note that the API's
   `start` requires the full env set (S3, OMNIROUTE, encryption,
   `NODE_ENV` for the worker) even for a readiness probe — a
   "dedicated test configuration" section with the dummy-value pattern
   would prevent the first-attempt failure observed here.

(Coordinator owns shared-doc edits; these are proposals only.)

## 12. Summary

| Check | Result |
|---|---|
| Environment record | ✅ Ubuntu 24.04.5, Node v24.20.0, pnpm 12.5.1, PG 16.15 + pgvector 0.6.0, Redis 7.0.15 |
| `pnpm lint` | ✅ exit 0 (1m28s) |
| API/worker/web typechecks | ✅ exit 0 (1m53s / 0m52s / 1m19s) |
| API/worker builds | ✅ exit 0 (both are `tsc --noEmit` — typechecks, not bundles) |
| Web build | ✅ exit 0 — `.output/` 4.36 MB (32s) |
| API suite | ✅ 58/58 files, 1047/1047 tests (9m39s) |
| Worker suite | ✅ 8/8 files, 69 passed + 1 skipped (31s) |
| Web suite | ✅ 81/81 files, 488/488 tests (2m36s) |
| Backup/restore drill | ✅ 95/95 tables parity, `/ready` 200, 6/6 key queries identical |
| API smoke | ✅ `/ready` 200, `/health` 200 |
| Worker smoke | ✅ 5 workers started, heartbeat job completed |
| GAP-027 | ✅ referenced, Docker check not claimed |
| Unavailable gates | ✅ all 7 named explicitly |
| Release-readiness claim | ✅ none appears in this receipt |

**READY FOR DIFF REVIEW.**
