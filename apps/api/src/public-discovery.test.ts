/**
 * Public discovery tests (NF-WF-014): anonymous novel listing, genre
 * facets, published-only search, and the member genre route.
 *
 * Dedicated scratch database (same pattern as public-routes.test.ts);
 * the same DB-backed model as every service — it just happens to have
 * no auth object. No network calls; the fake publication queue is
 * shared so chapters can go through the real release path.
 *
 * Every seed that reaches "PUBLISHED" travels the real 012 release
 * path (PASS receipt seeded directly — review logic is 010's tested
 * territory → immediate publish), exactly like a real author
 * workflow, so the visibility predicates are exercised end to end.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import type { Env } from "@novelforge/config";
import type { PublicationJobData } from "@novelforge/workflow-executor";

vi.mock("./services/ai/index.ts", () => ({ createAiServices: () => ({}) }));
vi.mock("./services/workflow-executor.ts", () => ({
  createWorkflowExecutor: () => ({}),
}));

function createFakePublicationQueue() {
  const jobs = new Map<string, { state: string }>();
  return {
    jobs,
    async add(
      _name: string,
      _data: PublicationJobData,
      opts: { jobId: string; delay?: number },
    ) {
      jobs.set(opts.jobId, { state: "delayed" });
    },
    async getJob(jobId: string) {
      const j = jobs.get(jobId);
      if (!j) return undefined;
      return {
        getState: async () => j.state,
        remove: async () => {
          jobs.delete(jobId);
        },
      };
    },
    async close() {},
  };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = "novelforge_test_public_discovery";
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
let fakeQueue: ReturnType<typeof createFakePublicationQueue>;

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
  fakeQueue = createFakePublicationQueue();
  app = await buildApp(env, { db, publicationQueue: fakeQueue });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  fakeQueue.jobs.clear();
  await db.auditLog.deleteMany();
  await db.publication.deleteMany();
  await db.finalTextReview.deleteMany();
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

async function seedUser(email: string, displayName?: string) {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: displayName ?? email },
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

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  return ws.id;
}

async function seedNovel(
  ownerId: string,
  workspaceId: string,
  novelSlug: string,
) {
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({
    actorUserId: ownerId,
    workspaceId,
    title: `Novel ${novelSlug}`,
    slug: novelSlug,
  });
  return novel.id;
}

async function api(
  method: "GET" | "POST" | "PATCH",
  url: string,
  cookie?: string,
  body?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    headers: cookie ? { cookie } : {},
    payload: body as Record<string, unknown> | undefined,
  });
  return { status: res.statusCode, json: res.json() as Record<string, unknown> };
}

const pubUrl = (workspaceId: string, novelId: string, chapterId: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}/publication`;

async function makeChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters`,
    headers: { cookie },
    payload: { title },
  });
  if (res.statusCode !== 201) {
    throw new Error(`makeChapter failed: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { id: string; number: number };
}

async function saveVersion(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
  content: string,
) {
  const current = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    select: { currentVersion: { select: { number: true } } },
  });
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: {
      content,
      expectedVersion: current.currentVersion?.number ?? null,
    },
  });
  if (res.statusCode !== 200) {
    throw new Error(`saveVersion failed: ${res.statusCode} ${res.body}`);
  }
  return db.chapterVersion.findFirstOrThrow({
    where: { chapterId },
    orderBy: { number: "desc" },
  });
}

/** Seed a PASS review receipt directly (deterministic; review logic is 010's tested territory). */
async function seedReceipt(
  workspaceId: string,
  novelId: string,
  chapterVersionId: string,
) {
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId, name: "main" },
    select: { headRevisionId: true },
  });
  return db.finalTextReview.create({
    data: {
      workspaceId,
      novelId,
      chapterVersionId,
      revisionId: branch.headRevisionId!,
      verdict: "PASS",
      hardViolations: [],
      advisory: [],
      evaluatedPolicies: {},
    },
  });
}

/** Publish immediately via the real 012 release path. */
async function publishChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
  chapterVersionId: string,
) {
  await seedReceipt(workspaceId, novelId, chapterVersionId);
  const res = await app.inject({
    method: "POST",
    url: `${pubUrl(workspaceId, novelId, chapterId)}/publish`,
    headers: { cookie },
    payload: {},
  });
  if (res.statusCode !== 200) {
    throw new Error(`publish failed: ${res.statusCode} ${res.body}`);
  }
}

async function unpublishChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `${pubUrl(workspaceId, novelId, chapterId)}/unpublish`,
    headers: { cookie },
    payload: {},
  });
  if (res.statusCode !== 200) {
    throw new Error(`unpublish failed: ${res.statusCode} ${res.body}`);
  }
}

async function scheduleChapter(
  cookie: string,
  workspaceId: string,
  novelId: string,
  chapterId: string,
  scheduledFor: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `${pubUrl(workspaceId, novelId, chapterId)}/schedule`,
    headers: { cookie },
    payload: { scheduledFor },
  });
  if (res.statusCode !== 201) {
    throw new Error(`schedule failed: ${res.statusCode} ${res.body}`);
  }
}

async function seedViewerMember(workspaceId: string) {
  const viewer = await seedUser("viewer@example.com");
  await db.membership.create({
    data: { workspaceId, userId: viewer.userId, role: "VIEWER" },
  });
  return viewer;
}

/** Seed a novel with one PUBLISHED chapter via the real path (DRAFT→ACTIVE). */
async function seedPublishedNovel(
  owner: { userId: string; cookie: string },
  workspaceId: string,
  novelSlug: string,
  content: string,
) {
  const novelId = await seedNovel(owner.userId, workspaceId, novelSlug);
  const ch = await makeChapter(owner.cookie, workspaceId, novelId, "Chapter 1");
  const version = await saveVersion(
    owner.cookie,
    workspaceId,
    novelId,
    ch.id,
    content,
  );
  await publishChapter(owner.cookie, workspaceId, novelId, ch.id, version.id);
  return { novelId, chapterId: ch.id };
}

/** Set genres via the member route (exercises the Zod contract). */
async function setGenres(
  cookie: string,
  workspaceId: string,
  novelId: string,
  genres: string[],
) {
  return api(
    "PATCH",
    `/api/workspaces/${workspaceId}/novels/${novelId}/genres`,
    cookie,
    { genres },
  );
}

describe("GET /api/public/novels (anonymous listing)", () => {
  it("lists only ACTIVE novels with at least one PUBLISHED publication", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId: publishedId } = await seedPublishedNovel(
      owner,
      ws,
      "published-novel",
      "The jade pagoda stood against the storm.",
    );
    // DRAFT novel with a saved version but no publication.
    const draftId = await seedNovel(owner.userId, ws, "draft-novel");
    const dc = await makeChapter(owner.cookie, ws, draftId, "Chapter 1");
    await saveVersion(
      owner.cookie,
      ws,
      draftId,
      dc.id,
      "Draft-only content never published.",
    );
    // Novel with only a SCHEDULED chapter (not yet public).
    const schedId = await seedNovel(owner.userId, ws, "scheduled-novel");
    const sc = await makeChapter(owner.cookie, ws, schedId, "Chapter 1");
    await saveVersion(owner.cookie, ws, schedId, sc.id, "Scheduled content.");
    await scheduleChapter(
      owner.cookie,
      ws,
      schedId,
      sc.id,
      new Date(Date.now() + 3600_000).toISOString(),
    );
    // ARCHIVED novel with a published chapter (should not list).
    const { novelId: archId } = await seedPublishedNovel(
      owner,
      ws,
      "archived-novel",
      "Archived content.",
    );
    await db.novel.update({ where: { id: archId }, data: { status: "ARCHIVED" } });

    const res = await api("GET", "/api/public/novels");
    expect(res.status).toBe(200);
    const novels = res.json["novels"] as Array<{ id: string; slug: string }>;
    expect(novels.map((n) => n.slug)).toEqual(["published-novel"]);
    expect(novels[0]?.id).toBe(publishedId);
  });

  it("never requires auth: identical with and without a session cookie", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    await seedPublishedNovel(owner, ws, "pub", "Public content.");
    const anon = await api("GET", "/api/public/novels");
    const authed = await api("GET", "/api/public/novels", owner.cookie);
    expect(anon.status).toBe(200);
    expect(authed.status).toBe(200);
    expect(authed.json).toEqual(anon.json);
  });

  it("supports cursor pagination and the recent/title/chapters sorts", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    await seedPublishedNovel(owner, ws, "zeta-novel", "Zeta content here.");
    await seedPublishedNovel(owner, ws, "alpha-novel", "Alpha content here.");
    await seedPublishedNovel(owner, ws, "beta-novel", "Beta content here.");

    const p1 = await api("GET", "/api/public/novels?limit=2&sort=title");
    expect(p1.status).toBe(200);
    const first = p1.json["novels"] as Array<{ slug: string }>;
    expect(first.map((n) => n.slug)).toEqual(["alpha-novel", "beta-novel"]);
    expect((p1.json["page"] as { hasMore: boolean }).hasMore).toBe(true);
    const cursor = (p1.json["page"] as { cursor: string }).cursor;
    expect(typeof cursor).toBe("string");
    const p2 = await api(
      "GET",
      `/api/public/novels?limit=2&sort=title&cursor=${encodeURIComponent(cursor)}`,
    );
    const second = p2.json["novels"] as Array<{ slug: string }>;
    expect(second.map((n) => n.slug)).toEqual(["zeta-novel"]);
    expect((p2.json["page"] as { hasMore: boolean }).hasMore).toBe(false);

    const bad = await api("GET", "/api/public/novels?cursor=not-a-cursor");
    expect(bad.status).toBe(400);
    expect(bad.json["error"]).toBe("INVALID_INPUT");
    const badSort = await api("GET", "/api/public/novels?sort=popular");
    expect(badSort.status).toBe(400);
  });

  it("filters by genre (unknown genre key -> 400)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId: litId } = await seedPublishedNovel(
      owner,
      ws,
      "lit-novel",
      "Lit content.",
    );
    const { novelId: fanId } = await seedPublishedNovel(
      owner,
      ws,
      "fan-novel",
      "Fantasy content.",
    );
    expect((await setGenres(owner.cookie, ws, litId, ["litrpg"])).status).toBe(
      200,
    );
    expect(
      (await setGenres(owner.cookie, ws, fanId, ["fantasy"])).status,
    ).toBe(200);

    const lit = await api("GET", "/api/public/novels?genre=litrpg");
    expect(
      (lit.json["novels"] as Array<{ id: string }>).map((n) => n.id),
    ).toEqual([litId]);
    const bad = await api("GET", "/api/public/novels?genre=not_a_genre");
    expect(bad.status).toBe(400);
  });

  it("genre changes are immediately visible (no driftable index)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId } = await seedPublishedNovel(owner, ws, "listed", "Content.");
    let res = await api("GET", "/api/public/novels?genre=fantasy");
    expect((res.json["novels"] as unknown[]).length).toBe(0);
    await setGenres(owner.cookie, ws, novelId, ["fantasy"]);
    res = await api("GET", "/api/public/novels?genre=fantasy");
    expect((res.json["novels"] as Array<{ id: string }>).map((n) => n.id)).toEqual(
      [novelId],
    );
  });
});

describe("GET /api/public/genres (genre facets)", () => {
  it("returns only keys carried by publicly-visible novels, count desc", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId: a } = await seedPublishedNovel(owner, ws, "a", "A content.");
    const { novelId: b } = await seedPublishedNovel(owner, ws, "b", "B content.");
    // A DRAFT novel's genres must not leak into facets.
    const draftId = await seedNovel(owner.userId, ws, "draft");
    await setGenres(owner.cookie, ws, a, ["fantasy"]);
    await setGenres(owner.cookie, ws, b, ["fantasy", "action"]);
    await setGenres(owner.cookie, ws, draftId, ["horror"]);

    const res = await api("GET", "/api/public/genres");
    expect(res.status).toBe(200);
    const genres = res.json["genres"] as Array<{ key: string; count: number }>;
    expect(genres).toEqual([
      { key: "fantasy", count: 2 },
      { key: "action", count: 1 },
    ]);
  });

  it("is anonymous and returns an empty list when nothing is published", async () => {
    const res = await api("GET", "/api/public/genres");
    expect(res.status).toBe(200);
    expect(res.json["genres"]).toEqual([]);
  });
});

describe("PATCH /api/workspaces/:workspaceId/novels/:novelId/genres (member)", () => {
  it("accepts up to 5 known keys (deduped); rejects unknown keys and >5", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const novelId = await seedNovel(owner.userId, ws, "novel");

    const five = await setGenres(owner.cookie, ws, novelId, [
      "fantasy",
      "action",
      "adventure",
      "mystery",
      "horror",
    ]);
    expect(five.status).toBe(200);
    expect(five.json["genres"]).toEqual([
      "fantasy",
      "action",
      "adventure",
      "mystery",
      "horror",
    ]);

    const six = await setGenres(owner.cookie, ws, novelId, [
      "fantasy",
      "action",
      "adventure",
      "mystery",
      "horror",
      "romance",
    ]);
    expect(six.status).toBe(400);
    expect(six.json["error"]).toBe("INVALID_INPUT");

    const dupes = await setGenres(owner.cookie, ws, novelId, [
      "fantasy",
      "fantasy",
      "action",
    ]);
    expect(dupes.status).toBe(200);
    expect(dupes.json["genres"]).toEqual(["fantasy", "action"]);

    const unknown = await setGenres(owner.cookie, ws, novelId, ["cultivation"]);
    expect(unknown.status).toBe(400);
    expect(unknown.json["error"]).toBe("INVALID_INPUT");
  });

  it("requires auth (401), capability (403), novel membership (404)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const novelId = await seedNovel(owner.userId, ws, "novel");
    const viewer = await seedViewerMember(ws);

    const noAuth = await api(
      "PATCH",
      `/api/workspaces/${ws}/novels/${novelId}/genres`,
      undefined,
      { genres: ["fantasy"] },
    );
    expect(noAuth.status).toBe(401);
    expect(noAuth.json["error"]).toBe("UNAUTHENTICATED");

    const viewerRes = await api(
      "PATCH",
      `/api/workspaces/${ws}/novels/${novelId}/genres`,
      viewer.cookie,
      { genres: ["fantasy"] },
    );
    expect(viewerRes.status).toBe(403);
    expect(viewerRes.json["error"]).toBe("FORBIDDEN");

    const outsider = await seedUser("outsider@example.com");
    const missing = await api(
      "PATCH",
      `/api/workspaces/${ws}/novels/00000000-0000-0000-0000-000000000000/genres`,
      outsider.cookie,
      { genres: ["fantasy"] },
    );
    expect(missing.status).toBe(404);
    expect(missing.json["error"]).toBe("NOT_FOUND");
  });
});

describe("GET /api/public/search (published-only search)", () => {
  it("matches published chapters and novel titles only", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId } = await seedPublishedNovel(
      owner,
      ws,
      "search-novel",
      "The crimson phoenix soared over the jade pagoda at dawn.",
    );

    const byContent = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("crimson phoenix")}`,
    );
    expect(byContent.status).toBe(200);
    const hits = byContent.json["results"] as Array<{
      type: string;
      snippet: string | null;
      novel: { id: string };
    }>;
    const chapterHits = hits.filter((h) => h.type === "chapter");
    expect(chapterHits.length).toBe(1);
    expect(chapterHits[0]?.novel.id).toBe(novelId);
    // Snippets are bounded, HTML-escaped, <mark>-only markup.
    const snippet = chapterHits[0]?.snippet ?? "";
    expect(snippet).toContain("<mark>");
    expect(snippet.length).toBeLessThan(400);

    const byTitle = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("search-novel")}`,
    );
    const novelHits = (byTitle.json["results"] as Array<{ type: string }>).filter(
      (h) => h.type === "novel",
    );
    expect(novelHits.length).toBeGreaterThan(0);
  });

  it("the no-oracle contract: draft titles, unpublished phrases, and gibberish are identical", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    // A DRAFT novel whose exact title must not match.
    const draftId = await seedNovel(owner.userId, ws, "draft-unique-title");
    const dc = await makeChapter(owner.cookie, ws, draftId, "Chapter 1");
    await saveVersion(
      owner.cookie,
      ws,
      draftId,
      dc.id,
      "Zebraquill whisperment is the unpublished passphrase.",
    );

    const draftTitle = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("draft-unique-title")}`,
    );
    const unpublishedPhrase = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("Zebraquill whisperment")}`,
    );
    const gibberish = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("qzxwv jklmnop qrstuv")}`,
    );
    for (const res of [draftTitle, unpublishedPhrase, gibberish]) {
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ results: [] });
    }
  });

  it("unpublish removes chapter content from search immediately", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId, chapterId } = await seedPublishedNovel(
      owner,
      ws,
      "unpub-novel",
      "The opal tortoise dreamed of waterfalls.",
    );

    const before = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("opal tortoise")}`,
    );
    expect((before.json["results"] as unknown[]).length).toBeGreaterThan(0);

    await unpublishChapter(owner.cookie, ws, novelId, chapterId);

    const after = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("opal tortoise")}`,
    );
    expect(after.status).toBe(200);
    expect(after.json).toEqual({ results: [] });
  });

  it("search corpus is the PUBLISHED pin, never the current version", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const novelId = await seedNovel(owner.userId, ws, "pin-novel");
    const ch = await makeChapter(owner.cookie, ws, novelId, "Chapter 1");
    const v1 = await saveVersion(
      owner.cookie,
      ws,
      novelId,
      ch.id,
      "The amber lantern glowed in the first draft.",
    );
    await publishChapter(owner.cookie, ws, novelId, ch.id, v1.id);

    // Author revises: unpublish -> save a new version -> re-publish.
    await unpublishChapter(owner.cookie, ws, novelId, ch.id);
    const v2 = await saveVersion(
      owner.cookie,
      ws,
      novelId,
      ch.id,
      "The violet compass pointed nowhere in the revision.",
    );
    await publishChapter(owner.cookie, ws, novelId, ch.id, v2.id);

    const oldPhrase = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("amber lantern")}`,
    );
    expect(oldPhrase.json).toEqual({ results: [] });
    const newPhrase = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("violet compass")}`,
    );
    expect((newPhrase.json["results"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("rejects empty and over-long queries with 400", async () => {
    const empty = await api("GET", "/api/public/search?q=");
    expect(empty.status).toBe(400);
    const blank = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("   ")}`,
    );
    expect(blank.status).toBe(400);
    const long = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("a".repeat(201))}`,
    );
    expect(long.status).toBe(400);
  });

  it("supports type=novel and type=chapter filters", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    await seedPublishedNovel(
      owner,
      ws,
      "filter-novel",
      "The silver keystone glimmered in the archive.",
    );

    const novels = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("silver keystone")}&type=novel`,
    );
    expect(
      (novels.json["results"] as Array<{ type: string }>).every(
        (h) => h.type === "novel",
      ),
    ).toBe(true);
    const chapters = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("silver keystone")}&type=chapter`,
    );
    expect(
      (chapters.json["results"] as Array<{ type: string }>).every(
        (h) => h.type === "chapter",
      ),
    ).toBe(true);
    const bad = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("silver keystone")}&type=both`,
    );
    expect(bad.status).toBe(400);
  });
});

describe("GET /api/public/search on sanitized-HTML chapter content (NF-WF-017C)", () => {
  // GAP-053 item 2: to_tsvector/ts_headline are built on tag-stripped
  // content (SQL-side regexp_replace, Q7 decision of record) — tags are
  // never index lexemes and never appear in snippets.
  const HTML_CONTENT =
    "<p>The <strong>crimson phoenix</strong> soared over the jade pagoda at dawn.</p>" +
    "<blockquote>Emberlight danced upon the river stones.</blockquote>";

  it("ranks HTML chapters on their prose and emits tag-free snippets", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    const { novelId } = await seedPublishedNovel(owner, ws, "html-search-novel", HTML_CONTENT);

    const res = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("crimson phoenix")}&type=chapter`,
    );
    expect(res.status).toBe(200);
    const hits = res.json["results"] as Array<{
      type: string;
      snippet: string | null;
      novel: { id: string };
    }>;
    expect(hits.length).toBe(1);
    expect(hits[0]?.type).toBe("chapter");
    expect(hits[0]?.novel.id).toBe(novelId);

    const snippet = hits[0]?.snippet ?? "";
    expect(snippet).toContain("<mark>");
    // Beyond the highlight markers, no HTML tags may appear.
    const withoutMarks = snippet.replace(/<\/?mark>/g, "");
    expect(withoutMarks).not.toContain("<");
    expect(withoutMarks).not.toContain(">");
    expect(withoutMarks).toContain("crimson phoenix");
  });

  it("never indexes tag names as lexemes", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    await seedPublishedNovel(owner, ws, "html-tag-novel", HTML_CONTENT);

    // "strong" and "blockquote" appear only as tags, never as prose.
    for (const q of ["strong", "blockquote"]) {
      const res = await api(
        "GET",
        `/api/public/search?q=${encodeURIComponent(q)}&type=chapter`,
      );
      expect(res.status).toBe(200);
      expect(res.json["results"]).toEqual([]);
    }
  });

  it("still matches prose adjacent to tags (no word fusion across the strip)", async () => {
    const owner = await seedUser("owner@example.com");
    const ws = await seedWorkspace(owner.userId, "ws");
    await seedPublishedNovel(
      owner,
      ws,
      "html-adjacent-novel",
      "<p>alpha</p><p>beta gamma</p>",
    );

    const res = await api(
      "GET",
      `/api/public/search?q=${encodeURIComponent("beta gamma")}&type=chapter`,
    );
    expect(res.status).toBe(200);
    const hits = res.json["results"] as Array<{ type: string }>;
    expect(hits.length).toBe(1);
  });
});
