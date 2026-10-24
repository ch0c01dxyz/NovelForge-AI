import type { FastifyInstance } from "fastify";
import type { Env } from "@novelforge/config";
import { SESSION_COOKIE } from "./auth-routes.ts";

/** SameSite is site-scoped; cookie mutations also need an explicit origin boundary. */
export function registerHttpBoundary(app: FastifyInstance, env: Env): void {
  if (!env.PUBLIC_ORIGIN) return; // Production loadEnv requires this; legacy development stays opt-in.
  const allowed = new URL(env.PUBLIC_ORIGIN).origin;
  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const hasSession = Boolean(request.cookies[SESSION_COOKIE]);
    if (origin === undefined && !hasSession) return; // Non-browser, non-cookie callers.
    try {
      if (origin !== undefined) {
        if (new URL(origin).origin === allowed && origin === allowed) return;
      } else if (referer && new URL(referer).origin === allowed) {
        return;
      }
    } catch {
      // Malformed/null origins are rejected, not treated as missing headers.
    }
    return reply.code(403).send({ error: "FORBIDDEN_ORIGIN" });
  });
}
