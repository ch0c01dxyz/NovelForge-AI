/**
 * NF-WF-017A: import normalization integration suite.
 *
 * Dedicated novelforge_test_import db (parallel-safe per ADR-0003 §8).
 * Covers the 017A acceptance:
 * - each retained import format (TXT, Markdown, PDF, DOCX) has a real
 *   in-repo fixture and an end-to-end import test asserting chapters
 *   created, DRAFT status, one version each, note: "import"
 * - GAP-061: imported content is sanitized through the same
 *   sanitize → strip → count sequence as saveChapter
 * - size/type validation refusals are actionable 400s, never partial
 * - no automatic canon promotion: zero CanonFacts/CanonProposals
 * - multipart route wiring (file upload) + tenant isolation
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
import { createPlatformServices } from "@novelforge/ai-services";
import { countWords, stripHtmlTags } from "./services/manuscript.ts";

const TEST_DB = "novelforge_test_import";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
const FIXTURES = path.join(HERE, "..", "test-fixtures", "import");

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
DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
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

const fixture = (name: string): Buffer => readFileSync(path.join(FIXTURES, name));

async function importFile(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  name: string,
  buffer: Buffer,
  mimeType: string,
  fields: Record<string, string> = {},
) {
  const boundary = "----nf-import-test-boundary";
  const chunks: string[] = [];
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const head = Buffer.from(chunks.join(""), "utf-8");
  const tail = Buffer.from("\r\n", "utf-8");
  const parts: Buffer[] = [head, buffer, tail];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        "utf-8",
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));
  return app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/import/file`,
    headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(parts),
  });
}

async function chaptersOf(novelId: string) {
  return db.chapter.findMany({
    where: { novelId },
    orderBy: { number: "asc" },
    include: { currentVersion: true },
  });
}

describe("import normalization: per-format fixtures", () => {
  it("TXT fixture: chapters created, DRAFT, one version, note=import", async () => {
    const owner = await seedUser("imp-txt@t.io");
    const ids = await seedNovel(owner.userId, "imp-txt");
    const res = await importFile(owner.cookie, ids, "sample.txt", fixture("sample.txt"), "text/plain");
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().created).toBe(2);
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(chapters.every((c) => c.status === "DRAFT")).toBe(true);
    expect(chapters.every((c) => c.currentVersion!.number === 1)).toBe(true);
    expect(chapters.every((c) => c.currentVersion!.note === "import")).toBe(true);
    // Sanitized HTML through the save-path sequence (GAP-061).
    expect(chapters[0]!.currentVersion!.content).toContain("<p>The first chapter begins");
    expect(chapters[0]!.currentVersion!.content).not.toMatch(/<script/i);
  });

  it("Markdown fixture: chapters created with allowlist HTML", async () => {
    const owner = await seedUser("imp-md@t.io");
    const ids = await seedNovel(owner.userId, "imp-md");
    const res = await importFile(owner.cookie, ids, "sample.md", fixture("sample.md"), "text/markdown");
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().created).toBe(2);
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    const c1 = chapters[0]!.currentVersion!.content;
    expect(c1).toContain("<strong>Bold words</strong>");
    expect(c1).toContain("<em>italic words</em>");
    expect(c1).toContain("<blockquote>");
    expect(c1).toContain("<ul>");
    // sanitize-html serializes void tags XHTML-style; the tag name is
    // what the allowlist pins.
    expect(c1).toContain("<hr");
    // The <script> injection attempt is escaped then sanitized away.
    expect(c1).not.toMatch(/<script/i);
    expect(chapters[1]!.currentVersion!.content).toContain("<h2>A Subheading</h2>");
  });

  it("PDF fixture: page breaks do not create chapters; === splits", async () => {
    const owner = await seedUser("imp-pdf@t.io");
    const ids = await seedNovel(owner.userId, "imp-pdf");
    const res = await importFile(owner.cookie, ids, "sample.pdf", fixture("sample.pdf"), "application/pdf");
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().created).toBe(2);
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    // Chapter One spans both PDF pages: page breaks never split chapters.
    expect(chapters[0]!.currentVersion!.content).toContain("page one of the PDF");
    expect(chapters[0]!.currentVersion!.content).toContain("still Chapter One, on page two");
    expect(chapters.every((c) => c.status === "DRAFT")).toBe(true);
  });

  it("DOCX fixture: Heading 1 splits; skip notice lists dropped structures", async () => {
    const owner = await seedUser("imp-docx@t.io");
    const ids = await seedNovel(owner.userId, "imp-docx");
    const res = await importFile(
      owner.cookie,
      ids,
      "sample.docx",
      fixture("sample.docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { created: number; skipped: string[] };
    expect(body.created).toBe(2);
    expect(body.skipped.join("; ")).toContain("1 table dropped");
    expect(body.skipped.join("; ")).toContain("1 image dropped");
    expect(body.skipped.join("; ")).toContain("1 footnote dropped");
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    expect(chapters[0]!.currentVersion!.content).toContain("<strong>boldly</strong>");
    expect(chapters[0]!.currentVersion!.content).toContain("<h2>A Subheading</h2>");
    // Tables/images/footnotes leave no markup in the prose.
    expect(chapters[0]!.currentVersion!.content).not.toMatch(/<table/i);
    expect(chapters[0]!.currentVersion!.content).not.toMatch(/<img/i);
  });

  it("manual format override: txt bytes declared as md", async () => {
    const owner = await seedUser("imp-ovr@t.io");
    const ids = await seedNovel(owner.userId, "imp-ovr");
    const res = await importFile(owner.cookie, ids, "notes.txt", Buffer.from("# Title\nbody", "utf-8"), "text/plain", {
      format: "md",
    });
    expect(res.statusCode, res.body).toBe(201);
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.map((c) => c.title)).toEqual(["Title"]);
  });
});

describe("GAP-061: import writes sanitize → strip → count like saveChapter", () => {
  it("paste import with <script>/event-handler markup lands sanitized with tag-stripped word count", async () => {
    const owner = await seedUser("imp-gap61@t.io");
    const ids = await seedNovel(owner.userId, "imp-gap61");
    const text = [
      "# Evil",
      "Hello <script>alert(1)</script> world.",
      '<img src=x onerror="alert(2)">',
      "**bold** tail",
    ].join("\n");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/import`,
      headers: { cookie: owner.cookie },
      payload: { text, format: "md" },
    });
    expect(res.statusCode).toBe(201);
    const chapters = await chaptersOf(ids.novelId);
    const content = chapters[0]!.currentVersion!.content;
    // No LIVE hostile markup: the payload's <script>/<img> arrived
    // escaped (inert text); a live tag or a live event-handler attribute
    // would match the patterns below.
    expect(content).not.toMatch(/<script/i);
    expect(content).not.toMatch(/<img[\s>]/i);
    expect(content).not.toMatch(/<[^>]*\sonerror\s*=/i);
    // The escaped payload is visible as inert text, never as code.
    expect(content).toContain("&lt;script&gt;");
    // Word count is computed on tag-stripped text, exactly like saveChapter.
    const expected = countWords(stripHtmlTags(content));
    expect(chapters[0]!.currentVersion!.wordCount).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("import validation: actionable 400s, never partial", () => {
  it("binary garbage is rejected with IMPORT_UNSUPPORTED_TYPE", async () => {
    const owner = await seedUser("imp-bad@t.io");
    const ids = await seedNovel(owner.userId, "imp-bad");
    const res = await importFile(owner.cookie, ids, "evil.bin", Buffer.from([0, 1, 2, 3, 4]), "application/octet-stream");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("IMPORT_UNSUPPORTED_TYPE");
    expect(await db.chapter.count({ where: { novelId: ids.novelId } })).toBe(0);
  });

  it("a ZIP that is not a DOCX is rejected", async () => {
    const owner = await seedUser("imp-zip@t.io");
    const ids = await seedNovel(owner.userId, "imp-zip");
    const zip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const res = await importFile(owner.cookie, ids, "archive.zip", zip, "application/zip", { format: "docx" });
    expect(res.statusCode).toBe(400);
    expect(["IMPORT_UNSUPPORTED_TYPE", "IMPORT_CORRUPT"]).toContain(res.json().error);
    expect(await db.chapter.count({ where: { novelId: ids.novelId } })).toBe(0);
  });

  it("scanned/empty PDF is rejected with IMPORT_NO_TEXT", async () => {
    const owner = await seedUser("imp-scan@t.io");
    const ids = await seedNovel(owner.userId, "imp-scan");
    const res = await importFile(owner.cookie, ids, "empty.pdf", fixture("empty.pdf"), "application/pdf");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("IMPORT_NO_TEXT");
    expect(await db.chapter.count({ where: { novelId: ids.novelId } })).toBe(0);
  });

  it("file import is isolated per tenant: non-member 404", async () => {
    const owner = await seedUser("imp-iso-owner@t.io");
    const stranger = await seedUser("imp-iso-stranger@t.io");
    const ids = await seedNovel(owner.userId, "imp-iso");
    const res = await importFile(stranger.cookie, ids, "sample.txt", fixture("sample.txt"), "text/plain");
    expect(res.statusCode).toBe(404);
  });
});

describe("Invariant 4: no automatic canon promotion", () => {
  it("importing claim-like prose creates zero CanonFacts and zero CanonProposals", async () => {
    const owner = await seedUser("imp-canon@t.io");
    const ids = await seedNovel(owner.userId, "imp-canon");
    const text = [
      "# Claims",
      "Aldric is the true king of Valdoria. The sword Dawnbreaker was forged in dragonfire.",
      "Mira betrayed the council on the winter solstice.",
    ].join("\n");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/import`,
      headers: { cookie: owner.cookie },
      payload: { text, format: "md" },
    });
    expect(res.statusCode).toBe(201);
    expect(await db.canonFact.count({ where: { novelId: ids.novelId } })).toBe(0);
    expect(await db.canonProposal.count({ where: { novelId: ids.novelId } })).toBe(0);
    const chapters = await chaptersOf(ids.novelId);
    expect(chapters.every((c) => c.status === "DRAFT")).toBe(true);
  });
});
