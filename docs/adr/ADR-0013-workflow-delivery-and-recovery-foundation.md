# ADR-0013: Deliver complete workflows on an early recovery foundation

## Status

Accepted for implementation planning, 2026-09-30, following the author's
instruction to apply the workflow comparison recommendations. This ADR
changes the target architecture and delivery order; it does not claim the
corresponding runtime changes have shipped.

Partially supersedes ADR-0008 §4 and its hierarchical-memory deferral:
minimum revisions/checkpoints are pulled forward instead of waiting for
the whole of Phase 11. Supersedes ADR-0006's temporary deferrals of durable
execution and approval continuation. All other canon, authorization,
definition-versioning, and graph-validation decisions remain in force.

## Context

The generic workflow executor, canon services, planning, character state,
and rhythm rules exist, but the author journey does not connect them all.
Direct generation retrieves facts/references without automatically resolving
chapter outline/state; HUMAN_APPROVAL parks without resume. Extraction,
chapter memory, public reader access, and several writer surfaces remain open.

Deferring revisions until Phase 11 also defers safe memory invalidation,
while Phase 10 would add more mutable story state. The roadmap's early MVP
already requires basic checkpoints. Component test success cannot establish
that an author can complete a chapter and safely use its consequences next.

## Decision

Deliver one complete chapter workflow before advanced simulation. Preserve
phase numbers as capability categories; use dependency-ordered delivery
milestones to schedule integration and retained original requirements.

1. Introduce a minimum immutable Revision/Change Set and consistent
   checkpoint boundary before integrated canonical mutation or consolidation.
   Initial scope must explicitly cover canon, planning, character/relationship
   state, story events/timeline/threads/promises, and narrative policies used
   by the chapter workflow. Manuscript version pins participate in snapshots.
   Unsupported domains must be visible and must block a purported full restore.
2. Keep existing immutable versions and canon supersede history. Use
   relational state plus a change log and reconstructable snapshots, not a
   rewrite to pure event sourcing. Bind new mutations to a novel/branch head
   with optimistic concurrency; define cross-domain atomicity in NF-WF-001.
3. Capture source revision, chapter/outline versions, agent/skill/workflow
   versions, context, and request identity before the first model attempt.
   Direct chapter generation and chapter workflow steps share context rules.
4. Persist execution state. Resume an approved run from its unfinished step
   after reauthorization and stale-source checks. Use existing BullMQ for
   long-running work; database state is authoritative for job recovery.
5. Treat text acceptance, canon proposal approval, and publication as separate
   decisions. LLM extraction creates evidence-bearing proposals only.
6. Commit canonical changes and durable invalidation/rebuild intent together.
   Run blocking validators before commit. Run expensive advisory checks and
   rebuild jobs after commit, recording pending/stale/failed projections.
7. Bring writer controls and a minimal public reader into explicit delivery
   gates. Preserve rich editing, format support, admin, and social requirements
   in the capability ledger instead of silently dropping them.

## Migration and recovery

NF-WF-001 must specify keys, membership of a consistent checkpoint, stable
identity links between story entities and character records, concurrency,
projection source markers, and API contracts before schema implementation.

For existing novels, establish a labeled baseline from a consistent database
snapshot. Preserve all historical versions, facts, and audit rows; do not
fabricate pre-baseline revisions or claim pre-baseline full restore support.
Backfill provenance only where evidence exists; unknown provenance remains
explicit. Test populated-database upgrade and empty-database installation.

Restore creates a new revision. It preserves subsequent history and marks
affected manuscript/retrieval projections for compatibility review or rebuild.
Story restore must not revert accounts, permissions, credentials, or public
publication pointers. Those have independent authorized workflows.

Rollout must fail closed for unsupported high-impact mutations. A failed
required checkpoint aborts the mutation. Feature disablement may stop new
writes but cannot delete revisions or require destructive down-migrations.
Backups and tested restore procedures remain separate operational controls.

## Alternatives

- Continue directly to simulation: rejected because it expands mutable state
  before recovery and the first author workflow are complete.
- Return to the original architecture: rejected because V2's canon,
  knowledge-boundary, causality, and recovery invariants are necessary.
- Build all advanced branching/semantic merge now: rejected; a constrained,
  verified checkpoint/restore slice is sufficient for the first workflow.
- Build another workflow engine: rejected; extend the existing versioned DAG
  executor and transport services with explicit contracts.

## Consequences and verification

Minimum recovery and durable continuation become prerequisites rather than
late hardening. Work is more connected, but checkpoint scope and migration
design must be reviewed before writing data. No distributed services or new
LLM provider dependency is implied.

Acceptance: pinned outline/state reaches generation; approval survives a
restart; duplicate delivery cannot duplicate canonical writes; rejected
proposals never become canon; accepted changes inform the next chapter;
restore preserves history; stale projections never masquerade as fresh;
non-member readers see only an explicitly published version.

See [delivery plan](../implementation/DELIVERY-PLAN.md),
[core workflows](../07-workflows/CORE-WORKFLOWS.md), and
[testing gates](../10-testing/TESTING.md).
