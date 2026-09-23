# Architecture Decision Records

Initial accepted decisions:

-   ADR-001: PostgreSQL is canonical source of truth.
-   ADR-002: Start as modular monolith + workers.
-   ADR-003: pgvector/embeddings are derived retrieval infrastructure,
    not canon.
-   ADR-004: OmniRoute is the primary LLM gateway behind `AIGateway`.
-   ADR-005: Model profiles are capability abstractions; model IDs are
    configuration.
-   ADR-006: Rollback is non-destructive.
-   ADR-007: AI-generated facts become Candidate Canon before
    approval/commit.
-   ADR-008: Approved outline outranks synopsis for chapter planning.
-   ADR-009: Narrative DNA uses soft constraints by default.
-   ADR-010: Genre/story features compose generic narrative primitives.
-   ADR-011: Detailed planning decreases with narrative distance.
-   ADR-012: Evidence-backed findings replace arbitrary LLM health
    scores.
-   [ADR-0001](../adr/ADR-0001-module-boundaries.md): Module boundary
    conventions; `@novelforge/contracts` holds the typed boundary map
    and domain event names, tested against SYSTEM-ARCHITECTURE.md.
-   [ADR-0003](../adr/ADR-0003-database-architecture.md): Database
    architecture — PostgreSQL via Prisma 7 (pg driver adapter),
    migrations as the only schema path, pgvector enabled from the
    initial migration, UUID keys, append-only `audit_logs`, and a
    dedicated `novelforge_test` database for integration tests.

New ADRs start from [ADR-TEMPLATE.md](../adr/ADR-TEMPLATE.md), use the
next sequential `ADR-NNNN` number, are filed under `docs/adr/`, and are
listed here.

Any reversal requires a new ADR that supersedes the old decision and
explains migration impact.
