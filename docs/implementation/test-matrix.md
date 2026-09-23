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
| Env validation | exists | — | — | — | — |
| Module boundaries | — | — | exists | — | — |
| API health | exists | pending | pending | — | — |
| Worker/BullMQ | exists | pending | — | — | — |
| Compose baseline | — | pending | — | pending | pending |
| CI skeleton | pending | pending | pending | pending | pending |

All cells above are `pending` CI verification until NF-0005 lands; none
have been executed green yet.

Per-area notes:

- **Env validation** (`packages/config`): unit `env.test.ts` committed.
- **Module boundaries** (`@novelforge/contracts`): contract test checks
  the boundary map and domain event names against
  SYSTEM-ARCHITECTURE.md (ADR-0001).
- **API health** (`apps/api`): unit `app.test.ts` committed; readiness
  datastore probes (integration) and health response schemas
  (contract) pending.
- **Worker/BullMQ** (`apps/worker`): unit `worker.test.ts` committed;
  queue connection and health (integration) pending.
- **Compose baseline**: postgres+redis boot (integration) and
  clean-clone boot e2e (NF-0010) pending.
- **CI skeleton** (NF-0005): lint/typecheck/test wiring pending.

Phase 0 exit test: clean clone boots on Windows Docker/WSL2 and Ubuntu
Docker (NF-0010) — pending.

## Phase 1+

Rows added when each phase starts. Mandatory cross-cutting scenarios
(gateway retry/failover, streaming interruption, candidate canon,
tenant isolation, etc.) are listed in TESTING.md and become matrix rows
in the phase that implements them.
