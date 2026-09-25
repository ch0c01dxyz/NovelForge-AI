# Current Project State

Architecture baseline: V2 handoff pack created.\
Implementation status: **Phase 5 COMPLETE (2026-09-25)**. Phase 0
(NF-0001..NF-0010), Phase 1 (auth, workspaces, memberships, novels,
permissions, audit), Phase 2 (chapters, immutable versions, autosave,
editor shell, import/export), Phase 3 (AIGateway/OmniRoute adapter,
gateway + model registry, model profiles, logical requests/attempts,
bounded retry/fallback, error classification, generation history,
platform-admin authorization), Phase 4 (versioned agents, skills and
workflows, fail-closed structured-output contracts, validated acyclic
workflow graphs, deterministic multi-agent execution, run history), and
Phase 5 (references with append-only versions, citable chunk spans,
pgvector embeddings, hybrid lexical+vector retrieval with RRF fusion,
tenant and spoiler predicates in SQL, per-search provenance, `RETRIEVAL`
workflow steps) are implemented, tested, and verified. An independent
audit of the committed Phase 4 code also found and fixed three live
defects in this phase (a prototype key reaching the prompt, a DRAFT
WORKSPACE workflow being executable, and a prose bracket defeating
`extractJson`); two other reported findings were probed and disproved
(see `progress.md`). Full gate: lint 0, typecheck 0, 350 passed / 1
skipped, 9 migrations applying from empty with zero drift. See
`docs/implementation/progress.md`,
`docs/implementation/test-matrix.md` and
[ADR-0007](../adr/ADR-0007-knowledge-retrieval.md).

## Next milestone

Phase 6 --- Story Intelligence Core (canon, candidate canon, timeline,
story events, threads, promises, causal edges, hierarchical memory).
Exit: Story Brain can answer core factual/continuity questions with
evidence.

## Known gaps carried into Phase 6

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
- `WorkflowRun` -> `Workflow` is `onDelete: Cascade`, so deleting a
  workflow would take its run history with it. Nothing deletes a workflow
  today; move the FK to `Restrict` before a delete endpoint exists.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); there is no
  per-workspace override and no operator UI to change it at runtime.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

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
