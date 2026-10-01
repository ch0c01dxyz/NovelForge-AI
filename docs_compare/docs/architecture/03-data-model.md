# Data Model Blueprint

## Identity and authorization
- users
- roles
- permissions
- user_roles
- role_permissions
- audit_logs

## Novel domain
- novels
- novel_members
- chapters
- chapter_versions
- scenes
- scene_versions
- characters
- character_relationships
- locations
- factions
- items
- world_rules
- lore_entries
- timeline_events
- story_arcs
- plot_points
- story_beats

## Knowledge
- knowledge_documents
- knowledge_chunks
- knowledge_facts
- embeddings
- references
- reference_versions

## AI
- agents
- agent_versions
- skills
- skill_versions
- agent_skills
- agent_references
- agent_knowledge_policies
- prompt_templates
- prompt_versions
- workflows
- workflow_versions
- workflow_nodes
- workflow_edges
- model_profiles

## Gateway
- ai_gateways
- gateway_models
- model_registry
- gateway_health_checks
- gateway_usage
- routing_policies
- routing_rules

## Generation and evaluation
- ai_requests
- ai_generations
- ai_generation_steps
- ai_generation_context
- ai_evaluations

## Reader/social
- comments
- likes
- bookmarks
- follows
- notifications

## Versioning
Every versioned entity should preserve:
- version number
- created_at
- created_by where meaningful
- status
- parent/base version where useful
- change metadata

## Chapter statuses
- DRAFT
- IN_REVIEW
- SCHEDULED
- PUBLISHED
- UNPUBLISHED
- ARCHIVED

Published chapter content must be immutable from the perspective of historical versions.

## Canon status
Support:
- PROPOSED
- APPROVED
- REJECTED
- CANON

Major AI-extracted facts should not become canonical silently.
