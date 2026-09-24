# ADR-0006: Agent / Skill / Workflow Platform

**Status:** Accepted (Phase 4)

## Context

Phase 4 introduces the three domain concepts CLAUDE.md §3 defines as
distinct, and they must not collapse into one generic "AI abstraction":

- **Agent** — WHO performs a task (role, instructions, model profile).
- **Skill** — HOW a task is performed; reusable by several agents.
- **Workflow** — the orchestration of agents, skills, retrieval,
  validators and human approvals.

The roadmap's exit criterion is specific: *"chapter test workflow can run
multiple agents deterministically"*. Three forces shaped the design.

1. **Reproducibility.** A run must stay explainable after its definitions
   are edited, or an author cannot tell what produced a chapter
   (CLAUDE.md §2.11, §22).
2. **Bounded execution.** CLAUDE.md §19 forbids an unbounded workflow loop
   and requires graph validation.
3. **Structured output.** docs/06-ai/AI-ORCHESTRATION.md requires
   machine-validated contracts for machine steps, and CLAUDE.md §2.13
   forbids silently committing what a model produced.

## Decision

**Templates are versioned by append, exactly like the manuscript.**
`Agent`/`Skill`/`Workflow` hold identity plus a pointer to the current
immutable version row; every content edit appends a new version. A run
stores the version numbers it resolved, so history survives edits.

**`scope` separates the shared catalog from tenant definitions.**
`DefinitionScope.PLATFORM` rows require the platform capability
`platform:define`; `WORKSPACE` rows require membership plus the matching
`*:manage`. A workspace sees its own rows in any status and PLATFORM rows
only when PUBLISHED. A PLATFORM-scoped row is deliberately *not* writable
by a workspace admin, and platform administration is *not* a bypass for
workspace authorization (ADR-0005).

**Structured-output contracts fail closed.** `@novelforge/validation`
screens a JSON Schema and rejects any keyword it cannot actually enforce.
This matters because the underlying converter silently ignores several
standard keywords — verified for the installed zod: `minItems`,
`maxItems`, a `required` entry absent from `properties`, and any unknown
`format` string are all accepted and dropped. A contract that appears to
constrain output but does not is worse than no contract, because it is
trusted.

**Workflow graphs are validated, then re-validated on load.** The graph is
acyclic, has exactly one true and one false branch per CONDITION, may only
reference earlier steps, and has a step budget. Validation runs again in
the executor so a hand-edited row cannot bypass the shape.

**Determinism is structural.** Step order is a topological sort with
declaration order as the tie-break, so the same graph always runs in the
same sequence. The executor never iterates a map to decide order. Model
output is *not* deterministic, and the design does not claim otherwise:
it is contract-checked at the step boundary before any later step reads
it.

**One AI path.** A workflow step reaches a model only through the Phase 3
`AiServices.generate`, injected as a `StepGenerator`. Every agent step
therefore inherits gateway routing, bounded retry, fallback, circuit
breaking and the generation ledger, and is attributable to user, novel,
agent, prompt, model and gateway (CLAUDE.md §18).

**`skillKeys` is enforced by injection.** An agent's granted skills have
their instructions added to that agent's system prompt. Enforcement is a
deterministic function of the stored definition rather than of execution
order.

## Alternatives considered

- **Mutable template rows.** Simplest, and rejected: a run could not be
  explained after the definition changed, which is the whole point of the
  phase.
- **A single `templates` table with a `kind` discriminator.** Fewer
  tables, but the three definitions carry genuinely different fields
  (skill category, graph plus derived key lists) and the constitution
  requires the concepts stay separate.
- **A `workflow_key` string on `Generation` instead of new tables.** No
  version pinning, no per-step record, no graph validation.
- **Enforcing `skillKeys` by rejecting a SKILL step whose "owning" agent
  did not grant it.** Depends on inferring an owner from execution order,
  which a skipped branch changes; rejected as nondeterministic.
- **Hand-rolling the JSON Schema validator.** Rejected in favour of
  wrapping the installed converter behind a fail-closed screen, which is
  far less code and was verified keyword by keyword.
- **`@@unique([scope, workspaceId, key])` alone.** PostgreSQL treats
  `NULL` as distinct, so this does not constrain PLATFORM rows at all.
  Rejected as the whole story: the composite index is kept for workspace
  rows, and migration `20260927_phase4_platform_key_uniqueness` adds a
  partial unique index per definition table over the `workspace_id IS
  NULL` rows to close the platform half. The same pair still admits one
  PLATFORM and one workspace row sharing a key, which is intended — a
  tenant may shadow a shared definition.

## Consequences

- Editing an agent mid-project cannot retroactively change what a past run
  did; a step records its agent/skill version numbers.
- A DRAFT definition cannot be executed or seen by another workspace, so
  publishing is a real gate.
- Adding a schema keyword requires teaching the validator to enforce it
  and adding it to `SUPPORTED_KEYWORDS`; anything else is rejected at
  registration with the offending path.
- `maxSteps` bounds a run at runtime as well as at validation time; a
  graph cannot exceed the declared budget, and an absolute ceiling applies
  regardless.
- Streaming, retrieval and `RETRIEVAL` steps are validated as graph kinds
  but not yet executable; the executor refuses them explicitly rather than
  pretending to run them.
- Workflow runs are synchronous within the request. Moving them to the
  worker queue is a later concern (Phase 13); the run record already
  carries the status and timing needed for that.
- A `HUMAN_APPROVAL` step parks the run as `AWAITING_APPROVAL` and the run
  is terminal there: there is no approve/reject endpoint and no resume
  path yet. `completedAt` is left null on such a run so that "parked" and
  "done" stay distinguishable once resume is built.
