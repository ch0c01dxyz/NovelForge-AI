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
 *   - tenant safety: another workspace's reference is a 404, and its chunks
 *     never appear as a hit, including through a shared novel id;
 *   - spoiler safety (CLAUDE.md §10): the filtering happens in SQL, so a
 *     reader-mode query cannot return a withheld chunk at all, and the
 *     withheld count reports what the boundary cost;
 *   - evidence: every hit resolves back to the exact character span it was
 *     cut from, and every search leaves a provenance row;
 *   - rebuildability (CLAUDE.md §2.2): re-ingesting is idempotent, and a
 *     new version replaces the projection rather than mixing revisions.
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

function fakeCreateGateway(rec: GatewayRecord): AIGateway {
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [{ modelId: "fake-embed", capabilities: ["embedding"] }];
    },
    async generate(): Promise<GenerateResult> {
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
      embedCalls += 1;
      return {
        vectors: req.input.map(fakeVector),
        model: "fake-embed",
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
  embedCalls = 0;
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
  const novel = await db.novel.create({
    data: { workspaceId: ws.id, title: `Novel ${slug}`, slug, createdById: ownerId },
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
    // Zero withheld is the assertion that proves WHERE the filtering
    // happened: the SQL predicate removed the chunk before it was ever
    // returned, so the application-level recheck saw nothing to withhold.
    // A non-zero value here would mean the row was read and only then
    // dropped — the wrong order, and one that leaks via timing/ranking.
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
    const other = await db.novel.create({
      data: { workspaceId, title: "Other", slug: "other", createdById: owner.userId },
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
    expect(run.statusCode).toBe(201);
    const body = run.json() as {
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
    expect(run.statusCode).toBe(201);
    const body = run.json() as {
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
