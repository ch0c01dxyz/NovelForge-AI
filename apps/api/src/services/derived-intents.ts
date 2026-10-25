import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import {
  PIPELINE_PROJECTIONS,
  PROJECTIONS,
  type Projection,
} from "@novelforge/story-versioning";

type RebuildStatus = "PENDING" | "RUNNING" | "FRESH" | "FAILED" | "STALE";

export interface DerivedIntentProjectionStatus {
  projection: Projection;
  hasPipeline: boolean;
  counts: Record<RebuildStatus, number>;
  latestSourceRevisionNumber: number | null;
  headRevisionNumber: number | null;
}

const EMPTY_COUNTS = (): Record<RebuildStatus, number> => ({
  PENDING: 0,
  RUNNING: 0,
  FRESH: 0,
  FAILED: 0,
  STALE: 0,
});

export function createDerivedIntentServices(deps: { db: NovelForgeDb }) {
  const { db } = deps;

  return {
    async getStatus(actorUserId: string, workspaceId: string, novelId: string) {
      const membership = await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
        select: { role: true },
      });
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!membership || !novel) throw new NotFoundError("novel");
      requireCapability(membership.role, "novel:read");

      const branch = novel.currentBranchId
        ? await db.novelBranch.findFirst({
            where: { id: novel.currentBranchId, novelId },
            select: { id: true, name: true, headRevision: { select: { number: true } } },
          })
        : await db.novelBranch.findFirst({
            where: { novelId, name: "main" },
            select: { id: true, name: true, headRevision: { select: { number: true } } },
          });

      // Intents are per (projection, source revision), and a revision belongs
      // to one branch. Counting across branches beside a single branch head
      // would misreport the lifecycle, so both aggregates are branch-scoped.
      const rows = branch
        ? await db.$queryRaw<
            Array<{
              projection: string;
              status: RebuildStatus;
              count: number;
              latest: number | null;
            }>
          >`
            SELECT i.projection,
                   i.status::text AS status,
                   COUNT(*)::int AS count,
                   MAX(r.number)::int AS latest
            FROM derived_rebuild_intents i
            JOIN revisions r ON r.id = i.source_revision_id
            WHERE i.novel_id = ${novelId}::uuid
              AND i.workspace_id = ${workspaceId}::uuid
              AND r.branch_id = ${branch.id}::uuid
            GROUP BY i.projection, i.status
          `
        : [];

      const countsByProjection = new Map<string, Record<RebuildStatus, number>>();
      const latestByProjection = new Map<string, number>();
      for (const row of rows) {
        const counts = countsByProjection.get(row.projection) ?? EMPTY_COUNTS();
        counts[row.status] = row.count;
        countsByProjection.set(row.projection, counts);
        if (row.latest !== null) {
          latestByProjection.set(
            row.projection,
            Math.max(latestByProjection.get(row.projection) ?? row.latest, row.latest),
          );
        }
      }

      const headRevisionNumber = branch?.headRevision?.number ?? null;
      return {
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
        headRevisionNumber,
        projections: PROJECTIONS.map((projection) => ({
          projection,
          hasPipeline: PIPELINE_PROJECTIONS.includes(projection),
          counts: countsByProjection.get(projection) ?? EMPTY_COUNTS(),
          latestSourceRevisionNumber: latestByProjection.get(projection) ?? null,
          headRevisionNumber,
        })),
      };
    },
  };
}

export type DerivedIntentServices = ReturnType<typeof createDerivedIntentServices>;
