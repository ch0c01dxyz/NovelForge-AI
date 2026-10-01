# Task NF-WF-002: Minimum revision, checkpoint and restore foundation

Status: READY (contract frozen by NF-WF-001 and **VERIFIED** over three review
rounds — see [STORY-VERSIONING.md](../docs/03-domain/STORY-VERSIONING.md)
§Contract and [ADR-0014](../docs/adr/ADR-0014-revision-checkpoint-model.md)).
Milestone: M1. Capabilities: CAP-03, CAP-04, CAP-08.
Implementer role / requested and resolved model: implementer /
`deepseek-v4.1-flash` requested; resolved model recorded at execution.
Reviewer role / requested and resolved model: reviewer / `glm-5.3-flash`
requested; runtime availability unverified — record `REVIEW_PENDING` if it
cannot be invoked (GAP-013).
Baseline revision / local changes to preserve: record `git rev-parse HEAD` and
the dirty-file set at dispatch; do not revert the M0 documentation changes.
Engram checkpoint topic key / last confirmed observation reference: record at
dispatch, e.g. `context/NF-WF-002/main/implementer`.

## Goal and reason

Make cross-domain story recovery real: a per-novel revision head with
compare-and-set, a consistent cross-domain checkpoint, non-destructive restore
that creates a new revision and preserves later history, and durable
rebuild-intent rows that commit with the mutation. This is the M1 gate
(TESTING G-01) and the prerequisite for NF-WF-003.

This task implements the frozen contract. It must not invent cross-domain
recovery semantics: if the contract does not answer a question, stop and record
it in ISSUES-AND-GAPS.md rather than choosing silently.

## Required reading

- [Operating constitution](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) §9.
- [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [STORY-VERSIONING.md](../docs/03-domain/STORY-VERSIONING.md) §Contract —
  the authority for every name, key and failure mapping below.
- [ADR-0014](../docs/adr/ADR-0014-revision-checkpoint-model.md) and
  [ADR-0013](../docs/adr/ADR-0013-workflow-delivery-and-recovery-foundation.md).
- [DATA-MODEL-BLUEPRINT.md](../docs/04-data/DATA-MODEL-BLUEPRINT.md)
  §Versioning, §Operations.
- `packages/database/prisma/schema.prisma` and
  `packages/database/prisma/migrations/20261003_phase8_character_relationship`
  (the CHECK/EXCLUDE migration pattern).
- `apps/api/src/services/manuscript.ts` (`saveChapter`, `restoreVersion`) and
  `apps/api/src/services/narrative.ts` (`advanceAntagonistStage`) — the two
  concurrency patterns being generalised.
- `apps/api/src/platform-routes.ts` — the single app-wide error handler.
- `packages/narrative-rhythm/` — the pure-package layout to copy.

## Dependencies and evidence

NF-WF-001 contract (this repository revision). Issue IDs: GAP-004 (cross-domain
revision/checkpoint absent), GAP-011 (identity joins). GAP-013 governs reviewer
availability. A PLANNED dependency does not make this task READY; this task has
none.

## Scope

Allowed paths:

- `packages/database/prisma/schema.prisma` — add eight models, five enums, two
  nullable columns (C2, C9).
- `packages/database/prisma/migrations/<new>/migration.sql` — the additive
  migration, the partial unique index on `characters.story_entity_id` (raw SQL,
  C9) and the baseline-revision backfill (C8).
- `packages/database/test/revision-constraints.integration.test.ts` — new.
- `packages/story-versioning/index.ts`, `impact.ts`, `snapshot.ts`,
  `story-versioning.test.ts`, `package.json` — currently `export {}`.
- `apps/api/src/services/revisions.ts` — new service.
- `apps/api/src/revision-routes.ts` — new routes.
- `apps/api/src/revision.test.ts` — new integration suite.
- `apps/api/src/app.ts` — register the service and routes.
- `packages/auth/authorization.ts` — add `revision:read`, `revision:manage`.
- `apps/api/src/services/{canon,planning,manuscript,story,characters,relationships,narrative}.ts`
  — route **every** covered mutation in C3 through the head CAS, revision and
  change set; the HIGH-impact operations named in C3 additionally capture the
  `PRE_MUTATION` checkpoint and snapshot. The set is exactly the services that
  own a C3 operation: `story.ts` (events, timeline, threads, promises, causal
  edges), `characters.ts` and `relationships.ts` (character and relationship
  spans), `narrative.ts` (DNA/policy writes and antagonist advance).
  **Scene CRUD is listed in C3 but has no production write path today** —
  `manuscript.ts:4-6` records it as schema-only until a scene write path is
  needed, `planning.ts:326` only reads, and the sole `scene.deleteMany` is test
  cleanup. Do not invent one here; C3 names the operation class that will owe a
  revision when that path lands (round-3 review observation).
- `apps/api/src/services/platform.ts` — `createNovel` creates the `main`
  branch, its `BASELINE` revision and that revision's change set in the same
  transaction as the novel (C8). Without this no novel created after deploy can
  take the head CAS.
- `docs/implementation/{progress,test-matrix}.md`, `docs/14-progress/CURRENT.md`,
  `docs/implementation/ISSUES-AND-GAPS.md`.

Forbidden: every other path. No new dependency, framework or provider. No
change to canon supersede semantics (ADR-0008), retrieval (ADR-0007) or
workflow definition versioning (ADR-0006).

Inputs: the frozen contract; existing services and their transactions.
Outputs: eight tables, five enums, two nullable FK columns, a pure
`@novelforge/story-versioning` package, `createRevisionServices`, HTTP routes,
and the HIGH-impact call sites routed through the mutation boundary.

Out of scope, with owners: selective/domain/entity restore and branch merge
(NF-WF-020); snapshot capture at scale (NF-WF-011); chapter context (NF-WF-003).

## Behavior and invariants

- **Head CAS on every covered mutation.** Both impact classes cross the
  boundary: LOW and HIGH alike compare the expected head inside their
  transaction and advance it with a revision and change set. The class decides
  only whether a checkpoint and snapshot are captured (HIGH) or not (LOW). A
  mismatch is a 409 with no partial write. Use `IS NOT DISTINCT FROM` so a NULL
  head is comparable (C4).
- **Checkpoint atomicity.** A HIGH mutation captures its snapshot in the same
  transaction. If the snapshot write fails, the mutation does not happen.
- **Coverage refusal.** A mutation touching an uncovered table is refused by
  name; `validateSnapshotComplete` refuses a snapshot missing any C1 key.
- **Restore is non-destructive.** Restore creates a new revision whose parent
  is the head at apply time; `R43..R58` remain readable.
- **Restore never writes outside scope.** `chapters.status` is not in the
  payload and a PUBLISHED chapter's `currentVersionId` is never overwritten.
- **Rebuild intent is durable.** Intent rows commit with the mutation.
  Deduplication is `UNIQUE (projection, source_revision_id)`. A Redis outage
  must not fail a commit and must not report success.
- **Authorization.** Restore requires `revision:manage`; the capability is not
  platform-only. Missing membership stays a 404, not a 403 (ADR-0004).
- **Idempotency.** Repeated delivery of the same rebuild intent is a no-op; a
  repeated restore apply against a moved head is a 409.
- **Failure mapping.** Exactly the seven conditions in C5, through the existing
  handler. No new error class, no second `setErrorHandler`.

## Acceptance and verification

- [ ] Observable result through the real HTTP surface: create a checkpoint,
      change canon and character state, restore, and read both back at the
      boundary — with later history still readable.
- [ ] Negative scenarios, each asserted: concurrent heads (409), duplicate
      rebuild (no-op), failed checkpoint (rollback, no revision), pre-baseline
      history (409 naming the cause), stale generated text (stale marker),
      uncovered table (409), selective restore (409), chapter id absent live
      with its number re-used (409 from preview detection and from apply),
      chapter id absent live with its number free (409, not a silent skip),
      PUBLISHED pointer skipped and surfaced in the change set (restore still
      succeeds — this is not a 409), non-member (404), insufficient capability
      (403).
- [ ] Commands and prerequisites:
      `pnpm --filter @novelforge/database db:test:prepare` (creates
      `novelforge_test` and applies all migrations from empty, 0 failures);
      `pnpm --filter @novelforge/story-versioning test`;
      `pnpm --filter @novelforge/api exec vitest run src/revision.test.ts`;
      `pnpm --filter @novelforge/database exec vitest run test/revision-constraints.integration.test.ts`;
      then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm -r build`.
      A populated-database upgrade check must run against a restored
      `.local-backup-*.sql` dump, never against a live/user database.
- [ ] Each new CHECK/partial index confirmed **load-bearing** by dropping it
      and retrying the refused statement (the Phase 6/8/9 pattern).
- [ ] Every concurrency assertion forces the interleaving — park the write —
      rather than relying on `Promise.all` (Prisma serialises on one
      connection, so a `Promise.all` race passes without the guard).
- [ ] Separate review of the exact submitted diff by the reviewer role;
      findings resolved or recorded. If the reviewer model cannot be invoked,
      the status is `REVIEW_PENDING`, not `VERIFIED`.

Record actual results separately from expectations. Zero selected tests do not
pass G-01.

## Migration and rollback

Additive only: eight tables, five enums, two nullable columns, one partial
unique index (raw SQL), plus one `BASELINE` revision per existing novel with an
empty change set and no snapshot. No destructive down-migration. The migration
must be tested against both an empty database and a populated restore of a
local dump. A novel with a head but no baseline checkpoint refuses restore by
name. Novels created after the migration get their branch and `BASELINE`
revision from `createNovel`, not from the migration (C8). Rollback of the
application is safe for a previous version (it ignores the new tables); the
reverse ordering is not supported and is documented in C8.

## Documentation and handoff

Update `docs/03-domain/STORY-VERSIONING.md` only to replace "(proposed)" with
"(observed)" where the implementation landed and to record measured snapshot
cost if any; the contract itself is frozen and may not be re-scoped here.
Update CURRENT with the next READY task, `progress.md` with the round record,
`test-matrix.md` with G-01's receipt, and ISSUES-AND-GAPS with GAP-004/GAP-011
status. Save the Engram checkpoint at meaningful boundaries and before handoff;
confirm persistence before claiming it.
