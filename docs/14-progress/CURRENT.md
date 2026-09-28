# Current Project State

Architecture baseline: V2 handoff pack created.\
Implementation status: **Phase 6 slice 1 COMPLETE (2026-09-25)**. Phase 0
(NF-0001..NF-0010), Phase 1 (auth, workspaces, memberships, novels,
permissions, audit), Phase 2 (chapters, immutable versions, autosave,
editor shell, import/export), Phase 3 (AIGateway/OmniRoute adapter,
gateway + model registry, model profiles, logical requests/attempts,
bounded retry/fallback, error classification, generation history,
platform-admin authorization), Phase 4 (versioned agents, skills and
workflows, fail-closed structured-output contracts, validated acyclic
workflow graphs, deterministic multi-agent execution, run history),
Phase 5 (references with append-only versions, citable chunk spans,
pgvector embeddings, hybrid lexical+vector retrieval with RRF fusion,
tenant and spoiler predicates in SQL, per-search provenance, `RETRIEVAL`
workflow steps), and Phase 6 slice 1 (canon facts with a DB-enforced
one-live-value-per-subject+predicate constraint, non-destructive supersede
chain, candidate canon that cannot be silently committed, citable evidence
spans, and a deterministic Story Brain answering FACT/STATE/RETRIEVAL with
evidence) are implemented, tested, and verified. An independent
audit of the committed Phase 4 code also found and fixed three live
defects in Phase 5 (a prototype key reaching the prompt, a DRAFT
WORKSPACE workflow being executable, and a prose bracket defeating
`extractJson`); two other reported findings were probed and disproved
(see `progress.md`). Full gate: lint 0, typecheck 0 in every workspace
except `apps/web` (a pre-existing hoisted-vite plugin type mismatch,
reproduced at HEAD with this phase's work stashed — see `progress.md`),
435 passed / 1 skipped, 10 migrations applying from empty with zero drift.

A second adversarial audit of Phase 6 slice 1 (eight finders, every finding
refuted-or-confirmed by an independent verifier) then found and fixed ten
defects behind that green gate — a supersede that destroyed history when
the proposal carried no `validFromChapter`, three sibling read paths that
bypassed the reader spoiler boundary, an existence oracle, an unmapped 500
on backdated corrections, a cascade that could delete canon evidence, an
unconstrained `object_entity_id`, a self-copy supersede, an unwritable
`RETRACTED` state, and machine keys in user-facing statements. Two further
findings were refuted on the code and deliberately not "fixed". Details in
`progress.md` and `decisions.md`.
See `docs/implementation/progress.md`,
`docs/implementation/test-matrix.md`,
[ADR-0007](../adr/ADR-0007-knowledge-retrieval.md) and
[ADR-0008](../adr/ADR-0008-canon-authority.md).

## Next milestone

Phase 6 slice 2 --- story events, causal edges, threads and promises, then
LLM fact extraction. The roadmap's Phase 6 exit ("Story Brain can answer
core factual/continuity questions with evidence") is met for FACT and STATE
with resolvable evidence; the continuity forms (EVENT/CAUSAL/UNRESOLVED/
PROMISES) currently return an explicit not-implemented marker, so slice 2
is what closes the continuity half of that sentence.

## Known gaps carried into Phase 6 slice 2

- **Canon has no `revision_id` until Phase 11.** It participates in no
  checkpoint or branch; non-destructive correction relies on the supersede
  chain alone (ADR-0008 §4).
- A canon fact's chapter citation is a historical pin — resolvable forever,
  but not "the current version" once the chapter is saved again.
- Chapter prose is not searchable (no chapter tsvector, no chapter
  chunks), so prose recall reaches reference material only. Add with the
  first real consumer (extraction or a search UI).
- `available_from_chapter` is a chapter number, so a chapter reorder must
  recompute authored boundaries or the spoiler filter drifts.
- **The Brain's structured answers are not audited.** The `RETRIEVAL` leg
  writes a `RetrievalAudit` row; `FACT`, `STATE` and the not-implemented
  responses never call `search`, so they write nothing. An earlier note said
  "a row per ask" — false, and the truth is worse.
  FIXED (2026-10-02): every structured ask leg now writes one row via
  `auditBrainAsk` (`BRAIN:ASK …` query, `BRAIN:<KIND>` retriever, per-leg
  returned/withheld/provenance). READER rows record 0/0 + empty provenance so
  the audit table stays a non-existence-oracle. The RETRIEVAL leg is untouched —
  `search` already writes its own row.
- **Entity delete + canon cascade.** FIXED (2026-10-02): the entity-delete
  route landed with the FKs hardened first — `canon_facts.entity_id` and
  `canon_facts.object_entity_id` are now `ON DELETE RESTRICT` (both indexed;
  migration `20261002_phase7_delete_route_fk_hardening`), so `DELETE` returns
  409 when any fact cites the entity and the canon row survives with its
  citations. The block is PERMANENT: retraction withdraws a claim but keeps
  the row (CLAUDE.md §9), so only unreferenced entities are deletable.
  `canon_proposals` FKs stay CASCADE — proposals are uncommitted candidate
  canon and correctly die with their subject. The same migration made
  `workflow_runs.workflow_id` / `.workflow_version_id` RESTRICT, so run
  history outlives definition deletion (a `workflow.delete` route with a 409
  on run history landed alongside).

- **No ANN index on embeddings.** Prisma 7.10 cannot declare HNSW or
  IVFFlat, so search is an exact scan over a workspace's vectors. Correct
  at current scale; revisit with a raw-SQL migration when it is
  measurably slow (ADR-0007 §2).
- Retrieval quality is bounded by the chunker's paragraph/line/sentence
  heuristics. No semantic chunking, no overlap between chunks.
- Ingestion is synchronous within the request. Embeddings should move to
  the worker queue once a document is large enough to time out a request
  (CLAUDE.md §24).
- Only text ingestion exists: PDF/DOCX/TXT/Markdown extraction is not
  implemented (CLAUDE.md §32). `ReferenceKind.IMPORTED` is reserved for it.
- A `RETRIEVAL` workflow step always searches in AUTHOR mode; the step
  contract has no `mode`/`readerChapter` field.
- Workflow runs execute synchronously within the request. Moving them to
  the worker queue is a later concern (Phase 13); the run record already
  carries status and timing for it.
- An `AWAITING_APPROVAL` run stops but cannot yet be resumed. Its
  `completedAt` is deliberately null so a resume path can distinguish it
  from a finished run.
- `WorkflowRun` -> `Workflow` is `onDelete: Restrict` (2026-10-02
  migration): run history survives; a workflow with runs is refused with
  a 409 by the delete route.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); there is no
  per-workspace override and no operator UI to change it at runtime.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.
- **No retention or pruning on the Phase 5 audit tables.** Every search
  inserts a `retrieval_audits` row carrying the full JSONB provenance
  array, and every embed call inserts a `Generation` row; neither is ever
  deleted, and the worker is heartbeat-only. CLAUDE.md §22 requires
  retention to be considered when prompts and outputs are stored, and
  ADR-0007 §5 makes auditing mandatory without setting a ceiling. Needs a
  TTL, partition, or archive job before the tables are large — a
  Phase 13 (worker/ops) concern.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and
    Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and
    Ubuntu.

Do not implement advanced story engines before Phase 0 conventions are
stable.
