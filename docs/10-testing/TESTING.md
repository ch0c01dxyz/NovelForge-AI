# Testing Strategy

## Layers

-   Unit: domain rules, validators, planners/policies.
-   Integration: PostgreSQL repositories, transactions, queue jobs,
    OmniRoute adapter with mocks.
-   Contract: API schemas, agent structured outputs, gateway
    normalization.
-   E2E: critical author workflows.
-   Migration: forward migration + representative rollback/recovery
    strategy.
-   Property/invariant tests where useful for versioning and timeline
    logic.

## Mandatory scenarios

-   timeout -\> bounded retry -\> success/failure audit;
-   streaming interruption does not create duplicate chapter content;
-   candidate canon conflict is not silently committed;
-   knowledge-boundary violation detected;
-   checkpoint restore creates a new revision and preserves later
    history;
-   derived embeddings invalidated after canonical rollback;
-   branch simulation cannot mutate main;
-   selective restore reports dependency conflicts;
-   synopsis cannot override contradictory canon;
-   repeated drama pattern produces evidence-backed warning;
-   endgame closure does not auto-create new major conflict;
-   tenant cannot access another tenant's novel.
