import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import { ConflictError, NotFoundError, rebuildCanonSummary } from "@novelforge/ai-services";

type CanonSummaryFreshness = "FRESH" | "STALE" | "MISSING";

export function createCanonSummaryServices(deps: { db: NovelForgeDb }) {
  const { db } = deps;

  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    capability: "novel:read" | "novel:update",
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true, currentBranchId: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, capability);
    return novel;
  }

  async function branchFor(
    novelId: string,
    currentBranchId: string | null,
    select: { id?: true; headRevisionId?: true; headRevision?: { select: { number: true } } },
  ) {
    if (currentBranchId) {
      return db.novelBranch.findFirst({
        where: { id: currentBranchId, novelId },
        select: { id: true, headRevisionId: true, ...select },
      });
    }
    return db.novelBranch.findFirst({
      where: { novelId, name: "main" },
      select: { id: true, headRevisionId: true, ...select },
    });
  }

  return {
    async read(actorUserId: string, workspaceId: string, novelId: string) {
      const novel = await gate(actorUserId, workspaceId, novelId, "novel:read");
      const branch = await branchFor(novelId, novel.currentBranchId, {
        headRevision: { select: { number: true } },
      });
      if (!branch) {
        return {
          freshness: "MISSING" as CanonSummaryFreshness,
          summary: null,
          headRevisionNumber: null,
          pendingAfterSummary: 0,
          lastError: null,
        };
      }

      const latest = await db.canonSummary.findFirst({
        where: { novelId, branchId: branch.id },
        orderBy: { sourceRevisionNumber: "desc" },
      });

      const newerThanSummary = latest
        ? { branchId: branch.id, number: { gt: latest.sourceRevisionNumber } }
        : { branchId: branch.id };

      const [newestInvalidation, pendingAfterSummary] = await Promise.all([
        db.derivedRebuildIntent.findFirst({
          where: {
            novelId,
            projection: "canon",
            status: { in: ["PENDING", "RUNNING", "FAILED"] },
            sourceRevision: newerThanSummary,
          },
          orderBy: { sourceRevision: { number: "desc" } },
          select: {
            id: true,
            lastError: true,
            sourceRevision: { select: { number: true } },
          },
        }),
        db.derivedRebuildIntent.count({
          where: {
            novelId,
            projection: "canon",
            status: "PENDING",
            sourceRevision: newerThanSummary,
          },
        }),
      ]);

      const freshness: CanonSummaryFreshness = !latest
        ? "MISSING"
        : newestInvalidation
          ? "STALE"
          : "FRESH";

      return {
        freshness,
        summary: latest
          ? {
              id: latest.id,
              sourceRevisionId: latest.sourceRevisionId,
              sourceRevisionNumber: latest.sourceRevisionNumber,
              entityCount: latest.entityCount,
              activeFactCount: latest.activeFactCount,
              supersededFactCount: latest.supersededFactCount,
              retractedFactCount: latest.retractedFactCount,
              digest: latest.digest,
              createdAt: latest.createdAt.toISOString(),
            }
          : null,
        headRevisionNumber: branch.headRevision?.number ?? null,
        pendingAfterSummary,
        lastError: newestInvalidation?.lastError ?? null,
      };
    },

    async rebuild(actorUserId: string, workspaceId: string, novelId: string) {
      const novel = await gate(actorUserId, workspaceId, novelId, "novel:update");
      const branch = await branchFor(novelId, novel.currentBranchId, {});
      if (!branch?.headRevisionId) {
        throw new ConflictError("no baseline exists for this novel");
      }
      const summary = await rebuildCanonSummary(db, {
        workspaceId,
        novelId,
        sourceRevisionId: branch.headRevisionId,
      });
      return {
        rebuilt: true as const,
        sourceRevisionNumber: summary.sourceRevisionNumber,
      };
    },
  };
}

export type CanonSummaryServices = ReturnType<typeof createCanonSummaryServices>;
