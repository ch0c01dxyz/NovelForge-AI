# Knowledge and RAG Engine

## Ingestion pipeline

parse → clean → chunk → metadata → embedding → index

## Metadata

Chunks should support filtering by: - novel - chapter - character -
story arc - entity type - source - spoiler state - reference - canon
status

## Retrieval

Use a combination of: - semantic similarity - metadata filtering -
structured database queries - recency/version rules where relevant

Do not rely exclusively on vector similarity for facts that are better
represented relationally.

## Spoiler-aware modes

### AUTHOR_MODE

Can access the full novel knowledge base.

### EDITOR_MODE

Can access content according to editorial permissions.

### READER_MODE

Must not reveal future spoilers beyond the reader's allowed chapter.

Use `available_from_chapter` or equivalent metadata.

## References vs canon

References are guidance or external material. Canon is what is true in
the specific novel.

A reference can influence style or technique without becoming a fact in
the story.

## Memory extraction

After important generation or publication events, optionally extract
candidate facts.

Candidate facts enter: PROPOSED → human/automated review → APPROVED or
REJECTED → CANON when appropriate.

## Continuity

Continuity checks should compare generated content against: - approved
character facts - world rules - timeline - previous published chapters -
plot commitments - relationship state - item/location state

A continuity warning should identify its evidence source.

------------------------------------------------------------------------

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
