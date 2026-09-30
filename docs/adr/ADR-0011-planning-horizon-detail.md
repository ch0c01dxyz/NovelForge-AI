# ADR-0011: Planning Detail Decreases With Narrative Distance

- **Status:** Accepted (2026-09-30)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0008 (canon authority),
  ADR-0009 (DNA soft constraints), ADR-0010 (generic primitives);
  baseline ADR-011 in `docs/13-decisions/ADR-INDEX.md` ("Detailed planning
  decreases with narrative distance") — this ADR is its
  implementation-phase realisation, as ADR-0008 is for baseline ADR-007.
- **Grounded in:** `packages/planning/planning.ts` (`horizonFor`),
  `packages/database/prisma/schema.prisma` (`PlanningHorizon`),
  `apps/api/src/services/planning.ts` (`putHorizon`),
  `apps/api/src/planning-routes.ts`, `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md`.

## Context

CLAUDE.md §2.8 states the invariant: "Planning Horizon prevents detailed
overplanning of distant chapters." Four forces constrain how the detail
level is decided:

1. **The ranges in the domain doc are examples, not constants.**
   `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md:25-29` gives a sample
   ladder ("next 5--10 chapters: very detailed … distant sagas:
   direction") and then says so outright: "Do not encode those ranges as
   universal constants." A hardcoded ladder in code is the failure mode
   the doc names.
2. **Planning authority is per-novel.** The policy column belongs to the
   novel (`PlanningHorizon.novelId` is the primary key,
   `schema.prisma:1467-1468`), so two novels can legitimately disagree about
   where "detailed" ends.
3. **The policy is hand-written and AI-proposed data, so it can be
   wrong.** `schema.prisma:1470-1471` says the column is
   "shape validated by `horizonFor`, not trusted" — an AI proposal can
   write this row, so the reader cannot assume the writer was correct.
4. **Story intelligence is a pure domain package** (ADR-0001).
   `packages/planning/planning.ts` may import
   contracts/shared/story-core/validation and nothing else — so the rule
   is a function over a value, not a query against the database.

Two facts about what already exists shaped the decision:

- **The rule is shipped and it fails loudly.** `horizonFor`
  (`planning.ts:202`) takes `(distance, policy: unknown)` and returns
  `HorizonDecision | { problem: HorizonProblem }`. The doc comment at
  `:198-200` is explicit: "Failure is loud, not silent: an empty,
  malformed, or non-covering policy returns a problem instead of
  inventing a default. A caller that wants a fallback policy makes that
  an explicit local decision."
- **Both ends of the path honour that.** The write path validates through
  the same pure rule before storing (`services/planning.ts:566-567` —
  "a rejected policy is stored nowhere"), and the read path returns
  `null` rather than a default (`:556-560` — "the pure rule reports
  EMPTY_POLICY — inventing a default would lie about state"). A
  malformed policy is refused at the boundary and never reaches a reader.

## Decision

**We will resolve planning detail from each novel's own stored horizon
policy, never from a universal constant, and we will make an unusable
policy a reported problem rather than a silently substituted default.
Detail decreases with distance because the novel's policy says so, not
because the code knows the right ladder.**

Scope boundaries of this decision:

- **This ADR covers horizon *resolution*, not the generation pipeline.**
  It decides which detail level a distance resolves to. What a planner
  pass does with `FULL` versus `VAGUE`, and whether generation honours it,
  is not decided here — `plannerContext` (`planning.ts:329`) is a separate
  function with a separate contract.
- **This ADR ships no new code.** It records the rule `horizonFor` and
  `putHorizon` already implement. The gap it does *not* close is named
  under Consequences.
- **The policy is data with a validated shape, not free-form JSON.** The
  bands are a typed structure (`HorizonBand`), and the shape check runs on
  read and on write.

### 1. The ladder is per-novel data, and its shape is enforced

`HorizonPolicy` (`planning.ts:179`) is `{ bands: HorizonBand[] }` where a
band pairs a `maxDistance` with a `HorizonDetail`. `horizonFor` validates
the whole array before using it: every band is an object with an integer
non-negative `maxDistance` (or `null`) and a `detail` in
`HORIZON_DETAILS` (`:216-222`), the bands ascend by `maxDistance`, the
`null` tail is last, and there is only one tail (`:226-235`). A policy
that fails any of those returns `MALFORMED_POLICY` — it is never partially
applied.

### 2. Failure is a value, not an exception and not a default

The three problems are distinct and each names a different culprit:

- `EMPTY_POLICY` (`:210`) — no policy has been written yet.
- `MALFORMED_POLICY` (`:207`, `:213`, `:222`, `:228`, `:233`) — a policy
  exists but its shape is wrong. A non-integer or negative `distance`
  returns this too, with the comment "caller bug: distance is a chapter
  count" — the same channel carries a caller defect rather than hiding it.
- `UNCOVERED_DISTANCE` (`:243`) — the policy is well-formed but its
  bounded bands do not reach this distance and there is no `null` tail.

A caller that wants a default makes that choice locally, visibly, at the
call site. That is the whole point of returning a problem: the substitution
becomes someone's decision instead of a hidden constant.

### 3. The write path and the read path use the same rule

`putHorizon` (`services/planning.ts:563`) probes with
`horizonFor(0, policy)` before storing, so an invalid policy is refused
with a 409 and no row is written. This matters because the same rule that
rejects a hand-written policy also rejects an AI-proposed one — the column
has one gate regardless of who wrote it, which is what
`schema.prisma:1470` claims.

## Alternatives

- **Hardcode the example ladder from the domain doc** — rejected: the doc
  explicitly forbids it (`NARRATIVE-DNA-AND-PLANNING.md:29`), and it would
  make one genre's pacing every genre's pacing. The shipped
  `horizonFor` reads the novel's policy instead.
- **Fall back to a sensible default ladder when the policy is missing or
  malformed** — rejected: it is exactly the silent substitution the rule
  is written to avoid. A novel with no policy has no agreed pacing, and a
  default would plan distant chapters at a detail level the author never
  chose. `getHorizon` returns `null` for this reason.
- **Throw on a malformed policy and let the caller catch** — rejected: the
  three problems are a closed, typed set
  (`HorizonProblem`, `:190`) that the caller must distinguish anyway
  (empty is a setup step; uncovered is a policy that needs a tail). An
  exception collapses them into one string and loses the distinction the
  union preserves.
- **Store the resolved detail per chapter instead of resolving from a
  policy** — rejected: it freezes a decision made under an old policy and
  makes the novel's pacing unchangeable without rewriting chapter rows.
  The policy is the durable thing; the resolution is derived.
- **Model the horizon as a soft DNA preference** (ADR-0009) — rejected:
  DNA softness describes who wins a *conflict*. The horizon is not a
  preference competing with something else; it is the answer to "how much
  detail may this distance have", and it has no competitor to lose to.

## Consequences

- **Positive:** the invariant is enforced by a pure function with a
  closed error union, so the same rule guards the API boundary, the
  database read, and any future caller.
- **Positive:** pacing is per-novel data. Changing it is an upsert plus an
  audit row (`services/planning.ts:575-581`), not a code change.
- **Negative:** nothing consumes `horizonFor` in a generation path yet.
  `packages/planning/planning.test.ts` and the API tests cover the rule
  and the storage round-trip; no planner pass is demoted to `VAGUE` by it
  today. The invariant is guarded at the policy layer and unenforced at
  the generation layer — a gap this ADR records rather than papers over.
- **Negative:** `MALFORMED_POLICY` carries two different meanings (a bad
  policy and a bad `distance` argument). A caller that maps problems to
  user-facing messages has to know which it passed; the type does not
  separate them.
- **Follow-ups:** a generation path that consumes the horizon must cite
  this ADR and pass a real `distance` measured from the writing edge. The
  "writing edge" itself — which chapter counts as current — is not defined
  anywhere in the repository and is a prerequisite for wiring this rule
  into planning.
