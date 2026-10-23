import type { FastifyInstance } from "fastify";
import type { AuthService } from "@novelforge/auth";
import type { NovelForgeDb } from "@novelforge/database";
import { z } from "zod";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createBrandingService } from "./services/platform-branding.ts";

const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[\p{L}\p{N} .'-]+$/u);
export const brandingInput = z.object({ name: text(40), mark: text(3), markColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), expectedVersion: z.number().int().min(0).max(2147483646) }).strict();

export async function registerBrandingRoutes(app: FastifyInstance, { auth, db }: { auth: AuthService; db: NovelForgeDb }) {
  const service = createBrandingService(db);
  app.get("/api/public/branding", async () => service.get());
  app.put("/api/platform/branding", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = brandingInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = await service.update(session.userId, parsed.data);
    if (result.error) return reply.code(result.error === "FORBIDDEN" ? 403 : 409).send({ error: result.error });
    return result.branding;
  });
}
