# Generated Character Proposals

## Authorization, goal and ownership

Author approved automatic new-character suggestions with Approve / Edit / Reject
on 2026-10-21. Goal: detect evidence-backed people in a final AI chapter draft,
then explicitly create a Character and linked CHARACTER StoryEntity together.
Do not create facts, knowledge, relationships or biographies beyond author-reviewed
summary. Existing uncommitted work and all data/stashes remain; no commit/push.
Root integrates/schema/UI wiring/locales/docs; isolated backend and UI writers
have disjoint files; independent actor reviews exact final diff.

## Required reading and design

Read AGENTS, START-HERE, CURRENT, generated-character gap in ISSUES, existing
workflow executor/worker, AI services, canonical evidence/manuscript/revision
helpers and foundational writer-workspace design/tokens. Old published workflow
graphs are immutable. Their extraction contract has no reliable character fields;
do not repurpose fact-shaped CanonProposal/CanonApplication records.

Use one operational CharacterDiscoveryBatch table (schema owned by root), unique
runId, max20 candidates JSON. Sidecar uses existing AiServices.generate with
STRUCTURED_EXTRACTOR/json_object, task character.discovery, component CHAPTER,
artifactId=batch.id, versioned prompt. Reuse final validated nonblocked artifact
from durable run/approval snapshot, never UI text or full manuscript. Reserve
before one AI call; repeated delivery/UI loads read the existing batch. Worker
invokes after eligible claimed chapter runs park/finish; UI POST is a fallback
for existing historical runs. Failure never fails the chapter. No transaction
spans LLM calls. Expired RUNNING becomes UNCERTAIN; only explicit retry may send
another request, under epoch fencing with retained attempt/generation evidence.
Worker delivery uses a separate `character-discoveries` BullMQ queue and consumer,
never awaiting AI inside the parked chapter job. The shared workflow recovery
sweep also removes terminal retained jobs before re-enqueueing aged PENDING runs,
covering approval-versus-park completion races. Both paths require regression proof.
New creation runs pin the source checkout branch at enqueue. Historical fork
runs without sufficient branch provenance may be refused conservatively; never
rewrite their immutable inputs or infer authority from the current checkout.

Require structured candidates {name,summary,quotes[]} with count<=20, name<=300,
summary<=2000, 1..3 exact quotes<=1000 each. Validate names and quotations against
final source, then query bounded exact normalized keys/names for duplicates.
No name-based merge or automatic identity link. Empty valid detection is success.

## Frozen schema, HTTP and UI contract

Schema fields: id, workspaceId, novelId, runId(unique), chapterId, sourceBranchId,
sourceRevisionId?, artifactHash, generationId?, status, epoch, candidates JSON,
errorCategory?, createdAt/updatedAt. See root schema/migration for exact names.
Candidates: {id,name,summary,quotes,status:'PENDING'|'APPROVED'|'REJECTED',version,
originalName,originalSummary,characterId?,storyEntityId?,revisionId?,checkpointId?}.
Views may add conflict:'CHARACTER_EXISTS'|'IDENTITY_EXISTS'|null per candidate.

Base /api/workspaces/:workspaceId/novels/:novelId:
- GET /runs/:runId/character-discovery -> DiscoveryView|null.
- POST same path, strict {retry?:boolean}, default false -> DiscoveryView.
  No auto-retry of RUNNING/UNCERTAIN. Manual retry only failed/expired batches;
  no retry after any item decision. Actor uses server session, worker stored actor.
- PATCH /character-discoveries/:batchId/candidates/:candidateId,
  {expectedVersion,name,summary}; retains immutable original/evidence, audits edit.
- POST same candidate path /approve,
  {expectedVersion,expectedHeadRevisionId,expectedChapterVersionId,expectedBranchId}.
- POST same candidate path /reject, {expectedVersion}.

DiscoveryView: {id,runId,status,epoch,chapterId,artifactHash,sourceBranchId,
generationId,errorCategory,candidates,canApprove,blockedReason,
expectedHeadRevisionId,expectedChapterVersionId}. blockedReason is null or
APPLY_DRAFT_FIRST|SOURCE_CHANGED|BRANCH_CHANGED|NO_ACCESS. IDs nullable where no
current source. GET rechecks scope/source and returns current readiness, no LLM.
Mutations return updated DiscoveryView. Match ApiError conventions404/403/409/400;
machine errors never become raw author messages.

Detection can be visible during review. Approval is enabled only after the exact
accepted AI draft is applied as the current ChapterVersion, on the same branch.
This avoids advancing the chapter-creation pinned head before Apply. Resolve
source from server-owned run input/approved artifact and compare normalized saved
prose plus chapter/version identity; creationRunId receipt when available. Do not
relax existing apply/source guards or silently rebase immutable workflow pins.

Approve requires canon:manage, current tenant membership, source/branch/version/
head and pending-item CAS. Lock novel->current branch->batch, recheck all inside
transaction, capture PRE_MUTATION/PREVIOUS checkpoint BEFORE story writes, then
create StoryEntity(kind CHARACTER)+Character(storyEntityId) atomically with both
change-set entries, rebuild intents and audit. Existing names/keys refuse with
409, never overwrite/merge. Replay returns recorded results without reminting.
Reject/edit are operational audited decisions; rejected items cannot approve.
After story rollback, retained operational approval never silently recreates data.

UI panel automatically loads/detects/polls once per run, handles loading/empty/
failure/uncertain/stale/scope change and exposes Approve/Edit/Reject for pending
items, with original quotes and current-source guidance. Edits show explicit
Save/Cancel; approve confirms and refreshes current head/source for next item.
No automatic approval/POST retry, no entire-page lock, no hidden story mutation.

## Allowed paths and verification

Backend writer: new packages/ai-services/src/character-discovery.ts,
apps/api/src/character-discovery-routes.ts, apps/api/src/character-discovery.test.ts
only. UI writer: new components/generation/NewCharactersPanel.vue and .test.ts
only. Root owns all shared schema/migration/exports/app/worker/page/locales/docs.
No overlapping writer, dependency/lock changes or router changes.

Tests: real disposable DB tenant/viewer/stale/duplicate/quote negatives; empty,
single detection/concurrent replay, failure not chapter failure, edit/reject,
checkpoint failure+actual restore, one linked pair/no facts, source changed,
retry epoch fence. UI all3 buttons, edit/save, confirmation, read-only polling,
uncertain retry confirmation, no pre-Apply approval, cross-context late responses,
EN/ID/fallback and automated accessibility. Separate exact review, relevant
types/lint. Use real gateway proof for bounded actual chapter detection after
read-only selection, no main author approvals fabricated. Main schema migration
requires verified pre-change backup/read-back and no stack reset. Rollback keeps
operational history and uses checkpoints for story changes, never destructive SQL.

## Completion evidence — 2026-10-22

Implemented automatic operational detection with explicit localized Approve / Edit /
Reject in the generation review panel. Approval remains disabled before the exact
reviewed draft is applied. Edits retain original quoted evidence; reject adds no
story data. Approval creates a linked Character and CHARACTER StoryEntity with
prechange checkpoint, revision, both change-set entries, rebuild intent and audit.
Replay after a story restore does not recreate previously approved data.

Focused proof: backend12, panel9, shared locale18, restore-scope8, independent
queue2, worker10, recovery5 and starter-studio11 tests PASS. API/worker/workflow
types and targeted ESLint PASS; web vue-tsc exit0 with the existing router plugin
warning. Initial test-only failures (VIEWER read expectation and an unsupported
NovelBranch fixture field) were corrected without changing authorization policy.
The first incorrect root vue-tsc path was replaced by the installed web-local CLI.
Independent review found source-branch/chapter identity, concurrent mutation and
queue lifecycle issues; these were fixed and separately re-reviewed before local
activation. Review manifests and private receipts are referenced in CURRENT.

Encrypted preactivation backup: 4,754,439 raw bytes, SHA256
67199a18b6a5292013259b3624c1139b468cc88d19ccc9d4a40ab2dfaea3f89b;
decrypt read-back and isolated clone restore verified, clone dropped. Additive
migration20261021160000_character_discovery applied/read back; source hashes
unchanged. Runtime API32456 and workflow16532 resumed existing queues; readiness
and Nuxt200, unauthenticated discovery401. Existing Docker/cover runtime retained.

Real gateway proof: run37a6375b-01d6-43fd-a8cd-b448caed2898, batch
97e20231-8d50-407a-a2a1-eef74aa64617, generation
f4c64bdd-895e-4cf9-ab20-8f6d17534e39, STRUCTURED_EXTRACTOR,
requested bansosmontera/deepseek-v4.1-flash / reported deepseek-v4.1-flash,
SUCCEEDED, one PENDING suggestion, canApprove=true. No main approval, linked
profile creation or story hash change. This technical proof is not author sign-off
or human accessibility acceptance. No commit/push.
