# AI Orchestrator Specification

Conceptual API:

``` ts
ai.generate({
  task,
  agent,
  novelId,
  input,
  contextMode,
  modelProfile,
  stream
})
```

The implementation can differ, but the responsibilities should remain
separated.

## Request lifecycle

1.  Authenticate.
2.  Authorize.
3.  Resolve task.
4.  Resolve agent/version.
5.  Resolve skills/version.
6.  Retrieve knowledge.
7.  Retrieve references.
8.  Build novel context.
9.  Assemble prompt.
10. Select model profile.
11. Select gateway/model.
12. Execute request.
13. Stream or return response.
14. Validate output.
15. Run optional review.
16. Persist generation and context metadata.
17. Apply approved changes.

## Context budget

Context should be prioritized.

Suggested priority: 1. explicit author instruction 2. current
scene/chapter 3. hard canon 4. immediate character state 5. timeline
constraints 6. relevant plot 7. relevant world rules 8. retrieved
references 9. stylistic guidance 10. low-priority background

Do not stuff every document into every prompt.

## Reproducibility

Store enough metadata to reconstruct: - prompt - context source list -
agent/version - skill/version - model - gateway - generation settings -
output

------------------------------------------------------------------------

## Timeout, Retry, and Fallback Rules

Every AI model request MUST have an explicit timeout and bounded retry
policy. Treat a timeout as a transient failure unless the provider
explicitly classifies it otherwise.

On timeout: record the failed attempt; classify it as `TIMEOUT`;
preserve the original logical request and context snapshot; retry using
the configured policy; use exponential backoff with jitter; stop at the
configured maximum attempts; then invoke eligible gateway/model fallback
if configured. Record every attempt and the final outcome.

Configuration MUST support request timeout, max attempts, initial/max
backoff, jitter, retryable error categories, fallback gateway policy,
fallback model policy, and capability constraints for fallback.

Do NOT blindly retry deterministic failures such as invalid parameters,
authentication/authorization failure, unsupported model/capability,
malformed configuration, or validation errors that will reproduce
unchanged.

One logical generation ID MUST be separate from individual
transport-attempt IDs. Persist attempt number, gateway, model,
timestamps, timeout, latency, error category, retry delay, fallback
target, final status, and total elapsed time.

For streaming, an interrupted stream is NOT successful. Partial output
must be marked incomplete and must never create duplicate persisted
chapter content during retry/recovery. Never log secrets or credentials.

# 9. LONG-RUN WEBNOVEL CONSISTENCY --- UP TO 2,000 CHAPTERS

NovelForge AI MUST support webnovels of at least 2,000 chapters without
assuming the complete manuscript fits inside a model context window.

Use hierarchical story memory:

-   Level 0 --- Current Generation: current task, scene, instructions,
    immediate working state.
-   Level 1 --- Current Chapter: approved chapter outline, goals, scene
    plan, active cast, chapter-local facts.
-   Level 2 --- Recent Chapters: compact memories for relevant recent
    chapters.
-   Level 3 --- Arc Memory: current arc objective, state, conflicts,
    promises, revelations, progress.
-   Level 4 --- Saga / Macro-Arc Memory: progression spanning multiple
    arcs.
-   Level 5 --- Novel / Global Memory: stable global canon, world rules,
    long-term character facts, major promises, macro direction.
-   Level 6 --- Archived Historical Memory: older
    chapters/scenes/events/facts retrieved only when relevant.

Never summarize away hard canon. Summaries are retrieval aids and MUST
NOT replace canonical structured facts or source history.

Maintain separate structured state for approved canon facts, chapter
summaries, arc/macro-arc summaries, character state, relationship state,
timeline events, unresolved/resolved threads, promises/setup,
foreshadowing, revelations, items, locations, and factions.

After every completed chapter, capture chapter memory including summary,
key events, participants, character/relationship changes, location/item
changes, lore/world-rule changes, timeline changes, revelations, clues,
foreshadowing, unresolved/resolved conflicts, setup, callbacks/payoffs,
and candidate canon facts.

Arc state SHOULD track objective, start/current state, climax direction,
conflicts, characters, locations, factions, revelations,
unresolved/completed threads, setup/payoff relationships, start/end
conditions, and chapter range.

Character state MUST be time-aware and track relationships, goals,
motivations, knowledge, injuries/conditions, abilities, possessions,
location, narratively relevant emotional state, development, secrets
known/unknown, and promises/commitments.

Timeline integrity MUST preserve chronological order, story time versus
publication order, source chapter/scene, involved entities, before/after
relationships, and temporal constraints.

Long-novel retrieval SHOULD prioritize: explicit author instruction;
current approved chapter outline/scene plan; current arc state/outline;
active unresolved threads/promises; current character/relationship
states; hard canon/world rules; recent chapter memory; relevant
historical facts/events; then distant details only when retrieved as
relevant.

Never inject all 2,000 chapters into a prompt.

Perform periodic versioned consolidation:

`Chapter Memory → Arc Memory Update → Character State Update → Timeline Update → Thread/Promise Update → Novel Memory Update`

Consolidation MUST be auditable and MUST NOT destructively replace
source history.

Before publication-ready status, validate the chapter against the
approved outline, arc state, recent chapters, character/relationship
states, timeline, hard canon, unresolved threads, setup/promises, and
relevant older chapters retrieved through structured/semantic search.

Architecture MUST scale to 2,000+ chapters, tens of thousands of scenes,
millions of words, and thousands of entities/facts. Routine generation
MUST NOT require O(all chapters) scans.
