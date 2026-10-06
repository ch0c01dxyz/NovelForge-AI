/**
 * Shared E2E bootstrap for NF-WF-011 (`apps/api/src/e2e/`).
 *
 * Owns the `novelforge_test_e2e` database lifecycle (drop/create/migrate,
 * exactly once per runner process), builds the real app (`buildApp`) plus
 * the real service stack (`createTestDriver`, fake gateway adapter per
 * GAP-028), and seeds the platform prerequisites every E2E file needs:
 * a SUPER_ADMIN, one AI gateway with every template profile mapped, and
 * the `chapter-generation-review` platform template seeded through the
 * public API (`scripts/seed-chapter-template.ts`).
 *
 * The fake gateway is the ONE allowed stand-in (contract Invariant 1):
 * every domain service — compiler, review, health, revisions, canon,
 * memory — runs for real. The gateway answers AGENT steps with
 * deterministic, schema-valid JSON keyed off the agent instructions
 * (the same detection the `chapter-template.test.ts` fake uses).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import type { Env } from "@novelforge/config";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE } from "../auth-routes.ts";
import { createAuditService } from "../services/audit.ts";
import { createPlatformServices } from "../services/platform.ts";
import { createTestDriver, type TestDriver } from "../workflow-test-driver.ts";
import {
  ensureChapterTemplate,
  type SeedHttp,
} from "../../../../scripts/seed-chapter-template.ts";
import {
  fetchAndCompileContext,
  type CompiledContext,
  type CompilerInput,
  type CompilerPorts,
} from "../services/context-compiler.ts";
import { createCanonServices } from "../services/canon.ts";
import { createPlanningServices } from "../services/planning.ts";
import { createCharacterServices } from "../services/characters.ts";
import { createRelationshipServices } from "../services/relationships.ts";
import { createNarrativeServices } from "../services/narrative.ts";
import { createRetrievalServices } from "../services/retrieval.ts";
import { createStateAssemblyServices } from "../services/state-assembly.ts";
import { createMemoryServices } from "../services/memory.ts";
import { readHeadRevisionId } from "../services/revisions.ts";
import { createAiServices } from "../services/ai.ts";
import { createGatewayRegistry } from "../ai-registry.ts";

export const TEST_DB = "novelforge_test_e2e";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found — see ADR-0003");
  }
}
const BASE_URL = process.env.DATABASE_URL!;
const ENCRYPTION_KEY = "unit-test-encryption-key";

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
export const TEST_URL = withDb(BASE_URL, TEST_DB);

export const env: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: TEST_URL,
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "novelforge",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

// ---------------------------------------------------------------------------
// The fake gateway (GAP-028 seam). Deterministic canned JSON per AGENT step,
// keyed off the agent instructions in the system message — the same
// detection `chapter-template.test.ts` uses. Every payload is schema-valid
// for its step contract, so the pipeline reaches the HUMAN_APPROVAL park
// without review loops (needsCorrection: false everywhere).
// ---------------------------------------------------------------------------

const PROSE_CHUNK =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";

function e2ePlanJson() {
  return {
    purpose: "E2E loop: introduce the chapter's central turn",
    cast: ["E2E Hero"],
    objectives: ["establish the stakes"],
    conflict: "duty vs curiosity",
    stakes: "the expedition",
    permittedRevelations: ["the map fragment"],
    outlineRef: "e2e-outline",
    sourcePins: { workflowVersion: 1, outlineVersion: "e2e-outline-v1" },
  };
}

function e2eDraftJson(tag: string) {
  // The extract step's citations reference "paragraph 1" and "paragraph 2"
  // verbatim (locateQuote is an indexOf); the prose must contain them or
  // every proposal classifies UNSUPPORTED and canon approval 409s.
  return {
    prose: `${tag} paragraph 1. ${PROSE_CHUNK.repeat(4)}paragraph 2. ${PROSE_CHUNK.repeat(4)}`,
    title: `E2E Chapter ${tag}`,
  };
}

function e2eFindingsJson() {
  return { findings: [], needsCorrection: false };
}

function e2eExtractionJson() {
  return {
    proposals: [
      {
        kind: "fact",
        text: "E2E Hero found the map fragment in the hollow oak",
        // Source must be a bound input of the template's extract step
        // (draft_write/draft_rewrite_1/draft_rewrite_2); "draft" is not bound.
        citations: [{ source: "draft_write", span: "paragraph 1" }],
      },
      {
        kind: "fact",
        text: "E2E Hero resolved to follow the river north at dawn",
        citations: [{ source: "draft_write", span: "paragraph 2" }],
      },
    ],
  };
}

export function e2eCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(req) {
      const system =
        typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      const user =
        typeof req.messages[1]?.content === "string" ? req.messages[1].content : "";
      let payload: unknown;
      if (system.includes("scene planner")) payload = e2ePlanJson();
      else if (user.includes("revising a draft")) payload = e2eDraftJson("REWRITE");
      else if (system.includes("chapter writer")) payload = e2eDraftJson("WRITE");
      else if (system.includes("voice and style reviewer")) payload = e2eFindingsJson();
      else if (system.includes("final reviewer")) payload = e2eFindingsJson();
      else if (system.includes("structured extractor")) payload = e2eExtractionJson();
      else payload = {};
      return {
        content: JSON.stringify(payload),
        model: "fake-writer",
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed(req) {
      // 1536-dim vectors: the width the pgvector column stores and the
      // count embedChunks requires.
      return {
        vectors: req.input.map(() => new Array<number>(1536).fill(0.1)),
        model: "fake-writer",
        inputTokens: req.input.length,
      };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

const fakeQueue = {
  add: async () => ({ id: "e2e-fake" }),
  getJob: async () => undefined,
  close: async () => {},
};

// ---------------------------------------------------------------------------
// Bootstrap (once per runner process)
// ---------------------------------------------------------------------------

export interface E2EContext {
  db: NovelForgeDb;
  app: FastifyInstance;
  driver: TestDriver;
  /** SUPER_ADMIN session for platform-scope seeding. */
  admin: { userId: string; cookie: string };
  /** The seeded chapter-generation-review PLATFORM workflow id. */
  templateWorkflowId: string;
  /** Compile through the REAL compiler with the REAL service wiring. */
  compileFull: (input: CompilerInput) => Promise<CompiledContext>;
  /**
   * Same as compileFull but every service reads through `mdb` (e.g. the
   * test-only query-counting client from `bindMeasureDb`) instead of the
   * harness's base client. Domain logic is identical; only the transport
   * differs — so measured query counts are the compiler's real counts.
   */
  compileFullWithDb: (mdb: NovelForgeDb, input: CompilerInput) => Promise<CompiledContext>;
}

let ctx: E2EContext | null = null;

// ---------------------------------------------------------------------------
// GAP-076: cross-process setup lock.
//
// `getE2E()` performs a destructive database reset (terminate backends,
// DROP/CREATE, migrate). Vitest isolates each test file's module registry,
// so the `ctx` fast-path above does not prevent two files' setups from
// overlapping when workers interleave: the second file's terminate can
// kill the first file's in-flight fixture build (PostgreSQL 57P01,
// "terminating connection due to administrator command").
//
// The lock serializes the ENTIRE lifecycle — from the start of the
// destructive setup until `closeE2E()` — across all files, workers,
// threads, and OS processes. It is an atomic exclusive-create (`wx`)
// on a lockfile in the OS temp dir, so it works regardless of how
// vitest schedules files.
//
// Correctness argument: `pg_terminate_backend` executes only inside
// `getE2E()` while the lock is held; the lock is released only in
// `closeE2E()` (after the file's tests complete) or on setup failure;
// therefore no terminate can land during another file's DB usage.
// Stale locks (crashed holder) are stolen via PID-liveness + age checks.
// Test-harness code only — no product changes (contract Invariant 1).
// ---------------------------------------------------------------------------

const E2E_LOCK_PATH = path.join(os.tmpdir(), `novelforge-e2e-${TEST_DB}.lock`);
/** Well above the longest fixture build (~600 s) plus a file's test time. */
const E2E_LOCK_STALE_MS = 45 * 60 * 1000;
const E2E_LOCK_POLL_MS = 500;

let e2eLockHeld = false;

function e2eLockPayload(): string {
  return JSON.stringify({ pid: process.pid, startedAt: Date.now() });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = no such process (dead). EPERM = exists but no permission (alive).
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Attempt to steal a stale lock. Returns true if the caller should retry the exclusive create. */
function tryStealStaleLock(): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(E2E_LOCK_PATH, "utf8");
  } catch {
    return true; // vanished — retry the exclusive create
  }
  try {
    const { pid, startedAt } = JSON.parse(raw) as { pid?: number; startedAt?: number };
    const age = Date.now() - (startedAt ?? 0);
    if (pid != null && isPidAlive(pid) && age <= E2E_LOCK_STALE_MS) return false;
  } catch {
    // Unparseable payload — treat as stale.
  }
  try {
    fs.unlinkSync(E2E_LOCK_PATH);
  } catch {
    // Lost the race with another stealer — retry anyway.
  }
  return true;
}

async function acquireE2eLock(): Promise<void> {
  for (;;) {
    try {
      fs.writeFileSync(E2E_LOCK_PATH, e2eLockPayload(), { flag: "wx" });
      e2eLockHeld = true;
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (!tryStealStaleLock()) {
        await new Promise((r) => setTimeout(r, E2E_LOCK_POLL_MS));
      }
    }
  }
}

function releaseE2eLock(): void {
  if (!e2eLockHeld) return;
  e2eLockHeld = false;
  try {
    fs.unlinkSync(E2E_LOCK_PATH);
  } catch {
    // Already gone (stolen as stale, or never created) — not an error.
  }
}

async function seedUser(
  db: NovelForgeDb,
  email: string,
  platformRole: "SUPER_ADMIN" | null = null,
): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: {
      email,
      passwordHash: "x",
      displayName: email,
      platformRole: platformRole ?? undefined,
    },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

export async function seedWorkspace(
  db: NovelForgeDb,
  ownerId: string,
  slug: string,
): Promise<{ workspaceId: string; novelId: string }> {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  // Through the production path: createNovel is where the baseline
  // branch/revision lives, so a raw insert would seed a novel the
  // product cannot produce (no head) and every covered mutation would 409.
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

function seedHttp(app: FastifyInstance, cookie: string): SeedHttp {
  return async (method, url, opts) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      payload: opts?.body as Record<string, unknown> | undefined,
    });
    let body: unknown = null;
    try {
      body = res.json();
    } catch {
      body = null;
    }
    return { status: res.statusCode, body };
  };
}

async function seedModelRoutes(app: FastifyInstance, cookie: string): Promise<void> {
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie },
    payload: { name: "e2e-gw", baseUrl: "http://localhost:20128", apiKey: "x" },
  });
  if (gw.statusCode !== 201) throw new Error(`gateway register failed: ${gw.body}`);
  const gatewayId = (gw.json() as { id: string }).id;
  const synced = await app.inject({
    method: "POST",
    url: `/api/gateways/${gatewayId}/sync-models`,
    headers: { cookie },
  });
  if (synced.statusCode !== 200) throw new Error(`sync-models failed: ${synced.body}`);
  const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
  const model = (models.json() as Array<{ id: string; modelId: string }>).find(
    (m) => m.modelId === "fake-writer",
  );
  if (!model) throw new Error("fake-writer model missing after sync");
  for (const profile of [
    "CREATIVE_WRITER",
    "DEEP_PLANNER",
    "CONTINUITY_REVIEWER",
    "LONG_CONTEXT_REVIEWER",
    "STRUCTURED_EXTRACTOR",
    "FAST_CLASSIFIER",
    "EMBEDDING",
  ]) {
    const put = await app.inject({
      method: "PUT",
      url: "/api/model-profiles",
      headers: { cookie },
      payload: { profile, modelId: model.id },
    });
    if (put.statusCode !== 200) throw new Error(`profile ${profile} mapping failed: ${put.body}`);
  }
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

/**
 * GAP-076: acquire the cross-process setup lock before the destructive
 * reset; the lock is held until `closeE2E()` (or released on setup
 * failure), so no second file's terminate can kill an in-flight build.
 */
export async function getE2E(): Promise<E2EContext> {
  if (ctx) return ctx;
  await acquireE2eLock();
  try {
    return await getE2EInner();
  } catch (e) {
    releaseE2eLock();
    throw e;
  }
}

async function getE2EInner(): Promise<E2EContext> {
  if (ctx) return ctx;

  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });

  const db = createDb(TEST_URL);
  const app = await buildApp(env, {
    db,
    createGateway: e2eCreateGateway,
    workflowQueue: fakeQueue,
    memoryQueue: fakeQueue,
  });
  const driver = createTestDriver(db, {
    encryptionKey: ENCRYPTION_KEY,
    createGateway: e2eCreateGateway,
  });

  const adminUser = await seedUser(db, "e2e-admin@example.com", "SUPER_ADMIN");
  const adminWs = await db.workspace.create({
    data: { name: "e2e-admin-ws", slug: "e2e-admin-ws", ownerId: adminUser.userId },
  });
  await db.membership.create({
    data: { workspaceId: adminWs.id, userId: adminUser.userId, role: "OWNER" },
  });
  await seedModelRoutes(app, adminUser.cookie);
  const template = await ensureChapterTemplate(seedHttp(app, adminUser.cookie), {
    cookie: adminUser.cookie,
    workspaceId: adminWs.id,
  });
  if (!template.workflowId) throw new Error("chapter-generation-review template seeding failed");

  // Full compiler wiring — the same real services createTestDriver uses,
  // but returning the complete CompiledContext (blocks + text + freshness
  // provenance) the driver's reduced port shape drops. Factored so the
  // measurement harness can swap in the query-counting client (the
  // services are pure over the db handle; domain logic is unchanged).
  const buildCompiler = (cdb: NovelForgeDb): CompilerPorts => {
    const caudit = createAuditService(cdb);
    const caiServices = createAiServices({
      db: cdb,
      registry: createGatewayRegistry(cdb, ENCRYPTION_KEY),
      encryptionKey: ENCRYPTION_KEY,
      audit: caudit,
      createGateway: e2eCreateGateway,
    });
    const cretrieval = createRetrievalServices({ db: cdb, audit: caudit, ai: caiServices });
    const ccanon = createCanonServices({ db: cdb, audit: caudit, retrieval: cretrieval });
    const cplanning = createPlanningServices({ db: cdb, audit: caudit });
    const ccharacters = createCharacterServices({ db: cdb, audit: caudit });
    const crelationships = createRelationshipServices({ db: cdb, audit: caudit });
    const cnarrative = createNarrativeServices({ db: cdb, audit: caudit });
    const cmemoryServices = createMemoryServices({ db: cdb, queue: fakeQueue as never });
    const cstateAssembly = createStateAssemblyServices({
      db: cdb,
      audit: caudit,
      memory: {
        recallNovel: (actorUserId, workspaceId, novelId, opts) =>
          cmemoryServices.recallNovel(actorUserId, workspaceId, novelId, opts),
      },
    });
    return {
      canon: ccanon,
      planning: cplanning,
      characters: ccharacters,
      relationships: crelationships,
      narrative: cnarrative,
      retrieval: cretrieval,
      head: { readHeadRevisionId: (novelId: string) => readHeadRevisionId(cdb, novelId) },
      memory: {
        recallNovel: (args: {
          actorUserId: string;
          workspaceId: string;
          novelId: string;
          chapter: number;
        }) =>
          cmemoryServices.recallNovel(args.actorUserId, args.workspaceId, args.novelId, {
            chapter: args.chapter,
          }),
      },
      stateAssembly: {
        assembleStates: (i) => cstateAssembly.assembleCharacterState(i),
        assembleRelationships: (i) => cstateAssembly.assembleRelationships(i),
        assembleTimeline: (i) => cstateAssembly.assembleTimeline(i),
      },
    };
  };
  const compileFull: E2EContext["compileFull"] = (input) =>
    fetchAndCompileContext(buildCompiler(db), input);
  const compileFullWithDb: E2EContext["compileFullWithDb"] = (mdb, input) =>
    fetchAndCompileContext(buildCompiler(mdb), input);

  ctx = {
    db,
    app,
    driver,
    admin: adminUser,
    templateWorkflowId: template.workflowId,
    compileFull,
    compileFullWithDb,
  };
  return ctx;
}

/** Close the app + db at the end of a file's run (idempotent). Releases the GAP-076 setup lock. */
export async function closeE2E(): Promise<void> {
  if (!ctx) {
    releaseE2eLock();
    return;
  }
  const c = ctx;
  ctx = null;
  try {
    await c.app.close().catch(() => {});
    await c.db.$disconnect().catch(() => {});
  } finally {
    releaseE2eLock();
  }
}

/** Poll a condition with a bounded timeout — never sleep(N) (Invariant 10). */
export async function pollUntil(
  label: string,
  fn: () => Promise<boolean>,
  timeoutMs = 30_000,
  intervalMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return;
    if (Date.now() >= deadline) throw new Error(`pollUntil timed out: ${label}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
