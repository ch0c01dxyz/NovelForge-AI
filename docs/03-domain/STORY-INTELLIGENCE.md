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

## Story Health

Health findings are evidence-backed issues, not vibes: - timeline
conflict; - stale major thread; - neglected relationship; -
knowledge-boundary violation; - repeated narrative pattern; - impossible
technology prerequisite; - unresolved critical endgame condition.

Each finding has rule, severity, evidence, affected entities, status,
and remediation proposal.
