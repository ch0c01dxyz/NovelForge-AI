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
import type { Env } from "@novelforge/config";

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

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    // Structured JSON logs (pino) with a request ID on every line; honor an
    // inbound x-request-id so traces correlate across services.
    logger: env.NODE_ENV === "test" ? false : { level: "info" },
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  });

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
