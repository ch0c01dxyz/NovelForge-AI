# NovelForge AI --- Master Implementation Prompt

You are the principal software architect and implementation engineer for
NovelForge AI.

Build a production-grade AI-powered webnovel writing and publishing
platform with four engines:

1.  Novel Engine
2.  AI Engine
3.  Knowledge Engine
4.  Gateway Engine

The project must be modular, typed, testable, secure, observable,
versioned and provider-independent.

## Core requirement

The platform must support multiple 9Router API instances and a full AI
management layer in which agents, skills, knowledge and references are
independently managed.

The conceptual AI chain is:

Agent → Skills → Knowledge → References → Context → Prompt → Model →
Gateway → Response

The domain distinctions are mandatory: - Agent = who performs the
task. - Skill = how the task is performed. - Knowledge = what is true in
the novel. - Reference = external guidance. - Prompt = assembled
instruction. - Model Profile = desired capability/behavior. - Gateway =
transport route. - Workflow = orchestration.

## Canon authority

Resolve conflicts using:

Explicit Author Instruction \> Novel Canon \> Published Chapter Facts \>
World Bible \> Character Bible \> Timeline \> Plot Plan \> Agent
Instructions \> General References \> Model Creativity

Never silently overwrite approved canon.

## Multi-9Router

Support multiple gateway instances with: - base URL - encrypted API
key - display name - enabled state - priority - weight - timeout - retry
policy - health - latency/error metrics - rate limits - model/capability
metadata

Support routing: - priority - weighted - round-robin - least-latency -
failover

Implement bounded retry, timeout, circuit breaker and non-retryable
error classification.

## AI engine

Support versioned: - agents - skills - agent-skill assignments -
references - knowledge policies - prompt templates - workflows - model
profiles

Example agents: Novel Architect, World Builder, Character Designer, Plot
Architect, Scene Planner, Chapter Writer, Dialogue Specialist, Rewrite
Agent, Story Editor, Grammar Editor, Lore Guardian, Continuity Guardian,
Style Editor, Summarizer, Publishing Assistant, Novel Brain.

Example skills: Scene Construction, Character Voice, Dialogue Writing,
Narrative Description, Pacing, Action Choreography, Romance Tension,
Mystery Clue Placement, Show Don't Tell, Continuity Analysis, Canon
Verification, Summarization.

## Knowledge engine

Implement: - structured world bible - character bible - timeline -
lore - knowledge documents - chunks - embeddings - facts - references -
semantic retrieval - metadata filtering - spoiler-aware retrieval -
canon approval - continuity evidence

Pipeline: parse → clean → chunk → metadata → embedding → index.

Support: AUTHOR_MODE EDITOR_MODE READER_MODE

Reader retrieval must not leak future spoilers.

## Novel intelligence

Support: - novel metadata - genre - synopsis - writing style -
characters - relationships - locations - factions - items - world
rules - lore - timeline - story arcs - plot points - scenes - chapters -
summaries - unresolved threads

Novel Brain should distinguish Established Fact, Inference and
Suggestion.

## Chapter workflow

Implement a configurable workflow:

Chapter Request → Context Retrieval → Scene Planner → Character Voice
Analysis → Chapter Writer → Continuity Guardian → Lore Guardian → Style
Editor → Finalizer

Workflow nodes may include: - agent - skill - retrieval - condition -
transform - validator - human approval

Prevent infinite loops and record execution steps.

## Writer editor

Use a rich editor such as Tiptap if compatible with the repository.

Support: - autosave - versions - scenes - chapter status - publishing -
inline AI actions

Inline actions: Rewrite, Expand, Shorten, Make emotional, Make
cinematic, Improve dialogue, Show don't tell, Change tone, Continue.

## Reader platform

Support: - explore - genres - search - novel detail - reader -
bookmarks - follows - comments - notifications - author pages

## Administration

Provide dashboards for: - gateways - models - agents - skills -
references - workflows - AI usage - evaluations - audit logs

## Security

-   server-side authorization
-   schema validation
-   secure sessions/cookies
-   XSS protection
-   CSRF protection where relevant
-   encrypted gateway credentials
-   no client-side provider secrets
-   rate limiting
-   audit logging
-   secret redaction

## Observability

Track: - request id - task - novel - agent/version - skill/version -
prompt/version - model - gateway - latency - usage - status - errors -
evaluations

## Suggested technology

Prefer: Next.js, React, TypeScript, Tailwind, shadcn/ui, Tiptap,
TanStack Query, Zod, PostgreSQL, Prisma, pgvector, Redis, S3-compatible
storage.

However, inspect the repository first and preserve working technology
choices.

## Development behavior

Before coding: 1. inspect repository, 2. read relevant docs, 3. identify
existing architecture, 4. produce CURRENT ARCHITECTURE, 5. produce GAPS,
6. produce RISKS, 7. produce IMPLEMENTATION PLAN.

Then implement phase by phase.

After each phase: - typecheck - lint - tests - build where practical -
fix failures - review diff - update documentation - create logical
commit

Do not hallucinate files, APIs or dependencies. Do not hard-code
provider assumptions. Do not expose API keys. Do not make unrelated
refactors. Do not weaken tests to make them pass.

## Phases

0 Discovery 1 Foundation 2 Novel Engine 3 Writer Editor 4 Gateway Engine
5 Knowledge Engine 6 Agent Engine 7 AI Orchestrator 8 AI Workflows 9
Reader Platform 10 Admin and Evaluation

## Primary success criteria

The finished system must let an author: 1. create a novel, 2. build its
world and characters, 3. manage canon, 4. configure multiple 9Router
gateways, 5. manage models, 6. manage agents, 7. manage skills, 8.
manage references, 9. retrieve relevant knowledge, 10. generate grounded
chapters, 11. run continuity/lore/style checks, 12. revise with AI, 13.
preserve version history, 14. publish chapters, 15. let readers safely
read published content.

Do not treat this prompt as permission to rewrite the entire repository
blindly. Investigate first, then implement the smallest coherent
production-grade change that advances the architecture.

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
