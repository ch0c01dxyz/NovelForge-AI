/**
 * Manuscript (Phase 2) integration suite — chapters + immutable versions.
 *
 * Dedicated novelforge_test_manuscript db (parallel-safe per ADR-0003 §8).
 * Sessions/users/workspaces/novels seeded directly in the DB to stay off
 * register/login rate limits.
 *
 * Covers (roadmap Phase 2 exit + CLAUDE.md invariants):
 * - chapter CRUD + auto-numbering under the (novelId, number) unique
 * - version immutability: every save appends; content never mutated
 * - optimistic concurrency: stale expectedVersion is 409
 * - published chapters reject saves without unpublish
 * - tenant isolation: non-member 404 on every chapter route shape
 * - VIEWER read-only; EDITOR can save but not publish/delete
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

const TEST_DB = "novelforge_test_manuscript";
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
    data: { name: slug, slug, ownerId: userId0(ownerId) },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: `Novel ${slug}`, slug, createdById: ownerId },
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

// helper because workspace.ownerId must reference an existing user row
function userId0(id: string): string {
  return id;
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

async function save(cookie: string, ids: { workspaceId: string; novelId: string }, chapterId: string, content: string, expectedVersion: number | null, note?: string) {
  return app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: { content, expectedVersion, note },
  });
}

describe("chapter CRUD + numbering", () => {
  it("creates chapters with sequential numbers and lists them ordered", async () => {
    const owner = await seedUser("owner1@t.io");
    const ids = await seedNovel(owner.userId, "crud-ws");
    const c1 = await makeChapter(owner.cookie, ids, "First");
    const c2 = await makeChapter(owner.cookie, ids, "Second");
    expect(c1.number).toBe(1);
    expect(c2.number).toBe(2);

    const list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as Array<{ number: number; title: string; currentVersion: number | null }>;
    expect(body.map((c) => c.number)).toEqual([1, 2]);
    expect(body[0]!.currentVersion).toBeNull();
  });

  it("deletes a chapter and its versions cascade", async () => {
    const owner = await seedUser("owner2@t.io");
    const ids = await seedNovel(owner.userId, "del-ws");
    const c = await makeChapter(owner.cookie, ids, "Doomed");
    await save(owner.cookie, ids, c.id, "content v1", null, "initial");

    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await db.chapterVersion.count({ where: { chapterId: c.id } })).toBe(0);
  });
});

describe("versioning", () => {
  it("every save appends an immutable version; content of old versions never changes", async () => {
    const owner = await seedUser("owner3@t.io");
    const ids = await seedNovel(owner.userId, "ver-ws");
    const c = await makeChapter(owner.cookie, ids, "Versioned");

    const s1 = await save(owner.cookie, ids, c.id, "draft one", null, "autosave");
    expect(s1.statusCode).toBe(200);
    expect(s1.json().version).toBe(1);

    const s2 = await save(owner.cookie, ids, c.id, "draft two — revised", 1, "manual");
    expect(s2.statusCode).toBe(200);
    expect(s2.json().version).toBe(2);

    const versions = await db.chapterVersion.findMany({
      where: { chapterId: c.id },
      orderBy: { number: "asc" },
    });
    expect(versions.map((v) => v.number)).toEqual([1, 2]);
    expect(versions[0]!.content).toBe("draft one"); // untouched
    expect(versions[1]!.content).toBe("draft two — revised");

    const get = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.currentVersion).toBe(2);
    expect(body.content).toBe("draft two — revised");
    expect(body.wordCount).toBe(4); // "draft two — revised" incl. em-dash token
  });

  it("stale expectedVersion is a 409, never a silent overwrite", async () => {
    const owner = await seedUser("owner4@t.io");
    const ids = await seedNovel(owner.userId, "stale-ws");
    const c = await makeChapter(owner.cookie, ids, "Stale");
    await save(owner.cookie, ids, c.id, "first", null);

    // Author A and B both saw version 1; B saves first, A's save must 409.
    const stale = await save(owner.cookie, ids, c.id, "from A", 1);
    expect(stale.statusCode).toBe(200);
    const conflict = await save(owner.cookie, ids, c.id, "from B too", 1);
    expect(conflict.statusCode).toBe(409);
  });

  it("published chapters reject saves; unpublish via IN_REVIEW re-enables", async () => {
    const owner = await seedUser("owner5@t.io");
    const ids = await seedNovel(owner.userId, "pub-ws");
    const c = await makeChapter(owner.cookie, ids, "Publishable");
    await save(owner.cookie, ids, c.id, "final content", null);

    const publish = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(publish.statusCode).toBe(200);

    const blocked = await save(owner.cookie, ids, c.id, "sneaky edit", 1);
    expect(blocked.statusCode).toBe(409);

    const unpublish = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "IN_REVIEW" },
    });
    expect(unpublish.statusCode).toBe(200);
    const ok = await save(owner.cookie, ids, c.id, "post-review edit", 1);
    expect(ok.statusCode).toBe(200);
  });

  it("cannot publish an empty chapter", async () => {
    const owner = await seedUser("owner6@t.io");
    const ids = await seedNovel(owner.userId, "empt-ws");
    const c = await makeChapter(owner.cookie, ids, "Empty");
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("tenant isolation + roles", () => {
  it("non-members get 404 on every chapter route shape (not 403)", async () => {
    const owner = await seedUser("owner7@t.io");
    const stranger = await seedUser("stranger7@t.io");
    const ids = await seedNovel(owner.userId, "iso-ws");
    const c = await makeChapter(owner.cookie, ids, "Secret");
    await save(owner.cookie, ids, c.id, "private words", null);

    const base = `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}`;
    const shapes = [
      { method: "GET" as const, url: `${base}/chapters` },
      { method: "GET" as const, url: `${base}/chapters/${c.id}` },
      { method: "POST" as const, url: `${base}/chapters`, payload: { title: "X" } },
      { method: "PUT" as const, url: `${base}/chapters/${c.id}`, payload: { content: "x", expectedVersion: null } },
      { method: "DELETE" as const, url: `${base}/chapters/${c.id}` },
      { method: "PATCH" as const, url: `${base}/chapters/${c.id}/status`, payload: { status: "PUBLISHED" } },
    ];
    for (const s of shapes) {
      const res = await app.inject({
        method: s.method,
        url: s.url,
        headers: { cookie: stranger.cookie },
        payload: s.payload,
      });
      expect(res.statusCode, `${s.method} ${s.url}`).toBe(404);
    }
  });

  it("VIEWER can read but every mutation is 403", async () => {
    const owner = await seedUser("owner8@t.io");
    const viewer = await seedUser("viewer8@t.io");
    const ids = await seedNovel(owner.userId, "view-ws");
    await db.membership.create({
      data: { workspaceId: ids.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const c = await makeChapter(owner.cookie, ids, "Readable");

    const read = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
      headers: { cookie: viewer.cookie },
    });
    expect(read.statusCode).toBe(200);

    const create = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters`,
      headers: { cookie: viewer.cookie },
      payload: { title: "Nope" },
    });
    expect(create.statusCode).toBe(403);

    const mutate = await save(viewer.cookie, ids, c.id, "hijack", null);
    expect(mutate.statusCode).toBe(403);
  });

  it("EDITOR can save but cannot publish or delete", async () => {
    const owner = await seedUser("owner9@t.io");
    const editor = await seedUser("editor9@t.io");
    const ids = await seedNovel(owner.userId, "edit-ws");
    await db.membership.create({
      data: { workspaceId: ids.workspaceId, userId: editor.userId, role: "EDITOR" },
    });
    const c = await makeChapter(owner.cookie, ids, "Editable");

    const edit = await save(editor.cookie, ids, c.id, "editor's draft", null);
    expect(edit.statusCode).toBe(200);

    const publish = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}/status`,
      headers: { cookie: editor.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(publish.statusCode).toBe(403);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${c.id}`,
      headers: { cookie: editor.cookie },
    });
    expect(del.statusCode).toBe(403);
  });

  it("unauthenticated requests are 401 on every chapter route", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${crypto.randomUUID()}/novels/${crypto.randomUUID()}/chapters`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("import/export", () => {
  it("imports markdown: ATX headings become chapters (DRAFT, one version each)", async () => {
    const owner = await seedUser("owner10@t.io");
    const ids = await seedNovel(owner.userId, "imp-ws");
    const text = [
      "# Chapter One",
      "First body line.",
      "More words here.",
      "## Chapter Two",
      "Second body.",
    ].join("\n");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/import`,
      headers: { cookie: owner.cookie },
      payload: { text, format: "md" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().created).toBe(2);

    const chapters = await db.chapter.findMany({
      where: { novelId: ids.novelId },
      orderBy: { number: "asc" },
      include: { currentVersion: true },
    });
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(chapters.every((c) => c.status === "DRAFT")).toBe(true); // imports are not canon
    expect(chapters[0]!.currentVersion!.number).toBe(1);
    expect(chapters[0]!.currentVersion!.note).toBe("import");
  });

  it("exports the whole novel as markdown, ordered, with separator", async () => {
    const owner = await seedUser("owner11@t.io");
    const ids = await seedNovel(owner.userId, "exp-ws");
    const c1 = await makeChapter(owner.cookie, ids, "Alpha");
    const c2 = await makeChapter(owner.cookie, ids, "Beta");
    await save(owner.cookie, ids, c1.id, "alpha content", null);
    await save(owner.cookie, ids, c2.id, "beta content", null);

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/export`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("exp-ws.md");
    const body = res.body;
    expect(body).toContain("# 1. Alpha");
    expect(body).toContain("alpha content");
    expect(body).toContain("# 2. Beta");
    expect(body).toContain("---");
  });

  it("import is isolated per tenant: non-member 404", async () => {
    const owner = await seedUser("owner12@t.io");
    const stranger = await seedUser("stranger12@t.io");
    const ids = await seedNovel(owner.userId, "iso2-ws");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/import`,
      headers: { cookie: stranger.cookie },
      payload: { text: "# X\nbody", format: "md" },
    });
    expect(res.statusCode).toBe(404);
  });
});
