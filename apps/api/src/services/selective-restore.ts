/**
 * NF-WF-020A: selective restore — selection resolution, dependency
 * analysis, and surgical apply.
 *
 * Selection resolution, the dependency-conflict report (ORPHAN_REFERENCE /
 * STALE_DEPENDENT), and the surgical apply for DOMAIN / ENTITY / SELECTIVE
 * restore scopes. FULL restore is untouched (revisions.ts).
 *
 * Design notes (020A §"Surgical apply"):
 * - Retained rows are UPDATED in place, never deleted + re-inserted.
 *   A DELETE + INSERT would violate Restrict FKs when a surviving
 *   dependent references a rewound row (e.g. character_knowledge.fact_id
 *   -> canon_facts is Restrict). Ids never vanish under a selective
 *   apply, so Restrict dependents keep pointing at live rows.
 * - Only live rows ABSENT from the payload (and inside the selection)
 *   are deleted; only payload rows absent from live are inserted.
 * - Orphan dependents (Restrict/Cascade) are removed with explicit
 *   consent (acknowledged apply); SetNull edges are nulled. The
 *   cleaned rows are recorded in the change set.
 * - Selection storage: the resolved selection is stored inside the
 *   operation row's `preview` JSON (`selection` key); no schema change.
 */
import type { RevisionTx } from "./revisions.ts";
import {
  COVERED_TABLES,
  COVERED_TABLE_NAMES,
  DEPENDENCY_EDGES,
  DOMAIN_UNMAPPED_TABLES,
  SELECTIVE_DOMAINS,
  SELECTIVE_DOMAIN_NAMES,
  edgesForReferenced,
  isCoveredTable,
  payloadColumns,
  projectionsForTables,
  type DependencyEdge,
} from "@novelforge/story-versioning";
import { keyColumnFor, scopeFor } from "./revisions.ts";

/**
 * NF-WF-020A: typed selective-restore refusals. Carries the
 * machine-readable code as the envelope's error field (same position as
 * PolicyError/MemoryError in platform-routes.ts).
 */
export class SelectiveRestoreError extends Error {
  constructor(
    readonly statusCode: 400 | 409,
    readonly code: "INVALID_INPUT" | "UNACKNOWLEDGED_CONFLICTS",
    message: string,
  ) {
    super(message);
    this.name = "SelectiveRestoreError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectiveScope = "DOMAIN" | "ENTITY" | "SELECTIVE";

/** A (table, id) reference to a single story row. */
export interface EntityRef {
  table: string;
  id: string;
}

export interface DependencyConflict {
  kind: "ORPHAN_REFERENCE" | "STALE_DEPENDENT";
  /** Table holding the dependent row (outside the selection). */
  dependentTable: string;
  /** Id of the dependent row. */
  dependentId: string;
  /** Column on the dependent table holding the FK. */
  via: string;
  /** Table of the referenced (rewound) row. */
  referencedTable: string;
  /** Id of the referenced (rewound) row. */
  referencedId: string;
  /** What an acknowledged apply will do to the dependent row. */
  resolution: "DELETE_DEPENDENT" | "NULL_FK";
  /** True when this edge is one of the 9 contract-pinned semantic edges. */
  semantic: boolean;
}

/** The resolved selection stored on the operation row (inside `preview`). */
export interface ResolvedSelection {
  scope: SelectiveScope;
  /** For DOMAIN: the domain name. */
  domain?: string;
  /** Tables to rewind (FK order). */
  tables: string[];
  /** Entity refs (ENTITY closure / SELECTIVE named set), BFS order. */
  entityRefs: EntityRef[];
  /**
   * Row filter per table: the set of ids to rewind, or null for the whole
   * table (DOMAIN, or SELECTIVE with tables but no entityIds).
   */
  rowFilter: Record<string, string[] | null>;
  /** True when the user acknowledged the dependency conflicts. */
  acknowledged: boolean;
}

export interface SelectivePreview {
  /** Scoped per-table row counts { live, checkpoint, retained }. */
  tables: Record<string, { live: number; checkpoint: number; retained: number }>;
  /** Empty for selective scopes (chapters never in scope); kept for shape. */
  currentChapter: { id: string | null; versionId: string | null };
  pointerUpdates: { chapterId: string; versionId: string }[];
  projections: string[];
  /** ORPHAN_REFERENCE / STALE_DEPENDENT conflicts (informational for ENTITY). */
  dependencyConflicts: DependencyConflict[];
  /** The resolved selection this preview was computed from. */
  selection: ResolvedSelection;
}

/** The caller's selection input (from the preview request body). */
export interface SelectionInput {
  scope: SelectiveScope;
  domain?: string;
  entityType?: string;
  entityId?: string;
  tables?: string[];
  entityIds?: string[];
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Tables selective restore never rewinds: the manuscript pair (C7 —
 * coverage, not a restore target) and the three derived/audit tables no
 * DOMAIN scope ever touches.
 */
const NEVER_REWIND = new Set([
  "chapters",
  "chapter_versions",
  ...DOMAIN_UNMAPPED_TABLES,
]);

/**
 * Resolve the caller's selection input into a validated ResolvedSelection.
 * Throws an INVALID_INPUT-coded error on any validation failure.
 */
export async function resolveSelection(
  db: RevisionTx,
  novelId: string,
  input: SelectionInput,
): Promise<ResolvedSelection> {
  if (input.scope === "DOMAIN") {
    return resolveDomainSelection(input);
  }
  if (input.scope === "ENTITY") {
    return resolveEntitySelection(db, novelId, input);
  }
  return resolveSelectiveSelection(db, novelId, input);
}

function resolveDomainSelection(input: SelectionInput): ResolvedSelection {
  const domain = input.domain;
  if (
    !domain ||
    !(SELECTIVE_DOMAIN_NAMES as readonly string[]).includes(domain)
  ) {
    throw inputError(
      `unknown domain "${domain ?? ""}" (expected one of ${SELECTIVE_DOMAIN_NAMES.join(", ")})`,
    );
  }
  const tables = [...SELECTIVE_DOMAINS[domain as keyof typeof SELECTIVE_DOMAINS]];
  const rewindable = tables.filter((t) => !NEVER_REWIND.has(t));
  if (rewindable.length === 0) {
    // The manuscript pair is coverage, never a restore target (C7).
    throw inputError(
      `domain "${domain}" maps only to tables that are never rewound (the manuscript pair is coverage, not a restore target)`,
    );
  }
  const rowFilter: Record<string, string[] | null> = {};
  for (const t of rewindable) rowFilter[t] = null;
  return {
    scope: "DOMAIN",
    domain,
    tables: rewindable.sort(
      (a, b) => COVERED_TABLE_NAMES.indexOf(a) - COVERED_TABLE_NAMES.indexOf(b),
    ),
    entityRefs: [],
    rowFilter,
    acknowledged: false,
  };
}

async function resolveEntitySelection(
  db: RevisionTx,
  novelId: string,
  input: SelectionInput,
): Promise<ResolvedSelection> {
  const entityType = input.entityType;
  const entityId = input.entityId;
  if (!entityType || !entityId) {
    throw inputError("ENTITY scope requires entityType and entityId");
  }
  assertRewindableTable(entityType);
  const exists = await rowExists(db, novelId, entityType, entityId);
  if (!exists) {
    throw inputError(
      `entity ${entityType}:${entityId} does not exist in this novel`,
    );
  }
  const closure = await computeClosure(db, novelId, [
    { table: entityType, id: entityId },
  ]);
  const tables = [...new Set(closure.map((m) => m.ref.table))].sort(
    (a, b) => COVERED_TABLE_NAMES.indexOf(a) - COVERED_TABLE_NAMES.indexOf(b),
  );
  const rowFilter: Record<string, string[] | null> = {};
  for (const t of tables) {
    rowFilter[t] = closure
      .filter((m) => m.ref.table === t)
      .map((m) => m.ref.id);
  }
  return {
    scope: "ENTITY",
    tables,
    entityRefs: closure.map((m) => m.ref),
    rowFilter,
    acknowledged: false,
  };
}

async function resolveSelectiveSelection(
  db: RevisionTx,
  novelId: string,
  input: SelectionInput,
): Promise<ResolvedSelection> {
  const tables = input.tables;
  if (!tables || tables.length === 0) {
    throw inputError("SELECTIVE scope requires a non-empty tables list");
  }
  const seen = new Set<string>();
  for (const t of tables) {
    assertCoveredTable(t);
    if (NEVER_REWIND.has(t)) {
      throw inputError(
        `table "${t}" is never rewound by selective restore` +
          (DOMAIN_UNMAPPED_TABLES.includes(t as never)
            ? " (derived/audit state, not story state)"
            : " (the manuscript pair is coverage, not a restore target)"),
      );
    }
    if (seen.has(t)) throw inputError(`duplicate table "${t}" in selection`);
    seen.add(t);
  }
  const ordered = [...seen].sort(
    (a, b) => COVERED_TABLE_NAMES.indexOf(a) - COVERED_TABLE_NAMES.indexOf(b),
  );
  const rowFilter: Record<string, string[] | null> = {};
  const entityRefs: EntityRef[] = [];
  const entityIds = input.entityIds ?? [];
  if (entityIds.length > 0) {
    // Resolve each bare id against the named tables, first match wins.
    for (const id of entityIds) {
      entityRefs.push(await resolveBareId(db, novelId, ordered, id));
    }
    for (const t of ordered) {
      rowFilter[t] = entityRefs.filter((r) => r.table === t).map((r) => r.id);
    }
  } else {
    for (const t of ordered) rowFilter[t] = null;
  }
  return {
    scope: "SELECTIVE",
    tables: ordered,
    entityRefs,
    rowFilter,
    acknowledged: false,
  };
}

function assertCoveredTable(t: string): void {
  if (!isCoveredTable(t)) {
    throw inputError(`"${t}" is not a covered table`);
  }
}

function assertRewindableTable(t: string): void {
  assertCoveredTable(t);
  if (NEVER_REWIND.has(t)) {
    throw inputError(`"${t}" is never rewound by selective restore`);
  }
}

async function rowExists(
  db: RevisionTx,
  novelId: string,
  table: string,
  id: string,
): Promise<boolean> {
  const idCol = keyColumnFor(table);
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM "${table}" WHERE "${idCol}" = $1::uuid AND ${scopeWithParam(table, 2)}`,
    id,
    novelId,
  );
  return Number(rows[0]?.n ?? 0n) > 0;
}

/** Resolve a bare entity id against the named tables; first match wins. */
async function resolveBareId(
  db: RevisionTx,
  novelId: string,
  tables: string[],
  id: string,
): Promise<EntityRef> {
  for (const t of tables) {
    if (await rowExists(db, novelId, t, id)) return { table: t, id };
  }
  throw inputError(
    `entity id "${id}" does not match any row in the named tables (${tables.join(", ")})`,
  );
}

function inputError(message: string): SelectiveRestoreError {
  return new SelectiveRestoreError(400, "INVALID_INPUT", message);
}

// ---------------------------------------------------------------------------
// Dependency closure + conflict analysis
// ---------------------------------------------------------------------------

/** A closure member plus the edge that pulled it in (seeds have no parent). */
export interface ClosureMember {
  ref: EntityRef;
  parent?: { edge: DependencyEdge; ref: EntityRef };
}

/**
 * Compute the transitive dependency closure of the given seed refs: every
 * live row (in rewindable covered tables, novel-scoped) that directly or
 * indirectly references a seed row through a FK edge.
 */
export async function computeClosure(
  db: RevisionTx,
  novelId: string,
  seeds: EntityRef[],
): Promise<ClosureMember[]> {
  const visited = new Set<string>();
  const closure: ClosureMember[] = [];
  const queue: ClosureMember[] = [];
  for (const s of seeds) {
    const k = `${s.table}:${s.id}`;
    if (!visited.has(k)) {
      visited.add(k);
      const m: ClosureMember = { ref: s };
      closure.push(m);
      queue.push(m);
    }
  }
  while (queue.length > 0) {
    const member = queue.shift()!;
    for (const edge of edgesForReferenced(member.ref.table)) {
      if (NEVER_REWIND.has(edge.dependent)) continue;
      const ids = await dependentIds(db, novelId, edge, [member.ref.id]);
      for (const id of ids) {
        const k = `${edge.dependent}:${id}`;
        if (!visited.has(k)) {
          visited.add(k);
          const m: ClosureMember = {
            ref: { table: edge.dependent, id },
            parent: { edge, ref: member.ref },
          };
          closure.push(m);
          queue.push(m);
        }
      }
    }
  }
  return closure;
}

/** Live ids of `edge.dependent` rows referencing any of `refIds`, novel-scoped. */
async function dependentIds(
  db: RevisionTx,
  novelId: string,
  edge: DependencyEdge,
  refIds: string[],
): Promise<string[]> {
  if (refIds.length === 0) return [];
  const idCol = keyColumnFor(edge.dependent);
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "${idCol}" AS id FROM "${edge.dependent}" ` +
      `WHERE "${edge.via}" = ANY($1::uuid[]) AND ${scopeWithParam(edge.dependent, 2)}`,
    refIds,
    novelId,
  );
  return rows.map((r) => r.id);
}

/**
 * Analyze dependency conflicts for a DOMAIN / SELECTIVE selection.
 *
 * For every edge U -> T where T is rewound and U is not (and U is a
 * rewindable table), every live U row referencing a removed or changed
 * T row is reported:
 * - ORPHAN_REFERENCE when the referenced row is removed (the dependent
 *   would dangle);
 * - STALE_DEPENDENT when the referenced row survives but changed (the
 *   dependent keeps pointing at a rewound row).
 */
export async function analyzeDependencies(
  db: RevisionTx,
  novelId: string,
  selection: ResolvedSelection,
  diff: TableDiff,
): Promise<DependencyConflict[]> {
  const conflicts: DependencyConflict[] = [];
  const scopeTables = new Set(selection.tables);
  for (const edge of DEPENDENCY_EDGES) {
    if (!scopeTables.has(edge.referenced)) continue;
    if (scopeTables.has(edge.dependent)) continue;
    if (NEVER_REWIND.has(edge.dependent)) continue;
    const removed = diff.removedIds(edge.referenced);
    const changed = diff.changedIds(edge.referenced);
    const affected = [...removed, ...changed];
    if (affected.length === 0) continue;
    const depIds = await dependentIds(db, novelId, edge, affected);
    const refByDep = await referencedByDependent(db, novelId, edge, depIds);
    for (const [depId, refId] of refByDep) {
      conflicts.push({
        kind: removed.has(refId) ? "ORPHAN_REFERENCE" : "STALE_DEPENDENT",
        dependentTable: edge.dependent,
        dependentId: depId,
        via: edge.via,
        referencedTable: edge.referenced,
        referencedId: refId,
        resolution:
          edge.onDelete === "SetNull" ? "NULL_FK" : "DELETE_DEPENDENT",
        semantic: edge.semantic,
      });
    }
  }
  // Deterministic order for tests and UI.
  conflicts.sort(
    (a, b) =>
      a.dependentTable.localeCompare(b.dependentTable) ||
      a.dependentId.localeCompare(b.dependentId) ||
      a.referencedId.localeCompare(b.referencedId),
  );
  return conflicts;
}

/** For each dependent id, the referenced id its FK points at. */
async function referencedByDependent(
  db: RevisionTx,
  novelId: string,
  edge: DependencyEdge,
  depIds: string[],
): Promise<[string, string][]> {
  if (depIds.length === 0) return [];
  const idCol = keyColumnFor(edge.dependent);
  const rows = await db.$queryRawUnsafe<{ id: string; ref: string }[]>(
    `SELECT "${idCol}" AS id, "${edge.via}" AS ref FROM "${edge.dependent}" ` +
      `WHERE "${idCol}" = ANY($1::uuid[]) AND ${scopeWithParam(edge.dependent, 2)}`,
    depIds,
    novelId,
  );
  return rows.map((r) => [r.id, r.ref]);
}

/**
 * The ENTITY conflict report: the closure by definition. Each closure
 * member (beyond the seed) is reported with its kind relative to the
 * checkpoint diff — informational blast radius, no acknowledgment gate.
 */
export function entityClosureConflicts(
  members: ClosureMember[],
  diff: TableDiff,
): DependencyConflict[] {
  const conflicts: DependencyConflict[] = [];
  for (const m of members) {
    if (!m.parent) continue; // the seed itself
    const removed = diff.removedIds(m.ref.table);
    conflicts.push({
      kind: removed.has(m.ref.id) ? "ORPHAN_REFERENCE" : "STALE_DEPENDENT",
      dependentTable: m.ref.table,
      dependentId: m.ref.id,
      via: m.parent.edge.via,
      referencedTable: m.parent.ref.table,
      referencedId: m.parent.ref.id,
      resolution:
        m.parent.edge.onDelete === "SetNull" ? "NULL_FK" : "DELETE_DEPENDENT",
      semantic: m.parent.edge.semantic,
    });
  }
  conflicts.sort(
    (a, b) =>
      a.dependentTable.localeCompare(b.dependentTable) ||
      a.dependentId.localeCompare(b.dependentId),
  );
  return conflicts;
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/** Per-table removed/changed/added id sets between live and payload. */
export class TableDiff {
  private readonly removed = new Map<string, Set<string>>();
  private readonly changed = new Map<string, Set<string>>();
  private readonly added = new Map<string, Set<string>>();
  /** Payload rows keyed by table then id (for the apply). */
  readonly payloadRows = new Map<string, Map<string, Record<string, unknown>>>();

  setTable(
    table: string,
    live: Map<string, Record<string, unknown>>,
    payload: Map<string, Record<string, unknown>>,
    filter: Set<string> | null,
  ): void {
    const inScope = (id: string) => !filter || filter.has(id);
    const removed = new Set<string>();
    const changed = new Set<string>();
    const added = new Set<string>();
    for (const [id, liveRow] of live) {
      if (!inScope(id)) continue;
      const payloadRow = payload.get(id);
      if (!payloadRow) {
        removed.add(id);
      } else if (JSON.stringify(liveRow) !== JSON.stringify(payloadRow)) {
        changed.add(id);
      }
    }
    for (const id of payload.keys()) {
      if (!inScope(id)) continue;
      if (!live.has(id)) added.add(id);
    }
    this.removed.set(table, removed);
    this.changed.set(table, changed);
    this.added.set(table, added);
    this.payloadRows.set(table, payload);
  }

  removedIds(table: string): Set<string> {
    return this.removed.get(table) ?? new Set();
  }
  changedIds(table: string): Set<string> {
    return this.changed.get(table) ?? new Set();
  }
  addedIds(table: string): Set<string> {
    return this.added.get(table) ?? new Set();
  }
}

/** Load live rows for the scope tables, keyed by identity column. */
export async function loadLiveRows(
  db: RevisionTx,
  novelId: string,
  tables: string[],
): Promise<Map<string, Map<string, Record<string, unknown>>>> {
  const out = new Map<string, Map<string, Record<string, unknown>>>();
  for (const table of tables) {
    const idCol = keyColumnFor(table);
    const rows = await db.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(
      `SELECT to_jsonb(t) AS row FROM "${table}" t WHERE ${scopeFor(table)}`,
      novelId,
    );
    const byId = new Map<string, Record<string, unknown>>();
    for (const { row } of rows) {
      byId.set(String(row[idCol]), row);
    }
    out.set(table, byId);
  }
  return out;
}

/** Index payload rows by table then identity column. */
export function indexPayloadRows(
  payload: Record<string, unknown[]>,
  tables: string[],
): Map<string, Map<string, Record<string, unknown>>> {
  const out = new Map<string, Map<string, Record<string, unknown>>>();
  for (const table of tables) {
    const idCol = keyColumnFor(table);
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of payload[table] ?? []) {
      const r = row as Record<string, unknown>;
      byId.set(String(r[idCol]), r);
    }
    out.set(table, byId);
  }
  return out;
}

export function computeTableDiff(
  live: Map<string, Map<string, Record<string, unknown>>>,
  payload: Map<string, Map<string, Record<string, unknown>>>,
  selection: ResolvedSelection,
): TableDiff {
  const diff = new TableDiff();
  for (const table of selection.tables) {
    const filterArr = selection.rowFilter[table];
    diff.setTable(
      table,
      live.get(table) ?? new Map(),
      payload.get(table) ?? new Map(),
      filterArr ? new Set(filterArr) : null,
    );
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function computeSelectivePreview(
  db: RevisionTx,
  novelId: string,
  payload: Record<string, unknown[]>,
  selection: ResolvedSelection,
): Promise<SelectivePreview> {
  const live = await loadLiveRows(db, novelId, selection.tables);
  const indexed = indexPayloadRows(payload, selection.tables);
  const diff = computeTableDiff(live, indexed, selection);

  const tables: SelectivePreview["tables"] = {};
  const scopeTables = new Set(selection.tables);
  for (const table of COVERED_TABLE_NAMES) {
    if (!scopeTables.has(table)) {
      // Out-of-scope tables keep every live row.
      const liveCount = await countLive(db, novelId, table);
      tables[table] = { live: liveCount, checkpoint: 0, retained: liveCount };
      continue;
    }
    const liveRows = live.get(table) ?? new Map();
    const payloadRows = indexed.get(table) ?? new Map();
    const filterArr = selection.rowFilter[table];
    const filter = filterArr ? new Set(filterArr) : null;
    const inScope = (id: string) => !filter || filter.has(id);
    const removed = diff.removedIds(table);
    tables[table] = {
      live: liveRows.size,
      checkpoint: [...payloadRows.keys()].filter(inScope).length,
      // Rows surviving the restore: everything except removed rows.
      retained: [...liveRows.keys()].filter((id) => !removed.has(id)).length,
    };
  }

  let dependencyConflicts: DependencyConflict[];
  if (selection.scope === "ENTITY") {
    const members = await computeClosureFromRefs(db, novelId, selection);
    dependencyConflicts = entityClosureConflicts(members, diff);
  } else {
    dependencyConflicts = await analyzeDependencies(db, novelId, selection, diff);
  }

  return {
    tables,
    currentChapter: { id: null, versionId: null },
    pointerUpdates: [],
    projections: projectionsForTables(selection.tables),
    dependencyConflicts,
    selection,
  };
}

/** Rebuild closure members from the stored entity refs (for preview/apply). */
async function computeClosureFromRefs(
  db: RevisionTx,
  novelId: string,
  selection: ResolvedSelection,
): Promise<ClosureMember[]> {
  // entityRefs[0] is the seed; recompute the closure to recover parent edges.
  const seed = selection.entityRefs[0];
  if (!seed) return [];
  return computeClosure(db, novelId, [seed]);
}

async function countLive(
  db: RevisionTx,
  novelId: string,
  table: string,
): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM "${table}" WHERE ${scopeFor(table)}`,
    novelId,
  );
  return Number(rows[0]?.n ?? 0n);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * The pre-computed selective apply plan: everything the write phase needs,
 * derived from pure reads only. The caller must compute the plan BEFORE
 * `advanceHead` (C4 statement order): the revision + PRE_MUTATION snapshot
 * are captured before the state writes, so the checkpoint pins the
 * pre-restore image — never the post-restore one.
 */
export interface SelectiveApplyPlan {
  /** Change-set rows for the caller's revision (pre-computed). */
  items: { entityType: string; entityId: string; operation: string }[];
  /** Orphan-handling writes (acknowledged only), in execution order. */
  orphanPlan: Array<{
    dependentTable: string;
    dependentId: string;
    idCol: string;
    via: string;
    action: "NULL_FK" | "DELETE_DEPENDENT";
  }>;
  /** Row-level diff, computed from the pre-advance reads. */
  diff: TableDiff;
  /** Checkpoint payload rows indexed by table then identity column. */
  indexed: Map<string, Map<string, Record<string, unknown>>>;
}

/**
 * Compute the selective apply plan from pure reads — no writes.
 * Preconditions (checked by the caller): head asserted, conflicts
 * acknowledged when required.
 */
export async function planSelectiveRestore(
  db: RevisionTx,
  novelId: string,
  payload: Record<string, unknown[]>,
  selection: ResolvedSelection,
  conflicts: DependencyConflict[],
  acknowledged: boolean,
): Promise<SelectiveApplyPlan> {
  const live = await loadLiveRows(db, novelId, selection.tables);
  const indexed = indexPayloadRows(payload, selection.tables);
  const diff = computeTableDiff(live, indexed, selection);
  const items: SelectiveApplyPlan["items"] = [];
  const orphanPlan: SelectiveApplyPlan["orphanPlan"] = [];

  // 1. Orphan handling (acknowledged only): remove Restrict/Cascade
  //    dependents, null SetNull FKs. Recorded in the change set.
  for (const c of conflicts) {
    if (c.kind !== "ORPHAN_REFERENCE") continue;
    if (!acknowledged) {
      throw unacknowledgedError();
    }
    orphanPlan.push({
      dependentTable: c.dependentTable,
      dependentId: c.dependentId,
      idCol: keyColumnFor(c.dependentTable),
      via: c.via,
      action: c.resolution === "NULL_FK" ? "NULL_FK" : "DELETE_DEPENDENT",
    });
    items.push({
      entityType: c.dependentTable,
      entityId: c.dependentId,
      operation: c.resolution === "NULL_FK" ? "UPDATE" : "DELETE",
    });
  }

  // 2. Delete removed rows, reverse FK-dependency order (dependents first).
  const reversed = [...selection.tables].sort(
    (a, b) => COVERED_TABLE_NAMES.indexOf(b) - COVERED_TABLE_NAMES.indexOf(a),
  );
  for (const table of reversed) {
    for (const id of diff.removedIds(table)) {
      items.push({ entityType: table, entityId: id, operation: "DELETE" });
    }
  }

  // 3. Insert added rows and update changed rows, FK-dependency order.
  for (const table of selection.tables) {
    for (const id of diff.addedIds(table)) {
      items.push({ entityType: table, entityId: id, operation: "CREATE" });
    }
    for (const id of diff.changedIds(table)) {
      items.push({ entityType: table, entityId: id, operation: "UPDATE" });
    }
  }

  return { items, orphanPlan, diff, indexed };
}

/**
 * Execute a pre-computed plan inside the caller's transaction (`db`).
 * Must run AFTER `advanceHead` (C4 statement order) — pure writes, no
 * reads that could change the plan.
 */
export async function executeSelectiveRestore(
  db: RevisionTx,
  novelId: string,
  selection: ResolvedSelection,
  plan: SelectiveApplyPlan,
): Promise<void> {
  const { diff, indexed, orphanPlan } = plan;

  // 1. Orphan handling.
  for (const op of orphanPlan) {
    if (op.action === "NULL_FK") {
      await db.$queryRawUnsafe(
        `UPDATE "${op.dependentTable}" SET "${op.via}" = NULL WHERE "${op.idCol}" = $1::uuid AND ${scopeWithParam(op.dependentTable, 2)}`,
        op.dependentId,
        novelId,
      );
    } else {
      await db.$queryRawUnsafe(
        `DELETE FROM "${op.dependentTable}" WHERE "${op.idCol}" = $1::uuid AND ${scopeWithParam(op.dependentTable, 2)}`,
        op.dependentId,
        novelId,
      );
    }
  }

  // 2. Delete removed rows, reverse FK-dependency order (dependents first).
  const reversed = [...selection.tables].sort(
    (a, b) => COVERED_TABLE_NAMES.indexOf(b) - COVERED_TABLE_NAMES.indexOf(a),
  );
  for (const table of reversed) {
    const removed = [...diff.removedIds(table)];
    if (removed.length === 0) continue;
    const idCol = keyColumnFor(table);
    await db.$queryRawUnsafe(
      `DELETE FROM "${table}" WHERE "${idCol}" = ANY($1::uuid[]) AND ${scopeWithParam(table, 2)}`,
      removed,
      novelId,
    );
  }

  // 3. Insert added rows and update changed rows, FK-dependency order.
  for (const table of selection.tables) {
    const idCol = keyColumnFor(table);
    const payloadRows = indexed.get(table) ?? new Map();
    const added = [...diff.addedIds(table)];
    if (added.length > 0) {
      const rows = added
        .map((id) => payloadRows.get(id))
        .filter((r): r is Record<string, unknown> => !!r);
      await insertRows(db, table, rows);
    }
    for (const id of diff.changedIds(table)) {
      const row = payloadRows.get(id);
      if (!row) continue;
      await updateRow(db, table, idCol, row);
    }
  }
}

async function insertRows(
  db: RevisionTx,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = payloadColumns(table, Object.keys(rows[0]!));
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  await db.$queryRawUnsafe(
    `INSERT INTO "${table}" (${columnList}) SELECT ${columnList} ` +
      `FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`,
    JSON.stringify(rows),
  );
}

async function updateRow(
  db: RevisionTx,
  table: string,
  idCol: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row).filter((c) => c !== idCol);
  if (columns.length === 0) return;
  const setClause = columns.map((c) => `"${c}" = s."${c}"`).join(", ");
  // No novel scope: the id is a globally-unique PK, novel-scoped at
  // selection resolution. (A scope would need alias-qualification —
  // s has the same columns as t.)
  await db.$queryRawUnsafe(
    `UPDATE "${table}" AS t SET ${setClause} ` +
      `FROM jsonb_populate_record(NULL::"${table}", $1::jsonb) AS s ` +
      `WHERE t."${idCol}" = s."${idCol}"`,
    JSON.stringify(row),
  );
}

function unacknowledgedError(): SelectiveRestoreError {
  return new SelectiveRestoreError(
    409,
    "UNACKNOWLEDGED_CONFLICTS",
    "restore has unacknowledged dependency conflicts",
  );
}

/**
 * scopeFor with the novel-id placeholder renumbered to $`paramIndex`.
 * All TABLE_SCOPE predicates use $1 exactly once.
 */
function scopeWithParam(table: string, paramIndex: number): string {
  return scopeFor(table).replace(/\$1/g, `$${paramIndex}`);
}

// ---------------------------------------------------------------------------
// Restore-target check (020A)
// ---------------------------------------------------------------------------

/** True when selective restore may rewind `table`. */
export function isRewindableTable(table: string): boolean {
  const covered = COVERED_TABLES.find((t) => t.key === table);
  return (
    !!covered && covered.restoreTarget !== false && !NEVER_REWIND.has(table)
  );
}

export { COVERED_TABLE_NAMES };
