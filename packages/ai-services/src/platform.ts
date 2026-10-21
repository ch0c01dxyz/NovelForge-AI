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
import { validateNovelCover, novelCoverUrl, type NovelCover } from "./novel-cover.ts";
import { writeCoverWithHistory } from "./cover-history.ts";

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT" as const;
  /**
   * The head observed at a head-expectation refusal (GAP-022), so the caller
   * can re-read instead of silently retrying a plan built on a stale head
   * (C4). `null` is a real observation — "no head exists yet" — so presence is
   * signalled by the property being set at all, never by its truthiness.
   * Absent on every other conflict: a generic 409 must not carry a head the
   * refusal never observed, and authorization gates run before disclosure.
   */
  readonly currentHeadRevisionId?: string | null;
  constructor(message: string, head?: { currentHeadRevisionId: string | null }) {
    super(message);
    if (head) this.currentHeadRevisionId = head.currentHeadRevisionId;
  }
}

/**
 * Workspace management (2026-10-18): a workspace deletion the caller cannot force. The reason travels in
 * the response envelope's `error` field (same position as the typed
 * MemoryError/PolicyError refusals) so the workspace manager dialog can map
 * "delete the novels first" distinctly from a generic conflict.
 */
export class WorkspaceDeleteError extends ConflictError {
  constructor(
    readonly reason: "WORKSPACE_NOT_EMPTY" | "WORKSPACE_HAS_REFERENCED_HISTORY",
    message: string,
  ) {
    super(message);
  }
}

export class WorkspaceOwnershipLimitError extends ConflictError {
  readonly reason = "WORKSPACE_OWNERSHIP_LIMIT";
  constructor() {
    super("author accounts may own only one workspace");
  }
}

async function readWorkspaceOwnershipPolicy(db: Pick<NovelForgeDb, "user" | "workspace">, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  if (!user) throw new NotFoundError("user");
  const ownedCount = await db.workspace.count({ where: { ownerId: userId } });
  const maxOwned = user.platformRole === "SUPER_ADMIN" ? null : 1;
  return { ownedCount, maxOwned, canCreate: maxOwned === null || ownedCount < maxOwned };
}

/**
 * An upstream dependency (an LLM gateway) was unreachable or failed.
 * Distinct from ConflictError: the request was valid, the *upstream* is
 * the problem, which is a 502 — not a 409 and not a 500.
 */
export class BadGatewayError extends Error {
  readonly code = "BAD_GATEWAY" as const;
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

/**
 * Exclusion-constraint violation (SQLSTATE 23P01) — the Phase 8 overlap
 * EXCLUDEs (character_states_no_overlap, character_knowledge_no_overlap,
 * relationship_stances_no_overlap). A DIFFERENT code from P2002, so a
 * caller that maps only unique violations surfaces an overlap as a 500.
 * Duck-typed on `code` like isUniqueViolation; the message check is the
 * backstop for a driver that wraps the SQLSTATE.
 */
export function isExclusionViolation(e: unknown): boolean {
  if ((e as { code?: string })?.code === "23P01") return true;
  const message = (e as { message?: unknown })?.message;
  return typeof message === "string" && /exclusion constraint/i.test(message);
}

export interface PlatformServices {
  putNovelCover(input: { actorUserId: string; workspaceId: string; novelId: string;
    mimeType: string; dataBase64: string; sourceName?: string }): Promise<{ coverUrl: string; sha256: string }>;
  getNovelCover(actorUserId: string, workspaceId: string, novelId: string): Promise<NovelCover>;
  listWorkspaces(actorUserId: string): Promise<WorkspaceListView[]>;
  workspaceOwnershipPolicy(actorUserId: string): Promise<{ ownedCount: number; maxOwned: number | null; canCreate: boolean }>;

  createWorkspace(input: {
    actorUserId: string;
    name: string;
    slug: string;
  }): Promise<{ id: string }>;

  getWorkspace(actorUserId: string, workspaceId: string): Promise<WorkspaceView>;

  /** Workspace management (2026-10-18): rename (display name only — slug is immutable identity). */
  updateWorkspace(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
  }): Promise<{ id: string; name: string; slug: string }>;

  /**
   * Workspace management (2026-10-18): delete an empty workspace (OWNER only). Novels block deletion;
   * retained history (audit rows, generation analytics) is detached, never
   * erased.
   */
  deleteWorkspace(input: { actorUserId: string; workspaceId: string }): Promise<void>;

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

  deleteNovel(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<void>;

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

export interface WorkspaceListView {
  id: string;
  name: string;
  slug: string;
  role: Role;
  canCreateNovel: boolean;
  /** Workspace management (2026-10-18): role may rename the workspace (workspace:update). */
  canRename: boolean;
  /** Workspace management (2026-10-18): role may delete the workspace (workspace:delete — OWNER only). */
  canDelete: boolean;
  /** Workspace management (2026-10-18): deletion is refused while non-empty; the dialog disables it. */
  novelCount: number;
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
  /** Reader-facing discovery taxonomy (max 5 canonical keys). */
  genres: string[];
  /** Reader-facing content rating; null = not set. */
  audience: string | null;
  coverUrl?: string;
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

  async function coverUrls<T extends { id: string; workspaceId: string }>(novels: T[]): Promise<(T & { coverUrl?: string })[]> {
    if (!novels.length) return novels;
    // Select only the hash: library responses never load the image payload.
    const hashes = await db.$queryRaw<{ novelId: string; sha256: string | null }[]>`
      SELECT novel_id AS "novelId", settings->'cover'->>'sha256' AS sha256
      FROM novel_settings WHERE novel_id = ANY(${novels.map(n => n.id)}::uuid[])`;
    const byId = new Map(hashes.map(h => [h.novelId, h.sha256]));
    return novels.map(n => {
      const hash = byId.get(n.id);
      return { ...n, ...(hash && /^[a-f0-9]{64}$/.test(hash) ? { coverUrl: novelCoverUrl(n.workspaceId, n.id, hash) } : {}) };
    });
  }

  return {
    async putNovelCover(input) {
      const { actorUserId, workspaceId, novelId } = input;
      await requireCapabilityIn(actorUserId, workspaceId, "novel:update");
      await requireNovelInWorkspace(novelId, workspaceId);
      const cover = validateNovelCover(input);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId}::uuid FOR NO KEY UPDATE`;
        const member = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorUserId } } });
        if (!member) throw new NotFoundError("workspace");
        requireCapability(member.role, "novel:update");
        const novel = await tx.novel.findFirst({ where: { id: novelId, workspaceId } });
        if (!novel) throw new NotFoundError("novel");
        await writeCoverWithHistory(tx, { novelId, workspaceId, actorUserId, cover });
      });
      return { coverUrl: novelCoverUrl(workspaceId, novelId, cover.sha256), sha256: cover.sha256 };
    },

    async getNovelCover(actorUserId, workspaceId, novelId) {
      await requireCapabilityIn(actorUserId, workspaceId, "novel:read");
      await requireNovelInWorkspace(novelId, workspaceId);
      const row = await db.novelSettings.findUnique({ where: { novelId } });
      const settings = row?.settings;
      const cover = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.cover : null;
      if (!cover || typeof cover !== "object" || Array.isArray(cover) || typeof cover.mimeType !== "string" || typeof cover.dataBase64 !== "string") throw new NotFoundError("cover");
      return validateNovelCover({ mimeType: cover.mimeType, dataBase64: cover.dataBase64 });
    },

    async workspaceOwnershipPolicy(actorUserId) {
      return readWorkspaceOwnershipPolicy(db, actorUserId);
    },

    async createWorkspace({ actorUserId, name, slug }) {
      const existing = await db.workspace.findUnique({ where: { slug } });
      if (existing) throw new ConflictError("workspace slug already exists");

      // Owner row + OWNER membership atomically; audit after commit.
      let workspace;
      try {
        workspace = await db.$transaction(async (tx) => {
          // Serialize ownership checks with other creates by this account.
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorUserId}::uuid FOR UPDATE`;
          if (!(await readWorkspaceOwnershipPolicy(tx, actorUserId)).canCreate) throw new WorkspaceOwnershipLimitError();
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

    async listWorkspaces(actorUserId) {
      const memberships = await db.membership.findMany({
        where: { userId: actorUserId },
        select: {
          role: true,
          workspace: { select: { id: true, name: true, slug: true, _count: { select: { novels: true } } } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role,
        canCreateNovel: can(role, "novel:create"),
        canRename: can(role, "workspace:update"),
        canDelete: can(role, "workspace:delete"),
        novelCount: workspace._count.novels,
      }));
    },

    async updateWorkspace({ actorUserId, workspaceId, name }) {
      await requireCapabilityIn(actorUserId, workspaceId, "workspace:update");
      try {
        return await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`;
          const member = await tx.membership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
          });
          if (!member) throw new NotFoundError("workspace");
          requireCapability(member.role, "workspace:update");
          const ws = await tx.workspace.update({
            where: { id: workspaceId }, data: { name },
            select: { id: true, name: true, slug: true },
          });
          await tx.auditLog.create({ data: {
            actorUserId, workspaceId, action: "workspace.updated",
            entityType: "Workspace", entityId: workspaceId, payload: { name },
          } });
          return ws;
        });
      } catch (e) {
        // P2025: the record to update did not exist. Same 404 for a
        // non-member — the capability gate above already refused those.
        if ((e as { code?: string })?.code === "P2025") throw new NotFoundError("workspace");
        throw e;
      }
    },

    async deleteWorkspace({ actorUserId, workspaceId }) {
      await requireCapabilityIn(actorUserId, workspaceId, "workspace:delete");
      try {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`;
          const member = await tx.membership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
          });
          if (!member) throw new NotFoundError("workspace");
          requireCapability(member.role, "workspace:delete");
          const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
          // Lock before checking: FK inserts and membership changes serialize here.
          if (await tx.novel.count({ where: { workspaceId } })) {
            throw new WorkspaceDeleteError("WORKSPACE_NOT_EMPTY", "delete the novels in this workspace first");
          }
          // Definitions and references can exist without novels; never cascade them silently.
          const resources = await tx.workspace.findUniqueOrThrow({
            where: { id: workspaceId },
            select: { _count: { select: { agents: true, skills: true, workflows: true, references: true } } },
          });
          if (Object.values(resources._count).some((count) => count > 0)) {
            throw new WorkspaceDeleteError("WORKSPACE_HAS_REFERENCED_HISTORY", "workspace still contains definitions or references");
          }
          // Explicit detachment also covers generation analytics, which have no workspace FK.
          await tx.auditLog.updateMany({ where: { workspaceId }, data: { workspaceId: null } });
          await tx.generation.updateMany({ where: { workspaceId }, data: { workspaceId: null } });
          await tx.workspace.delete({ where: { id: workspaceId } });
          await tx.auditLog.create({ data: {
            actorUserId, action: "workspace.deleted", entityType: "Workspace",
            entityId: workspaceId, payload: { slug: ws.slug },
          } });
        });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "P2003" || code === "P2039") {
          throw new WorkspaceDeleteError(
            "WORKSPACE_HAS_REFERENCED_HISTORY",
            "workspace history still references this workspace",
          );
        }
        throw e;
      }
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

      // One transaction, not three sequential writes (C8). A novel is never
      // observable without a head: the first covered mutation's
      // `SELECT … FOR UPDATE` on the branch row would find nothing and
      // surface as a 404 or 500 instead of the promised CAS. Lazy
      // create-if-absent init would put that race on the hot mutation path,
      // so the branch, its BASELINE revision and that revision's change set
      // are created here, with the novel.
      let novel;
      try {
        novel = await db.$transaction(async (tx) => {
          const created = await tx.novel.create({
            data: { workspaceId, title, slug, createdById: actorUserId },
          });
          await tx.novelSettings.create({
            data: { novelId: created.id, settings: {} },
          });
          // The head pointer is a non-deferrable FK to revisions(id), so the
          // branch starts with a NULL head and is pointed at the revision
          // last — the same order the M1 migration's backfill uses.
          const branch = await tx.novelBranch.create({
            data: { workspaceId, novelId: created.id, name: "main" },
          });
          const revision = await tx.revision.create({
            data: {
              workspaceId,
              novelId: created.id,
              branchId: branch.id,
              parentRevisionId: null,
              number: 1,
              origin: "BASELINE",
              message: "baseline created with the novel",
              createdById: actorUserId,
            },
          });
          await tx.novelBranch.update({
            where: { id: branch.id },
            data: { headRevisionId: revision.id },
          });
          // NF-WF-020B: a new novel checks out its `main` branch (Invariant 5,
          // F1). The publish guard reads this; NULL would also read as `main`
          // but the explicit pointer keeps the invariant visible.
          await tx.novel.update({
            where: { id: created.id },
            data: { currentBranchId: branch.id },
          });
          // Empty change set, no snapshot: the labeled baseline *checkpoint*
          // is an explicit authorized operation (C8).
          await tx.changeSet.create({
            data: { revisionId: revision.id, workspaceId, novelId: created.id },
          });
          return created;
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError("novel slug already exists in workspace");
        throw e;
      }
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

    async deleteNovel({ actorUserId, workspaceId, novelId }) {
      await requireCapabilityIn(actorUserId, workspaceId, "novel:delete");
      const novel = await requireNovelInWorkspace(novelId, workspaceId);
      // Most child tables of Novel cascade (schema-verified). The ponytail
      // note that used to live here said "if either gains an FK, this needs
      // a P2003 → ConflictError catch like deleteChapter" — that condition
      // fired: canon_facts.entity_id/object_entity_id and
      // workflow_runs.workflow_id are ON DELETE RESTRICT (20261002
      // migration), so a novel carrying canon facts or workflow run history
      // refuses the cascade. The refusal must be legible, not a 500.
      // Generation rows carry novelId without an FK and orphan by design.
      //
      // NF-WF-050B: S2 decision history (scale_decision_proposals,
      // scale_decision_outcomes) is OPERATIONAL — auditable, never rewound —
      // but novel deletion must explicitly remove it in dependency order
      // (outcomes → proposals → parent) inside one novel-scoped transaction.
      // The chapter-version/actor/source Restrict FKs cannot be crossed by
      // cascade; explicit ordered deletes make the intent visible. If the
      // parent delete is refused (canon facts / workflow runs), the whole
      // transaction rolls back — S2 history is never erased on a refused
      // deletion.
      await db.$transaction(async (tx) => {
        // Lock the novel for the duration of the delete.
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR UPDATE`;
        await tx.scaleDecisionOutcome.deleteMany({ where: { novelId } });
        await tx.scaleDecisionProposal.deleteMany({ where: { novelId } });
        await tx.novel.delete({ where: { id: novelId } }).catch((e: unknown) => {
          const code = (e as { code?: string })?.code;
          if (code === "P2003" || code === "P2039") {
            throw new ConflictError(
              "this novel still has canon facts or workflow run history that the " +
                "delete cannot remove — delete those workflows without runs and " +
                "the entities cited by canon facts first, or keep the novel",
            );
          }
          throw e;
        });
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "novel.deleted",
        entityType: "Novel",
        entityId: novelId,
        payload: { slug: novel.slug },
      });
    },

    async getNovel(actorUserId, workspaceId, novelId) {
      // Any member may read (novel:read is universal); novel must be in
      // the claimed workspace.
      await requireCapabilityIn(actorUserId, workspaceId, "novel:read");
      const novel = await requireNovelInWorkspace(novelId, workspaceId);
      const [view] = await coverUrls([{
        id: novel.id,
        workspaceId: novel.workspaceId,
        title: novel.title,
        slug: novel.slug,
        status: novel.status,
        genres: novel.genres,
        audience: novel.audience ?? null,
      }]);
      return view!;
    },

    async listNovelsForUser(actorUserId) {
      const memberships = await db.membership.findMany({
        where: { userId: actorUserId },
        include: { workspace: { include: { novels: true } } },
      });
      return coverUrls(memberships.flatMap((m) =>
        m.workspace.novels.map((n) => ({
          id: n.id,
          workspaceId: n.workspaceId,
          title: n.title,
          slug: n.slug,
          status: n.status,
          genres: n.genres,
          audience: n.audience ?? null,
        })),
      ));
    },

    async listNovels(actorUserId, workspaceId) {
      await requireCapabilityIn(actorUserId, workspaceId, "novel:read");
      const novels = await db.novel.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return coverUrls(novels.map((n) => ({
        id: n.id,
        workspaceId: n.workspaceId,
        title: n.title,
        slug: n.slug,
        status: n.status,
        genres: n.genres,
        audience: n.audience ?? null,
      })));
    },
  };
}

/** Re-exported for route-layer error mapping. */
export { can, ForbiddenError };
