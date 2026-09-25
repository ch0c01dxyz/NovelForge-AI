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
  same claim can be re-asserted. Verified against PostgreSQL. (Round 2: the
  state now has a writer — `retractFact` — and a test that pins the
  slot-freeing behaviour; before that the justification was untestable.)
- **2026-09-25 — Evidence FKs are RESTRICT, not CASCADE.** A citation is the
  only place a fact's span is stored, and `deleteChapter` hard-deletes
  non-PUBLISHED chapters, so CASCADE let a routine draft deletion strip a
  live fact's evidence silently. Deleting a cited chapter now fails loudly
  until the author unlinks it. The fact-owning FK stays CASCADE: losing the
  fact should take its citations with it.
- **2026-09-26 — A RESTRICT with no unlink path is not a fix.** The round above
  made the failure loud but left it unescapable: `deleteChapter` had no
  try/catch, so the FK violation was an unmapped 500, and the unlink route the
  migration comment promised did not exist. Refusing an operation is only
  correct if the caller can act on the refusal. Both halves now ship together
  — a mapped 409 naming the cause, and
  `DELETE .../canon/facts/:factId/sources/:sourceId` to release it.
- **2026-09-26 — A migration that has been committed is immutable.** The
  evidence-FK hardening (both `canon_fact_sources` version FKs to `RESTRICT`,
  plus the missing `canon_proposals.object_entity_id` FK and its index) was
  first written as edits in place to `20260929_phase6_story_intelligence`.
  That is safe only while unreleased. Prisma records a migration by CHECKSUM,
  so editing one that has run anywhere makes every deployed database disagree
  with the repository and `migrate deploy` refuses to proceed — the failure
  appears on someone else's machine, at deploy time, pointing at a migration
  they never touched. The changes now live in
  `20260930_phase6_evidence_fk_hardening`, which restores the Phase 6
  migration to its committed bytes and leaves an already-edited database only
  one migration behind — a normal deploy rather than a baseline reset. It is
  NOT re-runnable: replaying the file against a hardened database fails on
  `CREATE INDEX` (duplicate index), measured rather than assumed. The end
  state is the same however the change arrived; the file itself cannot be run
  twice. The statements were generated with `prisma migrate diff` rather than
  written by hand, so the drift check is the proof of agreement rather than a
  hope.
- **2026-09-26 — Supersede respects an authored validity window.** `closeAt`
  was computed only from the two start chapters, so superseding `black [1,9)`
  with a ch-20 claim rewrote it to `[1,20)` — filling a gap the author left
  and changing what held at chapters 10..19. A later claim may close an OPEN
  end; it may not re-date a bound the author set. (Round 2: the authored end
  caps the window from above, but the correction caps it too. A replacement
  starting INSIDE the span — ch 5 against `black [1,9)` — closed at 9 left
  the old row claiming black held at 5..8 while the ACTIVE row answered
  white there. So the close point is the earlier of the authored end and
  the start-derived close: a correction may SHORTEN an authored window,
  never lengthen one. `min` cannot dip below the old start — both operands
  are >= it — so the window-ordered CHECK keeps holding.)
- **2026-09-26 — A record of a fix is not a fix.** Round 4's progress entry
  asserted three fixes that had no diff, no test and no migration — a
  fabricated record, written in the same commit as the honest ones and
  carrying the same confidence. Two were real defects and are now actually
  fixed: an emptied window was still offered by `notYetTrue`, the approve
  transaction's `P2002` was mapped without checking which constraint fired,
  and the list routes are still unbounded, now recorded as open rather than
  claimed fixed. The rule this round ran on: every claimed fix names the
  test that fails without it.
- **2026-09-26 — The supersede is a compare-and-set, like its siblings.**
  `retractFact` and the proposal decision already predicate their writes on
  the status they read; the supersede's first statement did not. A retract
  committing RETRACTED between `priorLive`'s read and the write was then
  silently reversed to SUPERSEDED and left linked to the successor that
  replaced it — ADR-0008 §1's forbidden state, and a withdrawn value that
  every as-of query past the correction chapter kept answering. `updateMany`
  on `status: "ACTIVE"` with a zero-count throw, so the decision commits
  with its supersede or neither does.
- **2026-09-26 — `supersededById` is absent for a reader, not null.** The
  id names the replacement, and the replacement may sit behind a boundary
  the reader has not reached; an id is enough to confirm a future fact
  exists. That is the same existence oracle `withheldCount` and the FACT
  path's redaction already refuse, so the reader select omits the column and
  the field is optional in `FactListResult` — the shape `sources` already
  uses for exactly this reason.
- **2026-09-26 — Evidence spans are not shown to readers at all.** Neither
  `ChapterVersion` nor `ReferenceVersion` carries a spoiler boundary, so a
  source's `quote` cannot be classified from the row that references it. The
  reader-facing list omits `sources` entirely rather than gating text it
  cannot classify; the writer's visible row boundary is not a proxy for the
  quoted text's. `withheldCount` is likewise 0 for readers — it is an
  existence oracle, and the author-only drift signal it exists for does not
  need a reader to see it.

- **2026-09-25 — The approval gate re-classifies against current canon.**
  `proposeCandidate` classifies against the live fact *at propose time*, but
  competing proposals for one subject are legitimate and a live fact can
  appear between propose and approve. Without a re-check at the decision
  point, approving a now-identical claim supersedes a fact with a copy of
  itself — a phantom correction that shifts every as-of answer. Caught at
  approve, not by a second partial unique index on `canon_proposals`, which
  would have wrongly forbidden proposing alternatives.
- **2026-09-25 — Probed, not assumed.** The supersede order and the
  index's enforcement were proven against a real PostgreSQL database
  before the migration was written: both two-statement orders fail
  (`23503` / `23505`), the four-statement order commits with correct
  final rows, and a duplicate `ACTIVE` insert is refused.
- **2026-09-25 — A green first pass is not coverage.** Round 2's ten defects
  were all in code the first pass had tests for — the tests covered the
  primary path and missed the second path onto the same data (list and STATE
  vs FACT; optional `validFromChapter` vs supplied). The durable lesson is
  the refutation step, not the finder step: of eight findings that read as
  serious, two were wrong on the code and saying so prevented two bad
  "fixes".

When a decision is made without a full ADR being warranted, record one
line here with date and rationale, and promote it to an ADR if it later
proves load-bearing.
