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
// NF-WF-017A: multipart for the chapter-import file route. Registered
// once here; per-format validation lives in the import service.
import multipart from "@fastify/multipart";
import type { Env } from "@novelforge/config";
import type { NovelForgeDb } from "@novelforge/database";
import { GatewayManager, type AIGateway, type GatewayRecord } from "@novelforge/ai-core";
import { createAuthService } from "@novelforge/auth";
import { prismaSessionStore, prismaUserStore } from "./auth-stores.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import { registerPlatformRoutes } from "./platform-routes.ts";
import { registerBrandingRoutes } from "./branding-routes.ts";
import { registerManuscriptRoutes } from "./manuscript-routes.ts";
import { registerScaleEvidenceRoutes } from "./scale-evidence-routes.ts";
import { registerScaleDecisionRoutes } from "./scale-decision-routes.ts";
import { registerScaleS3Routes } from "./scale-s3-routes.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { registerCoverGenerationRoutes } from "./cover-generation-routes.ts";
import { registerCharacterDiscoveryRoutes } from "./character-discovery-routes.ts";
import { createCharacterDiscoveryServices } from "@novelforge/ai-services";
import { createStoryDiscoveryServices } from "@novelforge/ai-services";
import { registerStoryDiscoveryRoutes } from "./story-discovery-routes.ts";
import { createCoverGenerationServices } from "@novelforge/ai-services";
import { createCoverQueue, type CoverQueue } from "./services/cover-queue.ts";
import { registerDefinitionRoutes } from "./definition-routes.ts";
import { registerRetrievalRoutes } from "./retrieval-routes.ts";
import { registerCanonRoutes } from "./canon-routes.ts";
import { registerOrchestratorRoutes } from "./orchestrator-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { registerPlanningRoutes } from "./planning-routes.ts";
import { registerCharacterRoutes } from "./character-routes.ts";
import { registerRelationshipRoutes } from "./relationship-routes.ts";
import { registerStoryRoutes } from "./story-routes.ts";
import { registerNarrativeRoutes } from "./narrative-routes.ts";
import { registerRevisionRoutes } from "./revision-routes.ts";
import { registerSimulationRoutes } from "./simulation-routes.ts";
import { registerCausalityRoutes } from "./simulation-causality-routes.ts";
import { registerDebuggerRoutes } from "./simulation-debugger-routes.ts";
import { registerWhatifRoutes } from "./whatif-routes.ts";
import { createWhatifServices } from "./services/whatif.ts";
import { registerEndgameRoutes } from "./endgame-routes.ts";
import { registerEndgameCallbackRoutes } from "./endgame-callback-routes.ts";
import { createEndgameServices } from "./services/endgame.ts";
import { createEndgameCallbackServices } from "./services/endgame-callbacks.ts";
import { createCharacterServices } from "@novelforge/ai-services";
import { createRelationshipServices } from "@novelforge/ai-services";
import { createStoryServices } from "./services/story.ts";
import { createNarrativeServices } from "@novelforge/ai-services";
import { createPlanningServices } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import { createManuscriptServices } from "./services/manuscript.ts";
import { createRevisionServices } from "./services/revisions.ts";
import { createSimulationServices } from "./services/simulation.ts";
import { createCausalityServices } from "./services/simulation-causality.ts";
import { createDebuggerServices } from "./services/simulation-debugger.ts";
import { readHeadRevisionId } from "./services/revisions.ts";
import { createAiServices } from "@novelforge/ai-services";
import { createDefinitionServices } from "./services/definitions.ts";
import { createWorkflowRunServices } from "./services/workflow-runs.ts";
import { createWorkflowQueue, type WorkflowQueue } from "./services/workflow-queue.ts";
import { createPublicationQueue, type PublicationQueue } from "./services/publication-queue.ts";
import { createNotificationQueue, type NotificationQueue } from "./services/notification-queue.ts";
import { createPublicationServices } from "./services/publication.ts";
import { createEngagementServices } from "./services/reader-engagement.ts";
import { createNotificationServices } from "./services/notifications.ts";
import { registerPublicationRoutes } from "./publication-routes.ts";
import { registerPublicReaderRoutes } from "./public-routes.ts";
import { registerReaderEngagementRoutes } from "./reader-routes.ts";
import { registerReaderNotificationRoutes } from "./reader-notification-routes.ts";
import { registerPublicDiscoveryRoutes } from "./public-discovery-routes.ts";
import { registerCommentRoutes } from "./comment-routes.ts";
import { createPublicDiscoveryServices } from "./services/public-discovery.ts";
import { createMemoryQueue, type MemoryQueue } from "./services/memory-queue.ts";
import { createMemoryServices } from "@novelforge/ai-services";
import { registerMemoryRoutes } from "./memory-routes.ts";
import { createStateAssemblyServices } from "@novelforge/ai-services";
import { createFinalTextReviewServices } from "./services/final-text-review.ts";
import { createStoryHealthServices } from "./services/story-health.ts";
import { registerStoryHealthRoutes } from "./story-health-routes.ts";
import { registerReaderProgressRoutes } from "./reader-progress-routes.ts";
import { createRetrievalServices } from "@novelforge/ai-services";
import { createCanonServices } from "@novelforge/ai-services";
import { createCanonApplicationServices } from "./services/canon-applications.ts";
import { createOrchestratorServices } from "./services/orchestrator.ts";
import { createGatewayRegistry } from "@novelforge/ai-services";

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
  /**
   * Queue seam for the workflow run route. Tests supply a fake so no test
   * needs a live BullMQ exchange; the handler/sweeper are covered in the
   * worker suite against real Redis. Production omits this and the shared
   * `workflow-runs` queue is constructed.
   */
  /**
   * Queue seam for the memory rebuild route. Tests supply a fake so no test
   * needs a live BullMQ exchange; the handler is covered in the worker
   * suite against real Redis. Production omits this and the shared
   * `memory-rebuild` queue is constructed.
   */
  memoryQueue?: MemoryQueue;
  workflowQueue?: WorkflowQueue;
  coverQueue?: CoverQueue;
  /**
   * Queue seam for the publication routes. Tests supply a fake so no test
   * needs a live BullMQ exchange; the handler is covered in the worker
   * suite against real Redis. Production omits this and the shared
   * `publication` queue is constructed.
   */
  publicationQueue?: PublicationQueue;
  /**
   * Queue seam for the notification fan-out. Tests supply a fake so no
   * test needs a live BullMQ exchange; the handler is covered in the
   * worker suite against the real DB. Production omits this and the
   * shared `notifications` queue is constructed.
   */
  notificationQueue?: NotificationQueue;
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
  // NF-WF-017A: the chapter-import file route needs multipart bodies.
  // The plugin-level fileSize cap is the route's IMPORT_BODY_LIMIT
  // (manuscript-routes); per-format caps and type sniffing stay in the
  // import service, where the 400 codes are actionable.
  await app.register(multipart, {
    limits: { fileSize: 15_000_000, files: 1, fields: 5 },
  });
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
    // Platform-role lookup, shared by the auth session response
    // (NF-WF-018B, additive) and the AI platform routes. The role comes
    // from the user row, not from a membership (constitution §6).
    const platformRoleOf = async (userId: string) => {
      const user = await options.db!.user.findUnique({
        where: { id: userId },
        select: { platformRole: true },
      });
      return user?.platformRole ?? null;
    };
    await registerAuthRoutes(app, {
      auth,
      secureCookies: env.NODE_ENV === "production",
      platformRoleOf,
      profileOf: (userId) => options.db!.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } }),
    });
    await registerBrandingRoutes(app, { auth, db: options.db });
    await registerPlatformRoutes(app, {
      auth,
      services: createPlatformServices({
        db: options.db,
        audit: createAuditService(options.db),
      }),
    });
    const manuscriptServices = createManuscriptServices(
      options.db,
      createAuditService(options.db),
      {
        // A chapter delete blocked by a canon citation is a rejected write,
        // not a server fault; the constraint name it cannot carry is logged.
        error: (message, meta) => app.log.error(meta, message),
      },
    );
    registerManuscriptRoutes(app, {
      auth,
      services: manuscriptServices,
    });
    // NF-WF-050A: SCALE evidence foundation (S1). Registered once; the
    // routes create their own service instance from the shared db.
    registerScaleEvidenceRoutes(app, { auth, db: options.db });
    // NF-WF-050B: SCALE decisions (S2). Registered once; the routes create
    // their own service instance from the shared db and audit.
    registerScaleDecisionRoutes(app, {
      auth,
      db: options.db,
      audit: createAuditService(options.db),
    });
    // NF-WF-012: the one shared `publication` queue. Schedule/reschedule
    // enqueue a delayed fire-job (jobId = publication id); cancel removes
    // it; the worker executes and reconciles. Tests may inject a fake;
    // only a queue we created is closed here.
    const ownPublicationQueue = options.publicationQueue === undefined;
    const publicationQueue =
      options.publicationQueue ?? createPublicationQueue(env.REDIS_URL);
    if (ownPublicationQueue) {
      app.addHook("onClose", async () => {
        await publicationQueue.close();
      });
    }
    // NF-WF-019C: the one shared `notifications` queue for the
    // novel.chapter_published fan-out (Invariant 7 — async, bounded,
    // the publish path never awaits fan-out). Tests may inject a fake;
    // only a queue we created is closed here.
    const ownNotificationQueue = options.notificationQueue === undefined;
    const notificationQueue =
      options.notificationQueue ?? createNotificationQueue(env.REDIS_URL);
    if (ownNotificationQueue) {
      app.addHook("onClose", async () => {
        await notificationQueue.close();
      });
    }
    // One audit + one AI services instance shared by the AI routes and the
    // workflow executor: a workflow step must reach a model through the
    // same generation path as a direct request (CLAUDE.md §18), so the
    // executor is given `aiServices.generate` rather than its own client.
    const audit = createAuditService(options.db);
    // NF-WF-012: publication release routes. Registered after `audit`
    // exists so the service can share the one audit instance.
    // NF-WF-013: the anonymous public reader routes share this instance
    // (anonymous by construction — no auth object passed to them).
    const publicationServices = createPublicationServices({
      db: options.db,
      audit,
      queue: publicationQueue,
      notificationQueue,
      manuscripts: manuscriptServices,
    });
    registerPublicationRoutes(app, { auth, services: publicationServices });
    registerPublicReaderRoutes(app, { services: publicationServices });
    // NF-WF-019C: reader notifications (inbox + preferences; identity-based,
    // no new capabilities). The immediate-publish path enqueues fan-out
    // jobs through this queue (see publication.ts).
    registerReaderNotificationRoutes(app, {
      auth,
      services: createNotificationServices({ db: options.db }),
    });
    // NF-WF-019A: authenticated reader engagement (bookmark / follow /
    // like). All routes here are authenticated by construction
    // (requireActor → 401); the anonymous surface stays on the frozen
    // /api/public/* routes.
    registerReaderEngagementRoutes(app, {
      auth,
      services: createEngagementServices({ db: options.db }),
    });
    // NF-WF-014: the anonymous public discovery routes (listing, genre
    // facets, published-only search) plus the single member genre
    // route. Anonymous routes take no auth (no 401 path); the member
    // route gets auth for its session check.
    const discoveryServices = createPublicDiscoveryServices({ db: options.db });
    registerPublicDiscoveryRoutes(app, { auth, services: discoveryServices });
    // NF-WF-019B: reader comments + moderation (`/api/reader/comments*`).
    // Writes are authenticated by construction; the comment list is
    // anonymous-readable. The staff moderation routes reuse the
    // EXISTING `novel:update` capability (no new capabilities).
    registerCommentRoutes(app, { auth, db: options.db, audit });
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
    registerAiRoutes(app, { auth, services: aiServices, platformRoleOf });
    registerCharacterDiscoveryRoutes(app, { auth, services: createCharacterDiscoveryServices({ db: options.db, ai: aiServices }) });
    registerStoryDiscoveryRoutes(app, { auth, services: createStoryDiscoveryServices({ db: options.db, ai: aiServices }) });
    const coverQueue = options.coverQueue ?? createCoverQueue(env.REDIS_URL);
    if (!options.coverQueue) app.addHook("onClose", () => coverQueue.close());
    registerCoverGenerationRoutes(app, { auth, services: createCoverGenerationServices({ db: options.db,
      manager: new GatewayManager(createGatewayRegistry(options.db, env.APP_ENCRYPTION_KEY), { ...(options.createGateway ? { createGateway: options.createGateway } : {}), defaultStrategy: env.AI_ROUTING_STRATEGY }),
      enqueue: (batchId, revision) => coverQueue.enqueue(batchId, revision) }) });

    // NF-WF-050C: optional S3 SCALE proposal assistance. Registered after
    // aiServices exists so the extraction path reuses the ONE sanctioned
    // generate seam (gateway registry, routing, NF049 attribution).
    registerScaleS3Routes(app, {
      auth,
      db: options.db,
      audit,
      ai: aiServices,
    });

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
    const canonApplicationServices = createCanonApplicationServices({
      db: options.db,
      audit,
    });
    registerCanonRoutes(app, { auth, services: canonServices, applications: canonApplicationServices });

    // AI Orchestrator (milestone): the caller names an agent + instruction and
    // the orchestrator resolves definitions, compiles context, and runs the
    // generation through the SAME aiServices path a direct request uses, so
    // gateway routing, retry, ledger, and audit stay in one place.
    //
    // NF-WF-003: the orchestrator and the workflow RETRIEVAL step share one
    // context compiler. The same service instances satisfy both callers'
    // tier-reader ports, which is what makes "one compiler, two callers"
    // checkable rather than aspirational (invariant 7).
    const planningServices = createPlanningServices({ db: options.db, audit });
    const characterServices = createCharacterServices({ db: options.db, audit });
    const relationshipServices = createRelationshipServices({ db: options.db, audit });
    const narrativeServices = createNarrativeServices({ db: options.db, audit });
    const headPort = {
      readHeadRevisionId: (novelId: string) => readHeadRevisionId(options.db!, novelId),
    };
    // NF-WF-009: the one shared `memory-rebuild` queue (moved up from the
    // route-registration block so the NF-WF-010 state assembly can share
    // the same memory-services instance). Tests may inject a fake; only
    // a queue we created is closed here.
    const ownMemoryQueue = options.memoryQueue === undefined;
    const memoryQueue = options.memoryQueue ?? createMemoryQueue(env.REDIS_URL);
    if (ownMemoryQueue) {
      app.addHook("onClose", async () => {
        await memoryQueue.close();
      });
    }
    const memoryServices = createMemoryServices({ db: options.db, queue: memoryQueue });
    // NF-WF-010: state consumers. The assembly's memory port is the
    // shared memory-services instance (optional wiring — absent, the
    // assembly proceeds on live tables alone with an explicit
    // UNCONFIGURED note).
    const stateAssemblyServices = createStateAssemblyServices({
      db: options.db,
      audit,
      memory: {
        recallNovel: (actorUserId, workspaceId, novelId, opts) =>
          memoryServices.recallNovel(actorUserId, workspaceId, novelId, opts),
      },
    });
    const finalTextReviewServices = createFinalTextReviewServices({
      db: options.db,
      audit,
    });
    const storyHealthServices = createStoryHealthServices({ db: options.db, audit });
    registerOrchestratorRoutes(app, {
      auth,
      services: createOrchestratorServices({
        db: options.db,
        ai: aiServices,
        canon: canonServices,
        retrieval: retrievalServices,
        planning: planningServices,
        characters: characterServices,
        relationships: relationshipServices,
        narrative: narrativeServices,
        head: headPort,
        // NF-WF-010: the state-assembly port — tiers 4/6 consume the
        // assembly services (per-row memory-vs-live provenance) when
        // present; the compiler falls back to the legacy fan-out when
        // absent.
        stateAssembly: {
          assembleStates: (input) =>
            stateAssemblyServices.assembleCharacterState(input),
          assembleRelationships: (input) =>
            stateAssemblyServices.assembleRelationships(input),
          assembleTimeline: (input) =>
            stateAssemblyServices.assembleTimeline(input),
        },
      }),
    });

    // Planning (Phase 7): synopses, sagas, outline nodes, outline versions,
    // horizon — pure rules from @novelforge/planning, service owns CAS + audit.
    registerPlanningRoutes(app, {
      auth,
      services: planningServices,
    });

    // Character & Relationship Intelligence (Phase 8): pure rules from
    // @novelforge/character-intelligence and @novelforge/relationship-intelligence;
    // the services own tenancy + audit, the EXCLUDE constraints own overlap.
    registerCharacterRoutes(app, {
      auth,
      services: characterServices,
    });
    registerRelationshipRoutes(app, {
      auth,
      services: relationshipServices,
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
      services: narrativeServices,
    });

    // Story versioning (M1, NF-WF-002). The C3 services already take the head
    // CAS themselves; this route module owns the operations that are a whole
    // transaction of their own: checkpoint capture, restore preview and apply.
    const revisionServices = createRevisionServices({ db: options.db, audit });
    registerRevisionRoutes(app, {
      auth,
      services: revisionServices,
    });

    // NF-WF-021A: simulation run lifecycle. Simulations run on branches
    // (020B) and never write to canon tables (Invariant 1).
    registerSimulationRoutes(app, {
      auth,
      services: createSimulationServices({ db: options.db }),
    });

    // NF-WF-021B: causal evidence and uncertainty as proposals. Causal
    // chains are explicit and queryable (Invariant 5); uncertainty is
    // surfaced as proposals, never silently resolved (Invariant 2, §5).
    registerCausalityRoutes(app, {
      auth,
      services: createCausalityServices(options.db),
    });

    // NF-WF-024A: evaluated what-if outline simulation. Narrative-level
    // what-if across outline versions (kind='WHATIF' runs); inspect-only,
    // never enters canon/memory/approval pipelines (Invariant 1).
    // NF-WF-027: revisions service for provision-mode branch creation.
    {
      const simulationServices = createSimulationServices({ db: options.db });
      registerWhatifRoutes(app, {
        auth,
        services: createWhatifServices({
          db: options.db,
          simulations: simulationServices,
          revisions: revisionServices,
        }),
      });
    }

    // NF-WF-024B: simulation debugger (breakpoints, watch, time-travel
    // replay, debug-step). The debugger never mutates history (024
    // Invariant 5 / 021 Invariant 6); replay is non-persisting; no new
    // capabilities (reuses simulation:read / simulation:manage).
    {
      const simulationServices = createSimulationServices({ db: options.db });
      registerDebuggerRoutes(app, {
        auth,
        services: createDebuggerServices({ db: options.db }),
        simulationServices,
      });
    }

    // NF-WF-022A: closure ledger + ending gate + debt report. Planning
    // only: never writes to canon tables (Invariant 3), never auto-changes
    // a ledger status (Invariant 1), no chapter-count logic (Invariant 2).
    registerEndgameRoutes(app, {
      auth,
      services: createEndgameServices({ db: options.db, audit }),
    });

    // NF-WF-022B: setup/payoff callbacks + legacy records. Callbacks are
    // explicit author-made links only (Invariant 5 — never auto-linked);
    // planning only, never writes to canon tables (Invariant 3). 022A's
    // debt report reads endgame_callbacks as a read-model.
    registerEndgameCallbackRoutes(app, {
      auth,
      services: createEndgameCallbackServices({ db: options.db }),
    });

    // NF-WF-009: revision-derived chapter/arc memory. The rebuild route
    // enqueues through the one shared `memory-rebuild` queue; the worker
    // runs the deterministic rebuild off the request thread. (The queue
    // and the shared memory-services instance are created above, before
    // the orchestrator block, so NF-WF-010's state assembly shares them.)
    registerMemoryRoutes(app, {
      auth,
      memory: memoryServices,
    });

    // NF-WF-010: story health and final-text review routes (canon:read).
    registerStoryHealthRoutes(app, {
      auth,
      health: storyHealthServices,
      review: finalTextReviewServices,
    });

    // NF-WF-019D: synced reading progress (identity-based /api/reader/*
    // routes; no new capabilities).
    registerReaderProgressRoutes(app, { auth, db: options.db! });

    // NF-WF-004: the one shared `workflow-runs` queue. The run route
    // enqueues through it; the worker executes off the request thread.
    // Tests may inject a fake; only a queue we created is closed here.
    const ownQueue = options.workflowQueue === undefined;
    const workflowQueue = options.workflowQueue ?? createWorkflowQueue(env.REDIS_URL);
    if (ownQueue) {
      app.addHook("onClose", async () => {
        await workflowQueue.close();
      });
    }

    registerDefinitionRoutes(app, {
      auth,
      definitions: createDefinitionServices({ db: options.db, audit }),
      runs: createWorkflowRunServices({
        db: options.db,
        audit,
        queue: workflowQueue,
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
