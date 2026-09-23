# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md section 35). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Last updated: 2026-09-23 (task NF-0010).

## Phase 0 — Repository & Architecture Foundation

Source: `docs/12-roadmap/IMPLEMENTATION-ROADMAP.md` and
`docs/14-progress/CURRENT.md`.

- [x] NF-0001 Initialize monorepo/workspaces — committed (`0fe2378`).
- [x] NF-0002 Docker Compose baseline for PostgreSQL+pgvector and
  Redis — committed (`528ff20`); healthy boot + pgvector 0.8.6
  verified on Windows Docker Desktop.
- [x] NF-0003 Shared config/env validation — committed (`422fa44`,
  Zod schema in `packages/config`).
- [x] NF-0004 Module-boundary conventions and contract package —
  committed (`54a0394`, includes ADR-0001).
- [x] NF-0005 CI lint/typecheck/test skeleton — committed (`d47e3d5`);
  root `lint`/`typecheck`/`test` scripts are real (eslint, recursive
  tsc, vitest) and pass in a clean clone (NF-0010 verification run).
- [x] NF-0006 ADR/test documentation workflow — committed (`fc0f5fc`;
  ADR template, progress/decisions/test-matrix seeded).
- [x] NF-0007 Bootstrap Nuxt/Tailwind web shell — committed
  (`18ca5e8`); production build passes in clean clone.
- [x] NF-0008 Bootstrap Fastify API health/readiness — committed
  (`5dca86b`, `/health` and `/ready`).
- [x] NF-0009 Bootstrap worker health and BullMQ connection —
  committed (`6178ed2`); unit tests + real-Redis integration and
  clean SIGTERM shutdown verified on Windows.
- [x] NF-0010 Cross-platform clean-clone verification — Windows
  **PASSED** (2026-09-23, `scripts/verify-clone.ps1`: fresh clone →
  frozen-lockfile install → lint → typecheck → test → build all apps
  → `docker compose config`, exit 0). Ubuntu 24.04 **PASSED**
  (2026-09-23, `scripts/verify-clone.sh` inside an Ubuntu 24.04
  Docker container with Node v22.23.2, pnpm 12.5.1, git 2.43,
  Docker CLI 29.1.3 + Compose 2.40.3: full pipeline exit 0,
  `CLEAN-CLONE VERIFICATION PASSED (Linux)`).

Phase 0 exit criteria (roadmap): clean clone boots on Windows
Docker/WSL2 and Ubuntu Docker. **Windows: met. Ubuntu: met**
(container run; a bare-metal Ubuntu host run remains optional
confirmation). Phase 0 is complete.

## Phase 1+

NOT STARTED. Do not implement advanced story engines before Phase 0
conventions are stable (`docs/14-progress/CURRENT.md`).
