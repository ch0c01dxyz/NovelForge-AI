/**
 * AI infrastructure services (Phase 3): gateway registry administration,
 * model catalog, profile mappings, and generation orchestration.
 *
 * Platform-wide resources (gateways/models) are guarded by
 * `requirePlatformCapability` — NOT workspace roles — because gateway
 * credentials are global (ADR-0005). Generation records are workspace
 * scoped and guarded by membership, like manuscripts.
 *
 * Credentials never leave this layer: `toGatewayView` deliberately omits
 * the ciphertext (CLAUDE.md §14).
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  encryptCredential,
  GatewayManager,
  GatewayError,
  isGatewayFault,
  NoRouteError,
  type AIGateway,
  type GatewayRecord,
  type GatewayRegistry,
  type ModelProfile,
  type RoutingStrategy,
} from "@novelforge/ai-core";
import {
  requireCapability,
  requirePlatformCapability,
  type Capability,
  type PlatformRole,
} from "@novelforge/auth/authorization";
import { BadGatewayError, ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";

/**
 * Platform audit actions the 018B admin surface may read (contract
 * Invariant 1, pinned allowlist). Exported for the route's Zod schema.
 */
export const PLATFORM_AUDIT_ACTIONS = [
  "gateway.created",
  "gateway.updated",
  "gateway.deleted",
  "gateways.health-checked",
  "model-profile.mapped",
  "model.updated",
  "models.synced",
  "models.sync-failed",
] as const;

export interface GatewayView {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number;
  maxRetries: number;
  health: string;
  lastHealthCheckAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCategory: string | null;
  consecutiveFailures: number;
  /** True when a credential is stored. The value itself is never returned. */
  hasCredential: boolean;
}

export interface ModelView {
  id: string;
  gatewayId: string;
  modelId: string;
  displayName: string | null;
  capabilities: string[];
  contextWindow: number | null;
  enabled: boolean;
}

export interface GenerationView {
  id: string;
  novelId: string | null;
  userId: string | null;
  task: string;
  modelProfile: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  attempts?: Array<{
    attemptNumber: number;
    gatewayId: string | null;
    modelId: string | null;
    status: string;
    errorCategory: string;
    latencyMs: number | null;
  }>;
}

export interface AiServices {
  createGateway(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    priority?: number;
    weight?: number;
    timeoutMs?: number;
    maxRetries?: number;
    enabled?: boolean;
  }): Promise<{ id: string }>;
  listGateways(actorPlatformRole: PlatformRole): Promise<GatewayView[]>;
  updateGateway(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    gatewayId: string;
    patch: {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      priority?: number;
      weight?: number;
      timeoutMs?: number;
      maxRetries?: number;
      enabled?: boolean;
    };
  }): Promise<void>;
  deleteGateway(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    gatewayId: string;
  }): Promise<void>;
  /** Discover models from a gateway and upsert the local catalog. */
  syncModels(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    gatewayId: string;
  }): Promise<{ discovered: number }>;
  listModels(actorPlatformRole: PlatformRole): Promise<ModelView[]>;
  setModelEnabled(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    modelId: string;
    enabled: boolean;
  }): Promise<void>;
  setProfileMapping(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
    profile: ModelProfile;
    modelId: string;
    priority?: number;
    enabled?: boolean;
  }): Promise<void>;
  listProfileMappings(actorPlatformRole: PlatformRole): Promise<
    Array<{ profile: string; modelId: string; gatewayId: string; priority: number; enabled: boolean }>
  >;
  /** Probe every enabled gateway and persist health. */
  checkHealth(input: {
    actorPlatformRole: PlatformRole;
    actorUserId: string;
  }): Promise<Array<{ gatewayId: string; healthy: boolean; latencyMs: number }>>;
  /**
   * NF-WF-018B: effective deployment routing strategy (read-only).
   * GAP-066: no frozen route serves this env-level value, so the routing
   * overview reads it here. `gateway:read` gate; never editable.
   */
  getRoutingStrategy(actorPlatformRole: PlatformRole): Promise<{
    strategy: RoutingStrategy;
  }>;
  /**
   * NF-WF-018B: platform audit trail (read-only). SUPER_ADMIN via the
   * `gateway:read` gate; `action` is pinned to the platform audit-action
   * allowlist — anything else is rejected, never silently widened.
   */
  listPlatformAuditLog(
    actorPlatformRole: PlatformRole,
    query: { action?: string; limit?: number },
  ): Promise<
    Array<{
      id: string;
      actorUserId: string | null;
      actorEmail: string | null;
      action: string;
      entityType: string;
      entityId: string | null;
      payload: unknown;
      createdAt: Date;
    }>
  >;
  /** Workspace-scoped generation. */
  generate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    task: string;
    profile: ModelProfile;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ generationId: string; content: string; model: string }>;
  /**
   * Embed a batch of texts through the EMBEDDING profile.
   *
   * Workspace-scoped and audited exactly like `generate`: a `Generation`
   * row (profile EMBEDDING) is written first, so every embedding is
   * attributable to a user, a workspace and a model, and a failed batch
   * leaves the same diagnosable record as a failed generation. Callers
   * that need no provenance should not exist — this is an AI call that
   * costs money (CLAUDE.md §22).
   */
  embed(input: {
    actorUserId: string;
    workspaceId: string;
    texts: string[];
  }): Promise<{ vectors: number[][]; model: string; generationId: string | null }>;
  /**
   * Streamed generation. Yields text deltas; the returned promise resolves
   * with the final status once the stream ends. A stream that fails after
   * emitting content is INCOMPLETE — never SUCCEEDED — so a partial
   * generation can never be mistaken for a complete one (CLAUDE.md §6).
   */
  generateStream(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    task: string;
    profile: ModelProfile;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<{
    generationId: string;
    stream: AsyncGenerator<string>;
    status: () => Promise<"SUCCEEDED" | "INCOMPLETE" | "FAILED">;
  }>;
  listGenerations(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    limit?: number;
  }): Promise<GenerationView[]>;
  getGeneration(input: {
    actorUserId: string;
    workspaceId: string;
    generationId: string;
  }): Promise<GenerationView>;
}

export function createAiServices(deps: {
  db: NovelForgeDb;
  registry: GatewayRegistry;
  encryptionKey: string;
  audit: AuditService;
  /**
   * Transport seam: build the adapter for a gateway record. Tests inject
   * a fake here so no test reaches a real provider, while persistence
   * stays real (CLAUDE.md §25).
   */
  createGateway?: (rec: GatewayRecord) => AIGateway;
  /**
   * Deployment routing policy (AI_ROUTING_STRATEGY). Without it every
   * request would use PRIORITY and the other strategies would be dead
   * configuration.
   */
  routingStrategy?: RoutingStrategy;
}): AiServices {
  const { db, registry, encryptionKey, audit } = deps;
  // NF-WF-018B (GAP-066): the effective deployment routing strategy, read
  // by the routing overview. Env-level only — never editable at runtime.
  const effectiveRoutingStrategy: RoutingStrategy =
    deps.routingStrategy ?? "PRIORITY";
  const manager = new GatewayManager(registry, {
    ...(deps.createGateway ? { createGateway: deps.createGateway } : {}),
    ...(deps.routingStrategy ? { defaultStrategy: deps.routingStrategy } : {}),
  });

  /** Membership gate — 404 for non-members (ADR-0004), like manuscripts. */
  async function gateWorkspace(
    workspaceId: string,
    userId: string,
    cap: Capability,
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("workspace");
    requireCapability(membership.role, cap);
  }

  function toGatewayView(row: {
    id: string;
    name: string;
    baseUrl: string;
    credentialCiphertext: string;
    enabled: boolean;
    priority: number;
    weight: number;
    timeoutMs: number;
    maxRetries: number;
    health: string;
    lastHealthCheckAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCategory: string | null;
    consecutiveFailures: number;
  }): GatewayView {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.baseUrl,
      enabled: row.enabled,
      priority: row.priority,
      weight: row.weight,
      timeoutMs: row.timeoutMs,
      maxRetries: row.maxRetries,
      health: row.health,
      lastHealthCheckAt: row.lastHealthCheckAt,
      lastErrorAt: row.lastErrorAt,
      lastErrorCategory: row.lastErrorCategory,
      consecutiveFailures: row.consecutiveFailures,
      hasCredential: row.credentialCiphertext.length > 0,
    };
  }

  async function gatewayOr404(gatewayId: string) {
    const row = await db.aIGateway.findUnique({ where: { id: gatewayId } });
    if (!row) throw new NotFoundError("gateway");
    return row;
  }

  return {
    async createGateway(input) {
      requirePlatformCapability(input.actorPlatformRole, "gateway:manage");
      const existing = await db.aIGateway.findUnique({
        where: { name: input.name },
        select: { id: true },
      });
      if (existing) throw new ConflictError("gateway name already exists");
      let created;
      try {
        created = await db.aIGateway.create({
          data: {
            name: input.name,
            baseUrl: input.baseUrl,
            credentialCiphertext: encryptCredential(input.apiKey, encryptionKey),
            priority: input.priority ?? 100,
            weight: input.weight ?? 1,
            timeoutMs: input.timeoutMs ?? 60_000,
            maxRetries: input.maxRetries ?? 2,
            enabled: input.enabled ?? true,
          },
          select: { id: true },
        });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          throw new ConflictError("gateway name already exists");
        }
        throw e;
      }
      // Audit records the gateway identity, never the credential.
      await audit.record({
        actorUserId: input.actorUserId,
        action: "gateway.created",
        entityType: "AIGateway",
        entityId: created.id,
        payload: { name: input.name, baseUrl: input.baseUrl },
      });
      return { id: created.id };
    },

    async listGateways(actorPlatformRole) {
      requirePlatformCapability(actorPlatformRole, "gateway:read");
      const rows = await db.aIGateway.findMany({
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      });
      return rows.map(toGatewayView);
    },

    async updateGateway(input) {
      requirePlatformCapability(input.actorPlatformRole, "gateway:manage");
      await gatewayOr404(input.gatewayId);
      const { patch } = input;
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.baseUrl !== undefined) data.baseUrl = patch.baseUrl;
      if (patch.priority !== undefined) data.priority = patch.priority;
      if (patch.weight !== undefined) data.weight = patch.weight;
      if (patch.timeoutMs !== undefined) data.timeoutMs = patch.timeoutMs;
      if (patch.maxRetries !== undefined) data.maxRetries = patch.maxRetries;
      if (patch.enabled !== undefined) data.enabled = patch.enabled;
      // Rotating the credential re-encrypts; the plaintext is never stored.
      if (patch.apiKey !== undefined) {
        data.credentialCiphertext = encryptCredential(patch.apiKey, encryptionKey);
      }
      // The route schema rejects an empty patch, so `data` is never empty
      // here; no early return is needed (and one would skip the audit).
      try {
        await db.aIGateway.update({ where: { id: input.gatewayId }, data });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          throw new ConflictError("gateway name already exists");
        }
        throw e;
      }
      await audit.record({
        actorUserId: input.actorUserId,
        action: "gateway.updated",
        entityType: "AIGateway",
        entityId: input.gatewayId,
        // Never include the credential or its ciphertext.
        payload: { fields: Object.keys(data) },
      });
    },

    async deleteGateway(input) {
      requirePlatformCapability(input.actorPlatformRole, "gateway:manage");
      await gatewayOr404(input.gatewayId);
      // Models cascade; attempts keep history via onDelete: SetNull.
      await db.aIGateway.delete({ where: { id: input.gatewayId } });
      await audit.record({
        actorUserId: input.actorUserId,
        action: "gateway.deleted",
        entityType: "AIGateway",
        entityId: input.gatewayId,
      });
    },

    async syncModels(input) {
      requirePlatformCapability(input.actorPlatformRole, "model:manage");
      await gatewayOr404(input.gatewayId);
      // Model discovery talks to the gateway, so it can fail for
      // transport reasons. Classify and record that against the gateway
      // rather than letting a GatewayError escape as an unhandled 500 —
      // an unreachable gateway is an operational fact the admin needs to
      // see, not a server bug.
      let models;
      const started = Date.now();
      try {
        models = await manager.listModelsFor(input.gatewayId);
      } catch (err) {
        const isGatewayError = err instanceof GatewayError;
        const category = isGatewayError ? err.category : "INTERNAL";
        const latencyMs = Date.now() - started;
        // Only a genuine gateway fault counts against the breaker. A
        // config fault (undecryptable credential, disabled row) or an
        // internal bug would otherwise trip the circuit and silently
        // remove a provider that never failed a generation.
        if (isGatewayError && isGatewayFault(category)) {
          await registry.updateGatewayHealth(input.gatewayId, {
            ok: false,
            category,
            latencyMs,
          });
        }
        await audit.record({
          actorUserId: input.actorUserId,
          action: "models.sync-failed",
          entityType: "AIGateway",
          entityId: input.gatewayId,
          payload: { category },
        });
        // An unreachable gateway is an upstream problem (502). An
        // unreadable credential or disabled row is a configuration fault
        // the operator must fix — 409 with an actionable message, not a
        // 500 and not a misleading "bad gateway". Our own bugs rethrow.
        if (isGatewayError) {
          if (category === "INVALID_REQUEST") {
            throw new ConflictError(
              "gateway is disabled or its stored credential cannot be read",
            );
          }
          throw new BadGatewayError(
            `gateway model discovery failed: ${category.toLowerCase()}`,
          );
        }
        throw err;
      }
      await registry.updateGatewayHealth(input.gatewayId, {
        ok: true,
        category: null,
        latencyMs: Date.now() - started,
      });
      // One transaction: a failure part-way through the catalog upsert
      // must not leave the local model list half-updated, and the audit
      // record must describe exactly what committed (CLAUDE.md §12).
      //
      // The explicit timeout is load-bearing: Prisma's interactive
      // default is 5s, and a real gateway catalogs thousands of models
      // (9Router returns ~2 000), so the sequential upserts outlived the
      // default and the sync failed with an expired-transaction error
      // rather than a gateway one. A fake gateway with two models never
      // reaches the limit, which is why the suite stayed green.
      // ponytail: still a per-row upsert; move to one `createMany` +
      // `updateMany` pair if a catalog this size makes the sync slow.
      let discovered = 0;
      await db.$transaction(async (tx) => {
        for (const m of models) {
          await tx.aIModel.upsert({
            where: {
              gatewayId_modelId: { gatewayId: input.gatewayId, modelId: m.modelId },
            },
            create: {
              gatewayId: input.gatewayId,
              modelId: m.modelId,
              displayName: m.displayName ?? null,
              capabilities: m.capabilities,
              contextWindow: m.contextWindow ?? null,
            },
            update: {
              displayName: m.displayName ?? null,
              capabilities: m.capabilities,
              contextWindow: m.contextWindow ?? null,
              discoveredAt: new Date(),
            },
          });
          discovered++;
        }
        await tx.auditLog.create({
          data: {
            actorUserId: input.actorUserId,
            action: "models.synced",
            entityType: "AIGateway",
            entityId: input.gatewayId,
            payload: { discovered },
          },
        });
      }, { timeout: 120_000 });
      return { discovered };
    },

    async listModels(actorPlatformRole) {
      requirePlatformCapability(actorPlatformRole, "gateway:read");
      const rows = await db.aIModel.findMany({
        orderBy: [{ modelId: "asc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        gatewayId: r.gatewayId,
        modelId: r.modelId,
        displayName: r.displayName,
        capabilities: r.capabilities,
        contextWindow: r.contextWindow,
        enabled: r.enabled,
      }));
    },

    async setModelEnabled(input) {
      requirePlatformCapability(input.actorPlatformRole, "model:manage");
      const model = await db.aIModel.findUnique({ where: { id: input.modelId } });
      if (!model) throw new NotFoundError("model");
      await db.aIModel.update({
        where: { id: input.modelId },
        data: { enabled: input.enabled },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        action: "model.updated",
        entityType: "AIModel",
        entityId: input.modelId,
        payload: { enabled: input.enabled },
      });
    },

    async setProfileMapping(input) {
      requirePlatformCapability(input.actorPlatformRole, "model:manage");
      const model = await db.aIModel.findUnique({ where: { id: input.modelId } });
      if (!model) throw new NotFoundError("model");
      await db.modelProfileMapping.upsert({
        where: {
          profile_modelRef: { profile: input.profile, modelRef: input.modelId },
        },
        create: {
          profile: input.profile,
          modelRef: input.modelId,
          priority: input.priority ?? 100,
          enabled: input.enabled ?? true,
        },
        // Only assign what the caller actually sent: an idempotent
        // PUT {profile, modelId} must not reset a tuned priority back to
        // the default or silently re-enable a disabled mapping.
        update: {
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        action: "model-profile.mapped",
        entityType: "ModelProfileMapping",
        entityId: input.modelId,
        payload: { profile: input.profile, priority: input.priority ?? 100 },
      });
    },

    async listProfileMappings(actorPlatformRole) {
      requirePlatformCapability(actorPlatformRole, "gateway:read");
      const rows = await db.modelProfileMapping.findMany({
        orderBy: [{ profile: "asc" }, { priority: "asc" }],
        include: { model: { select: { modelId: true, gatewayId: true } } },
      });
      return rows.map((r) => ({
        profile: r.profile,
        modelId: r.model.modelId,
        gatewayId: r.model.gatewayId,
        priority: r.priority,
        enabled: r.enabled,
      }));
    },

    async checkHealth(input) {
      requirePlatformCapability(input.actorPlatformRole, "gateway:manage");
      const results = await manager.checkHealth();
      await audit.record({
        actorUserId: input.actorUserId,
        action: "gateways.health-checked",
        entityType: "AIGateway",
        payload: { checked: results.length, healthy: results.filter((r) => r.healthy).length },
      });
      return results;
    },

    async getRoutingStrategy(actorPlatformRole) {
      requirePlatformCapability(actorPlatformRole, "gateway:read");
      return { strategy: effectiveRoutingStrategy };
    },

    /**
     * Platform audit actions the 018B admin surface may read
     * (contract Invariant 1, pinned allowlist). Workspace-scoped actions
     * (workflow.*, agent.*, skill.*, generation.*) belong to 018C's
     * workspace trail — never this route. The route validates `action`
     * against this allowlist with Zod (400 INVALID_INPUT on anything
     * else), so the service receives only pinned actions.
     */
    async listPlatformAuditLog(actorPlatformRole, query) {
      requirePlatformCapability(actorPlatformRole, "gateway:read");
      const { action, limit } = query;
      const cappedLimit = Math.min(Math.max(limit ?? 50, 1), 200);
      const rows = await db.auditLog.findMany({
        where: {
          action: action ?? { in: [...PLATFORM_AUDIT_ACTIONS] },
        },
        orderBy: { createdAt: "desc" },
        take: cappedLimit,
        include: { actor: { select: { email: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorEmail: r.actor?.email ?? null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        payload: r.payload,
        createdAt: r.createdAt,
      }));
    },

    async generate(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "generation:create");
      if (input.novelId) {
        const novel = await db.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      // Logical request first: the generation row exists before any
      // transport attempt so attempts always have a parent (and a crash
      // mid-request leaves a PENDING/IN_PROGRESS record, not a gap).
      const generation = await db.generation.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId ?? null,
          userId: input.actorUserId,
          task: input.task,
          modelProfile: input.profile,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });

      const started = Date.now();
      try {
        const result = await manager.generate({
          profile: input.profile,
          messages: input.messages,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          generationId: generation.id,
        });
        const latencyMs = Date.now() - started;
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "SUCCEEDED",
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            latencyMs,
            completedAt: new Date(),
          },
        });
        await audit.record({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          action: "generation.completed",
          entityType: "Generation",
          entityId: generation.id,
          payload: { task: input.task, profile: input.profile, model: result.model },
        });
        return { generationId: generation.id, content: result.content, model: result.model };
      } catch (err) {
        const latencyMs = Date.now() - started;
        // A profile with no mapped model is a configuration gap the
        // operator fixes, not a transport failure — 409, not 500.
        const noRoute = err instanceof NoRouteError;
        const category = noRoute
          ? "INTERNAL"
          : err instanceof GatewayError
            ? err.category
            : "INTERNAL";
        const message = noRoute
          ? "no model is configured for this capability profile"
          : err instanceof GatewayError
            ? err.message
            : "generation failed";
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            latencyMs,
            errorCategory: category,
            errorMessage: message,
            completedAt: new Date(),
          },
        });
        await audit.record({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          action: "generation.failed",
          entityType: "Generation",
          entityId: generation.id,
          payload: { task: input.task, profile: input.profile, category },
        });
        if (noRoute) {
          throw new ConflictError(
            `no model is configured for profile ${input.profile}`,
          );
        }
        // A gateway failure is an upstream problem (502) carrying the
        // classified message, never the raw provider error. Anything
        // else is our own bug and is rethrown as-is so it is not
        // misreported as a provider fault.
        if (err instanceof GatewayError) {
          throw new BadGatewayError(message);
        }
        throw err;
      }
    },

    async embed(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "generation:create");
      // An empty batch is a caller bug, not a request: no model call, so
      // no Generation row and no audit noise. `manager.embed` agrees.
      // No model call and no Generation row, so there is nothing to link.
      if (input.texts.length === 0) return { vectors: [], model: "", generationId: null };

      const generation = await db.generation.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          task: "embed",
          modelProfile: "EMBEDDING",
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });

      const started = Date.now();
      try {
        const result = await manager.embed({
          profile: "EMBEDDING",
          input: input.texts,
          generationId: generation.id,
        });
        const latencyMs = Date.now() - started;
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "SUCCEEDED",
            inputTokens: result.inputTokens,
            latencyMs,
            completedAt: new Date(),
          },
        });
        await audit.record({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          action: "generation.completed",
          entityType: "Generation",
          entityId: generation.id,
          payload: { task: "embed", profile: "EMBEDDING", model: result.model, texts: input.texts.length },
        });
        return { vectors: result.vectors, model: result.model, generationId: generation.id };
      } catch (err) {
        const latencyMs = Date.now() - started;
        const noRoute = err instanceof NoRouteError;
        const category = noRoute
          ? "INTERNAL"
          : err instanceof GatewayError
            ? err.category
            : "INTERNAL";
        const message = noRoute
          ? "no model is configured for this capability profile"
          : err instanceof GatewayError
            ? err.message
            : "embedding failed";
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            latencyMs,
            errorCategory: category,
            errorMessage: message,
            completedAt: new Date(),
          },
        });
        await audit.record({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          action: "generation.failed",
          entityType: "Generation",
          entityId: generation.id,
          payload: { task: "embed", profile: "EMBEDDING", category },
        });
        if (noRoute) {
          throw new ConflictError("no model is configured for profile EMBEDDING");
        }
        if (err instanceof GatewayError) {
          throw new BadGatewayError(message);
        }
        throw err;
      }
    },

    async generateStream(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "generation:create");
      if (input.novelId) {
        const novel = await db.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      const generation = await db.generation.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId ?? null,
          userId: input.actorUserId,
          task: input.task,
          modelProfile: input.profile,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });

      const started = Date.now();
      let emitted = false;
      // Null until the generator reaches a terminal state. It stays null
      // when the consumer abandons the stream early, which status()
      // resolves to INCOMPLETE (content was sent) or FAILED (nothing was).
      let final: "SUCCEEDED" | "INCOMPLETE" | "FAILED" | null = null;

      const stream = (async function* () {
        try {
          for await (const chunk of manager.generateStream({
            profile: input.profile,
            messages: input.messages,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            generationId: generation.id,
            ...(input.signal ? { signal: input.signal } : {}),
          })) {
            emitted = true;
            yield chunk.delta;
          }
          final = "SUCCEEDED";
        } catch (err) {
          // Content already sent cannot be unsent: the generation is
          // INCOMPLETE, not FAILED, and the client must be told the
          // stream ended early rather than treating it as complete.
          final = emitted ? "INCOMPLETE" : "FAILED";
          const category = err instanceof GatewayError ? err.category : "INTERNAL";
          const message =
            err instanceof GatewayError ? err.message : "generation failed";
          await db.generation.update({
            where: { id: generation.id },
            data: {
              status: final,
              latencyMs: Date.now() - started,
              errorCategory: category,
              errorMessage: message,
              completedAt: new Date(),
            },
          });
          await audit.record({
            actorUserId: input.actorUserId,
            workspaceId: input.workspaceId,
            action: "generation.failed",
            entityType: "Generation",
            entityId: generation.id,
            payload: { task: input.task, profile: input.profile, category, partial: emitted },
          });
          throw err;
        }
      })();

      return {
        generationId: generation.id,
        stream,
        status: async () => {
          // The generator already persisted any failure. Here we only
          // settle the outcome the generator did not reach: a clean
          // completion, or an abandoned stream (client disconnect) that
          // left no terminal state.
          if (final === "SUCCEEDED") {
            await db.generation.update({
              where: { id: generation.id },
              data: {
                status: "SUCCEEDED",
                latencyMs: Date.now() - started,
                completedAt: new Date(),
              },
            });
            await audit.record({
              actorUserId: input.actorUserId,
              workspaceId: input.workspaceId,
              action: "generation.completed",
              entityType: "Generation",
              entityId: generation.id,
              payload: { task: input.task, profile: input.profile, streamed: true },
            });
            return "SUCCEEDED";
          }
          if (final !== null) return final;
          // Abandoned: content was streamed but the generator never
          // finished, so this is INCOMPLETE rather than a clean success.
          const abandoned = emitted ? "INCOMPLETE" : "FAILED";
          await db.generation.update({
            where: { id: generation.id },
            data: {
              status: abandoned,
              latencyMs: Date.now() - started,
              errorCategory: emitted ? "NONE" : "DETERMINISTIC",
              errorMessage: emitted ? "stream abandoned by client" : "stream cancelled",
              completedAt: new Date(),
            },
          });
          await audit.record({
            actorUserId: input.actorUserId,
            workspaceId: input.workspaceId,
            action: "generation.failed",
            entityType: "Generation",
            entityId: generation.id,
            payload: { task: input.task, profile: input.profile, partial: emitted },
          });
          return abandoned;
        },
      };
    },

    async listGenerations(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "generation:read");
      const rows = await db.generation.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.novelId ? { novelId: input.novelId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(input.limit ?? 50, 200),
      });
      return rows.map((r) => ({
        id: r.id,
        novelId: r.novelId,
        userId: r.userId,
        task: r.task,
        modelProfile: r.modelProfile,
        status: r.status,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        errorCategory: r.errorCategory,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }));
    },

    async getGeneration(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "generation:read");
      const row = await db.generation.findFirst({
        where: { id: input.generationId, workspaceId: input.workspaceId },
        include: {
          attempts: {
            orderBy: { attemptNumber: "asc" },
            select: {
              attemptNumber: true,
              gatewayId: true,
              modelId: true,
              status: true,
              errorCategory: true,
              latencyMs: true,
            },
          },
        },
      });
      if (!row) throw new NotFoundError("generation");
      return {
        id: row.id,
        novelId: row.novelId,
        userId: row.userId,
        task: row.task,
        modelProfile: row.modelProfile,
        status: row.status,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        latencyMs: row.latencyMs,
        errorCategory: row.errorCategory,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        attempts: row.attempts,
      };
    },
  };
}
