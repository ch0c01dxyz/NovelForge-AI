/**
 * Impact classification (STORY-VERSIONING.md C3).
 *
 * Pure function (ADR-0001): no Prisma, no HTTP, no provider import. Mirrors
 * `packages/narrative-rhythm`'s layout so the rule can be tested without a
 * database.
 *
 * **Both classes cross the mutation boundary.** The class decides whether a
 * `PRE_MUTATION` checkpoint and snapshot are captured — it does NOT decide
 * whether a revision is recorded. Every operation named here takes the head
 * CAS, advances the head and writes a revision plus its change set. Reading
 * "LOW" as "no revision" is the mistake C3 calls out: a LOW operation that
 * skipped the CAS would leave the head stale and make the next HIGH
 * mutation's conflict meaningless.
 */

export type ImpactClass = "LOW" | "HIGH";

/**
 * The operations C3 names, as a closed vocabulary.
 *
 * `sceneCrud` is listed in C3 with no production write path today
 * (`manuscript.ts:4-6` records scenes as schema-only, `planning.ts` only
 * reads them). It is classified here because C3 names the operation class
 * that will owe a revision when that path lands — classifying it is not
 * inventing the path.
 */
export const OPERATIONS = [
  // LOW — C3 "Operations" column
  "chapter.save",
  "chapter.restore",
  "chapter.create",
  "chapter.delete",
  "chapter.setStatus",
  "synopsis.write",
  "saga.write",
  "outlineNode.write",
  "outlineDraft.create",
  "scene.crud",
  "thread.transition",
  "promise.transition",
  "character.write",
  "relationship.write",
  "dna.write",
  "policy.write",
  "antagonist.advance",
  "fact.create",
  "fact.retract",
  "proposal.create",
  "proposal.reject",
  "event.append",
  "timeline.append",
  "causalEdge.create",
  // HIGH — C3 "Operations" column
  "proposal.approve",
  "outlineVersion.approve",
  "outline.supersede",
  "chapters.import",
  "restore.apply",
  "outline.bulkRewrite",
  "branch.merge",
  "ai.bulkRewrite",
  // HIGH by the same test C3 applies to the eight above: the operation's
  // whole point is to capture a snapshot. An explicit checkpoint request is
  // not a C3 mutation row (it is the `PRE_MUTATION` capture the HIGH rows
  // take), so it is named here rather than left to the unlisted-operation
  // default, which would classify it LOW and capture nothing.
  "checkpoint.create",
] as const;

export type Operation = (typeof OPERATIONS)[number];

/** The HIGH set, spelled once. Everything else in `OPERATIONS` is LOW. */
const HIGH_OPERATIONS: ReadonlySet<string> = new Set<string>([
  "proposal.approve",
  "outlineVersion.approve",
  "outline.supersede",
  "chapters.import",
  "restore.apply",
  "outline.bulkRewrite",
  "branch.merge",
  "ai.bulkRewrite",
  "checkpoint.create",
]);

/**
 * Classify an operation. An operation not in `OPERATIONS` is `LOW` — the
 * contract's default is "revision and change set still recorded, no
 * checkpoint", and refusing an unknown operation would make every future
 * call site a breaking change to this package.
 *
 * `entityType` is accepted for symmetry with the contract's
 * `impactFor(operation, entityType)` signature and for call sites that
 * classify before they know the operation name. It does not currently change
 * the answer: C3 classifies by operation, not by entity.
 */
export function impactFor(operation: string, entityType?: string): ImpactClass {
  void entityType;
  return HIGH_OPERATIONS.has(operation) ? "HIGH" : "LOW";
}

/** Does this operation capture a `PRE_MUTATION` checkpoint and snapshot? */
export function requiresCheckpoint(operation: string): boolean {
  return impactFor(operation) === "HIGH";
}

/**
 * The projection names a rebuild intent may target (C6).
 *
 * The contract fixes the deduplication key `UNIQUE (projection,
 * source_revision_id)` and names exactly one projection (`canon_summary`,
 * C10) without enumerating the vocabulary. The seven names below are the
 * seven C1 coverage groups, lowercased and underscored — a rename of the
 * contract's own grouping, not an invented taxonomy. A projection whose
 * source revision is older than the branch head is stale (C6).
 */
export const PROJECTIONS = [
  "manuscript",
  "canon",
  "planning",
  "story_intelligence",
  "character",
  "relationship",
  "narrative",
] as const;

export type Projection = (typeof PROJECTIONS)[number];

/**
 * Which projections a mutation touching `tables` must invalidate.
 *
 * C7 step 6 says apply "inserts `derived_rebuild_intents` for every affected
 * projection" without saying which those are; the same question applies to
 * every covered mutation. Deriving it from the C1 group of each touched table
 * is the only answer the contract supports, and it is deterministic.
 */
const TABLE_PROJECTION: Readonly<Record<string, Projection>> = {
  chapters: "manuscript",
  chapter_versions: "manuscript",
  scenes: "manuscript",
  story_entities: "canon",
  canon_facts: "canon",
  canon_fact_sources: "canon",
  canon_proposals: "canon",
  synopses: "planning",
  sagas: "planning",
  outline_nodes: "planning",
  outline_versions: "planning",
  planning_horizons: "planning",
  story_events: "story_intelligence",
  timeline_events: "story_intelligence",
  story_threads: "story_intelligence",
  story_thread_events: "story_intelligence",
  story_promises: "story_intelligence",
  causal_edges: "story_intelligence",
  characters: "character",
  character_states: "character",
  character_knowledge: "character",
  character_arcs: "character",
  character_arc_milestones: "character",
  relationship_stances: "relationship",
  bonds: "relationship",
  bond_members: "relationship",
  bond_transitions: "relationship",
  meaningful_interactions: "relationship",
  narrative_dna_profiles: "narrative",
  narrative_policies: "narrative",
  antagonists: "narrative",
};

/** The projection a covered table belongs to. Unknown tables have none. */
export function projectionForTable(table: string): Projection | null {
  return TABLE_PROJECTION[table] ?? null;
}

/** Every projection affected by a mutation touching `tables`, deduplicated. */
export function projectionsForTables(tables: readonly string[]): Projection[] {
  const found = new Set<Projection>();
  for (const t of tables) {
    const p = projectionForTable(t);
    if (p) found.add(p);
  }
  return PROJECTIONS.filter((p) => found.has(p));
}
