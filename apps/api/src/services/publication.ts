/**
 * @novelforge/api — publication services (NF-WF-012).
 *
 * The publication release contract: chapters are the unit of publication
 * (ChapterStatus DRAFT/IN_REVIEW/PUBLISHED); novels are the unit of
 * archive (NovelStatus DRAFT/ACTIVE/ARCHIVED). A Publication row is the
 * version-pinned release record — the public surface (NF-WF-013)
 * resolves the pinned chapterVersionId, never chapters.currentVersionId
 * (Invariant 4).
 *
 * Release state machine (Invariant 2), keyed on the Publication row:
 *   UNPUBLISHED → SCHEDULED → PUBLISHED → UNPUBLISHED
 * There is deliberately no PUBLISHED→PUBLISHED: published chapters are
 * immutable (manuscript.ts), so a new public version requires
 * unpublish → edit → review → publish.
 *
 * Review (Invariant 3, GAP-045): any publish — immediate or fired —
 * requires a PASS FinalTextReview receipt for the version being pinned,
 * via the shared assertPublishReviewGate (the same gate
 * manuscript.setStatus enforces). Scheduling requires no receipt; the
 * receipt is checked at fire time (Invariant 5).
 *
 * Concurrency: every mutating op takes the chapter row lock
 * (SELECT … FOR UPDATE, the saveChapter precedent) and runs the flip +
 * publication-row write + advanceForMutation in one transaction. BullMQ
 * enqueue/removal happens AFTER commit — the crash window (row written,
 * enqueue failed) is covered by the worker's startup reconciliation
 * (Invariant 5). NOTE on the contract's tables pin: the contract says
 * `tables: ["publications"]` plus `["chapters"]`/`["novels"]` "where those
 * rows change" — but `novels` is deliberately OUTSIDE restore scope
 * (revisions.ts:161, "restore rewinds story state, not identity") and
 * advanceHead refuses uncovered tables, so the novel flip runs in the
 * same transaction but is not listed in `tables`. The contract's intent
 * (one transaction, one revision) is preserved.
 *
 * Capabilities (Invariant 6, existing vocabulary only):
 * schedule/reschedule/cancel/publish = `chapter:publish`;
 * unpublish = `chapter:update` (via manuscript.setStatus);
 * archive/unarchive = `novel:archive` (first consumer); read status =
 * `chapter:read`. Unauthenticated → 401, non-member → 404 (membership
 * gate), member without capability → 403.
 */
import { randomUUID } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import { NotFoundError, ConflictError, PolicyError } from "@novelforge/ai-services";
import { publicNovelPresentations } from "./public-novel-presentation.ts";
import { PublicationError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";
import { advanceForMutation, type RevisionTx } from "./revisions.ts";
import {
  assertPublishReviewGate,
  countWords,
  stripHtmlTags,
  type ManuscriptServices,
} from "./manuscript.ts";
import {
  PUBLICATION_JOB_NAME,
  type PublicationQueue,
} from "./publication-queue.ts";
import {
  NOTIFICATION_FANOUT_JOB_NAME,
  type NotificationFanoutJobData,
  type NotificationQueue,
} from "./notification-queue.ts";

export interface SchedulePublicationInput {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  /** ISO-8601 with offset; stored as UTC. Must be in the future. */
  scheduledFor: string;
}

export interface ChapterScopeInput {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
}

export interface NovelScopeInput {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

export type PublicationStatusView = {
  status: "SCHEDULED" | "PUBLISHED" | "UNPUBLISHED";
  scheduledFor: string | null;
  publishedAt: string | null;
  pinnedVersionNumber: number | null;
};

export interface PublicationServices {
  schedulePublication(
    input: SchedulePublicationInput,
  ): Promise<{ publicationId: string; scheduledFor: string }>;
  publishChapter(
    input: ChapterScopeInput & { expectedChapterVersionId?: string },
  ): Promise<{
    publicationId: string;
    pinnedVersionId: string;
    publishedAt: string;
  }>;
  unpublishChapter(input: ChapterScopeInput): Promise<{ publicationId: string }>;
  cancelScheduledPublication(
    input: ChapterScopeInput,
  ): Promise<{ publicationId: string }>;
  archiveNovel(input: NovelScopeInput): Promise<{ novelId: string }>;
  unarchiveNovel(input: NovelScopeInput): Promise<{ novelId: string }>;
  getPublicationStatus(input: ChapterScopeInput): Promise<PublicationStatusView>;
  /** Invariant 9 predicate — 013's gate. No auth: callers decide. */
  isPubliclyVisible(input: {
    novelId: string;
    chapterId: string;
  }): Promise<boolean>;
  /**
   * 013's resolver (shape pinned by 012, implemented here). Returns null
   * when nothing is publicly visible — the caller maps null to
   * 404 {error: "NOT_FOUND"} with no existence oracle.
   *
   * NOTE (GAP-046): Novel.slug is @@unique([workspaceId, slug])
   * (workspace-scoped), but the pinned resolver takes only novelSlug. When
   * several ACTIVE novels share a slug with a visible chapter, the
   * earliest-created wins; 013 should disambiguate (global slug or
   * workspace-scoped public URLs).
   */
  resolvePublicChapter(input: {
    novelSlug: string;
    chapterNumber: number;
  }): Promise<{ novelId: string; chapterId: string; pinnedVersionId: string } | null>;
  /**
   * NF-WF-013: novel-first public resolvers (additive; the frozen 012
   * `resolvePublicChapter` above is untouched).
   *
   * 013's chapter route resolves the novel FIRST by slug (earliest-created
   * ACTIVE wins — exactly the novel route's resolution), then looks up the
   * chapter within THAT novel only. This is the "equivalent pin-based
   * lookup" the 013 contract allows: content still comes from the PINNED
   * chapterVersionId, never currentVersionId.
   */
  resolvePublicNovelBySlug(input: {
    novelSlug: string;
  }): Promise<{
    id: string;
    title: string;
    slug: string;
    // NF-WF-019A (Q8, GAP-068): additive aggregate count.
    followerCount: number;
    genres: string[];
    audience: string | null;
    coverUrl: string | null;
    publicSynopsis: string | null;
    author: { id: string; displayName: string };
  } | null>;
  listPublishedChapters(input: {
    novelId: string;
  }): Promise<Array<{ number: number; title: string; publishedAt: string }>>;
  resolvePublicChapterNovelFirst(input: {
    novelSlug: string;
    chapterNumber: number;
  }): Promise<{
    novelId: string;
    chapterId: string;
    chapter: {
      number: number;
      title: string;
      content: string;
      wordCount: number;
      publishedVersionNumber: number;
      publishedAt: string;
      // NF-WF-019A (Q8, GAP-068): additive aggregate counts.
      likeCount: number;
      commentCount: number;
    };
    prevChapter: { number: number; title: string } | null;
    nextChapter: { number: number; title: string } | null;
  } | null>;
  resolvePublicAuthor(input: {
    authorId: string;
  }): Promise<{
    // NF-WF-019A (GAP-070): followerCount is additive on the frozen
    // 013 author shape.
    author: { id: string; displayName: string; followerCount: number };
    novels: Array<{
      id: string;
      title: string;
      slug: string;
      publishedChapterCount: number;
    }>;
  } | null>;
}

/** NF-WF-013: earliest-created ACTIVE novel for a slug; null when none. */
async function resolvePublicNovelBySlug(db: NovelForgeDb, novelSlug: string) {
  const novel = await db.novel.findFirst({
    where: { slug: novelSlug, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      slug: true,
      genres: true,
      audience: true,
      publications: { where: { status: "PUBLISHED" }, select: { id: true }, take: 1 },
      // NF-WF-019A (Q8, GAP-068): additive aggregate count on the frozen
      // 013 novel shape. Backward-compatible: no existing field renamed,
      // removed, or restructured; no auth object, no session handling,
      // no 401 path (013 Invariant 2 preserved). The counter is served
      // only here — the novel page itself 404s unless the novel is
      // publicly visible — so the count always reflects
      // published-visible engagement (GAP-068 condition b).
      followerCount: true,
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!novel || !novel.publications.length) return null;
  const presentation = (await publicNovelPresentations(db, [novel.id])).get(novel.id);
  return {
    id: novel.id,
    title: novel.title,
    slug: novel.slug,
    followerCount: novel.followerCount,
    genres: novel.genres,
    audience: novel.audience,
    coverUrl: presentation?.coverUrl ?? null,
    publicSynopsis: presentation?.publicSynopsis ?? null,
    author: { id: novel.createdBy.id, displayName: novel.createdBy.displayName },
  };
}

/** NF-WF-013: PUBLISHED chapters of a novel, ordered by number ascending. */
async function listPublishedChapters(db: NovelForgeDb, novelId: string) {
  const rows = await db.chapter.findMany({
    where: { novelId, publication: { status: "PUBLISHED" } },
    select: {
      number: true,
      title: true,
      publication: { select: { publishedAt: true } },
    },
    orderBy: { number: "asc" },
  });
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    publishedAt: r.publication!.publishedAt!.toISOString(),
  }));
}

export function createPublicationServices({
  db,
  audit,
  queue,
  notificationQueue,
  manuscripts,
}: {
  db: NovelForgeDb;
  audit?: AuditService;
  queue: PublicationQueue;
  /**
   * NF-WF-019C: the `notifications` queue for the
   * `novel.chapter_published` fan-out. Optional so existing callers
   * (tests) that don't care about notifications keep working; when
   * absent, no fan-out job is enqueued.
   */
  notificationQueue?: NotificationQueue;
  manuscripts: ManuscriptServices;
}): PublicationServices {
  /** Membership gate — 404 for non-members (ADR-0004), then capability. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true, status: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
    return novel;
  }

  async function lockChapter(tx: RevisionTx, novelId: string, chapterId: string) {
    await tx.$queryRawUnsafe(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`, novelId);
    await tx.$queryRawUnsafe(`SELECT id FROM novel_branches WHERE novel_id = $1 AND name = 'main' FOR UPDATE`, novelId);
    await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`;
  }

  /**
   * NF-WF-020B (Invariant 9, Q3): publishing is only available on the
   * `main` branch. While a non-`main` branch is checked out,
   * publish/schedule/immediate-publish is refused with a typed 409
   * `NOT_ON_MAIN_BRANCH`, with no writes. The guard runs after the
   * capability gate but before any write — the 409 carries no state
   * change. No new capability: `chapter:publish` still gates.
   */
  async function assertOnMainBranch(novelId: string): Promise<void> {
    const novel = await db.novel.findUnique({
      where: { id: novelId },
      select: { currentBranchId: true },
    });
    let branchName = "main";
    if (novel?.currentBranchId) {
      const branch = await db.novelBranch.findUnique({
        where: { id: novel.currentBranchId },
        select: { name: true },
      });
      if (branch) branchName = branch.name;
    }
    if (branchName !== "main") {
      throw new PublicationError(
        "NOT_ON_MAIN_BRANCH",
        `publishing is only available on the main branch ` +
          `(checked out: "${branchName}"); merge to main first`,
      );
    }
  }

  return {
    async schedulePublication({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      scheduledFor,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:publish");
      await assertOnMainBranch(novelId);
      // Route-level Zod already refuses unparseable/past times with 400
      // INVALID_INPUT; this is defense-in-depth for direct callers.
      const at = new Date(scheduledFor);
      if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
        throw new Error("scheduledFor must be a future ISO-8601 timestamp");
      }
      const publicationId = randomUUID();
      const row = await db.$transaction(async (tx) => {
        await lockChapter(tx, novelId, chapterId);
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: {
            id: true,
            currentVersionId: true,
            novel: { select: { status: true } },
          },
        });
        if (!chapter) throw new NotFoundError("chapter");
        if (chapter.novel.status === "ARCHIVED") {
          throw new PublicationError(
            "NOVEL_ARCHIVED",
            "novel is archived — unarchive it before scheduling publication",
          );
        }
        const existing = await tx.publication.findUnique({
          where: { chapterId },
        });
        if (existing?.status === "PUBLISHED") {
          throw new PublicationError(
            "ALREADY_PUBLISHED",
            "chapter is already published — unpublish first to schedule a new release",
          );
        }
        if (!chapter.currentVersionId) {
          // The row's pin is NOT NULL (Invariant 4): a schedule needs a
          // version to provisionally pin (replaced at fire time).
          throw new ConflictError(
            "cannot schedule publication for a chapter with no content version",
          );
        }
        // Advance FIRST: the schedule is a C3 LOW mutation, and the row's
        // revisionId pin must reference the revision this mutation
        // creates. The id is client-generated so the change set can name
        // the row before it exists.
        const id = existing?.id ?? publicationId;
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "publication.scheduled",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications"],
          items: [
            {
              entityType: "Publication",
              entityId: id,
              operation: existing ? "UPDATE" : "CREATE",
            },
          ],
        });
        const data = {
          status: "SCHEDULED" as const,
          scheduledFor: at,
          publishedById: actorUserId,
          // Provisional pin — replaced at fire time with the version
          // current then (Invariant 5). Never publicly served while
          // SCHEDULED.
          chapterVersionId: chapter.currentVersionId,
          revisionId: advanced.revisionId,
        };
        return existing
          ? await tx.publication.update({ where: { id: existing.id }, data })
          : await tx.publication.create({
              data: { id: publicationId, novelId, chapterId, ...data },
            });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "publication.scheduled",
        entityType: "Publication",
        entityId: row.id,
        payload: { novelId, chapterId, scheduledFor: at.toISOString() },
      });
      // Enqueue AFTER commit. Remove-first: a retained completed/failed
      // job record under this id makes add() a silent no-op (the P2-6
      // hazard) — and rows are reused (@@unique([chapterId])), so the id
      // is NOT always fresh (e.g. schedule after a lapsed schedule).
      const old = await queue.getJob(row.id);
      if (old) await old.remove();
      await queue.add(
        PUBLICATION_JOB_NAME,
        {
          publicationId: row.id,
          novelId,
          chapterId,
          scheduledFor: at.toISOString(),
        },
        { jobId: row.id, delay: Math.max(0, at.getTime() - Date.now()) },
      );
      return { publicationId: row.id, scheduledFor: at.toISOString() };
    },

    async publishChapter({ actorUserId, workspaceId, novelId, chapterId, expectedChapterVersionId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:publish");
      await assertOnMainBranch(novelId);
      const publicationId = randomUUID();
      const now = new Date();
      const row = await db.$transaction(async (tx) => {
        await lockChapter(tx, novelId, chapterId);
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: {
            id: true,
            status: true,
            currentVersionId: true,
            novel: { select: { status: true } },
          },
        });
        if (!chapter) throw new NotFoundError("chapter");
        if (expectedChapterVersionId !== undefined && chapter.currentVersionId !== expectedChapterVersionId) {
          throw new PolicyError("REVIEW_STALE", "the version selected for publication is no longer current");
        }
        if (chapter.novel.status === "ARCHIVED") {
          throw new PublicationError(
            "NOVEL_ARCHIVED",
            "novel is archived — unarchive it before publishing",
          );
        }
        const existing = await tx.publication.findUnique({
          where: { chapterId },
        });
        if (existing?.status === "PUBLISHED") {
          // Deliberately no PUBLISHED→PUBLISHED: unpublish → edit →
          // review → publish is the only path to a new public version.
          throw new PublicationError(
            "ALREADY_PUBLISHED",
            "chapter is already published — unpublish first to release a new version",
          );
        }
        if (existing?.status === "SCHEDULED") {
          // The state machine has no SCHEDULED→PUBLISHED via the
          // immediate route (that transition belongs to the firing job).
          throw new ConflictError(
            "chapter has a scheduled publication — cancel the schedule first or wait for it to fire",
          );
        }
        if (!chapter.currentVersionId) {
          throw new ConflictError("cannot publish a chapter with no content");
        }
        // Invariant 3: the receipt is checked against the version being
        // pinned. 050B: use the shared gate with tx (not outer db).
        await assertPublishReviewGate(tx as never, {
          workspaceId,
          novelId,
          chapterId,
          chapterVersionId: chapter.currentVersionId,
        });
        const id = existing?.id ?? publicationId;
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "publication.published",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications", "chapters"],
          items: [
            {
              entityType: "Publication",
              entityId: id,
              operation: existing ? "UPDATE" : "CREATE",
            },
            { entityType: "Chapter", entityId: chapterId, operation: "UPDATE" },
          ],
        });
        // Q4: automatic DRAFT→ACTIVE on first publish (idempotent — any
        // publish flips a DRAFT novel; an ACTIVE novel stays ACTIVE).
        // `novels` is outside restore scope, so the flip rides the same
        // transaction/revision but is not a listed table (see header).
        const novelActivated = chapter.novel.status === "DRAFT";
        if (novelActivated) {
          await tx.novel.update({
            where: { id: novelId },
            data: { status: "ACTIVE" },
          });
        }
        if (chapter.status !== "PUBLISHED") {
          await tx.chapter.update({
            where: { id: chapterId },
            data: { status: "PUBLISHED" },
          });
        }
        const data = {
          status: "PUBLISHED" as const,
          chapterVersionId: chapter.currentVersionId,
          revisionId: advanced.revisionId,
          publishedAt: now,
          publishedById: actorUserId,
          scheduledFor: null,
        };
        const published = existing
          ? await tx.publication.update({ where: { id: existing.id }, data })
          : await tx.publication.create({
              data: { id: publicationId, novelId, chapterId, ...data },
            });
        return { published, novelActivated };
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "publication.published",
        entityType: "Publication",
        entityId: row.published.id,
        payload: {
          novelId,
          chapterId,
          pinnedVersionId: row.published.chapterVersionId,
          ...(row.novelActivated ? { novelActivated: true } : {}),
        },
      });
      // NF-WF-019C: emit `novel.chapter_published` for the immediate
      // publish path. Enqueue AFTER commit (the schedule path's rule);
      // only the enqueue is awaited — fan-out itself is async and
      // bounded, so publish latency never grows with follower count
      // (Invariant 7). The scheduled path emits from the 012 worker
      // fire; both paths produce the same event (a chapter reaching
      // PUBLISHED), never a fabricated one.
      if (notificationQueue) {
        const fanout: NotificationFanoutJobData = {
          eventName: "novel.chapter_published",
          publicationId: row.published.id,
          novelId,
          chapterId,
        };
        await notificationQueue.add(NOTIFICATION_FANOUT_JOB_NAME, fanout, {
          jobId: randomUUID(),
        });
      }
      return {
        publicationId: row.published.id,
        pinnedVersionId: row.published.chapterVersionId,
        publishedAt: now.toISOString(),
      };
    },

    async unpublishChapter({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      const row = await db.$transaction(async (tx) => {
        await lockChapter(tx, novelId, chapterId);
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: { id: true, status: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
        const existing = await tx.publication.findUnique({
          where: { chapterId },
        });
        if (!existing || existing.status !== "PUBLISHED") {
          throw new ConflictError(
            "chapter has no published release — nothing to unpublish",
          );
        }
        if (chapter.status !== "PUBLISHED") {
          throw new ConflictError(
            "chapter status and release record disagree — unpublish via the chapter status path first",
          );
        }
        return existing;
      });
      // Reuse the existing setStatus PUBLISHED→IN_REVIEW path (ungated,
      // capability chapter:update — Invariant 6) rather than
      // re-implementing the flip. It runs its own transaction + revision;
      // the release-record flip below is the second half of the same
      // logical operation, serialized by the chapter row lock.
      await manuscripts.setStatus({
        actorUserId,
        workspaceId,
        novelId,
        chapterId,
        status: "IN_REVIEW",
      });
      const flipped = await db.$transaction(async (tx) => {
        await lockChapter(tx, novelId, chapterId);
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "publication.unpublished",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications"],
          items: [
            {
              entityType: "Publication",
              entityId: row.id,
              operation: "UPDATE",
            },
          ],
        });
        return tx.publication.update({
          where: { id: row.id },
          data: {
            status: "UNPUBLISHED",
            scheduledFor: null,
            revisionId: advanced.revisionId,
          },
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "publication.unpublished",
        entityType: "Publication",
        entityId: flipped.id,
        payload: { novelId, chapterId, retainedPin: flipped.chapterVersionId },
      });
      return { publicationId: flipped.id };
    },

    async cancelScheduledPublication({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:publish");
      const row = await db.$transaction(async (tx) => {
        await lockChapter(tx, novelId, chapterId);
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: { id: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
        const existing = await tx.publication.findUnique({
          where: { chapterId },
        });
        if (!existing || existing.status !== "SCHEDULED") {
          throw new PublicationError(
            "NOT_SCHEDULED",
            "chapter has no scheduled publication to cancel",
          );
        }
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "publication.schedule_cancelled",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications"],
          items: [
            {
              entityType: "Publication",
              entityId: existing.id,
              operation: "UPDATE",
            },
          ],
        });
        return tx.publication.update({
          where: { id: existing.id },
          data: {
            status: "UNPUBLISHED",
            scheduledFor: null,
            revisionId: advanced.revisionId,
          },
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "publication.schedule_cancelled",
        entityType: "Publication",
        entityId: row.id,
        payload: { novelId, chapterId },
      });
      // Remove AFTER commit: if the job fires in between, the row is
      // already UNPUBLISHED so the fire is a no-op (idempotence).
      const job = await queue.getJob(row.id);
      if (job) await job.remove();
      return { publicationId: row.id };
    },

    async archiveNovel({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "novel:archive");
      const cancelled = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR UPDATE`;
        const novel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { id: true, status: true },
        });
        if (!novel) throw new NotFoundError("novel");
        // Q5: archiving cancels every scheduled publication (rows →
        // UNPUBLISHED); cancelled schedules are never resurrected.
        const scheduled = await tx.publication.findMany({
          where: { novelId, status: "SCHEDULED" },
          select: { id: true },
        });
        const advanced = await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "novel.archived",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications"],
          items: [
            ...scheduled.map((s) => ({
              entityType: "Publication" as const,
              entityId: s.id,
              operation: "UPDATE" as const,
            })),
          ],
        });
        if (scheduled.length > 0) {
          await tx.publication.updateMany({
            where: { id: { in: scheduled.map((s) => s.id) } },
            data: {
              status: "UNPUBLISHED",
              scheduledFor: null,
              revisionId: advanced.revisionId,
            },
          });
        }
        if (novel.status !== "ARCHIVED") {
          await tx.novel.update({
            where: { id: novelId },
            data: { status: "ARCHIVED" },
          });
        }
        return scheduled;
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "novel.archived",
        entityType: "Novel",
        entityId: novelId,
        payload: { cancelledSchedules: cancelled.map((c) => c.id) },
      });
      // Jobs removed after commit (Q5). A job firing in between finds its
      // row UNPUBLISHED and no-ops.
      for (const c of cancelled) {
        const job = await queue.getJob(c.id);
        if (job) await job.remove();
      }
      return { novelId };
    },

    async unarchiveNovel({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "novel:archive");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR UPDATE`;
        const novel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { id: true, status: true },
        });
        if (!novel) throw new NotFoundError("novel");
        if (novel.status === "ARCHIVED") {
          await tx.novel.update({
            where: { id: novelId },
            data: { status: "ACTIVE" },
          });
        }
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "novel.unarchived",
          origin: "MANUAL",
          actorUserId,
          tables: ["publications"],
          items: [],
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "novel.unarchived",
        entityType: "Novel",
        entityId: novelId,
        payload: {},
      });
      return { novelId };
    },

    async getPublicationStatus({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:read");
      const chapter = await db.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          publication: {
            select: {
              status: true,
              scheduledFor: true,
              publishedAt: true,
              chapterVersion: { select: { number: true } },
            },
          },
        },
      });
      if (!chapter) throw new NotFoundError("chapter");
      const pub = chapter.publication;
      if (!pub) {
        return {
          status: "UNPUBLISHED",
          scheduledFor: null,
          publishedAt: null,
          pinnedVersionNumber: null,
        };
      }
      return {
        status: pub.status,
        scheduledFor: pub.scheduledFor?.toISOString() ?? null,
        publishedAt: pub.publishedAt?.toISOString() ?? null,
        pinnedVersionNumber: pub.chapterVersion.number,
      };
    },

    async isPubliclyVisible({ novelId, chapterId }) {
      // Invariant 9: ACTIVE novel AND a PUBLISHED publication row.
      // Everything else resolves as 404 (no existence oracle).
      const novel = await db.novel.findUnique({
        where: { id: novelId },
        select: { status: true },
      });
      if (!novel || novel.status !== "ACTIVE") return false;
      const pub = await db.publication.findUnique({
        where: { chapterId },
        select: { novelId: true, status: true },
      });
      return pub?.novelId === novelId && pub.status === "PUBLISHED";
    },

    async resolvePublicChapter({ novelSlug, chapterNumber }) {
      // Public resolution serves the PINNED version only (Invariant 4).
      const novels = await db.novel.findMany({
        where: { slug: novelSlug, status: "ACTIVE" },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      for (const novel of novels) {
        const chapter = await db.chapter.findFirst({
          where: { novelId: novel.id, number: chapterNumber },
          select: {
            id: true,
            publication: {
              select: { status: true, chapterVersionId: true },
            },
          },
        });
        if (
          chapter?.publication?.status === "PUBLISHED"
        ) {
          return {
            novelId: novel.id,
            chapterId: chapter.id,
            pinnedVersionId: chapter.publication.chapterVersionId,
          };
        }
      }
      return null;
    },

    // NF-WF-013 additive public-reader helpers (anonymous routes).
    async resolvePublicNovelBySlug({ novelSlug }) {
      return resolvePublicNovelBySlug(db, novelSlug);
    },

    async listPublishedChapters({ novelId }) {
      return listPublishedChapters(db, novelId);
    },

    async resolvePublicChapterNovelFirst({ novelSlug, chapterNumber }) {
      // Novel-first: resolve the winning novel exactly like the novel
      // route does, then look up the chapter within THAT novel only.
      const novel = await resolvePublicNovelBySlug(db, novelSlug);
      if (!novel) return null;
      const chapter = await db.chapter.findFirst({
        where: { novelId: novel.id, number: chapterNumber },
        select: {
          id: true,
          number: true,
          title: true,
          // NF-WF-019A (Q8, GAP-068): additive aggregate counts on the
          // frozen 013 chapter shape. The chapter page 404s unless the
          // chapter's publication is PUBLISHED, so these counts always
          // reflect published-visible engagement (GAP-068 condition b).
          likeCount: true,
          commentCount: true,
          publication: {
            select: {
              status: true,
              publishedAt: true,
              chapterVersion: { select: { id: true, number: true, content: true } },
            },
          },
        },
      });
      const pub = chapter?.publication;
      if (!pub || pub.status !== "PUBLISHED") return null;
      const content = pub.chapterVersion.content;
      const published = await listPublishedChapters(db, novel.id);
      const idx = published.findIndex((c) => c.number === chapterNumber);
      return {
        novelId: novel.id,
        chapterId: chapter.id,
        chapter: {
          number: chapter!.number,
          title: chapter!.title,
          content,
          // NF-WF-015 (Invariant 2, F4): the pinned version's content is
          // sanitized HTML — count words, not tags, with the shared strip
          // rule (the same rule the save path uses).
          wordCount: countWords(stripHtmlTags(content)),
          publishedVersionNumber: pub.chapterVersion.number,
          publishedAt: pub.publishedAt!.toISOString(),
          // NF-WF-019A (Q8, GAP-068): additive counts (see note above).
          likeCount: chapter!.likeCount,
          commentCount: chapter!.commentCount,
        },
        prevChapter:
          idx > 0
            ? {
                number: published[idx - 1]!.number,
                title: published[idx - 1]!.title,
              }
            : null,
        nextChapter:
          idx >= 0 && idx < published.length - 1
            ? {
                number: published[idx + 1]!.number,
                title: published[idx + 1]!.title,
              }
            : null,
      };
    },

    async resolvePublicAuthor({ authorId }) {
      const user = await db.user.findUnique({
        where: { id: authorId },
        select: { id: true, displayName: true },
      });
      if (!user) return null;
      const novels = await db.novel.findMany({
        where: {
          createdById: authorId,
          status: "ACTIVE",
          chapters: { some: { publication: { status: "PUBLISHED" } } },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          chapters: {
            where: { publication: { status: "PUBLISHED" } },
            select: { publication: { select: { publishedAt: true } } },
          },
        },
      });
      if (novels.length === 0) return null;
      const rows = novels.map((n) => {
        const first = n.chapters
          .map((c) => c.publication!.publishedAt!.getTime())
          .sort((a, b) => a - b)[0];
        return {
          id: n.id,
          title: n.title,
          slug: n.slug,
          publishedChapterCount: n.chapters.length,
          firstPublishedAt: first,
        };
      });
      // Author page ordering: earliest publishedAt first (pinned here;
      // the contract's recommended choice).
      rows.sort((a, b) => (a.firstPublishedAt ?? 0) - (b.firstPublishedAt ?? 0));
      // NF-WF-019A (GAP-070): additive author-follower aggregate on the
      // frozen 013 author shape. Pure row count — no per-user state;
      // served to anonymous readers as static text (the contract's 019A
      // Web UI acceptance). No auth object, no session handling
      // (013 Invariant 2 preserved).
      const followerCount = await db.authorFollow.count({
        where: { authorId },
      });
      return {
        author: {
          id: user.id,
          displayName: user.displayName,
          followerCount,
        },
        novels: rows.map(({ id, title, slug, publishedChapterCount }) => ({
          id,
          title,
          slug,
          publishedChapterCount,
        })),
      };
    },
  };
}
