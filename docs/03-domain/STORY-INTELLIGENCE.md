# Story Intelligence Specification

## Responsibilities

Story Intelligence answers: - What is true? - What is true now? - What
happened? - Why did it happen? - What remains unresolved? - What
promises have been made? - What information is relevant to the next
task?

## Hierarchical memory

L0 current generation L1 chapter L2 recent chapters L3 arc L4 saga L5
global novel L6 historical archive

Hard canon is never replaced by summaries.

Delivery depends on the early revision foundation (M1), then extraction and
consolidation (M3); do not defer all memory until advanced Phase 11. L0/L1
may be context/run artifacts. Materialize higher-level projections only when
consumed; each has source revision/version dependencies and freshness status.
Summaries can describe accepted prose with provenance but cannot silently
elevate pending or rejected claims to authoritative canon.

Chapter prose/history retrieval is separate from external-reference search.
Bound queries by story position, entities, arc and dependencies before reading
content. A 6,000-character prompt cap is not bounded database retrieval.

## Threads

A thread tracks a mystery, conflict, question, objective, subplot, or
unresolved narrative unit: - introduced_at; - status; - importance; -
evidence; - related entities; - development events; - planned/possible
payoff window; - resolution.

## Promise/payoff

Promises include explicit and implicit reader expectations: `SETUP`,
`DEVELOPING`, `READY_FOR_PAYOFF`, `PAID_OFF`, `ABANDONED`,
`INVALIDATED`.

Narrative Debt is preferably derived from unresolved promises/threads
and age/importance/evidence rather than being an arbitrary LLM score.

## Causality

Store causal edges with evidence: cause event -\> effect event/state,
confidence/type, source chapters, author approval if necessary.

Causality supports impact analysis, callbacks, simulation, and story
debugging.

## Canon proposal pipeline

Generation -\> Fact Extraction -\> Candidate Facts -\> Conflict Check
-\> Canon Proposal -\> policy/author approval -\> Approved Canon.

Never silently promote invented facts when they conflict with existing
canon.

Extract against the final immutable chapter artifact/version, validate source
spans and ownership, classify conflicts, and preserve pending/rejected results.
Revalidate proposals when text or canonical source changes. Text acceptance,
canon approval and publication are separate commands. Commit approved state,
events and revision with durable projection invalidation intent; rebuild after
commit. A stale projection cannot masquerade as current story truth.

Story Event, timeline and character/canon identities require explicit stable
links and temporal semantics before context/consolidation joins them. Never
infer identity from a matching name. Track unresolved contracts in the single
[issues register](../implementation/ISSUES-AND-GAPS.md).

## Story Health

Health findings are evidence-backed issues, not vibes: - timeline
conflict; - stale major thread; - neglected relationship; -
knowledge-boundary violation; - repeated narrative pattern; - impossible
technology prerequisite; - unresolved critical endgame condition.

Each finding has rule, severity, evidence, affected entities, status,
and remediation proposal.
