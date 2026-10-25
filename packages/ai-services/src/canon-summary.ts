import type { NovelForgeDb } from "@novelforge/database";
import { buildCanonSummaryDigest } from "@novelforge/story-intelligence";
import { ConflictError } from "./platform.ts";

type SummaryTx = Omit<NovelForgeDb, "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends">;
type SummaryInput = { workspaceId: string; novelId: string; sourceRevisionId: string };
type CanonRows = {
  entities: Array<{ novel_id: string; kind: string }>;
  facts: Array<{ novel_id: string; predicate: string; status: "ACTIVE" | "SUPERSEDED" | "RETRACTED" }>;
};
function usableSnapshot(value: { entities: unknown; facts: unknown } | undefined, novelId: string): value is CanonRows {
  const record = (row: unknown): row is Record<string, unknown> => typeof row === "object" && row !== null;
  return !!value && Array.isArray(value.entities) && Array.isArray(value.facts)
    && value.entities.every(row => record(row) && row.novel_id === novelId && typeof row.kind === "string")
    && value.facts.every(row => record(row) && row.novel_id === novelId && typeof row.predicate === "string"
      && typeof row.status === "string" && ["ACTIVE", "SUPERSEDED", "RETRACTED"].includes(row.status));
}

/** Derive from one database snapshot, never timestamps across mutable branches. */
async function rebuild(tx: SummaryTx, input: SummaryInput) {
  const revision = await tx.revision.findFirst({
    where: { id: input.sourceRevisionId, novelId: input.novelId, workspaceId: input.workspaceId },
    select: { id: true, branchId: true, number: true },
  });
  if (!revision) throw new ConflictError("source revision not found for novel");
  const novel = await tx.novel.findFirst({
    where: { id: input.novelId, workspaceId: input.workspaceId },
    select: { currentBranchId: true },
  });
  const current = await tx.novelBranch.findFirst({
    where: { novelId: input.novelId, ...(novel?.currentBranchId ? { id: novel.currentBranchId } : { name: "main" }) },
    select: { id: true, headRevisionId: true },
  });
  let entities: Array<{ kind: string }>;
  let facts: Array<{ predicate: string; status: "ACTIVE" | "SUPERSEDED" | "RETRACTED" }>;
  if (current?.id === revision.branchId && current.headRevisionId === revision.id) {
    [entities, facts] = await Promise.all([
      tx.storyEntity.findMany({ where: { novelId: input.novelId }, select: { kind: true } }),
      tx.canonFact.findMany({ where: { novelId: input.novelId }, select: { predicate: true, status: true } }),
    ]);
  } else {
    // Select only canon tables; never load a snapshot's complete manuscript.
    const rows = await tx.$queryRaw<Array<{ entities: unknown; facts: unknown }>>`
      SELECT payload->'story_entities' AS entities, payload->'canon_facts' AS facts
      FROM snapshots
      WHERE revision_id = ${revision.id}::uuid AND novel_id = ${input.novelId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid AND branch_id = ${revision.branchId}::uuid
        AND storage = 'INLINE' AND format_version = 1
    `;
    const snapshot = rows[0];
    if (!usableSnapshot(snapshot, input.novelId)) {
      throw new ConflictError("source revision has no usable canon snapshot; rebuild at the current branch head");
    }
    ({ entities, facts } = snapshot);
  }
  const digest = buildCanonSummaryDigest({ entities, facts });
  const data = {
    sourceRevisionNumber: revision.number,
    entityCount: digest.entityCount, activeFactCount: digest.activeFactCount,
    supersededFactCount: digest.supersededFactCount, retractedFactCount: digest.retractedFactCount,
    digest: { entitiesByKind: digest.entitiesByKind, topPredicates: digest.topPredicates, truncatedPredicates: digest.truncatedPredicates },
  };
  return tx.canonSummary.upsert({
    where: { novelId_branchId_sourceRevisionId: { novelId: input.novelId, branchId: revision.branchId, sourceRevisionId: revision.id } },
    create: { workspaceId: input.workspaceId, novelId: input.novelId, branchId: revision.branchId, sourceRevisionId: revision.id, ...data },
    update: data,
  });
}

/** A caller supplying a transaction must use RepeatableRead or stronger. */
export async function rebuildCanonSummary(db: NovelForgeDb | SummaryTx, input: SummaryInput) {
  if ("$transaction" in db) {
    return db.$transaction(tx => rebuild(tx, input), { isolationLevel: "RepeatableRead", timeout: 30_000 });
  }
  return rebuild(db, input);
}
