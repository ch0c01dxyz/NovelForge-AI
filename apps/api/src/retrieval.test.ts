/**
 * Knowledge / retrieval integration suite (Phase 5).
 *
 * Dedicated novelforge_test_phase5 db. No test reaches a real provider:
 * the gateway adapter is faked through `BuildAppOptions.createGateway`, so
 * embedding runs through the REAL Phase 3 path — routing, retries, the
 * generation ledger — and the vectors land in the real pgvector column.
 *
 * Covers the roadmap Phase 5 exit criterion — "retrieval is
 * evidence-bearing and tenant-safe" — by asserting the specific ways it
 * can fail:
 *
 *   - tenant safety: another workspace's reference is a 404, its chunks
 *     never appear in another workspace's results, and a novel-scoped
 *     reference is absent from a query for a different novel;
 *   - spoiler safety (CLAUDE.md §10): a reader cannot get a withheld chunk,
 *     an unclassified chunk stays invisible at any reader position, and the
 *     boundary rules are enforced rather than defaulted;
 *   - evidence: every hit resolves back to the exact character span it was
 *     cut from, and every search leaves a provenance row;
 *   - rebuildability (CLAUDE.md §2.2): re-ingesting unchanged content skips
 *     without a second provider call, and changing the spoiler boundary
 *     re-ingests instead of silently skipping;
 *   - failure honesty: an all-legs-down search is a 502, not an empty 200.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import type { AIGateway, GatewayRecord, GenerateResult } from "@novelforge/ai-core";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";
import { createTestDriver, type TestDriver } from "./workflow-test-driver.ts";

const TEST_DB = "novelforge_test_phase5";
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

const ENCRYPTION_KEY = "unit-test-encryption-key";
const DIMENSION = 1536;

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
  APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  AI_ROUTING_STRATEGY: "PRIORITY",
};

/**
 * Deterministic unit vector from a text. Not a real embedding — it only
 * has to be stable, the right width, and distinct per text so the vector
 * leg returns a non-degenerate ranking.
 */
function fakeVector(text: string): number[] {
  const v = new Array<number>(DIMENSION).fill(0);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = (h ^ text.charCodeAt(i)) * 16777619;
  }
  // Spread the hash over a few buckets and normalize, so cosine distance
  // between two different texts is well-defined and non-zero.
  for (let k = 0; k < 16; k += 1) {
    h = (h ^ (h >>> 13)) * 2654435761;
    v[Math.abs(h) % DIMENSION] = 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

let embedCalls = 0;
/** When set, the fake embed returns this verbatim instead of a real vector. */
let poisonVector: number[] | null = null;
/**
 * When set, called with the incoming texts BEFORE embedding. Used to inject
 * a concurrent DB mutation at the exact moment the embed leg holds stale
 * chunk ids — the interleaving a plain concurrent request cannot force.
 */
let embedHook: ((texts: string[]) => Promise<void> | void) | null = null;

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  // The model id carries the gateway name so two gateways expose DISTINCT
  // model ids — mirroring real deployments, where different gateways serve
  // different providers under different names.
  const modelId = `fake-embed-${rec.name}`;
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId, capabilities: ["embedding"] }];
    },
    async generate(): Promise<GenerateResult> {
      return {
        content: '{"summary":"ok"}',
        model: modelId,
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      };
    },
    async *generateStream() {
      yield { delta: "unused" };
    },
    async embed(req) {
      embedCalls += 1;
      if (embedHook) {
        await embedHook(req.input);
        embedHook = null;
      }
      return {
        vectors: poisonVector ? req.input.map(() => poisonVector!) : req.input.map(fakeVector),
        model: modelId,
        inputTokens: req.input.length,
      };
    },
    async healthCheck() {
      return { healthy: true, category: null };
    },
  };
}

let db: NovelForgeDb;
let app: FastifyInstance;
let driver: TestDriver;

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
  driver = createTestDriver(db, {
    encryptionKey: ENCRYPTION_KEY,
    createGateway: fakeCreateGateway,
  });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  embedCalls = 0;
  poisonVector = null;
  embedHook = null;
  // Self-heal before anything else: the all-legs-down test renames the
  // tsvector column to force a query failure, and a run killed between the
  // rename and its restore would fail every later suite with an unrelated
  // "column does not exist". Cheaper than debugging that.
  await db.$executeRawUnsafe(
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chunks' AND column_name = 'content_ts_hidden')
       THEN ALTER TABLE chunks RENAME COLUMN content_ts_hidden TO content_ts;
       END IF;
     END $$`,
  );
  // Order matters: retrieval audits reference step runs and generations.
  await db.retrievalAudit.deleteMany();
  await db.workflowStepRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.workflowVersion.deleteMany();
  await db.workflow.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
  await db.generationAttempt.deleteMany();
  await db.generation.deleteMany();
  await db.modelProfileMapping.deleteMany();
  await db.aIModel.deleteMany();
  await db.aIGateway.deleteMany();
  await db.auditLog.deleteMany();
  // Chunks/embeddings cascade from reference versions, but be explicit: a
  // leftover embedding would make the idempotence assertions pass for the
  // wrong reason.
  await db.$executeRawUnsafe(`DELETE FROM embeddings`);
  await db.$executeRawUnsafe(`DELETE FROM chunks`);
  await db.reference.updateMany({ data: { currentVersionId: null } });
  await db.referenceVersion.deleteMany();
  await db.reference.deleteMany();
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

async function seedWorkspace(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
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

/** Route a model to the EMBEDDING profile so ingestion and search can run. */
async function seedEmbeddingRoute(): Promise<void> {
  const platformAdmin = await seedUser("platform-admin@example.com", "SUPER_ADMIN");
  const cookie = platformAdmin.cookie;
  const gw = await app.inject({
    method: "POST",
    url: "/api/gateways",
    headers: { cookie },
    payload: { name: "phase5-gw", baseUrl: "http://localhost:20128", apiKey: "sk-secret" },
  });
  expect(gw.statusCode).toBe(201);
  const gatewayId = (gw.json() as { id: string }).id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/gateways/${gatewayId}/sync-models`,
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(200);
  const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
  const model = (models.json() as Array<{ id: string }>)[0]!;
  expect(
    (
      await app.inject({
        method: "PUT",
        url: "/api/model-profiles",
        headers: { cookie },
        payload: { profile: "EMBEDDING", modelId: model.id },
      })
    ).statusCode,
  ).toBe(200);
}

/**
 * Create a reference through the API, ingest it, and publish it.
 *
 * `boundary` is passed to ingest: omitting it leaves every chunk
 * reader-invisible, which is the safe default the schema is built around.
 */
async function seedReference(
  cookie: string,
  workspaceId: string,
  opts: {
    key: string;
    content: string;
    novelId?: string;
    boundary?: number | null;
    publish?: boolean;
  },
): Promise<{ referenceId: string; versionId: string }> {
  const created = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/references`,
    headers: { cookie },
    payload: {
      key: opts.key,
      title: opts.key,
      kind: "GUIDE",
      content: opts.content,
      ...(opts.novelId ? { novelId: opts.novelId } : {}),
    },
  });
  expect(created.statusCode).toBe(201);
  const { id, versionId } = created.json() as { id: string; versionId: string };

  const ingest = await app.inject({
    method: "POST",
    url: `/api/reference-versions/${versionId}/ingest`,
    headers: { cookie },
    payload: opts.boundary !== undefined ? { availableFromChapter: opts.boundary } : {},
  });
  expect(ingest.statusCode).toBe(200);

  if (opts.publish !== false) {
    const pub = await app.inject({
      method: "POST",
      url: `/api/references/${id}/publish`,
      headers: { cookie },
    });
    expect(pub.statusCode).toBe(200);
  }
  return { referenceId: id, versionId };
}

// Distinct enough per paragraph that the chunker cuts here and the lexical
// leg has real terms to match; "oath" appears only in the first paragraph,
// so a reader-mode query on it is a clean spoiler test.
const OATH_TEXT = [
  "The oath binds every knight of the realm to silence until the last bell.",
  "A second paragraph about the harvest festival and its many small customs.",
];
const REVEAL_TEXT = "The oath is broken in the final chapter, when the last bell rings.";

function searchBody(query: string, extra: Record<string, unknown> = {}) {
  return { query, mode: "AUTHOR", limit: 5, ...extra };
}

describe("reference ingestion", () => {
  it("chunks an ingested reference and makes it citable to its exact span", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const content = OATH_TEXT.join("\n\n");
    await seedReference(owner.cookie, workspaceId, { key: "lore", content });

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      hits: Array<{ text: string; start: number; end: number; referenceTitle: string }>;
      retrievers: string[];
      auditId: string;
    };
    expect(body.hits.length).toBeGreaterThan(0);

    const hit = body.hits[0]!;
    // The exit criterion in one assertion: a citation is only evidence if
    // the span it names actually contains the text that was embedded.
    expect(content.slice(hit.start, hit.end)).toBe(hit.text);
    expect(hit.text).toContain("oath");
    expect(body.retrievers).toContain("LEXICAL");
    expect(body.retrievers).toContain("VECTOR");
  });

  it("is idempotent: re-ingesting unchanged content does not re-embed", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const { versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
      publish: false,
    });

    const before = embedCalls;
    const again = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { skipped: boolean }).skipped).toBe(true);
    // The point of the assertion: a skip means no second provider call.
    expect(embedCalls).toBe(before);
  });

  it("re-ingests when the spoiler boundary changes instead of reporting a skip", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    // Ingested WITHOUT a boundary, so every chunk is reader-invisible.
    const { referenceId, versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
      publish: false,
    });

    const aReader = async () =>
      (
        await app.inject({
          method: "POST",
          url: `/api/workspaces/${workspaceId}/retrieval/search`,
          headers: { cookie: owner.cookie },
          payload: { query: "oath", mode: "READER", readerChapter: 50, limit: 5 },
        })
      ).json() as { hits: unknown[] };

    // Publish so the reference is in the retrieval scope; a null boundary
    // still keeps it out of READER results.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/references/${referenceId}/publish`,
          headers: { cookie: owner.cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect((await aReader()).hits).toHaveLength(0);

    // Setting a boundary on an already-ingested version is a real request.
    // The skip condition used to return `skipped: true` for exactly this
    // case, so every chunk kept its old (null) boundary and the reference
    // stayed invisible to readers despite the re-ingest appearing to work.
    const reingest = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: { availableFromChapter: 10 },
    });
    expect(reingest.statusCode).toBe(200);
    expect((reingest.json() as { skipped: boolean }).skipped).toBe(false);

    // The chunks were rewritten and re-embedded, so the boundary took effect.
    expect((await aReader()).hits.length).toBeGreaterThan(0);
  });

  it("takes a new version out of scope until it is re-ingested and re-published", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const { referenceId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    const search = async (q: string) =>
      (
        await app.inject({
          method: "POST",
          url: `/api/workspaces/${workspaceId}/retrieval/search`,
          headers: { cookie: owner.cookie },
          payload: searchBody(q),
        })
      ).json() as { hits: unknown[] };

    expect((await search("oath")).hits.length).toBeGreaterThan(0);

    // A new version supersedes the ingested projection. Both search legs
    // join on `r.current_version_id = rv.id`, so the moment that pointer
    // moves the old chunks stop matching and the new version has none.
    const created = await app.inject({
      method: "POST",
      url: `/api/references/${referenceId}/versions`,
      headers: { cookie: owner.cookie },
      payload: { content: "An entirely different body of text, with no oath in it." },
    });
    expect(created.statusCode).toBe(201);
    const { versionId } = created.json() as { versionId: string };

    // The reference must not claim to be in the retrieval scope while it has
    // nothing to retrieve: the old version's chunks are now unreachable, and
    // a stale ACTIVE was invisible to the author and to search alike.
    const afterVersion = await app.inject({
      method: "GET",
      url: `/api/references/${referenceId}`,
      headers: { cookie: owner.cookie },
    });
    expect((afterVersion.json() as { status: string }).status).toBe("DRAFT");
    expect((await search("oath")).hits).toHaveLength(0);

    const ingest = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(ingest.statusCode).toBe(200);

    // Publishing again is the step that puts it back. Returning early on
    // ACTIVE made this a silent no-op for exactly the case that needed it.
    const pub = await app.inject({
      method: "POST",
      url: `/api/references/${referenceId}/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(pub.statusCode).toBe(200);
    expect((await search("oath")).hits.length).toBeGreaterThan(0);
  });

  it("does not clear a boundary when a repair re-ingest omits the option", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const { referenceId, versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
      boundary: 900,
    });

    // Make the projection incomplete so the next ingest takes the repair
    // path — the only route past the skip guard on an unchanged version.
    await db.$executeRawUnsafe(`DELETE FROM embeddings`);

    const repair = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(repair.statusCode).toBe(200);
    expect((repair.json() as { skipped: boolean }).skipped).toBe(false);

    // The boundary must survive the rewrite. Reading the chunks directly is
    // the point: an omitted option used to write NULL, un-classifying every
    // chunk and widening what a reader at chapter 10 could see.
    const rows = await db.chunk.findMany({
      where: { referenceVersionId: versionId },
      select: { availableFromChapter: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.availableFromChapter).toBe(900);

    // And the reader still cannot reach it, which is the consequence that
    // actually matters (boundary 900 is far above the reader's chapter).
    const reader = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: { query: "oath", mode: "READER", readerChapter: 10, limit: 5 },
    });
    expect((reader.json() as { hits: unknown[] }).hits).toHaveLength(0);
    expect(referenceId).toBeTruthy();
  });

  it("does not rank an embedding produced by a different model", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // A query no lexical term matches, so anything returned came from the
    // vector leg alone. fakeVector always produces a vector, so the leg
    // returns nearest neighbours for any input.
    const vectorOnly = { query: "qwxzkjv", mode: "AUTHOR", limit: 5 };
    const first = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: vectorOnly,
    });
    const firstBody = first.json() as { hits: unknown[]; retrievers: string[] };
    expect(firstBody.hits.length).toBeGreaterThan(0);
    expect(firstBody.retrievers).toContain("VECTOR");

    // dimensions alone cannot exclude a stale model: every 1536-wide
    // embedding passes that check regardless of who produced it, so a
    // profile change left old vectors being ranked against a query vector
    // from a different model — distances between unrelated vector spaces.
    const changed = await db.$executeRawUnsafe(`UPDATE embeddings SET model = 'other-model'`);
    expect(Number(changed)).toBeGreaterThan(0);

    const second = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: vectorOnly,
    });
    const secondBody = second.json() as { hits: unknown[]; retrievers: string[] };
    // Nothing to rank in that vector space, so no hits — but the leg still
    // ran, which is what distinguishes this from a broken index.
    expect(secondBody.hits).toHaveLength(0);
    expect(secondBody.retrievers).toContain("VECTOR");

    // Re-ingesting must be able to repair that. The skip guard originally
    // looked only at chunk/vector counts, so it reported "already done" for
    // vectors from a model the search leg would no longer accept — the one
    // operation that could have fixed the reference was the one it refused.
    const { versionId } = await db.reference.findFirstOrThrow({
      where: { workspaceId },
      select: { currentVersionId: true },
    }).then((r) => ({ versionId: r.currentVersionId! }));
    const repair = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(repair.statusCode).toBe(200);
    expect((repair.json() as { skipped: boolean }).skipped).toBe(false);

    const third = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: vectorOnly,
    });
    expect((third.json() as { hits: unknown[] }).hits.length).toBeGreaterThan(0);
  });

  it("answers a duplicate key with 409, not 500", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const create = () =>
      app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/references`,
        headers: { cookie: owner.cookie },
        payload: { key: "dup", title: "Dup", content: "some text" },
      });

    expect((await create()).statusCode).toBe(201);
    // The unique index is the real check, so its violation is a client
    // mistake — an unmapped P2002 surfaced as an opaque 500 INTERNAL.
    expect((await create()).statusCode).toBe(409);
  });

  it("does not 500 when versions are appended concurrently", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/references`,
      headers: { cookie: owner.cookie },
      payload: { key: "raced", title: "Raced", content: "first" },
    });
    const { id } = created.json() as { id: string };

    // Each appender reads the highest number and inserts the next one, so
    // concurrent calls all pick the same number and all but one lose the
    // `@@unique([referenceId, number])` race. That is a lost race, not a
    // malformed request: it must resolve to a retry, never a 500.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: "POST",
          url: `/api/references/${id}/versions`,
          headers: { cookie: owner.cookie },
          payload: { content: `body ${i}` },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);

    // The numbers must still be a gap-free run from 1, which is what the
    // retry guarantees and a bare 409 would not.
    const versions = await db.referenceVersion.findMany({
      where: { referenceId: id },
      orderBy: { number: "asc" },
      select: { number: true },
    });
    expect(versions.map((v) => v.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("treats a disabled model as no route, so re-ingest repairs rather than skips", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const { versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
      publish: false,
    });

    // Disable the mapped model. The router requires model.enabled and
    // gateway.enabled, so the vector leg can now route nothing — and the
    // skip guard must agree with the router, not with a weaker filter. When
    // it did not, it reported "already done" for vectors search could never
    // reach, refusing the one operation that could repair the reference.
    const model = await db.aIModel.findFirstOrThrow({ select: { id: true } });
    const admin = await seedUser("model-admin@example.com", "SUPER_ADMIN");
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/models/${model.id}`,
      headers: { cookie: admin.cookie },
      payload: { enabled: false },
    });
    expect(patched.statusCode).toBe(200);

    const again = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    // It must TRY, not skip. The embed then fails because no route is
    // available, which is the honest outcome: a loud failure beats a silent
    // "already done" for a reference that is not actually searchable.
    expect(again.statusCode).not.toBe(200);
    expect((again.json() as { skipped?: boolean }).skipped).toBeUndefined();
  });

  it("does not skip when two enabled models could both win the route", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();

    // A second enabled gateway+model, also mapped to EMBEDDING. The router
    // picks among enabled mappings by priority, so the model the vector leg
    // filters on (`e.model = <what this query embedded with>`) can differ
    // per request. The skip guard's modelsMatch compares ONE stored model
    // against ONE resolved model — with two candidates that proof does not
    // hold, and a skip would report "already done" for vectors some
    // searches can never reach.
    const platformAdmin = await seedUser("second-gw-admin@example.com", "SUPER_ADMIN");
    const cookie = platformAdmin.cookie;
    const gw = await app.inject({
      method: "POST",
      url: "/api/gateways",
      headers: { cookie },
      payload: { name: "phase5-gw-2", baseUrl: "http://localhost:20128", apiKey: "sk-secret" },
    });
    expect(gw.statusCode).toBe(201);
    const gatewayId = (gw.json() as { id: string }).id;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/gateways/${gatewayId}/sync-models`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    const models = await app.inject({ method: "GET", url: "/api/models", headers: { cookie } });
    const all = models.json() as Array<{ id: string }>;
    const used = await db.modelProfileMapping.findMany({
      where: { profile: "EMBEDDING" },
      select: { modelRef: true },
    });
    const usedIds = new Set(used.map((m) => m.modelRef));
    const second = all.find((m) => !usedIds.has(m.id))!;
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/model-profiles",
          headers: { cookie },
          payload: { profile: "EMBEDDING", modelId: second.id },
        })
      ).statusCode,
    ).toBe(200);

    const { versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });
    // Fully ingested, but the guard must still refuse to skip: it cannot
    // prove the stored model is the one a future search will embed with.
    const again = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { skipped?: boolean }).skipped).toBe(false);
  });

  it("reports an ingest-time provider fault as 502, not 409", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/references`,
      headers: { cookie: owner.cookie },
      payload: { key: "poison-ingest", title: "Poison Ingest", content: OATH_TEXT.join("\n\n") },
    });
    const { versionId } = created.json() as { versionId: string };

    // The provider returns an unusable vector. The request and the content
    // are both valid — the upstream is the fault — so the honest status is
    // 502 BAD_GATEWAY. Reporting 409 would tell the author their content
    // conflicted with something, which it did not.
    const poison = new Array<number>(DIMENSION).fill(0);
    poison[0] = Number.POSITIVE_INFINITY;
    poisonVector = poison;
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/reference-versions/${versionId}/ingest`,
        headers: { cookie: owner.cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ error: "BAD_GATEWAY" });
    } finally {
      poisonVector = null;
    }
  });

  it("refuses to publish a reference that has no ingested chunks", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/references`,
      headers: { cookie: owner.cookie },
      payload: { key: "empty", title: "Empty", content: "something" },
    });
    const { id } = created.json() as { id: string };
    // Publishing puts a reference in the retrieval scope; without chunks it
    // could never be found, which the author would read as a broken index.
    const pub = await app.inject({
      method: "POST",
      url: `/api/references/${id}/publish`,
      headers: { cookie: owner.cookie },
    });
    expect(pub.statusCode).toBe(409);
  });

  it("never leaves a published reference on a chunkless current version", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/references`,
      headers: { cookie: owner.cookie },
      payload: { key: "race-pub", title: "Race Pub", content: OATH_TEXT.join("\n\n") },
    });
    const { id, versionId } = created.json() as { id: string; versionId: string };
    const ingest = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(ingest.statusCode).toBe(200);

    // A publish reads the current version, counts its chunks, then updates
    // the status. If a version append commits between that read and the
    // update, the update re-activates the reference against the NEW version
    // — which has no chunks, so an ACTIVE reference becomes invisible to
    // search while reading ACTIVE. The append is injected right after the
    // publish's read so the interleave is deterministic, not a lottery.
    const origFindUniqueOrThrow = db.reference.findUniqueOrThrow.bind(db.reference);
    let injected = false;
    db.reference.findUniqueOrThrow = (async (
      ...args: Parameters<typeof origFindUniqueOrThrow>
    ) => {
      const result = await origFindUniqueOrThrow(...args);
      if (!injected && args[0]?.where && "id" in args[0].where && args[0].where.id === id) {
        injected = true;
        await app.inject({
          method: "POST",
          url: `/api/references/${id}/versions`,
          headers: { cookie: owner.cookie },
          payload: { content: "racing body" },
        });
      }
      return result;
    }) as unknown as typeof db.reference.findUniqueOrThrow;

    let pub: Awaited<ReturnType<typeof app.inject>>;
    try {
      pub = await app.inject({
        method: "POST",
        url: `/api/references/${id}/publish`,
        headers: { cookie: owner.cookie },
      });
    } finally {
      db.reference.findUniqueOrThrow = origFindUniqueOrThrow;
    }

    // The publish raced a version add and lost: its chunk count described a
    // version that is no longer current. It must fail loudly, never commit
    // ACTIVE over the demoted pointer.
    expect(pub.statusCode).toBe(409);
    const ref = await db.reference.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        currentVersion: { select: { _count: { select: { chunks: true } } } },
      },
    });
    if (ref.status === "ACTIVE") {
      expect(ref.currentVersion?._count.chunks).toBeGreaterThan(0);
    }
  });

  it("repairs a stale embed whose chunk ids a concurrent re-ingest deleted", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const { versionId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // Two re-ingests of the same version overlap: the second one's delete
    // commits while the first holds chunk ids it read before the delete.
    // The first's embedding upsert then violates the embeddings→chunks FK.
    // That is a lost interleaving, not a broken request — it must resolve by
    // re-reading the ids and embedding once more, never surface as a 500.
    embedHook = async () => {
      embedHook = null; // the inner re-ingest's own embed must not recurse
      await app.inject({
        method: "POST",
        url: `/api/reference-versions/${versionId}/ingest`,
        headers: { cookie: owner.cookie },
        payload: { availableFromChapter: 3 }, // differs → forces delete+insert
      });
    };

    const again = await app.inject({
      method: "POST",
      url: `/api/reference-versions/${versionId}/ingest`,
      headers: { cookie: owner.cookie },
      payload: { availableFromChapter: 2 },
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { skipped?: boolean }).skipped).toBe(false);

    // The version ends fully embedded under the winning boundary, whatever
    // the interleaving: every chunk carries a vector.
    const chunks = await db.chunk.count({ where: { referenceVersionId: versionId } });
    const vectors = await db.embedding.count({
      where: { chunk: { is: { referenceVersionId: versionId } } },
    });
    expect(chunks).toBeGreaterThan(0);
    expect(vectors).toBe(chunks);
  });

  it("keeps a DRAFT reference out of search until it is published", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "draft-lore",
      content: OATH_TEXT.join("\n\n"),
      publish: false,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { hits: unknown[] }).hits).toHaveLength(0);
  });
});

describe("spoiler safety", () => {
  it("withholds a chunk above the reader's chapter, and counts it", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "reveal",
      content: REVEAL_TEXT,
      boundary: 900,
    });

    // AUTHOR sees it: an editor reviewing early chapters needs the late
    // notes to check foreshadowing.
    const author = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("broken final chapter"),
    });
    expect(author.statusCode).toBe(200);
    expect((author.json() as { hits: unknown[] }).hits.length).toBeGreaterThan(0);

    // A reader at chapter 10 must not see it, and must not be able to tell
    // the difference between "withheld" and "not indexed" from the hits.
    const reader = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: {
        query: "broken final chapter",
        mode: "READER",
        readerChapter: 10,
        limit: 5,
      },
    });
    expect(reader.statusCode).toBe(200);
    const readerBody = reader.json() as { hits: unknown[]; withheldCount: number; mode: string };
    expect(readerBody.hits).toHaveLength(0);
    expect(readerBody.mode).toBe("READER");
    // `withheldCount` is 0 here because the SQL predicate removed the chunk
    // before it was ever returned, so the application-level recheck had
    // nothing to drop. That is the correct value — but it is also the value
    // a broken query would produce, so it is NOT evidence on its own. The
    // evidence is the pair below: the reader sees nothing, and the AUTHOR
    // query in the same state DOES see the chunk. Only the boundary differs.
    expect(readerBody.withheldCount).toBe(0);

    // And once the reader has reached it, it appears.
    const later = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: {
        query: "broken final chapter",
        mode: "READER",
        readerChapter: 900,
        limit: 5,
      },
    });
    expect((later.json() as { hits: unknown[] }).hits.length).toBeGreaterThan(0);
  });

  it("withholds an unclassified chunk (no boundary) from readers", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    // No boundary at all — the common case for imported research.
    await seedReference(owner.cookie, workspaceId, {
      key: "unclassified",
      content: REVEAL_TEXT,
    });

    const reader = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: {
        query: "broken final chapter",
        mode: "READER",
        readerChapter: 100_000,
        limit: 5,
      },
    });
    expect((reader.json() as { hits: unknown[] }).hits).toHaveLength(0);
  });

  it("requires a reader position rather than defaulting to the start", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    const missing = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: { query: "oath", mode: "READER" },
    });
    expect(missing.statusCode).toBe(400);

    // A reader position on an author query would look like it filtered
    // something, so it is refused rather than ignored.
    const misplaced = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: { query: "oath", mode: "AUTHOR", readerChapter: 3 },
    });
    expect(misplaced.statusCode).toBe(400);
  });
});

describe("tenant isolation", () => {
  it("distinguishes a broken index from an empty one", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    // No embedding route, so the vector leg cannot run at all; the lexical
    // leg still queries. Both legs answering (even emptily) is a search that
    // matched nothing, which must be reported as such...
    const empty = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { hits: unknown[] }).hits).toHaveLength(0);

    // ...whereas EVERY leg failing is an outage, and must not be reported as
    // an empty knowledge base — the caller would draw the wrong conclusion
    // about the index. Take the lexical leg down by dropping the GIN index's
    // table dependency: point the search at a workspace whose chunks table
    // query fails. Simplest honest simulation: rename the tsvector column
    // out from under the query.
    await db.$executeRawUnsafe(
      `ALTER TABLE chunks RENAME COLUMN content_ts TO content_ts_hidden`,
    );
    try {
      const broken = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/retrieval/search`,
        headers: { cookie: owner.cookie },
        payload: searchBody("oath"),
      });
      // 502, not 200-with-zero-hits.
      expect(broken.statusCode).toBe(502);
    } finally {
      await db.$executeRawUnsafe(
        `ALTER TABLE chunks RENAME COLUMN content_ts_hidden TO content_ts`,
      );
    }
  });

  it("reports a non-finite provider vector as a fault, not a degraded search", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // A provider can return NaN/Infinity (JSON.parse('[1e400]') yields
    // Infinity). The value is stringified into a SQL vector literal, so it
    // must be rejected before that. The rejection is a PROVIDER fault, so
    // it must surface as a classified error — recording it as a failed leg
    // instead would report "the vector leg is unavailable" and send the
    // operator to debug the database when the cause is upstream.
    const poison = new Array<number>(DIMENSION).fill(0);
    poison[0] = Number.POSITIVE_INFINITY;
    poisonVector = poison;

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    // 502 BAD_GATEWAY (the BadGatewayError mapping), not a 200 whose
    // `retrievers` quietly omits VECTOR, and not 409 — the request was
    // valid, the upstream provider is the fault.
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "BAD_GATEWAY" });
  });

  it("hides another workspace's reference behind 404 and out of search", async () => {
    const alice = await seedUser("alice@example.com");
    const bob = await seedUser("bob@example.com");
    const a = await seedWorkspace(alice.userId, "ws-a");
    const b = await seedWorkspace(bob.userId, "ws-b");
    await seedEmbeddingRoute();
    const { referenceId } = await seedReference(alice.cookie, a.workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // Direct read by an outsider: 404, not 403 — a 403 would confirm the id.
    const stolen = await app.inject({
      method: "GET",
      url: `/api/references/${referenceId}`,
      headers: { cookie: bob.cookie },
    });
    expect(stolen.statusCode).toBe(404);

    // Bob's own workspace index must not contain Alice's material.
    const search = await app.inject({
      method: "POST",
      url: `/api/workspaces/${b.workspaceId}/retrieval/search`,
      headers: { cookie: bob.cookie },
      payload: searchBody("oath"),
    });
    expect(search.statusCode).toBe(200);
    expect((search.json() as { hits: unknown[] }).hits).toHaveLength(0);
  });

  it("keeps a novel-scoped reference out of a query for a different novel", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    const other = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
      actorUserId: owner.userId,
      workspaceId,
      title: "Other",
      slug: "other",
    });
    await seedReference(owner.cookie, workspaceId, {
      key: "novel-lore",
      content: OATH_TEXT.join("\n\n"),
      novelId,
    });

    const scoped = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath", { novelId }),
    });
    expect((scoped.json() as { hits: unknown[] }).hits.length).toBeGreaterThan(0);

    const wrongNovel = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath", { novelId: other.id }),
    });
    expect((wrongNovel.json() as { hits: unknown[] }).hits).toHaveLength(0);
  });

  it("refuses a reference read to a workspace outsider and to a VIEWER", async () => {
    const owner = await seedUser("owner@example.com");
    const viewer = await seedUser("viewer@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await db.membership.create({
      data: { workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    await seedEmbeddingRoute();
    const { referenceId } = await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // VIEWER is a member, so the scope check passes and the capability check
    // is what refuses: 403, not 404.
    const asViewer = await app.inject({
      method: "GET",
      url: `/api/references/${referenceId}`,
      headers: { cookie: viewer.cookie },
    });
    expect(asViewer.statusCode).toBe(403);
  });
});

describe("evidence and audit", () => {
  it("records a provenance row for every search, with its result set", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    const { auditId, hits } = res.json() as {
      auditId: string;
      hits: Array<{ chunkId: string }>;
    };

    const row = await db.retrievalAudit.findUniqueOrThrow({ where: { id: auditId } });
    expect(row.query).toBe("oath");
    expect(row.mode).toBe("AUTHOR");
    expect(row.returnedCount).toBe(hits.length);
    expect(row.retrievers).toContain("LEXICAL");
    // The stored results are what makes this reconstructable: the same
    // chunk ids the caller received, not just a count.
    const stored = row.results as unknown as Array<{ chunkId: string }>;
    expect(stored.map((s) => s.chunkId)).toEqual(hits.map((h) => h.chunkId));

    const history = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/retrievals`,
      headers: { cookie: owner.cookie },
    });
    expect(history.statusCode).toBe(200);
    expect((history.json() as Array<{ id: string }>)[0]!.id).toBe(auditId);
  });

  it("attributes the embedding call to a generation row", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    // Embeddings are AI calls that cost money, so they belong in the same
    // ledger as generations (CLAUDE.md §22).
    const generations = await db.generation.findMany({
      where: { workspaceId, modelProfile: "EMBEDDING" },
    });
    expect(generations.length).toBeGreaterThan(0);
    expect(generations.every((g) => g.task === "embed")).toBe(true);
    expect(generations.every((g) => g.status === "SUCCEEDED")).toBe(true);
    expect(generations.every((g) => g.userId === owner.userId)).toBe(true);

    // The audit row must name the generation that produced its query
    // vector. `generation_id` was declared on the row and on the search
    // input but no caller could ever populate it — `embed` did not return
    // the id — so the schema's promise that a retrieval links to its
    // generation was false for every row.
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/retrieval/search`,
      headers: { cookie: owner.cookie },
      payload: searchBody("oath"),
    });
    expect(res.statusCode).toBe(200);
    const audit = await db.retrievalAudit.findFirstOrThrow({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { generationId: true },
    });
    expect(audit.generationId).not.toBeNull();
    const linked = await db.generation.findUnique({ where: { id: audit.generationId! } });
    expect(linked?.task).toBe("embed");
  });
});

describe("RETRIEVAL workflow step", () => {
  it("searches the index and links its audit row to the step that issued it", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    await seedEmbeddingRoute();
    await seedReference(owner.cookie, workspaceId, {
      key: "lore",
      content: OATH_TEXT.join("\n\n"),
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "grounded",
        name: "grounded",
        graph: {
          steps: [{ key: "lookup", kind: "RETRIEVAL", instruction: "the oath" }],
          edges: [],
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: workflowId } = created.json() as { id: string };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/workflows/${workflowId}/publish`,
          headers: { cookie: owner.cookie },
        })
      ).statusCode,
    ).toBe(200);

    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(run.statusCode).toBe(202);
    const { id: runId } = run.json() as { id: string };
    await driver.driveRun(runId);
    const body = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
        headers: { cookie: owner.cookie },
      })
    ).json() as {
      status: string;
      output: Record<string, { hits: Array<Record<string, unknown>>; retrievers: string[] }>;
    };
    expect(body.status).toBe("SUCCEEDED");
    expect(body.output["lookup"]!.hits.length).toBeGreaterThan(0);
    expect(body.output["lookup"]!.retrievers).toContain("LEXICAL");

    const step = await db.workflowStepRun.findFirstOrThrow({ where: { stepKey: "lookup" } });
    const audit = await db.retrievalAudit.findFirstOrThrow({ where: { stepRunId: step.id } });
    expect(audit.workspaceId).toBe(workspaceId);
    expect(audit.mode).toBe("AUTHOR");
  });

  it("succeeds with zero hits on an empty index, recording which legs ran", async () => {
    const owner = await seedUser("owner@example.com");
    const { workspaceId } = await seedWorkspace(owner.userId, "ws-a");
    // No reference at all, and no embedding route: the lexical leg still
    // runs (against an empty table) and the vector leg cannot. "No matches"
    // and "index broken" must be distinguishable, which is what `retrievers`
    // in the output and the audit row are for.
    const created = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { cookie: owner.cookie },
      payload: {
        scope: "WORKSPACE",
        workspaceId,
        key: "empty-index",
        name: "empty-index",
        graph: {
          steps: [{ key: "lookup", kind: "RETRIEVAL", instruction: "the oath" }],
          edges: [],
        },
      },
    });
    const { id: workflowId } = created.json() as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/workflows/${workflowId}/publish`,
      headers: { cookie: owner.cookie },
    });
    const run = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(run.statusCode).toBe(202);
    const { id: runId } = run.json() as { id: string };
    await driver.driveRun(runId);
    const body = (
      await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/workflow-runs/${runId}`,
        headers: { cookie: owner.cookie },
      })
    ).json() as {
      status: string;
      output: Record<string, { hits: unknown[]; retrievers: string[] }>;
    };
    expect(body.status).toBe("SUCCEEDED");
    expect(body.output["lookup"]!.hits).toHaveLength(0);
    // The lexical leg ran and found nothing; the vector leg could not run
    // without an embedding route. Both facts are recorded, so the run does
    // not look like a complete search that happened to be empty.
    expect(body.output["lookup"]!.retrievers).toEqual(["LEXICAL"]);

    const step = await db.workflowStepRun.findFirstOrThrow({ where: { stepKey: "lookup" } });
    expect(step.status).toBe("SUCCEEDED");
    const audit = await db.retrievalAudit.findFirstOrThrow({ where: { stepRunId: step.id } });
    expect(audit.retrievers).toEqual(["LEXICAL"]);
    expect(audit.returnedCount).toBe(0);
  });
});
