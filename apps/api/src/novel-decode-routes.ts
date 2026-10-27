import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "@novelforge/auth";
import { z } from "zod";
import { DECODE_AREAS, ConflictError } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { NovelDecodeServices } from "./services/novel-decodes.ts";
import { ImportError } from "./services/import-normalize.ts";

const uuid = z.string().uuid();
const paramsSchema = z.object({ workspaceId: uuid, jobId: uuid.optional(), candidateId: uuid.optional() });
const decision = z.object({ expectedVersion: z.number().int().min(1), expectedHeadRevisionId: uuid.nullable() }).strict();
const edit = z.object({ expectedVersion: z.number().int().min(1), title: z.string().trim().min(1).max(200), summary: z.string().trim().min(1).max(4000), subject: z.string().trim().min(1).max(300).nullable().optional(), target: z.string().trim().min(1).max(300).nullable().optional(), details: z.record(z.string(), z.unknown()).optional() }).strict();

export function registerNovelDecodeRoutes(app: FastifyInstance, { auth, services }: { auth: AuthService; services: NovelDecodeServices }) {
  const base = "/api/workspaces/:workspaceId/novel-decodes";
  const handler = (action: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.cookies[SESSION_COOKIE] ? await auth.validateSession(request.cookies[SESSION_COOKIE]!) : null;
    if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const scope = { workspaceId: params.data.workspaceId, actorUserId: session.userId };
    const id = params.data.jobId!, candidateId = params.data.candidateId!;
    try {
      if (action === "preview" || action === "start") {
        const file = await request.file({ limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5, fieldSize: 4000 } });
        if (!file) return reply.code(400).send({ error: "INVALID_INPUT" });
        const buffer = await file.toBuffer();
        if (action === "preview") return await services.preview(scope, buffer);
        const fields: Record<string, string> = {};
        for (const [key, raw] of Object.entries(file.fields)) {
          if (raw && !Array.isArray(raw) && raw.type === "field" && "value" in raw && typeof raw.value === "string") fields[key] = raw.value;
        }
        const body = z.object({ root: z.string().max(1000), archiveHash: z.string().regex(/^[a-f0-9]{64}$/), requestId: uuid, areas: z.string().max(2000) }).strict().safeParse(fields);
        if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        let areas: unknown;
        try { areas = JSON.parse(body.data.areas); } catch { return reply.code(400).send({ error: "INVALID_INPUT" }); }
        const parsed = z.array(z.enum(DECODE_AREAS)).min(1).max(DECODE_AREAS.length).safeParse(areas);
        if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return await services.start(scope, { ...body.data, areas: parsed.data, buffer });
      }
      if (action === "list") return await services.list(scope);
      if (action === "get") return await services.get(scope, id);
      if (action === "retry" || action === "cancel") return await services.control(scope, id, action);
      if (action === "candidates") {
        const filter = z.object({ area: z.enum(DECODE_AREAS).optional(), status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(), take: z.coerce.number().int().min(1).max(100).default(25), skip: z.coerce.number().int().min(0).max(1000000).default(0) }).strict().safeParse(request.query);
        if (!filter.success) return reply.code(400).send({ error: "INVALID_INPUT" }); return await services.candidates(scope, id, filter.data);
      }
      if (action === "edit") {
        const body = edit.safeParse(request.body);
        if (!body.success || JSON.stringify(body.data.details ?? {}).length > 12000) return reply.code(400).send({ error: "INVALID_INPUT" });
        return await services.edit(scope, id, candidateId, body.data);
      }
      const body = decision.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return await services.decide(scope, id, candidateId, body.data, action === "approve");
    } catch (error) {
      if (error instanceof ImportError) return reply.code(error.statusCode).send({ error: error.code });
      if (error instanceof ConflictError && /dependency|ambiguous|already belongs/.test(error.message)) return reply.code(409).send({ error: "DECODE_IDENTITY_REVIEW_REQUIRED" });
      if (error instanceof ConflictError && /^DECODE_[A-Z_]+$/.test(error.message)) return reply.code(409).send({ error: error.message });
      throw error;
    }
  };
  for (const [method, suffix, action] of [
    ["POST", "/preview", "preview"], ["POST", "", "start"], ["GET", "", "list"], ["GET", "/:jobId", "get"],
    ["POST", "/:jobId/retry", "retry"], ["POST", "/:jobId/cancel", "cancel"], ["GET", "/:jobId/candidates", "candidates"],
    ["PATCH", "/:jobId/candidates/:candidateId", "edit"], ["POST", "/:jobId/candidates/:candidateId/approve", "approve"], ["POST", "/:jobId/candidates/:candidateId/reject", "reject"],
  ] as const) app.route({ method, url: base + suffix, bodyLimit: 51 * 1024 * 1024, handler: handler(action) });
}
