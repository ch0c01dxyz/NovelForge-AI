# AGENTS.md --- NovelForge V2 Operating Constitution

This file contains permanent implementation rules. Detailed
specifications live under `docs/`.

## 1. Mission

Build NovelForge as a production-grade platform capable of authoring and
maintaining coherent webnovels of 2,000--2,500+ chapters.

NovelForge combines: - writing/editor tooling; - AI orchestration; -
narrative intelligence; - structured story state; - story simulation; -
long-form retrieval; - versioning/checkpoints/branches; - validation and
recovery.

## 2. Architectural invariants

1.  Canon is the source of story truth.
2.  LLM memory, embeddings, summaries, caches, and generated prose are
    not automatically canon.
3.  Synopsis is high-level direction, not a permanent chapter script.
4.  Current approved outline has higher chapter-planning authority than
    synopsis.
5.  Story State describes the present; history/events explain how it
    became true.
6.  Causality must be preserved across long-running story consequences.
7.  Narrative DNA defines how the story should feel and uses soft
    constraints unless explicitly configured otherwise.
8.  Planning Horizon prevents detailed overplanning of distant chapters.
9.  Story Simulation makes meaningful actions produce persistent
    consequences.
10. Endgame Vision guides completion without freezing the journey.
11. Every meaningful story mutation is versioned and auditable.
12. Rollback is non-destructive.
13. AI may propose canon changes; it may not silently commit them unless
    an explicit author policy allows the exact mutation class.
14. Derived data must be invalidated/rebuilt when its canonical source
    revision changes.
15. All high-impact mutations require impact analysis and a recoverable
    pre-change checkpoint.
16. No routine generation request may scan or inject the entire
    manuscript.
17. All important AI outputs use machine-validated structured contracts
    where feasible.
18. Authorization is enforced server-side, never by an LLM.

## 3. Domain language

Use these names consistently: - Agent = who performs an AI role. - Skill
= reusable capability/tool available to an agent. - Workflow = ordered
orchestration of agents, skills, retrieval, validators, and approvals. -
Model Profile = desired model capability, not a provider/model
hardcode. - Gateway = transport/routing boundary to LLM
infrastructure. - Canon = approved story truth. - Candidate Canon =
extracted/proposed truth not yet approved. - Story State = current
structured state. - Story Event = historical occurrence. - Narrative DNA
= durable style/rhythm/story-preference policy. - Planning Horizon =
detail level based on narrative distance. - Revision = immutable logical
mutation record. - Snapshot = reconstructable state representation at a
revision boundary. - Checkpoint = named recoverable snapshot. - Branch =
alternate story-state lineage. - Derived State = rebuildable
memory/index/cache/summary/embedding.

Do not invent synonyms in code when a canonical term exists.

## 4. Story planning authority

For chapter-level planning: Explicit Author Instruction \> Current
Approved Chapter/Scene Outline \> Current Arc/Saga State \> Canon \>
Character/Relationship/World State \> Timeline and Continuity
Constraints \> Recent Story Memory \> Relevant Historical Memory \>
Synopsis \> General Creativity

This planning hierarchy does not permit an outline to contradict hard
canon silently.

## 5. Canon authority

Explicit author correction/instruction \> Approved Canon \> Published
Chapter Facts \> World/Character/Relationship Rules \> Timeline \>
Approved Plot Plan \> Agent instructions \> References \> Model
creativity

Conflicts must be surfaced, not silently reconciled.

## 6. AI gateway rules --- OmniRoute

OmniRoute is the primary gateway implementation.

Architecture: AI Orchestrator -\> Model Manager -\> Gateway Manager -\>
`AIGateway` -\> `OmniRouteGateway` -\> OmniRoute.

Never scatter OmniRoute HTTP calls throughout business modules.

Required gateway configuration: - id, name, base URL; - encrypted
credential reference; - enabled/health status; - priority/weight; -
request timeout; - retry policy; - capability/model catalog; -
latency/error/quota observations.

Prefer Bearer authentication. Never log API keys or place them in URLs.

Support OpenAI-compatible chat/responses/embeddings behind the adapter.
Model identifiers are data, not code constants.

NovelForge owns its logical request ID, generation ID, attempt IDs,
timeout policy, audit records, and final outcome even when OmniRoute
performs internal routing/fallback.

Timeout/transient retry: 1. classify error; 2. record attempt; 3.
preserve logical request and context snapshot; 4. bounded retry with
exponential backoff + jitter; 5. optional fallback according to
capability constraints; 6. record final result.

Do not blindly retry authentication, authorization, invalid schema,
unsupported capability, deterministic validation, or malformed
configuration errors.

Streaming interruption is not success. Partial output must be marked
incomplete and must not duplicate persisted chapter content.

## 7. Context rules

Never send the entire novel by default.

Context Compiler priority: author instruction -\> current outline/scene
-\> hard canon -\> current states -\> active threads/promises -\>
timeline -\> relevant recent memory -\> relevant historical memory -\>
Narrative DNA/style -\> external references.

Every retrieved fact should retain provenance where possible.

## 8. Long-form consistency

Support hierarchical memory: L0 current generation L1 current chapter L2
recent chapters L3 arc L4 saga L5 global novel L6 historical archive

Never summarize away hard canon. Summaries are projections, not truth.

## 9. Versioning/recovery

Canon must never be destructively overwritten.

High-impact mutation flow: Impact Analysis -\> Auto Checkpoint -\> Story
Transaction -\> Apply -\> Validate -\> Invalidate/Rebuild Derived State
-\> Commit or Abort.

Restoring a checkpoint creates a new revision based on that checkpoint.
Later history remains recoverable.

Bulk AI rewrites require a pre-operation checkpoint.

## 10. Development rules

-   Inspect existing code and docs before modification.
-   Make small coherent changes.
-   Preserve module boundaries.
-   Domain logic must not depend directly on HTTP/UI/provider
    implementations.
-   Database migrations are reviewed artifacts.
-   Validate input at API boundaries.
-   Prefer explicit schemas/types over unstructured dictionaries.
-   Do not claim tests/verification not actually performed.
-   Update documentation and progress records when behavior changes.
-   New architectural decisions require an ADR.
-   Never weaken security to make a demo work.

## 11. Definition of Done

A feature is not done merely because files exist. Applicable items must
include: implementation, migration, authorization, validation, error
handling, tests, documentation, observability, UI loading/empty/error
states, rollback/versioning implications, and acceptance criteria.

## 12. Multi-LLM orchestration protocol

Each task contract must state: - task ID and goal; - required reading; -
allowed paths; - forbidden paths; - inputs; - outputs; - invariants; -
acceptance tests; - migration effects; - rollback implications.

Agents must not broaden scope silently. If architecture conflicts are
discovered, stop the affected change, document the conflict, and propose
an ADR or follow-up task.

## 13. Final principle

> The LLM writes and reasons. NovelForge remembers, validates,
> simulates, versions, and protects the story.
