/**
 * @novelforge/story-versioning — cross-domain coherence predicate (NF-WF-032 / GAP-004).
 *
 * `verifyCrossDomainCoherence` asserts that a combination of rows across
 * tables forms a coherent story — that every cross-table reference
 * resolves, that identity joins still name the same entities, that
 * evidence pointers still cite existing versions, and that derived state
 * is honest about its freshness.
 *
 * Pure module (ADR-0001): no Prisma, no HTTP, no provider import, no LLM,
 * no clock, no randomness. Same inputs → same report (deterministic).
 *
 * The predicate REPORTS violations; it never mutates, repairs, backfills,
 * or auto-links (constitution §5 — surfaced, never silently reconciled).
 */

import { DEPENDENCY_EDGES } from "./dependency-edges.ts";
import { COVERED_TABLES } from "./snapshot.ts";

/** One coherence violation. */
export interface CoherenceViolation {
  /** Which predicate failed, e.g. "P2_REFERENCE_RESOLVABILITY". */
  predicate: string;
  /** Tables involved in the violation. */
  tables: string[];
  /** Row ids involved (DATABASE `id` values, or `novel_id` for singletons). */
  rowIds: string[];
  /** Human-readable detail. */
  detail: string;
}

/** The predicate result. */
export interface CoherenceReport {
  coherent: boolean;
  violations: CoherenceViolation[];
}

/**
 * The state to check: table name → rows (DATABASE column names).
 * For preview, REWOUND tables come from the snapshot payload and
 * PINNED/REFERENCE tables from live rows. For the post-apply advisory
 * check, all tables come from live rows.
 */
export type CoherenceState = Record<string, Record<string, unknown>[]>;

export interface CoherenceOptions {
  /**
   * Snapshot payload for P1 (rewind fidelity): table → expected rows.
   * Omit to skip P1 (e.g. preview, where restore hasn't run yet).
   */
  payload?: Record<string, Record<string, unknown>[]>;
  /**
   * Revision number R the payload was captured at (for P6).
   * Required when checking P6.
   */
  revisionNumber?: number;
  /**
   * Revision id → revision number, for resolving
   * `memory_projections.source_revision_id` in P6.
   */
  revisionNumbers?: Record<string, number>;
}

/** Predicate identifiers. */
export const COHERENCE_PREDICATES = [
  "P1_REWIND_FIDELITY",
  "P2_REFERENCE_RESOLVABILITY",
  "P3_IDENTITY_JOIN_COHERENCE",
  "P4_EVIDENCE_COHERENCE",
  "P5_MANUSCRIPT_COHERENCE",
  "P6_DERIVED_STATE_HONESTY",
] as const;

/**
 * The identity column of a table. Mirrors `keyColumnFor` in
 * apps/api/src/services/revisions.ts: `planning_horizons` and
 * `narrative_dna_profiles` are per-novel singletons keyed by `novel_id`.
 */
function keyColumnFor(table: string): string {
  if (table === "planning_horizons" || table === "narrative_dna_profiles") {
    return "novel_id";
  }
  return "id";
}

/** Extract the row id (or novel_id for singletons) as a string. */
function rowId(table: string, row: Record<string, unknown>): string | null {
  const v = row[keyColumnFor(table)];
  return typeof v === "string" ? v : null;
}

/**
 * Build an index of id → row per table for O(1) lookups.
 */
function indexRows(
  state: CoherenceState,
): Map<string, Map<string, Record<string, unknown>>> {
  const index = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [table, rows] of Object.entries(state)) {
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const id = rowId(table, row);
      if (id !== null) byId.set(id, row);
    }
    index.set(table, byId);
  }
  return index;
}

/**
 * P1 — Rewind fidelity: every REWOUND table's live rows equal the snapshot
 * payload (field-by-field, honoring excludeColumns).
 */
function checkRewindFidelity(
  payload: Record<string, Record<string, unknown>[]>,
  state: CoherenceState,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];
  const excludeByTable = new Map<string, Set<string>>();
  for (const t of COVERED_TABLES) {
    if (t.excludeColumns) excludeByTable.set(t.key, new Set(t.excludeColumns));
  }

  for (const [table, expectedRows] of Object.entries(payload)) {
    // Only REWOUND tables are compared; PINNED tables are never rewound.
    const covered = COVERED_TABLES.find((t) => t.key === table);
    if (!covered || !covered.restoreTarget) continue;

    const liveRows = state[table] ?? [];
    const excluded = excludeByTable.get(table) ?? new Set<string>();

    const expectedById = new Map<string, Record<string, unknown>>();
    for (const row of expectedRows) {
      const id = rowId(table, row);
      if (id !== null) expectedById.set(id, row);
    }
    const liveById = new Map<string, Record<string, unknown>>();
    for (const row of liveRows) {
      const id = rowId(table, row);
      if (id !== null) liveById.set(id, row);
    }

    // Rows in payload but not live (or different).
    for (const [id, expected] of expectedById) {
      const live = liveById.get(id);
      if (!live) {
        violations.push({
          predicate: "P1_REWIND_FIDELITY",
          tables: [table],
          rowIds: [id],
          detail: `row ${id} in snapshot payload but missing from live ${table}`,
        });
        continue;
      }
      // Field-by-field comparison, honoring excludeColumns.
      const keys = new Set([...Object.keys(expected), ...Object.keys(live)]);
      for (const key of keys) {
        if (excluded.has(key)) continue;
        const e = JSON.stringify(expected[key] ?? null);
        const l = JSON.stringify(live[key] ?? null);
        if (e !== l) {
          violations.push({
            predicate: "P1_REWIND_FIDELITY",
            tables: [table],
            rowIds: [id],
            detail: `row ${id} column ${key} differs: payload ${e} vs live ${l}`,
          });
          break; // One violation per row is enough.
        }
      }
    }
    // Rows live but not in payload (should have been deleted by restore).
    for (const id of liveById.keys()) {
      if (!expectedById.has(id)) {
        violations.push({
          predicate: "P1_REWIND_FIDELITY",
          tables: [table],
          rowIds: [id],
          detail: `row ${id} live in ${table} but absent from snapshot payload`,
        });
      }
    }
  }
  return violations;
}

/**
 * P2 — Reference resolvability: every FK-valued column in the state
 * resolves to a row present in the state. Uses DEPENDENCY_EDGES plus
 * the evidence edges to REFERENCE tables.
 */
function checkReferenceResolvability(
  state: CoherenceState,
  index: Map<string, Map<string, Record<string, unknown>>>,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];

  // Edges from DEPENDENCY_EDGES, plus the evidence edge to reference_versions
  // (not in DEPENDENCY_EDGES because reference_versions is not a covered table).
  const edges = [
    ...DEPENDENCY_EDGES,
    {
      dependent: "canon_fact_sources",
      referenced: "reference_versions",
      via: "reference_version_id",
      onDelete: "Restrict" as const,
      semantic: false,
    },
  ];

  for (const edge of edges) {
    const rows = state[edge.dependent] ?? [];
    const referencedById = index.get(edge.referenced);
    if (!referencedById) continue; // Referenced table not in state — nothing to check.

    for (const row of rows) {
      const fkValue = row[edge.via];
      // NULL FKs are not resolvability violations (nullable relations).
      // Non-nullable FKs with NULL values are a schema violation, not a
      // coherence violation — the database constraint catches those.
      if (fkValue === null || fkValue === undefined) continue;
      if (typeof fkValue !== "string") continue;
      if (!referencedById.has(fkValue)) {
        const id = rowId(edge.dependent, row);
        violations.push({
          predicate: "P2_REFERENCE_RESOLVABILITY",
          tables: [edge.dependent, edge.referenced],
          rowIds: id ? [id, fkValue] : [fkValue],
          detail:
            `${edge.dependent}.${edge.via} = ${fkValue} references ` +
            `missing ${edge.referenced} row`,
        });
      }
    }
  }
  return violations;
}

/**
 * P3 — Identity-join coherence: `characters.story_entity_id` and
 * `timeline_events.story_event_id`, when non-NULL, resolve. NULL is
 * honest-unlinked (GAP-011), never a violation, never auto-linked.
 */
function checkIdentityJoinCoherence(
  state: CoherenceState,
  index: Map<string, Map<string, Record<string, unknown>>>,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];
  const checks: { table: string; column: string; target: string }[] = [
    { table: "characters", column: "story_entity_id", target: "story_entities" },
    { table: "timeline_events", column: "story_event_id", target: "story_events" },
  ];

  for (const { table, column, target } of checks) {
    const rows = state[table] ?? [];
    const targetById = index.get(target);
    if (!targetById) continue;

    for (const row of rows) {
      const fkValue = row[column];
      // NULL is honest-unlinked — never a violation (GAP-011).
      if (fkValue === null || fkValue === undefined) continue;
      if (typeof fkValue !== "string") continue;
      if (!targetById.has(fkValue)) {
        const id = rowId(table, row);
        violations.push({
          predicate: "P3_IDENTITY_JOIN_COHERENCE",
          tables: [table, target],
          rowIds: id ? [id, fkValue] : [fkValue],
          detail:
            `${table}.${column} = ${fkValue} references missing ${target} row ` +
            `(identity join is incoherent; NULL would be honest-unlinked)`,
        });
      }
    }
  }
  return violations;
}

/**
 * P4 — Evidence coherence: every `canon_fact_sources` row references an
 * existing `chapter_versions` row or an existing `reference_versions` row.
 * Versions are never deleted (Invariant 4), so this pins the invariant.
 */
function checkEvidenceCoherence(
  state: CoherenceState,
  index: Map<string, Map<string, Record<string, unknown>>>,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];
  const rows = state["canon_fact_sources"] ?? [];
  const chapterVersions = index.get("chapter_versions");
  const referenceVersions = index.get("reference_versions");

  for (const row of rows) {
    const id = rowId("canon_fact_sources", row);
    const cvId = row["chapter_version_id"];
    const rvId = row["reference_version_id"];

    // At least one source must be present and resolvable.
    let resolved = false;
    if (typeof cvId === "string" && chapterVersions?.has(cvId)) resolved = true;
    if (typeof rvId === "string" && referenceVersions?.has(rvId)) resolved = true;

    if (!resolved) {
      const problems: string[] = [];
      if (typeof cvId === "string") problems.push(`chapter_version_id=${cvId} missing`);
      if (typeof rvId === "string") problems.push(`reference_version_id=${rvId} missing`);
      if (problems.length === 0) problems.push("no source version set");
      violations.push({
        predicate: "P4_EVIDENCE_COHERENCE",
        tables: ["canon_fact_sources", "chapter_versions", "reference_versions"],
        rowIds: id ? [id] : [],
        detail: `canon_fact_sources row ${id ?? "?"}: ${problems.join("; ")}`,
      });
    }
  }
  return violations;
}

/**
 * P5 — Manuscript coherence: every `chapter_versions` row references an
 * existing `chapters` row; every `canon_applications` /
 * `canon_application_items` row references existing proposal/fact rows.
 */
function checkManuscriptCoherence(
  state: CoherenceState,
  index: Map<string, Map<string, Record<string, unknown>>>,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];

  // chapter_versions.chapter_id → chapters.id
  {
    const rows = state["chapter_versions"] ?? [];
    const chapters = index.get("chapters");
    if (chapters) {
      for (const row of rows) {
        const chapterId = row["chapter_id"];
        if (typeof chapterId !== "string") continue;
        if (!chapters.has(chapterId)) {
          const id = rowId("chapter_versions", row);
          violations.push({
            predicate: "P5_MANUSCRIPT_COHERENCE",
            tables: ["chapter_versions", "chapters"],
            rowIds: id ? [id, chapterId] : [chapterId],
            detail: `chapter_versions.chapter_id = ${chapterId} references missing chapters row`,
          });
        }
      }
    }
  }

  // canon_applications: check proposal/fact references.
  // The schema uses specific columns; we check via DEPENDENCY_EDGES where
  // available, plus direct checks for application → proposal links.
  {
    const rows = state["canon_application_items"] ?? [];
    const proposals = index.get("canon_proposals");
    const facts = index.get("canon_facts");
    const applications = index.get("canon_applications");
    for (const row of rows) {
      const id = rowId("canon_application_items", row);
      // application_id → canon_applications (Cascade in DEPENDENCY_EDGES, also checked in P2)
      // proposal_id → canon_proposals, canon_fact_id → canon_facts
      const proposalId = row["proposal_id"];
      if (typeof proposalId === "string" && proposals && !proposals.has(proposalId)) {
        violations.push({
          predicate: "P5_MANUSCRIPT_COHERENCE",
          tables: ["canon_application_items", "canon_proposals"],
          rowIds: id ? [id, proposalId] : [proposalId],
          detail: `canon_application_items.proposal_id = ${proposalId} references missing canon_proposals row`,
        });
      }
      const factId = row["canon_fact_id"];
      if (typeof factId === "string" && facts && !facts.has(factId)) {
        violations.push({
          predicate: "P5_MANUSCRIPT_COHERENCE",
          tables: ["canon_application_items", "canon_facts"],
          rowIds: id ? [id, factId] : [factId],
          detail: `canon_application_items.canon_fact_id = ${factId} references missing canon_facts row`,
        });
      }
      const appId = row["application_id"];
      if (typeof appId === "string" && applications && !applications.has(appId)) {
        violations.push({
          predicate: "P5_MANUSCRIPT_COHERENCE",
          tables: ["canon_application_items", "canon_applications"],
          rowIds: id ? [id, appId] : [appId],
          detail: `canon_application_items.application_id = ${appId} references missing canon_applications row`,
        });
      }
    }
  }

  return violations;
}

/**
 * P6 — Derived-state honesty: `memory_projections` rows pinned newer than
 * R are absent (dropped, per the 009 rule). Freshness is derived against
 * the new head, never asserted from the snapshot.
 */
function checkDerivedStateHonesty(
  state: CoherenceState,
  revisionNumber: number | undefined,
  revisionNumbers: Record<string, number> | undefined,
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];
  if (revisionNumber === undefined) return violations; // Cannot check without R.

  const rows = state["memory_projections"] ?? [];
  for (const row of rows) {
    const id = rowId("memory_projections", row);
    const sourceRevisionId = row["source_revision_id"];
    if (typeof sourceRevisionId !== "string") continue;
    const sourceNumber = revisionNumbers?.[sourceRevisionId];
    if (sourceNumber === undefined) continue; // Cannot resolve — skip (not a violation).
    if (sourceNumber > revisionNumber) {
      violations.push({
        predicate: "P6_DERIVED_STATE_HONESTY",
        tables: ["memory_projections"],
        rowIds: id ? [id] : [],
        detail:
          `memory_projections row ${id ?? "?"} pinned to revision ${sourceNumber} ` +
          `newer than restored revision ${revisionNumber} — should have been dropped`,
      });
    }
  }
  return violations;
}

/**
 * Verify cross-domain coherence of a restored (or to-be-restored) state.
 *
 * Pure and deterministic: same inputs → same report. Never mutates.
 *
 * @param state The state to check: table → rows. For preview, REWOUND
 *   tables come from the snapshot payload and PINNED/REFERENCE from live.
 *   For the post-apply advisory check, all tables come from live rows.
 * @param options Optional payload (for P1), revisionNumber and
 *   revisionNumbers (for P6).
 */
export function verifyCrossDomainCoherence(
  state: CoherenceState,
  options: CoherenceOptions = {},
): CoherenceReport {
  const violations: CoherenceViolation[] = [];
  const index = indexRows(state);

  // P1 — only when a payload is provided (post-apply advisory check).
  if (options.payload) {
    violations.push(...checkRewindFidelity(options.payload, state));
  }

  // P2–P5 — always checked.
  violations.push(...checkReferenceResolvability(state, index));
  violations.push(...checkIdentityJoinCoherence(state, index));
  violations.push(...checkEvidenceCoherence(state, index));
  violations.push(...checkManuscriptCoherence(state, index));

  // P6 — only when revisionNumber is provided.
  violations.push(
    ...checkDerivedStateHonesty(state, options.revisionNumber, options.revisionNumbers),
  );

  // Deterministic order: sort by predicate, then tables, then rowIds.
  violations.sort((a, b) => {
    if (a.predicate !== b.predicate) return a.predicate < b.predicate ? -1 : 1;
    const at = a.tables.join(",");
    const bt = b.tables.join(",");
    if (at !== bt) return at < bt ? -1 : 1;
    const ar = a.rowIds.join(",");
    const br = b.rowIds.join(",");
    return ar < br ? -1 : ar > br ? 1 : 0;
  });

  return { coherent: violations.length === 0, violations };
}

/**
 * A cross-domain conflict for the FULL preview, mirroring 020A's
 * DependencyConflict shape. Surfaced, not refused — the user decides.
 */
export interface CrossDomainConflict {
  kind: "COHERENCE_VIOLATION";
  /** Which predicate failed. */
  predicate: string;
  /** Tables involved. */
  tables: string[];
  /** Row ids involved. */
  rowIds: string[];
  /** Human-readable detail. */
  detail: string;
}

/** Convert a CoherenceReport to preview-surfaceable conflicts. */
export function toCrossDomainConflicts(report: CoherenceReport): CrossDomainConflict[] {
  return report.violations.map((v) => ({
    kind: "COHERENCE_VIOLATION" as const,
    predicate: v.predicate,
    tables: v.tables,
    rowIds: v.rowIds,
    detail: v.detail,
  }));
}
