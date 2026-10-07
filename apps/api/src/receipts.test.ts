/**
 * Receipts surface (NF-WF-018C) integration suite.
 *
 * Dedicated novelforge_test_receipts db (parallel-safe per ADR-0003 §8).
 * No test ever reaches a real provider: `buildApp` is given a GatewayManager
 * whose gateways are fakes (CLAUDE.md §25).
 *
 * Covers (contract Invariant 1 + 018C acceptance):
 * - GET /api/workspaces/:workspaceId/audit-log (the ONE additive 018C
 *   route): pinned to the AI-infrastructure action allowlist
 *   (400 INVALID_INPUT on anything else, including the platform-scoped
 *   `model-profile.mapped`); workspace membership + `workflow:manage`
 *   gate; rows scoped to the workspace with identity-only payloads
 * - GET /api/workspaces/:workspaceId/novels/:novelId/final-text-reviews
 *   (GAP-067 additive read): FinalTextReview rows with verdict,
 *   violations, and revision pin; membership + `canon:read` gate
 *   (identical to the frozen POST route)
 * - Frozen ledger routes (`GET .../generations`, `GET .../:generationId`)
 *   keep their `generation:read` gating (sanity, no behavior change)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import type {
  AIGateway,
  GatewayRecord,
  GenerateResult,
} from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_receipts";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found — see ADR-0003");
  }
}
const BASE_URL = process.env.DATABASE_URL!;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
const TEST_URL = withDb(BASE_URL, TEST_DB);

const ENCRYPTION_KEY = "unit-test-encryption-key";

const env: Env = {
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
  OMNIROUTE_API_KEY: "test-omniroute-key",
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(): Promise<GenerateResult> {
      return {
        content: "fake",
        model: `${rec.name}-model`,
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "fake" };
    },
    async embed() {
      return { vectors: [[0.1]], model: rec.name, inputTokens: 1 };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
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
  db = createDb(TEST_URL);
  app = await buildApp(env, { db, createGateway: fakeCreateGateway });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.finalTextReview.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.auditLog.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(email: string) {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
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

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  return ws.id;
}

async function seedNovel(ownerId: string, workspaceId: string, slug: string) {
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({ actorUserId: ownerId, workspaceId, title: `Novel ${slug}`, slug });
  return novel.id;
}

async function seedAudit(workspaceId: string, action: string, actorUserId: string | null) {
  return db.auditLog.create({
    data: {
      workspaceId,
      actorUserId,
      action,
      entityType: "test",
      entityId: null,
      payload: { identity: "only" },
    },
  });
}

describe("GET /api/workspaces/:workspaceId/audit-log (018C additive route)", () => {
  it("lists the workspace's AI-infrastructure audit actions with identity only", async () => {
    const owner = await seedUser("rc-owner@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws");
    await seedAudit(ws, "workflow.run", owner.userId);
    await seedAudit(ws, "agent.created", owner.userId);
    // Non-allowlisted workspace actions are excluded; platform actions
    // (null workspace) never appear on the workspace trail.
    await seedAudit(ws, "canon.fact-created", owner.userId);
    await db.auditLog.create({
      data: {
        workspaceId: null,
        actorUserId: owner.userId,
        action: "gateway.created",
        entityType: "AIGateway",
        entityId: null,
        payload: {},
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/audit-log`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ action: string; actorEmail: string; payload: unknown }>;
    expect(rows.map((r) => r.action).sort()).toEqual(["agent.created", "workflow.run"]);
    expect(rows[0]!.actorEmail).toBe("rc-owner@example.com");
    expect(rows[0]!.payload).toEqual({ identity: "only" });
    // No credential material anywhere on the rows.
    for (const row of rows) {
      expect(JSON.stringify(row).toLowerCase()).not.toContain("credential");
    }
  });

  it("filters by ?action= and rejects non-allowlisted actions with 400", async () => {
    const owner = await seedUser("rc-filter@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-filter");
    await seedAudit(ws, "workflow.run", owner.userId);
    await seedAudit(ws, "generation.failed", owner.userId);

    const ok = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/audit-log?action=workflow.run`,
      headers: { cookie: owner.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as Array<{ action: string }>).map((r) => r.action)).toEqual([
      "workflow.run",
    ]);

    // The platform-scoped `model-profile.mapped` is excluded from the
    // workspace allowlist — 400, not a silent cross-scope leak.
    for (const action of ["model-profile.mapped", "gateway.created", "bogus.action"]) {
      const bad = await app.inject({
        method: "GET",
        url: `/api/workspaces/${ws}/audit-log?action=${action}`,
        headers: { cookie: owner.cookie },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: "INVALID_INPUT" });
    }
  });

  it("scopes rows to the workspace (404 for non-members, tenant isolation)", async () => {
    const owner = await seedUser("rc-tenant@example.com");
    const other = await seedUser("rc-other@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-a");
    const wsB = await seedWorkspace(other.userId, "rc-ws-b");
    await seedAudit(ws, "workflow.run", owner.userId);
    await seedAudit(wsB, "workflow.run", other.userId);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/audit-log`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<unknown>).length).toBe(1);

    const outsider = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/audit-log`,
      headers: { cookie: other.cookie },
    });
    expect(outsider.statusCode).toBe(404);
  });

  it("requires workflow:manage — an AUTHOR gets 403", async () => {
    const owner = await seedUser("rc-gate-owner@example.com");
    const author = await seedUser("rc-gate-author@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-gate");
    await db.membership.create({
      data: { workspaceId: ws, userId: author.userId, role: "AUTHOR" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/audit-log`,
      headers: { cookie: author.cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /api/workspaces/:workspaceId/novels/:novelId/final-text-reviews (GAP-067)", () => {
  async function seedReceipt(novelId: string, workspaceId: string, actorId: string) {
    const chapter = await db.chapter.create({
      data: {
        novelId,
        number: 1,
        title: "Chapter One",
        createdById: actorId,
      },
    });
    const version = await db.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        number: 1,
        content: "<p>Once upon a time.</p>",
        wordCount: 4,
        authorId: actorId,
      },
    });
    const branch = await db.novelBranch.findFirstOrThrow({
      where: { novelId, name: "main" },
      select: { headRevisionId: true },
    });
    return db.finalTextReview.create({
      data: {
        workspaceId,
        novelId,
        chapterVersionId: version.id,
        revisionId: branch.headRevisionId!,
        verdict: "PASS",
        hardViolations: [],
        advisory: [{ kind: "STYLE", note: "steady" }],
        evaluatedPolicies: { CONTINUITY: { hardness: "HARD", configured: true } },
      },
    });
  }

  it("returns the durable evaluation receipts with verdict, violations, and revision pin", async () => {
    const owner = await seedUser("rc-eval@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-eval");
    const novelId = await seedNovel(owner.userId, ws, "rc-novel-eval");
    const receipt = await seedReceipt(novelId, ws, owner.userId);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/novels/${novelId}/final-text-reviews`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{
      id: string;
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      chapterVersionId: string;
      verdict: string;
      hardViolations: unknown;
      advisory: unknown;
      evaluatedPolicies: unknown;
      revisionId: string;
    }>;
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.id).toBe(receipt.id);
    expect(row.chapterNumber).toBe(1);
    expect(row.chapterTitle).toBe("Chapter One");
    expect(row.verdict).toBe("PASS");
    expect(row.hardViolations).toEqual([]);
    expect(row.revisionId).toBe(receipt.revisionId);
  });

  it("gates like the frozen POST route: membership + canon:read", async () => {
    const owner = await seedUser("rc-eval-gate@example.com");
    const viewer = await seedUser("rc-eval-viewer@example.com");
    const outsider = await seedUser("rc-eval-outsider@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-eval-gate");
    await db.membership.create({
      data: { workspaceId: ws, userId: viewer.userId, role: "VIEWER" },
    });
    const novelId = await seedNovel(owner.userId, ws, "rc-novel-eval-gate");

    // VIEWER holds no canon:read → 403.
    const forbidden = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/novels/${novelId}/final-text-reviews`,
      headers: { cookie: viewer.cookie },
    });
    expect(forbidden.statusCode).toBe(403);

    // Non-member → 404 (tenant gate).
    const missing = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/novels/${novelId}/final-text-reviews`,
      headers: { cookie: outsider.cookie },
    });
    expect(missing.statusCode).toBe(404);

    // Novel from another workspace → 404.
    const other = await seedUser("rc-eval-other@example.com");
    const wsB = await seedWorkspace(other.userId, "rc-ws-eval-b");
    const novelB = await seedNovel(other.userId, wsB, "rc-novel-eval-b");
    const cross = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/novels/${novelB}/final-text-reviews`,
      headers: { cookie: owner.cookie },
    });
    expect(cross.statusCode).toBe(404);
  });
});

describe("frozen ledger routes keep their generation:read gating (no behavior change)", () => {
  it("404s for non-members and 200s for an AUTHOR", async () => {
    const owner = await seedUser("rc-ledger@example.com");
    const author = await seedUser("rc-ledger-author@example.com");
    const outsider = await seedUser("rc-ledger-outsider@example.com");
    const ws = await seedWorkspace(owner.userId, "rc-ws-ledger");
    await db.membership.create({
      data: { workspaceId: ws, userId: author.userId, role: "AUTHOR" },
    });

    const missing = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/generations`,
      headers: { cookie: outsider.cookie },
    });
    expect(missing.statusCode).toBe(404);

    const ok = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/generations`,
      headers: { cookie: author.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual([]);

    // A VIEWER holds no generation:read → 403.
    const viewer = await seedUser("rc-ledger-viewer@example.com");
    await db.membership.create({
      data: { workspaceId: ws, userId: viewer.userId, role: "VIEWER" },
    });
    const forbidden = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ws}/generations`,
      headers: { cookie: viewer.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
