# Chapter generation/review template

The `chapter-generation-review` PLATFORM workflow (key
`chapter-generation-review`) is the one versioned chapter
generation/review template (NF-WF-006). It orchestrates the full
chapter pipeline — context compilation, planning, drafting, voice/style
review with a bounded correction loop, final review, canon-candidate
extraction, and author approval — on the NF-WF-004 durable substrate
with NF-WF-005 approval decisions. Source of truth:
`packages/workflow-templates/chapter-generation-review/`; instantiation:
`scripts/seed-chapter-template.ts`.

## Stage table

The graph has 20 steps and 21 edges, `maxSteps: 40` (longest path: 20
executed steps; budget covers a full re-drive). Every AGENT step pins
an agent `ref` and an executor-enforced `outputSchema`; every stage
boundary has a VALIDATOR that re-checks the prior step's output against
the same schema.

| # | Step key | Kind | Agent / purpose |
|---|---|---|---|
| 1 | `compile_context` | RETRIEVAL | Shared chapter-context compiler (NF-WF-003) over `$input.novelId` |
| 2 | `plan` | AGENT | `chapter-planner` (DEEP_PLANNER) — scene plan from context + outline |
| 3 | `validate_plan` | VALIDATOR | Re-checks the plan against plan-schema |
| 4 | `write` | AGENT | `chapter-writer` (CREATIVE_WRITER) — chapter draft |
| 5 | `validate_draft` | VALIDATOR | Re-checks the draft against draft-schema |
| 6 | `review_vs` | AGENT | `voice-style-reviewer` (CONTINUITY_REVIEWER) — voice/style review |
| 7 | `validate_vs` | VALIDATOR | Re-checks the findings against findings-schema |
| 8 | `correct_1` | CONDITION | `$steps.review_vs.json.needsCorrection == true` → `rewrite_1`, else → `review_final` |
| 9 | `rewrite_1` | AGENT | `chapter-writer` — revise the draft per the review |
| 10 | `validate_rewrite_1` | VALIDATOR | Re-checks rewrite 1 against draft-schema |
| 11 | `review_1` | AGENT | `voice-style-reviewer` — re-review the revised draft |
| 12 | `validate_review_1` | VALIDATOR | Re-checks the findings against findings-schema |
| 13 | `correct_2` | CONDITION | `$steps.review_1.json.needsCorrection == true` → `rewrite_2`, else → `review_final` |
| 14 | `rewrite_2` | AGENT | `chapter-writer` — second and final revision |
| 15 | `validate_rewrite_2` | VALIDATOR | Re-checks rewrite 2 against draft-schema |
| 16 | `review_final` | AGENT | `final-reviewer` (LONG_CONTEXT_REVIEWER) — final review over the plan, all three drafts (precedence: rewrite_2 > rewrite_1 > write), and the review history |
| 17 | `validate_final` | VALIDATOR | Re-checks the final findings against findings-schema |
| 18 | `extract` | AGENT | `chapter-extractor` (STRUCTURED_EXTRACTOR) — canon-candidate proposals from the final draft |
| 19 | `validate_extract` | VALIDATOR | Re-checks the extraction against extraction-schema |
| 20 | `approve` | HUMAN_APPROVAL | Author approves the draft + proposals (NF-WF-005 snapshot) |

## Schemas

`schemas/` holds the four JSON contracts (compiled by
`@novelforge/validation`):

- **plan-schema** — the scene plan: purpose, cast, objectives, conflict,
  stakes, permitted revelations, `outlineRef`, and `sourcePins`
  (workflow + outline versions, required).
- **draft-schema** — the chapter draft: `prose` (min 200 chars),
  optional title.
- **findings-schema** — review findings: array of
  category/severity/rule/evidence/remediation items plus
  `needsCorrection` (boolean). Evidence spans are plain strings.
- **extraction-schema** — canon-candidate proposals: each proposal
  carries `citations` enforced by `contains` (at least one citation
  object with `source` + `span`) — there is deliberately **no**
  `minItems` on the array, so the enforcement reads as "every listed
  proposal is evidenced" rather than a count rule.

## Correction bound

The correction loop is structural, not counter-based: there are exactly
two rewrite stages (`rewrite_1`, `rewrite_2`) and no edge leads back to
an earlier stage, so the graph cannot loop. `review_final` binds all
three drafts and its instruction fixes the precedence —
rewrite_2 > rewrite_1 > write — so the reviewed draft is always the
latest one. A third correction is impossible by construction.

## Approval integration

The run parks at `approve` (HUMAN_APPROVAL). The NF-WF-005 snapshot
covers the final draft and the extraction proposals; the decision binds
to the snapshot hash, and approve resumes the same run to SUCCEEDED
while reject fails it with the author's reason. Nothing downstream of
`approve` exists — approval is the terminal stage.

## Agent shadowing

The five platform agents (`chapter-planner`, `chapter-writer`,
`voice-style-reviewer`, `final-reviewer`, `chapter-extractor`) are
PLATFORM-scoped. A workspace may publish an agent with the same key; the
workspace-scoped row shadows the platform one at resolve time (the
scoped unique index explicitly permits the key overlap), so a workspace
can customize a stage's behavior without forking the workflow.

## Condition-path extension

The two CONDITION steps read `$steps.review_vs.json.needsCorrection`
and `$steps.review_1.json.needsCorrection` — a one-level nested path
into a prior step's JSON outcome. This is the single author-approved
machinery extension for the template (NF-WF-006): `validateGraph`
accepts `$steps.<key>.json.<field>` (field `[a-zA-Z0-9_-]{1,64}`) and
rejects deeper nesting and `.text.` nesting; the executor resolves the
nested form with an own-property guard, else `undefined`.

## Instantiation

`scripts/seed-chapter-template.ts` drives the public API as a platform
administrator (`platform:define`): it creates the five PLATFORM agents
and the `chapter-generation-review` PLATFORM workflow, then publishes
it. The script is idempotent — key-exists plus canonical-JSON
byte-equality against the published version means no-op; when the graph
differs it publishes a NEW `WorkflowVersion` and never mutates v1. Runs
pin the version they were enqueued against.
