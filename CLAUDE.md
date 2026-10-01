# CLAUDE.md --- NovelForge V2 Operating Constitution

This file contains permanent implementation rules. Detailed
specifications live under `docs/`. Keep this constitution equivalent to
`AGENTS.md`; change both in the same task.

Start at `START-HERE.md`. Use `docs/implementation/DELIVERY-PLAN.md` for
execution order and `docs/14-progress/CURRENT.md` for evidence and gaps.
The roadmap owns phase numbering, not proof of feature completion.
`docs_compare/` is a historical requirements archive, not active instructions.

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

Chapter generation must resolve the approved outline, story position, and
source revision on the server. Pin relevant state and definition versions
before the first model attempt. Direct chapter generation and chapter
workflow steps must use the same context rules. Fetch bounded relevant
records; do not fetch all facts and truncate by creation order. Mandatory
task constraints must never disappear silently to satisfy a context budget.

## 8. Long-form consistency

Support hierarchical memory: L0 current generation L1 current chapter L2
recent chapters L3 arc L4 saga L5 global novel L6 historical archive

Never summarize away hard canon. Summaries are projections, not truth.

## 9. Versioning/recovery

Canon must never be destructively overwritten.

High-impact mutation flow: Authorize -\> Impact Analysis -\> Required
Checkpoint -\> Story Transaction -\> Apply -\> Blocking Validation -\>
Record Derived Invalidation/Rebuild Intent -\> Commit or Abort -\>
Asynchronous Rebuild and Advisory Checks.

Canonical changes and durable rebuild intent commit atomically. Do not hold
database transactions across LLM calls or human approval. If a required
checkpoint cannot be created, refuse the mutation. A failed rebuild leaves
an explicit stale/failed projection, never a false success.

Restoring a checkpoint creates a new revision based on that checkpoint.
Later history remains recoverable.

Bulk AI rewrites require a pre-operation checkpoint.

Minimum revision/checkpoint support precedes integrated chapter mutation
and memory consolidation (ADR-0013). A canon supersede chain or manuscript
version alone does not prove cross-domain recovery.

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
-   Write new specifications, task contracts, handoffs, and progress entries
    in English unless the author explicitly requests another language.
-   Preserve historical records; annotate superseded decisions instead of
    silently rewriting history. No task may mark planned work as implemented.

## 11. Definition of Done

A feature is not done merely because files exist. Applicable items must
include: implementation, migration, authorization, validation, error
handling, tests, documentation, observability, UI loading/empty/error
states, rollback/versioning implications, and acceptance criteria.

Track backend, workflow, UI, recovery, and end-to-end evidence separately.
A component test or schema is not evidence of a usable author workflow.
An approval node is not complete until authorized approve/reject and safe
continuation are tested. Generation, text acceptance, canon approval, and
publication have separate outcomes. Revalidate the final edited text; any
later edit invalidates approvals/reviews tied to the previous version.

Full platform delivery requires the capability ledger and release gates in
`docs/implementation/DELIVERY-PLAN.md`; no silent scope reductions.

## 12. Multi-LLM orchestration protocol

Each task contract must state: task ID and measurable goal; required reading;
dependency evidence; allowed and forbidden paths; exact inputs/outputs;
invariants; acceptance and negative tests; commands and prerequisites;
migration and rollback effects; owner/reviewer; and handoff evidence.

Follow `docs/06-ai/MULTI-LLM-ORCHESTRATION.md` and
`tasks/templates/TASK-TEMPLATE.md`. The author-selected coding models are
`deepseek-v4.1-flash` and `glm-5.3-flash`; verify runtime availability and
capabilities rather than inventing identifiers or relying on model reputation.
One bounded task and one writer per file at a time. Freeze shared contracts
before dependent work; require a separate review of the exact submitted diff.
Use existing authorization to continue ready tasks; do not add a permission
gate for each routine step. Escalate unresolved requirement/architecture
conflicts with evidence and a concrete recommendation.

Agents must not broaden scope silently. If architecture conflicts are
discovered, stop the affected change, document the conflict, and propose
an ADR or follow-up task.

## 13. Evidence, uncertainty and technical issues

Follow `docs/06-ai/MODEL-EVIDENCE-POLICY.md`. Distinguish observed evidence,
documented claims, inference, proposals and unknowns. Never invent test results,
API behavior, citations, model dispatch, user approval or completion. Valid
JSON and model agreement do not prove truth. Verify current sources/callers.

When a claim is unsupported, stop the affected action, record/correct the
claim, inspect downstream impact, obtain evidence, repair and revalidate.
Do not bypass authorization, validation or recovery to continue. Creative
story text is allowed; invented events do not become approved canon.

Every model must record technical problems, confusion, unsupported claims,
blockers and implementation gaps in the single file
`docs/implementation/ISSUES-AND-GAPS.md` before a workaround or completion
claim. Include evidence, owner task, impact, next action and closure check.
Other docs reference issue IDs; do not create competing registers. Close only
with resolution and verification evidence. Continue independent authorized
work while a dependent path is blocked.

## 14. Engram context persistence

Use Engram MCP as mandatory durable working-context storage for coding agents.
Follow the Engram checkpoint/recovery protocol in
`docs/06-ai/MULTI-LLM-ORCHESTRATION.md`. Save decisions and verified discoveries
as they occur; update a compact task/worktree/role checkpoint at meaningful
boundaries, before handoff or planned context reset, and at the end of each
substantive turn. Confirm save success before reporting a checkpoint saved.

After `/clear`, compaction, or model replacement, recover only the relevant
project/task memory, then verify the task contract, Git state, affected files
and evidence before continuing the next unfinished step. Engram is a working
context aid, not source-code truth, approval authority or NovelForge story canon.
Never store secrets, entire transcripts or unnecessary manuscript content.

Use the authoritative current session binding supplied by the runtime; never
invent a session ID or reuse an old session's ID after a new session starts.
If Engram is unavailable, report it, record the issue in ISSUES-AND-GAPS.md,
and preserve a concise fallback handoff in the existing task/progress record.
Do not claim automatic capture of `/clear` without a verified harness hook.

## 15. Final principle

> The LLM writes and reasons. NovelForge remembers, validates,
> simulates, versions, and protects the story.
