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
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";

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

const EMBED_DIMENSION = 1536;

/**
 * A deterministic embedding for a chunk of text. Only the RETRIEVAL leg of
 * the Brain needs an embedder, and no test may reach a real provider
 * (CLAUDE.md §25) — so the same shape retrieval.test.ts uses: hash the text
 * into a few buckets so two different strings have a defined, non-zero
 * cosine distance.
 */
function fakeVector(text: string): number[] {
  const v = new Array<number>(EMBED_DIMENSION).fill(0);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = (h ^ text.charCodeAt(i)) * 16777619;
  }
  for (let k = 0; k < 16; k += 1) {
    h = (h ^ (h >>> 13)) * 2654435761;
    v[Math.abs(h) % EMBED_DIMENSION] = 1;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-embed", capabilities: ["embedding"] }];
    },
    async generate() {
      return {
        content: '{"summary":"ok"}',
        model: "fake-embed",
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed(req) {
      return {
        vectors: req.input.map(fakeVector),
        model: "fake-embed",
        inputTokens: req.input.length,
      };
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
  app = await buildApp(env, { db, createGateway: fakeCreateGateway });
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

async function seedUser(
  email: string,
  platformRole: "SUPER_ADMIN" | null = null,
): Promise<{ userId: string; cookie: string }> {
  const user = await db.user.create({
    data: {
      email,
      passwordHash: "x",
      displayName: email,
      platformRole: platformRole ?? undefined,
    },
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

/**
 * Route a model to the EMBEDDING profile so the RETRIEVAL leg can embed.
 *
 * Only that leg needs this — FACT/STATE read canon rows and never search —
 * so it is done once lazily, the first time a RETRIEVAL test runs, rather
 * than for every test in the file. The gateway is registered through the
 * real admin routes (the adapter is faked, persistence is not), which is
 * what makes `embeddingModelFor` resolve.
 */
async function seedEmbeddingRoute(): Promise<void> {
  if (embeddingRouteReady) return;
  const admin = await seedUser("platform-admin@example.com", "SUPER_ADMIN");
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie: admin.cookie },
    payload: { name: "canon-embed-gw", baseUrl: "http://localhost:20128", apiKey: "sk-secret" },
  });
  expect(gw.statusCode, gw.body).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/gateways/${gatewayId}/sync-models`,
        headers: { cookie: admin.cookie },
      })
    ).statusCode,
  ).toBe(200);
  const models = await app.inject({
    method: "GET",
    url: "/api/models",
    headers: { cookie: admin.cookie },
  });
  const model = (models.json() as Array<{ id: string }>)[0];
  expect(model).toBeDefined();
  expect(
    (
      await app.inject({
        method: "PUT",
        url: "/api/model-profiles",
        headers: { cookie: admin.cookie },
        payload: { profile: "EMBEDDING", modelId: model!.id },
      })
    ).statusCode,
  ).toBe(200);
  embeddingRouteReady = true;
}
let embeddingRouteReady = false;

/**
 * A published reference with one ingested chunk, so the Brain's RETRIEVAL
 * leg has something to find. The full create → ingest → publish path is used
 * rather than a direct row insert, because a chunk only becomes searchable
 * once ingest has embedded it.
 */
async function seedReferenceChunk(
  owner: { cookie: string },
  workspaceId: string,
  novelId: string,
  content: string,
): Promise<void> {
  await seedEmbeddingRoute();
  const created = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/references`,
    headers: { cookie: owner.cookie },
    // Scoped to the novel: the Vector leg filters `r.novel_id = $n`, so a
    // workspace-wide reference is invisible to a search that names a novel.
    payload: { key: "guide", title: "Guide", kind: "GUIDE", content, novelId },
  });
  expect(created.statusCode, created.body).toBe(201);
  const { id, versionId } = created.json() as { id: string; versionId: string };

  const ingest = await app.inject({
    method: "POST",
    url: `/api/reference-versions/${versionId}/ingest`,
    headers: { cookie: owner.cookie },
    payload: {},
  });
  expect(ingest.statusCode, ingest.body).toBe(200);

  const published = await app.inject({
    method: "POST",
    url: `/api/references/${id}/publish`,
    headers: { cookie: owner.cookie },
  });
  expect(published.statusCode, published.body).toBe(200);
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

  it("refuses an entity name whose key is taken by a different kind", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const post = (kind: string, name: string) =>
      app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
        headers: { cookie: owner.cookie },
        payload: { kind, name },
      });

    const asCharacter = await post("CHARACTER", "River");
    expect(asCharacter.statusCode).toBe(201);

    // "River" folds to the key "river", so this collides — and answering 201
    // with the CHARACTER would hand back a kind the caller did not ask for,
    // surfacing much later as a fact attached to the wrong sort of thing.
    const asLocation = await post("LOCATION", "River");
    expect(asLocation.statusCode).toBe(409);

    // The same kind stays idempotent.
    const again = await post("CHARACTER", "River");
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ id: asCharacter.json().id });
    expect(await db.storyEntity.count({ where: { novelId } })).toBe(1);
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

  // The decision has to be atomic with the write, not read-then-write. Both
  // decisions used to read PROPOSED in one statement and write in another, so
  // concurrent approve+reject could both pass their guards: the approval
  // committed a live ACTIVE fact while the row ended REJECTED, and the audit
  // trail recorded a rejection for a decision that created canon. That is
  // "no canon without an explicit decision" (CLAUDE.md §2.13) defeated by
  // interleaving. Both writes are now compare-and-set on status.
  it("lets only one of two concurrent decisions win", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 5,
    });
    const proposalId = proposed.body.id as string;

    const [approved, rejected] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/canon/proposals/${proposalId}/approve`,
        headers: { cookie: owner.cookie },
        payload: {},
      }),
      app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/canon/proposals/${proposalId}/reject`,
        headers: { cookie: owner.cookie },
        payload: { note: "raced" },
      }),
    ]);

    const row = await db.canonProposal.findUniqueOrThrow({ where: { id: proposalId } });
    const facts = await db.canonFact.findMany({ where: { novelId } });
    const ok = [approved.statusCode, rejected.statusCode].filter((c) => c < 400).length;

    // Exactly one decision takes effect.
    expect(ok).toBe(1);

    if (row.status === "APPROVED") {
      // Approval won: canon exists and is linked.
      expect(rejected.statusCode).toBeGreaterThanOrEqual(400);
      expect(row.canonFactId).not.toBeNull();
      expect(facts).toHaveLength(1);
    } else {
      // Rejection won: no canon was created at all.
      expect(row.status).toBe("REJECTED");
      expect(approved.statusCode).toBeGreaterThanOrEqual(400);
      expect(row.canonFactId).toBeNull();
      expect(facts).toHaveLength(0);
    }

    // The invariant regardless of who won: a REJECTED row never points at a
    // fact, and an APPROVED row always does.
    if (row.status === "REJECTED") expect(row.canonFactId).toBeNull();
    if (row.status === "APPROVED") expect(row.canonFactId).not.toBeNull();
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

  // Re-assertion through the candidate pipeline — the documented route (an
  // AI proposes, a human approves) rather than a direct write. A retracted
  // row must not count as live at propose time (it would classify DUPLICATE
  // and refuse) nor at approval time (it would be superseded, inventing a
  // correction that never happened).
  it("re-asserts a retracted claim through propose and approve", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const created = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    const factId = (created.body as { id: string }).id;
    expect((await retract(owner.cookie, workspaceId, novelId, factId)).statusCode).toBe(204);

    const reproposal = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    expect(reproposal.statusCode).toBe(201);
    expect(reproposal.body.conflictKind).toBeNull(); // not a DUPLICATE of a live fact

    const approved = await approve(owner.cookie, workspaceId, reproposal.body.id as string);
    expect(approved.statusCode).toBe(200);
    // Nothing was live, so nothing is superseded.
    expect(approved.body.supersededFactId).toBeNull();

    const rows = await db.canonFact.findMany({
      where: { novelId, predicate: "hair-colour" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((f) => f.status).sort()).toEqual(["ACTIVE", "RETRACTED"]);
    // The retracted row is untouched: not resurrected, not linked.
    expect(rows.find((f) => f.status === "RETRACTED")?.supersededById).toBeNull();
  });
  // Retraction withdraws a claim, so an as-of question must stop answering
  // with it. The STATE chain query has no status filter, and a retracted row
  // keeps a NULL validUntilChapter (retraction does not date when the claim
  // stopped being true in-story), so its window stays open to infinity — the
  // row covers every chapter at or after its start and would be returned as
  // the current value forever. The row must stay in the record while ceasing
  // to be an answer.
  it("stops answering with a retracted fact, without deleting it", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const created = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
    });
    const factId = (created.body as { id: string }).id;

    const before = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 50 },
      { mode: "AUTHOR" },
    );
    expect(
      (before.body as { claim: { object: { objectText?: string } } | null }).claim?.object
        .objectText,
    ).toBe("black");

    expect((await retract(owner.cookie, workspaceId, novelId, factId)).statusCode).toBe(204);

    const after = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 50 },
      { mode: "AUTHOR" },
    );
    expect(after.body).toMatchObject({ claim: null, insufficient: true });

    // Still in the record — withdrawn, not destroyed.
    const row = await db.canonFact.findUniqueOrThrow({ where: { id: factId } });
    expect(row.status).toBe("RETRACTED");

    // A withdrawn claim is not "about to become true" either, so it must not
    // appear in the not-yet-true list of an earlier as-of point.
    const later = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "eye-colour",
      objectText: "green",
      validFromChapter: 100,
    });
    expect(
      (await retract(
        owner.cookie,
        workspaceId,
        novelId,
        (later.body as { id: string }).id,
      )).statusCode,
    ).toBe(204);
    const earlier = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "eye-colour", atChapter: 50 },
      { mode: "AUTHOR" },
    );
    expect((earlier.body as { notYetTrue: unknown[] }).notYetTrue).toEqual([]);
  });

  it("refuses to retract a fact that is not live, and 404s a foreign one", async () => {    const owner = await seedUser("owner@example.com");
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
  // The evidence FKs are ON DELETE RESTRICT, so a cited chapter cannot be
  // deleted. That refusal must be legible AND escapable: the first version of
  // this fix turned a silent evidence loss into an unmapped 500 with no way
  // out, because the "unlink the evidence" path the migration comment
  // promised did not exist. This pins both halves.
  it("refuses to delete a cited chapter, and the citation can be unlinked to release it", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const chapter = await db.chapter.create({
      data: { novelId, number: 1, title: "One", status: "DRAFT", createdById: owner.userId },
    });
    const text = "His hair was black as ink.";
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: text, wordCount: 6, authorId: owner.userId },
    });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });

    const start = text.indexOf("black");
    const fact = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      source: { chapterVersionId: version.id, quote: "black", start, end: start + 5 },
    });
    expect(fact.statusCode).toBe(201);
    const factId = (fact.body as { id: string }).id;
    const stored = await db.canonFactSource.findFirstOrThrow({ where: { canonFactId: factId } });

    const del = () =>
      app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${chapter.id}`,
        headers: { cookie: owner.cookie },
      });

    // Blocked — and legibly, not with a bare INTERNAL.
    const blocked = await del();
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe("CONFLICT");

    // The escape hatch: unlink the citation, then the delete succeeds. Without
    // this the block would be permanent, which is worse than the bug it fixed.
    const unlink = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts/${factId}/sources/${stored.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(unlink.statusCode, unlink.body).toBe(204);

    // The fact survives — its claim was approved on its own merits — but it no
    // longer claims support it cannot show.
    expect(await db.canonFact.findUnique({ where: { id: factId } })).not.toBeNull();
    expect(await db.canonFactSource.count({ where: { canonFactId: factId } })).toBe(0);

    expect((await del()).statusCode).toBe(200);
  });

  it("404s unlinking a source that belongs to another fact or tenant", async () => {
    const owner = await seedUser("owner@example.com");
    const other = await seedUser("other@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const wsB = await seedWorkspace(other.userId, "wb");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const chapter = await db.chapter.create({
      data: { novelId, number: 2, title: "Two", status: "DRAFT", createdById: owner.userId },
    });
    const text = "A red cloak.";
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: text, wordCount: 3, authorId: owner.userId },
    });
    const fact = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "cloak",
      objectText: "red",
      source: { chapterVersionId: version.id, quote: "red", start: 2, end: 5 },
    });
    const factId = (fact.body as { id: string }).id;
    const stored = await db.canonFactSource.findFirstOrThrow({ where: { canonFactId: factId } });

    const unlink = (ws: string, n: string, f: string, s: string, cookie: string) =>
      app.inject({
        method: "DELETE",
        url: `/api/workspaces/${ws}/novels/${n}/canon/facts/${f}/sources/${s}`,
        headers: { cookie },
      });

    // A foreign workspace cannot reach it, and a wrong fact id cannot either.
    expect((await unlink(wsB.workspaceId, wsB.novelId, factId, stored.id, other.cookie)).statusCode).toBe(404);
    expect((await unlink(workspaceId, novelId, entityId, stored.id, owner.cookie)).statusCode).toBe(404);
    // The source is untouched by either attempt.
    expect(await db.canonFactSource.count({ where: { canonFactId: factId } })).toBe(1);
  });

  it("accepts a chapter span that slices back to its quote, and refuses one that does not", async () => {    const owner = await seedUser("owner@example.com");
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

describe("the DB constraints are the subject, not the service guard in front of them", () => {
  // Every refusal in the suites above arrives through the HTTP API, and the
  // service guards — resolveObject, verifySpan, the source-kind derivation —
  // all fire BEFORE the statement reaches the database. So those tests stay
  // green with a constraint dropped: they pin the guard, not the CHECK. This
  // suite writes straight to the database, past every guard, so each case
  // fails if its constraint is absent. That is the only thing that makes the
  // test matrix's claim ("the DB constraints are the subject") true.
  //
  // Each of these was confirmed to fail with its constraint dropped, not
  // merely to pass with it present.
  //
  // Deliberately NOT here: quote === content.slice(start, end). A CHECK cannot
  // read another row's content, so that one is only ever a service guard and
  // its test belongs above.

  async function seedRaw(slug: string) {
    const owner = await seedUser(`${slug}@example.com`);
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, slug);
    const subject = await db.storyEntity.create({
      data: {
        novelId,
        kind: "CHARACTER",
        key: `${slug}-subject`,
        name: "Subject",
        createdById: owner.userId,
      },
    });
    const object = await db.storyEntity.create({
      data: {
        novelId,
        kind: "CHARACTER",
        key: `${slug}-object`,
        name: "Object",
        createdById: owner.userId,
      },
    });
    return { owner, workspaceId, novelId, subjectId: subject.id, objectId: object.id };
  }

  it("enforces the one-live-value partial index, and frees the slot on retraction", async () => {
    const s = await seedRaw("idx");
    const row = (predicate: string) => ({
      workspaceId: s.workspaceId,
      novelId: s.novelId,
      entityId: s.subjectId,
      predicate,
      objectText: "black",
      statement: "hair is black",
      createdById: s.owner.userId,
    });

    const first = await db.canonFact.create({ data: row("hair-colour") });

    // A second ACTIVE row for the same (novel, entity, predicate) is refused
    // by `canon_facts_live`. No application check stands in front of this one
    // on the create path, which is exactly why it needs a test that cannot be
    // satisfied by a guard.
    await expect(db.canonFact.create({ data: row("hair-colour") })).rejects.toThrow();
    // A different predicate is free — the index is not wider than it claims.
    await db.canonFact.create({ data: row("eye-colour") });

    // The index is anchored on `status`, not on `superseded_by_id IS NULL`,
    // so RETRACTED frees the slot and the same claim can be re-asserted. This
    // is ADR-0008 section 1, and it is the reason for that anchor.
    await db.canonFact.update({ where: { id: first.id }, data: { status: "RETRACTED" } });
    await db.canonFact.create({ data: row("hair-colour") });

    expect(await db.canonFact.count({ where: { novelId: s.novelId, status: "ACTIVE" } })).toBe(2);
    expect(await db.canonFact.count({ where: { novelId: s.novelId } })).toBe(3);
  });

  it("refuses a canon fact with both or neither object form", async () => {
    const s = await seedRaw("obj");
    const base = {
      workspaceId: s.workspaceId,
      novelId: s.novelId,
      entityId: s.subjectId,
      statement: "x",
      createdById: s.owner.userId,
    };

    await expect(
      db.canonFact.create({
        data: { ...base, predicate: "p1", objectText: "black", objectEntityId: s.objectId },
      }),
    ).rejects.toThrow();
    await expect(db.canonFact.create({ data: { ...base, predicate: "p2" } })).rejects.toThrow();

    expect(await db.canonFact.count({ where: { novelId: s.novelId } })).toBe(0);
  });

  it("refuses an inverted validity window", async () => {
    const s = await seedRaw("win");
    await expect(
      db.canonFact.create({
        data: {
          workspaceId: s.workspaceId,
          novelId: s.novelId,
          entityId: s.subjectId,
          predicate: "hair-colour",
          objectText: "black",
          statement: "x",
          createdById: s.owner.userId,
          validFromChapter: 10,
          validUntilChapter: 5,
        },
      }),
    ).rejects.toThrow();
    expect(await db.canonFact.count({ where: { novelId: s.novelId } })).toBe(0);
  });

  it("refuses evidence whose source kind and version column disagree", async () => {
    const s = await seedRaw("kind");
    const fact = await db.canonFact.create({
      data: {
        workspaceId: s.workspaceId,
        novelId: s.novelId,
        entityId: s.subjectId,
        predicate: "p",
        objectText: "black",
        statement: "x",
        createdById: s.owner.userId,
      },
    });
    const chapter = await db.chapter.create({
      data: { novelId: s.novelId, number: 1, title: "One", status: "DRAFT", createdById: s.owner.userId },
    });
    const chapterVersion = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "abc", wordCount: 1, authorId: s.owner.userId },
    });
    const ref = await db.reference.create({
      data: {
        workspaceId: s.workspaceId,
        key: "guide",
        title: "Guide",
        status: "ACTIVE",
        createdById: s.owner.userId,
      },
    });
    const refVersion = await db.referenceVersion.create({
      data: {
        referenceId: ref.id,
        number: 1,
        content: "abc",
        contentHash: "deadbeef",
        charCount: 3,
        createdById: s.owner.userId,
      },
    });

    const src = (over: Record<string, unknown>) => ({
      canonFactId: fact.id,
      quote: "a",
      start: 0,
      end: 1,
      createdById: s.owner.userId,
      sourceKind: "CHAPTER" as const,
      ...over,
    });

    // CHAPTER naming a reference version, REFERENCE naming a chapter version,
    // and REFERENCE naming nothing at all — three ways to make the kind a lie.
    await expect(
      db.canonFactSource.create({ data: src({ sourceKind: "CHAPTER", referenceVersionId: refVersion.id }) }),
    ).rejects.toThrow();
    await expect(
      db.canonFactSource.create({ data: src({ sourceKind: "REFERENCE", chapterVersionId: chapterVersion.id }) }),
    ).rejects.toThrow();
    await expect(db.canonFactSource.create({ data: src({ sourceKind: "REFERENCE" }) })).rejects.toThrow();

    expect(await db.canonFactSource.count({ where: { canonFactId: fact.id } })).toBe(0);

    // The two shapes the constraint admits still work, so the test above is
    // refusing the mismatch rather than refusing everything.
    await db.canonFactSource.create({ data: src({ sourceKind: "CHAPTER", chapterVersionId: chapterVersion.id }) });
    await db.canonFactSource.create({
      data: src({ sourceKind: "REFERENCE", referenceVersionId: refVersion.id, start: 1, end: 2 }),
    });
    expect(await db.canonFactSource.count({ where: { canonFactId: fact.id } })).toBe(2);
  });

  it("refuses a span that is empty, reversed or negative", async () => {
    const s = await seedRaw("span");
    const fact = await db.canonFact.create({
      data: {
        workspaceId: s.workspaceId,
        novelId: s.novelId,
        entityId: s.subjectId,
        predicate: "p",
        objectText: "black",
        statement: "x",
        createdById: s.owner.userId,
      },
    });
    const chapter = await db.chapter.create({
      data: { novelId: s.novelId, number: 1, title: "One", status: "DRAFT", createdById: s.owner.userId },
    });
    const chapterVersion = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "abcdef", wordCount: 1, authorId: s.owner.userId },
    });

    const src = (start: number, end: number) => ({
      canonFactId: fact.id,
      sourceKind: "CHAPTER" as const,
      chapterVersionId: chapterVersion.id,
      quote: "a",
      start,
      end,
      createdById: s.owner.userId,
    });

    await expect(db.canonFactSource.create({ data: src(5, 5) })).rejects.toThrow();
    await expect(db.canonFactSource.create({ data: src(5, 3) })).rejects.toThrow();
    await expect(db.canonFactSource.create({ data: src(-1, 2) })).rejects.toThrow();

    expect(await db.canonFactSource.count({ where: { canonFactId: fact.id } })).toBe(0);
    // And the admissible shape still works, so this is not refusing everything.
    await db.canonFactSource.create({ data: src(0, 6) });
    expect(await db.canonFactSource.count({ where: { canonFactId: fact.id } })).toBe(1);
  });

  it("refuses a proposal with both or neither object form", async () => {
    const s = await seedRaw("prop");
    const base = {
      workspaceId: s.workspaceId,
      novelId: s.novelId,
      entityId: s.subjectId,
      statement: "x",
      proposedById: s.owner.userId,
    };

    await expect(
      db.canonProposal.create({
        data: { ...base, predicate: "p1", objectText: "black", objectEntityId: s.objectId },
      }),
    ).rejects.toThrow();
    await expect(db.canonProposal.create({ data: { ...base, predicate: "p2" } })).rejects.toThrow();

    expect(await db.canonProposal.count({ where: { novelId: s.novelId } })).toBe(0);
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

  it("REFUSES an undated replacement, because it would destroy the old value", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    // The replacement carries no validFromChapter. Closing the old window at
    // null leaves it open to infinity and every as-of query returns the new
    // value; closing it at the old row's own start is no better, because the
    // undated replacement covers from -infinity and shadows the old value
    // everywhere anyway. Either way the old value is unreachable at EVERY
    // as-of chapter, including chapters before the correction. There is no
    // chapter to split on, so the write is refused at the boundary rather
    // than guessed at (CLAUDE.md §15).
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
    });
    const res = await approve(owner.cookie, workspaceId, proposed.body.id as string);
    expect(res.statusCode).toBe(409);

    // Nothing changed: the old value still stands and no second fact exists.
    const rows = await db.canonFact.findMany({ where: { novelId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.objectText).toBe("black");
    expect(rows[0]?.status).toBe("ACTIVE");
    expect(rows[0]?.validUntilChapter).toBeNull();

    // The history is intact: the original claim is still what holds at ch 15
    // (it starts at 10), and nothing holds before that.
    const objectAt = async (ch: number) => {
      const r = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "STATE", entityId, predicate: "hair-colour", atChapter: ch },
        { mode: "AUTHOR" },
      );
      const c = r.body.claim as Record<string, unknown> | null;
      return (c?.object as Record<string, unknown>)?.objectText;
    };
    expect(await objectAt(15)).toBe("black");
    const before = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 5 },
      { mode: "AUTHOR" },
    );
    expect(before.body).toMatchObject({ claim: null, insufficient: true });
  });

  // A fact may carry an AUTHORED end of window — "black held only for ch 1..9".
  // Superseding must not re-date it. Writing the replacement's start would fill
  // the gap the author deliberately left, turning chapters 10..19 from "nothing
  // holds" into "black" — history mutated by an unrelated later claim.
  it("does not re-date a superseded fact that had an authored end of window", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    const authored = await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
      validUntilChapter: 9,
    });
    expect(authored.statusCode).toBe(201);

    const objectAt = async (ch: number) => {
      const r = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "STATE", entityId, predicate: "hair-colour", atChapter: ch },
        { mode: "AUTHOR" },
      );
      const c = r.body.claim as Record<string, unknown> | null;
      return (c?.object as Record<string, unknown>)?.objectText ?? null;
    };
    // The author's gap: nothing holds at ch 15 before any correction exists.
    expect(await objectAt(15)).toBeNull();

    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 20,
    });
    expect((await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode).toBe(200);

    const row = await db.canonFact.findFirstOrThrow({
      where: { novelId, objectText: "black" },
      select: { status: true, validFromChapter: true, validUntilChapter: true },
    });
    // The authored bound survives: the window is still [1, 9), not [1, 20).
    expect(row.status).toBe("SUPERSEDED");
    expect(row.validFromChapter).toBe(1);
    expect(row.validUntilChapter).toBe(9);

    // So ch 15 is STILL empty — the ch-20 claim did not reach back into it.
    expect(await objectAt(15)).toBeNull();
    expect(await objectAt(5)).toBe("black");
    expect(await objectAt(25)).toBe("white");
  });

  // A replacement whose start lands INSIDE the authored span. The authored
  // end caps the window from above, but the correction caps it too: closing
  // at the authored end would leave the old row claiming black held at
  // 5..8 while the ACTIVE replacement answers white there — the window
  // metadata and every STATE answer would disagree. The correction may
  // SHORTEN an authored window; it may never lengthen one.
  it("shortens an authored window to a backdated correction's start", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 1,
      validUntilChapter: 9,
    });

    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 5,
    });
    expect((await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode).toBe(200);

    const row = await db.canonFact.findFirstOrThrow({
      where: { novelId, objectText: "black" },
      select: { status: true, validFromChapter: true, validUntilChapter: true },
    });
    expect(row.status).toBe("SUPERSEDED");
    expect(row.validFromChapter).toBe(1);
    expect(row.validUntilChapter).toBe(5);

    const objectAt = async (ch: number) => {
      const r = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "STATE", entityId, predicate: "hair-colour", atChapter: ch },
        { mode: "AUTHOR" },
      );
      const c = r.body.claim as Record<string, unknown> | null;
      return (c?.object as Record<string, unknown>)?.objectText ?? null;
    };
    expect(await objectAt(3)).toBe("black");
    expect(await objectAt(7)).toBe("white");
    expect(await objectAt(25)).toBe("white");
  });

  it("does not report an emptied window as a claim about to become true", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    // A backdated correction against a claim with no authored end empties the
    // old window: black is authored `true from 10`, corrected to be true from
    // 5, so closeAt is max(5, 10) = 10 and the old row becomes [10,10) — a
    // span that never held. It was still reported as a claim "about to become
    // true" at any chapter before 10, asserting a future that cannot happen.
    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 5,
    });
    expect(
      (await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode,
    ).toBe(200);

    const ids = await db.canonFact.findMany({
      where: { novelId },
      select: { id: true, objectText: true },
    });
    expect(ids).toHaveLength(2);
    const blackId = ids.find((r) => r.objectText === "black")!.id;
    const whiteId = ids.find((r) => r.objectText === "white")!.id;

    const r = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "STATE", entityId, predicate: "hair-colour", atChapter: 3 },
      { mode: "AUTHOR" },
    );
    const notYet = ((r.body as { notYetTrue?: { factId: string }[] }).notYetTrue ?? [])
      .map((n) => n.factId);
    // white does become true (at 5); black's window never opens at all.
    expect(notYet).toContain(whiteId);
    expect(notYet).not.toContain(blackId);
  });

  it("returns the same entity for a concurrent duplicate create, not a 500", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");

    // Two creates for the same derived key, both racing past the findUnique
    // guard. The loser violates story_entities_novel_id_key_key; before the
    // catch it reached the client as a bare INTERNAL 500 contradicting the
    // function's documented idempotence. Raw injects, not the helper: the
    // helper asserts 201 itself, which is the assertion under test.
    //
    // One shot of two is not enough to force the interleave — the first
    // request usually completes its insert before the second's guard read
    // resolves, and the second then takes the existing-row path. Twelve
    // simultaneous requests against a real pool overlap reliably; the
    // assertion is on the OUTCOME (all succeed, one row), so extra
    // concurrency costs nothing but makes the loser path actually run.
    const post = () =>
      app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/entities`,
        headers: { cookie: owner.cookie },
        payload: { kind: "CHARACTER", name: "River" },
      });
    const res = await Promise.all(Array.from({ length: 12 }, post));
    const codes = res.map((r) => r.statusCode);
    expect(codes).toEqual(Array.from({ length: 12 }, () => 201));
    const ids = new Set(res.map((r) => (r.json() as { id: string }).id));
    expect(ids.size).toBe(1);
    expect(await db.storyEntity.count({ where: { novelId, key: "river" } })).toBe(1);
  });

  it("never leaves a retracted fact linked to the successor that replaced it", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");

    // One fact per round, each raced by its own approve+retract pair. The
    // supersede used to be an unpredicated update on the id, so a retract
    // that committed RETRACTED first was silently overwritten back to
    // SUPERSEDED — leaving the row linked to the successor that replaced it,
    // the state ADR-0008 §1 says cannot exist. Distinct entities keep the
    // rounds independent (one live fact per subject+predicate) and running
    // them concurrently is what makes the interleave happen at all; a single
    // sequential pair is fast enough that whichever request wins has already
    // committed before the other's guard read resolves.
    const N = 10;
    const prepared: { factId: string; proposalId: string }[] = [];
    for (let i = 0; i < N; i++) {
      const entity = await createEntity(owner.cookie, workspaceId, novelId, `Subject ${i}`);
      const fact = await createFact(owner.cookie, workspaceId, novelId, {
        entityId: entity,
        predicate: "hair-colour",
        objectText: "black",
        validFromChapter: 1,
      });
      const proposed = await propose(owner.cookie, workspaceId, novelId, {
        entityId: entity,
        predicate: "hair-colour",
        objectText: "white",
        validFromChapter: 2,
      });
      expect(fact.statusCode, JSON.stringify(fact.body)).toBe(201);
      prepared.push({
        factId: (fact.body as { id: string }).id,
        proposalId: proposed.body.id as string,
      });
    }

    const decided = await Promise.all(
      prepared.flatMap(({ factId, proposalId }) =>
        [
          approve(owner.cookie, workspaceId, proposalId).then((r) => ({
            kind: "approve" as const,
            factId,
            code: r.statusCode,
          })),
          retract(owner.cookie, workspaceId, novelId, factId).then((r) => ({
            kind: "retract" as const,
            factId,
            code: r.statusCode,
          })),
        ],
      ),
    );

    const rows = await db.canonFact.findMany({
      where: { novelId, id: { in: prepared.map((p) => p.factId) } },
      select: { id: true, status: true, supersededById: true },
    });
    expect(rows).toHaveLength(N);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const { factId } of prepared) {
      const pair = decided.filter((d) => d.factId === factId);
      const retractWon = pair.some(
        (d) => d.kind === "retract" && d.code >= 200 && d.code < 300,
      );
      const row = byId.get(factId);
      expect(row).toBeDefined();
      // A withdrawal the API reported as done must actually be the state the
      // row is left in. The unpredicated supersede update rewrote a row the
      // retract had already committed, so the client was told the fact was
      // gone while the stored row read SUPERSEDED and carried a successor —
      // the state ADR-0008 §1 says cannot exist, and every as-of query after
      // that chapter kept answering with the "withdrawn" value.
      //
      // Only the retract direction is asserted: both requests can legally
      // succeed in sequence (retract commits, approve then finds no live
      // fact and mints a fresh one rather than superseding anything), so
      // "exactly one winner" is not an invariant here.
      if (retractWon) {
        expect(row?.status).toBe("RETRACTED");
        expect(row?.supersededById).toBeNull();
      }
    }
  });

  it("accepts a dated replacement, keeping the old value reconstructable", async () => {    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    const entityId = await createEntity(owner.cookie, workspaceId, novelId, "Ling Fan");

    await createFact(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "black",
      validFromChapter: 10,
    });
    // Dated: the correction takes effect at ch 20, so ch 5..19 still answer
    // with the old value — the property the undated case cannot preserve.
    const proposed = await propose(owner.cookie, workspaceId, novelId, {
      entityId,
      predicate: "hair-colour",
      objectText: "white",
      validFromChapter: 20,
    });
    expect((await approve(owner.cookie, workspaceId, proposed.body.id as string)).statusCode).toBe(200);

    const old = await db.canonFact.findFirstOrThrow({
      where: { novelId, objectText: "black" },
      select: { status: true, validUntilChapter: true },
    });
    expect(old.status).toBe("SUPERSEDED");
    expect(old.validUntilChapter).toBe(20);

    const objectAt = async (ch: number) => {
      const r = await ask(
        owner.cookie,
        workspaceId,
        novelId,
        { kind: "STATE", entityId, predicate: "hair-colour", atChapter: ch },
        { mode: "AUTHOR" },
      );
      const c = r.body.claim as Record<string, unknown> | null;
      return (c?.object as Record<string, unknown>)?.objectText;
    };
    expect(await objectAt(15)).toBe("black");
    expect(await objectAt(25)).toBe("white");
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

  // Slice 2 implemented these legs. The honest-empty contract replaces the
  // NOT_IMPLEMENTED marker: an implemented leg answers `answered: true` even
  // when nothing is stored — the ledger being empty is itself the finding
  // (basis null + insufficient, so it can't be mistaken for "false"), while
  // the marker said nothing at all about the world.
  it("answers the event/debt legs with an honest empty ledger on a fresh novel", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");

    for (const kind of ["EVENT", "CAUSAL", "UNRESOLVED", "PROMISES"] as const) {
      const res = await ask(owner.cookie, workspaceId, novelId, { kind }, { mode: "AUTHOR" });
      expect(res.statusCode, kind).toBe(200);
      expect(res.body.answered, kind).toBe(true);
      expect(res.body.insufficient, kind).toBe(true);
      expect(res.body.basis, kind).toBe(null);
    }
  });

  // The RETRIEVAL leg is the one answer path that reaches the search service,
  // and it had no assertion at all — the docs claimed the Brain answers
  // "FACT, STATE and RETRIEVAL with evidence" while nothing exercised the
  // third. `basis` is the specific thing that had drifted: a null basis with
  // `insufficient: true` on one kind and a non-null "SUGGESTION" on another.
  it("answers RETRIEVAL with hits, marking prose recall as a suggestion", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");
    await seedReferenceChunk(owner, workspaceId, novelId, "The capital is Aldermere.");

    const hit = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "RETRIEVAL", query: "capital" },
      { mode: "AUTHOR" },
    );
    expect(hit.statusCode).toBe(200);
    expect(hit.body.answered).toBe(true);
    expect((hit.body.hits as unknown[]).length).toBeGreaterThan(0);
    // Reference material is guidance, never story truth (CLAUDE.md §3).
    expect(hit.body.basis).toBe("SUGGESTION");
    expect(hit.body.insufficient).toBe(false);
  });

  it("reports an unbacked RETRIEVAL as insufficient with a null basis", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "w1");

    const miss = await ask(
      owner.cookie,
      workspaceId,
      novelId,
      { kind: "RETRIEVAL", query: "nothing in the corpus matches this" },
      { mode: "AUTHOR" },
    );
    expect(miss.body).toMatchObject({ answered: true, insufficient: true, basis: null });
    expect(miss.body.hits).toEqual([]);
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
    // The withheld COUNT is not reported to a reader: `withheldCount: 2` is
    // an existence oracle that distinguishes "no such fact" from "a fact you
    // may not see", which is the one distinction the boundary exists to
    // erase. It stays 0 so the two cases are identical.
    expect(reader3.withheldCount).toBe(0);
    // Evidence spans are omitted for a reader: a quote is raw source text and
    // neither version table carries a boundary, so it cannot be gated.
    expect("sources" in (reader3.facts[0] ?? {})).toBe(false);

    const reader400 = await asReader(400);
    // The unclassified row is still withheld at ANY position.
    expect(reader400.facts.map((f) => f.objectText).sort()).toEqual(["the prince", "visible"]);
    expect(reader400.withheldCount).toBe(0);

    // A withheld row must be indistinguishable from an absent one: the SAME
    // query for a predicate that does not exist has to produce the same body.
    const absent = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=READER&readerChapter=3&predicate=nonexistent`,
      headers: { cookie: owner.cookie },
    });
    const withheld = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/novels/${novelId}/canon/facts?mode=READER&readerChapter=3&predicate=late`,
      headers: { cookie: owner.cookie },
    });
    expect(withheld.json()).toEqual(absent.json());

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
