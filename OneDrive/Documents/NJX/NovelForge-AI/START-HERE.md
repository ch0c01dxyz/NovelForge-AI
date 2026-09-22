# NovelForge V2 --- START HERE

Status: Architecture baseline / implementation handoff\
Primary LLM gateway: OmniRoute\
Target: production-grade long-form webnovel authoring platform for
2,000--2,500+ chapters.

## What NovelForge is

NovelForge is an **AI Writing + Narrative Intelligence + Story
Simulation + Long-Form Memory + Story Versioning Platform**.

The LLM writes and reasons. NovelForge owns truth, state, validation,
orchestration, recovery, and traceability.

## Mandatory reading order for an implementation agent

1.  `CLAUDE.md` or `AGENTS.md`
2.  `docs/00-product/PRODUCT-VISION.md`
3.  `docs/01-principles/INVARIANTS.md`
4.  `docs/02-architecture/SYSTEM-ARCHITECTURE.md`
5.  Only the domain specifications relevant to the assigned task
6.  `docs/12-roadmap/IMPLEMENTATION-ROADMAP.md`
7.  `docs/14-progress/CURRENT.md`
8.  The assigned task contract

Do **not** load every document into context unless the task genuinely
requires it.

## Golden rule

> LLMs are replaceable reasoning/writing workers. PostgreSQL canonical
> state is the story source of truth.

## Implementation strategy

Start as a **modular monolith plus background workers**. Preserve strong
module boundaries so selected domains can later be extracted without
rewriting the product.

## Recommended stack

-   Web: Nuxt + Vue + TypeScript + Tailwind CSS
-   API: Node.js + TypeScript + Fastify
-   Database: PostgreSQL
-   Vector retrieval: pgvector
-   ORM/data access: Prisma initially, with repository boundaries
    preventing ORM leakage into domain logic
-   Queue/cache: Redis + BullMQ
-   Object storage: S3-compatible abstraction
-   AI gateway: OmniRoute through `OmniRouteGateway`
-   Deployment: Docker / Docker Compose
-   Supported hosts: Windows 11 via Docker Desktop/WSL2 and Ubuntu via
    Docker Engine

## Non-goals for early phases

-   Microservices everywhere
-   Detailed outline for 2,500 chapters
-   Autonomous AI canon mutation
-   Pure vector-RAG as story memory
-   Genre-specific hardcoding
-   Arbitrary LLM-generated health scores
-   Destructive rollback
