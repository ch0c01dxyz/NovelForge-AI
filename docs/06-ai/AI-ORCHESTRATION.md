# AI Orchestration

Status: target contract for M1–M3; current implementation gaps are tracked in
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md). Extend existing
orchestrator/executor services; do not create a competing generation path.

## Agent, Skill and Model Profile

Agent = role + versioned instructions + allowed skills + context policy +
Model Profile + output contract + validators. Skills are reusable operations
or writing capabilities, not personas. Product model identifiers are catalog
data behind Model Profiles; the selected coding-worker pair is configured in
the separate [implementation playbook](MULTI-LLM-ORCHESTRATION.md).

Initial chapter responsibilities: Scene Planner, Chapter Writer, voice/style,
Continuity/Lore/Knowledge reviewer, Rhythm/Outline reviewer and Canon Extractor.
They need not each be a separate model call. Reuse pure rules where applicable;
a deterministic finalizer must not rewrite reviewed text.

## Task inputs and source manifest

A chapter task identifies actor/workspace/novel, chapter/scene and story
position, expected manuscript version, source revision/branch, approved
outline version, instruction and task policy. Resolve ownership/current
approval on the server rather than trusting client IDs. Generic brainstorming
may omit chapter inputs but cannot claim chapter-level consistency.

Persist before the first transport attempt:

- logical request/generation/run identity and requested action;
- immutable source revision, chapter/outline versions and relevant state pins;
- agent/skill/workflow/prompt versions and resolved Model Profile;
- context sections actually used, stable provenance/source spans, budget,
  omissions and incomplete-context reason if applicable;
- author instruction and generation settings with sensitive access controls.

The exact typed API/schema changes belong in reviewed task contracts.
These fields describe requirements, not existing exported types or routes.
Failed/incomplete generations must retain explanatory provenance too.

## Shared Context Compiler

Direct chapter requests and chapter workflow steps use the same compiler
and authority rules. The executor still owns step order; the gateway still
owns transport. Do not duplicate retrieval/prompt policies across entry points.

Priority: explicit author instruction → approved outline/current scene →
relevant mandatory canon → current character/relationship/world/knowledge
state → active threads/promises → timeline/causal constraints → relevant
recent/historical memory → Narrative DNA/style → external references.
Instruction and outline authority cannot silently invalidate hard canon.

Resolve stable identities rather than matching character/entity names.
Select facts valid at the target story position; story time and publication
order are distinct. Scope by novel, active cast, locations, arcs, threads and
dependencies before bounded retrieval. Do not read all canon then take the
oldest records until a character limit is reached.

Reserve capacity for instructions and output, account for the entire request,
and record the budget method. Character counts may be a conservative estimate,
not proof of a token limit. Mandatory task constraints cannot be silently
truncated: split the task, retrieve a narrower sufficient context, or return
a visible incomplete-context failure. Optional omitted sources remain visible.

Canonical facts and references are source data, not executable instructions.
Source IDs/spans must resolve to immutable accessible versions. Projection
freshness is checked against its dependency/source revision; stale derived
memory is bypassed, rebuilt or surfaced, never presented as current truth.

## Generation lifecycle

Authorize → resolve and pin task/definitions/sources → compile context →
persist request/context → select capable model/gateway → generate/stream →
validate complete output → review final artifact → bounded correction if
needed → extract candidate changes → author/policy decisions → stale/conflict
recheck → checkpoint if required → canonical transaction → derived rebuild.

Text may stream as an incomplete draft. Machine steps use schema-validated
structured output before downstream use. Never stream a contracted result
as validated before it is complete. A later prose edit creates a new artifact
and invalidates the affected review/extraction/approval.

## Structured output and evidence

Use existing JSON Schema/Zod-compatible validation; reject unsupported
contracts instead of silently ignoring keywords. Validate source identity,
tenant, timestamps/story position, enums and references as well as JSON shape.
A valid schema does not prove a factual claim or authorize a mutation.

Findings include rule, severity, supporting evidence/source version, affected
entities/artifact, and remediation. Extracted facts remain Candidate Canon.
Follow [MODEL-EVIDENCE-POLICY](MODEL-EVIDENCE-POLICY.md) for unsupported claims,
fabricated citations, conflicting evidence and incomplete retrieval.

## Durable execution and failure

Use the existing workflow records and BullMQ with persisted step outputs,
version pins and resume position. Reauthorize delayed decisions and writes.
Deduplicate decisions and mutations; duplicate transport attempts may incur
usage but must never append manuscript or commit canon twice.

Transport retries preserve logical request/context and remain bounded.
Deterministic contract, permission, or canon failures require correction,
not blind retry. Bound repair attempts and cost; preserve unsuccessful output
for explanation. Cancel requests stop future work and mark partial artifacts
incomplete; cancellation never erases already committed history.

## Outcome and observability

Expose separate generation/run, review, proposal/decision, manuscript apply,
canonical commit and projection-freshness outcomes. Record latency, attempts,
gateway/resolved model, token/usage when available, errors, retries/fallbacks,
validation/evidence results and final artifacts. Unknown usage is unknown,
not zero. Gateway success alone cannot mark a rejected workflow successful.

See [core workflows](../07-workflows/CORE-WORKFLOWS.md) for acceptance,
approval continuation, publication and recovery handoffs.
