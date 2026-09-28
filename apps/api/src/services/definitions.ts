/**
 * Agent / skill / workflow definition services (Phase 4).
 *
 * Agents are WHO, skills are HOW, workflows are the orchestration
 * (CLAUDE.md §3). All three share one shape:
 *
 * - identity row (`key`, `name`, scope, status) plus a pointer to the
 *   current immutable version;
 * - every content edit appends a new version — nothing is mutated in place,
 *   so a run can cite the exact definition it used (CLAUDE.md §2.11);
 * - PLATFORM-scoped definitions need `platform:define`; WORKSPACE-scoped
 *   definitions need membership plus the matching `*:manage` capability.
 *
 * A workspace never sees another tenant's definitions, and only sees
 * PLATFORM ones that are PUBLISHED.
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { ModelProfile } from "@novelforge/ai-core";
import {
  requireCapability,
  requirePlatformCapability,
  type Capability,
  type PlatformRole,
} from "@novelforge/auth/authorization";
import {
  compileSchema,
  validateGraph,
  type ValidationFailure,
} from "@novelforge/validation";
import { ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";

export type Scope = "PLATFORM" | "WORKSPACE";
export type DefinitionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SkillCategory = "RETRIEVAL" | "ANALYSIS" | "TRANSFORM" | "VALIDATION";

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Definition write input, shared by create and version-append. */
export interface AgentContent {
  instructions: string;
  modelProfile: ModelProfile;
  skillKeys?: string[];
  outputSchema?: unknown;
  temperature?: number;
  maxTokens?: number;
}

export interface SkillContent {
  instructions: string;
  modelProfile: ModelProfile;
  outputSchema?: unknown;
}

export interface DefinitionView {
  id: string;
  scope: Scope;
  workspaceId: string | null;
  key: string;
  name: string;
  description: string | null;
  status: DefinitionStatus;
  version: number | null;
  versionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentView extends DefinitionView {
  modelProfile: string | null;
  skillKeys: string[];
  hasOutputSchema: boolean;
}

export interface SkillView extends DefinitionView {
  category: SkillCategory;
  modelProfile: string | null;
  hasOutputSchema: boolean;
}

export interface WorkflowView extends DefinitionView {
  novelId: string | null;
  agentKeys: string[];
  skillKeys: string[];
  stepCount: number | null;
}

export interface AgentDetail extends AgentView {
  instructions: string | null;
  outputSchema: unknown;
  temperature: number | null;
  maxTokens: number | null;
}

export interface SkillDetail extends SkillView {
  instructions: string | null;
  outputSchema: unknown;
}

export interface WorkflowDetail extends WorkflowView {
  graph: unknown;
}

/** Thrown when a registered contract or graph is invalid. Mapped to 400. */
export class InvalidDefinitionError extends Error {
  readonly code = "INVALID_DEFINITION" as const;
  constructor(
    message: string,
    readonly failures: ValidationFailure[],
  ) {
    super(message);
  }
}

export interface DefinitionServices {
  // --- agents ---
  createAgent(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    scope: Scope;
    workspaceId?: string;
    key: string;
    name: string;
    description?: string;
    content: AgentContent;
  }): Promise<{ id: string; versionId: string; version: number }>;
  addAgentVersion(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    agentId: string;
    content: AgentContent;
  }): Promise<{ versionId: string; version: number }>;
  publishAgent(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    agentId: string;
  }): Promise<void>;
  listAgents(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<AgentView[]>;
  getAgent(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    agentId: string;
  }): Promise<AgentDetail>;

  // --- skills ---
  createSkill(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    scope: Scope;
    workspaceId?: string;
    key: string;
    name: string;
    description?: string;
    category?: SkillCategory;
    content: SkillContent;
  }): Promise<{ id: string; versionId: string; version: number }>;
  addSkillVersion(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    skillId: string;
    content: SkillContent;
  }): Promise<{ versionId: string; version: number }>;
  publishSkill(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    skillId: string;
  }): Promise<void>;
  listSkills(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<SkillView[]>;
  getSkill(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    skillId: string;
  }): Promise<SkillDetail>;

  // --- workflows ---
  createWorkflow(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    scope: Scope;
    workspaceId?: string;
    novelId?: string;
    key: string;
    name: string;
    description?: string;
    graph: unknown;
  }): Promise<{ id: string; versionId: string; version: number }>;
  addWorkflowVersion(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    workflowId: string;
    graph: unknown;
  }): Promise<{ versionId: string; version: number }>;
  publishWorkflow(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    workflowId: string;
  }): Promise<void>;
  listWorkflows(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<WorkflowView[]>;
  getWorkflow(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    workflowId: string;
  }): Promise<WorkflowDetail>;

  /**
   * Delete a workflow. Both workflow_runs FKs are RESTRICT (see the
   * 20261002 migration), so a workflow with any run history is refused with
   * a 409: run history is the execution audit trail, and deleting the
   * definition must not destroy the record of what it did.
   */
  deleteWorkflow(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    workflowId: string;
  }): Promise<void>;
}

export function createDefinitionServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): DefinitionServices {
  const { db, audit } = deps;

  /** Membership gate — 404 for non-members, like every workspace route. */
  async function gateWorkspace(
    workspaceId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("workspace");
    requireCapability(membership.role, cap);
  }

  /**
   * Authorize a definition write and resolve the workspace it belongs to.
   *
   * PLATFORM scope is platform-administration only. WORKSPACE scope
   * requires membership — a platform admin is deliberately NOT implicitly
   * a member of every workspace (ADR-0005).
   */
  async function gateDefinitionWrite(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    scope: Scope;
    workspaceId?: string;
    cap: Capability;
  }): Promise<void> {
    if (input.scope === "PLATFORM") {
      requirePlatformCapability(input.actorPlatformRole, "platform:define");
      return;
    }
    if (!input.workspaceId) {
      throw new ConflictError("workspaceId is required for WORKSPACE-scoped definitions");
    }
    await gateWorkspace(input.workspaceId, input.actorUserId, input.cap);
  }

  /**
   * Authorize a write against an EXISTING definition, derived from the row
   * rather than from caller input — the scope of a stored row must never be
   * taken from the request body.
   */
  async function gateExisting(input: {
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    scope: Scope;
    workspaceId: string | null;
    cap: Capability;
  }): Promise<void> {
    if (input.scope === "PLATFORM") {
      requirePlatformCapability(input.actorPlatformRole, "platform:define");
      return;
    }
    if (!input.workspaceId) {
      // A workspace-scoped row with no workspace is corrupt state, not a
      // client error; refusing keeps it from being writable by anyone.
      throw new NotFoundError("definition");
    }
    await gateWorkspace(input.workspaceId, input.actorUserId, input.cap);
  }

  /**
   * Authorize reading an existing definition. A workspace-scoped row is
   * readable by its own members; a PLATFORM row is readable by any
   * authenticated caller (it is the shared catalog).
   *
   * The capability is a parameter rather than hardcoded: reading a skill
   * must require `skill:read`, not `agent:read`, or a role granted only
   * one of the two would be able to read the other.
   */
  async function gateRead(input: {
    actorUserId: string;
    scope: Scope;
    workspaceId: string | null;
    cap: "agent:read" | "skill:read" | "workflow:read";
  }): Promise<void> {
    if (input.scope === "PLATFORM") return;
    if (!input.workspaceId) throw new NotFoundError("definition");
    await gateWorkspace(input.workspaceId, input.actorUserId, input.cap);
  }

  /** Validate a key and reject collisions within its scope before insert. */
  function checkKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw new ConflictError(
        "key must be 1-64 chars of lowercase letters, digits and dashes",
      );
    }
  }

  /** Compile a structured-output contract, failing closed. */
  function checkSchema(schema: unknown, label: string): void {
    if (schema === undefined || schema === null) return;
    const compiled = compileSchema(schema);
    if (!compiled.ok) {
      throw new InvalidDefinitionError(`${label} is not a valid contract`, compiled.failures);
    }
  }

  /** Validate a workflow graph and return the keys it references. */
  function checkGraph(graph: unknown): { agentKeys: string[]; skillKeys: string[] } {
    const validated = validateGraph(graph, (schema, path) => {
      const compiled = compileSchema(schema);
      return compiled.ok ? [] : compiled.failures.map((f) => ({ ...f, path }));
    });
    if (!validated.ok) {
      throw new InvalidDefinitionError("workflow graph is invalid", validated.failures);
    }
    const agentKeys: string[] = [];
    const skillKeys: string[] = [];
    for (const step of validated.value.graph.steps) {
      if (!step.ref) continue;
      if (step.kind === "AGENT") agentKeys.push(step.ref);
      else if (step.kind === "SKILL") skillKeys.push(step.ref);
    }
    return { agentKeys: [...new Set(agentKeys)], skillKeys: [...new Set(skillKeys)] };
  }

  /**
   * Next version number for a definition, inside the caller's transaction.
   *
   * Written out per kind rather than keyed by a computed field name: a
   * computed `where` silently degrades to the bare id and Prisma rejects it.
   */
  async function nextAgentNumber(
    tx: Pick<NovelForgeDb, "agentVersion">,
    agentId: string,
  ): Promise<number> {
    const last = await tx.agentVersion.findFirst({
      where: { agentId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  async function nextSkillNumber(
    tx: Pick<NovelForgeDb, "skillVersion">,
    skillId: string,
  ): Promise<number> {
    const last = await tx.skillVersion.findFirst({
      where: { skillId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  async function nextWorkflowNumber(
    tx: Pick<NovelForgeDb, "workflowVersion">,
    workflowId: string,
  ): Promise<number> {
    const last = await tx.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  return {
    // ==================== Agents ====================

    async createAgent(input) {
      checkKey(input.key);
      checkSchema(input.content.outputSchema, "outputSchema");
      await gateDefinitionWrite({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: input.scope,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        cap: "agent:manage",
      });

      const created = await db.$transaction(async (tx) => {
        const agent = await tx.agent.create({
          data: {
            scope: input.scope,
            workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        const version = await tx.agentVersion.create({
          data: {
            agentId: agent.id,
            number: 1,
            instructions: input.content.instructions,
            modelProfile: input.content.modelProfile,
            skillKeys: input.content.skillKeys ?? [],
            outputSchema: (input.content.outputSchema ?? null) as never,
            temperature: input.content.temperature ?? null,
            maxTokens: input.content.maxTokens ?? null,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.agent.update({
          where: { id: agent.id },
          data: { currentVersionId: version.id },
        });
        return { id: agent.id, versionId: version.id, version: 1 };
      }).catch(rethrowUnique("agent", input.key));

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
        action: "agent.created",
        entityType: "Agent",
        entityId: created.id,
        payload: { key: input.key, scope: input.scope, version: 1 },
      });
      return created;
    },

    async addAgentVersion(input) {
      checkSchema(input.content.outputSchema, "outputSchema");
      const agent = await db.agent.findUnique({
        where: { id: input.agentId },
        select: { id: true, key: true, scope: true, workspaceId: true },
      });
      if (!agent) throw new NotFoundError("agent");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: agent.scope,
        workspaceId: agent.workspaceId,
        cap: "agent:manage",
      });

      const created = await appendVersionWithRetry(async () => db.$transaction(async (tx) => {
        const number = await nextAgentNumber(tx, agent.id);
        const version = await tx.agentVersion.create({
          data: {
            agentId: agent.id,
            number,
            instructions: input.content.instructions,
            modelProfile: input.content.modelProfile,
            skillKeys: input.content.skillKeys ?? [],
            outputSchema: (input.content.outputSchema ?? null) as never,
            temperature: input.content.temperature ?? null,
            maxTokens: input.content.maxTokens ?? null,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        // The pointer moves; the previous version row is untouched.
        await tx.agent.update({
          where: { id: agent.id },
          data: { currentVersionId: version.id },
        });
        return { versionId: version.id, version: number };
      }), "agent", agent.id);

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: agent.workspaceId,
        action: "agent.version_added",
        entityType: "Agent",
        entityId: agent.id,
        payload: { key: agent.key, version: created.version },
      });
      return created;
    },

    async publishAgent(input) {
      const agent = await db.agent.findUnique({
        where: { id: input.agentId },
        select: { id: true, key: true, scope: true, workspaceId: true, currentVersionId: true },
      });
      if (!agent) throw new NotFoundError("agent");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: agent.scope,
        workspaceId: agent.workspaceId,
        cap: "agent:manage",
      });
      // Publishing a definition with no version would make every run fail
      // at resolve time; refuse it here where the cause is obvious.
      if (!agent.currentVersionId) {
        throw new ConflictError("agent has no version to publish");
      }
      await db.agent.update({ where: { id: agent.id }, data: { status: "PUBLISHED" } });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: agent.workspaceId,
        action: "agent.published",
        entityType: "Agent",
        entityId: agent.id,
        payload: { key: agent.key },
      });
    },

    async listAgents(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "agent:read");
      // Own workspace definitions (any status, they are the tenant's own)
      // plus the shared PLATFORM catalog, published only.
      const rows = await db.agent.findMany({
        where: {
          OR: [
            { scope: "WORKSPACE", workspaceId: input.workspaceId },
            { scope: "PLATFORM", status: "PUBLISHED" },
          ],
        },
        include: {
          currentVersion: {
            select: { number: true, id: true, modelProfile: true, skillKeys: true, outputSchema: true },
          },
        },
        orderBy: [{ scope: "asc" }, { key: "asc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        workspaceId: r.workspaceId,
        key: r.key,
        name: r.name,
        description: r.description,
        status: r.status,
        version: r.currentVersion?.number ?? null,
        versionId: r.currentVersion?.id ?? null,
        modelProfile: r.currentVersion?.modelProfile ?? null,
        skillKeys: r.currentVersion?.skillKeys ?? [],
        // The schema itself is omitted from list output: agents are listed
        // constantly and the contract can be large.
        hasOutputSchema: r.currentVersion?.outputSchema != null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getAgent(input) {
      const agent = await db.agent.findUnique({
        where: { id: input.agentId },
        include: { currentVersion: true },
      });
      if (!agent) throw new NotFoundError("agent");
      // A DRAFT platform agent is not part of the shared catalog yet.
      if (agent.scope === "PLATFORM" && agent.status !== "PUBLISHED") {
        throw new NotFoundError("agent");
      }
      await gateRead({
        actorUserId: input.actorUserId,
        scope: agent.scope,
        workspaceId: agent.workspaceId,
        cap: "agent:read",
      });
      return {
        id: agent.id,
        scope: agent.scope,
        workspaceId: agent.workspaceId,
        key: agent.key,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        version: agent.currentVersion?.number ?? null,
        versionId: agent.currentVersion?.id ?? null,
        modelProfile: agent.currentVersion?.modelProfile ?? null,
        skillKeys: agent.currentVersion?.skillKeys ?? [],
        hasOutputSchema: agent.currentVersion?.outputSchema != null,
        instructions: agent.currentVersion?.instructions ?? null,
        outputSchema: agent.currentVersion?.outputSchema ?? null,
        temperature: agent.currentVersion?.temperature ?? null,
        maxTokens: agent.currentVersion?.maxTokens ?? null,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      };
    },

    // ==================== Skills ====================

    async createSkill(input) {
      checkKey(input.key);
      checkSchema(input.content.outputSchema, "outputSchema");
      await gateDefinitionWrite({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: input.scope,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        cap: "skill:manage",
      });

      const created = await db.$transaction(async (tx) => {
        const skill = await tx.skill.create({
          data: {
            scope: input.scope,
            workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? "ANALYSIS",
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        const version = await tx.skillVersion.create({
          data: {
            skillId: skill.id,
            number: 1,
            instructions: input.content.instructions,
            modelProfile: input.content.modelProfile,
            outputSchema: (input.content.outputSchema ?? null) as never,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.skill.update({
          where: { id: skill.id },
          data: { currentVersionId: version.id },
        });
        return { id: skill.id, versionId: version.id, version: 1 };
      }).catch(rethrowUnique("skill", input.key));

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
        action: "skill.created",
        entityType: "Skill",
        entityId: created.id,
        payload: { key: input.key, scope: input.scope, version: 1 },
      });
      return created;
    },

    async addSkillVersion(input) {
      checkSchema(input.content.outputSchema, "outputSchema");
      const skill = await db.skill.findUnique({
        where: { id: input.skillId },
        select: { id: true, key: true, scope: true, workspaceId: true },
      });
      if (!skill) throw new NotFoundError("skill");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: skill.scope,
        workspaceId: skill.workspaceId,
        cap: "skill:manage",
      });

      const created = await appendVersionWithRetry(async () => db.$transaction(async (tx) => {
        const number = await nextSkillNumber(tx, skill.id);
        const version = await tx.skillVersion.create({
          data: {
            skillId: skill.id,
            number,
            instructions: input.content.instructions,
            modelProfile: input.content.modelProfile,
            outputSchema: (input.content.outputSchema ?? null) as never,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.skill.update({
          where: { id: skill.id },
          data: { currentVersionId: version.id },
        });
        return { versionId: version.id, version: number };
      }), "skill", skill.id);

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: skill.workspaceId,
        action: "skill.version_added",
        entityType: "Skill",
        entityId: skill.id,
        payload: { key: skill.key, version: created.version },
      });
      return created;
    },

    async publishSkill(input) {
      const skill = await db.skill.findUnique({
        where: { id: input.skillId },
        select: { id: true, key: true, scope: true, workspaceId: true, currentVersionId: true },
      });
      if (!skill) throw new NotFoundError("skill");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: skill.scope,
        workspaceId: skill.workspaceId,
        cap: "skill:manage",
      });
      if (!skill.currentVersionId) {
        throw new ConflictError("skill has no version to publish");
      }
      await db.skill.update({ where: { id: skill.id }, data: { status: "PUBLISHED" } });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: skill.workspaceId,
        action: "skill.published",
        entityType: "Skill",
        entityId: skill.id,
        payload: { key: skill.key },
      });
    },

    async listSkills(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "skill:read");
      const rows = await db.skill.findMany({
        where: {
          OR: [
            { scope: "WORKSPACE", workspaceId: input.workspaceId },
            { scope: "PLATFORM", status: "PUBLISHED" },
          ],
        },
        include: {
          currentVersion: { select: { number: true, id: true, modelProfile: true, outputSchema: true } },
        },
        orderBy: [{ scope: "asc" }, { key: "asc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        workspaceId: r.workspaceId,
        key: r.key,
        name: r.name,
        description: r.description,
        category: r.category,
        status: r.status,
        version: r.currentVersion?.number ?? null,
        versionId: r.currentVersion?.id ?? null,
        modelProfile: r.currentVersion?.modelProfile ?? null,
        hasOutputSchema: r.currentVersion?.outputSchema != null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getSkill(input) {
      const skill = await db.skill.findUnique({
        where: { id: input.skillId },
        include: { currentVersion: true },
      });
      if (!skill) throw new NotFoundError("skill");
      if (skill.scope === "PLATFORM" && skill.status !== "PUBLISHED") {
        throw new NotFoundError("skill");
      }
      await gateRead({
        actorUserId: input.actorUserId,
        scope: skill.scope,
        workspaceId: skill.workspaceId,
      cap: "skill:read",
      });
      return {
        id: skill.id,
        scope: skill.scope,
        workspaceId: skill.workspaceId,
        key: skill.key,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        status: skill.status,
        version: skill.currentVersion?.number ?? null,
        versionId: skill.currentVersion?.id ?? null,
        modelProfile: skill.currentVersion?.modelProfile ?? null,
        hasOutputSchema: skill.currentVersion?.outputSchema != null,
        instructions: skill.currentVersion?.instructions ?? null,
        outputSchema: skill.currentVersion?.outputSchema ?? null,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      };
    },

    // ==================== Workflows ====================

    async createWorkflow(input) {
      checkKey(input.key);
      await gateDefinitionWrite({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: input.scope,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        cap: "workflow:manage",
      });
      const { agentKeys, skillKeys } = checkGraph(input.graph);

      // A novel-scoped workflow must reference a novel in this workspace,
      // otherwise the binding is meaningless (and the FK would accept a
      // novel belonging to another tenant).
      if (input.novelId) {
        if (input.scope !== "WORKSPACE" || !input.workspaceId) {
          throw new ConflictError("novelId is only valid on a WORKSPACE-scoped workflow");
        }
        const novel = await db.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      const created = await db.$transaction(async (tx) => {
        const workflow = await tx.workflow.create({
          data: {
            scope: input.scope,
            workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
            novelId: input.novelId ?? null,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        const version = await tx.workflowVersion.create({
          data: {
            workflowId: workflow.id,
            number: 1,
            graph: input.graph as never,
            agentKeys,
            skillKeys,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.workflow.update({
          where: { id: workflow.id },
          data: { currentVersionId: version.id },
        });
        return { id: workflow.id, versionId: version.id, version: 1 };
      }).catch(rethrowUnique("workflow", input.key));

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.scope === "WORKSPACE" ? (input.workspaceId ?? null) : null,
        action: "workflow.created",
        entityType: "Workflow",
        entityId: created.id,
        payload: { key: input.key, scope: input.scope, version: 1 },
      });
      return created;
    },

    async addWorkflowVersion(input) {
      const workflow = await db.workflow.findUnique({
        where: { id: input.workflowId },
        select: { id: true, key: true, scope: true, workspaceId: true },
      });
      if (!workflow) throw new NotFoundError("workflow");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: workflow.scope,
        workspaceId: workflow.workspaceId,
        cap: "workflow:manage",
      });
      const { agentKeys, skillKeys } = checkGraph(input.graph);

      const created = await appendVersionWithRetry(async () => db.$transaction(async (tx) => {
        const number = await nextWorkflowNumber(tx, workflow.id);
        const version = await tx.workflowVersion.create({
          data: {
            workflowId: workflow.id,
            number,
            graph: input.graph as never,
            agentKeys,
            skillKeys,
            createdById: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.workflow.update({
          where: { id: workflow.id },
          data: { currentVersionId: version.id },
        });
        return { versionId: version.id, version: number };
      }), "workflow", workflow.id);

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: workflow.workspaceId,
        action: "workflow.version_added",
        entityType: "Workflow",
        entityId: workflow.id,
        payload: { key: workflow.key, version: created.version },
      });
      return created;
    },

    async publishWorkflow(input) {
      const workflow = await db.workflow.findUnique({
        where: { id: input.workflowId },
        select: { id: true, key: true, scope: true, workspaceId: true, currentVersionId: true },
      });
      if (!workflow) throw new NotFoundError("workflow");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: workflow.scope,
        workspaceId: workflow.workspaceId,
        cap: "workflow:manage",
      });
      if (!workflow.currentVersionId) {
        throw new ConflictError("workflow has no version to publish");
      }
      await db.workflow.update({ where: { id: workflow.id }, data: { status: "PUBLISHED" } });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: workflow.workspaceId,
        action: "workflow.published",
        entityType: "Workflow",
        entityId: workflow.id,
        payload: { key: workflow.key },
      });
    },

    async listWorkflows(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const rows = await db.workflow.findMany({
        where: {
          OR: [
            { scope: "WORKSPACE", workspaceId: input.workspaceId },
            { scope: "PLATFORM", status: "PUBLISHED" },
          ],
        },
        include: {
          currentVersion: { select: { number: true, id: true, agentKeys: true, skillKeys: true, graph: true } },
        },
        orderBy: [{ scope: "asc" }, { key: "asc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        workspaceId: r.workspaceId,
        novelId: r.novelId,
        key: r.key,
        name: r.name,
        description: r.description,
        status: r.status,
        version: r.currentVersion?.number ?? null,
        versionId: r.currentVersion?.id ?? null,
        agentKeys: r.currentVersion?.agentKeys ?? [],
        skillKeys: r.currentVersion?.skillKeys ?? [],
        stepCount: countSteps(r.currentVersion?.graph),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getWorkflow(input) {
      const workflow = await db.workflow.findUnique({
        where: { id: input.workflowId },
        include: { currentVersion: true },
      });
      if (!workflow) throw new NotFoundError("workflow");
      if (workflow.scope === "PLATFORM" && workflow.status !== "PUBLISHED") {
        throw new NotFoundError("workflow");
      }
      await gateRead({
        actorUserId: input.actorUserId,
        scope: workflow.scope,
        workspaceId: workflow.workspaceId,
      cap: "workflow:read",
      });
      return {
        id: workflow.id,
        scope: workflow.scope,
        workspaceId: workflow.workspaceId,
        novelId: workflow.novelId,
        key: workflow.key,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        version: workflow.currentVersion?.number ?? null,
        versionId: workflow.currentVersion?.id ?? null,
        agentKeys: workflow.currentVersion?.agentKeys ?? [],
        skillKeys: workflow.currentVersion?.skillKeys ?? [],
        stepCount: countSteps(workflow.currentVersion?.graph),
        graph: workflow.currentVersion?.graph ?? null,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      };
    },

    async deleteWorkflow(input) {
      const workflow = await db.workflow.findUnique({
        where: { id: input.workflowId },
        select: { id: true, key: true, scope: true, workspaceId: true },
      });
      if (!workflow) throw new NotFoundError("workflow");
      await gateExisting({
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        scope: workflow.scope,
        workspaceId: workflow.workspaceId,
        cap: "workflow:manage",
      });
      // Both workflow_runs FKs are ON DELETE RESTRICT (20261002 migration):
      // run history is the execution audit trail (CLAUDE.md §2.11), so a
      // workflow that has ever run is refused. The refusal must be legible —
      // the same contract as deleteChapter and deleteEntity.
      await db.workflow.delete({ where: { id: input.workflowId } }).catch((e: unknown) => {
        const code = (e as { code?: string })?.code;
        if (code === "P2003" || code === "P2039") {
          throw new ConflictError(
            "this workflow has run history — run records are kept even when their " +
              "definition is deleted, so it cannot be deleted",
          );
        }
        throw e;
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: workflow.workspaceId,
        action: "workflow.deleted",
        entityType: "Workflow",
        entityId: workflow.id,
        payload: { key: workflow.key, scope: workflow.scope },
      });
    },
  };
}

/** Best-effort step count for a stored graph; never throws on bad data. */
function countSteps(graph: unknown): number | null {
  if (typeof graph !== "object" || graph === null) return null;
  const steps = (graph as { steps?: unknown }).steps;
  return Array.isArray(steps) ? steps.length : null;
}

/** Read a Prisma error code without importing the generated error class. */
export function prismaCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

/**
 * Append a version, retrying on a version-number collision.
 *
 * Two concurrent appends both read the same highest number and both try to
 * insert the next one; `@@unique([<parent>Id, number])` rejects one with
 * P2002. That is a lost race, not a client error, so retry rather than
 * reporting a 500 (and rather than telling the caller their request was
 * malformed). Bounded, so a persistent conflict still surfaces.
 */
export async function appendVersionWithRetry<T>(
  attempt: () => Promise<T>,
  kind: string,
  parentId: string,
): Promise<T> {
  for (let i = 0; i < 5; i += 1) {
    try {
      return await attempt();
    } catch (err) {
      if (prismaCode(err) !== "P2002") throw err;
      // Small jittered pause so the two writers stop colliding in lockstep.
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
    }
  }
  throw new ConflictError(
    `could not append a version to ${kind} ${parentId}: concurrent updates`,
  );
}

/**
 * Translate a unique-constraint violation into a 409 naming the key.
 *
 * The scoped-key index is the only unique constraint these creates can
 * plausibly hit, so a duplicate is reported as such rather than as a 500.
 */
function rethrowUnique(kind: string, key: string) {
  return (err: unknown): never => {
    if (prismaCode(err) === "P2002") {
      throw new ConflictError(`${kind} key "${key}" already exists in this scope`);
    }
    throw err;
  };
}
