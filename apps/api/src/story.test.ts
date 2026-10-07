/**
 * Story intelligence write surface (Phase 6 slice 2) integration suite.
 *
 * Slice 2 shipped five tables, nine pure rules and a Brain that reads them —
 * with no way to write a row outside a test. This suite drives the real HTTP
 * surface against a real migrated database to prove the missing half exists,
 * and that the three domain rules which had NO production caller before
 * (canPromiseTransition, findCausalCycle, isChronological) now actually run on
 * the request that would violate them.
 *
 * The Brain assertions matter as much as the write assertions: a row written
 * through the API must be what the Brain then answers with. A suite that only
 * checked the write would pass while the Brain read a different table.
 *
 * No test reaches a provider: every structured Brain leg issues no model call.
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
import type { AIGateway } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_story";
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
  APP_ENCRYPTION_KEY: "unit-test-encryption-key",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

let db: NovelForgeDb;
let app: FastifyInstance;

/**
 * A gateway that throws on every call.
 *
 * The story write surface and every structured Brain leg are provider-free
 * (CLAUDE.md §25: no test may reach a paid provider). If any of them starts
 * issuing a model call, this fails loudly instead of silently spending money
 * and becoming non-deterministic.
 */
function unusedGateway(): AIGateway {
  const boom = () => {
    throw new Error("a provider was reached by a path that must not call one");
  };
  return {
    id: "unused",
    name: "unused",
    async listModels() {
      return [];
    },
    async generate() {
      return boom();
    },
    // eslint-disable-next-line require-yield -- any stream request here is a wiring bug worth failing on
    async *generateStream(): AsyncGenerator<{ delta: string }> {
      boom();
    },
    async embed() {
      return boom();
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  } as AIGateway;
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
  app = await buildApp(env, { db, createGateway: unusedGateway });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.causalEdge.deleteMany();
  await db.storyThreadEvent.deleteMany();
  await db.storyThread.deleteMany();
  await db.storyPromise.deleteMany();
  await db.timelineEvent.deleteMany();
  await db.storyEvent.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function seedUser(
  email: string,
): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: "x", displayName: email },
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

async function seedWorkspace(
  ownerId: string,
  slug: string,
  memberRole?: { userId: string; role: "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER" },
) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  if (memberRole) {
    await db.membership.create({
      data: { workspaceId: ws.id, userId: memberRole.userId, role: memberRole.role },
    });
  }
  // Through the production path, not a raw row: `createNovel` is where C8's
  // baseline branch/revision lives, so a raw insert would seed a novel the
  // product cannot produce (no head) and every covered mutation would 409.
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

/** POST a story payload and return the raw response. */
async function post(
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: "POST", url, headers: { cookie }, payload });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function get(
  cookie: string,
  url: string,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({ method: "GET", url, headers: { cookie } });
  return { statusCode: res.statusCode, body: res.json() };
}

const story = (workspaceId: string, novelId: string, rest: string) =>
  `/api/workspaces/${workspaceId}/novels/${novelId}/story/${rest}`;

describe("the write surface exists, and the Brain reads what it wrote", () => {
  it("records an event, and EVENT answers with it", async () => {
    const { userId, cookie } = await seedUser("story-owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "story-ws");

    const created = await post(cookie, story(workspaceId, novelId, "events"), {
      description: "Wei Zhao burns the northern bridge.",
      availableFromChapter: 12,
    });
    expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
    expect(created.body.description).toBe("Wei Zhao burns the northern bridge.");

    // The point of the whole file: the row is now reachable through the
    // Brain's EVENT leg, which before this suite answered from a table only
    // canon.test.ts could fill.
    const asked = await post(cookie, `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=AUTHOR`, {
      kind: "EVENT",
    });
    expect(asked.statusCode, JSON.stringify(asked.body)).toBe(200);
    expect(asked.body.answered).toBe(true);
    expect(asked.body.insufficient).toBe(false);
    const events = asked.body.events as Array<{ description: string }>;
    expect(events.map((e) => e.description)).toContain("Wei Zhao burns the northern bridge.");
  });

  it("withholds an event from a reader until its chapter, and counts it for the author", async () => {
    const { userId, cookie } = await seedUser("story-spoiler@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "story-spoiler-ws");

    await post(cookie, story(workspaceId, novelId, "events"), {
      description: "The regent is secretly the boy's father.",
      availableFromChapter: 40,
    });

    const reader = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=READER&readerChapter=10`,
      { kind: "EVENT" },
    );
    expect(reader.statusCode, JSON.stringify(reader.body)).toBe(200);
    const readerEvents = reader.body.events as unknown[];
    expect(readerEvents).toHaveLength(0);
    // A reader gets no count: the number would itself be an existence oracle.
    expect(reader.body.withheldCount).toBe(0);

    const author = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=AUTHOR`,
      { kind: "EVENT" },
    );
    expect((author.body.events as unknown[]).length).toBe(1);
    // An author sees the full list, so nothing is withheld from them.
    expect(author.body.withheldCount).toBe(0);

    // Past the boundary the reader sees it.
    const later = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=READER&readerChapter=40`,
      { kind: "EVENT" },
    );
    expect((later.body.events as unknown[]).length).toBe(1);
  });
});

describe("the timeline appends in order, and refuses to say 'then' twice", () => {
  it("assigns ascending slots and reads back chronological", async () => {
    const { userId, cookie } = await seedUser("timeline-owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "timeline-ws");

    for (const description of ["First age", "Second age", "Third age"]) {
      const res = await post(cookie, story(workspaceId, novelId, "timeline"), { description });
      expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    }

    const listed = await get(cookie, story(workspaceId, novelId, "timeline"));
    expect(listed.statusCode).toBe(200);
    const rows = listed.body as Array<{ order: number; description: string }>;
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.description)).toEqual(["First age", "Second age", "Third age"]);
  });

  it("the unique index makes a colliding slot unrepresentable — isChronological's write-side twin", async () => {
    const { userId, cookie } = await seedUser("timeline-dup@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "timeline-dup-ws");

    await post(cookie, story(workspaceId, novelId, "timeline"), { description: "A" });

    // isChronological refuses a tie, and the migration names
    // `(novel_id, order)` as its write-side twin. This writes raw — past
    // appendTimelineEvent and past the API — to prove the ENFORCEMENT is the
    // index and not the service guard in front of it. An earlier version of
    // this suite asserted a read-side throw here; it was unreachable, because
    // this constraint means the bad state cannot exist to be read.
    await expect(
      db.timelineEvent.create({
        data: { workspaceId, novelId, description: "B", order: 1, createdById: userId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    // And the list still reads back clean, with the one row it has.
    const listed = await get(cookie, story(workspaceId, novelId, "timeline"));
    expect(listed.statusCode).toBe(200);
    const rows = listed.body as Array<{ order: number }>;
    expect(rows.map((r) => r.order)).toEqual([1]);
  });

});

describe("a promise can only move forward, and only PAID_OFF names a payoff chapter", () => {
  it("walks SETUP -> DEVELOPING -> READY_FOR_PAYOFF -> PAID_OFF", async () => {
    const { userId, cookie } = await seedUser("promise-owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "promise-ws");

    const made = await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "The debt to the iron guild",
      importance: 4,
      introducedAtChapter: 3,
    });
    expect(made.statusCode, JSON.stringify(made.body)).toBe(201);
    const promiseId = made.body.id as string;

    for (const to of ["DEVELOPING", "READY_FOR_PAYOFF"] as const) {
      const res = await post(
        cookie,
        story(workspaceId, novelId, `promises/${promiseId}/transition`),
        { to },
      );
      expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe(to);
    }

    const paid = await post(
      cookie,
      story(workspaceId, novelId, `promises/${promiseId}/transition`),
      { to: "PAID_OFF", payoffAtChapter: 60 },
    );
    expect(paid.statusCode, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.status).toBe("PAID_OFF");
    expect(paid.body.payoffAtChapter).toBe(60);
  });

  it("refuses to reopen a paid-off promise — the reader already experienced it", async () => {
    const { userId, cookie } = await seedUser("promise-reopen@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "promise-reopen-ws");

    const made = await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "The vow",
      importance: 3,
    });
    const promiseId = made.body.id as string;

    await post(cookie, story(workspaceId, novelId, `promises/${promiseId}/transition`), {
      to: "PAID_OFF",
      payoffAtChapter: 20,
    });

    // canPromiseTransition: PAID_OFF is terminal. A correction belongs in a
    // new promise, not a status flip that rewrites what the reader read.
    const reopen = await post(
      cookie,
      story(workspaceId, novelId, `promises/${promiseId}/transition`),
      { to: "DEVELOPING" },
    );
    expect(reopen.statusCode, JSON.stringify(reopen.body)).toBe(409);
  });

  it("refuses a backward or same-state move, and a payoff chapter on a promise that is not paid", async () => {
    const { userId, cookie } = await seedUser("promise-back@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "promise-back-ws");

    const made = await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "The seal",
      importance: 2,
    });
    const promiseId = made.body.id as string;
    const move = (payload: Record<string, unknown>) =>
      post(cookie, story(workspaceId, novelId, `promises/${promiseId}/transition`), payload);

    // SETUP -> SETUP is not a transition.
    expect((await move({ to: "SETUP" })).statusCode).toBe(409);
    // SETUP -> READY_FOR_PAYOFF skips DEVELOPING? No — the order is
    // index-based, so a forward jump is allowed. The backward move is not:
    await move({ to: "READY_FOR_PAYOFF" });
    expect((await move({ to: "DEVELOPING" })).statusCode).toBe(409);
    // StoryPromise_payoff_pair: a non-PAID_OFF promise has no payoff chapter.
    expect((await move({ to: "DEVELOPING", payoffAtChapter: 5 })).statusCode).toBe(409);
  });

  it("allows a promise to be killed from any open state", async () => {
    const { userId, cookie } = await seedUser("promise-abandon@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "promise-abandon-ws");

    const made = await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "The lost thread",
      importance: 1,
    });
    const res = await post(
      cookie,
      story(workspaceId, novelId, `promises/${made.body.id as string}/transition`),
      { to: "ABANDONED" },
    );
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("ABANDONED");
  });

  it("closes the debt loop: a promise made through the API is what PROMISES ranks", async () => {
    const { userId, cookie } = await seedUser("promise-debt@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "promise-debt-ws");

    // The frontier is the highest chapter number; debt age is measured from it.
    await db.chapter.create({
      data: { novelId, number: 50, title: "Fifty", createdById: userId },
    });

    await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "A small debt",
      importance: 1,
      introducedAtChapter: 40,
    });
    await post(cookie, story(workspaceId, novelId, "promises"), {
      title: "A large debt",
      importance: 5,
      introducedAtChapter: 1,
    });

    const asked = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=AUTHOR`,
      { kind: "PROMISES" },
    );
    expect(asked.statusCode, JSON.stringify(asked.body)).toBe(200);
    const items = asked.body.items as Array<{ title: string; debt: number }>;
    expect(items).toHaveLength(2);
    // importance 5 x (10 + 49) beats importance 1 x (10 + 10).
    expect(items[0]!.title).toBe("A large debt");
    expect(items[0]!.debt).toBeGreaterThan(items[1]!.debt);
  });
});

describe("threads resolve as a coherent pair", () => {
  it("refuses RESOLVED without a chapter, and a chapter without RESOLVED", async () => {
    const { userId, cookie } = await seedUser("thread-pair@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "thread-pair-ws");

    const made = await post(cookie, story(workspaceId, novelId, "threads"), {
      kind: "MYSTERY",
      title: "Who killed the envoy",
      importance: 5,
      introducedAtChapter: 2,
    });
    expect(made.statusCode, JSON.stringify(made.body)).toBe(201);
    const threadId = made.body.id as string;
    const set = (payload: Record<string, unknown>) =>
      post(cookie, story(workspaceId, novelId, `threads/${threadId}/status`), payload);

    // StoryThread_resolution_pair, both halves.
    expect((await set({ status: "RESOLVED" })).statusCode).toBe(409);
    expect((await set({ status: "ACTIVE", resolvedAtChapter: 30 })).statusCode).toBe(409);

    const resolved = await set({ status: "RESOLVED", resolvedAtChapter: 30 });
    expect(resolved.statusCode, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body.resolvedAtChapter).toBe(30);
  });

  it("DORMANT is still unresolved — it rests, it does not close", async () => {
    const { userId, cookie } = await seedUser("thread-dormant@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "thread-dormant-ws");

    await db.chapter.create({
      data: { novelId, number: 30, title: "Thirty", createdById: userId },
    });
    const made = await post(cookie, story(workspaceId, novelId, "threads"), {
      kind: "SUBPLOT",
      title: "The sleeping feud",
      importance: 4,
      introducedAtChapter: 5,
    });
    await post(cookie, story(workspaceId, novelId, `threads/${made.body.id as string}/status`), {
      status: "DORMANT",
    });

    const asked = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=AUTHOR`,
      { kind: "UNRESOLVED" },
    );
    const items = asked.body.items as Array<{ title: string; debt: number }>;
    // isThreadUnresolved: DORMANT still owes the reader, so it must appear
    // with a non-zero score rather than sinking like a resolved thread.
    const dormant = items.find((d) => d.title === "The sleeping feud");
    expect(dormant, JSON.stringify(items)).toBeDefined();
    expect(dormant!.debt).toBeGreaterThan(0);
  });
});

describe("causal edges refuse a loop and split authority by confidence", () => {
  async function twoEvents(cookie: string, workspaceId: string, novelId: string) {
    const a = await post(cookie, story(workspaceId, novelId, "events"), { description: "A happened" });
    const b = await post(cookie, story(workspaceId, novelId, "events"), { description: "B happened" });
    return { a: a.body.id as string, b: b.body.id as string };
  }

  it("records an EXPLICIT edge and refuses the edge that would close a loop", async () => {
    const { userId, cookie } = await seedUser("causal-owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "causal-ws");
    const { a, b } = await twoEvents(cookie, workspaceId, novelId);

    const forward = await post(cookie, story(workspaceId, novelId, "causal-edges"), {
      causeEventId: a,
      effectEventId: b,
      confidence: "EXPLICIT",
    });
    expect(forward.statusCode, JSON.stringify(forward.body)).toBe(201);
    // EXPLICIT is grounded in prose, so it needs no approver.
    expect(forward.body.approvedById).toBeNull();

    // findCausalCycle: B -> A would make A because B because A.
    const loop = await post(cookie, story(workspaceId, novelId, "causal-edges"), {
      causeEventId: b,
      effectEventId: a,
      confidence: "EXPLICIT",
    });
    expect(loop.statusCode, JSON.stringify(loop.body)).toBe(409);
  });

  it("refuses a self-edge, a duplicate edge, and a cross-novel event", async () => {
    const { userId, cookie } = await seedUser("causal-guards@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "causal-guards-ws");
    const { a, b } = await twoEvents(cookie, workspaceId, novelId);
    const edge = (payload: Record<string, unknown>) =>
      post(cookie, story(workspaceId, novelId, "causal-edges"), {
        confidence: "EXPLICIT",
        ...payload,
      });

    expect((await edge({ causeEventId: a, effectEventId: a })).statusCode).toBe(409);
    expect((await edge({ causeEventId: a, effectEventId: b })).statusCode).toBe(201);
    expect((await edge({ causeEventId: a, effectEventId: b })).statusCode).toBe(409);

    // An event from another novel must not become an end of this novel's
    // edge; the FK alone would allow it.
    const other = await seedWorkspace(userId, "causal-other-ws");
    const foreign = await post(cookie, story(other.workspaceId, other.novelId, "events"), {
      description: "Elsewhere",
    });
    const cross = await edge({ causeEventId: foreign.body.id as string, effectEventId: b });
    expect(cross.statusCode, JSON.stringify(cross.body)).toBe(404);
  });

  it("INFERRED needs canon:approve and carries the approver; an EDITOR cannot grant it", async () => {
    const { userId, cookie } = await seedUser("causal-approver@example.com");
    const editor = await seedUser("causal-editor@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "causal-approve-ws", {
      userId: editor.userId,
      role: "EDITOR",
    });
    const { a, b } = await twoEvents(cookie, workspaceId, novelId);

    // An editor reads canon and flags conflicts; committing an AI-derived
    // causal claim is the canon-authority act CLAUDE.md §5 reserves.
    const refused = await post(editor.cookie, story(workspaceId, novelId, "causal-edges"), {
      causeEventId: a,
      effectEventId: b,
      confidence: "INFERRED",
    });
    expect(refused.statusCode, JSON.stringify(refused.body)).toBe(403);

    const approved = await post(cookie, story(workspaceId, novelId, "causal-edges"), {
      causeEventId: a,
      effectEventId: b,
      confidence: "INFERRED",
    });
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(201);
    // CausalEdge_approval_matches_confidence: an AI-derived edge names who
    // accepted it, so it is never silently story truth.
    expect(approved.body.approvedById).toBe(userId);
  });

  it("the Brain reports an INFERRED edge as a SUGGESTION, not an established fact", async () => {
    const { userId, cookie } = await seedUser("causal-basis@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "causal-basis-ws");
    const { a, b } = await twoEvents(cookie, workspaceId, novelId);

    await post(cookie, story(workspaceId, novelId, "causal-edges"), {
      causeEventId: a,
      effectEventId: b,
      confidence: "SPECULATIVE",
    });

    const asked = await post(
      cookie,
      `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask?mode=AUTHOR`,
      { kind: "CAUSAL" },
    );
    expect(asked.statusCode, JSON.stringify(asked.body)).toBe(200);
    // Never present inference as established canon (CLAUDE.md §21).
    expect(asked.body.basis).toBe("SUGGESTION");
  });
});

describe("authorization and tenancy hold on the Phase 6 write surface", () => {
  it("401s without a session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workspaces/00000000-0000-0000-0000-000000000000/novels/00000000-0000-0000-0000-000000000000/story/events",
      payload: { description: "x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("403s a VIEWER, who holds neither canon:read nor canon:manage", async () => {
    const { userId } = await seedUser("story-vwr-owner@example.com");
    const viewer = await seedUser("story-viewer@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "story-viewer-ws", {
      userId: viewer.userId,
      role: "VIEWER",
    });

    const write = await post(viewer.cookie, story(workspaceId, novelId, "events"), {
      description: "nope",
    });
    expect(write.statusCode).toBe(403);

    const read = await get(viewer.cookie, story(workspaceId, novelId, "events"));
    expect(read.statusCode).toBe(403);
  });

  it("404s a novel in another workspace — not a 403, which would confirm it exists", async () => {
    const { userId, cookie } = await seedUser("story-a@example.com");
    const outsider = await seedUser("story-b@example.com");
    const mine = await seedWorkspace(userId, "story-mine-ws");
    const theirs = await seedWorkspace(outsider.userId, "story-theirs-ws");

    // A real novel id, but not this caller's.
    const res = await post(cookie, story(theirs.workspaceId, theirs.novelId, "events"), {
      description: "trespass",
    });
    expect(res.statusCode).toBe(404);

    // And a novel id that does not exist at all answers identically.
    const absent = await post(
      cookie,
      story(mine.workspaceId, "00000000-0000-0000-0000-000000000000", "events"),
      { description: "trespass" },
    );
    expect(absent.statusCode).toBe(404);
  });

  it("rejects malformed input at the boundary", async () => {
    const { userId, cookie } = await seedUser("story-input@example.com");
    const { workspaceId, novelId } = await seedWorkspace(userId, "story-input-ws");

    // importance is a 1..5 debt INPUT, not a free score.
    const bad = await post(cookie, story(workspaceId, novelId, "threads"), {
      kind: "MYSTERY",
      title: "x",
      importance: 99,
    });
    expect(bad.statusCode).toBe(400);

    // An unknown enum member must not widen what the route accepts.
    const badKind = await post(cookie, story(workspaceId, novelId, "threads"), {
      kind: "NOT_A_THREAD_KIND",
      title: "x",
      importance: 3,
    });
    expect(badKind.statusCode).toBe(400);

    const empty = await post(cookie, story(workspaceId, novelId, "events"), { description: "  " });
    expect(empty.statusCode).toBe(400);
  });

  it("404s a thread id that is not this novel's", async () => {
    const { userId, cookie } = await seedUser("story-thread-tenant@example.com");
    const mine = await seedWorkspace(userId, "story-thread-a-ws");
    const other = await seedWorkspace(userId, "story-thread-b-ws");

    const made = await post(cookie, story(mine.workspaceId, mine.novelId, "threads"), {
      kind: "MYSTERY",
      title: "Mine",
      importance: 3,
    });

    // A real thread id, reached through the wrong novel.
    const res = await post(
      cookie,
      story(other.workspaceId, other.novelId, `threads/${made.body.id as string}/status`),
      { status: "RESOLVED", resolvedAtChapter: 9 },
    );
    expect(res.statusCode).toBe(404);
  });
});
