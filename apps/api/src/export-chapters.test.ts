/**
 * NF-WF-017B: export route/service integration suite.
 *
 * Dedicated novelforge_test_export db (parallel-safe per ADR-0003 §8).
 * Covers the 017B acceptance:
 * - each retained export format (TXT, Markdown, PDF, DOCX, EPUB):
 *   correct content-type, content-disposition filename, chapters in
 *   order
 * - `?format=` query param; `md` default (backward compatible with the
 *   frozen md-only route); unknown format → 400 INVALID_INPUT
 * - member `chapter:read` scope (drafts export), tenant isolation 404
 * - sync byte-cap refusal is covered at the renderer level
 *   (export-render.test.ts); the typed-error branch maps EXPORT_TOO_LARGE
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
import JSZip from "jszip";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";

const TEST_DB = "novelforge_test_export";
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
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.checkpoint.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

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

async function seedNovel(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" } });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
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

async function saveHtml(cookie: string, ids: { workspaceId: string; novelId: string }, chapterId: string, html: string) {
  const res = await app.inject({
    method: "PUT",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
    headers: { cookie },
    payload: { content: html, expectedVersion: null },
  });
  expect(res.statusCode).toBe(200);
}

async function seedTwoChapters() {
  const owner = await seedUser("owner@export.io");
  const ids = await seedNovel(owner.userId, "exp-ws");
  const c1 = await makeChapter(owner.cookie, ids, "Alpha");
  const c2 = await makeChapter(owner.cookie, ids, "Beta");
  await saveHtml(
    owner.cookie,
    ids,
    c1.id,
    "<p>The wind howled through the <strong>dark</strong> forest.</p><h2>A New Path</h2><p>She walked on.</p>",
  );
  await saveHtml(
    owner.cookie,
    ids,
    c2.id,
    "<p>Morning came. The road stretched on.</p><blockquote><p>Do not look back.</p></blockquote>",
  );
  return { owner, ids };
}

function exportUrl(ids: { workspaceId: string; novelId: string }, format?: string) {
  return `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/export${format ? `?format=${format}` : ""}`;
}

describe("export route", () => {
  it("md (default, backward compatible): markdown, ordered, F1 shape", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.headers["content-disposition"]).toContain("exp-ws.md");
    const body = res.body;
    expect(body).toContain("# 1. Alpha");
    expect(body).toContain("# 2. Beta");
    expect(body).toContain("**A New Path**");
    expect(body).not.toMatch(/^## /m);
    expect(body.indexOf("# 1. Alpha")).toBeLessThan(body.indexOf("# 2. Beta"));
  });

  it("txt: setext headings, no --- separators", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "txt"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toContain("exp-ws.txt");
    expect(res.body).toContain("1. Alpha\n===\n");
    expect(res.body).not.toContain("---");
  });

  it("docx: valid zip with the chapters in order", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "docx"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.headers["content-disposition"]).toContain("exp-ws.docx");
    const zip = await JSZip.loadAsync(res.rawPayload);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("Alpha");
    expect(doc.indexOf("Alpha")).toBeLessThan(doc.indexOf("Beta"));
  });

  it("pdf: valid PDF", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "pdf"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("exp-ws.pdf");
    expect(res.rawPayload.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("epub: valid EPUB with one document per chapter", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "epub"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/epub+zip");
    expect(res.headers["content-disposition"]).toContain("exp-ws.epub");
    const zip = await JSZip.loadAsync(res.rawPayload);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain('href="ch001.xhtml"');
    expect(opf).toContain('href="ch002.xhtml"');
    const ch1 = await zip.file("OEBPS/ch001.xhtml")!.async("string");
    expect(ch1).toContain("<h1>1. Alpha</h1>");
  });

  it("unknown format → 400 INVALID_INPUT", async () => {
    const { owner, ids } = await seedTwoChapters();
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "rtf"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "INVALID_INPUT" });
  });

  it("export is isolated per tenant: non-member 404", async () => {
    const { ids } = await seedTwoChapters();
    const stranger = await seedUser("stranger@export.io");
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "txt"),
      headers: { cookie: stranger.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("exports drafts: chapter:read scope includes the author's own drafts", async () => {
    const { owner, ids } = await seedTwoChapters();
    const status = await db.chapter.findFirstOrThrow({
      where: { novelId: ids.novelId, number: 1 },
      select: { status: true },
    });
    expect(status.status).toBe("DRAFT");
    const res = await app.inject({
      method: "GET",
      url: exportUrl(ids, "md"),
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("# 1. Alpha");
  });
});
