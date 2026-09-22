# Data Model Blueprint

This is a logical blueprint, not the final migration. Normalize core
truth; use JSONB only where flexibility is intentional.

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

## AI

agents, agent_versions, skills, skill_versions, workflows,
workflow_versions, model_profiles, model_profile_bindings, gateways,
gateway_models, ai_generations, ai_attempts, prompt_templates,
prompt_versions

## Knowledge/RAG

references, reference_versions, chunks, embeddings, retrieval_audits

## Operations

jobs, audit_logs, domain_outbox, notifications

## Required data principles

-   workspace/novel ownership on all tenant-scoped records;
-   stable UUIDs;
-   optimistic version where concurrent authoring matters;
-   source/evidence links for claims and health findings;
-   soft deletion only where business semantics require it;
-   immutable revision/audit records;
-   indexes designed from query patterns, not added blindly.
