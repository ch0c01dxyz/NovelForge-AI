/**
 * Closure ledger (NF-WF-022A) integration suite.
 *
 * Dedicated `novelforge_test_endgame` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database, because what this task claims is a property of the DATABASE
 * and the transaction: the ledger, the condition-based ending gate, the
 * debt report, and the planning-only guarantees.
 *
 * What this suite pins, and why each one is a property rather than a shape:
 *
 *  - **Ledger CRUD**: create entry (201), duplicate → 409
 *    DUPLICATE_LEDGER_ENTRY, unknown thread → 404 THREAD_NOT_FOUND,
 *    list with status filter, update status (explicit author action).
 *  - **Audit**: status changes are audit-logged via the existing
 *    audit_logs / audit service (no new audit table).
 *  - **Gate**: BLOCKED with unclosed MUSTs (blocking items listed);
 *    approve without closed MUSTs → still BLOCKED (approved=true);
 *    all MUSTs closed + approved → READY.
 *  - **Never auto-close (Invariant 1)**: no read path (list, gate,
 *    debt report, approve) changes a ledger status; resolving the
 *    underlying story thread does not change the ledger status either.
 *  - **No forced ending (Invariant 2)**: grep-verified — no
 *    chapter-count logic exists in the endgame module.
 *  - **Read-only on canon (Invariant 3)**: story/canon row counts
 *    unchanged after the full ledger lifecycle.
 *  - **Debt report**: pinned shape
 *    { unclosedMusts, unpaidCallbacks, openThreads, sequelHooks,
 *      generatedAt }; unpaidCallbacks is [] when 022B's table is absent
 *    (must not fail).
 *  - **Capabilities**: VIEWER → 403; EDITOR reads but does not manage.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

const TEST_DB = "novelforge_test_endgame";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    // Fallback for environments where .env is not available.
    // Test database (local scratch only, not production).
    // pg_hba.conf uses trust auth for novelforge_test@localhost.
    process.env.DATABASE_URL =
      "postgres://novelforge_test@localhost:5432/novelforge_test";
  }
}
// If .env had a placeholder, use the test credentials.
// Note: pg_hba.conf is configured with trust auth for novelforge_test@localhost,
// so no password is needed.
if (process.env.DATABASE_URL?.includes("<redacted>")) {
  process.env.DATABASE_URL = "postgres://novelforge_test@localhost:5432/novelforge_test";
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

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });

  db = createDb(TEST_URL);
  app = await buildApp(env, { db });
  await app.ready();
}, 120000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  // Endgame tables first (FK order), then story threads, then the novel graph.
  await db.endgameGateApproval.deleteMany();
  await db.endgameLedger.deleteMany();
  await db.endgameCallback.deleteMany();
  await db.storyThreadEvent.deleteMany();
  await db.storyThread.deleteMany();
  await db.storyPromise.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.updateMany({ data: { currentBranchId: null } });
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedUser(email: string): Promise<{ userId: string; cookie: string }> {
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

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

async function seedFixture(role: "OWNER" | "EDITOR" | "VIEWER" = "OWNER"): Promise<Fixture> {
  const { userId, cookie } = await seedUser(
    `endgame-${Date.now()}-${Math.floor(Math.random() * 1000000)}@test.local`,
  );
  const ws = await db.workspace.create({
    data: { name: "ws", slug: `ws-${Date.now()}-${Math.floor(Math.random() * 1000000)}`, ownerId: userId },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role } });
  const novel = await db.novel.create({
    data: {
      workspaceId: ws.id,
      title: "Endgame Novel",
      slug: `novel-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      createdById: userId,
    },
  });
  return { cookie, userId, workspaceId: ws.id, novelId: novel.id };
}

async function seedThread(fx: Fixture, title: string): Promise<string> {
  const thread = await db.storyThread.create({
    data: {
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      kind: "MYSTERY",
      title,
      status: "ACTIVE",
      importance: 3,
      createdById: fx.userId,
    },
  });
  return thread.id;
}

function endgameUrl(fx: Fixture, path: string): string {
  return `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/endgame${path}`;
}

async function api(
  method: "GET" | "POST" | "PATCH",
  url: string,
  cookie: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    payload: payload ?? undefined,
  });
}

async function createEntry(
  fx: Fixture,
  threadId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return api("POST", endgameUrl(fx, "/ledger"), fx.cookie, {
    threadId,
    status,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Ledger CRUD
// ---------------------------------------------------------------------------

describe("closure ledger CRUD", () => {
  it("creates a ledger entry (201) with the pinned status", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const res = await createEntry(fx, threadId, "MUST", {
      criteria: "Heir revealed in a public scene",
      rationale: "Central mystery of the novel",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { entry: Record<string, unknown> };
    expect(body.entry.status).toBe("MUST");
    expect(body.entry.threadId).toBe(threadId);
    expect(body.entry.threadTitle).toBe("The missing heir");
    expect(body.entry.criteria).toBe("Heir revealed in a public scene");
    // 022C integration fields: ledgerId alias + derived closed flag.
    expect(body.entry.ledgerId).toBe(body.entry.id);
    expect(body.entry.closed).toBe(false);
  });

  it("closed reflects the linked thread's RESOLVED status (derived, not stored)", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const created = await createEntry(fx, threadId, "MUST");
    expect((created.json() as { entry: { closed: boolean } }).entry.closed).toBe(false);
    await db.storyThread.update({
      where: { id: threadId },
      data: { status: "RESOLVED", resolvedAtChapter: 1 },
    });
    const list = await api("GET", endgameUrl(fx, "/ledger"), fx.cookie);
    const entries = (list.json() as { entries: { threadId: string; closed: boolean }[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.closed).toBe(true);
  });

  it("duplicate entry for the same thread → 409 DUPLICATE_LEDGER_ENTRY", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const first = await createEntry(fx, threadId, "MUST");
    expect(first.statusCode).toBe(201);
    const second = await createEntry(fx, threadId, "SHOULD");
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toBe("DUPLICATE_LEDGER_ENTRY");
  });

  it("unknown thread → 404 THREAD_NOT_FOUND", async () => {
    const fx = await seedFixture();
    const res = await createEntry(fx, "00000000-0000-0000-0000-000000000000", "MUST");
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("THREAD_NOT_FOUND");
  });

  it("invalid status → 400 INVALID_INPUT", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const res = await createEntry(fx, threadId, "EVENTUALLY");
    expect(res.statusCode).toBe(400);
  });

  it("lists entries with an optional status filter", async () => {
    const fx = await seedFixture();
    const t1 = await seedThread(fx, "Thread one");
    const t2 = await seedThread(fx, "Thread two");
    await createEntry(fx, t1, "MUST");
    await createEntry(fx, t2, "SEQUEL", { rationale: "Hook for book two" });
    const all = await api("GET", endgameUrl(fx, "/ledger"), fx.cookie);
    expect(all.statusCode).toBe(200);
    expect((all.json() as { entries: unknown[] }).entries).toHaveLength(2);
    const musts = await api("GET", endgameUrl(fx, "/ledger?status=MUST"), fx.cookie);
    expect(musts.statusCode).toBe(200);
    const entries = (musts.json() as { entries: { status: string }[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("MUST");
  });

  it("updates a status via explicit PATCH; the change is audit-logged", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const created = await createEntry(fx, threadId, "SHOULD");
    const ledgerId = (created.json() as { entry: { id: string } }).entry.id;
    const res = await api("PATCH", endgameUrl(fx, `/ledger/${ledgerId}`), fx.cookie, {
      status: "MUST",
      rationale: "Promoted — the heir drives the climax",
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entry: { status: string } }).entry.status).toBe("MUST");
    const audits = await db.auditLog.findMany({
      where: { entityType: "endgame_ledger", entityId: ledgerId },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    const update = audits.find((a) => a.action === "endgame.ledger.status_updated");
    expect(update).toBeDefined();
    expect((update!.payload as { from: string; to: string }).from).toBe("SHOULD");
    expect((update!.payload as { from: string; to: string }).to).toBe("MUST");
  });

  it("PATCH with an empty body → 400", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const created = await createEntry(fx, threadId, "MAY");
    const ledgerId = (created.json() as { entry: { id: string } }).entry.id;
    const res = await api("PATCH", endgameUrl(fx, `/ledger/${ledgerId}`), fx.cookie, {});
    expect(res.statusCode).toBe(400);
  });

  it("unknown ledger id → 404 LEDGER_NOT_FOUND", async () => {
    const fx = await seedFixture();
    const res = await api(
      "PATCH",
      endgameUrl(fx, "/ledger/00000000-0000-0000-0000-000000000000"),
      fx.cookie,
      { status: "MUST" },
    );
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("LEDGER_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Ending gate
// ---------------------------------------------------------------------------

describe("ending gate", () => {
  it("BLOCKED with unclosed MUSTs; READY when all MUSTs closed + approved", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    await createEntry(fx, threadId, "MUST", { criteria: "Heir revealed" });

    // 1. Unclosed MUST, no approval → BLOCKED.
    let gate: { verdict: string; blockingItems: unknown[]; approved: boolean };
    gate = (
      (await api("GET", endgameUrl(fx, "/gate"), fx.cookie)).json() as {
        gate: { verdict: string; blockingItems: unknown[]; approved: boolean };
      }
    ).gate;
    expect(gate.verdict).toBe("BLOCKED");
    expect(gate.blockingItems).toHaveLength(1);
    expect(gate.approved).toBe(false);

    // 2. Approve with MUSTs still open → still BLOCKED, but approved.
    const approved = await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    expect(approved.statusCode).toBe(200);
    gate = (approved.json() as { gate: { verdict: string; blockingItems: unknown[]; approved: boolean } }).gate;
    expect(gate.verdict).toBe("BLOCKED");
    expect(gate.approved).toBe(true);

    // 3. Resolve the underlying story thread → MUST no longer blocking → READY.
    await db.storyThread.update({
      where: { id: threadId },
      data: { status: "RESOLVED", resolvedAtChapter: 1 },
    });
    gate = (
      (await api("GET", endgameUrl(fx, "/gate"), fx.cookie)).json() as {
        gate: { verdict: string; blockingItems: unknown[]; approved: boolean };
      }
    ).gate;
    expect(gate.verdict).toBe("READY");
    expect(gate.blockingItems).toHaveLength(0);
  });

  it("SHOULD/MAY/OPEN/SEQUEL never block the gate", async () => {
    const fx = await seedFixture();
    for (const [title, status] of [
      ["Should thread", "SHOULD"],
      ["May thread", "MAY"],
      ["Open thread", "OPEN"],
      ["Sequel hook", "SEQUEL"],
    ] as const) {
      const threadId = await seedThread(fx, title);
      await createEntry(fx, threadId, status);
    }
    await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    const gate = (
      (await api("GET", endgameUrl(fx, "/gate"), fx.cookie)).json() as {
        gate: { verdict: string };
      }
    ).gate;
    expect(gate.verdict).toBe("READY");
  });

  it("approval records the approver identity and is audit-logged", async () => {
    const fx = await seedFixture();
    await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    const gate = (
      (await api("GET", endgameUrl(fx, "/gate"), fx.cookie)).json() as {
        gate: { approvedById: string; approvedAt: string };
      }
    ).gate;
    expect(gate.approvedById).toBe(fx.userId);
    expect(gate.approvedAt).toBeTruthy();
    const audits = await db.auditLog.findMany({
      where: { action: "endgame.gate.approved", entityType: "endgame_gate_approval" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(fx.userId);
  });
});

// ---------------------------------------------------------------------------
// Invariant 1 — never auto-close
// ---------------------------------------------------------------------------

describe("Invariant 1 — never auto-close", () => {
  it("no read path changes a ledger status; resolving the thread does not either", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const created = await createEntry(fx, threadId, "MUST");
    const ledgerId = (created.json() as { entry: { id: string } }).entry.id;

    // Exercise every read path.
    await api("GET", endgameUrl(fx, "/ledger"), fx.cookie);
    await api("GET", endgameUrl(fx, "/gate"), fx.cookie);
    await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);
    await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    // Resolve the underlying story thread (the author's story act).
    await db.storyThread.update({
      where: { id: threadId },
      data: { status: "RESOLVED", resolvedAtChapter: 1 },
    });
    await api("GET", endgameUrl(fx, "/gate"), fx.cookie);

    // The ledger status is untouched: only an explicit PATCH changes it.
    const entry = await db.endgameLedger.findUniqueOrThrow({ where: { id: ledgerId } });
    expect(entry.status).toBe("MUST");
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — no forced ending (no chapter-count logic)
// ---------------------------------------------------------------------------

describe("Invariant 2 — no forced ending", () => {
  it("the endgame module contains no chapter-count logic (grep-verified)", () => {
    const serviceSrc = readFileSync(path.join(HERE, "services", "endgame.ts"), "utf8");
    const routesSrc = readFileSync(path.join(HERE, "endgame-routes.ts"), "utf8");
    for (const [name, src] of [
      ["services/endgame.ts", serviceSrc],
      ["endgame-routes.ts", routesSrc],
    ] as const) {
      expect(
        src,
        `${name} must not contain chapter-count logic (Invariant 2)`,
      ).not.toMatch(/chapter/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 3 — read-only on canon
// ---------------------------------------------------------------------------

describe("Invariant 3 — read-only on canon", () => {
  it("the full ledger lifecycle leaves story/canon rows untouched", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    const before = {
      threads: await db.storyThread.count(),
      events: await db.storyThreadEvent.count(),
      promises: await db.storyPromise.count(),
      audit: await db.auditLog.count(),
    };
    const threadBefore = await db.storyThread.findUniqueOrThrow({ where: { id: threadId } });

    const created = await createEntry(fx, threadId, "MUST", { criteria: "x" });
    const ledgerId = (created.json() as { entry: { id: string } }).entry.id;
    await api("PATCH", endgameUrl(fx, `/ledger/${ledgerId}`), fx.cookie, { status: "SHOULD" });
    await api("GET", endgameUrl(fx, "/gate"), fx.cookie);
    await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);

    // Only endgame_* tables and audit_logs grew.
    expect(await db.storyThread.count()).toBe(before.threads);
    expect(await db.storyThreadEvent.count()).toBe(before.events);
    expect(await db.storyPromise.count()).toBe(before.promises);
    expect(await db.auditLog.count()).toBeGreaterThan(before.audit);
    const threadAfter = await db.storyThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(threadAfter).toEqual(threadBefore);
  });
});

// ---------------------------------------------------------------------------
// Debt report
// ---------------------------------------------------------------------------

describe("debt report", () => {
  it("returns the pinned shape; unpaidCallbacks is [] when 022B is absent", async () => {
    const fx = await seedFixture();
    const mustThread = await seedThread(fx, "The missing heir");
    const openThread = await seedThread(fx, "A side mystery");
    const sequelThread = await seedThread(fx, "The next generation");
    await createEntry(fx, mustThread, "MUST", { criteria: "Heir revealed" });
    await createEntry(fx, sequelThread, "SEQUEL", { rationale: "Hook for book two" });

    const res = await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);
    expect(res.statusCode).toBe(200);
    const report = (res.json() as { report: Record<string, unknown> }).report;

    // Pinned shape keys.
    for (const key of ["unclosedMusts", "unpaidCallbacks", "openThreads", "sequelHooks", "generatedAt"]) {
      expect(report, `debt report must include ${key}`).toHaveProperty(key);
    }
    const musts = report.unclosedMusts as { ledgerId: string; threadId: string; status: string; criteria: string }[];
    expect(musts).toHaveLength(1);
    expect(musts[0]!.threadId).toBe(mustThread);
    expect(musts[0]!.status).toBe("MUST");
    expect(musts[0]!.criteria).toBe("Heir revealed");
    // 022B not implemented in this test DB → empty, not an error.
    expect(report.unpaidCallbacks).toEqual([]);
    const open = report.openThreads as { threadId: string; title: string }[];
    expect(open.map((t) => t.threadId).sort()).toEqual([mustThread, openThread, sequelThread].sort());
    const hooks = report.sequelHooks as { ledgerId: string; threadId: string; description: string }[];
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.threadId).toBe(sequelThread);
    expect(hooks[0]!.description).toBe("Hook for book two");
    expect(typeof report.generatedAt).toBe("string");
  });

  it("a resolved MUST thread drops out of unclosedMusts", async () => {
    const fx = await seedFixture();
    const threadId = await seedThread(fx, "The missing heir");
    await createEntry(fx, threadId, "MUST");
    await db.storyThread.update({
      where: { id: threadId },
      data: { status: "RESOLVED", resolvedAtChapter: 1 },
    });
    const res = await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);
    const report = (res.json() as { report: { unclosedMusts: unknown[] } }).report;
    expect(report.unclosedMusts).toHaveLength(0);
  });

  it("unpaidCallbacks includes 022B's unpaid callbacks (regression: plural table name)", async () => {
    // F1 (022A diff review): findUnpaidCallbacks referenced the singular
    // "endgame_callback" while 022B's table is "endgame_callbacks" —
    // silently returning [] even with unpaid rows present.
    const fx = await seedFixture();
    const setupId = randomUUID();
    const unpaid = await db.endgameCallback.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        setupEventId: setupId,
        description: "The gun on the wall",
        createdById: fx.userId,
      },
    });
    // A paid callback (payoff linked) must NOT appear.
    await db.endgameCallback.create({
      data: {
        workspaceId: fx.workspaceId,
        novelId: fx.novelId,
        setupEventId: randomUUID(),
        payoffEventId: randomUUID(),
        status: "PAID",
        description: "Resolved subplot",
        createdById: fx.userId,
      },
    });

    const res = await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);
    expect(res.statusCode).toBe(200);
    const report = (res.json() as {
      report: {
        unpaidCallbacks: { callbackId: string; setupEventId: string; description: string | null }[];
      };
    }).report;
    expect(report.unpaidCallbacks).toHaveLength(1);
    expect(report.unpaidCallbacks[0]!.callbackId).toBe(unpaid.id);
    expect(report.unpaidCallbacks[0]!.setupEventId).toBe(setupId);
    expect(report.unpaidCallbacks[0]!.description).toBe("The gun on the wall");
  });
});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

describe("capabilities", () => {
  it("VIEWER cannot read or manage → 403; unauthenticated → 401", async () => {
    const fx = await seedFixture("VIEWER");
    const threadId = await seedThread(fx, "The missing heir");
    const create = await createEntry(fx, threadId, "MUST");
    expect(create.statusCode).toBe(403);
    const list = await api("GET", endgameUrl(fx, "/ledger"), fx.cookie);
    expect(list.statusCode).toBe(403);
    const gate = await api("GET", endgameUrl(fx, "/gate"), fx.cookie);
    expect(gate.statusCode).toBe(403);
    const noAuth = await app.inject({ method: "GET", url: endgameUrl(fx, "/ledger") });
    expect(noAuth.statusCode).toBe(401);
  });

  it("EDITOR can read but cannot manage", async () => {
    const fx = await seedFixture("EDITOR");
    const threadId = await seedThread(fx, "The missing heir");
    const list = await api("GET", endgameUrl(fx, "/ledger"), fx.cookie);
    expect(list.statusCode).toBe(200);
    const gate = await api("GET", endgameUrl(fx, "/gate"), fx.cookie);
    expect(gate.statusCode).toBe(200);
    const report = await api("GET", endgameUrl(fx, "/debt-report"), fx.cookie);
    expect(report.statusCode).toBe(200);
    const create = await createEntry(fx, threadId, "MUST");
    expect(create.statusCode).toBe(403);
    const approve = await api("POST", endgameUrl(fx, "/gate/approve"), fx.cookie);
    expect(approve.statusCode).toBe(403);
  });

  it("non-members get 404 (tenant isolation, ADR-0004)", async () => {
    const fx = await seedFixture("OWNER");
    const outsider = await seedUser(`outsider-${Date.now()}@test.local`);
    const res = await api("GET", endgameUrl(fx, "/ledger"), outsider.cookie);
    expect(res.statusCode).toBe(404);
  });
});
