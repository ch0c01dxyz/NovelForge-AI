# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md section 35). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Last updated: 2026-09-23 (task NF-0006).

## Phase 0 — Repository & Architecture Foundation

Source: `docs/12-roadmap/IMPLEMENTATION-ROADMAP.md` and
`docs/14-progress/CURRENT.md`.

- [x] NF-0001 Initialize monorepo/workspaces — committed (`0fe2378`).
- [x] NF-0002 Docker Compose baseline for PostgreSQL+pgvector and
  Redis — committed (`528ff20`).
- [x] NF-0003 Shared config/env validation — committed (`422fa44`,
  Zod schema in `packages/config`).
- [x] NF-0004 Module-boundary conventions and contract package —
  committed (`54a0394`, includes ADR-0001).
- [ ] NF-0005 CI lint/typecheck/test skeleton — IN PROGRESS
  (`.github/workflows/ci.yml` exists; root lint/typecheck/test
  scripts are still placeholders).
- [ ] NF-0006 ADR/test documentation workflow — IN PROGRESS (this
  change: ADR template, progress/decisions/test-matrix seeded).
- [x] NF-0007 Bootstrap Nuxt/Tailwind web shell — committed
  (`18ca5e8`).
- [x] NF-0008 Bootstrap Fastify API health/readiness — committed
  (`5dca86b`, `/health` and `/ready`).
- [ ] NF-0009 Bootstrap worker health and BullMQ connection — IN
  PROGRESS (uncommitted work in `apps/worker/src/`).
- [ ] NF-0010 Cross-platform clean-clone verification on Windows and
  Ubuntu — NOT STARTED.

Phase 0 exit criteria (roadmap): clean clone boots on Windows
Docker/WSL2 and Ubuntu Docker.

## Phase 1+

NOT STARTED. Do not implement advanced story engines before Phase 0
conventions are stable (`docs/14-progress/CURRENT.md`).
