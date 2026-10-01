# ADR-0014: Revision, checkpoint and rebuild-intent model

## Status

Accepted for implementation planning, 2026-10-01. Produced by NF-WF-001
(design contract). No runtime code, migration or schema exists yet; NF-WF-002
implements it.

Realises [ADR-0013](ADR-0013-workflow-delivery-and-recovery-foundation.md)
§1–§2, §6 and its migration/recovery section, which required keys, checkpoint
membership, stable identity links, concurrency and projection source markers
to be specified before schema work. It does not supersede ADR-0008 (canon
supersede history stays intact and is a member of the checkpoint), ADR-0007
(derived retrieval stays derived), or ADR-0006 (workflow definitions stay
append-only versioned).

## Context

ADR-0013 pulls minimum revisions/checkpoints forward to M1 but left the model
open. Inspection of the current tree (`apps/api/src/services/`, 18 migrations,
`schema.prisma`) established these facts:

- No revision, checkpoint, snapshot or branch table exists. `packages/
  story-versioning/index.ts` is `export {}`. `packages/contracts/events.ts`
  carries a `revisionId` field that nothing populates.
- Recovery today is three unrelated mechanisms: `chapter_versions` (immutable
  per-chapter), the `canon_facts.supersededById` chain, and `outline_versions`
  status flips. None is cross-domain and none can restore a consistent
  boundary.
- Concurrency today is per-row: `saveChapter`/`restoreVersion` take
  `SELECT … FOR UPDATE` on the chapter row; `approveOutlineVersion` and
  `advanceAntagonistStage` use a status/stage predicate as a
  compare-and-set. There is no novel-wide head.
- 31 tables hold chapter-consumed story state. Snapshotting all of them per
  mutation is not viable; snapshotting none is what we have.
- Redis is reached only through `apps/worker`'s BullMQ heartbeat. No
  production job producer exists, and the API has no Redis client. Any design
  that requires Redis at commit time would make a canonical write depend on a
  cache being up.

## Decision

1. **Per-novel branch head with compare-and-set.** A novel has one `main`
   branch. `novel_branches.head_revision_id` is the mutable optimistic
   pointer; every covered mutation CASes it inside its transaction and a
   mismatch is a 409. The head is read under `SELECT … FOR UPDATE` first,
   because `head_revision_id` is a non-deferrable FK to `revisions(id)` and
   `UNIQUE (branch_id, number)` would otherwise turn a lost race into a
   constraint violation instead of the promised conflict. This is the
   `saveChapter` row-lock pattern combined with the `advanceAntagonistStage`
   comparison, generalised from a row to a novel — not a new concurrency
   mechanism.

2. **Relational state plus a change log plus reconstructable snapshots.**
   ADR-0013 §2 rejected pure event sourcing. Therefore:
   - `revisions` + `change_sets` + `change_set_items` record *what changed*
     (entity type, entity id, operation) for audit, impact analysis and
     preview/diff. They deliberately do NOT store before-images.
   - `snapshots` stores the reconstructable state that restore actually
     replays. A snapshot is a versioned JSONB document, not a `pg_dump`.

   This is the deliberate ceiling: the item log is an index, the snapshot is
   the truth. Storing before-images would duplicate every covered table and
   was rejected.

3. **Snapshots are captured inside the mutation transaction.** A checkpoint
   that cannot be written aborts the mutation by rolling back, which is
   ADR-0013's "checkpoint failure blocks high-impact mutation" satisfied by
   construction rather than by a compensating delete.

4. **Explicit coverage set, and unsupported scope is visible.** The covered
   set is enumerated in
   [STORY-VERSIONING.md](../03-domain/STORY-VERSIONING.md). Identity,
   authorization, credentials, platform AI configuration, agent/skill/
   workflow definitions, references/embeddings, and run history are outside
   it. Restore refuses rather than silently skipping, and the preview names
   the boundary.

5. **Publication is excluded from restore, not from the snapshot.** Snapshot
   fidelity needs `chapters`; author control needs publication to survive a
   restore. Restore therefore never writes `chapters.status` and never
   overwrites a PUBLISHED chapter's pointer; a skipped pointer is recorded in
   the restore change set and surfaced to the author as a conflict, not
   silently left inconsistent. The manuscript pair `chapters`/`chapter_versions`
   is updated in place rather than deleted, because `chapter_versions` is
   `ON DELETE CASCADE` from `chapters` and is immutable — deleting and
   re-inserting would destroy version history the model promises to keep.

6. **Durable rebuild intent is a table, not a Redis write.** Canonical
   mutation and `derived_rebuild_intents` rows commit in one transaction.
   Redis is a delivery optimization the worker polls toward; it is never the
   record. With Redis down, the API still commits and the intent row stays
   PENDING. Deduplication is `UNIQUE(projection, source_revision_id)`.

7. **Stable joins are explicit nullable FKs, never name matching.** The
   `characters` ↔ `story_entities` link and the `timeline_events` ↔
   `story_events` link are nullable FKs backfilled to NULL. Unknown provenance
   stays unknown; no backfill guesses.

8. **Baseline is created, not invented.** One `BASELINE` revision per existing
   novel, captured from a single consistent snapshot. Pre-baseline restore is
   refused by name. Historical versions, supersede chains and audit rows are
   preserved untouched.

## Alternatives

- **Pure event sourcing / full before-image change log.** Rejected by
  ADR-0013 §2 and by cost: it duplicates 31 tables and rewrites every existing
  service.
- **Snapshot everything on every write.** Rejected: the capture cost is
  proportional to the whole novel on a per-save path.
- **Snapshot nothing, replay the change log.** Rejected: without before-images
  the log cannot reconstruct state, and adding them is alternative one.
- **A global (cross-novel) revision head.** Rejected: it serialises unrelated
  novels and contradicts the per-tenant boundary. The head is per novel.
- **Reuse `audit_logs` as the change log.** Rejected: audit rows are
  best-effort and written outside the mutation transaction; a revision record
  must be transactional and must be readable as a boundary.
- **Require Redis for rebuild dispatch.** Rejected: it makes a canonical commit
  fail when a cache is down, and the worker's own heartbeat already treats
  Redis as optional.
- **Store snapshots in object storage.** Deferred, not rejected: `snapshots`
  carries a `storage` discriminator so an external store can be added without
  a schema change when measured snapshot size demands it.

## Consequences and verification

New tables and one nullable column set; no existing table is rewritten and no
existing service's semantics change. Every covered mutation gains one head CAS
and, for high-impact classes, one snapshot write inside its existing
transaction.

Cost is honest and bounded: a snapshot is O(covered rows) for the novel, so
capture is confined to high-impact classes and pre-generation checkpoints, not
to autosave. If that proves slow, the `storage` discriminator is the escape
hatch.

Acceptance is NF-WF-002 and TESTING gate G-01: empty and populated migration;
consistent cross-domain checkpoint; concurrent-head conflict; failed-checkpoint
refusal; restore creates a new revision and preserves later history.

See [STORY-VERSIONING.md](../03-domain/STORY-VERSIONING.md) for the contract,
[NF-WF-002](../../tasks/NF-WF-002-revision-foundation.md) for the work, and
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md) GAP-004/GAP-011.
