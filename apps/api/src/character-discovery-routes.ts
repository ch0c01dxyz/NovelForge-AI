import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import type { CharacterDiscoveryServices } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";

const uuid = z.string().uuid();
const scope = z.object({ workspaceId: uuid, novelId: uuid });
const runParams = scope.extend({ runId: uuid });
const candidateParams = scope.extend({ batchId: uuid, candidateId: uuid });
const version = z.object({ expectedVersion: z.number().int().min(1) });
const edit = version.extend({ name: z.string().trim().min(1).max(300), summary: z.string().trim().min(1).max(2000) }).strict();
const approve = version.extend({ expectedHeadRevisionId: uuid.nullable(), expectedChapterVersionId: uuid, expectedBranchId: uuid }).strict();
const discover = z.object({ retry: z.boolean().optional() }).strict();

export function registerCharacterDiscoveryRoutes(app: FastifyInstance, { auth, services }: { auth: AuthService; services: CharacterDiscoveryServices }) {
  const base = "/api/workspaces/:workspaceId/novels/:novelId";
  for (const method of ["GET", "POST", "PATCH"] as const) {
    const routes = method === "GET" ? ["/runs/:runId/character-discovery"] : method === "PATCH" ? ["/character-discoveries/:batchId/candidates/:candidateId"] : ["/runs/:runId/character-discovery", "/character-discoveries/:batchId/candidates/:candidateId/approve", "/character-discoveries/:batchId/candidates/:candidateId/reject"];
    for (const route of routes) app.route({ method, url: base + route, handler: async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHENTICATED" });
      const runRoute = route.startsWith("/runs/");
      const params = (runRoute ? runParams : candidateParams).safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const actorUserId = session.userId;
      if (runRoute) {
        const input = { actorUserId, ...runParams.parse(params.data) };
        if (method === "GET") return services.get(input);
        const body = discover.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return services.discover({ ...input, ...body.data });
      }
      const input = { actorUserId, ...candidateParams.parse(params.data) };
      if (method === "PATCH") {
        const body = edit.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return services.edit({ ...input, ...body.data });
      }
      if (route.endsWith("/approve")) {
        const body = approve.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
        return services.approve({ ...input, ...body.data });
      }
      const body = version.strict().safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.reject({ ...input, ...body.data });
    } });
  }
}
