# Workspace Authoring A3 — AI Chapter Creation

Status: complete for implementation and technical acceptance; author sign-off remains separate.
Owner: root, sole writer. Independent reviewer: separate read-only actor.

## Goal and scope

Add chapter offers Manual and AI. AI accepts optional author notes, target words,
approved outline and eligible model preference; reserves the next numbered draft
once, starts the existing review workflow once, and displays progress/review.
Validated title1–200 (nonblank) and prose come from the same final artifact.
Author reviews/approves, then applies both atomically to that reserved chapter.
No automatic publication or canon acceptance. Existing text/versions stay intact.

Author addendum: expose Draft beside Save, and keep Draft/Save/Publish visible on
mobile. Author explicitly selected the active chapter only. Save pending text,
then atomically return its status to DRAFT and withdraw/cancel its publication
under the existing chapter lock and version CAS. Retain immutable text, pinned
publication version and history; scheduled jobs observe UNPUBLISHED and no-op.
Do not change any other chapter or the novel status.

## Required reading and dependencies

AGENTS, START-HERE, CURRENT, parent workspace-authoring plan, chapter lifecycle
Task3, routing plan Tasks1–2, manuscript create/save, workflow enqueue/context/
approval, ApplyBar/useChapterGeneration and pending-start journal. Routing/model
dependencies verified through checkpoints486/491; Studio AI-draft CRUD is separate.
Use actual Windows Docker/real gateway and dedicated scratch novel/DB/Redis.

## Frozen implementation contract

- Preserve legacy chapter-generation-review graph/schema and old versions.
  Add chapter-creation-review template identity using existing roles and graph;
  every draft-producing step requires title1–200 nonblank and prose, with prompts
  requesting coherent title/text and preservation of author notes. Review steps
  explicitly assess both. Notes are run input, pinned before first model attempt.
- Explicit AI setup may install this WORKSPACE template if missing, with existing
  definition-manage authorization; refuse customized key collisions. Do not change
  existing Agent/Skill definitions or any prior Workflow versions. Team roles
  without manage capability require an already-installed template, never bypass.
- Approved outline and server-resolved chapter position remain required. Refuse
  missing/stale outline or model mapping before dispatch; no invented outline or
  title substituted as a successful generated result.
- Extend chapter creation with optional creationRequestId UUID, used as the actual
  new Chapter ID for natural idempotency. Under existing novel lock, identical
  actor/novel/title retry returns the same chapter/number without duplicate revision
  or audit. Conflicting/foreign existing identity refuses. Ordinary manual calls
  remain unchanged. A labeled temporary title represents a pending AI draft only.
  Reservation, revision and chapter.created audit commit in the same transaction.
  A renamed/applied reservation conflicts on retry: recover by reading its original
  ID, never by allocating a replacement.
- Persist account/workspace/novel-scoped creation intent before POST; retain exact
  notes/model/outline/request identity after uncertain results. Reuse existing
  workflow pending-start journal/idempotency key for enqueue, no silent replay or
  second reserved chapter. Only explicit author retry may resume uncertain work.
  Reject stale async results after scope changes. Failed generation retains the
  draft and real failure state rather than creating another chapter.
- Add chapter dialog AI fields and wire writer to actual enqueue/progress/review.
  Save current editor before creation, use current eligible-only model picker,
  en/id reference controls, loading/empty/error/blocked/recovery states.
- Extend every chapter-workflow identity consumer to the new key: preview/executor
  attribution, context compilation, approved-outline/source pins, review and Apply.
  The new variant must never take a generic OTHER or context-free execution path.
- Extend guarded manuscript save with optional paired title/expectedTitle, applied
  with prose in one existing version/revision transaction under chapter locks and
  expectedVersion checks. Existing callers without title keep their behavior.
  Strict AI Apply reads title/prose from the same reviewed artifact and includes
  expected current title; invalid/missing title blocks application. Concurrent
  rename/save refuses without partial writes. Existing automated final-text review
  still re-runs/invalidate on saved text as required.

## Allowed paths and exclusions

ChapterCreateDialog/new bounded AI form/composable/journal and tests; writer,
generation panel/review/apply/draft helpers and tests; workflow templates;
definitions service/routes, manuscript service/routes and focused tests; en/id;
workflow enqueue/executor/worker shared chapter identity gates and focused tests;
CURRENT/single issue register/this contract/execution ledger. Shared manifests only
if genuinely required, no new dependency or application schema migration planned.
No publishing/cover/Studio AI definition CRUD, auth weakening, historic schema
rewrite, source deletion, commit/push, main story generation or real novel tests.

## Acceptance and evidence

Focused native API tests: duplicate creation ID, foreign/conflicting retry,
chapter numbering concurrency; title missing/blank/overlong; atomic title+prose
and CAS rename/text conflict; immutable history; strict template collision and
old schemas unchanged; missing/stale outline/model gate, notes pinned; incomplete
generation cannot apply. UI tests cover both modes, form preservation, uncertain
creation/enqueue, save-before-start/scope changes, review/apply pins, en/id.
Run actual real-gateway scratch workflow with selected model/notes, approve its
real parked snapshot and persist/read back coherent title+text; inspect actual
attempt attribution and both locales/screens in browser. Do not invent provider
success or author/human acceptance. Native read-only independent exact-diff review
and types/lint required. Reuse valid retained evidence; record actual commands.

Rollback removes new UI/entry points only; retain generated chapter identities,
immutable workflow/chapter versions, generation attempts, approval/audit records
and story revision recovery. No destructive rollback or acceptance-data reset.

## Verification and handoff

Native focused checks: API40PASS, web39PASS (six files), templates11PASS,
executor22PASS; final API/web types, scoped TS/JS lint and diff check exit0.
Manuscript29PASS final rerun includes audit-trigger rollback for Draft/publication
and paired title/prose, creation receipt/delete recovery and duplicate reservation.
Separate read-only actor review_enqueue_pins APPROVE over the exact29-file
manifest in private ai-chapter-review-files.json; aggregate SHA256
6224561b5e8d2551404ad05c5faf35f744315d47205bfc3fc9fe4deeff8551e2.

Actual native browser: ID390 AI choice/setup/notes/searchable model -> one reserved
chapter and enqueued run; five successful real MiniMax-M3 stages -> parked approval.
EN1440 continuation reviews the retained artifact, programmatically fixture-approves
and applies title/prose together as v1; Draft active chapter confirmed; ID390 three
actions enabled and visible, screenshots inspected, page errors0. Run
18bc4423-8cbf-46aa-ab67-4706dbd28b3a, scratch DB novelforge_test_ai_chapter_creation,
isolated BullMQ prefix. The Blue Lantern: 249 words/1437 characters. No repeated
generation after browser diagnostics. Main novel/chapter hashes unchanged; no main
story generation, author acceptance or human accessibility acceptance inferred.
Private live/activation receipts retained. API10396/worker34804 now match reviewed
source; idle refresh preserves notification wait1, Docker/data/Redis history.
First-use strict workflow activation remains an explicit authorized UI action;
do not silently overwrite existing roles. Existing Publish is preserved per author.
Actual main read-only EN1440/ID390 smoke15:12:36Z passes: three actions enabled/
visible, Manual/AI choices, first-use setup available, Escape/opener focus, no page
errors/mutating requests. Stories/definitions/session count unchanged; strict
template not silently installed. Main smoke receipt is private and retained.

Discovered/fixed: snapshot material priorOutcomes reader mismatch; paired title
immutable provenance/audit; strict target/outline/head gates and worker provenance;
original-ID deletion/rename receipt recovery; asynchronous account/scope/Apply fences.
See the single issue register for fixture corrections and full closure evidence.
