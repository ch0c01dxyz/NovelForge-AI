/**
 * @novelforge/memory — settle-revision search (NF-WF-009, F2, Invariant 5).
 *
 * Chapter N is *settled* at a settle revision identified
 * deterministically from existing data (no new marker column):
 * - `manuscriptRev(N)` — the greatest revision number on the novel's
 *   main branch whose change set touches a manuscript chapter-version
 *   row for chapter N.
 * - `canonApplyRev(N)` — the greatest revision number on the main
 *   branch whose change set contains a CanonApplication status
 *   transition to APPLIED for an application whose run has
 *   `input.chapterNumber = N`. Absent when no canon application was
 *   ever created for chapter N, or every such application ended
 *   REJECTED — that absence IS the data meaning of "explicitly
 *   declined".
 * - `settleRev(N) = max(manuscriptRev(N), canonApplyRev(N))` over the
 *   present terms. If `manuscriptRev(N)` is absent, chapter N is NOT
 *   settled.
 */
import type { NovelForgeDb } from "@novelforge/database";

export interface SettleRevision {
  revisionId: string;
  revisionNumber: number;
}

/**
 * The main branch for a novel (Invariant 2, F9). Returns null when the
 * novel has no main branch (no revisions yet).
 */
export async function mainBranchHead(
  db: NovelForgeDb,
  novelId: string,
): Promise<{ branchId: string; headRevisionId: string; headRevisionNumber: number } | null> {
  const branch = await db.novelBranch.findFirst({
    where: { novelId, name: "main" },
    select: {
      id: true,
      headRevisionId: true,
      headRevision: { select: { id: true, number: true } },
    },
  });
  if (!branch?.headRevisionId || !branch.headRevision) return null;
  return {
    branchId: branch.id,
    headRevisionId: branch.headRevisionId,
    headRevisionNumber: branch.headRevision.number,
  };
}

/**
 * Greatest main-branch revision number whose change set touches a
 * chapter-version row of chapter N. Returns null when chapter N has
 * no versions or no revision ever touched them (chapter not settled).
 */
export async function manuscriptRev(
  db: NovelForgeDb,
  novelId: string,
  chapterNumber: number,
): Promise<SettleRevision | null> {
  const chapter = await db.chapter.findFirst({
    where: { novelId, number: chapterNumber },
    select: { id: true },
  });
  if (!chapter) return null;
  const versions = await db.chapterVersion.findMany({
    where: { chapterId: chapter.id },
    select: { id: true },
  });
  if (versions.length === 0) return null;
  const versionIds = versions.map((v) => v.id);

  // Change-set items touching any version row of this chapter, joined
  // to main-branch revisions; take the greatest revision number.
  const rows = await db.changeSetItem.findMany({
    where: { entityType: "ChapterVersion", entityId: { in: versionIds } },
    select: {
      changeSet: {
        select: {
          revision: {
            select: {
              id: true,
              number: true,
              branch: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  let best: SettleRevision | null = null;
  for (const row of rows) {
    const rev = row.changeSet?.revision;
    if (!rev || rev.branch?.name !== "main") continue;
    if (!best || rev.number > best.revisionNumber) {
      best = { revisionId: rev.id, revisionNumber: rev.number };
    }
  }
  return best;
}

/**
 * Greatest main-branch revision number whose change set contains a
 * CanonApplication UPDATE for an application that is currently
 * APPLIED and whose run has `input.chapterNumber = N`.
 *
 * Applications are terminal (APPLIED/REJECTED), so a current APPLIED
 * status means the UPDATE recorded the transition to APPLIED. Null
 * when no application was ever created for N or all ended REJECTED —
 * the data meaning of "explicitly declined".
 */
export async function canonApplyRev(
  db: NovelForgeDb,
  novelId: string,
  chapterNumber: number,
): Promise<SettleRevision | null> {
  const items = await db.changeSetItem.findMany({
    where: { entityType: "CanonApplication", operation: "UPDATE" },
    select: {
      entityId: true,
      changeSet: {
        select: {
          novelId: true,
          revision: {
            select: {
              id: true,
              number: true,
              branch: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  // Collect candidate (applicationId -> greatest main-branch revision)
  // first, then batch-fetch applications and runs (no N+1).
  const bestByApp = new Map<string, SettleRevision>();
  for (const item of items) {
    const rev = item.changeSet?.revision;
    if (!rev || rev.branch?.name !== "main") continue;
    if (item.changeSet?.novelId !== novelId) continue;
    const cur = bestByApp.get(item.entityId);
    if (!cur || rev.number > cur.revisionNumber) {
      bestByApp.set(item.entityId, { revisionId: rev.id, revisionNumber: rev.number });
    }
  }
  if (bestByApp.size === 0) return null;
  const apps = await db.canonApplication.findMany({
    where: { id: { in: [...bestByApp.keys()] }, status: "APPLIED" },
    select: { id: true, runId: true },
  });
  const runs = await db.workflowRun.findMany({
    where: { id: { in: apps.map((a) => a.runId) } },
    select: { id: true, input: true },
  });
  const runById = new Map(runs.map((r) => [r.id, r]));
  let best: SettleRevision | null = null;
  for (const app of apps) {
    const run = runById.get(app.runId);
    const input = (run?.input ?? {}) as Record<string, unknown>;
    if (input["chapterNumber"] !== chapterNumber) continue;
    const rev = bestByApp.get(app.id)!;
    if (!best || rev.revisionNumber > best.revisionNumber) best = rev;
  }
  return best;
}

/**
 * Chapter N's settle revision: max(manuscriptRev(N), canonApplyRev(N))
 * over the present terms. Null (not settled) when manuscriptRev(N) is
 * absent — canon alone never settles a chapter.
 */
export async function settleRev(
  db: NovelForgeDb,
  novelId: string,
  chapterNumber: number,
): Promise<SettleRevision | null> {
  const m = await manuscriptRev(db, novelId, chapterNumber);
  if (!m) return null;
  const c = await canonApplyRev(db, novelId, chapterNumber);
  if (!c) return m;
  return c.revisionNumber > m.revisionNumber ? c : m;
}
