/**
 * Contracted extraction applications (NF-WF-008) integration suite.
 *
 * Dedicated novelforge_test_canon_application db. API-level tests drive the
 * 006 template via the shared test driver (fake gateway, GAP-028) to
 * produce real extractions, then exercise the application routes:
 * contracting, evidence validation, conflict checks, canon approval,
 * atomic apply, audit, simulation refusal, authorization, double-decide.
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

const TEST_DB = "novelforge_test_canon_application";
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
  OMNIROUTE_API_KEY: "test-key",
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

// ---------------------------------------------------------------------------
// Deterministic draft prose + behavior-controlled extraction proposals.
// Citations use the extract step's bound input name ("draft_write") and
// verbatim spans of PROSE, so evidence validation can pass.
// ---------------------------------------------------------------------------
const PROSE =
  "Wren swore the oath of silence beneath the old oak. " +
  "The moon rose over the citadel walls. " +
  "Beyond the gate the river sang against the stones, and the wind carried the scent " +
  "of pine through the courtyard. Lanterns flickered along the stair as the guards " +
  "changed their watch, their boots echoing in the dark.";

const behavior: {
  proposals: Array<{
    kind: string;
    text: string;
    citations: Array<{ source: string; span: string }>;
  }>;
} = { proposals: [] };

function defaultProposals() {
  return [
    {
      kind: "fact",
      text: "Wren swore an oath of silence",
      citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
    },
    {
      kind: "fact",
      text: "The moon rose over the citadel",
      citations: [{ source: "draft_write", span: "The moon rose over the citadel walls" }],
    },
  ];
}

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
          purpose: "Introduce the oath",
          cast: ["Wren"],
          objectives: ["swear the oath"],
          conflict: "duty vs kin",
          stakes: "the alliance",
          permittedRevelations: ["the oath words"],
          outlineRef: "outline-1",
          sourcePins: { workflowVersion: 1, outlineVersion: "ov-1" },
        };
      } else if (system.includes("chapter writer")) {
        payload = { prose: PROSE, title: "Chapter 1" };
      } else if (system.includes("reviewer")) {
        payload = { findings: [], needsCorrection: false };
      } else if (system.includes("structured extractor")) {
        payload = { proposals: behavior.proposals };
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
  };
}

const enqueuedJobs: Array<{ name: string; data: unknown; opts: unknown }> = [];
const fakeQueue = {
  add: async (name: string, data: unknown, opts: { jobId: string }) => {
    enqueuedJobs.push({ name, data, opts });
    return { id: opts.jobId };
  },
  getJob: async () => undefined,
  close: async () => {},
};

let db: NovelForgeDb;
let app: FastifyInstance;
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
  behavior.proposals = defaultProposals();
  enqueuedJobs.length = 0;
  await db.canonApplicationItem.deleteMany();
  await db.canonApplication.deleteMany();
  await db.workflowApprovalDecision.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.canonProposal.deleteMany();
  await db.storyEntity.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.auditLog.deleteMany();
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

async function seedWorkspace(
  ownerId: string,
  slug: string,
  memberRole: "OWNER" | "EDITOR" = "OWNER",
) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: memberRole as never },
  });
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
    payload: { name: `template-gw-${gwCounter}`, baseUrl: "http://localhost:20128", apiKey: "x" },
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

/** Enqueue a template run and drive it to the HUMAN_APPROVAL park (extract done). */
async function runToExtract(
  cookie: string,
  workspaceId: string,
  novelId: string,
  workflowId: string,
  extraInput: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    headers: { cookie },
    payload: {
      input: { novelId, chapterNumber: 1, outlineRef: "outline-1", ...extraInput },
      novelId,
    },
  });
  expect(res.statusCode, res.body).toBe(202);
  const { id: runId } = res.json() as { id: string };
  const driven = await driver.driveRun(runId);
  expect(driven.claimed).toBe(true);
  expect(driven.status).toBe("AWAITING_APPROVAL");
  return runId;
}

const appUrl = (workspaceId: string, novelId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/canon/applications`;

async function createApplication(
  cookie: string,
  workspaceId: string,
  novelId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: appUrl(workspaceId, novelId),
    headers: { cookie },
    payload: body,
  });
}

async function approveApplication(
  cookie: string,
  workspaceId: string,
  novelId: string,
  applicationId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${appUrl(workspaceId, novelId)}/${applicationId}/approve`,
    headers: { cookie },
    payload: body,
  });
}

async function getApplication(cookie: string, workspaceId: string, novelId: string, applicationId: string) {
  return app.inject({
    method: "GET",
    url: `${appUrl(workspaceId, novelId)}/${applicationId}`,
    headers: { cookie },
  });
}

/** Contract claim 0 to an inline-new CHARACTER entity. */
function inlineContracting(claimIndex: number, predicate = "oath", objectText = "the oath of silence") {
  return {
    claimIndex,
    entity: { kind: "CHARACTER", name: "Wren" },
    predicate,
    object: { text: objectText },
    validFromChapter: 1,
  };
}

describe("application creation and evidence validation", () => {
  it("contracts claims with validated evidence; verdicts APPLICABLE", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-create");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0), inlineContracting(1, "location", "the citadel")],
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as {
      id: string;
      status: string;
      headRevisionId: string | null;
      items: Array<{
        id: string;
        claimIndex: number;
        verdict: string;
        verdictReasons: string[];
        evidence: Array<{ inputName: string; quote: string; start: number; end: number }>;
        inlineEntity: { kind: string; name: string } | null;
      }>;
    };
    expect(body.status).toBe("VALIDATED");
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.verdict).toBe("APPLICABLE");
      expect(item.verdictReasons).toEqual([]);
      expect(item.evidence).toHaveLength(1);
      const ev = item.evidence[0]!;
      expect(ev.inputName).toBe("draft_write");
      // The recorded offsets are exact: quote === prose[start:end].
      expect(PROSE.slice(ev.start, ev.end)).toBe(ev.quote);
    }
    expect(body.items[0]!.evidence[0]!.start).toBe(0);
    expect(body.items[0]!.inlineEntity).toEqual({ kind: "CHARACTER", name: "Wren" });
  });

  it("marks claims with unresolvable citations UNSUPPORTED and blocks their approval", async () => {
    behavior.proposals = [
      {
        kind: "fact",
        text: "A claim with no support in the draft",
        citations: [{ source: "draft_write", span: "this sentence never appears" }],
      },
      {
        kind: "fact",
        text: "A claim citing an unknown input",
        citations: [{ source: "draft_nonexistent", span: "Wren" }],
      },
    ];
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-unsupported");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0), inlineContracting(1)],
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as {
      id: string;
      items: Array<{ id: string; verdict: string; verdictReasons: string[] }>;
    };
    expect(body.items.map((i) => i.verdict)).toEqual(["UNSUPPORTED", "UNSUPPORTED"]);
    expect(body.items[0]!.verdictReasons[0]).toContain("not found verbatim");
    expect(body.items[1]!.verdictReasons[0]).toContain("not a bound input");

    // Selecting an UNSUPPORTED item is refused; nothing is minted.
    const approve = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(approve.statusCode).toBe(409);
    expect((approve.json() as { error: string }).error).toBe("UNSUPPORTED_ITEM_SELECTED");
    expect(await db.canonFact.count({ where: { novelId } })).toBe(0);

    // The blocked item remains visible with its reasons (never silently dropped).
    const got = await getApplication(admin.cookie, workspaceId, novelId, body.id);
    expect(got.statusCode).toBe(200);
    const review = got.json() as { items: Array<{ verdict: string; verdictReasons: string[] }> };
    expect(review.items[0]!.verdict).toBe("UNSUPPORTED");
    expect(review.items[0]!.verdictReasons.length).toBeGreaterThan(0);
  });

  it("refuses extractions from simulation runs", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-sim");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId, {
      simulation: true,
    });

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("SIMULATION_REFUSED");
  });

  it("rejects duplicate claimIndex values in one request", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-dupidx");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0), inlineContracting(0)],
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s on an unknown run (EXTRACTION_NOT_FOUND)", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-norun");
    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId: "00000000-0000-0000-0000-000000000000",
      items: [inlineContracting(0)],
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("EXTRACTION_NOT_FOUND");
  });
});

describe("conflicts, duplicates, and supersede windows", () => {
  async function seedConflictFixture(slug: string) {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, slug);
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    // Live canon: Wren's allegiance is to the old king, true from ch 1.
    const entityRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
      headers: { cookie: admin.cookie },
      payload: { kind: "CHARACTER", name: "Wren" },
    });
    expect(entityRes.statusCode).toBe(201);
    const entityId = (entityRes.json() as { id: string }).id;
    const factRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts`,
      headers: { cookie: admin.cookie },
      payload: {
        entityId,
        predicate: "allegiance",
        objectText: "the old king",
        validFromChapter: 1,
      },
    });
    expect(factRes.statusCode, factRes.body).toBe(201);
    const liveFactId = (factRes.json() as { id: string }).id;
    return { admin, workspaceId, novelId, workflowId: seeded.workflowId, entityId, liveFactId };
  }

  function conflictContracting(entityId: string, validFromChapter: number | null = 2) {
    return {
      claimIndex: 0,
      entity: { id: entityId },
      predicate: "allegiance",
      object: { text: "the new queen" },
      validFromChapter,
    };
  }

  it("classifies a conflicting claim CONFLICT and supersedes on confirmed approval", async () => {
    behavior.proposals = [
      {
        kind: "fact",
        text: "Wren swore allegiance to the new queen",
        citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
      },
    ];
    const { admin, workspaceId, novelId, workflowId, entityId, liveFactId } =
      await seedConflictFixture("ws-conflict");
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [conflictContracting(entityId)],
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as {
      id: string;
      items: Array<{
        id: string;
        verdict: string;
        conflictsWith: { factId: string; statement: string } | null;
      }>;
    };
    expect(body.items[0]!.verdict).toBe("CONFLICT");
    expect(body.items[0]!.conflictsWith?.factId).toBe(liveFactId);

    // Without explicit confirmation the conflict is refused.
    const unconfirmed = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(unconfirmed.statusCode).toBe(409);
    expect((unconfirmed.json() as { error: string }).error).toBe("CONFLICT_NOT_CONFIRMED");

    // With confirmation the old fact is superseded and windows reconstruct.
    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
      confirmConflicts: true,
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const approvedBody = approved.json() as {
      status: string;
      appliedItems: Array<{ factId: string; supersededFactId: string | null }>;
      invalidatedScopes: string[];
    };
    expect(approvedBody.status).toBe("APPLIED");
    expect(approvedBody.appliedItems[0]!.supersededFactId).toBe(liveFactId);
    expect(approvedBody.invalidatedScopes).toEqual([entityId]);

    const oldFact = await db.canonFact.findUniqueOrThrow({ where: { id: liveFactId } });
    expect(oldFact.status).toBe("SUPERSEDED");
    expect(oldFact.validUntilChapter).toBe(2); // closed at the replacement's start
    const newFact = await db.canonFact.findUniqueOrThrow({
      where: { id: approvedBody.appliedItems[0]!.factId },
    });
    expect(newFact.status).toBe("ACTIVE");
    expect(newFact.validFromChapter).toBe(2);
    expect(newFact.objectText).toBe("the new queen");
  });

  it("refuses a superseding claim without validFromChapter", async () => {
    behavior.proposals = [
      {
        kind: "fact",
        text: "Wren swore allegiance to the new queen",
        citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
      },
    ];
    const { admin, workspaceId, novelId, workflowId, entityId } =
      await seedConflictFixture("ws-novfc");
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [conflictContracting(entityId, null)],
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { id: string; items: Array<{ id: string }> };
    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
      confirmConflicts: true,
    });
    expect(approved.statusCode).toBe(409);
    // The existing "history destroyed by omission" rule is not relaxed.
    expect((approved.json() as { error: string }).error).toBe("VALID_FROM_CHAPTER_REQUIRED");
  });

  it("blocks duplicate claims from approval", async () => {
    behavior.proposals = [
      {
        kind: "fact",
        text: "Wren's allegiance is to the old king",
        citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
      },
    ];
    const { admin, workspaceId, novelId, workflowId, entityId } =
      await seedConflictFixture("ws-duplicate");
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [
        {
          claimIndex: 0,
          entity: { id: entityId },
          predicate: "allegiance",
          object: { text: "the old king" },
          validFromChapter: 1,
        },
      ],
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { id: string; items: Array<{ id: string; verdict: string }> };
    expect(body.items[0]!.verdict).toBe("DUPLICATE");

    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(approved.statusCode).toBe(409);
    expect((approved.json() as { error: string }).error).toBe("DUPLICATE_ITEM_SELECTED");
  });
});

describe("staleness, atomicity, and audit", () => {
  it("refuses approval on a moved head; revalidate then approve succeeds", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-stale");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; items: Array<{ id: string }> };

    // Move the canon head between validation and approval (direct fact write).
    const entityRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
      headers: { cookie: admin.cookie },
      payload: { kind: "LOCATION", name: "Citadel" },
    });
    expect(entityRes.statusCode).toBe(201);

    const stale = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { error: string }).error).toBe("STALE_APPLICATION");
    // Nothing was applied.
    expect(await db.canonFact.count({ where: { novelId } })).toBe(0);
    const still = await db.canonApplication.findUniqueOrThrow({ where: { id: body.id } });
    expect(still.status).toBe("VALIDATED");

    // Revalidate refreshes the verdicts against the new head; approve works.
    const revalidated = await app.inject({
      method: "POST",
      url: `${appUrl(workspaceId, novelId)}/${body.id}/revalidate`,
      headers: { cookie: admin.cookie },
    });
    expect(revalidated.statusCode, revalidated.body).toBe(200);
    expect((revalidated.json() as { status: string }).status).toBe("VALIDATED");

    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(approved.statusCode, approved.body).toBe(200);
  });

  it("rolls back the whole apply when canon changed after validation", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-atomic");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0), inlineContracting(1, "location", "the citadel")],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; items: Array<{ id: string }> };

    // A conflicting live fact lands after validation (sequential form of the
    // mid-transaction race; the re-classification path is identical).
    const entityRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
      headers: { cookie: admin.cookie },
      payload: { kind: "CHARACTER", name: "Wren" },
    });
    const wrenId = (entityRes.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts`,
      headers: { cookie: admin.cookie },
      payload: { entityId: wrenId, predicate: "oath", objectText: "a different oath" },
    });

    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: body.items.map((i) => i.id),
    });
    expect(approved.statusCode).toBe(409);
    // The whole apply rolled back: no facts minted, application not APPLIED.
    expect(await db.canonFact.count({ where: { novelId, predicate: "oath" } })).toBe(1);
    const app2 = await db.canonApplication.findUniqueOrThrow({ where: { id: body.id } });
    expect(app2.status).not.toBe("APPLIED");
  });

  it("exposes the full audit trail on the applied application", async () => {
    behavior.proposals = [
      {
        kind: "fact",
        text: "Wren swore an oath of silence",
        citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
      },
    ];
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-audit");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    const body = res.json() as { id: string; items: Array<{ id: string }> };
    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const got = await getApplication(admin.cookie, workspaceId, novelId, body.id);
    expect(got.statusCode).toBe(200);
    const review = got.json() as {
      status: string;
      decidedById: string;
      decidedAt: string;
      audit: {
        decidedById: string;
        decidedAt: string;
        items: Array<{
          itemId: string;
          claimIndex: number;
          kind: string;
          text: string;
          entityId: string;
          predicate: string;
          object: { text: string };
          evidence: Array<{
            inputName: string;
            quote: string;
            start: number;
            end: number;
            artifact: { runId: string; stepKey: string; inputName: string };
          }>;
          previousValue: null;
          canonFactId: string;
          headRevisionId: string;
        }>;
      };
    };
    expect(review.status).toBe("APPLIED");
    expect(review.decidedById).toBe(admin.userId);
    const auditItem = review.audit.items[0]!;
    expect(auditItem.claimIndex).toBe(0);
    expect(auditItem.kind).toBe("fact");
    expect(auditItem.predicate).toBe("oath");
    expect(auditItem.object).toEqual({ text: "the oath of silence" });
    expect(auditItem.evidence[0]!.inputName).toBe("draft_write");
    expect(auditItem.evidence[0]!.artifact.runId).toBe(runId);
    expect(auditItem.evidence[0]!.artifact.stepKey).toBe("extract");
    expect(PROSE.slice(auditItem.evidence[0]!.start, auditItem.evidence[0]!.end)).toBe(
      auditItem.evidence[0]!.quote,
    );
    expect(auditItem.headRevisionId).toBeTruthy();
  });

  it("records exact evidence offsets on the minted fact source when the draft was applied", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-source");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    // The draft was applied to manuscript chapter 1: the chapter version
    // carries the draft prose.
    const chapter = await db.chapter.create({
      data: {
        novelId,
        number: 1,
        title: "Chapter 1",
        createdById: admin.userId,
      },
    });
    const version = await db.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        number: 1,
        content: PROSE,
        wordCount: 10,
        authorId: admin.userId,
      },
    });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    const body = res.json() as { id: string; items: Array<{ id: string }> };
    const approved = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const factId = (
      approved.json() as { appliedItems: Array<{ factId: string }> }
    ).appliedItems[0]!.factId;

    const sources = await db.canonFactSource.findMany({ where: { canonFactId: factId } });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.chapterVersionId).toBe(version.id);
    expect(sources[0]!.sourceKind).toBe("CHAPTER");
    // The stored quote is exactly artifactText[start:end].
    expect(PROSE.slice(sources[0]!.start, sources[0]!.end)).toBe(sources[0]!.quote);
    expect(sources[0]!.quote).toBe("Wren swore the oath of silence");
  });
});

describe("separation, authorization, and decision safety", () => {
  it("approving the run creates zero canon facts (text/canon separation)", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-sep");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    // Approve the run through the NF-WF-005 routes.
    const runRes = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
      headers: { cookie: admin.cookie },
    });
    const run = runRes.json() as {
      steps: Array<{ stepKey: string; approvalSnapshot: { snapshotHash: string } | null }>;
    };
    const hash = run.steps.find((s) => s.stepKey === "approve")!.approvalSnapshot!.snapshotHash;
    const decided = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}/approve`,
      headers: { cookie: admin.cookie },
      payload: { expectedSnapshotHash: hash },
    });
    expect(decided.statusCode, decided.body).toBe(200);

    // Text acceptance created no canon.
    expect(await db.canonFact.count({ where: { novelId } })).toBe(0);
    expect(await db.canonApplication.count({ where: { novelId } })).toBe(0);
  });

  it("enforces capabilities and tenant isolation", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-auth");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    // EDITOR has canon:read but not canon:manage / canon:approve.
    const editor = await seedUser("editor@example.com");
    await db.membership.create({
      data: { workspaceId, userId: editor.userId, role: "EDITOR" as never },
    });

    const created = await createApplication(editor.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    expect(created.statusCode).toBe(403);

    const appRes = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    expect(appRes.statusCode).toBe(201);
    const appId = (appRes.json() as { id: string }).id;

    const denied = await approveApplication(editor.cookie, workspaceId, novelId, appId, {
      itemIds: [(appRes.json() as { items: Array<{ id: string }> }).items[0]!.id],
    });
    expect(denied.statusCode).toBe(403);

    const rejected = await app.inject({
      method: "POST",
      url: `${appUrl(workspaceId, novelId)}/${appId}/reject`,
      headers: { cookie: editor.cookie },
      payload: {},
    });
    expect(rejected.statusCode).toBe(403);

    // The editor CAN read the application.
    const read = await getApplication(editor.cookie, workspaceId, novelId, appId);
    expect(read.statusCode).toBe(200);

    // Cross-workspace application id is a 404, never a disclosure.
    const other = await seedUser("other@example.com", "SUPER_ADMIN");
    const ws2 = await seedWorkspace(other.userId, "ws-auth-2");
    const cross = await getApplication(other.cookie, ws2.workspaceId, ws2.novelId, appId);
    expect(cross.statusCode).toBe(404);
    expect((cross.json() as { error: string }).error).toBe("APPLICATION_NOT_FOUND");
  });

  it("double-decide is refused", async () => {
    const admin = await seedUser("admin@example.com", "SUPER_ADMIN");
    const { workspaceId, novelId } = await seedWorkspace(admin.userId, "ws-double");
    const seeded = await seedTemplate(admin.cookie, workspaceId);
    const runId = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);

    const res = await createApplication(admin.cookie, workspaceId, novelId, {
      runId,
      items: [inlineContracting(0)],
    });
    const body = res.json() as { id: string; items: Array<{ id: string }> };
    const first = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(first.statusCode).toBe(200);

    const second = await approveApplication(admin.cookie, workspaceId, novelId, body.id, {
      itemIds: [body.items[0]!.id],
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toBe("ALREADY_DECIDED");

    const rejectAfter = await app.inject({
      method: "POST",
      url: `${appUrl(workspaceId, novelId)}/${body.id}/reject`,
      headers: { cookie: admin.cookie },
      payload: {},
    });
    expect(rejectAfter.statusCode).toBe(409);

    // Reject path: a fresh application can be rejected, then not re-decided.
    const runId2 = await runToExtract(admin.cookie, workspaceId, novelId, seeded.workflowId);
    const res2 = await createApplication(admin.cookie, workspaceId, novelId, {
      runId: runId2,
      items: [inlineContracting(0)],
    });
    const body2 = res2.json() as { id: string; items: Array<{ id: string }> };
    const rejected = await app.inject({
      method: "POST",
      url: `${appUrl(workspaceId, novelId)}/${body2.id}/reject`,
      headers: { cookie: admin.cookie },
      payload: { note: "not now" },
    });
    expect(rejected.statusCode).toBe(204);
    const approveAfterReject = await approveApplication(admin.cookie, workspaceId, novelId, body2.id, {
      itemIds: [body2.items[0]!.id],
    });
    expect(approveAfterReject.statusCode).toBe(409);
    expect((approveAfterReject.json() as { error: string }).error).toBe("ALREADY_DECIDED");
  });
});
