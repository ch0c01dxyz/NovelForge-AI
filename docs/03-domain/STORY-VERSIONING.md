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

The **covered set** is the 36 tables holding chapter-consumed story state.
Everything else is **outside scope** and restore must say so.

| Group | Covered tables |
|---|---|
| Manuscript | `chapters`, `chapter_versions`, `scenes`, `publications`¹ |
| Canon | `story_entities`, `canon_facts`, `canon_fact_sources`, `canon_proposals`, `canon_applications`, `canon_application_items` |
| Planning | `synopses`, `sagas`, `outline_nodes`, `outline_versions`, `planning_horizons` |
| Story intelligence | `story_events`, `timeline_events`, `story_threads`, `story_thread_events`, `story_promises`, `causal_edges`, `memory_projections` |
| Character | `characters`, `character_states`, `character_knowledge`, `character_arcs`, `character_arc_milestones` |
| Relationship | `relationship_stances`, `bonds`, `bond_members`, `bond_transitions`, `meaningful_interactions` |
| Narrative | `narrative_dna_profiles`, `narrative_policies`, `antagonists`, `final_text_reviews` |

¹ `publications` (NF-WF-012) is covered with `restoreTarget: false`: the
release lifecycle is not story state. Restoring a checkpoint never deletes
or re-inserts publication rows — restoring a pre-publish checkpoint does
not unpublish, and restoring a post-publish checkpoint does not resurrect a
cancelled publication. The pinned `chapterVersionId` always resolves because
chapter versions are never deleted (Invariant 4).

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
| HIGH | `approveProposal`, `approveOutlineVersion`, `supersedeApprovedOutline`, `importChapters`, restore apply, bulk outline rewrite, branch merge, bulk AI rewrite, **explicit checkpoint capture (`checkpoint.create`)** | mandatory `PRE_MUTATION` (a `checkpoint.create` captures its snapshot without mutating state; see C12.2) | existing rules + `validateSnapshotComplete` |

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

The `INSERT snapshot` line is not decoration. Because `captureSnapshot` reads
the live tables when it runs, an implementation that writes its mutation before
calling `advanceHead` captures a **post**-mutation image and labels it
`PRE_MUTATION`. Four HIGH call sites did exactly that; see C12.6 and GAP-024.

A single head row serialises every head-advancing mutation on the novel
regardless of how the CAS is written — the `UPDATE` would take the same row
lock — so locking explicitly costs no concurrency and buys a deterministic
conflict. The null-safe comparison is what `IS NOT DISTINCT FROM` would give
in SQL; under the lock it is a plain comparison, because a `NULL` head and an
expected `NULL` are equal and every other pairing is a mismatch. A lost race
returns 409 and the caller re-reads rather than silently retrying, because a
silent retry would apply a plan built on a stale head.

The caller states the head it expects through the optional
`expectedHeadRevisionId` body field, whose three states are C12.1. As of
NF-WF-002D the four HIGH mutation routes carry it — `proposal.approve`,
`outlineVersion.approve`, `outline.supersede`, `chapters.import` — plus
`checkpoint.create`; `restore.apply` uses the server-pinned form. The comparison
is the locked one below; a separate unlocked pre-check (C12.1) refuses a stale
plan before it opens a transaction.

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

**Correction (NF-WF-002B).** The second bullet's "which is currently always
`null`" was an inference from a nullable schema, not an observation. The field
is `revisionId: z.string().min(1).nullable()` in
`packages/contracts/events.ts`, and no producer exists anywhere in the
repository, so no value is emitted at all. See C12.4; the original text is kept
because the error is itself part of the record.

## C12. Clarifications resolved after implementation (NF-WF-002B)

C1–C11 left five questions open and one of them concealed a defect. Each item
below is a disposition, not a description of what the code happens to do. Where
the code and this contract disagree, the disagreement is named and owned.

### C12.1 `expectedHeadRevisionId`: three distinct states

`AdvanceHeadInput.expectedHeadRevisionId` is `string | null | undefined`, and
all three mean something different. This is now contract, not an implementation
detail:

| Value | Meaning | Service behavior | HTTP |
|---|---|---|---|
| omitted (`undefined`) | "I assert nothing about the head." | The head is still read under `SELECT … FOR UPDATE`, because C4 requires the lock for number allocation; no comparison is made against a caller value. | 201 |
| `null` | "I assert no head exists yet." | Compared null-safely against the locked head: equal only to a `null` head. On a baselined novel this is a mismatch. | 409 |
| a uuid | "I assert the head is this revision." | Compared null-safely: equal only to that exact id. | 201, or 409 on mismatch |

Two things this separates, which C4's single sentence "head <> expected
(null-safe)" ran together:

1. **The client's expectation** — optional, caller-supplied, and the only input
   that can be absent. Collapsing `null` into `undefined` would make `null` mean
   both "no expectation" and "no head", so every checkpoint on a baselined novel
   would 409. The route preserves the distinction explicitly rather than letting
   `JSON.parse` erase it (`apps/api/src/revision-routes.ts`, the
   `=== undefined ? {} : {…}` spread).
2. **The locked head CAS** — never optional. It always runs, whether or not a
   caller supplied an expectation, because it is what makes the revision number
   and the head advance atomic with respect to each other (C4 reason 3). An
   omitted expectation suppresses the *comparison*, never the *lock*.

Refusal and concurrency behavior, as verified: a mismatched expectation is a
409 with no partial write (revision count unchanged, head unchanged), and two
connections contending for the same head serialize on the branch row lock — the
loser does not merely fail the comparison, it cannot reach the comparison until
the winner commits, and then fails it. Both are asserted in
`apps/api/src/revision.test.ts`.

**Closed 2026-10-03 by NF-WF-002D.** The four HIGH mutation routes now accept a
client head expectation, so C4's recovery path is reachable for mutations:
`proposal.approve`, `outlineVersion.approve`, `outline.supersede` and
`chapters.import`. Each takes the optional body field
`expectedHeadRevisionId: uuid.nullable().optional()` with exactly the tri-state
above, resolved through the same `AdvanceHeadInput` boundary. `restore.apply`
keeps its server-pinned form and is unchanged; `checkpoint.create` keeps its
existing client assertion. The route set is derived from
`impactFor(operation) === "HIGH"`, not hand-listed; three HIGH operations
(`ai.bulkRewrite`, `branch.merge`, `outline.bulkRewrite`) have no production
route yet and must carry the expectation when one lands.

A mismatch is a 409 whose body is `{ error: "CONFLICT", currentHeadRevisionId }`
— the head observed at refusal, `null` when the novel has no head. Both halves
of `applyRestore`'s mechanism are used on every one of the four: an unlocked
advisory pre-check before any write (so a stale plan does no work), and the
authoritative locked CAS inside the transaction. A pre-check-only implementation
is racy and is not what is deployed. Authorization and tenant gates run before
any head is disclosed, so a denied or cross-tenant caller learns nothing about
the head. Per-route receipts and the locked-CAS probe are in
`apps/api/src/revision.test.ts`.

**Historical (the state this closed).** Before NF-WF-002D, only the checkpoint
route (`POST …/checkpoints`) accepted a client head expectation. No C3 mutation
route did: `saveChapter` carried a per-chapter `expectedVersion`, and the other
mutation routes carried nothing. C4's rationale — "the caller re-reads rather
than silently retrying, because a silent retry would apply a plan built on a
stale head" — therefore could not be satisfied for a mutation, because the
caller had no way to state the head its plan was built against; the server could
never detect that case and would happily apply a plan from an older head. The
head CAS as implemented protected *internal* consistency (number allocation, no
lost revision, no torn interleave), which is real and tested; it did not provide
*mutation-level* optimistic concurrency. Recorded as **GAP-022**, now closed
with per-route negative receipts.

### C12.2 `checkpoint.create` is HIGH

C3's operation table does not list `checkpoint.create`, yet it must take the
head CAS and capture a snapshot. It is **HIGH**.

The earlier "LOW, with a checkpoint" reading was wrong, and the reason is worth
stating because the mistake is easy to repeat: it argued from *invalidation*
("a checkpoint mutates no story state, so it invalidates no projection") when
C3's class decides *capture*. The contract's own sentence is "The impact class
decides whether a checkpoint and snapshot are captured — it does not decide
whether a revision is recorded." An operation whose entire purpose is to capture
a snapshot is the clearest possible member of the capturing class. Classifying
it LOW would mean the one operation named "checkpoint" captures nothing unless a
caller remembers to pass `checkpoint` explicitly — a default that silently
produces an empty checkpoint.

`checkpoint.create` is HIGH by the same rule as the eight mutation operations
already in that class, but it is not one of them: it writes no covered table
(`tables: []`), so it queues no rebuild intent, and its `origin` is the
checkpoint `kind` (`MANUAL`) rather than `PRE_MUTATION`. HIGH here means
"captures a snapshot and takes the CAS", exactly as it does for the eight.

C3's table now names it. `impactFor` is unchanged: it already classified it
HIGH (`packages/story-versioning/impact.ts`), and
`packages/story-versioning/story-versioning.test.ts` already asserted it. This
item corrects the prose, not the code.

### C12.3 Checkpoint pinning: which revision a checkpoint hangs off

A checkpoint's `revisionId` is the revision whose state the snapshot captures.
The two capture paths pin differently, and the difference is forced by C10:

| Path | `pin` | Pinned revision | Snapshot contents |
|---|---|---|---|
| Explicit `createCheckpoint` | `NEW` | the revision this call creates | the state the author is marking, unchanged by the call |
| A HIGH mutation's mandatory capture | `PREVIOUS` | the head the mutation is about to change | the pre-mutation image |

C10 step 4 is what forces `PREVIOUS`: it says the HIGH checkpoint "is captured
**inside** the same transaction as the supersede" at R45 while the commit is
R46. The checkpoint therefore hangs off R45, and the newest revision (R46)
carries no checkpoint — it is the second-newest that does. Both pins are
asserted.

Snapshots are attached to the **pinned revision**, not to the revision being
created, and `snapshots.revisionId` is `@unique`. That uniqueness is what makes
reuse mandatory rather than optional: when a HIGH mutation's `PREVIOUS` pin
lands on a revision that an explicit checkpoint already captured, the capture
must reuse the existing snapshot instead of inserting a second one. Reuse is
safe because the head *is* that revision, so the state cannot have changed since
the first capture. Two checkpoints may therefore share one snapshot and one
`revisionId`; that is a supported shape with its own assertion, not a collision
to be avoided.

A checkpoint pins a revision on the same `main` branch. `novel_branches` is
deliberately not covered state (C1): it is the head pointer, and restore
advances it like any other mutation rather than rewinding it.

Worked example, consistent with restore and preserved history:

```text
R42 BASELINE (head)                               no checkpoint
R43 proposal created (LOW)                        no checkpoint
R44 explicit checkpoint "before the divergence"   pin NEW      → snapshot S1 @ R44
R45 proposal.approve (HIGH)                       pin PREVIOUS → reuses S1 @ R44
R46 applyRestore(S1) → origin RESTORE, parent R45
```

One revision per operation, including the LOW one: `R43` is the proposal's
own revision, and it is why the explicit checkpoint at `R44` — not at `R43` —
is the one the approve's `PREVIOUS` pin lands on.

The order matters, and the first version of this example had it wrong: a LOW
operation advances the head too (C3 — "both classes cross the mutation
boundary"), so a LOW step between the explicit checkpoint and the HIGH mutation
would move the head off the revision that holds `S1` and the `PREVIOUS` pin
would land on a revision with no snapshot. Reuse is reached only when the
explicit checkpoint's revision **is** the head the HIGH mutation is about to
change — which is exactly the shape `revision.test.ts` exercises ("reuses one
snapshot when a HIGH checkpoint pins a revision that already has one": proposal
created, explicit checkpoint, then approve).

`previewRestore` on the `R44` checkpoint reports the `R45` approval's rows as
*added* per covered table. Apply rewinds covered state to `R44`, leaves `R45`
readable as a revision, and lands `R46`. The approval is undone and its history
is not.

**This example was aspirational until the GAP-024 fix (2026-10-02, now closed).** It is written against the
intended ordering. Before GAP-024 was fixed, `proposal.approve` captured its
`PRE_MUTATION` snapshot *after* its writes (C12.6), so the real `R45` step
captured a *post*-approval image and the apply above would not have undone the
approval. The ordering is now correct at all four HIGH sites, so the walkthrough
above describes what actually happens. (The reuse step was never affected by the
defect: `captureSnapshot` is called **only** in the
`else` branch at `revisions.ts:391`, i.e. only when the
`tx.snapshot.findUnique({ where: { revisionId: pinnedRevisionId } })` lookup at
`:384` returns nothing. On the reuse path the capture never runs, so the defect
can corrupt the *image* of a newly created snapshot but never *which* revision a
snapshot attaches to. That is why the reuse test stays green.)

### C12.4 Event revision provenance: no producer, so no claim

C11's aside that `events.ts`'s `revisionId` is "currently always `null`" is
**withdrawn**. The schema is `z.string().min(1).nullable()`; a nullable field
permits `null`, it does not prove `null` is ever emitted. Inspection shows the
stronger fact: `domainEventSchema` has **no producer and no consumer** anywhere
in the repository. `packages/contracts/index.ts` re-exports it and
`packages/contracts/boundaries.test.ts` asserts `DOMAIN_EVENT_NAMES` matches
`SYSTEM-ARCHITECTURE.md`; that is the whole of its use. `domain_outbox` is named
in `DATA-MODEL-BLUEPRINT.md` and does not exist in the schema.

So there is no integration to claim, in either direction, and nothing in the M1
revision foundation emits or consumes a domain event. `revisionId` is
**future requirement**, not existing contract and not implemented behavior.

When a producer lands, the requirement is: a versioned mutation's event carries
the revision that mutation created, and a system-initiated event may carry
`null` (the schema already says so). That producer does not exist, and its
design — including whether events travel through a `domain_outbox` table in the
mutation transaction, which would put them under C6's atomicity rule — is
unassigned. Recorded as **GAP-023**; no code was changed and `events.ts` was not
edited.

### C12.5 Test file naming: the convention holds

`packages/story-versioning/story-versioning.test.ts` follows the repository's
convention, so there is no drift to close. Evidence: package test files are
named after their subject, not after `index.ts` — `packages/narrative-rhythm/`
(the layout C11 says to copy) has `rhythm.test.ts` and `scale.test.ts` for
`rhythm.ts` and `scale.ts`; `packages/story-intelligence/` has `canon.test.ts`
and `events.test.ts`; `packages/retrieval/` has `chunk.test.ts`, `fuse.test.ts`
and `spoiler.test.ts`. No package has an `index.test.ts`, and none names its
suite after the package where a more specific subject exists. The file covers
`impact.ts` and `snapshot.ts` together, so the package name is the honest
subject.

The naming subitem is closed. It was never the substantive question — the
semantic questions are C12.1–C12.4 and the defect below.

### C12.6 Defect found by this review: HIGH snapshots are captured too late

> **FIXED 2026-10-02 by NF-WF-002C (reviewed, APPROVED; GAP-024 closed).** All four call sites below now call
> `advanceForMutation` **before** their first covered-table write, the status
> CAS included, and each gained the payload-content assertion this section asked
> for — proven to fail against the old ordering and pass against the new, one
> receipt per site. `canon.ts` resolves the `fact.id` dependency by minting the
> uuid client-side (`randomUUID()`) and passing `id: factId` to the create, so
> the supersede → insert → link → decide order is unchanged. **Limitation:**
> `PRE_MUTATION` checkpoints written before this fix keep their post-mutation
> images and are deliberately **not** rewritten — rewriting a historical
> snapshot is a destructive act against the record it preserves. Treat any
> checkpoint created before 2026-10-02 as unusable for undo. The analysis below
> is preserved as the defect's record, and the earlier drafts it corrects are
> kept rather than deleted, because a contract that quietly rewrites its own
> wrong instructions cannot be audited.

**This is a real implementation defect, found by probing the running system
rather than by reading the contract, and it is not fixed here** — NF-WF-002B's
scope forbids production code changes. It is recorded as **GAP-024** with a
bounded follow-up.

C4's statement order puts the snapshot insert *before* the mutation's own
writes:

```text
BEGIN
  SELECT head … FOR UPDATE
  INSERT revision
  UPDATE novel_branches SET head_revision_id
  INSERT change_set, change_set_items
  INSERT snapshot            -- HIGH only   <-- BEFORE the mutation
  INSERT checkpoint          -- HIGH only
  INSERT derived_rebuild_intents
  ... the mutation's own writes ...
COMMIT
```

`advanceHead`'s doc comment states the same requirement: it "MUST be called
inside the caller's transaction, before the caller's own writes". Four HIGH
call sites violated it — they wrote first and advanced afterwards. The table is
the **pre-fix** ordering, kept as the record of what was wrong:

| Operation | File | Ordering before the fix |
|---|---|---|
| `proposal.approve` | `apps/api/src/services/canon.ts` | supersede + fact create + proposal CAS, then `advanceForMutation` |
| `outlineVersion.approve` | `apps/api/src/services/planning.ts` | supersede + promote, then `advanceForMutation` |
| `outline.supersede` | `apps/api/src/services/planning.ts` | `updateMany`, then `advanceForMutation` |
| `chapters.import` | `apps/api/src/services/manuscript.ts` | chapter/version creates in the loop, then `advanceForMutation` |

All four are now **advance → first covered write**. Note that
`outline.supersede`'s `items` names the novelId rather than one version row (a
supersede with no approved version supersedes nothing), and `chapters.import`
uses a single advance for the whole import — not one per part — with its item
naming the novel for the same reason. The change-set item list does not affect
the capture; only the statement order does.

Four is the complete count, not a sample. C3 names eight HIGH mutation
operations, but only five are implemented: the four above plus `restore.apply`,
which is ordered correctly. `outline.bulkRewrite`, `branch.merge` and
`ai.bulkRewrite` have **no call site anywhere** under `apps/api/src/` — they
exist in the classifier and the contract only, so they cannot exhibit this
defect yet. That was verified by enumerating every `operation:` literal the
services pass to `advanceHead`/`advanceForMutation`, not by reading the four
files and assuming.

`captureSnapshot` reads the live tables at the moment it runs, so in each case
the "PRE_MUTATION" snapshot is a **post**-mutation image. Observed, not
inferred: approving a proposal on a novel with one ACTIVE `canon_facts` row
produced a `PRE_MUTATION` snapshot whose `canon_facts` payload held **2** rows —
the pre-approval fact *and* the fact the approval minted — against 1 row before
the approval. Applying that checkpoint restores the post-approval state:
`previewRestore` reported `canon_facts {added: 0, removed: 0, retained: 2}` and
apply left both facts ACTIVE. The author's "step back from this approval"
operation does nothing.

The existing suite cannot catch this. The one `PRE_MUTATION` assertion checks
`checkpoint.revisionId` (the *pin*, which is correct — `pin: "PREVIOUS"` reads
the head before the advance) and the snapshot's `revisionId`, `formatVersion`
and `byteSize > 0`. It never inspects the payload's contents, so a snapshot that
captures the wrong image passes every assertion. The pin being right is exactly
what makes the defect invisible: the metadata is correct and the data is not.

One consequence beyond the four call sites:

- **`withRevision` is correct, and that is the trap.** The shared
  `createWithRevision` helper calls `write(tx)` and *then* `advanceForMutation`,
  so every LOW operation routed through it is fine — LOW captures no snapshot,
  and its revision/change-set metadata describes the row it wrote. The helper is
  the reason the pattern looks uniform; the four HIGH sites each hand-rolled
  their ordering and put the advance last.

The fix is a bounded reordering: at each HIGH site, call `advanceForMutation`
**before the first covered-table write** — and that includes the status CAS.
This is the part an earlier draft of this section got wrong, so it is worth
stating precisely. `canonProposal.updateMany` writes `canon_proposals` and
`outlineVersion.updateMany` writes `outline_versions`; both tables are in
`COVERED_TABLE_NAMES` (`packages/story-versioning/snapshot.ts`), so a
same-transaction capture sees those uncommitted writes. An instruction to
"check the CAS first, then advance, then write" therefore still produces a
snapshot that is pre-mutation for `canon_facts` and **post**-mutation for
`canon_proposals` — a partial fix that a `canon_facts`-only assertion would
happily pass. The CAS must move after the advance.

That reordering is safe, and the earlier claim that it was not was also wrong:
a CAS that loses its race **throws inside the same transaction**, so the
rollback removes the checkpoint, the revision, the head move and the snapshot
together. There is no need to order the advance after the CAS to avoid
recording a checkpoint for a decision that did not happen — the transaction
boundary already guarantees it. If a precondition genuinely must be evaluated
before the advance, it has to be a **locked read** (`SELECT … FOR UPDATE`), not
an `updateMany`.

Two further constraints make this more than a move. `chapters.import` loops
over parts, so the advance must move outside the loop. And in `canon.ts` the
advance's `items` array names `fact.id`, which does not exist until the fact is
minted — so that site cannot simply be hoisted; it needs either a two-phase
write or the change-set items split from the capture. That is why it needs its
own task rather than a drive-by edit. The payload-content assertion is still the
test that would have caught it: assert the `PRE_MUTATION` snapshot's payload
holds the *pre*-approval rows for **every** table the operation touches, not
merely that a snapshot exists.
