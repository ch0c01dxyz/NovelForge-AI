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

Any reversal requires a new ADR that supersedes the old decision and
explains migration impact.
