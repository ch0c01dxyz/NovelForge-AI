# NovelForge V2 --- START HERE

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

**Current next task:** submit the drafted
[NF-WF-003 — chapter context compiler](tasks/NF-WF-003-chapter-context-compiler.md)
contract (**PLANNED**, not dispatchable) for separate review after the
2026-10-05 GAP-026 amendments. Use the refreshed manifest, then dispatch only
after actual approval; earlier rounds do not approve changed portions.
The author scope decision is resolved: **full tiered compiler**.
001 design and children 002A–D have recorded reviews; do not restart them.
[002F — foundation acceptance](tasks/NF-WF-002F-foundation-acceptance.md)
returned **VERIFIED 2026-10-04 for the evidenced M1 foundation scope only**:
that is self-verification by the implementing model, not an independent review,
so GAP-013 stays OPEN, and full cross-domain recovery stays OPEN under GAP-004.
002E stays PLANNED until a consumer is designed; do not create an outbox
speculatively. Read CURRENT and the single issue register for
evidence/limitations; queue pointers are not test receipts.

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
