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
import { ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";

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
  input: { novelId: string; expectedHeadRevisionId?: string | null },
): Promise<void> {
  if (input.expectedHeadRevisionId === undefined) return;
  const current = await readHeadRevisionId(db, input.novelId);
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
 */
const TABLE_SCOPE: Readonly<Record<string, string>> = {
  story_entities: `"novel_id" = $1`,
  characters: `"novel_id" = $1`,
  antagonists: `"novel_id" = $1`,
  bonds: `"novel_id" = $1`,
  bond_members: `"bond_id" IN (SELECT "id" FROM "bonds" WHERE "novel_id" = $1)`,
  bond_transitions: `"bond_id" IN (SELECT "id" FROM "bonds" WHERE "novel_id" = $1)`,
  canon_facts: `"novel_id" = $1`,
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
function keyColumnFor(table: string): string {
  return TABLE_KEY_COLUMN[table] ?? "id";
}

/**
 * The predicate that scopes `table` to `$1` (a novel id), or a refusal.
 *
 * A table with no entry is outside the C1 coverage set. Refusing here rather
 * than at the caller is what makes `outside story restore scope` (C5)
 * unreachable-by-omission: there is no path that interpolates a table name
 * into SQL without passing this check.
 */
function scopeFor(table: string): string {
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

export interface RevisionServices {
  listRevisions(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    take?: number;
    skip?: number;
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
  }): Promise<{ checkpointId: string; revisionId: string; number: number; byteSize: number }>;

  listCheckpoints(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    take?: number;
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
  }): Promise<{ restoreOperationId: string; preview: RestorePreview }>;

  applyRestore(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    restoreOperationId: string;
  }): Promise<{
    revisionId: string;
    revisionNumber: number;
    status: string;
    publishedPointerConflicts: RestorePreview["publishedPointerConflicts"];
  }>;
}

/** C7: the manuscript pair is coverage, never a restore target. */
function isRestoreTarget(table: string): boolean {
  return COVERED_TABLES.find((t) => t.key === table)?.restoreTarget ?? false;
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

  return {
    async listRevisions({ actorUserId, workspaceId, novelId, take = 50, skip = 0 }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const revisions = await db.revision.findMany({
        where: { novelId },
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
    }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const created = await db.$transaction(async (tx) => {
        // The checkpoint takes the same branch lock every covered mutation
        // takes, so a capture and a mutation cannot interleave (C8). It pins
        // the revision it just created — the state the author is marking.
        const head = await advanceHead(tx, {
          workspaceId,
          novelId,
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

    async listCheckpoints({ actorUserId, workspaceId, novelId, take = 50 }) {
      await gate(workspaceId, novelId, actorUserId, "revision:read");
      const rows = await db.checkpoint.findMany({
        where: { novelId },
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

    async previewRestore({ actorUserId, workspaceId, novelId, checkpointId, scope = "FULL" }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      // DOMAIN/ENTITY/SELECTIVE need dependency and conflict analysis that
      // does not exist; refusing by name is the ADR-0013 posture (C7).
      if (scope !== "FULL") {
        throw new ConflictError("selective restore is not implemented");
      }
      const branch = await branchFor(novelId);
      const payload = await loadCheckpointPayload(db, checkpointId, novelId);
      const preview = await computePreview(db, novelId, payload, branch.headRevisionId);
      const row = await db.restoreOperation.create({
        data: {
          workspaceId,
          novelId,
          branchId: branch.id,
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

    async applyRestore({ actorUserId, workspaceId, novelId, restoreOperationId }) {
      await gate(workspaceId, novelId, actorUserId, "revision:manage");
      const operation = await db.restoreOperation.findFirst({
        where: { id: restoreOperationId, novelId, workspaceId },
        select: {
          id: true,
          status: true,
          sourceCheckpointId: true,
          preview: true,
        },
      });
      if (!operation) throw new NotFoundError("restore");
      if (operation.status !== "PREVIEWED") {
        throw new ConflictError(`restore is already ${operation.status.toLowerCase()}`);
      }
      const preview = operation.preview as unknown as RestorePreview;

      // The apply refuses a moved head: impact is recomputed by the author,
      // not applied against a stale plan (C7). Server-pinned rather than
      // client-supplied — the expectation is the head the preview was built
      // against — but the same two-part check as the mutation routes.
      await assertHeadExpectation(db, {
        novelId,
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
  };
}
