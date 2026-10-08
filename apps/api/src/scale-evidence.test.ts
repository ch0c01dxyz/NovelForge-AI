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
  ScaleEvidenceValidationError,
  NotFoundError,
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
  await db.scene.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
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
  it("FULL and SELECTIVE restores leave scale_evidence_sets untouched; readCurrent still works", async () => {
    const owner = await seedUser("sev7@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws7");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    let expectedSetId: string | null = null;
    const claims = [CLAIM_A, CLAIM_B];
    for (let n = 1; n <= 2; n++) {
      const post = await postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: versionId,
        expectedBranchId: branchId,
        expectedHeadRevisionId: headRevisionId,
        expectedSetId,
        declaration: "CONFLICTS",
        explanation: `assessment ${n}`,
        conflicts: [claims[n - 1]!],
      });
      expect(post.statusCode, post.body).toBe(201);
      expectedSetId = (post.json() as { id: string }).id;
    }
    const latestId = expectedSetId;

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

    const cpRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/checkpoints`,
      headers: { cookie: owner.cookie },
      payload: { label: "sev7-restore" },
    });
    expect(cpRes.statusCode, cpRes.body).toBe(201);
    const checkpointId = (cpRes.json() as { checkpointId: string }).checkpointId;
    expect(checkpointId).toBeTruthy();

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

    // SELECTIVE restore of an unrelated covered table (no canon facts exist).
    await previewApply("SELECTIVE", { tables: ["canon_facts"] });
    expect(await snapshotRows()).toEqual(before);

    const curSel = await getCurrent(owner.cookie, ids, chapterId);
    expect(curSel.statusCode).toBe(200);
    expect((curSel.json() as { assessment: { id: string } | null }).assessment?.id).toBe(latestId);
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
  it("concurrent cited-chapter delete 409s; append either succeeds or 409s; state stays integral", async () => {
    const owner = await seedUser("sev9@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws9");
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

    const cur = await getCurrent(owner.cookie, ids, chapterId);
    const fresh = cur.json() as { branchId: string; currentHeadRevisionId: string | null };

    const [del, appended] = await Promise.all([
      app.inject({
        method: "DELETE",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
        headers: { cookie: owner.cookie },
      }),
      postSet(owner.cookie, ids, chapterId, {
        chapterVersionId: versionId,
        expectedBranchId: fresh.branchId,
        expectedHeadRevisionId: fresh.currentHeadRevisionId,
        expectedSetId: firstId,
        declaration: "CONFLICTS",
        explanation: "racing append",
        conflicts: [CLAIM_B],
      }),
    ]);

    // The cited chapter can never be deleted through this path.
    expect(del.statusCode).toBe(409);
    // The append either won (201) or observed a stale expectation (409);
    // it must never corrupt the chain.
    expect([201, 409]).toContain(appended.statusCode);

    const rows = await db.scaleEvidenceSet.findMany({
      where: { novelId: ids.novelId },
      orderBy: { sequence: "asc" },
    });
    const expectedCount = appended.statusCode === 201 ? 2 : 1;
    expect(rows).toHaveLength(expectedCount);
    expect(rows.map((r) => r.sequence)).toEqual(
      Array.from({ length: expectedCount }, (_, i) => i + 1),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(expectedCount);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.previousSetId).toBe(rows[i - 1]!.id);
    }

    const after = await getCurrent(owner.cookie, ids, chapterId);
    expect(after.statusCode).toBe(200);
    const afterBody = after.json() as { status: string; assessment: { id: string } | null };
    expect(afterBody.status).toBe("CURRENT");
    expect(afterBody.assessment?.id).toBe(rows[rows.length - 1]!.id);
  });
});

describe("evidence: parent cleanup", () => {
  it("novel delete cascades scale_evidence_sets rows (FK contract)", async () => {
    const owner = await seedUser("sev10@t.io");
    const ids = await seedNovel(owner.userId, "sev-ws10");
    const { chapterId, versionId, branchId, headRevisionId } = await seedChapterWithVersion(owner.cookie, ids);

    const post = await postSet(owner.cookie, ids, chapterId, {
      chapterVersionId: versionId,
      expectedBranchId: branchId,
      expectedHeadRevisionId: headRevisionId,
      expectedSetId: null,
      declaration: "CONFLICTS",
      explanation: "to be cleaned up",
      conflicts: [CLAIM_A],
    });
    expect(post.statusCode, post.body).toBe(201);
    // Setup check: the row exists before the parent is deleted.
    expect(await db.scaleEvidenceSet.count({ where: { novelId: ids.novelId } })).toBe(1);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode, del.body).toBe(200);

    expect(await db.scaleEvidenceSet.count({ where: { novelId: ids.novelId } })).toBe(0);
  });
});
