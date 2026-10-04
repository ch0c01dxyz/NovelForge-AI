/**
 * Character & Relationship Intelligence (Phase 8) integration suite.
 *
 * Dedicated novelforge_test_phase8 db (parallel-safe per ADR-0003 §8). Every
 * test drives the real HTTP surface against a real migrated database.
 *
 * Covers the roadmap's Phase 8 exit criterion, quoted verbatim:
 *
 *   "Exit: monogamy/harem/polygamy and enemy-to-ally validation scenarios pass."
 *
 * Both are below, at the API boundary, because that is where the criterion
 * lives — a domain-package test would prove the rules and not the wiring.
 *
 * The last suite writes straight to the database, past every service guard,
 * because the overlap refusals are enforced by EXCLUDE constraints and a
 * service-guard test stays green with the constraint dropped (canon.test.ts
 * established the pattern; see its comment for why it is necessary).
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
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import type { AIGateway } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_phase8";
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
 * No test in this file reaches a provider — the Phase 8 routes issue no model
 * call at all. buildApp still wants a gateway factory, so it gets one that
 * would throw if anything ever did call it.
 */
function unusedGateway(): AIGateway {
  return {
    id: "unused",
    name: "unused",
    async listModels() {
      return [];
    },
    async generate() {
      throw new Error("Phase 8 issues no model call");
    },
    // Never yields: Phase 8 issues no model call at all, so any stream
    // request is a wiring bug worth failing loudly on.
    // eslint-disable-next-line require-yield
    async *generateStream(): AsyncGenerator<{ delta: string }> {
      throw new Error("Phase 8 issues no model call");
    },
    async embed() {
      throw new Error("Phase 8 issues no model call");
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
  // Child-first. character_knowledge -> canon_facts is ON DELETE RESTRICT, so
  // a canon fact cited by a belief cannot go before the belief does.
  await db.meaningfulInteraction.deleteMany();
  await db.bondTransition.deleteMany();
  await db.bondMember.deleteMany();
  await db.bond.deleteMany();
  await db.relationshipStance.deleteMany();
  await db.characterArcMilestone.deleteMany();
  await db.characterArc.deleteMany();
  await db.characterKnowledge.deleteMany();
  await db.characterState.deleteMany();
  await db.character.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonProposal.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
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

interface Fixture {
  cookie: string;
  workspaceId: string;
  novelId: string;
  userId: string;
}

async function seed(slug: string): Promise<Fixture> {
  const owner = await seedUser(`${slug}@example.com`);
  const { workspaceId, novelId } = await seedWorkspace(owner.userId, slug);
  return { cookie: owner.cookie, workspaceId, novelId, userId: owner.userId };
}

async function post(
  f: Fixture,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${url}`,
    headers: { cookie: f.cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function get(
  f: Fixture,
  url: string,
  query: Record<string, string | number> = {},
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${url}`,
    headers: { cookie: f.cookie },
    query: query as Record<string, string>,
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function makeCharacter(f: Fixture, key: string, name = key): Promise<string> {
  const res = await post(f, "/characters", { key, name });
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return res.body["id"] as string;
}

// ---------------------------------------------------------------------------

describe("enemy-to-ally: a stance turns on a dated chapter, and never overwrites", () => {
  it("records the turn as a second span and reads it back as of a chapter", async () => {
    const f = await seed("eta");
    const aria = await makeCharacter(f, "aria");
    const boros = await makeCharacter(f, "boros");

    const enmity = await post(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: boros,
      stance: "ENEMY",
      fromChapter: 1,
      toChapter: 50,
    });
    expect(enmity.statusCode, JSON.stringify(enmity.body)).toBe(201);

    const alliance = await post(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: boros,
      stance: "ALLY",
      fromChapter: 50,
    });
    expect(alliance.statusCode, JSON.stringify(alliance.body)).toBe(201);

    // Before the turn: still enemies. Half-open windows, so 49 is the last
    // enemy chapter and 50 is the first allied one.
    const before = await get(f, "/relationships/stances/at", {
      fromCharacterId: aria,
      toCharacterId: boros,
      chapter: 49,
    });
    expect(before.statusCode).toBe(200);
    expect((before.body as { stance: string }).stance).toBe("ENEMY");

    const after = await get(f, "/relationships/stances/at", {
      fromCharacterId: aria,
      toCharacterId: boros,
      chapter: 50,
    });
    expect((after.body as { stance: string }).stance).toBe("ALLY");

    // The date of the turn — the thing an author actually asks for.
    const since = await get(f, "/relationships/stances/since", {
      fromCharacterId: aria,
      toCharacterId: boros,
      chapter: 120,
    });
    expect(since.body).toEqual({ stance: "ALLY", sinceChapter: 50 });

    // A third span overlapping the first is refused: the turn is recorded by
    // adding a span, never by editing the old one.
    const overlap = await post(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: boros,
      stance: "WARY",
      fromChapter: 40,
      toChapter: 60,
    });
    expect(overlap.statusCode, JSON.stringify(overlap.body)).toBe(409);

    // Nothing was overwritten — both original spans are still there.
    const all = await get(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: boros,
    });
    expect((all.body as unknown[]).length).toBe(2);
  });

  it("refuses a character regarding themselves", async () => {
    const f = await seed("eta-self");
    const aria = await makeCharacter(f, "aria");
    const res = await post(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: aria,
      stance: "ENEMY",
      fromChapter: 1,
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns null, not an error, for a chapter with no recorded stance", async () => {
    const f = await seed("eta-gap");
    const aria = await makeCharacter(f, "aria");
    const boros = await makeCharacter(f, "boros");
    await post(f, "/relationships/stances", {
      fromCharacterId: aria,
      toCharacterId: boros,
      stance: "ENEMY",
      fromChapter: 10,
    });
    const res = await get(f, "/relationships/stances/at", {
      fromCharacterId: aria,
      toCharacterId: boros,
      chapter: 5,
    });
    // Null is the answer "the author recorded nothing yet" — the pair exists,
    // so this must not be a 404.
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("monogamy / harem / polygamy: the structure names the shape, not the cap", () => {
  it("refuses a second concurrent monogamy bond and allows it once the first ends", async () => {
    const f = await seed("mono");
    const aria = await makeCharacter(f, "aria");
    const boros = await makeCharacter(f, "boros");
    const cass = await makeCharacter(f, "cass");

    const first = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [aria, boros],
      fromChapter: 1,
    });
    expect(first.statusCode, JSON.stringify(first.body)).toBe(201);

    // Aria in two concurrent monogamous bonds is the label lying.
    const second = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [aria, cass],
      fromChapter: 10,
    });
    expect(second.statusCode, JSON.stringify(second.body)).toBe(409);

    // After the first ends, the second is legitimate — the rule is about
    // concurrency, not about a lifetime cap.
    await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/relationships/bonds/${first.body["id"] as string}`,
      headers: { cookie: f.cookie },
    });
    const after = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [aria, cass],
      fromChapter: 10,
    });
    expect(after.statusCode, JSON.stringify(after.body)).toBe(201);
  });

  it("refuses a monogamous bond with three members", async () => {
    const f = await seed("mono3");
    const a = await makeCharacter(f, "a");
    const b = await makeCharacter(f, "b");
    const c = await makeCharacter(f, "c");
    const res = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [a, b, c],
      fromChapter: 1,
    });
    expect(res.statusCode).toBe(409);
  });

  it("allows a harem, a polyamorous web, and a political marriage alongside a love match", async () => {
    const f = await seed("poly");
    const a = await makeCharacter(f, "a");
    const b = await makeCharacter(f, "b");
    const c = await makeCharacter(f, "c");
    const d = await makeCharacter(f, "d");

    // Uncapped: "harem" describes a shape, not an instruction that every
    // character becomes a love interest.
    const harem = await post(f, "/relationships/bonds", {
      structure: "HAREM",
      memberIds: [a, b, c, d],
      fromChapter: 1,
    });
    expect(harem.statusCode, JSON.stringify(harem.body)).toBe(201);

    // POLITICAL_MARRIAGE is deliberately NOT exclusive: it names why a bond
    // exists, not how many a character may hold. A concurrent monogamy bond
    // involving the same people is therefore legal.
    const political = await post(f, "/relationships/bonds", {
      structure: "POLITICAL_MARRIAGE",
      memberIds: [a, d],
      fromChapter: 5,
    });
    expect(political.statusCode, JSON.stringify(political.body)).toBe(201);

    const love = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [b, c],
      fromChapter: 5,
    });
    expect(love.statusCode, JSON.stringify(love.body)).toBe(201);

    const list = await get(f, "/relationships/bonds");
    expect((list.body as unknown[]).length).toBe(3);
  });

  it("refuses the same character twice in one bond", async () => {
    const f = await seed("dup");
    const a = await makeCharacter(f, "a");
    const res = await post(f, "/relationships/bonds", {
      structure: "HAREM",
      memberIds: [a, a],
      fromChapter: 1,
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses a member from another novel", async () => {
    const f = await seed("cross-a");
    const other = await seed("cross-b");
    const mine = await makeCharacter(f, "mine");
    const theirs = await makeCharacter(other, "theirs");
    const res = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [mine, theirs],
      fromChapter: 1,
    });
    // A foreign character id is a 404, not a 403 — no cross-tenant existence
    // leak. The FK alone would have accepted it.
    expect(res.statusCode).toBe(404);
  });
});

describe("bonds advance through stages, and neglect is measured on weight", () => {
  it("walks ATTRACTION -> COURTSHIP -> MARRIAGE and reads the stage at a chapter", async () => {
    const f = await seed("stage");
    const a = await makeCharacter(f, "a");
    const b = await makeCharacter(f, "b");
    const bond = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [a, b],
      fromChapter: 1,
    });
    const bondId = bond.body["id"] as string;

    for (const [chapter, stage, kind] of [
      [1, "ATTRACTION", "ADVANCE"],
      [20, "COURTSHIP", "ADVANCE"],
      [60, "MARRIAGE", "ADVANCE"],
    ] as const) {
      const res = await post(f, `/relationships/bonds/${bondId}/transitions`, {
        chapter,
        stage,
        kind,
      });
      expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    }

    const atThirty = await get(f, `/relationships/bonds/${bondId}/stage`, { chapter: 30 });
    expect(atThirty.body).toEqual({ stage: "COURTSHIP" });
    const atNinety = await get(f, `/relationships/bonds/${bondId}/stage`, { chapter: 90 });
    expect(atNinety.body).toEqual({ stage: "MARRIAGE" });
  });

  it("refuses a quiet rewind recorded as an advance", async () => {
    const f = await seed("rewind");
    const a = await makeCharacter(f, "a");
    const b = await makeCharacter(f, "b");
    const bond = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [a, b],
      fromChapter: 1,
    });
    const bondId = bond.body["id"] as string;
    await post(f, `/relationships/bonds/${bondId}/transitions`, {
      chapter: 10,
      stage: "MARRIAGE",
      kind: "ADVANCE",
    });
    // Backwards in stage but labelled ADVANCE — the rule with teeth.
    const res = await post(f, `/relationships/bonds/${bondId}/transitions`, {
      chapter: 20,
      stage: "COURTSHIP",
      kind: "ADVANCE",
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(409);
  });

  it("does not reset the neglect clock on a zero-weight scene", async () => {
    const f = await seed("neglect");
    const a = await makeCharacter(f, "a");
    const b = await makeCharacter(f, "b");
    const bond = await post(f, "/relationships/bonds", {
      structure: "MONOGAMY",
      memberIds: [a, b],
      fromChapter: 1,
    });
    const bondId = bond.body["id"] as string;

    const real = await post(f, `/relationships/bonds/${bondId}/interactions`, {
      chapter: 5,
      weight: 0.9,
      summary: "they finally talk",
    });
    expect(real.statusCode, JSON.stringify(real.body)).toBe(201);

    // Present in the scene, nothing happened. The spec is explicit that
    // chapter presence is not the measure.
    await post(f, `/relationships/bonds/${bondId}/interactions`, {
      chapter: 40,
      weight: 0.05,
      summary: "both in the crowd",
    });

    const report = await get(f, `/relationships/bonds/${bondId}/neglect`, {
      chapter: 50,
      maxGap: 20,
    });
    expect(report.body).toEqual({
      lastMeaningfulChapter: 5,
      chaptersSinceMeaningful: 45,
      neglected: true,
    });
  });
});

describe("authorization and tenancy hold on the Phase 8 surface", () => {
  it("401s without a session", async () => {
    const f = await seed("anon");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/characters`,
      payload: { key: "x", name: "X" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("403s a VIEWER, who may read canon but not manage it", async () => {
    const f = await seed("viewer-ws");
    const viewer = await seedUser("viewer-member@example.com");
    await db.membership.create({
      data: { workspaceId: f.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${f.workspaceId}/novels/${f.novelId}/characters`,
      headers: { cookie: viewer.cookie },
      payload: { key: "x", name: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("404s a novel that belongs to another workspace", async () => {
    const mine = await seed("iso-a");
    const other = await seed("iso-b");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${mine.workspaceId}/novels/${other.novelId}/characters`,
      headers: { cookie: mine.cookie },
      payload: { key: "x", name: "X" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("the DB constraints are the subject, not the service guard in front of them", () => {
  // Every refusal above arrives through the HTTP API, and the service
  // validators (validateStateHistory, validateStanceHistory,
  // validateBondStructures) all fire BEFORE the statement reaches the
  // database. So those tests stay green with an EXCLUDE dropped: they pin the
  // validator, not the constraint. This suite writes straight to the
  // database, past every guard, so each case fails if its constraint is
  // absent.
  //
  // Each of these was confirmed to fail with its constraint dropped, not
  // merely to pass with it present.

  async function seedRaw(slug: string) {
    const owner = await seedUser(`${slug}@example.com`);
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, slug);
    const mk = (key: string) =>
      db.character.create({
        data: { workspaceId, novelId, key, name: key, createdById: owner.userId },
      });
    const a = await mk("a");
    const b = await mk("b");
    // CanonFact requires a subject entity (CanonFact_object_exactly_one), so
    // the knowledge suite below needs one.
    const entity = await db.storyEntity.create({
      data: {
        novelId,
        kind: "CHARACTER",
        key: "subject",
        name: "Subject",
        createdById: owner.userId,
      },
    });
    return { owner, workspaceId, novelId, a, b, entityId: entity.id };
  }

  it("refuses two overlapping character-state windows", async () => {
    const s = await seedRaw("cs");
    const state = (fromChapter: number, toChapter: number | null) =>
      db.characterState.create({
        data: { characterId: s.a.id, fromChapter, toChapter, summary: "s" },
      });
    await state(1, 50);
    await expect(state(40, 60)).rejects.toThrow();
    // Adjacent is not overlapping — half-open [1,50) and [50,null).
    await state(50, null);
    expect(await db.characterState.count({ where: { characterId: s.a.id } })).toBe(2);
  });

  it("refuses an inverted or zero-length state window", async () => {
    const s = await seedRaw("cw");
    await expect(
      db.characterState.create({
        data: { characterId: s.a.id, fromChapter: 10, toChapter: 10, summary: "s" },
      }),
    ).rejects.toThrow();
    await expect(
      db.characterState.create({
        data: { characterId: s.a.id, fromChapter: 10, toChapter: 5, summary: "s" },
      }),
    ).rejects.toThrow();
  });

  it("refuses two overlapping knowledge windows for the same character and fact", async () => {
    const s = await seedRaw("ck");
    const fact = await db.canonFact.create({
      data: {
        workspaceId: s.workspaceId,
        novelId: s.novelId,
        entityId: s.entityId,
        predicate: "p",
        objectText: "o",
        statement: "st",
        createdById: s.owner.userId,
      },
    });
    const belief = (fromChapter: number, toChapter: number | null) =>
      db.characterKnowledge.create({
        data: {
          characterId: s.a.id,
          factId: fact.id,
          stance: "KNOWN",
          source: "REMEMBERED",
          fromChapter,
          toChapter,
        },
      });
    await belief(1, 20);
    await expect(belief(10, 30)).rejects.toThrow();
    // A DIFFERENT character may hold the same fact over the same chapters —
    // the constraint is scoped per (character, fact), not per fact.
    await db.characterKnowledge.create({
      data: {
        characterId: s.b.id,
        factId: fact.id,
        stance: "UNKNOWN",
        source: "DERIVED",
        fromChapter: 10,
        toChapter: 30,
      },
    });
    expect(await db.characterKnowledge.count({ where: { factId: fact.id } })).toBe(2);
  });

  it("refuses two overlapping stances in the same direction", async () => {
    const s = await seedRaw("rs");
    const stance = (fromChapter: number, toChapter: number | null) =>
      db.relationshipStance.create({
        data: {
          workspaceId: s.workspaceId,
          fromCharacterId: s.a.id,
          toCharacterId: s.b.id,
          stance: "ENEMY",
          fromChapter,
          toChapter,
        },
      });
    await stance(1, 50);
    await expect(stance(40, 60)).rejects.toThrow();
    // The reverse direction is a different relationship and is unconstrained.
    await db.relationshipStance.create({
      data: {
        workspaceId: s.workspaceId,
        fromCharacterId: s.b.id,
        toCharacterId: s.a.id,
        stance: "ALLY",
        fromChapter: 40,
        toChapter: 60,
      },
    });
  });

  it("refuses a self-stance", async () => {
    const s = await seedRaw("self");
    await expect(
      db.relationshipStance.create({
        data: {
          workspaceId: s.workspaceId,
          fromCharacterId: s.a.id,
          toCharacterId: s.a.id,
          stance: "ALLY",
          fromChapter: 1,
          toChapter: null,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses an interaction weight outside 0..1", async () => {
    const s = await seedRaw("w");
    const bond = await db.bond.create({
      data: {
        workspaceId: s.workspaceId,
        novelId: s.novelId,
        structure: "MONOGAMY",
        fromChapter: 1,
        toChapter: null,
        createdById: s.owner.userId,
      },
    });
    const interaction = (weight: number) =>
      db.meaningfulInteraction.create({
        data: { workspaceId: s.workspaceId, bondId: bond.id, chapter: 5, weight },
      });
    await interaction(0);
    await interaction(1);
    await expect(interaction(1.5)).rejects.toThrow();
    await expect(interaction(-0.1)).rejects.toThrow();
  });

  it("refuses a milestone chapter below 1 and a duplicate chapter on one arc", async () => {
    const s = await seedRaw("arc");
    const arc = await db.characterArc.create({
      data: { characterId: s.a.id, title: "t", status: "ACTIVE" },
    });
    await db.characterArcMilestone.create({
      data: { arcId: arc.id, chapter: 5, summary: "s" },
    });
    await expect(
      db.characterArcMilestone.create({ data: { arcId: arc.id, chapter: 5, summary: "s" } }),
    ).rejects.toThrow();
    await expect(
      db.characterArcMilestone.create({ data: { arcId: arc.id, chapter: 0, summary: "s" } }),
    ).rejects.toThrow();
  });

  it("refuses a bond window that is inverted", async () => {
    const s = await seedRaw("bw");
    await expect(
      db.bond.create({
        data: {
          workspaceId: s.workspaceId,
          novelId: s.novelId,
          structure: "HAREM",
          fromChapter: 10,
          toChapter: 10,
          createdById: s.owner.userId,
        },
      }),
    ).rejects.toThrow();
  });
});
