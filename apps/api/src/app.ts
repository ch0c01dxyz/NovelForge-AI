/**
 * @novelforge/api — application factory.
 *
 * Exposes buildApp(env) so tests can drive routes via fastify.inject
 * without binding a port. Liveness (/health) has no dependencies;
 * readiness (/ready) probes the configured datastores and answers 503
 * when any are unreachable.
 */
import { randomUUID } from "node:crypto";
import net from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Env } from "@novelforge/config";
import type { NovelForgeDb } from "@novelforge/database";
import { createAuthService } from "@novelforge/auth";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import { registerPlatformRoutes } from "./platform-routes.ts";
import { registerManuscriptRoutes } from "./manuscript-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import { createManuscriptServices } from "./services/manuscript.ts";

export type CheckState = "up" | "down";

export interface ReadyBody {
  status: "ok" | "degraded";
  checks: { database: CheckState; redis: CheckState };
}

const DEFAULT_PORTS: Record<string, number> = {
  "postgres:": 5432,
  "postgresql:": 5432,
  "redis:": 6379,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TCP-connect probe with timeout. The URL may embed credentials, so it is
 * never logged — only the up/down result is.
 * ponytail: TCP reachability only; swap for real driver pings (pg
 * `SELECT 1`, redis `PING`) once @novelforge/database lands drivers.
 */
function probe(rawUrl: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      resolve(false);
      return;
    }
    const port = Number(parsed.port) || DEFAULT_PORTS[parsed.protocol] || 0;
    const socket = net.connect({ host: parsed.hostname, port });
    const finish = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export interface BuildAppOptions {
  /**
   * When provided, /api/auth routes are registered against this database.
   * Tests without a DB get the bare health/ready app.
   */
  db?: NovelForgeDb;
}

export async function buildApp(
  env: Env,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    // Structured JSON logs (pino) with a request ID on every line; honor an
    // inbound x-request-id so traces correlate across services.
    logger: env.NODE_ENV === "test" ? false : { level: "info" },
    genReqId: (req) => {
      // Honor an inbound x-request-id for trace correlation, but only when
      // it is a well-formed uuid — a spoofable free-text field must not
      // become the log correlation key.
      const inbound = req.headers["x-request-id"];
      if (typeof inbound === "string" && UUID_RE.test(inbound)) return inbound;
      return randomUUID();
    },
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    // Global fallback; per-route overrides live in route config.
    max: 300,
    timeWindow: "1 minute",
  });

  if (options.db) {
    const auth = createAuthService({
      users: prismaUserStore(options.db),
      sessions: prismaSessionStore(options.db),
    });
    await registerAuthRoutes(app, {
      auth,
      secureCookies: env.NODE_ENV === "production",
    });
    await registerPlatformRoutes(app, {
      auth,
      services: createPlatformServices({
        db: options.db,
        audit: createAuditService(options.db),
      }),
    });
    registerManuscriptRoutes(app, {
      auth,
      services: createManuscriptServices(options.db),
    });
  }

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (request, reply) => {
    const [dbUp, redisUp] = await Promise.all([
      probe(env.DATABASE_URL),
      probe(env.REDIS_URL),
    ]);
    const ok = dbUp && redisUp;
    const body: ReadyBody = {
      status: ok ? "ok" : "degraded",
      checks: {
        database: dbUp ? "up" : "down",
        redis: redisUp ? "up" : "down",
      },
    };
    return reply.code(ok ? 200 : 503).send(body);
  });

  return app;
}
