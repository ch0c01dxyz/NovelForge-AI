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
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import { createAuthService } from "@novelforge/auth";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import { registerPlatformRoutes } from "./platform-routes.ts";
import { registerManuscriptRoutes } from "./manuscript-routes.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { registerDefinitionRoutes } from "./definition-routes.ts";
import { registerRetrievalRoutes } from "./retrieval-routes.ts";
import { registerCanonRoutes } from "./canon-routes.ts";
import { registerOrchestratorRoutes } from "./orchestrator-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { registerPlanningRoutes } from "./planning-routes.ts";
import { registerCharacterRoutes } from "./character-routes.ts";
import { registerRelationshipRoutes } from "./relationship-routes.ts";
import { registerStoryRoutes } from "./story-routes.ts";
import { registerNarrativeRoutes } from "./narrative-routes.ts";
import { createCharacterServices } from "./services/characters.ts";
import { createRelationshipServices } from "./services/relationships.ts";
import { createStoryServices } from "./services/story.ts";
import { createNarrativeServices } from "./services/narrative.ts";
import { createPlanningServices } from "./services/planning.ts";
import { createPlatformServices } from "./services/platform.ts";
import { createManuscriptServices } from "./services/manuscript.ts";
import { createAiServices } from "./services/ai.ts";
import { createDefinitionServices } from "./services/definitions.ts";
import { createWorkflowRunServices } from "./services/workflow-runs.ts";
import { createRetrievalServices } from "./services/retrieval.ts";
import { createCanonServices } from "./services/canon.ts";
import { createOrchestratorServices } from "./services/orchestrator.ts";
import { createGatewayRegistry } from "./ai-registry.ts";

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
  /**
   * Transport seam for the AI gateway adapter. Tests supply a fake so no
   * test ever reaches a real provider (CLAUDE.md §25); persistence and
   * routing stay real. Production omits this and the OmniRoute adapter
   * is built from the gateway's stored record.
   */
  createGateway?: (rec: GatewayRecord) => AIGateway;
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
    //
    // Under test the fallback is effectively disabled: the limiter's
    // in-memory store is shared across every request in one app instance,
    // so a large integration file trips it partway through and the failure
    // lands on whichever test happened to run last. Only the GLOBAL
    // fallback is relaxed — the per-route limits (auth register/login) stay
    // enforced, and those are the security-sensitive ones.
    max: env.NODE_ENV === "test" ? 1_000_000 : 300,
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
      services: createManuscriptServices(options.db, createAuditService(options.db), {
        // A chapter delete blocked by a canon citation is a rejected write,
        // not a server fault; the constraint name it cannot carry is logged.
        error: (message, meta) => app.log.error(meta, message),
      }),
    });
    // One audit + one AI services instance shared by the AI routes and the
    // workflow executor: a workflow step must reach a model through the
    // same generation path as a direct request (CLAUDE.md §18), so the
    // executor is given `aiServices.generate` rather than its own client.
    const audit = createAuditService(options.db);
    const aiServices = createAiServices({
      db: options.db,
      registry: createGatewayRegistry(options.db, env.APP_ENCRYPTION_KEY),
      encryptionKey: env.APP_ENCRYPTION_KEY,
      audit,
      routingStrategy: env.AI_ROUTING_STRATEGY,
      // Tests inject a fake adapter here so no test reaches a real
      // provider; persistence stays real (CLAUDE.md §25).
      ...(options.createGateway ? { createGateway: options.createGateway } : {}),
    });
    const platformRoleOf = async (userId: string) => {
      const user = await options.db!.user.findUnique({
        where: { id: userId },
        select: { platformRole: true },
      });
      return user?.platformRole ?? null;
    };
    registerAiRoutes(app, { auth, services: aiServices, platformRoleOf });

    // One retrieval service shared by the routes and the workflow executor:
    // a RETRIEVAL step must search exactly the index a direct search reads,
    // through the same spoiler and tenant predicates (CLAUDE.md §10).
    const retrievalServices = createRetrievalServices({
      db: options.db,
      audit,
      ai: aiServices,
      dbg: { error: (message, meta) => app.log.error(meta, message) },
    });
    registerRetrievalRoutes(app, { auth, services: retrievalServices });

    // Story intelligence (Phase 6). The Story Brain's prose leg reuses the
    // SAME retrieval service a direct search reads, so a Brain answer and a
    // search can never disagree about what the index contains — and both
    // pass through one spoiler predicate (CLAUDE.md §10).
    const canonServices = createCanonServices({
      db: options.db,
      audit,
      retrieval: retrievalServices,
      // A constraint rejection reaches the client as a mapped 409; the
      // constraint name it cannot carry is logged here instead.
      dbg: { error: (message, meta) => app.log.error(meta, message) },
    });
    registerCanonRoutes(app, { auth, services: canonServices });

    // AI Orchestrator (milestone): the caller names an agent + instruction and
    // the orchestrator resolves definitions, compiles context, and runs the
    // generation through the SAME aiServices path a direct request uses, so
    // gateway routing, retry, ledger, and audit stay in one place.
    registerOrchestratorRoutes(app, {
      auth,
      services: createOrchestratorServices({
        db: options.db,
        ai: aiServices,
        canon: canonServices,
        retrieval: retrievalServices,
      }),
    });

    // Planning (Phase 7): synopses, sagas, outline nodes, outline versions,
    // horizon — pure rules from @novelforge/planning, service owns CAS + audit.
    registerPlanningRoutes(app, {
      auth,
      services: createPlanningServices({ db: options.db, audit }),
    });

    // Character & Relationship Intelligence (Phase 8): pure rules from
    // @novelforge/character-intelligence and @novelforge/relationship-intelligence;
    // the services own tenancy + audit, the EXCLUDE constraints own overlap.
    registerCharacterRoutes(app, {
      auth,
      services: createCharacterServices({ db: options.db, audit }),
    });
    registerRelationshipRoutes(app, {
      auth,
      services: createRelationshipServices({ db: options.db, audit }),
    });

    // Story Intelligence write surface (Phase 6 slice 2). The Brain already
    // reads events, threads, promises and causal edges; this is what lets an
    // author put rows there. Pure rules from @novelforge/story-intelligence,
    // the migration CHECKs as backstop.
    registerStoryRoutes(app, {
      auth,
      services: createStoryServices({ db: options.db, audit }),
    });

    // Narrative DNA & Rhythm (Phase 9): the write surface behind
    // @novelforge/narrative-rhythm. Three of the five pure rules refuse the
    // request that would violate them; the other two are advisory and are
    // returned rather than enforced (ADR-009 / ADR-012). The migration CHECKs
    // stay the backstop.
    registerNarrativeRoutes(app, {
      auth,
      services: createNarrativeServices({ db: options.db, audit }),
    });

    registerDefinitionRoutes(app, {
      auth,
      definitions: createDefinitionServices({ db: options.db, audit }),
      runs: createWorkflowRunServices({
        db: options.db,
        audit,
        ai: aiServices,
        retrieval: retrievalServices,
        // A step's raw error is never returned to the client (it can carry a
        // Prisma string or an upstream provider body), so it is logged here
        // instead. Reuses the pino instance already configured above.
        dbg: { error: (message, meta) => app.log.error(meta, message) },
      }),
      platformRoleOf,
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
