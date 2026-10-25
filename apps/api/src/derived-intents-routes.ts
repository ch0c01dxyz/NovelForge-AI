import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { DerivedIntentServices } from "./services/derived-intents.ts";

const params = z.object({
  workspaceId: z.string().uuid(),
  novelId: z.string().uuid(),
});

export function registerDerivedIntentRoutes(
  app: FastifyInstance,
  { auth, intents }: { auth: AuthService; intents: DerivedIntentServices },
): void {
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return session.userId;
  };

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/derived-intents",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const parsed = params.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const status = await intents.getStatus(
        actorUserId,
        parsed.data.workspaceId,
        parsed.data.novelId,
      );
      return reply.code(200).send(status);
    },
  );
}
