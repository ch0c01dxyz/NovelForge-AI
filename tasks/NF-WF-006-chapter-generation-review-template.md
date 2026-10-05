# Task NF-WF-006: One versioned chapter generation/review template

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: VERIFIED (contract APPROVE_WITH_FINDINGS round 2, 2026-10-05 — findings applied; implementation not yet dispatched)
Milestone / capability IDs: M2 author chapter loop; DELIVERY-PLAN NF-WF-006
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-003
VERIFIED (shared chapter context compiler); NF-WF-005 VERIFIED (approval
decision and safe continuation); GAP-003 closed.
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ 30c544d (NF-WF-005 pushed 2026-10-05)
Engram checkpoint topic key / last confirmed observation reference: Engram unavailable
on this host (GAP-021); checkpoints go to docs/implementation/progress.md.

## Goal and reason

Deliver ONE versioned, runnable chapter generation/review template that
encodes the automatable stages of `docs/07-workflows/CORE-WORKFLOWS.md` §2
as a workflow definition: compile context → plan → write → voice/style
review → bounded correction → final review → extract → human approval.
Every AI stage emits a machine-validated structured contract; schema
failures and missing evidence reject the run instead of flowing downstream;
correction is bounded by construction (the graph is a DAG — no cycles are
possible); the final text and extraction proposals are decided together
through the NF-WF-005 approval flow. This template is what NF-WF-007's UI
will run.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 architectural
  invariants, §3 domain language, §4 planning authority, §5 canon
  authority, §7 context rules, §10 dev rules, §11 Definition of Done,
  §12 orchestration, §13 evidence).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Core workflows](../../docs/07-workflows/CORE-WORKFLOWS.md) §2 (chapter
  generation and review) — the authoritative pipeline this template
  encodes. Note its explicit rules: voice/style are required
  responsibilities but not mandatory extra LLM calls on every chapter; the
  finalizer verifies artifacts/decisions/version pins and must not rewrite
  text after final validation; machine contracts must be validated before
  their output is used downstream; missing/unsupported evidence is not
  canon.
- [Narrative DNA and planning](../../docs/03-domain/NARRATIVE-DNA-AND-PLANNING.md)
  (voice/style grounding for the reviewer agents).
- [NF-WF-003 contract](./NF-WF-003-chapter-context-compiler.md) — the shared
  chapter context compiler (selection, provenance, budget; no
  oldest-facts truncation).
- [NF-WF-005 contract](./NF-WF-005-approval-decision-continuation.md)
  (frozen) — approval snapshot, decide routes, resume semantics.
- Existing machinery: `packages/validation/workflow-graph.ts`
  (`STEP_KINDS`, `SCHEMA_ENFORCING_STEP_KINDS`, acyclicity, `maxSteps`,
  CONDITION edge labels `"true"`/`"false"`), `packages/workflow-executor/executor.ts`
  (VALIDATOR semantics, CONDITION branching, HUMAN_APPROVAL park,
  `applyConditionBranches` → untaken PENDING rows become SKIPPED),
  `apps/api/src/services/definition-resolution.ts` (workspace row shadows
  the platform catalog), `packages/auth/authorization.ts`
  (`platform:define`, `workflow:run`, `workflow:approve`).
- [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md): GAP-028
  (production-worker AI wiring — constrains how the template is executed
  in tests), GAP-013, GAP-018.

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
This host (Ubuntu 24.04.5, x86_64): pnpm 12.5.1 at `~/.local/bin/pnpm`, Node
v24.20.0, PostgreSQL 16.15 + pgvector 0.6.0 on localhost:5432, Redis 7.0.15
on localhost:6379 (both started manually; no systemd auto-start). Root `.env`
is gitignored and points at scratch `novelforge_test` on localhost.
All test/migration work on scratch `novelforge_test_*` databases only; never
reset a working database. No Docker per project policy.

## Dependencies and evidence

- NF-WF-003 (shared chapter context compiler): VERIFIED — the template's
  compile stage uses it; context snapshot, provenance, and budget exist
  before the first model call.
- NF-WF-005 (approval decision and safe continuation): VERIFIED — the
  template's Decide stage is a `HUMAN_APPROVAL` step decided through the
  005 routes; the approval snapshot binds the final text AND the
  extraction proposals.
- Workflow machinery: `validateGraph` (acyclic, bounded, executable kinds),
  executor (guarded claims, VALIDATOR, CONDITION, HUMAN_APPROVAL), durable
  runs (NF-WF-004).
- GAP-028 is OPEN and constrains testing: the production worker has no AI
  wiring, so template execution tests must use deterministic step kinds or
  the existing `workflow-test-driver.ts` (fake gateway), never a
  production AI path.

## Scope

Allowed paths:
- New template source files (versioned in git): the graph JSON, the four
  platform agent specifications (key, name, modelProfile, instructions),
  and the stage output schemas. Proposed home:
  `packages/workflow-templates/chapter-generation-review/` (new package)
  with `graph.json`, `agents/*.md` (instructions), `schemas/*.json`, and
  an `index.ts` exporting the typed template.
- New idempotent instantiation script, e.g.
  `scripts/seed-chapter-template.ts`: drives the PUBLIC API as a platform
  administrator (`platform:define`) to create/publish the PLATFORM workflow
  and agents; safe to re-run (checks key existence first; never deletes or
  overwrites a published version — a changed template is a NEW
  `WorkflowVersion`, never an edit).
- Tests: template package tests (graph validates; schemas compile; agent
  specs resolve), API integration tests (instantiate via the script's
  service calls or direct API; run end-to-end with the test driver; all
  negative cases below), and unit tests for the condition-path extension
  (`packages/validation/workflow-graph.test.ts`,
  `packages/workflow-executor` executor tests — nested-path accept/reject,
  nested resolution, missing-field behavior).
- Scoped machinery change (author-approved, the only one in this task):
  `packages/validation/workflow-graph.ts` (condition-path grammar only)
  and `packages/workflow-executor/executor.ts` (`resolveReference`
  nested form only), as specified in "Condition-path extension" above.
- Docs: `docs/07-workflows/` (template documentation), `progress.md`,
  `CURRENT.md`, `test-matrix.md`, `ISSUES-AND-GAPS.md` (new problems only,
  per §13 and standing author instruction).

Forbidden paths: everything else — including `packages/auth/*`,
`packages/story-versioning/*`, the sweeper, the decide
routes, any domain-event producer (GAP-023), UI (NF-WF-007), canon
application of extracted proposals (NF-WF-008), memory consolidation
(NF-WF-009), publication (NF-WF-012). No new step kinds. No changes to
`validateGraph` or executor semantics beyond the single author-approved
condition-path extension: the template must otherwise be expressible in
the existing machinery, or the gap goes to ISSUES-AND-GAPS as a follow-up
task — never a silent machinery change.

Inputs: the template package (graph, agents, schemas); a platform
administrator actor for instantiation; a novel/workspace/chapter target
for runs.
Outputs: a PLATFORM-scoped PUBLISHED `Workflow`
(key `chapter-generation-review`) with immutable v1; four PUBLISHED
platform agents; a documented, tested instantiation procedure.

Out of scope (with follow-up owner): approval UI (NF-WF-007); applying
extracted proposals to canon (NF-WF-008 — the template's extract stage
produces CANDIDATE proposals only); revision-derived memory (NF-WF-009);
approval expiry/notifications (follow-ups); production-worker AI wiring
(GAP-028).

## Behavior and invariants

### The template graph (normative stage list)

The graph encodes these stages, in order. Correction is UNROLLED —
the graph is a DAG by validation (`GRAPH_CYCLE` rejects cycles), so the
bound is structural, not a counter:

1. `compile_context` (RETRIEVAL) — NF-WF-003 compiler: bounded relevant
   canon/state/character/threads/timeline/memory/DNA/references for the
   target chapter. Persists the context snapshot, provenance, and budget
   before the first model call (DoD: no full-manuscript scan).
2. `plan` (AGENT `chapter-planner`, DEEP_PLANNER) — structured scene plan
   bound to the approved outline and source pins. `outputSchema`:
   plan-schema.
3. `validate_plan` (VALIDATOR; `inputs: { plan: "$steps.plan.json" }`,
   `outputSchema`: plan-schema) — plan-schema conformance.
4. `write` (AGENT `chapter-writer`, CREATIVE_WRITER) — chapter draft from
   the plan + compiled context. `outputSchema`: draft-schema.
5. `validate_draft` (VALIDATOR; `inputs: { draft: "$steps.write.json" }`,
   `outputSchema`: draft-schema).
6. `review_vs` (AGENT `voice-style-reviewer`, CONTINUITY_REVIEWER) —
   voice/style/rhythm findings against Narrative DNA. `outputSchema`:
   findings-schema (`{ findings: [...], needsCorrection: boolean }`).
7. `validate_vs` (VALIDATOR; `inputs: { review: "$steps.review_vs.json" }`,
   `outputSchema`: findings-schema).
8. `correct_1` (CONDITION on `$steps.review_vs.json.needsCorrection`
   equals `true`) — true → `rewrite_1`, false → skip to `review_final`
   (untaken rows become SKIPPED per the executor's branch handling).
9. `rewrite_1` (AGENT `chapter-writer`, receives the findings;
   `outputSchema`: draft-schema) →
   `validate_rewrite_1` (VALIDATOR; `inputs: { draft: "$steps.rewrite_1.json" }`,
   `outputSchema`: draft-schema) →
   `review_1` (AGENT `voice-style-reviewer`; `outputSchema`: findings-schema) →
   `validate_review_1` (VALIDATOR; `inputs: { review: "$steps.review_1.json" }`,
   `outputSchema`: findings-schema).
10. `correct_2` (CONDITION on `$steps.review_1.json.needsCorrection`) —
    true → `rewrite_2`, false → `review_final`.
11. `rewrite_2` (AGENT, FINAL correction attempt; `outputSchema`:
    draft-schema) → `validate_rewrite_2` (VALIDATOR;
    `inputs: { draft: "$steps.rewrite_2.json" }`, `outputSchema`: draft-schema).
    No third correction exists: exhaustion proceeds to final review, never loops.
12. `review_final` (AGENT `final-reviewer`, LONG_CONTEXT_REVIEWER) —
    canon/lore/continuity/knowledge/outline/rhythm findings with evidence.
    `outputSchema`: findings-schema. The finalizer verifies; it must not
    rewrite text after validation (CORE-WORKFLOWS §2).
13. `validate_final` (VALIDATOR; `inputs: { review: "$steps.review_final.json" }`,
    `outputSchema`: findings-schema).
14. `extract` (AGENT `chapter-extractor`, STRUCTURED_EXTRACTOR) — candidate
    facts/state/events from the exact final artifact. `outputSchema`:
    extraction-schema (every proposal carries `citations[]`; missing or
    unsupported evidence is not canon).
15. `validate_extract` (VALIDATOR; `inputs: { extraction: "$steps.extract.json" }`,
    `outputSchema`: extraction-schema) — schema AND evidence presence
    (citations non-empty per proposal).
16. `approve` (HUMAN_APPROVAL) — the author decides the final text AND the
    extraction proposals together via the NF-WF-005 routes; the 005
    approval snapshot binds both.

### Draft-selection rule (normative)

The graph can produce up to three drafts (`write`, `rewrite_1`,
`rewrite_2`), but only the stages on the taken correction path execute —
the others' step rows are SKIPPED and their references render
"(not available)". `review_final`, `extract`, and their instructions bind
ALL THREE draft outputs (`$steps.write.json`, `$steps.rewrite_1.json`,
`$steps.rewrite_2.json`), and their agent instructions specify the
latest-available precedence: use `rewrite_2` if available, else
`rewrite_1`, else `write`. The instruction text states this precedence
explicitly; the bounded-correction acceptance case asserts the final
reviewer received the correct draft's content for each path.

### Condition-path extension (scoped machinery change, author-approved)

The `correct_1`/`correct_2` CONDITIONs branch on
`$steps.review_vs.json.needsCorrection` /
`$steps.review_1.json.needsCorrection` — one level of nesting below
`.json`. The current grammar (`$input.<name>`,
`$steps.<key>.text|json`) cannot express this, and without it the
delivery plan's required "bounded correction" dimension is
unimplementable. The author has approved this single, minimal extension
(the only machinery change in this task):
- Grammar: `condition.path` may additionally be
  `$steps.<key>.json.<field>` where `<field>` matches `[a-z0-9_-]{1,64}`
  (same charset as step keys). Exactly one level.
- Validation (`packages/validation/workflow-graph.ts`): extend
  `CONDITION_PATH_PATTERN` and the `CONDITION_BAD_PATH` check to accept
  the one-level form; reject deeper nesting (`$steps.<k>.json.a.b`) and
  text-nesting (`$steps.<k>.text.<field>`) with a validation error.
- Executor (`packages/workflow-executor/executor.ts`): `resolveReference`
  handles the nested form — returns `outcome.json[field]` when the
  outcome's `json` is a plain object carrying the field as an OWN
  property (same `Object.hasOwn` guard the tree uses for `$input`, so
  prototype members can never resolve), else `undefined` (so a missing
  flag compares `false` under `===`, same as today). Existing reference
  forms behave exactly as before.
- The `CONDITION_BAD_PATH` error message is updated to describe the
  extended grammar (not just the old forms), so an author hitting it sees
  the actual rule.
- Tests: validation accepts one-level / rejects two-level and
  text-nesting; executor resolves a nested field and returns `undefined`
  for a missing field; the template's two CONDITIONs branch correctly
  end-to-end.
- Backwards compatibility: existing graphs use only the old forms and are
  unaffected; the extension is additive.

### Invariant 1 — One template, versioned, platform-scoped

Exactly one `Workflow` row: scope PLATFORM, key
`chapter-generation-review`, status PUBLISHED, with immutable v1. A changed
template is a NEW `WorkflowVersion` (new number, new graph); v1 is never
edited. Runs pin `workflowVersionNumber` (existing machinery). The
instantiation script is idempotent: re-running it when the key exists and
the graph is unchanged is a no-op; when the graph changed it publishes a
new version, never mutates v1. "Graph unchanged" means byte equality of
the canonical JSON encoding (recursive key sort, UTF-8 — the same
canonicalization as NF-WF-005's `snapshot.ts`) of the stored version's
graph versus the template's `graph.json`.

### Invariant 2 — The graph is valid by construction

`validateGraph` passes on the shipped `graph.json`: acyclic, deterministic
order, every step kind executable, `outputSchema` only on
schema-enforcing kinds (AGENT/SKILL/VALIDATOR — a VALIDATOR without its
own `outputSchema` always passes, so the schema is required, not
optional), CONDITION edges labeled exactly `"true"`/`"false"`, `maxSteps`
≥ the longest path and ≤ the hard cap. The template package has a test
that loads `graph.json` and asserts validation passes — the graph cannot
rot.

### Invariant 3 — Correction is bounded structurally

Exactly two correction attempts exist in the graph (`rewrite_1`,
`rewrite_2`). `correct_1`/`correct_2` branch on `needsCorrection`; when a
review passes, the remaining rewrite stages are SKIPPED (not executed);
when both reviews demand correction, `rewrite_2` is the last write and the
run proceeds to `review_final` regardless. No counter, no cycle, no
infinite loop — the bound is visible in the graph itself.

### Invariant 4 — Machine contracts gate every AI stage

Every AGENT step declares `outputSchema` (executor-enforced:
`SCHEMA_ENFORCING_STEP_KINDS`), and every stage boundary has an explicit
VALIDATOR step that re-checks the prior output. A schema failure fails the
run with the rejection detail (existing VALIDATOR semantics) — invalid
output never flows downstream. Schemas:
- plan-schema: `{ purpose, cast[], objectives[], conflict, stakes,
  permittedRevelations[], outlineRef, sourcePins }` (all required).
- draft-schema: `{ prose (min length), title?, sceneBreaks? }`.
- findings-schema: `{ findings: [{ category, severity, rule, evidence:
  { source, version, span }, remediation }], needsCorrection: boolean }`
  — every finding carries evidence.
- extraction-schema: `{ proposals: [{ kind, text, citations:
  [{ source, span }] }] }` — every proposal carries ≥1 citation
  (enforced via `contains: { type: "object", required: ["source",
  "span"] }` on the `citations` array — `minItems` is not supported by
  the schema compiler, so `contains` is the mechanism).

### Invariant 5 — Evidence is required, not decorative

`validate_extract` rejects proposals with empty/missing citations
(schema-level: `contains: { type: "object", required: ["source", "span"] }`
on the `citations` array — the schema compiler does not support
`minItems`, so `contains` is the enforcement mechanism). The reviewer/extractor agent
instructions require every finding/proposal to cite its source and version;
unsupported claims are rejected, never canonized (CORE-WORKFLOWS §2,
constitution §2.2). Extraction produces CANDIDATE proposals only —
nothing in this template writes canon (NF-WF-008 owns application).

### Invariant 6 — Context before the first model call

`compile_context` runs before any AGENT step. It uses the NF-WF-003
compiler: bounded selection across outline/state/time/knowledge/threads/
DNA, with provenance and budget recorded on the step row. The planner and
writer instructions reference the compiled context via step-output
references (`$steps.compile_context.json`), never by re-fetching.

### Invariant 7 — Approval decides text and proposals together

The `approve` HUMAN_APPROVAL step parks per NF-WF-005; its approval
snapshot covers the final draft AND the extraction proposals. The author
approves/rejects through the 005 routes (`workflow:approve` capability);
approve resumes the run to completion, reject fails it with the reason.
Generation, text acceptance, canon approval, and publication remain
separate outcomes (DoD §11): this template completes at text acceptance.

### Invariant 8 — Platform defaults, workspace shadowing

The four agents are PLATFORM-scoped defaults. A workspace may publish its
own agent under the same key to shadow the default (existing
`resolveAgent` ordering: workspace row wins). The template never hardcodes
workspace-specific content; agent instructions are novel-agnostic and
parameterized by run input. The template's required run-input contract is:
`{ novelId: string (uuid, the novel the chapter belongs to), chapterNumber:
integer ≥ 1, outlineRef: string (the approved chapter/scene outline
identifier the plan must bind to) }`; optional: `{ targetWordCount?:
integer ≥ 1, styleNotes?: string (≤ 2000 chars) }`. `compile_context`,
`plan`, and `write` read these via `$input.*`; any other input key is
ignored by the template (never an error, never a secret — run inputs must
never contain credentials).

### Invariant 9 — Agent instructions are grounded, not improvised

Each agent's instructions are grounded in: CORE-WORKFLOWS §2 stage
responsibilities, the planning authority (§4) and canon authority (§5)
hierarchies, and NARRATIVE-DNA-AND-PLANNING for the voice/style reviewer.
Instructions must not invent tools, must not claim capabilities the step
kinds lack, and must direct structured output matching the stage's
`outputSchema`. The contract reviewer checks grounding; the instruction
text itself is implementer-authored.

### Invariant 10 — Machinery changes are limited to the approved extension

The template is otherwise expressible in the existing step kinds,
validation, and executor. The ONLY machinery change in this task is the
condition-path extension specified above (one-level
`$steps.<key>.json.<field>` in `workflow-graph.ts` +
`resolveReference` in `executor.ts`, with tests). If the implementer
finds the template needs anything beyond that — a new kind, another
validation rule change, another executor change — they STOP that part,
record it in ISSUES-AND-GAPS.md as a follow-up task, and continue the
rest — never a silent machinery change (constitution §12).

## Acceptance and verification

- [ ] `graph.json` passes `validateGraph` (package test; fails the build
  if the graph rots).
- [ ] All four `outputSchema`s compile (schema-compiler test) and each is
  referenced by its AGENT step and its VALIDATOR step.
- [ ] Instantiation script is idempotent: run twice → one workflow, one
  version, four agents; graph change → new version, v1 untouched.
- [ ] End-to-end run with the test driver (GAP-028: no production AI
  path): a run of the template reaches `SUCCEEDED`; every stage's step
  row exists with the expected status; the approval park → approve →
  completion path works through the 005 routes.
- [ ] Schema rejection: a plan violating plan-schema (e.g., missing
  `sourcePins`) → the VALIDATOR fails the run with the rejection detail;
  no downstream step executes.
- [ ] Evidence rejection: extraction proposals with empty `citations` →
  `validate_extract` fails the run; the rejection names the offending
  proposal.
- [ ] Bounded correction: (a) `needsCorrection=true` twice → exactly two
  rewrites then `review_final` (assert step-row sequence; no third
  rewrite exists; the final reviewer received `rewrite_2`'s content per
  the draft-selection rule); (b) `needsCorrection=false` at `review_vs` →
  rewrite/review stages are SKIPPED and the run proceeds to
  `review_final` (the final reviewer received `write`'s content).
- [ ] Approval integration: run parks at `approve`; the snapshot covers
  the final draft and the proposals; approve → `SUCCEEDED`; reject →
  `FAILED` with reason.
- [ ] Version immutability: publish a v2 graph; v1's row is byte-identical;
  a run started before v2 pins v1.
- [ ] Shadowing: a workspace agent with the same key shadows the platform
  default in a run (resolution order test).
- [ ] Commands: `pnpm lint` clean; typechecks for every touched workspace
  clean; named suites green with real counts (zero selected tests is not
  a pass).
- [ ] Separate review of the submitted diff; findings resolved before
  commit. Contract review (this file) returns APPROVE before dispatch.

Record actual results separately from expectations.

## Migration and rollback

- No schema migration: this task uses existing tables (`workflows`,
  `workflow_versions`, `agents`, `agent_versions`) through the existing
  definition services. (GAP-018: nothing to make re-runnable at the DDL
  level; the idempotency requirement moves to the instantiation script.)
- Rollback: the template is content, not schema — archive the workflow
  (`ARCHIVED` status) and/or publish a corrected version; never delete
  run history (existing RESTRICT semantics).
- Deploy order: template package → instantiation (platform admin via API)
  → tests. Old code is unaffected (new rows only).

## Documentation and handoff

- Document the template in `docs/07-workflows/` (stage table, schemas,
  correction bound, approval integration, shadowing).
- Update `docs/implementation/progress.md` (NF-WF-006 section with
  verified counts only), `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`.
- Record every new technical problem, confusion, blocker, or gap in
  `docs/implementation/ISSUES-AND-GAPS.md` before any workaround or
  completion claim (constitution §13; standing author instruction: all
  obstacles and problems are recorded there).
- Unknowns / risks: the exact instruction text is implementer-authored and
  reviewer-checked for grounding (not pre-approved here); the UI
  contract for NF-WF-007 (which run inputs the UI sends) is 007's scope;
  real-model output quality is not asserted — tests use the test driver.
- Next dependency-ready task: NF-WF-007 (writer generate/review/diff/
  accept UI; depends on 006).

## Review record

### Review 1 — 2026-10-05, CHANGES_REQUESTED, applied 2026-10-05

**Scope.** Contract `d131dedf` (19,556 bytes), HEAD `30c544d`. Seven
findings; all addressed (F1 per author decision, option A):

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | P1 | CONDITION path grammar forbids the nested `needsCorrection` flag — bounded correction unimplementable as specified | **ACCEPTED (option A, author-approved 2026-10-05).** Scoped machinery extension specified: one-level `$steps.<key>.json.<field>` in condition paths — validation (`workflow-graph.ts`) + `resolveReference` (`executor.ts`) + tests; backwards-compatible and additive; invariant 10 and forbidden paths updated to scope exactly this |
| F2 | P1 | `minItems: 1` is a hard schema-compile error — evidence rejection unsatisfiable | **ACCEPTED.** Enforcement via `contains: { type: "object", required: ["source", "span"] }` (verified in `SUPPORTED_KEYWORDS`); `minItems` removed everywhere |
| F3 | P2 | VALIDATOR steps underspecified (no `inputs`/`outputSchema` → no-op pass); invariant-2 parenthetical wrong about schema-enforcing kinds | **ACCEPTED.** Every VALIDATOR now pins `inputs` (first entry → prior step's `.json`) and its own `outputSchema`; parenthetical corrected to AGENT/SKILL/VALIDATOR |
| F4 | P2 | Draft-selection rule across correction branches unspecified | **ACCEPTED.** Normative rule added: `review_final`/`extract` bind all three drafts; instructions specify latest-available precedence (`rewrite_2` > `rewrite_1` > `write`); acceptance asserts the received draft per path |
| F5 | P3 | "Graph unchanged" undefined for idempotent instantiation | **ACCEPTED.** Byte equality of canonical JSON (recursive key sort, UTF-8 — same canonicalization as NF-WF-005 `snapshot.ts`) |
| F6 | P3 | Required run inputs not pinned | **ACCEPTED.** Required: `{ novelId (uuid), chapterNumber (int ≥ 1), outlineRef (string) }`; optional: `{ targetWordCount?, styleNotes? }`; other keys ignored, never secrets |
| F7 | P3 | Reference-syntax looseness | **ACCEPTED.** All references now canonical: `$steps.<key>.json` or the specified extended `$steps.<key>.json.<field>`; `$input.<name>` |

### Review 2 — 2026-10-05, APPROVE_WITH_FINDINGS, findings applied 2026-10-05

**Scope.** Contract `0b416f4b` (26,647 bytes), HEAD `30c544d`. All seven
round-1 findings verified fixed as claimed. Two new P3 observations, both
applied:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| N1 | P3 | Extension spec: own-property guard unspecified; `CONDITION_BAD_PATH` message not required to describe the extended grammar | **ACCEPTED.** `Object.hasOwn`-style own-property guard pinned; error message must describe the extended grammar |
| N2 | P3 | Bounded-correction acceptance bullet didn't assert the draft-selection rule | **ACCEPTED.** Bullet now asserts the final reviewer received the correct draft's content per path |
