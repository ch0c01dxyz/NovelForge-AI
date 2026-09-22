# Story Versioning, Checkpoints & Recovery

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
