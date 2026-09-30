# ADR-0009: Narrative DNA Uses Soft Constraints by Default

- **Status:** Accepted (2026-09-30)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0008 (canon authority);
  baseline ADR-009 in `docs/13-decisions/ADR-INDEX.md` ("Narrative DNA
  uses soft constraints by default") — this ADR is its
  implementation-phase realisation. As with ADR-0008, the baseline list
  is pre-implementation and the `ADR-NNNN` files are
  implementation-phase; this file is the latter.
- **Grounded in:** `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md` and
  `docs/03-domain/NARRATIVE-RHYTHM.md`. **No code implements this
  decision yet** — see Context, fact 1.

## Context

Phase 7/8 territory. Four forces constrain how a stored author
preference is allowed to influence generation:

1. **Narrative DNA defines how the story should feel** (CLAUDE.md §2.7),
   and §2.7 states that it "uses soft constraints unless explicitly
   configured otherwise". The domain doc says the same in one line:
   `docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md:15` — "Narrative DNA is
   not an outline. **Values are soft constraints unless explicitly
   marked hard.**"
2. **Rhythm is the sharpest case of the same rule.**
   `docs/03-domain/NARRATIVE-RHYTHM.md:5` — "Rhythm preferences are soft
   constraints. **Never implement 'drama every N chapters' as a
   cron-like rule.**" The drama policy example in that doc carries
   `strict interval: false` as an explicit field, and its typical-gap
   values are written as ranges ("~30--50 chapters", "occasional
   extended calm ~70--140") rather than a period.
3. **The planning hierarchy already orders authority, and DNA is not on
   it** (CLAUDE.md §4). Explicit author instruction, the approved
   outline, and canon all outrank "General Creativity", and Narrative
   DNA appears nowhere in that order. It is a *preference* input to
   planning, not a planning authority, so it cannot veto an approved
   outline.
4. **A soft constraint must still be auditable.** §2.11 requires
   meaningful mutations to be versioned, and §2.13 forbids an AI
   silently committing canon. A preference that steers prose without
   leaving a trace is unauditable by construction.

Three facts discovered before this decision shaped it materially:

- **Nothing in the repository implements Narrative DNA.** A grep for
  `dna|DNA|Dna` across `packages/` and `apps/api/src` (`--include=*.ts`)
  returns no match, and `packages/database/prisma/schema.prisma` has no
  `NarrativeDna` model. The blueprint names
  `narrative_dna_profiles, narrative_policies`
  (`docs/04-data/DATA-MODEL-BLUEPRINT.md:21`), but the blueprint states
  its own status in its first line: "This is a logical blueprint, not
  the final migration."
- **Nothing in the repository implements a soft-constraint mechanism
  either.** A grep for `soft|Soft|SOFT` across `packages/*/[a-z]*.ts`
  and `apps/api/src/services/*.ts` returns no match. There is no
  weighting, scoring, or relaxation helper to build on.
- **`packages/narrative-rhythm/index.ts` is a stub.** Its entire
  contents are `export {};`. The rhythm rules exist as a domain
  specification only.

This ADR therefore records a **design constraint on future
implementation**, not a description of shipped code. It is written now
because the constraint is what makes the implementation safe to write
later, and because recording it after an implementation exists is how
the cron-like rule gets in.

> **Update, same day.** The three facts above were true when this ADR was
> written and the same work item then shipped the implementation, so they
> are now false and are kept only as the record of what was true at the
> decision point. `packages/narrative-rhythm` is no longer a stub — it
> holds the rhythm rules and a test that asserts the soft-constraint rule
> at the word level (a drama-window guidance string may contain no
> imperative). `NarrativeDnaProfile` and `NarrativePolicy` now exist in
> `schema.prisma` (with `PolicyHardness`), so a `dna`/`DNA` grep matches
> and the `soft|Soft|SOFT` grep now matches this ADR's own realisation.
> The decision below is unchanged; only its "no code yet" premise
> expired. Where the rest of this file says "no implementation", read it
> as the 2026-09-30 pre-ship state.

## Decision

**We will treat every Narrative DNA value as a soft constraint that
influences planning and generation but never overrides an approved
outline, canon, or an explicit author instruction. A value may be
declared hard only by an explicit per-field marker, and hardness is
opt-in per field, never a property of the DNA as a whole.**

Scope boundaries of this decision:

- **This ADR covers DNA *authority*, not DNA *storage*.** Field
  inventory, table shape, and JSONB-vs-column choices are ADR-0010's
  subject. Nothing here requires a particular schema.
- **This ADR ships no code.** It constrains a future implementation. The
  absence of an implementation is stated in Context above rather than
  papered over with a forward-looking "we will add" that reads as done.
- **Soft does not mean unenforced.** A soft constraint is still
  evaluated, still recorded, and still reported when the plan departs
  from it. "Soft" describes who wins a conflict, not whether anyone
  notices.

### 1. Hardness is a per-field marker, defaulting to absent

The domain doc's phrasing is "unless explicitly marked hard", which puts
the burden on the marker: a field with no marker is soft. This is
deliberate and matches how the preference list reads — `target length
and whether it is hard/soft` is the one field the doc calls out as
carrying its own hardness, because a target length is the field most
likely to be genuinely binding.

Consequence for any implementation: hardness is data on the field, not a
constant in code, and not a per-novel switch. A novel-wide "treat DNA as
hard" flag would make one field's marker irrelevant and is rejected
below.

### 2. A hard DNA value still does not outrank canon

CLAUDE.md §5 puts explicit author correction and approved canon above
every other source, and §4 excludes DNA from the planning authority
order entirely. So "hard" means *hard against planner discretion*, not
*hard against canon*. A hard target length may constrain how the
planner shapes an arc; it may not make a canon fact false.

This is the boundary that keeps §2.7 ("soft constraints unless
explicitly configured otherwise") from becoming a second canon
authority.

### 3. Rhythm never becomes a schedule

`docs/03-domain/NARRATIVE-RHYTHM.md:5` is the operative rule: no
cron-like "drama every N chapters". The doc's own policy example shows
what the alternative looks like — a density, a typical gap range, an
extended-calm range, and `strict interval: false` — and its planner
section names the inputs that replace the schedule: "chapters since
meaningful drama, current arc, tension, threads, recent payoffs,
upcoming payoffs, story scale, repetition risk, and author instruction."

Any future rhythm implementation that reduces those inputs to a chapter
counter violates this ADR, and the counter would be the single line that
survives every refactor.

## Alternatives

- **A novel-wide `dna_is_hard` boolean** — rejected: the domain doc's
  marker is per field ("unless explicitly marked hard", with target
  length singled out as the field that carries its own hardness). A
  novel-wide switch makes every field hard at once, which is exactly the
  over-constraint the soft default exists to prevent.
- **Enforce DNA as planner constraints** (the obvious reading of
  "constraint") — rejected: CLAUDE.md §4 does not list DNA in the
  planning authority order, so a constraint solver that treats it as
  binding would give a preference input veto power over an approved
  outline, inverting the hierarchy.
- **Model rhythm as a chapter interval with tolerance** — rejected: it
  is the cron-like rule the domain doc names explicitly, wearing a
  tolerance band. It also discards the eight planner inputs the doc
  lists, keeping only the one that needs no story state.
- **Defer the ADR until an implementation exists** — rejected: the rule
  is a constraint on the implementation's shape, and it is cheapest to
  record before the shape is chosen. ADR-0011 is recorded after its
  implementation and ADR-0012 before its; both say which they are, and
  so does this one.
- **Store DNA as canon facts** — rejected: DNA is durable preference
  (CLAUDE.md §3, "Narrative DNA = durable style/rhythm/story-preference
  policy"), not approved story truth. Routing it through
  `canon_proposals` would require an approval gate for a change of taste
  and would put preference into the canon authority chain of §5.

## Consequences

- **Positive:** the constraint is recorded before any implementation, so
  the first rhythm or DNA implementation inherits it rather than
  retrofitting it.
- **Positive:** "soft by default" and "no cron-like rule" are now
  reviewable statements with a file and a line, so a future PR that adds
  a chapter counter can be rejected against this ADR rather than against
  a reviewer's memory.
- **Negative:** a soft constraint is not enforceable by a database
  constraint or a type. Nothing mechanical stops a future module from
  treating a DNA value as binding; only this ADR and review do. That is
  a real weakness and is not mitigated here.
- **Negative:** because no code exists, this ADR cannot cite an
  implementation the way ADR-0011 does. A reader looking for the
  behaviour will find a specification and a stub package
  (`packages/narrative-rhythm/index.ts`), not a function. ADR-0012 is in
  the same position and cites the shipped `narrativeDebt` as its only
  precedent.
- **Follow-ups:** ADR-0010 covers how DNA fields are stored and how genre
  features compose generic primitives. A rhythm implementation, when it
  lands, must cite this ADR and name the planner inputs it consumes; if
  it consumes a chapter counter instead, that is a superseding decision
  requiring its own ADR.
