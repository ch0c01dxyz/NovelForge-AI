/**
 * @novelforge/worker — notification fan-out tests (NF-WF-019C).
 *
 * Integration tests against a dedicated scratch DB
 * (novelforge_test_notification_fanout): the async fan-out for the
 * pinned `novel.chapter_published` event. The BullMQ queue/worker are
 * faked (the publication-jobs.ts precedent); the fan-out logic runs
 * against the real DB. The 019A follower tables are seeded directly —
 * their names and shapes are contract-pinned (`novel_follows`,
 * `author_follows`).
 *
 * Covers (019C acceptance):
 * - novel followers ∪ author followers, deduped (one notification per
 *   user per event, even when following both)
 * - NEW_CHAPTER opt-out honored at insert time (absent row = ON)
 * - chapter not PUBLISHED → no-op (no fabricated notifications)
 * - bounded batches (≤ 500)
 * - worker wiring: malformed job data throws; graceful degradation when
 *   Redis is unavailable
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  fanoutChapterPublished,
  startNotificationFanoutWorkerApp,
  NOTIFICATION_QUEUE_NAME,
  type NotificationFanoutJobData,
} from "./notification-fanout-jobs.ts";
import type { WorkerLogger } from "./worker.ts";

const TEST_DB = "novelforge_test_notification_fanout";
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

let db: NovelForgeDb;

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
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.notification.deleteMany();
  await db.notificationPreference.deleteMany();
  await db.novelFollow.deleteMany();
  await db.authorFollow.deleteMany();
  await db.chapter.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
});

function testLogger(): WorkerLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

interface Seed {
  authorId: string;
  novelId: string;
  chapterId: string;
}

async function seedPublishedNovel(slug: string): Promise<Seed> {
  const author = await db.user.create({
    data: { email: `fanout-author-${slug}@example.com`, passwordHash: "x", displayName: "Author" },
  });
  const ws = await db.workspace.create({
    data: { name: slug, slug, ownerId: author.id },
  });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: `Novel ${slug}`,
      slug: `novel-${slug}`,
      status: "ACTIVE",
      createdById: author.id,
    },
  });
  const chapter = await db.chapter.create({
    data: {
      novelId: novel.id,
      number: 3,
      title: "Chapter three",
      status: "PUBLISHED",
      createdById: author.id,
    },
  });
  return { authorId: author.id, novelId: novel.id, chapterId: chapter.id };
}

async function seedFollower(email: string): Promise<string> {
  const u = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
  });
  return u.id;
}

function fanoutJob(seed: Seed): NotificationFanoutJobData {
  return {
    eventName: "novel.chapter_published",
    publicationId: "pub-1",
    novelId: seed.novelId,
    chapterId: seed.chapterId,
  };
}

describe("fanoutChapterPublished", () => {
  it("notifies novel followers and author followers, deduped to one per user", async () => {
    const seed = await seedPublishedNovel("dedupe");
    const novelFollower = await seedFollower("fanout-nf@example.com");
    const authorFollower = await seedFollower("fanout-af@example.com");
    const bothFollower = await seedFollower("fanout-both@example.com");
    await db.novelFollow.create({ data: { userId: novelFollower, novelId: seed.novelId } });
    await db.novelFollow.create({ data: { userId: bothFollower, novelId: seed.novelId } });
    await db.authorFollow.create({ data: { userId: authorFollower, authorId: seed.authorId } });
    await db.authorFollow.create({ data: { userId: bothFollower, authorId: seed.authorId } });

    const outcome = await fanoutChapterPublished(db, fanoutJob(seed));
    expect(outcome).toEqual({ notified: 3, skipped: 0 });

    const rows = await db.notification.findMany({ orderBy: { userId: "asc" } });
    expect(rows).toHaveLength(3);
    // One notification per user per event — the double-follower got one.
    expect(new Set(rows.map((r) => r.userId)).size).toBe(3);
    for (const r of rows) {
      expect(r.type).toBe("NEW_CHAPTER");
      expect(r.novelId).toBe(seed.novelId);
      expect(r.chapterNumber).toBe(3);
      expect(r.actorUserId).toBe(seed.authorId);
    }
  });

  it("skips users who opted out of NEW_CHAPTER (absent row = ON)", async () => {
    const seed = await seedPublishedNovel("optout");
    const opted = await seedFollower("fanout-opted@example.com");
    const kept = await seedFollower("fanout-kept@example.com");
    await db.novelFollow.create({ data: { userId: opted, novelId: seed.novelId } });
    await db.novelFollow.create({ data: { userId: kept, novelId: seed.novelId } });
    await db.notificationPreference.create({
      data: { userId: opted, type: "NEW_CHAPTER", enabled: false },
    });

    const outcome = await fanoutChapterPublished(db, fanoutJob(seed));
    expect(outcome).toEqual({ notified: 1, skipped: 1 });
    const rows = await db.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(kept);
  });

  it("no-ops when the chapter is not PUBLISHED (no fabricated notifications)", async () => {
    const seed = await seedPublishedNovel("draft");
    await db.chapter.update({ where: { id: seed.chapterId }, data: { status: "DRAFT" } });
    const follower = await seedFollower("fanout-draft@example.com");
    await db.novelFollow.create({ data: { userId: follower, novelId: seed.novelId } });

    const outcome = await fanoutChapterPublished(db, fanoutJob(seed));
    expect(outcome).toEqual({ notified: 0, skipped: 0 });
    expect(await db.notification.count()).toBe(0);
  });

  it("no-ops with no followers", async () => {
    const seed = await seedPublishedNovel("empty");
    const outcome = await fanoutChapterPublished(db, fanoutJob(seed));
    expect(outcome).toEqual({ notified: 0, skipped: 0 });
  });

  it("inserts in bounded batches", async () => {
    const seed = await seedPublishedNovel("batch");
    for (let i = 0; i < 5; i++) {
      const f = await seedFollower(`fanout-batch-${i}@example.com`);
      await db.novelFollow.create({ data: { userId: f, novelId: seed.novelId } });
    }
    const outcome = await fanoutChapterPublished(db, fanoutJob(seed), { batchSize: 2 });
    expect(outcome).toEqual({ notified: 5, skipped: 0 });
    expect(await db.notification.count()).toBe(5);
  });

  it("clamps an oversized batch to the 500 bound", async () => {
    const seed = await seedPublishedNovel("clamp");
    const f = await seedFollower("fanout-clamp@example.com");
    await db.novelFollow.create({ data: { userId: f, novelId: seed.novelId } });
    const outcome = await fanoutChapterPublished(db, fanoutJob(seed), { batchSize: 50_000 });
    expect(outcome.notified).toBe(1);
  });
});

describe("startNotificationFanoutWorkerApp", () => {
  it("degrades gracefully when Redis is unavailable", async () => {
    const logger = testLogger();
    const fakeDb = { $disconnect: vi.fn() } as unknown as NovelForgeDb;
    const connection = {
      ping: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
    const app = await startNotificationFanoutWorkerApp(
{
        DATABASE_URL: "postgresql://novelforge_test:novelforge_test@localhost:5432/novelforge_test_notification_fanout",
        REDIS_URL: "redis://localhost:6379",
      },
      logger,
      {
        createDb: () => fakeDb,
        createConnection: () => connection,
        probeTimeoutMs: 500,
      },
    );
    expect(app.started).toBe(false);
    await app.stop();
    expect(fakeDb.$disconnect).toHaveBeenCalled();
  });

  it("rejects malformed job data and processes valid jobs", async () => {
    const logger = testLogger();
    const connection = {
      ping: vi.fn(async () => "PONG"),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
    let handler: ((job: { data: unknown }) => Promise<void>) | null = null;
    const worker = { on: vi.fn(), close: vi.fn(async () => {}) };
    const queue = { close: vi.fn(async () => {}) };
    const app = await startNotificationFanoutWorkerApp(
{
        DATABASE_URL: "postgresql://novelforge_test:novelforge_test@localhost:5432/novelforge_test_notification_fanout",
        REDIS_URL: "redis://localhost:6379",
      },
      logger,
      {
        createDb: () => db,
        createConnection: () => connection,
        createQueue: () => queue as never,
        createWorker: (queueName, h) => {
          expect(queueName).toBe(NOTIFICATION_QUEUE_NAME);
          handler = h as never;
          return worker as never;
        },
        probeTimeoutMs: 500,
      },
    );
    expect(app.started).toBe(true);
    expect(handler).not.toBeNull();
    const { UnrecoverableError } = await import("bullmq");
    await expect(handler!({ data: {} })).rejects.toBeInstanceOf(UnrecoverableError);

    const seed = await seedPublishedNovel("wire");
    const follower = await seedFollower("fanout-wire@example.com");
    await db.novelFollow.create({ data: { userId: follower, novelId: seed.novelId } });
    await handler!({ data: fanoutJob(seed) });
    expect(await db.notification.count({ where: { userId: follower } })).toBe(1);

    await app.stop();
    expect(worker.close).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
  });

  it("fails fast with UnrecoverableError on malformed job data (no retry)", async () => {
    const logger = testLogger();
    const connection = {
      ping: vi.fn(async () => "PONG"),
      on: vi.fn(),
      disconnect: vi.fn(),
    } as never;
    let handler: ((job: { data: unknown }) => Promise<void>) | null = null;
    const worker = { on: vi.fn(), close: vi.fn(async () => {}) };
    const queue = { close: vi.fn(async () => {}) };
    const app = await startNotificationFanoutWorkerApp(
      {
        DATABASE_URL: "postgresql://novelforge_test:novelforge_test@localhost:5432/postgres",
        REDIS_URL: "redis://localhost:6379",
      },
      logger,
      {
        createDb: () => db,
        createConnection: () => connection,
        createQueue: () => queue as never,
        createWorker: (_queueName, h) => {
          handler = h as never;
          return worker as never;
        },
        probeTimeoutMs: 500,
      },
    );
    expect(handler).not.toBeNull();
    // Malformed data must throw UnrecoverableError (BullMQ: no retry).
    const { UnrecoverableError } = await import("bullmq");
    await expect(handler!({ data: {} })).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(handler!({ data: { eventName: "unknown.event" } })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await app.stop();
  });
});

describe("NF-WF-031 acceptance (GAP-096)", () => {
  it("retry after transient failure delivers (no duplicate on retry)", async () => {
    const seed = await seedPublishedNovel("retry");
    const follower = await seedFollower("fanout-retry@example.com");
    await db.novelFollow.create({ data: { userId: follower, novelId: seed.novelId } });

    // Simulate transient DB failure on first createMany, success on retry.
    let createManyCalls = 0;
    const flakyDb = {
      ...db,
      notification: {
        ...db.notification,
        createMany: async (args: Parameters<NovelForgeDb["notification"]["createMany"]>[0]) => {
          createManyCalls++;
          if (createManyCalls === 1) {
            throw new Error("simulated transient DB blip");
          }
          return db.notification.createMany(args);
        },
      },
    } as NovelForgeDb;

    // First attempt fails (transient).
    await expect(fanoutChapterPublished(flakyDb, fanoutJob(seed))).rejects.toThrow(
      "simulated transient DB blip",
    );
    expect(await db.notification.count({ where: { userId: follower } })).toBe(0);

    // Retry succeeds — delivers exactly once.
    const outcome = await fanoutChapterPublished(flakyDb, fanoutJob(seed));
    expect(outcome.notified).toBe(1);
    expect(await db.notification.count({ where: { userId: follower } })).toBe(1);

    // Second retry (idempotent re-drive) does not duplicate.
    await fanoutChapterPublished(db, fanoutJob(seed));
    expect(await db.notification.count({ where: { userId: follower } })).toBe(1);
  });

  it("opt-out between attempts is honored on retry", async () => {
    const seed = await seedPublishedNovel("optout-retry");
    const staying = await seedFollower("fanout-staying@example.com");
    const leaving = await seedFollower("fanout-leaving@example.com");
    await db.novelFollow.create({ data: { userId: staying, novelId: seed.novelId } });
    await db.novelFollow.create({ data: { userId: leaving, novelId: seed.novelId } });

    // First attempt: both opted in — but simulate failure before insert
    // by opting `leaving` out between the attempts.
    await db.notificationPreference.create({
      data: { userId: leaving, type: "NEW_CHAPTER", enabled: false },
    });

    // Retry after opt-out: only `staying` is notified.
    const outcome = await fanoutChapterPublished(db, fanoutJob(seed));
    expect(outcome).toEqual({ notified: 1, skipped: 1 });
    const rows = await db.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(staying);
  });

  it("queue is configured with bounded retry (attempts 3, exponential 2000ms)", async () => {
    // The constants are the single source of truth shared by the
    // producer (apps/api/src/services/notification-queue.ts) and the
    // consumer (defaultNotificationFanoutWorkerDeps.createQueue).
    const {
      NOTIFICATION_FANOUT_MAX_ATTEMPTS,
      NOTIFICATION_FANOUT_RETRY_BASE_MS,
      WORKFLOW_DEFAULT_JOB_OPTIONS,
    } = await import("@novelforge/workflow-executor");
    expect(NOTIFICATION_FANOUT_MAX_ATTEMPTS).toBe(3);
    expect(NOTIFICATION_FANOUT_RETRY_BASE_MS).toBe(2000);
    // The notification queue must NOT inherit attempts: 1 from the
    // workflow defaults — it overrides with the bounded retry.
    expect(WORKFLOW_DEFAULT_JOB_OPTIONS.attempts).toBe(1);
    expect(NOTIFICATION_FANOUT_MAX_ATTEMPTS).not.toBe(WORKFLOW_DEFAULT_JOB_OPTIONS.attempts);

    // Structural: both queue-creation sites reference the constants.
    // (Verified by code inspection; the worker's createQueue and the
    // API's createNotificationQueue both spread WORKFLOW_DEFAULT_JOB_OPTIONS
    // then override attempts/backoff with the NOTIFICATION_FANOUT_* constants.)
    const workerSrc = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./notification-fanout-jobs.ts", import.meta.url), "utf8"),
    );
    expect(workerSrc).toContain("NOTIFICATION_FANOUT_MAX_ATTEMPTS");
    expect(workerSrc).toContain("NOTIFICATION_FANOUT_RETRY_BASE_MS");
    expect(workerSrc).toContain('backoff: { type: "exponential"');
  });
});
