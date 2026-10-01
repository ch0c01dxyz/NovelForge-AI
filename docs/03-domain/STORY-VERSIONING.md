# Story Versioning, Checkpoints & Recovery

Delivery: minimum foundation in M1; advanced recovery in M6. This explicitly
replaces the earlier assumption that all versioning waits until after Phase
10. See [ADR-0013](../adr/ADR-0013-workflow-delivery-and-recovery-foundation.md),
[ADR-0014](../adr/ADR-0014-revision-checkpoint-model.md) and
[NF-WF-001](../../tasks/NF-WF-001-revision-contract.md).

The first half states the target requirements. From **Contract** onward this
document is the NF-WF-001 implementation contract: exact tables, keys,
boundaries and failure mapping. Names marked **(proposed)** do not exist yet;
names marked **(observed)** were read from the current tree. NF-WF-002
implements the contract and may not invent cross-domain recovery semantics
beyond it.

## Minimum foundation and rollout

Before integrated canonical generation/extraction/consolidation, define a
consistent per-novel source revision/head, immutable change set, checkpoint
coverage and basic restore. Include canon, planning, chapter version pins,
character/relationship state, events/timeline/threads/promises and narrative
policies consumed by the workflow. Document unsupported scope and refuse
claims of full restore when coverage is incomplete.

Create a labeled baseline for existing data from a consistent snapshot.
Preserve prior immutable versions, supersede chains and audit records;
do not invent pre-baseline revision history. Review populated-database and
empty-database migrations, concurrent writer control and compatible rollout.

Check the expected head/version at commit. Capture checkpoints against the
same verified source boundary; if state changes, recalculate impact and
preview before applying. Failure of a mandatory checkpoint aborts mutation.
Commit canonical state, revision and durable invalidation/rebuild intent
atomically. Expensive model calls and human decisions stay outside DB
transactions. Derived jobs carry source revision and stable deduplication.

Auth, memberships, credentials and public publication pointers are outside
story restore. Their own authorized workflows govern changes. Preview must
state this boundary so restoring a story cannot revoke accounts or silently
replace a published chapter.

## Core model

-   Revision: immutable logical mutation record.
-   Change Set: collection of entity mutations belonging to a revision.
-   Snapshot: reconstructable state at a revision boundary.
-   Checkpoint: named recoverable snapshot.
-   Branch: alternate revision lineage.
-   Derived State: rebuildable summaries, embeddings, caches, indexes.

## Non-destructive restore

If current revision is R58 and checkpoint points to R42: restore creates
R59 based on R42. R43--R58 remain available.

## Checkpoint types

MANUAL, AUTO, PRE_MUTATION, PRE_GENERATION, PRE_IMPORT, PRE_MIGRATION,
MILESTONE.

Auto-checkpoint before high-risk: world-rule mutation, major character
rewrite, timeline rewrite, bulk outline rewrite, branch merge, bulk AI
rewrite, major migration.

## Impact analysis

Before high-impact mutation, identify affected: canon facts, characters,
relationships, chapters, timeline events, threads/promises, outline
nodes, simulation state, endgame conditions, and derived indexes.

## Restore modes

Full restore; domain restore; entity restore; selective restore.
Selective restore must run dependency/conflict analysis first.

## Restore preview

Show changed/added/removed entities, potential conflicts, orphan
references, affected chapters, and derived state requiring rebuild.

## Chapters after rollback

Do not delete automatically. Mark potentially affected manuscripts as
needing compatibility review: compatible / warning / conflict / critical
conflict. Author chooses archive, revalidate, rewrite, or preserve as
alternate branch.

## Branches and What-If

Simulations use sandbox branches and never mutate main canon. A branch
can later produce a merge proposal.

## Semantic merge

Merging is not text-only. Detect semantic conflicts across canon,
character state, relationships, timeline, outline, world rules, and
dependencies.

## Atomicity

Checkpoint/snapshot revision boundaries must be logically consistent. Do
not assemble a checkpoint from unrelated timestamps.

## Recovery Center UX

Timeline, checkpoints, versions, branches, compare/diff, restore,
conflicts, archived states, and bulk-operation recovery.

---

# Contract

## C1. Coverage set

The **covered set** is the 31 tables holding chapter-consumed story state.
Everything else is **outside scope** and restore must say so.

| Group | Covered tables |
|---|---|
| Manuscript | `chapters`, `chapter_versions`, `scenes` |
| Canon | `story_entities`, `canon_facts`, `canon_fact_sources`, `canon_proposals` |
| Planning | `synopses`, `sagas`, `outline_nodes`, `outline_versions`, `planning_horizons` |
| Story intelligence | `story_events`, `timeline_events`, `story_threads`, `story_thread_events`, `story_promises`, `causal_edges` |
| Character | `characters`, `character_states`, `character_knowledge`, `character_arcs`, `character_arc_milestones` |
| Relationship | `relationship_stances`, `bonds`, `bond_members`, `bond_transitions`, `meaningful_interactions` |
| Narrative | `narrative_dna_profiles`, `narrative_policies`, `antagonists` |

Outside scope, each with its own authorized workflow (ADR-0013 §5, §7):

| Outside | Reason |
|---|---|
| `users`, `sessions`, `workspaces`, `memberships` | Identity and authorization. Restoring a story must not revoke an account. |
| `ai_gateways`, `ai_models`, `model_profile_mappings` | Platform provider configuration and credentials. |
| `agents`, `agent_versions`, `skills`, `skill_versions`, `workflows`, `workflow_versions` | Append-only versioned definitions (ADR-0006). A run pins them; restore does not edit them. |
| `workflow_runs`, `workflow_step_runs` | Execution history. Out-of-transaction and not reconstructable from story state. |
| `references`, `reference_versions`, `chunks`, `embeddings`, `retrieval_audits` | Ingested material and derived retrieval (ADR-0003, ADR-0007). Rebuildable, not canon. |
| `generations`, `generation_attempts` | AI ledger. Auditable history, never rewound. |
| `audit_logs` | Append-only audit fact (ADR-0004). |
| `novel_settings` | Not consumed by chapter context; excluded until a consumer reads it. |
| `novels` | Novel identity and slug. Restore rewinds story state, never the novel's identity or tenant binding. |

`novel_branches` is not a member of either set: it is the head pointer itself,
not restorable state, and restore advances it like any other mutation (C4, C7
step 5).

`chapters` and `chapter_versions` are coverage **targets** but not restore
**targets**: `chapter_versions` is append-only and immutable, and it is
`ON DELETE CASCADE` from `chapters`, so neither row is ever deleted. Restore
updates `chapters.currentVersionId` in place. `chapter_versions` participation
is the version pin held in `snapshots.payload` (C7).

## C2. Tables, keys and ownership (proposed)

Every new table carries `workspace_id` (denormalised tenant boundary, ADR-0007)
and `novel_id`, both `ON DELETE CASCADE`, so a filtered query never joins to
enforce isolation. All ids are UUIDv4 via `gen_random_uuid()`.

```text
novel_branches            -- one mutable head pointer per (novel, branch)
  id, workspace_id, novel_id, name (default 'main'), parent_branch_id?,
  head_revision_id?, created_at, updated_at
  UNIQUE (novel_id, name)

revisions                 -- immutable mutation record
  id, workspace_id, novel_id, branch_id, parent_revision_id?, number,
  origin (enum), message?, created_by_id?, created_at
  UNIQUE (branch_id, number)      -- monotonic per branch
  INDEX  (novel_id, created_at)

change_sets               -- one per revision; groups the item log
  id, revision_id, workspace_id, novel_id, created_at
  UNIQUE (revision_id)

change_set_items          -- WHAT changed; never a before-image
  id, change_set_id, entity_type, entity_id, operation, created_at
  operation: CREATE | UPDATE | DELETE
  INDEX (change_set_id), INDEX (entity_type, entity_id)

snapshots                 -- reconstructable state at a boundary
  id, workspace_id, novel_id, branch_id, revision_id,
  format_version, storage, payload, byte_size, created_at
  UNIQUE (revision_id)
  storage: INLINE | EXTERNAL   -- discriminator; only INLINE exists in M1

checkpoints               -- named recoverable snapshot
  id, workspace_id, novel_id, branch_id, revision_id, snapshot_id,
  kind (enum), label, note?, created_by_id?, created_at
  INDEX (novel_id, created_at)

restore_operations        -- preview and apply are the same row
  id, workspace_id, novel_id, branch_id,
  source_checkpoint_id, target_revision_id?, status, scope, preview,
  requested_by_id, created_at, applied_at?
  status: PREVIEWED | APPLIED | REFUSED | FAILED

derived_rebuild_intents   -- durable invalidation; commits with the mutation
  id, workspace_id, novel_id, projection, source_revision_id, status,
  attempts, last_error?, created_at, updated_at, completed_at?
  UNIQUE (projection, source_revision_id)   -- deduplication identity
  status: PENDING | RUNNING | FRESH | FAILED | STALE
```

Enums (proposed): `RevisionOrigin` = MANUAL, AUTO, PRE_MUTATION,
PRE_GENERATION, PRE_IMPORT, PRE_MIGRATION, MILESTONE, BASELINE, RESTORE.
`SnapshotStorage` = INLINE, EXTERNAL. `RestoreStatus` = PREVIEWED, APPLIED,
REFUSED, FAILED. `RestoreScope` = FULL, DOMAIN, ENTITY, SELECTIVE.
`RebuildStatus` = PENDING, RUNNING, FRESH, FAILED, STALE.

`checkpoints.kind` **reuses `RevisionOrigin`** — the checkpoint records the
origin of the revision it pins — so the enum count stays five. The seven
"Checkpoint types" listed above are that enum's nine values minus `RESTORE` and
`BASELINE`; the baseline checkpoint of C8 is `BASELINE`.

`ChangeSetItem.operation` is a `String` with a migration CHECK rather than a
Postgres enum. A single-column closed set *is* expressible as a Prisma enum —
this schema has 44 — so the reason is not impossibility but churn: the
`CREATE`/`UPDATE`/`DELETE` vocabulary is internal to the change log and is
expected to grow (a `SUPERSEDE` or `RESTORE` item kind is plausible), and
extending a Postgres enum is a migration that rewrites the type, while the
Phase 6–9 pattern already keeps load-bearing constraints in SQL where the
migration can state them beside the behaviour they guard. The CHECK is used
here for the same reason the partial indexes are: it can be dropped and the
refused statement retried to prove it is load-bearing.

**Immutable**: `revisions`, `change_sets`, `change_set_items`, `snapshots`,
`checkpoints` (append-only; a refused or failed row is never rewritten, a retry
is a new row). **Mutable**: `novel_branches.head_revision_id`,
`derived_rebuild_intents.status`/`attempts`/`last_error`/`completed_at`, and
`restore_operations.status`/`target_revision_id`/`applied_at` — a preview and
its apply are deliberately the *same* row, so those three fields transition
`PREVIEWED → APPLIED | REFUSED | FAILED`. Everything else on that row
(`scope`, `preview`, `source_checkpoint_id`, `requested_by_id`) is write-once.

`snapshots.payload` shape (`format_version` 1):

```json
{
  "chapters":         [ { "id", "number", "title", "currentVersionId", "wordCount" } ],
  "chapter_versions": [ { "id", "chapterId", "number", "content", "wordCount" } ],
  "scenes":           [ ... ],
  "story_entities":   [ ... ], "canon_facts": [ ... ],
  "canon_fact_sources":[ ... ], "canon_proposals": [ ... ],
  "synopses": [ ... ], "sagas": [ ... ], "outline_nodes": [ ... ],
  "outline_versions": [ ... ], "planning_horizons": [ ... ],
  "story_events": [ ... ], "timeline_events": [ ... ],
  "story_threads": [ ... ], "story_thread_events": [ ... ],
  "story_promises": [ ... ], "causal_edges": [ ... ],
  "characters": [ ... ], "character_states": [ ... ],
  "character_knowledge": [ ... ], "character_arcs": [ ... ],
  "character_arc_milestones": [ ... ],
  "relationship_stances": [ ... ], "bonds": [ ... ],
  "bond_members": [ ... ], "bond_transitions": [ ... ],
  "meaningful_interactions": [ ... ],
  "narrative_dna_profiles": [ ... ], "narrative_policies": [ ... ],
  "antagonists": [ ... ]
}
```

Rows are stored in FK-dependency order; restore inserts in that order and
deletes in reverse. `chapters.status` is deliberately **absent** from the
payload (C7).

## C3. Impact classes and the mutation boundary

`impactFor(operation, entityType)` is a pure function in
`packages/story-versioning` (no Prisma import, ADR-0001), mirroring
`packages/narrative-rhythm`.

| Class | Operations | Checkpoint | Validation |
|---|---|---|---|
| LOW | chapter save/restore, synopsis write, saga/outline-node CRUD, scene CRUD, thread/promise transition, character/relationship span write, DNA/policy write, antagonist advance, fact create/retract, proposal create/reject, event/timeline append, causal edge create | none (revision + change set still recorded) | existing per-service rules |
| HIGH | `approveProposal`, `approveOutlineVersion`, `supersedeApprovedOutline`, `importChapters`, restore apply, bulk outline rewrite, branch merge, bulk AI rewrite | mandatory `PRE_MUTATION` | existing rules + `validateSnapshotComplete` |

**Both classes cross the mutation boundary.** The impact class decides whether a
checkpoint and snapshot are captured — it does not decide whether a revision is
recorded. Every operation in this table takes the head CAS (C4), advances the
head and writes a revision plus its change set; HIGH additionally captures the
`PRE_MUTATION` snapshot and checkpoint in the same transaction, and LOW does
not. A LOW operation that skipped the CAS would leave the head stale and make
the next HIGH mutation's conflict meaningless, so "no checkpoint" must never be
read as "no revision" (C10 step 1 is the worked example: `saveChapter` is LOW
and still produces R43).

`validateSnapshotComplete` asserts that every covered table named in C1 is
present as a key in the payload. A missing key is a refusal, not a partial
snapshot.

## C4. Expected-head compare-and-set

The mutation boundary is one Prisma transaction:

```text
BEGIN
  SELECT head_revision_id FROM novel_branches
   WHERE id = <branchId> FOR UPDATE
  -- head <> expected (null-safe)  ->  rollback, ConflictError  ->  HTTP 409
  INSERT revision (parent_revision_id = <expected>, number = <head number + 1>)
  UPDATE novel_branches SET head_revision_id = <new revision id>
  INSERT change_set, change_set_items
  INSERT snapshot            -- HIGH only
  INSERT checkpoint          -- HIGH only
  INSERT derived_rebuild_intents (status PENDING)
  ... the mutation's own writes ...
COMMIT
```

**Statement order is load-bearing**, and the row lock comes first. Three reasons:

1. The locked row must exist. `SELECT … FOR UPDATE` on a `novel_branches` row
   that was never created finds nothing and cannot CAS — which is why C8 makes
   `createNovel` create the branch, and why a novel can never be observable
   without one.
2. `novel_branches.head_revision_id` is a foreign key to `revisions(id)` and no
   constraint in this schema is `DEFERRABLE`, so the revision row must exist
   before the head can point at it.
3. `UNIQUE (branch_id, number)` means two racers that both compute
   `number = head + 1` collide on the *insert*, surfacing a Prisma `P2002`
   instead of the promised 409. Reading the head under `FOR UPDATE` is what
   makes the number and the CAS comparison atomic with respect to each other.

A single head row serialises every head-advancing mutation on the novel
regardless of how the CAS is written — the `UPDATE` would take the same row
lock — so locking explicitly costs no concurrency and buys a deterministic
conflict. The null-safe comparison is what `IS NOT DISTINCT FROM` would give
in SQL; under the lock it is a plain comparison, because a `NULL` head and an
expected `NULL` are equal and every other pairing is a mismatch. A lost race
returns 409 and the caller re-reads rather than silently retrying, because a
silent retry would apply a plan built on a stale head.

This is the `saveChapter` lock pattern (`SELECT … FOR UPDATE`,
`apps/api/src/services/manuscript.ts`) generalised from a chapter row to a
novel branch, carrying the `advanceAntagonistStage`
(`apps/api/src/services/narrative.ts`) comparison semantics. The chapter row
lock in `saveChapter` stays: it serialises per-chapter saves, which the branch
lock does not replace.

## C5. Failure and status mapping

| Condition | Service error | HTTP |
|---|---|---|
| Head mismatch | `ConflictError("stale revision: expected X, current Y")` | 409 |
| Mutation touches an uncovered table | `ConflictError("outside story restore scope: <table>")` | 409 |
| Checkpoint requested for a pre-baseline revision | `ConflictError("no baseline exists for this novel")` | 409 |
| Snapshot missing a covered table key | `ConflictError("snapshot incomplete: <table>")` | 409 |
| Snapshot chapter id absent from the live `chapters` table, whatever its `number` now holds | `ConflictError("chapter identity conflict: chapter <id> is gone")` | 409 |
| Unknown revision / checkpoint / branch id | `NotFoundError` | 404 |
| Caller lacks `revision:manage` | `ForbiddenError` | 403 |

All seven map through the existing single app-wide handler
(`apps/api/src/platform-routes.ts`), which already maps `ForbiddenError` →
403, `NotFoundError` → 404 and `ConflictError` → 409. No new error handler and
no new error class is introduced.

A PUBLISHED chapter whose pointer the snapshot would move is deliberately
**not** a row in this table, because it is not a failure. Apply skips that
pointer, records it in the restore change set and surfaces it as a pointer
conflict (C7 step 4, ADR-0014 §5). Refusing the whole restore would let one
published chapter block recovery of the entire story — the opposite of what
publication exclusion is for.

A new capability `revision:read` /
`revision:manage` (proposed) is added to `packages/auth/authorization.ts`;
restore requires `revision:manage`, which is **not** in
`PLATFORM_ONLY_CAPABILITIES` — a platform administrator is not the restorer of
every tenant's canon (ADR-0005, ADR-0008).

## C6. Atomic rebuild intent

Canonical mutation and rebuild intent commit in the **same** transaction. The
API never writes Redis inside a mutation. `derived_rebuild_intents` is the
record; Redis is a delivery optimization the worker polls toward.

- **Deduplication identity**: `UNIQUE (projection, source_revision_id)`. A
  replayed or concurrent dispatch for the same source revision is a no-op, not
  a second rebuild.
- **Source revision**: `source_revision_id` is the revision the projection
  must be rebuilt from. A projection whose `source_revision_id` is older than
  the branch head is stale.
- **Stale read policy**: a read of a projection whose intent is not `FRESH`
  must be labelled stale, bypassed using authoritative bounded retrieval, or
  surfaced as incomplete context. It must never be labelled fresh
  (CORE-WORKFLOWS §5).
- **Retry**: `attempts` increments on each RUNNING transition; a failure sets
  `FAILED` with `last_error` and the row is retried by the worker, not by the
  request. A failed rebuild never undoes a committed revision.
- **Redis unavailable**: the mutation still commits; the intent row stays
  `PENDING`; the worker's next poll picks it up. Nothing is lost and nothing
  reports success. `apps/worker` already treats Redis as optional (its
  heartbeat degrades to a logged warning), so this is the existing posture,
  not a new one.

## C7. Restore

**Preview** (`restore_operations` with `status = PREVIEWED`) computes and
stores: changed/added/removed entity counts per covered table, orphan
references, chapters whose `currentVersionId` would change, projections
requiring rebuild, and the explicit outside-scope list from C1. It writes
nothing else.

The **removed** counts are load-bearing, not informational: apply deletes every
covered row the snapshot does not carry, and those rows' content is not
recoverable from the change log (C7, "Restore discards post-boundary state
content"). Preview is where the author learns what the apply will destroy, so
it must present those counts as loss, not as a diff.

**Apply** refuses when the branch head differs from the head the preview was
computed against — impact is recomputed rather than applied against a stale
plan.

Apply then, in one transaction:

0. Verifies every `chapters.id` in the payload is present in the live
   `chapters` table, and refuses by name if any is absent (see "A payload
   chapter id that is not live is refused, not guessed" below). This runs
   **before the first write**, because the failure it prevents — an FK
   violation from re-inserting `scenes`/`outline_nodes` for a deleted chapter —
   is otherwise an unmapped Prisma error rather than a 409.
1. Reads `snapshots.payload` for the target checkpoint.
2. Deletes covered rows for the novel in reverse FK order, **except** the
   manuscript pair `chapters` and `chapter_versions`, which are never deleted
   (see "Why the manuscript pair is exempt" below).
3. Re-inserts payload rows in FK order, **except** `chapters` and
   `chapter_versions`, which are updated in place.
4. For each chapter present in the payload whose live `currentVersionId`
   differs from the snapshot's pin: sets it back to the pin, **unless** the
   chapter is `PUBLISHED`, whose pointer is never overwritten. A skipped
   PUBLISHED pointer is recorded in the restore operation's change set and
   surfaced to the author as a pointer conflict requiring an explicit
   decision; it is not silently left inconsistent.
5. Creates a **new** revision (`origin = RESTORE`,
   `parent_revision_id = <the head at apply time>`) whose change set records
   the restore as one operation. Later history is untouched and remains
   readable.
6. Inserts `derived_rebuild_intents` for every affected projection.

**Restore discards post-boundary state content, and the author must be told.**
Step 2 deletes *every* covered row for the novel, including rows created after
the checkpoint. Those rows are absent from the snapshot, so step 3 does not
bring them back. Their content is then gone: `change_set_items` record what
changed but deliberately store no before-image (C2), and audit payloads carry
ids and predicates, not prose or values. The only surviving copy is an older
snapshot — so a `canon_facts` row, `story_events` row or `character_states` row
created after the boundary is recoverable *only* by restoring a later
checkpoint that contains it.

"Later history remains readable" (step 5) is a claim about **revisions**, not
about state content: the revision records and the change log survive, and the
restored content does not. Preview must state this in the counts it already
computes — the "removed" count per covered table is exactly the set of
post-boundary rows whose content apply will discard — so the author can take a
checkpoint first. This is the cost of the ADR-0014 §2 decision to store no
before-images, and it is bounded by the same thing that bounds capture: the
window between the chosen checkpoint and the present.

**Why the manuscript pair is exempt.** `chapter_versions.chapter_id` is
`ON DELETE CASCADE` (verified in
`20260924_phase2_manuscript/migration.sql`), so deleting a `chapters` row
destroys that chapter's version rows — which C1 declares immutable and which
restore must never touch. The delete-and-reinsert rule is therefore correct
for every covered table *except* this pair. It is also necessary on its own
terms: a `chapters` row exempted from deletion because it is `PUBLISHED` would
still collide with the re-insert on `UNIQUE (novel_id, number)`. Rewinding
`currentVersionId` in place preserves the versions, the chapter identity and
the `chapters_current_version_id_key` uniqueness, and is what makes restore
non-destructive rather than merely recoverable.

**Chapters created after the boundary.** They have no payload entry, so step 4
does not reach them and they survive the rewind. That is forced, not chosen:
removing them would delete `chapters` rows, which cascades into immutable
`chapter_versions` — the one thing C1 forbids. Restore therefore rewinds the
story *around* later chapters rather than deleting them, and the preview lists
them explicitly as retained-post-boundary so the author sees what will not be
rewound.

What survives is the `chapters` row and its `chapter_versions` — **not** the
chapter's story state. `scenes`, `outline_nodes` and `story_events` rows
belonging to a post-boundary chapter are covered rows like any other: step 2
deletes them and step 3 re-inserts only what the payload holds, so they rewind
to the boundary. A retained chapter 13 therefore sits against the boundary's
canon and the boundary's outline/scene state, which is why preview lists it as
a conflict for review rather than as a clean survivor.

**A payload chapter id that is not live is refused, not guessed.** `chapters.id`
is stable but `chapters.number` is not, and a chapter can also be deleted
outright: `deleteChapter` hard-deletes any non-PUBLISHED chapter
(`apps/api/src/services/manuscript.ts`), cascading its `chapter_versions`
(`ChapterVersion.chapter` is `onDelete: Cascade`). Two shapes reach restore and
one rule refuses both — the live table holds no row for a `chapters.id` the
payload names:

- *Number re-used.* Checkpoint at R42, later delete chapter 12, later create a
  *different* chapter 12. The snapshot's chapter-12 row (`id = A`) is gone while
  its number is held by an unrelated row (`id = B`). Re-inserting `A` collides
  on `UNIQUE (novel_id, number)`; updating the live chapter 12 in place would
  attach R42's version pin to the wrong chapter.
- *Number free.* The same delete with nothing re-created. Step 3 would update in
  place, but there is no row, and step 4 finds no live `currentVersionId` to
  compare. Re-inserting the row is not the way out either: `chapters.status` is
  deliberately absent from the payload (C7), so restore would have to invent a
  publication state for a chapter whose author may have unpublished it before
  deleting. Silently skipping it instead restores a story missing a chapter the
  author believes is checkpointed.

Both shapes also break the payload's child rows: `scenes.chapter_id` and
`outline_nodes.chapter_id` are FKs to `chapters(id)`, both `onDelete: Cascade`
(`schema.prisma`), so re-inserting the payload's `scenes`/`outline_nodes` rows
for a chapter that no longer exists violates the FK and aborts the transaction
with a Prisma error C5 does not map. Refusing before the first write is what
keeps that from surfacing as an unhandled 500.

Apply therefore refuses by name (`chapter identity conflict`, C5) whenever a
payload `chapters.id` is absent from the live table, whatever its number now
holds. Detecting this is part of preview, not apply: preview reports the absent
ids and, where a number was re-used, both ids, so the author can resolve it
before applying. This is the same posture as selective restore and pre-baseline
history — refuse by name rather than invent recovery semantics (ADR-0013).

**Unsupported scope**: `DOMAIN`, `ENTITY` and `SELECTIVE` scopes are refused
in M1 with `ConflictError("selective restore is not implemented")`. Only
`FULL` is accepted. Selective restore requires dependency/conflict analysis
that does not exist; refusing by name is the ADR-0013 posture. NF-WF-020 owns
the rest.

**Excluded from restore, always**: accounts, memberships, permissions,
credentials and publication pointers — `chapters.status` is not in the payload
and `Chapter.currentVersionId` is not overwritten for a PUBLISHED chapter.
The manuscript pair `chapters`/`chapter_versions` is updated in place, never
deleted (see step 2).

## C8. Baseline migration and rollout

The migration is **additive**: eight new tables, five new enums, one new
nullable column (`characters.story_entity_id`), one new nullable column
(`timeline_events.story_event_id`). No existing table is altered destructively
and no existing row is rewritten.

For an existing populated database the migration creates **one `BASELINE`
revision per existing novel** — an empty change set, no snapshot — so that
head CAS has a value to compare against and no pre-baseline history is
invented. The labeled baseline **checkpoint** (with a real snapshot) is created
by an explicit authorized operation, not by the migration: a migration that
snapshots every novel would hold one transaction over the whole database.

Consequence, stated plainly: between the migration and the first baseline
checkpoint, a novel has a head and revisions but **no restorable checkpoint**.
Restore against it is refused by name (`no baseline exists for this novel`) —
it is never silently treated as an empty story.

**Write control during capture.** Snapshot capture happens inside the mutation
transaction, so it reads a consistent boundary by construction. The explicit
baseline checkpoint takes `SELECT … FOR UPDATE` on the novel's
`novel_branches` row for the duration of its own transaction, which is the
same lock every covered mutation takes at its head CAS — so a capture and a
mutation cannot interleave.

**Deployment sequence.** The migration is backward compatible in both
directions for a rolling deploy: new tables and nullable columns are invisible
to a previous application version, which simply does not write revisions. The
reverse is not true — an old binary writing without a head CAS would diverge
from the new model — so the rollout order is: migrate, then deploy the new
application, then create baselines. A feature flag may stop new writes but may
not delete revisions and must not require a destructive down-migration
(ADR-0013).

**Novels created after the migration.** The migration can only baseline novels
that exist when it runs. `createNovel`
(`apps/api/src/services/platform.ts`) creates the `novels` row and its
`novel_settings` row and knows nothing about branches, so a novel created after
deploy would have no `novel_branches` row — and the first covered mutation's
`SELECT … FOR UPDATE` on that row would find nothing, surfacing as a 404 or 500
instead of the promised CAS. `createNovel` therefore creates the `main` branch,
its `BASELINE` revision and that revision's `change_set` in the **same
transaction** as the novel, so a novel is never observable without a head.

This is the create-time path, not lazy first-mutation init: lazy init would put
a create-if-absent race on the hot mutation path and would let a novel exist in
a state the contract says cannot exist. NF-WF-002 owns the change; `platform.ts`
is in its allowed paths.

**Empty database**: all 18 existing migrations plus this one apply from empty
with zero failures. Verified by the existing
`pnpm --filter @novelforge/database db:test:prepare` path.

## C9. Stable cross-domain joins

Two identity gaps are closed with explicit nullable FKs. Neither backfills by
guessing.

1. `characters.story_entity_id` → `story_entities(id)`, nullable,
   `ON DELETE SET NULL`, plus a **partial unique index** on the column where it
   is non-null. Prisma cannot declare `UNIQUE … WHERE story_entity_id IS NOT
   NULL`, so the index is raw SQL in the migration — the same Phase 6–9 pattern
   as `change_set_items.operation`'s CHECK (C2). Without it two characters
   could claim one story entity.
   `characters.key` and `story_entities.key` already share the same contract
   ("stable machine key, unique within the novel, lowercase kebab") and
   `characters` is currently standalone (CURRENT §Character). The migration
   backfills **only** where a `story_entities` row of kind `CHARACTER` has the
   same `(novel_id, key)` — an exact machine-key match, never a name match.
   Every other character stays NULL, and NULL is the honest answer.

2. `timeline_events.story_event_id` → `story_events(id)`, nullable,
   `ON DELETE SET NULL`. CURRENT records that timeline events and story events
   are separate tables with no link. No automatic backfill is possible: there
   is no evidence tying a given timeline row to a given event, and inventing
   one would be fabricated provenance. The column is authored, not derived.

In-story time and reading order remain unreconciled in M1; the link makes the
reconciliation possible without claiming it is done. GAP-011 tracks it.

## C10. Worked example

Novel N at head R42 (baseline). Author is at chapter 12.

1. `saveChapter(12, content, expectedVersion 3)` — LOW. Revision R43, change
   set with one `UPDATE chapters` + one `CREATE chapter_versions`. No
   checkpoint.
2. `createFact("Aria", "allegiance", "House Vale")` — LOW. R44.
3. `putKnowledge(Aria, fact, KNOWN, fromChapter 12)` — LOW. R45.
4. `approveProposal(p)` where `p` supersedes Aria's allegiance — HIGH.
   `PRE_MUTATION` checkpoint C1 at R45 is captured **inside** the same
   transaction as the supersede: snapshot S1 holds the pre-change
   `canon_facts` (old fact ACTIVE) and the pre-change
   `character_knowledge` rows. Commit → R46.
5. Author dislikes it. `previewRestore(C1)` → changed: 1 `canon_facts` row
   restored ACTIVE and its successor removed, 1 `character_knowledge` row
   removed, 0 chapters affected, 1 projection (`canon_summary`) marked for
   rebuild. Outside scope listed verbatim from C1.
6. `applyRestore(C1)` → new revision R47 with `origin = RESTORE`,
   `parent_revision_id = R46`. Canon and character state both return to the
   R45 boundary. **R46 remains readable** and the supersede chain is intact
   in history.
7. R43–R46 are preserved. Nothing was deleted from `chapter_versions` and
   no PUBLISHED chapter moved.

Adversarial cases the same contract answers:

- **Concurrent heads.** Two callers both hold `expected = R45`. The first
  commits R46; the second's CAS matches 0 rows → 409, no partial write.
- **Partial failure.** A snapshot write fails mid-transaction → the whole
  transaction rolls back; the mutation did not happen and no revision exists.
  This is the "failed checkpoint aborts the mutation" requirement, satisfied by
  rollback rather than compensation.
- **Duplicate rebuild.** Two dispatches for `(canon_summary, R46)` → the
  second hits `UNIQUE (projection, source_revision_id)` and is a no-op.
- **Pre-baseline history.** A novel migrated but never baselined →
  `applyRestore` refuses with `no baseline exists for this novel`; it does not
  treat the novel as empty.
- **Stale generated text.** Chapter 12's draft was generated against R45.
  After R47 the chapter's recorded source revision is R45 ≠ head R47, so the
  draft is stale and must be revalidated before apply (CORE-WORKFLOWS §2).

## C11. Open items handed to NF-WF-002

- `packages/story-versioning` is `export {}` today; NF-WF-002 creates
  `impact.ts` (the pure classifier) and `snapshot.ts` (shape + validation),
  both Prisma-free, following `packages/narrative-rhythm`'s layout.
- The five new enums and eight tables must be added to `schema.prisma` and to
  `packages/contracts/events.ts`'s `revisionId` field, which is currently
  always `null`.
- `characters.story_entity_id`'s partial unique index (C9) is raw SQL in the
  migration; Prisma cannot express it.
- `createNovel` (`apps/api/src/services/platform.ts`) must create the `main`
  branch, its `BASELINE` revision and that revision's change set in the same
  transaction as the novel (C8), or no novel created after deploy can take the
  head CAS.
- Whether `snapshots.storage = EXTERNAL` is ever needed is unknown. The
  discriminator exists so the answer can change without a migration; M1
  implements `INLINE` only.
- Snapshot capture cost at 2,500 chapters is unmeasured. That measurement
  belongs to NF-WF-011 and CAP-20, not to this contract.
- Chapter identity is refused by name whenever a payload `chapters.id` is
  absent live, under number reuse or a plain delete (C5, C7); NF-WF-002 must
  implement the preview detection, the apply refusal and the negative tests for
  both shapes, plus the FK-fallout case where `scenes`/`outline_nodes` name the
  deleted chapter.
