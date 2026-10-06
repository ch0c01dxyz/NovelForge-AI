/**
 * Notifications surface (NF-WF-019C) integration suite.
 *
 * Dedicated novelforge_test_notifications db (parallel-safe per ADR-0003 §8).
 * The notification fan-out queue is faked (the publication-queue precedent);
 * the fan-out handler itself is covered in the worker suite.
 *
 * Covers (019C acceptance):
 * - GET /api/reader/notifications: own inbox only, unreadCount, cursor
 *   pagination; 401 unauthenticated; another user's rows unreachable
 * - POST /:id/read and POST /read-all: mark-read semantics; 404 on
 *   another user's id (no oracle)
 * - GET/PUT /preferences: pinned defaults all ON (absent row = ON);
 *   unknown type → 400; master-switch semantics (OFF writes all three
 *   false, ON writes all three true)
 * - Pinned event emission API (the 019B call sites): comment.replied →
 *   one notification to the parent author (self-reply → none; opt-out →
 *   none); comment.moderated → one notification to the comment author
 *   (opt-out → none)
 * - Privacy: response bodies contain no email or credential material
 * - Immediate publish enqueues a novel.chapter_published fan-out job
 *   (the fan-out itself never blocks publish)
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
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import { createNotificationServices } from "./services/notifications.ts";
import type { NotificationFanoutJobData } from "./services/notification-queue.ts";

const TEST_DB = "novelforge_test_notifications";
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
  DATABASE_URL: "postgresql://novelforge_test:novelforge_test@localhost:5432/novelforge_test_notifications",
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

interface FakeNotificationQueue {
  jobs: { name: string; data: NotificationFanoutJobData; opts: { jobId: string } }[];
  add(
    name: string,
    data: NotificationFanoutJobData,
    opts: { jobId: string },
  ): Promise<unknown>;
  close(): Promise<void>;
}

function createFakeNotificationQueue(): FakeNotificationQueue {
  const jobs: FakeNotificationQueue["jobs"] = [];
  return {
    jobs,
    async add(name, data, opts) {
      jobs.push({ name, data, opts });
    },
    async close() {},
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;
let fakeQueue: FakeNotificationQueue;

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
  fakeQueue = createFakeNotificationQueue();
  app = await buildApp(env, { db, notificationQueue: fakeQueue });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  fakeQueue.jobs.length = 0;
  await db.notification.deleteMany();
  await db.notificationPreference.deleteMany();
  await db.auditLog.deleteMany();
  await db.publication.deleteMany();
  await db.finalTextReview.deleteMany();
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

async function seedNovel(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({ actorUserId: ownerId, workspaceId: ws.id, title: `Novel ${slug}`, slug });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function seedNotification(
  userId: string,
  overrides: Partial<{
    type: "NEW_CHAPTER" | "COMMENT_REPLY" | "MODERATION_NOTICE";
    novelId: string | null;
    chapterNumber: number | null;
    actorUserId: string | null;
    readAt: Date | null;
  }> = {},
) {
  return db.notification.create({
    data: {
      userId,
      type: overrides.type ?? "NEW_CHAPTER",
      novelId: overrides.novelId ?? null,
      chapterNumber: overrides.chapterNumber ?? null,
      actorUserId: overrides.actorUserId ?? null,
      readAt: overrides.readAt ?? null,
    },
  });
}

function api(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  cookie?: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: cookie ? { cookie } : {},
    payload,
  });
}

describe("GET /api/reader/notifications (019C inbox)", () => {
  it("401s without a session", async () => {
    const res = await api("GET", "/api/reader/notifications");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("returns an empty inbox with zero unread", async () => {
    const reader = await seedUser("inbox-empty@example.com");
    const res = await api("GET", "/api/reader/notifications", reader.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ notifications: [], unreadCount: 0, page: { nextCursor: null } });
  });

  it("lists only the caller's notifications, newest first, with unreadCount", async () => {
    const alice = await seedUser("inbox-alice@example.com", "Alice");
    const bob = await seedUser("inbox-bob@example.com", "Bob");
    const n1 = await seedNotification(alice.userId);
    const n2 = await seedNotification(alice.userId, { readAt: new Date() });
    await seedNotification(bob.userId);
    // Response bodies carry no email or credential material.
    const res = await api("GET", "/api/reader/notifications", alice.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      notifications: { id: string; actorDisplayName: string | null; readAt: string | null }[];
      unreadCount: number;
    };
    expect(body.notifications.map((n) => n.id)).toEqual([n2.id, n1.id]);
    expect(body.unreadCount).toBe(1);
    expect(JSON.stringify(body)).not.toContain("inbox-alice@example.com");
    expect(JSON.stringify(body)).not.toContain("inbox-bob@example.com");
  });

  it("paginates with a cursor", async () => {
    const reader = await seedUser("inbox-page@example.com");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await seedNotification(reader.userId)).id);
    const first = await api("GET", "/api/reader/notifications?limit=2", reader.cookie);
    const firstBody = first.json() as { notifications: { id: string }[]; page: { nextCursor: string | null } };
    expect(firstBody.notifications).toHaveLength(2);
    expect(firstBody.page.nextCursor).not.toBeNull();
    const second = await api(
      "GET",
      `/api/reader/notifications?limit=2&cursor=${firstBody.page.nextCursor}`,
      reader.cookie,
    );
    const secondBody = second.json() as { notifications: { id: string }[]; page: { nextCursor: string | null } };
    expect(secondBody.notifications).toHaveLength(2);
    const seen = new Set([
      ...firstBody.notifications.map((n) => n.id),
      ...secondBody.notifications.map((n) => n.id),
    ]);
    expect(seen.size).toBe(4);
  });
});

describe("POST /api/reader/notifications/:id/read and /read-all", () => {
  it("marks one notification read and decrements unreadCount", async () => {
    const reader = await seedUser("read-one@example.com");
    const n = await seedNotification(reader.userId);
    const res = await api("POST", `/api/reader/notifications/${n.id}/read`, reader.cookie);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { readAt: string | null }).readAt).not.toBeNull();
    const inbox = await api("GET", "/api/reader/notifications", reader.cookie);
    expect((inbox.json() as { unreadCount: number }).unreadCount).toBe(0);
  });

  it("404s on another user's notification id (no oracle)", async () => {
    const alice = await seedUser("read-alice@example.com");
    const bob = await seedUser("read-bob@example.com");
    const n = await seedNotification(bob.userId);
    const res = await api("POST", `/api/reader/notifications/${n.id}/read`, alice.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("read-all marks everything read", async () => {
    const reader = await seedUser("read-all@example.com");
    await seedNotification(reader.userId);
    await seedNotification(reader.userId);
    const other = await seedUser("read-all-other@example.com");
    await seedNotification(other.userId);
    const res = await api("POST", "/api/reader/notifications/read-all", reader.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ unreadCount: 0 });
    // The other user's inbox is untouched.
    const otherInbox = await api("GET", "/api/reader/notifications", other.cookie);
    expect((otherInbox.json() as { unreadCount: number }).unreadCount).toBe(1);
  });

  it("401s without a session", async () => {
    const res = await api("POST", "/api/reader/notifications/read-all");
    expect(res.statusCode).toBe(401);
  });
});

describe("notification preferences (019C, Q5 decided)", () => {
  it("defaults all three pinned types ON when no rows exist", async () => {
    const reader = await seedUser("prefs-default@example.com");
    const res = await api("GET", "/api/reader/notifications/preferences", reader.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      preferences: [
        { type: "NEW_CHAPTER", enabled: true },
        { type: "COMMENT_REPLY", enabled: true },
        { type: "MODERATION_NOTICE", enabled: true },
      ],
    });
  });

  it("upserts per-type preferences", async () => {
    const reader = await seedUser("prefs-set@example.com");
    const res = await api("PUT", "/api/reader/notifications/preferences", reader.cookie, {
      preferences: [{ type: "NEW_CHAPTER", enabled: false }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      preferences: [
        { type: "NEW_CHAPTER", enabled: false },
        { type: "COMMENT_REPLY", enabled: true },
        { type: "MODERATION_NOTICE", enabled: true },
      ],
    });
  });

  it("rejects unknown types with 400", async () => {
    const reader = await seedUser("prefs-bad@example.com");
    const res = await api("PUT", "/api/reader/notifications/preferences", reader.cookie, {
      preferences: [{ type: "EMAIL_DIGEST", enabled: true }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "INVALID_INPUT" });
  });

  it("master switch semantics: OFF writes all three false, ON writes all three true", async () => {
    const reader = await seedUser("prefs-master@example.com");
    // OFF: the UI-only master switch writes enabled:false for all three.
    const off = await api("PUT", "/api/reader/notifications/preferences", reader.cookie, {
      preferences: [
        { type: "NEW_CHAPTER", enabled: false },
        { type: "COMMENT_REPLY", enabled: false },
        { type: "MODERATION_NOTICE", enabled: false },
      ],
    });
    expect(off.statusCode).toBe(200);
    expect(
      (off.json() as { preferences: { enabled: boolean }[] }).preferences.every((p) => !p.enabled),
    ).toBe(true);
    // ON: writes enabled:true for all three.
    const on = await api("PUT", "/api/reader/notifications/preferences", reader.cookie, {
      preferences: [
        { type: "NEW_CHAPTER", enabled: true },
        { type: "COMMENT_REPLY", enabled: true },
        { type: "MODERATION_NOTICE", enabled: true },
      ],
    });
    expect(
      (on.json() as { preferences: { enabled: boolean }[] }).preferences.every((p) => p.enabled),
    ).toBe(true);
  });

  it("401s without a session", async () => {
    const res = await api("GET", "/api/reader/notifications/preferences");
    expect(res.statusCode).toBe(401);
  });
});

describe("pinned event emission API (the 019B call sites)", () => {
  it("comment.replied notifies the parent author; self-reply and opt-out do not", async () => {
    const services = createNotificationServices({ db });
    const parent = await seedUser("ev-parent@example.com", "Parent");
    const replier = await seedUser("ev-replier@example.com", "Replier");
    const { novelId } = await seedNovel(parent.userId, "ev-novel");

    const ok = await services.emitCommentReplied({
      commentId: "c-reply",
      parentCommentId: "c-parent",
      parentAuthorUserId: parent.userId,
      novelId,
      chapterNumber: 1,
      replierUserId: replier.userId,
    });
    expect(ok).toEqual({ notified: true });
    const rows = await db.notification.findMany({ where: { userId: parent.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("COMMENT_REPLY");
    expect(rows[0]!.actorUserId).toBe(replier.userId);

    // Self-reply → no notification.
    const self = await services.emitCommentReplied({
      commentId: "c-self",
      parentCommentId: "c-parent",
      parentAuthorUserId: parent.userId,
      novelId,
      chapterNumber: 1,
      replierUserId: parent.userId,
    });
    expect(self).toEqual({ notified: false });

    // Opt-out → no notification.
    await db.notificationPreference.create({
      data: { userId: parent.userId, type: "COMMENT_REPLY", enabled: false },
    });
    const opted = await services.emitCommentReplied({
      commentId: "c-reply2",
      parentCommentId: "c-parent",
      parentAuthorUserId: parent.userId,
      novelId,
      chapterNumber: 1,
      replierUserId: replier.userId,
    });
    expect(opted).toEqual({ notified: false });
  });

  it("comment.moderated notifies the comment author; opt-out does not", async () => {
    const services = createNotificationServices({ db });
    const author = await seedUser("ev-mod-author@example.com", "Author");
    const moderator = await seedUser("ev-mod-staff@example.com", "Staff");
    const { novelId } = await seedNovel(moderator.userId, "ev-mod-novel");

    const ok = await services.emitCommentModerated({
      commentId: "c-1",
      commentAuthorUserId: author.userId,
      novelId,
      action: "HIDDEN",
      moderatorUserId: moderator.userId,
    });
    expect(ok).toEqual({ notified: true });
    const rows = await db.notification.findMany({ where: { userId: author.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("MODERATION_NOTICE");

    await db.notificationPreference.create({
      data: { userId: author.userId, type: "MODERATION_NOTICE", enabled: false },
    });
    const opted = await services.emitCommentModerated({
      commentId: "c-2",
      commentAuthorUserId: author.userId,
      novelId,
      action: "DELETED",
      moderatorUserId: moderator.userId,
    });
    expect(opted).toEqual({ notified: false });
  });
});

describe("novel.chapter_published emission on immediate publish", () => {
  it("enqueues a fan-out job after the PUBLISHED commit", async () => {
    const owner = await seedUser("pub-owner@example.com", "Owner");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "pub-novel");
    // Chapter + version through the API (the 012 write path).
    const ch = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters`,
      headers: { cookie: owner.cookie },
      payload: { title: "Chapter one" },
    });
    expect(ch.statusCode).toBe(201);
    const chapterId = (ch.json() as { id: string }).id;
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: chapterId } });
    const put = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}`,
      headers: { cookie: owner.cookie },
      payload: { content: "<p>Hello world, this is chapter one.</p>", expectedVersion: null },
    });
    expect(put.statusCode).toBe(200);
    const version = await db.chapterVersion.findFirstOrThrow({
      where: { chapterId },
      orderBy: { number: "desc" },
    });
    const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId, name: "main" } });
    await db.finalTextReview.create({
      data: {
        workspaceId,
        novelId,
        chapterVersionId: version.id,
        revisionId: branch.headRevisionId!,
        verdict: "PASS",
        hardViolations: [],
        advisory: [],
        evaluatedPolicies: {},
      },
    });
    const pub = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapterId}/publication/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(pub.statusCode).toBe(200);
    // One fan-out job enqueued; the publish path did not await fan-out.
    expect(fakeQueue.jobs).toHaveLength(1);
    const job = fakeQueue.jobs[0]!;
    expect(job.name).toBe("fanout");
    const data = job.data;
    expect(data.eventName).toBe("novel.chapter_published");
    expect(data.novelId).toBe(novelId);
    expect(data.chapterId).toBe(chapterId);
    expect(typeof data.publicationId).toBe("string");
    expect(chapter.number).toBe(1);
  });
});
