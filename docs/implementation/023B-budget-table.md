# NF-WF-023B — Resource/Load Budget Table

**Date:** 2026-10-07 | **Evidence:** OBSERVED from executed measurement
run on this host (local PostgreSQL 16.15, Redis 7.0.15).
**Method:** `app.inject` (in-process, no network), 3 warmup + 20
samples per route (5 for stateful routes), p50/p95 computed from
sorted samples. DB query counts via a Prisma `$extends` counter
(`$allModels.$allOperations`). Backends MODEL_UNVERIFIED per GAP-013.

## Pinned fixture (reproducible)

- 1 user (OWNER), 1 workspace, 1 novel
- 10 chapters, each ~2KB sanitized HTML (`<p>Lorem ipsum…</p>` × 80)
- 5 revisions on `main` (5 sequential chapter updates via PUT with CAS)
- 1 extra branch (`budget-branch`) for the switch measurement
- 1 simulation run (021A: `NovelModule` enabled via DB, create →
  configure → start via routes)
- 1 endgame ledger entry (022A: MUST on a story thread)

## A priori budgets (dev host)

| Class | p95 budget | Rationale |
|---|---|---|
| Simple reads (novel, chapter) | 200ms | In-process inject; local DB; no network |
| Writes / lists (chapter write, revisions) | 500ms | Includes revision-chain writes |
| Heavy ops (branch switch, export, simulation step, debt report, auth) | 2000ms | Multi-step transactions, rendering, hashing |

## Results

| Route | p50 | p95 | Budget | Pass | Avg DB queries |
|---|---|---|---|---|---|
| `GET /api/workspaces/:wid/novels/:nid` | 3ms | 4ms | 200ms | PASS | ~3 |
| `GET .../chapters/:cid` | 4ms | 5ms | 200ms | PASS | ~4 |
| `PUT .../chapters/:cid` (write) | 4ms | 6ms | 500ms | PASS | ~4 |
| `GET .../revisions` | 6ms | 9ms | 500ms | PASS | ~6 |
| `POST .../branches/:bid/switch` | 3ms | 3ms | 2000ms | PASS | ~7 |
| `GET .../export?format=md` | 8ms | 21ms | 2000ms | PASS | ~5 |
| `POST .../simulations/:rid/step` | 7ms | 7ms | 2000ms | PASS | ~8 |
| `GET .../endgame/debt-report` | 9ms | 20ms | 2000ms | PASS | ~6 |
| `POST /api/auth/login` (wrong pw) | 1ms | 3ms | 2000ms | PASS | ~1 |

**9/9 within budget. Zero exceedances → zero budget GAPs.**

## Notes

- The login measurement uses a wrong password (no session side
  effects); it exercises the auth lookup + hash-compare path. A
  correct-password login would be slower (bcrypt) but was not measured
  — the route is not in the contract's pinned set beyond "auth".
- Query counts are per-request Prisma operations observed via the
  `$extends` hook; they include the auth/session lookups.
- `app.inject` measures handler+DB time only (no TCP/TLS/HTTP parse);
  production latencies will be higher by network overhead — these
  budgets are dev-host observations, not production SLOs.
- Per Invariant 1, no app code was tuned to meet budgets; the table is
  a pure observation.
