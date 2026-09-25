# ADR-0007 — Knowledge & Retrieval

- **Status:** Accepted (2026-09-25)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0003 (database),
  ADR-0005 (platform administration), ADR-0006 (agent/skill/workflow
  platform)

## Context

Phase 5 must make retrieval "evidence-bearing and tenant-safe". Four
forces constrain the design:

1. **References are not canon** (CLAUDE.md §2.2, §9). Imported material
   must never be mistaken for story truth, and nothing in the knowledge
   engine may write to a story table.
2. **Spoiler boundaries are a retrieval concern, not a display concern**
   (CLAUDE.md §10). "Never assume that information stored in the database
   is safe to show to readers" — a ranked list that is filtered after
   ranking has already read rows the caller may not see.
3. **Multi-tenancy is a query predicate.** A reference belongs to exactly
   one workspace. Filtering results in application code makes the wrong
   rows part of the response object's history, and makes a leak a matter
   of one forgotten `if`.
4. **Embeddings are a rebuildable projection** (CLAUDE.md §2.2). Losing
   the vector index must be recoverable by re-running ingestion, so
   chunks and embeddings are derived from an immutable
   `ReferenceVersion`, never edited in place.

pgvector is already present (ADR-0003 enabled it in the initial
migration). What Phase 5 had to decide is how to *use* it.

## Decision

### 1. Three tables, three roles

- `references` — identity, tenant scope, optional novel scope, lifecycle
  status (`DRAFT` / `ACTIVE` / `ARCHIVED`), and a pointer to the current
  version.
- `reference_versions` — append-only immutable text, with a SHA-256
  `content_hash` and `char_count`. Chunks are keyed to a version, so a
  re-ingest can never mix text from two revisions in one index.
- `chunks` — the citable unit: `text` plus the exact `[start, end)`
  character span in its version's content, a generated `tsvector`, the
  `index` within the version, and the spoiler boundary
  `available_from_chapter`.
- `embeddings` — one row per chunk, holding the vector as a rebuildable
  projection. `dimensions` and `model` are stored alongside so a search can
  exclude vectors that are not comparable with its query vector: `dimensions`
  catches a model of a different width, and `model` catches a different model
  of the SAME width (a remapped profile), which the width check cannot see.

Publishing is refused while a reference has no chunks: an `ACTIVE`
reference with nothing to find is a silent no-op the author would read as
a broken index.

### 2. Exact vector search, no ANN index

The `vector(1536)` column carries **no** HNSW or IVFFlat index. Prisma
7.10 cannot express either index type in `schema.prisma` — every spelling
is rejected — so adding one would require either a raw-SQL migration that
`migrate diff` reports as drift forever, or a dimensionless `vector`
column that accepts mixed widths and silently corrupts cosine distance.

Zero-drift is a project verification gate, so exact search wins for now.
A sequential scan over a workspace's embeddings is correct at the scale a
single tenant reaches. The upgrade path is an explicit raw-SQL migration
that adds HNSW on the fixed-width column plus a `migrate diff` exemption,
documented when it is needed.

### 3. Hybrid retrieval by ranked-list fusion

Two independently-failing legs:

- **LEXICAL** — `to_tsvector('english', text) @@ plainto_tsquery(...)`
  over a GIN index, ranked by `ts_rank_cd`.
- **VECTOR** — exact cosine (`<=>`) over `embeddings`.

They are combined with Reciprocal Rank Fusion (k=60), which uses **ranks
only**, never raw scores. `ts_rank_cd` and cosine distance are not on a
comparable scale, and normalizing one against the other would invent a
calibration that has no empirical basis.

Each leg is wrapped so a failure degrades rather than aborts: a broken
vector leg still returns lexical results, and `retrieval_audits.retrievers`
records which legs actually ran, so a degraded search is distinguishable
from a complete one that happened to match little.

### 4. Tenant and spoiler predicates live in the SQL

Workspace id, `reference.status = 'ACTIVE'`, the novel filter, and the
reader spoiler boundary are all in the `WHERE` clause of both legs.
Filtering a ranked list afterwards would mean reading rows this caller may
not see at all — with the timing and ranking side channels that implies.

`canView` is then re-applied in application code as defence in depth, and
its independent role is to compute `withheldCount`: how many candidates
the boundary removed. That number is what an operator needs when a reader
reports missing content, and the SQL cannot report it.

The spoiler predicate is deny-by-default: a chunk with no
`available_from_chapter` is withheld from readers, an unrecognised mode
resolves to `READER`, and a reader position defaults to chapter 0 rather
than unbounded.

### 5. Every search is audited

`retrieval_audits` records the query, the mode, the reader position, the
returned and withheld counts, the per-result provenance (chunk id,
reference version id, span, per-retriever rank, fused score), which legs
ran, and the latency. `step_run_id` and `generation_id` link a retrieval
to the workflow step or generation that issued it.

Neither link is unique: a step may legitimately retrieve more than once,
and a unique constraint would turn that into a 500 mid-run.

### 6. Embeddings go through the Phase 3 AI path

`AiServices.embed` mirrors `generate`: it writes a `Generation` row with
profile `EMBEDDING` before the transport call, routes through
`GatewayManager.embed` (sharing `routeAttempts`, so retry, jittered
backoff, error classification and the circuit breaker cannot drift
between the two operations), and updates that row to `SUCCEEDED`/`FAILED`
with the classified category. An embedding is an AI call that costs
money; it belongs in the same ledger (CLAUDE.md §22).

The provider's response is validated before persistence: a wrong vector
count or a wrong width is a conflict, not a silently mis-aligned
projection — every later citation into that version would name text that
is not what was embedded.

### 7. `RETRIEVAL` workflow steps reuse the same service

The Phase 4 executor declares a narrow `StepRetriever` port, satisfied by
`RetrievalServices.search`. A retrieval step therefore inherits the tenant
and spoiler predicates and the audit row for free, and cannot be a second,
weaker search path. Steps run in `AUTHOR` mode: the caller already holds
`workflow:run` and `reference:read`, so they are the novel's author, not a
reader.

## Alternatives considered

- **ANN index (HNSW/IVFFlat).** Rejected for now: Prisma 7.10 cannot
  declare it, and the workarounds trade a real correctness property
  (fixed width, zero schema drift) for a performance property this
  deployment does not yet need. Revisit with a raw-SQL migration when a
  tenant's embedding count makes a scan measurably slow.
- **Dimensionless `vector` column.** Rejected: it accepts any width, so a
  model change would silently mix 1536- and 3072-dimensional vectors and
  produce meaningless distances rather than an error.
- **Score normalization instead of RRF.** Rejected: the two legs' scores
  are not comparable, and any normalization constant would be invented.
- **Post-ranking spoiler filter only.** Rejected: reads rows the caller
  may not see, and makes the leak a matter of one missing `if`.
- **A separate retrieval implementation for workflow steps.** Rejected:
  two search paths means two places for the predicates to drift; the
  weaker one leaks.
- **Publishing a reference before ingestion.** Rejected: it would enter
  the retrieval scope unfindable, which reads as a broken index.

## Consequences

- Adding a knowledge item means creating a version and ingesting it;
  re-ingesting is idempotent and replaces the projection in one
  transaction.
- Deleting a reference cascades through versions, chunks and embeddings.
  An append-only version row is never mutated.
- A model change requires re-ingestion: the `model` filter excludes vectors
  produced by the previous model, so a changed model is a visible empty
  result rather than a wrong one. The ingest idempotence check compares the
  stored model against the profile's current mapping, so the re-ingest that
  repairs it is not skipped as "already done".
- Retrieval quality is bounded by exact search and by the chunker. Both are
  measurable; neither is claimed to be optimal.
- No object storage is involved: reference text lives in PostgreSQL. Large
  binary imports (PDF/DOCX) are extracted to text before they reach this
  layer; storing raw binaries is a later concern.
