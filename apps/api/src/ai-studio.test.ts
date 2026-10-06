/**
 * NF-WF-018A API tests: the AI Studio's server-side surface.
 *
 * Dedicated scratch DB (`novelforge_test_aistudio`); no gateway or worker
 * is involved. Runs are seeded directly because the `?status=` filter
 * under test is a pure read concern — driving the executor would test
 * 004, not 018A.
 *
 * - `GET /api/workspaces/:workspaceId/workflow-runs?status=`: filters by
 *   RunStatus, rejects invalid values with 400, leaves the gate unchanged.
 * - Capability gating: VIEWER gets 403 on the run list, AUTHOR gets 200,
 *   a non-member gets 404.
 * - `GET /api/{agents,skills,workflows}/:id/versions` (the GAP-064
 *   additive routes): ascending history, 404 for unknown ids and for
 *   PLATFORM-scoped DRAFTs, cross-tenant 404.
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

const TEST_DB = "novelforge_test_aistudio";
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
  app = await buildApp(env, { db });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
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

async function seedWorkspace(
  ownerId: string,
  slug: string,
  members: Array<{ userId: string; role: "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER" }> = [],
): Promise<string> {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" } });
  for (const m of members) {
    await db.membership.create({
      data: { workspaceId: ws.id, userId: m.userId, role: m.role as never },
    });
  }
  return ws.id;
}

/** Create + publish an agent through the frozen routes. */
async function makeAgent(cookie: string, workspaceId: string, key: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers: { cookie },
    payload: {
      scope: "WORKSPACE",
      workspaceId,
      key,
      name: key,
      instructions: `You are ${key}.`,
      modelProfile: "CREATIVE_WRITER",
    },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const pub = await app.inject({
    method: "POST",
    url: `/api/agents/${id}/publish`,
    headers: { cookie },
  });
  expect(pub.statusCode).toBe(200);
  return id;
}

/** Create + publish a workflow through the frozen routes. */
async function makeWorkflow(cookie: string, workspaceId: string, key: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { cookie },
    payload: {
      scope: "WORKSPACE",
      workspaceId,
      key,
      name: key,
      graph: {
        steps: [{ key: "go", kind: "AGENT", ref: "writer", instruction: "go" }],
        edges: [],
      },
      maxSteps: 5,
    },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const pub = await app.inject({
    method: "POST",
    url: `/api/workflows/${id}/publish`,
    headers: { cookie },
  });
  expect(pub.statusCode).toBe(200);
  return id;
}

/** Seed a run row directly (the filter under test is a pure read concern). */
async function seedRun(
  workflowId: string,
  workflowVersionId: string,
  workflowVersionNumber: number,
  workspaceId: string,
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL" | "CANCELLED",
): Promise<string> {
  const run = await db.workflowRun.create({
    data: {
      workflowId,
      workflowVersionId,
      workflowVersionNumber,
      workspaceId,
      status: status as never,
      stepCount: 1,
    },
  });
  return run.id;
}

async function seedAll() {
  const owner = await seedUser("owner@example.com");
  const author = await seedUser("author@example.com");
  const viewer = await seedUser("viewer@example.com");
  const outsider = await seedUser("outsider@example.com");
  const workspaceId = await seedWorkspace(owner.userId, "ws-studio", [
    { userId: author.userId, role: "AUTHOR" },
    { userId: viewer.userId, role: "VIEWER" },
  ]);
  const workflowId = await makeWorkflow(owner.cookie, workspaceId, "chapter-draft");
  const wf = await db.workflow.findFirstOrThrow({
    where: { id: workflowId },
    select: { currentVersionId: true },
  });
  return { owner, author, viewer, outsider, workspaceId, workflowId, wf };
}

describe("NF-WF-018A — run list ?status= filter", () => {
  it("filters by status, rejects invalid values, keeps the gate", async () => {
    const { owner, workspaceId, workflowId, wf } = await seedAll();
    const parked = await seedRun(workflowId, wf.currentVersionId!, 1, workspaceId, "AWAITING_APPROVAL");
    await seedRun(workflowId, wf.currentVersionId!, 1, workspaceId, "PENDING");
    await seedRun(workflowId, wf.currentVersionId!, 1, workspaceId, "SUCCEEDED");

    const base = `/api/workspaces/${workspaceId}/workflow-runs`;
    const all = await app.inject({ method: "GET", url: base, headers: { cookie: owner.cookie } });
    expect(all.statusCode).toBe(200);
    expect(all.json() as unknown[]).toHaveLength(3);

    const filtered = await app.inject({
      method: "GET",
      url: `${base}?status=AWAITING_APPROVAL`,
      headers: { cookie: owner.cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const runs = filtered.json() as Array<{ id: string; status: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe(parked);
    expect(runs[0]!.status).toBe("AWAITING_APPROVAL");

    const bad = await app.inject({
      method: "GET",
      url: `${base}?status=NOT_A_STATUS`,
      headers: { cookie: owner.cookie },
    });
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("VIEWER gets 403, AUTHOR gets 200, non-member gets 404", async () => {
    const { author, viewer, outsider, workspaceId } = await seedAll();
    const base = `/api/workspaces/${workspaceId}/workflow-runs`;

    const asViewer = await app.inject({
      method: "GET",
      url: base,
      headers: { cookie: viewer.cookie },
    });
    expect(asViewer.statusCode).toBe(403);

    const asAuthor = await app.inject({
      method: "GET",
      url: base,
      headers: { cookie: author.cookie },
    });
    expect(asAuthor.statusCode).toBe(200);

    const asOutsider = await app.inject({
      method: "GET",
      url: base,
      headers: { cookie: outsider.cookie },
    });
    expect(asOutsider.statusCode).toBe(404);
  });
});

describe("NF-WF-018A — definition version history (GAP-064)", () => {
  it("lists agent versions ascending after a new version", async () => {
    const { owner, workspaceId } = await seedAll();
    const agentId = await makeAgent(owner.cookie, workspaceId, "writer");

    const v2 = await app.inject({
      method: "POST",
      url: `/api/agents/${agentId}/versions`,
      headers: { cookie: owner.cookie },
      payload: { instructions: "You are writer, revised.", modelProfile: "DEEP_PLANNER" },
    });
    expect(v2.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}/versions`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ number: number; createdBy: string }>;
    expect(body.map((v) => v.number)).toEqual([1, 2]);
    expect(body[1]!.createdBy).toBe("owner@example.com");
  });

  it("lists workflow versions ascending", async () => {
    const { owner, workflowId } = await seedAll();
    const v2 = await app.inject({
      method: "POST",
      url: `/api/workflows/${workflowId}/versions`,
      headers: { cookie: owner.cookie },
      payload: {
        graph: {
          steps: [
            { key: "go", kind: "AGENT", ref: "writer", instruction: "go" },
            { key: "polish", kind: "AGENT", ref: "writer", instruction: "polish" },
          ],
          edges: [],
        },
        maxSteps: 5,
      },
    });
    expect(v2.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/workflows/${workflowId}/versions`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ number: number }>;
    expect(body.map((v) => v.number)).toEqual([1, 2]);
  });

  it("returns 404 for unknown ids and for PLATFORM-scoped DRAFTs", async () => {
    const { owner } = await seedAll();
    const missing = "00000000-0000-0000-0000-000000000000";
    for (const route of [
      `/api/agents/${missing}/versions`,
      `/api/skills/${missing}/versions`,
      `/api/workflows/${missing}/versions`,
    ]) {
      const res = await app.inject({ method: "GET", url: route, headers: { cookie: owner.cookie } });
      expect(res.statusCode).toBe(404);
    }

    // A PLATFORM-scoped DRAFT is not visible through the versions list —
    // the same rule as the frozen detail route. PLATFORM scope is
    // platform-administration only (018B's domain), so this row is seeded
    // directly; no workspace member can see it.
    const platformAgent = await db.agent.create({
      data: {
        scope: "PLATFORM",
        key: "platform-draft-agent",
        name: "platform draft",
        status: "DRAFT",
        createdById: owner.userId,
        versions: {
          create: {
            number: 1,
            instructions: "You are a platform draft.",
            modelProfile: "CREATIVE_WRITER",
            skillKeys: [],
            createdById: owner.userId,
          },
        },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${platformAgent.id}/versions`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-tenant requests cannot see another workspace's versions", async () => {
    const { owner } = await seedAll();
    const other = await seedUser("other@example.com");
    const otherWs = await seedWorkspace(other.userId, "ws-other");
    const otherAgent = await makeAgent(other.cookie, otherWs, "foreign");

    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${otherAgent}/versions`,
      headers: { cookie: owner.cookie },
    });
    expect([403, 404]).toContain(res.statusCode);
  });
});
