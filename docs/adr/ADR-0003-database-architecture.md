# ADR-0003: Database Architecture

Status: Accepted
Date: 2026-09-23

## Context

Phase 1 needs persistent platform state (users, sessions, workspaces,
memberships, novels, audit logs) with migrations as reviewed artifacts
(CLAUDE.md §12), a repository boundary that prevents ORM leakage into
domain logic (START-HERE stack note, ADR-0001), and integration tests
that run against a real PostgreSQL (CLAUDE.md §25) without paid external
services. Phase 5 will need pgvector in the same database.

## Decision

1. **PostgreSQL via Prisma 7** in `packages/database`, using the
   `@prisma/adapter-pg` driver adapter and the `prisma-client`
   generator (ESM, `engineType = "client"`). Connection URLs come from
   the environment (`prisma.config.ts`), never from the schema.
2. **Migrations are the only schema path.** `prisma migrate dev` for
   authoring, `prisma migrate deploy` for applying. The initial
   migration also runs `CREATE EXTENSION IF NOT EXISTS vector` so
   pgvector is present from the first deploy (Phase 5 adds columns
   only).
3. **UUID primary keys** generated in-database (`gen_random_uuid()`),
   per DATA-MODEL-BLUEPRINT ("stable UUIDs").
4. **Tenant scoping by foreign key**: novels belong to workspaces;
   memberships join users to workspaces with a role enum
   (OWNER/ADMIN/AUTHOR/EDITOR/VIEWER). Unique constraints:
   `users.email`, `workspaces.slug`, `(workspace_id, user_id)`,
   `(workspace_id, novel slug)`.
5. **`novel_settings` uses intentional JSONB** (open-ended per-novel
   knobs read/written as a unit). All other platform state is
   normalized columns.
6. **`audit_logs` is append-only**: the data layer exposes create and
   read only; no update or delete path exists in the repository
   surface. Actor and workspace are nullable FKs so system-initiated
   and pre-workspace events remain recordable.
7. **Repository boundary**: consumers import `createDb(url)` and use
   the returned `NovelForgeDb` (a `PrismaClient` alias) only inside
   `packages/database`-backed services. Later phases add per-domain
   repository interfaces here so domain logic never sees Prisma types.
   Per ADR-0001, `@novelforge/database` may be imported by application
   services (apps/api, apps/worker) but not by domain packages.
8. **Integration tests use a dedicated `novelforge_test` database** on
   the same server as `DATABASE_URL`. `scripts/prepare-test-db.ts` (and
   the test suite itself) drops, recreates, and migrates it via
   `prisma migrate deploy`, proving the from-empty migration path on
   every run. Tests load repo-root `.env` only when `DATABASE_URL` is
   not set (CI passes it explicitly). The Prisma CLI is invoked as
   `node node_modules/prisma/build/index.js` because spawning `pnpm`
   fails on Windows (ENOENT on `.cmd` shims).

## Alternatives considered

- **Drizzle / Kysely / raw SQL**: less migration tooling maturity for
  the team size; START-HERE explicitly recommends Prisma initially with
  repository boundaries.
- **Separate database server for tests (testcontainers)**: rejected for
  Phase 1 — compose stack is already required on dev machines, and a
  dedicated `novelforge_test` database gives the same isolation with no
  extra infrastructure. Revisit if parallel CI shards need isolation.
- **Event sourcing for audit**: SYSTEM-ARCHITECTURE.md explicitly says
  "do not require pure event sourcing for every domain"; an append-only
  audit table plus versioned state is the chosen model.

## Consequences

- Schema changes require a migration file in review; no manual edits.
- `novelforge_test` is destroyed and rebuilt on every test run — never
  point `DATABASE_URL` at data you care about when running tests.
- pgvector is available from day one; vector columns/indexes arrive
  with Phase 5 migrations.
- The generated Prisma client lives in `packages/database/generated/`
  (gitignored) and is rebuilt on install (`postinstall: prisma generate`).
