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
-   [ADR-0002](../adr/ADR-0002-authentication-architecture.md):
    Session-cookie authentication — opaque tokens stored hashed
    (SHA-256), argon2id password hashing, 30-day sliding sessions with
    immediate revocation; JWTs rejected.
-   [ADR-0004](../adr/ADR-0004-authorization-rbac.md): Capability-based
    RBAC — granular capabilities instead of inline role checks,
    membership as the tenant gate (404 for non-members), owner
    invariants, append-only audit trail for sensitive mutations.
-   [ADR-0003](../adr/ADR-0003-database-architecture.md): Database
    architecture — PostgreSQL via Prisma 7 (pg driver adapter),
    migrations as the only schema path, pgvector enabled from the
    initial migration, UUID keys, append-only `audit_logs`, and a
    dedicated `novelforge_test` database for integration tests.
-   [ADR-0005](../adr/ADR-0005-platform-administration.md): Platform
    administration as a separate authorization axis — `users.platform_role`,
    platform-only capabilities never conferred by a workspace role, and a
    closed platform capability set so platform administration is not a
    bypass for workspace authorization.
-   [ADR-0006](../adr/ADR-0006-agent-skill-workflow-platform.md): Agent /
    skill / workflow platform — append-only versioned definitions, scoped
    platform vs workspace catalogs, fail-closed structured-output
    contracts, validated acyclic workflow graphs, one AI path per step,
    and structural determinism.
-   [ADR-0007](../adr/ADR-0007-knowledge-retrieval.md): Knowledge &
    retrieval — references with append-only versions, citable chunk spans,
    exact vector search with no ANN index (Prisma 7 cannot declare one
    without permanent drift), RRF fusion over two independently-failing
    legs, tenant and spoiler predicates in the SQL rather than after
    ranking, and an audit row per search. Embeddings run through the
    Phase 3 AI path so they share its retry policy and generation ledger.
-   [ADR-0008](../adr/ADR-0008-canon-authority.md): Canon authority &
    the candidate pipeline — append-only `canon_facts` with a self-FK
    supersede chain; one-live-value-per-subject+predicate enforced as a
    status-anchored partial unique index in SQL, not a service check; a
    four-statement supersede order (both two-statement orders violate a
    constraint); proposals as a status column with conflict as a flag, and
    no proposer-authored claim kind (basis comes from evidence);
    workspace-scoped `canon:read`/`canon:manage`/`canon:approve`, none of
    them platform capabilities. Realises baseline ADR-007.
-   [ADR-0009](../adr/ADR-0009-narrative-dna-soft-constraints.md):
    Narrative DNA as soft constraints — rhythm preferences inform the
    planner and never become a cron-like rule; hardness is per-concern and
    a HARD policy must state its reason. Realises baseline ADR-009.
-   [ADR-0010](../adr/ADR-0010-generic-narrative-primitives.md): Genre and
    story features compose generic narrative primitives (drama windows,
    cooldown, antagonist lifecycle, scale) rather than hard-coding a genre.
    Realises baseline ADR-010.
-   [ADR-0011](../adr/ADR-0011-planning-horizon-detail.md): Planning detail
    decreases with narrative distance — the horizon policy is per-novel
    JSONB, so distant chapters are not overplanned. Realises baseline
    ADR-011.
-   [ADR-0012](../adr/ADR-0012-evidence-backed-story-health.md): Story
    health reports evidence-backed findings (rule, severity, evidence,
    affected entities, status, remediation) and never a score. Realises
    baseline ADR-012.

New ADRs start from [ADR-TEMPLATE.md](../adr/ADR-TEMPLATE.md), use the
next sequential `ADR-NNNN` number, are filed under `docs/adr/`, and are
listed here.

Any reversal requires a new ADR that supersedes the old decision and
explains migration impact.
