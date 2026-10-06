/**
 * @novelforge/story-versioning — dependency edges for selective restore (NF-WF-020A).
 *
 * A dependency edge `dependent -> referenced via <column>` means rows of the
 * `dependent` covered table hold a foreign key (`via`, a DATABASE column name)
 * to rows of the `referenced` covered table. Selective restore (020A) uses
 * this table to compute the dependency closure of a selection and to report
 * ORPHAN_REFERENCE / STALE_DEPENDENT conflicts for dependents outside the
 * selection.
 *
 * The table is derived from the Prisma schema's FK relations between covered
 * tables (see the 020A contract's backend verification). Excluded:
 * - `novel_id` scoping edges (novel membership, not a story dependency);
 * - the C7 manuscript pointer (`chapters.current_version_id ->
 *   chapter_versions`, managed by C7 step 4, never in a selective scope).
 *
 * `semantic: true` marks the 9 contract-pinned semantic edges (020A
 * §"Dependency analysis" step 1b). They are a subset of the FK edges,
 * marked explicitly because the 020A acceptance fixtures pin them.
 *
 * `onDelete` is the Prisma relation's delete behavior, which the selective
 * apply needs: Restrict dependents must be removed with consent before the
 * referenced row can be deleted; Cascade dependents go with it; SetNull
 * dependents survive with a nulled FK.
 */
export interface DependencyEdge {
  /** Covered table holding the FK. */
  readonly dependent: string;
  /** Covered table being referenced. */
  readonly referenced: string;
  /** DATABASE column on `dependent` holding the FK. */
  readonly via: string;
  /** Prisma onDelete behavior for this relation. */
  readonly onDelete: "Cascade" | "Restrict" | "SetNull" | "NoAction";
  /** One of the 9 contract-pinned semantic edges. */
  readonly semantic: boolean;
}

export const DEPENDENCY_EDGES: readonly DependencyEdge[] = [
  { dependent: "antagonists", referenced: "characters", via: "character_id", onDelete: "Cascade", semantic: false },
  { dependent: "bond_members", referenced: "bonds", via: "bond_id", onDelete: "Cascade", semantic: true },
  { dependent: "bond_members", referenced: "characters", via: "character_id", onDelete: "Cascade", semantic: false },
  { dependent: "bond_transitions", referenced: "bonds", via: "bond_id", onDelete: "Cascade", semantic: true },
  { dependent: "canon_application_items", referenced: "canon_applications", via: "application_id", onDelete: "Cascade", semantic: false },
  { dependent: "canon_application_items", referenced: "canon_facts", via: "canon_fact_id", onDelete: "SetNull", semantic: true },
  { dependent: "canon_application_items", referenced: "canon_facts", via: "conflicts_with_fact_id", onDelete: "SetNull", semantic: false },
  { dependent: "canon_application_items", referenced: "story_entities", via: "entity_id", onDelete: "Restrict", semantic: false },
  { dependent: "canon_application_items", referenced: "story_entities", via: "object_entity_id", onDelete: "Restrict", semantic: false },
  { dependent: "canon_fact_sources", referenced: "canon_facts", via: "canon_fact_id", onDelete: "Cascade", semantic: true },
  { dependent: "canon_fact_sources", referenced: "chapter_versions", via: "chapter_version_id", onDelete: "Restrict", semantic: false },
  { dependent: "canon_facts", referenced: "canon_facts", via: "superseded_by_id", onDelete: "SetNull", semantic: false },
  { dependent: "canon_facts", referenced: "story_entities", via: "entity_id", onDelete: "Restrict", semantic: false },
  { dependent: "canon_facts", referenced: "story_entities", via: "object_entity_id", onDelete: "Restrict", semantic: false },
  { dependent: "canon_proposals", referenced: "canon_facts", via: "canon_fact_id", onDelete: "SetNull", semantic: true },
  { dependent: "canon_proposals", referenced: "canon_facts", via: "conflicts_with_fact_id", onDelete: "SetNull", semantic: false },
  { dependent: "canon_proposals", referenced: "story_entities", via: "entity_id", onDelete: "Cascade", semantic: false },
  { dependent: "canon_proposals", referenced: "story_entities", via: "object_entity_id", onDelete: "Cascade", semantic: false },
  { dependent: "causal_edges", referenced: "story_events", via: "cause_event_id", onDelete: "Cascade", semantic: false },
  { dependent: "causal_edges", referenced: "story_events", via: "effect_event_id", onDelete: "Cascade", semantic: false },
  { dependent: "chapter_versions", referenced: "chapters", via: "chapter_id", onDelete: "Cascade", semantic: false },
  { dependent: "character_arc_milestones", referenced: "character_arcs", via: "arc_id", onDelete: "Cascade", semantic: false },
  { dependent: "character_arcs", referenced: "characters", via: "character_id", onDelete: "Cascade", semantic: false },
  { dependent: "character_knowledge", referenced: "canon_facts", via: "fact_id", onDelete: "Restrict", semantic: true },
  { dependent: "character_knowledge", referenced: "characters", via: "character_id", onDelete: "Cascade", semantic: false },
  { dependent: "character_states", referenced: "characters", via: "character_id", onDelete: "Cascade", semantic: false },
  { dependent: "characters", referenced: "story_entities", via: "story_entity_id", onDelete: "SetNull", semantic: false },
  { dependent: "final_text_reviews", referenced: "chapter_versions", via: "chapter_version_id", onDelete: "Cascade", semantic: false },
  { dependent: "meaningful_interactions", referenced: "bonds", via: "bond_id", onDelete: "Cascade", semantic: false },
  { dependent: "outline_nodes", referenced: "chapters", via: "chapter_id", onDelete: "Cascade", semantic: true },
  { dependent: "outline_nodes", referenced: "sagas", via: "saga_id", onDelete: "Cascade", semantic: false },
  { dependent: "outline_nodes", referenced: "scenes", via: "scene_id", onDelete: "Cascade", semantic: false },
  { dependent: "publications", referenced: "chapter_versions", via: "chapter_version_id", onDelete: "Restrict", semantic: false },
  { dependent: "publications", referenced: "chapters", via: "chapter_id", onDelete: "Cascade", semantic: false },
  { dependent: "relationship_stances", referenced: "characters", via: "from_character_id", onDelete: "Cascade", semantic: false },
  { dependent: "relationship_stances", referenced: "characters", via: "to_character_id", onDelete: "Cascade", semantic: false },
  { dependent: "sagas", referenced: "sagas", via: "parent_id", onDelete: "Cascade", semantic: false },
  { dependent: "scenes", referenced: "chapters", via: "chapter_id", onDelete: "Cascade", semantic: false },
  { dependent: "story_events", referenced: "chapters", via: "chapter_id", onDelete: "Restrict", semantic: false },
  { dependent: "story_thread_events", referenced: "story_events", via: "event_id", onDelete: "Cascade", semantic: false },
  { dependent: "story_thread_events", referenced: "story_threads", via: "thread_id", onDelete: "Cascade", semantic: true },
  { dependent: "timeline_events", referenced: "story_events", via: "story_event_id", onDelete: "SetNull", semantic: true },
];

/** Edges whose `referenced` table is `table` (i.e. dependents of `table`). */
export function edgesForReferenced(table: string): DependencyEdge[] {
  return DEPENDENCY_EDGES.filter((e) => e.referenced === table);
}

/** Edges whose `dependent` table is `table`. */
export function edgesForDependent(table: string): DependencyEdge[] {
  return DEPENDENCY_EDGES.filter((e) => e.dependent === table);
}

/**
 * The pinned DOMAIN vocabulary (020A §"Selective scope vocabulary").
 * 33 covered tables mapped; `memory_projections`, `final_text_reviews`,
 * and `publications` belong to no domain and are never rewound by
 * DOMAIN scope (derived / audit / non-story-state).
 */
export const SELECTIVE_DOMAINS = {
  canon: [
    "story_entities",
    "canon_facts",
    "canon_fact_sources",
    "canon_proposals",
    "canon_applications",
    "canon_application_items",
  ],
  character: [
    "characters",
    "character_states",
    "character_knowledge",
    "character_arcs",
    "character_arc_milestones",
  ],
  relationship: [
    "relationship_stances",
    "bonds",
    "bond_members",
    "bond_transitions",
    "meaningful_interactions",
  ],
  narrative: ["narrative_dna_profiles", "narrative_policies", "antagonists"],
  planning: [
    "synopses",
    "sagas",
    "outline_nodes",
    "outline_versions",
    "planning_horizons",
    "scenes",
  ],
  intelligence: [
    "story_promises",
    "story_threads",
    "story_thread_events",
    "timeline_events",
    "story_events",
    "causal_edges",
  ],
  manuscript: ["chapters", "chapter_versions"],
} as const;

export type SelectiveDomainName = keyof typeof SELECTIVE_DOMAINS;
export const SELECTIVE_DOMAIN_NAMES = Object.keys(SELECTIVE_DOMAINS) as SelectiveDomainName[];

/** Covered tables no DOMAIN scope ever rewinds. */
export const DOMAIN_UNMAPPED_TABLES = [
  "memory_projections",
  "final_text_reviews",
  "publications",
] as const;
