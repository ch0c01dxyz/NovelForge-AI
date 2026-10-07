# Task NF-WF-031: Notification fan-out automatic recovery (GAP-096)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE with 2 P3 observations, non-blocking)
Milestone / capability IDs: M8 (production operations)
Implementer role / requested and resolved model: TBD (separate actor from contract author)
Reviewer role / requested and resolved model: TBD (separate actor from implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-096 OPEN; contract review required before implementation
Frozen review manifest / exact artifact paths and identity: TBD at implementation
Baseline revision / local changes to preserve: eb065cf (or newer — verify at dispatch)
Engram checkpoint topic key / last confirmed observation reference: TBD

## Goal and reason

Close GAP-096: failed notification fan-outs on the `notifications`
BullMQ queue must recover automatically from transient failures instead
of sitting in `failed` forever. A transient DB blip during fan-out
currently means the recipient never gets that notification unless an
operator re-drives the job manually.

The fix must preserve the two safety properties that make retry safe:
at-most-once delivery per recipient per event (currently NOT enforced
— see below), and preference-honoring on every attempt.

**Critical pre-existing hazard (drives the design):** the
`notifications` table has NO unique constraint. A naive retry of
`fanoutChapterPublished` would call `createMany` again and insert
DUPLICATE rows. The `UNIQUE ("user_id", "type")` in migration
`20261006_nf_wf_019c_notifications` is on `notification_preferences`,
not `notifications`. Any retry mechanism without a dedup guard would
trade "no delivery" for "double delivery". This contract requires the
dedup guard as a prerequisite to enabling retries.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12 multi-LLM orchestration).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- GAP-096 in [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1938).
- [023B job inventory](../../docs/implementation/023B-job-inventory.md) (§4 `notifications` recovery contract).
- `apps/worker/src/notification-fanout-jobs.ts` (fan-out handler + worker wiring).
- `apps/api/src/services/notification-queue.ts` (producer-side queue).
- `apps/api/src/services/publication.ts` (§552 enqueue call site).
- `packages/workflow-executor/ports.ts` (`WORKFLOW_DEFAULT_JOB_OPTIONS`).
- `packages/memory/src/constants.ts` (`MEMORY_REBUILD_MAX_ATTEMPTS` retry precedent).
- Migration `packages/database/prisma/migrations/20261006_nf_wf_019c_notifications/migration.sql` (table shape, GAP-030 idempotency precedent).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task
prerequisites without Docker; Windows reuses existing running Docker
services/data. Use disposable scratch databases; never reset working
databases for tests. The dedup migration must be tested on an empty and
a populated scratch DB.

## Dependencies and evidence

- NF-WF-019C: IMPLEMENTED (notification fan-out; the handler being fixed).
- NF-WF-023B: IMPLEMENTED (job inventory; GAP-096 recorded here).
- NF-WF-009 F6: retry precedent (`memory-rebuild`: attempts 5, exponential backoff base 1000ms).
- Active issue: GAP-096 (OPEN/P3). GAP-013 standing (backends MODEL_UNVERIFIED).
- Record new technical problems in ISSUES-AND-GAPS.md before any workaround.

## Scope

### Allowed paths

- `packages/workflow-executor/ports.ts` — add `NOTIFICATION_FANOUT_MAX_ATTEMPTS`
  and `NOTIFICATION_FANOUT_RETRY_BASE_MS` constants (alongside
  `WORKFLOW_DEFAULT_JOB_OPTIONS`; both the API and the worker already
  import from this package).
- `apps/api/src/services/notification-queue.ts` — apply the retry job
  options in `createNotificationQueue`'s `defaultJobOptions`.
- `apps/worker/src/notification-fanout-jobs.ts`:
  - Apply the same retry job options in `defaultNotificationFanoutWorkerDeps`
    (`createQueue`).
  - Throw BullMQ `UnrecoverableError` (fail fast, no retry) for malformed
    job data; keep plain `throw` for transient failures (DB errors).
  - Add `skipDuplicates: true` to the `createMany` call in
    `fanoutChapterPublished` (requires the unique index below).
  - Enrich the `failed` event log: jobId, eventName, novelId, chapterId,
    publicationId, attempt number (`job.attemptsMade`), error message.
- `packages/database/prisma/migrations/20261007_nf_wf_031_notification_dedup/migration.sql`
  — NEW additive, idempotent migration adding the partial unique index
  (see Migration and rollback).
- `packages/database/prisma/schema.prisma` — add the corresponding
  `@@unique` (or `@@index` with `map`) to the `Notification` model so
  Prisma Client exposes it for `skipDuplicates`.
- `apps/worker/src/notification-fanout-jobs.test.ts` — new acceptance
  tests (see Acceptance and verification).

### Forbidden paths

- Everything else, including unrelated queues, the publish paths
  (`publication.ts` trigger logic), preference semantics, notification
  types, and inbox read paths.
- Do NOT change the fan-out trigger points or the enqueue call sites
  beyond the job-options change in `notification-queue.ts`.
- Do NOT add a manual operator re-drive API route (out of scope —
  see below).
- Do NOT weaken the "chapter must be PUBLISHED at execution time"
  guard (Invariant 7) or the batch bound (≤ 500).

### Inputs

- `NotificationFanoutJobData` (pinned shape; worker/API mirrors must stay identical).
- `WORKFLOW_DEFAULT_JOB_OPTIONS` (the base being overridden).
- The existing `notifications` table (may contain rows; migration must handle).

### Outputs

- Retry-enabled `notifications` queue on both producer and consumer sides.
- Partial unique index enforcing at-most-once per recipient per NEW_CHAPTER event.
- Enriched failure observability.
- Acceptance tests proving retry, dedup, and preference-honoring.

### Out of scope

- **Manual operator re-drive API** (new route + authz to re-enqueue a
  failed fan-out): valuable, but a separate task with its own auth
  surface. Follow-up owner: coordinator dispatch.
- **Email/push delivery**: 019C is in-app inbox only.
- **Sweeper/startup reconciliation for `notifications`**: BullMQ retry
  covers transient failures; Redis-loss of queued fan-outs remains a
  documented limitation (the `notifications` table is the record; a
  future task may add reconciliation).
- Changing `removeOnComplete`/`removeOnFail` retention.

## Behavior and invariants

### Invariant 1 — Bounded retry, no storms

`attempts: NOTIFICATION_FANOUT_MAX_ATTEMPTS` (3) with exponential
backoff base `NOTIFICATION_FANOUT_RETRY_BASE_MS` (2000ms). Rationale:
notifications are best-effort social data (never story truth); 3
attempts over ~6s covers transient DB blips without hammering a
struggling database. The implementer may propose different values with
measured justification; unbounded or linear retry is forbidden.

### Invariant 2 — At-most-once delivery per recipient per event (dedup)

Enforced at the database level, not just in code:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_new_chapter_dedup_idx"
  ON "notifications" ("user_id", "type", "novel_id", "chapter_number")
  WHERE "type" = 'NEW_CHAPTER';
```

- The partial index covers only `NEW_CHAPTER` (the fan-out event);
  `COMMENT_REPLY`/`MODERATION_NOTICE` carry no chapter identity and are
  unaffected.
- `chapter_number` (not `chapterId`) is the identity per the 019A
  chapter-identity precedent: a republication of the same chapter
  number does not generate a second notification.
- `fanoutChapterPublished` passes `skipDuplicates: true` to
  `createMany`, so a retry after partial success inserts only the
  missing rows instead of failing on conflict or duplicating.
- Code-level recipient dedup (novel-follow ∪ author-follow set) is
  retained; the index is the backstop against concurrent retries.

### Invariant 3 — Preferences honored on every attempt

`fanoutChapterPublished` MUST read `notification_preferences` at
execution time (current behavior — locked in, not to be cached at
enqueue or first attempt). A user who opts out of NEW_CHAPTER between
attempts receives nothing on retry. Absent preference row = ON (Klein
Q5, pinned).

### Invariant 4 — Fail fast on poison, retry on transient

- Malformed job data (missing/unknown `eventName`) → throw BullMQ
  `UnrecoverableError`: no retry, straight to `failed` for debugging.
- Chapter not PUBLISHED at execution time → success no-op (current
  behavior; not a failure, not retried — Invariant 7).
- DB/connection errors → plain throw → BullMQ retry with backoff.

### Invariant 5 — Observability

Every terminal failure (attempts exhausted) MUST log: jobId,
eventName, novelId, chapterId, publicationId, attemptsMade, and the
error message. Failed jobs remain retained (`removeOnFail: 5000`)
and visible in the BullMQ dashboard. No silent drops.

### Concurrency

Two workers (concurrency: 2) may process different fan-out jobs
concurrently; the unique index makes concurrent retries of the SAME
event safe (one wins, the other skips duplicates). No advisory locks
required.

## Acceptance and verification

- [ ] **Retry on transient failure:** a test simulates a transient DB
      failure on the first fan-out attempt and success on retry;
      asserts the notification rows are eventually created. (Feasible
      via faked BullMQ worker invoking the handler twice, or via a
      real-Redis integration test if the scratch env provides one —
      implementer states the method.)
- [ ] **No duplicate delivery:** a test runs `fanoutChapterPublished`
      twice for the same event (simulating retry after partial
      success); asserts exactly one notification row per recipient.
      (Proves the unique index + `skipDuplicates` path.)
- [ ] **Opt-outs respected on retry:** a test opts a user out of
      NEW_CHAPTER between the first attempt and the retry; asserts
      the opted-out user receives no notification while others do.
- [ ] **Poison fails fast:** a test enqueues malformed job data;
      asserts the job goes to `failed` without consuming all attempts
      (`UnrecoverableError` path).
- [ ] **Queue configuration:** a test asserts the `notifications`
      queue (both `createNotificationQueue` and the worker's
      `createQueue`) is constructed with `attempts: 3` and
      exponential backoff base 2000ms.
- [ ] **Migration:** the new migration applies cleanly on an empty
      DB and on a populated scratch DB; re-running it converges
      (idempotent). If pre-existing duplicate rows would violate the
      unique index, the implementer reports them and the migration
      handles them (dedupe in-migration or documented manual step —
      no silent data loss).
- [ ] Existing `notification-fanout-jobs.test.ts` suite still passes
      (no regressions in dedup/preference/no-op/batch behavior).
- [ ] `pnpm lint`, `npx tsc --noEmit` (apps/worker, apps/api,
      packages/workflow-executor, packages/database) clean.
- [ ] Separate review of the submitted diff; findings resolved.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass a capability gate.

## Migration and rollback

- **Migration:** `20261007_nf_wf_031_notification_dedup` — additive
  only: one `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE type =
  'NEW_CHAPTER'`. Follows the GAP-030 idempotency precedent
  (IF NOT EXISTS; no DO-block needed for indexes). The matching
  `schema.prisma` change keeps Prisma Client in sync for
  `skipDuplicates`.
- **Existing data:** the implementer MUST query for pre-existing
  rows violating the new constraint on the target DB before applying.
  If violations exist, the migration includes a dedup step (keep
  earliest per key) — notifications are non-canonical social data, so
  deduping is safe, but it must be explicit, not silent.
- **Rollback:** `DROP INDEX IF EXISTS
  "notifications_new_chapter_dedup_idx"` — loses dedup enforcement;
  existing rows untouched. Documented here; rollback does not restore
  duplicate rows (none should exist post-migration).
- **Deployment compatibility:** the index is created
  non-concurrently in the migration (standard for this project's
  migrations); on large `notifications` tables the implementer notes
  the expected lock time. The code change (`skipDuplicates`) is safe
  to deploy before or after the migration (without the index,
  `skipDuplicates` is a no-op; with it, dedup is enforced).
- Never silently reset an existing database.

## Documentation and handoff

Use the playbook's Engram save/recovery protocol. Include
task/worktree/role, current revision/diff, completed evidence,
unfinished step, next action, issue IDs and review state. Save at
meaningful boundaries and before planned clear, handoff or end of
turn; recover and verify against the repository after reset. If
Engram fails, keep this compact handoff in the existing
task/progress record and log the problem in ISSUES-AND-GAPS.md.
Never claim an unconfirmed save.

Update the 023B job inventory (`docs/implementation/023B-job-inventory.md`
§4) with the new retry contract after implementation is verified.
Update CURRENT/progress/test-matrix with verified scope. Use the
[playbook handoff](../../docs/06-ai/MULTI-LLM-ORCHESTRATION.md). List
unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task. Do not claim full platform
completion.

**GAP-096 closure:** this task closes GAP-096 when all acceptance
boxes are checked on observed evidence and the diff review is
APPROVE. The 023B inventory §4 must reflect the new contract
(attempts/backoff/dedup) as part of closure.
