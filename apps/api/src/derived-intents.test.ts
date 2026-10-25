/**
 * ADR-0017 read-only derived intent status surface.
 *
 * Dedicated novelforge_test_derived_intents db. Covers authentication,
 * per-projection counts (including terminal-audit PENDING), head revision
 * reporting, and tenant isolation. The route never mutates intent rows.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService, createPlatformServices } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_derived_intents";
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
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: "unit-test-encryption-key",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

let db: NovelForgeDb;
let app: FastifyInstance;

beforeAll(async () => {
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
  db = createDb(TEST_URL);
  app = await buildApp(env, { db });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.derivedRebuildIntent.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(
  email: string,
): Promise<{ userId: string; cookie: string }> {
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

async function seedNovel(
  userId: string,
): Promise<{ workspaceId: string; novelId: string }> {
  const slug = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId: userId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId, role: "OWNER" },
  });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: userId,
    workspaceId: ws.id,
    title: "Derived Intent Test Novel",
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

describe("GET /api/workspaces/:workspaceId/novels/:novelId/derived-intents", () => {
  it("returns 401 without a session", async () => {
    const { userId } = await seedUser("intents-anon@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns per-projection counts and head revision", async () => {
    const { userId, cookie } = await seedUser("intents-owner@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId } });
    const head = await db.revision.findUniqueOrThrow({ where: { id: branch.headRevisionId! } });
    await db.derivedRebuildIntent.create({
      data: { workspaceId, novelId, projection: "canon", sourceRevisionId: head.id },
    });
    await db.derivedRebuildIntent.create({
      data: { workspaceId, novelId, projection: "character", sourceRevisionId: head.id },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.branchId).toBe(branch.id);
    expect(body.branchName).toBe("main");
    expect(body.headRevisionNumber).toBe(head.number);
    expect(body.projections).toHaveLength(7);
    const canon = body.projections.find(
      (p: { projection: string }) => p.projection === "canon",
    );
    expect(canon.counts.PENDING).toBe(1);
    expect(canon.counts.FRESH).toBe(0);
    expect(canon.hasPipeline).toBe(true);
    expect(canon.latestSourceRevisionNumber).toBe(head.number);
    const character = body.projections.find(
      (p: { projection: string }) => p.projection === "character",
    );
    expect(character.hasPipeline).toBe(false);
  });

  it("scopes counts to the current branch", async () => {
    const { userId, cookie } = await seedUser("intents-branches@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const main = await db.novelBranch.findFirstOrThrow({ where: { novelId, name: "main" } });
    const alt = await db.novelBranch.create({
      data: { workspaceId, novelId, name: "alt" },
    });
    const altRevision = await db.revision.create({
      data: { workspaceId, novelId, branchId: alt.id, number: 1, origin: "MANUAL" },
    });
    await db.derivedRebuildIntent.create({
      data: { workspaceId, novelId, projection: "canon", sourceRevisionId: altRevision.id },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.branchId).toBe(main.id);
    const canon = body.projections.find(
      (p: { projection: string }) => p.projection === "canon",
    );
    expect(canon.counts.PENDING).toBe(0);
    expect(canon.latestSourceRevisionNumber).toBeNull();
  });

  it("reports zero counts for projections with no intents", async () => {
    const { userId, cookie } = await seedUser("intents-empty@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    for (const projection of res.json().projections) {
      expect(projection.counts.PENDING).toBe(0);
      expect(projection.latestSourceRevisionNumber).toBeNull();
    }
  });

  it("treats a foreign workspace as 404", async () => {
    const { userId, cookie } = await seedUser("intents-intruder@example.com");
    const other = await seedUser("intents-other@example.com");
    const foreign = await seedNovel(other.userId);
    await seedNovel(userId);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${foreign.workspaceId}/novels/${foreign.novelId}/derived-intents`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
