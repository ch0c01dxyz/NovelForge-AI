# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md section 35). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Last updated: 2026-09-24 (task NF-1005).

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

## Phase 1 — Identity, Tenancy & Persistence Core

Implemented directly in-session (2026-09-24) after gateway instability
blocked Orca workers; task IDs follow the roadmap.

- [x] NF-1001 Prisma platform schema + initial migration with pgvector
  — committed (`f9db7e2`); ADR-0003. Users/sessions/workspaces/
  memberships/novels/novel_settings/audit_logs, UUID keys, pgvector
  extension enabled from migration 1. Integration suite against live
  compose PostgreSQL passing.
- [x] NF-1002 Session auth primitives (`@novelforge/auth`) — committed
  (`cc5c243`); ADR-0002. argon2id hashing, opaque SHA-256-hashed
  session tokens, 30-day sliding sessions, timing-equalized login.
  12 unit + 2 integration tests passing.
- [x] NF-1003 API auth routes (register/login/logout/session) —
  committed (`cac08bc`). Zod validation, HttpOnly SameSite=Lax cookie,
  @fastify/rate-limit (register 10/min, login 20/min). Integration
  tests via fastify.inject against live PostgreSQL passing.
- [x] NF-1004 RBAC platform services + routes + audit foundation —
  committed (`0b12534`); ADR-0004. Capability map in
  `@novelforge/auth/authorization`, workspace/novel services with
  membership-as-tenant-gate (404 for non-members), append-only audit.
  7 authorization unit + 8 platform integration tests passing.
- [x] NF-1005 Tenant isolation exit gate — committed (`7231df5`).
  Route-level suite `apps/api/src/tenant-isolation.test.ts`
  (dedicated `novelforge_test_isolation` db): 401 gate, revoked-session
  access loss, non-member 404 across read/write/member-add shapes,
  session-scoped novel listing, removed-member access loss, VIEWER
  read-only enforcement, audit scoping. 7 tests passing.

Phase 1 exit criteria: full repo gate green on Windows against live
compose PostgreSQL/Redis (2026-09-24): lint 0 errors; typecheck all
workspaces Done; tests 11 files / 70 passed / 1 skipped; apps build
(incl. Nuxt production). **Met.**

Known CI gap: GitHub Actions has no postgres/redis service containers
yet, so DB-backed integration suites cannot run remotely; they are
executed locally against compose until `ci.yml` gains services.

## Phase 2+

NOT STARTED.
