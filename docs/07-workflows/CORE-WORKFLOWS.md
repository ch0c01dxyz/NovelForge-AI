# Core Product Workflows

Status: required target behavior; implementation evidence is tracked in
[CURRENT](../14-progress/CURRENT.md), the [delivery plan](../implementation/DELIVERY-PLAN.md)
and [issues register](../implementation/ISSUES-AND-GAPS.md). A documented flow
is not an implemented flow. Apply [ADR-0013](../adr/ADR-0013-workflow-delivery-and-recovery-foundation.md)
and the [model evidence policy](../06-ai/MODEL-EVIDENCE-POLICY.md).

## Shared rules

- Authorize every command server-side, including resumed and queued commands.
- Pin source/target versions and relevant agent/skill/workflow definitions.
- Separate generation success, review completion, text acceptance, canonical
  commit, projection freshness and publication. One does not imply the others.
- Persist outputs/evidence before dependent steps. Do not hold DB transactions
  while calling a model or waiting for a human.
- A hard invariant blocks application; a soft narrative preference advises.
- A later edit invalidates affected review/approval. Detect stale inputs again
  at apply/commit, not just when generation starts.
- Mandatory checkpoints and blocking validators fail closed.
- Every mutation is idempotent under repeated delivery and uses an expected
  version/revision. A mismatch returns a visible conflict for review.

## 1. Novel setup and planning

Create workspace/novel → author supplies premise, goals and optional ending
vision → define initial world/characters and Narrative DNA → propose saga/arc
direction → prepare a near-term chapter/scene outline → author approves →
record versions/revision → make the outline available to chapter generation.

Detailed planning decreases with narrative distance. Do not require a full
2,500-chapter script, optional simulation modules, or a fixed ending before
writing. Synopsis guides initial planning; approved outline plus accumulated
state guides the next chapter. Contradictions with hard canon require an
explicit correction proposal, not silent outline priority.

If the outline is missing, return a planning action or use an explicitly
recorded author-directed planning override. Generic brainstorming may run
without an approved outline; do not mislabel it approved chapter generation.

## 2. Chapter generation and review

| Step | Responsibility | Persisted handoff / failure behavior |
|---|---|---|
| Request | Identify author, novel, target chapter/scene and expected manuscript version | Authorized command and logical request identity |
| Resolve | Resolve approved outline and source revision; validate ownership/story position | Immutable source manifest; missing/stale sources produce a visible refusal or planning action |
| Compile | Retrieve bounded relevant canon/state, character knowledge/relationships, threads/promises, timeline, memory, DNA and references | Context snapshot, provenance, budget and omissions before the first model call |
| Plan | Scene Planner produces purpose, cast, objectives, conflict, stakes and permitted revelations | Structured scene plan bound to outline/source versions |
| Write | Chapter Writer uses the plan and voice/style skills | Draft artifact; interrupted streams remain incomplete |
| Refine | Apply requested voice/style edits if needed | New artifact version; earlier affected reviews become stale |
| Review final text | Canon/lore/continuity/knowledge/outline/rhythm checks | Findings with evidence, rule, severity, affected source/version and remediation |
| Correct | Revise failed output within an explicit attempt/cost limit | New artifact and new relevant review; exhaustion returns to author, never an infinite loop |
| Extract | Extract candidate facts/state/events from the exact final artifact | Schema-valid, cited proposals; missing/unsupported evidence is not canon |
| Decide | Author accepts/rejects text and independently decides eligible proposals | Durable decisions against exact artifact/proposal/source versions |
| Apply | Recheck current state, impact and expected versions; checkpoint if required | Manuscript version and approved Story Transaction as applicable; no stale overwrite |
| Consolidate | Rebuild projections from committed revision | Fresh/stale/failed state and durable retry; next chapter consumes authoritative sources |

Voice/style are required responsibilities, not mandatory extra LLM calls on
every chapter. The Finalizer verifies artifacts, decisions and version pins;
it must not rewrite text after final validation. A prose generation may stream;
machine contracts must be validated before their output is used downstream.

A correction loop is a bounded business process. Preserve the executor's DAG
invariant: use bounded revision attempts or a follow-up run, not graph cycles.

## 3. Durable approval and continuation

A run pauses at HUMAN_APPROVAL after persisting its completed steps and the
decision target. The durable decision identifies actor, timestamp, rationale,
artifact/proposal version and expected source revision.

| Event | Required behavior |
|---|---|
| Approve | Reauthorize, verify target/source freshness, record decision once, continue unfinished work on the same run |
| Reject | Record rejection; do not execute dependent apply steps; preserve draft and evidence |
| Request revision | Preserve old artifact/decision, create a linked revision attempt, re-review changed output |
| Retry decision request | Return the recorded result; never apply twice |
| Source changed while waiting | Mark affected work stale and require revalidation/new decision; do not silently use old approval |
| Worker restart or lost queue delivery | Recover from stored run/step state and durable work intent |
| Cancel | Stop future steps, request transport cancellation, preserve partial artifacts; completed commits require a separate corrective operation |

Choose exact API/storage enum mappings in the reviewed implementation contract.
These are behavioral transitions, not claims that current enums/routes exist.
Never change a completed step's pinned agent version during resume.

## 4. Canonical mutation and checkpoint

Authorize → classify impact → calculate affected domains → capture consistent
pre-change checkpoint when required → compare expected head/source versions →
Story Transaction → apply approved changes → blocking validation → persist
revision/change set plus projection invalidation and durable rebuild intent →
commit or abort → asynchronous rebuild and advisory checks.

Validate invariants against the actual transaction state. Checkpoint failure
blocks high-impact mutation. A checkpoint and mutation must share the verified
base boundary; concurrent changes require a new impact/preview decision.
Low-risk approved edits still create auditable revisions even if policy does
not require a named checkpoint.

A model cannot grant itself approval. Automatic canon policy must explicitly
authorize the exact mutation class; confidence or successful generation is
insufficient. Existing canon supersede history remains intact.

## 5. Chapter acceptance and memory

Text acceptance may save a manuscript version while disputed proposals remain
pending. Do not turn pending claims into authoritative memory. Extraction may
run before acceptance, but it must be revalidated against the accepted version.

Approved proposals → canonical state/events transaction → durable invalidation
intent → chapter projection → arc/saga/global projections as needed → relevant
historical retrieval. Each projection records its source revision and source
versions. Summaries never replace hard canon or immutable chapter evidence.

L0/L1 may be run/context artifacts; not every L0–L6 level needs a dedicated
table. A stale projection must be rebuilt, bypassed using authoritative
bounded retrieval, or surfaced as incomplete context. It must never be labeled
fresh. Failed rebuilds do not undo an already committed canonical revision.

## 6. Inline editing, imports and outline evolution

Inline rewrite/expand/shorten/dialogue/tone/continue actions use the shared
orchestrator, selected range, expected manuscript version and appropriate
bounded context. Show a preview/diff and require an authorized apply action;
do not overwrite concurrently saved text or auto-publish the result.

Imports → validate file/size → parse into source artifacts → normalize →
author review → apply versioned manuscript/proposals. Imported text is not
automatically canon. Bulk imports use impact/checkpoint safeguards.

Accepted chapter consequences → assess current arc/outline → propose changed
future outline → show affected scenes/canon/threads → author/policy decision →
new approved outline version. Keep old versions; do not regenerate all distant
chapters or silently force the story back to synopsis.

## 7. Publishing and reader access

Accepted manuscript version → final review/release checks → authorized review
or schedule → publish an explicitly pinned version → public reader access.
Unpublish/archive revoke public serving according to policy without deleting
manuscript/canon history. Editing a draft does not mutate the published pointer.

Reader pages/search/AI resolve access and spoiler boundary on the server.
Publication is separate from canon approval and story restore. Details and
retained reader/social/format requirements:
[Publishing and reader specification](PUBLISHING-AND-READER.md).

## 8. Bulk rewrite, branches and What-If

Select bounded scope → impact analysis → mandatory checkpoint → isolated
branch/workspace artifact scope → durable generation jobs → review final text
and semantic compatibility → explicit apply/merge decision → revision and
projection rebuild. Unsupported branch/merge operations must refuse clearly.

What-If creates an isolated branch, applies hypothetical changes, simulates
affected state/outline and reports consequences. Discard or propose merge;
never mutate main automatically. Conflicting merges remain proposals until
resolved. Cancellation retains completed artifacts and never deletes history.

## 9. Simulation and endgame

Enable only requested story modules. Approved actions produce evidence-based
consequences or uncertain proposals using prerequisites, resources, causal
links, information reach and time. Model creativity is not proof of a causal
effect. Apply through the same canonical mutation/recovery flow.

Endgame: activate horizon → build resolution ledger → classify critical debt →
plan final saga → review character/relationship/world closure → final conflict
and aftermath → callbacks/legacy/epilogue → closure review. Chapter count is
soft unless explicitly hard; do not invent major unresolved debt merely to
extend a story that satisfies its ending conditions.

## 10. Completion proof

Demonstrate chapter N → approved consequences → fresh context for chapter N+1
through the writer UI, plus a checkpoint restore preserving later history.
Then demonstrate a real non-member reader seeing only the pinned publication.
Use adversarial cases in [TESTING](../10-testing/TESTING.md), record unresolved
failures in the single issues register, and keep runtime gates open until
these behaviors are executed and independently reviewed.
