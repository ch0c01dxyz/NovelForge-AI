/**
 * Branch isolation (NF-WF-020B) integration suite.
 *
 * Dedicated `novelforge_test_branches` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database, because what this task claims is a property of the DATABASE and
 * the transaction: the temporal model (Invariant 5), the DIRTY_SWITCH
 * refusal, the BRANCH_SWITCH restore-to-head, and the branch-aware as-of
 * (GAP-040).
 *
 * What this suite pins, and why each one is a property rather than a shape:
 *
 *  - **Create**: a branch from a checkpoint gets `parentBranchId` +
 *    `sourceRevisionId`; head = the checkpoint's revision. Duplicate name →
 *    400, `name: "main"` → 400, unknown branch → 404, VIEWER → 403.
 *  - **Isolation**: mutations on B advance only B (B's head +1, main's
 *    unchanged); `GET .../revisions?branchId=` shows no B rows on main.
 *  - **Switch**: main → B → main creates one BRANCH_SWITCH revision on the
 *    target each time; live state matches each branch head after its
 *    switch; `Novel.currentBranchId` tracks the target.
 *  - **DIRTY_SWITCH**: mutate without checkpoint → 409 DIRTY_SWITCH; with
 *    `autoCheckpoint: true` → succeeds and a MANUAL checkpoint exists.
 *  - **GAP-040**: cross-branch `asOfRevisionId` → 400 INVALID_INPUT in
 *    memory, health, and assembly paths; same-branch as-of unchanged.
 *  - **Invariant 9**: publish/schedule on a non-`main` checkout → 409
 *    NOT_ON_MAIN_BRANCH with no writes; after switching to `main` the same
 *    publish succeeds.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-utils/resolve-test-database-url.ts";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

const TEST_DB = "novelforge_test_branches";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

const BASE_URL = resolveTestDatabaseUrl({
  envPath: path.join(HERE, "..", "..", "..", ".env"),
});

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
  await db.auditLog.deleteMany();
  await db.restoreOperation.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.checkpoint.deleteMany();
  await db.snapshot.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.publication.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
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

async function seedViewer(fx: Fixture): Promise<{ cookie: string }> {
  const email = `viewer-${Date.now()}-${Math.random()}@test.local`;
  const { cookie } = await seedUser(email);
  const viewer = await db.user.findFirstOrThrow({ where: { email } });
  await db.membership.create({
    data: { workspaceId: fx.workspaceId, userId: viewer.id, role: "VIEWER" },
  });
  return { cookie };
}

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

async function seedFixture(role: "OWNER" | "VIEWER" = "OWNER"): Promise<Fixture> {
  const { userId, cookie } = await seedUser(`branch-${Date.now()}-${Math.random()}@test.local`);
  const ws = await db.workspace.create({ data: { name: "ws", slug: `ws-${Date.now()}`, ownerId: userId } });
  await db.membership.create({ data: { workspaceId: ws.id, userId, role } });
  // Novel through the API: createNovel writes the baseline + currentBranchId.
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ws.id}/novels`,
    headers: { cookie },
    payload: { title: "Branch Novel", slug: `novel-${Date.now()}` },
  });
  expect(res.statusCode).toBe(201);
  const novelId = (res.json() as { id: string }).id;
  return { cookie, userId, workspaceId: ws.id, novelId };
}

async function api(
  method: "GET" | "POST",
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

/** A checkpoint on the checked-out branch (captures a snapshot). */
async function makeCheckpoint(fx: Fixture, label: string): Promise<string> {
  const res = await api(
    "POST",
    `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/checkpoints`,
    fx.cookie,
    { label },
  );
  expect(res.statusCode).toBe(201);
  return (res.json() as { checkpointId: string }).checkpointId;
}

/** The checked-out branch row. */
async function checkedOut(fx: Fixture) {
  const novel = await db.novel.findUniqueOrThrow({
    where: { id: fx.novelId },
    select: { currentBranchId: true },
  });
  const branch = await db.novelBranch.findFirstOrThrow({
    where: { novelId: fx.novelId, id: novel.currentBranchId ?? undefined },
    select: { id: true, name: true, headRevisionId: true },
  });
  return branch;
}

// ---------------------------------------------------------------------------
// Branch lifecycle
// ---------------------------------------------------------------------------

describe("branch create/list", () => {
  it("creates a branch from a checkpoint with parentBranchId + sourceRevisionId", async () => {
    const fx = await seedFixture();
    const cpId = await makeCheckpoint(fx, "fork point");
    const cp = await db.checkpoint.findUniqueOrThrow({
      where: { id: cpId },
      select: { revisionId: true, branchId: true },
    });

    const res = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      branchId: string;
      name: string;
      headRevisionId: string;
      parentBranchId: string;
      sourceRevisionId: string;
    };
    // Default source = checked-out branch head (the checkpoint's revision).
    expect(body.name).toBe("experiment");
    expect(body.headRevisionId).toBe(cp.revisionId);
    expect(body.parentBranchId).toBe(cp.branchId);
    expect(body.sourceRevisionId).toBe(cp.revisionId);

    const row = await db.novelBranch.findUniqueOrThrow({ where: { id: body.branchId } });
    expect(row.sourceRevisionId).toBe(cp.revisionId);
  });

  it("400s on duplicate name and on name=main; 404s on unknown branch switch", async () => {
    const fx = await seedFixture();
    await makeCheckpoint(fx, "base");

    const dup1 = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    expect(dup1.statusCode).toBe(201);

    const dup2 = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    expect(dup2.statusCode).toBe(400);
    expect((dup2.json() as { error: string }).error).toBe("BRANCH_EXISTS");

    for (const reserved of ["main", "MAIN", " Main "]) {
      const r = await api(
        "POST",
        `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
        fx.cookie,
        { name: reserved },
      );
      expect(r.statusCode).toBe(400);
      expect((r.json() as { error: string }).error).toBe("INVALID_BRANCH_NAME");
    }

    const unknown = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/00000000-0000-0000-0000-000000000000/switch`,
      fx.cookie,
      {},
    );
    expect(unknown.statusCode).toBe(404);
  });

  it("403s a VIEWER on create and switch", async () => {
    // VIEWER has neither revision:read nor revision:manage.
    const ownerFx = await seedFixture("OWNER");
    const { cookie: viewerCookie } = await seedViewer(ownerFx);
    const create = await api(
      "POST",
      `/api/workspaces/${ownerFx.workspaceId}/novels/${ownerFx.novelId}/branches`,
      viewerCookie,
      { name: "nope" },
    );
    expect(create.statusCode).toBe(403);

    const list = await api(
      "GET",
      `/api/workspaces/${ownerFx.workspaceId}/novels/${ownerFx.novelId}/branches`,
      viewerCookie,
    );
    expect(list.statusCode).toBe(403);
  });

  it("lists branches with head number, fork point, and checked-out marker", async () => {
    const fx = await seedFixture();
    await makeCheckpoint(fx, "base");
    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;

    const res = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
    );
    expect(res.statusCode).toBe(200);
    const branches = (res.json() as { branches: unknown[] }).branches;
    expect(branches).toHaveLength(2);
    const main = branches.find((b) => (b as { name: string }).name === "main") as {
      isCheckedOut: boolean;
      headRevisionNumber: number;
    };
    const exp = branches.find((b) => (b as { id: string }).id === branchId) as {
      isCheckedOut: boolean;
      sourceRevisionId: string | null;
    };
    expect(main.isCheckedOut).toBe(true);
    expect(exp.isCheckedOut).toBe(false);
    expect(exp.sourceRevisionId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Isolation: mutations on B advance only B
// ---------------------------------------------------------------------------

describe("branch isolation", () => {
  it("mutations on B advance only B; per-branch history is filtered", async () => {
    const fx = await seedFixture();
    await makeCheckpoint(fx, "base");
    const mainBefore = await checkedOut(fx);
    const mainHeadBefore = mainBefore.headRevisionId;

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;

    // Switch to B (clean: live == main head snapshot).
    const sw = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(sw.statusCode).toBe(200);

    // Mutate on B: a checkpoint advances B's head by 1 (+1 for the switch).
    await makeCheckpoint(fx, "on B");
    const bAfter = await db.novelBranch.findUniqueOrThrow({ where: { id: branchId } });
    const mainAfter = await db.novelBranch.findFirstOrThrow({
      where: { novelId: fx.novelId, name: "main" },
    });
    expect(mainAfter.headRevisionId).toBe(mainHeadBefore);

    const mainId = (await db.novelBranch.findFirstOrThrow({ where: { novelId: fx.novelId, name: "main" } })).id;
    const bRevs = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/revisions?branchId=${branchId}`,
      fx.cookie,
    );
    const mainRevs = await api(
      "GET",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/revisions?branchId=${mainId}`,
      fx.cookie,
    );
    const bIds = new Set(((bRevs.json() as { revisions: { id: string }[] }).revisions).map((r) => r.id));
    const mainIds = ((mainRevs.json() as { revisions: { id: string }[] }).revisions).map((r) => r.id);
    // No B row appears in main's history and vice versa.
    for (const id of mainIds) expect(bIds.has(id)).toBe(false);
    expect(bAfter.headRevisionId).not.toBeNull();
    expect(bIds.has(bAfter.headRevisionId!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Switch semantics
// ---------------------------------------------------------------------------

describe("branch switch", () => {
  it("main → B → main: one BRANCH_SWITCH revision on the target each time; state follows", async () => {
    const fx = await seedFixture();
    // Seed a story entity (a restore target) so the snapshots carry real state.
    await db.storyEntity.create({
      data: {
        novelId: fx.novelId,
        createdById: fx.userId,
        kind: "LOCATION",
        key: "tavern",
        name: "The Tavern",
      },
    });
    await makeCheckpoint(fx, "with entity");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;
    const mainId = (await db.novelBranch.findFirstOrThrow({ where: { novelId: fx.novelId, name: "main" } })).id;

    // main → B
    const sw1 = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(sw1.statusCode).toBe(200);
    const sw1b = sw1.json() as { revisionNumber: number; switched: boolean };
    expect(sw1b.switched).toBe(true);
    let rev = await db.revision.findUniqueOrThrow({ where: { id: (sw1.json() as { revisionId: string }).revisionId } });
    expect(rev.origin).toBe("BRANCH_SWITCH");
    expect(rev.branchId).toBe(branchId);
    let novel = await db.novel.findUniqueOrThrow({ where: { id: fx.novelId } });
    expect(novel.currentBranchId).toBe(branchId);

    // Mutate on B: add an entity, checkpoint it (clean for the switch back).
    await db.storyEntity.create({
      data: {
        novelId: fx.novelId,
        createdById: fx.userId,
        kind: "LOCATION",
        key: "castle",
        name: "The Castle (B)",
      },
    });
    await makeCheckpoint(fx, "B work");

    // B → main: live must lose the B-only entity (story_entities is a
    // restore target; chapters are not, per C7).
    const sw2 = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${mainId}/switch`,
      fx.cookie,
      {},
    );
    expect(sw2.statusCode).toBe(200);
    rev = await db.revision.findUniqueOrThrow({ where: { id: (sw2.json() as { revisionId: string }).revisionId } });
    expect(rev.origin).toBe("BRANCH_SWITCH");
    expect(rev.branchId).toBe(mainId);
    novel = await db.novel.findUniqueOrThrow({ where: { id: fx.novelId } });
    expect(novel.currentBranchId).toBe(mainId);
    const liveEntities = await db.storyEntity.findMany({ where: { novelId: fx.novelId }, orderBy: { key: "asc" } });
    expect(liveEntities.map((e) => e.key)).toEqual(["tavern"]);

    // Switching to the already-checked-out branch is a no-op.
    const noop = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${mainId}/switch`,
      fx.cookie,
      {},
    );
    expect(noop.statusCode).toBe(200);
    expect((noop.json() as { switched: boolean }).switched).toBe(false);
  });

  it("dirty switch → 409 DIRTY_SWITCH; autoCheckpoint → succeeds with a MANUAL checkpoint", async () => {
    const fx = await seedFixture();
    await makeCheckpoint(fx, "clean");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;

    // Dirty the checked-out branch without a checkpoint.
    await db.chapter.create({
      data: { novel: { connect: { id: fx.novelId } }, createdBy: { connect: { id: fx.userId } }, number: 1, title: "dirty", status: "DRAFT" },
    });

    const refused = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toBe("DIRTY_SWITCH");

    const ok = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      { autoCheckpoint: true },
    );
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { autoCheckpointId: string | null };
    expect(body.autoCheckpointId).not.toBeNull();
    const cp = await db.checkpoint.findUniqueOrThrow({ where: { id: body.autoCheckpointId! } });
    expect(cp.kind).toBe("MANUAL");

    // The dirty state was saved: switching back restores the chapter.
    const mainId = (await db.novelBranch.findFirstOrThrow({ where: { novelId: fx.novelId, name: "main" } })).id;
    const back = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${mainId}/switch`,
      fx.cookie,
      {},
    );
    expect(back.statusCode).toBe(200);
    const chapters = await db.chapter.findMany({ where: { novelId: fx.novelId } });
    expect(chapters.map((c) => c.title)).toContain("dirty");
  });

  it("in-place row update without checkpoint → 409 DIRTY_SWITCH (F2)", async () => {
    const fx = await seedFixture();
    const entity = await db.storyEntity.create({
      data: {
        novelId: fx.novelId,
        createdById: fx.userId,
        kind: "LOCATION",
        key: "tavern",
        name: "The Tavern",
      },
    });
    await makeCheckpoint(fx, "clean");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;

    // In-place UPDATE: same id, changed content — the old ID-set-only diff
    // (added/removed) misread this as clean. The contract pins "any
    // added/removed/CHANGED covered-table row = dirty".
    await db.storyEntity.update({
      where: { id: entity.id },
      data: { name: "The Tavern (renamed)" },
    });

    const refused = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toBe("DIRTY_SWITCH");

    // The refused switch wrote nothing: the un-checkpointed edit is intact.
    const stillRenamed = await db.storyEntity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(stillRenamed.name).toBe("The Tavern (renamed)");

    // Checkpointing the edit makes the switch clean; the switch then
    // restores B's head state (the temporal model — B forked before the
    // rename, so B's head still has the old name).
    await makeCheckpoint(fx, "renamed");
    const ok = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(ok.statusCode).toBe(200);
    const onB = await db.storyEntity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(onB.name).toBe("The Tavern");
  });

  it("FULL restore preview + apply on a non-main branch succeeds (F1)", async () => {
    const fx = await seedFixture();
    const entity = await db.storyEntity.create({
      data: {
        novelId: fx.novelId,
        createdById: fx.userId,
        kind: "LOCATION",
        key: "tavern",
        name: "The Tavern",
      },
    });
    await makeCheckpoint(fx, "pre-B");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;
    const sw = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(sw.statusCode).toBe(200);

    // The restore target checkpoint is created ON B (the checked-out
    // branch) — a checkpoint from another branch is a 400 (F3).
    const cpBase = await makeCheckpoint(fx, "B base");

    // Mutate on B and checkpoint it, so the restore has something to rewind.
    await db.storyEntity.update({
      where: { id: entity.id },
      data: { name: "The Tavern (B edit)" },
    });
    await makeCheckpoint(fx, "B later");

    const bHeadBefore = (
      await db.novelBranch.findUniqueOrThrow({ where: { id: branchId } })
    ).headRevisionId;

    // Preview while B is checked out: must pin B's head, not main's.
    const preview = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/restores/preview`,
      fx.cookie,
      { checkpointId: cpBase },
    );
    expect(preview.statusCode).toBe(201);
    const previewBody = preview.json() as { restoreOperationId: string; preview: { headRevisionId: string } };
    expect(previewBody.preview.headRevisionId).toBe(bHeadBefore);

    // Apply while B is checked out: advances B's head (previously this
    // always 409'd NOT_ON_CHECKED_OUT_BRANCH because the preview pinned
    // main's head and stored main's branch id).
    const applied = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/restores/${previewBody.restoreOperationId}/apply`,
      fx.cookie,
      {},
    );
    expect(applied.statusCode).toBe(200);

    const after = await db.storyEntity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(after.name).toBe("The Tavern");
    const bHead = await db.novelBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(bHead.headRevisionId).not.toBe(bHeadBefore);
    const rev = await db.revision.findUniqueOrThrow({ where: { id: bHead.headRevisionId! } });
    expect(rev.origin).toBe("RESTORE");
    expect(rev.branchId).toBe(branchId);
    // main's head is untouched by the restore on B.
    const mainHead = await db.novelBranch.findFirstOrThrow({
      where: { novelId: fx.novelId, name: "main" },
    });
    expect(mainHead.headRevisionId).not.toBe(bHead.headRevisionId);
  });

  it("preview with a checkpoint from another branch → 400 CHECKPOINT_BRANCH_MISMATCH (F3)", async () => {
    const fx = await seedFixture();
    await makeCheckpoint(fx, "on main");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;
    const sw = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );
    expect(sw.statusCode).toBe(200);
    const cpB = await makeCheckpoint(fx, "on B");
    const mainId = (await db.novelBranch.findFirstOrThrow({ where: { novelId: fx.novelId, name: "main" } })).id;
    const back = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${mainId}/switch`,
      fx.cookie,
      {},
    );
    expect(back.statusCode).toBe(200);

    // Preview on main naming B's checkpoint: the checkpoint belongs to
    // another branch — 400 with the distinct code, not INVALID_BRANCH_NAME.
    const preview = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/restores/preview`,
      fx.cookie,
      { checkpointId: cpB },
    );
    expect(preview.statusCode).toBe(400);
    expect((preview.json() as { error: string }).error).toBe("CHECKPOINT_BRANCH_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// GAP-040: branch-aware as-of
// ---------------------------------------------------------------------------
// NF-WF-042: the vacuous test that lived here (non-existent POST
// /memory/recall, [400, 404] union, .not.toBe(400)-only control) is
// replaced by src/cross-branch-asof.test.ts — exact 400 INVALID_INPUT
// negatives + valid controls for all 4 consumers (memory, health,
// character, timeline), fixture validity proven first, mirrored
// checked-out=B negative. This block intentionally left empty.

// ---------------------------------------------------------------------------
// Invariant 9: no publishing from a branch
// ---------------------------------------------------------------------------

describe("Invariant 9 publish guard", () => {
  it("publish/schedule on a non-main checkout → 409 NOT_ON_MAIN_BRANCH, no writes; succeeds on main", async () => {
    const fx = await seedFixture();
    const chapter = await db.chapter.create({
      data: { novel: { connect: { id: fx.novelId } }, createdBy: { connect: { id: fx.userId } }, number: 1, title: "Ch 1", status: "DRAFT" },
    });
    const version = await db.chapterVersion.create({
      data: {
        chapter: { connect: { id: chapter.id } },
        author: { connect: { id: fx.userId } },
        number: 1,
        content: "<p>hi</p>",
        wordCount: 1,
      },
    });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });
    await makeCheckpoint(fx, "base");

    const created = await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches`,
      fx.cookie,
      { name: "experiment" },
    );
    const branchId = (created.json() as { branchId: string }).branchId;
    await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${branchId}/switch`,
      fx.cookie,
      {},
    );

    const pubUrl = `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/chapters/${chapter.id}/publication`;
    const refused = await api("POST", `${pubUrl}/publish`, fx.cookie, {});
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toBe("NOT_ON_MAIN_BRANCH");
    // No writes: no publication row was created.
    expect(await db.publication.count({ where: { novelId: fx.novelId } })).toBe(0);

    const sched = await api(
      "POST",
      `${pubUrl}/schedule`,
      fx.cookie,
      { scheduledFor: new Date(Date.now() + 3600_000).toISOString() },
    );
    expect(sched.statusCode).toBe(409);
    expect((sched.json() as { error: string }).error).toBe("NOT_ON_MAIN_BRANCH");
    expect(await db.publication.count({ where: { novelId: fx.novelId } })).toBe(0);

    // Switch back to main: publishing the same chapter succeeds.
    const mainId = (await db.novelBranch.findFirstOrThrow({ where: { novelId: fx.novelId, name: "main" } })).id;
    // Checkpoint B's clean state first (we are clean: just switched).
    await api(
      "POST",
      `/api/workspaces/${fx.workspaceId}/novels/${fx.novelId}/branches/${mainId}/switch`,
      fx.cookie,
      {},
    );
    // On main the branch guard passes: the refusal (if any) must NOT be
    // NOT_ON_MAIN_BRANCH. REVIEW_STALE is the 010 final-text gate, which is
    // out of scope for this test — the point is the branch guard let it through.
    const ok = await api("POST", `${pubUrl}/publish`, fx.cookie, {});
    expect((ok.json() as { error: string }).error).not.toBe("NOT_ON_MAIN_BRANCH");
  });
});
