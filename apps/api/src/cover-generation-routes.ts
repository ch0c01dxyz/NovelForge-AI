import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { NoRouteError } from "@novelforge/ai-core";
import { COVER_STYLES, CoverGenerationError, type CoverGenerationServices, type CoverScope } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";

const uuid = z.string().uuid();
const scopeParams = z.object({ workspaceId: uuid, novelId: uuid, batchId: uuid.optional(), itemId: uuid.optional(), versionId: uuid.optional() });
const coverHash = z.string().regex(/^[a-f0-9]{64}$/).nullable();
const base = "/api/workspaces/:workspaceId/novels/:novelId";
const createBody = z.object({ count: z.number().int().min(1).max(9), style: z.enum(COVER_STYLES), notes: z.string().max(4000).default(""), prompt: z.string().trim().min(1).max(16_000), preferredModelRef: uuid.optional(), idempotencyKey: uuid, expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();

export function registerCoverGenerationRoutes(app: FastifyInstance, deps: { auth: AuthService; services: CoverGenerationServices }) {
  const { services } = deps;
  async function handle(request: FastifyRequest, reply: FastifyReply, action: (scope: CoverScope, params: z.infer<typeof scopeParams>) => Promise<unknown>) {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await deps.auth.validateSession(token) : null;
    if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    const params = scopeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "COVER_INVALID_INPUT" });
    try { return await action({ actorUserId: session.userId, workspaceId: params.data.workspaceId, novelId: params.data.novelId }, params.data); }
    catch (error) {
      if (error instanceof CoverGenerationError) return reply.code(error.statusCode).send({ error: error.code });
      if (error instanceof NoRouteError) return reply.code(409).send({ error: "COVER_MODEL_UNAVAILABLE" });
      throw error;
    }
  }
  app.get(`${base}/cover-brief`, (request, reply) => handle(request, reply, scope => services.brief(scope)));
  app.get(`${base}/cover-generations`, (request, reply) => handle(request, reply, scope => services.list(scope)));
  app.post(`${base}/cover-generations`, (request, reply) => handle(request, reply, async scope => {
    const body = createBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "COVER_INVALID_INPUT" });
    return services.create({ ...scope, ...body.data });
  }));
  app.get(`${base}/cover-generations/:batchId`, (request, reply) => handle(request, reply, (scope, params) => services.get(scope, params.batchId!)));
  app.delete(`${base}/cover-generations/:batchId/items/:itemId`, (request, reply) => handle(request, reply, (scope, params) => services.remove(scope, params.batchId!, params.itemId!)));
  app.get(`${base}/cover-generations/:batchId/items/:itemId/image`, (request, reply) => handle(request, reply, async (scope, params) => {
    const image = await services.image(scope, params.batchId!, params.itemId!);
    return reply.type(image.mimeType).header("X-Content-Type-Options", "nosniff").header("Cache-Control", "private, no-store").header("Content-Disposition", "inline").send(Buffer.from(image.dataBase64, "base64"));
  }));
  for (const action of ["cancel", "resume"] as const) app.post(`${base}/cover-generations/:batchId/${action}`, (request, reply) => handle(request, reply, (scope, params) => services.change(scope, params.batchId!, { cancel: action === "cancel" })));
  app.post(`${base}/cover-generations/:batchId/items/:itemId/retry`, (request, reply) => handle(request, reply, (scope, params) => {
    const body = z.object({ acknowledgeUncertain: z.boolean().default(false) }).strict().safeParse(request.body ?? {});
    if (!body.success) return Promise.resolve(reply.code(400).send({ error: "COVER_INVALID_INPUT" }));
    return services.change(scope, params.batchId!, { itemId: params.itemId!, ...body.data });
  }));
  app.post(`${base}/cover-generations/:batchId/items/:itemId/apply`, (request, reply) => handle(request, reply, async (scope, params) => {
    const body = z.object({ expectedCoverHash: coverHash }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "COVER_INVALID_INPUT" });
    return services.apply({ ...scope, batchId: params.batchId!, itemId: params.itemId!, ...body.data });
  }));
  app.get(`${base}/cover-history`, (request, reply) => handle(request, reply, scope => services.history(scope)));
  app.post(`${base}/cover-history/:versionId/restore`, (request, reply) => handle(request, reply, async (scope, params) => {
    const body = z.object({ expectedCoverHash: coverHash }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "COVER_INVALID_INPUT" });
    return services.restore({ ...scope, versionId: params.versionId!, ...body.data });
  }));
}
