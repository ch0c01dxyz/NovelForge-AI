# Data Model Blueprint

This is a logical blueprint, not the final migration. Normalize core
truth; use JSONB only where flexibility is intentional.

ADR-0013 brings minimum revisions/checkpoints forward to M1. Do not create
every table below merely to match this inventory. NF-WF-001 must define exact
checkpoint membership, baseline/backfill, stable cross-domain identities,
head/version concurrency, and revision-derived projection contracts before
implementation. Preserve existing immutable versions and supersede history.

## Platform

users, workspaces, memberships, novels, novel_settings

## Manuscript

chapters, chapter_versions, scenes, scene_versions, publication_states

## Planning

synopses, sagas, arcs, outline_nodes, outline_versions,
planning_horizons

## Narrative DNA

narrative_dna_profiles, narrative_policies

## Canon/world

entities, entity_aliases, canon_facts, canon_fact_sources,
canon_proposals, world_rules, locations, organizations, factions,
resources

## Character

characters, character_states, character_state_events,
character_knowledge, character_beliefs, character_arcs,
character_arc_milestones

## Relationship

relationships, relationship_states, relationship_events,
relationship_groups, relationship_group_members,
relationship_agreements, relationship_arcs

## Story intelligence

story_events, timeline_events, story_threads, story_thread_events,
story_promises, causal_edges, foreshadowing_items, story_health_findings

## Reputation/information

reputations, reputation_events, information_diffusion_events

## Simulation

settlements, settlement_states, innovations, technology_dependencies,
innovation_adoption, economy_states, political_states, conflict_states,
opponent_knowledge, historical_expectations, historical_divergences

## Endgame

ending_visions, ending_conditions, resolution_items,
callback_candidates, legacy_items, epilogue_plans

## Versioning

branches, revisions, change_sets, change_set_items, snapshots,
checkpoints, restore_operations, merge_proposals, merge_conflicts

NF-WF-001 fixes the M1 subset: `novel_branches`, `revisions`, `change_sets`,
`change_set_items`, `snapshots`, `checkpoints`, `restore_operations` and
`derived_rebuild_intents`. `merge_proposals` and `merge_conflicts` stay M6
(NF-WF-020) — M1 refuses selective and branch merges by name. Exact columns,
coverage membership, baseline migration, head CAS and restore semantics are in
[STORY-VERSIONING.md](../03-domain/STORY-VERSIONING.md) §Contract and
[ADR-0014](../adr/ADR-0014-revision-checkpoint-model.md).

`snapshots.revision_id` is `@unique`: a snapshot belongs to exactly one revision,
and a checkpoint hangs off the revision whose state it captured, never off the
revision its capture created. Two checkpoints may therefore share one snapshot —
the reuse is required by that constraint, not an optimization. Which revision a
checkpoint pins depends on the capture path; see
[STORY-VERSIONING.md](../03-domain/STORY-VERSIONING.md) §C12.3.

`domain_outbox` is named below and **does not exist** in `schema.prisma`. No
domain event producer or consumer exists in the repository either; the
`revisionId` field in `packages/contracts/events.ts` is a future requirement,
not wired behavior. See §C12.4 and GAP-023.

## AI

agents, agent_versions, skills, skill_versions, workflows,
workflow_versions, model_profiles, model_profile_bindings, gateways,
gateway_models, ai_generations, ai_attempts, prompt_templates,
prompt_versions

## Knowledge/RAG

references, reference_versions, chunks, embeddings, retrieval_audits

## Operations

jobs, audit_logs, domain_outbox, notifications

For durable chapter workflows, canonical changes and rebuild intent must
commit atomically; dispatching directly to Redis after commit without durable
intent is insufficient. An outbox or equivalent reviewed transactional job
record is required when this producer/consumer is implemented. Deduplicate
delivery by operation/source revision and record projection freshness.
The logical names above do not assert that those tables already exist.

NF-WF-001 fixes that record for M1 as `derived_rebuild_intents`, committed in
the mutation transaction, deduplicated by
`UNIQUE (projection, source_revision_id)`, with status PENDING/RUNNING/FRESH/
FAILED/STALE. Redis stays a delivery optimization the worker polls toward; the
API has no Redis client and a Redis outage must not fail a canonical commit.
See [STORY-VERSIONING.md](../03-domain/STORY-VERSIONING.md) §C6.

## Required data principles

-   workspace/novel ownership on all tenant-scoped records;
-   stable UUIDs;
-   optimistic version where concurrent authoring matters;
-   source/evidence links for claims and health findings;
-   soft deletion only where business semantics require it;
-   immutable revision/audit records;
-   indexes designed from query patterns, not added blindly.
