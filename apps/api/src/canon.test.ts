/**
 * Story intelligence (Phase 6) integration suite.
 *
 * Dedicated novelforge_test_canon db (parallel-safe per ADR-0003 §8). Every
 * test drives the real HTTP surface against a real migrated database, because
 * the things this phase claims are properties of the DATABASE, not of the
 * service: the one-live-value-per-subject+predicate index, the four-statement
 * supersede order, and the check constraints. A service-level test with a
 * mocked repository would pass while all three were absent.
 *
 * Covers the roadmap exit criterion and the mandatory TESTING.md scenario:
 * - canon is created, read back, and one live value is enforced by the DB
 * - a conflicting proposal is NOT silently committed (TESTING.md:20)
 * - approval supersedes non-destructively, and history reconstructs
 * - evidence must resolve to a real span in an immutable revision
 * - the Story Brain answers FACT/STATE with evidence, and returns an explicit
 *   not-implemented marker for the forms slice 2 owns
 * - the spoiler boundary withholds by reader position, counted not assumed
 * - tenant isolation is a 404 on every route shape
 * - capabilities: EDITOR reads canon but cannot approve it
 *
 * No test reaches a provider: the story brain's structured legs issue no
 * model call at all.
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

const TEST_DB = "novelforge_test_canon";
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
  // Canon rows cascade from novels, but delete explicitly so a leftover row
  // cannot make a uniqueness assertion pass for the wrong reason.
  await db.canonFactSource.deleteMany();
  await db.canonProposal.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.retrievalAudit.deleteMany();
  await db.generation.deleteMany();
  await db.$executeRawUnsafe(`DELETE FROM embeddings`);
  await db.$executeRawUnsafe(`DELETE FROM chunks`);
  await db.reference.updateMany({ data: { currentVersionId: null } });
  await db.referenceVersion.deleteMany();
  await db.reference.deleteMany();
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
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: `Novel ${slug}`, slug, createdById: ownerId },
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

/** Create an entity through the API and return its id. */
async function createEntity(
  cookie: string,
  workspaceId: string,
  novelId: string,
  name: string,
  kind = "CHARACTER",
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
    headers: { cookie },
    payload: { kind, name },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

async function createFact(
  cookie: string,
  workspaceId: string,
  novelId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts`,
    headers: { cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function propose(
  cookie: string,
  workspaceId: string,
  novelId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/proposals`,
    headers: { cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function approve(
  cookie: string,
  workspaceId: string,
  proposalId: string,
  payload: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/canon/proposals/${proposalId}/approve`,
    headers: { cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function ask(
  cookie: string,
  workspaceId: string,
  novelId: string,
  question: Record<string, unknown>,
  query: Record<string, string> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const qs = new URLSearchParams(query).toString();
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/story-brain/ask${qs ? `?${qs}` : ""}`,
    headers: { cookie },
    payload: question,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function retract(
  cookie: string,
  workspaceId: string,
  novelId: string,
  factId: string,
  payload: Record<string, unknown> = {},
): Promise<{ statusCode: number }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts/${factId}/retract`,
    headers: { cookie },
    payload,
  });
  return { statusCode: res.statusCode };
}

describe("canon facts and the one-live-value invariant", () => {
  it("creates a fact, reads it back with its subject key, and refuses a second live value", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const first = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    expect(first.statusCode, JSON.stringify(first.body)).toBe(201);

    // The conflict rule is enforced by canon_facts_live, not by a read-then-
    // write check — so this is a 409 even though nothing pre-checked it.
    const second = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
    });
    expect(second.statusCode).toBe(409);

    const list = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=AUTHOR`,
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    const facts = (list.json() as { facts: Array<Record<string, unknown>> }).facts;
    expect(facts).toHaveLength(1);
    expect(facts[0]!.objectText).toBe("black");
    expect(facts[0]!.status).toBe("ACTIVE");
  });

  it("renders a statement from display names, never machine keys or uuids", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const ling = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");
    const wei = await createEntity(owner.cookie, workspaceId, novelId, "Wei Zhao");

    // Literal object.
    await createFact(owner.cookie, workspaceId, novelId, {
      entityId: ling,
      predicate: "hair-colour",
      objectText: "black",
    });
    // Entity object — the case whose fallback used to be a raw uuid.
    const rel = await createFact(owner.cookie, workspaceId, novelId, {
      entityId: ling,
      predicate: "parent-of",
      objectEntityId: wei,
    });
    expect(rel.statusCode, JSON.stringify(rel.body)).toBe(201);

    const rows = await db.canonFact.findMany({
      where: { novelId },
      select: { statement: true },
      orderBy: { predicate: "asc" },
    });
    const statements = rows.map((r) => r.statement);
    // Display names, not `ling-fan` keys and not a uuid.
    expect(statements).toContain("Ling Fan hair-colour black");
    expect(statements).toContain("Ling Fan parent-of Wei Zhao");
    for (const s of statements) {
      expect(s).not.toMatch(/ling-fan|wei-zhao/);
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    }
  });

  it("refuses a claim with both or neither object form", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const a = await createEntity(owner.cookie, workspaceId, novelId, "A");
    const b = await createEntity(owner.cookie, workspaceId, novelId, "B");

    expect(
      (
        await createFact(owner.cookie, workspaceId, novelId, {
          entityId: a,
          predicate: "knows",
          objectText: "x",
          objectEntityId: b,
        })
      ).statusCode,
    ).toBe(409); // AMBIGUOUS -> ConflictError

    expect(
      (
        await createFact(owner.cookie, workspaceId, novelId, {
          entityId: a,
          predicate: "knows",
        })
      ).statusCode,
    ).toBe(409); // MISSING
  });

  it("names the same subject twice without creating two entities", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const first = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");
    // A different spelling that canonicalSubjectKey folds to the same key.
    const second = await createEntity(owner.cookie, workspaceId, novelId, "  ling   fan  ");
    expect(second).toBe(first);
    expect(await db.storyEntity.count({ where: { novelId } })).toBe(1);
  });
});

describe("candidate canon is not silently committed (TESTING.md mandatory scenario)", () => {
  it("holds a conflicting proposal unapproved and leaves the live fact byte-identical", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const live = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      availableFromChapter: 3,
    });
    const liveId = (live.body as { id: string }).id;
    const before = await db.canonFact.findUniqueOrThrow({ where: { id: liveId } });

    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
    });
    expect(proposed.statusCode, JSON.stringify(proposed.body)).toBe(201);
    // CONFLICT is recorded as a flag, and the proposal stays PROPOSED.
    expect(proposed.body.status).toBe("PROPOSED");
    expect(proposed.body.conflictKind).toBe("FUNCTIONAL_CONFLICT");
    expect(proposed.body.conflictsWithFactId).toBe(liveId);

    // The live fact is untouched: byte-identical, still ACTIVE, not superseded.
    const after = await db.canonFact.findUniqueOrThrow({ where: { id: liveId } });
    expect(after).toEqual(before);
    expect(after.status).toBe("ACTIVE");
    expect(after.supersededById).toBeNull();

    // And no second fact was minted by proposing.
    expect(await db.canonFact.count({ where: { novelId } })).toBe(1);

    // A proposal identical to live canon asserts nothing new and is refused
    // rather than stored — otherwise an approval gate keyed on "no conflict"
    // would treat it as fresh and hit the unique index.
    const duplicate = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it("approving supersedes non-destructively and the old value stays readable", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const live = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
    });
    const liveId = (live.body as { id: string }).id;

    // The replacement becomes true at chapter 10, which is what closes the
    // old fact's window. Supplied through the API — a direct DB write here
    // would let the route forget to accept the field and still pass.
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 10,
    });
    const proposalId = proposed.body.id as string;

    const approved = await approve(owner.cookie, workspaceId, proposalId);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.supersededFactId).toBe(liveId);

    // Exactly one live fact; the old one is SUPERSEDED, linked, and its
    // window closed at the replacement's start chapter.
    const old = await db.canonFact.findUniqueOrThrow({ where: { id: liveId } });
    expect(old.status).toBe("SUPERSEDED");
    expect(old.supersededById).toBe(approved.body.canonFactId);
    expect(old.validUntilChapter).toBe(10);
    expect(old.objectText).toBe("black"); // never overwritten
    expect(
      await db.canonFact.count({ where: { novelId, status: "ACTIVE" } }),
    ).toBe(1);

    // Approving twice cannot mint a second fact.
    const again = await approve(owner.cookie, workspaceId, proposalId);
    expect(again.statusCode).toBe(409);
    expect(await db.canonFact.count({ where: { novelId } })).toBe(2);

    const auditActions = (
      await db.auditLog.findMany({ where: { workspaceId }, select: { action: true } })
    ).map((a) => a.action);
    expect(auditActions).toContain("canon.proposal-approved");
    expect(auditActions).toContain("canon.fact-created");
  });

  it("rejects a proposal without creating canon", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/canon/proposals/${proposed.body.id}/reject`,
      headers: { cookie: owner.cookie },
      payload: { note: "not supported by the text" },
    });
    expect(res.statusCode).toBe(204);
    expect(await db.canonFact.count({ where: { novelId } })).toBe(0);
    const row = await db.canonProposal.findUniqueOrThrow({
      where: { id: proposed.body.id as string },
    });
    expect(row.status).toBe("REJECTED");
    expect(row.decidedById).toBe(owner.userId);
    expect(row.canonFactId).toBeNull();
  });

  // Two proposals for the same subject and predicate may coexist — an author
  // weighing alternatives is a normal flow — but approving one that restates
  // what canon already says must not supersede a fact with a copy of itself.
  // proposeCandidate cannot catch this: it classifies against the live fact
  // at propose time, and the live fact can appear afterwards.
  it("refuses to approve a claim identical to the canon that now exists", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    // Filed while nothing is canon yet, so classifyProposal sees NEW.
    const first = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    const second = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.body.conflictKind).toBeNull(); // both look NEW at propose time

    expect((await approve(owner.cookie, workspaceId, first.body.id as string)).statusCode).toBe(200);

    // The second would mint an identical ACTIVE fact and mark the first
    // SUPERSEDED — a correction that changed nothing, shifting every as-of
    // answer for this subject.
    const dup = await approve(owner.cookie, workspaceId, second.body.id as string);
    expect(dup.statusCode).toBe(409);

    const facts = await db.canonFact.findMany({ where: { novelId } });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.status).toBe("ACTIVE");
    expect(facts[0]?.supersededById).toBeNull();
  });

  // canon_facts_live is anchored on `status = 'ACTIVE'` rather than on
  // `superseded_by_id IS NULL` precisely so retraction frees the slot
  // (ADR-0008 §1). That rationale was load-bearing in the ADR and the
  // migration comment while RETRACTED had no writer at all — the state was
  // unreachable and the justification untestable. This pins both halves.
  it("retracts a live fact without deleting it, freeing the slot for a new value", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const first = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    expect(first.statusCode).toBe(201);
    const factId = (first.body as { id: string }).id;

    expect((await retract(owner.cookie, workspaceId, novelId, factId, { reason: "unfounded" })).statusCode).toBe(204);

    // The row survives — retraction is not deletion, so the claim and any
    // evidence it carried are still in the record.
    const row = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(row.status).toBe("RETRACTED");
    // No successor was invented, which is what a status-anchored index needs.
    expect(row.supersededById).toBeNull();

    // The slot is free: a different value for the same subject and predicate
    // can now be asserted, which is the behaviour a supersede-anchored index
    // would have made impossible.
    const replacement = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 20,
    });
    expect(replacement.statusCode).toBe(201);

    const audited = await db.auditLog.findMany({
      where: { entityId: factId, action: "canon.fact-retracted" },
    });
    expect(audited).toHaveLength(1);
  });
  it("refuses to retract a fact that is not live, and 404s a foreign one", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const wsB = await seedWorkspace(other.userId, "wb");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const created = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    const factId = (created.body as { id: string }).id;

    expect((await retract(owner.cookie, workspaceId, novelId, factId)).statusCode).toBe(204);
    // Already withdrawn — a second retraction is a 409, not a silent no-op.
    expect((await retract(owner.cookie, workspaceId, novelId, factId)).statusCode).toBe(409);

    // A fact id from another workspace 404s rather than 403ing, so the
    // response cannot confirm the row exists.
    const otherEntity = await createEntity(other.cookie, wsB.workspaceId, wsB.novelId, "B");
    const foreign = await createFact(other.cookie, wsB.workspaceId, wsB.novelId, {
      entityId: otherEntity,
      predicate: "hair-colour",
      objectText: "black",
    });
    const foreignId = (foreign.body as { id: string }).id;
    expect(
      (await retract(owner.cookie, workspaceId, novelId, foreignId)).statusCode,
    ).toBe(404);
  });
});

describe("evidence must resolve to a real span in an immutable revision", () => {
  it("accepts a chapter span that slices back to its quote, and refuses one that does not", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const chapter = await db.chapter.create({
      data: {
        novelId,
        number: 1,
        title: "One",
        status: "PUBLISHED",
        createdById: owner.userId,
      },
    });
    const text = "His hair was black as ink.";
    const version = await db.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        number: 1,
        content: text,
        wordCount: 6,
        authorId: owner.userId,
      },
    });
    await db.chapter.update({
      where: { id: chapter.id },
      data: { currentVersionId: version.id },
    });

    const start = text.indexOf("black");
    const good = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      source: {
        chapterVersionId: version.id,
        quote: "black",
        start,
        end: start + "black".length,
      },
    });
    expect(good.statusCode, JSON.stringify(good.body)).toBe(201);

    const stored = await db.canonFactSource.findFirstOrThrow({
      where: { canonFactId: (good.body as { id: string }).id },
    });
    expect(stored.sourceKind).toBe("CHAPTER");
    expect(text.slice(stored.start, stored.end)).toBe(stored.quote);

    // A quote that does not match the span is refused, not stored with a
    // best-effort offset — a citation pointing at the wrong text is worse
    // than no citation.
    const bad = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "eye-colour",
      objectText: "blue",
      source: {
        chapterVersionId: version.id,
        quote: "blue",
        start,
        end: start + "black".length,
      },
    });
    expect(bad.statusCode).toBe(409);
    expect(await db.canonFact.count({ where: { novelId } })).toBe(1);
  });

  it("refuses evidence naming both a chapter and a reference", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const ref = await db.reference.create({
      data: {
        workspaceId,
        key: "guide",
        title: "Guide",
        status: "ACTIVE",
        createdById: owner.userId,
      },
    });
    const refVersion = await db.referenceVersion.create({
      data: {
        referenceId: ref.id,
        number: 1,
        content: "A guide about hair.",
        contentHash: "deadbeef",
        charCount: 18,
        createdById: owner.userId,
      },
    });

    const res = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      source: {
        chapterVersionId: refVersion.id,
        referenceVersionId: refVersion.id,
        quote: "hair",
        start: 12,
        end: 16,
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("the Story Brain answers with evidence", () => {
  it("answers FACT with an established basis and quotes its source", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const fact = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      statement: "Ling Fan's hair is black.",
    });
    expect(fact.statusCode).toBe(201);

    const answered = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "hair-colour" },
      { mode: "AUTHOR" },
    );
    expect(answered.statusCode, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body.answered).toBe(true);
    expect(answered.body.insufficient).toBe(false);
    expect(answered.body.basis).toBe("ESTABLISHED_FACT");
    const claim = answered.body.claim as Record<string, unknown>;
    expect(claim.objectText ?? (claim.object as Record<string, unknown>).objectText).toBe("black");
    const evidence = answered.body.evidence as Array<Record<string, unknown>>;
    expect(evidence.some((e) => e.kind === "CANON_FACT" && e.factId === (fact.body as { id: string }).id)).toBe(true);
  });

  it("reconstructs the OLD value as-of a chapter before the correction", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
    });
    // Corrected at chapter 10.
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 10,
    });
    expect((await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode).toBe(200);

    // Before the correction the old value held; after it, the new one. This
    // is the whole point of closing the superseded fact's window — without
    // it the old row would cover nothing and history would be lost even
    // though the row survives.
    const atFive = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 5 },
      { mode: "AUTHOR" },
    );
    expect(atFive.body.insufficient).toBe(false);
    const early = atFive.body.claim as Record<string, unknown>;
    expect((early.object as Record<string, unknown>).objectText).toBe("black");
    expect(atFive.body.basis).toBe("INFERENCE"); // reconstructed, never established

    const atFifteen = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 15 },
      { mode: "AUTHOR" },
    );
    const late = atFifteen.body.claim as Record<string, unknown>;
    expect((late.object as Record<string, unknown>).objectText).toBe("white");
  });

  it("still closes the old window when the replacement has no validFromChapter", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    // No validFromChapter on the replacement — the field is optional, so this
    // is the COMMON path. Closing the old window at null would leave it open
    // to infinity and every as-of query, including chapters BEFORE the
    // correction, would return the new value.
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
    });
    expect((await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode).toBe(200);

    const old = await db.canonFact.findFirstOrThrow({
      where: { novelId, objectText: "black" },
      select: { status: true, validUntilChapter: true },
    });
    expect(old.status).toBe("SUPERSEDED");
    // Closed at the old row's own start, so its window is empty: it never
    // held. Still closed, so it cannot shadow the replacement.
    expect(old.validUntilChapter).toBe(10);

    const atFive = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 5 },
      { mode: "AUTHOR" },
    );
    const claim = atFive.body.claim as Record<string, unknown> | null;
    // The replacement is what stands at ch 5, because nothing says when the
    // correction took effect — but the OLD row must not be what answers.
    expect((claim?.object as Record<string, unknown>)?.objectText).toBe("white");
  });

  it("accepts a BACKDATED correction instead of failing on the window CHECK", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    // "Actually it was white from chapter 5, not black from 10." Dated
    // EARLIER than the row it replaces, which used to set
    // valid_until < valid_from and fail the CHECK as an opaque 500.
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 5,
    });
    const approved = await approve(owner.cookie, workspaceId, proposed.body.id as string);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);

    const old = await db.canonFact.findFirstOrThrow({
      where: { novelId, objectText: "black" },
      select: { status: true, validFromChapter: true, validUntilChapter: true },
    });
    // The old claim never held: it starts at 10 and ends at 10.
    expect(old.validUntilChapter).toBe(10);
    expect(old.validFromChapter).toBe(10);
    expect(old.validUntilChapter! >= old.validFromChapter!).toBe(true);
    expect(await db.canonFact.count({ where: { novelId, status: "ACTIVE" } })).toBe(1);
  });

  it("reconstructs a two-step chain correctly, and keeps the window ordered", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
    });
    for (const [value, at] of [["red", 10], ["white", 20]] as const) {
      const p = await propose(owner.cookie, workspaceId, novelId, {
        entityId,
        predicate: "hair-colour",
        objectText: value,
        validFromChapter: at,
      });
      expect((await approve(owner.cookie, workspaceId, p.body.id as string)).statusCode).toBe(200);
    }

    const at = async (chapter: number) => {
      const r = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "STATE", entityId, predicate: "hair-colour", atChapter: chapter },
        { mode: "AUTHOR" },
      );
      const c = r.body.claim as Record<string, unknown> | null;
      return (c?.object as Record<string, unknown> | undefined)?.objectText;
    };
    // Each era answers with its own value — the property the whole
    // validUntilChapter mechanism exists for.
    expect(await at(5)).toBe("black");
    expect(await at(15)).toBe("red");
    expect(await at(25)).toBe("white");
  });

  it("reports no-evidence as insufficient, not as false", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const answered = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "eye-colour" },
      { mode: "AUTHOR" },
    );
    expect(answered.statusCode).toBe(200);
    expect(answered.body.answered).toBe(true);
    expect(answered.body.insufficient).toBe(true);
    expect(answered.body.claim).toBeNull();
    expect(answered.body.basis).toBeNull();
  });

  it("reconstructs STATE as-of a chapter, including before the fact was true", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 5,
    });

    // At chapter 3 the fact was not yet true — a positive answer, not an
    // "insufficient". Conflating the two would lose a real continuity answer.
    const early = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 3 },
      { mode: "AUTHOR" },
    );
    expect(early.statusCode).toBe(200);
    expect(early.body.claim).toBeNull();
    const notYet = early.body.notYetTrue as Array<Record<string, unknown>>;
    expect(notYet).toHaveLength(1);
    expect(notYet[0]!.validFromChapter).toBe(5);

    const later = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 9 },
      { mode: "AUTHOR" },
    );
    expect(later.body.insufficient).toBe(false);
    // Reconstructed history is never present-tense truth.
    expect(later.body.basis).toBe("INFERENCE");
  });

  it("returns an explicit not-implemented marker for the forms slice 2 owns", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");

    for (const kind of ["EVENT", "CAUSAL", "UNRESOLVED", "PROMISES"] as const) {
      const res = await ask(owner.cookie, workspaceId, novelId, { kind }, { mode: "AUTHOR" });
      expect(res.statusCode, kind).toBe(200);
      // An empty result would read as "nothing happened" — a different and
      // false claim. The marker is the honest answer.
      expect(res.body.answered, kind).toBe(false);
      expect(res.body.reason, kind).toBe("NOT_IMPLEMENTED_IN_PHASE_6");
    }
  });
});

describe("spoiler boundary (CLAUDE.md §10)", () => {
  it("withholds a fact above the reader's position and shows it at or after", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "secret-identity",
      objectText: "the prince",
      availableFromChapter: 400,
    });

    const early = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "secret-identity" },
      { mode: "READER", readerChapter: "3" },
    );
    expect(early.body.claim).toBeNull();
    expect(early.body.insufficient).toBe(true);

    const reached = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "secret-identity" },
      { mode: "READER", readerChapter: "400" },
    );
    expect(reached.body.claim).not.toBeNull();
  });

  it("withholds a fact with no boundary at any reader position (deny by default)", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "private-note",
      objectText: "unclassified",
    });

    for (const at of ["0", "50", "99999"]) {
      const res = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "FACT", entityId, predicate: "private-note" },
        { mode: "READER", readerChapter: at },
      );
      expect(res.body.claim, `at ${at}`).toBeNull();
    }
    // The author sees it — the boundary bounds readers, not authors.
    const asAuthor = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "private-note" },
      { mode: "AUTHOR" },
    );
    expect(asAuthor.body.claim).not.toBeNull();
  });

  it("withholds above the reader's position from the FACT LIST too, not just the Brain", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "early",
      objectText: "visible",
      availableFromChapter: 3,
    });
    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "late",
      objectText: "the prince",
      availableFromChapter: 400,
    });
    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "unclassified",
      objectText: "not classified",
    });

    const asReader = async (chapter: number) => {
      const r = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=READER&readerChapter=${chapter}`,
        headers: { cookie: owner.cookie },
      });
      expect(r.statusCode, r.body).toBe(200);
      return r.json() as { facts: Array<Record<string, unknown>>; withheldCount: number };
    };

    // Listing canon is reading story truth, so it obeys the same boundary the
    // Brain does. Before this, the list routes applied NO filter at all and
    // returned a ch-400 fact to any canon:read holder.
    const reader3 = await asReader(3);
    expect(reader3.facts.map((f) => f.objectText)).toEqual(["visible"]);
    // Counted, not inferred from a short list: an unclassified fact is
    // withheld too (deny by default), and a post-filter leak would make this
    // zero.
    expect(reader3.withheldCount).toBe(2);

    const reader400 = await asReader(400);
    // The unclassified row is still withheld at ANY position.
    expect(reader400.facts.map((f) => f.objectText).sort()).toEqual(["the prince", "visible"]);
    expect(reader400.withheldCount).toBe(1);

    // AUTHOR sees everything and withholds nothing.
    const author = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=AUTHOR`,
      headers: { cookie: owner.cookie },
    });
    expect((author.json() as { facts: unknown[] }).facts).toHaveLength(3);
    expect((author.json() as { withheldCount: number }).withheldCount).toBe(0);

    // An omitted mode is the restrictive one, never the permissive one.
    const omitted = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts`,
      headers: { cookie: owner.cookie },
    });
    expect(omitted.statusCode).toBe(400); // READER with no position
  });

  it("requires a reader position in READER mode and refuses one otherwise", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");
    const q = { kind: "FACT", entityId, predicate: "hair-colour" };

    expect((await ask(owner.cookie, workspaceId, novelId, q, { mode: "READER" })).statusCode).toBe(400);
    expect(
      (await ask(owner.cookie, workspaceId, novelId, q, { mode: "AUTHOR", readerChapter: "5" }))
        .statusCode,
    ).toBe(400);
  });

  // The STATE branch is a second path onto the same story truth as FACT, and
  // it leaked in two ways the FACT branch does not: `notYetTrue` was built
  // from the ungated row chain (fact id + the chapter a hidden claim takes
  // effect), and `insufficient` was computed from the ungated covering set,
  // so "hidden" and "absent" were distinguishable. Three independent audits
  // found the first; both make READER mode an existence-and-timing oracle.
  it("does not leak a withheld fact's id or start chapter through STATE", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    // True in-story from ch 400, revealed to readers at ch 400. At reader
    // position 3 this fact must be invisible in every shape.
    const created = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "secret-identity",
      objectText: "the prince",
      validFromChapter: 400,
      availableFromChapter: 400,
    });
    expect(created.statusCode).toBe(201);

    const state = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "secret-identity", atChapter: 3 },
      { mode: "READER", readerChapter: "3" },
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { notYetTrue: unknown[] }).notYetTrue).toEqual([]);

    // And the FACT form of the same question must answer identically — the
    // two kinds cannot disagree about what the reader may know.
    const fact = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "FACT", entityId, predicate: "secret-identity" },
      { mode: "READER", readerChapter: "3" },
    );
    expect(fact.body).toMatchObject({ claim: null, insufficient: true, notYetTrue: [] });
    // The STATE shape must match on the fields it shares.
    expect(state.body).toMatchObject({ claim: null, insufficient: true });

    // AUTHOR still sees the whole chain, so the gate did not cost the
    // author-facing behaviour the existing tests pin.
    const asAuthor = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "secret-identity", atChapter: 3 },
      { mode: "AUTHOR" },
    );
    expect((asAuthor.body as { notYetTrue: unknown[] }).notYetTrue).toHaveLength(1);
  });

  // A withheld fact must be indistinguishable from an absent one. Keying
  // `insufficient` on the ungated covering set made `{claim: null,
  // insufficient: false}` mean "a claim holds here that you may not see".
  it("reports a withheld covering fact as insufficient, exactly like an absent one", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    // Covers the as-of point but is not yet reader-visible.
    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
      availableFromChapter: 400,
    });

    const withheld = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 3 },
      { mode: "READER", readerChapter: "3" },
    );
    const absent = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "no-such-predicate", atChapter: 3 },
      { mode: "READER", readerChapter: "3" },
    );
    expect(withheld.body).toEqual(absent.body);
  });
});

describe("tenant isolation and authorization", () => {
  it("returns 404 for a non-member and for a foreign workspace's novel", async () => {
    const ownerA = await seedUser("a@example.com");
    const ownerB = await seedUser("b@example.com");
    const wsA = await seedWorkspace(ownerA.userId, "wa");
    const wsB = await seedWorkspace(ownerB.userId, "wb");
    const entityA = await createEntity(ownerA.cookie, wsA.workspaceId, wsA.novelId, "A");

    // Non-member on A's workspace: 404, never 403 — a 403 would confirm the
    // workspace exists.
    const nonMember = await app.inject({
      method: "GET",
      url: `/api/workspaces/${wsA.workspaceId}/novels/${wsA.novelId}/canon/facts?mode=AUTHOR`,
      headers: { cookie: ownerB.cookie },
    });
    expect(nonMember.statusCode).toBe(404);

    // A's novel id under B's workspace: 404, not a leak.
    const crossNovel = await app.inject({
      method: "POST",
      url: `/api/workspaces/${wsB.workspaceId}/novels/${wsA.novelId}/canon/facts`,
      headers: { cookie: ownerB.cookie },
      payload: { entityId: entityA, predicate: "x", objectText: "y" },
    });
    expect(crossNovel.statusCode).toBe(404);

    // B cannot see A's entity even naming it directly.
    const crossEntity = await app.inject({
      method: "POST",
      url: `/api/workspaces/${wsB.workspaceId}/novels/${wsB.novelId}/canon/facts`,
      headers: { cookie: ownerB.cookie },
      payload: { entityId: entityA, predicate: "x", objectText: "y" },
    });
    expect(crossEntity.statusCode).toBe(404);
  });

  it("lets an EDITOR read canon but not propose or approve it", async () => {
    const owner = await seedUser("owner@example.com");
    const editor = await seedUser("editor@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1", {
      userId: editor.userId,
      role: "EDITOR",
    });
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const read = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=AUTHOR`,
      headers: { cookie: editor.cookie },
    });
    expect(read.statusCode).toBe(200);

    // An editor's job is to flag a conflict, not to commit story truth.
    const proposed = await propose(editor.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    expect(proposed.statusCode).toBe(403);

    const written = await createFact(editor.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
    });
    expect(written.statusCode).toBe(403);
  });

  it("refuses an unauthenticated request", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=AUTHOR`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("404s approving a proposal that belongs to another workspace", async () => {
    const ownerA = await seedUser("a@example.com");
    const ownerB = await seedUser("b@example.com");
    const wsA = await seedWorkspace(ownerA.userId, "wa");
    const wsB = await seedWorkspace(ownerB.userId, "wb");
    const entityB = await createEntity(ownerB.cookie, wsB.workspaceId, wsB.novelId, "B");
    const proposed = await propose(ownerB.cookie, wsB.workspaceId, wsB.novelId, {
      entityId: entityB,
      predicate: "hair-colour",
      objectText: "black",
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${wsA.workspaceId}/canon/proposals/${proposed.body.id}/approve`,
      headers: { cookie: ownerA.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
