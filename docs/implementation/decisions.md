# Decision Log

> Quick log of significant architectural decisions. The full record —
> Context/Decision/Alternatives/Consequences — lives in the ADR files.

Canonical index: [docs/13-decisions/ADR-INDEX.md](../13-decisions/ADR-INDEX.md).
ADR files live in `docs/adr/`; new ADRs start from
[docs/adr/ADR-TEMPLATE.md](../adr/ADR-TEMPLATE.md) and follow the
numbering rule recorded in the index.

Pre-implementation baseline decisions (V2 handoff pack) are recorded as
ADR-001..ADR-012 in the index. Implementation-phase decisions are
recorded as ADR-NNNN files:

| ADR | Decision | Status |
| --- | -------- | ------ |
| [ADR-0001](../adr/ADR-0001-module-boundaries.md) | Module boundary conventions; `@novelforge/contracts` holds the typed boundary map and domain event names | Accepted |
| [ADR-0006](../adr/ADR-0006-agent-skill-workflow-platform.md) | Agent/skill/workflow platform: append-only versioned definitions, scoped catalog, fail-closed contracts, validated graphs, one AI path, structural determinism | Accepted |
| [ADR-0007](../adr/ADR-0007-knowledge-retrieval.md) | Knowledge & retrieval: append-only reference versions, citable chunk spans, exact vector search (no ANN index — Prisma 7 cannot declare one without permanent drift), RRF fusion over two legs, tenant+spoiler predicates in SQL, one audit row per search, embeddings through the Phase 3 AI path | Accepted |

When a decision is made without a full ADR being warranted, record one
line here with date and rationale, and promote it to an ADR if it later
proves load-bearing.
