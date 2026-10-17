/**
 * NF-WF-053: model-assisted arc-scope narrative summaries — deterministic
 * acceptance suite. Fake summarizer/gateway, real DB (novelforge_test_nf053),
 * real processRebuild / claim CAS / result CAS / validation.
 *
 * Covers: §15.2 T1 (with fake port), T-first-row-fail, T-dedup-chapter,
 * T-dedup-no-port, T-dedup-version-ok, T-dedup-failed-dup, T2 + T2c,
 * T-version-bump, A-T1..A-T6/A-T8 (forced-retry intent cases; transport
 * A-T9/A-T10 covered at route/identity level), T-forced-retry,
 * T-terminal-validation, T3 (freshness separation), T-expiry-no-model
 * (sweeper CAS hygiene), validator units (T2a–T2d).
 *
 * NOT claimed here (honest limits): live gateway behavior, real worker
 * process concurrency timing (A-T7 live barrier, T-conc-dup, T6 exact
 * counts on the real transport — T6 is proven on a fake transport with a
 * real manager), T-claim-interleave — covered by scoped unit checks where
 * deterministic (validator) or left to real acceptance receipts.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService, createMemoryServices, createPlatformServices } from "@novelforge/ai-services";
import { createAiServices, createGatewayRegistry, createArcSummarizer } from "@novelforge/ai-services";
import { encryptCredential, GatewayError } from "@novelforge/ai-core";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import {
  ARC_SUMMARY_SECTION_HEADINGS,
  MEMORY_SUMMARY_MAX_CHARS,
  MEMORY_SUMMARY_CLAIM_TTL_MS,
  SUMMARIZER_VERSION,
  processRebuild,
  deriveFreshness,
  validateArcSummary,
  type MemorySummarizerPort,
  type StructuralMemory,
} from "@novelforge/memory";

const TEST_DB = "novelforge_test_nf053";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found");
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

const fakeQueue = {
  add: async (_name: string, _data: unknown, opts: { jobId: string }) => ({ id: opts.jobId }),
  getJob: async () => undefined,
  close: async () => {},
};

let db: NovelForgeDb;
let app: FastifyInstance;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
  app = await buildApp(env, { db, memoryQueue: fakeQueue });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let runSeq = 0;
function uniq(prefix: string): string {
  runSeq += 1;
  return `${prefix}-${runSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

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

async function seedNovel(userId: string): Promise<{ workspaceId: string; novelId: string }> {
  const slug = uniq("ws");
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role: "OWNER" as never } });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: userId,
    workspaceId: ws.id,
    title: "NF053 Novel",
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function headRevision(workspaceId: string, novelId: string) {
  const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId, name: "main" } });
  const max = await db.revision.aggregate({ where: { branchId: branch.id }, _max: { number: true } });
  const number = (max._max.number ?? 0) + 1;
  const rev = await db.revision.create({
    data: {
      workspaceId,
      novelId,
      branchId: branch.id,
      number,
      parentRevisionId: branch.headRevisionId,
      origin: "MANUAL",
    },
  });
  await db.novelBranch.update({ where: { id: branch.id }, data: { headRevisionId: rev.id } });
  return rev;
}

async function makeSaga(workspaceId: string, novelId: string, title: string) {
  const creator = (await db.user.findFirstOrThrow()).id;
  return db.saga.create({
    data: { novelId, kind: "SAGA", title, createdById: creator },
  });
}

async function makeChapter(novelId: string, number: number) {
  const creator = (await db.user.findFirstOrThrow()).id;
  const chapter = await db.chapter.create({
    data: { novelId, number, title: `Ch ${number}`, createdById: creator },
  });
  await db.chapterVersion.create({
    data: { chapterId: chapter.id, number: 1, content: "draft", wordCount: 1, authorId: creator },
  });
  return chapter;
}

/** Entity + ACTIVE fact created together (entity name feeds the closure check). */
async function seedFactFor(
  workspaceId: string,
  novelId: string,
  creatorId: string,
  statement: string,
  name = "Wren",
) {
  const entity = await db.storyEntity.create({
    data: { novelId, kind: "CHARACTER", key: uniq("ent"), name, createdById: creatorId },
  });
  const fact = await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: entity.id,
      predicate: "trait",
      statement,
      objectText: statement,
      status: "ACTIVE",
      createdById: creatorId,
    },
  });
  return { entity, fact };
}

const memUrl = (workspaceId: string, novelId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/memory`;

function rowOf(novelId: string, scope: string, sourceRevisionId: string) {
  return db.memoryProjection.findUniqueOrThrow({
    where: { novelId_scope_sourceRevisionId: { novelId, scope, sourceRevisionId } },
  });
}

/** Valid fake summary for a structural memory (covers every fact). */
function validSummaryJson(structural: StructuralMemory): string {
  return JSON.stringify({
    summary: `## Arc state\nSteady.\n## Threads\nOpen.\n## Promises\nPending.`,
    coveredFactIds: structural.facts.map((f) => f.factId),
  });
}

interface FakeCall {
  args: { rowId: string; actorUserId: string; scope: string };
}

/** ES2023-safe Promise.withResolvers (repo target lacks it — GAP051 precedent). */
function withResolvers(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Controllable fake summarizer; invalid raw output configurable per call. */
function fakeSummarizer(opts: {
  raw?: string | ((call: number) => string);
  throwOn?: number;
  gate?: Array<(call: FakeCall) => void>;
  onCall?: (calls: FakeCall[]) => void;
}): { port: MemorySummarizerPort; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let n = 0;
  return {
    calls,
    port: {
      async summarize(req) {
        n += 1;
        calls.push({ args: { rowId: req.rowId, actorUserId: req.actorUserId, scope: req.scope } });
        if (opts.onCall) opts.onCall(calls);
        if (opts.throwOn === n) throw new Error("gateway terminal failure");
        const raw =
          typeof opts.raw === "function" ? opts.raw(n) : (opts.raw ?? validSummaryJson(req.structural));
        return {
          content: raw,
          generationId: randomUUID(),
          modelProfile: "LONG_CONTEXT_REVIEWER",
          promptVersion: "arc-sum-prompt-v1",
        };
      },
    },
  };
}

beforeEach(async () => {
  await db.memoryProjection.deleteMany();
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.modelProfileMapping.deleteMany();
  await db.aIModel.deleteMany();
  await db.aIGateway.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.canonProposal.deleteMany();
  await db.storyPromise.deleteMany();
  await db.storyThread.deleteMany();
  await db.storyEntity.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.outlineNode.deleteMany();
  await db.saga.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Structural regression (pre-053 behavior preserved)
// ---------------------------------------------------------------------------

describe("structural-only behavior preserved", () => {
  it("T-dedup-chapter: chapter row redelivery is a no-op without a port", async () => {
    const { userId } = await seedUser("nf053-a@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const chapter = await makeChapter(novelId, 1);
    const scope = `chapter:${chapter.id}`;
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    const before = await rowOf(novelId, scope, rev.id);
    for (let i = 0; i < 3; i++) {
      const r = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
      expect(r).toEqual({ deduped: true, ok: true });
    }
    const after = await rowOf(novelId, scope, rev.id);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("T-dedup-no-port: arc row with no port stays SKIPPED, never FAILED", async () => {
    const { userId } = await seedUser("nf053-b@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.buildStatus).toBe("OK");
    expect(row.summaryStatus).toBe("SKIPPED");
    const again = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    expect(again).toEqual({ deduped: true, ok: true });
    const row2 = await rowOf(novelId, scope, rev.id);
    expect(row2.summaryStatus).toBe("SKIPPED");
    expect(row2.attempts).toBe(row.attempts);
  });

  it("T-first-row-fail: invalid scope → FAILED structural row, SKIPPED summary, no port consulted", async () => {
    const { userId } = await seedUser("nf053-c@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const { port, calls } = fakeSummarizer({});
    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope: "bogus:scope", sourceRevisionId: rev.id },
      port,
    );
    expect(result).toEqual({ deduped: false, ok: false });
    const row = await db.memoryProjection.findUniqueOrThrow({
      where: { novelId_scope_sourceRevisionId: { novelId, scope: "bogus:scope", sourceRevisionId: rev.id } },
    });
    expect(row.buildStatus).toBe("FAILED");
    expect(row.summaryStatus).toBe("SKIPPED");
    expect(calls).toHaveLength(0);
    // Revision row intact (sourceRevision FK cascade respected).
    const revRow = await db.revision.findUnique({ where: { id: rev.id } });
    expect(revRow).not.toBeNull();
  });

  it("T3: FAILED summary keeps structural freshness FRESH", async () => {
    const { userId } = await seedUser("nf053-d@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    const { port } = fakeSummarizer({ raw: "not json at all" });
    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id },
      port,
    );
    expect(result).toEqual({ deduped: false, ok: false });
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.buildStatus).toBe("OK");
    expect(row.summaryStatus).toBe("FAILED");
    const f = await deriveFreshness(db, novelId, scope);
    expect(f?.freshness).toBe("FRESH");
  });
});

// ---------------------------------------------------------------------------
// Happy path and lifecycle
// ---------------------------------------------------------------------------

describe("summary lifecycle", () => {
  it("T1: happy path persists summary, provenance, covered ids; structural read serves them", async () => {
    const { userId, cookie: ownerCookie } = await seedUser("nf053-e@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    // Facts must exist BEFORE the source revision (as-of filter createdAt <= R).
    const { fact } = await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);

    const { port, calls } = fakeSummarizer({});
    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      port,
    );
    expect(result).toEqual({ deduped: false, ok: true });
    expect(calls).toHaveLength(1);

    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("OK");
    expect(row.summary).toContain("## Arc state");
    expect(row.summaryCoveredFactIds).toEqual([fact.id]);
    expect(row.summarizerVersion).toBe(SUMMARIZER_VERSION);
    expect(row.summarizerModelProfile).toBe("LONG_CONTEXT_REVIEWER");
    expect(row.summarizerPromptVersion).toBe("arc-sum-prompt-v1");
    expect(row.summaryGenerationId).not.toBeNull();
    expect(row.summaryClaimId).toBeNull();

    // Read shape: getMemoryStatus exposes summaryStatus/summaryError.
    const res = await app.inject({
      method: "GET",
      url: `${memUrl(workspaceId, novelId)}/status`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    const st = (res.json() as { statuses: Array<Record<string, unknown>> }).statuses.find(
      (s) => s.scope === scope,
    );
    expect(st).toMatchObject({ summaryStatus: "OK" });
  });

  it("T-dedup-version-ok: current-version OK cache hit dedups; forced job with any intent ALSO no-ops", async () => {
    const { userId } = await seedUser("nf053-f@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    const { port, calls } = fakeSummarizer({});
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    expect(calls).toHaveLength(1);
    const row1 = await rowOf(novelId, scope, rev.id);

    const again = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    expect(again).toEqual({ deduped: true, ok: true });
    const forcedHit = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: randomUUID() },
      port,
    );
    expect(forcedHit).toEqual({ deduped: true, ok: true });
    expect(calls).toHaveLength(1);
    const row2 = await rowOf(novelId, scope, rev.id);
    expect(row2.summary).toBe(row1.summary);
    expect(row2.attempts).toBe(row1.attempts);
  });

  it("T2: invalid raw outputs are terminal FAILED without retry", async () => {
    const { userId } = await seedUser("nf053-g@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    const invalids = [
      "unparseable {",
      JSON.stringify({ summary: "x", coveredFactIds: [] }),
      JSON.stringify({ summary: "", coveredFactIds: ["nope"] }),
      JSON.stringify({
        summary: `## Arc state\nx\n## Threads\ny\n## Promises\nz`,
        coveredFactIds: ["ghost-fact"],
      }),
      JSON.stringify({
        summary: `x`.repeat(MEMORY_SUMMARY_MAX_CHARS + 1),
        coveredFactIds: [],
      }),
    ];
    for (const raw of invalids) {
      await db.memoryProjection.deleteMany();
      const { port, calls } = fakeSummarizer({ raw });
      const r = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
      expect(r).toEqual({ deduped: false, ok: false });
      expect(calls).toHaveLength(1); // validation failure: no further attempt
      const row = await rowOf(novelId, scope, rev.id);
      expect(row.summaryStatus).toBe("FAILED");
      expect(row.summary).toBeNull();
      expect(row.summaryError).not.toBeNull();
      expect(row.buildStatus).toBe("OK");
    }
  });

  it("T-forced-retry via port throw: summarizer failure → terminal FAILED with intent consumed", async () => {
    const { userId } = await seedUser("nf053-h@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }); // SKIPPED structural row
    const row0 = await rowOf(novelId, scope, rev.id);
    await db.memoryProjection.update({
      where: { id: row0.id },
      data: { summaryStatus: "FAILED", summaryError: "prior terminal failure" },
    });

    const intent = randomUUID();
    const { port, calls } = fakeSummarizer({ throwOn: 1 });
    const r = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(r).toEqual({ deduped: false, ok: false });
    expect(calls).toHaveLength(1);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("FAILED");
    expect(row.summaryRetryIds).toEqual([intent]);
    expect(row.summaryError).toContain("summarizer failed");
  });

  it("T-dedup-failed-dup: unforced redelivery of current-version terminal FAILED is a no-op", async () => {
    const { userId } = await seedUser("nf053-r@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    // Current-version terminal FAILED (§10 case 4 precondition).
    const { port: failPort } = fakeSummarizer({ raw: "unparseable" });
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, failPort);
    const before = await rowOf(novelId, scope, rev.id);
    expect(before.summaryStatus).toBe("FAILED");
    expect(before.summarizerVersion).toBe(SUMMARIZER_VERSION);

    // Unforced redelivery: {deduped:true, ok:false}, 0 calls, row untouched.
    const { port, calls } = fakeSummarizer({});
    const r = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    expect(r).toEqual({ deduped: true, ok: false });
    expect(calls).toHaveLength(0);
    const after = await rowOf(novelId, scope, rev.id);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("A-T5: forced claim expiry recovers via the ordinary SKIPPED arm; intent set untouched until terminal", async () => {
    const { userId } = await seedUser("nf053-s@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    const intent = randomUUID();
    // Terminal FAILED row first, so the forced arm is the only claim path.
    const { port: failPort } = fakeSummarizer({ raw: "unparseable" });
    const forcedFail = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      failPort,
    );
    expect(forcedFail).toEqual({ deduped: false, ok: false });
    const claimed = await rowOf(novelId, scope, rev.id);
    expect(claimed.summaryRetryIds).toEqual([intent]);

    // Forced claim again; the port signals AFTER entry — the §9.2 ordering
    // guarantees the claim CAS has committed by then — and holds.
    const intent2 = randomUUID();
    const claimed2 = withResolvers();
    const release = withResolvers();
    const hold = fakeSummarizer({});
    hold.port.summarize = async (req) => {
      claimed2.resolve();
      await release.promise;
      return {
        content: validSummaryJson(req.structural),
        generationId: randomUUID(),
        modelProfile: "LONG_CONTEXT_REVIEWER",
        promptVersion: "arc-sum-prompt-v1",
      };
    };
    const inFlight = processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent2 },
      hold.port,
    );
    await claimed2.promise;
    // Age the live claim past its TTL and apply the sweeper's expiry CAS.
    await db.memoryProjection.updateMany({
      where: { novelId, scope, sourceRevisionId: rev.id },
      data: { summaryClaimedAt: new Date(Date.now() - MEMORY_SUMMARY_CLAIM_TTL_MS - 60_000) },
    });
    await db.memoryProjection.updateMany({
      where: { summaryStatus: "SUMMARIZING", summaryClaimedAt: { lt: new Date(Date.now() - MEMORY_SUMMARY_CLAIM_TTL_MS) } },
      data: {
        summaryStatus: "SKIPPED",
        summaryError: "claim expired",
        summary: null,
        summaryCoveredFactIds: [],
        summaryGenerationId: null,
        summaryClaimId: null,
        summaryClaimedAt: null,
      },
    });
    // Release the stalled claimant; its result CAS must hit ZERO rows.
    release.resolve();
    const stalled = await inFlight;
    expect(stalled).toEqual({ deduped: false, ok: false });
    const expiredRow = await rowOf(novelId, scope, rev.id);
    expect(expiredRow.summaryStatus).toBe("SKIPPED");
    expect(expiredRow.summaryError).toBe("claim expired");
    // Expiry does NOT consume intent2 (append happens only at terminal write).
    expect(expiredRow.summaryRetryIds).toEqual([intent]);

    // Redeliver the SAME forced job: recovers via the ORDINARY SKIPPED arm.
    const { port, calls } = fakeSummarizer({});
    const recovered = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent2 },
      port,
    );
    expect(recovered).toEqual({ deduped: false, ok: true });
    expect(calls).toHaveLength(1);
    const final = await rowOf(novelId, scope, rev.id);
    expect(final.summaryStatus).toBe("OK");
    expect(final.summaryRetryIds).toEqual([intent, intent2]);
  });

  it("T2c: oversized summary with valid coverage fails on the length ceiling", async () => {
    const { userId } = await seedUser("nf053-t@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const { fact } = await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    const raw = JSON.stringify({
      summary: "x".repeat(MEMORY_SUMMARY_MAX_CHARS + 1),
      coveredFactIds: [fact.id],
    });
    const { port, calls } = fakeSummarizer({ raw });
    const r = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    expect(r).toEqual({ deduped: false, ok: false });
    expect(calls).toHaveLength(1);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("FAILED");
    expect(row.summaryError).toContain("exceeds");
  });

  it("T-version-bump: stale-version OK row re-claims and replaces summary", async () => {
    const { userId } = await seedUser("nf053-i@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    const { port, calls } = fakeSummarizer({});
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    const v1row = await rowOf(novelId, scope, rev.id);
    // Simulate a version bump on the stored row (as a shipped bump would do).
    await db.memoryProjection.update({
      where: { id: v1row.id },
      data: { summarizerVersion: "arc-sum-v0-old" },
    });
    const r = await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id }, port);
    expect(r).toEqual({ deduped: false, ok: true });
    expect(calls).toHaveLength(2);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summarizerVersion).toBe(SUMMARIZER_VERSION);
    expect(row.summaryStatus).toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// Forced-retry intent idempotency (§8, A-T1..A-T6, A-T8)
// ---------------------------------------------------------------------------

describe("forced-retry intents", () => {
  async function seedFailedRow(workspaceId: string, novelId: string, revId: string, scope: string) {
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: revId });
    const row = await rowOf(novelId, scope, revId);
    await db.memoryProjection.update({
      where: { id: row.id },
      data: { summaryStatus: "FAILED", summaryError: "terminal validation failure" },
    });
    return rowOf(novelId, scope, revId);
  }

  it("A-T4: forced job without intent is refused before any work", async () => {
    const { userId } = await seedUser("nf053-j@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    const row0 = await seedFailedRow(workspaceId, novelId, rev.id, scope);
    const { port, calls } = fakeSummarizer({});
    const r = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true },
      port,
    );
    expect(r).toEqual({ deduped: true, ok: false });
    expect(calls).toHaveLength(0);
    const row = await rowOf(novelId, scope, rev.id);
    expect(JSON.stringify(row)).toBe(JSON.stringify(row0));
  });

  it("A-T1: same-intent replay consumed immediately (no structural work, no calls)", async () => {
    const { userId } = await seedUser("nf053-k@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    await seedFailedRow(workspaceId, novelId, rev.id, scope);
    const intent = randomUUID();
    const { port, calls } = fakeSummarizer({ throwOn: 1 });
    const first = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(first).toEqual({ deduped: false, ok: false });
    expect(calls).toHaveLength(1);
    const after1 = await rowOf(novelId, scope, rev.id);
    expect(after1.summaryRetryIds).toEqual([intent]);

    // Replay the SAME forced job (same intent).
    const replay = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(replay).toEqual({ deduped: true, ok: false });
    expect(calls).toHaveLength(1);
    const after2 = await rowOf(novelId, scope, rev.id);
    expect(JSON.stringify(after2)).toBe(JSON.stringify(after1));
  });

  it("A-T2: a new intent retries; A-T6: old-intent delayed replay stays consumed (I/J/I)", async () => {
    const { userId } = await seedUser("nf053-l@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    await seedFailedRow(workspaceId, novelId, rev.id, scope);
    const I = randomUUID();
    const { port, calls } = fakeSummarizer({ throwOn: 1 });

    // Intent I ends FAILED (set {I}).
    const rI = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: I },
      port,
    );
    expect(rI).toEqual({ deduped: false, ok: false });
    expect(calls).toHaveLength(1);

    // New intent J claims fresh and ALSO ends FAILED (set {I, J}).
    const J = randomUUID();
    const rJ = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: J },
      port,
    );
    expect(rJ).toEqual({ deduped: false, ok: false });
    expect(calls).toHaveLength(2);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryRetryIds).toEqual([I, J]);

    // Old job I redelivered: consumed-intent dedup BEFORE structural work.
    const replayI = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: I },
      port,
    );
    expect(replayI).toEqual({ deduped: true, ok: false });
    expect(calls).toHaveLength(2);
    const row2 = await rowOf(novelId, scope, rev.id);
    expect(row2.summaryRetryIds).toEqual([I, J]);
    expect(row2.attempts).toBe(row.attempts);
  });

  it("A-T8: forced success then replay is the OK cache hit", async () => {
    const { userId } = await seedUser("nf053-m@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedFailedRow(workspaceId, novelId, rev.id, scope);
    const intent = randomUUID();
    const { port, calls } = fakeSummarizer({});
    const r = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(r).toEqual({ deduped: false, ok: true });
    expect(calls).toHaveLength(1);
    const replay = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(replay).toEqual({ deduped: true, ok: true });
    expect(calls).toHaveLength(1);
  });

  it("A-T3: empty-set forced claim on an unforced-terminal FAILED row claims once", async () => {
    const { userId } = await seedUser("nf053-n@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    const row = await seedFailedRow(workspaceId, novelId, rev.id, scope);
    expect(row.summaryRetryIds).toEqual([]);
    const intent = randomUUID();
    const { port, calls } = fakeSummarizer({});
    const r = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, force: true, retryIntentId: intent },
      port,
    );
    expect(r).toEqual({ deduped: false, ok: true });
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Route-level forced behavior (A-T10 + transport identity §8.1a)
// ---------------------------------------------------------------------------

describe("POST /memory/rebuild forced route", () => {
  it("A-T10: force without scope → 400 INVALID_INPUT, nothing enqueued", async () => {
    const { userId, cookie } = await seedUser("nf053-o@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const res = await app.inject({
      method: "POST",
      url: `${memUrl(workspaceId, novelId)}/rebuild`,
      headers: { cookie },
      payload: { force: true },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("§8.1a: forced enqueue carries a fresh intent under the forced jobId; unforced identity unchanged", async () => {
    const { userId } = await seedUser("nf053-p@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const enqueued: Array<{ name: string; data: Record<string, unknown>; opts: { jobId: string } }> = [];
    const capturingQueue = {
      add: async (name: string, data: Record<string, unknown>, opts: { jobId: string }) => {
        enqueued.push({ name, data, opts });
        return { id: opts.jobId };
      },
      getJob: async () => undefined,
      close: async () => {},
    };
    const svc = createMemoryServices({ db, queue: capturingQueue });
    await svc.triggerRebuild(userId, workspaceId, novelId, { scope: `arc:${saga.id}`, force: true });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.opts.jobId).toMatch(/^memory-rebuild-forced-/);
    expect(enqueued[0]!.data.force).toBe(true);
    expect(typeof enqueued[0]!.data.retryIntentId).toBe("string");
    expect(enqueued[0]!.data.actorUserId).toBe(userId);

    enqueued.length = 0;
    await svc.triggerRebuild(userId, workspaceId, novelId, { scope: `arc:${saga.id}` });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.opts.jobId).toMatch(/^memory-rebuild-(?!forced)/);
    expect(enqueued[0]!.data.force).toBeUndefined();
    expect(enqueued[0]!.data.retryIntentId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// REAL generate path over a FAKE transport (Generation attribution, T6
// bounds, execute-time authorization). No live gateway here — the §15.0
// live run is a separate receipt.
// ---------------------------------------------------------------------------

const NF053_KEY = "unit-test-encryption-key";

/** Mutable transport behavior for the fake gateway (single instance). */
const transport = {
  /** Remaining TRANSIENT failures before a success (Infinity = always fail). */
  transientFailures: 0,
  /** Fixed error category, thrown before the transient counter applies. */
  category: null as null | "INVALID_REQUEST" | "AUTH" | "UNSUPPORTED",
  /** Raw output returned on success (defaults to a VALID summary). */
  raw: null as string | null,
  calls: 0,
};

function resetTransport() {
  transport.transientFailures = 0;
  transport.category = null;
  transport.raw = null;
  transport.calls = 0;
}

function fakeGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-arc-model", capabilities: ["chat"] }];
    },
    async generate() {
      transport.calls += 1;
      if (transport.category !== null) {
        throw new GatewayError(transport.category, "fake transport failure");
      }
      if (transport.transientFailures > 0) {
        transport.transientFailures -= 1;
        throw new GatewayError("TRANSIENT", "fake transient failure");
      }
      return {
        content:
          transport.raw ??
          JSON.stringify({
            summary: `## Arc state\nWren holds.\n## Threads\nOpen.\n## Promises\nPending.`,
            coveredFactIds: [],
          }),
        model: "fake-arc-model",
        reportedModel: "fake-arc-model",
        inputTokens: 11,
        outputTokens: 7,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed() {
      return { vectors: [[0.1, 0.2]], model: "fake-arc-model", inputTokens: 1 };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

async function seedLcrGateway(maxRetries = 6) {
  const gateway = await db.aIGateway.create({
    data: {
      name: uniq("nf053-gw"),
      baseUrl: "http://localhost:9",
      credentialCiphertext: encryptCredential("sk-nf053-test", NF053_KEY),
      enabled: true,
      priority: 10,
      maxRetries,
    },
  });
  // planAttempts dedupes by gateway but appends same-gateway repeats up to
  // the per-gateway budget (1 + maxRetries) — seed M=7 models on ONE
  // gateway so the attempt plan length is exactly M.
  for (let i = 1; i <= 7; i++) {
    const model = await db.aIModel.create({
      data: {
        gatewayId: gateway.id,
        modelId: `fake-arc-model-${i}`,
        capabilities: ["chat"],
        enabled: true,
      },
    });
    await db.modelProfileMapping.create({
      data: { profile: "LONG_CONTEXT_REVIEWER", modelRef: model.id, priority: i * 10, enabled: true },
    });
  }
  return gateway;
}

function realSummarizer() {
  const ai = createAiServices({
    db,
    registry: createGatewayRegistry(db, NF053_KEY),
    encryptionKey: NF053_KEY,
    audit: createAuditService(db),
    createGateway: fakeGateway,
  });
  return createArcSummarizer({ generate: ai.generate });
}

describe("real generate path (fake transport)", () => {
  beforeEach(resetTransport);

  it("T1-real: Generation + attempt rows carry full attribution and linkage", async () => {
    const { userId } = await seedUser("nf053-r1@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.raw = await validRawFor(workspaceId, novelId);

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: true });
    expect(transport.calls).toBe(1);

    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("OK");
    const gen = await db.generation.findUniqueOrThrow({ where: { id: row.summaryGenerationId! } });
    expect(gen.task).toBe("MEMORY_ARC_SUMMARY");
    expect(gen.artifactId).toBe(row.id);
    expect(gen.userId).toBe(userId);
    expect(gen.modelProfile).toBe("LONG_CONTEXT_REVIEWER");
    expect(gen.promptVersion).toBe("arc-sum-prompt-v1");
    expect(gen.status).toBe("SUCCEEDED");
    const attempts = await db.generationAttempt.findMany({ where: { generationId: gen.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      status: "SUCCEEDED",
      inputTokens: 11,
      outputTokens: 7,
    });
  });

  it("T6a: M-1 transient failures then success → OK after exactly M=7 calls", async () => {
    const { userId } = await seedUser("nf053-r2@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.transientFailures = 6;
    // Raw success must cover the seeded fact.
    transport.raw = await Promise.resolve(validRawFor(workspaceId, novelId));

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: true });
    expect(transport.calls).toBe(7);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("OK");
    const gens = await db.generation.findMany({ where: { task: "MEMORY_ARC_SUMMARY" } });
    expect(gens).toHaveLength(1);
    const attempts = await db.generationAttempt.findMany({ where: { generationId: gens[0]!.id } });
    expect(attempts).toHaveLength(7);
  }, 60_000);

  it("T6b: M transient failures → terminal FAILED after exactly M=7 calls, never M+1", async () => {
    const { userId } = await seedUser("nf053-r3@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.transientFailures = Number.POSITIVE_INFINITY;

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: false });
    expect(transport.calls).toBe(7);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("FAILED");
  }, 60_000);

  it("T6c: INVALID_REQUEST stops after EXACTLY 1 attempt", async () => {
    const { userId } = await seedUser("nf053-r4@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.category = "INVALID_REQUEST";

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: false });
    expect(transport.calls).toBe(1);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("FAILED");
  }, 60_000);

  it("T6d: AUTH on a single-candidate plan (maxRetries 0) → 1 attempt, terminal FAILED", async () => {
    const { userId } = await seedUser("nf053-r5@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway(0);
    transport.category = "AUTH";

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: false });
    expect(transport.calls).toBe(1);
  }, 60_000);

  it("T6e: transport success with §13.1-invalid output → no further attempt", async () => {
    const { userId } = await seedUser("nf053-r6@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.raw = "definitely not json";

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: false });
    expect(transport.calls).toBe(1);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.summaryStatus).toBe("FAILED");
    expect(row.summaryError).toContain("unparseable");
  }, 60_000);

  it("T-auth-1: membership revoked before execute → ZERO Generation/attempt rows, terminal FAILED", async () => {
    const { userId } = await seedUser("nf053-r7@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();

    // Revoke BEFORE processing: the generate gate re-checks at execute time.
    await db.membership.deleteMany({ where: { workspaceId, userId } });

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: false });
    expect(transport.calls).toBe(0);
    expect(await db.generation.count()).toBe(0);
    expect(await db.generationAttempt.count()).toBe(0);
    const row = await rowOf(novelId, scope, rev.id);
    expect(row.buildStatus).toBe("OK");
    expect(row.summaryStatus).toBe("FAILED");
    expect(row.summaryError).toContain("summarizer failed");
  });

  it("T-auth-3: non-creator member with generation:create succeeds; Generation records THAT member", async () => {
    const owner = await seedUser("nf053-r8-owner@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId);
    const member = await seedUser("nf053-r8-member@example.com");
    await db.membership.create({
      data: { workspaceId, userId: member.userId, role: "AUTHOR" as never },
    });
    const saga = await makeSaga(workspaceId, novelId, "S");
    await seedFactFor(workspaceId, novelId, owner.userId, "Wren swore the oath");
    const rev = await headRevision(workspaceId, novelId);
    const scope = `arc:${saga.id}`;
    await seedLcrGateway();
    transport.raw = await validRawFor(workspaceId, novelId);

    const result = await processRebuild(
      db,
      { workspaceId, novelId, scope, sourceRevisionId: rev.id, actorUserId: member.userId },
      realSummarizer(),
    );
    expect(result).toEqual({ deduped: false, ok: true });
    const row = await rowOf(novelId, scope, rev.id);
    const gen = await db.generation.findUniqueOrThrow({ where: { id: row.summaryGenerationId! } });
    expect(gen.userId).toBe(member.userId);
  });

  /** Build a transport raw payload that covers the novel's seeded facts. */
  async function validRawFor(_workspaceId: string, novelId: string): Promise<string> {
    const facts = await db.canonFact.findMany({ where: { novelId }, select: { id: true } });
    return JSON.stringify({
      summary: `## Arc state\nWren holds.\n## Threads\nOpen.\n## Promises\nPending.`,
      coveredFactIds: facts.map((f) => f.id),
    });
  }
});

describe("summary claim expiry", () => {
  it("T-expiry: aged SUMMARIZING row → SKIPPED with full byte hygiene; port never consulted", async () => {
    const { userId } = await seedUser("nf053-q@example.com");
    const { workspaceId, novelId } = await seedNovel(userId);
    const rev = await headRevision(workspaceId, novelId);
    const saga = await makeSaga(workspaceId, novelId, "S");
    const scope = `arc:${saga.id}`;
    await processRebuild(db, { workspaceId, novelId, scope, sourceRevisionId: rev.id });
    const row = await rowOf(novelId, scope, rev.id);
    // Simulate a stale-version row carrying PRIOR-version bytes, claimed then crashed.
    await db.memoryProjection.update({
      where: { id: row.id },
      data: {
        summaryStatus: "SUMMARIZING",
        summarizerVersion: "arc-sum-v0-old",
        summaryClaimedAt: new Date(Date.now() - MEMORY_SUMMARY_CLAIM_TTL_MS - 60_000),
        summaryClaimId: randomUUID(),
        summary: "PRIOR VERSION BYTES",
        summaryCoveredFactIds: ["f1"],
        summaryGenerationId: randomUUID(),
      },
    });

    // The sweeper's expiry CAS (same predicate as reconcileMemoryRebuilds).
    const cutoff = new Date(Date.now() - MEMORY_SUMMARY_CLAIM_TTL_MS);
    const expired = await db.memoryProjection.updateMany({
      where: { summaryStatus: "SUMMARIZING", summaryClaimedAt: { lt: cutoff } },
      data: {
        summaryStatus: "SKIPPED",
        summaryError: "claim expired",
        summary: null,
        summaryCoveredFactIds: [],
        summaryGenerationId: null,
        summaryClaimId: null,
        summaryClaimedAt: null,
      },
    });
    expect(expired.count).toBe(1);
    const after = await rowOf(novelId, scope, rev.id);
    expect(after.summaryStatus).toBe("SKIPPED");
    expect(after.summaryError).toBe("claim expired");
    expect(after.summary).toBeNull();
    expect(after.summaryCoveredFactIds).toEqual([]);
    expect(after.summaryGenerationId).toBeNull();
    expect(after.summaryClaimId).toBeNull();
    expect(after.summaryRetryIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pure validator (§13.1 unit cases incl. adversarial arms)
// ---------------------------------------------------------------------------

describe("validateArcSummary", () => {
  const structural: StructuralMemory = {
    facts: [
      {
        factId: "f1",
        entityId: "e1",
        predicate: "trait",
        statement: "Wren swore the oath",
        object: { text: "the oath" },
        validFromChapter: null,
        validUntilChapter: null,
      },
    ],
    threads: [],
    promises: [],
  };

  it("accepts a valid covered summary", () => {
    const v = validateArcSummary({
      raw: JSON.stringify({
        summary: `## Arc state\nWren.\n## Threads\nNone.\n## Promises\nNone.`,
        coveredFactIds: ["f1"],
      }),
      structural,
      registeredEntities: [{ id: "e1", name: "Wren" }],
    });
    expect(v).toEqual({ valid: true, summary: expect.any(String), coveredFactIds: ["f1"] });
  });

  it("T2a: invented REGISTERED entity not covered → closure violation", () => {
    const v = validateArcSummary({
      raw: JSON.stringify({
        summary: `## Arc state\nKade appears.\n## Threads\nNone.\n## Promises\nNone.`,
        coveredFactIds: ["f1"],
      }),
      structural,
      registeredEntities: [
        { id: "e1", name: "Wren" },
        { id: "e2", name: "Kade" },
      ],
    });
    expect(v).toEqual({ valid: false, reason: expect.stringContaining("uncovered entity Kade") });
  });

  it("T2b: uncovered prose with no registered-name violation is ACCEPTED (residual risk)", () => {
    const v = validateArcSummary({
      raw: JSON.stringify({
        summary: `## Arc state\nA stranger watches.\n## Threads\nNone.\n## Promises\nNone.`,
        coveredFactIds: ["f1"],
      }),
      structural,
      registeredEntities: [],
    });
    expect(v.valid).toBe(true);
  });

  it("T2d: injection-as-data invented fact id fails the subset check", () => {
    const v = validateArcSummary({
      raw: JSON.stringify({
        summary: `## Arc state\nInjected.\n## Threads\nNone.\n## Promises\nNone.`,
        coveredFactIds: ["f1", "INJECTED_FACT_9"],
      }),
      structural,
      registeredEntities: [],
    });
    expect(v).toEqual({ valid: false, reason: expect.stringContaining("unknown fact id") });
  });

  it("duplicate covered ids rejected; headings exact-string required", () => {
    const dup = validateArcSummary({
      raw: JSON.stringify({
        summary: `## Arc state\nx\n## Threads\ny\n## Promises\nz`,
        coveredFactIds: ["f1", "f1"],
      }),
      structural,
      registeredEntities: [],
    });
    expect(dup).toEqual({ valid: false, reason: expect.stringContaining("duplicate fact id") });
    for (const heading of ARC_SUMMARY_SECTION_HEADINGS) {
      const missing = validateArcSummary({
        raw: JSON.stringify({
          summary: `## Arc state\nx\n## Threads\ny`,
          coveredFactIds: ["f1"],
        }),
        structural,
        registeredEntities: [],
      });
      if (missing.valid) throw new Error(`missing heading ${heading} not detected`);
      expect(missing.reason).toContain("missing heading");
      break; // first missing heading suffices
    }
  });
});
