/**
 * Planning services (Phase 7, slice 2) — Prisma-backed use cases over the
 * planning tables; pure rules live in @novelforge/planning, imported and
 * never re-implemented. Concurrency discipline (canon.ts precedent):
 * state transitions are updateMany CAS with a status predicate — zero
 * count throws ConflictError; the outline_versions_live partial unique
 * index is the DB backstop for one-APPROVED-per-novel.
 */
import { randomUUID } from "node:crypto";
import {
  horizonFor,
  validateHierarchy,
  type OutlineNodeKind,
  type PlanningKind,
} from "@novelforge/planning";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { InputJsonValue, NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";

// --- Views ---

export interface SynopsisView {
  id: string; novelId: string; content: string; status: string; createdAt: Date;
}

export interface SagaView {
  id: string; novelId: string; parentId: string | null; kind: PlanningKind;
  title: string; intent: string | null; createdAt: Date;
}

export interface OutlineNodeView {
  id: string; novelId: string; sagaId: string; kind: OutlineNodeKind; title: string;
  summary: string | null; order: number; chapterId: string | null; sceneId: string | null;
}

export interface OutlineVersionView {
  id: string; novelId: string; number: number; status: string; content: unknown;
  note: string | null; createdAt: Date;
}

// --- Service contract ---

/** Tenant scope every method takes; the fields all 13 share, deduplicated. */
export interface Scope {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

export interface PlanningServices {
  createSynopsis(input: Scope & { content: string }): Promise<SynopsisView>;

  listSynopses(input: Scope & { includeArchived: boolean; take: number; skip: number }): Promise<SynopsisView[]>;

  archiveSynopsis(input: Scope & { synopsisId: string }): Promise<void>;

  createSaga(input: Scope & { kind: PlanningKind; title: string; parentId: string | null; intent: string | null }): Promise<SagaView>;

  listSagas(input: Scope & { take: number; skip: number }): Promise<SagaView[]>;

  createOutlineNode(input: Scope & {
    sagaId: string;
    kind: OutlineNodeKind;
    title: string;
    summary: string | null;
    order: number;
    chapterId: string | null;
    sceneId: string | null;
  }): Promise<OutlineNodeView>;

  listOutlineNodes(input: Scope & { sagaId: string | null; take: number; skip: number }): Promise<OutlineNodeView[]>;

  createOutlineDraft(input: Scope & { content: unknown; note: string | null }): Promise<OutlineVersionView>;

  listOutlineVersions(input: Scope & { take: number; skip: number }): Promise<OutlineVersionView[]>;

  approveOutlineVersion(input: Scope & { versionId: string }): Promise<OutlineVersionView>;

  supersedeApprovedOutline(input: Scope): Promise<void>;

  getHorizon(input: Scope): Promise<{ policy: unknown; updatedAt: Date | null }>;

  putHorizon(input: Scope & { policy: unknown }): Promise<{ policy: unknown; updatedAt: Date }>;
}

// --- Implementation ---

export function createPlanningServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): PlanningServices {
  const { db, audit } = deps;

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

  return {
    // --- Synopses ---------------------------------------------------------

    async createSynopsis({ actorUserId, workspaceId, novelId, content }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const created = await db.synopsis.create({
        data: { novelId, content, createdById: actorUserId },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "planning.synopsis-created",
        entityType: "Synopsis",
        entityId: created.id,
        payload: { contentLength: content.length },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        content: created.content,
        status: created.status,
        createdAt: created.createdAt,
      };
    },

    async listSynopses({ actorUserId, workspaceId, novelId, includeArchived, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.synopsis.findMany({
        where: { novelId, ...(includeArchived ? {} : { status: "ACTIVE" }) },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return rows.map((r) => ({
        id: r.id,
        novelId: r.novelId,
        content: r.content,
        status: r.status,
        createdAt: r.createdAt,
      }));
    },

    async archiveSynopsis({ actorUserId, workspaceId, novelId, synopsisId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const existing = await db.synopsis.findFirst({
        where: { id: synopsisId, novelId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError("synopsis");

      // CAS on ACTIVE (not read-then-write): a concurrent archive must lose with a 409, not double-archive or resurrect. Zero count = already archived.
      const archived = await db.synopsis.updateMany({
        where: { id: synopsisId, novelId, status: "ACTIVE" },
        data: { status: "ARCHIVED" },
      });
      if (archived.count === 0) {
        throw new ConflictError("this synopsis is already archived");
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "planning.synopsis-archived",
        entityType: "Synopsis",
        entityId: synopsisId,
      });
    },

    // --- Sagas (hierarchy) ------------------------------------------------

    async createSaga({ actorUserId, workspaceId, novelId, kind, title, parentId, intent }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // Hierarchy validated over the WHOLE fetched batch (existing + candidate) so the rule sees the tree as the DB holds it; UNKNOWN_PARENT here, FK catches hard deletes only.
      const existing = await db.saga.findMany({
        where: { novelId },
        select: { id: true, parentId: true, kind: true },
      });
      const candidateId = `candidate:${randomUUID()}`;
      const result = validateHierarchy([
        ...existing.map((s) => ({ id: s.id, parentId: s.parentId, kind: s.kind as PlanningKind })),
        ...(parentId
          ? [{ id: candidateId, parentId, kind }]
          : []),
      ]);
      if (!result.ok) {
        throw new ConflictError(`hierarchy invalid: ${result.errors.map((e) => e.kind).join(", ")}`);
      }

      try {
        const created = await db.saga.create({
          data: { novelId, kind, title, parentId, intent, createdById: actorUserId },
        });
        await audit.record({
          actorUserId,
          workspaceId,
          action: "planning.saga-created",
          entityType: "Saga",
          entityId: created.id,
          payload: { kind, parentId },
        });
        return {
          id: created.id,
          novelId: created.novelId,
          parentId: created.parentId,
          kind: created.kind as PlanningKind,
          title: created.title,
          intent: created.intent,
          createdAt: created.createdAt,
        };
      } catch (e) {
        // A concurrent create may have made the parent vanish (Cascade) or produced the cycle the batch check could not yet see.
        const code = (e as { code?: string })?.code;
        if (code === "P2003") {
          throw new ConflictError("parent saga no longer exists");
        }
        throw e;
      }
    },

    async listSagas({ actorUserId, workspaceId, novelId, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.saga.findMany({
        where: { novelId },
        orderBy: { createdAt: "asc" },
        take,
        skip,
      });
      return rows.map((r) => ({
        id: r.id,
        novelId: r.novelId,
        parentId: r.parentId,
        kind: r.kind as PlanningKind,
        title: r.title,
        intent: r.intent,
        createdAt: r.createdAt,
      }));
    },

    // --- Outline nodes ----------------------------------------------------

    async createOutlineNode({ actorUserId, workspaceId, novelId, sagaId, kind, title, summary, order, chapterId, sceneId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // Leaf-links rule: CHAPTER_GROUP carries no link, CHAPTER/SCENE exactly one. 400-class malformed input; the DB CHECK is the backstop.
      const links = (chapterId ? 1 : 0) + (sceneId ? 1 : 0);
      if (kind === "CHAPTER_GROUP" && links !== 0) {
        throw new ConflictError("CHAPTER_GROUP nodes cannot link a chapter or scene");
      }
      if (kind !== "CHAPTER_GROUP" && links !== 1) {
        throw new ConflictError(`${kind} nodes must link exactly one chapter or scene`);
      }

      // sagaId must belong to THIS novel — a foreign sagaId would pass the FK (both rows exist) and create a cross-tenant node.
      const saga = await db.saga.findFirst({ where: { id: sagaId, novelId }, select: { id: true } });
      if (!saga) throw new NotFoundError("saga");

      // Same-novel guard for the linked leaf: chapter/scene are novel-scoped, so verify the id lives here.
      if (chapterId) {
        const chapter = await db.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: { id: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
      }
      if (sceneId) {
        const scene = await db.scene.findFirst({
          where: { id: sceneId, chapter: { novelId } },
          select: { id: true },
        });
        if (!scene) throw new NotFoundError("scene");
      }

      try {
        const created = await db.outlineNode.create({
          data: { novelId, sagaId, kind, title, summary, order, chapterId, sceneId },
        });
        await audit.record({
          actorUserId,
          workspaceId,
          action: "planning.outline-node-created",
          entityType: "OutlineNode",
          entityId: created.id,
          payload: { sagaId, kind, order },
        });
        return {
          id: created.id,
          novelId: created.novelId,
          sagaId: created.sagaId,
          kind: created.kind as OutlineNodeKind,
          title: created.title,
          summary: created.summary,
          order: created.order,
          chapterId: created.chapterId,
          sceneId: created.sceneId,
        };
      } catch (e) {
        const code = (e as { code?: string })?.code;
        // @@unique([sagaId, order]) — two nodes claiming the same slot.
        if (code === "P2002") {
          throw new ConflictError(`order ${order} is already taken in this saga`);
        }
        // FK on sagaId/chapterId/sceneId — a concurrent delete may have
        // removed a linked row between the pre-check and the create.
        if (code === "P2003") {
          throw new ConflictError("linked saga, chapter or scene no longer exists");
        }
        throw e;
      }
    },

    async listOutlineNodes({ actorUserId, workspaceId, novelId, sagaId, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.outlineNode.findMany({
        where: { novelId, ...(sagaId ? { sagaId } : {}) },
        orderBy: [{ sagaId: "asc" }, { order: "asc" }],
        take,
        skip,
      });
      return rows.map((r) => ({
        id: r.id,
        novelId: r.novelId,
        sagaId: r.sagaId,
        kind: r.kind as OutlineNodeKind,
        title: r.title,
        summary: r.summary,
        order: r.order,
        chapterId: r.chapterId,
        sceneId: r.sceneId,
      }));
    },

    // --- Outline versions -------------------------------------------------

    async createOutlineDraft({ actorUserId, workspaceId, novelId, content, note }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // number is monotonic per novel (@@unique([novelId, number])): the max
      // read sits inside the same transaction as the create, but READ COMMITTED
      // takes no lock on the read — the unique index is the actual backstop,
      // and a concurrent draft surfaces here as P2002, mapped to a 409.
      const created = await db
        .$transaction(async (tx) => {
          const latest = await tx.outlineVersion.findFirst({
            where: { novelId },
            orderBy: { number: "desc" },
            select: { number: true },
          });
          return tx.outlineVersion.create({
            data: { novelId, number: (latest?.number ?? 0) + 1, status: "DRAFT", content: content as InputJsonValue, note, createdById: actorUserId },
          });
        })
        .catch((e: unknown) => {
          // A concurrent create raced us to the same next number; the index
          // rejected it — a conflict with the other draft, not a 500.
          const code = (e as { code?: string })?.code;
          if (code === "P2002") {
            throw new ConflictError("another outline draft was created concurrently");
          }
          throw e;
        });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "planning.outline-draft-created",
        entityType: "OutlineVersion",
        entityId: created.id,
        payload: { number: created.number },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        number: created.number,
        status: created.status,
        content: created.content,
        note: created.note,
        createdAt: created.createdAt,
      };
    },

    async listOutlineVersions({ actorUserId, workspaceId, novelId, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.outlineVersion.findMany({
        where: { novelId },
        orderBy: { number: "desc" },
        take,
        skip,
      });
      return rows.map((r) => ({
        id: r.id,
        novelId: r.novelId,
        number: r.number,
        status: r.status,
        content: r.content,
        note: r.note,
        createdAt: r.createdAt,
      }));
    },

    async approveOutlineVersion({ actorUserId, workspaceId, novelId, versionId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:approve");

      const existing = await db.outlineVersion.findFirst({
        where: { id: versionId, novelId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError("outline version");

      try {
        const approved = await db.$transaction(async (tx) => {
          // Step 1: clear the single APPROVED slot — the status predicate is the CAS on the current live version; count 0 = already superseded (no-op, fine).
          await tx.outlineVersion.updateMany({
            where: { novelId, status: "APPROVED" },
            data: { status: "SUPERSEDED" },
          });

          // Step 2: CAS target DRAFT -> APPROVED. Re-checking HERE (not the pre-transaction findFirst) makes a lost race a 409: a concurrent flip matches zero rows.
          const promoted = await tx.outlineVersion.updateMany({
            where: { id: versionId, novelId, status: "DRAFT" },
            data: { status: "APPROVED" },
          });
          if (promoted.count !== 1) {
            throw new ConflictError("this outline version is not a draft (already approved or superseded)");
          }

          const row = await tx.outlineVersion.findUniqueOrThrow({
            where: { id: versionId },
          });
          return row;
        });
        // outline_versions_live partial unique index would reject a second APPROVED with P2002 — DB backstop; the CAS above gets the loser a 409 first.
        await audit.record({
          actorUserId,
          workspaceId,
          action: "planning.outline-approved",
          entityType: "OutlineVersion",
          entityId: versionId,
          payload: { number: approved.number },
        });
        return {
          id: approved.id,
          novelId: approved.novelId,
          number: approved.number,
          status: approved.status,
          content: approved.content,
          note: approved.note,
          createdAt: approved.createdAt,
        };
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "P2002") {
          // Partial index fired: another APPROVED slipped in between supersede and promote — genuinely concurrent approvals.
          throw new ConflictError("another outline version was approved concurrently");
        }
        throw e;
      }
    },

    async supersedeApprovedOutline({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:approve");
      const superseded = await db.outlineVersion.updateMany({
        where: { novelId, status: "APPROVED" },
        data: { status: "SUPERSEDED" },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "planning.outline-superseded",
        entityType: "OutlineVersion",
        payload: { count: superseded.count },
      });
    },

    // --- Planning horizon -------------------------------------------------

    async getHorizon({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const row = await db.planningHorizon.findUnique({ where: { novelId } });
      // No row = no policy yet; the pure rule reports EMPTY_POLICY — inventing a default would lie about state.
      return { policy: row?.policy ?? null, updatedAt: row?.updatedAt ?? null };
    },

    async putHorizon({ actorUserId, workspaceId, novelId, policy }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // Validate through the pure rule, not trust: probe at distance 0 exercises the full shape check; a rejected policy is stored nowhere.
      const probe = horizonFor(0, policy);
      if ("problem" in probe) throw new ConflictError(`horizon policy invalid: ${probe.problem}`);

      const row = await db.planningHorizon.upsert({
        where: { novelId },
        update: { policy: policy as InputJsonValue },
        create: { novelId, policy: policy as InputJsonValue },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "planning.horizon-put",
        entityType: "PlanningHorizon",
        entityId: novelId,
      });
      return { policy: row.policy, updatedAt: row.updatedAt };
    },
  };
}
