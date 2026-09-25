# ADR-0008: Canon Authority & the Candidate Pipeline

- **Status:** Accepted (2026-09-25)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0003 (database),
  ADR-0004 (authorization), ADR-0007 (knowledge & retrieval);
  baseline ADR-007 in `docs/13-decisions/ADR-INDEX.md` ("AI-generated
  facts become Candidate Canon before approval/commit") — this ADR is its
  implementation-phase realisation. The two numbers collide by accident
  of history; the baseline list is pre-implementation, the `ADR-NNNN`
  files are implementation-phase, and this file is the latter.

## Context

Phase 6 must make story truth queryable *with evidence* (roadmap: "Story
Brain can answer core factual/continuity questions with evidence"). Five
forces constrain how:

1. **Canon is the source of story truth** (CLAUDE.md §2.1, §5). AI output,
   embeddings, and summaries are not canon (§2.2), and an LLM may never
   commit canon silently (§2.13) — authorization is server-side, never
   model-decided (§2.18).
2. **Conflicts must be surfaced, not reconciled** (§5). A second live
   value for the same subject+predicate is a contradiction that must be
   visible, never silently absorbed by last-write-wins.
3. **Canon must never be destructively overwritten** (§2.11, §2.12). A
   correction has to leave the superseded claim readable.
4. **Structured facts belong in relational queries, not vector search**
   (§9). Character age and timeline order are rows, not embeddings.
5. **Reader-facing AI obeys the same spoiler boundaries as everything
   else** (§10) — including canon.

Two facts discovered before this decision shaped it materially:

- **A canon fact cannot be derived from prose.** A world rule or an
  approved commitment may appear in no chapter at all, and the same
  chapter text can support opposite readings. Canon therefore needs its
  own authoritative table; it is not a projection of the manuscript.
- **The manuscript is not searchable.** `Chunk.referenceVersionId` is a
  required FK to `ReferenceVersion`, so chunks exist only for imported
  references. Nothing indexes chapter prose.

## Decision

**We will store approved story truth in an append-only `canon_facts`
table with a self-referential supersede chain, and enforce
one-live-value-per-subject+predicate as a database constraint rather than
a service check. AI-generated and editor-proposed claims enter through
`canon_proposals`, which cannot become canon without an explicit
`canon:approve` decision.**

Scope boundaries of this decision:

- **Slice 1 ships** `story_entities`, `canon_facts`, `canon_fact_sources`,
  `canon_proposals`, three capabilities, and a deterministic read-only
  Story Brain answering `FACT`, `STATE`, and `RETRIEVAL`.
- **Slice 1 explicitly does not ship** `story_events`, `causal_edges`,
  `story_threads`, `story_promises`, `timeline_events`, hierarchical-memory
  tables, LLM fact extraction, the auto-approve class, or free-text
  question dispatch. The roadmap names eight concepts; it gates the phase
  on one sentence, and the exit sentence is reachable without them.
- **Slice 1 answers factual questions (FACT/STATE) and prose recall, not
  continuity-proper (EVENT/CAUSAL).** `EVENT`, `CAUSAL`, `UNRESOLVED` and
  `PROMISES` return an explicit not-implemented marker — never a
  fabricated answer. This narrows the gate sentence deliberately; it is
  recorded here as a decision rather than presented as meeting it.

### 1. Liveness is `status = 'ACTIVE'`, and the constraint is anchored on it

The live value for a `(novel, entity, predicate)` is the row with
`status = 'ACTIVE'`. Uniqueness is a **partial unique index**, written in
raw SQL because Prisma cannot declare a partial index without a preview
flag (precedent: `20260927_phase4_platform_key_uniqueness`):

```sql
CREATE UNIQUE INDEX canon_facts_live
  ON canon_facts (novel_id, entity_id, predicate)
  WHERE status = 'ACTIVE';
```

Keyed on **`(novel, entity, predicate)`**, not on the object: the
invariant is *one live value per subject and predicate*. Including the
object value would permit two contradictory live facts to coexist —
exactly the conflict the constraint is meant to catch — because two rows
with different objects never collide on a key that contains the object.

Because the key excludes the object, the same index also refuses a claim
*identical* to the live one: a duplicate collides on `(novel, entity,
predicate)` just as a contradiction does. That is the desired behaviour
(there is nothing to assert), but the two cases are told apart in the
service, before insert, by `classifyProposal` → `DUPLICATE`, so the caller
gets "this is already canon" rather than a bare `P2002`. A `DUPLICATE`
proposal is refused rather than stored: an approval gate keyed on "no
conflict recorded" would otherwise treat it as fresh and hit the index at
approval time instead of at proposal time.

Anchored on `status`, not on `superseded_by_id IS NULL`: a `RETRACTED`
row does not set `superseded_by_id`, so a supersede-anchored index would
trap the slot permanently and make re-asserting a retracted fact
impossible. Verified: with the status anchor, retraction frees the slot.

That rationale was carried for a round while `RETRACTED` had **no writer**
anywhere in the repository — the state was unreachable, so the index was
justified by a claim nothing exercised. `retractFact` and
`POST .../canon/facts/:factId/retract` now exist, and a test asserts the
slot actually frees: retracting leaves the row with `status = 'RETRACTED'`
and a NULL `superseded_by_id`, and a different value for the same subject
and predicate can then be asserted. Retraction sets no `valid_until_chapter`
— that column dates when a claim stopped being *true in-story*, which
withdrawal does not decide.

- **Retraction sets no `valid_until_chapter`; readers of the chain filter
  the status instead.** `valid_until_chapter` dates when a claim stopped
  being *true in-story*, and withdrawal does not decide that — so a
  retracted row keeps a NULL upper bound and its window stays open to
  infinity. That is correct as a record and wrong as an answer: the STATE
  chain query has no status filter, so a retracted row would be returned as
  the current value for every chapter at or after its start, forever, and
  would also appear in `notYetTrue` as a claim about to become true. Both
  call sites now exclude `RETRACTED` while leaving the row in place.

### 1b. Constraints added in the round-2 audit

- **`canon_fact_sources` evidence FKs are `ON DELETE RESTRICT`.** A citation
  is the only place a fact's span is stored, and `deleteChapter` hard-deletes
  any non-PUBLISHED chapter, so `CASCADE` let an ordinary draft deletion strip
  an ACTIVE fact's evidence with nothing canon-side recording why. The
  fact-owning FK stays `CASCADE` — losing the fact should take its citations
  with it — but losing the *source* must not silently hollow out a fact that
  survives.
- **`canon_proposals.object_entity_id` carries the same FK as
  `canon_facts.object_entity_id`.** It was a bare uuid while its twin was
  constrained, and `approveProposal` copies it verbatim into the constrained
  table.
- **Approval re-classifies against canon as it stands at approval time.**
  Competing proposals for one subject are a legitimate authoring flow, so no
  partial index forbids them; but `proposeCandidate` classifies against the
  live fact *at propose time*, and a live fact can appear afterwards.
  Approving a then-identical claim superseded a fact with a copy of itself —
  a phantom correction that shifts every as-of answer — so the decision point
  re-checks and refuses with a 409.


### 2. Supersession is four statements in this order

A plain (non-deferrable) self-FK plus a partial unique index cannot be
satisfied by either two-statement order — `UPDATE`-then-`INSERT` violates
the FK (`23503`), `INSERT`-then-`UPDATE` violates the index (`23505`).
Both were probed against PostgreSQL 16 and both fail. The shipped order
works because each statement's constraint is satisfiable on its own:

```
1. UPDATE canon_facts SET status='SUPERSEDED'
     WHERE novel_id, entity_id, predicate, status='ACTIVE'   -- leaves the index; no FK value yet
2. INSERT canon_facts (..., status='ACTIVE')                 -- enters the index; slot is free
3. UPDATE canon_facts SET superseded_by_id = <new.id>
     WHERE <the row just superseded>                         -- both rows exist; FK satisfied
4. UPDATE canon_proposals + audit.record                     -- (audit after commit)
```

Verified end-to-end including `COMMIT`: exactly one `ACTIVE` row
survives, the old row carries `status='SUPERSEDED'` and a populated
`superseded_by_id`. A duplicate `ACTIVE` insert correctly fails with
`23505`, which is what makes approval idempotent.

### 3. Proposals are a status column, not a second fact table

`canon_proposals` holds the claim under review; classification
(`NEW` | `DUPLICATE` | `FUNCTIONAL_CONFLICT`) is a nullable `conflict_kind`
stamped at propose time, **not** a status value. `CONFLICT` as a status
would make the auto-approve gate a forgettable code path; as a flag it is
structural. `claim_kind` is deliberately **absent** — basis is a property
of the evidence (CLAUDE.md §21), and a proposer-authored `ESTABLISHED`
label would let whoever writes the row satisfy the gate it is meant to
pass. Approval sets `canon_fact_id`, which is `@unique`, so a second
approve cannot mint a second fact.

### 4. Canon facts carry no `revision_id` until Phase 11

Versioning/revisions/checkpoints are Phase 11 (roadmap). Non-destructive
correction is met here by `status` + the supersede chain, which is
sufficient for the Phase 6 exit criterion but is **not** a general
revision model. Accepted consequence: canon mutations are not reachable
from a story transaction or checkpoint until Phase 11, and a canon fact
cannot participate in a branch. This is a known, bounded gap.

### 5. Entity identity is a naming layer, not detail modelling

`story_entities` asserts only that the story *names* a thing. It is not
canon — creating one commits no story truth and needs no approval
(§2.13 constrains canon commits, not naming). `key` is stable and unique
per novel; `name` is display. Character/relationship detail is Phase 8;
locations, factions, economy are Phase 10. A world rule is a canon fact
on a `CONCEPT` entity, so no `world_rules` table is needed.

### 6. Facts are workspace-scoped by denormalised `workspace_id`

`canon_proposals` carries `workspace_id` directly, matching
`Chunk.workspace_id` (ADR-0007): a filtered query must never join to
enforce isolation, because a join is a step a future query can forget.
Approve/reject routes are workspace-scoped like every other mutation
route, so the gate reads scope from the stored row.

### 7. Capabilities are workspace-scoped and split three ways

```
canon:read     OWNER ADMIN AUTHOR EDITOR
canon:manage   OWNER ADMIN AUTHOR
canon:approve  OWNER ADMIN AUTHOR
```

None is added to `PLATFORM_CAPABILITIES` or `PLATFORM_ONLY_CAPABILITIES`:
a platform `SUPER_ADMIN` is deliberately not a member of every workspace
(ADR-0005), and must not become the approver of every tenant's story
truth. EDITOR keeps `canon:read` and not `canon:approve` — an editor is a
continuity reviewer who *flags* conflicts; committing story truth stays
with the author (CLAUDE.md §5). Note this is an EDITOR-only boundary:
it does not prevent an author approving their own proposal.

### 8. Spoiler boundary ships now, with the existing predicate

`canon_facts.available_from_chapter` uses the identical column name and
null-means-invisible semantics as `Chunk.available_from_chapter`, and the
SQL predicate is copied verbatim from ADR-0007:

```sql
AND available_from_chapter IS NOT NULL
AND available_from_chapter <= $n::int
```

in READER mode only; AUTHOR and EDITOR short-circuit true. CLAUDE.md §10
warns specifically against treating stored data as safe to show, and adds
that assuming away a boundary is how leaks appear; adding the column
later to a populated table is the trap this avoids. A test asserts the
**withheld count**, not merely a short list — a post-filter leak passes
the latter.

**Every read path, not just the first one** (added in the round-2 audit).
The boundary is a property of the data, so it has to hold on *each* way
the data can leave the service. The first implementation applied it on the
FACT question and the Brain, and missed three sibling paths: the fact
**list** route applied no filter at all, and the **STATE** branch built
`notYetTrue` from the ungated row chain — disclosing a hidden fact's id
and the exact chapter its value takes effect, which is the same disclosure
the FACT branch refuses. STATE also keyed `insufficient` on the ungated
covering set, making `{claim: null, insufficient: false}` a positive
existence signal ("a claim holds here that you may not see") while FACT
reported the identical row as `insufficient: true`. Two rules follow, and
they are the general form of this mistake:

1. **A withheld row must be indistinguishable from an absent one.** Not
   merely unreadable — the response shape must not differ. A test asserts
   `toEqual` between the withheld and absent STATE bodies, because equal
   field values reached by different code paths is exactly what a
   shape-level leak survives.
2. **When a new read path is added, it inherits the boundary.** The list
   route defaults to READER, not to the permissive mode: an omitted
   `mode` is a 400 (`READER_CHAPTER_REQUIRED`), never an implicit grant.

Also settled here: the boundary is `available_from_chapter` compared
against the **reader's position only**. A STATE question's `atChapter` is
not a spoiler input and is deliberately not tied to `readerChapter` — the
in-story chapter a question asks about cannot widen what the reader may
see, and enumerating `atChapter` reveals nothing about a withheld fact.
That was raised as a defect in the audit and refuted on the code.


## Alternatives

- **A second "current fact" table with a pointer**, matching
  Chapter/Reference/Agent identity+currentVersion (`schema.prisma:194`,
  `799`, `503`) — rejected: a fact's content is never edited, only
  superseded, so the self-FK *is* the history. A pointer table adds a row
  and a join to express what `status` already says.
- **Enforce one-live-value in the service** (the original design lens) —
  rejected: it was justified by both object columns being nullable, which
  is a schema choice, not a constraint. With the index keyed on
  `(novel, entity, predicate)` the constraint *is* expressible, so a
  read-then-write pre-check is a race that need not exist. Service checks
  remain for the things a constraint cannot say.
- **`DEFERRABLE INITIALLY DEFERRED` on the self-FK** to permit the naive
  order — rejected: Prisma cannot express deferrability, so it would be a
  permanent drift source, and the status-anchored order needs no deferral.
- **`chunk_id` on `canon_fact_sources`** — rejected: retrieval DELETEs and
  re-inserts every chunk with a fresh uuid on re-ingest, so a chunk
  citation dangles after an unrelated re-ingest. Evidence is
  `(reference_version_id, start, end)` against an immutable version, which
  is the same identity ADR-0007 already verifies.
- **`generation_id` on sources and proposals** — rejected for slice 1:
  nothing in slice 1 can populate it (no extraction, no model in the
  answer path), so it would be a column that is NULL for every row the
  phase can write.
- **Materialising hierarchical memory L0–L6 as tables** — rejected:
  summaries are rebuildable projections (§2.2). Materialising without a
  `built_from_revision` FK is the Phase 11 problem, not the Phase 6 one.
- **`domain_outbox`** — rejected for now: the blueprint names it and no
  producer exists anywhere in the repo. Emitting without a durable outbox
  drops events on crash; recording the intent in the decision log until a
  consumer lands is the honest alternative.

## Consequences

- **Positive:** the conflict invariant is enforced by PostgreSQL, so no
  code path — including a future extraction pipeline — can create two live
  contradictory facts. Corrections are non-destructive by construction.
  The spoiler boundary is uniform with Phase 5 and testable now.
- **Positive:** the Story Brain's answer basis is computed from evidence
  (`MIN` over evidence, never `MAX`), so a chain containing one candidate
  row reports `INFERENCE`, not `ESTABLISHED_FACT`.
- **Negative:** canon participates in no revision/checkpoint/branch until
  Phase 11 (§4 above). A canon fact's chapter citation is a *historical*
  span: `ChapterVersion` is immutable but `Chapter.current_version_id`
  moves on the next save, so the cited version stops being current. The
  citation stays resolvable (the version still exists and its text is
  unchanged); "is this the current version" is not a property canon
  sources assert.
- **Negative:** the Story Brain's `RETRIEVAL` leg writes a `RetrievalAudit`
  row, widening the already-unpruned Phase 5 retention gap. This originally
  read "per ask", which was wrong: the row is written inside
  `RetrievalServices.search`, so the FACT, STATE and not-implemented answer
  paths — which never call search — write nothing. Those three are therefore
  NOT audited at all, which is the more serious half of this note: a
  structured answer about canon currently leaves no retrieval-audit trace.
  Ceiling recorded, not implemented here.
- **Negative:** `available_from_chapter` is a chapter *number*, and
  chapter numbers are swapped in a transaction during reorder. A reorder
  must recompute authored boundaries or the spoiler filter drifts. Phase 6
  ships no reorder path, so this is inherited exposure — but it is now on
  tables that are explicitly story truth.
- **Follow-ups:** slice 2 adds `story_events`, `causal_edges`,
  `story_threads`, `story_promises` (collapsing the blueprint's three
  thread tables to one row + status enum; `foreshadowing_items` is a
  promise). Slice 3 adds LLM fact extraction, the auto-approve class, and
  hierarchical-memory materialisation with a `built_from_revision` FK.
  Chapter-prose search (tsvector + a chapter retrieval leg) arrives with
  the first consumer that needs to *find* a span — extraction or a search
  UI — not before.
