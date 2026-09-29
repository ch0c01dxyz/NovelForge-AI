# Long-Term Implementation Roadmap

The roadmap is sequential for risk reduction, not a prohibition on
parallel work after contracts stabilize.

> **This file is the authority for phase names and numbers.** `CURRENT.md`
> has used a "Phase N" label for a milestone rather than a roadmap phase:
> "Phase 8 — AI Orchestrator" (2026-10-03) names work the roadmap
> schedules across Phase 3 (AI infrastructure) and Phase 4 (agent/skill/
> workflow platform). When the two disagree, the roadmap numbering wins
> and `CURRENT.md` is corrected.

## Phase 0 --- Repository & Architecture Foundation

Deliver: monorepo, TypeScript configs, lint/format/test, Docker Compose,
env validation, CI baseline, documentation structure, ADR process,
module boundary tests. Exit: clean clone boots on Windows Docker/WSL2
and Ubuntu Docker.

## Phase 1 --- Platform Core

Auth, workspaces, memberships, novels, permissions, audit foundation.
Exit: tenant isolation tests pass.

## Phase 2 --- Writing Core

Chapters/scenes, versioned manuscript, autosave, editor shell,
import/export baseline. Exit: author can safely write/version manuscript
without AI.

## Phase 3 --- AI Infrastructure / OmniRoute

AIGateway interface, OmniRoute adapter, gateway/model management, model
profiles, streaming, logical requests/attempts, retry/fallback,
generation history. Exit: provider-independent generation path with
audited failures.

## Phase 4 --- Agent/Skill/Workflow Platform

Versioned agents, skills, workflows, structured output contracts, task
execution. Exit: chapter test workflow can run multiple agents
deterministically.

## Phase 5 --- Knowledge & Retrieval

References, parsing/chunking, pgvector, full-text/metadata hybrid
retrieval, provenance. Exit: retrieval is evidence-bearing and
tenant-safe.

## Phase 6 --- Story Intelligence Core

Canon, candidate canon, timeline, story events, threads, promises,
causal edges, hierarchical memory. Exit: Story Brain can answer core
factual/continuity questions with evidence.

## Phase 7 --- Planning System

Synopsis, saga/arc/outline, Planning Horizon, outline evolution and
approval. Exit: chapter planner follows current approved outline rather
than synopsis overfitting.

## Phase 8 --- Character & Relationship Intelligence

Historical character state, knowledge boundary, arcs, reputation,
relationship graph/groups/agreements, meaningful-interaction tracking.
Exit: monogamy/harem/polygamy and enemy-to-ally validation scenarios
pass.

## Phase 9 --- Narrative DNA & Rhythm

Narrative DNA, drama windows, cooldown, antagonist lifecycle, pattern
detection, scale appropriateness. Exit: low-frequency drama scenario
remains non-mechanical and repetition warnings are evidence-backed.

## Phase 10 --- Story Simulation

Optional civilization, settlement, technology dependency/adoption,
information diffusion, economy, politics, historical divergence,
conflict state, opponent learning. Exit:
reincarnated-genius/civilization-building validation scenario remains
causally coherent.

## Phase 11 --- Story Versioning & Recovery

Revisions, change sets, checkpoints, impact analysis, restore preview,
branches, semantic diff, selective restore, compatibility scan, derived
rebuild. Exit: major worldbuilding error can be safely restored without
deleting history.

## Phase 12 --- Endgame Intelligence

Ending vision/conditions, resolution ledger, debt burn-down, callbacks,
legacy, epilogue/after-story. Exit: long-form test novel can transition
to endgame based on conditions rather than chapter number.

## Phase 13 --- Publishing & Production Hardening

Publishing workflow, backups, observability, security review,
performance/load tests, accessibility, operational dashboards. Exit:
production readiness checklist passes.

## Phase 14 --- Advanced Intelligence

What-if simulator, semantic branch merge, advanced story debugger,
configurable health rules, cost optimization, evaluation suites,
optional additional story modules.

## MVP cut line

A serious early MVP should include Phases 0--7 plus basic character
state and basic checkpoints. Do not wait for advanced civilization
simulation before testing real author workflows.
