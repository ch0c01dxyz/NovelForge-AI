/**
 * /api/auth routes (ADR-0002).
 *
 * Controllers parse/authenticate/validate and delegate — business logic
 * lives in @novelforge/auth services (API-BOUNDARIES.md service rules).
 * Session cookie: HttpOnly, SameSite=Lax, Path=/, Secure in production.
 * CSRF posture: SameSite=Lax same-origin only for now (ADR-0002 §6).
 * Rate limiting: login/register are sensitive endpoints (SECURITY.md).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthError, SESSION_TTL_MS, type AuthService } from "@novelforge/auth";

export const SESSION_COOKIE = "nf_session";

const registerBody = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100),
});

const loginBody = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
});

export interface AuthRoutesOptions {
  auth: AuthService;
  secureCookies: boolean; // true when NODE_ENV === "production"
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  { auth, secureCookies }: AuthRoutesOptions,
): Promise<void> {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookies,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };

  app.post(
    "/api/auth/register",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = registerBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      try {
        const { userId } = await auth.register(parsed.data);
        return reply.code(201).send({ userId });
      } catch (err) {
        // 409 reveals registration state for register only (per UX);
        // login deliberately does not distinguish.
        if (err instanceof AuthError && err.code === "EMAIL_TAKEN") {
          return reply.code(409).send({ error: "EMAIL_TAKEN" });
        }
        throw err;
      }
    },
  );

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = loginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      try {
        const { token, expiresAt } = await auth.login(
          parsed.data.email,
          parsed.data.password,
        );
        reply.setCookie(SESSION_COOKIE, token, {
          ...cookieOptions,
          expires: expiresAt,
        });
        // The token itself is never echoed in the body (cookie-only).
        return reply.code(200).send({ status: "ok" });
      } catch (err) {
        if (err instanceof AuthError && err.code === "INVALID_CREDENTIALS") {
          return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
        }
        throw err;
      }
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { status: "ok" };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return reply.code(401).send({ error: "NO_SESSION" });
    const session = await auth.validateSession(token);
    if (!session) return reply.code(401).send({ error: "INVALID_SESSION" });
    return { userId: session.userId, expiresAt: session.expiresAt };
  });
}
