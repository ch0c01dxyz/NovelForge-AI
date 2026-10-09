# NF-WF-050: SCALE Evidence Workflow Implementation Plan

050B integration update (2026-10-09): the author authorized merging reviewed
[050B](NF-WF-050B-scale-review-and-author-decisions.md) through `800cf37`.
S1 consumption/S2 source is implemented and separately reviewed; complete
merged-revision acceptance remains pending. Verify the frozen regression and
live author/publication boundaries before closing the child. Next draft and
separately review 050C for off-by-default optional S3 assistance. No 050C
contract or implementation is delivered here. GAP-039 stays open until all
retained stages and integrated acceptance pass. Earlier unchecked stage lists
and implementation-not-started statements preserve historical planning only.


Integration update (2026-10-09): 050A's reviewed S1 foundation is integrated
through `843a263` from `d78afc3`; only the child API/storage boundary is
accepted. Parent status: PARTIALLY_IMPLEMENTED / FOLLOW_UP_CONTRACT_REQUIRED.
Next: draft and separately review 050B before implementation. 050C remains
subsequent optional assistance; GAP-039 stays OPEN. Planning-only status and
unchecked historical stage lists below describe the original plan, not current
050A dispatch readiness. CURRENT and the 050A acceptance receipt own evidence.


2026-10-08 technical-contract update: [050A](NF-WF-050A-scale-evidence-foundation.md)
defines the S1 storage/authoring boundary. Its technical review status and
dispatch readiness are owned by that child; no source/schema implementation
is claimed. The inspected minimal source is immutable chapter-version prose,
not a new beat model. Append-only OPERATIONAL annotations have an independent
assessment CAS and source-head applicability pins, without changing story heads.
050B retains final-review integration, standing decisions/exceptions and UI;
050C retains optional AI proposals. GAP-039 stays OPEN.

> For agentic workers: execute bounded children under the project's Multi-LLM
> protocol. Use superpowers:executing-plans when available; no additional
> harness plugin or provider/model is mandatory.

Status: DECISION_RECORDED / IMPLEMENTATION_PLANNED. Parent and final author
HARD/guidance amendment review APPROVE by review_mutations_034 (2026-10-08).
This parent authorizes documentation/planning only, not unfrozen code edits.
Owner/planner: local coordinator. Separate plan reviewer: review_mutations_034.
Author acceptance owner: project author. Child implementer/reviewer assignments
must be recorded before dispatch; an implementation actor cannot approve itself.
Baseline: 7d2a4dc; preserve unrelated edits. Issue: GAP-039; M3/M5/M8, CAP-06.

**Goal:** make SCALE review compare actual structured chapter-conflict evidence
with approved standing, with author decisions and optional AI proposal assistance.
**Architecture:** reuse narrative-rhythm's pure assessor, existing narrative
policies, final-text review and revision/approval infrastructure. S1 provides
structured evidence, S2 supplies explicit author changes/exceptions, and S3
only proposes evidence. No competing canon or gateway implementation.
**Tech stack:** existing TypeScript, Prisma/PostgreSQL, Fastify and Vue/Nuxt.
**Spec:** docs/adr/ADR-0016-scale-evidence-and-author-decisions.md.

## Required reading and inspected evidence

- START-HERE, AGENTS/CLAUDE, CURRENT, DELIVERY-PLAN and task template.
- ADR-0016, ADR-0015, MODEL-EVIDENCE-POLICY, MULTI-LLM-ORCHESTRATION.
- Historical NF-WF-047F S1/S2/S3 proposal; chosen scope supersedes its advice
  against S3 and its unselected quota alternatives, not its historical evidence.
- packages/narrative-rhythm/{scale,vocabulary}.ts and scale.test.ts.
- packages/ai-services/src/narrative.ts; apps/api/src/narrative-routes.ts;
  apps/api/src/services/final-text-review.ts; apps/api/src/manuscript.test.ts.
- packages/database/prisma/schema.prisma: ChapterVersion, Scene,
  NarrativePolicy, FinalTextReview and existing revision/approval models.
- docs/03-domain/NARRATIVE-RHYTHM.md, writer-workspace and DESIGN-TOKENS.

Observed: final-text-review.ts currently sets proposal.scale to standing.scale
and discards the assessment. scale.ts already computes reach from own scale and
access; reputation is descriptive. No operative conflict tagging source is
implemented by the existing assessor. Parent checks were read-only inspection,
not a new runtime battery or proof of feature readiness.

## Global constraints and scope

English project artifacts; en/id UI with English fallback. Preserve tenant
boundaries, immutable chapter provenance and canon authority. Reuse existing
capabilities where their exact semantics fit; freeze any capability change.
S3 defaults off, is configured per novel and uses runtime-selected profiles.
LLM suggestions are untrusted proposals until an authorized author decision.
No guessed serving-model identity, unsupported accepted evidence, hidden
enablement, automatic approval,
whole-manuscript scan, invented evidence, quota limits or silent historical edits.

Allowed parent writes: this plan, ADR-0016, START-HERE, CURRENT, DELIVERY-PLAN,
NARRATIVE-RHYTHM.md, NF-WF-047F annotation and ISSUES-AND-GAPS.md.
Forbidden at this boundary: source/schema/migration/UI edits, live calls,
working database changes and production deployment. Each child must freeze
exact source/test paths, schemas, owners and negative proofs before coding.
Windows reuses existing Docker/data; Ubuntu preflights native prerequisites.
Mutation tests use owned disposable databases; migration SQL needs prior review.

## Execution order and deliverables

### 050A — S1 structured evidence foundation

- [x] Freeze a minimal operative-conflict tagging contract using actual stored
  chapter/scene/structured-event identities, not an invented beat table. Pin
  chapterVersionId and relevant source revision; distinguish conflict relevance
  from an entity's mere presence. Specify bounded reads and source evidence.
- [x] Define the tag creation/replacement/read API, allowed author roles,
  validation, append-only audit/revision effects, invalidation and legacy state.
  Decide exact storage and schema in the child ADR amendment/contract review.
- [ ] Write failing integration tests for valid labels, unknown scale, foreign
  novel/version/source, invalid anchors, stale edits and mention-only evidence.
- [ ] Implement the reviewed data/authoring boundary and test empty/populated
  migrations. Historical absence remains unassessed, not an automatic tag.
- [ ] Verify and separately review the submitted diff before dependent work.

### 050B — S1 review integration and S2 author decisions

- [ ] Freeze the author-selected incomplete HARD behavior: hold approval when
  required SCALE evidence is missing/pending; complete violations also block.
  Keep SOFT advisory. Specify any receipt/status/schema changes explicitly;
  do not relabel incomplete evidence as a proved scale violation or PASS.
- [ ] Freeze interfaces for reviewed conflict claims, standing-change proposals
  and chapter exceptions. Version-pin decision applicability and policy state.
  Record actor/reason; specify atomic stale/duplicate/concurrent refusal.
- [ ] Write failing tests for VILLAGE versus KINGDOM conflict, approved access
  to KINGDOM, SOFT advice, configured HARD refusal and explicit incomplete state.
- [ ] Add an always-available missing-data checklist with field/source, reason,
  explanation, illustrative example and next action. Missing conflict labels,
  unsupported reach/access and stale applicability have distinct guidance.
  Examples must never be represented as actual novel facts.
- [ ] Distinguish absent evidence from valid empty access and an explicit,
  version-bound author declaration of no operative conflict. A quiet chapter
  must not be forced to invent drama merely to complete its SCALE assessment.
- [ ] Replace the standing-versus-itself input; retain deterministic assessment.
  Add authorized approve/reject/alternative and chapter-specific exception flows.
  An exception must not silently update global standing or bypass hard canon.
- [ ] Expose the real author flow in the existing narrative/writer workspace;
  test loading/empty/error/stale states, both locales and missing-key fallback.
- [ ] Prove policy/claim edits invalidate prior review applicability and later
  chapter edits cannot reuse old evidence. Review exact diff independently.

### 050C — Optional S3 proposal assistance

- [ ] Freeze the per-novel off-by-default setting, authorized setter and version
  behavior. No extraction call when disabled; disabling does not erase history.
- [ ] Define structured extraction output and evidence validation against the
  pinned final text, using bounded chapter/context input. Proposals have pending,
  approved/rejected/superseded outcomes; no score substitutes for evidence.
- [ ] Write failing tests for disabled calls, malformed/hallucinated evidence,
  gateway failure, unknown usage/model, changed chapter/policy and decisions by
  unauthorized actors. AI output must never directly change approved standing.
- [ ] When enabled, generate explanatory missing-data advice as untrusted
  suggestions; when disabled, use 050B's deterministic checklist with no model
  call. Advice failure retains checklist/blocked gate. Rejecting a required
  claim leaves evidence incomplete; unused proposals do not block valid S1 data.
- [ ] Implement extraction through existing Model Profile/Gateway services;
  task/component attribution is explicit (OTHER / scale.extract unless an
  independently reviewed taxonomy extension is needed). NF-WF-049 owns tokens.
- [ ] Provide approve/reject/alternative UI, preserve the original proposal,
  and route approved labels through the same S1/S2 validation/decision boundary.
- [ ] Verify enablement, extraction, decision and fresh deterministic review
  end to end. Separately review exact source and bounded migration artifacts.

## Commands, migration and closure

Child commands must use existing package scripts: selected Vitest files,
API/worker/web typechecks, changed-source lint and migration deploy on owned
scratch only. Expected green is not an executed result. Children add meaningful
negative tests and record actual commands/exits in their own receipts.
Additive storage must preserve historical chapters/receipts; review populated
upgrade, rollback compatibility and cross-domain restore/invalidation effects.
No destructive down migration or working database reset.

GAP-039 closure requires all retained stages, a usable author workflow,
configured HARD/SOFT behavior, disabled/enabled S3 proofs, version/tenant/
evidence negatives, recovery implications and independent review. A decision,
data model or optional extractor alone does not close the gap.

## Context checkpoint and next action

Engram has no authoritative runtime session binding (GAP-021); attributed writes
are prohibited by the runtime hook. No session was invented and no save claimed.
This task/CURRENT are the fallback. Next: implement the reviewed READY 050A
schema/API/authoring contract. HARD/guidance direction and the parent plan are
reviewed; 050A's separate contract reviews are recorded in that child/CURRENT.
050B/050C are not READY. Documentation-only
verification: required source/test paths exist and git diff checks passed;
no new runtime tests, live calls, schema edits or working database changes.
