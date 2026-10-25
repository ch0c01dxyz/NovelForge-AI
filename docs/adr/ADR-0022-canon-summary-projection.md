# ADR-0022: Canon summary projection — first registered intent pipeline

## Status

ACCEPTED — 2026-10-25. Supersedes ADR-0017 for the `canon` projection only.
(ADR-0018 is already assigned to author-selected model routing; this ADR was
drafted as "ADR-0018" in the implementation plan and renumbered on creation.)

## Context

ADR-0017 accepted the audit end-state for projections with no pipeline and
left per-projection opt-in open. The seven projections have no derived
artifacts, so a consumer alone would be a no-op. This ADR defines the first
real artifact and the exact lifecycle that makes its intents truthful.

## Decision

1. Artifact: `canon_summaries`, one row per `(novel_id, branch_id,
   source_revision_id)`, holding a bounded deterministic digest:
   entity count, fact counts by status, entity counts by kind, and the top
   20 predicates by active-fact count (ties by predicate ascending).
   No statements, no prose, no second truth: the digest is an index/health
   projection, never a canon source.
2. Derivation is as-of the source revision: entities and facts written before
   the next revision on the branch exists (`created_at < next.created_at`);
   at the branch head, everything written so far is included.
   `advanceHead` creates the revision row before the caller's writes and
   holds the branch lock until commit, so a mutation's own rows carry later
   timestamps than its revision; a `<= revision.created_at` bound would
   silently omit them (observed on acceptance 2026-10-25: 3 facts of the
   revision-300 application were excluded). Status counts are the current
   status of those rows (documented approximation, same posture as memory).
   The ordering assumption relies on Prisma stamping `now()` per statement;
   a raw-SQL or database-default writer of canon rows on this path would
   break it and requires revisiting the bound.
3. Lifecycle: the consumer claims the newest eligible `canon` intent per
   `(novel, branch)`, supersedes older eligible intents as `STALE`, rebuilds
   the digest at the claimed intent's source revision, and marks the intent
   `FRESH` or `FAILED`. `attempts` caps at 5 with exponential backoff.
4. Freshness is intent-based: `FRESH` iff a summary exists and no
   `PENDING`/`RUNNING`/`FAILED` canon intent for the same `(novel, branch)`
   has a source revision number greater than the summary's; `STALE` if one
   does; `MISSING` if no summary exists. Head advancement that did not
   invalidate canon does not stale the summary. This is the C6 staleness
   refinement recorded in the 2026-10-25 amendment.
5. Read/rebuild surface: `GET .../canon/summary` (`novel:read`) and
   `POST .../canon/summary/rebuild` (`novel:update`). The rebuild route
   rebuilds at the current branch head synchronously and is the recovery
   path after `FAILED` exhaustion or an intentional re-derive.
6. No canonical mutation, no Redis, no LLM call. A failed rebuild leaves the
   prior summary and a `FAILED` intent; it never reports FRESH.

## Consequences

- The `canon` intents become real rebuild work; the other six projections
  remain terminal audit until they register pipelines.
- Rebuild cost is bounded: two indexed aggregations plus one upsert.
- The digest is intentionally shallow; richer canon summaries need a new ADR.
- The rebuild API path is the recovery path: it writes the artifact at the
  branch head, so intents at or below that revision no longer make the read
  surface `STALE`. It still never writes `FRESH` onto an intent; the consumer
  owns intent transitions.

## Source and ownership repair — 2026-10-25

This amendment supersedes decision2's timestamp approximation. Review confirmed
that some canonical callers write rows before advancing the revision; timestamps
cannot assign those rows to a revision. Checkout also replaces the global live
tables, so filtering their creation times cannot reconstruct an inactive branch.

Rebuild now reads one RepeatableRead database view. Live canon is eligible only
when the requested revision is the checked-out branch's exact head. Otherwise it
requires the exact revision's tenant/novel/branch-scoped INLINE format1snapshot,
selecting only story_entities and canon_facts. Missing or malformed source fails
explicitly without replacing the previous summary. Historical status values come
from that snapshot, not current rows. No complete manuscript is loaded.

Worker claims compare the observed attempt. Artifact publication locks that exact
RUNNING claim and commits the handler's database writes and FRESH transition in
one bounded30second RepeatableRead transaction. Lost owners cannot publish;
FAILED updates also compare the attempt. Registered handlers must use the supplied
transaction client and perform database work only, not provider or human calls.
Overlapping local ticks share one sweep; shutdown drains it before disconnecting.

The artifact's size remains bounded to20predicates; rebuild input is proportional
to the canon rows in the selected source. The earlier "two indexed aggregations"
description was inaccurate: the implementation reads projected fields and folds
them in memory. This is not a measured constant-cost or full-load claim.
