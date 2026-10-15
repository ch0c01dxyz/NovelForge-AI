/**
 * Story versioning (M1, NF-WF-002) integration suite.
 *
 * Dedicated `novelforge_test_revision` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database, because what this task claims is a property of the DATABASE and
 * the transaction, not of the service: the head CAS under `FOR UPDATE`, the
 * rollback that leaves no revision, the rebuild-intent uniqueness, the
 * non-destructive restore.
 *
 * What this suite pins, and why each one is a property rather than a shape:
 *
 *  - **C8** — a novel created through the API has a head before any mutation.
 *    Asserted on the raw rows, not on the route's echo, because the promise is
 *    about what the transaction wrote.
 *  - **C3** — LOW and HIGH both advance the head; only HIGH captures a
 *    `PRE_MUTATION` checkpoint, pinned to the revision BEFORE the mutation.
 *  - **C4/C5** — the head CAS is a 409 with no partial write, proven with two
 *    real connections and a parked lock, not with `Promise.all` (Prisma
 *    serialises on one connection, so a `Promise.all` race passes without the
 *    guard).
 *  - **C6** — a rebuild intent is durable and a replay is a no-op.
 *  - **C7** — restore rewinds covered state, keeps later history readable, and
 *    never moves a PUBLISHED chapter's pointer.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load after trying the
 * repo-root `.env` — it does not silently skip.
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
import { advanceForMutation, createRevisionServices, readHeadRevisionId } from "./services/revisions.ts";
import { OPERATIONS, impactFor } from "@novelforge/story-versioning";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_revision";
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
/**
 * A second client, for the one test that needs two live connections. The head
 * CAS cannot be exercised on a single connection: Prisma queues the second
 * transaction behind the first, so the lock is never contended and a
 * `Promise.all` race would pass with the guard removed.
 */
let db2: NovelForgeDb;
let app: FastifyInstance;

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake", capabilities: ["chat"] }];
    },
    async generate() {
      return { content: "{}", model: "fake", inputTokens: 1, outputTokens: 1, finishReason: "stop" };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed(req) {
      return { vectors: req.input.map(() => []), model: "fake", inputTokens: req.input.length };
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
  db2 = createDb(TEST_URL);
  app = await buildApp(env, { db, createGateway: fakeCreateGateway });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  await db2?.$disconnect();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  // Versioning rows cascade from the novel, but delete explicitly so a
  // leftover row cannot make a count assertion pass for the wrong reason.
  await db.restoreOperation.deleteMany();
  await db.derivedRebuildIntent.deleteMany();
  await db.checkpoint.deleteMany();
  await db.snapshot.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonProposal.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.characterState.deleteMany();
  await db.character.deleteMany();
  await db.chapter.updateMany({ data: { currentVersionId: null } });
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelSettings.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Fixtures — created through the real API wherever the API is the thing under
// test. Only the pre-baseline novel is seeded raw, because its whole point is
// the row the API would have created.
// ---------------------------------------------------------------------------

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

async function addMember(
  workspaceId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER",
): Promise<void> {
  await db.membership.create({ data: { workspaceId, userId, role } });
}

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

/**
 * Workspace and novel through the API. `createNovel` is where C8's baseline
 * lives, so seeding the novel any other way would test a state the product
 * cannot produce.
 */
async function seedNovel(slug: string): Promise<Fixture> {
  const owner = await seedUser(`${slug}@example.com`);
  const ws = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: { cookie: owner.cookie },
    payload: { name: slug, slug },
  });
  expect(ws.statusCode, ws.body).toBe(201);
  const workspaceId = (ws.json() as { id: string }).id;

  const novel = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels`,
    headers: { cookie: owner.cookie },
    payload: { title: `Novel ${slug}`, slug },
  });
  expect(novel.statusCode, novel.body).toBe(201);
  return {
    cookie: owner.cookie,
    userId: owner.userId,
    workspaceId,
    novelId: (novel.json() as { id: string }).id,
  };
}

function novelUrl(f: Fixture, suffix: string): string {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${suffix}`;
}

async function createEntity(f: Fixture, name: string, kind = "CHARACTER"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/canon/entities"),
    headers: { cookie: f.cookie },
    payload: { kind, name },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

async function createFact(f: Fixture, entityId: string, predicate: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/canon/facts"),
    headers: { cookie: f.cookie },
    payload: { entityId, predicate, objectText: "true" },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

async function createCharacter(f: Fixture, key: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/characters"),
    headers: { cookie: f.cookie },
    payload: { key, name: key },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

async function createChapter(f: Fixture, title: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/chapters"),
    headers: { cookie: f.cookie },
    payload: { title },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

async function saveChapter(
  f: Fixture,
  chapterId: string,
  content: string,
  expectedVersion: number | null,
): Promise<{ version: number; wordCount: number }> {
  const res = await app.inject({
    method: "PUT",
    url: novelUrl(f, `/chapters/${chapterId}`),
    headers: { cookie: f.cookie },
    payload: { content, expectedVersion },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { version: number; wordCount: number };
}

async function createCheckpoint(
  f: Fixture,
  label: string,
  expectedHeadRevisionId?: string | null,
): Promise<{ checkpointId: string; revisionId: string; number: number; byteSize: number }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/checkpoints"),
    headers: { cookie: f.cookie },
    payload:
      expectedHeadRevisionId === undefined ? { label } : { label, expectedHeadRevisionId },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { checkpointId: string; revisionId: string; number: number; byteSize: number };
}

async function listRevisions(f: Fixture): Promise<
  { id: string; number: number; origin: string; checkpointId: string | null; changeSetItems: number }[]
> {
  const res = await app.inject({
    method: "GET",
    url: novelUrl(f, "/revisions"),
    headers: { cookie: f.cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { revisions: never[] }).revisions;
}

async function previewRestore(
  f: Fixture,
  checkpointId: string,
  scope = "FULL",
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/restores/preview"),
    headers: { cookie: f.cookie },
    payload: { checkpointId, scope },
  });
  return { statusCode: res.statusCode, body: jsonOf(res) };
}

async function applyRestore(
  f: Fixture,
  restoreOperationId: string,
): Promise<{ statusCode: number; body: never }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, `/restores/${restoreOperationId}/apply`),
    headers: { cookie: f.cookie },
  });
  return { statusCode: res.statusCode, body: res.json() as never };
}

async function listEntities(f: Fixture): Promise<{ id: string }[]> {
  const res = await app.inject({
    method: "GET",
    url: novelUrl(f, "/canon/entities"),
    headers: { cookie: f.cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { id: string }[];
}

async function listCharacters(f: Fixture): Promise<{ id: string }[]> {
  const res = await app.inject({
    method: "GET",
    url: novelUrl(f, "/characters"),
    headers: { cookie: f.cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { id: string }[];
}

/** The revision the branch head points at, read straight from the row. */
async function headRevision(f: Fixture): Promise<string | null> {
  const branch = await db.novelBranch.findUnique({
    where: { novelId_name: { novelId: f.novelId, name: "main" } },
    select: { headRevisionId: true },
  });
  return branch?.headRevisionId ?? null;
}

// ===========================================================================

describe("C8 baseline created with the novel", () => {
  it("gives a novel created through the API a main branch, a BASELINE revision and its change set", async () => {
    const f = await seedNovel("c8-baseline");

    const branch = await db.novelBranch.findUnique({
      where: { novelId_name: { novelId: f.novelId, name: "main" } },
      select: { id: true, headRevisionId: true },
    });
    expect(branch, "createNovel must write the branch in the novel's transaction").not.toBeNull();

    const revisions = await db.revision.findMany({
      where: { novelId: f.novelId },
      select: { id: true, number: true, origin: true, parentRevisionId: true, changeSet: { select: { id: true } } },
    });
    expect(revisions).toHaveLength(1);
    const baseline = revisions[0]!;
    expect(baseline.number).toBe(1);
    expect(baseline.origin).toBe("BASELINE");
    expect(baseline.parentRevisionId).toBeNull();
    // The change set is what makes the revision readable as "nothing changed";
    // a head with no change set would be a hole in the history.
    expect(baseline.changeSet, "the BASELINE revision carries an empty change set").not.toBeNull();
    expect(branch!.headRevisionId).toBe(baseline.id);

    // C8: the labeled baseline *checkpoint* is NOT created by the write path —
    // only an explicit authorized operation creates one.
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(0);
    expect(await db.snapshot.count({ where: { novelId: f.novelId } })).toBe(0);

    const listed = await listRevisions(f);
    expect(listed.map((r) => r.number)).toEqual([1]);
  });

  it("refuses a covered mutation on a novel with no baseline, naming the cause", async () => {
    // The pre-baseline novel is exactly the row a raw insert produces — the
    // migration's own shape before the backfill ran. This is the one fixture
    // that must NOT go through the API.
    const owner = await seedUser("pre-baseline@example.com");
    const ws = await db.workspace.create({
      data: { name: "pre-baseline", slug: "pre-baseline", ownerId: owner.userId },
    });
    await addMember(ws.id, owner.userId, "OWNER");
    const novel = await db.novel.create({
      data: { workspaceId: ws.id, title: "Pre-baseline", slug: "pre-baseline", createdById: owner.userId },
    });
    const f: Fixture = {
      cookie: owner.cookie,
      userId: owner.userId,
      workspaceId: ws.id,
      novelId: novel.id,
    };

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, "/checkpoints"),
      headers: { cookie: owner.cookie },
      payload: { label: "should refuse" },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toEqual({ error: "CONFLICT" });
    // "Naming the cause" is a property of the service error, not of the wire:
    // the app-wide handler deliberately sends a generic body (CLAUDE.md §15,
    // planning.test.ts header). Asserted where it lives.
    await expect(
      createRevisionServices({ db }).createCheckpoint({
        actorUserId: owner.userId,
        workspaceId: ws.id,
        novelId: novel.id,
        label: "should refuse",
      }),
    ).rejects.toThrow("no baseline exists for this novel");
    expect(await db.revision.count({ where: { novelId: novel.id } })).toBe(0);
  });
});

describe("C3 the mutation boundary", () => {
  it("advances the head on a LOW mutation and captures no checkpoint", async () => {
    const f = await seedNovel("c3-low");
    const before = await headRevision(f);

    await createEntity(f, "Aldric");

    const after = await headRevision(f);
    expect(after).not.toBe(before);
    const revisions = await listRevisions(f);
    // Newest first.
    expect(revisions[0]!.origin).toBe("MANUAL");
    expect(revisions[0]!.changeSetItems).toBe(1);
    expect(revisions[0]!.checkpointId).toBeNull();
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(0);
  });

  it("captures a PRE_MUTATION checkpoint on a HIGH mutation, pinned to the revision before it", async () => {
    const f = await seedNovel("c3-high");
    const entityId = await createEntity(f, "Aldric");
    const supersededFactId = await createFact(f, entityId, "is-king");

    // proposal.approve is HIGH (C3). Same subject and predicate as the live
    // fact but a different object, so the approval really supersedes one and
    // mints one: both covered tables (`canon_facts`, `canon_proposals`) change
    // in this operation, which is what the payload assertions below need.
    // `validFromChapter` is required on a superseding claim (the close point of
    // the old window) — without it the approve 409s by design.
    const proposed = await app.inject({
      method: "POST",
      url: novelUrl(f, "/canon/proposals"),
      headers: { cookie: f.cookie },
      payload: { entityId, predicate: "is-king", objectText: "the crown", validFromChapter: 5 },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = (proposed.json() as { id: string }).id;

    // Creating the proposal is itself a covered mutation (canon_proposals is
    // in C1), so the head the approval must pin is the one AFTER it, not the
    // one read before. Capturing earlier would compare against a revision the
    // approval never saw.
    const headBeforeApprove = (await headRevision(f))!;
    const numberBefore = (await listRevisions(f))[0]!.number;

    const approved = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/canon/proposals/${proposalId}/approve`,
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const checkpoints = await db.checkpoint.findMany({
      where: { novelId: f.novelId },
      select: { id: true, kind: true, revisionId: true, snapshotId: true },
    });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]!.kind).toBe("PRE_MUTATION");
    // C10 step 4: the pre-mutation image is the state the mutation is about to
    // change, so the checkpoint pins the revision BEFORE it, not the one the
    // approval created.
    expect(checkpoints[0]!.revisionId).toBe(headBeforeApprove);

    const snapshot = await db.snapshot.findUniqueOrThrow({
      where: { id: checkpoints[0]!.snapshotId },
      select: { revisionId: true, byteSize: true, formatVersion: true, payload: true },
    });
    expect(snapshot.revisionId).toBe(headBeforeApprove);
    expect(snapshot.formatVersion).toBe(1);
    expect(snapshot.byteSize).toBeGreaterThan(0);

    // THE PAYLOAD, not the bookkeeping (GAP-024). A checkpoint whose metadata
    // is right but whose image is post-mutation passes every assertion above
    // and still restores nothing — which is exactly how the defect survived a
    // green suite. `captureSnapshot` reads the live tables when it runs, so
    // these two assertions fail if the advance is moved back below the
    // supersede or below the status CAS.
    //
    // Both tables the operation writes, not just one: `canon_facts` is the
    // table the approval MINTS after the CAS, so a facts-only assertion passes
    // against the partial fix that advances between the supersede and the CAS.
    const payload = snapshot.payload as Record<string, { id: string; status: string }[]>;
    const facts = payload["canon_facts"] ?? [];
    const proposals = payload["canon_proposals"] ?? [];
    // Pre-mutation: one live fact, still ACTIVE, and it is the one the approval
    // is about to supersede. Post-mutation there would be two (the minted one
    // plus the closed one), and the minted id is not knowable before the call —
    // hence the count, which is the honest assertion.
    expect(facts.map((r) => r.id)).toEqual([supersededFactId]);
    expect(facts[0]!.status).toBe("ACTIVE");
    // Pre-mutation: the proposal is still undecided. Verified empirically
    // (partial-fix probe, advance moved after the supersede and the mint but
    // before the CAS): this pair PASSED there — the CAS writes `canon_proposals`
    // only after the advance in that shape, so the payload genuinely held the
    // pre-CAS row. The proposals pair confirms the operation touches the table;
    // it is not, by itself, the CAS-ordering assertion. What caught that shape
    // was the `canon_facts` pair above (the mint would be in the image) and
    // the `removed` count below.
    expect(proposals.map((r) => r.id)).toEqual([proposalId]);
    expect(proposals[0]!.status).toBe("PROPOSED");

    // And the checkpoint really undoes the approval: the minted fact is not in
    // the image, so the restore reports it as a row it will DELETE.
    const undo = await previewRestore(f, checkpoints[0]!.id);
    expect(undo.statusCode, JSON.stringify(undo.body)).toBe(201);
    const undoCounts = (undo.body as {
      preview: { counts: Record<string, { added: number; removed: number }> };
    }).preview.counts;
    expect(undoCounts["canon_facts"]!.removed).toBe(1);

    // The approval itself is the next revision, so the pin really is one back:
    // the newest revision carries NO checkpoint — the checkpoint hangs off the
    // revision it pins, which is now the second-newest.
    const after = await listRevisions(f);
    expect(after[0]!.number).toBe(numberBefore + 1);
    expect(after[0]!.checkpointId).toBeNull();
    expect(after[1]!.id).toBe(headBeforeApprove);
    expect(after[1]!.checkpointId).toBe(checkpoints[0]!.id);
  });

  it("refuses a mutation that touches an uncovered table, by name", async () => {
    const f = await seedNovel("c3-uncovered");
    const before = await headRevision(f);

    // The refusal lives in `advanceHead`, which every C3 service calls; the
    // transaction wrapper is the same one `withRevision` opens, so this is the
    // real path and not a re-implementation of it.
    await expect(
      db.$transaction((tx) =>
        advanceForMutation(tx, {
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          operation: "fact.create",
          origin: "MANUAL",
          actorUserId: f.userId,
          tables: ["novels"],
          items: [],
        }),
      ),
    ).rejects.toThrow(/outside story restore scope: novels/);

    expect(await headRevision(f)).toBe(before);
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(1);
  });

  it("leaves no revision and no moved head when the write fails after the revision insert", async () => {
    const f = await seedNovel("c3-rollback");
    const before = await headRevision(f);
    const countBefore = await db.revision.count({ where: { novelId: f.novelId } });

    // `ChangeSetItem_operation_valid` refuses the item, which happens AFTER
    // the revision and the head update inside the same transaction. That is
    // the only reachable failure point past the insert, and it is what proves
    // the revision is not committed independently of the mutation.
    await expect(
      db.$transaction((tx) =>
        advanceForMutation(tx, {
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          operation: "fact.create",
          origin: "MANUAL",
          actorUserId: f.userId,
          tables: ["canon_facts"],
          items: [
            {
              entityType: "CanonFact",
              entityId: "00000000-0000-4000-8000-00000000dead",
              operation: "SUPERSEDE" as never,
            },
          ],
        }),
      ),
    ).rejects.toThrow();

    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(countBefore);
    expect(await headRevision(f)).toBe(before);
  });

  it("records the change-log item for a singleton write with an explicit entity id", async () => {
    const f = await seedNovel("c3-singleton");
    // `planning_horizons` is keyed by novelId and has no `id` column, so the
    // call site must pass `entityId`; without one the write is refused rather
    // than logging a placeholder.
    const res = await app.inject({
      method: "PUT",
      url: novelUrl(f, "/planning/horizon"),
      headers: { cookie: f.cookie },
      payload: { policy: { bands: [{ maxDistance: 5, detail: "FULL" }, { maxDistance: null, detail: "VAGUE" }] } },
    });
    expect(res.statusCode, res.body).toBe(200);

    const items = await db.changeSetItem.findMany({
      where: { changeSet: { novelId: f.novelId } },
      select: { entityId: true, operation: true, entityType: true },
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.entityType).toBe("PlanningHorizon");
    // The novelId, not a placeholder — the singleton has no id of its own.
    expect(items[0]!.entityId).toBe(f.novelId);
    expect(items[0]!.operation).toBe("UPDATE");
  });
});

describe("C4/C5 the head CAS", () => {
  it("refuses a stale expected head with a 409 and no partial write", async () => {
    const f = await seedNovel("cas-stale");
    await createEntity(f, "Aldric");
    const head = (await headRevision(f))!;
    // A revision id that is real but not the head — the shape a client holds
    // after someone else's mutation landed.
    const other = (await listRevisions(f)).find((r) => r.id !== head)!.id;

    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, "/checkpoints"),
      headers: { cookie: f.cookie },
      payload: { label: "stale", expectedHeadRevisionId: other },
    });
    expect(res.statusCode, res.body).toBe(409);
    // The 409 carries the head observed at refusal (C4 recovery, NF-WF-002D):
    // the caller re-reads instead of retrying a plan built on a stale head.
    expect(res.json()).toEqual({ error: "CONFLICT", currentHeadRevisionId: head });
    // The cause lives on the service error; the wire body is deliberately
    // generic (CLAUDE.md §15).
    await expect(
      createRevisionServices({ db }).createCheckpoint({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        label: "stale",
        expectedHeadRevisionId: other,
      }),
    ).rejects.toThrow(/stale revision: expected/);

    // Nothing was written: no checkpoint, no new revision, head unchanged.
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(0);
    expect(await headRevision(f)).toBe(head);
  });

  it("serialises two connections on the branch lock and 409s the loser", async () => {
    const f = await seedNovel("cas-interleave");
    const start = (await headRevision(f))!;

    // Park transaction A holding the branch row lock. B cannot even reach its
    // comparison until A commits — which is the whole point of taking the lock
    // before reading the head. `Promise.all` would not prove this: Prisma
    // queues the second interactive transaction on the same client.
    //
    // A HIGH operation, so the loser's rollback has something to roll back: a
    // LOW advance captures no checkpoint, which would make "the loser records
    // no checkpoint" true for a reason that has nothing to do with the CAS.
    let aHasLock!: () => void;
    const aHasLockPromise = new Promise<void>((resolve) => {
      aHasLock = resolve;
    });
    let releaseA!: () => void;
    const releaseAPromise = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const txA = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT "id" FROM "novel_branches" WHERE "novel_id" = $1 AND "name" = 'main' FOR UPDATE`,
        f.novelId,
      );
      aHasLock();
      await releaseAPromise;
      return advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        operation: "proposal.approve",
        origin: "MANUAL",
        actorUserId: f.userId,
        expectedHeadRevisionId: start,
        tables: ["canon_facts", "canon_proposals"],
        items: [],
      });
    });
    await aHasLockPromise;

    const txB = db2.$transaction((tx) =>
      advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        operation: "proposal.approve",
        origin: "MANUAL",
        actorUserId: f.userId,
        expectedHeadRevisionId: start,
        tables: ["canon_facts", "canon_proposals"],
        items: [],
      }),
    );
    // B must still be blocked — if it settled now, the lock is not being taken
    // and the comparison below would be a coincidence, not a guarantee.
    const raced = await Promise.race([
      txB.then(
        () => "settled",
        () => "settled",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 300)),
    ]);
    expect(raced, "the second connection must wait on the branch lock").toBe("blocked");

    releaseA();
    const a = await txA;
    expect(a.number).toBeGreaterThan(1);

    // A's HIGH advance left exactly one checkpoint and snapshot; B's rejection
    // must leave those numbers alone, not add a second pair.
    const checkpointsAfterA = await db.checkpoint.count({ where: { novelId: f.novelId } });
    const snapshotsAfterA = await db.snapshot.count({ where: { novelId: f.novelId } });
    expect(checkpointsAfterA).toBe(1);
    expect(snapshotsAfterA).toBe(1);

    // A committed a new head; B's expectation is now stale, and it must say so
    // rather than advancing on top of A's revision.
    await expect(txB).rejects.toThrow(/stale revision/);
    expect(await headRevision(f)).toBe(a.revisionId);
    expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(2);
    // The loser's rollback removed its own checkpoint, snapshot and revision:
    // a decision that did not happen is not recorded as one that did (C4).
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(checkpointsAfterA);
    expect(await db.snapshot.count({ where: { novelId: f.novelId } })).toBe(snapshotsAfterA);
  }, 30_000);
});

describe("C6 durable rebuild intent", () => {
  it("commits an intent per affected projection with the mutation, and a replay is a no-op", async () => {
    const f = await seedNovel("c6-intent");
    const entityId = await createEntity(f, "Aldric");
    const factId = await createFact(f, entityId, "is-king");

    const intents = await db.derivedRebuildIntent.findMany({
      where: { novelId: f.novelId },
      select: { projection: true, sourceRevisionId: true, status: true },
    });
    // Both writes touched canon tables only.
    expect(intents.length).toBeGreaterThan(0);
    for (const intent of intents) {
      expect(intent.projection).toBe("canon");
      expect(intent.status).toBe("PENDING");
      // Not FRESH: a read of this projection is stale until a rebuild runs
      // (C6 "stale read policy").
      expect(intent.sourceRevisionId).not.toBeNull();
    }
    expect(factId).toBeTruthy();

    // Replay the same dispatch. `UNIQUE (projection, source_revision_id)` is
    // the whole of the idempotency, so the second delivery adds nothing.
    const before = intents.length;
    await db.derivedRebuildIntent.createMany({
      data: intents.map((i) => ({
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        projection: i.projection,
        sourceRevisionId: i.sourceRevisionId,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
    expect(await db.derivedRebuildIntent.count({ where: { novelId: f.novelId } })).toBe(before);
  });
});

describe("C7 restore", () => {
  it("rewinds canon and character state to the checkpoint and keeps later history readable", async () => {
    const f = await seedNovel("c7-e2e");

    // State at the boundary.
    const keptEntity = await createEntity(f, "Aldric");
    await createFact(f, keptEntity, "is-king");
    const checkpoint = await createCheckpoint(f, "before the divergence");
    const boundaryNumber = checkpoint.number;

    // Diverge: more canon, and a character that did not exist at the boundary.
    const extraEntity = await createEntity(f, "Betrayer");
    await createFact(f, extraEntity, "is-traitor");
    await createCharacter(f, "betrayer");

    expect((await listEntities(f)).length).toBe(2);
    expect((await listCharacters(f)).length).toBe(1);

    const preview = await previewRestore(f, checkpoint.checkpointId);
    expect(preview.statusCode, JSON.stringify(preview.body)).toBe(201);
    const p = preview.body as {
      restoreOperationId: string;
      preview: {
        counts: Record<string, { added: number; removed: number; retained: number }>;
        absentChapterIds: string[];
        outsideScope: { table: string }[];
      };
    };
    expect(p.preview.absentChapterIds).toEqual([]);
    // The rows the restore will destroy are the divergence — presented as
    // loss, because `change_set_items` store no before-image.
    expect(p.preview.counts["story_entities"]!.removed).toBe(1);
    expect(p.preview.counts["canon_facts"]!.removed).toBe(1);
    expect(p.preview.counts["characters"]!.removed).toBe(1);
    expect(p.preview.counts["story_entities"]!.retained).toBe(1);
    // Outside-scope tables are stated, not silently included.
    expect(p.preview.outsideScope.map((r) => r.table)).toContain("novels");

    const applied = await applyRestore(f, p.restoreOperationId);
    expect(applied.statusCode, JSON.stringify(applied.body)).toBe(200);
    expect((applied.body as { status: string }).status).toBe("APPLIED");

    // Read both back at the boundary.
    const entitiesAfter = await listEntities(f);
    expect(entitiesAfter.map((e) => e.id)).toEqual([keptEntity]);
    expect(await listCharacters(f)).toEqual([]);

    // Restore is non-destructive: every earlier revision is still readable,
    // and the restore itself is a new revision on top of them.
    const revisions = await listRevisions(f);
    const numbers = revisions.map((r) => r.number);
    // The shape, not a guessed count: newest first, strictly descending, no
    // number reused, and the boundary the checkpoint pinned is still there.
    // Asserting `boundaryNumber + 4` would make this a lie the first time an
    // unrelated mutation lands inside the window.
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toContain(boundaryNumber);
    const restoreRevision = revisions.find((r) => r.origin === "RESTORE");
    expect(restoreRevision, "the restore is recorded as its own revision").toBeDefined();
    expect(restoreRevision!.id).toBe((applied.body as { revisionId: string }).revisionId);
    // A rewind that did not become the head would not be recoverable history.
    expect(restoreRevision!.id).toBe(revisions[0]!.id);
  }, 30_000);

  it("skips a PUBLISHED chapter's pointer, surfaces it, and still succeeds", async () => {
    const f = await seedNovel("c7-published");
    const chapterId = await createChapter(f, "Chapter One");
    const v1 = await saveChapter(f, chapterId, "first draft", null);
    const checkpoint = await createCheckpoint(f, "pins the first draft");

    // Move the chapter forward and publish it, so the checkpoint's pinned
    // pointer and the live one disagree on a PUBLISHED chapter.
    // NF-WF-010: the setStatus gate needs a PASS review receipt for the
    // current version before any transition out of DRAFT.
    const v2 = await saveChapter(f, chapterId, "second draft", v1.version);
    const currentVersion = await db.chapterVersion.findFirstOrThrow({
      where: { chapterId },
      orderBy: { number: "desc" },
    });
    const reviewed = await app.inject({
      method: "POST",
      url: novelUrl(f, `/chapters/${chapterId}/final-text-review`),
      headers: { cookie: f.cookie },
      payload: { chapterVersionId: currentVersion.id },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    const published = await app.inject({
      method: "PATCH",
      url: novelUrl(f, `/chapters/${chapterId}/status`),
      headers: { cookie: f.cookie },
      payload: { status: "PUBLISHED" },
    });
    expect(published.statusCode, published.body).toBe(200);

    // Read the live pointer before the restore so the assertion after it is a
    // real comparison.
    const beforeRestore = await db.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      select: { currentVersionId: true },
    });
    const pointerBeforeRestore = beforeRestore.currentVersionId;

    const preview = await previewRestore(f, checkpoint.checkpointId);
    expect(preview.statusCode, JSON.stringify(preview.body)).toBe(201);
    const body = preview.body as {
      restoreOperationId: string;
      preview: {
        publishedPointerConflicts: { chapterId: string; number: number }[];
        pointerChanges: { chapterId: string }[];
      };
    };
    expect(body.preview.publishedPointerConflicts.map((c) => c.chapterId)).toEqual([chapterId]);
    // Not a failure, and not a silent skip: it is a reported conflict and it
    // is NOT in the list of pointers the restore will move.
    expect(body.preview.pointerChanges.map((c) => c.chapterId)).not.toContain(chapterId);

    const applied = await applyRestore(f, body.restoreOperationId);
    expect(applied.statusCode, JSON.stringify(applied.body)).toBe(200);
    expect(
      (applied.body as { publishedPointerConflicts: { chapterId: string }[] })
        .publishedPointerConflicts.map((c) => c.chapterId),
    ).toEqual([chapterId]);

    // One published chapter must not block recovery of the whole story, and
    // its pointer must not have moved. The pointer is read before the restore
    // and compared after — asserting it against a value read *after* would
    // pass whatever the restore did.
    const live = await db.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      select: { currentVersionId: true, status: true },
    });
    expect(live.status).toBe("PUBLISHED");
    expect(live.currentVersionId, "the second draft is still the live version").not.toBeNull();
    expect(live.currentVersionId).toBe(pointerBeforeRestore);
    // And the live version really is v2, so "unchanged" is not "unchanged at
    // the version the checkpoint pinned".
    const liveVersion = await db.chapterVersion.findUniqueOrThrow({
      where: { id: live.currentVersionId! },
      select: { number: true, content: true },
    });
    expect(liveVersion.number).toBe(v2.version);
    expect(liveVersion.content).toBe("second draft");
    // The restore's change set records the skipped pointer rather than
    // dropping it.
    const restoreRevision = await db.revision.findFirstOrThrow({
      where: { novelId: f.novelId, origin: "RESTORE" },
      select: { changeSet: { select: { items: { select: { entityType: true, entityId: true } } } } },
    });
    expect(
      restoreRevision.changeSet!.items.some(
        (i) => i.entityType === "Chapter" && i.entityId === chapterId,
      ),
    ).toBe(true);
  }, 30_000);

  it("accepts a selective restore preview (020A lifts the M1 refusal)", async () => {
    const f = await seedNovel("c7-selective");
    await createEntity(f, "Aldric");
    const checkpoint = await createCheckpoint(f, "boundary");

    // DOMAIN without a domain is 400 (selection required), not a 409 refusal.
    const noSelection = await previewRestore(f, checkpoint.checkpointId, "DOMAIN");
    expect(noSelection.statusCode, JSON.stringify(noSelection.body)).toBe(400);

    // DOMAIN with a selection previews successfully.
    const res = await app.inject({
      method: "POST",
      url: novelUrl(f, "/restores/preview"),
      headers: { cookie: f.cookie },
      payload: {
        checkpointId: checkpoint.checkpointId,
        scope: "DOMAIN",
        selection: { domain: "canon" },
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = jsonOf(res) as {
      preview: { selection: { scope: string; domain: string; tables: string[] } };
    };
    expect(body.preview.selection.scope).toBe("DOMAIN");
    expect(body.preview.selection.domain).toBe("canon");
    expect(body.preview.selection.tables).toContain("canon_facts");
  });

  it("refuses an unknown checkpoint id with a 404", async () => {
    const f = await seedNovel("c7-unknown");
    const preview = await previewRestore(f, "00000000-0000-4000-8000-0000000000ff");
    expect(preview.statusCode, JSON.stringify(preview.body)).toBe(404);
  });

  describe("chapter identity", () => {
    /**
     * A chapter that existed at the boundary and is gone at apply time. Both
     * shapes are refused: the number re-used by an unrelated chapter, and the
     * number left free. Re-inserting scenes/outline_nodes for the missing
     * chapter would otherwise surface as an unmapped 500 (C7).
     */
    async function divergedChapter(slug: string, reuseNumber: boolean) {
      const f = await seedNovel(slug);
      const chapterId = await createChapter(f, "Chapter One");
      await saveChapter(f, chapterId, "draft", null);
      const checkpoint = await createCheckpoint(f, "boundary");

      const removed = await app.inject({
        method: "DELETE",
        url: novelUrl(f, `/chapters/${chapterId}`),
        headers: { cookie: f.cookie },
      });
      expect(removed.statusCode, removed.body).toBe(200);

      if (reuseNumber) {
        // A new chapter takes the number the deleted one held.
        await createChapter(f, "Chapter One");
      }
      return { f, chapterId, checkpoint };
    }

    it("refuses at apply when the payload chapter id is gone and its number was re-used", async () => {
      const { f, chapterId, checkpoint } = await divergedChapter("c7-reuse", true);
      const preview = await previewRestore(f, checkpoint.checkpointId);
      expect(preview.statusCode, JSON.stringify(preview.body)).toBe(201);
      const p = preview.body as {
        restoreOperationId: string;
        preview: { absentChapterIds: string[]; chapterNumberReuse: { payloadChapterId: string }[] };
      };
      // Preview surfaces it before the author commits — a 201 that names the
      // problem, so the refusal is never a surprise at apply time.
      expect(p.preview.absentChapterIds).toContain(chapterId);
      expect(p.preview.chapterNumberReuse.map((r) => r.payloadChapterId)).toContain(chapterId);

      const applied = await applyRestore(f, p.restoreOperationId);
      expect(applied.statusCode, JSON.stringify(applied.body)).toBe(409);
      expect(applied.body).toEqual({ error: "CONFLICT" });
      // The named cause is asserted on the service error; the wire body is
      // generic by design (CLAUDE.md §15).
      await expect(
        createRevisionServices({ db }).applyRestore({
          actorUserId: f.userId,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          restoreOperationId: p.restoreOperationId,
        }),
      ).rejects.toThrow(`chapter identity conflict: chapter ${chapterId} is gone`);
    }, 30_000);

    it("refuses at apply when the payload chapter id is gone and its number is free", async () => {
      const { f, chapterId, checkpoint } = await divergedChapter("c7-freenumber", false);
      const preview = await previewRestore(f, checkpoint.checkpointId);
      expect(preview.statusCode, JSON.stringify(preview.body)).toBe(201);
      const p = preview.body as {
        restoreOperationId: string;
        preview: { absentChapterIds: string[]; chapterNumberReuse: unknown[] };
      };
      expect(p.preview.absentChapterIds).toContain(chapterId);
      expect(p.preview.chapterNumberReuse).toEqual([]);

      const applied = await applyRestore(f, p.restoreOperationId);
      // Not a silent skip: a free number is the same refusal as a re-used one.
      expect(applied.statusCode, JSON.stringify(applied.body)).toBe(409);
      expect(applied.body).toEqual({ error: "CONFLICT" });
      // The named cause is asserted on the service error; the wire body is
      // generic by design (CLAUDE.md §15).
      await expect(
        createRevisionServices({ db }).applyRestore({
          actorUserId: f.userId,
          workspaceId: f.workspaceId,
          novelId: f.novelId,
          restoreOperationId: p.restoreOperationId,
        }),
      ).rejects.toThrow(`chapter identity conflict: chapter ${chapterId} is gone`);
    }, 30_000);
  });

  it("refuses an apply against a head that moved since the preview", async () => {
    const f = await seedNovel("c7-moved");
    await createEntity(f, "Aldric");
    const checkpoint = await createCheckpoint(f, "boundary");
    const preview = await previewRestore(f, checkpoint.checkpointId);
    expect(preview.statusCode).toBe(201);
    const opId = (preview.body as { restoreOperationId: string }).restoreOperationId;

    // Someone mutates after the preview: the plan is now built on a stale head
    // and is recomputed by the author, never applied blind.
    await createEntity(f, "Interloper");

    const applied = await applyRestore(f, opId);
    expect(applied.statusCode, JSON.stringify(applied.body)).toBe(409);
    // The observed head is the one after the interloper's mutation, not the
    // preview's pinned head — the caller needs the current value to re-read.
    expect(applied.body).toEqual({
      error: "CONFLICT",
      currentHeadRevisionId: await headRevision(f),
    });
    await expect(
      createRevisionServices({ db }).applyRestore({
        actorUserId: f.userId,
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        restoreOperationId: opId,
      }),
    ).rejects.toThrow(/stale revision/);
  });
});

describe("authorization", () => {
  it("answers a non-member with a 404, not a 403 — no cross-tenant existence leak", async () => {
    const f = await seedNovel("authz-outsider");
    const outsider = await seedUser("outsider@example.com");

    const res = await app.inject({
      method: "GET",
      url: novelUrl(f, "/revisions"),
      headers: { cookie: outsider.cookie },
    });
    expect(res.statusCode, res.body).toBe(404);
  });

  it("lets an EDITOR read revision history but not create a checkpoint", async () => {
    const f = await seedNovel("authz-editor");
    await createEntity(f, "Aldric");
    const editor = await seedUser("editor@example.com");
    await addMember(f.workspaceId, editor.userId, "EDITOR");

    const read = await app.inject({
      method: "GET",
      url: novelUrl(f, "/revisions"),
      headers: { cookie: editor.cookie },
    });
    expect(read.statusCode, read.body).toBe(200);

    // Rewinding story state is the author's act, not the continuity
    // reviewer's — EDITOR holds revision:read and NOT revision:manage.
    const write = await app.inject({
      method: "POST",
      url: novelUrl(f, "/checkpoints"),
      headers: { cookie: editor.cookie },
      payload: { label: "editor checkpoint" },
    });
    expect(write.statusCode, write.body).toBe(403);
    expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(0);
  });

  it("lets a VIEWER read neither revision history nor a checkpoint", async () => {
    const f = await seedNovel("authz-viewer");
    const viewer = await seedUser("viewer@example.com");
    await addMember(f.workspaceId, viewer.userId, "VIEWER");

    const res = await app.inject({
      method: "GET",
      url: novelUrl(f, "/revisions"),
      headers: { cookie: viewer.cookie },
    });
    expect(res.statusCode, res.body).toBe(403);
  });
});

describe("history reads", () => {
  it("lists a checkpoint with the revision it pins and its snapshot size", async () => {
    const f = await seedNovel("history-list");
    await createEntity(f, "Aldric");
    const created = await createCheckpoint(f, "named boundary", await headRevision(f));

    const res = await app.inject({
      method: "GET",
      url: novelUrl(f, "/checkpoints"),
      headers: { cookie: f.cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = (res.json() as {
      checkpoints: { id: string; label: string; revisionId: string; revisionNumber: number; byteSize: number }[];
    }).checkpoints;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(created.checkpointId);
    expect(rows[0]!.label).toBe("named boundary");
    expect(rows[0]!.revisionId).toBe(created.revisionId);
    expect(rows[0]!.revisionNumber).toBe(created.number);
    expect(rows[0]!.byteSize).toBe(created.byteSize);
  });

  it("404s a checkpoint id that does not belong to the novel", async () => {
    const f = await seedNovel("history-404");
    const res = await app.inject({
      method: "GET",
      url: novelUrl(f, "/checkpoints/00000000-0000-4000-8000-0000000000ff"),
      headers: { cookie: f.cookie },
    });
    expect(res.statusCode, res.body).toBe(404);
  });

  it("reuses one snapshot when a HIGH checkpoint pins a revision that already has one", async () => {
    const f = await seedNovel("history-reuse");
    const entityId = await createEntity(f, "Aldric");
    await createFact(f, entityId, "is-king");

    // Two checkpoints cannot pin one revision through the public surface:
    // every explicit capture creates its own revision. Reuse is reached by the
    // OTHER writer — a HIGH mutation, whose PRE_MUTATION checkpoint pins the
    // head it is about to change. Here that head is the revision the explicit
    // checkpoint created, so the capture must reuse its snapshot rather than
    // collide on `UNIQUE (snapshots.revision_id)`.
    const proposed = await app.inject({
      method: "POST",
      url: novelUrl(f, "/canon/proposals"),
      headers: { cookie: f.cookie },
      payload: { entityId, predicate: "wields", objectText: "the crown" },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = (proposed.json() as { id: string }).id;

    const explicit = await createCheckpoint(f, "boundary");
    const approved = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/canon/proposals/${proposalId}/approve`,
      headers: { cookie: f.cookie },
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const checkpoints = await db.checkpoint.findMany({
      where: { novelId: f.novelId },
      select: { id: true, kind: true, revisionId: true, snapshotId: true },
      orderBy: { createdAt: "asc" },
    });
    expect(checkpoints.map((c) => c.kind).sort()).toEqual(["MANUAL", "PRE_MUTATION"]);
    // Both pin the same revision, and that revision has exactly one snapshot.
    expect(new Set(checkpoints.map((c) => c.revisionId)).size).toBe(1);
    expect(checkpoints[0]!.revisionId).toBe(explicit.revisionId);
    expect(new Set(checkpoints.map((c) => c.snapshotId)).size).toBe(1);
    expect(await db.snapshot.count({ where: { novelId: f.novelId } })).toBe(1);
  });
});

describe("isolation", () => {
  it("scopes a restore to its own novel", async () => {
    const a = await seedNovel("iso-a");
    const b = await seedNovel("iso-b");
    await createEntity(a, "A-entity");
    await createEntity(b, "B-entity");
    const checkpointA = await createCheckpoint(a, "a boundary");

    // A checkpoint id from A is not addressable under B, even by a member of
    // both workspaces.
    await addMember(b.workspaceId, a.userId, "OWNER");
    const preview = await previewRestore(b, checkpointA.checkpointId);
    expect(preview.statusCode, JSON.stringify(preview.body)).toBe(404);

    // And B's own state is untouched by A's checkpoint.
    expect((await listEntities(b)).length).toBe(1);
  });

  it("keeps a novel's revisions out of another novel's history", async () => {
    const a = await seedNovel("iso-hist-a");
    const b = await seedNovel("iso-hist-b");
    await createEntity(a, "A-entity");
    expect((await listRevisions(a)).length).toBe(2);
    // B still has only its baseline.
    expect((await listRevisions(b)).length).toBe(1);
    expect(await db.revision.count({ where: { novelId: a.novelId } })).toBe(2);
    expect(await db.revision.count({ where: { novelId: b.novelId } })).toBe(1);
    expect(await readHeadRevisionId(db, b.novelId)).not.toBeNull();
  });
});

// ===========================================================================
// NF-WF-002D — the client head expectation on the four HIGH mutation routes.
//
// C12.1 froze a tri-state (`undefined` asserts nothing, `null` asserts "no head
// exists yet", a uuid compares) and C4 requires recovery by re-read. GAP-022
// recorded that NO mutation route accepted a client expectation, so the
// guarantee was unreachable for callers. Every case below is written from
// §C12.1, not from the implementation.
// ===========================================================================

interface HighRouteCase {
  /** Slug-safe id, for unique fixture names. */
  slug: string;
  operation: string;
  /** Prepare state, then return the callable that sends the mutation. */
  setup(f: Fixture): Promise<{
    head: string;
    /** `undefined` omits the field entirely; `null` sends the explicit null. */
    send(expectation?: string | null): Promise<{ statusCode: number; body: unknown }>;
    /** A row count that only changes when the mutation commits. */
    committedRows(): Promise<number>;
  }>;
}

/**
 * Parse a response body, tolerating the empty one a 204 carries — supersede
 * returns 204 by contract, and `res.json()` throws on an empty payload.
 */
function jsonOf(res: { body: string }): unknown {
  return res.body ? JSON.parse(res.body) : null;
}

const HIGH_ROUTE_CASES: HighRouteCase[] = [
  {
    slug: "proposal-approve",
    operation: "proposal.approve",
    async setup(f) {
      const entityId = await createEntity(f, "Aldric");
      await createFact(f, entityId, "is-king");
      const proposed = await app.inject({
        method: "POST",
        url: novelUrl(f, "/canon/proposals"),
        headers: { cookie: f.cookie },
        payload: { entityId, predicate: "is-king", objectText: "the crown", validFromChapter: 5 },
      });
      expect(proposed.statusCode, proposed.body).toBe(201);
      const proposalId = (proposed.json() as { id: string }).id;
      return {
        head: (await headRevision(f))!,
        send: async (expectation) => {
          const res = await app.inject({
            method: "POST",
            url: `/api/workspaces/${f.workspaceId}/canon/proposals/${proposalId}/approve`,
            headers: { cookie: f.cookie },
            payload: expectation === undefined ? {} : { expectedHeadRevisionId: expectation },
          });
          return { statusCode: res.statusCode, body: jsonOf(res) };
        },
        // Approving mints one fact and supersedes one, so the TOTAL count
        // moves while the ACTIVE count does not — the total is the honest one.
        committedRows: () => db.canonFact.count({ where: { novelId: f.novelId } }),
      };
    },
  },
  {
    slug: "outline-approve",
    operation: "outlineVersion.approve",
    async setup(f) {
      const draft = await app.inject({
        method: "POST",
        url: novelUrl(f, "/planning/outline-versions"),
        headers: { cookie: f.cookie },
        payload: { content: { nodes: [] } },
      });
      expect(draft.statusCode, draft.body).toBe(201);
      const versionId = (draft.json() as { id: string }).id;
      return {
        head: (await headRevision(f))!,
        send: async (expectation) => {
          const res = await app.inject({
            method: "POST",
            url: novelUrl(f, `/planning/outline-versions/${versionId}/approve`),
            headers: { cookie: f.cookie },
            payload: expectation === undefined ? {} : { expectedHeadRevisionId: expectation },
          });
          return { statusCode: res.statusCode, body: jsonOf(res) };
        },
        committedRows: () =>
          db.outlineVersion.count({ where: { novelId: f.novelId, status: "APPROVED" } }),
      };
    },
  },
  {
    slug: "outline-supersede",
    operation: "outline.supersede",
    async setup(f) {
      const draft = await app.inject({
        method: "POST",
        url: novelUrl(f, "/planning/outline-versions"),
        headers: { cookie: f.cookie },
        payload: { content: { nodes: [] } },
      });
      expect(draft.statusCode, draft.body).toBe(201);
      const versionId = (draft.json() as { id: string }).id;
      // Approve first so the supersede has something to supersede. The
      // approval moves the head, so the expectation under test is the head
      // AFTER it — capturing earlier would compare against a revision the
      // supersede never saw.
      const approved = await app.inject({
        method: "POST",
        url: novelUrl(f, `/planning/outline-versions/${versionId}/approve`),
        headers: { cookie: f.cookie },
        payload: {},
      });
      expect(approved.statusCode, approved.body).toBe(200);
      return {
        head: (await headRevision(f))!,
        send: async (expectation) => {
          const res = await app.inject({
            method: "POST",
            url: novelUrl(f, "/planning/outline-versions/supersede"),
            headers: { cookie: f.cookie },
            payload: expectation === undefined ? {} : { expectedHeadRevisionId: expectation },
          });
          return { statusCode: res.statusCode, body: jsonOf(res) };
        },
        committedRows: () =>
          db.outlineVersion.count({ where: { novelId: f.novelId, status: "SUPERSEDED" } }),
      };
    },
  },
  {
    slug: "chapters-import",
    operation: "chapters.import",
    async setup(f) {
      return {
        head: (await headRevision(f))!,
        send: async (expectation) => {
          const res = await app.inject({
            method: "POST",
            url: novelUrl(f, "/chapters/import"),
            headers: { cookie: f.cookie },
            payload: {
              text: "# Chapter One\nsome prose",
              format: "md",
              ...(expectation === undefined ? {} : { expectedHeadRevisionId: expectation }),
            },
          });
          return { statusCode: res.statusCode, body: jsonOf(res) };
        },
        committedRows: () => db.chapter.count({ where: { novelId: f.novelId } }),
      };
    },
  },
];

for (const route of HIGH_ROUTE_CASES) {
  describe(`head expectation on ${route.operation}`, () => {
    it("commits when the expectation matches the head", async () => {
      const f = await seedNovel(`head-${route.slug}-match`);
      const r = await route.setup(f);
      const before = await r.committedRows();

      const res = await r.send(r.head);
      expect(res.statusCode, JSON.stringify(res.body)).toBeLessThan(300);
      expect(await r.committedRows()).toBe(before + 1);
      expect(await headRevision(f)).not.toBe(r.head);
    });

    it("commits when the expectation is omitted, exactly as before", async () => {
      const f = await seedNovel(`head-${route.slug}-omitted`);
      const r = await route.setup(f);
      const before = await r.committedRows();

      const res = await r.send(undefined);
      expect(res.statusCode, JSON.stringify(res.body)).toBeLessThan(300);
      expect(await r.committedRows()).toBe(before + 1);
    });

    it("409s a plan built on a stale head, writes nothing, and names the observed head", async () => {
      const f = await seedNovel(`head-${route.slug}-stale`);
      const r = await route.setup(f);
      const staleHead = r.head;
      const before = await r.committedRows();

      // The scenario the whole requirement exists for: the plan was built
      // against R_n, someone else's mutation landed, and the plan is now
      // applied blind. It must refuse and tell the caller what the head is.
      await createEntity(f, "Interloper");
      const currentHead = (await headRevision(f))!;
      expect(currentHead).not.toBe(staleHead);

      const res = await r.send(staleHead);
      expect(res.statusCode, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toEqual({
        error: "CONFLICT",
        currentHeadRevisionId: currentHead,
      });
      // No partial write: the covered rows the mutation would have changed are
      // untouched, and so is the head.
      expect(await r.committedRows()).toBe(before);
      expect(await headRevision(f)).toBe(currentHead);
    });

    it("409s an explicit null against a baselined novel, and names the head", async () => {
      const f = await seedNovel(`head-${route.slug}-null`);
      const r = await route.setup(f);
      const before = await r.committedRows();

      // §C12.1: `null` asserts "no head exists yet". A novel created through
      // the API always has a BASELINE head (C8) — observed by reading the
      // branch row, not assumed — so this is a mismatch, and collapsing null
      // into `undefined` here is the bug the tri-state exists to prevent.
      expect(await headRevision(f)).toBe(r.head);

      const res = await r.send(null);
      expect(res.statusCode, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toEqual({
        error: "CONFLICT",
        currentHeadRevisionId: r.head,
      });
      expect(await r.committedRows()).toBe(before);
      expect(await headRevision(f)).toBe(r.head);
    });

    it("400s a malformed expectation rather than treating it as an assertion", async () => {
      const f = await seedNovel(`head-${route.slug}-malformed`);
      const r = await route.setup(f);
      const before = await r.committedRows();

      const res = await r.send("not-a-uuid");
      expect(res.statusCode, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toEqual({ error: "INVALID_INPUT" });
      expect(await r.committedRows()).toBe(before);
    });
  });
}

/**
 * Park a second connection that has already moved the head inside its own
 * uncommitted transaction, then return a waiter for "the request's transaction
 * is now blocked on a lock". The route's unlocked pre-check reads the last
 * COMMITTED head and passes; its transaction then blocks, and the locked
 * comparison is what finally refuses. A pre-check-only implementation commits
 * here — so this is the probe that the locked CAS is load-bearing rather than
 * decorative.
 *
 * The waiter reads PostgreSQL, not a timer: a sleep would pass whether or not
 * the lock was taken. The parking transaction is idle-in-transaction (blocked
 * on a JS promise, `wait_event_type = 'Client'`), so it cannot match itself.
 * The match is pinned to the parking backend by `pg_blocking_pids`: a lock
 * waiter blocked by anyone else (a pool peer, another file's transaction) does
 * not count, so the probe cannot proceed before the request is actually parked.
 */
function parkHeadMove(f: Fixture): {
  ready: () => Promise<void>;
  movedHead: () => string;
  release: () => Promise<void>;
  waitForBlocked: () => Promise<{ blocked: boolean; seen: string }>;
} {
  let locked!: () => void;
  const lockedP = new Promise<void>((resolve) => {
    locked = resolve;
  });
  let release!: () => void;
  const releaseP = new Promise<void>((resolve) => {
    release = resolve;
  });
  let movedHead = "";
  let parkingPid = 0;

  // The parking transaction must outlive the poll below; Prisma's 5s default
  // interactive-transaction budget would expire mid-wait and surface as a
  // commit error instead of the contention this exists to create. `chapter.create`
  // is LOW, so it contributes one revision and no checkpoint/snapshot.
  const txB = db2.$transaction(
    async (tx) => {
      const [me] = await tx.$queryRawUnsafe<{ pid: number }[]>(
        `SELECT pg_backend_pid() AS pid`,
      );
      parkingPid = me!.pid;
      const advanced = await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        operation: "chapter.create",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["chapters"],
        items: [],
      });
      movedHead = advanced.revisionId;
      locked();
      await releaseP;
    },
    { timeout: 30_000 },
  );

  return {
    async ready() {
      await lockedP;
    },
    movedHead: () => movedHead,
    async release() {
      release();
      await txB;
    },
    async waitForBlocked() {
      let seen = "";
      // 3s, deliberately under the request transaction's Prisma default (5s):
      // if the request never parks, this must give up and release while the
      // loser is still alive, so the failure reads as `blocked === false` and
      // not as a 500 from an expired transaction. A genuine park is observed on
      // the first iteration — the request blocks within a millisecond of send.
      for (let i = 0; i < 60; i++) {
        const rows = await db.$queryRawUnsafe<
          {
            pid: number;
            state: string | null;
            wait_event_type: string | null;
            blockers: number[] | null;
            query: string;
          }[]
        >(
          `SELECT pid, state, wait_event_type, pg_blocking_pids(pid) AS blockers, query
             FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()`,
        );
        seen = JSON.stringify(rows);
        // Only the request blocked BY the parking backend counts. A waiter
        // blocked by anything else is not this probe's transaction.
        if (
          rows.some(
            (r) => r.wait_event_type === "Lock" && (r.blockers ?? []).includes(parkingPid),
          )
        ) {
          return { blocked: true, seen };
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { blocked: false, seen };
    },
  };
}

describe("NF-WF-002D the locked CAS is load-bearing, not only the pre-check", () => {
  for (const route of HIGH_ROUTE_CASES) {
    it(`409s ${route.operation} when the head moves between the pre-check and the lock`, async () => {
      const f = await seedNovel(`head-locked-${route.slug}`);
      const r = await route.setup(f);
      const planHead = r.head;

      // Everything the loser must NOT touch, captured before the winner moves.
      const coveredBefore = await r.committedRows();
      const revisionsBefore = await db.revision.count({ where: { novelId: f.novelId } });
      const checkpointsBefore = await db.checkpoint.count({ where: { novelId: f.novelId } });
      const snapshotsBefore = await db.snapshot.count({ where: { novelId: f.novelId } });
      const intentsBefore = new Set(
        (
          await db.derivedRebuildIntent.findMany({
            where: { novelId: f.novelId },
            select: { sourceRevisionId: true },
          })
        ).map((i) => i.sourceRevisionId),
      );

      const park = parkHeadMove(f);
      await park.ready();
      const inflight = r.send(planHead);
      const { blocked, seen } = await park.waitForBlocked();
      const movedHead = park.movedHead();
      await park.release();
      const res = await inflight;

      expect(blocked, `no request transaction parked on a lock. pg_stat_activity: ${seen}`).toBe(
        true,
      );
      expect(res.statusCode, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toEqual({ error: "CONFLICT", currentHeadRevisionId: movedHead });

      // No partial write, and no loser side effect counted as the winner's:
      // exactly the winner's one revision, no checkpoint/snapshot (the winner
      // is LOW), and any new rebuild intent is attributed to the winner's
      // revision — a loser-owned intent would carry the rolled-back revision.
      expect(await r.committedRows()).toBe(coveredBefore);
      expect(await db.revision.count({ where: { novelId: f.novelId } })).toBe(revisionsBefore + 1);
      expect(await db.checkpoint.count({ where: { novelId: f.novelId } })).toBe(checkpointsBefore);
      expect(await db.snapshot.count({ where: { novelId: f.novelId } })).toBe(snapshotsBefore);
      const newIntents = (
        await db.derivedRebuildIntent.findMany({
          where: { novelId: f.novelId },
          select: { sourceRevisionId: true },
        })
      ).filter((i) => !intentsBefore.has(i.sourceRevisionId));
      for (const intent of newIntents) expect(intent.sourceRevisionId).toBe(movedHead);
      expect(await headRevision(f)).toBe(movedHead);
    }, 30_000);
  }
});

describe("NF-WF-002D authorization is never delegated to the expectation", () => {
  async function pendingProposal(f: Fixture): Promise<string> {
    const entityId = await createEntity(f, "Aldric");
    await createFact(f, entityId, "is-king");
    const proposed = await app.inject({
      method: "POST",
      url: novelUrl(f, "/canon/proposals"),
      headers: { cookie: f.cookie },
      payload: { entityId, predicate: "is-king", objectText: "the crown", validFromChapter: 5 },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    return (proposed.json() as { id: string }).id;
  }

  it("discloses no head to a non-member, even with a matching expectation", async () => {
    const f = await seedNovel("head-authz-outsider");
    const proposalId = await pendingProposal(f);
    const outsider = await seedUser("head-outsider@example.com");

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/canon/proposals/${proposalId}/approve`,
      headers: { cookie: outsider.cookie },
      payload: { expectedHeadRevisionId: await headRevision(f) },
    });
    // 404, and the body carries no head: the gate runs before any disclosure.
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("discloses no head to a member without the capability", async () => {
    const f = await seedNovel("head-authz-viewer");
    const proposalId = await pendingProposal(f);
    const viewer = await seedUser("head-viewer@example.com");
    await addMember(f.workspaceId, viewer.userId, "VIEWER");

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/canon/proposals/${proposalId}/approve`,
      headers: { cookie: viewer.cookie },
      payload: { expectedHeadRevisionId: await headRevision(f) },
    });
    expect(res.statusCode, res.body).toBe(403);
    expect(res.json()).toEqual({ error: "FORBIDDEN" });
  });
});

describe("NF-WF-002D coverage inventory", () => {
  it("covers every HIGH operation that has a mutation route", () => {
    // Derived from C3's own classification, not hand-listed, so it cannot
    // drift from `impactFor`. The invariant is the IMPLICATION — "every HIGH
    // operation that has a mutation route carries the expectation" — not the
    // equality "the routed set equals the HIGH set": some operations have
    // dedicated route suites or no route yet. New operations must be accounted
    // for explicitly rather than silently escaping this pinned inventory.
    const high = OPERATIONS.filter((op) => impactFor(op) === "HIGH");
    const routed = HIGH_ROUTE_CASES.map((c) => c.operation);
    for (const op of routed) expect(high, `${op} must be HIGH`).toContain(op);

    // `restore.apply` carries the server-pinned form and `checkpoint.create`
    // has its own client assertion. SCALE standing approval's mandatory head
    // pin, CAS and PRE_MUTATION rollback are covered in scale-decisions.test.ts.
    expect(high.filter((op) => !routed.includes(op)).sort()).toEqual([
      "ai.bulkRewrite",
      "branch.merge",
      "checkpoint.create",
      "outline.bulkRewrite",
      "restore.apply",
      "scale.standing.approve",
    ]);
  });
});
