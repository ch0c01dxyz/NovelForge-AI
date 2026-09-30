# ADR-0012: Story Health Reports Evidence-Backed Findings, Never a Score

- **Status:** Accepted (2026-09-30)
- **Supersedes:** none
- **Related:** ADR-0001 (module boundaries), ADR-0008 (canon authority),
  ADR-0011 (planning horizon detail); baseline ADR-012 in
  `docs/13-decisions/ADR-INDEX.md` ("Evidence-backed findings replace
  arbitrary LLM health scores") — this ADR is its implementation-phase
  realisation.
- **Grounded in:** `docs/03-domain/STORY-INTELLIGENCE.md`,
  `docs/04-data/DATA-MODEL-BLUEPRINT.md`, and
  `packages/story-intelligence/events.ts` (`narrativeDebt` — the shipped
  precedent for derived, non-LLM scoring). **No code implements this
  decision yet** — see Context, fact 1.

## Context

CLAUDE.md §2.2 says derived data is not canon, and §2.13 says AI may
propose but not silently commit. Story health sits exactly on that seam:
it is an *assessment of* the story, produced by machines, and the
temptation is to compress it into a single number. Four forces push the
other way:

1. **The domain doc defines a finding by its parts, not its score.**
   `docs/03-domain/STORY-INTELLIGENCE.md:51` — "Health findings are
   evidence-backed issues, not vibes" — followed by a list of seven
   issue kinds (timeline conflict, stale major thread, neglected
   relationship, knowledge-boundary violation, repeated narrative
   pattern, impossible technology prerequisite, unresolved critical
   endgame condition) and the required shape at `:56-57`: "Each finding has
   rule, severity, evidence, affected entities, status, and remediation
   proposal." Six fields, no score among them.
2. **The doc names the anti-pattern directly.** `:30-31` says narrative
   debt is "preferably derived from unresolved promises/threads and
   age/importance/evidence rather than being an arbitrary LLM score."
   Story health is the same class of derived assessment and inherits the
   same rule.
3. **The blueprint requires provenance for findings specifically.**
   `docs/04-data/DATA-MODEL-BLUEPRINT.md:86` lists "source/evidence links
   for claims and health findings" as a required data principle, and
   `:44` names `story_health_findings` as a table. Evidence is not
   optional decoration on a finding; it is the thing that makes it
   reviewable.
4. **A finding must be re-derivable.** CLAUDE.md §2.14 requires derived
   data to be invalidated and rebuilt when its canonical source revision
   changes. An LLM score is not re-derivable — the same canon re-scored
   gives a different number — so it cannot participate in that
   invalidation contract at all.

Three facts about the repository shaped this decision:

- **Nothing implements story health.** `packages/database/prisma/schema.prisma`
  has no `StoryHealthFinding` model; every `health` match in the schema
  and in `apps/api/src` is gateway infrastructure (`GatewayHealth`,
  `lastHealthCheckAt`). The blueprint states its own status in its first
  line: "This is a logical blueprint, not the final migration."
- **The derived-not-LLM precedent is already shipped.** `narrativeDebt`
  (`packages/story-intelligence/events.ts:210`) scores owed narrative
  items with a stated formula — `importance * urgency * (10 + ageChapters)`
  — under a section header that says exactly what it is: "Narrative debt
  (STORY-INTELLIGENCE.md: derived, never an LLM score)" (`:175`). Its doc
  comment gives the reason at `:204-205`: "No LLM, no hidden weights: the
  same rows always produce the same ranking, so an author can audit why a
  thread surfaced."
- **The severity vocabulary does not exist.** No doc in the repository
  defines severity levels for findings. This ADR does not invent them.

This ADR therefore records a **design constraint on future
implementation**, as ADR-0009 does, and says so rather than describing
shipped behaviour.

## Decision

**We will represent every story-health issue as an evidence-backed finding
— a deterministic rule, a severity, the concrete evidence and affected
entities that triggered it, a status, and a remediation proposal — and we
will never represent the health of a story as a score. A finding is a
claim an author can check, not a number an author must trust.**

Scope boundaries of this decision:

- **This ADR covers the finding's shape and authority, not the rule
  catalog.** It fixes what a finding is and what it may do. Which rules
  exist, how they are evaluated, and when they run is implementation.
- **This ADR ships no code.** It constrains a future implementation. The
  absence is stated in Context rather than papered over with a
  forward-looking "we will add" that reads as done.
- **"Evidence-backed" is a requirement on the data, not a claim about the
  model.** A finding produced by an LLM pass is acceptable only if it
  carries the same evidence a deterministic rule would have to produce.

### 1. A finding is a claim, and the claim is the evidence

The six required fields from `STORY-INTELLIGENCE.md:56-57` split into what
was detected and what to do about it. Rule and evidence are the detection:
a named rule and the concrete rows that tripped it — the two timeline
entries that conflict, the thread's id and its last-touched chapter, the
knowledge assertion and the chapter that violates it. Severity, status,
and remediation describe handling.

The consequence for any implementation: a finding with no evidence is not
a low-confidence finding, it is an invalid one. The field is not
nullable-by-convention, and a detector that cannot name what it saw must
report nothing rather than report a vibe.

This is also why a score is rejected rather than merely discouraged. A
score discards the evidence by construction — "health: 62" cannot be
checked, cannot be disputed, and cannot tell an author which chapter to
open.

### 2. Findings are derived state, and derived state is not canon

A finding is an *assessment* of canon, so CLAUDE.md §2.2 applies: it is
not story truth. Rebuilding the finding set from an unchanged canon
revision must produce the same findings, which is the property §2.14
needs and the property an LLM score cannot have.

Two consequences follow. First, a finding is not written into canon and
never routes through the canon approval chain of §5 — a timeline conflict
finding is a report *about* canon, and resolving it is a canon mutation
that goes through the normal path. Second, the finding set is
invalidatable: a canon revision change discards findings derived from the
old revision rather than leaving stale ones to accumulate.

### 3. Remediation is a proposal, never a commit

`STORY-INTELLIGENCE.md:56-57` requires a "remediation proposal", and §2.13
requires AI to propose rather than commit. So the remediation field
describes a change — "move event X after event Y", "pay off promise P in
the next arc" — and applies nothing. A finding may be `open`,
acknowledged, or resolved by an author; the resolution is the author's
act, and the finding records only that it happened.

This is the same boundary `edgeRequiresApproval` (`events.ts:107`) draws
for causal edges: machine-derived claims stay candidates until an author
accepts them.

### 4. Severity is declared by the rule, not chosen per finding

Because the rule is named in the finding, the rule is also the natural
owner of severity: a rule knows how bad its own violation is, and the
same rule should grade the same way on every novel revision. A model
choosing a severity per finding reintroduces the arbitrariness that
rejecting the score removed, one level down.

The severity vocabulary itself is undefined in the repository. This ADR
requires only that it be a closed set declared in one place (CLAUDE.md
§10, explicit schemas over unstructured dictionaries) rather than a
free-form string a model writes.

## Alternatives

- **A single `healthScore` integer on the novel** — rejected: it is the
  arbitrary LLM score the baseline ADR names, and it is the field that
  would survive every refactor because it is the easiest thing to display.
  It also cannot satisfy §2.14, since re-scoring unchanged canon yields a
  different number.
- **Let the model emit findings with its own severity** — rejected: the
  finding would carry no rule and no reproducible evidence, so it would be
  neither checkable nor re-derivable. §2.13 makes it a candidate at best,
  and a candidate with no evidence cannot be evaluated.
- **Store findings as canon rows** — rejected: a finding is an assessment
  of the story, not story truth (§2.2). Canonising it would let a detector
  bug become a fact about the novel.
- **Recompute findings on every read, persist nothing** — rejected: a
  finding has a status lifecycle (open / acknowledged / resolved) that a
  pure recompute cannot hold, and an author's decision to dismiss a
  known-acceptable "violation" would be forgotten on the next page load.
- **Fold health findings into the narrative-debt ledger** — rejected: the
  two answer different questions with different lifecycles. Debt ranks
  items the story *owes* and is expected to be non-empty; health reports
  things that are *wrong* and is expected to be empty. Merging them makes
  an empty debt list look like good health and vice versa.
- **Defer the ADR until an implementation exists** — rejected: the shape
  is the constraint that keeps an LLM score out, and it is cheapest to
  record before the shape is chosen — the same reasoning ADR-0009 applies
  to Narrative DNA.

## Consequences

- **Positive:** the anti-score rule is recorded before any detector
  exists, so the first health implementation inherits it rather than
  retrofitting it. The shipped `narrativeDebt` is a working precedent to
  point at, not a hypothetical.
- **Positive:** because a finding carries a named rule and its evidence, a
  future PR that makes a detector noisier can be argued against concrete
  false positives rather than against a score's movement.
- **Negative:** this ADR cannot cite an implementation, a model, or a
  test. A reader looking for the behaviour will find a specification, a
  blueprint table name (`story_health_findings`), and nothing else.
- **Negative:** the seven issue kinds are named but their rules are not,
  and severity levels are not defined anywhere. Until they are, "a
  deterministic rule" is a requirement with no catalog behind it, and the
  evidence field's shape is unconstrained.
- **Negative:** a deterministic rule catalog is a large surface — seven
  rules over canon, threads, promises, relationships, and timeline — and
  each is a place a bug produces a confidently wrong finding. Nothing
  mechanical prevents a future rule from being arbitrary; only this ADR
  and review do.
- **Follow-ups:** the `story_health_findings` table at
  `DATA-MODEL-BLUEPRINT.md:44` is not migrated. When it is, this ADR is
  the constraint on its shape: it must carry rule, severity, evidence,
  affected entities, status, and remediation, and it must carry no score.
  A detector that cannot produce evidence must be deleted, not shipped
  with a weaker finding.
