/**
 * Coverage set and snapshot payload shape (STORY-VERSIONING.md C1, C2, C7).
 *
 * Pure module (ADR-0001): no Prisma, no HTTP, no provider import. The table
 * list is the contract's, and it is the ONE place the 31 covered tables are
 * named — a second copy in a service is what the completeness assertion
 * exists to prevent.
 *
 * `ORDER` is a valid FK-dependency insertion order: a row's parents are
 * always earlier in the array. Restore inserts in this order and deletes in
 * reverse. The order is the contract's own C2 listing, verified against the
 * schema's relation graph rather than assumed.
 *
 * Payload rows are keyed by **database column name** (`novel_id`, not
 * `novelId`), because capture and restore are done in SQL where the payload
 * round-trips through `to_jsonb` / `jsonb_populate_recordset`. A camelCase
 * key would silently fail to populate a column.
 */

/** `format_version` of the payload this module describes. */
export const SNAPSHOT_FORMAT_VERSION = 1;

export interface CoveredTable {
  /** Payload key — also the database table name. */
  readonly key: string;
  /**
   * Whether restore deletes and re-inserts this table's rows. `false` for the
   * manuscript pair `chapters`/`chapter_versions`, which C7 updates in place:
   * `chapter_versions` is append-only and `ON DELETE CASCADE` from
   * `chapters`, so deleting either would destroy immutable history.
   */
  readonly restoreTarget: boolean;
  /**
   * Columns deliberately absent from the payload. `chapters.status` is the
   * only one: publication pointers are outside story restore, always (C7).
   */
  readonly excludeColumns?: readonly string[];
}

/**
 * The 31 covered tables in FK-dependency order (C1, C2).
 *
 * A row's parents are always EARLIER in this array, so inserting in array
 * order never violates a foreign key and deleting in reverse order never
 * strands a child. The order was derived from the schema's relation graph,
 * not assumed from the contract's domain-grouped listing — the two differ,
 * and the domain listing is not FK-valid (`bonds` follows `bond_members` in
 * C2's table, but `bond_members` references `bonds`).
 *
 * `chapters`/`chapter_versions` are the one cyclic pair (`chapters
 * .current_version_id` → `chapter_versions.id` while `chapter_versions
 * .chapter_id` → `chapters.id`). The cycle is harmless here because C7 never
 * deletes or re-inserts either row — it updates `chapters.currentVersionId`
 * in place — so no ordering of the pair can violate a key.
 *
 * `novel_branches` is deliberately absent: it is the head pointer itself,
 * not restorable state, and restore advances it like any other mutation.
 */
export const COVERED_TABLES: readonly CoveredTable[] = [
  // Canon
  { key: "story_entities", restoreTarget: true },
  // Character
  { key: "characters", restoreTarget: true },
  // Narrative
  { key: "antagonists", restoreTarget: true },
  // Relationship
  { key: "bonds", restoreTarget: true },
  { key: "bond_members", restoreTarget: true },
  { key: "bond_transitions", restoreTarget: true },
  // Canon
  { key: "canon_facts", restoreTarget: true },
  // Manuscript — never deleted, never re-inserted (C7)
  { key: "chapters", restoreTarget: false, excludeColumns: ["status"] },
  { key: "chapter_versions", restoreTarget: false },
  { key: "canon_fact_sources", restoreTarget: true },
  { key: "canon_proposals", restoreTarget: true },
  // Story intelligence
  { key: "story_events", restoreTarget: true },
  { key: "causal_edges", restoreTarget: true },
  // Character
  { key: "character_arcs", restoreTarget: true },
  { key: "character_arc_milestones", restoreTarget: true },
  { key: "character_knowledge", restoreTarget: true },
  { key: "character_states", restoreTarget: true },
  // Relationship
  { key: "meaningful_interactions", restoreTarget: true },
  // Narrative
  { key: "narrative_dna_profiles", restoreTarget: true },
  { key: "narrative_policies", restoreTarget: true },
  // Planning
  { key: "sagas", restoreTarget: true },
  { key: "scenes", restoreTarget: true },
  { key: "outline_nodes", restoreTarget: true },
  { key: "outline_versions", restoreTarget: true },
  { key: "planning_horizons", restoreTarget: true },
  // Relationship
  { key: "relationship_stances", restoreTarget: true },
  // Story intelligence
  { key: "story_promises", restoreTarget: true },
  { key: "story_threads", restoreTarget: true },
  { key: "story_thread_events", restoreTarget: true },
  // Planning
  { key: "synopses", restoreTarget: true },
  // Story intelligence
  { key: "timeline_events", restoreTarget: true },
] as const;

/** Every covered table name, in FK-dependency order. */
export const COVERED_TABLE_NAMES: readonly string[] = COVERED_TABLES.map((t) => t.key);

const COVERED_SET: ReadonlySet<string> = new Set(COVERED_TABLE_NAMES);

/** Is `table` inside the C1 coverage set? */
export function isCoveredTable(table: string): boolean {
  return COVERED_SET.has(table);
}

/**
 * Tables excluded from restore, always, with the reason restore must state
 * (C1, C7). Preview lists these verbatim so the author sees the boundary.
 */
export const OUTSIDE_SCOPE: readonly { readonly table: string; readonly reason: string }[] = [
  { table: "users", reason: "identity — restoring a story must not revoke an account" },
  { table: "sessions", reason: "identity — restoring a story must not revoke an account" },
  { table: "workspaces", reason: "identity — restoring a story must not revoke an account" },
  { table: "memberships", reason: "authorization — restore does not grant or revoke access" },
  { table: "ai_gateways", reason: "platform provider configuration and credentials" },
  { table: "ai_models", reason: "platform provider configuration and credentials" },
  { table: "model_profile_mappings", reason: "platform provider configuration and credentials" },
  { table: "agents", reason: "append-only versioned definition (ADR-0006)" },
  { table: "agent_versions", reason: "append-only versioned definition (ADR-0006)" },
  { table: "skills", reason: "append-only versioned definition (ADR-0006)" },
  { table: "skill_versions", reason: "append-only versioned definition (ADR-0006)" },
  { table: "workflows", reason: "append-only versioned definition (ADR-0006)" },
  { table: "workflow_versions", reason: "append-only versioned definition (ADR-0006)" },
  { table: "workflow_runs", reason: "execution history, not reconstructable from story state" },
  { table: "workflow_step_runs", reason: "execution history, not reconstructable from story state" },
  { table: "references", reason: "ingested material, rebuildable (ADR-0003)" },
  { table: "reference_versions", reason: "ingested material, rebuildable (ADR-0003)" },
  { table: "chunks", reason: "derived retrieval index (ADR-0007)" },
  { table: "embeddings", reason: "derived retrieval index (ADR-0007)" },
  { table: "retrieval_audits", reason: "derived retrieval index (ADR-0007)" },
  { table: "generations", reason: "AI ledger — auditable history, never rewound" },
  { table: "generation_attempts", reason: "AI ledger — auditable history, never rewound" },
  { table: "audit_logs", reason: "append-only audit fact (ADR-0004)" },
  { table: "novel_settings", reason: "not consumed by chapter context" },
  { table: "novels", reason: "novel identity and slug — restore rewinds story state, not identity" },
] as const;

/** The `snapshots.payload` shape: one array per covered table. */
export type SnapshotPayload = Record<string, unknown[]>;

export type SnapshotProblem =
  | { problem: "NOT_AN_OBJECT" }
  | { problem: "MISSING_TABLE"; table: string }
  | { problem: "NOT_AN_ARRAY"; table: string };

/**
 * Assert every covered table named in C1 is present as a key in `payload`.
 *
 * A missing key is a refusal, not a partial snapshot: restore deletes every
 * covered row the payload does not carry, so an absent key would read as "the
 * story had none of these" and destroy real state.
 */
export function validateSnapshotComplete(
  payload: unknown,
): { ok: true } | SnapshotProblem {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { problem: "NOT_AN_OBJECT" };
  }
  const record = payload as Record<string, unknown>;
  for (const table of COVERED_TABLE_NAMES) {
    const value = record[table];
    if (value === undefined) return { problem: "MISSING_TABLE", table };
    if (!Array.isArray(value)) return { problem: "NOT_AN_ARRAY", table };
  }
  return { ok: true };
}

/**
 * Column list for a table's payload rows: every column except the deliberate
 * exclusions. Only `chapters` has one (C7).
 */
export function payloadColumns(table: string, allColumns: readonly string[]): readonly string[] {
  const excluded = COVERED_TABLES.find((t) => t.key === table)?.excludeColumns;
  if (!excluded) return allColumns;
  const drop = new Set(excluded);
  return allColumns.filter((c) => !drop.has(c));
}
