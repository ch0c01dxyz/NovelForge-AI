/**
 * Planning integration tests (Phase 7) — drives the registered routes
 * through buildApp against a scratch Postgres DB (canon.test.ts
 * precedent). Planning never touches AI, so no fake gateway is needed.
 *
 * Error bodies are asserted GENERIC ({error:"CONFLICT"} etc.), not by
 * service message: the app-wide error handler in platform-routes.ts maps
 * the domain errors before any client sees them.
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

const TEST_DB = "novelforge_test_planning";
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

let db: NovelForgeDb | undefined;
let app: FastifyInstance | undefined;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
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
  // Planning never touches the AI gateway — the AI layer is omitted entirely.
  app = await buildApp(env, { db });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  // Planning tables first: outline nodes reference their saga (FK), so they
  // go before sagas themselves.
  await db!.outlineNode.deleteMany();
  await db!.outlineVersion.deleteMany();
  await db!.synopsis.deleteMany();
  await db!.planningHorizon.deleteMany();
  await db!.saga.deleteMany();
  // Standard tenant cascade (shared with canon.test.ts).
  await db!.auditLog.deleteMany();
  await db!.canonFactSource.deleteMany();
  await db!.canonProposal.deleteMany();
  await db!.canonFact.deleteMany();
  await db!.storyEntity.deleteMany();
  await db!.retrievalAudit.deleteMany();
  await db!.generation.deleteMany();
  await db!.$executeRawUnsafe("DELETE FROM embeddings");
  await db!.$executeRawUnsafe("DELETE FROM chunks");
  await db!.reference.updateMany({ data: { currentVersionId: null } });
  await db!.referenceVersion.deleteMany();
  await db!.reference.deleteMany();
  await db!.chapter.updateMany({ data: { currentVersionId: null } });
  await db!.chapterVersion.deleteMany();
  await db!.chapter.deleteMany();
  await db!.novelSettings.deleteMany();
  await db!.novel.deleteMany();
  await db!.membership.deleteMany();
  await db!.workspace.deleteMany();
  await db!.session.deleteMany();
  await db!.user.deleteMany();
});

async function seedUser(
  email: string,
  platformRole: "SUPER_ADMIN" | null = null,
): Promise<{ userId: string; cookie: string }> {
  const user = await db!.user.create({
    data: {
      email,
      passwordHash: "x",
      displayName: email,
      platformRole: platformRole ?? undefined,
    },
  });
  const token = generateSessionToken();
  await db!.session.create({
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
  const ws = await db!.workspace.create({ data: { name: slug, slug, ownerId } });
  await db!.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  if (memberRole) {
    await db!.membership.create({
      data: { workspaceId: ws.id, userId: memberRole.userId, role: memberRole.role },
    });
  }
  // Through the production path, not a raw row: `createNovel` is where C8's
  // baseline branch/revision lives, so a raw insert would seed a novel the
  // product cannot produce (no head) and every covered mutation would 409.
  const novel = await createPlatformServices({
    db: db!,
    audit: createAuditService(db!),
  }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: `Novel ${slug}`,
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

/** Base URL prefix for a novel's planning routes. */
function planningUrl(workspaceId: string, novelId: string): string {
  return `/api/workspaces/${workspaceId}/novels/${novelId}/planning`;
}

async function createSynopsis(
  cookie: string,
  workspaceId: string,
  novelId: string,
  content: string,
): Promise<{ id: string; status: string }> {
  const res = await app!.inject({
    method: "POST",
    url: `${planningUrl(workspaceId, novelId)}/synopses`,
    headers: { cookie },
    payload: { content },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json() as { id: string; status: string; content: string };
  expect(body.content).toBe(content);
  expect(body.status).toBe("ACTIVE");
  return { id: body.id, status: body.status };
}

async function createSaga(
  cookie: string,
  workspaceId: string,
  novelId: string,
  payload: { kind: string; title: string; parentId?: string; intent?: string },
): Promise<{ id: string; kind: string; parentId: string | null }> {
  const res = await app!.inject({
    method: "POST",
    url: `${planningUrl(workspaceId, novelId)}/sagas`,
    headers: { cookie },
    payload,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; kind: string; parentId: string | null };
}

async function createOutlineNode(
  cookie: string,
  workspaceId: string,
  novelId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app!.inject({
    method: "POST",
    url: `${planningUrl(workspaceId, novelId)}/outline-nodes`,
    headers: { cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() };
}

describe("planning routes", () => {
  it("creates, lists, and archives synopses (CAS double-archive 409)", async () => {
    const owner = await seedUser("p-syn@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-syn");

    const a = await createSynopsis(owner.cookie, workspaceId, novelId, "arc one");
    const b = await createSynopsis(owner.cookie, workspaceId, novelId, "arc two");
    expect(a.status).toBe("ACTIVE");
    expect(b.status).toBe("ACTIVE");

    // Default list hides archived; createdAt desc → b first.
    let list = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/synopses`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; status: string; content: string }>;
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);

    // Archive a → hidden by default, visible with includeArchived.
    const archived = await app!.inject({
      method: "POST",
      url: `${planningUrl(workspaceId, novelId)}/synopses/${a.id}/archive`,
      headers: { cookie: owner.cookie },
    });
    expect(archived.statusCode, archived.body).toBe(204);

    list = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/synopses`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; status: string; content: string }>;
    expect(list.map((s) => s.id)).toEqual([b.id]);

    list = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/synopses?includeArchived=true`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; status: string; content: string }>;
    expect(list.map((s) => ({ id: s.id, status: s.status }))).toEqual([
      { id: b.id, status: "ACTIVE" },
      { id: a.id, status: "ARCHIVED" },
    ]);

    // Second archive loses the CAS → 409 with the generic app body.
    const again = await app!.inject({
      method: "POST",
      url: `${planningUrl(workspaceId, novelId)}/synopses/${a.id}/archive`,
      headers: { cookie: owner.cookie },
    });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json()).toEqual({ error: "CONFLICT" });
  });

  it("creates sagas and rejects SAGA-under-SAGA via KIND_ORDER", async () => {
    const owner = await seedUser("p-saga@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-saga");

    const saga = await createSaga(owner.cookie, workspaceId, novelId, {
      kind: "SAGA",
      title: "First Age",
      intent: "foundational",
    });
    expect(saga.parentId).toBeNull();

    // List ordered createdAt asc.
    const list = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/sagas`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; kind: string }>;
    expect(list.map((s) => s.id)).toEqual([saga.id]);

    // SAGA under SAGA violates the rank rule (child kind must be strictly
    // greater) → hierarchy ConflictError → generic 409.
    const bad = await app!.inject({
      method: "POST",
      url: `${planningUrl(workspaceId, novelId)}/sagas`,
      headers: { cookie: owner.cookie },
      payload: { kind: "SAGA", title: "Nested", parentId: saga.id },
    });
    expect(bad.statusCode, bad.body).toBe(409);
    expect(bad.json()).toEqual({ error: "CONFLICT" });
  });

  it("rejects outline nodes with wrong leaf links before touching the saga", async () => {
    const owner = await seedUser("p-leaf@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-leaf");
    // RFC-4122-valid: zod 4's uuid() enforces the version/variant nibbles,
    // so an all-repeating-digit id would be rejected as 400 before the
    // service could ever see it.
    const dummy = "00000000-0000-4000-8000-000000000001";

    // CHAPTER_GROUP with a link: the links rule fires before the saga
    // lookup, so no seeded saga is needed.
    const linked = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: dummy,
      kind: "CHAPTER_GROUP",
      title: "cg",
      order: 0,
      chapterId: dummy,
    });
    expect(linked.statusCode).toBe(409);
    expect(linked.body).toEqual({ error: "CONFLICT" });

    // CHAPTER with zero links.
    const noLink = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: dummy,
      kind: "CHAPTER",
      title: "c",
      order: 0,
    });
    expect(noLink.statusCode).toBe(409);
    expect(noLink.body).toEqual({ error: "CONFLICT" });

    // CHAPTER with two links.
    const twoLinks = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: dummy,
      kind: "CHAPTER",
      title: "c",
      order: 0,
      chapterId: dummy,
      sceneId: dummy,
    });
    expect(twoLinks.statusCode).toBe(409);
    expect(twoLinks.body).toEqual({ error: "CONFLICT" });
  });

  it("creates outline nodes: saga 404, duplicate order 409, list ordered", async () => {
    const owner = await seedUser("p-node@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-node");
    const saga = await createSaga(owner.cookie, workspaceId, novelId, {
      kind: "SAGA",
      title: "S1",
    });

    // Nonexistent saga (links check passes for CHAPTER_GROUP with no links)
    // → 404, generic body.
    const noSaga = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: "00000000-0000-4000-8000-000000000002",
      kind: "CHAPTER_GROUP",
      title: "cg",
      order: 0,
    });
    expect(noSaga.statusCode).toBe(404);
    expect(noSaga.body).toEqual({ error: "NOT_FOUND" });

    const n0 = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: saga.id,
      kind: "CHAPTER_GROUP",
      title: "Act 1",
      order: 0,
    });
    expect(n0.statusCode).toBe(201);
    const n0b = n0.body as { sagaId: string; kind: string; order: number };
    expect(n0b.sagaId).toBe(saga.id);
    expect(n0b.order).toBe(0);

    // Same (sagaId, order) again → P2002 mapped to generic 409.
    const dup = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: saga.id,
      kind: "CHAPTER_GROUP",
      title: "Act 1 again",
      order: 0,
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.body).toEqual({ error: "CONFLICT" });

    const n1 = await createOutlineNode(owner.cookie, workspaceId, novelId, {
      sagaId: saga.id,
      kind: "CHAPTER_GROUP",
      title: "Act 2",
      order: 1,
    });
    expect(n1.statusCode).toBe(201);

    // List ordered by (sagaId asc, order asc); sagaId filter works.
    const list = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/outline-nodes`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; order: number }>;
    expect(list.map((n) => n.order)).toEqual([0, 1]);

    const filtered = (await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/outline-nodes?sagaId=${saga.id}`,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string }>;
    expect(filtered).toHaveLength(2);
  });

  it("creates outline drafts with monotonic numbers, approves, supersedes, re-approving loses", async () => {
    const owner = await seedUser("p-outline@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-outline");
    const base = `${planningUrl(workspaceId, novelId)}/outline-versions`;

    const v1 = (await app!.inject({
      method: "POST",
      url: base,
      headers: { cookie: owner.cookie },
      payload: { content: { beats: ["a"] }, note: "first" },
    })).json() as { id: string; number: number; status: string; note: string | null };
    expect(v1.number).toBe(1);
    expect(v1.status).toBe("DRAFT");
    expect(v1.note).toBe("first");

    const v2 = (await app!.inject({
      method: "POST",
      url: base,
      headers: { cookie: owner.cookie },
      payload: { content: { beats: ["a", "b"] } },
    })).json() as { id: string; number: number };
    expect(v2.number).toBe(2);

    // Boundary validation: content is the persisted draft blob, so absent or
    // null is rejected at the route (400), not stored as an empty draft.
    for (const bad of [{}, { content: null }]) {
      const rejected = await app!.inject({
        method: "POST",
        url: base,
        headers: { cookie: owner.cookie },
        payload: bad,
      });
      expect(rejected.statusCode, JSON.stringify(bad)).toBe(400);
      expect((rejected.json() as { error: string }).error).toBe("INVALID_INPUT");
    }
    const afterRejects = (await app!.inject({
      method: "GET",
      url: base,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string }>;
    expect(afterRejects).toHaveLength(2);

    // List ordered number desc.
    let list = (await app!.inject({
      method: "GET",
      url: base,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; number: number; status: string }>;
    expect(list.map((v) => v.number)).toEqual([2, 1]);

    // THE PAYLOAD, not the bookkeeping (GAP-024). `captureSnapshot` reads the
    // live tables when it runs, so a checkpoint whose metadata is right but
    // whose image is post-mutation restores nothing. Asserted after each
    // mutation, since the checkpoint does not exist before it.
    //
    // Sorted: `captureSnapshot` issues no ORDER BY, so the row order is the
    // database's business, not an assertion.
    const outlineRows = (cp: { snapshot: { payload: unknown } | null }) =>
      ((cp.snapshot!.payload as Record<string, { id: string; status: string }[]>)["outline_versions"] ?? [])
        .map((r) => `${r.id}:${r.status}`)
        .sort();

    // Approve v1 → 200, status flips, and v2 was never approved.
    const approved = await app!.inject({
      method: "POST",
      url: `${base}/${v1.id}/approve`,
      headers: { cookie: owner.cookie },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const approvedBody = approved.json() as { id: string; status: string };
    expect(approvedBody).toEqual(expect.objectContaining({ id: v1.id, status: "APPROVED" }));

    // At approve time both versions were still DRAFT; the approval promotes v1
    // to APPROVED. A snapshot holding v1 as DRAFT is the pre-mutation image;
    // one holding APPROVED fails, and that is what an advance placed after the
    // promote (or after the supersede step, which also writes
    // `outline_versions`) would produce.
    const approveCp = await db!.checkpoint.findFirstOrThrow({
      where: { novelId, label: { startsWith: "outlineVersion.approve" } },
      select: { id: true, snapshot: { select: { payload: true } } },
    });
    expect(outlineRows(approveCp)).toEqual([`${v1.id}:DRAFT`, `${v2.id}:DRAFT`].sort());

    // Supersede → 204; the single APPROVED slot is now empty.
    const superseded = await app!.inject({
      method: "POST",
      url: `${base}/supersede`,
      headers: { cookie: owner.cookie },
    });
    expect(superseded.statusCode, superseded.body).toBe(204);

    // Same proof for the second planning site: the supersede's PRE_MUTATION
    // image still shows v1 APPROVED, because the advance runs before the
    // update rather than after it.
    const supersedeCp = await db!.checkpoint.findFirstOrThrow({
      where: { novelId, label: { startsWith: "outline.supersede" } },
      select: { id: true, snapshot: { select: { payload: true } } },
    });
    expect(outlineRows(supersedeCp)).toEqual([`${v1.id}:APPROVED`, `${v2.id}:DRAFT`].sort());

    // Re-approve of the now-SUPERSEDED v1: the DRAFT CAS matches zero rows
    // → 409 with the generic body.
    const again = await app!.inject({
      method: "POST",
      url: `${base}/${v1.id}/approve`,
      headers: { cookie: owner.cookie },
    });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json()).toEqual({ error: "CONFLICT" });

    // Approving v2 now works (fresh DRAFT, slot free).
    const approved2 = await app!.inject({
      method: "POST",
      url: `${base}/${v2.id}/approve`,
      headers: { cookie: owner.cookie },
    });
    expect(approved2.statusCode, approved2.body).toBe(200);
    expect((approved2.json() as { status: string }).status).toBe("APPROVED");

    // List shows the transitions.
    list = (await app!.inject({
      method: "GET",
      url: base,
      headers: { cookie: owner.cookie },
    })).json() as Array<{ id: string; number: number; status: string }>;
    expect(list).toEqual([
      expect.objectContaining({ number: 2, status: "APPROVED" }),
      expect.objectContaining({ number: 1, status: "SUPERSEDED" }),
    ]);

    // And the checkpoint really undoes the approval: applying the approve's
    // PRE_MUTATION image puts v1 back to DRAFT. This one has to be an applied
    // restore, not a preview — the row identity does not change, only its
    // status, so the preview's added/removed counts are zero either way and
    // would pass against a post-mutation image.
    const preview = await app!.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/restores/preview`,
      headers: { cookie: owner.cookie },
      payload: { checkpointId: approveCp.id, scope: "FULL" },
    });
    expect(preview.statusCode, preview.body).toBe(201);
    const applied = await app!.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/restores/${
        (preview.json() as { restoreOperationId: string }).restoreOperationId
      }/apply`,
      headers: { cookie: owner.cookie },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    // v1 is DRAFT again, and the later APPROVED v2 is gone — both rewound to
    // the image the checkpoint holds.
    expect(
      await db!.outlineVersion.findMany({
        where: { novelId },
        select: { id: true, status: true },
        orderBy: { number: "asc" },
      }),
    ).toEqual([
      { id: v1.id, status: "DRAFT" },
      { id: v2.id, status: "DRAFT" },
    ]);
  });

  it("horizon: empty until put, round-trips, rejects malformed", async () => {
    const owner = await seedUser("p-horizon@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-horizon");
    const horizonUrl = `${planningUrl(workspaceId, novelId)}/horizon`;

    // No row yet → honest empty.
    let got = (await app!.inject({
      method: "GET",
      url: horizonUrl,
      headers: { cookie: owner.cookie },
    })).json() as { policy: unknown; updatedAt: string | null };
    expect(got.policy).toBeNull();
    expect(got.updatedAt).toBeNull();

    const policy = {
      bands: [
        { maxDistance: 5, detail: "FULL" },
        { maxDistance: null, detail: "VAGUE" },
      ],
    };
    const put = await app!.inject({
      method: "PUT",
      url: horizonUrl,
      headers: { cookie: owner.cookie },
      payload: { policy },
    });
    expect(put.statusCode, put.body).toBe(200);
    expect((put.json() as { policy: unknown }).policy).toEqual(policy);
    const raced = await app!.inject({ method: "PUT", url: horizonUrl, headers: { cookie: owner.cookie }, payload: { policy: { bands: [{ maxDistance: null, detail: "FULL" }] }, expectedUpdatedAt: null } });
    expect(raced.statusCode).toBe(409);

    got = (await app!.inject({
      method: "GET",
      url: horizonUrl,
      headers: { cookie: owner.cookie },
    })).json() as { policy: unknown; updatedAt: string | null };
    expect(got.policy).toEqual(policy);
    expect(got.updatedAt).not.toBeNull();

    // Malformed policy rejected through the pure rule → generic 409, stored nowhere.
    for (const bad of [{}, { bands: [] }]) {
      const rejected = await app!.inject({
        method: "PUT",
        url: horizonUrl,
        headers: { cookie: owner.cookie },
        payload: { policy: bad },
      });
      expect(rejected.statusCode, rejected.body).toBe(409);
      expect(rejected.json()).toEqual({ error: "CONFLICT" });
    }

    // Round-trip unchanged after rejections.
    got = (await app!.inject({
      method: "GET",
      url: horizonUrl,
      headers: { cookie: owner.cookie },
    })).json() as { policy: unknown; updatedAt: string | null };
    expect(got.policy).toEqual(policy);
  });

  it("enforces tenant isolation: a cross-workspace novel is 404, not 403", async () => {
    const owner = await seedUser("p-tenant@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-tenant");
    const intruder = await seedUser("p-tenant-b@t.test");
    const intruded = await seedWorkspace(intruder.userId, "p-tenant-b");

    // Owner of workspace B hits workspace A's novel → gate 404 (no leak).
    const res = await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/sagas`,
      headers: { cookie: intruder.cookie },
    });
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json()).toEqual({ error: "NOT_FOUND" });

    // Same workspace but a novel that does not exist there → same 404.
    void intruded;
    const ghost = await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, "00000000-0000-4000-8000-000000000003")}/sagas`,
      headers: { cookie: intruder.cookie },
    });
    expect(ghost.statusCode, ghost.body).toBe(404);
    expect(ghost.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("EDITOR reads but cannot write; unauthenticated is 401", async () => {
    const owner = await seedUser("p-rbac@t.test");
    const editor = await seedUser("p-rbac-editor@t.test");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "p-rbac", {
      userId: editor.userId,
      role: "EDITOR",
    });

    // Owner seeds one saga; EDITOR reads it (canon:read ⊂ EDITOR).
    await createSaga(owner.cookie, workspaceId, novelId, { kind: "SAGA", title: "S" });
    const read = await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/sagas`,
      headers: { cookie: editor.cookie },
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json() as unknown[]).toHaveLength(1);

    // EDITOR lacks canon:manage → write is 403 with the generic body.
    const write = await app!.inject({
      method: "POST",
      url: `${planningUrl(workspaceId, novelId)}/synopses`,
      headers: { cookie: editor.cookie },
      payload: { content: "nope" },
    });
    expect(write.statusCode, write.body).toBe(403);
    expect(write.json()).toEqual({ error: "FORBIDDEN" });

    // No cookie at all → 401 before any scoping.
    const anon = await app!.inject({
      method: "GET",
      url: `${planningUrl(workspaceId, novelId)}/sagas`,
    });
    expect(anon.statusCode, anon.body).toBe(401);
    expect(anon.json()).toEqual({ error: "UNAUTHENTICATED" });
  });
});
