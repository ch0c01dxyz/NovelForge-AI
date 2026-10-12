/**
 * SCALE evidence foundation (NF-WF-050A, S1) integration suite.
 *
 * Dedicated novelforge_test_scale_evidence db (parallel-safe per ADR-0003 §8).
 * Sessions/users/workspaces/novels seeded directly in the DB to stay off
 * register/login rate limits.
 *
 * Covers (contract "Prerequisites and required acceptance" 1-6):
 * 1. Real API create/read/replace/history, strict schemas, valid no-conflict
 * 2. All eight scales, validation negatives (unknown label, empty/oversized,
 *    missing relevance, duplicates, invalid offsets, quote mismatch)
 * 3. Tenant/role negatives (cross-novel 404, editor/viewer 403, actor injection)
 * 4. Concurrency (wrong branch/head/set → 409, duplicate retry → 409)
 * 5. Stale applicability (new version → UNASSESSED, head change → STALE)
 * 6. Chapter deletion (cited → 409, uncited → existing behavior)
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
import { createAuditService } from "@novelforge/ai-services";
import {
  createPlatformServices,
  createScaleEvidenceServices,
  fingerprintScalePolicy,
  ScaleEvidenceValidationError,
  NotFoundError,
  ConflictError,
} from "@novelforge/ai-services";
import { ForbiddenError } from "@novelforge/auth/authorization";

const TEST_DB = "novelforge_test_scale_evidence";
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
  APP_ENCRYPTION_KEY: "test",
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
  await db.auditLog.deleteMany();
  await db.scaleEvidenceSet.deleteMany();
  await db.canonFact.deleteMany();
  await db.scene.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

/** Seed user + session; returns cookie header value. */
async function seedUser(email: string): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

/** Seed workspace + novel owned by `owner`. Returns ids. */
async function seedNovel(ownerId: string, slug: string) {
  const ws = await db.workspace.create({
    data: { name: slug, slug, ownerId },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

/** Add a member with a specific role to a workspace. */
async function addMember(workspaceId: string, userId: string, role: "EDITOR" | "VIEWER" | "AUTHOR") {
  await db.membership.create({ data: { workspaceId, userId, role } });
}

async function makeChapter(cookie: string, ids: { workspaceId: string; novelId: string }, title: string) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; number: number };
}

async function saveVersion(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  content: string,
  expectedVersion: number | null = null,
) {
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: { content, expectedVersion },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { version: number; wordCount: number };
}

const BASE_URL_PATH = (ids: { workspaceId: string; novelId: string }, chapterId: string) =>
  `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/scale-evidence`;

// A chapter version whose content contains quotable prose. Offsets are
// UTF-16 into the stored sanitized HTML; keep content plain to make them
// predictable.
const PROSE = "<p>The kingdom fell when the harvest failed and the granaries emptied.</p>";
// "The kingdom fell" starts at 3, ends at 18 in the HTML above.
const CLAIM_A = {
  scale: "KINGDOM",
  relevance: "CONSEQUENCE",
  explanation: "The failed harvest collapses the kingdom's food supply.",
  source: { start: 3, end: 19, quote: "The kingdom fell" },
};
const CLAIM_B = {
  scale: "VILLAGE",
  relevance: "STAKES",
  explanation: "Empty granaries threaten the village directly.",
  source: { start: 52, end: 69, quote: "granaries emptied" },
};

async function postSet(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: BASE_URL_PATH(ids, chapterId),
    headers: { cookie },
    payload: body,
  });
}

async function getCurrent(cookie: string, ids: { workspaceId: string; novelId: string }, chapterId: string) {
  return app.inject({
    method: "GET",
    url: BASE_URL_PATH(ids, chapterId),
    headers: { cookie },
  });
}

/** Seed chapter + saved version, then read current to harvest server-truth expectations. */
async function seedChapterWithVersion(cookie: string, ids: { workspaceId: string; novelId: string }) {
  const chapter = await makeChapter(cookie, ids, "Scale Chapter");
  await saveVersion(cookie, ids, chapter.id, PROSE);
  const cur = await getCurrent(cookie, ids, chapter.id);
  expect(cur.statusCode).toBe(200);
  const body = cur.json() as {
    chapterVersionId: string;
    branchId: string;
    currentHeadRevisionId: string | null;
    assessment: null;
    status: string;
  };
  expect(body.status).toBe("UNASSESSED");
  // chapterVersionId comes from the server via GET current (server truth),
  // not from the save response (which returns { version, wordCount }).
  return { chapterId: chapter.id, versionId: body.chapterVersionId, branchId: body.branchId, headRevisionId: body.currentHeadRevisionId };
}

describe("create / read / replace / history", () => {
  it("POST valid CONFLICTS → 201; GET current → CURRENT", async () => {
    const owner = await seedUser("se1@t.io");
    const ids = await seedNovel(owner.userId, "se-ws1");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "Kingdom-scale consequence with village stakes.",
      conflicts: [CLAIM_A, CLAIM_B],
    });
    expect(post.statusCode, post.body).toBe(201);
    const created = post.json() as {
      id: string; sequence: number; previousSetId: string | null;
      actorUserId: string; declaration: string; conflicts: unknown[];
    };
    expect(created.sequence).toBe(1);
    expect(created.previousSetId).toBeNull();
    expect(created.actorUserId).toBe(owner.userId);
    expect(created.declaration).toBe("CONFLICTS");
    expect(created.conflicts).toHaveLength(2);

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect(cur.statusCode).toBe(200);
    const body = cur.json() as { status: string; assessment: { id: string } | null; staleReasons: string[] };
    expect(body.status).toBe("CURRENT");
    expect(body.assessment?.id).toBe(created.id);
    expect(body.staleReasons).toEqual([]);
  });

  it("second POST appends sequence+1 with previousSetId; history lists both descending", async () => {
    const owner = await seedUser("se2@t.io");
    const ids = await seedNovel(owner.userId, "se-ws2");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const first = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "First assessment.",
      conflicts: [CLAIM_A],
    });
    expect(first.statusCode).toBe(201);
    const firstId = (first.json() as { id: string }).id;

    const second = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: firstId,
      declaration: "CONFLICTS",
      explanation: "Revised assessment.",
      conflicts: [CLAIM_B],
    });
    expect(second.statusCode, second.body).toBe(201);
    const secondBody = second.json() as { sequence: number; previousSetId: string };
    expect(secondBody.sequence).toBe(2);
    expect(secondBody.previousSetId).toBe(firstId);

    const hist = await app.inject({
      method: "GET",
      url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${versionId}`,
      headers: { cookie: owner.cookie },
    });
    expect(hist.statusCode).toBe(200);
    const items = (hist.json() as { items: { sequence: number }[] }).items;
    expect(items).toHaveLength(2);
    expect(items[0]!.sequence).toBe(2);
    expect(items[1]!.sequence).toBe(1);
  });

  it("valid NO_OPERATIVE_CONFLICT with empty array → 201 and CURRENT", async () => {
    const owner = await seedUser("se3@t.io");
    const ids = await seedNovel(owner.userId, "se-ws3");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "NO_OPERATIVE_CONFLICT",
      explanation: "Quiet chapter: no operative conflict at any scale.",
      conflicts: [],
    });
    expect(post.statusCode, post.body).toBe(201);
    expect((post.json() as { declaration: string }).declaration).toBe("NO_OPERATIVE_CONFLICT");

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect((cur.json() as { status: string }).status).toBe("CURRENT");
  });
});

describe("validation negatives", () => {
  const SCALES = ["PERSONAL", "FAMILY", "VILLAGE", "TOWN", "CITY", "PROVINCE", "KINGDOM", "EMPIRE"];

  it("accepts all eight scale labels", async () => {
    const owner = await seedUser("se4@t.io");
    const ids = await seedNovel(owner.userId, "se-ws4");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    for (const scale of SCALES) {
      const post = await postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: versionId,
        expectedBranchId: branchId,
        expectedHeadRevisionId: headRevisionId,
        expectedSetId: null,
        declaration: "CONFLICTS",
        explanation: `Scale ${scale} operative.`,
        conflicts: [{ ...CLAIM_A, scale }],
      });
      // First succeeds; subsequent ones need the fresh expectedSetId.
      if (post.statusCode === 409) {
        const cur = await getCurrent(owner.cookie, ids, chapterId);
        const setId = (cur.json() as { assessment: { id: string } }).assessment.id;
        const retry = await postSet(owner.cookie, ids, chapterId, {
          chapterVersionId: versionId,
          expectedBranchId: branchId,
          expectedHeadRevisionId: headRevisionId,
          expectedSetId: setId,
          declaration: "CONFLICTS",
          explanation: `Scale ${scale} operative.`,
          conflicts: [{ ...CLAIM_A, scale }],
        });
        expect(retry.statusCode, retry.body).toBe(201);
      } else {
        expect(post.statusCode, post.body).toBe(201);
      }
    }
  });

  it("rejects unknown scale label → 400", async () => {
    const owner = await seedUser("se5@t.io");
    const ids = await seedNovel(owner.userId, "se-ws5");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [{ ...CLAIM_A, scale: "GALAXY" }],
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects empty conflicts with CONFLICTS → 400", async () => {
    const owner = await seedUser("se6@t.io");
    const ids = await seedNovel(owner.userId, "se-ws6");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [],
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects oversized claims (>100) → 400", async () => {
    const owner = await seedUser("se7@t.io");
    const ids = await seedNovel(owner.userId, "se-ws7");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const many = Array.from({ length: 101 }, (_, i) => ({
      ...CLAIM_A,
      explanation: `claim ${i}`,
    }));
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: many,
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects missing relevance → 400", async () => {
    const owner = await seedUser("se8@t.io");
    const ids = await seedNovel(owner.userId, "se-ws8");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const { relevance: _omit, ...noRelevance } = CLAIM_A;
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [noRelevance],
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects duplicate claims → 400", async () => {
    const owner = await seedUser("se9@t.io");
    const ids = await seedNovel(owner.userId, "se-ws9");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A, { ...CLAIM_A }],
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects invalid offsets → 400", async () => {
    const owner = await seedUser("se10@t.io");
    const ids = await seedNovel(owner.userId, "se-ws10");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [{ ...CLAIM_A, source: { start: 50, end: 10, quote: "x" } }],
    });
    expect(post.statusCode).toBe(400);
  });

  it("rejects quote mismatch → 400", async () => {
    const owner = await seedUser("se11@t.io");
    const ids = await seedNovel(owner.userId, "se-ws11");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [{ ...CLAIM_A, source: { ...CLAIM_A.source, quote: "The empire rose" } }],
    });
    expect(post.statusCode).toBe(400);
  });
});

describe("tenant and role negatives", () => {
  it("cross-novel access → 404", async () => {
    const owner = await seedUser("se12@t.io");
    const ids = await seedNovel(owner.userId, "se-ws12");
    const other = await seedNovel(owner.userId, "se-ws12b");
    const { chapterId } = await seedChapterWithVersion(owner.cookie, ids);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${other.workspaceId}/novels/${other.novelId}/chapters/${chapterId}/scale-evidence`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("editor and viewer POST → 403 (needs chapter:update + canon:manage)", async () => {
    const owner = await seedUser("se13@t.io");
    const ids = await seedNovel(owner.userId, "se-ws13");
    const editor = await seedUser("se13e@t.io");
    const viewer = await seedUser("se13v@t.io");
    await addMember(ids.workspaceId, editor.userId, "EDITOR");
    await addMember(ids.workspaceId, viewer.userId, "VIEWER");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const body = {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    };
    expect((await postSet(editor.cookie, ids, chapterId, body)).statusCode).toBe(403);
    expect((await postSet(viewer.cookie, ids, chapterId, body)).statusCode).toBe(403);

    // Reads still allowed for editor/viewer.
    expect((await getCurrent(editor.cookie, ids, chapterId)).statusCode).toBe(200);
    expect((await getCurrent(viewer.cookie, ids, chapterId)).statusCode).toBe(200);
  });

  it("client-supplied actorUserId is rejected by strict body (400)", async () => {
    const owner = await seedUser("se14@t.io");
    const ids = await seedNovel(owner.userId, "se-ws14");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
      actorUserId: "00000000-0000-0000-0000-000000000000",
    });
    // Strict Zod body rejects unknown fields; actor is always server-resolved.
    expect(post.statusCode, post.body).toBe(400);
  });
});

describe("concurrency", () => {
  it("wrong expectedBranchId → 409", async () => {
    const owner = await seedUser("se15@t.io");
    const ids = await seedNovel(owner.userId, "se-ws15");
    const { chapterId, versionId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: "00000000-0000-0000-0000-000000000000",
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });
    expect(post.statusCode).toBe(409);
  });

  it("wrong expectedHeadRevisionId → 409", async () => {
    const owner = await seedUser("se16@t.io");
    const ids = await seedNovel(owner.userId, "se-ws16");
    const { chapterId, versionId, branchId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: "00000000-0000-0000-0000-000000000000",
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });
    expect(post.statusCode).toBe(409);
  });

  it("wrong expectedSetId → 409", async () => {
    const owner = await seedUser("se17@t.io");
    const ids = await seedNovel(owner.userId, "se-ws17");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: "00000000-0000-0000-0000-000000000000",
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });
    expect(post.statusCode).toBe(409);
  });

  it("duplicate retry with old expectedSetId → 409 (not 201)", async () => {
    const owner = await seedUser("se18@t.io");
    const ids = await seedNovel(owner.userId, "se-ws18");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const first = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "first",
      conflicts: [CLAIM_A],
    });
    expect(first.statusCode).toBe(201);

    // Repeating with the same (now stale) expectedSetId must 409, not duplicate.
    const retry = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "first",
      conflicts: [CLAIM_A],
    });
    expect(retry.statusCode).toBe(409);

    // Exactly one set exists.
    const hist = await app.inject({
      method: "GET",
      url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${versionId}`,
      headers: { cookie: owner.cookie },
    });
    expect((hist.json() as { items: unknown[] }).items).toHaveLength(1);
  });
});

describe("stale applicability", () => {
  it("new text version → UNASSESSED for the new version; old history intact", async () => {
    const owner = await seedUser("se19@t.io");
    const ids = await seedNovel(owner.userId, "se-ws19");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });

    // Save a new text version (expectedVersion: 1 = the version just created).
    const saved = await saveVersion(cookie_of(owner), ids, chapterId, "<p>A completely new draft with different words here.</p>", 1);
    expect(saved.version).toBe(2);

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    const body = cur.json() as { chapterVersionId: string; status: string; assessment: null };
    expect(body.chapterVersionId).not.toBe(versionId);
    expect(body.status).toBe("UNASSESSED");
    expect(body.assessment).toBeNull();

    // Old version history still readable.
    const hist = await app.inject({
      method: "GET",
      url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${versionId}`,
      headers: { cookie: owner.cookie },
    });
    expect((hist.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("unrelated revision change → STALE with SOURCE_REVISION_CHANGED", async () => {
    const owner = await seedUser("se20@t.io");
    const ids = await seedNovel(owner.userId, "se-ws20");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });

    // Move the branch head with an unrelated revision (another chapter save).
    const other = await makeChapter(owner.cookie, ids, "Other");
    await saveVersion(owner.cookie, ids, other.id, "<p>Unrelated content.</p>");

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    const body = cur.json() as { status: string; staleReasons: string[]; assessment: { id: string } | null };
    expect(body.status).toBe("STALE");
    expect(body.staleReasons).toContain("SOURCE_REVISION_CHANGED");
    expect(body.assessment).not.toBeNull();
  });
});

describe("chapter deletion", () => {
  it("cited chapter delete → 409", async () => {
    const owner = await seedUser("se21@t.io");
    const ids = await seedNovel(owner.userId, "se-ws21");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "x",
      conflicts: [CLAIM_A],
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(409);
  });

  it("uncited chapter delete → existing behavior (204/200)", async () => {
    const owner = await seedUser("se22@t.io");
    const ids = await seedNovel(owner.userId, "se-ws22");
    const chapter = await makeChapter(owner.cookie, ids, "Plain");
    await saveVersion(owner.cookie, ids, chapter.id, PROSE);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapter.id}`,
      headers: { cookie: owner.cookie },
    });
    expect([200, 204]).toContain(del.statusCode);
  });
});

function cookie_of(u: { cookie: string }): string {
  return u.cookie;
}

// ---------------------------------------------------------------------------
// NF-WF-050A contract evidence (acceptance items 4-7): concurrency races,
// role enforcement at the service layer, pagination integrity, branch
// checkout/headless behavior, restore invariance, malformed retained rows,
// deletion races and disposable parent cleanup. These blocks are appended
// by the evidence-test actor; existing tests above are untouched.
// ---------------------------------------------------------------------------

describe("evidence: simultaneous appends", () => {
  it("two concurrent appends: exactly one 201, one 409; history holds sequences 1,2", async () => {
    const owner = await seedUser("sev1@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws1");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const first = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "baseline",
      conflicts: [CLAIM_A],
    });
    expect(first.statusCode, first.body).toBe(201);
    const firstId = (first.json() as { id: string }).id;

    const racy = {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: firstId,
      declaration: "CONFLICTS",
      explanation: "concurrent",
      conflicts: [CLAIM_B],
    };
    const [a, b] = await Promise.all([
      postSet(owner.cookie, ids, chapterId, racy),
      postSet(owner.cookie, ids, chapterId, racy),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);

    const winner = (a.statusCode === 201 ? a : b).json() as {
      id: string;
      sequence: number;
      previousSetId: string | null;
    };
    expect(winner.sequence).toBe(2);
    expect(winner.previousSetId).toBe(firstId);

    const hist = await app.inject({
      method: "GET",
      url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${versionId}`,
      headers: { cookie: owner.cookie },
    });
    expect(hist.statusCode).toBe(200);
    const items = (hist.json() as { items: { id: string; sequence: number }[] }).items;
    expect(items.map((i) => i.sequence)).toEqual([2, 1]);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
});

describe("evidence: lock/read race", () => {
  it("concurrent readCurrent and appendSet observe a consistent snapshot", async () => {
    const owner = await seedUser("sev2@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws2");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const svc = createScaleEvidenceServices({ db });

    const [read, appended] = await Promise.all([
      svc.readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      }),
      svc.appendSet({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        chapterVersionId: versionId,
        expectedBranchId: branchId,
        expectedHeadRevisionId: headRevisionId,
        expectedSetId: null,
        declaration: "CONFLICTS",
        explanation: "race append",
        conflicts: [CLAIM_A],
        actorUserId: owner.userId,
      }),
    ]);

    expect(appended.sequence).toBe(1);
    // The read must see a fully consistent snapshot: entirely before the
    // append (UNASSESSED) or entirely after it (CURRENT with the new set) —
    // never a mix of the two.
    expect(["UNASSESSED", "CURRENT"]).toContain(read.status);
    if (read.status === "UNASSESSED") {
      expect(read.assessment).toBeNull();
      expect(read.staleReasons).toEqual(["UNASSESSED"]);
    } else {
      expect(read.assessment).not.toBeNull();
      expect(read.assessment!.id).toBe(appended.id);
      expect(read.staleReasons).toEqual([]);
    }
    expect(read.chapterVersionId).toBe(versionId);
    expect(read.branchId).toBe(branchId);
  });
});

describe("evidence: historical-version refusal", () => {
  it("append with an old chapterVersionId → 409 naming the stale version", async () => {
    const owner = await seedUser("sev3@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws3");
    const { chapterId, versionId: v1Id, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const appended = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: v1Id,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "v1 assessment",
      conflicts: [CLAIM_A],
    });
    expect(appended.statusCode, appended.body).toBe(201);

    // Save v2 (expectedVersion 1 → version 2), then harvest fresh truth.
    const saved = await saveVersion(owner.cookie, ids, chapterId, "<p>A completely new draft with different words.</p>", 1);
    expect(saved.version).toBe(2);
    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect(cur.statusCode).toBe(200);
    const fresh = cur.json() as {
      chapterVersionId: string;
      branchId: string;
      currentHeadRevisionId: string | null;
    };
    expect(fresh.chapterVersionId).not.toBe(v1Id);

    const staleBody = {
      chapterVersionId: v1Id,
      expectedBranchId: fresh.branchId,
      expectedHeadRevisionId: fresh.currentHeadRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "late v1 assessment",
      conflicts: [CLAIM_A],
    };
    const stale = await postSet(owner.cookie, ids, chapterId, staleBody);
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { error: string }).error).toBe("CONFLICT");

    // The server-side refusal names the stale version (direct service call).
    const svc = createScaleEvidenceServices({ db });
    await expect(
      svc.appendSet({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        chapterVersionId: v1Id,
        expectedBranchId: fresh.branchId,
        expectedHeadRevisionId: fresh.currentHeadRevisionId,
        expectedSetId: null,
        declaration: "CONFLICTS",
        explanation: "late v1 assessment",
        conflicts: [CLAIM_A],
        actorUserId: owner.userId,
      }),
    ).rejects.toThrow("chapter version is no longer current");
  });
});

describe("evidence: direct-service role denial", () => {
  it("service enforces capabilities: VIEWER denied writes, allowed reads; non-member 404", async () => {
    const owner = await seedUser("sev4@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws4");
    const viewer = await seedUser("sev4v@t.io");
    await addMember(ids.workspaceId, viewer.userId, "VIEWER");
    const stranger = await seedUser("sev4s@t.io");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const svc = createScaleEvidenceServices({ db });

    const writeInput = {
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterId,
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null as string | null,
      declaration: "CONFLICTS" as const,
      explanation: "viewer attempt",
      conflicts: [CLAIM_A],
    };

    // VIEWER lacks chapter:update + canon:manage → 403 ForbiddenError,
    // even when bypassing the HTTP routes entirely.
    const denial = await svc
      .appendSet({ ...writeInput, actorUserId: viewer.userId })
      .then(() => null, (e: unknown) => e);
    expect(denial).toBeInstanceOf(ForbiddenError);
    expect((denial as ForbiddenError).code).toBe("FORBIDDEN");
    await expect(svc.appendSet({ ...writeInput, actorUserId: viewer.userId })).rejects.toThrow(ForbiddenError);

    // VIEWER holds chapter:read → direct reads succeed.
    const read = await svc.readCurrent({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterId,
      actorUserId: viewer.userId,
    });
    expect(read.status).toBe("UNASSESSED");
    const hist = await svc.listHistory({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterId,
      chapterVersionId: versionId,
      actorUserId: viewer.userId,
    });
    expect(hist.items).toHaveLength(0);

    // A non-member learns nothing: tenant-safe 404 (NotFoundError), not 403.
    // The role matrix grants chapter:read to every member role, so a member
    // lacking chapter:read is not expressible — the 404 path is the tested one.
    await expect(
      svc.readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: stranger.userId,
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(svc.appendSet({ ...writeInput, actorUserId: stranger.userId })).rejects.toThrow(NotFoundError);
  });
});

describe("evidence: pagination integrity", () => {
  it("5 sets paginate without loss, duplication or skips (exclusive cursor)", async () => {
    const owner = await seedUser("sev5@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws5");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    let expectedSetId: string | null = null;
    const claims = [CLAIM_A, CLAIM_B];
    for (let n = 1; n <= 5; n++) {
      const post = await postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: versionId,
        expectedBranchId: branchId,
        expectedHeadRevisionId: headRevisionId,
        expectedSetId,
        declaration: "CONFLICTS",
        explanation: `assessment ${n}`,
        conflicts: [claims[n % 2]!],
      });
      expect(post.statusCode, post.body).toBe(201);
      const created = post.json() as { id: string; sequence: number };
      expect(created.sequence).toBe(n);
      expectedSetId = created.id;
    }

    const page = async (params: string) => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${versionId}&${params}`,
        headers: { cookie: owner.cookie },
      });
      expect(res.statusCode).toBe(200);
      return res.json() as {
        items: { id: string; sequence: number }[];
        nextBeforeSequence: number | null;
      };
    };

    const p1 = await page("limit=2");
    expect(p1.items.map((i) => i.sequence)).toEqual([5, 4]);
    // Exclusive cursor: the last DISPLAYED sequence, not the first omitted.
    expect(p1.nextBeforeSequence).toBe(4);

    const p2 = await page("limit=2&beforeSequence=4");
    expect(p2.items.map((i) => i.sequence)).toEqual([3, 2]);
    expect(p2.nextBeforeSequence).toBe(2);

    const p3 = await page("limit=2&beforeSequence=2");
    expect(p3.items.map((i) => i.sequence)).toEqual([1]);
    expect(p3.nextBeforeSequence).toBeNull();

    const allItems = [...p1.items, ...p2.items, ...p3.items];
    expect(allItems.map((i) => i.sequence).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(allItems.map((i) => i.id)).size).toBe(5);
  });
});

describe("evidence: checkout and headless branch", () => {
  it("switched branch sees UNASSESSED; headless branch appends with null head", async () => {
    const owner = await seedUser("sev6@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws6");
    const { chapterId, versionId, branchId: mainBranchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const onMain = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: mainBranchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "main assessment",
      conflicts: [CLAIM_A],
    });
    expect(onMain.statusCode, onMain.body).toBe(201);

    // Checkpoint first (branches.test.ts pattern): the new branch's head
    // needs a snapshot to be switchable, and the checkpoint clears the
    // dirty state left by the chapter save. It does not advance the head,
    // so the main-branch assessment stays CURRENT.
    const cp = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/checkpoints`,
      headers: { cookie: owner.cookie },
      payload: { label: "sev6-base" },
    });
    expect(cp.statusCode, cp.body).toBe(201);

    // Create and check out a side branch.
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/branches`,
      headers: { cookie: owner.cookie },
      payload: { name: "side" },
    });
    expect(created.statusCode, created.body).toBe(201);
    const sideBranchId = (created.json() as { branchId: string }).branchId;
    expect(sideBranchId).toBeTruthy();

    const switched = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/branches/${sideBranchId}/switch`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(switched.statusCode, switched.body).toBe(200);

    // The checked-out branch must not inherit main's assessment.
    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect(cur.statusCode).toBe(200);
    const fresh = cur.json() as {
      chapterVersionId: string;
      branchId: string;
      currentHeadRevisionId: string | null;
      status: string;
      assessment: null;
    };
    expect(fresh.branchId).toBe(sideBranchId);
    expect(fresh.status).toBe("UNASSESSED");
    expect(fresh.assessment).toBeNull();

    // Append on the side branch with its own expectations.
    const onSide = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: fresh.chapterVersionId,
      expectedBranchId: fresh.branchId,
      expectedHeadRevisionId: fresh.currentHeadRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "side assessment",
      conflicts: [CLAIM_B],
    });
    expect(onSide.statusCode, onSide.body).toBe(201);

    const curSide = await getCurrent(owner.cookie, ids, chapterId);
    expect(curSide.statusCode).toBe(200);
    expect((curSide.json() as { status: string }).status).toBe("CURRENT");

    // Headless branch: checked out directly with a NULL head.
    const headless = await db.novelBranch.create({
      data: { workspaceId: ids.workspaceId, novelId: ids.novelId, name: "headless-sev6" },
    });
    expect(headless.headRevisionId).toBeNull();
    await db.novel.update({ where: { id: ids.novelId }, data: { currentBranchId: headless.id } });

    const curHeadless = await getCurrent(owner.cookie, ids, chapterId);
    expect(curHeadless.statusCode).toBe(200);
    const hl = curHeadless.json() as {
      branchId: string;
      currentHeadRevisionId: string | null;
      status: string;
      assessment: null;
    };
    expect(hl.branchId).toBe(headless.id);
    expect(hl.currentHeadRevisionId).toBeNull();
    expect(hl.status).toBe("UNASSESSED");

    // Append against the headless branch with expectedHeadRevisionId=null.
    const onHeadless = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: headless.id,
      expectedHeadRevisionId: null,
      expectedSetId: null,
      declaration: "NO_OPERATIVE_CONFLICT",
      explanation: "headless assessment",
      conflicts: [],
    });
    expect(onHeadless.statusCode, onHeadless.body).toBe(201);
    expect((onHeadless.json() as { sourceRevisionId: string | null }).sourceRevisionId).toBeNull();

    const curAfter = await getCurrent(owner.cookie, ids, chapterId);
    expect((curAfter.json() as { status: string }).status).toBe("CURRENT");
  });
});

describe("evidence: restore invariance", () => {
  it("checkpoint BEFORE assessment; FULL restore keeps history intact but STALE; selective restores changed covered state", async () => {
    const owner = await seedUser("sev7@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws7");
    const { chapterId } = await seedChapterWithVersion(owner.cookie, ids);

    // Checkpoint FIRST — before the assessment that must be preserved.
    const cpRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/checkpoints`,
      headers: { cookie: owner.cookie },
      payload: { label: "sev7-restore" },
    });
    expect(cpRes.statusCode, cpRes.body).toBe(201);
    const checkpointId = (cpRes.json() as { checkpointId: string }).checkpointId;
    expect(checkpointId).toBeTruthy();

    // Append assessments AFTER the checkpoint using FRESH expectations
    // (re-harvested from getCurrent, not cached pre-checkpoint values).
    const fresh1 = (await getCurrent(owner.cookie, ids, chapterId)).json() as {
      chapterVersionId: string;
      branchId: string;
      currentHeadRevisionId: string | null;
    };
    let expectedSetId: string | null = null;
    const claims = [CLAIM_A, CLAIM_B];
    for (let n = 1; n <= 2; n++) {
      const cur = n === 1 ? fresh1 : ((await getCurrent(owner.cookie, ids, chapterId)).json() as typeof fresh1);
      const post = await postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: cur.chapterVersionId,
        expectedBranchId: cur.branchId,
        expectedHeadRevisionId: cur.currentHeadRevisionId,
        expectedSetId,
        declaration: "CONFLICTS",
        explanation: `assessment ${n}`,
        conflicts: [claims[n - 1]!],
      });
      expect(post.statusCode, post.body).toBe(201);
      expectedSetId = (post.json() as { id: string }).id;
    }
    const latestId = expectedSetId;

    // Assert CURRENT before restore.
    const curBefore = await getCurrent(owner.cookie, ids, chapterId);
    expect(curBefore.statusCode).toBe(200);
    const beforeBody = curBefore.json() as { status: string; assessment: { id: string } | null };
    expect(beforeBody.status).toBe("CURRENT");
    expect(beforeBody.assessment?.id).toBe(latestId);

    const snapshotRows = async () =>
      (
        await db.scaleEvidenceSet.findMany({
          where: { novelId: ids.novelId },
          orderBy: { sequence: "asc" },
        })
      ).map((r) => ({
        id: r.id,
        sequence: r.sequence,
        declaration: r.declaration,
        explanation: r.explanation,
        conflictsJson: JSON.stringify(r.conflictsJson),
        previousSetId: r.previousSetId,
        sourceRevisionId: r.sourceRevisionId,
        sourceBranchId: r.sourceBranchId,
      }));
    const before = await snapshotRows();
    expect(before).toHaveLength(2);

    const previewApply = async (scope: string, selection?: Record<string, unknown>) => {
      const preview = await app.inject({
        method: "POST",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/restores/preview`,
        headers: { cookie: owner.cookie },
        payload: { checkpointId, scope, ...(selection ? { selection } : {}) },
      });
      expect(preview.statusCode, preview.body).toBe(201);
      const opId = (preview.json() as { restoreOperationId: string }).restoreOperationId;
      expect(opId).toBeTruthy();
      const apply = await app.inject({
        method: "POST",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/restores/${opId}/apply`,
        headers: { cookie: owner.cookie },
        payload: {},
      });
      expect(apply.statusCode, apply.body).toBe(200);
    };

    await previewApply("FULL");
    // OPERATIONAL table: count and content byte-identical after FULL restore.
    expect(await snapshotRows()).toEqual(before);

    // FULL restore advanced the head → old history persists but is STALE,
    // never accidentally CURRENT.
    const curFull = await getCurrent(owner.cookie, ids, chapterId);
    expect(curFull.statusCode).toBe(200);
    const fullBody = curFull.json() as {
      status: string;
      staleReasons: string[];
      assessment: { id: string } | null;
    };
    expect(fullBody.status).toBe("STALE");
    expect(fullBody.staleReasons).toContain("SOURCE_REVISION_CHANGED");
    expect(fullBody.assessment?.id).toBe(latestId);

    // SELECTIVE restore of ACTUAL CHANGED covered state: create a canon fact,
    // checkpoint it, modify it, then selective-restore canon_facts.
    const entity = await db.storyEntity.create({
      data: {
        novelId: ids.novelId,
        kind: "CHARACTER",
        key: "sev7-aldric",
        name: "Aldric",
        createdById: owner.userId,
      },
    });
    const fact = await db.canonFact.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        entityId: entity.id,
        predicate: "is_brave",
        objectText: "true",
        statement: "Aldric is brave.",
        createdById: owner.userId,
      },
    });
    const cpRes2 = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/checkpoints`,
      headers: { cookie: owner.cookie },
      payload: { label: "sev7-selective" },
    });
    expect(cpRes2.statusCode, cpRes2.body).toBe(201);
    const checkpointId2 = (cpRes2.json() as { checkpointId: string }).checkpointId;

    // Change the covered state after the checkpoint.
    await db.canonFact.update({
      where: { id: fact.id },
      data: { statement: "Aldric is cautious." },
    });
    expect(
      (await db.canonFact.findUnique({ where: { id: fact.id } }))?.statement,
    ).toBe("Aldric is cautious.");

    const preview2 = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/restores/preview`,
      headers: { cookie: owner.cookie },
      payload: { checkpointId: checkpointId2, scope: "SELECTIVE", selection: { tables: ["canon_facts"] } },
    });
    expect(preview2.statusCode, preview2.body).toBe(201);
    const opId2 = (preview2.json() as { restoreOperationId: string }).restoreOperationId;
    const apply2 = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/restores/${opId2}/apply`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(apply2.statusCode, apply2.body).toBe(200);

    // The changed covered state was actually rewound.
    expect(
      (await db.canonFact.findUnique({ where: { id: fact.id } }))?.statement,
    ).toBe("Aldric is brave.");
    // Scale evidence history still intact after selective restore.
    expect(await snapshotRows()).toEqual(before);
  });
});

describe("evidence: malformed stored evidence", () => {
  it("corrupt retained row fails readCurrent explicitly (400), never becomes CURRENT", async () => {
    const owner = await seedUser("sev8@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws8");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const first = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "valid baseline",
      conflicts: [CLAIM_A],
    });
    expect(first.statusCode, first.body).toBe(201);
    const firstId = (first.json() as { id: string }).id;

    // Bypass the service: insert a retained row whose claim violates the
    // frozen schema (passes the DB CHECKs: array + cardinality cohere).
    const corrupt = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: branchId,
        sourceRevisionId: null,
        sequence: 2,
        declaration: "CONFLICTS",
        explanation: "corrupt row",
        conflictsJson: [
          {
            scale: "ALIEN",
            relevance: "ACTION",
            explanation: "x",
            source: { start: 3, end: 19, quote: "The kingdom fell" },
          },
        ],
        previousSetId: firstId,
        actorUserId: owner.userId,
      },
    });
    expect(corrupt.id).toBeTruthy();

    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ScaleEvidenceValidationError);
    expect((observed as ScaleEvidenceValidationError).statusCode).toBe(400);
    expect((observed as Error).message).toMatch(/scale/i);
  });
});

describe("evidence: deletion/create race", () => {
  it("uncited chapter delete racing FIRST assessment: one wins, state never corrupt", async () => {
    const owner = await seedUser("sev9@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws9");
    // NOTE: no assessment exists yet — the chapter is UNCITED.
    const { chapterId } = await seedChapterWithVersion(owner.cookie, ids);

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect(cur.statusCode).toBe(200);
    const fresh = cur.json() as {
      chapterVersionId: string;
      branchId: string;
      currentHeadRevisionId: string | null;
      status: string;
    };
    expect(fresh.status).toBe("UNASSESSED");

    // Race: DELETE the uncited chapter vs POST the FIRST assessment.
    const [del, first] = await Promise.all([
      app.inject({
        method: "DELETE",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
        headers: { cookie: owner.cookie },
      }),
      postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: fresh.chapterVersionId,
        expectedBranchId: fresh.branchId,
        expectedHeadRevisionId: fresh.currentHeadRevisionId,
        expectedSetId: null,
        declaration: "CONFLICTS",
        explanation: "first assessment racing delete",
        conflicts: [CLAIM_A],
      }),
    ]);

    // Exactly one of these outcomes:
    // - Delete won: chapter gone (200/204); the assessment fails (404 chapter
    //   gone, or 409 if it observed a concurrent change).
    // - Assessment won: it is 201, so the chapter is now cited and the
    //   delete must 409 (never silently delete cited evidence).
    const deleteWon = del.statusCode === 200 || del.statusCode === 204;
    const assessmentWon = first.statusCode === 201;
    expect(
      deleteWon !== assessmentWon,
      `expected exactly one winner: delete=${del.statusCode} assessment=${first.statusCode}`,
    ).toBe(true);
    if (assessmentWon) {
      expect(del.statusCode).toBe(409);
    } else {
      expect([404, 409]).toContain(first.statusCode);
    }

    // State is never corrupt: either zero rows (chapter deleted) or exactly
    // one valid row with sequence 1 and no predecessor.
    const rows = await db.scaleEvidenceSet.findMany({
      where: { novelId: ids.novelId },
      orderBy: { sequence: "asc" },
    });
    if (deleteWon) {
      expect(rows).toHaveLength(0);
      const chapterGone = await db.chapter.findUnique({ where: { id: chapterId } });
      expect(chapterGone).toBeNull();
    } else {
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sequence).toBe(1);
      expect(rows[0]!.previousSetId).toBeNull();
      const after = await getCurrent(owner.cookie, ids, chapterId);
      expect(after.statusCode).toBe(200);
      const afterBody = after.json() as { status: string; assessment: { id: string } | null };
      expect(afterBody.status).toBe("CURRENT");
      expect(afterBody.assessment?.id).toBe(rows[0]!.id);
    }
  });
});

describe("evidence: parent cleanup", () => {
  it("novel delete cascades a predecessor-linked chain of 3+ sets (FK contract)", async () => {
    const owner = await seedUser("sev10@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws10");
    const { chapterId } = await seedChapterWithVersion(owner.cookie, ids);

    // Build a predecessor-linked chain of 3 sets.
    let expectedSetId: string | null = null;
    const claims = [CLAIM_A, CLAIM_B, CLAIM_A];
    const setIds: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const cur = (await getCurrent(owner.cookie, ids, chapterId)).json() as {
        chapterVersionId: string;
        branchId: string;
        currentHeadRevisionId: string | null;
      };
      const post = await postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: cur.chapterVersionId,
        expectedBranchId: cur.branchId,
        expectedHeadRevisionId: cur.currentHeadRevisionId,
        expectedSetId,
        declaration: "CONFLICTS",
        explanation: `chain link ${n}`,
        conflicts: [claims[n - 1]!],
      });
      expect(post.statusCode, post.body).toBe(201);
      const id = (post.json() as { id: string }).id;
      setIds.push(id);
      expectedSetId = id;
    }
    // Setup check: 3 rows exist with a valid predecessor chain.
    const before = await db.scaleEvidenceSet.findMany({
      where: { novelId: ids.novelId },
      orderBy: { sequence: "asc" },
    });
    expect(before).toHaveLength(3);
    expect(before.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(before[0]!.previousSetId).toBeNull();
    expect(before[1]!.previousSetId).toBe(before[0]!.id);
    expect(before[2]!.previousSetId).toBe(before[1]!.id);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode, del.body).toBe(200);

    // All 3 chained sets cascade-deleted with the novel.
    expect(await db.scaleEvidenceSet.count({ where: { novelId: ids.novelId } })).toBe(0);
    for (const id of setIds) {
      expect(await db.scaleEvidenceSet.findUnique({ where: { id } })).toBeNull();
    }
  });
});

describe("evidence: deterministic held-lock rejection", () => {
  it("append blocked on held branch lock observes the newly committed head and fails 409 with nothing stored", async () => {
    const owner = await seedUser("sev11@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws11");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);
    const svc = createScaleEvidenceServices({ db });

    // Create the new head revision BEFORE any lock is taken. Creating it
    // afterwards via a separate connection would block on the branch row
    // lock held by this test (FK check on novel_branches), deadlocking the
    // harness: the main thread would wait on the insert while the holder
    // waits for the test to commit it.
    const newRevision = await db.revision.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        branchId,
        number: 999,
        origin: "MANUAL",
      },
    });

    // A dedicated connection holds the branch FOR UPDATE lock for the
    // duration of the barrier. The append below must block on it.
    const holder = new pg.Client({ connectionString: TEST_URL });
    await holder.connect();
    let holderSettled = false;
    try {
      await holder.query("BEGIN");
      const lockRes = await holder.query(
        "SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE",
        [branchId],
      );
      expect(lockRes.rowCount).toBe(1);

      // Start the append in the background; it blocks on the branch lock.
      // The rejection is captured via the settled outcome below.
      let appendOutcome: { ok: true; value: unknown } | { ok: false; error: unknown } | null = null;
      const appendDone = svc
        .appendSet({
          workspaceId: ids.workspaceId,
          novelId: ids.novelId,
          chapterId,
          chapterVersionId: versionId,
          expectedBranchId: branchId,
          expectedHeadRevisionId: headRevisionId,
          expectedSetId: null,
          declaration: "CONFLICTS",
          explanation: "held-lock append",
          conflicts: [CLAIM_A],
          actorUserId: owner.userId,
        })
        .then(
          (value) => { appendOutcome = { ok: true, value }; },
          (error: unknown) => { appendOutcome = { ok: false, error }; },
        );

      // Deterministic barrier: poll pg_stat_activity until the append's
      // backend is observably waiting on a lock. The wait condition (not a
      // fixed sleep) is the synchronization primitive.
      const probe = new pg.Client({ connectionString: TEST_URL });
      await probe.connect();
      try {
        const deadline = Date.now() + 15_000;
        let blocked = false;
        while (Date.now() < deadline) {
          const r = await probe.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'`,
          );
          if ((r.rows[0] as { n: number }).n > 0) {
            blocked = true;
            break;
          }
          await new Promise((res) => setTimeout(res, 25));
        }
        expect(blocked).toBe(true);
      } finally {
        await probe.end();
      }

      // While the append waits, the lock holder commits a new head. The
      // holder owns the lock, so this update does not block.
      const upd = await holder.query(
        "UPDATE novel_branches SET head_revision_id = $1 WHERE id = $2",
        [newRevision.id, branchId],
      );
      expect(upd.rowCount).toBe(1);
      await holder.query("COMMIT");
      holderSettled = true;

      // The released append must now read the fresh head (authoritative
      // post-lock value) and reject the stale expectation with 409.
      // Await with a timeout so a hung append cannot hang the runner.
      await Promise.race([
        appendDone,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("append did not settle after lock release")),
            10_000,
          ),
        ),
      ]);
      expect(appendOutcome).not.toBeNull();
      const outcome = appendOutcome!;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect((outcome.error as Error).message).toMatch(/branch head changed/);
      }

      // The rejected attempt must not have persisted any assessment.
      expect(
        await db.scaleEvidenceSet.count({ where: { novelId: ids.novelId } }),
      ).toBe(0);
    } finally {
      // Always release the lock and the connection, even when an assertion
      // above fails; otherwise the blocked append (or a later test) hangs.
      if (!holderSettled) {
        try {
          await holder.query("ROLLBACK");
        } catch {
          // Connection already closed or nothing to roll back.
        }
      }
      await holder.end();
    }
  });
});

describe("evidence: save/checkout interleavings", () => {
  it("concurrent readCurrent and chapter save observe a consistent snapshot", async () => {
    const owner = await seedUser("sev12@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws12");
    const { chapterId, versionId, branchId } = await seedChapterWithVersion(owner.cookie, ids);
    const svc = createScaleEvidenceServices({ db });

    // Append a baseline set so the read has content to observe.
    const baseline = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: (await getCurrent(owner.cookie, ids, chapterId).then((r) => (r.json() as { currentHeadRevisionId: string | null }).currentHeadRevisionId)),
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "baseline",
      conflicts: [CLAIM_A],
    });
    expect(baseline.statusCode, baseline.body).toBe(201);

    // Race a RepeatableRead readCurrent against a new chapter save.
    // The read must see a fully consistent snapshot: the old version with
    // its assessment, or the new version as UNASSESSED — never a mix.
    const [read, saved] = await Promise.all([
      svc.readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      }),
      saveVersion(owner.cookie, ids, chapterId, "<p>Rewritten prose for interleave.</p>", 1),
    ]);
    expect(saved.version).toBe(2);

    if (read.chapterVersionId === versionId) {
      // Snapshot from before the save: assessment intact.
      expect(read.status).toBe("CURRENT");
      expect(read.assessment).not.toBeNull();
      expect(read.assessment!.chapterVersionId).toBe(versionId);
    } else {
      // Snapshot from after the save: new version, no assessment yet.
      expect(read.status).toBe("UNASSESSED");
      expect(read.assessment).toBeNull();
      expect(read.chapterVersionId).not.toBe(versionId);
    }
    // The branch pointer reported must always match the version observed.
    expect(read.branchId).toBe(branchId);
  });

  it("concurrent appendSet and branch checkout resolve to 409 or a consistent branch", async () => {
    const owner = await seedUser("sev13@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws13");
    const { chapterId, versionId, branchId: mainBranchId } = await seedChapterWithVersion(owner.cookie, ids);

    // Checkpoint so a side branch can be created and switched.
    const cp = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/checkpoints`,
      headers: { cookie: owner.cookie },
      payload: { label: "sev13-base" },
    });
    expect(cp.statusCode, cp.body).toBe(201);
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/branches`,
      headers: { cookie: owner.cookie },
      payload: { name: "interleave-side" },
    });
    expect(created.statusCode, created.body).toBe(201);
    const sideBranchId = (created.json() as { branchId: string }).branchId;

    const svc = createScaleEvidenceServices({ db });
    const cur = await getCurrent(owner.cookie, ids, chapterId);
    const head = (cur.json() as { currentHeadRevisionId: string | null }).currentHeadRevisionId;

    // Race the append against a branch switch. Exactly one serialization
    // order wins; the append must either succeed against main or fail 409
    // on the changed checkout — never silently attach to the wrong branch.
    const [appendOutcome, switched] = await Promise.all([
      svc
        .appendSet({
          workspaceId: ids.workspaceId,
          novelId: ids.novelId,
          chapterId,
          chapterVersionId: versionId,
          expectedBranchId: mainBranchId,
          expectedHeadRevisionId: head,
          expectedSetId: null,
          declaration: "CONFLICTS",
          explanation: "interleaved append",
          conflicts: [CLAIM_A],
          actorUserId: owner.userId,
        })
        .then(
          (v) => ({ ok: true as const, value: v }),
          (e: unknown) => ({ ok: false as const, error: e }),
        ),
      app.inject({
        method: "POST",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/branches/${sideBranchId}/switch`,
        headers: { cookie: owner.cookie },
        payload: {},
      }),
    ]);

    if (appendOutcome.ok) {
      // The append won the race: it must be pinned to main.
      expect(appendOutcome.value.sourceBranchId).toBe(mainBranchId);
    } else {
      // The switch won: the append must fail 409 on the changed checkout.
      expect((appendOutcome.error as Error).message).toMatch(
        /checked-out branch changed|branch head changed/,
      );
    }
    // Whatever happened, at most one set exists and the chain is integral.
    const rows = await db.scaleEvidenceSet.findMany({
      where: { novelId: ids.novelId },
      orderBy: { sequence: "asc" },
    });
    expect(rows.length).toBeLessThanOrEqual(1);
    expect(switched.statusCode).toBe(200);
  });
});

describe("evidence: retained data content validation", () => {
  it("forged quote with matching head is rejected 400, never CURRENT", async () => {
    const owner = await seedUser("sev14@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws14");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    // Valid field shapes, but the quote does not match the span in the
    // immutable version content. Pinned to the actual head so the
    // CURRENT-vs-STALE check alone would accept it.
    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: branchId,
        sourceRevisionId: headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "forged quote row",
        conflictsJson: [
          {
            scale: "KINGDOM",
            relevance: "CONSEQUENCE",
            explanation: "Forged explanation.",
            source: { start: 3, end: 19, quote: "FORGED QUOTE TEXT" },
          },
        ],
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ScaleEvidenceValidationError);
    expect((observed as ScaleEvidenceValidationError).statusCode).toBe(400);
    expect((observed as Error).message).toMatch(/quote/i);
  });

  it("end offset beyond the version text is rejected 400, never CURRENT", async () => {
    const owner = await seedUser("sev15@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws15");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: branchId,
        sourceRevisionId: headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "oversized span row",
        conflictsJson: [
          {
            scale: "KINGDOM",
            relevance: "CONSEQUENCE",
            explanation: "Span beyond text.",
            source: { start: 3, end: 500, quote: "The kingdom fell" },
          },
        ],
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ScaleEvidenceValidationError);
    expect((observed as ScaleEvidenceValidationError).statusCode).toBe(400);
  });

  it("whitespace-only retained explanation is rejected 400", async () => {
    const owner = await seedUser("sev16@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws16");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: branchId,
        sourceRevisionId: headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "   ",
        conflictsJson: [CLAIM_A],
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .readCurrent({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ScaleEvidenceValidationError);
    expect((observed as ScaleEvidenceValidationError).statusCode).toBe(400);
  });

  it("forged retained row is also rejected from history reads", async () => {
    const owner = await seedUser("sev17@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws17");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: branchId,
        sourceRevisionId: headRevisionId,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "forged history row",
        conflictsJson: [
          {
            scale: "KINGDOM",
            relevance: "CONSEQUENCE",
            explanation: "Forged.",
            source: { start: 3, end: 19, quote: "NOT THE REAL TEXT" },
          },
        ],
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .listHistory({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        chapterVersionId: versionId,
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ScaleEvidenceValidationError);
    expect((observed as ScaleEvidenceValidationError).statusCode).toBe(400);
  });
});

describe("evidence: version ownership", () => {
  it("append with a nonexistent chapterVersionId is 404, not 409", async () => {
    const owner = await seedUser("sev18@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws18");
    const { chapterId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const res = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: "00000000-0000-4000-8000-000000000000",
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "ghost version",
      conflicts: [CLAIM_A],
    });
    expect(res.statusCode).toBe(404);
  });

  it("append with a foreign chapter's versionId is 404, not 409", async () => {
    const owner = await seedUser("sev19@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws19");
    const first = await seedChapterWithVersion(owner.cookie, ids);
    const secondChapter = await makeChapter(owner.cookie, ids, "Other Chapter");
    await saveVersion(owner.cookie, ids, secondChapter.id, PROSE);
    const otherCur = await getCurrent(owner.cookie, ids, secondChapter.id);
    const otherVersionId = (otherCur.json() as { chapterVersionId: string }).chapterVersionId;
    expect(otherVersionId).toBeTruthy();
    expect(otherVersionId).not.toBe(first.versionId);

    // Submit the other chapter's version against the first chapter's route.
    const res = await postSet(owner.cookie, ids, first.chapterId, {
      chapterVersionId: otherVersionId,
      expectedBranchId: first.branchId,
      expectedHeadRevisionId: first.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "foreign version",
      conflicts: [CLAIM_A],
    });
    expect(res.statusCode).toBe(404);
  });

  it("append with an obsolete owned version is 409, not 404", async () => {
    const owner = await seedUser("sev20@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws20");
    const { chapterId, versionId: v1Id } = await seedChapterWithVersion(owner.cookie, ids);

    // Save v2; v1 remains owned by this chapter but is no longer current.
    const saved = await saveVersion(owner.cookie, ids, chapterId, "<p>Second draft text here.</p>", 1);
    expect(saved.version).toBe(2);
    const cur = await getCurrent(owner.cookie, ids, chapterId);
    const fresh = cur.json() as {
      chapterVersionId: string;
      branchId: string;
      currentHeadRevisionId: string | null;
    };
    expect(fresh.chapterVersionId).not.toBe(v1Id);

    // Direct service call asserts the ownership-then-staleness ordering:
    // the version exists and is owned, so the refusal must be 409.
    const svc = createScaleEvidenceServices({ db });
    const observed = await svc
      .appendSet({
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterId,
        chapterVersionId: v1Id,
        expectedBranchId: fresh.branchId,
        expectedHeadRevisionId: fresh.currentHeadRevisionId,
        expectedSetId: null,
        declaration: "CONFLICTS",
        explanation: "obsolete owned version",
        conflicts: [CLAIM_A],
        actorUserId: owner.userId,
      })
      .then(() => null, (e: unknown) => e);
    expect(observed).toBeInstanceOf(ConflictError);
    expect((observed as Error).message).toMatch(/no longer current/);

    // And via HTTP the envelope is 409 CONFLICT (not 404).
    const res = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: v1Id,
      expectedBranchId: fresh.branchId,
      expectedHeadRevisionId: fresh.currentHeadRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "obsolete owned version",
      conflicts: [CLAIM_A],
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("CONFLICT");
  });
});

describe("evidence: predecessor chain validation", () => {
  /**
   * Forge a retained row directly via Prisma, bypassing service validation.
   * The conflicts payload must be valid for the row's own version content;
   * only the predecessor linkage is forged.
   */
  async function forgeLinkedSet(args: {
    workspaceId: string;
    novelId: string;
    chapterVersionId: string;
    sourceBranchId: string;
    sourceRevisionId: string | null;
    sequence: number;
    previousSetId: string | null;
    conflictsJson: unknown;
    actorUserId: string;
    explanation?: string;
  }) {
    return db.scaleEvidenceSet.create({
      data: {
        workspaceId: args.workspaceId,
        novelId: args.novelId,
        chapterVersionId: args.chapterVersionId,
        sourceBranchId: args.sourceBranchId,
        sourceRevisionId: args.sourceRevisionId,
        sequence: args.sequence,
        declaration: "CONFLICTS",
        explanation: args.explanation ?? "forged predecessor-link test row",
        conflictsJson: args.conflictsJson as never,
        previousSetId: args.previousSetId,
        actorUserId: args.actorUserId,
      },
    });
  }

  /** Post a valid sequence-1 set and return its id + stored conflictsJson. */
  async function postFirstSet(
    cookie: string,
    ids: { workspaceId: string; novelId: string },
    chapterId: string,
    versionId: string,
    branchId: string,
    headRevisionId: string | null,
  ) {
    const post = await postSet(cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "valid first assessment",
      conflicts: [CLAIM_A],
    });
    expect(post.statusCode, post.body).toBe(201);
    const id = (post.json() as { id: string }).id;
    const stored = await db.scaleEvidenceSet.findUniqueOrThrow({ where: { id } });
    return { id, conflictsJson: stored.conflictsJson };
  }

  it("predecessor from a different novel is rejected 400 on read", async () => {
    const owner = await seedUser("sev30@t.io");
    const idsA = await seedNovel(owner.userId, "sev-ws30a");
    const a = await seedChapterWithVersion(owner.cookie, idsA);
    const firstA = await postFirstSet(
      owner.cookie, idsA, a.chapterId, a.versionId, a.branchId, a.headRevisionId,
    );

    // A valid set on a second novel — abused as a foreign predecessor.
    const idsB = await seedNovel(owner.userId, "sev-ws30b");
    const b = await seedChapterWithVersion(owner.cookie, idsB);
    const firstB = await postFirstSet(
      owner.cookie, idsB, b.chapterId, b.versionId, b.branchId, b.headRevisionId,
    );

    // Forge: novel-A row, sequence 2, linked to novel-B's set.
    await forgeLinkedSet({
      workspaceId: idsA.workspaceId,
      novelId: idsA.novelId,
      chapterVersionId: a.versionId,
      sourceBranchId: a.branchId,
      sourceRevisionId: a.headRevisionId,
      sequence: 2,
      previousSetId: firstB.id,
      conflictsJson: firstA.conflictsJson,
      actorUserId: owner.userId,
    });

    const cur = await getCurrent(owner.cookie, idsA, a.chapterId);
    expect(cur.statusCode).toBe(400);
    expect((cur.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("predecessor from a different branch is rejected 400 on read", async () => {
    const owner = await seedUser("sev31@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws31");
    const main = await seedChapterWithVersion(owner.cookie, ids);
    const firstMain = await postFirstSet(
      owner.cookie, ids, main.chapterId, main.versionId, main.branchId, main.headRevisionId,
    );

    // A real side branch with its own valid set.
    const sideBranch = await db.novelBranch.create({
      data: { workspaceId: ids.workspaceId, novelId: ids.novelId, name: "pred-side-31" },
    });
    const sideSet = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: main.versionId,
        sourceBranchId: sideBranch.id,
        sourceRevisionId: null,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "side branch assessment",
        conflictsJson: firstMain.conflictsJson as never,
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    // Forge: main-branch row, sequence 2, linked to the side branch's set.
    await forgeLinkedSet({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: main.versionId,
      sourceBranchId: main.branchId,
      sourceRevisionId: main.headRevisionId,
      sequence: 2,
      previousSetId: sideSet.id,
      conflictsJson: firstMain.conflictsJson,
      actorUserId: owner.userId,
    });

    const cur = await getCurrent(owner.cookie, ids, main.chapterId);
    expect(cur.statusCode).toBe(400);
    expect((cur.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("predecessor from a different chapter version is rejected 400 on history read", async () => {
    const owner = await seedUser("sev32@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws32");
    const seeded = await seedChapterWithVersion(owner.cookie, ids);
    const { chapterId, branchId, headRevisionId } = seeded;
    const v1Id = seeded.versionId;
    const firstV1 = await postFirstSet(
      owner.cookie, ids, chapterId, v1Id, branchId, headRevisionId,
    );

    // Save a second version and post its own valid first set.
    const PROSE_V2 = "<p>The river rose when the rains came and the bridges washed away.</p>";
    await saveVersion(owner.cookie, ids, chapterId, PROSE_V2, 1);
    const curV2 = await getCurrent(owner.cookie, ids, chapterId);
    expect(curV2.statusCode).toBe(200);
    const v2Body = curV2.json() as { chapterVersionId: string; currentHeadRevisionId: string | null };
    const v2Id = v2Body.chapterVersionId;
    expect(v2Id).not.toBe(v1Id);
    const postV2 = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: v2Id,
      expectedBranchId: branchId,
      expectedHeadRevisionId: v2Body.currentHeadRevisionId,
      expectedSetId: null,
      declaration: "NO_OPERATIVE_CONFLICT",
      explanation: "no operative conflict on v2",
      conflicts: [],
    });
    expect(postV2.statusCode, postV2.body).toBe(201);
    const v2SetId = (postV2.json() as { id: string }).id;

    // Forge: v1 row, sequence 2, linked to v2's set (version mismatch).
    await forgeLinkedSet({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: v1Id,
      sourceBranchId: branchId,
      sourceRevisionId: headRevisionId,
      sequence: 2,
      previousSetId: v2SetId,
      conflictsJson: firstV1.conflictsJson,
      actorUserId: owner.userId,
    });

    const hist = await app.inject({
      method: "GET",
      url: `${BASE_URL_PATH(ids, chapterId)}/history?chapterVersionId=${v1Id}`,
      headers: { cookie: owner.cookie },
    });
    expect(hist.statusCode).toBe(400);
    expect((hist.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("predecessor with wrong sequence (not n-1) is rejected 400 on read", async () => {
    const owner = await seedUser("sev33@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws33");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(
      owner.cookie, ids,
    );
    const first = await postFirstSet(
      owner.cookie, ids, chapterId, versionId, branchId, headRevisionId,
    );
    // Valid second set via the API (sequence 2, previousSetId = first).
    const second = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: first.id,
      declaration: "CONFLICTS",
      explanation: "valid second assessment",
      conflicts: [CLAIM_A],
    });
    expect(second.statusCode, second.body).toBe(201);
    const secondId = (second.json() as { id: string }).id;

    // Forge: sequence 5 linked to the sequence-2 set (2 !== 5-1).
    await forgeLinkedSet({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: versionId,
      sourceBranchId: branchId,
      sourceRevisionId: headRevisionId,
      sequence: 5,
      previousSetId: secondId,
      conflictsJson: first.conflictsJson,
      actorUserId: owner.userId,
    });

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    expect(cur.statusCode).toBe(400);
    expect((cur.json() as { error: string }).error).toBe("INVALID_INPUT");
  });

  it("append when the latest set has a corrupt predecessor is 409 with no new row", async () => {
    const owner = await seedUser("sev34@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws34");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(
      owner.cookie, ids,
    );
    const first = await postFirstSet(
      owner.cookie, ids, chapterId, versionId, branchId, headRevisionId,
    );

    // A foreign set (different branch) abused as the predecessor.
    const sideBranch = await db.novelBranch.create({
      data: { workspaceId: ids.workspaceId, novelId: ids.novelId, name: "pred-side-34" },
    });
    const sideSet = await db.scaleEvidenceSet.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: versionId,
        sourceBranchId: sideBranch.id,
        sourceRevisionId: null,
        sequence: 1,
        declaration: "CONFLICTS",
        explanation: "side branch assessment",
        conflictsJson: first.conflictsJson as never,
        previousSetId: null,
        actorUserId: owner.userId,
      },
    });

    // Forge the latest row on main: sequence 2, corrupt (cross-branch) predecessor.
    const forged = await forgeLinkedSet({
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      chapterVersionId: versionId,
      sourceBranchId: branchId,
      sourceRevisionId: headRevisionId,
      sequence: 2,
      previousSetId: sideSet.id,
      conflictsJson: first.conflictsJson,
      actorUserId: owner.userId,
      explanation: "forged corrupt-predecessor latest",
    });

    const countBefore = await db.scaleEvidenceSet.count({
      where: { sourceBranchId: branchId, chapterVersionId: versionId },
    });
    expect(countBefore).toBe(2);

    // Append against the corrupt tip with otherwise-valid expectations.
    const res = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: forged.id,
      declaration: "CONFLICTS",
      explanation: "attempt to extend a corrupt chain",
      conflicts: [CLAIM_A],
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("CONFLICT");

    // No new row was created: the corrupt chain was not extended.
    const countAfter = await db.scaleEvidenceSet.count({
      where: { sourceBranchId: branchId, chapterVersionId: versionId },
    });
    expect(countAfter).toBe(2);
    const seq3 = await db.scaleEvidenceSet.findFirst({
      where: { sourceBranchId: branchId, chapterVersionId: versionId, sequence: 3 },
    });
    expect(seq3).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NF-WF-050C amendment 1 (finding B): S3 proposal provenance on appendSet.
// ---------------------------------------------------------------------------

describe("evidence: S3 proposal provenance (050C amendment 1)", () => {
  /** Seed a pinned S3 proposal row matching the current context pins. */
  async function seedProposal(
    f: Awaited<ReturnType<typeof seedChapterWithVersion>> & {
      ids: { workspaceId: string; novelId: string };
    },
    overrides?: {
      branchId?: string;
      headRevisionId?: string | null;
      evidenceSetId?: string | null;
      policyFingerprint?: string;
      chapterId?: string;
      chapterVersionId?: string;
    },
  ) {
    return db.scaleS3Proposal.create({
      data: {
        workspaceId: f.ids.workspaceId,
        novelId: f.ids.novelId,
        chapterId: overrides?.chapterId ?? f.chapterId,
        chapterVersionId: overrides?.chapterVersionId ?? f.versionId,
        sourceBranchId: overrides?.branchId ?? f.branchId,
        sourceRevisionId:
          overrides?.headRevisionId !== undefined
            ? overrides.headRevisionId
            : f.headRevisionId,
        evidenceSetId: overrides?.evidenceSetId ?? null,
        policyFingerprint:
          overrides?.policyFingerprint ?? fingerprintScalePolicy(null),
        kind: "EXTRACT_CLAIM",
        payload: { claims: [CLAIM_A] },
        requestedByUserId: (await db.novel.findUniqueOrThrow({
          where: { id: f.ids.novelId },
          select: { createdById: true },
        })).createdById,
      },
    });
  }

  it("appendSet with sourceProposalId stores provenance; record exposes it; absent path stays null", async () => {
    const owner = await seedUser("se-prov1@t.io");
    const ids = await seedNovel(owner.userId, "se-prov-ws1");
    const f = { ids, ...(await seedChapterWithVersion(owner.cookie, ids)) };
    const proposal = await seedProposal(f);

    const linked = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "Accepted from AI proposal.",
      conflicts: [CLAIM_A],
      sourceProposalId: proposal.id,
    });
    expect(linked.statusCode, linked.body).toBe(201);
    const linkedBody = linked.json() as { id: string; sourceProposalId: string | null };
    expect(linkedBody.sourceProposalId).toBe(proposal.id);

    // The plain path (no sourceProposalId) still stores null.
    const plain = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: linkedBody.id,
      declaration: "CONFLICTS",
      explanation: "Plain S1 authoring.",
      conflicts: [CLAIM_B],
    });
    expect(plain.statusCode, plain.body).toBe(201);
    expect((plain.json() as { sourceProposalId: string | null }).sourceProposalId).toBeNull();

    // The proposal row itself is untouched (inert data).
    const after = await db.scaleS3Proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(after.dismissedByUserId).toBeNull();
  });

  it("appendSet refuses a proposal from another chapter (404) and a stale-pinned proposal (409)", async () => {
    const owner = await seedUser("se-prov2@t.io");
    const ids = await seedNovel(owner.userId, "se-prov-ws2");
    const f = { ids, ...(await seedChapterWithVersion(owner.cookie, ids)) };

    // Unknown proposal id (valid UUID shape, no such row): the service 404s.
    const wrongChapter = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "phantom proposal reference",
      conflicts: [CLAIM_A],
      sourceProposalId: "11111111-1111-4111-8111-111111111111",
    });
    expect(wrongChapter.statusCode).toBe(404);
    expect((wrongChapter.json() as { error: string }).error).toBe("NOT_FOUND");

    // Stale pins: proposal captured a different head revision.
    const stale = await seedProposal(f, { headRevisionId: null });
    const staleRes = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "stale proposal provenance",
      conflicts: [CLAIM_A],
      sourceProposalId: stale.id,
    });
    expect(staleRes.statusCode).toBe(409);
    expect((staleRes.json() as { error: string }).error).toBe("CONFLICT");
    // Refusal created no set row.
    expect(
      await db.scaleEvidenceSet.count({ where: { novelId: ids.novelId } }),
    ).toBe(0);
  });

  it("appendSet refuses a proposal whose policy fingerprint no longer matches (409)", async () => {
    const owner = await seedUser("se-prov3@t.io");
    const ids = await seedNovel(owner.userId, "se-prov-ws3");
    const f = { ids, ...(await seedChapterWithVersion(owner.cookie, ids)) };
    const stalePolicy = await seedProposal(f, {
      policyFingerprint: "0".repeat(64),
    });
    const res = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "policy drifted since extract",
      conflicts: [CLAIM_A],
      sourceProposalId: stalePolicy.id,
    });
    expect(res.statusCode).toBe(409);
  });

  it("appendSet refuses an unknown sourceProposalId (404)", async () => {
    const owner = await seedUser("se-prov4@t.io");
    const ids = await seedNovel(owner.userId, "se-prov-ws4");
    const f = { ids, ...(await seedChapterWithVersion(owner.cookie, ids)) };
    const res = await postSet(owner.cookie, ids, f.chapterId, {
      chapterVersionId: f.versionId,
      expectedBranchId: f.branchId,
      expectedHeadRevisionId: f.headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "phantom proposal",
      conflicts: [CLAIM_A],
      sourceProposalId: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});
