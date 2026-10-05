/**
 * Writer generate/review/diff/accept UI (NF-WF-007) — API-level loop tests.
 *
 * Dedicated novelforge_test_writer_ui db. Exercises the exact route
 * sequence the UI drives, against the REAL backend with the test driver
 * (GAP-028: fake gateway, never a production AI path, never a mock
 * panel): start run → poll to AWAITING_APPROVAL → snapshot-derived
 * review (draft-selection rule) → decide (full error matrix) → guarded
 * manuscript apply. Plus the forced races: autosave conflict, stale
 * apply, double decide, double submit.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import type { AIGateway, GatewayRecord, GenerateRequest } from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";
import {
  ensureChapterTemplate,
  type SeedHttp,
} from "../../../scripts/seed-chapter-template.ts";

const TEST_DB = "novelforge_test_writer_ui";
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
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

// ---------------------------------------------------------------------------
// Fake gateway: deterministic answers so the template parks. needsCorrection
// stays false → the rewrite chain is skipped; the draft is `write`.
// ---------------------------------------------------------------------------
const PROSE = "Generated draft prose. " + "Lorem ipsum dolor sit amet. ".repeat(10);

function fakeCreateGateway(_rec: GatewayRecord): AIGateway {
  return {
    id: _rec.id,
    name: _rec.name,
    async listModels() {
      return [{ modelId: "fake-writer", capabilities: ["chat"] }];
    },
    async generate(req: GenerateRequest) {
      const system = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      let payload: unknown;
      if (system.includes("scene planner")) {
        payload = {
          purpose: "p",
          cast: ["Wren"],
          objectives: ["o"],
          conflict: "c",
          stakes: "s",
          permittedRevelations: ["r"],
          outlineRef: "outline-1",
          sourcePins: { outlineVersion: "ov-1", workflowVersion: 1 },
        };
      } else if (system.includes("chapter writer")) {
        payload = { prose: PROSE, title: "Chapter 1" };
      } else if (system.includes("voice and style reviewer") || system.includes("final reviewer")) {
        payload = { findings: [], needsCorrection: false };
      } else if (system.includes("structured extractor")) {
        payload = {
          proposals: [
            { kind: "fact", text: "Wren swore.", citations: [{ source: "draft", span: "1" }] },
          ],
        };
      } else {
        payload = {};
      }
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
    async embed() {
      return { vectors: [[0.1]], model: "fake", inputTokens: 1 };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  } as unknown as AIGateway;
}

const enqueuedJobs: Array<{ runId: string }> = [];
const fakeQueue = {
  async add(_name: string, data: { runId: string }) {
    enqueuedJobs.push(data);
  },
} as never;

let app: FastifyInstance;
let db: NovelForgeDb;
let driver: TestDriver;

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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway, workflowQueue: fakeQueue });
  driver = createTestDriver(db, { encryptionKey: ENCRYPTION_KEY, createGateway: fakeCreateGateway });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  enqueuedJobs.length = 0;
  await db.workflowApprovalDecision.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.auditLog.deleteMany();
  await db.outlineVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(
  email: string,
  platformRole: "SUPER_ADMIN" | null = null,
): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email, platformRole: platformRole ?? undefined },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" as never } });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

function seedHttp(cookie: string): SeedHttp {
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

let gwCounter = 0;
async function seedModelRoutes(cookie: string) {
  gwCounter += 1;
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie },
    payload: { name: `writer-ui-gw-${gwCounter}`, baseUrl: "http://localhost:20128", apiKey: "x" },
  });
  expect(gw.statusCode).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/gateways/${gatewayId}/sync-models`,
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(200);
  const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
  const model = (models.json() as Array<{ id: string; modelId: string }>).find(
    (m) => m.modelId === "fake-writer",
  )!;
  expect(model).toBeTruthy();
  for (const profile of [
    "CREATIVE_WRITER",
    "DEEP_PLANNER",
    "CONTINUITY_REVIEWER",
    "LONG_CONTEXT_REVIEWER",
    "STRUCTURED_EXTRACTOR",
    "FAST_CLASSIFIER",
  ]) {
    const put = await app.inject({
      method: "PUT",
      url: "/api/model-profiles",
      headers: { cookie },
      payload: { profile, modelId: model.id },
    });
    expect(put.statusCode).toBe(200);
  }
}

async function seedTemplate(cookie: string, workspaceId: string) {
  const result = await ensureChapterTemplate(seedHttp(cookie), { cookie, workspaceId });
  expect(result.workflowId).toBeTruthy();
  await seedModelRoutes(cookie);
  return result;
}

async function createChapter(cookie: string, workspaceId: string, novelId: string, title: string) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; number: number };
}

async function createAndApproveOutline(
  cookie: string,
  workspaceId: string,
  novelId: string,
  content: unknown,
) {
  const created = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/planning/outline-versions`,
    headers: { cookie },
    payload: { content, note: "test" },
  });
  expect(created.statusCode, created.body).toBe(201);
  const versionId = (created.json() as { id: string }).id;
  const approved = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/planning/outline-versions/${versionId}/approve`,
    headers: { cookie },
    payload: {},
  });
  expect(approved.statusCode, approved.body).toBe(200);
  return versionId;
}

interface Fixture {
  cookie: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  outlineId: string;
  workflowId: string;
}

async function seedLoop(slug: string): Promise<Fixture> {
  const admin = await seedUser(`admin-${slug}@example.com`, "SUPER_ADMIN");
  const { workspaceId, novelId } = await seedWorkspace(admin.userId, `ws-${slug}`);
  const seeded = await seedTemplate(admin.cookie, workspaceId);
  const chapter = await createChapter(admin.cookie, workspaceId, novelId, "Chapter One");
  const outlineId = await createAndApproveOutline(admin.cookie, workspaceId, novelId, {
    beats: ["the oath"],
  });
  return {
    cookie: admin.cookie,
    workspaceId,
    novelId,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    outlineId,
    workflowId: seeded.workflowId,
  };
}

async function startRun(fx: Fixture, extra: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${fx.workspaceId}/workflows/${fx.workflowId}/run`,
    headers: { cookie: fx.cookie },
    payload: {
      novelId: fx.novelId,
      input: { chapterNumber: fx.chapterNumber, outlineRef: fx.outlineId },
      idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
      ...extra,
    },
  });
  return res;
}

async function parkRun(fx: Fixture): Promise<string> {
  const res = await startRun(fx);
  expect(res.statusCode, res.body).toBe(202);
  const { id: runId, statusUrl } = res.json() as { id: string; statusUrl: string };
  expect(statusUrl).toBeTruthy();
  const driven = await driver.driveRun(runId);
  expect(driven.claimed).toBe(true);
  expect(driven.status).toBe("AWAITING_APPROVAL");
  return runId;
}

async function getRun(cookie: string, workspaceId: string, runId: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    id: string;
    status: string;
    steps: Array<{
      stepKey: string;
      status: string;
      output: { json?: unknown } | null;
      approvalSnapshot: { snapshotHash: string; material: { priorOutcomes: Record<string, unknown> } } | null;
    }>;
  };
}

function snapshotOf(run: Awaited<ReturnType<typeof getRun>>) {
  const step = run.steps.find((s) => s.approvalSnapshot !== null)!;
  expect(step, "parked snapshot step").toBeDefined();
  return step.approvalSnapshot!;
}

/** The UI's draft-selection rule: latest-available write → rewrite_1 → rewrite_2. */
function selectDraftProse(snap: { material: { priorOutcomes: Record<string, unknown> } }): string | null {
  const outcomes = snap.material.priorOutcomes;
  for (const k of ["rewrite_2", "rewrite_1", "write"]) {
    const o = outcomes[k] as { json?: { prose?: unknown } } | undefined;
    if (o?.json && typeof o.json === "object" && typeof (o.json as { prose?: unknown }).prose === "string") {
      return (o.json as { prose: string }).prose;
    }
  }
  return null;
}

describe("writer UI loop (API-level)", () => {
  it("core loop: start → park → review → approve → apply → next chapter", async () => {
    const fx = await seedLoop("core");
    const started = await startRun(fx);
    expect(started.statusCode).toBe(202);
    const { id: runId, statusUrl } = started.json() as { id: string; statusUrl: string };
    expect(statusUrl).toContain(runId);

    const driven = await driver.driveRun(runId);
    expect(driven.status).toBe("AWAITING_APPROVAL");

    // Review: derive everything from the single parked-snapshot read.
    const run = await getRun(fx.cookie, fx.workspaceId, runId);
    const snap = snapshotOf(run);
    const prose = selectDraftProse(snap);
    expect(prose, "draft selected per latest-available rule").toBe(PROSE);

    // Approve binds to the echoed hash.
    const decided = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash },
    });
    expect(decided.statusCode, decided.body).toBe(200);

    const resumed = await driver.driveRun(runId);
    expect(resumed.status).toBe("SUCCEEDED");

    // Apply: PUT with the pinned expectedVersion.
    const chapterBefore = await app.inject({
      method: "GET",
      url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
      headers: { cookie: fx.cookie },
    });
    const beforeVersion = (chapterBefore.json() as { currentVersion: number }).currentVersion;
    const applied = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
      headers: { cookie: fx.cookie },
      payload: { content: prose, expectedVersion: beforeVersion },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    const newVersion = (applied.json() as { version: number }).version;
    expect(newVersion).toBe((beforeVersion ?? 0) + 1);

    // The chapter now holds the accepted draft.
    const chapterAfter = await app.inject({
      method: "GET",
      url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
      headers: { cookie: fx.cookie },
    });
    expect((chapterAfter.json() as { content: string }).content).toBe(PROSE);
  });

  it("reject path: run FAILS with the reason; no apply offered", async () => {
    const fx = await seedLoop("reject");
    const runId = await parkRun(fx);
    const run = await getRun(fx.cookie, fx.workspaceId, runId);
    const snap = snapshotOf(run);

    const rejected = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/reject`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash, reason: "Not the right tone." },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    // Reject is synchronous: the decision response is already FAILED.
    expect((rejected.json() as { status: string }).status).toBe("FAILED");

    const terminal = await getRun(fx.cookie, fx.workspaceId, runId);
    expect(terminal.status).toBe("FAILED");
  });

  it("reject without a reason is a 400", async () => {
    const fx = await seedLoop("reject400");
    const runId = await parkRun(fx);
    const run = await getRun(fx.cookie, fx.workspaceId, runId);
    const snap = snapshotOf(run);
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/reject`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash },
    });
    expect(res.statusCode).toBe(400);
  });

  it("forced race — autosave conflict: one 200, one 409, no clobber", async () => {
    const fx = await seedLoop("race");
    const detail = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
      })
    ).json() as { currentVersion: number; content: string };
    const v = detail.currentVersion;

    const [a, b] = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
        payload: { content: "winner text", expectedVersion: v },
      }),
      app.inject({
        method: "PUT",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
        payload: { content: "loser text", expectedVersion: v },
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);

    // The loser's text never landed.
    const after = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
      })
    ).json() as { content: string; currentVersion: number };
    expect(after.content).toBe("winner text");
    expect(after.currentVersion).toBe(v + 1);
  });

  it("forced race — stale apply: PUT with a moved expectedVersion is 409", async () => {
    const fx = await seedLoop("stale");
    const detail = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
      })
    ).json() as { currentVersion: number };
    const v = detail.currentVersion;

    // Someone else saves first (the version moves).
    const moved = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
      headers: { cookie: fx.cookie },
      payload: { content: "newer text", expectedVersion: v },
    });
    expect(moved.statusCode).toBe(200);

    // The stale apply (pinned at v) is refused — no silent overwrite.
    const stale = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
      headers: { cookie: fx.cookie },
      payload: { content: PROSE, expectedVersion: v },
    });
    expect(stale.statusCode).toBe(409);

    const after = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${fx.chapterId}`,
        headers: { cookie: fx.cookie },
      })
    ).json() as { content: string };
    expect(after.content).toBe("newer text");
  });

  it("forced race — double decide: one succeeds, the other is ALREADY_DECIDED", async () => {
    const fx = await seedLoop("double");
    const runId = await parkRun(fx);
    const run = await getRun(fx.cookie, fx.workspaceId, runId);
    const snap = snapshotOf(run);

    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
        headers: { cookie: fx.cookie },
        payload: { expectedSnapshotHash: snap.snapshotHash },
      }),
      app.inject({
        method: "POST",
        url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
        headers: { cookie: fx.cookie },
        payload: { expectedSnapshotHash: snap.snapshotHash },
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const refused = [a, b].find((r) => r.statusCode === 409)!;
    expect((refused.json() as { code: string }).code).toBe("ALREADY_DECIDED");
  });

  it("stale approval: wrong hash is 409 STALE_APPROVAL; the run stays parked", async () => {
    const fx = await seedLoop("stalehash");
    const runId = await parkRun(fx);
    const bad = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: "0".repeat(64) },
    });
    expect(bad.statusCode).toBe(409);
    expect((bad.json() as { code: string }).code).toBe("STALE_APPROVAL");

    const still = await getRun(fx.cookie, fx.workspaceId, runId);
    expect(still.status).toBe("AWAITING_APPROVAL");

    // The fresh hash still decides fine.
    const snap = snapshotOf(still);
    const good = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash },
    });
    expect(good.statusCode).toBe(200);
  });

  it("decide error matrix: 403 without capability, 404 for another tenant", async () => {
    const fx = await seedLoop("matrix");
    const runId = await parkRun(fx);
    const run = await getRun(fx.cookie, fx.workspaceId, runId);
    const snap = snapshotOf(run);

    // A workspace member without the approve capability → 403.
    const pleb = await seedUser("pleb-matrix@example.com");
    await db.membership.create({
      data: { workspaceId: fx.workspaceId, userId: pleb.userId, role: "EDITOR" as never },
    });
    const forbidden = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: pleb.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash },
    });
    expect(forbidden.statusCode).toBe(403);

    // Another tenant's workspace → 404, never the material.
    const stranger = await seedUser("stranger-matrix@example.com", "SUPER_ADMIN");
    const gone = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: stranger.cookie },
      payload: { expectedSnapshotHash: snap.snapshotHash },
    });
    expect(gone.statusCode).toBe(404);
  });

  it("decide on a cancelled run is 409 RUN_CANCELLED", async () => {
    const fx = await seedLoop("canceldecide");
    const started = await startRun(fx);
    const { id: runId } = started.json() as { id: string };
    // Cancel before it parks.
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/cancel`,
      headers: { cookie: fx.cookie },
    });
    expect(cancelled.statusCode).toBe(200);

    const decided = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: fx.cookie },
      payload: { expectedSnapshotHash: "0".repeat(64) },
    });
    expect(decided.statusCode).toBe(409);
    expect((decided.json() as { code: string }).code).toBe("RUN_CANCELLED");
  });

  it("double-submit safety: same idempotencyKey yields one run row", async () => {
    const fx = await seedLoop("dedupe");
    const key = "dedupe-key-1";
    const mkPayload = () => ({
      novelId: fx.novelId,
      input: { chapterNumber: fx.chapterNumber, outlineRef: fx.outlineId },
      idempotencyKey: key,
    });
    const a = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflows/${fx.workflowId}/run`,
      headers: { cookie: fx.cookie },
      payload: mkPayload(),
    });
    const b = await app.inject({
      method: "POST",
      url: `/api/workspaces/${fx.workspaceId}/workflows/${fx.workflowId}/run`,
      headers: { cookie: fx.cookie },
      payload: mkPayload(),
    });
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(200);
    const idA = (a.json() as { id: string }).id;
    const idB = (b.json() as { id: string }).id;
    expect(idA).toBe(idB);
    expect(await db.workflowRun.count({ where: { workflowId: fx.workflowId } })).toBe(1);
  });

  it("runs-by-chapter: listRuns rows carry input for client-side filtering", async () => {
    const fx = await seedLoop("filter");
    await parkRun(fx);
    const listed = await app.inject({
      method: "GET",
      url: `/api/workspaces/${fx.workspaceId}/workflow-runs?workflowId=${fx.workflowId}`,
      headers: { cookie: fx.cookie },
    });
    expect(listed.statusCode).toBe(200);
    const rows = listed.json() as Array<{ input: unknown }>;
    expect(rows.length).toBeGreaterThan(0);
    const mine = rows.filter(
      (r) =>
        (r.input as { chapterNumber?: unknown } | null)?.chapterNumber === fx.chapterNumber,
    );
    expect(mine.length).toBeGreaterThan(0);
  });
});
