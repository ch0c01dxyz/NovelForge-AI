# NF-WF-047C Diagnostic Receipt — Phase 1 (Implementer)

**Role:** Implementer (separate actor; backends MODEL_UNVERIFIED per GAP-013)
**Date:** 2026-10-08
**Branch:** `work/nf-wf047-external-follow-up` at `f957e0f`
**Host:** Ubuntu 24.04.5 LTS, Node v24.20.0, PostgreSQL 16 online :5432, Redis PONG :6379
**Secret hygiene:** No connection strings printed. D3 used a dummy wrong password, never a real credential.

## D1–D6 Reproduction Matrix (OBSERVED)

| # | Condition | OBSERVED outcome |
|---|---|---|
| D1 | `DATABASE_URL` absent, repo-root `.env` present | **Loader works.** `process.loadEnvFile(<repo-root>/.env)` resolves the URL. On THIS host the `.env` carries a placeholder password (`test_password_123`), so a test would fail at AUTH (not at loading). Mechanism correct; credential stale. |
| D2 | `DATABASE_URL` explicitly valid (exported) | **Works.** Parent export used; `.env` ignored. Correct per ADR-0003 §8. (Credential validity verified via direct `psql`: OK.) |
| D3 | `DATABASE_URL` stale/invalid (dummy wrong password), `.env` present | **REPRODUCED.** Stale parent export wins silently; `.env` never consulted. This is the GAP-081/082 mechanism. |
| D4 | Placeholder `.env` (GAP-105 pattern) | **Current host state.** The repo-root `.env` HAS a placeholder password — D1 and D4 collapse here. P3-4 resolved: the `.env` IS stale on this host (D1 does not authenticate). The competing hypothesis (".env fine, loader broken") is refuted; instead the loader is fine and the credential is placeholder. |
| D5 | `DATABASE_URL` absent, `.env` missing | **Loud failure, correct.** Throws `DATABASE_URL not set and repo-root .env not found — see ADR-0003`. (`.env` moved aside and restored intact for this check.) |
| D6 | `pnpm vitest` vs `npx vitest` (no exported URL) | **No difference.** Neither launcher injects `DATABASE_URL` (probe: ABSENT under both). No `.npmrc` env injection (`engine-strict` only). GAP-082's "pnpm working directory" hypothesis is refuted — test paths derive from `import.meta.url` (absolute), not cwd. |

## Core Mechanism (verified on Node v24.20.0)

- `process.loadEnvFile()` **never overrides** existing environment variables (parent wins) — confirmed by direct probe.
- When the variable is absent, the file value loads — confirmed by direct probe.
- Every test loader uses `if (!process.env.DATABASE_URL) { process.loadEnvFile(<absolute repo-root .env>) }` — the `.env` is consulted ONLY when the variable is entirely absent.

## Loader Inventory (60 files, `rg`)

| Category | Count | Files |
|---|---|---|
| Standard guard + absolute path (`if (!process.env.DATABASE_URL)` + `import.meta.url`-derived) | 56 | All `*.test.ts` in `apps/api/src`, `e2e/setup.ts`, `prepare-test-db.ts`, etc. |
| Hardened variant (reloads on placeholder; loud failure if still placeholder) | 1 | `apps/api/src/simulation-causality.test.ts` (pre-existing since NF-WF-021) |
| Guarded, alternate formulation | 1 | `apps/api/src/e2e/run.ts` (`if (!DATABASE_URL && existsSync(ENV_PATH))`) |
| **Outlier 1** — cwd-relative, no guard | 1 | `packages/database/prisma.config.ts`: `process.loadEnvFile(".env")` — behavior depends on invocation cwd. Latent; outside GAP-081/082 test scope. |
| **Outlier 2** — unconditional, path-correct | 1 | `apps/api/src/server.ts`: `if (existsSync(envFile)) process.loadEnvFile(envFile)` — safe because `loadEnvFile` never overrides; comment documents this. Not a defect. |

## Historical Provenance (OBSERVED vs UNKNOWN)

- **GAP-081** (`.env` password verified correct via direct `psql`, test failed auth): consistent with a stale parent `DATABASE_URL` exported earlier in the operator's session. The exact stale value's provenance is **UNKNOWN** (shell history unavailable retroactively).
- **GAP-082** (password "reset multiple times", `pnpm vitest` failed immediately after ALTER): each `ALTER USER` invalidated previously exported URLs — the stale-parent mechanism fully explains it. The "working directory under pnpm" hypothesis is **refuted** (D6 + absolute paths).

## Conclusion

**Phase 1 REPRODUCES the defect (D3).** The failure mode is the silent precedence of a stale parent `DATABASE_URL` over the repo-root `.env`, combined with `loadEnvFile`'s non-overriding semantics. No code defect in the loader mechanism itself; the defect is the *silent* behavior + the duplicated guard pattern offering no signal. A second, independent issue on this host: the repo-root `.env` carries a placeholder password (D4), which is operational, not a loader defect.
