/**
 * NF-WF-015 API tests: scene CRUD + sanitized-HTML chapter content.
 *
 * Dedicated novelforge_test_scenes db (parallel-safe per ADR-0003 §8).
 * Sessions/users/workspaces/novels seeded directly in the DB to stay off
 * register/login rate limits.
 *
 * Covers (contract Invariants 2, 5, 6):
 * - scene CRUD: create (default max+1 / explicit number), list ordered,
 *   rename / re-summary / transactional reorder, delete; Zod → 400;
 *   membership 404 gate; `chapter:update` capability (VIEWER → 403);
 *   @@unique([chapterId, number]) → 409; sceneId/chapterId scoping → 404;
 *   delete unlinks outline nodes (no planning-data destruction)
 * - sanitized HTML on saveChapter write: script/event-handler/h1
 *   stripped server-side; tag-stripped wordCount (`<p>a</p><p>b</p>` → 2);
 *   sanitization idempotent
 * - forced-race version conflict: two PUTs with the same expectedVersion
 *   → one 200 + one 409 {error: "CONFLICT"}; Keep-mine re-PUT with the
 *   fresh version succeeds (the banner's explicit action)
 * - publication wordCount (F4): resolvePublicChapter counts words, not
 *   tags, with the shared strip rule
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
import { createPlatformServices } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scenes";
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
  await db.outlineNode.deleteMany();
  await db.saga.deleteMany();
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
  return { workspaceId: ws.id, novelId: novel.id, novelSlug: slug };
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

const scenesUrl = (ids: { workspaceId: string; novelId: string }, chapterId: string) =>
  `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/scenes`;

async function createScene(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: scenesUrl(ids, chapterId),
    headers: { cookie },
    payload: body,
  });
}

describe("scene CRUD", () => {
  it("restores scene metadata and ordering while retaining later revision history", async () => {
    const owner = await seedUser("sc-restore@t.io");
    const ids = await seedNovel(owner.userId, "sc-restore");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const first = (await createScene(owner.cookie, ids, ch.id, { title: "First" })).json() as { id: string };
    const second = (await createScene(owner.cookie, ids, ch.id, { title: "Second" })).json() as { id: string };
    const base = `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}`;
    const checkpoint = await app.inject({ method: "POST", url: `${base}/checkpoints`,
      headers: { cookie: owner.cookie }, payload: { label: "Scene baseline" } });
    expect(checkpoint.statusCode, checkpoint.body).toBe(201);
    const edit = await app.inject({ method: "PATCH", url: `${scenesUrl(ids, ch.id)}/${second.id}`,
      headers: { cookie: owner.cookie }, payload: { title: "Changed", number: 1 } });
    expect(edit.statusCode).toBe(200);
    await createScene(owner.cookie, ids, ch.id, { title: "Later scene" });
    const before = await db.revision.count({ where: { novelId: ids.novelId } });
    const preview = await app.inject({ method: "POST", url: `${base}/restores/preview`,
      headers: { cookie: owner.cookie }, payload: { checkpointId: checkpoint.json().checkpointId, scope: "FULL" } });
    expect(preview.statusCode, preview.body).toBe(201);
    const apply = await app.inject({ method: "POST", url: `${base}/restores/${preview.json().restoreOperationId}/apply`,
      headers: { cookie: owner.cookie } });
    expect(apply.statusCode, apply.body).toBe(200);
    expect(await db.scene.findMany({ where: { chapterId: ch.id }, orderBy: { number: "asc" },
      select: { id: true, number: true, title: true } })).toEqual([
      { id: first.id, number: 1, title: "First" }, { id: second.id, number: 2, title: "Second" },
    ]);
    expect(await db.revision.count({ where: { novelId: ids.novelId } })).toBeGreaterThan(before);
  });

  it("serializes concurrent scene numbering and revision advancement", async () => {
    const owner = await seedUser("sc-concurrent@t.io");
    const ids = await seedNovel(owner.userId, "sc-concurrent");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const before = await db.revision.count({ where: { novelId: ids.novelId } });
    const responses = await Promise.all(["First", "Second"].map((title) => createScene(owner.cookie, ids, ch.id, { title })));
    expect(responses.map((res) => res.statusCode)).toEqual([201, 201]);
    expect(responses.map((res) => res.json().number).sort()).toEqual([1, 2]);
    expect(await db.revision.count({ where: { novelId: ids.novelId } })).toBe(before + 2);
  });

  it("versions create, metadata edits and every reordered scene on the checked-out branch", async () => {
    const owner = await seedUser("sc-revisions@t.io");
    const ids = await seedNovel(owner.userId, "sc-revisions");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const main = await db.novelBranch.findFirstOrThrow({ where: { novelId: ids.novelId, name: "main" } });
    const branch = await db.novelBranch.create({ data: { novelId: ids.novelId, workspaceId: ids.workspaceId,
      name: "scene-revisions", headRevisionId: main.headRevisionId } });
    await db.novel.update({ where: { id: ids.novelId }, data: { currentBranchId: branch.id } });
    const first = (await createScene(owner.cookie, ids, ch.id, { title: "First" })).json() as { id: string };
    const created = await db.novelBranch.findUniqueOrThrow({ where: { id: branch.id } });
    expect(created.headRevisionId).not.toBe(main.headRevisionId);
    const creation = await db.revision.findUniqueOrThrow({ where: { id: created.headRevisionId! },
      include: { changeSet: { include: { items: true } } } });
    expect(creation.changeSet!.items).toMatchObject([{ entityType: "Scene", entityId: first.id, operation: "CREATE" }]);
    expect(await db.derivedRebuildIntent.count({ where: { sourceRevisionId: creation.id, projection: "manuscript" } })).toBe(1);
    const second = (await createScene(owner.cookie, ids, ch.id, { title: "Second" })).json() as { id: string };
    const edit = await app.inject({ method: "PATCH", url: `${scenesUrl(ids, ch.id)}/${second.id}`,
      headers: { cookie: owner.cookie }, payload: { title: "Updated", summary: "New summary", number: 1 } });
    expect(edit.statusCode, edit.body).toBe(200);
    const head = await db.novelBranch.findUniqueOrThrow({ where: { id: branch.id } });
    const revision = await db.revision.findUniqueOrThrow({ where: { id: head.headRevisionId! },
      include: { changeSet: { include: { items: true } } } });
    expect(revision.changeSet!.items.map((item) => [item.entityId, item.operation]).sort()).toEqual(
      [[first.id, "UPDATE"], [second.id, "UPDATE"]].sort());
    expect(await db.derivedRebuildIntent.count({ where: { sourceRevisionId: revision.id, projection: "manuscript" } })).toBe(1);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: main.id } })).headRevisionId).toBe(main.headRevisionId);
    const beforeNoop = await db.scene.findMany({ where: { chapterId: ch.id }, orderBy: { id: "asc" } });
    const noop = await app.inject({ method: "PATCH", url: `${scenesUrl(ids, ch.id)}/${second.id}`,
      headers: { cookie: owner.cookie }, payload: { title: "Updated", summary: "New summary", number: 1 } });
    expect(noop.statusCode).toBe(200);
    const clamped = await app.inject({ method: "PATCH", url: `${scenesUrl(ids, ch.id)}/${first.id}`,
      headers: { cookie: owner.cookie }, payload: { number: 999 } });
    expect(clamped.statusCode).toBe(200);
    expect(await db.scene.findMany({ where: { chapterId: ch.id }, orderBy: { id: "asc" } })).toEqual(beforeNoop);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: branch.id } })).headRevisionId).toBe(head.headRevisionId);
    const refused = await createScene(owner.cookie, ids, ch.id, { title: "Duplicate", number: 1 });
    expect(refused.statusCode).toBe(409);
    expect(await db.scene.count({ where: { chapterId: ch.id } })).toBe(2);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: branch.id } })).headRevisionId).toBe(head.headRevisionId);
  });

  it("creates scenes numbered max+1 by default and lists them ordered", async () => {
    const owner = await seedUser("sc-owner1@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws1");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const r1 = await createScene(owner.cookie, ids, ch.id, { title: "First" });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ number: 1, title: "First", summary: null });

    const r2 = await createScene(owner.cookie, ids, ch.id, {
      title: "Second",
      summary: "A summary.",
    });
    expect(r2.json()).toMatchObject({ number: 2, title: "Second", summary: "A summary." });

    const list = await app.inject({
      method: "GET",
      url: scenesUrl(ids, ch.id),
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    const scenes = list.json() as Array<{ number: number; title: string }>;
    expect(scenes.map((s) => [s.number, s.title])).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
    // Only the pinned shape is returned.
    expect(Object.keys(scenes[0]!).sort()).toEqual(["id", "number", "summary", "title"]);
  });

  it("accepts an explicit number and rejects duplicates with 409", async () => {
    const owner = await seedUser("sc-owner2@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws2");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const r1 = await createScene(owner.cookie, ids, ch.id, { title: "Gap", number: 5 });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ number: 5 });

    // Default numbering continues from the max.
    const r2 = await createScene(owner.cookie, ids, ch.id, { title: "Next" });
    expect(r2.json()).toMatchObject({ number: 6 });

    const dup = await createScene(owner.cookie, ids, ch.id, { title: "Dup", number: 5 });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: string }).error).toBe("CONFLICT");
  });

  it("renames, re-summaries, and reorders transactionally", async () => {
    const owner = await seedUser("sc-owner3@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws3");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const mk = async (title: string) =>
      (await createScene(owner.cookie, ids, ch.id, { title })).json() as { id: string };
    const s1 = await mk("One");
    await mk("Two");
    const s3 = await mk("Three");
    const patch = (sceneId: string, body: Record<string, unknown>) =>
      app.inject({
        method: "PATCH",
        url: `${scenesUrl(ids, ch.id)}/${sceneId}`,
        headers: { cookie: owner.cookie },
        payload: body,
      });

    const renamed = await patch(s1.id, { title: "Uno" });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { title: string }).title).toBe("Uno");

    const summarized = await patch(s1.id, { summary: "New summary" });
    expect((summarized.json() as { summary: string }).summary).toBe("New summary");
    const cleared = await patch(s1.id, { summary: null });
    expect((cleared.json() as { summary: null }).summary).toBeNull();

    // Move scene 3 to position 1: order becomes [Three, Uno, Two], renumbered 1..3.
    const moved = await patch(s3.id, { number: 1 });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ number: 1 });

    const list = (await app.inject({
      method: "GET",
      url: scenesUrl(ids, ch.id),
      headers: { cookie: owner.cookie },
    })).json() as Array<{ number: number; title: string }>;
    expect(list.map((s) => [s.number, s.title])).toEqual([
      [1, "Three"],
      [2, "Uno"],
      [3, "Two"],
    ]);
  });

  it("validates bodies: 400 on empty patch, bad title, bad number", async () => {
    const owner = await seedUser("sc-owner4@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws4");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const badCreate = await createScene(owner.cookie, ids, ch.id, { title: "" });
    expect(badCreate.statusCode).toBe(400);
    const longCreate = await createScene(owner.cookie, ids, ch.id, { title: "x".repeat(201) });
    expect(longCreate.statusCode).toBe(400);
    const zeroNumber = await createScene(owner.cookie, ids, ch.id, { title: "Z", number: 0 });
    expect(zeroNumber.statusCode).toBe(400);

    const s = (await createScene(owner.cookie, ids, ch.id, { title: "Ok" })).json() as { id: string };
    const patch = (body: Record<string, unknown>) =>
      app.inject({
        method: "PATCH",
        url: `${scenesUrl(ids, ch.id)}/${s.id}`,
        headers: { cookie: owner.cookie },
        payload: body,
      });
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ title: "" })).statusCode).toBe(400);
    expect((await patch({ number: 0 })).statusCode).toBe(400);
    expect((await patch({ title: "x".repeat(201) })).statusCode).toBe(400);
  });

  it("deletes scenes; missing or cross-chapter ids are 404", async () => {
    const owner = await seedUser("sc-owner5@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws5");
    const ch1 = await makeChapter(owner.cookie, ids, "Ch 1");
    const ch2 = await makeChapter(owner.cookie, ids, "Ch 2");
    const s = (await createScene(owner.cookie, ids, ch1.id, { title: "Gone" })).json() as { id: string };

    // A scene id under the WRONG chapter is 404 (chapter scoping).
    const cross = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch2.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(cross.statusCode).toBe(404);

    const del = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch1.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(200);

    const again = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch1.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(again.statusCode).toBe(404);

    const patchMissing = await app.inject({
      method: "PATCH",
      url: `${scenesUrl(ids, ch1.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
      payload: { title: "x" },
    });
    expect(patchMissing.statusCode).toBe(404);
  });

  it("delete cascades to linked outline beats (NF-WF-034, GAP-055)", async () => {
    const owner = await seedUser("sc-owner6@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws6");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const s = (await createScene(owner.cookie, ids, ch.id, { title: "Linked" })).json() as { id: string };

    const saga = await db.saga.create({
      data: { novelId: ids.novelId, kind: "SAGA", title: "Saga", createdById: owner.userId },
    });
    const node = await db.outlineNode.create({
      data: {
        novelId: ids.novelId,
        sagaId: saga.id,
        kind: "SCENE",
        title: "Beat",
        order: 1,
        sceneId: s.id,
      },
    });

    // Cascade: the beat is deleted with the scene — 200 with deletedBeats,
    // never a 409 refusal (the old behavior).
    const del = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as {
      status: string;
      deletedBeats: Array<{ id: string; title: string; order: number; sagaId: string }>;
    };
    expect(body.status).toBe("ok");
    expect(body.deletedBeats).toHaveLength(1);
    expect(body.deletedBeats[0]).toMatchObject({
      id: node.id,
      title: "Beat",
      order: 1,
      sagaId: saga.id,
    });

    // Both rows are gone.
    expect(await db.outlineNode.findUnique({ where: { id: node.id } })).toBeNull();
    expect(await db.scene.findUnique({ where: { id: s.id } })).toBeNull();

    // Audit: one scene.deleted + one planning.outline-node-deleted with
    // { sagaId, order, sceneId }.
    const audits = await db.auditLog.findMany({
      where: { workspaceId: ids.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    const sceneDeleted = audits.filter((a) => a.action === "scene.deleted");
    expect(sceneDeleted).toHaveLength(1);
    expect(sceneDeleted[0]!.entityId).toBe(s.id);
    const beatDeleted = audits.filter((a) => a.action === "planning.outline-node-deleted");
    expect(beatDeleted).toHaveLength(1);
    expect(beatDeleted[0]!.entityId).toBe(node.id);
    expect(beatDeleted[0]!.payload).toMatchObject({
      sagaId: saga.id,
      order: 1,
      sceneId: s.id,
    });
  });

  it("delete cascades multiple beats across sagas", async () => {
    const owner = await seedUser("sc-owner6b@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws6b");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const s = (await createScene(owner.cookie, ids, ch.id, { title: "Multi" })).json() as { id: string };

    const saga1 = await db.saga.create({
      data: { novelId: ids.novelId, kind: "SAGA", title: "Saga 1", createdById: owner.userId },
    });
    const saga2 = await db.saga.create({
      data: { novelId: ids.novelId, kind: "SAGA", title: "Saga 2", createdById: owner.userId },
    });
    const nodes = await Promise.all(
      [
        { sagaId: saga1.id, order: 1, title: "B1" },
        { sagaId: saga1.id, order: 2, title: "B2" },
        { sagaId: saga2.id, order: 1, title: "B3" },
      ].map((n) =>
        db.outlineNode.create({
          data: { novelId: ids.novelId, sagaId: n.sagaId, kind: "SCENE", title: n.title, order: n.order, sceneId: s.id },
        }),
      ),
    );

    const del = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as { deletedBeats: Array<{ id: string }> };
    expect(body.deletedBeats).toHaveLength(3);
    const deletedIds = new Set(body.deletedBeats.map((b) => b.id));
    for (const n of nodes) expect(deletedIds.has(n.id)).toBe(true);

    expect(await db.outlineNode.count({ where: { sceneId: s.id } })).toBe(0);
    expect(await db.scene.findUnique({ where: { id: s.id } })).toBeNull();

    const beatAudits = await db.auditLog.count({
      where: { workspaceId: ids.workspaceId, action: "planning.outline-node-deleted" },
    });
    expect(beatAudits).toBe(3);
  });

  it("records scene deletion on the checked-out branch, leaving main head unchanged", async () => {
    const owner = await seedUser("sc-branch-owner@t.io");
    const ids = await seedNovel(owner.userId, "sc-branch-ws");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const scene = (await createScene(owner.cookie, ids, ch.id, { title: "Alternate" })).json() as { id: string };
    const main = await db.novelBranch.findFirstOrThrow({ where: { novelId: ids.novelId, name: "main" } });
    const branch = await db.novelBranch.create({ data: { novelId: ids.novelId, workspaceId: ids.workspaceId,
      name: "alternate-delete", headRevisionId: main.headRevisionId } });
    await db.novel.update({ where: { id: ids.novelId }, data: { currentBranchId: branch.id } });
    const res = await app.inject({ method: "DELETE", url: `${scenesUrl(ids, ch.id)}/${scene.id}`, headers: { cookie: owner.cookie } });
    expect(res.statusCode).toBe(200);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: main.id } })).headRevisionId).toBe(main.headRevisionId);
    expect((await db.novelBranch.findUniqueOrThrow({ where: { id: branch.id } })).headRevisionId).not.toBe(main.headRevisionId);
  });

  it("delete with no linked beats returns empty deletedBeats", async () => {
    const owner = await seedUser("sc-owner6c@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws6c");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const s = (await createScene(owner.cookie, ids, ch.id, { title: "Plain" })).json() as { id: string };

    const del = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${s.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as { deletedBeats: unknown[] }).deletedBeats).toEqual([]);
    expect(await db.scene.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("delete refuses 403 when EDITOR lacks canon:manage and beats are linked", async () => {
    const owner = await seedUser("sc-owner6d@t.io");
    const editor = await seedUser("sc-editor6d@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws6d");
    await db.membership.create({
      data: { workspaceId: ids.workspaceId, userId: editor.userId, role: "EDITOR" },
    });
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const sLinked = (await createScene(owner.cookie, ids, ch.id, { title: "Linked" })).json() as { id: string };
    const sPlain = (await createScene(owner.cookie, ids, ch.id, { title: "Plain" })).json() as { id: string };

    const saga = await db.saga.create({
      data: { novelId: ids.novelId, kind: "SAGA", title: "Saga", createdById: owner.userId },
    });
    const node = await db.outlineNode.create({
      data: {
        novelId: ids.novelId,
        sagaId: saga.id,
        kind: "SCENE",
        title: "Beat",
        order: 1,
        sceneId: sLinked.id,
      },
    });

    // EDITOR holds chapter:update but not canon:manage — 403, zero rows deleted.
    const refused = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${sLinked.id}`,
      headers: { cookie: editor.cookie },
    });
    expect(refused.statusCode).toBe(403);
    expect(await db.scene.findUnique({ where: { id: sLinked.id } })).not.toBeNull();
    expect(await db.outlineNode.findUnique({ where: { id: node.id } })).not.toBeNull();

    // Same EDITOR with no linked beats → 200 (chapter:update suffices).
    const ok = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${sPlain.id}`,
      headers: { cookie: editor.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(await db.scene.findUnique({ where: { id: sPlain.id } })).toBeNull();

    // OWNER (both capabilities) → 200 with cascade.
    const ownerDel = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${sLinked.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(ownerDel.statusCode).toBe(200);
    expect((ownerDel.json() as { deletedBeats: unknown[] }).deletedBeats).toHaveLength(1);
    expect(await db.outlineNode.findUnique({ where: { id: node.id } })).toBeNull();
  });

  it("delete leaves non-SCENE nodes and other scenes' beats untouched", async () => {
    const owner = await seedUser("sc-owner6e@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws6e");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const s1 = (await createScene(owner.cookie, ids, ch.id, { title: "S1" })).json() as { id: string };
    const s2 = (await createScene(owner.cookie, ids, ch.id, { title: "S2" })).json() as { id: string };

    const saga = await db.saga.create({
      data: { novelId: ids.novelId, kind: "SAGA", title: "Saga", createdById: owner.userId },
    });
    // CHAPTER-kind node (linked to chapter, not scene) — CHECK forbids
    // sceneId on non-SCENE kinds.
    const chapterNode = await db.outlineNode.create({
      data: {
        novelId: ids.novelId,
        sagaId: saga.id,
        kind: "CHAPTER",
        title: "Chapter beat",
        order: 1,
        chapterId: ch.id,
      },
    });
    const otherBeat = await db.outlineNode.create({
      data: {
        novelId: ids.novelId,
        sagaId: saga.id,
        kind: "SCENE",
        title: "Other beat",
        order: 2,
        sceneId: s2.id,
      },
    });
    await db.outlineNode.create({
      data: {
        novelId: ids.novelId,
        sagaId: saga.id,
        kind: "SCENE",
        title: "Own beat",
        order: 3,
        sceneId: s1.id,
      },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${s1.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as { deletedBeats: unknown[] }).deletedBeats).toHaveLength(1);

    // CHAPTER node and the other scene's beat survive.
    expect(await db.outlineNode.findUnique({ where: { id: chapterNode.id } })).not.toBeNull();
    expect(await db.outlineNode.findUnique({ where: { id: otherBeat.id } })).not.toBeNull();
    expect(await db.scene.findUnique({ where: { id: s2.id } })).not.toBeNull();
  });

  it("gates: 401 without session, 404 for non-members, 403 for VIEWER", async () => {
    const owner = await seedUser("sc-owner7@t.io");
    const viewer = await seedUser("sc-viewer7@t.io");
    const outsider = await seedUser("sc-outsider7@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws7");
    await db.membership.create({
      data: { workspaceId: ids.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const s = (await createScene(owner.cookie, ids, ch.id, { title: "S" })).json() as { id: string };

    const noAuth = await app.inject({ method: "GET", url: scenesUrl(ids, ch.id) });
    expect(noAuth.statusCode).toBe(401);

    const outsiderGet = await app.inject({
      method: "GET",
      url: scenesUrl(ids, ch.id),
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderGet.statusCode).toBe(404);
    const outsiderPost = await createScene(outsider.cookie, ids, ch.id, { title: "X" });
    expect(outsiderPost.statusCode).toBe(404);

    // Scene routes require `chapter:update`; VIEWER is read-only.
    const viewerGet = await app.inject({
      method: "GET",
      url: scenesUrl(ids, ch.id),
      headers: { cookie: viewer.cookie },
    });
    expect(viewerGet.statusCode).toBe(403);
    const viewerPost = await createScene(viewer.cookie, ids, ch.id, { title: "X" });
    expect(viewerPost.statusCode).toBe(403);
    const viewerPatch = await app.inject({
      method: "PATCH",
      url: `${scenesUrl(ids, ch.id)}/${s.id}`,
      headers: { cookie: viewer.cookie },
      payload: { title: "Y" },
    });
    expect(viewerPatch.statusCode).toBe(403);
    const viewerDel = await app.inject({
      method: "DELETE",
      url: `${scenesUrl(ids, ch.id)}/${s.id}`,
      headers: { cookie: viewer.cookie },
    });
    expect(viewerDel.statusCode).toBe(403);
  });
});

describe("sanitized HTML on save (Invariant 2)", () => {
  async function save(cookie: string, ids: { workspaceId: string; novelId: string }, chapterId: string, content: string, expectedVersion: number | null) {
    return app.inject({
      method: "PUT",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
      headers: { cookie },
      payload: { content, expectedVersion },
    });
  }
  async function getContent(cookie: string, ids: { workspaceId: string; novelId: string }, chapterId: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { content: string; wordCount: number }).content;
  }

  it("strips script, event handlers, h1, and non-allowlisted tags server-side", async () => {
    const owner = await seedUser("sc-owner8@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws8");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const dirty =
      `<script>alert(1)</script>` +
      `<p onclick="evil()">Hello</p>` +
      `<h1>Not a heading</h1>` +
      `<div>div text</div>` +
      `<p>Keep <strong>bold</strong> and <em>italic</em></p>` +
      `<blockquote>quoted</blockquote><h2>Section</h2>` +
      `<ul><li>one</li><li>two</li></ul><hr><br>`;
    const res = await save(owner.cookie, ids, ch.id, dirty, null);
    expect(res.statusCode).toBe(200);

    const stored = await getContent(owner.cookie, ids, ch.id);
    expect(stored).not.toContain("<script");
    expect(stored).not.toContain("onclick");
    expect(stored).not.toContain("<h1");
    expect(stored).not.toContain("<div");
    // Disallowed tags are discarded but their text survives as prose.
    expect(stored).toContain("Not a heading");
    expect(stored).toContain("div text");
    // Allowlisted tags survive.
    expect(stored).toContain("<p>Hello</p>");
    expect(stored).toContain("<strong>bold</strong>");
    expect(stored).toContain("<em>italic</em>");
    expect(stored).toContain("<blockquote>quoted</blockquote>");
    expect(stored).toContain("<h2>Section</h2>");
    expect(stored).toContain("<li>one</li>");
  });

  it("counts words, not tags: <p>a</p><p>b</p> → 2", async () => {
    const owner = await seedUser("sc-owner9@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws9");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const res = await save(owner.cookie, ids, ch.id, "<p>a</p><p>b</p>", null);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { wordCount: number }).wordCount).toBe(2);

    const detail = (await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
      headers: { cookie: owner.cookie },
    })).json() as { wordCount: number };
    expect(detail.wordCount).toBe(2);
  });

  it("sanitization is idempotent: re-saving stored content stores it verbatim", async () => {
    const owner = await seedUser("sc-owner10@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws10");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    await save(owner.cookie, ids, ch.id, `<p onclick="x()">Hi</p><h1>T</h1><script>z()</script>`, null);
    const once = await getContent(owner.cookie, ids, ch.id);
    const res = await save(owner.cookie, ids, ch.id, once, 1);
    expect(res.statusCode).toBe(200);
    const twice = await getContent(owner.cookie, ids, ch.id);
    expect(twice).toBe(once);
  });
});

describe("forced-race version conflict (Invariant 5)", () => {
  it("two PUTs with the same expectedVersion → one 200, one 409; keep-mine re-PUT succeeds", async () => {
    const owner = await seedUser("sc-owner11@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws11");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");
    const put = (content: string, expectedVersion: number | null) =>
      app.inject({
        method: "PUT",
        url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
        headers: { cookie: owner.cookie },
        payload: { content, expectedVersion },
      });

    const first = await put("<p>version one</p>", null);
    expect(first.statusCode).toBe(200);

    // Two concurrent saves with the same stale expectedVersion.
    const [a, b] = await Promise.all([put("<p>mine</p>", 1), put("<p>theirs</p>", 1)]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect((loser.json() as { error: string }).error).toBe("CONFLICT");

    // The banner's Keep-mine: re-PUT the local HTML with the fresh server
    // version as expectedVersion — overwrites, no silent data loss.
    const fresh = (await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
      headers: { cookie: owner.cookie },
    })).json() as { currentVersion: number };
    const keepMine = await put("<p>mine</p>", fresh.currentVersion);
    expect(keepMine.statusCode).toBe(200);
    expect((keepMine.json() as { version: number }).version).toBe(fresh.currentVersion + 1);

    const detail = (await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
      headers: { cookie: owner.cookie },
    })).json() as { content: string };
    expect(detail.content).toBe("<p>mine</p>");
  });
});

describe("publication wordCount strips tags (F4)", () => {
  it("the public chapter wordCount counts words, not tags", async () => {
    const owner = await seedUser("sc-owner12@t.io");
    const ids = await seedNovel(owner.userId, "sc-ws12");
    const ch = await makeChapter(owner.cookie, ids, "Ch 1");

    const saved = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}`,
      headers: { cookie: owner.cookie },
      payload: { content: "<p>alpha</p><p>beta</p><p>gamma</p>", expectedVersion: null },
    });
    expect(saved.statusCode).toBe(200);

    // Deterministic PASS receipt (the review logic is 010's tested
    // territory); then publish through the 012 release path, which
    // creates the Publication row the public reader resolves.
    const version = await db.chapterVersion.findFirstOrThrow({
      where: { chapterId: ch.id },
      orderBy: { number: "desc" },
    });
    const branch = await db.novelBranch.findFirstOrThrow({
      where: { novelId: ids.novelId, name: "main" },
      select: { headRevisionId: true },
    });
    await db.finalTextReview.create({
      data: {
        workspaceId: ids.workspaceId,
        novelId: ids.novelId,
        chapterVersionId: version.id,
        revisionId: branch.headRevisionId!,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: {},
      },
    });
    const published = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${ch.id}/publication/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(published.statusCode).toBe(200);

    const pub = await app.inject({
      method: "GET",
      url: `/api/public/novels/${ids.novelSlug}/chapters/1`,
    });
    expect(pub.statusCode).toBe(200);
    const body = pub.json() as { chapter: { wordCount: number; content: string } };
    expect(body.chapter.wordCount).toBe(3);
    expect(body.chapter.content).toContain("<p>alpha</p>");
  });
});
