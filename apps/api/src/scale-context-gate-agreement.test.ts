/**
 * NF-WF-050B sixth repair — context/gate agreement tests.
 *
 * GAP-119 (fifth repair re-review, finding 2): the context endpoint must use
 * the SHARED complete proof-consistency check (`checkRetainedProofCompleteness`)
 * so context freshness AGREES with the release gate
 * (`checkFinalTextReviewGate`). A retained receipt the gate rejects as
 * REVIEW_STALE must never be labeled FRESH by the context endpoint.
 *
 * These are DB-backed tests on a dedicated disposable database
 * (`novelforge_test_scale_ctx_gate`). They exercise the ACTUAL context
 * endpoint (Fastify inject) against the ACTUAL shared gate for the same
 * contradictory retained receipts, including stale checklist guidance.
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
  checkFinalTextReviewGate,
  fingerprintScalePolicy,
  createAuditService,
  ConflictError,
  NotFoundError,
  MemoryError,
  type ScaleReviewProtocol,
} from "@novelforge/ai-services";
import { registerScaleDecisionRoutes } from "./scale-decision-routes.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_scale_ctx_gate";
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
      email: `cga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.io`,
      passwordHash: "x",
      displayName: "cga",
    },
  });
  const ws = await db.workspace.create({
    data: { name: "cga-ws", slug: `cga-ws-${user.id.slice(0, 8)}`, ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: user.id, role: "AUTHOR" },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "CGA Novel",
      slug: `cga-novel-${user.id.slice(0, 8)}`,
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
      message: "cga baseline",
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
      content: "<p>CGA test prose with enough content.</p>",
      wordCount: 7,
      authorId: user.id,
    },
  });
  await db.chapter.update({
    where: { id: chapter.id },
    data: { currentVersionId: version.id },
  });
  // Configured SCALE policy (HARD). No evidence set — the assessor will
  // produce INCOMPLETE for this live context.
  const policyPayload = {
    standing: { scale: "VILLAGE", access: ["VILLAGE"], reputation: 50 },
  };
  await db.narrativePolicy.create({
    data: {
      novelId: novel.id,
      kind: "SCALE",
      hardness: "HARD",
      hardReason: "cga test",
      payload: policyPayload,
    },
  });
  const policyRow = await db.narrativePolicy.findUniqueOrThrow({
    where: { novelId_kind: { novelId: novel.id, kind: "SCALE" } },
  });
  const realFingerprint = fingerprintScalePolicy({
    id: policyRow.id,
    kind: policyRow.kind,
    hardness: policyRow.hardness,
    hardReason: policyRow.hardReason,
    payload: policyRow.payload,
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

/**
 * A contradictory retained receipt: pins match the live context verbatim
 * and the protocol passes the isolated fast-paths (WITHIN_REACH,
 * blocking:false, schema-valid), but the retained proof contradicts what
 * the deterministic assessor computes from live context (no evidence set
 * → INCOMPLETE, blocking under HARD).
 */
function makeContradictoryProtocol(f: Fixture): ScaleReviewProtocol {
  return {
    protocol: 1,
    state: "WITHIN_REACH",
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
}

async function writeReceipt(f: Fixture, protocol: ScaleReviewProtocol) {
  await db.finalTextReview.create({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      chapterVersionId: f.chapterVersionId,
      revisionId: f.headRevisionId,
      verdict: "PASS",
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: [],
      scaleReview: protocol as unknown as object,
    },
  });
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

function contextUrl(f: Fixture) {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/chapters/${f.chapterId}/scale-review-context?chapterVersionId=${f.chapterVersionId}`;
}

/** Acquire the gate's required lock order inside a transaction. */
async function withGateLocks<T>(
  f: Fixture,
  fn: (tx: NovelForgeDb) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
      f.novelId,
    );
    await tx.$queryRawUnsafe(
      `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
      f.branchId,
    );
    await tx.$queryRawUnsafe(
      `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
      f.chapterId,
    );
    return fn(tx as unknown as NovelForgeDb);
  });
}

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

describe("context/gate agreement", () => {
  it("labels a gate-rejected contradictory receipt STALE (not FRESH) via the endpoint", async () => {
    const f = await seedFixture();
    await writeReceipt(f, makeContradictoryProtocol(f));
    const app = await buildTestApp(f.userId);

    // Gate rejects it.
    const gateResult = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );
    expect(gateResult).toEqual({ ok: false, code: "REVIEW_STALE" });

    // The context endpoint must agree: STALE, never FRESH.
    const res = await app.inject({
      method: "GET",
      url: contextUrl(f),
      cookies: { [SESSION_COOKIE]: "test-session" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      applicability: { status: string; reasons: string[] };
      checklist: Array<{ code: string; explanation: string; example: string; nextAction: string }>;
    };
    expect(body.applicability.status).toBe("STALE");
    expect(body.applicability.reasons).toContain("proof-incomplete");

    // Stale checklist guidance is present and actionable.
    const stale = body.checklist.find((i) => i.code === "RECEIPT_STALE");
    expect(stale).toBeDefined();
    expect(stale!.explanation.trim().length).toBeGreaterThan(0);
    expect(stale!.example.trim().length).toBeGreaterThan(0);
    expect(stale!.nextAction.trim().length).toBeGreaterThan(0);
    expect(stale!.explanation).toContain("proof-incomplete");

    await app.close();
  });

  it("labels a genuinely fresh receipt FRESH via the endpoint and passes the gate", async () => {
    const f = await seedFixture();
    // Write the receipt the deterministic assessor would produce for the
    // live context: no evidence set + HARD policy → INCOMPLETE, blocking,
    // with the exact MISSING_EVIDENCE_SET missingData.
    const genuine: ScaleReviewProtocol = {
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
          reason: "No SCALE evidence set exists for this branch/version",
          explanation:
            "SCALE review requires an author-appended evidence set for the current branch and chapter version.",
          example:
            "Example (hypothetical): append an evidence set with ACTION/STAKES/CONSEQUENCE claims, or declare no operative conflict.",
          nextAction:
            "Append a SCALE evidence set via the 050A surface, or declare NO_OPERATIVE_CONFLICT.",
        },
      ],
    };
    await writeReceipt(f, genuine);
    const app = await buildTestApp(f.userId);

    const res = await app.inject({
      method: "GET",
      url: contextUrl(f),
      cookies: { [SESSION_COOKIE]: "test-session" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      applicability: { status: string; reasons: string[] };
      checklist: Array<{ code: string }>;
    };
    expect(body.applicability.status).toBe("FRESH");
    // FRESH INCOMPLETE maps the receipt's missingData to the checklist.
    expect(body.checklist.map((i) => i.code)).toContain("MISSING_EVIDENCE_SET");

    // The gate agrees the proof is complete (it returns the INCOMPLETE
    // blocking code, not REVIEW_STALE — the proof itself is not stale).
    const gateResult = await withGateLocks(f, (tx) =>
      checkFinalTextReviewGate(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        chapterId: f.chapterId,
        chapterVersionId: f.chapterVersionId,
      }),
    );
    expect(gateResult).toEqual({ ok: false, code: "SCALE_ASSESSMENT_INCOMPLETE" });

    await app.close();
  });
});
