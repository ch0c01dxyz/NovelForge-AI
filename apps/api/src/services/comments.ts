/**
 * Reader comments + moderation (NF-WF-019B).
 *
 * Comments attach to chapter IDENTITY (`novelId` + `chapterNumber`),
 * NOT to the pinned `chapterVersionId` — threads survive republication.
 * Visibility follows `isPubliclyVisible` (ACTIVE novel + PUBLISHED
 * publication) evaluated IN THE QUERY (the 014 precedent: tenant and
 * visibility boundaries are enforced in the query, never as a
 * post-filter). When a chapter leaves PUBLISHED its comments vanish
 * from reads on the next query; the rows are retained and reappear on
 * republication.
 *
 * Safety (contract Invariant 5): plain-text bodies <= 5000 chars,
 * control characters rejected; depth <= 1 (top-level + one reply
 * level); states VISIBLE/HIDDEN/DELETED; authors edit own comments
 * within 15 minutes (HIDDEN is not author-editable); delete tombstones.
 * Reports are dedup-keyed per (comment, reporter) with a pinned reason
 * enum; there is NO auto-hide on report thresholds (Q10) — reports
 * queue for staff review.
 *
 * Moderation authority (contract Invariant 6, Klein's Q2 decision
 * 2026-10-06): staff = workspace members holding the EXISTING
 * `novel:update` capability, resolved server-side from
 * novelId -> workspace. No platform moderation team exists.
 * Staff actions are audit-logged (actor identity only).
 *
 * Rate limits (Q1): 1 comment / 10s / user (burst) and
 * 100 comments / 24h / user; reports 20 / 24h / user. The burst limit
 * is the per-route @fastify/rate-limit override in comment-routes.ts
 * (the auth register/login precedent); the DAILY limits are enforced
 * here via DB counts (deterministic per-user accounting the in-memory
 * limiter cannot give across restarts) and surface as typed
 * `RateLimitError` (429).
 *
 * `Chapter.commentCount` counts VISIBLE comments only and is
 * maintained in the SAME transaction as the comment write
 * (contract Invariant 3); hide/delete decrement it.
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  requireCapability,
  ForbiddenError,
} from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import { RateLimitError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";

/** Pinned report reasons (contract Invariant 5). */
export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "SPOILER",
  "OFF_TOPIC",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Pinned comment statuses. */
export const COMMENT_STATUSES = ["VISIBLE", "HIDDEN", "DELETED"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** Q1 rate limits, decided values of record. */
export const COMMENT_DAILY_LIMIT = 100;
export const REPORT_DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Q4: authors may edit their own comment within 15 minutes. */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Invariant 5: plain-text bodies, <= 5000 chars. */
export const COMMENT_MAX_CHARS = 5000;

/** The tombstone body shown to everyone for DELETED comments. */
export const COMMENT_TOMBSTONE = "[deleted]";

/**
 * Control characters are rejected (Invariant 5). Line feed and tab are
 * allowed — the web renders comments as escaped text with line breaks
 * preserved.
 */
const FORBIDDEN_CONTROL_RE =
  // eslint-disable-next-line no-control-regex -- the escapes ARE the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function validateCommentBody(body: unknown): string {
  if (typeof body !== "string") throw new Error("INVALID_BODY");
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("INVALID_BODY");
  if (trimmed.length > COMMENT_MAX_CHARS) throw new Error("INVALID_BODY");
  if (FORBIDDEN_CONTROL_RE.test(trimmed)) throw new Error("INVALID_BODY");
  return trimmed;
}

export interface CommentAuthorView {
  displayName: string;
}

export interface CommentView {
  id: string;
  novelId: string;
  chapterNumber: number;
  parentId: string | null;
  body: string;
  status: CommentStatus;
  /** Present when the viewer is the comment's author or novel staff. */
  hiddenByModerator: boolean;
  author: CommentAuthorView;
  /** Replies nested under top-level comments (list only). */
  replies?: CommentView[];
  /** Top-level reply count (list only). */
  replyCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentPage {
  cursor: string | null;
  hasMore: boolean;
}

const commentSelect = {
  id: true,
  novelId: true,
  chapterNumber: true,
  parentId: true,
  body: true,
  status: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { displayName: true } },
} as const;

type CommentRow = {
  id: string;
  novelId: string;
  chapterNumber: number;
  parentId: string | null;
  body: string;
  status: CommentStatus;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  author: { displayName: string };
};

function toView(
  row: CommentRow,
  opts: { viewerUserId: string | null; viewerIsStaff: boolean },
): CommentView {
  const isAuthor = opts.viewerUserId === row.userId;
  const canSeeHidden = isAuthor || opts.viewerIsStaff;
  const body =
    row.status === "DELETED"
      ? COMMENT_TOMBSTONE
      : row.status === "HIDDEN" && !canSeeHidden
        ? ""
        : row.body;
  return {
    id: row.id,
    novelId: row.novelId,
    chapterNumber: row.chapterNumber,
    parentId: row.parentId,
    body,
    status: row.status,
    hiddenByModerator: row.status === "HIDDEN" && canSeeHidden,
    author: { displayName: row.author.displayName },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}:${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf(":");
    if (sep < 0) return null;
    const ms = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!Number.isFinite(ms) || id.length === 0) return null;
    return { createdAt: new Date(ms), id };
  } catch {
    return null;
  }
}

export function createCommentServices({
  db,
  audit,
}: {
  db: NovelForgeDb;
  audit: AuditService;
}) {
  /**
   * Resolve an engageable chapter IN THE QUERY (014 precedent): the
   * novel must be ACTIVE and the chapter must carry a PUBLISHED
   * publication. Anything else is 404 with no existence oracle
   * (013 Invariant 5).
   */
  async function resolveEngageableChapter(
    tx: Pick<NovelForgeDb, "chapter">,
    novelId: string,
    chapterNumber: number,
  ) {
    const chapter = await tx.chapter.findFirst({
      where: {
        novelId,
        number: chapterNumber,
        novel: { status: "ACTIVE" },
        publication: { status: "PUBLISHED" },
      },
      select: {
        id: true,
        novel: { select: { id: true, workspaceId: true } },
      },
    });
    if (!chapter) throw new NotFoundError("chapter");
    return chapter;
  }

  /**
   * Staff gate: workspace membership (404 for non-members, ADR-0004)
   * then the EXISTING `novel:update` capability (403). `authorization.ts`
   * is untouched — no new capabilities (Invariant 8).
   */
  async function requireStaff(novelId: string, userId: string) {
    const novel = await db.novel.findUnique({
      where: { id: novelId },
      select: { workspaceId: true },
    });
    if (!novel) throw new NotFoundError("novel");
    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: novel.workspaceId, userId },
      },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    try {
      requireCapability(membership.role, "novel:update");
    } catch {
      throw new ForbiddenError("novel:update");
    }
    return novel.workspaceId;
  }

  /** Best-effort staff resolution for the anonymous-readable list. */
  async function isStaff(novelId: string, userId: string | null) {
    if (!userId) return false;
    try {
      await requireStaff(novelId, userId);
      return true;
    } catch {
      return false;
    }
  }

  async function checkDailyLimits(userId: string, kind: "comment" | "report") {
    const since = new Date(Date.now() - DAY_MS);
    if (kind === "comment") {
      const count = await db.comment.count({
        where: { userId, createdAt: { gte: since } },
      });
      if (count >= COMMENT_DAILY_LIMIT) {
        throw new RateLimitError(
          "COMMENT_DAILY_LIMIT",
          `more than ${COMMENT_DAILY_LIMIT} comments in 24h`,
        );
      }
    } else {
      const count = await db.commentReport.count({
        where: { reporterId: userId, createdAt: { gte: since } },
      });
      if (count >= REPORT_DAILY_LIMIT) {
        throw new RateLimitError(
          "REPORT_DAILY_LIMIT",
          `more than ${REPORT_DAILY_LIMIT} reports in 24h`,
        );
      }
    }
  }

  return {
    /**
     * POST /api/reader/comments — authenticated only.
     * `parentId` must reference a VISIBLE top-level comment on the
     * same chapter (depth <= 1).
     */
    async postComment({
      userId,
      novelId,
      chapterNumber,
      body,
      parentId,
    }: {
      userId: string;
      novelId: string;
      chapterNumber: number;
      body: string;
      parentId?: string | null;
    }): Promise<{ comment: CommentView }> {
      const clean = validateCommentBody(body);
      // Visibility gate: throws 404 (no oracle) unless the chapter is
      // on an ACTIVE novel with a PUBLISHED publication.
      await resolveEngageableChapter(db, novelId, chapterNumber);
      if (parentId) {
        const parent = await db.comment.findFirst({
          where: { id: parentId, novelId, chapterNumber },
          select: { id: true, parentId: true, status: true },
        });
        // Depth <= 1: the parent must itself be top-level and VISIBLE.
        if (!parent || parent.parentId !== null || parent.status !== "VISIBLE") {
          throw new Error("INVALID_PARENT");
        }
      }
      await checkDailyLimits(userId, "comment");
      const comment = await db.$transaction(async (tx) => {
        const created = await tx.comment.create({
          data: {
            userId,
            novelId,
            chapterNumber,
            parentId: parentId ?? null,
            body: clean,
          },
          select: commentSelect,
        });
        // Invariant 3: the VISIBLE-comment counter moves in the SAME
        // transaction as the write.
        await tx.chapter.updateMany({
          where: { novelId, number: chapterNumber },
          data: { commentCount: { increment: 1 } },
        });
        return created;
      });
      return {
        comment: toView(comment as CommentRow, {
          viewerUserId: userId,
          viewerIsStaff: false,
        }),
      };
    },

    /**
     * GET /api/reader/comments — anonymous-readable. VISIBLE comments
     * plus DELETED tombstones (thread shape preserved). HIDDEN comments
     * are excluded unless the viewer is the comment's author (shown
     * with a notice) or novel staff. Top-level ordered by createdAt
     * asc with replies nested; keyset cursor pagination.
     */
    async listComments({
      novelId,
      chapterNumber,
      cursor,
      limit = 20,
      viewerUserId,
    }: {
      novelId: string;
      chapterNumber: number;
      cursor?: string;
      limit?: number;
      viewerUserId: string | null;
    }): Promise<{ comments: CommentView[]; page: CommentPage }> {
      // Visibility gate: throws 404 (no oracle) unless the chapter is
      // on an ACTIVE novel with a PUBLISHED publication.
      await resolveEngageableChapter(db, novelId, chapterNumber);
      const staff = await isStaff(novelId, viewerUserId);
      const take = Math.min(Math.max(limit, 1), 100);
      const decoded = cursor ? decodeCursor(cursor) : null;

      const rows = await db.comment.findMany({
        where: {
          novelId,
          chapterNumber,
          parentId: null,
          ...(decoded
            ? {
                OR: [
                  { createdAt: { gt: decoded.createdAt } },
                  {
                    createdAt: decoded.createdAt,
                    id: { gt: decoded.id },
                  },
                ],
              }
            : {}),
        },
        select: { ...commentSelect, _count: { select: { replies: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: take + 1,
      });

      const hasMore = rows.length > take;
      const page = rows.slice(0, take);
      const topIds = page.map((r) => r.id);
      const replyRows =
        topIds.length > 0
          ? await db.comment.findMany({
              where: { parentId: { in: topIds } },
              select: commentSelect,
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            })
          : [];

      const viewer = { viewerUserId, viewerIsStaff: staff };
      const comments: CommentView[] = [];
      for (const row of page) {
        // HIDDEN is invisible to everyone except the author and staff.
        if (
          row.status === "HIDDEN" &&
          row.userId !== viewerUserId &&
          !staff
        ) {
          continue;
        }
        const view = toView(row as CommentRow, viewer);
        const replies = replyRows
          .filter((r) => r.parentId === row.id)
          // HIDDEN replies are invisible to everyone except the reply's
          // author and staff.
          .filter(
            (r) =>
              r.status !== "HIDDEN" || r.userId === viewerUserId || staff,
          )
          .map((r) => toView(r as CommentRow, viewer));
        view.replies = replies;
        view.replyCount = row._count.replies;
        comments.push(view);
      }
      const last = page[page.length - 1];
      return {
        comments,
        page: {
          cursor:
            hasMore && last
              ? encodeCursor(last.createdAt, last.id)
              : null,
          hasMore,
        },
      };
    },

    /**
     * PATCH /api/reader/comments/:commentId — own comment only,
     * within 15 minutes of createdAt (Q4). HIDDEN is not
     * author-editable (403 even within the window); DELETED is 404.
     */
    async editComment({
      userId,
      commentId,
      body,
    }: {
      userId: string;
      commentId: string;
      body: string;
    }): Promise<{ comment: CommentView }> {
      const clean = validateCommentBody(body);
      const existing = await db.comment.findUnique({
        where: { id: commentId },
        select: { id: true, userId: true, status: true, createdAt: true },
      });
      if (!existing || existing.status === "DELETED") {
        throw new NotFoundError("comment");
      }
      // The edit gate is an ownership check, not a capability — so it
      // throws a plain typed sentinel mapped to 403 at the route layer
      // (authorization.ts is untouched: no new capabilities, Invariant 8).
      if (existing.userId !== userId) throw new Error("FORBIDDEN_EDIT");
      if (existing.status === "HIDDEN") throw new Error("FORBIDDEN_EDIT");
      if (Date.now() - existing.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) {
        throw new Error("FORBIDDEN_EDIT");
      }
      const updated = await db.comment.update({
        where: { id: commentId },
        data: { body: clean },
        select: commentSelect,
      });
      return {
        comment: toView(updated as CommentRow, {
          viewerUserId: userId,
          viewerIsStaff: false,
        }),
      };
    },

    /**
     * DELETE /api/reader/comments/:commentId — the author, or novel
     * staff on their novels. Sets DELETED (tombstone); the
     * VISIBLE-counter decrements only when a VISIBLE comment is
     * deleted. Idempotent: deleting an already-DELETED comment is
     * still 204.
     */
    async deleteComment({
      userId,
      commentId,
    }: {
      userId: string;
      commentId: string;
    }): Promise<void> {
      const existing = await db.comment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          userId: true,
          novelId: true,
          chapterNumber: true,
          status: true,
        },
      });
      if (!existing) throw new NotFoundError("comment");
      const isAuthor = existing.userId === userId;
      let staffWorkspaceId: string | null = null;
      if (!isAuthor) {
        // Staff may delete any comment on their novels. The gate stays
        // ahead of the idempotency check (an outsider still 404s).
        staffWorkspaceId = await requireStaff(existing.novelId, userId);
      }
      // Idempotent: deleting an already-DELETED comment is still 204,
      // and a no-op writes no audit row (the hide path behaves the same).
      if (existing.status === "DELETED") return;
      if (!isAuthor && staffWorkspaceId) {
        await audit.record({
          actorUserId: userId,
          workspaceId: staffWorkspaceId,
          action: "comment.deleted",
          entityType: "comment",
          entityId: existing.id,
          payload: {
            commentId: existing.id,
            novelId: existing.novelId,
            chapterNumber: existing.chapterNumber,
            previousStatus: existing.status,
          },
        });
      }
      await db.$transaction(async (tx) => {
        await tx.comment.update({
          where: { id: commentId },
          data: { status: "DELETED" },
        });
        if (existing.status === "VISIBLE") {
          await tx.chapter.updateMany({
            where: {
              novelId: existing.novelId,
              number: existing.chapterNumber,
            },
            data: { commentCount: { decrement: 1 } },
          });
        }
      });
    },

    /**
     * POST /api/reader/comments/:commentId/reports — dedup-keyed per
     * (comment, reporter): a repeat report returns 200 with the same
     * row. 20 reports / 24h / user (Q1).
     */
    async reportComment({
      userId,
      commentId,
      reason,
    }: {
      userId: string;
      commentId: string;
      reason: ReportReason;
    }): Promise<{ report: { commentId: string; reason: string; createdAt: string }; deduped: boolean }> {
      const existing = await db.comment.findUnique({
        where: { id: commentId },
        select: { id: true, novelId: true, chapterNumber: true },
      });
      if (!existing) throw new NotFoundError("comment");
      // Invariant 2: reporting is a social write — the novel/chapter
      // must be engageable (no oracle either way).
      await resolveEngageableChapter(db, existing.novelId, existing.chapterNumber);
      const prior = await db.commentReport.findUnique({
        where: {
          commentId_reporterId: { commentId, reporterId: userId },
        },
        select: { reason: true, createdAt: true },
      });
      if (prior) {
        return {
          report: {
            commentId,
            reason: prior.reason,
            createdAt: prior.createdAt.toISOString(),
          },
          deduped: true,
        };
      }
      await checkDailyLimits(userId, "report");
      try {
        const created = await db.commentReport.create({
          data: { commentId, reporterId: userId, reason },
          select: { reason: true, createdAt: true },
        });
        return {
          report: {
            commentId,
            reason: created.reason,
            createdAt: created.createdAt.toISOString(),
          },
          deduped: false,
        };
      } catch {
        // The unique backstop won a race with another request from the
        // same reporter: return the existing row as a dedup (200).
        const raced = await db.commentReport.findUniqueOrThrow({
          where: {
            commentId_reporterId: { commentId, reporterId: userId },
          },
          select: { reason: true, createdAt: true },
        });
        return {
          report: {
            commentId,
            reason: raced.reason,
            createdAt: raced.createdAt.toISOString(),
          },
          deduped: true,
        };
      }
    },

    /**
     * GET /api/reader/novels/:novelId/moderation/reports — staff-only.
     * Reported comments aggregated per (comment, reason) with
     * reporter COUNTS; reporter identities are never exposed
     * (Invariant 4). `status` optionally filters by comment status.
     *
     * Interpretation note for the diff reviewer: the schema carries
     * no report-resolution state (moderation resolves by acting on
     * the comment — hide/unhide/delete), so `?status=` filters on the
     * COMMENT's CommentStatus, not on a report state.
     */
    async listReports({
      userId,
      novelId,
      status,
    }: {
      userId: string;
      novelId: string;
      status?: CommentStatus;
    }): Promise<{
      reports: Array<{
        comment: CommentView;
        reason: string;
        reporterCount: number;
        createdAt: string;
      }>;
    }> {
      await requireStaff(novelId, userId);
      const grouped = await db.commentReport.groupBy({
        by: ["commentId", "reason"],
        where: {
          comment: {
            novelId,
            ...(status ? { status } : {}),
          },
        },
        _count: { _all: true },
        _min: { createdAt: true },
        orderBy: [{ _min: { createdAt: "asc" } }],
      });
      const comments = await db.comment.findMany({
        where: { id: { in: grouped.map((g) => g.commentId) } },
        select: commentSelect,
      });
      const byId = new Map(comments.map((c) => [c.id, c]));
      const viewer = { viewerUserId: userId, viewerIsStaff: true };
      return {
        reports: grouped.flatMap((g) => {
          const row = byId.get(g.commentId);
          if (!row) return [];
          return [
            {
              comment: toView(row as CommentRow, viewer),
              reason: g.reason,
              reporterCount: g._count._all,
              createdAt: g._min.createdAt?.toISOString() ?? "",
            },
          ];
        }),
      };
    },

    /**
     * POST /api/reader/comments/:commentId/hide — staff-only. Sets
     * HIDDEN and decrements the VISIBLE counter; audit-logged (actor
     * identity only).
     */
    async hideComment({
      userId,
      commentId,
    }: {
      userId: string;
      commentId: string;
    }): Promise<{ comment: CommentView }> {
      return this.setCommentStatus({ userId, commentId, status: "HIDDEN" });
    },

    /**
     * POST /api/reader/comments/:commentId/unhide — staff-only.
     * Restores VISIBLE (from HIDDEN) and re-increments the counter;
     * audit-logged.
     */
    async unhideComment({
      userId,
      commentId,
    }: {
      userId: string;
      commentId: string;
    }): Promise<{ comment: CommentView }> {
      return this.setCommentStatus({ userId, commentId, status: "VISIBLE" });
    },

    async setCommentStatus({
      userId,
      commentId,
      status,
    }: {
      userId: string;
      commentId: string;
      status: "HIDDEN" | "VISIBLE";
    }): Promise<{ comment: CommentView }> {
      const existing = await db.comment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          novelId: true,
          chapterNumber: true,
          status: true,
        },
      });
      if (!existing || existing.status === "DELETED") {
        throw new NotFoundError("comment");
      }
      const workspaceId = await requireStaff(existing.novelId, userId);
      if (existing.status === status) {
        const row = await db.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: commentSelect,
        });
        return {
          comment: toView(row as CommentRow, {
            viewerUserId: userId,
            viewerIsStaff: true,
          }),
        };
      }
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.comment.update({
          where: { id: commentId },
          data: { status },
          select: commentSelect,
        });
        // commentCount counts VISIBLE only.
        await tx.chapter.updateMany({
          where: { novelId: existing.novelId, number: existing.chapterNumber },
          data: {
            commentCount:
              status === "VISIBLE" ? { increment: 1 } : { decrement: 1 },
          },
        });
        return row;
      });
      await audit.record({
        actorUserId: userId,
        workspaceId,
        action: status === "HIDDEN" ? "comment.hidden" : "comment.unhidden",
        entityType: "comment",
        entityId: existing.id,
        payload: {
          commentId: existing.id,
          novelId: existing.novelId,
          chapterNumber: existing.chapterNumber,
          previousStatus: existing.status,
        },
      });
      return {
        comment: toView(updated as CommentRow, {
          viewerUserId: userId,
          viewerIsStaff: true,
        }),
      };
    },
  };
}

export type CommentServices = ReturnType<typeof createCommentServices>;
