/**
 * Platform services (Phase 1): workspaces, memberships, novels.
 *
 * Application services own use cases and transaction boundaries
 * (API-BOUNDARIES.md). Every access resolves membership server-side and
 * enforces capabilities from @novelforge/auth/authorization (ADR-0004) —
 * never trusting client claims. Sensitive mutations write audit records.
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  can,
  ForbiddenError,
  requireCapability,
  type Capability,
  type Role,
} from "@novelforge/auth/authorization";
import type { AuditService } from "./audit.ts";

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Unique-constraint violations (Prisma P2002) from create-race losers map to
 * the same 409 as the pre-check — never a 500. Duck-typed on `code` so it
 * holds regardless of how the driver adapter wraps the error.
 */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

export interface PlatformServices {
  createWorkspace(input: {
    actorUserId: string;
    name: string;
    slug: string;
  }): Promise<{ id: string }>;

  getWorkspace(actorUserId: string, workspaceId: string): Promise<WorkspaceView>;

  addMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role: Role;
  }): Promise<{ id: string }>;

  changeMemberRole(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role: Role;
  }): Promise<void>;

  removeMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
  }): Promise<void>;

  listMembers(actorUserId: string, workspaceId: string): Promise<MemberView[]>;

  createNovel(input: {
    actorUserId: string;
    workspaceId: string;
    title: string;
    slug: string;
  }): Promise<{ id: string }>;

  getNovel(actorUserId: string, workspaceId: string, novelId: string): Promise<NovelView>;

  /** Novels in every workspace the actor is a member of. */
  listNovelsForUser(actorUserId: string): Promise<NovelView[]>;

  listNovels(actorUserId: string, workspaceId: string): Promise<NovelView[]>;
}

export interface WorkspaceView {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: Role;
}

export interface MemberView {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface NovelView {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
}

export function createPlatformServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): PlatformServices {
  const { db, audit } = deps;

  /**
   * Resolve the actor's membership in a workspace. Missing membership is
   * a 404 (not 403) so existence of foreign workspaces is not leaked.
   */
  async function requireMembership(
    actorUserId: string,
    workspaceId: string,
  ): Promise<Role> {
    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: actorUserId },
      },
    });
    if (!membership) throw new NotFoundError("workspace");
    return membership.role;
  }

  async function requireCapabilityIn(
    actorUserId: string,
    workspaceId: string,
    capability: Capability,
  ): Promise<Role> {
    const role = await requireMembership(actorUserId, workspaceId);
    requireCapability(role, capability);
    return role;
  }

  /** Load a novel and prove it belongs to the given workspace. */
  async function requireNovelInWorkspace(novelId: string, workspaceId: string) {
    const novel = await db.novel.findUnique({ where: { id: novelId } });
    // Same 404 for "missing" and "in another workspace" — no cross-tenant
    // existence leaks.
    if (!novel || novel.workspaceId !== workspaceId) {
      throw new NotFoundError("novel");
    }
    return novel;
  }

  return {
    async createWorkspace({ actorUserId, name, slug }) {
      const existing = await db.workspace.findUnique({ where: { slug } });
      if (existing) throw new ConflictError("workspace slug already exists");

      // Owner row + OWNER membership atomically; audit after commit.
      let workspace;
      try {
        workspace = await db.$transaction(async (tx) => {
          const ws = await tx.workspace.create({
            data: { name, slug, ownerId: actorUserId },
          });
          await tx.membership.create({
            data: { workspaceId: ws.id, userId: actorUserId, role: "OWNER" },
          });
          return ws;
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError("workspace slug already exists");
        throw e;
      }
      await audit.record({
        actorUserId,
        workspaceId: workspace.id,
        action: "workspace.created",
        entityType: "Workspace",
        entityId: workspace.id,
        payload: { slug },
      });
      return { id: workspace.id };
    },

    async getWorkspace(actorUserId, workspaceId) {
      const role = await requireMembership(actorUserId, workspaceId);
      const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
      if (!ws) throw new NotFoundError("workspace");
      return { id: ws.id, name: ws.name, slug: ws.slug, ownerId: ws.ownerId, role };
    },

    async addMember({ actorUserId, workspaceId, userId, role }) {
      await requireCapabilityIn(actorUserId, workspaceId, "member:invite");
      // Granting OWNER requires the actor to be OWNER (escalation guard,
      // mirrors changeMemberRole).
      if (role === "OWNER") {
        const actorMembership = await db.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
        });
        if (!actorMembership || actorMembership.role !== "OWNER") {
          throw new ForbiddenError("member:invite");
        }
      }
      const target = await db.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError("user");
      const existing = await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (existing) throw new ConflictError("user is already a member");

      let membership;
      try {
        membership = await db.membership.create({
          data: { workspaceId, userId, role },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError("user is already a member");
        throw e;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "member.added",
        entityType: "Membership",
        entityId: membership.id,
        payload: { userId, role },
      });
      return { id: membership.id };
    },

    async changeMemberRole({ actorUserId, workspaceId, userId, role }) {
      const actorRole = await requireCapabilityIn(
        actorUserId,
        workspaceId,
        "member:change-role",
      );
      const target = await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!target) throw new NotFoundError("membership");

      // Demoting/removing an OWNER requires being OWNER; ADMINs manage
      // non-owners only. Prevents admin lockout of the owner.
      if (target.role === "OWNER" && actorRole !== "OWNER") {
        throw new ForbiddenError("member:change-role");
      }
      // The last OWNER cannot be demoted (workspace would be orphaned).
      // Count + update inside one transaction: two concurrent demotions
      // must not be able to orphan the workspace.
      if (target.role === "OWNER" && role !== "OWNER") {
        const owners = await db.membership.count({
          where: { workspaceId, role: "OWNER" },
        });
        if (owners <= 1) throw new ConflictError("cannot demote the last owner");
      }
      // Granting OWNER requires the actor to be OWNER.
      if (role === "OWNER" && actorRole !== "OWNER") {
        throw new ForbiddenError("member:change-role");
      }

      await db.$transaction(async (tx) => {
        // Lock the workspace row: concurrent owner changes serialize here,
        // so the owner recount below cannot both see a stale count.
        await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`;
        if (target.role === "OWNER" && role !== "OWNER") {
          const owners = await tx.membership.count({
            where: { workspaceId, role: "OWNER" },
          });
          if (owners <= 1) throw new ConflictError("cannot demote the last owner");
        }
        await tx.membership.update({
          where: { id: target.id },
          data: { role },
        });
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "member.role-changed",
        entityType: "Membership",
        entityId: target.id,
        payload: { userId, from: target.role, to: role },
      });
    },

    async removeMember({ actorUserId, workspaceId, userId }) {
      const actorRole = await requireCapabilityIn(
        actorUserId,
        workspaceId,
        "member:remove",
      );
      const target = await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!target) throw new NotFoundError("membership");
      if (target.role === "OWNER") {
        const owners = await db.membership.count({
          where: { workspaceId, role: "OWNER" },
        });
        if (owners <= 1) throw new ConflictError("cannot remove the last owner");
        if (actorRole !== "OWNER") throw new ForbiddenError("member:remove");
      }
      await db.$transaction(async (tx) => {
        // Same workspace-row lock as changeMemberRole: concurrent owner
        // removals serialize, so two removes cannot orphan the workspace.
        await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`;
        if (target.role === "OWNER") {
          const owners = await tx.membership.count({
            where: { workspaceId, role: "OWNER" },
          });
          if (owners <= 1) throw new ConflictError("cannot remove the last owner");
        }
        await tx.membership.delete({ where: { id: target.id } });
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "member.removed",
        entityType: "Membership",
        entityId: target.id,
        payload: { userId, role: target.role },
      });
    },

    async listMembers(actorUserId, workspaceId) {
      await requireMembership(actorUserId, workspaceId);
      const rows = await db.membership.findMany({
        where: { workspaceId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        displayName: m.user.displayName,
        role: m.role,
      }));
    },

    async createNovel({ actorUserId, workspaceId, title, slug }) {
      await requireCapabilityIn(actorUserId, workspaceId, "novel:create");
      const existing = await db.novel.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
      });
      if (existing) throw new ConflictError("novel slug already exists in workspace");

      let novel;
      try {
        novel = await db.novel.create({
          data: { workspaceId, title, slug, createdById: actorUserId },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError("novel slug already exists in workspace");
        throw e;
      }
      await db.novelSettings.create({
        data: { novelId: novel.id, settings: {} },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "novel.created",
        entityType: "Novel",
        entityId: novel.id,
        payload: { slug },
      });
      return { id: novel.id };
    },

    async getNovel(actorUserId, workspaceId, novelId) {
      // Any member may read (novel:read is universal); novel must be in
      // the claimed workspace.
      await requireCapabilityIn(actorUserId, workspaceId, "novel:read");
      const novel = await requireNovelInWorkspace(novelId, workspaceId);
      return {
        id: novel.id,
        workspaceId: novel.workspaceId,
        title: novel.title,
        slug: novel.slug,
        status: novel.status,
      };
    },

    async listNovelsForUser(actorUserId) {
      const memberships = await db.membership.findMany({
        where: { userId: actorUserId },
        include: { workspace: { include: { novels: true } } },
      });
      return memberships.flatMap((m) =>
        m.workspace.novels.map((n) => ({
          id: n.id,
          workspaceId: n.workspaceId,
          title: n.title,
          slug: n.slug,
          status: n.status,
        })),
      );
    },

    async listNovels(actorUserId, workspaceId) {
      await requireCapabilityIn(actorUserId, workspaceId, "novel:read");
      const novels = await db.novel.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return novels.map((n) => ({
        id: n.id,
        workspaceId: n.workspaceId,
        title: n.title,
        slug: n.slug,
        status: n.status,
      }));
    },
  };
}

/** Re-exported for route-layer error mapping. */
export { can, ForbiddenError };
