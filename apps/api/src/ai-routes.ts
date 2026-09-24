/**
 * AI infrastructure routes (Phase 3).
 *
 * Two authorization axes, deliberately distinct (ADR-0005):
 * - `/api/gateways`, `/api/models`, `/api/model-profiles` are
 *   platform-wide: they require a platform role, resolved server-side
 *   from the user row, never a workspace role.
 * - `/api/workspaces/:workspaceId/generations` is tenant-scoped and
 *   gated by workspace membership like every other workspace route.
 *
 * Credentials never appear in a response: the service layer's view type
 * exposes only `hasCredential`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { PlatformRole } from "@novelforge/auth/authorization";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { AiServices } from "./services/ai.ts";

const uuid = z.string().uuid();
const gatewayParams = z.object({ gatewayId: uuid });
const modelParams = z.object({ modelId: uuid });
const workspaceParams = z.object({ workspaceId: uuid });
const generationParams = z.object({
  workspaceId: uuid,
  generationId: uuid,
});

const PROFILE_VALUES = [
  "CREATIVE_WRITER",
  "DEEP_PLANNER",
  "CONTINUITY_REVIEWER",
  "FAST_CLASSIFIER",
  "STRUCTURED_EXTRACTOR",
  "LONG_CONTEXT_REVIEWER",
  "EMBEDDING",
] as const;

const createGatewayBody = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.url().max(2000),
  // Min length keeps an obviously-empty secret out; the value is never
  // echoed back or logged.
  apiKey: z.string().min(1).max(4096),
  priority: z.number().int().min(0).max(10_000).optional(),
  weight: z.number().int().min(1).max(10_000).optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  enabled: z.boolean().optional(),
});

const updateGatewayBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    baseUrl: z.url().max(2000).optional(),
    apiKey: z.string().min(1).max(4096).optional(),
    priority: z.number().int().min(0).max(10_000).optional(),
    weight: z.number().int().min(1).max(10_000).optional(),
    timeoutMs: z.number().int().min(1000).max(600_000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty patch" });

const setModelEnabledBody = z.object({ enabled: z.boolean() });

const setProfileBody = z.object({
  profile: z.enum(PROFILE_VALUES),
  modelId: uuid,
  priority: z.number().int().min(0).max(10_000).optional(),
  enabled: z.boolean().optional(),
});

const generateBody = z.object({
  task: z.string().trim().min(1).max(200),
  profile: z.enum(PROFILE_VALUES),
  novelId: uuid.optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(200_000),
      }),
    )
    .min(1)
    .max(200),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
});

const listGenerationsQuery = z.object({
  novelId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// Fastify's default bodyLimit is 1 MB, but generateBody accepts 200
// messages of up to 200k chars — a payload the schema allows would 413
// before Zod ran. Same footgun the manuscript routes document.
const GENERATE_BODY_LIMIT = 4_000_000;

export interface AiRoutesOptions {
  auth: AuthService;
  services: AiServices;
  /** Resolve the actor's platform role from the user row (never a token claim). */
  platformRoleOf: (userId: string) => Promise<PlatformRole>;
}

export function registerAiRoutes(
  app: FastifyInstance,
  { auth, services, platformRoleOf }: AiRoutesOptions,
): void {
  /**
   * Resolve the caller to `{ userId, platformRole }`, or reply 401.
   * The platform role is read from the database on every request — it is
   * never taken from the session token or a client header.
   */
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ userId: string; platformRole: PlatformRole } | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return {
      userId: session.userId,
      platformRole: await platformRoleOf(session.userId),
    };
  };

  // --- Gateways (platform-admin) ---

  app.post("/api/gateways", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = createGatewayBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const { id } = await services.createGateway({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      ...body.data,
    });
    return reply.code(201).send({ id });
  });

  app.get("/api/gateways", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return services.listGateways(actor.platformRole);
  });

  app.post("/api/gateways/health-check", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return services.checkHealth({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
    });
  });

  app.patch("/api/gateways/:gatewayId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = gatewayParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = updateGatewayBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await services.updateGateway({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      gatewayId: params.data.gatewayId,
      patch: body.data,
    });
    return { status: "ok" };
  });

  app.delete("/api/gateways/:gatewayId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = gatewayParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await services.deleteGateway({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      gatewayId: params.data.gatewayId,
    });
    return { status: "ok" };
  });

  app.post("/api/gateways/:gatewayId/sync-models", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = gatewayParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.syncModels({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      gatewayId: params.data.gatewayId,
    });
  });

  // --- Models + profile mappings (platform-admin) ---

  app.get("/api/models", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return services.listModels(actor.platformRole);
  });

  app.get("/api/model-profiles", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return services.listProfileMappings(actor.platformRole);
  });

  app.put("/api/model-profiles", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const body = setProfileBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await services.setProfileMapping({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      ...body.data,
    });
    return { status: "ok" };
  });

  app.patch("/api/models/:modelId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = modelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = setModelEnabledBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await services.setModelEnabled({
      actorPlatformRole: actor.platformRole,
      actorUserId: actor.userId,
      modelId: params.data.modelId,
      enabled: body.data.enabled,
    });
    return { status: "ok" };
  });

  // --- Generations (workspace-scoped) ---

  app.post(
    "/api/workspaces/:workspaceId/generations",
    { bodyLimit: GENERATE_BODY_LIMIT },
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = generateBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const result = await services.generate({
        actorUserId: actor.userId,
        workspaceId: params.data.workspaceId,
        ...body.data,
      });
      return reply.code(201).send(result);
    },
  );

  app.get("/api/workspaces/:workspaceId/generations", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = listGenerationsQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listGenerations({
      actorUserId: actor.userId,
      workspaceId: params.data.workspaceId,
      novelId: query.data.novelId,
      limit: query.data.limit,
    });
  });

  app.get(
    "/api/workspaces/:workspaceId/generations/:generationId",
    async (request, reply) => {
      const actor = await requireActor(request, reply);
      if (!actor) return;
      const params = generationParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.getGeneration({
        actorUserId: actor.userId,
        ...params.data,
      });
    },
  );
}
