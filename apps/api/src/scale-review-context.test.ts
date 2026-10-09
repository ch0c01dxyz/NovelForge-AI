/**
 * NF-WF-050B fourth repair — coherent scale-review-context tests.
 *
 * GAP-119: the context route must resolve the current version INSIDE the
 * transaction (one coherent snapshot at RepeatableRead), include source
 * revision in the applicable-exception lookup, and return server-derived
 * receipt applicability plus the deterministic missing-data checklist.
 *
 * Real HTTP-boundary tests (Fastify inject) against a dedicated disposable
 * database (`novelforge_test_scale_review_context`).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createAuditService,
  fingerprintScalePolicy,
  ConflictError,
  NotFoundError,
  MemoryError,
} from "@novelforge/ai-services";
import { registerScaleDecisionRoutes } from "./scale-decision-routes.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_scale_review_context";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

const BASE_URL = resolveTestDatabaseUrl({
  envPath: path.join(HERE, "..", "..", "..", ".env"),
});

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
  policyFingerprint: string;
}

async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({
    data: {
      email: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "src",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "src-ws", slug: `src-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "SRC Novel",
      slug: `src-novel-${user.id.slice(0, 8)}`,
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
      message: "src baseline",
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
      content: "<p>SRC test prose.</p>",
      wordCount: 3,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "src test",
      payload: policyPayload,
    },
  });
  const policyRow = await db.narrativePolicy.findUnique({
    where: { novelId_kind: { novelId: novel.id, kind: "SCALE" } },
  });
  const realFingerprint = fingerprintScalePolicy({
    id: policyRow!.id,
    kind: policyRow!.kind,
    hardness: policyRow!.hardness,
    hardReason: policyRow!.hardReason,
    payload: policyRow!.payload,
  });

  return {
    userId: user.id,
    workspaceId: ws.id,
    novelId: novel.id,
    chapterId: chapter.id,
    chapterVersionId: version.id,
    branchId: branch.id,
    headRevisionId: revision.id,
    policyFingerprint: realFingerprint,
  };
}

/** Minimal app with only the scale-decision routes and a stubbed session. */
async function buildTestApp(userId: string) {
  const app = Fastify();
  await app.register(cookie);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof NotFoundError) return reply.code(404).send({ error: "NOT_FOUND" });
    if (error instanceof ConflictError) return reply.code(409).send({ error: "CONFLICT" });
    if (error instanceof MemoryError)
      return reply.code(error.statusCode).send({ error: error.code });
    return reply.code(500).send({ error: "INTERNAL" });
  });
  registerScaleDecisionRoutes(app, {
    db,
    auth: { validateSession: async () => ({ userId }) } as never,
    audit: createAuditService(db),
  });
  return app;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  await db.scaleDecisionOutcome.deleteMany();
  await db.scaleDecisionProposal.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.finalTextReview.deleteMany();
  await db.changeSet.deleteMany();
  await db.checkpoint.deleteMany();
  await db.auditLog.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelBranch.deleteMany();
  await db.revision.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

function contextUrl(f: Fixture, withVersion: boolean) {
  const base = `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/chapters/${f.chapterId}/scale-review-context`;
  return withVersion ? `${base}?chapterVersionId=${f.chapterVersionId}` : base;
}

/** Advance the chapter version AND the branch head in a single transaction. */
let advanceCounter = 1000;
async function advanceVersionAndHead(f: Fixture) {
  advanceCounter += 1;
  const n = advanceCounter;
  return db.$transaction(async (tx) => {
    const v = await tx.chapterVersion.create({
      data: {
        chapterId: f.chapterId,
        number: n,
        content: "<p>SRC advanced prose.</p>",
        wordCount: 3,
        authorId: f.userId,
      },
    });
    await tx.chapter.update({
      where: { id: f.chapterId },
      data: { currentVersionId: v.id },
    });
    const rev = await tx.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: n,
        origin: "MANUAL",
        message: "src advance",
        createdById: f.userId,
      },
    });
    await tx.novelBranch.update({
      where: { id: f.branchId },
      data: { headRevisionId: rev.id },
    });
    return { versionId: v.id, headRevisionId: rev.id };
  });
}

describe("scale-review-context applicable exception", () => {
  it("omits an exception approved at an older head (source revision filter)", async () => {
    const f = await seedFixture();
    const app = await buildTestApp(f.userId);

    // Evidence set for the exception to cite.
    const set = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "exception test set",
        conflictsJson: [
          {
            scale: "KINGDOM",
            relevance: "ACTION",
            explanation: "test claim",
            source: { start: 3, end: 6, quote: "SRC" },
          },
        ],
        actorUserId: f.userId,
      },
    });
    // CHAPTER_EXCEPTION proposal approved at the OLD head.
    const proposal = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        evidenceSetId: set.id,
        sequence: 1,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        policySnapshot: {},
        policyFingerprint: f.policyFingerprint,
        proposerUserId: f.userId,
        reason: "exception test",
      },
    });
    await db.scaleDecisionOutcome.create({
      data: {
        proposalId: proposal.id,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        sourceBranchId: f.branchId,
        sequence: 1,
        action: "APPROVE",
        actorUserId: f.userId,
        reason: "exception approved",
      },
    });

    // Sanity: before the head advances, the exception applies.
    const beforeRes = await app.inject({
      method: "GET",
      url: contextUrl(f, false),
      cookies: { [SESSION_COOKIE]: "test-token" },
    });
    expect(beforeRes.statusCode).toBe(200);
    expect(beforeRes.json().context.applicableException).not.toBeNull();

    // Advance the head: the old-head exception must no longer apply.
    const rev = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 2,
        origin: "MANUAL",
        message: "head advance",
        createdById: f.userId,
      },
    });
    await db.novelBranch.update({
      where: { id: f.branchId },
      data: { headRevisionId: rev.id },
    });

    try {
      const res = await app.inject({
        method: "GET",
        url: contextUrl(f, false),
        cookies: { [SESSION_COOKIE]: "test-token" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().context.applicableException).toBeNull();
    } finally {
      await app.close();
    }
  });
});

describe("scale-review-context coherence", () => {
  it("concurrent version/head advance during read never produces a torn context", async () => {
    const f = await seedFixture();
    const app = await buildTestApp(f.userId);
    try {
      // Repeat the race: each iteration fires the context read, lets it get
      // in-flight, then advances version+head atomically. The response must
      // always be coherent: the server-resolved chapterVersion.id must equal
      // the live currentVersionId read in the SAME snapshot (never a mix of
      // the pre-advance version with the post-advance pointer/head).
      for (let i = 0; i < 15; i++) {
        const getP = app.inject({
          method: "GET",
          url: contextUrl(f, false),
          cookies: { [SESSION_COOKIE]: "test-token" },
        });
        await sleep(5);
        await advanceVersionAndHead(f);
        const res = await getP;
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.context.chapterVersion.id).toBe(body.context.currentVersionId);
      }
    } finally {
      await app.close();
    }
  });

  it("returns server-derived applicability ABSENT and a derived checklist with no receipt", async () => {
    const f = await seedFixture();
    const app = await buildTestApp(f.userId);
    try {
      const res = await app.inject({
        method: "GET",
        url: contextUrl(f, false),
        cookies: { [SESSION_COOKIE]: "test-token" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applicability.status).toBe("ABSENT");
      // GAP-119 fifth repair: the checklist is derived from the current
      // context even when the receipt is absent — never an empty list.
      // Fixture has a valid policy but no evidence set.
      const codes = body.checklist.map((i: { code: string }) => i.code);
      expect(codes).toEqual(["RECEIPT_ABSENT", "EVIDENCE_ABSENT"]);
      for (const item of body.checklist) {
        expect(item.explanation.trim().length).toBeGreaterThan(0);
        expect(item.example.trim().length).toBeGreaterThan(0);
        expect(item.nextAction.trim().length).toBeGreaterThan(0);
      }
    } finally {
      await app.close();
    }
  });

  it("returns FRESH applicability and the protocol checklist for a matching receipt", async () => {
    const f = await seedFixture();
    const app = await buildTestApp(f.userId);
    const protocol = {
      protocol: 1,
      state: "NO_OPERATIVE_CONFLICT",
      blocking: false,
      pins: {
        chapterVersionId: f.chapterVersionId,
        branchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        evidenceSetId: null,
        policyFingerprint: f.policyFingerprint,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [],
    };
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: {},
        scaleReview: protocol,
      },
    });
    try {
      const res = await app.inject({
        method: "GET",
        url: contextUrl(f, false),
        cookies: { [SESSION_COOKIE]: "test-token" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applicability.status).toBe("FRESH");
      expect(body.applicability.reasons).toEqual([]);
      expect(body.checklist).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("returns STALE applicability naming sourceRevisionId after the head advances", async () => {
    const f = await seedFixture();
    const app = await buildTestApp(f.userId);
    const protocol = {
      protocol: 1,
      state: "NO_OPERATIVE_CONFLICT",
      blocking: false,
      pins: {
        chapterVersionId: f.chapterVersionId,
        branchId: f.branchId,
        sourceRevisionId: f.headRevisionId,
        evidenceSetId: null,
        policyFingerprint: f.policyFingerprint,
        exceptionOutcomeId: null,
      },
      claims: [],
      missingData: [],
    };
    await db.finalTextReview.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterVersionId: f.chapterVersionId,
        revisionId: f.headRevisionId,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: {},
        scaleReview: protocol,
      },
    });
    // Advance the head (no new review): the receipt's sourceRevisionId pin
    // no longer matches.
    const rev = await db.revision.create({
      data: {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchId: f.branchId,
        number: 2,
        origin: "MANUAL",
        message: "head advance",
        createdById: f.userId,
      },
    });
    await db.novelBranch.update({
      where: { id: f.branchId },
      data: { headRevisionId: rev.id },
    });
    try {
      const res = await app.inject({
        method: "GET",
        url: contextUrl(f, false),
        cookies: { [SESSION_COOKIE]: "test-token" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applicability.status).toBe("STALE");
      expect(body.applicability.reasons).toContain("sourceRevisionId");
      // GAP-119 fifth repair: the checklist is derived from the current
      // context even when the receipt is stale — never an empty list.
      const codes = body.checklist.map((i: { code: string }) => i.code);
      expect(codes).toContain("RECEIPT_STALE");
      const stale = body.checklist.find((i: { code: string }) => i.code === "RECEIPT_STALE");
      expect(stale.details.reasons).toContain("sourceRevisionId");
      for (const item of body.checklist) {
        expect(item.explanation.trim().length).toBeGreaterThan(0);
        expect(item.example.trim().length).toBeGreaterThan(0);
        expect(item.nextAction.trim().length).toBeGreaterThan(0);
      }
    } finally {
      await app.close();
    }
  });
});
