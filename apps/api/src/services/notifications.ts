/**
 * Notification services (NF-WF-019C): the in-app reader notification
 * surface — inbox, preferences, and the pinned event-emission API.
 *
 * In-app ONLY (Invariant 7 — no email, no push). Every notification row
 * traces to a real event (chapter PUBLISHED, real reply, real moderation
 * action); rows carry IDs + type only — display names resolve at read
 * time from User; no email, no credential material (Invariant 4).
 *
 * Pinned event names (the contract 019A/019B emit; 019C consumes):
 * - `novel.chapter_published { novelId, chapterNumber }` — emitted by the
 *   012 publication paths (the worker fire + the API immediate publish);
 *   fan-out is async and bounded (see notification-fanout-jobs.ts).
 * - `comment.replied { commentId, parentCommentId, novelId, chapterNumber,
 *   replierUserId }` — emitted by the 019B comment write path via
 *   `emitCommentReplied` below (the 019B implementer calls it with the
 *   pinned payload fields plus `parentAuthorUserId`, resolved from the
 *   parent comment row — this module does not read 019B's tables).
 * - `comment.moderated { commentId, novelId, action: HIDDEN | DELETED,
 *   moderatorUserId }` — emitted by the 019B staff-moderation path via
 *   `emitCommentModerated` below (the 019B implementer resolves
 *   `commentAuthorUserId` from the comment row).
 */
import type { NovelForgeDb } from "@novelforge/database";
import { NotFoundError } from "./platform.ts";

/**
 * The three pinned preference/event types (Klein Q5, 2026-10-06 — all
 * default ON; absent preference row = ON). The preferences route accepts
 * only these values.
 */
export const PINNED_NOTIFICATION_TYPES = [
  "NEW_CHAPTER",
  "COMMENT_REPLY",
  "MODERATION_NOTICE",
] as const;
export type PinnedNotificationType = (typeof PINNED_NOTIFICATION_TYPES)[number];

/** The pinned event names 019A/019B emit and 019C consumes. */
export const SOCIAL_EVENT_NAMES = {
  NOVEL_CHAPTER_PUBLISHED: "novel.chapter_published",
  COMMENT_REPLIED: "comment.replied",
  COMMENT_MODERATED: "comment.moderated",
} as const;

export interface NotificationView {
  id: string;
  type: PinnedNotificationType;
  novelId: string | null;
  chapterNumber: number | null;
  actorDisplayName: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreferenceView {
  type: PinnedNotificationType;
  /** Effective value: the stored row, or the pinned default (ON) when absent. */
  enabled: boolean;
}

const INBOX_PAGE_SIZE = 20;
const INBOX_PAGE_MAX = 50;

export function createNotificationServices({ db }: { db: NovelForgeDb }) {
  /** Effective preference: stored row wins; absent row = pinned default ON. */
  async function isEnabled(userId: string, type: PinnedNotificationType): Promise<boolean> {
    const row = await db.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
      select: { enabled: true },
    });
    return row?.enabled ?? true;
  }

  function toView(row: {
    id: string;
    type: PinnedNotificationType;
    novelId: string | null;
    chapterNumber: number | null;
    actor: { displayName: string } | null;
    createdAt: Date;
    readAt: Date | null;
  }): NotificationView {
    return {
      id: row.id,
      type: row.type,
      novelId: row.novelId,
      chapterNumber: row.chapterNumber,
      actorDisplayName: row.actor?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    };
  }

  /** Effective preferences: all three pinned types; absent row = ON (Q5). */
  async function getPreferences({ userId }: { userId: string }): Promise<{
    preferences: NotificationPreferenceView[];
  }> {
    const rows = await db.notificationPreference.findMany({
      where: { userId },
      select: { type: true, enabled: true },
    });
    const byType = new Map(rows.map((r) => [r.type, r.enabled]));
    return {
      preferences: PINNED_NOTIFICATION_TYPES.map((type) => ({
        type,
        enabled: byType.get(type) ?? true,
      })),
    };
  }

  return {
    PINNED_NOTIFICATION_TYPES,
    SOCIAL_EVENT_NAMES,

    /**
     * The caller's inbox, newest first. Cursor = the `id` of the last
     * row of the previous page (createdAt,id ordering).
     */
    async listNotifications({
      userId,
      cursor,
      limit,
    }: {
      userId: string;
      cursor?: string;
      limit?: number;
    }): Promise<{
      notifications: NotificationView[];
      unreadCount: number;
      page: { nextCursor: string | null };
    }> {
      const take = Math.min(Math.max(limit ?? INBOX_PAGE_SIZE, 1), INBOX_PAGE_MAX);
      let cursorRow: { createdAt: Date; id: string } | null = null;
      if (cursor) {
        cursorRow = await db.notification.findFirst({
          where: { id: cursor, userId },
          select: { createdAt: true, id: true },
        });
        if (!cursorRow) throw new NotFoundError("notification cursor");
      }
      const rows = await db.notification.findMany({
        where: {
          userId,
          ...(cursorRow
            ? {
                OR: [
                  { createdAt: { lt: cursorRow.createdAt } },
                  { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        select: {
          id: true,
          type: true,
          novelId: true,
          chapterNumber: true,
          actor: { select: { displayName: true } },
          createdAt: true,
          readAt: true,
        },
      });
      const hasMore = rows.length > take;
      const page = rows.slice(0, take);
      const unreadCount = await db.notification.count({
        where: { userId, readAt: null },
      });
      return {
        notifications: page.map(toView),
        unreadCount,
        page: {
          nextCursor: hasMore ? page[page.length - 1]!.id : null,
        },
      };
    },

    /** Mark one notification read — own rows only (404 otherwise, no oracle). */
    async markRead({ userId, id }: { userId: string; id: string }): Promise<NotificationView> {
      const row = await db.notification.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          novelId: true,
          chapterNumber: true,
          actor: { select: { displayName: true } },
          createdAt: true,
          readAt: true,
        },
      });
      if (!row) throw new NotFoundError("notification");
      const updated = row.readAt
        ? row
        : await db.notification.update({
            where: { id },
            data: { readAt: new Date() },
            select: {
              id: true,
              type: true,
              novelId: true,
              chapterNumber: true,
              actor: { select: { displayName: true } },
              createdAt: true,
              readAt: true,
            },
          });
      return toView(updated);
    },

    /** Mark all of the caller's notifications read. Returns the new unread count (0). */
    async markAllRead({ userId }: { userId: string }): Promise<{ unreadCount: number }> {
      await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { unreadCount: 0 };
    },

    /** Effective preferences: all three pinned types; absent row = ON (Q5). */
    getPreferences,

    /**
     * Upsert per-type preferences. Only the pinned NotificationType
     * values are accepted — anything else is INVALID_INPUT (the route
     * validates; this is the backstop).
     */
    async setPreferences({
      userId,
      preferences,
    }: {
      userId: string;
      preferences: { type: string; enabled: boolean }[];
    }): Promise<{ preferences: NotificationPreferenceView[] }> {
      for (const p of preferences) {
        if (!(PINNED_NOTIFICATION_TYPES as readonly string[]).includes(p.type)) {
          throw new Error(`INVALID_INPUT: unknown notification type ${p.type}`);
        }
        await db.notificationPreference.upsert({
          where: { userId_type: { userId, type: p.type as PinnedNotificationType } },
          update: { enabled: p.enabled },
          create: { userId, type: p.type as PinnedNotificationType, enabled: p.enabled },
        });
      }
      return getPreferences({ userId });
    },

    /**
     * Emit `comment.replied`: one notification to the parent comment's
     * author. Called by the 019B comment write path with the pinned
     * payload fields; `parentAuthorUserId` is resolved by 019B from the
     * parent comment row (this module never reads 019B's tables).
     * No notification when the replier IS the parent author (self-reply)
     * or when the parent author disabled COMMENT_REPLY.
     */
    async emitCommentReplied({
      commentId,
      parentCommentId,
      parentAuthorUserId,
      novelId,
      chapterNumber,
      replierUserId,
    }: {
      commentId: string;
      parentCommentId: string;
      parentAuthorUserId: string;
      novelId: string;
      chapterNumber: number;
      replierUserId: string;
    }): Promise<{ notified: boolean }> {
      void commentId;
      void parentCommentId;
      if (replierUserId === parentAuthorUserId) return { notified: false };
      if (!(await isEnabled(parentAuthorUserId, "COMMENT_REPLY"))) return { notified: false };
      await db.notification.create({
        data: {
          userId: parentAuthorUserId,
          type: "COMMENT_REPLY",
          novelId,
          chapterNumber,
          actorUserId: replierUserId,
        },
      });
      return { notified: true };
    },

    /**
     * Emit `comment.moderated`: one notification to the comment's
     * author. Called by the 019B staff-moderation path with the pinned
     * payload fields; `commentAuthorUserId` is resolved by 019B from the
     * comment row. No notification when the author disabled
     * MODERATION_NOTICE.
     *
     * Note: the pinned payload's `action` (HIDDEN | DELETED) is accepted
     * for the event contract but is not persisted — the inbox shape
     * (contract §019C Routes) carries type, not action; the UI renders
     * the moderation notice generically.
     */
    async emitCommentModerated({
      commentId,
      commentAuthorUserId,
      novelId,
      action,
      moderatorUserId,
    }: {
      commentId: string;
      commentAuthorUserId: string;
      novelId: string;
      action: "HIDDEN" | "DELETED";
      moderatorUserId: string;
    }): Promise<{ notified: boolean }> {
      void commentId;
      void action;
      if (!(await isEnabled(commentAuthorUserId, "MODERATION_NOTICE"))) {
        return { notified: false };
      }
      await db.notification.create({
        data: {
          userId: commentAuthorUserId,
          type: "MODERATION_NOTICE",
          novelId,
          actorUserId: moderatorUserId,
        },
      });
      return { notified: true };
    },
  };
}

export type NotificationServices = ReturnType<typeof createNotificationServices>;
