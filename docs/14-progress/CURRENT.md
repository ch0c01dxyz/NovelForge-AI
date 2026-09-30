# Current Project State

Architecture baseline: V2 handoff pack created.\
Implementation status: **Roadmap phases 0–8 COMPLETE (2026-09-30)**, plus
the **AI Orchestrator milestone (2026-10-03)** — the `ai.generate`
lifecycle, which the roadmap schedules inside Phase 3/4 rather than as a
phase of its own (see the numbering note in
`docs/12-roadmap/IMPLEMENTATION-ROADMAP.md`).

- **Phase 0** — monorepo, Docker Compose (Postgres+pgvector, Redis),
  shared config, module boundaries, CI skeleton, Nuxt web shell, Fastify
  API health, worker + BullMQ bootstrap.
- **Phase 1** — auth, workspaces, memberships, novels, capability-based
  permissions (ADR-0004), audit log.
- **Phase 2** — chapters, immutable versions, autosave, editor shell,
  import/export.
- **Phase 3** — AIGateway/OmniRoute adapter, gateway + model registry,
  model profiles, logical requests/attempts, bounded retry/fallback,
  error classification, generation history, platform-admin authorization.
- **Phase 4** — versioned agents, skills, workflows; fail-closed
  structured-output contracts; validated acyclic graphs; deterministic
  multi-agent execution; run history.
- **Phase 5** — references with append-only versions, citable chunk spans,
  pgvector embeddings, hybrid lexical+vector retrieval (RRF), tenant and
  spoiler predicates in SQL, per-search provenance, `RETRIEVAL` workflow
  steps.
- **Phase 6** — canon facts with a DB-enforced one-live-value constraint,
  non-destructive supersede chain, candidate canon that cannot be silently
  committed, citable evidence spans; Story Brain answering FACT, STATE,
  EVENT, CAUSAL, UNRESOLVED, PROMISES with evidence; reader spoiler
  boundary on every read path. Independent adversarial audits found and
  fixed ten defects behind a green gate (details in `progress.md`).
  Slice 3 (2026-09-30) added the **write surface** the Brain had been
  reading without: events, timeline, threads, promises and causal edges are
  now authorable through the API, and the three pure rules that had no
  production caller (`canPromiseTransition`, `findCausalCycle`,
  `isChronological`) are enforced — two on the request, the third by the
  `(novel, order)` unique index.
- **Phase 7** — planning: synopses, sagas, outline nodes, outline versions,
  planning horizon; delete routes (planning entities, novels, canon
  entities, workflows) with FK hardening so refusals are legible 409s and
  canon/run history is never silently destroyed.
- **Phase 8** — character state, knowledge boundary, arcs, relationship
  stances, bonds (groups/agreements), transitions, meaningful
  interactions. Overlap is refused by three `btree_gist` EXCLUDE
  constraints, not only by the domain validators — each confirmed
  load-bearing by dropping it and retrying the refused statement. The
  roadmap exit criterion (monogamy/harem/polygamy and enemy-to-ally)
  is tested at the HTTP boundary in `apps/api/src/character.test.ts`.
- **AI Orchestrator (milestone, 2026-10-03)** — one `ai.generate`
  lifecycle entry point that resolves the agent/skill definitions the
  workflow executor also resolves (shared `definition-resolution.ts`),
  compiles context under a char budget with persisted provenance ids,
  assembles the prompt, and runs the generation through the SAME Phase 3
  path a direct request uses — plus fail-closed structured-output
  contracts and an SSE route whose refusals are real status codes, not
  error events.

Latest gate: lint 0; typecheck clean in every workspace (including
`apps/web`); `pnpm test` 31 files, 642 passed / 1 skipped on vitest
5.0.2; 16 migrations applying from empty with zero drift;
`pnpm -r build` green. Phase 8's eight new constraints were each
confirmed load-bearing by a drop-and-retry probe, and Phase 6 slice 3's
six CHECKs were confirmed the same way.

First run against a **real 9Router deployment** (2026-09-30) is recorded in
`progress.md` Round 9: gateway stored through the CRUD API (credential
encrypted at rest), 1 957 models synced, and the three-model chain
(`cbai/deepseek-v4.1-flash` → `…/DeepSeek-V4-Flash-0731` →
`…/MiniMax-M2.7`) verified end to end by disabling each tier in turn. It
found four defects the fixture-based suite could not: a start script that
could not run the app, a capability map hitting a `String[]` column, a
model sync outliving Prisma's transaction default, and an upstream SSE
sentinel on a non-streaming body stopping the fallback chain.

See `docs/implementation/progress.md` (round-by-round record),
`docs/implementation/test-matrix.md`, `docs/implementation/decisions.md`,
and `docs/adr/`.

## Next milestone

**Phase 9 — Reader Platform** per the roadmap, or the **Phase 6 leftover —
LLM fact extraction** (canon is author-authored only), which the
orchestrator now unblocks: extraction is a contracted agent whose output
is candidate canon needing approval (§2.13).

## Known gaps carried forward

### Character & relationship (Phase 8)

- **The blueprint's other tables are deferred by name**, in the schema
  docstring: `character_state_events`, `character_beliefs`,
  `relationship_events`, `relationship_groups`,
  `relationship_group_members`, `relationship_agreements`,
  `relationship_arcs`, and structured reputation / possessions /
  development-milestone columns. Each earns a table when a consumer asks
  for one (ADR-0008 §5's posture).
- **`characters` is standalone**, not a `StoryEntity` of kind CHARACTER.
  A link can be added when a consumer needs canon claims *about a
  character*; nothing in Phase 8 reads one.
- **No character UI.** The Phase 8 surface is API-only; the writer
  workspace still does not show character or relationship state.
- **The overlap EXCLUDEs are per-table, not global.** A `character_states`
  row and a `relationship_stances` row may name the same chapters — the
  constraints govern each table's own windows.
- **Stances are directional and unpaired.** `A→B ENEMY` with `B→A
  FRIENDLY` is representable and correct; nothing derives a "mutual"
  reading, because the one-sided feud is the case the direction exists
  for.
- **No retention or pruning** on any Phase 8 table; `meaningful_interactions`
  grows per recorded scene.

### Canon / knowledge

- **Canon has no `revision_id` until Phase 11.** It participates in no
  checkpoint or branch; non-destructive correction relies on the supersede
  chain alone (ADR-0008 §4).
- A canon fact's chapter citation is a historical pin — resolvable forever,
  but not "the current version" once the chapter is saved again.
- **LLM fact extraction is not implemented.** Canon is author-authored only;
  extraction would be candidate canon needing approval (§2.13).
- Chapter prose is not searchable (no chapter tsvector, no chapter chunks),
  so prose recall reaches reference material only.
- `available_from_chapter` is a chapter number, so a chapter reorder must
  recompute authored boundaries or the spoiler filter drifts.
- **No ANN index on embeddings.** Exact scan over a workspace's vectors;
  revisit with a raw-SQL migration when measurably slow (ADR-0007 §2).
- Retrieval quality is bounded by the chunker's paragraph/line/sentence
  heuristics.
- Ingestion is synchronous within the request; embeddings should move to
  the worker queue when documents are large enough to time out (CLAUDE.md
  §24).
- Only text ingestion exists; PDF/DOCX/TXT/Markdown extraction is not
  implemented (§32). `ReferenceKind.IMPORTED` is reserved for it.

### Story intelligence (Phase 6 slice 3)

- **No delete routes on any of the five tables.** `causal_edges` cascade
  from `story_events`, so deleting an event would silently take its causal
  claims with it (CLAUDE.md §9). A correction path needs a supersede chain
  before a delete is safe; the surface is append-and-transition only.
- **`story_thread_events` has no API.** The thread↔event join is
  schema-present and unused; it earns a route when something needs to
  render a thread's event history.
- **No timeline reorder.** `appendTimelineEvent` assigns the next slot and
  there is no way to move an entry — renumbering a timeline the reader has
  already seen is a deliberate non-goal, but insert-in-the-middle will need
  a design (likely explicit gaps, not renumbering).
- **The concurrent-append 409 has no covering test.** Prisma serialises
  injects on one connection, so the race cannot be forced deterministically;
  the branch is documented race defence.
- **No story-intelligence UI.** Events, threads, promises and causal edges
  are API-only; the writer workspace still shows none of them.
- **Timeline and story events are separate tables with no link.** A
  `timeline_events` row carries no `chapter_id` and no relation to a
  `story_event`; in-story time and reading order are not yet reconciled.
- **The Brain's EVENT/CAUSAL legs are unbounded lists** (the audit row caps
  provenance at 100). Pagination arrives when a novel's event count makes
  it matter.

### Delete semantics (settled 2026-10-02, migrations 20261002 / 20261002b)

- `canon_facts.entity_id`, `canon_facts.object_entity_id` and
  `canon_facts.novel_id` are `ON DELETE RESTRICT`: a canon fact is the
  record and survives every parent delete; the refusing route (entity or
  novel delete) answers 409. The block is PERMANENT — retraction withdraws
  a claim but keeps the row, so only unreferenced entities (and fact-free
  novels) delete.
- `workflow_runs.workflow_id` / `.workflow_version_id` are RESTRICT: run
  history is the execution audit trail; a workflow with runs (or a novel
  that has any) refuses with 409.
- `canon_proposals` FKs stay CASCADE — proposals are uncommitted candidate
  canon and die with their subject.
- Delete routes live for planning entities, novels, canon entities, and
  workflows; a novel-delete route test pins both refusal paths.

### Workflows

- A `RETRIEVAL` workflow step always searches in AUTHOR mode; the step
  contract has no `mode`/`readerChapter` field.
- Workflow runs execute synchronously within the request. Moving them to
  the worker queue is a later concern (Phase 13).
- An `AWAITING_APPROVAL` run stops but cannot yet be resumed. Its
  `completedAt` is deliberately null so a resume path can distinguish it
  from a finished run.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); no
  per-workspace override and no operator UI.

### Ops / editor

- **No retention or pruning on the audit tables.** `retrieval_audits`
  (now wider — one row per Brain ask too) and `Generation` rows grow
  unbounded. Needs a TTL, partition, or archive job before the tables are
  large — Phase 13 concern.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and Ubuntu.
