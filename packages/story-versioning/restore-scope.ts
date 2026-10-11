/**
 * @novelforge/story-versioning — restore-scope classification (NF-WF-032 / GAP-004).
 *
 * Every Prisma model is classified into exactly one restore-scope class.
 * The classification documents *intent*: which tables a FULL restore
 * rewinds, which it deliberately leaves alone, and why. It does NOT
 * re-scope restore — the REWOUND set must equal `COVERED_TABLES` with
 * `restoreTarget: true`, and PINNED must equal `COVERED_TABLES` with
 * `restoreTarget: false` (asserted by the completeness test).
 *
 * Pure module (ADR-0001): no Prisma, no HTTP, no provider import.
 */

/** The seven restore-scope classes (NF-WF-032 contract). */
export type RestoreScopeClass =
  | "REWOUND"
  | "PINNED"
  | "OPERATIONAL"
  | "DERIVED"
  | "CONFIGURATION"
  | "SIMULATION"
  | "REFERENCE";

/** One-line rationale per class. */
export const RESTORE_SCOPE_CLASS_RATIONALE: Record<RestoreScopeClass, string> = {
  REWOUND:
    "Story state rewound by FULL restore (COVERED_TABLES with restoreTarget: true).",
  PINNED:
    "Covered but never rewound: manuscript and release lifecycle (C7, Invariant 8).",
  OPERATIONAL:
    "Execution history and audit trail — never rewritten by a story-state restore.",
  DERIVED:
    "Rebuildable derivations, never truth — outside restore scope entirely.",
  CONFIGURATION:
    "Platform/novel configuration — not versioned, not story state.",
  SIMULATION:
    "Branch-isolated simulation state (NF-WF-027) — a story restore must not rewind it.",
  REFERENCE:
    "Author-curated sources — inputs to the story, not story state.",
};

/**
 * Every Prisma model's table name → exactly one restore-scope class.
 *
 * Table names are DATABASE names (snake_case), matching `COVERED_TABLES`
 * keys and `@@map` values in the Prisma schema.
 *
 * REWOUND (33) must equal COVERED_TABLES with restoreTarget: true.
 * PINNED (3) must equal COVERED_TABLES with restoreTarget: false.
 */
export const RESTORE_SCOPE_CLASS: Readonly<Record<string, RestoreScopeClass>> = {
  // REWOUND (33) — story state, rewound by FULL restore.
  story_entities: "REWOUND",
  characters: "REWOUND",
  antagonists: "REWOUND",
  bonds: "REWOUND",
  bond_members: "REWOUND",
  bond_transitions: "REWOUND",
  canon_facts: "REWOUND",
  canon_fact_sources: "REWOUND",
  canon_proposals: "REWOUND",
  canon_applications: "REWOUND",
  canon_application_items: "REWOUND",
  story_events: "REWOUND",
  causal_edges: "REWOUND",
  character_arcs: "REWOUND",
  character_arc_milestones: "REWOUND",
  character_knowledge: "REWOUND",
  character_states: "REWOUND",
  meaningful_interactions: "REWOUND",
  narrative_dna_profiles: "REWOUND",
  narrative_policies: "REWOUND",
  sagas: "REWOUND",
  scenes: "REWOUND",
  outline_nodes: "REWOUND",
  outline_versions: "REWOUND",
  planning_horizons: "REWOUND",
  relationship_stances: "REWOUND",
  story_promises: "REWOUND",
  story_threads: "REWOUND",
  story_thread_events: "REWOUND",
  synopses: "REWOUND",
  timeline_events: "REWOUND",
  memory_projections: "REWOUND", // Covered but never truth — dropped when pinned newer than R (009 rule).
  final_text_reviews: "REWOUND", // Covered; receipts, never truth — a re-review regenerates (010).

  // PINNED (3) — covered, never rewound.
  chapters: "PINNED", // Manuscript — never deleted, never re-inserted (C7).
  chapter_versions: "PINNED", // Append-only; restoring a pointer would rewrite authorship history.
  publications: "PINNED", // Release lifecycle — restore must not unpublish (Invariant 8).

  // OPERATIONAL (32) — execution history and audit trail.
  workflow_runs: "OPERATIONAL",
  workflow_step_runs: "OPERATIONAL",
  workflow_versions: "OPERATIONAL",
  workflow_approval_decisions: "OPERATIONAL",
  generations: "OPERATIONAL", // AI ledger — auditable history, never rewound.
  generation_attempts: "OPERATIONAL",
  notifications: "OPERATIONAL",
  notification_preferences: "OPERATIONAL",
  audit_logs: "OPERATIONAL", // Append-only audit fact (ADR-0004).
  restore_operations: "OPERATIONAL", // The restore machinery itself — never its own target.
  retrieval_audits: "OPERATIONAL",
  sessions: "OPERATIONAL",
  comments: "OPERATIONAL",
  comment_reports: "OPERATIONAL",
  chapter_likes: "OPERATIONAL",
  bookmarks: "OPERATIONAL",
  novel_follows: "OPERATIONAL",
  author_follows: "OPERATIONAL",
  change_sets: "OPERATIONAL",
  change_set_items: "OPERATIONAL",
  derived_rebuild_intents: "OPERATIONAL",
  revisions: "OPERATIONAL", // The restore machinery itself — rewinding it is self-referential.
  scale_evidence_sets: "OPERATIONAL", // SCALE evidence history — auditable, never rewound (050A).
  scale_decision_proposals: "OPERATIONAL", // S2 author decision proposals — auditable history, never rewound (050B).
  scale_decision_outcomes: "OPERATIONAL", // S2 author decision outcomes — auditable history, never rewound (050B).
  scale_s3_proposals: "OPERATIONAL", // S3 untrusted AI suggestion proposals — inert auditable history, never rewound (050C).
  snapshots: "OPERATIONAL",
  checkpoints: "OPERATIONAL",
  reading_progress: "OPERATIONAL", // Per-user state, never story state.
  endgame_ledger: "OPERATIONAL", // Provisional per contract Q1 — decision records, never rewound.
  endgame_gate_approval: "OPERATIONAL",
  endgame_legacies: "OPERATIONAL",
  endgame_callbacks: "OPERATIONAL",

  // DERIVED (2) — rebuildable, never truth.
  embeddings: "DERIVED", // RAG derivations recomputed from truth (ADR-0007).
  chunks: "DERIVED",

  // CONFIGURATION (15) — not versioned.
  novels: "CONFIGURATION", // Novel identity and slug — restore rewinds story state, not identity.
  novel_settings: "CONFIGURATION",
  novel_modules: "CONFIGURATION",
  novel_branches: "CONFIGURATION", // The head pointer itself — restore advances it like any mutation.
  users: "CONFIGURATION",
  memberships: "CONFIGURATION",
  workspaces: "CONFIGURATION",
  ai_gateways: "CONFIGURATION", // Platform provider configuration and credentials.
  ai_models: "CONFIGURATION",
  model_profile_mappings: "CONFIGURATION",
  skills: "CONFIGURATION", // Append-only versioned definition (ADR-0006).
  skill_versions: "CONFIGURATION",
  agents: "CONFIGURATION",
  agent_versions: "CONFIGURATION",
  workflows: "CONFIGURATION", // Workflow *definition*, not the instance.

  // SIMULATION (9) — branch-isolated (NF-WF-027).
  simulation_runs: "SIMULATION",
  simulation_ticks: "SIMULATION",
  simulation_events: "SIMULATION",
  simulation_entities: "SIMULATION",
  simulation_scenarios: "SIMULATION",
  simulation_breakpoints: "SIMULATION",
  simulation_causal_links: "SIMULATION",
  simulation_proposals: "SIMULATION",
  whatif_comparisons: "SIMULATION",

  // REFERENCE (2) — author-curated sources.
  references: "REFERENCE", // Sources are inputs to the story, not story state.
  reference_versions: "REFERENCE",
};

/** All table names in a class. */
export function tablesInClass(cls: RestoreScopeClass): string[] {
  return Object.entries(RESTORE_SCOPE_CLASS)
    .filter(([, c]) => c === cls)
    .map(([t]) => t);
}

/** The class of `table`, or undefined when unclassified. */
export function scopeClassOf(table: string): RestoreScopeClass | undefined {
  return RESTORE_SCOPE_CLASS[table];
}
