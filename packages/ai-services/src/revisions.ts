/**
 * @novelforge/ai-services — revision helpers (extracted from apps/api/src/services/revisions.ts).
 *
 * NF-WF-026 (GAP-028): These functions are needed by the moved tier-reader
 * services (canon, planning, characters, relationships, narrative, memory,
 * state-assembly). Extracted verbatim; the full revisions.ts module stays
 * in apps/api/src.
 */
import type { NovelForgeDb, RevisionOrigin } from "@novelforge/database";
import {
  COVERED_TABLE_NAMES,
  COVERED_TABLES,
  isCoveredTable,
  requiresCheckpoint,
  projectionsForTables,
  validateSnapshotComplete,
  SNAPSHOT_FORMAT_VERSION,
  type Projection,
  type SnapshotPayload,
} from "@novelforge/story-versioning";

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
import { ConflictError, NotFoundError } from "./platform.ts";

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
      // Match checkout/scene mutation lock order: novel, branch, child rows.
      await tx.$queryRawUnsafe(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`, scope.novelId);
      await tx.$queryRawUnsafe(`SELECT id FROM novel_branches WHERE novel_id = $1 AND name = 'main' FOR UPDATE`, scope.novelId);
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

/** Get the SQL scope predicate for a covered table (C1). */
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
