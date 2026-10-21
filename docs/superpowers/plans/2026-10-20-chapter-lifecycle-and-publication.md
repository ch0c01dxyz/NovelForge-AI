# Chapter Lifecycle and Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after the author selects execution. Follow the parent plan constraints.

**Goal:** Deliver manual/AI chapter creation, rename/delete and whole-novel
publication without losing drafts or bypassing review.
**Architecture:** Existing writer and manuscript services; shared model-choice
contract from the routing plan; existing versioned workflow and publication
gates. Batch publication is a server operation, not a client loop.
**Tech Stack:** Existing Nuxt/Vue, Fastify, Prisma, BullMQ and review services.
**Spec:** ../specs/2026-10-20-workspace-chapter-lifecycle-design.md

## Global constraints

Parent program constraints apply. No live manuscript edits or publication for
tests. All source paths below are exact existing paths or explicitly new files.
No commit/push; each completed task ends in review/evidence instead of commit.

## Review focus

Delayed autosave, stale rename, evidence-backed deletion, missing outline and
concurrent publication changes must produce legible failures without data loss.

### Task 1: Manual creation and understandable controls

Files: modify writer `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`,
`apps/web/app/i18n/{en,id}.ts`; create
`apps/web/app/components/workspace/ChapterCreateDialog.vue` and its test.
Use existing shared ActionMenu and design tokens; shared selector styling must
cover the closed control and opened menu while retaining keyboard semantics.

Interface: dialog emits `manual: { title: string }` or
`ai: { instruction: string; targetWordCount?: number; preferredModelRef: string | null }`.
Manual path calls the existing POST chapters route, trimmed title 1–200 chars.
AI action connects only after Task 3; do not ship a successful-looking dead action.

- [ ] Test cancel/no mutation, blank/long title, repeated submit, failed create,
  delayed response after novel switch, and existing unsaved-editor navigation.
- [ ] Replace browser prompt with modal; labeled SVG Add/Import/Export and
  reference-styled order selector preserve sort/scroll/mobile behavior.
- [ ] Run focused dialog and writer tests; use native browser en/id at390/1440
  widths, keyboard/Escape/opener focus and imported-cover workspace.

### Task 2: Rename and existing guarded delete

Files: modify `apps/api/src/manuscript-routes.ts`,
`apps/api/src/services/manuscript.ts`, `apps/api/src/manuscript.test.ts`, writer,
locale files; create `ChapterActions.vue` and test under workspace components.

New interface: `PATCH .../chapters/:chapterId/title`
`{ title: string; expectedTitle: string; expectedChapterVersionId: string | null }`.
Service `renameChapter` accepts actor+workspace+novel+chapter scope and those
fields. Lock the chapter; require update capability, exact current title/version,
publication immutability, audit/revision, and retained recovery semantics.
No-op equal title is safe and does not fabricate a change. If existing recovery
cannot reconstruct title metadata, add its snapshot coverage before enabling.
Delete consumes the existing DELETE endpoint with its retained-evidence guards.

- [ ] Native tests: authorized rename, stale title/version, unauthorized tenant,
  published refusal, audit failure rollback and recoverable rename history.
- [ ] UI tests: cancel/confirm delete; protected409 shown; successful delete
  selects adjacent/empty editor; no nested interactive chapter-row buttons.
- [ ] Implement actions and dialogs; preserve autosave/review invalidation and
  chapter identity/number. Never delete evidence to make DELETE succeed.
- [ ] Run API manuscript and affected writer tests, types and browser proof;
  inspect existing numbering gaps after deletion without renumbering history.

### Task 3: AI creation with coherent title, prose and author notes

Implementation evidence (2026-10-20): see tasks/workspace-ai-chapter-creation.md.
Reviewed implementation adds a new strict template identity rather than changing
the historical graph/schema. Actual gateway and native UI proof are separate from
author acceptance; this completion does not close the whole parent program.

Depends on routing plan tasks1–2. Files: ChapterCreateDialog, writer,
`apps/web/app/components/generation/GenerationPanel.vue`,
`apps/web/app/composables/useChapterGeneration.ts`,
`packages/workflow-templates/chapter-generation-review/{graph.json,schemas/draft-schema.json}`,
`packages/ai-services/src/worker-ai-path.ts`, existing draft selection/tests and
`apps/worker/src/worker-ai-path.test.ts`.

Inputs: Task1 AI payload, server-resolved approved outline and chapter position;
versioned workflow/run pins include author instruction and model preference.
Output: validated `{ title: string; prose: string; sceneBreaks?: number[] }`;
generated mode requires title1–200 and prose. Preserve existing historic schemas
and workflow versions; install an explicit new workspace version for new runs.

- [ ] Regress title missing/blank/too long, notes lost between steps, duplicate
  create retry, failed/incomplete generation and missing/stale approved outline.
- [ ] Wire recoverable numbered draft to idempotent existing workflow; prevent
  cross-chapter application. Review title and final prose under the same pins,
  retain candidate approval and surface hard-canon conflict. No automatic publish.
- [ ] Real gateway scratch run: chosen model and notes, title+prose artifact,
  actual review/author accept path and persisted read-back. Retain exact provider
  attempts and explicit unsupported/missing state rather than substituting mocks.
- [ ] Run affected template/executor/worker/web tests and package types.

### Task 4: Whole-novel publication

Files: `apps/api/src/{publication-routes.ts,services/publication.ts,publication.test.ts}`,
shared review/revision helpers, `apps/worker/src/publication-jobs.ts` and tests,
writer; create `NovelPublicationDialog.vue` and test. Add an additive publication
batch record only after a reviewed ADR/storage contract in this task.

Proposed API: `POST .../novels/:novelId/publication-batches` with idempotency key;
`GET .../publication-batches/:batchId` returns authorized progress and exact
target/version/blocker summary. Explicit `POST .../:batchId/publish` confirms
only that server-owned batch, never arbitrary client-supplied version lists.

Contract: preflight pins target set and exact content/review dependencies;
already published skipped, scheduled/empty/blocked targets refuse the batch.
Save current editor before start. Refresh only stale reviews outside final
transaction. After required impact/checkpoint, final transaction locks/rechecks
novel/targets and all gates, then publishes every eligible target atomically.
Notification/cache intents commit durably with publication and are consumed
idempotently. Cancellation before final commit causes no publication; a client
disconnect cannot turn a committed outcome into a false cancellation.

- [ ] Freeze/review contract, lock ordering, checkpoint boundary, notification
  intent and recovery before code/migration; do not wrap sequential public APIs.
- [ ] Native regression: one invalid target yields zero new publications;
  concurrent save/title/new chapter/schedule/review-state change refuses; missing
  checkpoint, non-main, archived and cross-tenant actors refuse. Duplicate start/
  confirmation and worker restart cannot duplicate publications/notifications.
- [ ] Implement bounded progress/preflight and final commit, current-summary
  confirmation and per-chapter navigation; existing public versions unchanged.
- [ ] Prove valid batch and failure/recovery on disposable data, actual browser
  progress, and server read-back. Run publication/worker and changed web tests.

## Commands and rollback

Use `pnpm --filter @novelforge/api exec vitest run src/manuscript.test.ts src/publication.test.ts`
with dedicated DB configuration, affected worker/web test files and package
`typecheck` scripts. Record actual selections; do not invent writer test names.
Source rollback never deletes historical chapter/publication records. Reviewed
additive migrations require populated scratch restore/recovery proof; leave
new fields/tables intact if removing them would destroy retained history.
