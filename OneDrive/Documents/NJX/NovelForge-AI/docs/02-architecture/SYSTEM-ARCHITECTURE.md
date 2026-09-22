# System Architecture

## Topology

``` text
Nuxt Web
   |
Fastify API
   |
   +-- Story Core
   +-- Story Intelligence
   +-- Character Intelligence
   +-- Relationship Intelligence
   +-- Story Simulation
   +-- Narrative Rhythm
   +-- Endgame Intelligence
   +-- Story Versioning
   +-- AI Platform
           |
           +-- Context Compiler
           +-- Workflow Engine
           +-- Agent Runtime
           +-- Model Manager
           +-- Gateway Manager
                    |
                    +-- OmniRouteGateway
                            |
                         OmniRoute
   |
PostgreSQL + pgvector
   |
Redis/BullMQ Workers
   |
S3-compatible storage
```

## Deployment style

Start as a modular monolith plus workers. Do not start with distributed
microservices. Module boundaries are enforced in code, contracts,
repositories, events, and tests.

## Recommended monorepo

``` text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  database/
  config/
  auth/
  story-core/
  story-intelligence/
  character-intelligence/
  relationship-intelligence/
  story-simulation/
  narrative-rhythm/
  endgame-intelligence/
  story-versioning/
  ai-core/
  retrieval/
  validation/
  shared/
```

## Transaction boundaries

Canonical mutation commands run through application services. A
high-impact story mutation should be one logical Story Transaction: 1.
authorize; 2. validate command; 3. calculate impact; 4. checkpoint if
policy requires; 5. create revision/change-set; 6. mutate canonical
entities atomically where possible; 7. enqueue derived-state
invalidation/rebuild; 8. run post-commit validators; 9. surface
warnings/conflicts.

## Event model

Domain events are immutable audit facts about NovelForge operations,
e.g.: `CanonFactAdded`, `WorldRuleModified`, `CharacterStateChanged`,
`RelationshipChanged`, `TimelineEventAdded`, `OutlineNodeChanged`,
`CheckpointCreated`, `BranchCreated`, `GenerationCompleted`,
`CandidateCanonProposed`.

Use versioned relational state + immutable audit/change log + periodic
snapshots. Do not require pure event sourcing for every domain.
