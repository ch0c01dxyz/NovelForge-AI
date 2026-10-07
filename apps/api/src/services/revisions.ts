/**
 * @novelforge/api — revision services (M1, NF-WF-002).
 *
 * Implements the mutation boundary (STORY-VERSIONING.md C4), the durable
 * rebuild intent (C6) and restore (C7). The pure rules — the C1 coverage set,
 * the C2 payload shape and the C3 impact classes — live in
 * `@novelforge/story-versioning` and are NOT re-implemented here; this module
 * owns only the Prisma and SQL side of them.
 *
 * ## Why `advanceHead` is a free function, not a service method
 *
 * Every covered mutation in C3 must take the head CAS *inside its own
 * transaction*, alongside its own writes — a separate transaction would let
 * the revision commit while the mutation rolled back. So the helper takes the
 * caller's `tx` rather than the client, and the seven C3 services import it
 * directly instead of having a service instance threaded through seven
 * factories. `createRevisionServices` is for the routes: the operations that
 * own a whole transaction of their own (checkpoint capture, preview, apply).
 */
import type { NovelForgeDb, RevisionOrigin } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import {
  COVERED_TABLE_NAMES,
  COVERED_TABLES,
  DEPENDENCY_EDGES,
  OUTSIDE_SCOPE,
  SNAPSHOT_FORMAT_VERSION,
  isCoveredTable,
  projectionsForTables,
  requiresCheckpoint,
  validateSnapshotComplete,
  type Projection,
  type SnapshotPayload,
} from "@novelforge/story-versioning";
// Shared error vocabulary; the app-wide handler in platform-routes.ts maps
// these once (C5). No new error class, no second setErrorHandler.
import { ConflictError, NotFoundError } from "@novelforge/ai-services";
import { BranchError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";
// NF-WF-020A: selective restore (DOMAIN / ENTITY / SELECTIVE).
import {
  executeSelectiveRestore,
  planSelectiveRestore,
  computeSelectivePreview,
  resolveSelection,
  SelectiveRestoreError,
  type ResolvedSelection,
  type SelectivePreview,
  type SelectiveScope,
} from "./selective-restore.ts";

/**
 * The interactive-transaction client: the Prisma client minus the members a
 * transaction callback does not expose. Spelled as the same `Omit` the
 * generated `Prisma.TransactionClient` uses (`Omit<DefaultPrismaClient,
 * ITXClientDenyList>`) rather than importing that alias, because
 * `@novelforge/database` re-exports the client and the enums but not the
 * `Prisma` namespace.
 */
export type RevisionTx = Omit<
  NovelForgeDb,
  "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends" | "$use"
>;

/** A change-log entry. `operation` is constrained by a CHECK in the migration. */
export interface ChangeSetItemInput {
  entityType: string;
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
}

export interface AdvanceHeadInput {
  workspaceId: string;
  novelId: string;
  /**
   * The revision the caller believes is head, or `null` for "no head yet".
   *
   * `undefined` means the caller asserts no expectation: the head is read
   * under the lock and advanced, with nothing to compare against. That is the
   * reading for the C3 services whose routes carry no revision parameter.
   *
   * `null` and a uuid ARE compared, null-safely: `null` asserts "no head
   * exists yet", so a head created in between is a 409 like any other.
   *
   * The four HIGH mutation routes (`proposal.approve`,
   * `outlineVersion.approve`, `outline.supersede`, `chapters.import`) carry
   * the client-supplied value (NF-WF-002D); their services pass it straight
   * through, and each also runs `assertHeadExpectation` before its
   * transaction so a stale plan does no work.
   */
  expectedHeadRevisionId?: string | null;
  origin: RevisionOrigin;
  /** C3 operation name; decides the impact class. */
  operation: string;
  message?: string | null;
  actorUserId: string | null;
  items?: readonly ChangeSetItemInput[];
  /**
   * Covered tables this mutation touched. Refused by name when any is outside
   * the C1 set (C5), and used to derive the rebuild intents (C6).
   */
  tables: readonly string[];
  branchName?: string;
  /**
   * Present when this call captures a snapshot and a checkpoint. `advanceHead`
   * does not decide that itself: the C3 services pass
   * `requiresCheckpoint(operation)`, so the pure impact class stays the single
   * authority on the class (C3).
   */
  checkpoint?: CheckpointRequest | undefined;
}

export interface CheckpointRequest {
  kind?: RevisionOrigin;
  /** Defaults to the pinned revision: `<operation> @ R<n>`. */
  label?: string;
  note?: string | null;
  /**
   * Which revision the snapshot and checkpoint pin (C10 step 4).
   *
   * - `"PREVIOUS"` — the head BEFORE this mutation. A HIGH operation's
   *   `PRE_MUTATION` checkpoint is the image of the state the mutation is
   *   about to change, so `previewRestore(C1)` after `approveProposal` names
   *   R45, not R46.
   * - `"NEW"` (default) — the revision this call creates. An explicit
   *   checkpoint describes the state it just committed.
   */
  pin?: "PREVIOUS" | "NEW";
}

export interface AdvanceHeadResult {
  revisionId: string;
  number: number;
  changeSetId: string;
  /** Present only when a checkpoint was requested. */
  checkpointId: string | null;
  snapshotId: string | null;
  /** The revision the snapshot and checkpoint pin; `null` when none. */
  pinnedRevisionId: string | null;
}

/**
 * Read the branch head outside a transaction, to be passed back in as
 * `expectedHeadRevisionId`. This is a plain read: it takes no lock, so a
 * mutation that commits between this read and the locked comparison makes the
 * comparison fail — which is the point.
 */
export async function readHeadRevisionId(
  db: NovelForgeDb,
  novelId: string,
  branchName = "main",
): Promise<string | null> {
  const branch = await db.novelBranch.findUnique({
    where: { novelId_name: { novelId, name: branchName } },
    select: { headRevisionId: true },
  });
  return branch?.headRevisionId ?? null;
}

/**
 * Advisory unlocked head pre-check (C4, generalised from `applyRestore`).
 *
 * Refuses a moved head with a 409 *before any write*, so a plan built on a
 * stale head does no work — including opening a transaction. It is advisory:
 * the head can move again between this read and the lock, so `advanceHead`'s
 * locked CAS inside the caller's transaction is the authoritative comparison.
 * A pre-check-only implementation would be racy; both halves are required.
 *
 * `undefined` asserts nothing and returns immediately, leaving the locked CAS
 * as the only comparison — the behavior every existing caller keeps.
 */
export async function assertHeadExpectation(
  db: NovelForgeDb,
  input: { novelId: string; branchName?: string; expectedHeadRevisionId?: string | null },
): Promise<void> {
  if (input.expectedHeadRevisionId === undefined) return;
  const current = await readHeadRevisionId(db, input.novelId, input.branchName);
  if (current !== input.expectedHeadRevisionId) {
    throw new ConflictError(
      `stale revision: expected ${input.expectedHeadRevisionId ?? "none"}, current ${current ?? "none"}`,
      { currentHeadRevisionId: current },
    );
  }
}

/**
 * How each covered table is scoped to one novel.
 *
 * Nineteen tables carry `novel_id` directly. The other twelve reach it
 * through a parent — a `bond_members` row belongs to the novel its `bonds`
 * row belongs to — so the predicate is a subquery rather than a column. The
 * map is keyed by the C1 table names and is the ONLY place a table name is
 * turned into SQL; every lookup goes through `scopeFor`, which refuses an
 * unknown table rather than interpolating it.
 *
 * NF-WF-020A: exported so selective-restore.ts shares the single source of
 * truth (no duplicated scope map). The placeholder is always $1; callers
 * needing another position rewrite it.
 */
export const TABLE_SCOPE: Readonly<Record<string, string>> = {
  story_entities: `"novel_id" = $1`,
  characters: `"novel_id" = $1`,
  antagonists: `"novel_id" = $1`,
  bonds: `"novel_id" = $1`,
  bond_members: `"bond_id" IN (SELECT "id" FROM "bonds" WHERE "novel_id" = $1)`,
  bond_transitions: `"bond_id" IN (SELECT "id" FROM "bonds" WHERE "novel_id" = $1)`,
  canon_facts: `"novel_id" = $1`,
  canon_applications: `"novel_id" = $1`,
  canon_application_items: `"application_id" IN (SELECT "id" FROM "canon_applications" WHERE "novel_id" = $1)`,
  chapters: `"novel_id" = $1`,
  chapter_versions: `"chapter_id" IN (SELECT "id" FROM "chapters" WHERE "novel_id" = $1)`,
  canon_fact_sources: `"canon_fact_id" IN (SELECT "id" FROM "canon_facts" WHERE "novel_id" = $1)`,
  canon_proposals: `"novel_id" = $1`,
  story_events: `"novel_id" = $1`,
  causal_edges: `"novel_id" = $1`,
  character_arcs: `"character_id" IN (SELECT "id" FROM "characters" WHERE "novel_id" = $1)`,
  character_arc_milestones: `"arc_id" IN (SELECT "id" FROM "character_arcs" WHERE "character_id" IN (SELECT "id" FROM "characters" WHERE "novel_id" = $1))`,
  character_knowledge: `"character_id" IN (SELECT "id" FROM "characters" WHERE "novel_id" = $1)`,
  character_states: `"character_id" IN (SELECT "id" FROM "characters" WHERE "novel_id" = $1)`,
  meaningful_interactions: `"bond_id" IN (SELECT "id" FROM "bonds" WHERE "novel_id" = $1)`,
  narrative_dna_profiles: `"novel_id" = $1`,
  narrative_policies: `"novel_id" = $1`,
  sagas: `"novel_id" = $1`,
  scenes: `"chapter_id" IN (SELECT "id" FROM "chapters" WHERE "novel_id" = $1)`,
  outline_nodes: `"novel_id" = $1`,
  outline_versions: `"novel_id" = $1`,
  planning_horizons: `"novel_id" = $1`,
  relationship_stances: `"from_character_id" IN (SELECT "id" FROM "characters" WHERE "novel_id" = $1)`,
  story_promises: `"novel_id" = $1`,
  story_threads: `"novel_id" = $1`,
  story_thread_events: `"thread_id" IN (SELECT "id" FROM "story_threads" WHERE "novel_id" = $1)`,
  synopses: `"novel_id" = $1`,
  timeline_events: `"novel_id" = $1`,
  memory_projections: `"novel_id" = $1`,
  // NF-WF-010: final-text review receipts are audit, not truth — covered
  // so restore sees them, but rebuildable (a re-review regenerates any
  // receipt).
  final_text_reviews: `"novel_id" = $1`,
  // NF-WF-012: publication release records. Covered so the head CAS
  // accepts them; restoreTarget: false (above) means restores never
  // rewind publication (Invariant 8).
  publications: `"novel_id" = $1`,
};

/**
 * The identity column of each covered table, for the two tables that have no
 * `id`: `planning_horizons` and `narrative_dna_profiles` are per-novel
 * singletons keyed by `novel_id` alone (the same pair `withRevision` callers
 * must pass an explicit `entityId` for).
 *
 * Reading `id` on either is a hard SQL error (`42703`), not a wrong count, so
 * this map is what keeps `computePreview` total over the C1 set. Every other
 * table's identity is `id`.
 */
const TABLE_KEY_COLUMN: Readonly<Record<string, string>> = {
  planning_horizons: "novel_id",
  narrative_dna_profiles: "novel_id",
};

/** The identity column of `table` — `id` unless it is a per-novel singleton. */
// NF-WF-020A: exported for selective-restore.ts.
export function keyColumnFor(table: string): string {
  return TABLE_KEY_COLUMN[table] ?? "id";
}

/**
 * The predicate that scopes `table` to `$1` (a novel id), or a refusal.
 *
 * A table with no entry is outside the C1 coverage set. Refusing here rather
 * than at the caller is what makes `outside story restore scope` (C5)
 * unreachable-by-omission: there is no path that interpolates a table name
 * into SQL without passing this check.
 *
 * NF-WF-020A: exported for selective-restore.ts.
 */
export function scopeFor(table: string): string {
  const scope = TABLE_SCOPE[table];
  if (!scope) throw new ConflictError(`outside story restore scope: ${table}`);
  return scope;
}

/** Every covered table's `to_jsonb` projection, honouring C7's exclusions. */
function jsonbProjection(table: string): string {
  const excluded = COVERED_TABLES.find((t) => t.key === table)?.excludeColumns ?? [];
  return excluded.length === 0
    ? "to_jsonb(t)"
    : `(to_jsonb(t) ${excluded.map((c) => `- '${c}'`).join(" ")})`;
}

/**
 * Read every covered table for `novelId` into the C2 payload.
 *
 * `to_jsonb(t)` emits the DATABASE column names (`novel_id`, not `novelId`),
 * which is what `jsonb_populate_recordset` needs to write the row back — the
 * payload is a round-trip format, not an API DTO. Rows come back in
 * FK-dependency order because `COVERED_TABLE_NAMES` is in that order, and a
 * JSONB object preserves key insertion order, so the stored payload reads in
 * the order restore will insert it.
 */
export async function captureSnapshot(
  tx: RevisionTx,
  novelId: string,
): Promise<SnapshotPayload> {
  const payload: Record<string, unknown[]> = {};
  for (const table of COVERED_TABLE_NAMES) {
    const rows = await tx.$queryRawUnsafe<{ row: unknown }[]>(
      `SELECT ${jsonbProjection(table)} AS row FROM "${table}" t WHERE ${scopeFor(table)}`,
      novelId,
    );
    payload[table] = rows.map((r) => r.row);
  }
  return payload;
}

/** Refuse a payload that is short a covered key, naming the key (C5). */
function assertComplete(payload: SnapshotPayload): void {
  const complete = validateSnapshotComplete(payload);
  if (!("problem" in complete)) return;
  // A capture that came back short is a refusal, not a partial snapshot:
  // restore deletes every covered row the payload omits (C7).
  throw new ConflictError(
    complete.problem === "MISSING_TABLE"
      ? `snapshot incomplete: ${complete.table}`
      : `snapshot incomplete: ${complete.problem}`,
  );
}

/**
 * Take the head CAS, record the revision and change set, capture the
 * pre-mutation snapshot for a HIGH operation, and queue the rebuild intents.
 *
 * MUST be called inside the caller's transaction, before the caller's own
 * writes, for two reasons C4 states: `novel_branches.head_revision_id` is a
 * non-deferrable FK, so the revision row must exist before the head points at
 * it; and a HIGH operation's snapshot is a *pre*-mutation image, so it must
 * be read before anything changes.
 */
export async function advanceHead(
  tx: RevisionTx,
  input: AdvanceHeadInput,
): Promise<AdvanceHeadResult> {
  const branchName = input.branchName ?? "main";

  // Refuse an uncovered table before anything else: a mutation that touched
  // one would leave state restore cannot see, and the caller's writes are
  // still ahead of us, so the refusal is a clean rollback.
  for (const table of input.tables) {
    if (!isCoveredTable(table)) {
      throw new ConflictError(`outside story restore scope: ${table}`);
    }
  }

  // Statement order is load-bearing and the lock comes first (C4).
  const locked = await tx.$queryRawUnsafe<{ id: string; head_revision_id: string | null }[]>(
    `SELECT "id", "head_revision_id" FROM "novel_branches"
      WHERE "novel_id" = $1 AND "name" = $2 FOR UPDATE`,
    input.novelId,
    branchName,
  );
  const branch = locked[0];
  // No branch row means the novel was never baselined. C8 promises the
  // migration and `createNovel` both create one, so this is the
  // pre-baseline case C5 names — never a silent empty story.
  if (!branch) throw new ConflictError("no baseline exists for this novel");

  const current = branch.head_revision_id;
  // Null-safe comparison: `null` head and expected `null` are equal, every
  // other pairing with a null is a mismatch. `undefined` asserts no
  // expectation and compares nothing.
  if (input.expectedHeadRevisionId !== undefined && current !== input.expectedHeadRevisionId) {
    throw new ConflictError(
      `stale revision: expected ${input.expectedHeadRevisionId ?? "none"}, current ${current ?? "none"}`,
      // The head this comparison observed, so the caller can re-read rather
      // than silently retry a plan built on a stale head (C4, GAP-022).
      { currentHeadRevisionId: current },
    );
  }

  let number = 1;
  if (current !== null) {
    const head = await tx.revision.findUnique({
      where: { id: current },
      select: { number: true },
    });
    // The FK guarantees the row; a missing one means the head pointer is
    // corrupt, which is not something to paper over.
    if (!head) throw new ConflictError("stale revision: head revision is missing");
    number = head.number + 1;
  }

  const revision = await tx.revision.create({
    data: {
      workspaceId: input.workspaceId,
      novelId: input.novelId,
      branchId: branch.id,
      parentRevisionId: current,
      number,
      origin: input.origin,
      message: input.message ?? null,
      createdById: input.actorUserId,
    },
    select: { id: true, number: true },
  });

  await tx.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: revision.id },
  });

  const changeSet = await tx.changeSet.create({
    data: {
      revisionId: revision.id,
      workspaceId: input.workspaceId,
      novelId: input.novelId,
    },
    select: { id: true },
  });

  const items = input.items ?? [];
  if (items.length > 0) {
    await tx.changeSetItem.createMany({
      data: items.map((i) => ({
        changeSetId: changeSet.id,
        entityType: i.entityType,
        entityId: i.entityId,
        operation: i.operation,
      })),
    });
  }

  let checkpointId: string | null = null;
  let snapshotId: string | null = null;
  let pinnedRevisionId: string | null = null;

  if (input.checkpoint) {
    // The snapshot is captured HERE, before the caller's writes, so it is the
    // pre-mutation boundary the checkpoint promises.
    const pinPrevious = (input.checkpoint.pin ?? "NEW") === "PREVIOUS";
    pinnedRevisionId = pinPrevious ? current : revision.id;
    if (pinnedRevisionId === null) throw new ConflictError("no baseline exists for this novel");
    const pinnedNumber = pinPrevious ? number - 1 : revision.number;

    // Reuse an existing snapshot when the pinned revision already has one.
    // The state cannot have changed since: the head IS that revision, so a
    // second capture would be the same image and would collide on
    // `UNIQUE (snapshots.revision_id)`.
    const existing = await tx.snapshot.findUnique({
      where: { revisionId: pinnedRevisionId },
      select: { id: true },
    });
    if (existing) {
      snapshotId = existing.id;
    } else {
      const payload = await captureSnapshot(tx, input.novelId);
      assertComplete(payload);
      const body = JSON.stringify(payload);
      const snapshot = await tx.snapshot.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          branchId: branch.id,
          revisionId: pinnedRevisionId,
          formatVersion: SNAPSHOT_FORMAT_VERSION,
          storage: "INLINE",
          payload: payload as never,
          byteSize: body.length,
        },
        select: { id: true },
      });
      snapshotId = snapshot.id;
    }

    const checkpoint = await tx.checkpoint.create({
      data: {
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        branchId: branch.id,
        revisionId: pinnedRevisionId,
        snapshotId,
        kind: input.checkpoint.kind ?? "PRE_MUTATION",
        label: input.checkpoint.label ?? `${input.operation} @ R${pinnedNumber}`,
        note: input.checkpoint.note ?? null,
        createdById: input.actorUserId,
      },
      select: { id: true },
    });
    checkpointId = checkpoint.id;
  }

  await queueRebuildIntents(tx, {
    workspaceId: input.workspaceId,
    novelId: input.novelId,
    sourceRevisionId: revision.id,
    tables: input.tables,
  });

  return {
    revisionId: revision.id,
    number: revision.number,
    changeSetId: changeSet.id,
    checkpointId,
    snapshotId,
    pinnedRevisionId,
  };
}

/**
 * The boundary call a C3 mutation makes: `advanceHead` with the checkpoint
 * decided by the pure impact class. LOW records the revision and change set
 * only; HIGH additionally captures the `PRE_MUTATION` checkpoint and snapshot
 * in the same transaction, pinned to the pre-mutation head (C3, C10 step 4).
 */
export async function advanceForMutation(
  tx: RevisionTx,
  input: AdvanceHeadInput,
): Promise<AdvanceHeadResult> {
  return advanceHead(tx, {
    ...input,
    checkpoint: requiresCheckpoint(input.operation)
      ? { kind: "PRE_MUTATION", pin: "PREVIOUS" }
      : undefined,
  });
}

/**
 * The one-row write every C3 service repeats: open a transaction, write the
 * row through the passed `tx`, advance the head, return the row.
 *
 * Returned as a factory so each service binds its own `db` once
 * (`const withRevision = createWithRevision(db)`) and every call site stays a
 * five-argument call.
 *
 * The write callback takes `tx` and MUST use it — a callback that closed over
 * the outer client would commit the row outside the transaction and leave the
 * revision describing a mutation that could roll back independently.
 *
 * The change-log entity id defaults to the written row's `id`. The singleton
 * tables (`narrative_dna_profiles`, `planning_horizons`) have no `id` column —
 * they are keyed by `novelId` — so their callers pass `entityId` explicitly;
 * without one there is no id to record and the write is refused rather than
 * logging a placeholder.
 *
 * `itemOperation` defaults to CREATE. An upsert passes UPDATE: the C2
 * vocabulary has no UPSERT, and the row is a per-novel singleton, so every
 * caller after the first is an update.
 */
export function createWithRevision(db: NovelForgeDb) {
  return async function withRevision<T extends object>(
    scope: { workspaceId: string; novelId: string; actorUserId: string },
    operation: string,
    entityType: string,
    tables: readonly string[],
    write: (tx: RevisionTx) => Promise<T>,
    options?: { entityId?: string; itemOperation?: "CREATE" | "UPDATE" | "DELETE" },
  ): Promise<T> {
    return db.$transaction(async (tx) => {
      const row = await write(tx);
      const entityId = options?.entityId ?? (row as { id?: string }).id;
      if (!entityId) {
        throw new Error(
          `withRevision: ${entityType} has no id — pass options.entityId (singleton keyed by novelId)`,
        );
      }
      await advanceForMutation(tx, {
        workspaceId: scope.workspaceId,
        novelId: scope.novelId,
        operation,
        origin: "MANUAL",
        actorUserId: scope.actorUserId,
        tables,
        items: [{ entityType, entityId, operation: options?.itemOperation ?? "CREATE" }],
      });
      return row;
    });
  };
}

/**
 * Write the durable rebuild intents for a mutation (C6).
 *
 * One row per affected projection, deduplicated on
 * `UNIQUE (projection, source_revision_id)`. A replay for the same source
 * revision is a no-op rather than a second rebuild — `skipDuplicates` is the
 * whole of the idempotency, and it is why a retried dispatch cannot fan out.
 */
async function queueRebuildIntents(
  tx: RevisionTx,
  input: {
    workspaceId: string;
    novelId: string;
    sourceRevisionId: string;
    tables: readonly string[];
  },
): Promise<Projection[]> {
  const projections = projectionsForTables(input.tables);
  if (projections.length === 0) return [];
  await tx.derivedRebuildIntent.createMany({
    data: projections.map((projection) => ({
      workspaceId: input.workspaceId,
      novelId: input.novelId,
      projection,
      sourceRevisionId: input.sourceRevisionId,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });
  return projections;
}

/** The preview an author reads before applying (C7). */
export interface RestorePreview {
  /** The head the preview was computed against; apply refuses a moved head. */
  headRevisionId: string | null;
  /** Per covered table: rows the payload adds, removes, and leaves alone. */
  counts: Record<string, { added: number; removed: number; retained: number }>;
  /** Payload `chapters.id` values with no live row — the apply refusal (C5). */
  absentChapterIds: string[];
  /** Number-reuse shape: payload id, and the unrelated live id holding it. */
  chapterNumberReuse: { payloadChapterId: string; number: number; liveChapterId: string }[];
  /** Chapters created after the boundary that survive the rewind (C7). */
  retainedPostBoundaryChapterIds: string[];
  /** Chapters whose `currentVersionId` the restore would move. */
  pointerChanges: { chapterId: string; from: string | null; to: string | null }[];
  /** PUBLISHED chapters whose pointer is deliberately NOT moved (C7 step 4). */
  publishedPointerConflicts: { chapterId: string; number: number; kept: string | null }[];
  /** Projections the restore invalidates (C7 step 6). */
  projections: Projection[];
  outsideScope: readonly { table: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// NF-WF-020C: conservative three-way merge.
//
// The merge is change-set-driven (C2 records WHAT changed) and
// snapshot-backed (snapshots carry the row data the change sets deliberately
// omit). Classification is conservative: any same-entity divergence on both
// sides is a CONFLICT, because identity of the two changes cannot be proven
// from the change log alone — "identically on both" is therefore NOT
// auto-merged (semantic merge stays M9, Invariant 5).
// ---------------------------------------------------------------------------

/** The contract-pinned merge taxonomy (020C). */
export type MergeChangeKind = "CLEAN" | "CONFLICT" | "DELETED_MODIFIED" | "ORPHAN_RISK";

/** One entity's classification in a merge preview. */
export interface MergeChange {
  /** Prisma model name, as recorded in `change_set_items.entity_type`. */
  entityType: string;
  entityId: string;
  kind: MergeChangeKind;
  /** Which sides changed the entity since the base. */
  changedOn: ("source" | "target")[];
  /** Change-set operations observed, e.g. ["UPDATE"], ["DELETE","CREATE"]. */
  operations: ("CREATE" | "UPDATE" | "DELETE")[];
  /**
   * Row evidence, keyed by DATABASE column names (C2). Present when a
   * snapshot covers the revision; absent when the side has no snapshot —
   * the classification never depends on it.
   */
  base?: Record<string, unknown> | null;
  sourceVersion?: Record<string, unknown> | null;
  targetVersion?: Record<string, unknown> | null;
  /**
   * For ORPHAN_RISK: the divergent dependent that makes this clean change
   * risky (one of the 9 contract-pinned semantic edges).
   */
  warning?: string;
  /**
   * NF-WF-024C: for a CONFLICT narrowed to CLEAN by semantic analysis,
   * the proving rule (S1/S2/S3). Absent on all other changes.
   */
  semanticRule?: "S1" | "S2" | "S3";
}

/** The read-only result of `previewMerge`. */
export interface MergePreview {
  sourceBranch: { id: string; name: string; headRevisionId: string | null; headNumber: number | null };
  targetBranch: { id: string; name: string; headRevisionId: string | null; headNumber: number | null };
  baseRevisionId: string | null;
  baseNumber: number | null;
  changes: MergeChange[];
  summary: { clean: number; conflict: number; deletedModified: number; orphanRisk: number };
  /** True iff the merge can be applied (zero conflicts of any kind). */
  canApply: boolean;
  /** False when a side's head has no snapshot — apply will refuse. */
  snapshotsAvailable: boolean;
}

/** Machine-readable codes for merge/rollback refusals. */
export type MergeErrorCode =
  | "MERGE_CONFLICTS" // 409: conflicts with preview evidence
  | "MERGE_NO_BASE" // 409: no common history
  | "MERGE_NO_SNAPSHOT" // 409: missing snapshot at a head
  | "MERGE_DIRTY_TARGET" // 409: target has unsaved changes
  | "NOT_ON_TARGET_BRANCH" // 409: target not checked out
  | "INVALID_CHECKPOINT_KIND"; // 400: not a pre-operation checkpoint

/**
 * NF-WF-020C: typed merge/rollback refusals.
 *
 * Follows the `PolicyError`/`PublicationError`/`BranchError` precedent: a
 * typed error carrying the machine-readable code, mapped by the app-wide
 * handler in platform-routes.ts BEFORE the generic `ConflictError` branch.
 * `MERGE_CONFLICTS` additionally carries the preview as evidence, so the
 * Recovery Center can render exactly what diverged (delivery-plan :57).
 */
export class MergeError extends Error {
  readonly code: MergeErrorCode;
  readonly statusCode: 400 | 409;
  readonly evidence?: MergePreview;
  constructor(code: MergeErrorCode, message: string, evidence?: MergePreview) {
    super(message);
    this.name = "MergeError";
    this.code = code;
    // 400 for input validation (wrong checkpoint kind); 409 for state conflicts.
    this.statusCode = code === "INVALID_CHECKPOINT_KIND" ? 400 : 409;
    this.evidence = evidence;
  }
}

/**
 * The identities a payload carries for one table, tolerating a malformed row.
 *
 * Payload rows are keyed by DATABASE column name (C2), so the identity column
 * is looked up rather than assumed to be `id` — `planning_horizons` and
 * `narrative_dna_profiles` carry `novel_id` and no `id` at all.
 */
function payloadIds(payload: SnapshotPayload, table: string): string[] {
  const rows = payload[table] ?? [];
  const key = keyColumnFor(table);
  return rows
    .map((r) => (r as Record<string, unknown>)?.[key])
    .filter((id): id is string => typeof id === "string");
}

/**
 * Load a checkpoint's snapshot payload, refusing anything unusable (C5).
 *
 * Accepts either a transaction client or the plain client, so preview (a
 * read-only path) and apply (inside its transaction) share one loader.
 */
async function loadCheckpointPayload(
  db: RevisionTx,
  checkpointId: string,
  novelId: string,
): Promise<SnapshotPayload> {
  const checkpoint = await db.checkpoint.findFirst({
    where: { id: checkpointId, novelId },
    select: {
      id: true,
      revisionId: true,
      snapshot: { select: { formatVersion: true, payload: true } },
    },
  });
  if (!checkpoint) throw new NotFoundError("checkpoint");
  const snapshot = checkpoint.snapshot;
  // A checkpoint always carries a snapshot in M1 — the explicit capture is
  // the only writer, and it creates both in one transaction.
  if (!snapshot) throw new ConflictError("no baseline exists for this novel");
  if (snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw new ConflictError(`unsupported snapshot format version: ${snapshot.formatVersion}`);
  }
  const payload = snapshot.payload as unknown;
  const complete = validateSnapshotComplete(payload);
  if ("problem" in complete) {
    throw new ConflictError(
      complete.problem === "MISSING_TABLE"
        ? `snapshot incomplete: ${complete.table}`
        : `snapshot incomplete: ${complete.problem}`,
    );
  }
  return payload as SnapshotPayload;
}

/**
 * Compute what an apply would do, reading only (C7 "Preview").
 *
 * The **removed** counts are the load-bearing number: apply deletes every
 * covered row the snapshot does not carry, and those rows' content is not
 * recoverable from the change log — `change_set_items` store no before-image
 * (C2, ADR-0014 §2). Preview is where the author learns what apply will
 * destroy, so it is presented as loss, not as a diff.
 */
async function computePreview(
  db: RevisionTx,
  novelId: string,
  payload: SnapshotPayload,
  headRevisionId: string | null,
): Promise<RestorePreview> {
  const counts: RestorePreview["counts"] = {};
  for (const table of COVERED_TABLE_NAMES) {
    const inPayload = new Set(payloadIds(payload, table));
    // The identity column is NOT always `id`: `planning_horizons` and
    // `narrative_dna_profiles` are per-novel singletons keyed by `novel_id`,
    // and reading a nonexistent `id` is a hard 42703, not a wrong count.
    const live = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "${keyColumnFor(table)}" AS id FROM "${table}" t WHERE ${scopeFor(table)}`,
      novelId,
    );
    const liveIds = new Set(live.map((r) => r.id));
    let added = 0;
    let retained = 0;
    for (const id of inPayload) {
      if (liveIds.has(id)) retained += 1;
      else added += 1;
    }
    let removed = 0;
    for (const id of liveIds) if (!inPayload.has(id)) removed += 1;
    counts[table] = { added, removed, retained };
  }

  // Step 0 of apply, computed here so the author sees the refusal before
  // committing to an apply. A payload chapter id with no live row is refused
  // by name whatever its number now holds (C5, C7).
  const liveChapters = await db.chapter.findMany({
    where: { novelId },
    select: { id: true, number: true, status: true, currentVersionId: true },
  });
  const liveChapterById = new Map(liveChapters.map((c) => [c.id, c]));
  const liveChapterByNumber = new Map(liveChapters.map((c) => [c.number, c]));

  const absentChapterIds: string[] = [];
  const chapterNumberReuse: RestorePreview["chapterNumberReuse"] = [];
  const retainedPostBoundaryChapterIds: string[] = [];
  const pointerChanges: RestorePreview["pointerChanges"] = [];
  const publishedPointerConflicts: RestorePreview["publishedPointerConflicts"] = [];

  const payloadChapters = (payload["chapters"] ?? []) as {
    id?: unknown;
    number?: unknown;
    current_version_id?: unknown;
  }[];
  const payloadChapterIds = new Set(payloadIds(payload, "chapters"));

  for (const row of payloadChapters) {
    const id = typeof row.id === "string" ? row.id : null;
    const number = typeof row.number === "number" ? row.number : null;
    if (!id) continue;
    const liveRow = liveChapterById.get(id);
    if (!liveRow) {
      absentChapterIds.push(id);
      // Number reuse is reported with BOTH ids so the author can tell the
      // re-used-number shape from the plain-delete shape.
      const holder = number === null ? undefined : liveChapterByNumber.get(number);
      if (number !== null && holder && holder.id !== id) {
        chapterNumberReuse.push({ payloadChapterId: id, number, liveChapterId: holder.id });
      }
      continue;
    }
    const pinned = typeof row.current_version_id === "string" ? row.current_version_id : null;
    if (liveRow.currentVersionId === pinned) continue;
    if (liveRow.status === "PUBLISHED") {
      // Not a failure: one published chapter must not block recovery of the
      // whole story (C5, C7 step 4).
      publishedPointerConflicts.push({
        chapterId: liveRow.id,
        number: liveRow.number,
        kept: liveRow.currentVersionId,
      });
    } else {
      pointerChanges.push({
        chapterId: liveRow.id,
        from: liveRow.currentVersionId,
        to: pinned,
      });
    }
  }

  for (const c of liveChapters) {
    if (!payloadChapterIds.has(c.id)) retainedPostBoundaryChapterIds.push(c.id);
  }

  return {
    headRevisionId,
    counts,
    absentChapterIds,
    chapterNumberReuse,
    retainedPostBoundaryChapterIds,
    pointerChanges,
    publishedPointerConflicts,
    // Restore rewrites every covered table, so every projection is invalid.
    projections: projectionsForTables([...COVERED_TABLE_NAMES]),
    outsideScope: OUTSIDE_SCOPE,
  };
}

/**
 * NF-WF-020B (F6): DIRTY = the live covered tables differ from the branch
 * head's snapshot (the C7 comparison `computePreview` performs), or the head
 * has no snapshot to compare against. A head without a snapshot can never
 * be proven clean — and can never be switched back to — so it counts as
 * dirty.
 *
 * Exported for NF-WF-020C: merge apply refuses a dirty target the same way
 * a switch refuses a dirty source (Invariant 15 — no stranded work).
 */
export async function isBranchDirty(
  db: RevisionTx,
  novelId: string,
  headRevisionId: string | null,
): Promise<boolean> {
  if (!headRevisionId) return true;
  const snapshot = await db.snapshot.findFirst({
    where: { revisionId: headRevisionId },
    select: { payload: true },
  });
  if (!snapshot) return true;
  const payload = snapshot.payload as unknown as SnapshotPayload;
  const preview = await computePreview(
    db,
    novelId,
    payload,
    headRevisionId,
  );
  for (const table of Object.keys(preview.counts)) {
    const c = preview.counts[table];
    if (c && (c.added > 0 || c.removed > 0)) return true;
  }
  // NF-WF-020B (fix F2): the counts above are ID-set differences only — an
  // in-place UPDATE (same id, changed content, e.g. editing a canon fact's
  // text — the most common author mutation) yields added=0/removed=0 and
  // would be misread as clean, letting a switch silently destroy an
  // un-checkpointed edit. The contract pins "any added/removed/CHANGED
  // covered-table row = dirty", so compare retained rows' content: the
  // snapshot payload rows against the same jsonbProjection of the live
  // rows (the C7 round-trip format — identical projection, so a difference
  // is a genuine content drift).
  for (const table of COVERED_TABLE_NAMES) {
    const key = keyColumnFor(table);
    const pinnedById = new Map<string, string>();
    for (const row of (payload[table] ?? []) as Record<string, unknown>[]) {
      const id = row[key];
      if (typeof id === "string") pinnedById.set(id, canonicalJson(row));
    }
    const live = await db.$queryRawUnsafe<{ id: string; row: unknown }[]>(
      `SELECT "${key}" AS id, ${jsonbProjection(table)} AS row FROM "${table}" t WHERE ${scopeFor(table)}`,
      novelId,
    );
    for (const r of live) {
      const pinned = pinnedById.get(r.id);
      // Absent from the payload = removed — already caught by the counts.
      if (pinned === undefined) continue;
      if (pinned !== canonicalJson(r.row)) return true;
    }
  }
  return false;
}

/**
 * Canonical JSON for row-content comparison (NF-WF-020B, fix F2): object
 * keys sorted recursively so the comparison is insensitive to key order —
 * both the stored snapshot payload and the fresh `to_jsonb` projection are
 * jsonb, whose wire order is already normalized, but canonicalization
 * makes the check robust to either side's serialization.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

export interface RevisionServices {
  listRevisions(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    take?: number;
    skip?: number;
    /**
     * NF-WF-020B: filter to one branch. Defaults to the checked-out branch
     * (F5). Any branch of the novel is readable; mutations enforce the
     * checked-out branch.
     */
    branchId?: string;
  }): Promise<
    {
      id: string;
      number: number;
      origin: RevisionOrigin;
      message: string | null;
      parentRevisionId: string | null;
      createdAt: Date;
      checkpointId: string | null;
      changeSetItems: number;
    }[]
  >;

  createCheckpoint(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    label: string;
    note?: string;
    kind?: RevisionOrigin;
    /**
     * `undefined` asserts no expectation (the head is read under the lock);
     * `null` asserts "no head exists yet" and is compared. The two are not
     * interchangeable — see `AdvanceHeadInput.expectedHeadRevisionId`.
     */
    expectedHeadRevisionId?: string | null;
    /**
     * NF-WF-020B: must be the checked-out branch when provided (F5 default).
     * A checkpoint captures live state, which always reflects the
     * checked-out branch (Invariant 5) — naming another branch is a 409
     * `NOT_ON_CHECKED_OUT_BRANCH`.
     */
    branchId?: string;
  }): Promise<{ checkpointId: string; revisionId: string; number: number; byteSize: number }>;

  listCheckpoints(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    take?: number;
    /**
     * NF-WF-020B: filter to one branch. Defaults to the checked-out branch
     * (F5). Any branch of the novel is readable.
     */
    branchId?: string;
  }): Promise<
    {
      id: string;
      label: string;
      note: string | null;
      kind: RevisionOrigin;
      revisionId: string;
      revisionNumber: number;
      byteSize: number;
      createdAt: Date;
    }[]
  >;

  previewRestore(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    checkpointId: string;
    scope?: string;
    /**
     * NF-WF-020A: selective-restore selection (DOMAIN/ENTITY/SELECTIVE).
     * Type added by 020B for compilation; 020A owns the semantics.
     */
    selection?: {
      domain?: string;
      entityType?: string;
      entityId?: string;
      tables?: string[];
      entityIds?: string[];
    };
    /**
     * NF-WF-020B: must be the checked-out branch when provided (F5 default).
     * The checkpoint's branch must match the effective branch — a
     * cross-branch restore preview is 400 `INVALID_INPUT`.
     */
    branchId?: string;
  }): Promise<{
    restoreOperationId: string;
    /**
     * NF-WF-020A: FULL scope returns RestorePreview; DOMAIN/ENTITY/
     * SELECTIVE return the selective preview shape (scoped counts +
     * dependencyConflicts + selection). Both are JSON-serializable.
     */
    preview: RestorePreview | SelectivePreview;
  }>;

  applyRestore(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    restoreOperationId: string;
    /**
     * NF-WF-020A: acknowledges the preview's dependency conflicts.
     * Required for a DOMAIN/SELECTIVE apply whose preview reported
     * ORPHAN_REFERENCE conflicts; ENTITY never gates.
     */
    acknowledged?: boolean;
  }): Promise<{
    revisionId: string;
    revisionNumber: number;
    status: string;
    publishedPointerConflicts: RestorePreview["publishedPointerConflicts"];
  }>;

  /**
   * NF-WF-020B: create a branch. `name` is UNIQUE per novel; `"main"`
   * (case-insensitive) is reserved → 400. The source defaults to the
   * checked-out branch head; `fromCheckpointId` (the checkpoint's revision
   * becomes the head) or `fromRevisionId` (must have a snapshot, else 409)
   * select another source. `parentBranchId` = the source branch,
   * `sourceRevisionId` = the fork-point revision (020C merge base).
   * Requires `revision:manage`.
   */
  createBranch(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    name: string;
    fromRevisionId?: string;
    fromCheckpointId?: string;
  }): Promise<{
    branchId: string;
    name: string;
    headRevisionId: string | null;
    headRevisionNumber: number | null;
    parentBranchId: string | null;
    sourceRevisionId: string | null;
  }>;

  /**
   * NF-WF-020B: list branches of a novel (name, head number, fork point,
   * updated). Requires `revision:read`.
   */
  listBranches(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<
    {
      id: string;
      name: string;
      headRevisionId: string | null;
      headRevisionNumber: number | null;
      parentBranchId: string | null;
      sourceRevisionId: string | null;
      isCheckedOut: boolean;
      updatedAt: Date;
    }[]
  >;

  /**
   * NF-WF-020B: switch the checked-out branch (temporal model, Invariant 5).
   * Dirty = live covered tables differ from the current head's snapshot
   * (C7 comparison) or the head has no snapshot. Dirty + no
   * `autoCheckpoint` → 409 `DIRTY_SWITCH`; with `autoCheckpoint` a MANUAL
   * checkpoint of the live state is taken first. The switch restores the
   * target head's snapshot (C7), advances the target head with one
   * `BRANCH_SWITCH` revision, and updates `Novel.currentBranchId` — all in
   * one transaction. Switching to the already-checked-out branch is a
   * no-op. Requires `revision:manage`.
   */
  switchBranch(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    branchId: string;
    autoCheckpoint?: boolean;
  }): Promise<{
    branchId: string;
    branchName: string;
    revisionId: string;
    revisionNumber: number;
    switched: boolean;
    autoCheckpointId: string | null;
  }>;

  /**
   * NF-WF-020C: conservative three-way merge preview (read-only).
   *
   * Classifies every entity changed on either side since the merge base
   * into the contract-pinned taxonomy (CLEAN / CONFLICT / DELETED_MODIFIED /
   * ORPHAN_RISK). Conflicts carry both versions + base when snapshots are
   * available. Never writes.
   */
  previewMerge(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    sourceBranchId: string;
    /** Omitted → the checked-out branch (020B tracking). */
    targetBranchId?: string;
    /**
     * NF-WF-024C: `conservative` (default) = 020C behavior unchanged;
     * `semantic` = CONFLICT changes re-examined by the deterministic
     * S1/S2/S3 rules, narrowing to CLEAN only with proof.
     */
    mode?: "conservative" | "semantic";
  }): Promise<MergePreview>;

  /**
   * NF-WF-020C: apply a merge IFF the preview reports zero conflicts.
   *
   * Otherwise throws `MergeError` (409 MERGE_CONFLICTS with the preview as
   * evidence) and writes nothing. On a clean merge: one new MERGE revision
   * on the target branch, the merged state written, and
   * `Novel.currentBranchId` set to the target.
   */
  applyMerge(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    sourceBranchId: string;
    targetBranchId?: string;
    expectedHeadRevisionId?: string | null;
  }): Promise<{
    revisionId: string;
    revisionNumber: number;
    checkpointId: string | null;
    targetBranchId: string;
    mergedEntities: number;
  }>;

  /**
   * NF-WF-020C: one-action bulk rollback to a pre-operation checkpoint
   * (Invariant 15). Only PRE_MUTATION / PRE_IMPORT / PRE_GENERATION
   * checkpoints are recoverable; anything else is refused. The checkpoint's
   * branch must be the checked-out branch.
   */
  rollbackCheckpoint(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    checkpointId: string;
  }): Promise<{
    revisionId: string;
    revisionNumber: number;
    checkpointId: string;
    preview: RestorePreview;
  }>;

  /**
   * NF-WF-020C: the checkpoints `rollbackCheckpoint` will accept, newest
   * first — the Recovery Center's recoverable-operations list.
   */
  listRecoverableCheckpoints(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    take?: number;
  }): Promise<
    {
      id: string;
      label: string;
      note: string | null;
      kind: string;
      revisionId: string;
      revisionNumber: number;
      branchId: string;
      branchName: string;
      byteSize: number;
      createdAt: Date;
    }[]
  >;
}

/** C7: the manuscript pair is coverage, never a restore target. */
function isRestoreTarget(table: string): boolean {
  return COVERED_TABLES.find((t) => t.key === table)?.restoreTarget ?? false;
}

/**
 * NF-WF-020B: the checked-out branch id for a novel — `Novel.currentBranchId`
 * when set, otherwise the `main` branch id (NULL reads as `main`, the
 * pre-020 default). Shared by the branch-aware as-of paths (GAP-040) and the
 * publish guard (Invariant 9).
 */
export async function checkedOutBranchId(
  db: NovelForgeDb,
  novelId: string,
): Promise<string> {
  const novel = await db.novel.findUnique({
    where: { id: novelId },
    select: { currentBranchId: true },
  });
  if (novel?.currentBranchId) {
    const branch = await db.novelBranch.findUnique({
      where: { id: novel.currentBranchId },
      select: { id: true },
    });
    // The FK is ON DELETE SET NULL; fall through to `main` defensively.
    if (branch) return branch.id;
  }
  const main = await db.novelBranch.findUnique({
    where: { novelId_name: { novelId, name: "main" } },
    select: { id: true },
  });
  if (!main) throw new NotFoundError("novel");
  return main.id;
}

export function createRevisionServices({
  db,
  audit,
}: {
  db: NovelForgeDb;
  audit?: AuditService;
}): RevisionServices {
  /** Membership gate — 404 for non-members (ADR-0004), role for caps. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
  }

  async function branchFor(novelId: string, name = "main") {
    const branch = await db.novelBranch.findUnique({
      where: { novelId_name: { novelId, name } },
      select: { id: true, workspaceId: true, headRevisionId: true },
    });
    if (!branch) throw new ConflictError("no baseline exists for this novel");
    return branch;
  }

  /**
   * NF-WF-020B: the checked-out branch — the one whose head the live
   * covered tables reflect (Invariant 5, temporal model). `Novel.currentBranchId`
   * when set, otherwise the `main` branch (the pre-020 default; NULL reads
   * as `main` per the migration contract).
   */
  async function checkedOutBranch(novelId: string, currentBranchId?: string | null) {
    if (currentBranchId) {
      const branch = await db.novelBranch.findUnique({
        where: { id: currentBranchId },
        select: { id: true, name: true, headRevisionId: true },
      });
      // The FK is ON DELETE SET NULL, so a dangling id should not happen;
      // fall through to `main` defensively rather than 500.
      if (branch) return branch;
    }
    const main = await db.novelBranch.findUnique({
      where: { novelId_name: { novelId, name: "main" } },
      select: { id: true, name: true, headRevisionId: true },
    });
    if (!main) throw new ConflictError("no baseline exists for this novel");
    return main;
  }

  /**
   * NF-WF-020B: resolve the effective branch for a mutating route with an
   * optional explicit `branchId` (F5). Omitted → the checked-out branch.
   * Provided and equal to the checked-out branch → it. Provided and
   * different → 409 `NOT_ON_CHECKED_OUT_BRANCH` (the live tables reflect
   * the checked-out branch, so a mutation naming another branch cannot be
   * honored). Unknown branch id → 404.
   */
  async function resolveEffectiveBranch(
    novelId: string,
    currentBranchId: string | null | undefined,
    branchId: string | undefined,
    checkedOut: { id: string; name: string; headRevisionId: string | null },
  ) {
    if (!branchId || branchId === checkedOut.id) return checkedOut;
    const named = await db.novelBranch.findFirst({
      where: { id: branchId, novelId },
      select: { id: true, name: true, headRevisionId: true },
    });
    if (!named) throw new NotFoundError("branch");
    throw new BranchError(
      "NOT_ON_CHECKED_OUT_BRANCH",
      `branch "${named.name}" is not checked out ` +
        `(checked out: "${checkedOut.name}"); switch to it first`,
    );
  }

  /**
   * NF-WF-020A: selective preview (DOMAIN / ENTITY / SELECTIVE).
   *
   * Read-only: resolves the caller's selection, diffs the checkpoint
   * payload against live rows for the scope tables, and reports
   * dependency conflicts. The resolved selection is stored inside the
   * operation row's `preview` JSON so apply rewinds exactly what the
   * preview described (no schema change).
   */
  async function previewSelectiveRestore({
    actorUserId,
    workspaceId,
    novelId,
    checkpointId,
    scope,
    selectionInput,
  }: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    checkpointId: string;
    scope: SelectiveScope;
    selectionInput?: {
      domain?: string;
      entityType?: string;
      entityId?: string;
      tables?: string[];
      entityIds?: string[];
    };
  }) {
    if (scope !== "DOMAIN" && scope !== "ENTITY" && scope !== "SELECTIVE") {
      throw new ConflictError(`unknown restore scope: ${scope}`);
    }
    const selection = await resolveSelection(db, novelId, {
      scope,
      ...selectionInput,
    });
    const branch = await branchFor(novelId);
    const payload = await loadCheckpointPayload(db, checkpointId, novelId);
    const preview = await computeSelectivePreview(db, novelId, payload, selection);
    // The head the preview was built against (moved-head 409 on apply, C7).
    const withHead = {
      ...preview,
      headRevisionId: branch.headRevisionId,
      checkpointId,
    };
    const row = await db.restoreOperation.create({
      data: {
        workspaceId,
        novelId,
        branchId: branch.id,
        sourceCheckpointId: checkpointId,
        status: "PREVIEWED",
        scope,
        preview: withHead as never,
        requestedById: actorUserId,
      },
      select: { id: true },
    });
    await audit?.record({
      actorUserId,
      workspaceId,
      action: "restore.previewed",
      entityType: "RestoreOperation",
      entityId: row.id,
      payload: {
        novelId,
        checkpointId,
        scope,
        selection: {
          domain: selection.domain ?? null,
          tables: selection.tables,
          entityCount: selection.entityRefs.length,
        },
        conflictCount: preview.dependencyConflicts.length,
      },
    });
    return { restoreOperationId: row.id, preview: withHead };
  }

  /**
   * NF-WF-020A: selective apply (DOMAIN / ENTITY / SELECTIVE).
   *
   * Rewinds exactly the stored selection via the surgical apply
   * (UPDATE-in-place for retained rows, DELETE only for rows absent
   * from the payload). DOMAIN/SELECTIVE with dependency conflicts
   * require `acknowledged`; ENTITY conflicts are informational (the
   * closure is rewound by definition — F4).
   */
  async function applySelectiveRestore({
    actorUserId,
    workspaceId,
    novelId,
    operation,
    acknowledged = false,
  }: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    operation: {
      id: string;
      status: string;
      sourceCheckpointId: string;
      scope: string;
      preview: unknown;
    };
    acknowledged?: boolean;
  }) {
    const preview = operation.preview as unknown as SelectivePreview & {
      headRevisionId: string | null;
      checkpointId: string;
    };
    const selection = preview.selection as ResolvedSelection;
    if (!selection || !Array.isArray(selection.tables)) {
      throw new ConflictError("restore operation has no stored selection");
    }

    // Acknowledgment gate (020A): DOMAIN/SELECTIVE with dependency
    // conflicts refuse an unacknowledged apply; ENTITY never gates.
    const needsAck =
      selection.scope !== "ENTITY" &&
      preview.dependencyConflicts.some((c) => c.kind === "ORPHAN_REFERENCE");
    if (needsAck && !acknowledged) {
      throw new SelectiveRestoreError(
        409,
        "UNACKNOWLEDGED_CONFLICTS",
        "restore has unacknowledged dependency conflicts; " +
          "review the conflict report and apply with acknowledged=true",
      );
    }

    // The apply refuses a moved head, same as FULL (C7).
    await assertHeadExpectation(db, {
      novelId,
      expectedHeadRevisionId: preview.headRevisionId,
    });

    const result = await db.$transaction(async (tx) => {
      const payload = await loadCheckpointPayload(
        tx,
        operation.sourceCheckpointId,
        novelId,
      );
      // Step 1 — the plan is computed from pure reads only (C4): the
      // diff, the orphan-handling plan, and the change-set items are
      // decided before the revision advance, so the PRE_MUTATION
      // checkpoint pins the pre-restore image, never the post-restore one.
      const plan = await planSelectiveRestore(
        tx,
        novelId,
        payload,
        selection,
        preview.dependencyConflicts,
        selection.scope === "ENTITY" ? true : acknowledged,
      );

      // Step 2 — the revision is created BEFORE the state writes (C4),
      // with the PRE_MUTATION checkpoint pinned to the pre-restore
      // image. The lock this takes is what makes the head comparison
      // above hold for the whole transaction.
      const scopeLabel =
        selection.scope === "DOMAIN"
          ? `DOMAIN ${selection.domain}`
          : selection.scope;
      const advanced = await advanceHead(tx, {
        workspaceId,
        novelId,
        expectedHeadRevisionId: preview.headRevisionId,
        origin: "RESTORE",
        operation: "restore.apply",
        message:
          `selective restore (${scopeLabel}) to checkpoint ${operation.sourceCheckpointId}` +
          (acknowledged ? " (conflicts acknowledged)" : ""),
        actorUserId,
        tables: selection.tables,
        items: [
          {
            entityType: "RestoreOperation",
            entityId: operation.id,
            operation: "UPDATE" as const,
          },
          // The selective scope + acknowledgment are recorded in the
          // change set (020A acceptance).
          {
            entityType: "SelectiveRestoreScope",
            entityId: operation.id,
            operation: "UPDATE" as const,
          },
          ...plan.items.map((item) => ({
            ...item,
            operation: item.operation as "CREATE" | "UPDATE" | "DELETE",
          })),
        ],
        checkpoint: { kind: "PRE_MUTATION", pin: "PREVIOUS" },
      });
      const snapshotId = advanced.snapshotId;
      if (!snapshotId) {
        throw new ConflictError(
          "snapshot incomplete: selective restore produced no snapshot",
        );
      }

      // Step 3 — execute the planned state writes (after the advance, so
      // the checkpoint above pinned the pre-restore image).
      await executeSelectiveRestore(tx, novelId, selection, plan);

      await tx.restoreOperation.update({
        where: { id: operation.id },
        data: {
          status: "APPLIED",
          targetRevisionId: advanced.revisionId,
          appliedAt: new Date(),
          preview: {
            ...(preview as object),
            selection: { ...selection, acknowledged },
          } as never,
        },
      });

      return {
        revisionId: advanced.revisionId,
        revisionNumber: advanced.number,
        status: "APPLIED",
        publishedPointerConflicts: [],
      };
    });

    await audit?.record({
      actorUserId,
      workspaceId,
      action: "restore.applied",
      entityType: "RestoreOperation",
      entityId: operation.id,
      payload: {
        novelId,
        checkpointId: operation.sourceCheckpointId,
        scope: selection.scope,
        acknowledged,
        revisionId: result.revisionId,
      },
    });
    return result;
  }

  return {
    async listRevisions({ actorUserId, workspaceId, novelId, take = 50, skip = 0, branchId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      // F5: default to the checked-out branch. Any branch of the novel is
      // readable; unknown branch id → 404.
      let effectiveBranchId: string;
      if (branchId) {
        const named = await db.novelBranch.findFirst({
          where: { id: branchId, novelId },
          select: { id: true },
        });
        if (!named) throw new NotFoundError("branch");
        effectiveBranchId = named.id;
      } else {
        effectiveBranchId = (await checkedOutBranch(novelId, novel.currentBranchId)).id;
      }
      const revisions = await db.revision.findMany({
        where: { novelId, branchId: effectiveBranchId },
        orderBy: { number: "desc" },
        take,
        skip,
        select: {
          id: true,
          number: true,
          origin: true,
          message: true,
          parentRevisionId: true,
          createdAt: true,
          checkpoints: { select: { id: true }, take: 1 },
          changeSet: { select: { _count: { select: { items: true } } } },
        },
      });
      return revisions.map((r) => ({
        id: r.id,
        number: r.number,
        origin: r.origin,
        message: r.message,
        parentRevisionId: r.parentRevisionId,
        createdAt: r.createdAt,
        checkpointId: r.checkpoints[0]?.id ?? null,
        changeSetItems: r.changeSet?._count.items ?? 0,
      }));
    },

    async createCheckpoint({
      actorUserId,
      workspaceId,
      novelId,
      label,
      note,
      kind = "MANUAL",
      expectedHeadRevisionId,
      branchId,
    }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);
      // A checkpoint captures live state, which always reflects the
      // checked-out branch (Invariant 5) — naming another branch is a 409.
      const effective = await resolveEffectiveBranch(novelId, novel.currentBranchId, branchId, checkedOut);
      const created = await db.$transaction(async (tx) => {
        // The checkpoint takes the same branch lock every covered mutation
        // takes, so a capture and a mutation cannot interleave (C8). It pins
        // the revision it just created — the state the author is marking.
        const head = await advanceHead(tx, {
          workspaceId,
          novelId,
          branchName: effective.name,
          expectedHeadRevisionId,
          origin: kind,
          operation: "checkpoint.create",
          message: label,
          actorUserId,
          // A checkpoint changes no story state, so nothing is invalidated.
          tables: [],
          checkpoint: { kind, label, note: note ?? null, pin: "NEW" },
        });
        const snapshotId = head.snapshotId;
        if (!snapshotId) {
          throw new ConflictError("snapshot incomplete: checkpoint capture produced no snapshot");
        }
        const snapshot = await tx.snapshot.findUniqueOrThrow({
          where: { id: snapshotId },
          select: { byteSize: true },
        });
        return {
          checkpointId: head.checkpointId as string,
          revisionId: head.revisionId,
          number: head.number,
          byteSize: snapshot.byteSize,
        };
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "checkpoint.created",
        entityType: "Checkpoint",
        entityId: created.checkpointId,
        payload: { novelId, label, kind, revisionNumber: created.number },
      });
      return created;
    },

    async listCheckpoints({ actorUserId, workspaceId, novelId, take = 50, branchId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      // F5: default to the checked-out branch. Any branch of the novel is
      // readable; unknown branch id → 404.
      let effectiveBranchId: string;
      if (branchId) {
        const named = await db.novelBranch.findFirst({
          where: { id: branchId, novelId },
          select: { id: true },
        });
        if (!named) throw new NotFoundError("branch");
        effectiveBranchId = named.id;
      } else {
        effectiveBranchId = (await checkedOutBranch(novelId, novel.currentBranchId)).id;
      }
      const rows = await db.checkpoint.findMany({
        where: { novelId, branchId: effectiveBranchId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          label: true,
          note: true,
          kind: true,
          revisionId: true,
          createdAt: true,
          revision: { select: { number: true } },
          snapshot: { select: { byteSize: true } },
        },
      });
      return rows.map((c) => ({
        id: c.id,
        label: c.label,
        note: c.note,
        kind: c.kind,
        revisionId: c.revisionId,
        revisionNumber: c.revision.number,
        byteSize: c.snapshot.byteSize,
        createdAt: c.createdAt,
      }));
    },

    async previewRestore({
      actorUserId,
      workspaceId,
      novelId,
      checkpointId,
      scope = "FULL",
      selection: selectionInput,
      branchId,
    }: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      checkpointId: string;
      scope?: string;
      selection?: {
        domain?: string;
        entityType?: string;
        entityId?: string;
        tables?: string[];
        entityIds?: string[];
      };
      branchId?: string;
    }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);
      // NF-WF-020B (F5): the effective branch defaults to the checked-out
      // branch; naming another branch is a 409 (the preview is built against
      // live state, which reflects the checked-out branch).
      const effective = await resolveEffectiveBranch(novelId, novel.currentBranchId, branchId, checkedOut);
      // The checkpoint must belong to the effective branch — a cross-branch
      // restore preview is meaningless (the head it compares against is on
      // another lineage).
      const checkpointBranch = await db.checkpoint.findFirst({
        where: { id: checkpointId, novelId },
        select: { branchId: true },
      });
      if (!checkpointBranch) throw new NotFoundError("checkpoint");
      if (checkpointBranch.branchId !== effective.id) {
        // NF-WF-020B (fix F3): distinct 400 code naming the actual problem —
        // the checkpoint belongs to another branch, not a bad branch name.
        throw new BranchError(
          "CHECKPOINT_BRANCH_MISMATCH",
          "checkpoint does not belong to the branch",
        );
      }
      // NF-WF-020A: DOMAIN/ENTITY/SELECTIVE go through the selective
      // path (selection resolution + dependency analysis).
      if (scope !== "FULL") {
        return previewSelectiveRestore({
          actorUserId,
          workspaceId,
          novelId,
          checkpointId,
          scope: scope as SelectiveScope,
          selectionInput,
        });
      }
      // NF-WF-020B (fix F1): the FULL path is branch-aware end-to-end — the
      // preview pins the effective branch's head (not main's) and the
      // operation records the effective branch, so apply honors the restore
      // on any checked-out branch (Invariant 5: operate per branch).
      const payload = await loadCheckpointPayload(db, checkpointId, novelId);
      const preview = await computePreview(db, novelId, payload, effective.headRevisionId);
      const row = await db.restoreOperation.create({
        data: {
          workspaceId,
          novelId,
          branchId: effective.id,
          sourceCheckpointId: checkpointId,
          status: "PREVIEWED",
          scope: "FULL",
          preview: preview as never,
          requestedById: actorUserId,
        },
        select: { id: true },
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "restore.previewed",
        entityType: "RestoreOperation",
        entityId: row.id,
        payload: { novelId, checkpointId },
      });
      return { restoreOperationId: row.id, preview };
    },

    async applyRestore({ actorUserId, workspaceId, novelId, restoreOperationId, acknowledged = false }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const operation = await db.restoreOperation.findFirst({
        where: { id: restoreOperationId, novelId, workspaceId },
        select: {
          id: true,
          status: true,
          sourceCheckpointId: true,
          scope: true,
          preview: true,
          branchId: true,
        },
      });
      if (!operation) throw new NotFoundError("restore");
      if (operation.status !== "PREVIEWED") {
        throw new ConflictError(`restore is already ${operation.status.toLowerCase()}`);
      }
      // NF-WF-020B: the operation's branch must still be checked out — the
      // author may have switched branches between preview and apply.
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);
      if (operation.branchId !== checkedOut.id) {
        throw new BranchError(
          "NOT_ON_CHECKED_OUT_BRANCH",
          "restore was previewed on a branch that is no longer checked out; " +
            "switch back to it or preview again",
        );
      }
      // NF-WF-020A: non-FULL scopes go through the selective apply.
      if (operation.scope !== "FULL") {
        return applySelectiveRestore({
          actorUserId,
          workspaceId,
          novelId,
          operation,
          acknowledged,
        });
      }
      const preview = operation.preview as unknown as RestorePreview;

      // The apply refuses a moved head: impact is recomputed by the author,
      // not applied against a stale plan (C7). Server-pinned rather than
      // client-supplied — the expectation is the head the preview was built
      // against — but the same two-part check as the mutation routes.
      // NF-WF-020B (fix F1): branch-aware — the head compared is the
      // checked-out branch's head, matching the preview's pin.
      await assertHeadExpectation(db, {
        novelId,
        branchName: checkedOut.name,
        expectedHeadRevisionId: preview.headRevisionId,
      });

      const result = await db.$transaction(async (tx) => {
        const payload = await loadCheckpointPayload(tx, operation.sourceCheckpointId, novelId);

        // Step 0 — before the first write. Every payload chapter id must be
        // live, whatever its number now holds. The failure this prevents is
        // an FK violation from re-inserting scenes/outline_nodes for a
        // deleted chapter, which would surface as an unmapped 500 (C7).
        const liveChapters = await tx.chapter.findMany({
          where: { novelId },
          select: { id: true, number: true, status: true, currentVersionId: true },
        });
        const liveById = new Map(liveChapters.map((c) => [c.id, c]));
        for (const id of payloadIds(payload, "chapters")) {
          if (!liveById.has(id)) {
            throw new ConflictError(`chapter identity conflict: chapter ${id} is gone`);
          }
        }

        // Step 4's decisions are read before the writes so they can be
        // recorded in the restore's change set, which is written first.
        const pointerWrites: { chapterId: string; to: string | null }[] = [];
        const conflicts: RestorePreview["publishedPointerConflicts"] = [];
        for (const row of (payload["chapters"] ?? []) as {
          id?: unknown;
          current_version_id?: unknown;
        }[]) {
          if (typeof row.id !== "string") continue;
          const live = liveById.get(row.id);
          if (!live) continue;
          const pinned =
            typeof row.current_version_id === "string" ? row.current_version_id : null;
          if (live.currentVersionId === pinned) continue;
          if (live.status === "PUBLISHED") {
            // Skipped deliberately and surfaced, never silently inconsistent.
            conflicts.push({
              chapterId: live.id,
              number: live.number,
              kept: live.currentVersionId,
            });
          } else {
            pointerWrites.push({ chapterId: live.id, to: pinned });
          }
        }

        // Step 5's revision is created BEFORE the state writes: C4 puts the
        // revision insert ahead of the mutation, and the restore's own
        // PRE_MUTATION snapshot must be the pre-restore image. The lock this
        // takes is what makes the head comparison above hold for the whole
        // transaction.
        const advanced = await advanceHead(tx, {
          workspaceId,
          novelId,
          // NF-WF-020B (fix F1): advance the checked-out branch's head, not
          // main's — the restore operation was previewed against it.
          branchName: checkedOut.name,
          expectedHeadRevisionId: preview.headRevisionId,
          origin: "RESTORE",
          operation: "restore.apply",
          message: `restore to checkpoint ${operation.sourceCheckpointId}`,
          actorUserId,
          tables: [...COVERED_TABLE_NAMES],
          items: [
            { entityType: "RestoreOperation", entityId: operation.id, operation: "UPDATE" },
            // A skipped PUBLISHED pointer is recorded, not silently dropped
            // (C7 step 4).
            ...conflicts.map((c) => ({
              entityType: "Chapter",
              entityId: c.chapterId,
              operation: "UPDATE" as const,
            })),
          ],
          checkpoint: { kind: "PRE_MUTATION", pin: "PREVIOUS" },
        });

        // Step 2 — delete in reverse FK order, except the manuscript pair.
        for (const table of [...COVERED_TABLE_NAMES].reverse()) {
          if (!isRestoreTarget(table)) continue;
          await tx.$executeRawUnsafe(`DELETE FROM "${table}" t WHERE ${scopeFor(table)}`, novelId);
        }

        // Step 3 — re-insert in FK order, except the manuscript pair.
        for (const table of COVERED_TABLE_NAMES) {
          if (!isRestoreTarget(table)) continue;
          const rows = payload[table] ?? [];
          if (rows.length === 0) continue;
          await tx.$executeRawUnsafe(
            `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(null::"${table}", $1::jsonb)`,
            JSON.stringify(rows),
          );
        }

        // Step 4 — rewind the pointer in place; PUBLISHED chapters keep theirs.
        for (const w of pointerWrites) {
          await tx.chapter.update({
            where: { id: w.chapterId },
            data: { currentVersionId: w.to },
          });
        }

        await tx.restoreOperation.update({
          where: { id: operation.id },
          data: {
            status: "APPLIED",
            targetRevisionId: advanced.revisionId,
            appliedAt: new Date(),
          },
        });

        return {
          revisionId: advanced.revisionId,
          revisionNumber: advanced.number,
          status: "APPLIED",
          publishedPointerConflicts: conflicts,
        };
      });

      await audit?.record({
        actorUserId,
        workspaceId,
        action: "restore.applied",
        entityType: "RestoreOperation",
        entityId: operation.id,
        payload: {
          novelId,
          checkpointId: operation.sourceCheckpointId,
          revisionNumber: result.revisionNumber,
          skippedPublishedPointers: result.publishedPointerConflicts.length,
        },
      });
      return result;
    },

    // ------------------------------------------------------------------
    // NF-WF-020B: branch lifecycle (temporal model, Invariant 5).
    // ------------------------------------------------------------------

    async createBranch({ actorUserId, workspaceId, novelId, name, fromRevisionId, fromCheckpointId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");

      // Name validation: non-empty, `main` reserved (case-insensitive),
      // UNIQUE per novel → 400 (contract acceptance).
      const trimmed = name.trim();
      if (!trimmed) throw new BranchError("INVALID_BRANCH_NAME", "branch name must not be empty");
      if (trimmed.toLowerCase() === "main") {
        throw new BranchError("INVALID_BRANCH_NAME", 'branch name "main" is reserved');
      }
      if (trimmed.length > 100) {
        throw new BranchError("INVALID_BRANCH_NAME", "branch name must be at most 100 characters");
      }
      const duplicate = await db.novelBranch.findUnique({
        where: { novelId_name: { novelId, name: trimmed } },
        select: { id: true },
      });
      if (duplicate) throw new BranchError("BRANCH_EXISTS", `branch "${trimmed}" already exists`);

      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);

      // Resolve the source: checkpoint > revision > checked-out head.
      let parentBranchId: string;
      let sourceRevisionId: string;
      let headRevisionId: string | null;
      if (fromCheckpointId) {
        const cp = await db.checkpoint.findFirst({
          where: { id: fromCheckpointId, novelId },
          select: {
            id: true,
            revisionId: true,
            branchId: true,
            revision: { select: { number: true } },
          },
        });
        if (!cp) throw new NotFoundError("checkpoint");
        parentBranchId = cp.branchId;
        sourceRevisionId = cp.revisionId;
        headRevisionId = cp.revisionId;
      } else if (fromRevisionId) {
        const rev = await db.revision.findFirst({
          where: { id: fromRevisionId, novelId },
          select: {
            id: true,
            branchId: true,
            number: true,
            snapshot: { select: { id: true } },
          },
        });
        if (!rev) throw new NotFoundError("revision");
        // A branch head must be restorable: without a snapshot the branch
        // could never be switched to (no state to restore). 409, not 400 —
        // the input is well-formed but the revision cannot serve as a fork
        // point.
        if (!rev.snapshot) {
          throw new BranchError(
            "NO_BRANCH_SNAPSHOT",
            "revision has no snapshot; create a checkpoint at it first",
          );
        }
        parentBranchId = rev.branchId;
        sourceRevisionId = rev.id;
        headRevisionId = rev.id;
      } else {
        parentBranchId = checkedOut.id;
        if (!checkedOut.headRevisionId) {
          throw new ConflictError("no baseline exists for this novel");
        }
        sourceRevisionId = checkedOut.headRevisionId;
        headRevisionId = checkedOut.headRevisionId;
      }

      const branch = await db.novelBranch.create({
        data: {
          workspaceId,
          novelId,
          name: trimmed,
          parentBranchId,
          sourceRevisionId,
          headRevisionId,
        },
        select: { id: true, name: true, headRevisionId: true },
      });

      const headNumber = headRevisionId
        ? (
            await db.revision.findUnique({
              where: { id: headRevisionId },
              select: { number: true },
            })
          )?.number ?? null
        : null;

      await audit?.record({
        actorUserId,
        workspaceId,
        action: "branch.created",
        entityType: "NovelBranch",
        entityId: branch.id,
        payload: { novelId, name: trimmed, parentBranchId, sourceRevisionId },
      });

      return {
        branchId: branch.id,
        name: branch.name,
        headRevisionId: branch.headRevisionId,
        headRevisionNumber: headNumber,
        parentBranchId,
        sourceRevisionId,
      };
    },

    async listBranches({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);
      const rows = await db.novelBranch.findMany({
        where: { novelId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          headRevisionId: true,
          parentBranchId: true,
          sourceRevisionId: true,
          updatedAt: true,
          headRevision: { select: { number: true } },
        },
      });
      return rows.map((b) => ({
        id: b.id,
        name: b.name,
        headRevisionId: b.headRevisionId,
        headRevisionNumber: b.headRevision?.number ?? null,
        parentBranchId: b.parentBranchId,
        sourceRevisionId: b.sourceRevisionId,
        isCheckedOut: b.id === checkedOut.id,
        updatedAt: b.updatedAt,
      }));
    },

    async switchBranch({ actorUserId, workspaceId, novelId, branchId, autoCheckpoint = false }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");

      const current = await checkedOutBranch(novelId, novel.currentBranchId);
      const target = await db.novelBranch.findFirst({
        where: { id: branchId, novelId },
        select: { id: true, name: true, headRevisionId: true },
      });
      if (!target) throw new NotFoundError("branch");

      // Idempotent no-op: already on the target.
      if (target.id === current.id) {
        const headNumber = current.headRevisionId
          ? (
              await db.revision.findUnique({
                where: { id: current.headRevisionId },
                select: { number: true },
              })
            )?.number ?? 0
          : 0;
        return {
          branchId: target.id,
          branchName: target.name,
          revisionId: current.headRevisionId ?? "",
          revisionNumber: headNumber,
          switched: false,
          autoCheckpointId: null,
        };
      }

      // DIRTY check (F6): live covered tables vs the current head's snapshot
      // (C7 comparison). No snapshot at the head, or any added/removed row,
      // means unsaved work that a switch would strand.
      const dirty = await isBranchDirty(db, novelId, current.headRevisionId);
      if (dirty && !autoCheckpoint) {
        throw new BranchError(
          "DIRTY_SWITCH",
          "the checked-out branch has unsaved changes; " +
            "create a checkpoint first or retry with autoCheckpoint: true",
        );
      }

      // The target head must be restorable.
      const targetSnapshot = target.headRevisionId
        ? await db.snapshot.findFirst({
            where: { revisionId: target.headRevisionId },
            select: { id: true, payload: true },
          })
        : null;
      if (!targetSnapshot) {
        throw new BranchError(
          "NO_BRANCH_SNAPSHOT",
          `branch "${target.name}" has no snapshot at its head; ` +
            "create a checkpoint on the branch first",
        );
      }
      const targetPayload = targetSnapshot.payload as unknown as SnapshotPayload;

      const result = await db.$transaction(async (tx) => {
        let autoCheckpointId: string | null = null;

        // Save the dirty state first (takes the current branch's lock).
        if (dirty) {
          const cp = await advanceHead(tx, {
            workspaceId,
            novelId,
            branchName: current.name,
            origin: "MANUAL",
            operation: "branch.switch.auto_checkpoint",
            message: `auto-checkpoint before switch to ${target.name}`,
            actorUserId,
            tables: [],
            checkpoint: {
              kind: "MANUAL",
              label: `auto-checkpoint before switch to ${target.name}`,
              pin: "NEW",
            },
          });
          autoCheckpointId = cp.checkpointId;
        }

        // Step 0 — the target payload's chapters must all be live (C7).
        const liveChapters = await tx.chapter.findMany({
          where: { novelId },
          select: { id: true, number: true, status: true, currentVersionId: true },
        });
        const liveById = new Map(liveChapters.map((c) => [c.id, c]));
        for (const id of payloadIds(targetPayload, "chapters")) {
          if (!liveById.has(id)) {
            throw new ConflictError(`chapter identity conflict: chapter ${id} is gone`);
          }
        }

        // Step 4's pointer decisions, read before the writes.
        const pointerWrites: { chapterId: string; to: string | null }[] = [];
        const conflicts: RestorePreview["publishedPointerConflicts"] = [];
        for (const row of (targetPayload["chapters"] ?? []) as {
          id?: unknown;
          current_version_id?: unknown;
        }[]) {
          if (typeof row.id !== "string") continue;
          const live = liveById.get(row.id);
          if (!live) continue;
          const pinned =
            typeof row.current_version_id === "string" ? row.current_version_id : null;
          if (live.currentVersionId === pinned) continue;
          if (live.status === "PUBLISHED") {
            conflicts.push({
              chapterId: live.id,
              number: live.number,
              kept: live.currentVersionId,
            });
          } else {
            pointerWrites.push({ chapterId: live.id, to: pinned });
          }
        }
        if (conflicts.length > 0) {
          throw new ConflictError(
            `switch refused: ${conflicts.length} published chapter pointer(s) would move`,
          );
        }

        // Advance the TARGET head (takes the target branch's lock). No
        // checkpoint here: the snapshot is captured AFTER the state writes
        // below, so the BRANCH_SWITCH revision pins the post-switch state —
        // the image future dirty checks and switches-to-this-branch need.
        const advanced = await advanceHead(tx, {
          workspaceId,
          novelId,
          branchName: target.name,
          origin: "BRANCH_SWITCH",
          operation: "branch.switch",
          message: `switched to branch ${target.name}`,
          actorUserId,
          tables: [...COVERED_TABLE_NAMES],
          items: [
            { entityType: "NovelBranch", entityId: target.id, operation: "UPDATE" as const },
          ],
        });

        // C7 state rewrite: delete in reverse FK order, re-insert in FK
        // order, except the manuscript pair (never a restore target).
        for (const table of [...COVERED_TABLE_NAMES].reverse()) {
          if (!isRestoreTarget(table)) continue;
          await tx.$executeRawUnsafe(`DELETE FROM "${table}" t WHERE ${scopeFor(table)}`, novelId);
        }
        for (const table of COVERED_TABLE_NAMES) {
          if (!isRestoreTarget(table)) continue;
          const rows = targetPayload[table] ?? [];
          if (rows.length === 0) continue;
          await tx.$executeRawUnsafe(
            `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(null::"${table}", $1::jsonb)`,
            JSON.stringify(rows),
          );
        }
        for (const w of pointerWrites) {
          await tx.chapter.update({
            where: { id: w.chapterId },
            data: { currentVersionId: w.to },
          });
        }

        // Pin the post-switch snapshot to the BRANCH_SWITCH revision.
        const snapPayload = await captureSnapshot(tx, novelId);
        assertComplete(snapPayload);
        const snapBody = JSON.stringify(snapPayload);
        await tx.snapshot.create({
          data: {
            workspaceId,
            novelId,
            branchId: target.id,
            revisionId: advanced.revisionId,
            formatVersion: SNAPSHOT_FORMAT_VERSION,
            storage: "INLINE",
            payload: snapPayload as never,
            byteSize: snapBody.length,
          },
        });

        // The temporal-model pointer: live tables now reflect the target.
        await tx.novel.update({
          where: { id: novelId },
          data: { currentBranchId: target.id },
        });

        return {
          branchId: target.id,
          branchName: target.name,
          revisionId: advanced.revisionId,
          revisionNumber: advanced.number,
          switched: true,
          autoCheckpointId,
        };
      });

      await audit?.record({
        actorUserId,
        workspaceId,
        action: "branch.switched",
        entityType: "NovelBranch",
        entityId: target.id,
        payload: {
          novelId,
          fromBranchId: current.id,
          revisionNumber: result.revisionNumber,
          autoCheckpointId: result.autoCheckpointId,
        },
      });
      return result;
    },

    // ------------------------------------------------------------------
    // NF-WF-020C: conservative merge + bulk recovery.
    // ------------------------------------------------------------------

    async previewMerge({ actorUserId, workspaceId, novelId, sourceBranchId, targetBranchId, mode }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const preview = await computeMergePreview(db, novelId, sourceBranchId, targetBranchId);
      // NF-WF-024C: semantic mode narrows CONFLICT → CLEAN only with proof
      // (S1/S2/S3). Default (conservative) returns 020C behavior unchanged.
      if (mode === "semantic") {
        const { applySemanticMerge } = await import("./semantic-merge.ts");
        const changes = applySemanticMerge(preview.changes);
        const summary = {
          clean: changes.filter((c) => c.kind === "CLEAN").length,
          conflict: changes.filter((c) => c.kind === "CONFLICT").length,
          deletedModified: changes.filter((c) => c.kind === "DELETED_MODIFIED").length,
          orphanRisk: changes.filter((c) => c.kind === "ORPHAN_RISK").length,
        };
        return {
          ...preview,
          changes,
          summary,
          canApply: summary.conflict === 0 && summary.deletedModified === 0,
        };
      }
      return preview;
    },

    async applyMerge({
      actorUserId,
      workspaceId,
      novelId,
      sourceBranchId,
      targetBranchId,
      expectedHeadRevisionId,
    }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");

      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);

      const source = await db.novelBranch.findFirst({
        where: { id: sourceBranchId, novelId },
        select: { id: true, name: true, headRevisionId: true },
      });
      if (!source) throw new NotFoundError("branch");
      const target = targetBranchId
        ? await db.novelBranch.findFirst({
            where: { id: targetBranchId, novelId },
            select: { id: true, name: true, headRevisionId: true },
          })
        : checkedOut;
      if (!target) throw new NotFoundError("branch");
      if (source.id === target.id) {
        throw new MergeError("MERGE_NO_BASE", "cannot merge a branch into itself");
      }

      // Invariant 5: the live covered tables are the target's state. Merging
      // into a branch that is not checked out would strand the author's live
      // work — refuse, like DIRTY_SWITCH refuses a dirty switch.
      if (target.id !== checkedOut.id) {
        throw new MergeError(
          "NOT_ON_TARGET_BRANCH",
          `target branch "${target.name}" is not checked out (checked out: "${checkedOut.name}"); switch to it first`,
        );
      }

      // The preview is recomputed inside the write transaction below; this
      // outer computation is for the conflict refusal, which must happen
      // before any write (delivery-plan :57).
      const preview = await computeMergePreview(db, novelId, source.id, target.id);
      const conflicts = preview.changes.filter(
        (c) => c.kind === "CONFLICT" || c.kind === "DELETED_MODIFIED",
      );
      if (conflicts.length > 0) {
        throw new MergeError(
          "MERGE_CONFLICTS",
          `merge has ${conflicts.length} conflict(s); resolve them before applying`,
          preview,
        );
      }
      if (!preview.snapshotsAvailable) {
        throw new MergeError(
          "MERGE_NO_SNAPSHOT",
          "merge needs a snapshot at the source head and the target head; create a checkpoint on each branch first",
        );
      }

      // The target must be clean: the merged payload overwrites the live
      // tables, so un-checkpointed work would be silently destroyed.
      if (await isBranchDirty(db, novelId, target.headRevisionId)) {
        throw new MergeError(
          "MERGE_DIRTY_TARGET",
          `target branch "${target.name}" has unsaved changes; create a checkpoint first`,
        );
      }

      const result = await db.$transaction(async (tx) => {
        // Recompute under the branch lock: the head may have moved between
        // the outer preview and this transaction (C4).
        const lockedPreview = await computeMergePreview(tx, novelId, source.id, target.id);
        const lockedConflicts = lockedPreview.changes.filter(
          (c) => c.kind === "CONFLICT" || c.kind === "DELETED_MODIFIED",
        );
        if (lockedConflicts.length > 0) {
          throw new MergeError(
            "MERGE_CONFLICTS",
            `merge has ${lockedConflicts.length} conflict(s); resolve them before applying`,
            lockedPreview,
          );
        }

        const sourcePayload = await snapshotForRevision(tx, source.headRevisionId!);
        const targetPayload = await snapshotForRevision(tx, target.headRevisionId!);
        // snapshotsAvailable was verified above; re-verify under the lock.
        if (!sourcePayload || !targetPayload) {
          throw new MergeError(
            "MERGE_NO_SNAPSHOT",
            "merge needs a snapshot at the source head and the target head; create a checkpoint on each branch first",
          );
        }

        const merged = buildMergedPayload(targetPayload, sourcePayload, lockedPreview.changes);

        // One MERGE revision on the target branch. `branch.merge` is HIGH
        // (C3), so the PRE_MUTATION checkpoint is captured automatically,
        // pinned to the pre-merge head (Invariant 15).
        const mergedEntities = lockedPreview.changes.filter((c) =>
          c.changedOn.includes("source"),
        ).length;
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          branchName: target.name,
          expectedHeadRevisionId,
          origin: "MERGE",
          operation: "branch.merge",
          message: `merge branch "${source.name}" into "${target.name}" (${mergedEntities} entit${mergedEntities === 1 ? "y" : "ies"} from source)`,
          actorUserId,
          tables: [...COVERED_TABLE_NAMES],
          items: lockedPreview.changes
            .filter((c) => c.kind === "CLEAN" || c.kind === "ORPHAN_RISK")
            .map((c) => ({
              entityType: c.entityType,
              entityId: c.entityId,
              operation: (c.operations.includes("DELETE") ? "DELETE" : "UPDATE") as "CREATE" | "UPDATE" | "DELETE",
            })),
        });

        await writePayloadTables(tx, novelId, merged);

        // 020B tracking: the merge lands on the target, so the target is
        // checked out (it already was — the precondition above).
        await tx.novel.update({
          where: { id: novelId },
          data: { currentBranchId: target.id },
        });

        return {
          revisionId: advanced.revisionId,
          revisionNumber: advanced.number,
          checkpointId: advanced.checkpointId,
          targetBranchId: target.id,
          mergedEntities,
        };
      });

      await audit?.record({
        actorUserId,
        workspaceId,
        action: "branch.merged",
        entityType: "NovelBranch",
        entityId: target.id,
        payload: {
          novelId,
          sourceBranchId: source.id,
          targetBranchId: target.id,
          revisionNumber: result.revisionNumber,
          mergedEntities: result.mergedEntities,
        },
      });
      return result;
    },

    async rollbackCheckpoint({ actorUserId, workspaceId, novelId, checkpointId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");

      const checkpoint = await db.checkpoint.findFirst({
        where: { id: checkpointId, novelId, workspaceId },
        select: {
          id: true,
          kind: true,
          label: true,
          revisionId: true,
          branchId: true,
          snapshotId: true,
          branch: { select: { id: true, name: true, headRevisionId: true } },
        },
      });
      if (!checkpoint) throw new NotFoundError("checkpoint");

      // Bulk scope = the C3 HIGH list's pre-operation checkpoints. A MANUAL
      // or PRE_RESTORE checkpoint is not a bulk-operation boundary → 400
      // (contract acceptance).
      const RECOVERABLE: readonly string[] = ["PRE_MUTATION", "PRE_IMPORT", "PRE_GENERATION"];
      if (!RECOVERABLE.includes(checkpoint.kind)) {
        throw new MergeError(
          "INVALID_CHECKPOINT_KIND",
          `checkpoint kind ${checkpoint.kind} is not a pre-operation checkpoint; bulk rollback needs PRE_MUTATION, PRE_IMPORT or PRE_GENERATION`,
        );
      }

      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      const checkedOut = await checkedOutBranch(novelId, novel.currentBranchId);
      if (checkpoint.branchId !== checkedOut.id) {
        throw new BranchError(
          "NOT_ON_CHECKED_OUT_BRANCH",
          `checkpoint is on branch "${checkpoint.branch.name}", but "${checkedOut.name}" is checked out; switch to it first`,
        );
      }

      const payload = await loadCheckpointPayload(db, checkpoint.id, novelId);
      const preview = await computePreview(db, novelId, payload, checkedOut.headRevisionId);

      const result = await db.$transaction(async (tx) => {
        // One RESTORE revision on the checked-out branch, with its own
        // PRE_MUTATION checkpoint (Invariant 15 — the rollback itself is a
        // bulk operation and must be recoverable).
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          branchName: checkedOut.name,
          origin: "RESTORE",
          operation: "restore.apply",
          message: `bulk rollback to checkpoint "${checkpoint.label}"`,
          actorUserId,
          tables: [...COVERED_TABLE_NAMES],
          items: [
            {
              entityType: "Checkpoint",
              entityId: checkpoint.id,
              operation: "UPDATE",
            },
          ],
        });

        await writePayloadTables(tx, novelId, payload);

        return {
          revisionId: advanced.revisionId,
          revisionNumber: advanced.number,
          checkpointId: checkpoint.id,
          preview,
        };
      });

      await audit?.record({
        actorUserId,
        workspaceId,
        action: "checkpoint.rollback",
        entityType: "Checkpoint",
        entityId: checkpoint.id,
        payload: {
          novelId,
          checkpointId: checkpoint.id,
          revisionNumber: result.revisionNumber,
        },
      });
      return result;
    },

    async listRecoverableCheckpoints({ actorUserId, workspaceId, novelId, take = 50 }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const checkpoints = await db.checkpoint.findMany({
        where: {
          novelId,
          workspaceId,
          kind: { in: ["PRE_MUTATION", "PRE_IMPORT", "PRE_GENERATION"] },
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          label: true,
          note: true,
          kind: true,
          revisionId: true,
          branchId: true,
          branch: { select: { name: true } },
          snapshot: { select: { byteSize: true } },
          createdAt: true,
          revision: { select: { number: true } },
        },
      });
      return checkpoints.map((c) => ({
        id: c.id,
        label: c.label,
        note: c.note,
        kind: c.kind,
        revisionId: c.revisionId,
        revisionNumber: c.revision.number,
        branchId: c.branchId,
        branchName: c.branch.name,
        byteSize: c.snapshot?.byteSize ?? 0,
        createdAt: c.createdAt,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// NF-WF-020C: merge helpers (module-level, pure-ish; the service methods
// below orchestrate them).
// ---------------------------------------------------------------------------

/**
 * Prisma model name → covered table key.
 *
 * Change sets record `entityType` as the Prisma model name (`CanonFact`),
 * while snapshots key rows by table (`canon_facts`). The mapping is explicit
 * — a name that does not resolve to a covered table (Novel,
 * RestoreOperation, AIGateway, …) is outside merge scope and yields null.
 */
const ENTITY_TYPE_TO_TABLE: Readonly<Record<string, string>> = {
  StoryEntity: "story_entities",
  Character: "characters",
  Antagonist: "antagonists",
  Bond: "bonds",
  BondMember: "bond_members",
  BondTransition: "bond_transitions",
  CanonFact: "canon_facts",
  Chapter: "chapters",
  ChapterVersion: "chapter_versions",
  CanonFactSource: "canon_fact_sources",
  CanonProposal: "canon_proposals",
  CanonApplication: "canon_applications",
  CanonApplicationItem: "canon_application_items",
  StoryEvent: "story_events",
  CausalEdge: "causal_edges",
  CharacterArc: "character_arcs",
  CharacterArcMilestone: "character_arc_milestones",
  CharacterKnowledge: "character_knowledge",
  CharacterState: "character_states",
  MeaningfulInteraction: "meaningful_interactions",
  NarrativeDnaProfile: "narrative_dna_profiles",
  NarrativePolicy: "narrative_policies",
  Saga: "sagas",
  Scene: "scenes",
  OutlineNode: "outline_nodes",
  OutlineVersion: "outline_versions",
  PlanningHorizon: "planning_horizons",
  RelationshipStance: "relationship_stances",
  StoryPromise: "story_promises",
  StoryThread: "story_threads",
  StoryThreadEvent: "story_thread_events",
  Synopsis: "synopses",
  TimelineEvent: "timeline_events",
  MemoryProjection: "memory_projections",
  FinalTextReview: "final_text_reviews",
  Publication: "publications",
};

function tableKeyForEntityType(entityType: string): string | null {
  return ENTITY_TYPE_TO_TABLE[entityType] ?? null;
}

/**
 * Walk a revision's parent chain, newest first, returning (id, number).
 * The chain is linear: a merge records one parent (the target's previous
 * head), so no CTE is needed.
 */
async function revisionChain(
  db: RevisionTx,
  headId: string,
): Promise<{ id: string; number: number }[]> {
  const chain: { id: string; number: number }[] = [];
  let current: string | null = headId;
  const seen = new Set<string>();
  while (current !== null) {
    if (seen.has(current)) break; // defensive: never loop on a corrupt chain
    seen.add(current);
    const rev: { id: string; number: number; parentRevisionId: string | null } | null =
      await db.revision.findUnique({
        where: { id: current },
        select: { id: true, number: true, parentRevisionId: true },
      });
    if (!rev) break;
    chain.push({ id: rev.id, number: rev.number });
    current = rev.parentRevisionId;
  }
  return chain;
}

/**
 * The merge base: the most recent common ancestor of the two heads.
 * Null when the branches share no history (unrelated lineages).
 */
async function findMergeBase(
  db: RevisionTx,
  sourceHeadId: string,
  targetHeadId: string,
): Promise<{ id: string; number: number } | null> {
  const sourceChain = await revisionChain(db, sourceHeadId);
  const sourceIds = new Set(sourceChain.map((r) => r.id));
  const targetChain = await revisionChain(db, targetHeadId);
  // The target chain is newest-first; the first entry also in the source set
  // is the most recent common ancestor.
  for (const rev of targetChain) {
    if (sourceIds.has(rev.id)) return rev;
  }
  return null;
}

/**
 * Change-set items for the revisions strictly after `baseId` up to and
 * including `headId`, grouped by entity. Returns the items with their
 * revision numbers for evidence ordering.
 */
async function changeSetsSince(
  db: RevisionTx,
  novelId: string,
  headId: string,
  baseId: string,
): Promise<
  Map<string, { entityType: string; entityId: string; operations: ("CREATE" | "UPDATE" | "DELETE")[] }>
> {
  const chain = await revisionChain(db, headId);
  const revisionIds: string[] = [];
  for (const rev of chain) {
    if (rev.id === baseId) break;
    revisionIds.push(rev.id);
  }
  if (revisionIds.length === 0) return new Map();
  const items = await db.changeSetItem.findMany({
    where: {
      changeSet: { revisionId: { in: revisionIds }, novelId },
    },
    select: { entityType: true, entityId: true, operation: true },
  });
  const grouped = new Map<
    string,
    { entityType: string; entityId: string; operations: ("CREATE" | "UPDATE" | "DELETE")[] }
  >();
  for (const item of items) {
    const key = `${item.entityType}::${item.entityId}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { entityType: item.entityType, entityId: item.entityId, operations: [] };
      grouped.set(key, entry);
    }
    const op = item.operation as "CREATE" | "UPDATE" | "DELETE";
    if (!entry.operations.includes(op)) entry.operations.push(op);
  }
  return grouped;
}

/**
 * The snapshot payload for a revision: the snapshot pinned exactly at the
 * revision, else the nearest snapshot on its ancestor chain (newest first).
 * Null when no snapshot covers the revision.
 */
async function snapshotForRevision(
  db: RevisionTx,
  revisionId: string,
): Promise<SnapshotPayload | null> {
  const chain = await revisionChain(db, revisionId);
  for (const rev of chain) {
    const snapshot = await db.snapshot.findFirst({
      where: { revisionId: rev.id },
      select: { payload: true, formatVersion: true },
    });
    if (snapshot && snapshot.formatVersion === SNAPSHOT_FORMAT_VERSION) {
      return snapshot.payload as unknown as SnapshotPayload;
    }
  }
  return null;
}

/** Find one row in a payload table by its identity column. */
function payloadRow(
  payload: SnapshotPayload,
  table: string,
  id: string,
): Record<string, unknown> | null {
  const key = keyColumnFor(table);
  for (const row of payload[table] ?? []) {
    if ((row as Record<string, unknown>)?.[key] === id) {
      return row as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Build the merged payload: the target snapshot with every source-side
 * clean change applied from the source snapshot.
 *
 * Only CLEAN and ORPHAN_RISK changes are applied (the caller guarantees no
 * CONFLICT / DELETED_MODIFIED entries). A source DELETE removes the row; a
 * source CREATE/UPDATE takes the source's row image.
 */
function buildMergedPayload(
  targetPayload: SnapshotPayload,
  sourcePayload: SnapshotPayload,
  changes: MergeChange[],
): SnapshotPayload {
  // Deep-clone the target payload so the caller's snapshot object is never
  // mutated (preview must stay read-only even when apply reuses it).
  const merged: SnapshotPayload = JSON.parse(JSON.stringify(targetPayload)) as SnapshotPayload;
  for (const change of changes) {
    if (change.kind !== "CLEAN" && change.kind !== "ORPHAN_RISK") continue;
    if (!change.changedOn.includes("source")) continue;
    const table = tableKeyForEntityType(change.entityType);
    if (!table) continue;
    const key = keyColumnFor(table);
    const rows = (merged[table] ?? []) as Record<string, unknown>[];
    const idx = rows.findIndex((r) => r?.[key] === change.entityId);
    const sourceRow = payloadRow(sourcePayload, table, change.entityId);
    const isDelete = change.operations.includes("DELETE") && !sourceRow;
    if (isDelete) {
      if (idx >= 0) rows.splice(idx, 1);
    } else if (sourceRow) {
      const clone = JSON.parse(JSON.stringify(sourceRow)) as Record<string, unknown>;
      if (idx >= 0) rows[idx] = clone;
      else rows.push(clone);
    }
    merged[table] = rows;
  }
  return merged;
}

/**
 * Write a payload to the live covered tables: delete in reverse FK order
 * (except the manuscript pair and other non-restore targets), re-insert in
 * FK order, then rewind the chapter pointers in place (C7 steps 2–4).
 *
 * Shared by merge apply and bulk rollback; the C7 `applyRestore` path keeps
 * its own copy (020C does not refactor it — too risky for 002/011 tests).
 */
async function writePayloadTables(
  tx: RevisionTx,
  novelId: string,
  payload: SnapshotPayload,
): Promise<void> {
  // Step 0 — every payload chapter id must be live (C5, C7).
  const liveChapters = await tx.chapter.findMany({
    where: { novelId },
    select: { id: true },
  });
  const liveById = new Set(liveChapters.map((c) => c.id));
  for (const id of payloadIds(payload, "chapters")) {
    if (!liveById.has(id)) {
      throw new ConflictError(`chapter identity conflict: chapter ${id} is gone`);
    }
  }

  // Step 2 — delete in reverse FK order, except non-restore targets.
  for (const table of [...COVERED_TABLE_NAMES].reverse()) {
    if (!isRestoreTarget(table)) continue;
    await tx.$executeRawUnsafe(`DELETE FROM "${table}" t WHERE ${scopeFor(table)}`, novelId);
  }

  // Step 3 — re-insert in FK order, except non-restore targets.
  for (const table of COVERED_TABLE_NAMES) {
    if (!isRestoreTarget(table)) continue;
    const rows = payload[table] ?? [];
    if (rows.length === 0) continue;
    await tx.$executeRawUnsafe(
      `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(null::"${table}", $1::jsonb)`,
      JSON.stringify(rows),
    );
  }

  // Step 4 — rewind the chapter pointers in place (never delete/re-insert
  // the manuscript pair, C7). PUBLISHED chapters keep their pointer: a
  // merge/rollback must not move a published pointer (Invariant 4).
  const livePointers = await tx.chapter.findMany({
    where: { novelId },
    select: { id: true, status: true, currentVersionId: true },
  });
  for (const row of (payload["chapters"] ?? []) as { id?: unknown; current_version_id?: unknown }[]) {
    if (typeof row.id !== "string") continue;
    const live = livePointers.find((c) => c.id === row.id);
    if (!live || live.status === "PUBLISHED") continue;
    const pinned = typeof row.current_version_id === "string" ? row.current_version_id : null;
    if (live.currentVersionId !== pinned) {
      await tx.chapter.update({ where: { id: live.id }, data: { currentVersionId: pinned } });
    }
  }
}

/**
 * The 9 contract-pinned semantic dependency edges (020A §"Dependency
 * analysis"), as (dependent table → referenced table). A CLEAN change to a
 * referenced entity is ORPHAN_RISK when a dependent row diverged on the
 * other side.
 */
const SEMANTIC_EDGES: ReadonlyArray<{ dependent: string; referenced: string }> =
  DEPENDENCY_EDGES.filter((e) => e.semantic).map((e) => ({
    dependent: e.dependent,
    referenced: e.referenced,
  }));

/**
 * Compute the merge preview (read-only). Shared by the preview route and
 * merge apply (which recomputes under the branch lock).
 *
 * Steps:
 *  1. Resolve source/target branches; refuse a self-merge.
 *  2. Find the merge base (most recent common ancestor). No common history
 *     → MERGE_NO_BASE.
 *  3. Collect the change sets on each side since the base (C2: WHAT changed).
 *  4. Classify every touched entity:
 *     - both sides → CONFLICT, unless one side deleted and the other did
 *       not → DELETED_MODIFIED. "Identically on both" is NOT auto-merged:
 *       identity cannot be proven from the change log, so the conservative
 *       reading treats it as a conflict (Invariant 5; semantic merge is M9).
 *     - one side only → CLEAN, unless a dependent via one of the 9
 *       contract-pinned semantic edges diverged on the other side →
 *       ORPHAN_RISK (warning; the merge still applies it).
 *  5. Attach row evidence (base / source / target) from snapshots when
 *     available. Classification never depends on snapshots.
 */
async function computeMergePreview(
  db: RevisionTx,
  novelId: string,
  sourceBranchId: string,
  targetBranchId: string | undefined,
): Promise<MergePreview> {
  const source = await db.novelBranch.findFirst({
    where: { id: sourceBranchId, novelId },
    select: { id: true, name: true, headRevisionId: true },
  });
  if (!source) throw new NotFoundError("branch");

  let target: { id: string; name: string; headRevisionId: string | null } | null = null;
  if (targetBranchId) {
    target = await db.novelBranch.findFirst({
      where: { id: targetBranchId, novelId },
      select: { id: true, name: true, headRevisionId: true },
    });
  } else {
    const novel = await db.novel.findFirst({
      where: { id: novelId },
      select: { currentBranchId: true },
    });
    if (novel?.currentBranchId) {
      target = await db.novelBranch.findUnique({
        where: { id: novel.currentBranchId },
        select: { id: true, name: true, headRevisionId: true },
      });
    }
    target ??= await db.novelBranch.findUnique({
      where: { novelId_name: { novelId, name: "main" } },
      select: { id: true, name: true, headRevisionId: true },
    });
  }
  if (!target) throw new NotFoundError("branch");
  if (source.id === target.id) {
    throw new MergeError("MERGE_NO_BASE", "cannot merge a branch into itself");
  }
  if (!source.headRevisionId || !target.headRevisionId) {
    throw new MergeError("MERGE_NO_BASE", "both branches need a head revision to merge");
  }

  const base = await findMergeBase(db, source.headRevisionId, target.headRevisionId);
  if (!base) {
    throw new MergeError("MERGE_NO_BASE", "branches share no common history; no merge base");
  }

  const [sourceChanges, targetChanges] = await Promise.all([
    changeSetsSince(db, novelId, source.headRevisionId, base.id),
    changeSetsSince(db, novelId, target.headRevisionId, base.id),
  ]);

  // Snapshots for evidence (best-effort; classification does not need them).
  const [basePayload, sourcePayload, targetPayload] = await Promise.all([
    snapshotForRevision(db, base.id),
    snapshotForRevision(db, source.headRevisionId),
    snapshotForRevision(db, target.headRevisionId),
  ]);

  const changes: MergeChange[] = [];
  const allKeys = new Set([...sourceChanges.keys(), ...targetChanges.keys()]);

  for (const key of allKeys) {
    const s = sourceChanges.get(key);
    const t = targetChanges.get(key);
    const entityType = (s ?? t)!.entityType;
    const entityId = (s ?? t)!.entityId;
    // Only covered story tables participate in the merge. Branch metadata
    // (NovelBranch), restore operations, and other non-covered entities are
    // not story state the merge rewrites — skip them.
    const table = tableKeyForEntityType(entityType);
    if (!table) continue;
    const changedOn: ("source" | "target")[] = [];
    if (s) changedOn.push("source");
    if (t) changedOn.push("target");
    const operations = [...new Set([...(s?.operations ?? []), ...(t?.operations ?? [])])];

    let kind: MergeChangeKind;
    let warning: string | undefined;
    if (s && t) {
      // Same-entity divergence on both sides. A delete on one side and a
      // non-delete on the other is the pinned DELETED_MODIFIED shape;
      // everything else (including "identically on both", which cannot be
      // proven identical from the change log) is CONFLICT.
      const sDeleted = s.operations.includes("DELETE");
      const tDeleted = t.operations.includes("DELETE");
      const sNonDelete = s.operations.some((o) => o !== "DELETE");
      const tNonDelete = t.operations.some((o) => o !== "DELETE");
      kind =
        (sDeleted && tNonDelete) || (tDeleted && sNonDelete) ? "DELETED_MODIFIED" : "CONFLICT";
    } else {
      kind = "CLEAN";
      // ORPHAN_RISK: a clean change whose dependents (via the 9 semantic
      // edges) diverged on the other side. The merge still applies it — the
      // warning tells the author the dependent may now dangle.
      const otherSide = s ? targetChanges : sourceChanges;
      const otherSideLabel = s ? "target" : "source";
      for (const edge of SEMANTIC_EDGES) {
        if (edge.referenced !== table) continue;
        for (const other of otherSide.values()) {
          if (tableKeyForEntityType(other.entityType) === edge.dependent) {
            kind = "ORPHAN_RISK";
            warning =
              `${edge.dependent} ${other.entityId} diverged on ${otherSideLabel}; ` +
              `merging this ${table} change may strand it`;
            break;
          }
        }
        if (kind === "ORPHAN_RISK") break;
      }
    }

    // Evidence: both versions + base, when snapshots cover the revisions.
    const change: MergeChange = { entityType, entityId, kind, changedOn, operations };
    {
      const baseRow = basePayload ? payloadRow(basePayload, table, entityId) : null;
      const sourceRow = sourcePayload ? payloadRow(sourcePayload, table, entityId) : null;
      const targetRow = targetPayload ? payloadRow(targetPayload, table, entityId) : null;
      if (baseRow || sourceRow || targetRow) {
        change.base = baseRow;
        change.sourceVersion = sourceRow;
        change.targetVersion = targetRow;
      }
    }
    if (warning) change.warning = warning;
    changes.push(change);
  }

  // Deterministic order: conflicts first, then by entity.
  const kindOrder: Record<MergeChangeKind, number> = {
    CONFLICT: 0,
    DELETED_MODIFIED: 1,
    ORPHAN_RISK: 2,
    CLEAN: 3,
  };
  changes.sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.entityType.localeCompare(b.entityType),
  );

  const [sourceHead, targetHead, baseRev] = await Promise.all([
    db.revision.findUnique({ where: { id: source.headRevisionId }, select: { number: true } }),
    db.revision.findUnique({ where: { id: target.headRevisionId }, select: { number: true } }),
    db.revision.findUnique({ where: { id: base.id }, select: { number: true } }),
  ]);

  const summary = {
    clean: changes.filter((c) => c.kind === "CLEAN").length,
    conflict: changes.filter((c) => c.kind === "CONFLICT").length,
    deletedModified: changes.filter((c) => c.kind === "DELETED_MODIFIED").length,
    orphanRisk: changes.filter((c) => c.kind === "ORPHAN_RISK").length,
  };

  return {
    sourceBranch: {
      id: source.id,
      name: source.name,
      headRevisionId: source.headRevisionId,
      headNumber: sourceHead?.number ?? null,
    },
    targetBranch: {
      id: target.id,
      name: target.name,
      headRevisionId: target.headRevisionId,
      headNumber: targetHead?.number ?? null,
    },
    baseRevisionId: base.id,
    baseNumber: baseRev?.number ?? null,
    changes,
    summary,
    canApply: summary.conflict === 0 && summary.deletedModified === 0,
    snapshotsAvailable: !!sourcePayload && !!targetPayload,
  };
}
