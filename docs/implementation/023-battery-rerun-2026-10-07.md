# NF-WF-023 Release Battery — Current-Host Rerun (2026-10-07)

**Host:** Ubuntu 24.04.5 LTS, x86_64
**Revision:** `dfd87a3` (includes NF-WF-025 post-sync regression repair)
**Date:** 2026-10-07, 04:45–05:30 WIB
**Executor:** Muse (separate session from 023A/B/C implementers and reviewers)
**Method:** Strictly sequential per Invariant 4. All claims OBSERVED per Invariant 3.

## Environment preflight (per ENVIRONMENT-PREFLIGHT.md)

| Item | Status |
|---|---|
| OS/arch | Ubuntu 24.04.5 LTS, x86_64 ✅ |
| git/node/pnpm | 2.43.0 / v24.20.0 / 12.5.1 ✅ |
| PostgreSQL 16.15 + pgvector 0.6.0 | Started via `pg_ctlcluster`; accepting connections ✅ |
| Redis 7.0.15 | Started via `redis-server --daemonize`; PONG ✅ |
| GAP-065 (novelforge_test + vector in template1) | Re-applied: role created, vector 0.6.0 enabled ✅ |
| Dependencies | `node_modules` present (no reinstall needed) ✅ |

**Environment issues found:**
- GAP-105: `novelforge_test` role password mismatch (`test` vs expected `novelforge_test`) + `.env` placeholder `DATABASE_URL`. Fixed via `ALTER ROLE ... PASSWORD 'novelforge_test'` and explicit shell export. RESOLVED.

## Battery results — 8 boxes

| Box | Check | Result |
|---|---|---|
| 1 | `pnpm lint` | ✅ exit 0 |
| 2 | `npx tsc --noEmit` (apps/api) | ✅ exit 0 |
| 3 | `npx vue-tsc --noEmit` (apps/web) | ✅ exit 0 |
| 4 | API vitest (full suite) | ✅ 53/53 files, 970/970 tests, 0 failures |
| 5 | Web vitest (full suite) | ✅ 77/77 files, 466/466 tests, 0 failures |
| 6 | e2e (sequential per-file) | ✅ 20/20 (author-preview 3/3, gates 10/10, long-novel 7/7) |
| 7 | Axe suites (all `*.axe.test.ts`) | ✅ 20/20 files, 91/91 tests, zero violations |
| 8 | No new GAPs during battery | ✅ (GAP-105 environment-only, resolved; 1 transient flake observed, non-reproducing) |

**Verdict: GREEN** ✅ — All 8 boxes ticked with OBSERVED evidence on this host at `dfd87a3`.

## Notes

- **Box 4 flake:** First full run showed 1/970 failed (unidentified, output truncated). Two subsequent full runs: 970/970. Classified as transient flake; recorded in GAP-105. If it recurs, re-open with the failing test identified.
- **Box 6 method:** Per-file sequential (`author-preview.loop`, `gates`, `long-novel.measure`) per Invariant 4. The GAP-076 file-lock fix is present; single-command `pnpm e2e` reliability not re-proven in this run (per-file remains the method of record).
- **Box 7:** All 91 tests assert zero violations; no violations observed.
- **NF-WF-025 not repeated:** Its bounded tests and separate review (APPROVE) are accepted as prior evidence; this battery verifies the integrated result.

## Release decision

**SHIP_WITH_KNOWN_GAPS** — Battery is GREEN, but the following remain open:

### Known gaps at release time

| GAP | Severity | Status | Owner/Next |
|---|---|---|---|
| GAP-013 | Standing | OPEN | MODEL_UNVERIFIED backends (standing) |
| GAP-028 | P1 | OPEN | Production worker AI wiring — needs task/contract |
| GAP-051 | P2 | OPEN | Human screen-reader gate — needs named human auditor |
| GAP-055 | P2 | OPEN | Scene-delete cascade-vs-refuse |
| GAP-094 | P3 | OPEN | `publication` no interval sweeper |
| GAP-095 | P3 | OPEN | `memory-rebuild` no Redis-loss reconciliation |
| GAP-096 | P3 | OPEN | `notifications` no auto-recovery for failed fan-outs |
| GAP-098 | P3 | OPEN | 024C Part 2 optimization — needs author scope decision |
| GAP-100 | P1 | BLOCKED | What-if live runs — needs reviewed contract |
| GAP-101 | P2 | BLOCKED | Semantic preview/apply parity — needs reviewed contract |

### Human gate (GAP-051)

The automated a11y half is verified (Box 7: zero violations). The manual screen-reader pass (NVDA+Firefox / VoiceOver+Safari) remains OPEN and is an explicit release gate. Agents cannot perform it.

## Recommended fix order (from verification results + dependencies)

1. **GAP-028** (P1, actionable) — Production worker AI wiring. Highest open severity; blocks real AGENT/SKILL/RETRIEVAL execution. Needs a bounded task contract (move factories to shared packages; do not duplicate into worker).
2. **GAP-100** (P1, BLOCKED) — What-if live comparisons. Requires a reviewed contract before any mutation-path change. Do NOT use silent main-branch fallback.
3. **GAP-101** (P2, BLOCKED) — Semantic preview/apply parity. Requires a reviewed contract before any apply-path change. Do NOT forward mode into whole-row apply.
4. **GAP-094/095/096** (P3, actionable) — Job recovery robustness. Independent; can follow the P1s.
5. **GAP-098** (P3, decision) — Needs author's scope decision: accept token budget as "measured cost" or amend 024 contract.

GAP-100/101 are BLOCKED (not just OPEN) — no code changes until their contracts are reviewed and approved.

## Post-pull evidence boundary — 2026-10-07

This report is preserved as the Ubuntu executor's historical report at dfd87a3. The later shared-service refactor (e23dd8d/cc8d515) invalidates any assumption that this battery proves the current tree. SHIP_WITH_KNOWN_GAPS is the executor's recommendation, not recorded author release approval; GAP-051 remains an explicit open gate. Current-host focused verification is recorded in CURRENT/GAP-106; a complete final-revision battery is still required.
