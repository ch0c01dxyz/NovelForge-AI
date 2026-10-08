# NovelForge V2 --- START HERE

Current dispatch update (2026-10-09): [NF-WF-050B](tasks/NF-WF-050B-scale-review-and-author-decisions.md)
is READY after separate technical and recovery reviews. It owns deterministic
SCALE review, author standing/exception decisions and the localized author flow.
050A is already integrated; do not repeat it. Assign the runtime implementer,
then execute 050B's serial reviewed slices. No 050B code is implemented yet;
GAP-039/GAP-119 and subsequent optional 050C remain open.


Current dispatch (2026-10-09): reviewed S1 foundation NF-WF-050A is integrated
through `843a263` from external `d78afc3`. Next, draft and separately review
the 050B final-review/author-decision/UI contract before implementation. Do not
redispatch 050A. GAP-039 remains OPEN; 050C and release gates remain separate.
The earlier READY/implementation-not-started statements below are historical.


S1 next task: [NF-WF-050A](tasks/NF-WF-050A-scale-evidence-foundation.md) owns
the exact version-bound SCALE evidence contract and its separate review status.
050A is READY after separate technical review; this update delivers a contract,
not a repaired SCALE approval gate. 050B/050C and GAP-039 acceptance remain.

SCALE author direction recorded (2026-10-08):
[ADR-0016](docs/adr/ADR-0016-scale-evidence-and-author-decisions.md) selects S1
foundation, S2 follow-up and optional author-reviewed S3. Follow the planned
[NF-WF-050 stages](tasks/NF-WF-050-scale-evidence-workflow.md); dispatch the
reviewed 050A foundation first. GAP-039 remains OPEN, not awaiting the S1/S2/S3
choice. Author decided incomplete HARD assessment holds approval and requires
missing-data explanations/examples; optional AI guidance follows S3 enablement.

Current product decision (2026-10-08): NovelForge records generation usage
analytics, while the external LLM Gateway owns quotas. Follow
[ADR-0015](docs/adr/ADR-0015-generation-usage-analytics.md) and
[NF-WF-049](tasks/NF-WF-049-generation-usage-analytics.md). Historical
GAP-063 quota proposals below are superseded; SCALE GAP-039 remains separate.
NF-WF-049 is implemented/reviewed with bounded local acceptance; GAP-063's
revised local implementation gate is CLOSED. Older combined GAP-039/063
next-step instructions below now dispatch only GAP-039, never another quota
decision or repeat analytics implementation. Working migration remains a
normal environment/release preflight step, not live deployment approval.

Status: Workflow integration plan accepted; platform delivery gates open\
Primary LLM gateway: OmniRoute\
Target: production-grade long-form webnovel authoring platform for
2,000--2,500+ chapters.

## What NovelForge is

NovelForge is an **AI Writing + Narrative Intelligence + Story
Simulation + Long-Form Memory + Story Versioning Platform**.

The LLM writes and reasons. NovelForge owns truth, state, validation,
orchestration, recovery, and traceability.

## Start the next task

The repository contains working infrastructure and backend slices, not a
completed author-to-reader product. Do not restart the project or infer
completion from a phase number. The accepted repair is recorded in
[ADR-0013](docs/adr/ADR-0013-workflow-delivery-and-recovery-foundation.md).

1. Read one operating constitution: [AGENTS.md](AGENTS.md) or
   [CLAUDE.md](CLAUDE.md). Their rules must remain equivalent.
2. Read [current evidence and gaps](docs/14-progress/CURRENT.md).
3. Select the first dependency-ready task in the
   [delivery plan](docs/implementation/DELIVERY-PLAN.md).
4. Use the [role-based execution protocol](docs/06-ai/MULTI-LLM-ORCHESTRATION.md)
   and [task template](tasks/templates/TASK-TEMPLATE.md). Read the mandatory
   [evidence/hallucination policy](docs/06-ai/MODEL-EVIDENCE-POLICY.md).
5. Read only that task's domain specifications, contracts, callers, and tests.
6. Implement, verify, obtain a separate review, and update the evidence ledger.

**Current dispatch (2026-10-07):** the author accepted integration of
`work/gap040-gap043` through `ad54faa`. NF-WF-042/044/045 and hardening
NF-WF-046 are implemented and separately reviewed; the final tested code
revision is `9265822`. See CURRENT for local merge verification evidence.
Next, resolve the author-owned GAP-039/063 product decisions before
dispatching dependent implementation. Human GAP-051 and live release
acceptance remain separate gates.
Independent external preparation may proceed through
[NF-WF-047](docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md): evidence audit,
fixture amendment, test-environment diagnosis, conditional populated-upgrade
investigation, native release preparation and proposal-only SCALE/quota research.
A/B/C and F's proposal are now integrated through `89d57f5` (2026-10-08).
Do not redispatch them. D's missing-input receipt and E's corrected isolated
smoke procedure/reported rerun are integrated through `9fe1443` (2026-10-08).
Local [NF-WF-048](tasks/NF-WF-048-local-gap-verification.md) subsequently
closed GAP-018's bounded recovered-upgrade gate and GAP-117's isolated-smoke
evidence gate with separate reviews and owned-resource cleanup. See the
[local receipt](docs/implementation/048-local-gap-verification.md). Historical
checksum differences remain preserved; this does not approve live repair.
Next: author-owned GAP-039/063, human GAP-051 and live release gates.
CURRENT owns acceptance and remaining local gates.
[NF-WF-041](tasks/NF-WF-041-novel-scoped-workflow-history.md)
resolves GAP-034 and GAP-116 with scoped tests and separate review.
[NF-WF-039](tasks/NF-WF-039-final-revision-release-verification.md)
is historical automated green at712cca6 after reviewed repairs035–038/040; see the exact receipts
in CURRENT. GAP-110 scene revisions and GAP-083 Recovery Center wiring are
implemented and reviewed. Older evidence/contract gaps remain; keep release,
live deployment and human GAP-051 evidence separate.

Pulled baseline: `e538180`; tasks027–034 have implementation commits and reported gap closures. The post-pull audit found real runtime regressions under GAP-109; do not substitute historical closure reports for current verification. NF-WF-035 repairs comparison claims/provision compensation, tick cursors, merge/checkout locks, scene-delete lineage, restore coherence and memory/notification queue recovery. See [CURRENT](docs/14-progress/CURRENT.md) for actual host receipts. The GAP-051 human accessibility gate and live deployment/final-release verification remain open. Do not recreate the author-removed GAP-098 tracker.

## New-host environment preparation

Follow [environment preflight](docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Ubuntu: mandatory native dependency/service setup; no Docker installation.
Windows: reuse the author's running Docker environment/data; no stack reset.
Verify host-specific endpoints and use separate disposable test databases.
Environment readiness does not bypass task review or release acceptance gates.

## Project language

English is the project-wide default for every model and role: all new/revised
content, workflows, prompts, documentation and code comments/tests. UI text
supports English (`en`) and Bahasa Indonesia (`id`) through localization keys;
English is the missing-translation fallback. Follow AGENTS.md / CLAUDE.md for provenance preservation and scoped author
overrides. A conversation in another language does not change this default.

## Reference reading order

If this is a resumed session after `/clear` or compaction, first follow the
[Engram recovery protocol](docs/06-ai/MULTI-LLM-ORCHESTRATION.md#mandatory-engram-checkpoint-and-recovery).
Retrieve only the matching project/task/worktree checkpoint, then verify it
against the current task, files and Git state. Do not reload the whole chat.

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

## Frequent context resets

Engram MCP is mandatory working-context storage for coding agents. Save
compact task checkpoints proactively and confirm persistence before planned
clears. The protocol does not install or guarantee a pre-clear harness hook.

Before `/clear`, send: `Save an Engram checkpoint for clear and confirm it was saved.`

After `/clear`, send: `Read START-HERE.md and resume the current task from Engram; verify the checkpoint against the current repository before continuing.`

If memory tools fail, use the existing task/progress handoff and record the
problem in the single issues register. Memory cannot replace canonical project
files, review evidence or author approval.

## Golden rule

> LLMs are replaceable reasoning/writing workers. PostgreSQL canonical
> state is the story source of truth.

## Implementation strategy

Start as a **modular monolith plus background workers**. Preserve strong
module boundaries so selected domains can later be extracted without
rewriting the product.

Delivery order: source revisions and minimum recovery → complete chapter
context → durable generation/review/approval → writer UI → approved state
and memory for the next chapter → publishing and reader access → advanced
recovery, optional simulation and endgame → production release evidence.

Reuse the existing services, gateway adapter, workflow executor, PostgreSQL,
and BullMQ. No replacement stack or second orchestrator is required.

## Document authority

| Question | Authoritative document |
|---|---|
| Permanent invariants | AGENTS.md / CLAUDE.md |
| Accepted architectural changes | Linked, accepted ADR files |
| Phase names and numbers | [Roadmap](docs/12-roadmap/IMPLEMENTATION-ROADMAP.md) |
| What to implement next and dependencies | [Delivery plan](docs/implementation/DELIVERY-PLAN.md) |
| Runtime product behavior | [Core workflows](docs/07-workflows/CORE-WORKFLOWS.md) and linked domain specs |
| What actually works and what remains open | [CURRENT](docs/14-progress/CURRENT.md), progress receipts, test matrix |
| Live technical problems, confusion and gaps | [Single issues register](docs/implementation/ISSUES-AND-GAPS.md) |

`docs_compare/` is a historical requirements archive, not an executable
instruction source. Its retained requirements are mapped in the delivery
plan. Historical progress entries do not override current contracts or
prove that a product workflow is complete. Surface contradictions and
resolve the affected contract before implementation.

## Implementation models

Use the coding model selected by the author at runtime. No model/provider pair
is required. Assign an implementer and a separate reviewer actor; both may use
the same model. Record requested aliases separately from runtime evidence.
Historical model names identify past receipts, not current assignments.
The playbook defines handoff and unavailable-review handling. Product AI roles
continue to use Model Profiles.

## Release checkpoints

An author preview requires the complete write → review → approve → commit
→ memory → next-chapter loop plus minimum restore. A publishing preview
also requires a real non-member reader path. Full platform completion
requires every required capability and release gate in the delivery plan;
advanced work cannot hide missing reader/editor flows.

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
-   Coding environments: Windows 11 uses the existing Docker Desktop/WSL2
    services; Ubuntu uses native services without installing Docker.
    Docker Compose remains an optional deployment artifact.

## Non-goals for early phases

-   Microservices everywhere
-   Detailed outline for 2,500 chapters
-   Autonomous AI canon mutation
-   Pure vector-RAG as story memory
-   Genre-specific hardcoding
-   Arbitrary LLM-generated health scores
-   Destructive rollback
