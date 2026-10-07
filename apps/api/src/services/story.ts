/**
 * Story intelligence services (Phase 6 slice 2) — the write surface behind the
 * Story Brain.
 *
 * Slice 2 shipped the read half: five tables, nine pure rules in
 * @novelforge/story-intelligence, and a Brain that answers EVENT, CAUSAL,
 * UNRESOLVED and PROMISES from them. Nothing could populate those tables
 * outside a test, so the roadmap's exit criterion held in tests only. This
 * service is the missing half.
 *
 * Rules are imported from the domain package and never re-implemented. Two of
 * them had no production caller before this file — canPromiseTransition and
 * findCausalCycle — because the write path they police did not exist. Each now
 * runs on the request that would violate it, and the migration CHECKs remain
 * the backstop for a race the pre-check cannot see (the Phase 8 posture:
 * validate for the message, constrain for the truth).
 *
 * isChronological is the third and takes the other route: the unique index
 * `(novel_id, order)` makes a colliding timeline slot unrepresentable, so the
 * rule is enforced by the schema rather than called from here. The migration
 * names that index as the rule's write-side twin.
 *
 * Deliberately absent: any delete route. causal_edges cascade from
 * story_events, so deleting an event would silently take its causal claims
 * with it — the exact loss CLAUDE.md §9 forbids. A correction path needs its
 * own design (supersede chain, as canon has) before a delete can be safe.
 */
import {
  canPromiseTransition,
  edgeRequiresApproval,
  findCausalCycle,
  type CausalConfidence,
  type PromiseStatus,
  type ThreadKind,
  type ThreadStatus,
} from "@novelforge/story-intelligence";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";
// Head CAS for every covered mutation (STORY-VERSIONING.md C3/C4).
import { createWithRevision } from "./revisions.ts";

// --- Views ---

export interface StoryEventView {
  id: string;
  novelId: string;
  description: string;
  chapterId: string | null;
  availableFromChapter: number | null;
  createdAt: Date;
}

export interface TimelineEventView {
  id: string;
  novelId: string;
  description: string;
  order: number;
  availableFromChapter: number | null;
}

export interface StoryThreadView {
  id: string;
  novelId: string;
  kind: ThreadKind;
  title: string;
  description: string | null;
  status: ThreadStatus;
  importance: number;
  introducedAtChapter: number | null;
  resolvedAtChapter: number | null;
  payoffIntent: string | null;
}

export interface StoryPromiseView {
  id: string;
  novelId: string;
  title: string;
  description: string | null;
  status: PromiseStatus;
  importance: number;
  introducedAtChapter: number | null;
  payoffAtChapter: number | null;
  payoffIntent: string | null;
}

export interface CausalEdgeView {
  id: string;
  novelId: string;
  causeEventId: string;
  effectEventId: string;
  confidence: CausalConfidence;
  approvedById: string | null;
}

// --- Service contract ---

/** Tenant scope every method takes. */
export interface StoryScope {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

export interface StoryServices {
  createEvent(input: StoryScope & {
    description: string;
    chapterId: string | null;
    availableFromChapter: number | null;
  }): Promise<StoryEventView>;

  listEvents(input: StoryScope): Promise<StoryEventView[]>;

  appendTimelineEvent(input: StoryScope & {
    description: string;
    availableFromChapter: number | null;
  }): Promise<TimelineEventView>;

  listTimeline(input: StoryScope): Promise<TimelineEventView[]>;

  createThread(input: StoryScope & {
    kind: ThreadKind;
    title: string;
    description: string | null;
    importance: number;
    introducedAtChapter: number | null;
    payoffIntent: string | null;
  }): Promise<StoryThreadView>;

  listThreads(input: StoryScope): Promise<StoryThreadView[]>;

  /** Enforces the resolution pair: RESOLVED names a chapter, the others do not. */
  setThreadStatus(input: StoryScope & {
    threadId: string;
    status: ThreadStatus;
    resolvedAtChapter: number | null;
  }): Promise<StoryThreadView>;

  createPromise(input: StoryScope & {
    title: string;
    description: string | null;
    importance: number;
    introducedAtChapter: number | null;
    payoffIntent: string | null;
  }): Promise<StoryPromiseView>;

  listPromises(input: StoryScope): Promise<StoryPromiseView[]>;

  /** Forward-only through the lifecycle (canPromiseTransition). */
  transitionPromise(input: StoryScope & {
    promiseId: string;
    to: PromiseStatus;
    payoffAtChapter: number | null;
  }): Promise<StoryPromiseView>;

  createCausalEdge(input: StoryScope & {
    causeEventId: string;
    effectEventId: string;
    confidence: CausalConfidence;
  }): Promise<CausalEdgeView>;

  listCausalEdges(input: StoryScope): Promise<CausalEdgeView[]>;
}

// --- Implementation ---

export function createStoryServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): StoryServices {
  const { db, audit } = deps;
  // Head CAS for every covered mutation (C3/C4), bound once (see revisions.ts).
  const withRevision = createWithRevision(db);

  /** Tenant gate: membership + novel resolved server-side, missing either is the SAME 404 (no leak); capability granular (ADR-0004). */
  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    capability: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, capability);
  }

  /** An event inside the tenant. The workspaceId predicate is the isolation boundary (ADR-0007). */
  async function requireEvent(eventId: string, novelId: string, workspaceId: string) {
    const event = await db.storyEvent.findFirst({
      where: { id: eventId, novelId, workspaceId },
      select: { id: true },
    });
    if (!event) throw new NotFoundError("story event");
    return event;
  }

  function toThreadView(row: {
    id: string; novelId: string; kind: string; title: string; description: string | null;
    status: string; importance: number; introducedAtChapter: number | null;
    resolvedAtChapter: number | null; payoffIntent: string | null;
  }): StoryThreadView {
    return {
      id: row.id,
      novelId: row.novelId,
      kind: row.kind as ThreadKind,
      title: row.title,
      description: row.description,
      status: row.status as ThreadStatus,
      importance: row.importance,
      introducedAtChapter: row.introducedAtChapter,
      resolvedAtChapter: row.resolvedAtChapter,
      payoffIntent: row.payoffIntent,
    };
  }

  function toPromiseView(row: {
    id: string; novelId: string; title: string; description: string | null;
    status: string; importance: number; introducedAtChapter: number | null;
    payoffAtChapter: number | null; payoffIntent: string | null;
  }): StoryPromiseView {
    return {
      id: row.id,
      novelId: row.novelId,
      title: row.title,
      description: row.description,
      status: row.status as PromiseStatus,
      importance: row.importance,
      introducedAtChapter: row.introducedAtChapter,
      payoffAtChapter: row.payoffAtChapter,
      payoffIntent: row.payoffIntent,
    };
  }

  return {
    // --- Story events -----------------------------------------------------

    async createEvent({ actorUserId, workspaceId, novelId, description, chapterId, availableFromChapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // The FK alone would accept a chapter from another novel.
      if (chapterId !== null) {
        const chapter = await db.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: { id: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
      }

      const created = await withRevision(
        { workspaceId, novelId, actorUserId },
        "event.append",
        "StoryEvent",
        ["story_events"],
        (tx) =>
          tx.storyEvent.create({
            data: {
              workspaceId, novelId, description, chapterId,
              availableFromChapter, createdById: actorUserId,
            },
          }),
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.event-recorded",
        entityType: "StoryEvent",
        entityId: created.id,
        payload: { chapterId, availableFromChapter },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        description: created.description,
        chapterId: created.chapterId,
        availableFromChapter: created.availableFromChapter,
        createdAt: created.createdAt,
      };
    },

    async listEvents({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.storyEvent.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        novelId: row.novelId,
        description: row.description,
        chapterId: row.chapterId,
        availableFromChapter: row.availableFromChapter,
        createdAt: row.createdAt,
      }));
    },

    // --- Timeline ---------------------------------------------------------

    /**
     * Append to the end of the timeline, assigning the next free slot.
     *
     * Appending rather than taking an `order` from the caller is what makes
     * the ordering rule hold: a caller-chosen slot could be inserted between
     * two existing events, which renumbers a timeline the reader has already
     * seen. `(novelId, order)` is unique, so a concurrent append loses the
     * race and is retried by the constraint rather than by silent overwrite.
     */
    async appendTimelineEvent({ actorUserId, workspaceId, novelId, description, availableFromChapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      const last = await db.timelineEvent.findFirst({
        where: { novelId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const order = (last?.order ?? 0) + 1;

      let created;
      try {
        created = await withRevision(
          { workspaceId, novelId, actorUserId },
          "timeline.append",
          "TimelineEvent",
          ["timeline_events"],
          (tx) =>
            tx.timelineEvent.create({
              data: {
                workspaceId, novelId, description, order,
                availableFromChapter, createdById: actorUserId,
              },
            }),
        );
      } catch (error) {
        // timeline_events_novel_id_order_key. Two concurrent appends both read
        // the same last order and both compute the next one; the index rejects
        // the loser. NOT reachable from the test suite — Prisma serialises the
        // injects on one connection, so the interleaving cannot be forced
        // deterministically, and a test that only sometimes races is worse
        // than none. This branch is race defence, not a covered path.
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError("another timeline entry took this slot; retry the append");
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.timeline-appended",
        entityType: "TimelineEvent",
        entityId: created.id,
        payload: { order },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        description: created.description,
        order: created.order,
        availableFromChapter: created.availableFromChapter,
      };
    },

    async listTimeline({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      // No isChronological call here, deliberately. The migration records the
      // unique index `(novel_id, order)` as "the write-side twin of
      // isChronological()'s tie refusal" — so a colliding slot is
      // UNREPRESENTABLE, and a read-side check would be a branch that can
      // never execute. The rule stays in the domain package (pinned by its own
      // unit test) and the index is its enforcement; appendTimelineEvent
      // surfaces the refusal as a 409 rather than a 500.
      const rows = await db.timelineEvent.findMany({
        where: { novelId, workspaceId },
        orderBy: { order: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        novelId: row.novelId,
        description: row.description,
        order: row.order,
        availableFromChapter: row.availableFromChapter,
      }));
    },

    // --- Threads ----------------------------------------------------------

    async createThread({
      actorUserId, workspaceId, novelId,
      kind, title, description, importance, introducedAtChapter, payoffIntent,
    }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const created = await withRevision(
        { workspaceId, novelId, actorUserId },
        "thread.transition",
        "StoryThread",
        ["story_threads"],
        (tx) =>
          tx.storyThread.create({
            data: {
              workspaceId, novelId, kind, title, description, importance,
              introducedAtChapter, payoffIntent, createdById: actorUserId,
            },
          }),
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.thread-opened",
        entityType: "StoryThread",
        entityId: created.id,
        payload: { kind, importance },
      });
      return toThreadView(created);
    },

    async listThreads({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.storyThread.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toThreadView);
    },

    async setThreadStatus({ actorUserId, workspaceId, novelId, threadId, status, resolvedAtChapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const found = await db.storyThread.findFirst({
        where: { id: threadId, novelId, workspaceId },
        select: { id: true },
      });
      if (!found) throw new NotFoundError("story thread");

      // StoryThread_resolution_pair, stated at the boundary so the caller
      // gets a sentence instead of a 23514.
      if (status === "RESOLVED" && resolvedAtChapter === null) {
        throw new ConflictError("a RESOLVED thread must name the chapter where it closed");
      }
      if (status !== "RESOLVED" && resolvedAtChapter !== null) {
        throw new ConflictError(`a ${status} thread has not resolved, so it has no resolution chapter`);
      }

      const updated = await withRevision(
        { workspaceId, novelId, actorUserId },
        "thread.transition",
        "StoryThread",
        ["story_threads"],
        (tx) =>
          tx.storyThread.update({
            where: { id: threadId },
            data: { status, resolvedAtChapter },
          }),
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.thread-status-changed",
        entityType: "StoryThread",
        entityId: threadId,
        payload: { status, resolvedAtChapter },
      });
      return toThreadView(updated);
    },

    // --- Promises ---------------------------------------------------------

    async createPromise({
      actorUserId, workspaceId, novelId,
      title, description, importance, introducedAtChapter, payoffIntent,
    }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const created = await withRevision(
        { workspaceId, novelId, actorUserId },
        "promise.transition",
        "StoryPromise",
        ["story_promises"],
        (tx) =>
          tx.storyPromise.create({
            data: {
              workspaceId, novelId, title, description, importance,
              introducedAtChapter, payoffIntent, createdById: actorUserId,
            },
          }),
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.promise-made",
        entityType: "StoryPromise",
        entityId: created.id,
        payload: { importance },
      });
      return toPromiseView(created);
    },

    async listPromises({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.storyPromise.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toPromiseView);
    },

    async transitionPromise({ actorUserId, workspaceId, novelId, promiseId, to, payoffAtChapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const found = await db.storyPromise.findFirst({
        where: { id: promiseId, novelId, workspaceId },
        select: { id: true, status: true },
      });
      if (!found) throw new NotFoundError("story promise");

      const from = found.status as PromiseStatus;
      // Forward-only. Closed states are terminal: reopening a paid-off
      // promise would rewrite what the reader already experienced, so the
      // correction belongs in a new promise, not a status flip.
      if (!canPromiseTransition(from, to)) {
        throw new ConflictError(`a promise cannot move from ${from} to ${to}`);
      }
      // StoryPromise_payoff_pair.
      if (to === "PAID_OFF" && payoffAtChapter === null) {
        throw new ConflictError("a PAID_OFF promise must name the chapter where it was paid");
      }
      if (to !== "PAID_OFF" && payoffAtChapter !== null) {
        throw new ConflictError(`a ${to} promise is not paid off, so it has no payoff chapter`);
      }

      const updated = await withRevision(
        { workspaceId, novelId, actorUserId },
        "promise.transition",
        "StoryPromise",
        ["story_promises"],
        (tx) =>
          tx.storyPromise.update({
            where: { id: promiseId },
            data: { status: to, payoffAtChapter },
          }),
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "story.promise-transitioned",
        entityType: "StoryPromise",
        entityId: promiseId,
        payload: { from, to, payoffAtChapter },
      });
      return toPromiseView(updated);
    },

    // --- Causal edges -----------------------------------------------------

    /**
     * Record that one event caused another.
     *
     * Two rules run here. The cycle check refuses the edge that would close a
     * loop — A because B because A is a time paradox, and every "why"
     * question downstream of it becomes unanswerable. The approval rule
     * splits the authority: EXPLICIT is grounded in prose the author wrote
     * and is canon on arrival; INFERRED and SPECULATIVE are conclusions
     * someone drew (CLAUDE.md §2.13), so they need canon:approve and carry
     * the approver's id — the CHECK refuses one that arrives without it.
     */
    async createCausalEdge({ actorUserId, workspaceId, novelId, causeEventId, effectEventId, confidence }) {
      const needsApproval = edgeRequiresApproval(confidence);
      // The capability is decided before the gate so an author without
      // canon:approve is refused for the right reason rather than being told
      // the novel is missing.
      await gate(actorUserId, workspaceId, novelId, needsApproval ? "canon:approve" : "canon:manage");

      if (causeEventId === effectEventId) {
        throw new ConflictError("an event cannot cause itself");
      }
      // Both ends must be this novel's events; the FKs alone would allow a
      // cross-novel edge.
      await requireEvent(causeEventId, novelId, workspaceId);
      await requireEvent(effectEventId, novelId, workspaceId);

      // Every edge in the novel, not just the ancestors of this pair: a cycle
      // only closes against the graph as a whole, and the DFS is O(V+E) so a
      // 2,500-chapter novel's edge set is not a concern.
      const existing = await db.causalEdge.findMany({
        where: { novelId, workspaceId },
        select: { causeEventId: true, effectEventId: true },
      });
      const cycle = findCausalCycle([...existing, { causeEventId, effectEventId }]);
      if (cycle !== null) {
        throw new ConflictError(
          `this edge would close a causal loop: ${cycle.join(" -> ")}`,
        );
      }

      let created;
      try {
        created = await withRevision(
          { workspaceId, novelId, actorUserId },
          "causalEdge.create",
          "CausalEdge",
          ["causal_edges"],
          (tx) =>
            tx.causalEdge.create({
              data: {
                workspaceId, novelId, causeEventId, effectEventId, confidence,
                approvedById: needsApproval ? actorUserId : null,
              },
            }),
        );
      } catch (error) {
        // causal_edges_novel_id_cause_event_id_effect_event_id_key.
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError("this causal edge already exists");
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: needsApproval ? "story.causal-edge-approved" : "story.causal-edge-recorded",
        entityType: "CausalEdge",
        entityId: created.id,
        payload: { causeEventId, effectEventId, confidence },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        causeEventId: created.causeEventId,
        effectEventId: created.effectEventId,
        confidence: created.confidence as CausalConfidence,
        approvedById: created.approvedById,
      };
    },

    async listCausalEdges({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.causalEdge.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        novelId: row.novelId,
        causeEventId: row.causeEventId,
        effectEventId: row.effectEventId,
        confidence: row.confidence as CausalConfidence,
        approvedById: row.approvedById,
      }));
    },
  };
}
