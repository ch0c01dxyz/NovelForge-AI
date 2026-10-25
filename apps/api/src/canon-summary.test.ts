/**
 * ADR-0022 canon summary read/rebuild routes.
 *
 * Dedicated novelforge_test_canon_api db. Covers authentication, MISSING →
 * rebuild → FRESH, intent-derived STALE, the operator recovery rebuild,
 * tenant isolation, and capability enforcement.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createAuditService, createPlatformServices } from "@novelforge/ai-services";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_canon_api";
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
  await db.canonSummary.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.auditLog.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(email: string): Promise<{ userId: string; cookie: string }> {
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
  memberRole: "OWNER" | "VIEWER" = "OWNER",
): Promise<{ workspaceId: string; novelId: string }> {
  const slug = `canon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role: "OWNER" } });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: userId,
    workspaceId: ws.id,
    title: "Canon Summary API Novel",
    slug,
  });
  if (memberRole !== "OWNER") {
    await db.membership.update({
      where: { workspaceId_userId: { workspaceId: ws.id, userId } },
      data: { role: memberRole },
    });
  }
  return { workspaceId: ws.id, novelId: novel.id };
}

const BEFORE = () => new Date(Date.now() - 60_000);

async function seedCanon(workspaceId: string, novelId: string, userId: string) {
  const character = await db.storyEntity.create({
    data: {
      novelId,
      kind: "CHARACTER",
      key: `aria-${Math.random().toString(36).slice(2, 8)}`,
      name: "Aria",
      createdById: userId,
      createdAt: BEFORE(),
    },
  });
  const location = await db.storyEntity.create({
    data: {
      novelId,
      kind: "LOCATION",
      key: `vale-${Math.random().toString(36).slice(2, 8)}`,
      name: "Vale",
      createdById: userId,
      createdAt: BEFORE(),
    },
  });
  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: character.id,
      predicate: "has child",
      objectText: "a child",
      statement: "Aria has a child",
      status: "ACTIVE",
      createdById: userId,
      createdAt: BEFORE(),
    },
  });
  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: location.id,
      predicate: "lies near",
      objectText: "the sea",
      statement: "Vale lies near the sea",
      status: "RETRACTED",
      createdById: userId,
      createdAt: BEFORE(),
    },
  });
}

describe("canon summary routes", () => {
  it("returns 401 without a session", async () => {
    const { userId } = await seedUser("canon-anon@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const base = `/api/workspaces/${workspaceId}/novels/${novelId}/canon/summary`;
    expect((await app.inject({ method: "GET", url: base })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `${base}/rebuild` })).statusCode).toBe(401);
  });

  it("reports MISSING before a rebuild, then FRESH after one", async () => {
    const { userId, cookie } = await seedUser("canon-owner@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    await seedCanon(workspaceId, novelId, userId);
    const head = await db.novelBranch.findFirstOrThrow({
      where: { novelId },
      select: { headRevision: { select: { number: true } } },
    });
    const base = `/api/workspaces/${workspaceId}/novels/${novelId}/canon/summary`;

    const before = await app.inject({ method: "GET", url: base, headers: { cookie } });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      freshness: "MISSING",
      summary: null,
      headRevisionNumber: head.headRevision?.number,
      pendingAfterSummary: 0,
    });

    const rebuilt = await app.inject({
      method: "POST",
      url: `${base}/rebuild`,
      headers: { cookie },
    });
    expect(rebuilt.statusCode).toBe(200);
    expect(rebuilt.json()).toEqual({
      rebuilt: true,
      sourceRevisionNumber: head.headRevision?.number,
    });

    const after = await app.inject({ method: "GET", url: base, headers: { cookie } });
    expect(after.statusCode).toBe(200);
    const body = after.json();
    expect(body.freshness).toBe("FRESH");
    expect(body.pendingAfterSummary).toBe(0);
    expect(body.lastError).toBeNull();
    expect(body.summary).toMatchObject({
      sourceRevisionNumber: head.headRevision?.number,
      entityCount: 2,
      activeFactCount: 1,
      supersededFactCount: 0,
      retractedFactCount: 1,
    });
    expect(body.summary.digest.entitiesByKind).toEqual({ CHARACTER: 1, LOCATION: 1 });
  });

  it("derives STALE from a newer canon intent and recovers at head", async () => {
    const { userId, cookie } = await seedUser("canon-stale@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    await seedCanon(workspaceId, novelId, userId);
    const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId } });
    const base = `/api/workspaces/${workspaceId}/novels/${novelId}/canon/summary`;

    await app.inject({ method: "POST", url: `${base}/rebuild`, headers: { cookie } });
    const summary = await db.canonSummary.findFirstOrThrow({ where: { novelId } });

    const rev2 = await db.revision.create({
      data: {
        workspaceId,
        novelId,
        branchId: branch.id,
        parentRevisionId: branch.headRevisionId,
        number: (summary.sourceRevisionNumber ?? 0) + 1,
        origin: "MANUAL",
      },
    });
    await db.novelBranch.update({
      where: { id: branch.id },
      data: { headRevisionId: rev2.id },
    });
    const intent = await db.derivedRebuildIntent.create({
      data: {
        workspaceId,
        novelId,
        projection: "canon",
        sourceRevisionId: rev2.id,
      },
    });

    const stale = await app.inject({ method: "GET", url: base, headers: { cookie } });
    expect(stale.statusCode).toBe(200);
    expect(stale.json()).toMatchObject({
      freshness: "STALE",
      pendingAfterSummary: 1,
      lastError: null,
    });

    const rebuilt = await app.inject({
      method: "POST",
      url: `${base}/rebuild`,
      headers: { cookie },
    });
    expect(rebuilt.statusCode).toBe(200);
    expect(rebuilt.json().sourceRevisionNumber).toBe(rev2.number);

    const fresh = await app.inject({ method: "GET", url: base, headers: { cookie } });
    expect(fresh.json()).toMatchObject({
      freshness: "FRESH",
      pendingAfterSummary: 0,
    });
    expect(fresh.json().summary.sourceRevisionNumber).toBe(rev2.number);

    // The operator rebuild writes derived state only; the consumer owns
    // intent transitions, so the PENDING row stays PENDING.
    const intentAfter = await db.derivedRebuildIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(intentAfter.status).toBe("PENDING");
    expect(intentAfter.attempts).toBe(0);
  });

  it("treats a foreign workspace as 404", async () => {
    const { userId, cookie } = await seedUser("canon-intruder@example.com");
    const other = await seedUser("canon-other@example.com");
    const foreign = await seedNovel(other.userId);
    await seedNovel(userId);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${foreign.workspaceId}/novels/${foreign.novelId}/canon/summary`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("forbids a viewer from rebuilding", async () => {
    const { userId, cookie } = await seedUser("canon-viewer@example.com");
    const { workspaceId, novelId } = await seedNovel(userId, "VIEWER");
    const base = `/api/workspaces/${workspaceId}/novels/${novelId}/canon/summary`;

    expect((await app.inject({ method: "GET", url: base, headers: { cookie } })).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ method: "POST", url: `${base}/rebuild`, headers: { cookie } }))
        .statusCode,
    ).toBe(403);
  });
});
