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
| [ADR-0008](../adr/ADR-0008-canon-authority.md) | Canon authority & candidate pipeline: append-only `canon_facts` with a self-FK supersede chain; live-uniqueness enforced by a status-anchored partial unique index; four-statement supersede order; proposals as a status column with conflict as a flag; basis from evidence, never a proposer-authored claim kind; workspace-scoped canon capabilities | Accepted |

## Phase 6 (Story Intelligence Core)

- **2026-09-25 — Slice 1 scope.** Phase 6 ships canon + candidate canon +
  a deterministic Story Brain (FACT/STATE/RETRIEVAL). `story_events`,
  `causal_edges`, `story_threads`, `story_promises`, `timeline_events`,
  hierarchical-memory tables, LLM extraction and free-text dispatch are
  **slice 2/3**. The roadmap names eight concepts but gates the phase on
  one sentence ("Story Brain can answer core factual/continuity questions
  with evidence"), and that sentence is reachable without them. Recorded
  as a decision, not an oversight.
- **2026-09-25 — Continuity-proper is deferred.** Slice 1 answers factual
  questions and prose recall; `EVENT`/`CAUSAL`/`UNRESOLVED`/`PROMISES`
  return an explicit not-implemented marker. The roadmap's word
  "continuity" maps to exactly those deferred forms, so slice 1 narrows
  the gate sentence deliberately. See ADR-0008.
- **2026-09-25 — Chapter prose search deferred.** Chapters are not
  searchable (no tsvector, no chapter chunks) and slice 1 does not add
  it: nothing in slice 1 *queries* prose. Evidence for a canon fact
  resolves from a stored `(chapter_version_id, start, end)` span against
  an immutable version, which needs no index. Search is how an actor
  *finds* a span, and slice 1 has no search UI, no NL dispatch and no
  extraction. Add the tsvector + chapter retrieval leg with the first
  real consumer.
- **2026-09-25 — `domain_outbox` not built.** The blueprint names it; no
  producer exists repo-wide. Emitting without a durable outbox drops
  events on crash, so the intent is recorded here until a consumer lands.
- **2026-09-25 — RETRACT is not a one-way trap.** The live-uniqueness
  index is anchored on `status = 'ACTIVE'` rather than
  `superseded_by_id IS NULL`, so retracting a fact frees its slot and the
  same claim can be re-asserted. Verified against PostgreSQL.
- **2026-09-25 — Probed, not assumed.** The supersede order and the
  index's enforcement were proven against a real PostgreSQL database
  before the migration was written: both two-statement orders fail
  (`23503` / `23505`), the four-statement order commits with correct
  final rows, and a duplicate `ACTIVE` insert is refused.

When a decision is made without a full ADR being warranted, record one
line here with date and rationale, and promote it to an ADR if it later
proves load-bearing.
