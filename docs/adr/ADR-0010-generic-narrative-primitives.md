# ADR-0010: Genre & Story Features Compose Generic Narrative Primitives

- **Status:** Accepted (2026-09-30)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0008 (canon authority),
  ADR-0009 (DNA soft constraints); baseline ADR-010 in
  `docs/13-decisions/ADR-INDEX.md` ("Genre/story features compose generic
  narrative primitives") — this ADR is its implementation-phase
  realisation, as ADR-0008 is for baseline ADR-007. The baseline list is
  pre-implementation; the `ADR-NNNN` files are implementation-phase.
- **Grounded in:** `packages/story-intelligence/events.ts` (the primitives
  that already exist), `docs/04-data/DATA-MODEL-BLUEPRINT.md` (the
  storage stance), `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md` and
  `docs/03-domain/NARRATIVE-RHYTHM.md` (the extensibility requirement).

## Context

The platform must serve many genres — cultivation, romance, political,
military, scholarly — without a table, an enum, or a branch per genre.
Four forces constrain how that is achieved:

1. **Prefer explicit schemas over unstructured dictionaries** (CLAUDE.md
   §10). A genre-specific bag of JSON keys is exactly the unstructured
   dictionary the rule forbids.
2. **The domain docs require extensibility but not genre tables.**
   `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md:6` — "Fields should be
   extensible and mostly policy-driven." `docs/03-domain/NARRATIVE-RHYTHM.md`
   enumerates drama types ("Social, personal, romance, political,
   economic, scholarly, military/conflict, family, ideological, **or
   custom**") and antagonist roles (MAIN / ARC / TEMPORARY / RIVAL /
   IDEOLOGICAL / POLITICAL / PERSONAL / COMPETITOR) — both lists end open,
   which is a statement that the taxonomy is data, not schema.
3. **The blueprint already separates generic tables from policy rows.**
   `docs/04-data/DATA-MODEL-BLUEPRINT.md:3` — "Normalize core truth; use
   JSONB only where flexibility is intentional." Its Story-intelligence
   section (`:43-44`) lists generic nouns only — `story_events`,
   `story_threads`, `story_promises`, `causal_edges` — with no genre
   column anywhere. Its Narrative DNA section (`:21`) separates
   `narrative_dna_profiles` (the profile) from `narrative_policies` (the
   flexible part).
4. **Story intelligence is a pure domain package** (ADR-0001). It may
   import `contracts`/`shared`/`story-core`/`validation` and nothing else
   — no Prisma, no HTTP, no provider. Any primitive it exposes has to be
   expressible as a type and a function, not as a query.

Two facts about what already exists shaped the decision:

- **The generic primitives are already shipped and already genre-free.**
  `packages/story-intelligence/events.ts` defines
  `THREAD_KINDS` (`:23` — MYSTERY, CONFLICT, QUESTION, OBJECTIVE,
  SUBPLOT), `THREAD_STATUSES` (`:32`), `PROMISE_STATUSES` (`:43` — the
  ordered setup→payoff lifecycle) and `CAUSAL_CONFIDENCES` (`:54` —
  EXPLICIT, INFERRED, SPECULATIVE). Not one of those enumerations names a
  genre. The module header states the vocabulary "mirrors
  schema.prisma — keep in sync, pinned by a test".
- **Nothing in the repository is genre-specific.** There is no
  `genre` column, no per-genre package, and no branch on a genre value in
  `packages/` or `apps/api/src`. The genre/subgenre tags the domain doc
  lists are DNA *data* (`docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md:8`),
  not a code path.

## Decision

**We will model genre and story features as data that composes the
generic narrative primitives — threads, promises, causal edges, events,
timeline entries — rather than as schema, enums, or branches per genre. A
new genre is expressed by new policy rows and new primitive instances; it
does not add a table, a column, or a code path.**

Scope boundaries of this decision:

- **This ADR covers composition, not storage layout.** It says which
  shape a genre feature may take. It does not decide whether a given
  policy lives in `narrative_policies`, in a JSONB column, or in a
  dedicated table — the blueprint leaves that to the migration.
- **This ADR ships no new code.** It records the rule the shipped
  primitives already obey and constrains what is added next. The
  primitives it cites exist; the genre features it anticipates do not.
- **"Generic" means genre-free, not feature-free.** A primitive may carry
  author-assigned importance (`DebtItem.importance`, `events.ts:183`) and
  an open status set. It may not carry a genre field.

### 1. A genre feature is an instance, never a schema change

Cultivation progression, face-slapping frequency, romance structure and
enemy-to-ally preference are all listed in
`docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md:8-13` as DNA fields. Each
is expressible as a policy value plus instances of the existing
primitives: a rivalry is a `CONFLICT` thread, a debt owed to the reader
is a promise at `SETUP`/`DEVELOPING`/`READY_FOR_PAYOFF`, a betrayal's
consequence is a causal edge. The test is mechanical — if expressing a
feature requires a new enum member whose name is a genre word, the
feature has been modelled as schema and this ADR is violated.

### 2. The open-ended enumerations are the extension point

`THREAD_KINDS` has five members and no genre among them;
`CAUSAL_CONFIDENCES` separates *how well grounded* a claim is (EXPLICIT /
INFERRED / SPECULATIVE) rather than *what kind of story* it belongs to.
That is the pattern to extend: a new primitive earns a member when it is
a distinct structural role in any story, not when a genre needs it.

`edgeRequiresApproval` (`events.ts:107`) shows why the split matters:
it keys the approval gate on confidence, so a genre feature that arrives
as an INFERRED edge is held as a candidate until an author accepts it
(CLAUDE.md §2.13), with no genre-specific rule needed.

### 3. Flexible where intentional, normalized where it is truth

The blueprint's stance (`:3`) is the tie-breaker for where a new field
goes. Story truth — a thread that exists, a promise that is owed, an edge
that is asserted — is normalized into rows with real columns and real
foreign keys, because those are the things the Story Brain queries and
canon-adjacent invariants constrain. Author preference — how much drama,
how fast the pace, which genre tags apply — is policy and may be flexible.
Putting a preference into a normalized truth table makes it canon;
putting truth into a JSONB blob makes it unqueryable. Both are rejected
below.

## Alternatives

- **A `genre` column on story tables** — rejected: it makes every genre
  a value the schema must know about, and every query that forgets to
  filter on it silently mixes genres. Nothing in the shipped primitives
  needs it; the DNA profile already carries genre tags as data.
- **A table or enum per genre** (cultivation threads, romance arcs) —
  rejected: it is the schema-per-genre this ADR exists to prevent, and it
  fails the open-ended lists in `NARRATIVE-RHYTHM.md`, which end in "or
  custom" precisely because the taxonomy is not closed.
- **One JSONB `features` blob on the novel** — rejected: CLAUDE.md §10
  forbids unstructured dictionaries where a schema is feasible, and it
  makes a genre feature unqueryable by the Story Brain, which is the one
  consumer that has to reason over it.
- **A `narrative_primitives` table with a free-text `kind`** — rejected:
  a free-text kind discards the type safety that
  `THREAD_KINDS`/`PROMISE_STATUSES` currently provide, and the "keep in
  sync with schema.prisma, pinned by a test" contract in the module
  header (`events.ts:20`) has nothing to pin against.
- **Genre-specific packages** (`@novelforge/genre-cultivation`) —
  rejected: ADR-0001's module map is by architectural role, not by story
  content, and a package per genre multiplies the boundary surface for
  no gain in domain logic.

## Consequences

- **Positive:** the primitives already shipped satisfy this decision, so
  the rule is a constraint on what comes next rather than a refactor of
  what exists. A new genre needs no migration.
- **Positive:** because a genre feature is data, it inherits the
  machinery already built for data — the approval gate on non-EXPLICIT
  causal edges (§2.13), the deterministic debt ranking, and the spoiler
  boundary.
- **Negative:** "is this a generic primitive or a genre feature?" is a
  judgement call at each addition, and nothing mechanical enforces it.
  The mechanical test in §1 catches the crude case (a genre word in an
  enum) and not the subtle one (a genre-shaped structural role given a
  neutral name).
- **Negative:** a policy value carries no schema, so a malformed genre
  policy is a runtime problem, not a compile-time one. `horizonFor`
  (ADR-0011) is the existing precedent for handling that honestly —
  validate at the boundary and return a problem rather than inventing a
  default — and a genre policy must do the same.
- **Follow-ups:** the DNA profile and policy tables named at
  `docs/04-data/DATA-MODEL-BLUEPRINT.md:21` are not migrated. When they
  are, this ADR is the constraint on their shape: the profile may hold
  genre tags, the policy may hold flexible preference, and neither may
  become a per-genre table.
