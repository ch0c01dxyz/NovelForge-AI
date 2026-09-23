# Test Matrix

> Coverage tracking by phase. Test levels are defined in
> [docs/10-testing/TESTING.md](../10-testing/TESTING.md): unit,
> integration, contract, e2e, migration.
>
> Status values: `pending` (planned, not yet written or not yet run in
> CI), `exists` (test file committed), `passing` (executed and green —
> only mark after actually running it, per CLAUDE.md Rule 4).

## Phase 0 — Repository & Architecture Foundation

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Env validation | passing | — | — | — | — |
| Module boundaries | — | — | passing | — | — |
| API health | passing | pending | pending | — | — |
| Worker/BullMQ | passing | passing (local) | — | — | — |
| Compose baseline | — | passing (local) | — | passing (Windows) | pending |
| CI skeleton | passing | pending | pending | pending | pending |

Executed results (2026-09-23, Windows, clean clone via
`scripts/verify-clone.ps1`): full `pnpm test` run — 24 tests passed, 1
skipped (worker real-Redis integration, gated on `WORKER_IT_REDIS_URL`),
exit 0. Lint, typecheck (19 workspaces), app builds (incl. Nuxt
production), and `docker compose config` all green.

Per-area notes:

- **Env validation** (`packages/config`): unit `env.test.ts` passing.
- **Module boundaries** (`@novelforge/contracts`): contract test checks
  the boundary map and domain event names against
  SYSTEM-ARCHITECTURE.md (ADR-0001); passing.
- **API health** (`apps/api`): unit `app.test.ts` passing; readiness
  datastore probes (integration) and health response schemas
  (contract) pending.
- **Worker/BullMQ** (`apps/worker`): unit `worker.test.ts` passing
  (7 hermetic tests via injectable fakes). Integration against real
  Redis passed locally on Windows (compose redis on host port 16379,
  2026-09-23): heartbeat job completed, connectivity proven, clean
  shutdown. In CI the integration test skips unless
  `WORKER_IT_REDIS_URL` is set.
- **Compose baseline**: postgres+pgvector (0.8.6) + redis boot reached
  `healthy` locally on Windows Docker Desktop (2026-09-23).
  Clean-clone e2e: **Windows passing**; **Ubuntu unverified** (no
  Ubuntu host available — run `scripts/verify-clone.sh` there).
- **CI skeleton** (`.github/workflows/ci.yml`): lint/typecheck/test
  wiring committed; first pipeline run on the forge is pending (counts
  as CI-verified once green remotely).

Phase 0 exit test: clean clone boots on Windows Docker/WSL2 and Ubuntu
Docker (NF-0010) — Windows passing (2026-09-23); Ubuntu pending a run
on an Ubuntu host with `scripts/verify-clone.sh`.

## Phase 1+

Rows added when each phase starts. Mandatory cross-cutting scenarios
(gateway retry/failover, streaming interruption, candidate canon,
tenant isolation, etc.) are listed in TESTING.md and become matrix rows
in the phase that implements them.
