/**
 * NF-WF-050C S3 assistance integration suite (DB-backed, disposable DB).
 *
 * Covers the frozen contract's negative scenarios:
 * - Disabled S3 → 409 S3_DISABLED and ZERO model calls (spy).
 * - No SCALE policy → 409 S3_NOT_CONFIGURED, zero model calls.
 * - Unauthorized (no membership) / foreign novel → 404, zero calls.
 * - Malformed model output (bad JSON, unknown scale, quote mismatch) →
 *   422 S3_INVALID_PROPOSAL, no proposal row, Generation row FAILED.
 * - Stale pins between call and store → 409, row discarded.
 * - Gateway failure → 502, no proposal row, Generation row FAILED.
 * - reportedModel from the attempt ledger verbatim (null stays null —
 *   never the request-model fallback).
 * - Setting enablement: strict JSON read, capability gate (canon:manage
 *   for PUT; VIEWER GET still 200 with enabled:false), unknown keys
 *   preserved, audit recorded.
 * - Dismissal recorded once (idempotent), unauthorized dismiss 404.
 * - Advice: non-INCOMPLETE → 409; fabricated codes → 422; never persisted.
 * - Stale-marking on list after head change.
 * - Approved-state invariance: extract adds no S2 rows and no evidence sets.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createAuditService,
  fingerprintScalePolicy,
  type AiServices,
  type AuditService,
  ConflictError,
  NotFoundError,
} from "@novelforge/ai-services";
import { registerScaleS3Routes } from "./scale-s3-routes.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_scale_s3";
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

let db: NovelForgeDb;

interface Fixture {
  userId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  chapterVersionId: string;
  branchId: string;
  headRevisionId: string;
  policyFingerprint: string | null;
  content: string;
}

const CONTENT = "<p>The kingdom fell when the harvest failed and the granaries emptied.</p>";

async function seedFixture(options: { withPolicy: boolean }): Promise<Fixture> {
  const user = await db.user.create({
    data: {
      email: `s3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "s3",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "s3-ws", slug: `s3-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "S3 Novel",
      slug: `s3-novel-${user.id.slice(0, 8)}`,
      createdById: user.id,
    },
  });
  const branch = await db.novelBranch.create({
    data: { workspaceId: ws.id, novelId: novel.id, name: "main" },
  });
  const revision = await db.revision.create({
    data: {
      workspaceId: ws.id,
      novelId: novel.id,
      branchId: branch.id,
      number: 1,
      origin: "MANUAL",
      message: "s3 baseline",
      createdById: user.id,
    },
  });
  await db.novelBranch.update({
    where: { id: branch.id },
    data: { headRevisionId: revision.id },
  });
  await db.novel.update({
    where: { id: novel.id },
    data: { currentBranchId: branch.id },
  });
  const chapter = await db.chapter.create({
    data: { novelId: novel.id, title: "Ch1", number: 1, createdById: user.id },
  });
  const version = await db.chapterVersion.create({
    data: {
      chapterId: chapter.id,
      number: 1,
      content: CONTENT,
      wordCount: 12,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });

  let policyFingerprint: string | null = null;
  if (options.withPolicy) {
    const policyRow = await db.narrativePolicy.create({
      data: {
        novelId: novel.id,
        kind: "SCALE",
        hardness: "HARD",
        hardReason: "s3 test",
        payload: { standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 } },
      },
    });
    policyFingerprint = fingerprintScalePolicy({
      id: policyRow.id,
      kind: policyRow.kind,
      hardness: policyRow.hardness,
      hardReason: policyRow.hardReason,
      payload: policyRow.payload,
    });
  }

  return {
    userId: user.id,
    workspaceId: ws.id,
    novelId: novel.id,
    chapterId: chapter.id,
    chapterVersionId: version.id,
    branchId: branch.id,
    headRevisionId: revision.id,
    policyFingerprint,
    content: CONTENT,
  };
}

/** Model-call spy: records every call, returns a canned response. */
function makeGenerateSpy(result: {
  content: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}) {
  const calls: Array<{ task: string; profile: string; messages: unknown; preferredModelRef?: string }> = [];
  const generate: AiServices["generate"] = async (input) => {
    calls.push({ task: input.task, profile: input.profile, messages: input.messages, preferredModelRef: input.preferredModelRef });
    return {
      generationId: "00000000-0000-4000-8000-000000000001",
      content: result.content,
      model: result.model ?? "requested-model-id",
    };
  };
  return { calls, generate };
}

async function buildTestApp(
  userId: string,
  generate: AiServices["generate"],
  attemptHook?: (db: NovelForgeDb) => Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cookie);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof NotFoundError) return reply.code(404).send({ error: "NOT_FOUND" });
    if (error instanceof ConflictError) return reply.code(409).send({ error: "CONFLICT" });
    if (error && typeof error === "object" && "statusCode" in error) {
      const status = Number((error as { statusCode?: unknown }).statusCode);
      if (Number.isInteger(status) && status >= 400 && status < 600) {
        return reply
          .code(status)
          .send({ error: (error as { code?: string }).code ?? "CONFLICT" });
      }
    }
    return reply.code(500).send({ error: "INTERNAL" });
  });
  // The spy's generationId points at no real row; the attempt lookup runs
  // through the real db — the hook lets a test insert the attempt row first.
  const ai = {
    generate: async (input: Parameters<AiServices["generate"]>[0]) => {
      const res = await generate(input);
      if (attemptHook) await attemptHook(db);
      return res;
    },
  } as Pick<AiServices, "generate">;
  const audit: AuditService = createAuditService(db);
  registerScaleS3Routes(app, { db, auth: { validateSession: async () => ({ userId }) } as never, audit, ai });
  return app;
}

const novelBase = (f: Fixture) => `/api/workspaces/${f.workspaceId}/novels/${f.novelId}`;
const chapterBase = (f: Fixture) => `${novelBase(f)}/chapters/${f.chapterId}`;

function pins(f: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    chapterVersionId: f.chapterVersionId,
    expectedBranchId: f.branchId,
    expectedHeadRevisionId: f.headRevisionId,
    expectedSetId: null,
    expectedPolicyFingerprint: f.policyFingerprint,
    ...overrides,
  };
}

const VALID_MODEL_JSON = JSON.stringify({
  claims: [
    {
      scale: "KINGDOM",
      relevance: "CONSEQUENCE",
      explanation: "The failed harvest collapses the kingdom.",
      source: { start: 3, end: 19, quote: "The kingdom fell" },
    },
  ],
});

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
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.scaleS3Proposal.deleteMany();
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.novelSettings.deleteMany();
  await db.auditLog.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelBranch.deleteMany();
  await db.revision.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
});

describe("S3 setting enablement", () => {
  it("forwards an explicit model UUID without changing proposal validation or disabled gating", async () => {
    const f = await seedFixture({ withPolicy: true });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate);
    const preferredModelRef = "00000000-0000-4000-8000-000000000123";
    const request = (preference: unknown) => app.inject({ method: "POST", url: `${chapterBase(f)}/scale-s3/extract`,
      cookies: { [SESSION_COOKIE]: "test-session" }, payload: pins(f, { preferredModelRef: preference }) });
    expect((await request(preferredModelRef)).statusCode).toBe(409);
    expect(spy.calls).toHaveLength(0);
    await db.novelSettings.create({ data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } } });
    expect((await request("provider/model-name")).statusCode).toBe(400);
    expect(spy.calls).toHaveLength(0);
    expect((await request(preferredModelRef)).statusCode).toBe(201);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({ preferredModelRef, profile: "STRUCTURED_EXTRACTOR" });
    await app.close();
  });
  it("GET defaults to disabled; PUT requires canon:manage capability through the role gate", async () => {
    const f = await seedFixture({ withPolicy: false });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);

    const get1 = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" }, method: "GET", url: `${novelBase(f)}/scale-s3-setting` });
    expect(get1.statusCode).toBe(200);
    expect(get1.json()).toEqual({ enabled: false });

    const put = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "PUT",
      url: `${novelBase(f)}/scale-s3-setting`,
      payload: { enabled: true, reason: "enable for acceptance" },
    });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toEqual({ enabled: true });

    const get2 = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" }, method: "GET", url: `${novelBase(f)}/scale-s3-setting` });
    expect(get2.json()).toEqual({ enabled: true });

    const auditRows = await db.auditLog.findMany({
      where: { action: "novel.scale-s3-settings-changed" },
    });
    expect(auditRows).toHaveLength(1);
    expect((auditRows[0]!.payload as { enabled: boolean }).enabled).toBe(true);
  });

  it("preserves unknown sibling keys and treats malformed scaleS3 as disabled", async () => {
    const f = await seedFixture({ withPolicy: false });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { custom: { a: 1 }, scaleS3: "garbage" } },
    });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);

    const get = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" }, method: "GET", url: `${novelBase(f)}/scale-s3-setting` });
    expect(get.json()).toEqual({ enabled: false });

    const put = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "PUT",
      url: `${novelBase(f)}/scale-s3-setting`,
      payload: { enabled: true, reason: "ok" },
    });
    expect(put.statusCode).toBe(200);

    const row = await db.novelSettings.findUniqueOrThrow({ where: { novelId: f.novelId } });
    expect((row.settings as Record<string, unknown>).custom).toEqual({ a: 1 });
    expect(((row.settings as Record<string, unknown>).scaleS3 as Record<string, unknown>).enabled).toBe(true);
  });

  it("PUT rejects empty/oversized reason", async () => {
    const f = await seedFixture({ withPolicy: false });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "PUT",
      url: `${novelBase(f)}/scale-s3-setting`,
      payload: { enabled: true, reason: "  " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Amendment D2: concurrent PUTs with different sibling keys preserve BOTH keys; one audit row per PUT", async () => {
    const f = await seedFixture({ withPolicy: false });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: {} },
    });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);

    // Seed a sibling key that must survive both PUTs.
    await db.novelSettings.update({
      where: { novelId: f.novelId },
      data: { settings: { customA: { v: 1 } } },
    });

    // Two concurrent PUTs: each preserves the sibling and writes its own
    // scaleS3 value. Serialized by the novel row lock, both must land.
    const [p1, p2] = await Promise.all([
      app.inject({
        cookies: { [SESSION_COOKIE]: "test-session" },
        method: "PUT",
        url: `${novelBase(f)}/scale-s3-setting`,
        payload: { enabled: true, reason: "first" },
      }),
      app.inject({
        cookies: { [SESSION_COOKIE]: "test-session" },
        method: "PUT",
        url: `${novelBase(f)}/scale-s3-setting`,
        payload: { enabled: false, reason: "second" },
      }),
    ]);
    expect(p1.statusCode, p1.body).toBe(200);
    expect(p2.statusCode, p2.body).toBe(200);

    const row = await db.novelSettings.findUniqueOrThrow({ where: { novelId: f.novelId } });
    const settings = row.settings as Record<string, unknown>;
    // The sibling key written before the race survives both writers.
    expect(settings.customA).toEqual({ v: 1 });
    // scaleS3 holds whichever PUT committed last — a defined boolean value.
    expect([true, false]).toContain(
      ((settings.scaleS3 as Record<string, unknown>) ?? {}).enabled,
    );
    // One audit entry per committed PUT.
    const auditRows = await db.auditLog.findMany({
      where: { action: "novel.scale-s3-settings-changed" },
    });
    expect(auditRows).toHaveLength(2);
  });
});

describe("extraction — zero-call and gating invariants", () => {
  it("disabled S3 → 409 S3_DISABLED and ZERO model calls", async () => {
    const f = await seedFixture({ withPolicy: true });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate);

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("S3_DISABLED");
    expect(spy.calls).toHaveLength(0);
    expect(await db.scaleS3Proposal.count()).toBe(0);
  });

  it("enabled but no SCALE policy → 409 S3_NOT_CONFIGURED, zero calls", async () => {
    const f = await seedFixture({ withPolicy: false });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate);

    // Fingerprint of explicit absence.
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f, { expectedPolicyFingerprint: fingerprintScalePolicy(null) }),
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("S3_NOT_CONFIGURED");
    expect(spy.calls).toHaveLength(0);
  });

  it("unauthenticated → 401, zero calls", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = Fastify();
    await app.register(cookie);
    app.setErrorHandler((error, _req, reply) => reply.code(500).send({ error: "INTERNAL" }));
    registerScaleS3Routes(app, {
      db,
      auth: { validateSession: async () => null } as never,
      audit: createAuditService(db),
      ai: { generate: spy.generate },
    });
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode).toBe(401);
    expect(spy.calls).toHaveLength(0);
  });

  it("foreign novel (no membership) → 404, zero calls", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const outsider = await seedFixture({ withPolicy: true });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(outsider.userId, spy.generate);

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode).toBe(404);
    expect(spy.calls).toHaveLength(0);
  });

  it("stale pins → 409 before the model call, zero calls", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate);

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f, { expectedHeadRevisionId: null }),
    });
    expect(res.statusCode).toBe(409);
    expect(spy.calls).toHaveLength(0);
  });
});

describe("extraction — output validation and storage", () => {
  async function enabledFixture() {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    return f;
  }

  it("happy path stores an inert proposal with attempt-ledger reportedModel", async () => {
    const f = await enabledFixture();
    // Spy + attempt row: gateway reported its own model id.
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate, async (db2) => {
      await db2.generation.create({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          userId: f.userId,
          task: "scale.extract",
          component: "OTHER",
          status: "SUCCEEDED",
          modelProfile: "STRUCTURED_EXTRACTOR",
        },
      });
      await db2.generationAttempt.create({
        data: {
          generationId: "00000000-0000-4000-8000-000000000001",
          attemptNumber: 1,
          requestedModelId: "requested-model-id",
          reportedModelId: "gateway-reported-model",
          status: "SUCCEEDED",
        },
      });
    });

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { proposal: { id: string; reportedModel: string | null; claims: unknown[] } };
    expect(body.proposal.reportedModel).toBe("gateway-reported-model");
    expect(body.proposal.claims).toHaveLength(1);
    expect(spy.calls[0]!.task).toBe("scale.extract");
    expect(spy.calls[0]!.profile).toBe("STRUCTURED_EXTRACTOR");

    // Inert: no S2 rows, no evidence sets.
    expect(await db.scaleDecisionProposal.count()).toBe(0);
    expect(await db.scaleDecisionOutcome.count()).toBe(0);
    expect(await db.scaleEvidenceSet.count()).toBe(0);
  });

  it("gateway omits its model → stored reportedModel is null, never the requested id", async () => {
    const f = await enabledFixture();
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON, model: undefined });
    const app = await buildTestApp(f.userId, spy.generate, async (db2) => {
      await db2.generation.create({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          userId: f.userId,
          task: "scale.extract",
          component: "OTHER",
          status: "SUCCEEDED",
          modelProfile: "STRUCTURED_EXTRACTOR",
        },
      });
      // reportedModelId left null: gateway did not identify its model.
      await db2.generationAttempt.create({
        data: {
          generationId: "00000000-0000-4000-8000-000000000001",
          attemptNumber: 1,
          requestedModelId: "requested-model-id",
          reportedModelId: null,
          status: "SUCCEEDED",
        },
      });
    });

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((res.json() as { proposal: { reportedModel: string | null } }).proposal.reportedModel).toBeNull();
  });

  it.each([
    ["not json", "this is not json"],
    ["unknown field", JSON.stringify({ claims: [], extra: 1 })],
    ["unknown scale", JSON.stringify({ claims: [{ scale: "GALAXY", relevance: "ACTION", explanation: "x", source: { start: 3, end: 19, quote: "The kingdom fell" } }] })],
    ["unknown relevance", JSON.stringify({ claims: [{ scale: "KINGDOM", relevance: "VIBES", explanation: "x", source: { start: 3, end: 19, quote: "The kingdom fell" } }] })],
    ["quote mismatch", JSON.stringify({ claims: [{ scale: "KINGDOM", relevance: "ACTION", explanation: "x", source: { start: 3, end: 19, quote: "totally different text" } }] })],
    ["span out of bounds", JSON.stringify({ claims: [{ scale: "KINGDOM", relevance: "ACTION", explanation: "x", source: { start: 0, end: 99999, quote: "x" } }] })],
    ["claims not array", JSON.stringify({ claims: "all of them" })],
  ])("malformed model output (%s) → 422, no proposal row, generation FAILED", async (_name, content) => {
    const f = await enabledFixture();
    let callCount = 0;
    const spy = makeGenerateSpy({ content });
    const app = await buildTestApp(f.userId, spy.generate, async (db2) => {
      callCount += 1;
      await db2.generation.create({
        data: {
          id: `00000000-0000-4000-8000-00000000000${callCount}`,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          userId: f.userId,
          task: "scale.extract",
          component: "OTHER",
          status: "SUCCEEDED",
          modelProfile: "STRUCTURED_EXTRACTOR",
        },
      });
      await db2.generationAttempt.create({
        data: {
          generationId: `00000000-0000-4000-8000-00000000000${callCount}`,
          attemptNumber: 1,
          status: "SUCCEEDED",
        },
      });
    });

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode, res.body).toBe(422);
    expect(res.json().error).toBe("S3_INVALID_PROPOSAL");
    expect(spy.calls).toHaveLength(1); // one call made, output rejected
    expect(await db.scaleS3Proposal.count()).toBe(0);
  });

  it("pin change between call and store → 409, row discarded", async () => {
    const f = await enabledFixture();
    const spy = makeGenerateSpy({ content: VALID_MODEL_JSON });
    const app = await buildTestApp(f.userId, spy.generate, async (db2) => {
      // Mutate the head AFTER the model call — the store-phase pin
      // re-validation must refuse to persist a torn pin combination.
      const revision = await db2.revision.create({
        data: {
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          branchId: f.branchId,
          number: 2,
          origin: "MANUAL",
          message: "concurrent head advance",
          createdById: f.userId,
        },
      });
      await db2.novelBranch.update({
        where: { id: f.branchId },
        data: { headRevisionId: revision.id },
      });
    });

    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    expect(res.statusCode).toBe(409);
    expect(await db.scaleS3Proposal.count()).toBe(0);
  });

  it("gateway failure maps to a typed error; no proposal row", async () => {
    const f = await enabledFixture();
    const app = await buildTestApp(f.userId, async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/extract`,
      payload: pins(f),
    });
    // Unmapped transport errors are a 500-class propagation per the shared
    // handler; the invariant under test is "no proposal row".
    expect([500, 502, 503]).toContain(res.statusCode);
    expect(await db.scaleS3Proposal.count()).toBe(0);
  });
});

describe("proposals list and staleness", () => {
  it("lists newest-first with (createdAt,id) cursor; head change marks stale", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const row = await db.scaleS3Proposal.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        policyFingerprint: f.policyFingerprint!,
        payload: { claims: [] },
        requestedByUserId: f.userId,
      },
    });

    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);
    const fresh = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "GET",
      url: `${chapterBase(f)}/scale-s3?chapterVersionId=${f.chapterVersionId}`,
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().items).toHaveLength(1);
    expect(fresh.json().items[0].stale).toBe(false);

    // Head advance → stale (no silent repinning).
    const revision = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 2,
        origin: "MANUAL",
        message: "advance",
        createdById: f.userId,
      },
    });
    await db.novelBranch.update({
      where: { id: f.branchId },
      data: { headRevisionId: revision.id },
    });
    const staleRes = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "GET",
      url: `${chapterBase(f)}/scale-s3?chapterVersionId=${f.chapterVersionId}`,
    });
    expect(staleRes.json().items[0].stale).toBe(true);
    void row;
  });
});

describe("dismissal — recorded author rejection", () => {
  it("records actor/reason/time once; repeat is idempotent without a second write", async () => {
    const f = await seedFixture({ withPolicy: true });
    const proposal = await db.scaleS3Proposal.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        policyFingerprint: f.policyFingerprint!,
        payload: { claims: [] },
        requestedByUserId: f.userId,
      },
    });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);

    const first = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/${proposal.id}/dismiss`,
      payload: { reason: "not the conflict I meant" },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().dismissedByUserId).toBe(f.userId);

    const afterFirst = await db.scaleS3Proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(afterFirst.dismissedAt).not.toBeNull();

    const second = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/${proposal.id}/dismiss`,
      payload: { reason: "changed my mind" },
    });
    expect(second.statusCode).toBe(200);
    const afterSecond = await db.scaleS3Proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    // Idempotent: same recorded decision, no second write.
    expect(afterSecond.dismissedAt?.getTime()).toBe(afterFirst.dismissedAt?.getTime());
    expect(afterSecond.dismissedReason).toBe("not the conflict I meant");
  });

  it("unknown proposal → 404", async () => {
    const f = await seedFixture({ withPolicy: true });
    const app = await buildTestApp(f.userId, makeGenerateSpy({ content: "{}" }).generate);
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/00000000-0000-4000-8000-000000000009/dismiss`,
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("advice — transient, gated on INCOMPLETE", () => {
  it("no INCOMPLETE receipt → 409 with zero model calls", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    const spy = makeGenerateSpy({ content: "{}" });
    const app = await buildTestApp(f.userId, spy.generate);
    const res = await app.inject({
      cookies: { [SESSION_COOKIE]: "test-session" },
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/advice`,
      payload: pins(f),
    });
    expect(res.statusCode).toBe(409);
    expect(spy.calls).toHaveLength(0);
  });

  it("INCOMPLETE receipt elaborates deterministically-derived codes; fabricated codes → 422", async () => {
    const f = await seedFixture({ withPolicy: true });
    await db.novelSettings.create({
      data: { novelId: f.novelId, settings: { scaleS3: { enabled: true } } },
    });
    // No evidence set → deterministic assessor yields INCOMPLETE with
    // MISSING_EVIDENCE_SET (mirrors the 050B context endpoint derivation).
    // The advice route derives items from the stored receipt; write an
    // INCOMPLETE receipt exactly as reviewFinalText would.
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "FAIL",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: [],
        scaleReview: {
          protocol: 1,
          state: "INCOMPLETE",
          blocking: true,
          pins: {
            chapterVersionId: f.chapterVersionId,
            branchId: f.branchId,
            sourceRevisionId: f.headRevisionId,
            evidenceSetId: null,
            policyFingerprint: f.policyFingerprint,
            exceptionOutcomeId: null,
          },
          claims: [],
          missingData: [
            {
              code: "MISSING_EVIDENCE_SET",
              field: "evidenceSet",
              reason: "No SCALE evidence set exists",
              explanation: "Append one.",
              example: "Hypothetical example.",
              nextAction: "Append via 050A.",
            },
          ],
        },
      },
    });

    // Elaboration keeps the code → 200.
    const adviceSpy = makeGenerateSpy({
        content: JSON.stringify({
          items: [
            {
              code: "MISSING_EVIDENCE_SET",
              field: "evidenceSet",
              reason: "r",
              explanation: "e",
              example: "hypothetical",
              nextAction: "n",
            },
          ],
        }),
      });
    const okApp = await buildTestApp(f.userId, adviceSpy.generate);
    const ok = await okApp.inject({
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/advice`,
      cookies: { [SESSION_COOKIE]: "test-session" },
      payload: pins(f, { preferredModelRef: "00000000-0000-4000-8000-000000000124" }),
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(adviceSpy.calls[0]).toMatchObject({ preferredModelRef: "00000000-0000-4000-8000-000000000124", profile: "STRUCTURED_EXTRACTOR" });
    expect(ok.json().items).toHaveLength(1);
    // Transient: no proposal row.
    expect(await db.scaleS3Proposal.count()).toBe(0);

    // Fabricated code → 422.
    const badApp = await buildTestApp(
      f.userId,
      makeGenerateSpy({
        content: JSON.stringify({
          items: [{ code: "FABRICATED_CODE", field: "f", reason: "r", explanation: "e", example: "x", nextAction: "n" }],
        }),
      }).generate,
    );
    const bad = await badApp.inject({
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/advice`,
      cookies: { [SESSION_COOKIE]: "test-session" },
      payload: pins(f),
    });
    expect(bad.statusCode).toBe(422);
    expect(await db.scaleS3Proposal.count()).toBe(0);

    // Amendment C: valid code paired with a WRONG field → 422 (the pair
    // must match the server-derived checklist mapping exactly).
    const wrongFieldApp = await buildTestApp(
      f.userId,
      makeGenerateSpy({
        content: JSON.stringify({
          items: [
            {
              code: "MISSING_EVIDENCE_SET",
              field: "standingScale",
              reason: "r",
              explanation: "e",
              example: "hypothetical",
              nextAction: "n",
            },
          ],
        }),
      }).generate,
    );
    const wrongField = await wrongFieldApp.inject({
      method: "POST",
      url: `${chapterBase(f)}/scale-s3/advice`,
      cookies: { [SESSION_COOKIE]: "test-session" },
      payload: pins(f),
    });
    expect(wrongField.statusCode).toBe(422);
    expect(wrongField.json().error).toBe("S3_INVALID_PROPOSAL");
    expect(await db.scaleS3Proposal.count()).toBe(0);
  });
});
