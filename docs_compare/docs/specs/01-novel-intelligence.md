# Novel Intelligence Specification

## Structured novel context

A novel can contain: - metadata - genre - synopsis - writing style -
world bible - characters - locations - factions - items - world rules -
lore - timeline - story arcs - plot points - chapters - knowledge memory

## Character schema

Recommended fields: - name - aliases - age - gender - role -
appearance - personality - goals - fears - motivation - background -
secrets - abilities - relationships - character arc - voice profile -
status

## Timeline

Timeline events should include: - sequence/date - description - involved
entities - source chapter - spoiler availability - canon status

## World Bible

World rules should be structured, searchable and attributable.

## Chapter intelligence

For each chapter, support: - summary - entities mentioned - events - new
facts - unresolved threads - relationship changes - timeline changes -
candidate canon facts

The AI should be able to use these structures without having to reread
the entire novel every time.

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

# 21. STORY PLANNING AUTHORITY --- SYNOPSIS VS OUTLINE

The synopsis is high-level direction, NOT a permanent chapter-by-chapter
script.

Use the synopsis primarily during initial novel creation for
genre/premise, central conflict, themes, broad character direction,
broad ending/destination, world foundation, macro plot, initial arcs,
and creation of the first detailed outline.

After detailed planning exists, agents MUST NOT repeatedly copy,
paraphrase, mechanically follow, or force chapters back toward the
synopsis.

For chapter-level storytelling decisions use:

`Explicit Author Instruction` `> Current Approved Chapter Outline`
`> Current Arc Outline / Arc State` `> Novel Canon` `> Character State`
`> Timeline / Continuity Constraints` `> Recent Chapter Memory`
`> Relevant Historical Memory` `> Synopsis` `> General Agent Creativity`

This is a story-planning hierarchy; the global Canon Authority still
governs factual conflicts.

Agents MUST NOT restate the synopsis as prose, force every chapter to
reproduce a synopsis bullet, repeatedly explain the premise, rush events
merely because they appear in the synopsis, reuse synopsis wording
instead of scene planning, or treat the synopsis as a detailed outline.

Instead, the approved outline determines what happens next; arc state
explains why it matters; character state drives plausible reactions;
continuity determines what is possible; unresolved threads create
progression; setup/payoff creates cumulative weight; and accumulated
canon makes later chapters consequences of earlier chapters.

Once a detailed outline exists, chapter-generation agents MUST rely
primarily on that outline plus accumulated story state.

Allow controlled outline evolution through:

`Original Outline → Chapter Results → Character/World/Continuity Changes → Agent Analysis → Proposed Outline Adjustment → Author Approval where required → Updated Outline`

Significant deviations MUST be visible and traceable.

Detailed chapter/scene outlines SHOULD track chapter purpose, scene
purpose, character objective, conflict, stakes, emotional progression,
information revealed/withheld, setup, payoff target, foreshadowing,
consequences, relationship movement, worldbuilding purpose, pacing, and
transition.

Every chapter-generation agent MUST receive an equivalent guardrail:

> Treat the synopsis as high-level direction. Follow the current
> approved outline and accumulated story state for chapter-level
> decisions. Do not mechanically reproduce, summarize, or repeatedly
> converge toward the synopsis. Preserve continuity, develop
> consequences, and allow the story to evolve through the outline,
> character state, arc state, and canon.
