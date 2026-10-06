# NF-WF-023C — Release Acceptance Battery Report

**Date:** 2026-10-07 | **Revision:** `f754e12` (NF-WF-023 + NF-WF-024 contracts)
**Actor:** 023C implementer (separate from contract author/reviewer, 023A/023B implementers, future diff reviewer)
**Environment:** Ubuntu 24.04.5 LTS, Node v24.20.0, pnpm 12.5.1, PostgreSQL 16.15 + pgvector 0.6.0 (localhost:5432), Redis 7.0.15 (localhost:6379). `DATABASE_URL=postgresql://novelforge_test@localhost:5432/postgres` (trust auth; repo `.env` carries the `<redacted>` placeholder per GAP-086/GAP-065 family). Backends MODEL_UNVERIFIED per GAP-013.

## GAP-076 fix (pre-authorized code change)

**File:** `apps/api/src/e2e/setup.ts` (test-harness only; no product changes — Invariant 1).

**Change:** cross-process file lock (`novelforge-e2e-novelforge_test_e2e.lock` in OS tmpdir, atomic `wx` exclusive-create). Acquired at the start of `getE2E()`'s destructive setup; held until `closeE2E()` (or released on setup failure). Stale locks stolen via PID-liveness + 45-min age checks.

**Proof (A/B stress, `/tmp/e2e-lock-stress.ts`, 3 concurrent getE2E/closeE2E lifecycles with overlapping DB-usage windows):**
- OLD code: STRESS FAILED in ~5s with PostgreSQL `57P01` "terminating connection due to administrator command" — the exact GAP-076 error, reproduced.
- NEW code: STRESS OK — all 3 lifecycles serialized cleanly, no connection kills.
- Correctness by construction: `pg_terminate_backend` executes only inside `getE2E()` while the lock is held; the lock is released only in `closeE2E()` or on setup failure.

**GAP-076:** CLOSED (2026-10-07).

## Battery execution (strictly sequential, Invariant 4)

| Box | Suite | Result | Evidence |
|---|---|---|---|
| 1 | `pnpm lint` (repo) | ❌ **FAIL** | Exit 1. 1 error: `apps/api/src/services/revisions.ts:47:8 'DependencyConflict' is defined but never used` (@typescript-eslint/no-unused-vars). Import added in `e28653b` (NF-WF-020), unused since. In committed tree; not caused by 023C. → **GAP-097** (P3, non-blocking). Battery STOPPED per contract failure handling. |
| 2 | `npx tsc --noEmit` (apps/api) | ⏹️ NOT RUN | Battery stopped at Box 1. (Note: tsc was run ad-hoc during GAP-076 fix verification → clean, exit 0 — but this is NOT battery evidence per Invariant 3.) |
| 3 | `npx vue-tsc --noEmit` (apps/web) | ⏹️ NOT RUN | Battery stopped at Box 1. |
| 4 | API vitest (full) | ⏹️ NOT RUN | Battery stopped at Box 1. |
| 5 | Web vitest (full) | ⏹️ NOT RUN | Battery stopped at Box 1. |
| 6 | e2e | ⏹️ NOT RUN | Battery stopped at Box 1. (GAP-076 fix verified separately via A/B stress above; single-command `pnpm e2e` reliability not confirmed by a full run in 023.) |
| 7 | Axe suites (`*.axe.test.ts`) | ⏹️ NOT RUN | Battery stopped at Box 1. Last OBSERVED: 0 violations (2026-10-06). |
| 8 | No new GAPs during 023C | ❌ **FAIL** | GAP-097 opened during 023C battery execution (Box 1 failure). 023A/023B GAPs (091, 094, 095, 096) are expected inputs, not battery failures. |

**"Green" definition:** NOT MET. Box 1 failed; battery stopped per the contract's F1-fixed failure handling ("new defect → battery STOPS, GAP recorded, NO re-run in 023").

## Accessibility (GAP-051)

- Automated half (Box 7): NOT re-executed in 023 (battery stopped). Last OBSERVED: 0 violations (2026-10-06).
- `apps/web/a11y/AUDIT-014.md` updated with the 023C release-verification note.
- Human screen-reader gate (NVDA + Firefox / VoiceOver + Safari): **OPEN**, owner to be named. Explicit release gate per contract.

## Release decision: SHIP_WITH_KNOWN_GAPS

**Rationale:** The "green" definition is not met (Box 1 failed → battery stopped). Per the contract's failure handling, the decision is NO_SHIP "or SHIP_WITH_KNOWN_GAPS if the gap is assessed non-blocking, with severity and owner recorded." GAP-097 is P3 cosmetic (unused type import; zero functional/build/test impact) — assessed non-blocking. No blocking defect was found (the battery stopped before boxes 2–7, so no evidence of deeper defects, but also no green evidence for those boxes).

**Green checklist:**
- [ ] Box 1 (lint): FAIL → GAP-097
- [ ] Box 2 (tsc): not run
- [ ] Box 3 (vue-tsc): not run
- [ ] Box 4 (API vitest): not run
- [ ] Box 5 (web vitest): not run
- [ ] Box 6 (e2e): not run
- [ ] Box 7 (axe): not run
- [ ] Box 8 (no new GAPs): FAIL → GAP-097

**Known gaps at release (severity + owner):**
| GAP | Severity | Summary | Owner |
|---|---|---|---|
| GAP-097 | P3 | Lint: unused `DependencyConflict` import in `revisions.ts` (Box 1 failure) | Whoever next touches `revisions.ts` |
| GAP-051 | P2 | Human screen-reader pass pending (explicit release gate) | To be named (human auditor) |
| GAP-013 | Standing | Backends MODEL_UNVERIFIED | Standing |
| GAP-028 | P1 | Production worker has no AI wiring | 024 or worker-hardening follow-up |
| GAP-091 | P3 | 023A: `simulation_entities` dead table | Contract fidelity follow-up |
| GAP-094 | P2 | 023B: `publication` stuck-job detection only on restart | Worker follow-up |
| GAP-095 | P2 | 023B: `memory-rebuild` no reconciliation after Redis loss | Worker follow-up |
| GAP-096 | P2 | 023B: `notifications` failed fan-outs not auto-recovered | Worker follow-up |
| GAP-055 | P2 | Scene-delete cascade-vs-refuse (planning owner) | Planning owner |

**Human-gate status (GAP-051):** OPEN. The NVDA + Firefox / VoiceOver + Safari screen-reader pass has not been performed and cannot be performed by agents. This is an explicit release gate.

**What SHIP_WITH_KNOWN_GAPS means here:** the release may proceed with the listed known gaps, but (a) GAP-097 should be fixed in the next cleanup (one-line), (b) the full battery (boxes 2–7) should be executed to green before the release is considered fully verified, and (c) GAP-051 requires a human auditor.

## UNVERIFIED / honest limitations

1. Backends MODEL_UNVERIFIED per GAP-013 (standing).
2. Boxes 2–7 were NOT executed in 023 (battery stopped at Box 1 per contract). No green evidence for tsc, vue-tsc, API/web suites, e2e, or axe on the release revision in 023.
3. GAP-076's single-command `pnpm e2e` reliability is proven by A/B stress + construction, but NOT by a full `pnpm e2e` run in 023.
4. The `.env` `DATABASE_URL=<redacted>` placeholder persists (GAP-065 family); battery commands used an explicit shell export.
