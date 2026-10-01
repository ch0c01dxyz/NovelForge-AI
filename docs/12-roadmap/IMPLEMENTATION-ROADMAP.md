# Long-Term Implementation Roadmap

Phase numbers identify capability areas and preserve historical references;
they are not a strictly sequential implementation schedule. Use
[DELIVERY-PLAN](../implementation/DELIVERY-PLAN.md) for dependency order
after the workflow repair accepted in ADR-0013.

**Corrected next work:** minimum Phase 11 recovery/revision foundation,
then integration of Phases 2–9 into a complete author workflow. Do not
advance directly to Phase 10 while context, approval continuation, extraction,
memory or writer integration is missing. A verified backend slice does not
mean its whole phase or user journey is complete.

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

Complete scene authoring, rich editing and retained formats through M5.
The basic editor shell does not close those items. Inline AI requires the
version-safe generate/review/apply journey through the writer UI (M2).

## Phase 3 --- AI Infrastructure / OmniRoute

AIGateway interface, OmniRoute adapter, gateway/model management, model
profiles, streaming, logical requests/attempts, retry/fallback,
generation history. Exit: provider-independent generation path with
audited failures.

## Phase 4 --- Agent/Skill/Workflow Platform

Versioned agents, skills, workflows, structured output contracts, task
execution. Exit: chapter test workflow can run multiple agents
deterministically.

The full workflow gate also requires durable execution, authorized
approve/reject/resume, stale-source checks, cancellation, duplicate-delivery
protection and real writer controls. Structural determinism does not imply
deterministic prose. Queue/resume is M2 work, not late production hardening.

## Phase 5 --- Knowledge & Retrieval

References, parsing/chunking, pgvector, full-text/metadata hybrid
retrieval, provenance. Exit: retrieval is evidence-bearing and
tenant-safe.

## Phase 6 --- Story Intelligence Core

Canon, candidate canon, timeline, story events, threads, promises,
causal edges, hierarchical memory. Exit: Story Brain can answer core
factual/continuity questions with evidence.

Full delivery also requires contracted extraction, approved state application,
revision-derived memory and chapter N→N+1 retrieval through the real workflow.
Manual canon and seeded read tests satisfy only their documented slices.

## Phase 7 --- Planning System

Synopsis, saga/arc/outline, Planning Horizon, outline evolution and
approval. Exit: chapter planner follows current approved outline rather
than synopsis overfitting.

Prove outline authority through the shared generation compiler and final-text
review, not only stored outline versions or pure planning-rule tests.

## Phase 8 --- Character & Relationship Intelligence

Historical character state, knowledge boundary, arcs, reputation,
relationship graph/groups/agreements, meaningful-interaction tracking.
Exit: monogamy/harem/polygamy and enemy-to-ally validation scenarios
pass.

Integrate historical state, knowledge and relationship evidence into chapter
context, review and author controls; API-only tests are partial delivery.

## Phase 9 --- Narrative DNA & Rhythm

Narrative DNA, drama windows, cooldown, antagonist lifecycle, pattern
detection, scale appropriateness. Exit: low-frequency drama scenario
remains non-mechanical and repetition warnings are evidence-backed.

Policies must be consumed by planner/reviewer and visible in the author
workflow. Soft preferences advise; hard behavior requires explicit policy.

## Phase 10 --- Story Simulation

Optional civilization, settlement, technology dependency/adoption,
information diffusion, economy, politics, historical divergence,
conflict state, opponent learning. Exit:
reincarnated-genius/civilization-building validation scenario remains
causally coherent.

Prerequisites: M1–M3 and the branch/recovery slice used by the simulation
module. Phase 10 cannot bypass the chapter loop or introduce a second
canonical mutation pipeline.

## Phase 11 --- Story Versioning & Recovery

Revisions, change sets, checkpoints, impact analysis, restore preview,
branches, semantic diff, selective restore, compatibility scan, derived
rebuild. Exit: major worldbuilding error can be safely restored without
deleting history.

**Foundation slice (M1, pulled forward):** consistent revision/head,
cross-domain checkpoint, expected-version protection, recoverable baseline,
basic non-destructive restore and atomic projection invalidation/rebuild
intent. This precedes integrated chapter/state/memory writes.

**Advanced slice (M6):** branches, selective restore, dependency analysis,
bulk recovery and conservative merge. Advanced semantic merge may wait for
Phase 14; unresolved semantic conflicts refuse automatic application.
ADR-0013 partially supersedes ADR-0008's recovery scheduling deferral.

## Phase 12 --- Endgame Intelligence

Ending vision/conditions, resolution ledger, debt burn-down, callbacks,
legacy, epilogue/after-story. Exit: long-form test novel can transition
to endgame based on conditions rather than chapter number.

## Phase 13 --- Publishing & Production Hardening

Publishing workflow, backups, observability, security review,
performance/load tests, accessibility, operational dashboards. Exit:
production readiness checklist passes.

M4 owns pinned publication lifecycle and non-member reader access; M5 owns
discovery, reader social features, complete formats and admin/evaluation
surfaces; M8 owns operational release proof. Reader delivery is no longer
unphased. Follow [Publishing and Reader](../07-workflows/PUBLISHING-AND-READER.md).

## Phase 14 --- Advanced Intelligence

What-if simulator, semantic branch merge, advanced story debugger,
configurable health rules, cost optimization, evaluation suites,
optional additional story modules.

## MVP cut line

A serious early MVP should include Phases 0--7 plus basic character
state and basic checkpoints. Do not wait for advanced civilization
simulation before testing real author workflows.

The author-preview cut line requires M1–M3 integrated acceptance, not phase
numbers alone. Publishing preview adds M4. Full production delivery requires
the retained capability ledger and M8 gates; scope deferrals need an explicit
author decision. Track live technical blockers in
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md).
