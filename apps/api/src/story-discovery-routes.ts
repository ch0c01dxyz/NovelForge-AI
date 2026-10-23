import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { ConflictError, type StoryDiscoveryServices } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";
const uuid = z.string().uuid();
const scope = z.object({ workspaceId: uuid, novelId: uuid });
const member = z.object({ name: z.string().min(1).max(300), role: z.enum(["MEMBER","LEADER"]), quote: z.string().min(1).max(1000), characterId: uuid.optional() }).strict();
const version = z.object({ expectedVersion: z.number().int().min(1) });
const edit = version.extend({ edit: z.object({
  name: z.string().trim().min(1).max(300), summary: z.string().trim().min(1).max(2000),
  existingEntityId: uuid.nullable().optional(), referenceVersionId: uuid.nullable().optional(),
  supportingQuote: z.string().max(2000).optional(), mode: z.enum(["NEEDS_SOURCE","FICTIONAL_ADAPTATION","REAL_REFERENCE"]).optional(),
  members: z.array(member).max(10).optional(),
}).strict() }).strict();
const approve = version.extend({ expectedBranchId: uuid, expectedHeadRevisionId: uuid.nullable(), expectedChapterVersionId: uuid }).strict();
export function registerStoryDiscoveryRoutes(app: FastifyInstance, { auth, services }: { auth: AuthService; services: StoryDiscoveryServices }) {
  const base = "/api/workspaces/:workspaceId/novels/:novelId";
  for (const action of ["get","discover","options","EDIT","APPROVE","REJECT"] as const) {
    const runRoute = action === "get" || action === "discover", optionRoute = action === "options";
    const params = runRoute ? scope.extend({ runId: uuid }) : optionRoute ? scope : scope.extend({ batchId: uuid, candidateId: uuid });
    const suffix = runRoute ? "/runs/:runId/story-discovery" : optionRoute ? "/story-discoveries/options" : "/story-discoveries/:batchId/candidates/:candidateId" + (action === "EDIT" ? "" : "/" + action.toLowerCase());
    app.route({ method: action === "get" || optionRoute ? "GET" : action === "EDIT" ? "PATCH" : "POST", url: base + suffix, errorHandler: (error, _request, reply) => {
      if (error instanceof ConflictError && /^STORY_[A-Z_]+$/.test(error.message)) return reply.code(409).send({ error: error.message });
      throw error;
    }, handler: async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE], session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
      const parsed = params.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const input = { actorUserId: session.userId, ...scope.parse(parsed.data) };
      if (optionRoute) {
        const query = z.object({ kind: z.enum(["GROUP","CHARACTER","REFERENCE"]), q: z.string().max(100).default(""), selected: uuid.optional() }).safeParse(request.query);
        if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return services.options({ ...input, ...query.data });
      }
      if (runRoute) {
        const { runId } = scope.extend({ runId: uuid }).parse(parsed.data);
        if (action === "get") return services.get({ ...input, runId });
        const body = z.object({ retry: z.boolean().optional() }).strict().safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return services.discover({ ...input, runId, ...body.data });
      }
      const ids = scope.extend({ batchId: uuid, candidateId: uuid }).parse(parsed.data);
      if (action === "EDIT") { const body = edit.safeParse(request.body); if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" }); return services.decide({ ...input, ...ids, ...body.data, action }); }
      if (action === "APPROVE") { const body = approve.safeParse(request.body); if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" }); return services.decide({ ...input, ...ids, ...body.data, action }); }
      const body = version.strict().safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.decide({ ...input, ...ids, ...body.data, action: "REJECT" });
    } });
  }
}
