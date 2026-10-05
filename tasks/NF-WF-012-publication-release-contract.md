# Task NF-WF-012: Publication release contract and version-pinned lifecycle

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT
Milestone / capability IDs: M4 (publication half); delivery-plan NF-WF-012
Implementer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review round 1 returned CHANGES_REQUESTED (see §"Review record"); round-2
re-review returned CHANGES_REQUESTED with one new finding (P2-6), everything
else judged sound. This revision resolved P2-6 and recorded the re-reviewer's
P3-1 concession; round-2 re-review returned **APPROVE** (see §"Review
record"). The reviewer's verdict on the Q1–Q6 recommendations is
CONFIRMED and pinned as decided, no longer open (§"Decisions (confirmed by
the contract reviewer)"): Q1 delayed job + startup reconciliation; Q2 replace
the pin (superseded versions not publicly addressable); Q3 unpublish flips
the row to UNPUBLISHED; Q4 automatic DRAFT→ACTIVE on first publish; Q5
archive cancels schedules; Q6 no separate schedule capability. The reviewer
also judged GAP-045 (the 010 gate extension, Invariant 3) LEGITIMATE with the
ISSUES-AND-GAPS.md entry sufficient; the frozen 010 contract is untouched.
Frozen review manifest / exact artifact paths and identity: (filled at review)
Baseline revision / local changes to preserve: repo HEAD at review time
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Normative vs informative

Normative: the publication state machines, capability matrix, review-gate
extension, version-pinning mechanics, scheduling mechanics, error codes,
migration shape, TABLE_SCOPE/COVERED_TABLES registration, and the NF-WF-013
public-API shapes. Informative: rationale paragraphs, examples, and the
§"Decisions" rationales (the decision labels there are normative).

The word "publish" in this contract always means the release-lifecycle
operation defined here (schedule/publish/unpublish), never the AI "publish"
of a workflow definition or the `DEFINITION` `PUBLISHED` status in
`definitions.ts` — those are unrelated vocabularies sharing a word.

## Goal and reason

Give NovelForge a real publication release contract: an author can
review, schedule, publish, unpublish, and archive with capability checks,
and the public (NF-WF-013's reader, next task) sees an immutable
version-pinned snapshot — never the author's live draft state.

This is the publication-lifecycle half of milestone M4 ("an
unauthenticated/non-member reader can read a published version;
draft/future data remain inaccessible through pages, search and AI").
NF-WF-012 owns the release contract and the version-pinned lifecycle;
NF-WF-013 builds the public reader routes/UI on top of the shapes pinned
in §"Contract with NF-WF-013". This task builds NO public reader pages.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2.11 versioning/auditability,
  §2.12 non-destructive rollback, §2.18 server-side authorization, §9
  versioning/recovery, §11 Definition of Done — "Revalidate the final
  edited text; any later edit invalidates approvals/reviews tied to the
  previous version").
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-012
  row; M4 minimum proof).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md) — the
  `setStatus` out-of-DRAFT review gate (Invariant 4) and its explicit
  carve-out ("IN_REVIEW→PUBLISHED … keep their pre-010 behavior"), which
  this contract deliberately supersedes for the PUBLISHED target
  (Invariant 3; explicit behavior change owned by NF-WF-012).
- [NF-WF-011 contract](NF-WF-011-author-preview-e2e.md) — the author-preview
  loop whose step 6 (PATCH status → PUBLISHED) must keep passing (the
  no-regression acceptance below).
- `docs/03-domain/STORY-VERSIONING.md` (C3 mutation classes, C7 restore
  semantics, C12.1 head expectations).
- Existing implementation: `apps/api/src/services/manuscript.ts`
  (`setStatus`, `saveChapter` immutability guard), `apps/api/src/services/
  policy-errors.ts` (typed 409 errors), `apps/api/src/manuscript-routes.ts`
  (route conventions), `packages/auth/authorization.ts` (capability
  vocabulary), `packages/story-versioning/snapshot.ts`
  (COVERED_TABLES/restoreTarget), `apps/api/src/services/revisions.ts`
  (TABLE_SCOPE), `packages/workflow-executor/ports.ts` (queue patterns),
  `apps/api/src/services/workflow-queue.ts` (queue factory pattern).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
BullMQ is already a dependency (workflow + memory-rebuild queues); no new
infrastructure is introduced beyond one more queue on the same Redis.

## Dependencies

- NF-WF-010 (IMPLEMENTED): `FinalTextReview` receipts keyed by
  `chapterVersionId`, the `setStatus` gate, typed `PolicyError`.
- NF-WF-011 (IMPLEMENTED): the `pnpm e2e` author-preview loop — the
  no-regression acceptance re-runs it.
- NF-WF-002 (IMPLEMENTED): revision/checkpoint/restore mechanics,
  TABLE_SCOPE, COVERED_TABLES.
- NF-WF-004 (IMPLEMENTED): BullMQ queue/worker/sweeper patterns.
- NF-WF-005 (IMPLEMENTED): approval flow — NOT used here (publication is
  an author decision, not a workflow approval; no new approval surface).
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-028 (production worker AI wiring — publication jobs are
  deterministic and need no AI, so 028 does not block this task),
  GAP-040 (cross-branch as-of — publication pins the head revision, not a
  branch revision; 040 stays open and orthogonal).

## Scope

### Allowed

- `apps/api/src/services/publication.ts` (new): the publication lifecycle
  service — schedule, publish, unpublish, cancel/reschedule, archive/
  unarchive novel, the public-visibility predicate.
- `apps/api/src/services/publication-queue.ts` (new): BullMQ queue factory
  mirroring `workflow-queue.ts`; `PUBLICATION_QUEUE_NAME`.
- `apps/api/src/publication-routes.ts` (new): member-facing publication
  routes under `/api/workspaces/:workspaceId/novels/:novelId/…`.
- `apps/api/src/services/policy-errors.ts`: extend with a typed
  `PublicationError` (new 409 codes) following the `PolicyError` precedent.
- `apps/api/src/services/manuscript.ts`: extend the 010 review gate to the
  IN_REVIEW→PUBLISHED transition (Invariant 3 — the single 010-owned
  behavior change this task supersedes).
- `packages/database/prisma/schema.prisma`: new `Publication` model +
  `PublicationStatus` enum (additive migration, GAP-030 convention).
- `packages/story-versioning/snapshot.ts`: register `publications` in
  COVERED_TABLES.
- `apps/api/src/services/revisions.ts`: register `publications` in
  TABLE_SCOPE.
- `apps/worker`: handle the `publication` queue (deterministic job; no AI).
- Tests for the above; docs updates (progress.md, CURRENT.md,
  test-matrix.md, STORY-VERSIONING.md §C-register if it lists covered
  tables, ISSUES-AND-GAPS.md for deviations BEFORE workarounds).

### Forbidden

- Public reader routes/UI — owned by NF-WF-013. This task pins their
  shapes (§"Contract with NF-WF-013") but implements nothing under
  `/api/public/`.
- Changes to the workflow engine, approval flow, compiler, memory
  rebuild, canon, or narrative policy semantics.
- New capabilities in `packages/auth/authorization.ts` — the existing
  vocabulary is sufficient (Invariant 6); adding one would need its own
  justification and is out of scope.
- Search indexing of public content; notifications; analytics; i18n
  beyond the existing en/id error-code/message pattern.

### Inputs

- Chapter (with `status`, `currentVersionId`), `ChapterVersion` (immutable,
  append-only), `FinalTextReview` receipt (PASS/FAIL keyed by
  `chapterVersionId`), `Novel` (with `status`), workspace membership +
  role → capability mapping, head revision (provenance pin).
- Schedule input: ISO-8601 timestamp with offset; stored as UTC.

### Outputs

- `Publication` rows (the version-pinned release record); chapter/novel
  status transitions; BullMQ delayed jobs; the 013-consumable public API
  shapes (pinned, not implemented); the visibility predicate
  `isPubliclyVisible`.

### Out of scope (with follow-up owner)

- Public reader routes/UI → NF-WF-013 (shapes pinned here).
- Search/AI surfacing of public content → future task; the exclusion rule
  is pinned in Invariant 9.
- Superseded-public-version addressability → Q2 → NF-WF-013 or follow-up.
- Push notifications / subscriber feeds on publish → future task.
- Per-chapter "launch" ceremonies or marketing pages → future task.

## Behavior and invariants

### Invariant 1 — The unit of publication is the chapter; the unit of archive is the novel

Chapters are published (they already carry `ChapterStatus`
DRAFT/IN_REVIEW/PUBLISHED, `schema.prisma:249-253`, and the
`chapter:publish` capability). Novels
are archived, not "published": `NovelStatus` DRAFT/ACTIVE/ARCHIVED exists
in the schema (`schema.prisma:24-28`) but nothing transitions it today —
this contract gives it meaning:

- A novel becomes ACTIVE when its first chapter is published (automatic,
  idempotent, inside the publish transaction).
- A novel becomes ARCHIVED via `archiveNovel` (`novel:archive` capability).
- A novel returns ACTIVE via `unarchiveNovel` (`novel:archive`).
- Only ACTIVE novels expose anything publicly (Invariant 9). DRAFT novels
  expose nothing; ARCHIVED novels expose nothing.

Rationale: the existing vocabulary already separates the two levels
(`chapter:publish` vs `novel:archive`, `authorization.ts:17-64`); the
contract wires the novel level to its capability for the first time. The
`novel:archive` capability is currently consumed by no route or service
(verified) — this task is its first consumer, which is legitimate
vocabulary use, not invention.

### Invariant 2 — The chapter publication state machine

`Publication.status` (`SCHEDULED | PUBLISHED | UNPUBLISHED`) mirrors the
release lifecycle; `chapters.status` remains the author-facing workflow
state. Allowed transitions (anything else is a 409):

| From | To | Operation | Capability | Effect |
|---|---|---|---|---|
| UNPUBLISHED | SCHEDULED | `schedulePublication` | `chapter:publish` | row created/updated, `scheduledFor` set (future UTC), delayed job enqueued (jobId = publication id); no review receipt required at schedule time — the receipt is checked at fire time (Invariant 5) |
| SCHEDULED | SCHEDULED | `schedulePublication` (reschedule) | `chapter:publish` | `scheduledFor` replaced, old job removed, new delayed job enqueued |
| SCHEDULED | UNPUBLISHED | `cancelScheduledPublication` | `chapter:publish` | job removed, row → UNPUBLISHED, `scheduledFor` cleared |
| UNPUBLISHED | PUBLISHED | `publishChapter` (immediate) | `chapter:publish` | Invariant 3 review check; `chapters.status` → PUBLISHED; pin `chapterVersionId` = current version; `publishedAt` = now; first publish flips novel DRAFT → ACTIVE |
| SCHEDULED | PUBLISHED | (job fires) | — (intent authorized at schedule time) | same as immediate publish, review re-checked at fire time (Invariant 5); idempotent no-op if the row is no longer SCHEDULED; deterministic fire-time refusal → UNPUBLISHED (audit-logged, author reschedules) |
| PUBLISHED | UNPUBLISHED | `unpublishChapter` | `chapter:update` | `chapters.status` → PUBLISHED→IN_REVIEW via the existing `setStatus` path (which is ungated and stays ungated); row → UNPUBLISHED; the pinned version id is retained on the row for history |

Refusals (typed `PublicationError`, 409, `{error: CODE}` — the 008/009/010
precedent):

- `schedulePublication` on a PUBLISHED chapter → `ALREADY_PUBLISHED`.
- `schedulePublication` with `scheduledFor` in the past or unparseable →
  400 `{error: "INVALID_INPUT"}` (route-level Zod, existing convention).
- `cancelScheduledPublication` on a non-SCHEDULED chapter →
  `NOT_SCHEDULED`.
- `schedulePublication`/`publishChapter` on an ARCHIVED novel →
  `NOVEL_ARCHIVED`.
- Re-publish without unpublish: there is deliberately NO
  PUBLISHED→PUBLISHED transition. The existing manuscript guard refuses
  saves on PUBLISHED chapters ("published chapters are immutable;
  unpublish first", `manuscript.ts:267,284,344,671`), so a new public
  version requires unpublish → edit (new version) → review → publish.
  This keeps one honest rule for "the public version never changes
  under readers".

Concurrency: the publish/unpublish/schedule operations take the chapter
row lock (`SELECT … FOR UPDATE`, the `saveChapter` precedent at
`manuscript.ts:274`) and run the status flip + publication-row write +
`advanceForMutation` (C3 LOW — publication is a release record, not story
mutation; it records the change without snapshotting story tables) in one
transaction.

### Invariant 3 — Publish requires a PASS final-text-review receipt for the exact pinned version (behavior change owned by NF-WF-012)

NF-WF-010's `setStatus` gate fires only on transitions OUT of DRAFT, with
an explicit carve-out: "IN_REVIEW→PUBLISHED and the PUBLISHED→IN_REVIEW
'unpublish' path keep their pre-010 behavior"
(`manuscript.ts:399-408`). That carve-out leaves a hole this task must
close: an author can save a NEW (unreviewed) version while IN_REVIEW and
publish it via the ungated IN_REVIEW→PUBLISHED path — the public would
see text no review ever approved, violating "immutable public version"
and constitution §11 ("Revalidate the final edited text; any later edit
invalidates approvals/reviews tied to the previous version").

This contract therefore extends the gate: **any transition whose target
is PUBLISHED requires a PASS `FinalTextReview` receipt keyed to the
chapter's `currentVersionId`** — whether the source is DRAFT or
IN_REVIEW. The PUBLISHED→IN_REVIEW unpublish path stays ungated. The
receipt's verdict is the whole contract (the 010 precedent,
`manuscript.ts:409-417`); refusals reuse the typed `PolicyError` codes:

- no receipt for the current version → 409 `{error: "REVIEW_STALE"}`;
- receipt verdict FAIL → 409 `{error: "HARD_POLICY_VIOLATION"}`.

This is an explicit, owned product behavior change by NF-WF-012 that
supersedes 010's carve-out for the PUBLISHED target only. The reviewer
must scrutinize it; it is recorded here (not silently), and the
no-regression acceptance re-runs the 011 loop (whose step 6 publishes
DRAFT→PUBLISHED with a PASS receipt and must stay green).

Impact on the NF-WF-007 novel page: the page's publish action calls the
IN_REVIEW→PUBLISHED path this invariant now gates, so an author
publishing an unreviewed or FAIL-reviewed IN_REVIEW chapter may newly
receive 409 `REVIEW_STALE` / `HARD_POLICY_VIOLATION`. The implementer
MUST verify the novel page's existing 409 handling (the NF-WF-007/010
handling — it already surfaces those two codes for DRAFT-source
refusals) covers IN_REVIEW-source refusals and shows the author an
actionable message ("revalidate the final text" per constitution §11),
or record a follow-up GAP in ISSUES-AND-GAPS.md before any workaround.

### Invariant 4 — Version pinning: the public resolves the pin, never the live pointer

The `Publication` row pins:

- `chapterVersionId` — the immutable `ChapterVersion` the public sees;
- `revisionId` — the head revision the publish mutation created
  (provenance; the 009/010 pattern of pinning the source revision).

Public resolution (013's implementation, rule pinned here): given
`(novelSlug, chapterNumber)`, resolve the chapter, read its `Publication`
row, and serve `chapter_versions.content` for
`publication.chapterVersionId`. **Never** `chapters.currentVersionId.

The pin is genuinely immutable because:

1. `ChapterVersion` rows are append-only — there is no update or delete
   path for them in the services (verified: `manuscript.ts` only creates;
   the schema enforces monotonic `(chapterId, number)` uniqueness,
   `schema.prisma:308`).
2. The `Publication.chapterVersion` relation is `onDelete: Restrict` —
   the pinned row cannot be deleted while referenced.
3. PUBLISHED chapters refuse saves (Invariant 2), so `currentVersionId`
   cannot move under a live publication.

On re-publish (after unpublish → edit → review), the row's
`chapterVersionId` is replaced by the new pin. The superseded version row
still exists (immutable history, author-visible); whether it stays
publicly addressable is Q2.

### Invariant 5 — Scheduling mechanics: durable delayed job + startup reconciliation

- `schedulePublication` writes the `Publication` row (status SCHEDULED)
  and enqueues a BullMQ delayed job on a new `publication` queue
  (`PUBLICATION_QUEUE_NAME = "publication"`, defined alongside
  `WORKFLOW_QUEUE_NAME = "workflow-runs"`, `ports.ts:157`, and
  `MEMORY_REBUILD_QUEUE_NAME = "memory-rebuild"`,
  `packages/memory/src/constants.ts:10`). Job data:
  `{ publicationId, novelId, chapterId, scheduledFor }`; `jobId` =
  publication id (dedupe + cancellable); `delay = scheduledFor - now`.
  The queue factory mirrors `createWorkflowQueue`
  (`apps/api/src/services/workflow-queue.ts:33-50`); the wrapper's `add`
  passes options through (`:44`), so `delay` needs no wrapper change
  (verified), and its `getJob(jobId)` passthrough (`:45`) needs no new
  facade method for job lookup/removal.
- `cancelScheduledPublication` and reschedule MUST remove the old
  delayed job: `queue.getJob(jobId).remove()`. A removed or already-fired
  job is simply absent at lookup — no error path.
- The worker (`apps/worker`) handles the queue. Execution is
  deterministic — status flip + pin, no AI — so GAP-028 (production
  worker AI wiring) does not block it. The job handler loads the row and:
  if status is still SCHEDULED and `scheduledFor <= now`, run the
  Invariant 2 SCHEDULED→PUBLISHED transition as the scheduling actor
  (`publishedById` stored on the row; authorization was checked at
  schedule time — the job executes a stored intent, it does not
  re-authorize). Otherwise the job succeeds as a no-op (cancelled or
  rescheduled after enqueue — exactly-once is not required, idempotence
  is).
- Review is checked at fire time, not at schedule time: scheduling does
  NOT require a PASS receipt for the current version (an author may
  "schedule now, review before it fires" — the receipt can be earned
  any time before the job fires). Firing requires the Invariant 3
  receipt check against the version current at fire time.
- Durability: BullMQ persists delayed jobs in Redis, so they survive API
  restarts. The crash window (row written, enqueue failed) and Redis
  loss are covered by **startup reconciliation**: on worker/API startup,
  scan **all** `publications` rows with `status = SCHEDULED` (not only
  those already due); for each row, look up `queue.getJob(jobId)`:
  - if the job is **missing** — or exists in the **failed** state (a
    retained failure from a transient crash, kept per the
    `removeOnFail: 5000` precedent, `ports.ts:165-168`) — the schedule
    needs a live job: remove the failed record first
    (`getJob(jobId).remove()`, which frees the `jobId` for reuse —
    re-enqueueing via `add` without removing first is a silent no-op
    against the retained record), then enqueue immediately if
    `scheduledFor <= now`, or with `delay = scheduledFor - now` if
    still in the future;
  - if the job exists in any other state (delayed, waiting, active,
    completed), leave it (do not double-enqueue).
  Scanning only due rows would miss future-scheduled rows whose jobs
  were lost (row written, enqueue failed / Redis loss) — that is the
  real crash window. Reconciliation runs as a single startup pass (no
  concurrent reconciler), so remove-then-enqueue is race-free here. No
  periodic poller (Q1 decided).
- Timezone: the API accepts ISO-8601 with offset, converts to UTC for
  storage and for `delay` computation. A `scheduledFor` in the past is
  400 INVALID_INPUT (route-level), not a silent immediate publish.
- Job failure handling distinguishes two kinds of failure:
  - **Transient failure** (exception, lock lost, worker crash): the job
    fails (BullMQ `attempts: 1`, the workflow-queue precedent,
    `ports.ts:165-168`). The failed record is **retained** per the same
    precedent (`removeOnFail: 5000`) — the failure trail
    (`failedReason`, stacktrace) stays inspectable until reconciliation;
    the alternative (overriding `removeOnFail: 0` on this queue) was
    considered and rejected because it erases the only durable record
    of why a schedule missed. The row stays SCHEDULED; the next startup
    reconciliation finds the failed job, removes the record
    (`getJob(jobId).remove()`), and re-enqueues it. Failures are logged
    with `publicationId`; there is no retry storm.
  - **Deterministic refusal** (fire-time review check fails):
    `REVIEW_STALE` (no PASS receipt for the current version — e.g. the
    author saved a new version after scheduling but before firing) or
    `HARD_POLICY_VIOLATION` (receipt verdict FAIL). The job moves the
    row to **UNPUBLISHED** (audit-logged, like an unpublish —
    `publication.unpublished`), clears `scheduledFor`, and succeeds.
    The author sees the lapsed schedule and reschedules explicitly.
    There is deliberately no "refuse with 409 and leave the row
    SCHEDULED" path: with `attempts: 1` and BullMQ dedupe on `jobId`
    (plus `removeOnFail: 5000` keeping recent failures), a
    re-enqueue would either be a no-op or an infinite refusal loop with
    no author signal — a zombie schedule.
  The job handler MUST branch on the refusal type; the old wording
  "attempts: 1 … next startup reconciliation re-enqueues it" applies
  only to transient failures.

### Invariant 6 — Capability checks: exact matrix, no invented capabilities

All capabilities below exist in `packages/auth/authorization.ts:17-64`.
Enforcement is server-side in the publication service via the existing
membership gate (`manuscript.ts:136-151`: no membership →
`NotFoundError("novel")` → 404, so non-members learn nothing).

| Operation | Capability | Unauthenticated | Non-member | Member w/o capability |
|---|---|---|---|---|
| `schedulePublication` / reschedule | `chapter:publish` | 401 `{error:"UNAUTHENTICATED"}` | 404 | 403 `{error:"FORBIDDEN"}` |
| `cancelScheduledPublication` | `chapter:publish` | 401 | 404 | 403 |
| `publishChapter` (immediate) | `chapter:publish` | 401 | 404 | 403 |
| `unpublishChapter` | `chapter:update` | 401 | 404 | 403 |
| `archiveNovel` / `unarchiveNovel` | `novel:archive` | 401 | 404 | 403 |
| read publication status (member) | `chapter:read` | 401 | 404 | 403 |

Notes:

- `unpublishChapter` reuses the existing `setStatus` PUBLISHED→IN_REVIEW
  path, whose capability is already `chapter:update`
  (`manuscript.ts:392`); the publication service calls it rather than
  re-implementing the flip.
- `novel:archive` is in the vocabulary but currently consumed by nothing
  (verified) — this task is its first legitimate consumer.
- No new capability is introduced. Scheduling does not get its own
  capability (Q6): `chapter:publish` covers the release decision.
- The scheduled job's execution does not re-check capabilities (stored
  intent, Invariant 5); the actor recorded is the scheduler.

### Invariant 7 — Unpublish and archive are soft, reversible, and total

- Unpublish (PUBLISHED→UNPUBLISHED): the chapter leaves the public
  surface immediately (Invariant 9: the visibility predicate fails), the
  author can edit again (the manuscript immutability guard lifts once
  status is IN_REVIEW), and the pinned `chapterVersionId` stays on the
  row as history. Re-publish pins the new version.
- Archive (ACTIVE→ARCHIVED): every public read for the novel 404s
  (Invariant 9); member routes are unchanged (authors keep working);
  all SCHEDULED publications for the novel are cancelled (rows →
  UNPUBLISHED, jobs removed — Q5 records the alternative); new
  schedule/publish attempts fail 409 `{error: "NOVEL_ARCHIVED"}`.
- Unarchive (ARCHIVED→ACTIVE) restores public visibility of whatever is
  currently PUBLISHED. Cancelled schedules are NOT resurrected (the
  author reschedules explicitly).

### Invariant 8 — Restore never rewinds publication

Publication state is a release record, not story state. Following the
existing precedent — `chapters` is registered
`{ key: "chapters", restoreTarget: false, excludeColumns: ["status"] }`
(`packages/story-versioning/snapshot.ts:73`) with the comment "restore
never rewinds publication" (`manuscript.ts:448`) — the new table is
registered:

- `TABLE_SCOPE` (`apps/api/src/services/revisions.ts:183`):
  `"publications": "\"novel_id\" = $1"`;
- `COVERED_TABLES` (`packages/story-versioning/snapshot.ts:59`):
  `{ key: "publications", restoreTarget: false }`.

With `restoreTarget: false`, restores never delete or re-insert
publication rows (the same treatment as `chapters`/`chapter_versions`,
`snapshot.ts:72-74`): restoring a pre-publish checkpoint does not
unpublish, and restoring a post-publish checkpoint does not resurrect a
publication the author later cancelled. The pinned `chapterVersionId`
always resolves because versions are never deleted (Invariant 4).
Publication transitions still call `advanceForMutation` (C3 LOW) so the
release history is in the revision log, like `chapter.setStatus`
(`manuscript.ts:451-460`).

### Invariant 9 — Draft/future data exclusion: the visibility rule (013 enforces, 012 defines)

The M4 minimum proof requires that "draft/future data remain
inaccessible through pages, search and AI". The rule, pinned here for
013 (and any future search/AI surface) to enforce:

```
isPubliclyVisible(novelId, chapterId) :=
  novel.status = ACTIVE
  AND EXISTS Publication(chapterId, status = PUBLISHED)
```

Everything else — DRAFT/IN_REVIEW chapters, SCHEDULED (not yet due)
chapters, UNPUBLISHED chapters, chapters of DRAFT or ARCHIVED novels —
resolves as 404 `{error: "NOT_FOUND"}` with no distinction between
"does not exist" and "not visible" (the no-existence-oracle rule, the
same principle as canon's READER mode: `canon.ts:2399-2412`,
`readerVisible` at `packages/story-intelligence/events.ts:236`).

Corollaries pinned for 013:

- Public content is served from the PINNED `chapterVersionId` only.
- No canon facts, memory projections, outline nodes, workflow runs,
  review receipts, or future chapter metadata cross the boundary. The
  spoiler-boundary primitive for any future canon/thread surface is
  `readerVisible(introducedAtChapter, readerAtChapter)`.
- Member (author) routes are unchanged and keep serving live state behind
  auth.

### Invariant 10 — No scope creep at the publication gate

The publication service owns release lifecycle only. It does not
re-implement review (010), versioning (002), scheduling beyond Invariant
5, or reader rendering (013). A finding that the lifecycle needs a new
capability, a new error code beyond the three pinned here, or a schema
change beyond the `Publication` model stops the task for a contract
amendment (new GAP number first, per the standing rule).

## Outputs

### Service API (primary)

```ts
// apps/api/src/services/publication.ts
schedulePublication({ actorUserId, workspaceId, novelId, chapterId, scheduledFor /* ISO-8601 */ })
  : Promise<{ publicationId: string; scheduledFor: string /* UTC ISO */ }>
publishChapter({ actorUserId, workspaceId, novelId, chapterId })
  : Promise<{ publicationId: string; pinnedVersionId: string; publishedAt: string }>
unpublishChapter({ actorUserId, workspaceId, novelId, chapterId })
  : Promise<{ publicationId: string }>
cancelScheduledPublication({ actorUserId, workspaceId, novelId, chapterId })
  : Promise<{ publicationId: string }>
archiveNovel({ actorUserId, workspaceId, novelId })
  : Promise<{ novelId: string }>
unarchiveNovel({ actorUserId, workspaceId, novelId })
  : Promise<{ novelId: string }>
getPublicationStatus({ actorUserId, workspaceId, novelId, chapterId })
  : Promise<{ status: "SCHEDULED"|"PUBLISHED"|"UNPUBLISHED"; scheduledFor: string|null;
              publishedAt: string|null; pinnedVersionNumber: number|null }>
isPubliclyVisible({ novelId, chapterId })
  : Promise<boolean>   // the Invariant 9 predicate; 013's gate
resolvePublicChapter({ novelSlug, chapterNumber })
  : Promise<{ novelId, chapterId, pinnedVersionId } | null>  // 013's resolver; null → 404
```

All mutating operations take the chapter row lock, run in one transaction
with `advanceForMutation` (C3 LOW, `tables: ["publications"]`, plus
`["chapters"]`/`["novels"]` where those rows change), and write audit rows
(`publication.scheduled`, `publication.published`,
`publication.unpublished`, `publication.schedule_cancelled`,
`novel.archived`, `novel.unarchived` — following the `chapter.published`
/ `chapter.unpublished` precedent at `manuscript.ts:467`).

### HTTP routes

Member routes (this task implements), same conventions as
`manuscript-routes.ts:1-13` (session auth → 401 UNAUTHENTICATED;
membership tenant gate → 404; Zod validation → 400 INVALID_INPUT; uuid
params; single app-wide error handler):

- `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/schedule`
  body `{ scheduledFor: string (ISO-8601) }` → 201
  `{ publicationId, scheduledFor }`
- `DELETE /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/schedule`
  → 200 `{ publicationId }`
- `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/publish`
  → 200 `{ publicationId, pinnedVersionId, publishedAt }`
- `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/unpublish`
  → 200 `{ publicationId }`
- `GET /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication`
  → 200 `{ status, scheduledFor, publishedAt, pinnedVersionNumber }`
- `POST /api/workspaces/:workspaceId/novels/:novelId/archive`
  → 200 `{ novelId }`
- `POST /api/workspaces/:workspaceId/novels/:novelId/unarchive`
  → 200 `{ novelId }`

### Contract with NF-WF-013 (shapes pinned here; 013 implements)

Public routes are anonymous (no session required). 013 must implement
exactly these shapes; any deviation is a contract violation:

- `GET /api/public/novels/:slug` → 200
  ```json
  { "novel": { "id": "uuid", "title": "string", "slug": "string" },
    "chapters": [ { "number": 1, "title": "string", "publishedAt": "ISO-8601" } ] }
  ```
  Chapters: only chapters with a PUBLISHED publication, ordered by
  number ascending. 404 `{error: "NOT_FOUND"}` when the novel is unknown,
  DRAFT, or ARCHIVED (no distinction).
- `GET /api/public/novels/:slug/chapters/:number` → 200
  ```json
  { "chapter": { "number": 1, "title": "string", "content": "string",
                 "wordCount": 1234, "publishedVersionNumber": 3,
                 "publishedAt": "ISO-8601" } }
  ```
  `content` comes from the PINNED `chapterVersionId` (Invariant 4).
  404 `{error: "NOT_FOUND"}` when the chapter is not publicly visible
  (Invariant 9) — including "chapter exists but is a draft" and "novel
  archived".
- Visibility rule: `isPubliclyVisible` (Invariant 9). 013 must not invent
  a second rule.
- 013 owns: route implementation, HTML/UI rendering, navigation between
  chapters, spoiler boundaries on any canon/thread surfaces (using
  `readerVisible`), and tests proving draft/future data inaccessibility.

### Error envelope pinning

Following the 008/009/010 precedent (typed error → mapped in the
platform error handler BEFORE the generic `ConflictError` branch):

```ts
// apps/api/src/services/policy-errors.ts (extended)
export type PublicationErrorCode =
  | "ALREADY_PUBLISHED"   // schedule/publish a PUBLISHED chapter
  | "NOT_SCHEDULED"       // cancel a non-SCHEDULED chapter
  | "NOVEL_ARCHIVED";     // schedule/publish on an ARCHIVED novel
export class PublicationError extends Error {
  readonly code: PublicationErrorCode;
  readonly statusCode = 409 as const;
}
```

Mapped to `409 {error: CODE}`. Review-gate refusals reuse `PolicyError`
(`REVIEW_STALE`, `HARD_POLICY_VIOLATION`, 409). Auth: 401
`{error:"UNAUTHENTICATED"}`, 403 `{error:"FORBIDDEN"}`, 404
`{error:"NOT_FOUND"}` (non-members AND public invisibility — the
membership-gate precedent at `manuscript.ts:146`).

### Data model (new Prisma model; migration is a reviewed artifact)

```prisma
enum PublicationStatus {
  SCHEDULED
  PUBLISHED
  UNPUBLISHED
}

model Publication {
  id               String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  novelId          String            @map("novel_id") @db.Uuid
  novel            Novel             @relation(fields: [novelId], references: [id], onDelete: Cascade)
  chapterId        String            @map("chapter_id") @db.Uuid
  chapter          Chapter           @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  chapterVersionId String            @map("chapter_version_id") @db.Uuid
  chapterVersion   ChapterVersion    @relation(fields: [chapterVersionId], references: [id], onDelete: Restrict)
  revisionId       String            @map("revision_id") @db.Uuid
  revision         Revision          @relation(fields: [revisionId], references: [id], onDelete: Restrict)
  status           PublicationStatus @default(UNPUBLISHED)
  scheduledFor     DateTime?         @map("scheduled_for")
  publishedAt      DateTime?         @map("published_at")
  publishedById    String            @map("published_by_id") @db.Uuid
  publishedBy      User              @relation(fields: [publishedById], references: [id], onDelete: Restrict)
  createdAt        DateTime          @default(now()) @map("created_at")
  updatedAt        DateTime          @updatedAt @map("updated_at")

  @@unique([chapterId])
  @@index([novelId, status])
  @@map("publications")
}
```

Notes:

- One row per chapter (`@@unique([chapterId])`); at most one active
  (SCHEDULED or PUBLISHED) publication per chapter is enforced by the
  single row plus the state machine — no partial unique index needed.
- `chapterVersionId`/`revisionId` use `onDelete: Restrict` so the pin can
  never dangle (Invariant 4). `chapterId`/`novelId` cascade: deleting the
  chapter/novel removes its release record (deletion is already a
  destructive, audited author action).
- Backfill (in the migration, idempotent): for every chapter with
  `status = 'PUBLISHED'` and no publication row, insert a PUBLISHED row
  pinning its `current_version_id`, `published_at = chapters.updated_at`,
  `published_by_id = novels.created_by_id`, `revision_id` = the novel's
  current head revision. Without this, chapters published before this
  task would vanish from the public surface 013 builds.
- GAP-030 convention: `CREATE TYPE` has no `IF NOT EXISTS` — the
  migration creates the enum in an idempotent `DO` block.

## Acceptance and verification

- [ ] Publish chapter: `chapter:publish` holder publishes a reviewed
      chapter → 200, `Publication` row PUBLISHED pinning the exact
      `currentVersionId`, `chapters.status` = PUBLISHED, novel flips
      DRAFT → ACTIVE on first publish. Unauthenticated → 401;
      non-member → 404; member without `chapter:publish` → 403.
- [ ] Review gate (Invariant 3): publishing with no PASS receipt for the
      current version → 409 `REVIEW_STALE`; FAIL receipt → 409
      `HARD_POLICY_VIOLATION` — via BOTH the DRAFT→PUBLISHED and the
      IN_REVIEW→PUBLISHED paths (the 012 behavior change; the 011 loop's
      step 6 must stay green).
- [ ] Unpublish: PUBLISHED → IN_REVIEW via `chapter:update`; public
      visibility predicate fails afterward; author can save a new version
      again.
- [ ] Re-publish: new version pinned after unpublish → edit → review →
      publish; direct PUBLISHED→PUBLISHED refused; the old pin is
      replaced (Q2 records the addressability question).
- [ ] Schedule: future UTC time → 201, SCHEDULED row + delayed job;
      job fires at `scheduledFor` → PUBLISHED with the version pinned at
      fire time (review re-checked at fire time; a version saved after
      scheduling but before firing must be reviewed, or the job moves
      the row to UNPUBLISHED — audit-logged, author reschedules — with
      the typed refusal; a transient job failure leaves the row
      SCHEDULED for reconciliation retry); cancel → UNPUBLISHED + job
      removed; reschedule replaces time + old job removed; past
      time → 400; schedule on PUBLISHED → 409 `ALREADY_PUBLISHED`;
      cancel on non-SCHEDULED → 409 `NOT_SCHEDULED`; schedule requires
      no receipt at schedule time.
- [ ] Startup reconciliation: every SCHEDULED row is scanned; a missing
      job — or a retained failed job (the failed record removed first
      via `getJob(jobId).remove()`, freeing the `jobId`) — is
      re-enqueued (immediate if due, with the remaining delay if still
      future); an existing non-failed job is left alone
      (no double-enqueue). Covered: row written + enqueue failed
      (crash window), Redis job loss, and transient failure (retained
      failed record), for both due and future `scheduledFor`.
- [ ] 007 novel page: the publish action's 409 handling verified to
      cover IN_REVIEW-source `REVIEW_STALE` / `HARD_POLICY_VIOLATION`
      refusals with an actionable author message (or a follow-up GAP
      recorded in ISSUES-AND-GAPS.md).
- [ ] Archive novel: `novel:archive` → ACTIVE → ARCHIVED; public reads
      404; member routes unchanged; schedules cancelled (Q5);
      schedule/publish on archived novel → 409 `NOVEL_ARCHIVED`;
      unarchive → ACTIVE restores visibility of PUBLISHED chapters.
- [ ] Version pinning: after publish, the public resolution returns the
      pinned version's content even if the author later unpublishes,
      edits, and re-publishes (the new pin serves the new content; the
      old pin is never served again); pinned rows are undeletable while
      referenced (`onDelete: Restrict`).
- [ ] Restore: restoring a pre-publish checkpoint does not unpublish;
      restoring a post-publish checkpoint does not resurrect a cancelled
      publication (`restoreTarget: false`, Invariant 8).
- [ ] Migration: fresh `migrate deploy` clean; backfill creates
      publication rows for pre-existing PUBLISHED chapters; GAP-030
      DO-block for the enum.
- [ ] No-regression: `pnpm e2e` (011) green — the author-preview loop
      publishes through the extended gate; full API suite green; lint +
      typechecks clean.
- [ ] 013 handoff: the public API shapes above are pinned and the
      visibility predicate exists as a service function; 013 has no open
      contract question from 012 — Q1–Q6 are decided (§"Decisions
      (confirmed by the contract reviewer)").

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

- Additive migration only: new enum (idempotent DO-block per GAP-030),
  new `publications` table + indexes, backfill `INSERT … SELECT … WHERE
  NOT EXISTS` for pre-existing PUBLISHED chapters. No column changes to
  existing tables; no data rewrite.
- Rollback: drop the table/enum (down migration); chapters keep their
  `status` values, so author-side state is unaffected. Publications made
  while the migration was live are release records only — dropping them
  hides public content until re-published (013 does not exist yet, so no
  public reader is affected).
- Concurrent writers: the chapter row lock serializes
  publish/unpublish/schedule against `saveChapter` and `setStatus`.
- Deployment compatibility: the worker must handle the `publication`
  queue only after the migration is deployed; jobs are enqueued by the
  API, so a worker started before the deploy sees no jobs.

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; register the new
covered table in `docs/03-domain/STORY-VERSIONING.md` if it enumerates
covered tables; record deviations in
`docs/implementation/ISSUES-AND-GAPS.md` BEFORE any workaround (standing
rule). The 013 task contract should reference §"Contract with NF-WF-013"
of this contract as its frozen input.

List unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task (NF-WF-013). Do not claim full
platform completion.

## Decisions (confirmed by the contract reviewer)

Round 1 review confirmed the author's recommendations on all six questions.
They are pinned as decided — no longer open. Rationale is kept so the
implementer knows why the pinned choice was chosen.

- **Q1 — Schedule execution: durable delayed job + startup
  reconciliation (DECIDED).** The contract pins the delayed job
  (BullMQ-native, no poll loop, survives restarts in Redis) with startup
  reconciliation for the crash window (Invariant 5). The rejected
  alternative — a sweeper like `recoverStaleRuns`
  (`executor.ts:895`) scanning due schedules every N minutes — adds a
  permanent poll loop and minute-scale firing granularity.
- **Q2 — Should superseded public versions stay addressable? (DECIDED:
  no.)** The contract replaces the pin on re-publish (old version rows
  persist, author-visible, but not publicly served). Keeping every public
  version addressable is a reader feature with retention and moderation
  implications; 013 or a follow-up may add version history.
- **Q3 — Unpublish: flip the row to UNPUBLISHED (DECIDED).** The row is
  tiny, the audit trail is valuable, and the state machine stays
  explicit. Deletion would lose the "was publicly visible from X to Y"
  fact. Extended by P2-2: a deterministic fire-time refusal also flips
  the row to UNPUBLISHED (audit-logged) so the author sees the lapsed
  schedule and reschedules explicitly.
- **Q4 — Novel DRAFT→ACTIVE: automatic on first publish (DECIDED).**
  The product has no launch ceremony today and the acceptance needs no
  new UI surface for it.
- **Q5 — Does archiving a novel cancel its scheduled publications?
  (DECIDED: yes.)** Rows → UNPUBLISHED, jobs removed. The rejected
  alternative — schedules survive archive and fire into an archived
  novel (invisible until unarchive) — is surprising.
- **Q6 — Does scheduling need its own capability? (DECIDED: no.)**
  `chapter:publish` covers the release decision, and the vocabulary is
  fixed (no invented capabilities). A separate `chapter:schedule` would
  need its own justification.

## Review record

(Reviewer: separate actor from the contract author and the future
implementer; backend MODEL_UNVERIFIED per GAP-013. Fill at review.)

- Round 1 verdict: **CHANGES_REQUESTED** — findings addressed in this
  revision (re-review pending; the reviewer fills the round-2 verdict).
- Round 1 findings and this revision's disposition:
  - P2-1 (startup reconciliation missed the crash window) → Invariant 5
    rewritten: reconcile ALL SCHEDULED rows; `queue.getJob(jobId)` per
    row; re-enqueue only when missing (immediate if due, remaining
    delay if future); new acceptance checkbox.
  - P2-2 (fire-time refusal created a zombie schedule) → deterministic
    refusal (`REVIEW_STALE` / `HARD_POLICY_VIOLATION` at fire time)
    moves the row to UNPUBLISHED, audit-logged, job succeeds; the
    transient-vs-deterministic distinction pinned (P3-4); Invariant 2
    table and acceptance updated.
  - P2-3 (backend-verification section truncated) → section restored
    with re-verified file:line references (author re-check, see below).
  - P2-4 (schedule-time review requirement unpinned) → pinned:
    scheduling needs no PASS receipt; firing does.
  - P2-5 (007 novel page publish action) → Invariant 3 carries the
    implementer obligation: verify existing 409 handling covers
    IN_REVIEW-source refusals or record a follow-up GAP; new
    acceptance checkbox.
  - P3-1 (line-ref drifts) → `ChapterStatus` pinned at
    `schema.prisma:249-253`; `recoverStaleRuns` at
    `executor.ts:895`; the other cited refs re-checked against source
    at repo `7e9bd0f` and kept as written (`@@unique` :308,
    `WORKFLOW_QUEUE_NAME` :157, `COVERED_TABLES` :59).
  - P3-2 (cancel/reschedule must remove the delayed job) → pinned
    `queue.getJob(jobId).remove()` in Invariant 5; the mirrored
    facade's existing `getJob` passthrough (`workflow-queue.ts:45`)
    means no new facade method is needed.
  - P3-3 (readiness header must record Q1–Q6 resolutions) → header
    rewritten; Q1–Q6 pinned as decided under §"Decisions".
  - P3-4 (handler must distinguish transient vs deterministic) →
    pinned in Invariant 5; the old "attempts: 1 … reconciliation
    re-enqueues it" wording now applies to transient failures only.
- Round 1 verdict note: the reviewer judged GAP-045 (the 010 gate
  extension, Invariant 3) LEGITIMATE with the ISSUES-AND-GAPS.md entry
  sufficient; the frozen 010 contract is untouched.
- Verdict (round 2): **APPROVE** — the contract author's P2-6 fix
  (re-reviewer, 2026-10-05, backend MODEL_UNVERIFIED per GAP-013).
- Note (author, round 2): the re-reviewer conceded the round-1 P3-1
  line-ref dispute — independently re-verified at `7e9bd0f`, the author's
  values are source-true (`@@unique([chapterId, number])` at
  `schema.prisma:308`, `WORKFLOW_QUEUE_NAME` at `ports.ts:157`,
  `COVERED_TABLES` at `snapshot.ts:59`); their round-1 actuals were
  wrong. Re-reviewer confirmed these three refs plus
  `removeOnFail: 5000` at `ports.ts:165-168` and `recoverStaleRuns`
  at `executor.ts:895` against source in this round (see "Backend
  verification"). The P3-1 concession stands.
- Findings: no new findings; one P3 observation (non-blocking, for the
  implementer/parent):
  - **P3-ob (startup-pass ownership):** Invariant 5 says reconciliation
    runs "on worker/API startup" while also pinning "a single startup
    pass (no concurrent reconciler)". The implementer should pin WHICH
    process owns the pass (natural: the worker, since it owns the
    publication queue; the API may scale horizontally). Non-blocking:
    BullMQ's jobId dedupe makes even a concurrent double-reconciler
    outcome convergent — `add` against an existing jobId is a silent
    no-op, so no double-enqueue and no zombie are possible either way
    (cross-checked against BullMQ jobId semantics).
- Backend verification (re-reviewer, independent, repo @ `7e9bd0f`):
  - `WORKFLOW_QUEUE_NAME = "workflow-runs"` at
    `packages/workflow-executor/ports.ts:157`; `WORKFLOW_DEFAULT_JOB_OPTIONS`
    (`attempts: 1`, `removeOnComplete: 1000`, `removeOnFail: 5000`) at
    `:165-168` — the comment there confirms count-based bounded retention
    ("bounded Redis growth with recent jobs kept for debugging"), so the
    failed-record branch of reconciliation is source-true.
  - `@@unique([chapterId, number])` at `schema.prisma:308` (the `:323`
    twin is on `scenes`, as the author states); `COVERED_TABLES` at
    `snapshot.ts:59`; `recoverStaleRuns` at `executor.ts:895`.
  - BullMQ semantics cross-checked via public docs: adding a job with an
    already-existing `jobId` is a silent no-op ("If you attempt to add a
    job with an id that already exists, it will not be added" — bull
    REFERENCE; "Once the job is removed, the ID no longer protects
    against duplicates"). This is exactly the hazard P2-6 pins and the
    remove-first-then-enqueue ordering resolves.
- Normative judgment (re-reviewer): P2-6 is genuinely resolved — the
  reconciliation paragraph, the transient-failure paragraph, and the
  reconciliation acceptance checkbox are mutually consistent; missing
  AND retained-failed jobs are both re-enqueued (failed record removed
  first, freeing the `jobId`, because `add` without removal is a silent
  no-op against the retained record); remove-first-then-enqueue is
  race-free within the pinned single startup pass; the
  `removeOnFail: 0` alternative is considered and rejected with a
  recorded rationale (erases the failure trail). The deterministic-
  failure → UNPUBLISHED path stays coherent alongside: the job succeeds
  after flipping the row, so the row leaves SCHEDULED and reconciliation
  skips it — no zombie path; the "no 409 leave-SCHEDULED" rationale
  (`attempts: 1` + jobId dedupe + retained failures → re-enqueue is a
  no-op or an infinite refusal loop) is sound. No other zombie paths:
  scan covers only SCHEDULED rows; delayed/waiting/active/completed are
  left alone; cancel/reschedule remove the old job first in any state,
  so their re-`add` can never no-op. The `add` silent-no-op concern is
  addressed on every enqueue path (schedule: fresh publication id;
  reschedule: remove-first; reconcile: remove-first). G1–G10-style gate
  check not applicable here; the M4 acceptance checkboxes remain
  testable and sufficient. §"Decisions" Q1–Q6 stay pinned as decided.
- Still unresolved (for the parent): nothing blocking. Two notes:
  (1) the readiness header's "round-2 re-review pending" line is now
  superseded by this APPROVE verdict — update it (and the frozen review
  manifest placeholders) when committing; (2) the P3-ob startup-pass
  ownership note above is implementer guidance, not a contract defect.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-05 (repo @ `7e9bd0f`). File:line references:

- `ChapterStatus` DRAFT/IN_REVIEW/PUBLISHED —
  `packages/database/prisma/schema.prisma:249-253`; `NovelStatus`
  DRAFT/ACTIVE/ARCHIVED at `:24-28`.
- Monotonic `(chapterId, number)` uniqueness on `chapter_versions` —
  `schema.prisma:308` (a second `@@unique([chapterId, number])` at `:323`
  belongs to `scenes`, not the pin).
- BullMQ precedents: `WORKFLOW_QUEUE_NAME = "workflow-runs"`
  (`packages/workflow-executor/ports.ts:157`);
  `WORKFLOW_DEFAULT_JOB_OPTIONS` with `attempts: 1`,
  `removeOnComplete: 1000`, `removeOnFail: 5000` (`:165-168`);
  `MEMORY_REBUILD_QUEUE_NAME = "memory-rebuild"`
  (`packages/memory/src/constants.ts:10`).
- Queue wrapper facade: `createWorkflowQueue`
  (`apps/api/src/services/workflow-queue.ts:33-50`); `add` passes
  options through (`:44`); `getJob(jobId)` passthrough (`:45`) — the
  mirrored publication facade needs no new method for job
  lookup/removal.
- Restart recovery: `recoverStaleRuns`
  (`packages/workflow-executor/executor.ts:895`; the invariant-3 doc
  comment at `:16` references the sweeper).
- The 010 `setStatus` gate: the carve-out comment —
  "IN_REVIEW→PUBLISHED and the PUBLISHED→IN_REVIEW 'unpublish' path keep
  their pre-010 behavior" (`apps/api/src/services/manuscript.ts:399-408`);
  the gate reads the receipt directly ("the receipt's verdict is the
  whole contract"), typed `PolicyError` mapped before the generic
  `ConflictError` branch (`:409-414`); receipt keyed by
  `chapterVersionId` (`:415-417`).
- Typed `PolicyError` precedent — `apps/api/src/services/policy-errors.ts:18`.
- Chapter immutability guard: `manuscript.ts:267-268,284-285,671`
  ("published chapters are immutable; unpublish first"); delete path
  `:343-345` ("published chapters cannot be deleted; unpublish first").
- Chapter row lock `SELECT … FOR UPDATE` — `manuscript.ts:274`
  (`saveChapter`; novel-level lock at `:172`).
- Membership gate: no membership → `NotFoundError("novel")` → 404
  (`manuscript.ts:136-151`); novel tenant check `:146-150`.
- `setStatus` capability map: DRAFT→PUBLISHED needs `chapter:publish`,
  PUBLISHED→IN_REVIEW needs `chapter:update` (`manuscript.ts:392`).
- Audit precedent `chapter.published` / `chapter.unpublished`
  (`manuscript.ts:467`); `advanceForMutation` on `setStatus`
  (`:451-460`); "restore never rewinds publication" comment (`:449`).
- Capability vocabulary including the currently unconsumed
  `novel:archive` — `packages/auth/authorization.ts:17-64` (no
  invented capabilities; no `novel:manage`).
- `TABLE_SCOPE` registry — `apps/api/src/services/revisions.ts:183`.
- `COVERED_TABLES` — `packages/story-versioning/snapshot.ts:59`;
  `{ key: "chapters", restoreTarget: false, excludeColumns: ["status"] }`
  at `:73`; `{ key: "chapter_versions", restoreTarget: false }` at `:74`.
- Route conventions (session auth → 401; membership tenant gate → 404;
  Zod → 400; uuid params; single app-wide error handler) —
  `apps/api/src/manuscript-routes.ts:1-13`.
- No-existence-oracle precedent for the public boundary: canon READER
  mode (`apps/api/src/services/canon.ts:2399-2412`); `readerVisible`
  (`packages/story-intelligence/events.ts:236`).
- GenerationPanel's exact API sequence (NF-WF-011 loop, referenced for
  no-regression context) — verified in `tasks/NF-WF-011-author-preview-e2e.md`.

Anything not listed above is a normative contract invention, not a
backend observation; the reviewer should treat unlisted file:line
claims as unverified.