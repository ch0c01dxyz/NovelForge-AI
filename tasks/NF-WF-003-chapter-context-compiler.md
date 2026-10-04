# Task NF-WF-003: shared chapter context compiler and identity/source pins

Status: **PLANNED** — not dispatchable. The author scope decision is RESOLVED
("Full tiered compiler", see "Scope decision"). Do not start coding from this
file until it is separately reviewed.
Milestone / capability IDs: M1 / G-02 (chapter context), per
[DELIVERY-PLAN](../docs/implementation/DELIVERY-PLAN.md).
Implementer role / requested and resolved model: unassigned. Author-selected
coding models are `deepseek-v4.1-flash` and `glm-5.3-flash`; the resolved
model must be recorded at dispatch, not assumed.
Reviewer role / requested and resolved model: unassigned; a separate reviewer
must read the exact submitted diff. Reviewer backend identity is UNVERIFIED
(GAP-013).
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-002F
returned VERIFIED for the evidenced M1 foundation scope only (2026-10-04);
NF-WF-003 depends on NF-WF-002 and inherits nothing else from it.
Frozen review manifest / exact artifact paths and identity: none yet. The
manifest is frozen at submission and must not hash itself. **It must include the
whole of `orchestrator.ts` and `canon.ts`, not excerpts**: the contract's claims
that `compile` reads *only* two services and is called *only* from the two
generate paths are whole-file negative claims, and a review that cannot see the
whole file cannot falsify them.
Baseline revision / local changes to preserve: the NF-WF-002 foundation as
committed at HEAD `4e63116` (which includes the 002F acceptance record); this
task must not stash, reset or revert it.
Engram checkpoint topic key / last confirmed observation reference: written
under the runtime-bound identity confirmed at this boundary
(`fae4b412-db3a-4ddc-a052-cfda214cfa9d`). GAP-021 remains per-boundary.

## Goal and reason

One context compiler, shared by every path that builds a generation prompt,
that selects by the constitution's priority order and never drops mandatory
context to satisfy a budget.

**The measured problem.** Two divergent context paths exist today:

1. `compile()` in `apps/api/src/services/orchestrator.ts:135` — a closure
   inside `createOrchestratorServices` (`:101`), not exported, called only by
   `generate` (`:294`) and `generateStream` (`:349`) in the same file. It reads
   **only** `canon.listFacts` (`:156`) and `retrieval.search` (`:180`). No
   outline, no chapter, no story position, no planning horizon, no Narrative
   DNA, no character/relationship/timeline read, and no revision or source pin.
2. The workflow `RETRIEVAL` step in
   `apps/api/src/services/workflow-runs.ts:460`, which calls
   `retrieval.search` with its own `limit: 10` (`:468`) and no budget at all,
   then hands the rendered text to a later `AGENT` step.

CLAUDE.md §7 requires "Direct chapter generation and chapter workflow steps must
use the same context rules." Today they do not — this is a second-path
divergence of the kind that has already produced four real defects in this
repository.

**And the truncation is backwards — and the read behind it is unbounded.**
`canon.listFacts` (`apps/api/src/services/canon.ts:1415`) issues
`db.canonFact.findMany({ where, orderBy: { createdAt: "asc" }, select })`
(`:1445` AUTHOR, repeated `:1473` READER; `orderBy: { createdAt: "asc" }` at
`:1447` and `:1475`) with **no `take` and no `limit` on either call**. Both
findMany sites were read directly; the wider claim that the file contains no
`take:`/`limit:` at all is reproducible with
`rg -n '\btake\b|\blimit\b' apps/api/src/services/canon.ts`, whose only hit at
the frozen revision is a prose comment at `:672`. So it returns *every* ACTIVE
fact for the novel, and `compile` walks that
full list with `break` on budget (`orchestrator.ts:165-171`) under a fixed
`FACT_BUDGET_CHARS = 6_000` (`:28`). Two violations in one path:

1. **The unbounded read itself** — CLAUDE.md §2.16 ("No routine generation
   request may scan or inject the entire manuscript") and §7 ("Fetch bounded
   relevant records").
2. **The order decides what survives** — because the read is `createdAt asc` and
   the walk `break`s, the budget **keeps the oldest facts and discards the
   newest**, i.e. the facts most relevant to the chapter being written. §7
   states the requirement directly: "Fetch bounded relevant records; do not
   fetch all facts and truncate by creation order."

The fix is therefore not only "change the sort" — a bounded, relevance-ordered
selection replaces the unbounded read *and* the post-hoc `break`. A test that
merely reverses the sort would still fetch every fact and would still pass with
the §2.16 violation intact.

## Required reading

- [Operating constitution](../AGENTS.md) (equivalent `CLAUDE.md`) — §7 (context rules), §2.16 (no
  full-manuscript scan), §8 (long-form consistency), §11 (definition of done).
- [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- `docs/03-domain/STORY-VERSIONING.md` §C12 — the tri-state head expectation
  this task must pin against.
- ADR-0013 (workflow delivery/recovery), ADR-0014 (revision/checkpoint model).
- Source to read before designing anything: `apps/api/src/services/orchestrator.ts`
  (whole file — it is ~400 lines), `apps/api/src/services/workflow-runs.ts`
  around the `RETRIEVAL` step, `apps/api/src/services/canon.ts` `listFacts`
  (`:1415`), `apps/api/src/services/retrieval.ts` `search` (`:848`),
  `apps/api/src/services/planning.ts` (`approveOutlineVersion` `:575`,
  `supersedeApprovedOutline` `:667`, `planningHorizon.findUnique` `:707`),
  `apps/api/src/services/revisions.ts` (exports only),
  `packages/planning/planning.ts` `horizonFor` (`:202`).
- Existing tests: `apps/api/src/orchestrator.test.ts`, `retrieval.test.ts`,
  `canon.test.ts`, `planning.test.ts`.

## Dependencies and evidence

- **NF-WF-002 / G-01** — accepted 2026-10-04 for the evidenced foundation scope
  only. The revision/source-pin primitives this task consumes are the ones that
  verification covered: `readHeadRevisionId` (`:135`), `assertHeadExpectation`
  (`:159`), `captureSnapshot` (`:269`), `advanceHead` (`:307`, the locked CAS
  via `SELECT … FOR UPDATE`), `advanceForMutation` (`:482`) and
  `createWithRevision` (`:516`) in `apps/api/src/services/revisions.ts`, plus
  `novel_branches.head_revision_id`.
- **NF-WF-002F** — `tasks/NF-WF-002F-foundation-acceptance.md`; its "Next"
  section authorizes preparing this contract and forbids dispatching it as-is.
- Active issues this task must respect, from
  [ISSUES-AND-GAPS](../docs/implementation/ISSUES-AND-GAPS.md):
  - **GAP-004** (cross-domain recovery, OPEN/P1) — this task must not claim to
    close it.
  - **GAP-011** (timeline/event and character/canon identity joins, OPEN/P1) —
    **this task is the owner of the character/canon half.** Any join it adds
    must be an explicit, named relation, never a name match. Nullable-FK
    existence is not a join.
  - **GAP-013** (OPEN/P2) — no review claim may rest on an unverified backend.
  - **GAP-018** (OPEN/P2) — a failed `migrate deploy` is partially applied; if
    this task adds a migration, its `CREATE INDEX` must be re-runnable.
  - **GAP-023** (OPEN) — do not build a domain-event producer or outbox here.

## Scope decision — RESOLVED (author, 2026-10-04)

**Full tiered compiler.** The compiler selects across every §7 tier that has a
backing store today, both existing callers route through it, and the measured
§7/§2.16 defect is fixed. Tiers with **no** backing service are explicitly
declared unimplemented rather than faked — see invariant 10. The author chose
this over the narrower "fix the defect and unify the callers" option and over
"module only, no wiring".

## Scope

Allowed paths (proposed; confirm at review):

- `apps/api/src/services/context-compiler.ts` — **one new module**, holding the
  shared tiered selection and budget policy as pure functions over
  already-fetched rows. Not a new package: both callers live in `apps/api/src`,
  so a package boundary buys nothing here. The module must not import HTTP or a
  provider (CLAUDE.md §10), which keeps it testable without a server.
- `apps/api/src/services/orchestrator.ts` — replace the inline loop in
  `compile` (`:135`) with a call to the compiler.
- `apps/api/src/services/workflow-runs.ts` — the `RETRIEVAL` step (`:460`) must
  route through the same compiler.
- `apps/api/src/services/planning.ts` — add `getApprovedOutline` (none exists;
  see "Known unknowns") and the derived story position.
- `apps/api/src/services/characters.ts` — the bounded read that resolves the
  relevant entity set at the story position (the `character_states` window plus
  the `Character.storyEntityId` chain; see invariant 3). Reading this through
  `characters.ts` inherits its tenant gate, which a raw query would not.
- `apps/api/src/services/canon.ts` — the bounded, relevance-ordered fact
  selection that replaces the unbounded read.
- `apps/api/src/orchestrator.test.ts`, `apps/api/src/retrieval.test.ts`,
  `apps/api/src/characters.test.ts`, and one new
  `apps/api/src/context-compiler.test.ts`.

Forbidden paths: everything else — in particular any schema change, any
migration, `packages/story-versioning/*`, `packages/auth/*`, and any file
outside the list above.

Inputs: the existing reader ports already declared in `orchestrator.ts:33`
(`CanonReader`) and `:44` (`ReferenceSearcher`) — reuse them rather than
inventing a parallel interface. New reads must go through the existing
services, not new raw queries, so their tenant and spoiler gates are inherited.

**Who fetches what (resolved — this was ambiguous and blocked dispatch).** The
compiler is pure: it takes already-fetched rows and selects, orders and budgets
them. It performs **no** database read and imports no service. The **caller**
fetches, through the existing services, and passes the rows in. Concretely:

- `orchestrator.ts` already holds `canon` and `retrieval` as injected deps; it
  must additionally be given the tier-2/4/5/6/9 readers as **typed parameters
  on the same deps object**, not imported directly — that is what keeps the
  module boundary (§10) and the existing test seam intact.
- Each new dep is a narrow port named for what it returns, following the
  `CanonReader` / `ReferenceSearcher` precedent — e.g. `OutlineReader`
  (`getApprovedOutline`, `listNodes`), `StateReader` (`stateAt`, `stanceAt`,
  `bondStageAt`), `BrainReader` (`ask`), `NarrativeReader` (`getDna`).
- `workflow-runs.ts` receives the same dep set. Both callers therefore fetch
  the same shapes through the same ports, which is what makes invariant 7
  checkable rather than aspirational.
- The compiler's signature is therefore `compile(input, rows)` — pure, and
  testable with plain object literals and no server.

Which concrete service satisfies each port, and the exact bound constant per
port, is the implementer's to wire; the **shape and ownership** are fixed here.

Outputs: a compiled context value carrying, per block, the selected rows **and
their provenance** (ids, versions, and the reason each was selected), so a
later step can be checked. `compile` currently persists only
`contextSnapshot.facts` (ids) and `.references`
(`referenceId`/`referenceVersionId`/`chunkId`) — that shape is the floor, not
the ceiling.

Out of scope, each with its own owner: chapter generation as a feature (no such
entry point exists — see below); domain events (**GAP-023** / NF-WF-002E);
character/timeline joins beyond the canon half of **GAP-011**; durable workflow
execution (NF-WF-004); any UI (NF-WF-007).

## Behavior and invariants

1. **Priority order is the constitution's**, and it is ordered, not a set
   (CLAUDE.md §7). Seven tiers are store-backed today, tier 1 is request input
   rather than a store, and tiers 7 and 8 are unbacked — invariant 10 governs
   those. Every tier states its **bound** and its **order** separately;
   invariant 11 forbids an unbounded read, so a tier whose bound is "all rows"
   fails this contract:

   | # | §7 tier | Backing today | Bound | Order |
   |---|---|---|---|---|
   | 1 | author instruction | request input (not a store) | request size | n/a |
   | 2 | current outline / scene | `outline_versions` (**no resolver — new**), `outline_nodes`, `scenes` | the planning-horizon window at the story position, `OUTLINE_LIMIT` nodes | by `number` |
   | 3 | hard canon | `canon.listFacts` — **unbounded, `createdAt asc`** | `FACT_LIMIT` (**new** `take`, replacing the read-all) | relevance — invariant 3 |
   | 4 | current states | `characters.stateAt(chapter)` (`characters.ts:377`), `relationships.stanceAt(chapter)` (`relationships.ts:303`), `bondStageAt(chapter)` (`:562`) | `CAST_LIMIT` characters whose `CharacterState` window covers the story position (`character_states.fromChapter`/`toChapter`, `schema.prisma:1861`) | by character id |
   | 5 | active threads / promises | `canon.ask({kind:"UNRESOLVED"\|"PROMISES"})` (`canon.ts:1486`, branch `:1532`) | `THREAD_LIMIT` | narrative-debt rank — **keep** |
   | 6 | timeline | `canon.ask({kind:"EVENT"\|"CAUSAL"})` (`canon.ts:1508`, `:1520`) | `EVENT_LIMIT`, and never past the story position | by story position, most recent first |
   | 7 | relevant recent memory | **none** | — | invariant 10 |
   | 8 | relevant historical memory | **none** | — | invariant 10 |
   | 9 | Narrative DNA / style | `narrative_dna_profiles` (`narrative.ts:287`) | singleton — `take: 1` | n/a |
   | 10 | external references | `retrieval.search` | one unified `limit`, 1..100 (`retrieval.ts:857`) | relevance-ranked — **keep** |

   The `*_LIMIT` constants are named here and **numbered by the implementer**,
   justified in the contract's own terms; each must be an explicit value, never
   a default. Tiers 4 and 6 are bounded by the story position, so their bound
   is derived rather than constant — that derivation is part of the story
   position below.

   **Every tier 2–10 bound is a bound on the read, never a post-fetch slice**,
   except where the tier is a singleton. A bound applied after the read is not
   a bound — that is exactly the `break` this task removes, and a tier bounded
   that way fails invariant 11.

   **Tier 4 is the one tier whose backing is per-row, not per-query.**
   `stateAt` / `stanceAt` / `bondStageAt` each take a single character or pair
   and a chapter (`characters.ts:377`, `relationships.ts:303`, `:562`), so
   `CAST_LIMIT` cannot be expressed as one query-level `take`. It is expressed
   instead as **the bound on the relevant entity set itself**: at most
   `CAST_LIMIT` characters are resolved, and the per-character calls are made
   over that already-bounded list. The bound is therefore upstream of the
   accessor, not inside it. Selecting which `CAST_LIMIT` characters, when more
   qualify, uses the same determinism rule as invariant 3 — entity match then
   id — and must be stated, not left to row order.

2. **Mandatory context never disappears silently.** When the budget is
   exhausted, the compiler must either (a) surface an explicit, typed overflow
   result naming what was dropped and why, or (b) fail closed. Silently
   dropping a mandatory block is the defect this task exists to remove.
   CLAUDE.md §7: "Mandatory task constraints must never disappear silently to
   satisfy a context budget."
3. **Selection is bounded and relevance-ordered, never oldest-first.** No
   `orderBy: { createdAt: "asc" }` may decide what survives a budget.
   Tie-breaking must be deterministic and stated.

   **The tier-3 relevance ordering is defined here, not left to the
   implementer** — the truncation test cannot be written against an undefined
   order. It is a three-key sort over columns the fact row already has:

   1. **Entity match** — a fact whose `entityId` is in the **relevant entity
      set** outranks one that is not. The relevant entity set is derived from
      the story position, not from the outline (see "The relevant entity set"
      below), and the comparison is an explicit id comparison, never a name
      match (GAP-011).
   2. **Recency** — `createdAt` **descending**. This is the exact inversion of
      the current defect, and it is what makes the acceptance test fail against
      the old code.
   3. **Id** — `id` ascending, so the order is total and stable across runs
      when 1 and 2 tie.

   A fact that matches no relevant entity is still admissible; it sorts below
   every match, and the `FACT_LIMIT` bound decides how many survive. Relevance
   is *not* an embedding or a model call — this task adds no model dependency
   to selection.

   **The relevant entity set — this is the explicit join, and it is not the
   outline.** A review found the earlier draft assumed `outline_nodes` / `scenes`
   carry character or entity ids. They do not: `OutlineNode` links only to
   `saga`, `chapter` and `scene` (`schema.prisma:1422`), and `Scene` links only
   to `chapter` (`:301`). There is **no** join from the outline to a character,
   so a cast cannot be read out of the tier-2 window and this task must not
   pretend otherwise.

   The relation that does exist, and that this task uses, is the canon identity
   chain:

   `Character.storyEntityId` (`schema.prisma:1839`, nullable, `onDelete:
   SetNull`) → `StoryEntity.id` (`:1138`) → `CanonFact.entityId` (`:1190`,
   `onDelete: Restrict`).

   So the relevant entity set is built **from the story position outward**, not
   from the outline: the characters that have a `CharacterState` window covering
   the writing edge (`character_states`, `fromChapter`/`toChapter`, `:1861`),
   plus the `StoryEntity` rows those characters name. Facts whose `entityId` is
   in that set are the relevant ones. This is a real FK chain, it is what makes
   invariant 3 implementable, and it is the canon half of **GAP-011** that this
   task owns.

   A `Character` with a null `storyEntityId` contributes no entity id — it is
   skipped, not matched by name. That is deliberate: the nullable FK is exactly
   the "not yet joined" state, and treating it as a join is the error GAP-011
   records.
4. **Provenance is retained** for every selected fact and reference, with the
   source revision recorded.
5. **Tier 4 is resolved at the story position, not "now".** `stateAt`,
   `stanceAt` and `bondStageAt` all take a chapter number. Passing the writing
   edge is the point: a character's state must be what it was at the chapter
   being written, never the latest row. Getting this wrong silently leaks
   future state into an earlier chapter.
6. **Identity and source pins are resolved server-side, before the first model
   attempt**, per CLAUDE.md §7: the approved outline, the story position, and
   the source revision. The pin read already exists — `readHeadRevisionId`
   (`apps/api/src/services/revisions.ts:135`, reading
   `novelBranch.headRevisionId` via the `novelId_name` compound key) — so use
   it rather than a new query. The caller may supply an expectation
   (`expectedHeadRevisionId` tri-state, §C12.1) but must never be the authority
   for what is pinned.
7. **One compiler, two callers.** After this task, `orchestrator.ts` and the
   workflow `RETRIEVAL` step must not each own a selection loop. If they still
   do, the task is not done.
8. **Tenant and spoiler boundaries are inherited from the services**, applied
   in the query (the `listFacts` READER branch at `canon.ts:1473` is the
   precedent: filtering after the read means the forbidden rows were already
   read). A non-member must get a 404, not a 403.
9. **No model call or human wait inside a database transaction** (CLAUDE.md §9).
10. **Unbacked tiers are declared, never faked.** Tiers 7 and 8 have no store
    (`NF-WF-009` owns them). The compiler must represent them as an explicit
    "unavailable" entry in the compiled context — never an empty block that
    reads as "there is no recent memory", and never a fabricated summary. This
    is the same failure shape as GAP-018: an absent thing that looks like a
    present, empty one.
    - **The marker is a discriminated tag, not an empty list.** Each compiled
      block is `{ tier, status, rows, provenance }` with
      `status: "PRESENT" | "UNAVAILABLE" | "OVERFLOWED"`; tiers 7 and 8 compile
      to `status: "UNAVAILABLE"` with an explicit reason string naming the
      owning task (`NF-WF-009`). `rows` is empty **only** when `status` is
      `UNAVAILABLE`, so an empty `rows` with `status: "PRESENT"` is itself a
      bug the acceptance test can catch.
11. **No full-manuscript scan** (§2.16). No query may be unbounded: every new
    read states its bound. Tiers 5 and 6 already rank by debt; tier 3 must
    acquire a bound.
## Acceptance and verification

- [ ] Observable result through the real caller: a generation through
      `POST /api/workspaces/:workspaceId/generate`
      (`orchestrator-routes.ts:55`) and a workflow `RETRIEVAL` step
      (`workflow-runs.ts:460`) both produce context through the one compiler.
- [ ] **Negative test — bounded read, not just reordered.** Assert the fact
      query itself carries a bound (`take`), so the selection no longer fetches
      every ACTIVE fact. A test that only reverses the sort still passes with
      the unbounded read and the §2.16 violation intact, and must not count.
- [ ] **Negative test — the truncation fix.** With more facts than
      `FACT_BUDGET_CHARS` allows, assert the *newest relevant* facts are
      selected and the oldest are the ones dropped. This test must fail against
      the current `createdAt asc` + `break` behaviour. A test that passes
      against the old code proves nothing.
- [ ] **Negative test — mandatory overflow.** With mandatory context exceeding
      the budget, assert an explicit overflow result (or a fail-closed error)
      naming the dropped block. Assert no silent success.
- [ ] **Negative test — tier 4 is temporal.** A character whose state changes at
      chapter 12 must compile with its chapter-10 state when the writing edge is
      chapter 10. A test that passes with "latest row" semantics proves nothing.
- [ ] **Negative test — unbacked tiers are declared (invariant 10).** Assert
      tiers 7 and 8 appear as an explicit unavailable marker, and that no
      empty-but-present memory block is emitted.
- [ ] **Negative test — the relevant entity set (invariant 3 key 1).** With two
      facts of equal `createdAt`, one whose `entityId` is in the set derived
      from the story position and one whose is not, assert the first is
      selected and the second dropped under a tight `FACT_LIMIT`. Also assert a
      `Character` with a null `storyEntityId` contributes **no** entity id and
      is never matched by name — that is the GAP-011 rule, and a test that
      passes while the name-match fallback is in place must not count.
- [ ] **Negative test — tenant boundary.** A non-member requesting context for
      a foreign novel gets a 404 and learns nothing; an unauthorized caller is
      never shown a revision id.
- [ ] **Negative test — spoiler boundary.** A READER-mode compile does not
      admit a fact behind the reader's chapter position.
- [ ] **Divergence test.** A test that would fail if the two callers' selection
      logic drifted apart again.
- [ ] Named commands, prerequisites, and expected outcome recorded with actual
      results, separately from expectations. Zero selected tests do not pass a
      gate.
- [ ] Separate review of the submitted revision; findings resolved.

## Migration and rollback

**None expected.** No schema change and no migration is authorized by this
contract. If one becomes necessary, stop and return for a new contract: a
migration is a reviewed artifact, and per GAP-018 its index creation must be
re-runnable so a failed deploy cannot leave a half-applied database. This task
must not reset, restore or destructively roll back any database.

## Documentation and handoff

Update `docs/14-progress/CURRENT.md`, `docs/implementation/progress.md` and
`docs/implementation/test-matrix.md` with verified scope only, and record
failures, uncertainty and any unsupported claim in
`ISSUES-AND-GAPS.md` **before** any workaround. Save an Engram checkpoint under
the runtime-confirmed identity at each boundary; if Engram is unavailable,
preserve the handoff in this file and progress, and log it as a GAP. Never
claim an unconfirmed save.

## Known unknowns (state these at dispatch, do not guess)

- **There is no chapter generation entry point.** No `generateChapter`,
  `draftChapter` or equivalent symbol exists anywhere in the repository, and
  `manuscript.ts` has no generation function. The only generation routes are
  the generic `/generate`, `/generate/stream`, `/generations` and
  `/generations/stream`, whose body (`orchestrator-routes.ts:22`) carries no
  chapter, scene, outline or revision identity. So "chapter context" has no
  chapter-shaped caller yet. Resolved by the scope decision above: this task
  does **not** introduce a chapter-shaped entry point; it compiles for the
  existing generic path, and the story position is derived (see below) rather
  than supplied by a chapter request. Chapter-shaped generation is a later
  contract.
- **There is no resolver for "the current approved outline."** No
  `getApprovedOutline`/`resolveOutline`/`currentOutline` exists. Approval is a
  CAS to `APPROVED` with the previous holder moved to `SUPERSEDED`
  (`planning.ts:620-629`, `:688-691`), and one-APPROVED-per-novel is enforced
  by a partial unique index. Reading "the approved outline" is therefore a new
  read this task must define, not one it can reuse.
- **There is no story-position model, so the writing edge is defined here.**
  No `StoryState`/`StoryPosition` table exists. **Story position = the highest
  `chapters.number` for the novel whose `status` is not `DRAFT`; if no chapter
  has left `DRAFT`, it is `0`.** It is derived per compile from `chapters`
  (`number`, `status`; `@@unique([novelId, number])`) and stated explicitly in
  the compiled output so a later step can check it. Tier 4 resolves state at
  this number and tier 6 never admits an event past it. The distance
  `horizonFor` needs is chapters-ahead-of-this-edge.
  - A caller may **not** override the writing edge by passing a chapter number
    — that is the same rule as invariant 6, applied to position rather than
    revision. If a chapter-shaped entry point is later added, it supplies the
    edge through the server-side resolver, not through request input.
  - `DRAFT` is the excluded status because a draft is not yet true of the
    story. Verified in the schema: `ChapterStatus = DRAFT | IN_REVIEW |
    PUBLISHED` (`schema.prisma`, `enum ChapterStatus`), so the edge is the
    highest `number` in `{IN_REVIEW, PUBLISHED}`. `chapters` already carries
    `@@index([novelId, status])`, so the derived read is indexed — do not add
    an index or a migration for it.
- **Planning Horizon and Narrative DNA are per-novel singletons** keyed by
  `novel_id` (`schema.prisma:1485`, `:2135`), both holding untyped `Json` whose
  shape is validated in code (`horizonFor` at `packages/planning/planning.ts:202`,
  which returns a `problem` rather than inventing a default) and not by the
  database. A compiler that reads them must handle a malformed or absent policy
  loudly, matching `horizonFor`'s own failure contract. The detail levels are
  `HORIZON_DETAILS = ["FULL", "BEATS", "SKETCH", "VAGUE"]`
  (`packages/planning/planning.ts:160`).
- **Story state tables exist but nothing composes them:** `Character` (`:1814`),
  `CharacterState` (`:1861`), `RelationshipStance` (`:1943`), `Scene` (`:301`),
  `StoryEvent` (`:1534`), `TimelineEvent` (`:1573`). Resolved by the scope
  decision above: the compiler reads tier 4 through the existing
  `stateAt`/`stanceAt`/`bondStageAt` accessors at the derived story position,
  and tiers 5 and 6 through `canon.ask`, each under its own bound. It does not
  read the state tables directly, and reading all of them is the
  full-manuscript scan §2.16 forbids.
- `retrieval.search` clamps `limit` to 1..100 (`retrieval.ts:857`), ranks by
  relevance rather than creation time (SQL lexical leg `ORDER BY score DESC,
  c.id` + `LIMIT candidates`; vector leg ordered by similarity; RRF fusion
  `:1031`), and each caller passes its own value (`orchestrator.ts:186` uses 8,
  `workflow-runs.ts:468` uses 10). Unifying callers means choosing one bound
  and justifying it — do not silently inherit either. The retrieval path is
  **not** the truncation problem; only the canon-fact path is.
- **No memory/summary service exists** — no `recall`, `searchFacts`,
  `relevantFacts` or `similarity` symbol, and no L2–L5 hierarchical memory
  store. Tiers 7 and 8 of the §7 ladder therefore have no backing store, and
  the contract must declare them unavailable rather than fake them (invariant
  10). Building them is out of scope (NF-WF-009). **The other seven store-backed
  tiers do exist** — do not repeat my earlier overstatement that "four tiers are
  missing": tiers 4, 5 and 6 are backed by `characters.stateAt` /
  `relationships.stanceAt` / `bondStageAt`, `canon.ask({kind:"UNRESOLVED"|
  "PROMISES"})` (debt-ranked over `story_threads` / `story_promises`) and
  `canon.ask({kind:"EVENT"|"CAUSAL"})` (over `story_events` / `causal_edges`).
- The pure retrieval helpers live in `packages/retrieval/` (flat, no `src/`):
  `chunk.ts`, `fuse.ts`, `spoiler.ts`, `index.ts` — the precedent for where a
  pure, testable helper belongs if the compiler needs one.

## Review record

### Review 1 — 2026-10-04, CHANGES_REQUESTED, findings applied

**Dispatch.** `POST http://localhost:20127/v1/messages` through the 9Router
gateway. The requested reviewer was `bansosmontera/glm-5.3-flash`; that route
returned `upstream_error` / "All upstream attempts routed by Mortera Cloud
failed" after emitting ~30–40k characters of reasoning and no content, twice.
The alternate GLM routes (`unorouter/`, `ocg/`, `tokenharbor/`) returned HTTP
503 and `infoapi/` returned 400. The review therefore ran on
`bansosmontera/glm-5.3-flashx`, a different model from the one this contract
requests — recorded so the verdict is not read as the requested reviewer's.

**Identity.** The reviewer self-reported `MODEL_UNVERIFIED`. The gateway is a
router and its self-report is not backend evidence, so the serving backend is
unverified and **GAP-013 stays OPEN**. This is a review by an unknown backend,
not the evidenced review the contract's acceptance item requires.

**Scope of what it read.** The first pass had no repository access and returned
`UNCERTAIN` on every source-dependent question — correctly, and it said so.
The second pass was given verbatim excerpts of `orchestrator.ts`, `canon.ts`
`listFacts`, the workflow `RETRIEVAL` step and `retrieval.search`, and answered
against those. It did not read the whole tree; its `VERIFIED` verdicts are
`VERIFIED within the supplied excerpts`, which it stated itself.

**What it verified.** Claims 1–6 of the review request all came back VERIFIED
against the excerpts, including the central one: `listFacts` has no `take` and
orders `createdAt asc`, and `compile` `break`s on the budget — so the budget
keeps the oldest facts and drops the newest.

**Findings, and what was done with them.**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | major | Tier-3's entity-match key and tier-4's cast bound presumed `outline_nodes`/`scenes` carry character/entity ids; no such relation is cited, and GAP-011 forbids the name-match fallback | **ACCEPTED — the finding was right.** Verified in `schema.prisma`: `OutlineNode` (`:1422`) links only saga/chapter/scene; `Scene` (`:301`) links only chapter. Rewrote invariant 3 to derive the relevant entity set from the real canon chain — `CharacterState` window → `Character.storyEntityId` (`:1839`) → `StoryEntity` (`:1138`) → `CanonFact.entityId` (`:1190`) — and added a negative test for it |
| 2 | minor | Tier 4's backing is per-character accessors, so `CAST_LIMIT` cannot be one query-level bound | **ACCEPTED.** Invariant 1 now states the bound is on the relevant-entity-set derivation, not inside the accessor |
| 3 | minor | The whole-file claim "no `take`/`limit` anywhere in `canon.ts`" was broader than the excerpt proved | **ACCEPTED.** The claim now scopes to the two `findMany` calls and cites the reproducible grep |
| 4 | minor | The "reads only" / "called only from" claims need the whole file in the frozen manifest | **ACCEPTED.** The manifest line now requires the whole of `orchestrator.ts` and `canon.ts` |

Finding 1 is the reason this review was worth running: it removed a
plausible-looking assumption that would have made the truncation test
unimplementable, and it is the second time this contract's tier table has been
the weak point.

**Not yet satisfied.** A repo-grounded review by an evidenced backend is still
outstanding (GAP-013). This record does not discharge the acceptance item
"separate review of the submitted revision".

## Next action

Submit this contract for separate review before any coding — the scope decision
is resolved, but an unreviewed contract is not dispatchable. Queue rows are not
test receipts.
