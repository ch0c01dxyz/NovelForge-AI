# Implementation Phases

## Phase 0 — Discovery
- inspect repository
- identify stack
- identify existing auth/database/UI
- document current architecture
- identify gaps and risks
- produce implementation plan

Do not rewrite working infrastructure without evidence.

## Phase 1 — Foundation
- authentication
- authorization
- base layout
- database
- migrations
- logging
- error handling
- configuration
- storage
- queue infrastructure
- test harness

## Phase 2 — Novel Engine
- novel CRUD
- chapters
- chapter versions
- scenes
- characters
- relationships
- locations
- factions
- items
- world rules
- lore
- timeline
- plot

## Phase 3 — Writer Editor
- Tiptap
- autosave
- version history
- scene navigation
- publishing states
- inline AI action framework

## Phase 4 — Gateway Engine
- multi-9Router CRUD
- credential encryption
- model discovery
- model registry
- health checks
- routing
- retry/failover
- usage tracking
- admin UI

## Phase 5 — Knowledge Engine
- document ingestion
- chunking
- embeddings
- pgvector
- structured facts
- retrieval
- spoiler-aware modes
- canon states
- continuity evidence

## Phase 6 — Agent Engine
- agents
- agent versions
- skills
- skill versions
- agent-skill assignments
- references
- knowledge policies
- prompt templates

## Phase 7 — AI Orchestrator
- task resolution
- context assembly
- prompt assembly
- model profiles
- gateway selection
- streaming
- generation persistence
- validation

## Phase 8 — AI Workflows
- chapter pipeline
- workflow builder
- workflow versioning
- validators
- human approval
- Novel Brain

## Phase 9 — Reader Platform
- explore
- search
- novel pages
- reader
- bookmarks
- follows
- comments
- notifications
- author pages

## Phase 10 — Admin and Evaluation
- dashboards
- usage analytics
- evaluations
- audit
- system health
- operational tooling

## Rule
After each phase:
1. run typecheck
2. run lint
3. run unit/integration tests
4. run build where practical
5. fix failures
6. review changed files
7. update docs
8. create a logical git commit
