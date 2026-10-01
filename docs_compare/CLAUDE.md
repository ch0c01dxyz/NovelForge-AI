# CLAUDE.md --- NovelForge AI

> Permanent project instructions for Claude Code. This file defines how
> Claude Code must work inside the NovelForge AI repository. Product
> requirements and detailed architecture belong in `docs/`.

------------------------------------------------------------------------

## 1. PROJECT IDENTITY

**Project:** NovelForge AI

NovelForge AI is a production-grade AI-powered webnovel writing,
editing, knowledge-management, and publishing platform.

The system is built around four major domains:

1.  **Novel Engine**
    -   novels
    -   chapters
    -   scenes
    -   characters
    -   relationships
    -   locations
    -   factions
    -   items
    -   world rules
    -   lore
    -   timeline
    -   story arcs
    -   plot points
    -   publishing
2.  **AI Engine**
    -   agents
    -   skills
    -   prompts
    -   model profiles
    -   AI orchestration
    -   workflows
    -   generation history
    -   evaluations
3.  **Knowledge Engine**
    -   novel canon
    -   world bible
    -   character bible
    -   references
    -   documents
    -   chunks
    -   embeddings
    -   facts
    -   retrieval
    -   spoiler control
    -   continuity
4.  **Gateway Engine**
    -   multiple 9Router instances
    -   model registry
    -   model discovery
    -   health checks
    -   routing
    -   retry
    -   failover
    -   usage
    -   reliability metrics

The four domains must remain conceptually separated even when they share
infrastructure.

------------------------------------------------------------------------

# 2. HIGHEST-PRIORITY RULES

These rules override convenience.

### Rule 1 --- Inspect before modifying

Before significant implementation:

1.  Inspect repository structure.
2.  Inspect package/configuration files.
3.  Identify the existing framework and architecture.
4.  Inspect database schema and migrations.
5.  Inspect authentication and authorization.
6.  Inspect existing UI/component patterns.
7.  Inspect existing tests.
8.  Read the relevant documentation under `docs/`.

Never assume a file, dependency, API, service, table, route, component,
or abstraction exists.

Never invent repository state.

------------------------------------------------------------------------

### Rule 2 --- Preserve working code

If existing code already solves part of a requirement:

-   reuse it,
-   extend it,
-   refactor only when justified.

Do not replace functioning infrastructure merely because another
technology is preferred.

Do not perform unrelated rewrites.

------------------------------------------------------------------------

### Rule 3 --- Documentation and implementation must agree

Before modifying a core subsystem, read the relevant
architecture/specification documents.

If documentation and implementation disagree:

1.  inspect both,
2.  determine the actual current behavior,
3.  identify the intended behavior,
4.  update documentation when necessary,
5.  implement deliberately.

Do not silently introduce a second architecture.

------------------------------------------------------------------------

### Rule 4 --- Never claim verification you did not perform

Do not say:

-   "tests pass"
-   "build works"
-   "typecheck passes"
-   "migration is valid"
-   "integration works"

unless the relevant check was actually executed.

If a check cannot be run, state that explicitly.

------------------------------------------------------------------------

### Rule 5 --- Security is part of implementation

Security is not a later phase.

Every feature must consider:

-   authentication
-   authorization
-   input validation
-   secret handling
-   XSS
-   CSRF where relevant
-   rate limiting
-   audit logging
-   data access boundaries
-   tenant/novel ownership
-   sensitive information leakage

------------------------------------------------------------------------

# 3. REQUIRED DOMAIN BOUNDARIES

Never collapse these concepts into one generic AI abstraction.

## Agent

**Agent = WHO performs a task.**

Examples:

-   Chapter Writer
-   World Builder
-   Character Designer
-   Continuity Guardian
-   Lore Guardian
-   Story Editor
-   Novel Brain

An agent contains task-oriented behavior and configuration.

Agents are versioned.

------------------------------------------------------------------------

## Skill

**Skill = HOW a task is performed.**

Examples:

-   Scene Construction
-   Character Voice
-   Dialogue Writing
-   Narrative Description
-   Pacing
-   Action Choreography
-   Show Don't Tell
-   Continuity Analysis
-   Canon Verification

Skills should be reusable by multiple agents.

Skills are versioned.

------------------------------------------------------------------------

## Knowledge

**Knowledge = WHAT IS TRUE inside the novel.**

Examples:

-   character facts
-   world rules
-   timeline events
-   established relationships
-   published chapter facts
-   lore
-   plot commitments

Knowledge belongs to the novel/story context.

------------------------------------------------------------------------

## Reference

**Reference = external guidance or source material.**

Examples:

-   writing guides
-   genre references
-   author style guides
-   terminology
-   research documents
-   imported source material

References are not automatically canon.

------------------------------------------------------------------------

## Prompt

**Prompt = the assembled instruction sent to a model.**

A prompt may contain:

1.  system instructions
2.  agent instructions
3.  skill instructions
4.  canon
5.  retrieved knowledge
6.  references
7.  chapter/scene context
8.  explicit author instruction
9.  output requirements

Prompts must be versionable/reproducible where practical.

------------------------------------------------------------------------

## Model Profile

**Model Profile = desired model capability/behavior.**

Examples:

-   FAST
-   BALANCED
-   CREATIVE_WRITING
-   REASONING
-   LONG_CONTEXT
-   VISION
-   EMBEDDING
-   IMAGE

Never hard-code an application feature directly to a provider model name
when a model profile abstraction is appropriate.

------------------------------------------------------------------------

## Gateway

**Gateway = transport route to an AI model.**

9Router is a gateway implementation.

The application should not assume that a specific provider is the only
possible destination.

------------------------------------------------------------------------

## Workflow

**Workflow = orchestration of multiple operations.**

A workflow may contain:

-   agents
-   skills
-   retrieval
-   conditions
-   transforms
-   validators
-   human approvals

------------------------------------------------------------------------

# 4. CANON AUTHORITY

When information conflicts, use this authority order:

``` text
Explicit Author Instruction
        ↓
Novel Canon
        ↓
Published Chapter Facts
        ↓
World Bible
        ↓
Character Bible
        ↓
Timeline
        ↓
Plot Plan
        ↓
Agent Instructions
        ↓
General References
        ↓
Model Creativity
```

The AI must not silently overwrite approved canon.

AI-generated facts should be treated as candidates until appropriately
reviewed.

Major canon changes should support human approval.

------------------------------------------------------------------------

# 5. MULTI-9ROUTER REQUIREMENTS

Multiple 9Router instances are a first-class requirement.

The system must not assume there is only one gateway.

Each gateway should support, as applicable:

-   unique ID
-   display name
-   base URL
-   encrypted API credential
-   enabled/disabled state
-   priority
-   weight
-   timeout
-   retry policy
-   health state
-   last health check
-   latency metrics
-   error metrics
-   rate-limit metadata
-   supported models
-   model capabilities

Possible routing strategies:

-   PRIORITY
-   WEIGHTED
-   ROUND_ROBIN
-   LEAST_LATENCY
-   FAILOVER

Use bounded retries and backoff.

Classify non-retryable errors.

Do not retry blindly on:

-   invalid requests
-   authentication failures
-   authorization failures
-   unsupported models
-   deterministic client errors

Use health and circuit-breaker state where appropriate.

------------------------------------------------------------------------

# 6. AI PROVIDER INDEPENDENCE

All model calls must pass through an internal abstraction.

Preferred conceptual layers:

``` text
AI Orchestrator
      ↓
Model Manager
      ↓
Gateway Manager
      ↓
AIGateway
      ↓
9Router / compatible provider
```

The rest of the application should not directly instantiate provider SDK
clients.

A feature should request a capability/task, not construct a
provider-specific request unless it is inside the gateway/provider
adapter.

Future compatibility should remain possible for:

-   multiple 9Router instances
-   OpenAI-compatible gateways
-   direct OpenAI
-   Anthropic
-   Google
-   local models
-   future providers
-   image generation
-   TTS/STT
-   translation

Do not build unnecessary provider integrations before they are required.

------------------------------------------------------------------------

# 7. AI ORCHESTRATION

The conceptual interface is:

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

The exact implementation may differ according to the repository
architecture.

Responsibilities should remain separated.

Recommended lifecycle:

``` text
Authentication
    ↓
Authorization
    ↓
Task Resolution
    ↓
Agent Resolution
    ↓
Skill Resolution
    ↓
Knowledge Retrieval
    ↓
Reference Retrieval
    ↓
Novel Context Assembly
    ↓
Prompt Assembly
    ↓
Model Profile Selection
    ↓
Gateway Selection
    ↓
9Router Request
    ↓
Streaming / Response
    ↓
Output Validation
    ↓
Optional Review
    ↓
Persistence
```

------------------------------------------------------------------------

# 8. CONTEXT MANAGEMENT

Do not blindly send the entire novel to the model.

Use a context budget.

Suggested priority:

``` text
1. Explicit author instruction
2. Current scene/chapter
3. Hard canon
4. Immediate character state
5. Timeline constraints
6. Relevant plot
7. Relevant world rules
8. Relevant references
9. Style guidance
10. Low-priority background
```

Retrieval should be intentional and explainable.

When possible, retain the source identifiers used to construct a
generation.

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

# 9A. RAG / KNOWLEDGE RULES

Knowledge ingestion should conceptually follow:

``` text
Parse
 ↓
Clean
 ↓
Chunk
 ↓
Metadata
 ↓
Embedding
 ↓
Index
```

Retrieval may combine:

-   semantic similarity
-   metadata filtering
-   structured database queries
-   version/state filtering

Do not use vector search for facts that are better represented
relationally.

Examples of structured facts:

-   character age
-   relationship status
-   chapter publication state
-   timeline order
-   canon status

------------------------------------------------------------------------

# 10. SPOILER SAFETY

Support at least:

``` text
AUTHOR_MODE
EDITOR_MODE
READER_MODE
```

Reader mode must not expose future information.

Knowledge items should have a spoiler boundary such as:

``` text
available_from_chapter
```

or an equivalent mechanism.

Never assume that information stored in the database is safe to show to
readers.

Reader-facing AI must obey the same spoiler boundaries.

------------------------------------------------------------------------

# 11. VERSIONING

Important mutable AI and content entities should support versioning.

At minimum consider versioning for:

-   chapters
-   chapter content
-   agents
-   skills
-   prompts
-   references
-   workflows
-   major configuration

A version should provide enough metadata to understand:

-   what changed
-   who/what changed it
-   when
-   previous/base version
-   status

Generated content should be attributable and reversible where practical.

------------------------------------------------------------------------

# 12. DATABASE RULES

Use migrations.

Never modify a production schema manually as a shortcut.

Before changing the schema:

1.  inspect current schema,
2.  inspect related migrations,
3.  understand dependencies,
4.  design the migration,
5.  implement,
6.  run migration validation/tests.

Preserve:

-   foreign keys
-   indexes
-   unique constraints
-   check constraints
-   appropriate cascade behavior

Do not add indexes blindly.

Do not duplicate data without a reason.

Avoid storing very large binary/generated artifacts directly in
relational tables when object storage is more appropriate.

------------------------------------------------------------------------

# 13. AUTHORIZATION

Never rely solely on UI hiding.

Protected operations must be authorized server-side.

Use granular permissions rather than scattering checks such as:

``` ts
if (user.role === "ADMIN")
```

throughout business logic.

The architecture should support roles such as:

-   USER
-   AUTHOR
-   EDITOR
-   ADMIN
-   SUPER_ADMIN

but permissions should represent actual capabilities.

Novel-level ownership/membership must be enforced.

------------------------------------------------------------------------

# 14. SECURITY FOR 9ROUTER CREDENTIALS

9Router API keys/credentials are secrets.

Rules:

-   never expose them to browser JavaScript,
-   never return raw credentials from normal APIs,
-   encrypt sensitive credentials at rest,
-   mask them in admin UI,
-   redact them from logs,
-   do not put them in URLs,
-   do not commit them to git,
-   do not include them in error messages.

Use environment variables/secrets management for application-level
secrets.

------------------------------------------------------------------------

# 15. API DESIGN

API endpoints should:

-   validate input,
-   authenticate,
-   authorize,
-   perform business logic through services,
-   return predictable errors,
-   avoid leaking internal details,
-   use appropriate HTTP semantics.

Use schema validation such as Zod when compatible with the stack.

Do not put large amounts of business logic directly into route handlers.

------------------------------------------------------------------------

# 16. SERVICE ARCHITECTURE

Prefer clear services/modules around domain responsibilities.

Conceptual services include:

``` text
NovelService
ChapterService
CharacterService
CanonService

AgentManager
SkillManager
PromptManager
ContextManager
WorkflowManager

AIOrchestrator
ModelManager
GatewayManager

KnowledgeManager
RetrievalManager
EmbeddingManager

PublishingService
EvaluationService
AuditService
```

Names may differ according to repository conventions.

Do not create abstractions solely because they sound architecturally
clean.

Create them when they provide a meaningful boundary.

------------------------------------------------------------------------

# 17. FRONTEND RULES

Follow the repository's existing design system.

Prefer reusable components.

Avoid:

-   giant page components,
-   duplicated UI logic,
-   duplicated API fetching,
-   provider-specific UI assumptions,
-   exposing secrets.

For the writer workspace, the conceptual structure is:

``` text
┌─────────────────────────────────────────────┐
│ Header / Chapter controls                   │
├──────────────┬────────────────┬─────────────┤
│ Chapter      │ Tiptap Editor  │ AI / Context│
│ / Scene      │                │ / Continuity│
│ Navigation   │                │             │
├──────────────┴────────────────┴─────────────┤
│ Status / Version / Generation information   │
└─────────────────────────────────────────────┘
```

Keep AI operations traceable without making the editor overwhelming.

------------------------------------------------------------------------

# 18. AI EDITOR ACTIONS

Inline editor actions may include:

-   Rewrite
-   Expand
-   Shorten
-   Make emotional
-   Make cinematic
-   Improve dialogue
-   Show, don't tell
-   Change tone
-   Continue

These actions must use the central AI orchestration system.

Do not create separate hidden AI implementations for each button.

Each operation should be attributable to:

-   user
-   novel
-   chapter
-   agent
-   skill
-   prompt
-   model
-   gateway

where applicable.

------------------------------------------------------------------------

# 19. WORKFLOW ENGINE

A workflow may contain:

``` text
AGENT
SKILL
RETRIEVAL
CONDITION
TRANSFORM
VALIDATOR
HUMAN_APPROVAL
```

Workflow requirements:

-   version workflows,
-   validate graphs,
-   prevent invalid cycles,
-   enforce execution limits,
-   record execution steps,
-   support appropriate retries,
-   preserve inputs/outputs where safe,
-   support human approval.

Never permit an unbounded workflow loop.

------------------------------------------------------------------------

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

# 22. CHAPTER GENERATION PIPELINE

The initial conceptual pipeline is:

``` text
Chapter Request
      ↓
Context Retrieval
      ↓
Scene Planner
      ↓
Character Voice Analysis
      ↓
Chapter Writer
      ↓
Continuity Guardian
      ↓
Lore Guardian
      ↓
Style Editor
      ↓
Finalizer
```

This should eventually be represented by the workflow system rather than
being permanently hard-coded into one giant function.

------------------------------------------------------------------------

# 21. NOVEL BRAIN

Novel Brain is the novel-level intelligence/retrieval layer.

It should be able to retrieve:

-   characters
-   relationships
-   chapters
-   plot points
-   timeline events
-   lore
-   world rules
-   unresolved threads
-   relevant facts

Where appropriate, answers should distinguish:

``` text
Established Fact
Inference
Suggestion
```

Never present inference as established canon.

------------------------------------------------------------------------

# 22. AI GENERATION RECORDS

For meaningful generations, retain enough metadata for
debugging/evaluation/reproducibility.

Potential fields:

-   request ID
-   user
-   novel
-   task
-   agent/version
-   skill/version
-   prompt/version
-   model profile
-   selected model
-   selected gateway
-   context source IDs
-   generation settings
-   input/output usage
-   latency
-   status
-   errors
-   evaluator results

Do not store secrets.

Consider privacy and retention requirements when storing prompts and
outputs.

------------------------------------------------------------------------

# 23. OBSERVABILITY

Use structured logging.

Useful metadata:

-   request ID
-   user ID when appropriate
-   novel ID
-   task
-   agent/version
-   skill/version
-   model
-   gateway
-   duration
-   status
-   error category

Never log:

-   API keys
-   access tokens
-   passwords
-   raw credentials

Be cautious with private manuscript content and prompts.

------------------------------------------------------------------------

# 24. BACKGROUND JOBS

Use background workers/queues for expensive asynchronous operations such
as:

-   embeddings
-   document indexing
-   chapter summarization
-   consistency scans
-   style analysis
-   bulk AI generation
-   model synchronization
-   gateway health checks
-   memory extraction

Do not block normal HTTP requests for long-running work when a job
architecture is appropriate.

------------------------------------------------------------------------

# 25. TESTING

Testing is required at the appropriate level.

## Unit tests

Use for:

-   business rules
-   parsers
-   routing logic
-   prompt assembly
-   context prioritization
-   validation
-   pure transformations

## Integration tests

Use for:

-   database behavior
-   services
-   authentication
-   authorization
-   gateway adapters
-   RAG retrieval
-   workflows

## E2E tests

Use for important user workflows such as:

-   create novel
-   create chapter
-   edit chapter
-   configure gateway
-   run AI generation
-   publish chapter
-   reader access

## AI tests

Provide mock/fake AI providers.

Tests must not depend on paid external AI calls.

------------------------------------------------------------------------

# 26. FAILURE HANDLING

AI systems fail in many ways.

Handle explicitly:

-   timeout
-   rate limit
-   invalid request
-   authentication failure
-   model unavailable
-   gateway unavailable
-   malformed model output
-   stream interruption
-   retrieval failure
-   workflow failure
-   validation failure

Errors should be categorized.

Do not expose internal provider credentials or sensitive infrastructure
details to end users.

------------------------------------------------------------------------

# 27. RETRY POLICY

Retries must be bounded.

Retry only errors that are plausibly transient.

Use:

-   timeout
-   exponential backoff
-   jitter where appropriate
-   maximum attempts
-   circuit breaker where appropriate
-   alternate gateway/model when routing policy allows

Do not retry indefinitely.

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

# 28. GIT RULES

Use logical commits.

Prefer commits such as:

``` text
feat(novel): add chapter versioning
feat(gateway): add multi-9router management
feat(ai): add agent skill assignments
feat(rag): add spoiler-aware retrieval
fix(editor): preserve selection after rewrite
test(gateway): cover failover routing
docs(architecture): document gateway abstraction
```

Never:

-   force-push,
-   hard-reset user work,
-   delete unfamiliar files,
-   overwrite unrelated changes,
-   bypass important verification hooks,

unless explicitly authorized.

Before committing, review the diff.

------------------------------------------------------------------------

# 29. NO UNRELATED REFACTORING

When implementing a feature:

Do:

``` text
Required change
+ necessary supporting changes
```

Do not do:

``` text
Required change
+ rewrite entire project
+ rename unrelated files
+ replace libraries
+ redesign unrelated UI
```

unless explicitly requested.

------------------------------------------------------------------------

# 30. DEPENDENCY RULES

Before adding a dependency:

1.  check whether an existing dependency already solves the problem,
2.  inspect package manager,
3.  inspect version constraints,
4.  consider bundle/runtime impact,
5.  consider security/maintenance,
6.  add only if justified.

Never invent a package name.

Never assume a package API without checking installed/documented usage.

------------------------------------------------------------------------

# 31. ENVIRONMENT CONFIGURATION

Use environment variables for secrets/configuration that should not be
committed.

Maintain:

``` text
.env.example
```

with safe placeholder values.

Never commit:

``` text
.env
.env.local
API keys
provider secrets
database passwords
session secrets
```

unless the repository explicitly uses a safe non-secret fixture.

------------------------------------------------------------------------

# 32. IMPORT / EXPORT

The platform may support:

### Import

-   TXT
-   Markdown
-   PDF
-   DOCX

### Export

-   Markdown
-   TXT
-   DOCX
-   PDF
-   EPUB

Imported material should not automatically become canon.

Treat imports as source material until normalized/approved.

------------------------------------------------------------------------

# 33. ADMINISTRATION

Admin capabilities should eventually cover:

-   gateway management
-   model registry
-   gateway health
-   routing policies
-   agent management
-   agent versions
-   skill management
-   skill versions
-   references
-   workflows
-   AI usage
-   evaluations
-   audit logs

Administrative actions must be authorized and auditable.

------------------------------------------------------------------------

# 34. IMPLEMENTATION PHASES

Use this roadmap unless repository constraints require a documented
change.

``` text
Phase 0  — Discovery
Phase 1  — Foundation
Phase 2  — Novel Engine
Phase 3  — Writer Editor
Phase 4  — Gateway Engine
Phase 5  — Knowledge Engine
Phase 6  — Agent Engine
Phase 7  — AI Orchestrator
Phase 8  — AI Workflows
Phase 9  — Reader Platform
Phase 10 — Admin & Evaluation
```

Do not skip discovery.

Do not implement all phases blindly in one pass.

------------------------------------------------------------------------

# 35. PHASE COMPLETION PROTOCOL

After each substantial phase:

1.  run typecheck,
2.  run lint,
3.  run relevant unit tests,
4.  run integration tests where applicable,
5.  run build where practical,
6.  fix failures,
7.  inspect changed files,
8.  review security implications,
9.  update documentation,
10. update `docs/implementation/progress.md`,
11. record important architectural decisions,
12. create a logical git commit when appropriate.

------------------------------------------------------------------------

# 36. PROJECT MEMORY / DURABLE STATE

Maintain durable project state in:

``` text
docs/implementation/progress.md
docs/implementation/decisions.md
docs/implementation/test-matrix.md
docs/adr/
```

If these files do not exist, create them when the project reaches the
relevant stage.

At the start of a new implementation session:

1.  read `CLAUDE.md`,
2.  read `docs/implementation/progress.md`,
3.  read relevant decisions/ADRs,
4.  inspect recent git history,
5.  inspect the current working tree,
6.  continue from the actual repository state.

Never rely only on conversational memory for project state.

------------------------------------------------------------------------

# 37. REQUIRED DOCUMENTATION STRUCTURE

Prefer:

``` text
docs/
├── architecture/
├── specs/
├── implementation/
└── adr/
```

### `architecture/`

System-level design.

### `specs/`

Feature requirements.

### `implementation/`

Current progress, checklists, decisions, test matrix.

### `adr/`

Important architectural decisions.

Documentation should explain WHY as well as WHAT when the decision is
non-obvious.

------------------------------------------------------------------------

# 38. DECISION RECORDING

Create an ADR for significant decisions such as:

-   authentication architecture
-   database architecture
-   9Router abstraction
-   gateway credential encryption
-   routing strategy
-   queue technology
-   embedding strategy
-   RAG architecture
-   canon model
-   workflow representation
-   editor architecture
-   object storage
-   provider abstraction

An ADR should contain:

``` text
Title
Status
Context
Decision
Alternatives
Consequences
```

------------------------------------------------------------------------

# 39. RESPONSE FORMAT FOR COMPLEX IMPLEMENTATION TASKS

When asked to implement a complex feature, first provide a concise
implementation plan unless the user explicitly asks for immediate
execution without planning.

The plan should include:

``` text
1. What I inspected
2. Existing architecture relevant to the task
3. Files/modules likely affected
4. Database changes, if any
5. Implementation steps
6. Tests
7. Risks
```

Then implement.

After implementation report:

``` text
Implemented
Changed files
Database changes
Tests/checks run
Remaining issues
Next recommended step
```

Do not claim completion beyond what was actually implemented and
verified.

------------------------------------------------------------------------

# 40. WHEN REQUIREMENTS ARE AMBIGUOUS

If ambiguity materially affects architecture, ask a focused question.

If the ambiguity is minor and a safe default exists:

-   choose the smallest reasonable implementation,
-   document the assumption,
-   continue.

Do not block on trivial ambiguity.

------------------------------------------------------------------------

# 41. DO NOT HALLUCINATE

Never invent:

-   existing files
-   existing functions
-   existing routes
-   database tables
-   API endpoints
-   package APIs
-   environment variables
-   9Router behavior
-   provider capabilities
-   test results

If something is unknown, inspect it or state that it is unknown.

------------------------------------------------------------------------

# 42. DEFINITION OF DONE

A feature is DONE only when applicable:

-   [ ] Requirement implemented
-   [ ] Existing architecture respected
-   [ ] Authorization implemented
-   [ ] Input validation implemented
-   [ ] Database migration created
-   [ ] Error handling implemented
-   [ ] Tests added
-   [ ] Existing tests preserved
-   [ ] Typecheck passes
-   [ ] Lint passes
-   [ ] Build passes where practical
-   [ ] Security reviewed
-   [ ] Observability considered
-   [ ] Documentation updated
-   [ ] Progress updated
-   [ ] No secrets exposed
-   [ ] No unrelated refactor introduced

------------------------------------------------------------------------

# 43. FINAL ENGINEERING PRINCIPLE

The goal is not to produce the largest amount of code.

The goal is to build a system that remains understandable and
maintainable as NovelForge AI grows.

Prefer:

``` text
Grounded implementation
        +
Clear domain boundaries
        +
Small coherent changes
        +
Strong verification
        +
Durable documentation
```

over:

``` text
Speculative architecture
        +
Massive rewrites
        +
Hard-coded providers
        +
Unverified claims
```

When uncertain, inspect first. When changing architecture, document it.
When handling AI, preserve traceability. When handling canon, preserve
author authority. When handling credentials, treat them as secrets. When
finishing work, verify it.
