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
high-impact story mutation is one logical Story Transaction: authorize and
validate the command; calculate impact; capture the required checkpoint at
the expected source boundary; compare the current head/version; apply the
approved mutations and revision/change set; run blocking validators; record
projection invalidation and durable rebuild intent in the same database
transaction; commit or abort. Workers then rebuild and run advisory checks.

Checkpoint/head mismatch or a blocking validation failure prevents commit.
An unavailable Redis queue does not lose work: committed rebuild intent is
retried durably. A failed post-commit rebuild leaves explicit stale/failed
derived state; it does not erase the canonical commit or fabricate success.
Never hold a database transaction across an LLM call or human approval.

Minimum revisions/checkpoints precede integrated chapter mutation and memory
consolidation (ADR-0013). New domains must join the same transaction/recovery
contract, not bypass it with a separate write path.

## Event model

Domain events are immutable audit facts about NovelForge operations,
e.g.: `CanonFactAdded`, `WorldRuleModified`, `CharacterStateChanged`,
`RelationshipChanged`, `TimelineEventAdded`, `OutlineNodeChanged`,
`CheckpointCreated`, `BranchCreated`, `GenerationCompleted`,
`CandidateCanonProposed`.

Use versioned relational state + immutable audit/change log + periodic
snapshots. Do not require pure event sourcing for every domain.
