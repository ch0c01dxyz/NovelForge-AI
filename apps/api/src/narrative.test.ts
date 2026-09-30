/**
 * Narrative DNA & Rhythm (Phase 9) integration suite.
 *
 * Dedicated novelforge_test_phase9 db (parallel-safe per ADR-0003 §8). Every
 * test drives the real HTTP surface against a real migrated database.
 *
 * Covers the roadmap's Phase 9 exit criterion, quoted verbatim:
 *
 *   "Exit: a low-frequency drama scenario remains non-mechanical and
 *    repetition warnings are evidence-backed."
 *
 * Both halves are below. "Non-mechanical" is asserted at the WORD level, not
 * by reading the state: a drama window whose guidance says "insert drama" has
 * turned a soft preference (ADR-009) into the cron-like rule
 * NARRATIVE-RHYTHM.md forbids, and a state-only assertion would not catch it.
 * "Evidence-backed" means a repetition finding names the beats and chapters
 * that produced it, never a bare score (ADR-012).
 *
 * The last suite writes straight to the database, past every service guard.
 * Three CHECKs enforce rules the service also validates, so a
 * service-guard-only test stays green with the constraint dropped — it pins
 * the validator, not the CHECK (canon.test.ts established the pattern).
 * packages/database/test/narrative-constraints.integration.test.ts proves all
 * three are load-bearing; this suite proves the API and the CHECK agree on
 * what they refuse.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AntagonistOutcome as SchemaAntagonistOutcome,
  AntagonistRole as SchemaAntagonistRole,
  AntagonistStage as SchemaAntagonistStage,
  NarrativePolicyKind as SchemaNarrativePolicyKind,
  PolicyHardness as SchemaPolicyHardness,
  createDb,
  type NovelForgeDb,
} from "@novelforge/database";
import {
  ANTAGONIST_OUTCOMES,
  ANTAGONIST_ROLES,
  ANTAGONIST_STAGES,
  NARRATIVE_POLICY_KINDS,
  POLICY_HARDNESSES,
} from "@novelforge/narrative-rhythm";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { AIGateway } from "@novelforge/ai-core";

const TEST_DB = "novelforge_test_phase9";
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
 * No test in this file reaches a provider — the Phase 9 routes issue no model
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
      throw new Error("Phase 9 issues no model call");
    },
    // eslint-disable-next-line require-yield
    async *generateStream(): AsyncGenerator<{ delta: string }> {
      throw new Error("Phase 9 issues no model call");
    },
    async embed() {
      throw new Error("Phase 9 issues no model call");
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
  // Child-first. antagonists -> characters is ON DELETE CASCADE, but the
  // explicit order keeps the intent visible.
  await db.antagonist.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.narrativeDnaProfile.deleteMany();
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

function url(f: Fixture, suffix: string): string {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${suffix}`;
}

async function post(
  f: Fixture,
  suffix: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: url(f, suffix),
    headers: { cookie: f.cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function put(
  f: Fixture,
  suffix: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "PUT",
    url: url(f, suffix),
    headers: { cookie: f.cookie },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

async function get(f: Fixture, suffix: string): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "GET",
    url: url(f, suffix),
    headers: { cookie: f.cookie },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function del(f: Fixture, suffix: string): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "DELETE",
    url: url(f, suffix),
    headers: { cookie: f.cookie },
  });
  // 204 has no body; res.json() would throw on the empty payload.
  return { statusCode: res.statusCode, body: res.body === "" ? null : res.json() };
}

async function makeCharacter(f: Fixture, key: string): Promise<string> {
  const res = await post(f, "/characters", { key, name: key });
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return res.body["id"] as string;
}

/** A LOW-density policy: drama every 30-50 chapters, extended calm 70-140. */
const LOW_FREQUENCY_POLICY = {
  density: "LOW",
  typicalGap: { min: 30, max: 50 },
  extendedGap: { min: 70, max: 140 },
  strictInterval: false,
};

/**
 * The soft-constraint rule (ADR-009), asserted on the words the author
 * actually reads. A guidance string that instructs has become the cron-like
 * rule NARRATIVE-RHYTHM.md forbids, whatever the state field says.
 */
const IMPERATIVES = ["should", "must", "insert", "add ", "need", "consider", "time for", "now"];

function expectNoImperative(guidance: string): void {
  const lowered = guidance.toLowerCase();
  for (const word of IMPERATIVES) {
    expect(lowered, `guidance must not instruct: "${guidance}"`).not.toContain(word);
  }
}

// ---------------------------------------------------------------------------

describe("the domain vocabulary and the schema enums are the same set", () => {
  // packages/narrative-rhythm declares its own unions because importing the
  // generated client would cross the DOMAIN boundary (ADR-0001), and the unit
  // test there pins them against hand-copied literals — which catches an edit
  // to vocabulary.ts, not drift from the schema. This is the only place both
  // sides are importable, so it is the only place the claim can be checked:
  // add MENTOR to AntagonistRole in schema.prisma and the route keeps
  // rejecting it with 400 while the database accepts it.
  //
  // Only the five enums that ARE schema enums are paired here. DRAMA_TYPES,
  // DRAMA_DENSITIES, NARRATIVE_SCALES and DRAMA_WINDOW_STATES have no schema
  // counterpart — they are the domain's own vocabulary and the literals in
  // rhythm.test.ts are their only pin.
  it("matches every schema-backed enum member-for-member", () => {
    const pairs: [string, readonly string[], Record<string, string>][] = [
      ["NARRATIVE_POLICY_KINDS", NARRATIVE_POLICY_KINDS, SchemaNarrativePolicyKind],
      ["POLICY_HARDNESSES", POLICY_HARDNESSES, SchemaPolicyHardness],
      ["ANTAGONIST_ROLES", ANTAGONIST_ROLES, SchemaAntagonistRole],
      ["ANTAGONIST_STAGES", ANTAGONIST_STAGES, SchemaAntagonistStage],
      ["ANTAGONIST_OUTCOMES", ANTAGONIST_OUTCOMES, SchemaAntagonistOutcome],
    ];
    for (const [name, local, generated] of pairs) {
      expect([...local], name).toEqual(Object.values(generated));
    }
  });
});

describe("a low-frequency drama policy stays non-mechanical (roadmap exit criterion)", () => {
  it("reports IN_GAP at the middle of the authored gap, with no imperative in the guidance", async () => {
    const f = await seed("drama");
    const stored = await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      payload: LOW_FREQUENCY_POLICY,
    });
    expect(stored.statusCode, JSON.stringify(stored.body)).toBe(200);

    // 40 chapters sits inside the authored 30-50 typical gap.
    const res = await post(f, "/narrative/drama-window", { chaptersSinceDrama: 40 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body["state"]).toBe("IN_GAP");
    expectNoImperative(res.body["guidance"] as string);
  });

  it("stays non-mechanical even when the author marked the interval strict", async () => {
    const f = await seed("strict");
    await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      payload: { ...LOW_FREQUENCY_POLICY, strictInterval: true },
    });
    // 200 chapters is past the extended calm — the state that most tempts an
    // implementation into telling the author what to do.
    const res = await post(f, "/narrative/drama-window", { chaptersSinceDrama: 200 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body["state"]).toBe("BEYOND_EXTENDED_CALM");
    // strictInterval is a signal for the PLANNER, echoed as data — never a
    // command in the prose.
    expect(res.body["strict"]).toBe(true);
    expectNoImperative(res.body["guidance"] as string);
  });

  it("refuses to invent a window when the novel has no policy", async () => {
    const f = await seed("nopolicy");
    const res = await post(f, "/narrative/drama-window", { chaptersSinceDrama: 40 });
    // A default ladder would plan distant chapters at a rhythm the author
    // never chose (ADR-0011 §2, the getHorizon posture).
    expect(res.statusCode).toBe(409);
  });

  it("refuses a malformed drama policy on write, storing nothing", async () => {
    const f = await seed("badpolicy");
    const res = await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      // extendedGap.max < typicalGap.max — the shape check rejects it.
      payload: {
        density: "LOW",
        typicalGap: { min: 30, max: 50 },
        extendedGap: { min: 10, max: 20 },
        strictInterval: false,
      },
    });
    expect(res.statusCode).toBe(409);
    const listed = await get(f, "/narrative/policies");
    expect(listed.body).toEqual([]);
  });

  it("fails loud when the STORED drama policy is malformed, not silently", async () => {
    // The read-path sibling of the cooldown test below. Written straight
    // through Prisma, past putPolicy: the payload column is JSONB with no
    // CHECK, so a seed or migration can put any shape here. The window is a
    // SOFT rule, so there is no "fail open" danger as there is for the
    // cooldown — but assessDramaWindow's malformed branch would otherwise
    // never be reached in production, and a planner reading a default band
    // is exactly the invented ladder ADR-0011 §2 forbids.
    const f = await seed("badpolicy-read");
    await db.narrativePolicy.create({
      data: {
        novelId: f.novelId,
        kind: "DRAMA_GAP",
        hardness: "SOFT",
        payload: {
          density: "LOW",
          typicalGap: { min: 50, max: 30 },
          extendedGap: { min: 70, max: 140 },
          strictInterval: false,
        },
      },
    });
    const res = await post(f, "/narrative/drama-window", { chaptersSinceDrama: 40 });
    expect(res.statusCode).toBe(409);
  });
});

describe("the cooldown is the one hard rhythm rule", () => {
  it("refuses a same-type beat inside the window and names the conflicting beat", async () => {
    const f = await seed("cooldown");
    await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 10 },
    });

    const res = await post(f, "/narrative/cooldown", {
      candidate: { id: "c1", type: "MILITARY", chapter: 20 },
      history: [{ id: "b1", type: "MILITARY", chapter: 15 }],
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body["allowed"]).toBe(false);
    const conflict = res.body["conflictsWith"] as { beatId: string; distance: number };
    expect(conflict.beatId).toBe("b1");
    expect(conflict.distance).toBe(5);
  });

  it("never blocks a different type — the window protects a flavour, not drama", async () => {
    const f = await seed("cooldown2");
    await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 10 },
    });
    const res = await post(f, "/narrative/cooldown", {
      candidate: { id: "c1", type: "ROMANCE", chapter: 20 },
      history: [{ id: "b1", type: "MILITARY", chapter: 15 }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body["allowed"]).toBe(true);
  });

  it("refuses to invent a window when the novel has no cooldown policy", async () => {
    const f = await seed("cooldown3");
    const res = await post(f, "/narrative/cooldown", {
      candidate: { id: "c1", type: "MILITARY", chapter: 20 },
      history: [{ id: "b1", type: "MILITARY", chapter: 15 }],
    });
    // A default of "no window" would answer `allowed: true` for a rule the
    // author never set — the same silent substitution the drama window
    // refuses (ADR-0011 §2).
    expect(res.statusCode).toBe(409);
  });

  it("fails closed when the stored payload is malformed, not open", async () => {
    const f = await seed("cooldown4");
    // Written straight through Prisma, past putPolicy: the payload column is
    // JSONB with no CHECK, so a seed, migration, or direct write can put any
    // shape here. checkCooldown reads a bad window as "no cooldown
    // configured" — allowed:true — which would silently disable the one HARD
    // rule. The read path re-applies the write predicate and refuses.
    await db.narrativePolicy.create({
      data: {
        novelId: f.novelId,
        kind: "COOLDOWN",
        hardness: "HARD",
        hardReason: "seeded out of band",
        payload: { windowChapters: 0 },
      },
    });
    const res = await post(f, "/narrative/cooldown", {
      candidate: { id: "c1", type: "MILITARY", chapter: 20 },
      history: [{ id: "b1", type: "MILITARY", chapter: 15 }],
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("repetition warnings are evidence-backed (roadmap exit criterion)", () => {
  it("names every beat and chapter that produced the finding, and suggests variation", async () => {
    const f = await seed("pattern");
    const beats = [
      { id: "b1", kind: "underestimate", chapter: 10 },
      { id: "b2", kind: "provoke", chapter: 11 },
      { id: "b3", kind: "demonstrates", chapter: 12 },
      { id: "b4", kind: "underestimate", chapter: 40 },
      { id: "b5", kind: "provoke", chapter: 41 },
      { id: "b6", kind: "demonstrates", chapter: 42 },
    ];
    const res = await post(f, "/narrative/patterns", {
      beats,
      sequence: ["underestimate", "provoke", "demonstrates"],
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const finding = res.body as unknown as {
      severity: string;
      occurrences: number;
      evidence: { beatId: string; chapter: number }[];
      suggestion: string;
    };
    expect(finding.occurrences).toBe(2);
    expect(finding.severity).toBe("INFO");
    // Evidence is the concrete rows — a bare score is what ADR-012 forbids.
    expect(finding.evidence.map((e) => e.beatId)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
    expect(finding.evidence.map((e) => e.chapter)).toEqual([10, 11, 12, 40, 41, 42]);
    // A suggestion to vary, never a ban on the trope.
    expect(finding.suggestion.toLowerCase()).toContain("vary");
  });

  it("reports nothing for a trope used once — one occurrence is not a pattern", async () => {
    const f = await seed("pattern1");
    const res = await post(f, "/narrative/patterns", {
      beats: [
        { id: "b1", kind: "underestimate", chapter: 10 },
        { id: "b2", kind: "provoke", chapter: 11 },
      ],
      sequence: ["underestimate", "provoke"],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });

  it("refuses a threshold below the rule's own definition of a pattern", async () => {
    const f = await seed("pattern1b");
    const res = await post(f, "/narrative/patterns", {
      beats: [
        { id: "b1", kind: "underestimate", chapter: 10 },
        { id: "b2", kind: "provoke", chapter: 11 },
      ],
      sequence: ["underestimate", "provoke"],
      // One occurrence is not a pattern, however the caller asks.
      minOccurrences: 1,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("scale appropriateness is advisory and reachable", () => {
  // The route and the service had zero coverage anywhere: swapping proposal
  // and standing, or dropping the tenant gate, left every suite green.
  it("flags a proposal beyond the protagonist's reach, with the gap", async () => {
    const f = await seed("scale");
    const res = await post(f, "/narrative/scale", {
      proposal: { id: "p1", scale: "EMPIRE", summary: "settle the imperial succession" },
      standing: { scale: "VILLAGE", access: ["TOWN"], reputation: 20 },
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const assessment = res.body as unknown as { ok: boolean; gap: number; reach: string };
    expect(assessment.ok).toBe(false);
    expect(assessment.reach).toBe("TOWN");
    expect(assessment.gap).toBe(4); // TOWN -> CITY -> PROVINCE -> KINGDOM -> EMPIRE
  });

  it("accepts a proposal inside reach", async () => {
    const f = await seed("scale-ok");
    const res = await post(f, "/narrative/scale", {
      proposal: { id: "p2", scale: "TOWN", summary: "the market dispute" },
      standing: { scale: "VILLAGE", access: ["TOWN"], reputation: 20 },
    });
    expect(res.statusCode).toBe(200);
    expect((res.body as unknown as { ok: boolean }).ok).toBe(true);
  });

  it("refuses an unknown scale at the boundary rather than ranking it", async () => {
    const f = await seed("scale-bad");
    const res = await post(f, "/narrative/scale", {
      proposal: { id: "p3", scale: "GALAXY", summary: null },
      standing: { scale: "VILLAGE", access: [], reputation: 20 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s a novel in another workspace, like every other assessment", async () => {
    const mine = await seed("scale-iso-a");
    const other = await seed("scale-iso-b");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${mine.workspaceId}/novels/${other.novelId}/narrative/scale`,
      headers: { cookie: mine.cookie },
      payload: {
        proposal: { id: "p4", scale: "TOWN", summary: null },
        standing: { scale: "VILLAGE", access: [], reputation: 1 },
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("antagonist lifecycle", () => {
  it("refuses a TEMPORARY antagonist with no stated purpose", async () => {
    const f = await seed("temp");
    const characterId = await makeCharacter(f, "villain");
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "TEMPORARY",
      fromChapter: 1,
      toChapter: 12,
    });
    expect(res.statusCode).toBe(409);
  });

  it("accepts a TEMPORARY antagonist that states its purpose", async () => {
    const f = await seed("temp-ok");
    const characterId = await makeCharacter(f, "villain");
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "TEMPORARY",
      purpose: "Force the sect to reveal its hand early",
      fromChapter: 1,
      toChapter: 12,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const antagonist = res.body["antagonist"] as { purpose: string; role: string };
    expect(antagonist.role).toBe("TEMPORARY");
    expect(antagonist.purpose).toBe("Force the sect to reveal its hand early");
  });

  it("refuses a whitespace-only purpose over HTTP, before the CHECK ever sees it", async () => {
    // The write path trims with JS String.prototype.trim, which covers the
    // full blank class (U+3000 included) — so the empty string reaches the
    // validator as MISSING_PURPOSE rather than reaching the CHECK as a blank.
    // Both layers refuse; this pins the outer one.
    const f = await seed("temp-blank");
    const characterId = await makeCharacter(f, "villain");
    for (const purpose of ["\t", "\n", " ", "　", " \t "]) {
      const res = await post(f, "/narrative/antagonists", {
        characterId,
        role: "TEMPORARY",
        purpose,
        fromChapter: 1,
        toChapter: 12,
      });
      expect(res.statusCode, JSON.stringify(purpose)).toBe(409);
    }
  });

  it("reports an out-of-bounds span as advice rather than refusing it", async () => {
    const f = await seed("temp-span");
    const characterId = await makeCharacter(f, "villain");
    // 30 chapters is past the doc's ~5-20 for a TEMPORARY antagonist. The
    // migration calls that bound "a pacing note, not an unrepresentable row",
    // so the row lands and the note comes back with it (ADR-009: a soft
    // constraint that refuses has become the schedule it must not be).
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "TEMPORARY",
      purpose: "Hold the border arc open",
      fromChapter: 1,
      toChapter: 30,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const advisory = res.body["advisory"] as { problem: string }[];
    expect(advisory.map((a) => a.problem)).toContain("SPAN_OUT_OF_BOUNDS");
  });

  it("reports an open-ended TEMPORARY antagonist's missing span as advice", async () => {
    const f = await seed("temp-open");
    const characterId = await makeCharacter(f, "villain");
    // A purpose, but no toChapter: the span is unknown, not zero. spanOf
    // returns null and the rule reports MISSING_SPAN — advisory, like the
    // out-of-bounds case above, so the row still lands.
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "TEMPORARY",
      purpose: "Hold the border arc open",
      fromChapter: 1,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const advisory = res.body["advisory"] as { problem: string }[];
    expect(advisory.map((a) => a.problem)).toContain("MISSING_SPAN");
  });

  it("refuses a backward stage move", async () => {
    const f = await seed("backward");
    const characterId = await makeCharacter(f, "villain");
    const created = await post(f, "/narrative/antagonists", {
      characterId,
      role: "MAIN",
      stage: "CONFRONTATION",
      fromChapter: 1,
    });
    expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
    const antagonistId = (created.body["antagonist"] as { id: string }).id;

    const res = await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "FRICTION",
    });
    expect(res.statusCode).toBe(409);
    // The refusal left the stored stage where it was.
    const listed = (await get(f, "/narrative/antagonists")).body as { stage: string }[];
    expect(listed[0]!.stage).toBe("CONFRONTATION");
  });

  it("refuses a repeated stage", async () => {
    const f = await seed("repeat");
    const characterId = await makeCharacter(f, "villain");
    const created = await post(f, "/narrative/antagonists", {
      characterId,
      role: "MAIN",
      stage: "FRICTION",
      fromChapter: 1,
    });
    const antagonistId = (created.body["antagonist"] as { id: string }).id;
    const res = await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "FRICTION",
    });
    expect(res.statusCode).toBe(409);
  });

  it("advances forward and records the outcome", async () => {
    const f = await seed("forward");
    const characterId = await makeCharacter(f, "villain");
    const created = await post(f, "/narrative/antagonists", {
      characterId,
      role: "MAIN",
      stage: "CONFRONTATION",
      fromChapter: 1,
    });
    const antagonistId = (created.body["antagonist"] as { id: string }).id;
    const res = await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "DEFEAT",
      outcome: "EXILE",
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const antagonist = res.body["antagonist"] as { stage: string; outcome: string };
    expect(antagonist.stage).toBe("DEFEAT");
    expect(antagonist.outcome).toBe("EXILE");
  });

  it("keeps a recorded outcome when a later advance omits it", async () => {
    const f = await seed("keepoutcome");
    const characterId = await makeCharacter(f, "villain");
    const created = await post(f, "/narrative/antagonists", {
      characterId,
      role: "MAIN",
      stage: "CONFRONTATION",
      fromChapter: 1,
    });
    const antagonistId = (created.body["antagonist"] as { id: string }).id;
    await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "DEFEAT",
      outcome: "EXILE",
    });

    // No outcome field: the route used to coerce it to null and wipe EXILE.
    const res = await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "CONSEQUENCE",
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect((res.body["antagonist"] as { outcome: string }).outcome).toBe("EXILE");

    // An explicit null still clears it — omission and null stay distinct.
    const cleared = await post(f, `/narrative/antagonists/${antagonistId}/stage`, {
      stage: "RESOLUTION",
      outcome: null,
    });
    expect((cleared.body["antagonist"] as { outcome: string | null }).outcome).toBeNull();
  });

  it("refuses to cast the same character twice in one novel", async () => {
    const f = await seed("dup");
    const characterId = await makeCharacter(f, "villain");
    await post(f, "/narrative/antagonists", { characterId, role: "MAIN", fromChapter: 1 });
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "RIVAL",
      fromChapter: 5,
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses a span that ends before it starts", async () => {
    const f = await seed("span");
    const characterId = await makeCharacter(f, "villain");
    const res = await post(f, "/narrative/antagonists", {
      characterId,
      role: "MAIN",
      fromChapter: 10,
      toChapter: 5,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("hard narrative policies require a stated reason (ADR-009)", () => {
  it("refuses HARD with no reason", async () => {
    const f = await seed("hard");
    const res = await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "HARD",
      payload: LOW_FREQUENCY_POLICY,
    });
    expect(res.statusCode).toBe(409);
    const listed = (await get(f, "/narrative/policies")).body as unknown[];
    expect(listed).toEqual([]);
  });

  it("refuses HARD with a whitespace-only reason", async () => {
    const f = await seed("hard-ws");
    const res = await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "HARD",
      hardReason: "   ",
      payload: LOW_FREQUENCY_POLICY,
    });
    expect(res.statusCode).toBe(409);
  });

  it("accepts HARD with a reason and SOFT with none", async () => {
    const f = await seed("hard-ok");
    const hard = await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "HARD",
      hardReason: "Author directive: no two siege beats back to back",
      payload: { windowChapters: 5 },
    });
    expect(hard.statusCode, JSON.stringify(hard.body)).toBe(200);
    expect(hard.body["hardReason"]).toBe("Author directive: no two siege beats back to back");

    const soft = await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      payload: LOW_FREQUENCY_POLICY,
    });
    expect(soft.statusCode, JSON.stringify(soft.body)).toBe(200);
    expect(soft.body["hardReason"]).toBeNull();
  });

  it("upserts one policy per kind rather than accumulating rows", async () => {
    const f = await seed("upsert");
    await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 5 },
    });
    await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 9 },
    });
    const listed = (await get(f, "/narrative/policies")).body as { payload: unknown }[];
    expect(listed).toHaveLength(1);
    expect(listed[0]!.payload).toEqual({ windowChapters: 9 });
  });
});

describe("a policy can be unset, not only overwritten", () => {
  it("deletes one kind and leaves the others alone", async () => {
    const f = await seed("policy-del");
    await put(f, "/narrative/policies", {
      kind: "COOLDOWN",
      hardness: "SOFT",
      payload: { windowChapters: 5 },
    });
    await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      payload: LOW_FREQUENCY_POLICY,
    });

    const res = await del(f, "/narrative/policies/COOLDOWN");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(204);

    const listed = (await get(f, "/narrative/policies")).body as { kind: string }[];
    expect(listed.map((p) => p.kind)).toEqual(["DRAMA_GAP"]);
  });

  it("restores the refusal to invent a window once the policy is gone", async () => {
    const f = await seed("policy-del-gap");
    await put(f, "/narrative/policies", {
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      payload: LOW_FREQUENCY_POLICY,
    });
    expect((await post(f, "/narrative/drama-window", { chaptersSinceDrama: 40 })).statusCode).toBe(
      200,
    );

    expect((await del(f, "/narrative/policies/DRAMA_GAP")).statusCode).toBe(204);
    // Deleting the policy must return the novel to "no agreed pacing", not to
    // a default ladder (ADR-0011 §2) — the delete is real, not a soft flag.
    expect((await post(f, "/narrative/drama-window", { chaptersSinceDrama: 40 })).statusCode).toBe(
      409,
    );
  });

  it("404s for a kind that was never set, and for an unknown kind", async () => {
    const f = await seed("policy-del-missing");
    expect((await del(f, "/narrative/policies/SCALE")).statusCode).toBe(404);
    expect((await del(f, "/narrative/policies/NOT_A_KIND")).statusCode).toBe(400);
  });

  it("is authorized like every other write", async () => {
    const f = await seed("policy-del-auth");
    await put(f, "/narrative/policies", {
      kind: "SCALE",
      hardness: "SOFT",
      payload: {},
    });
    const res = await app.inject({
      method: "DELETE",
      url: url(f, "/narrative/policies/SCALE"),
    });
    expect(res.statusCode).toBe(401);
    // The refusal must not have deleted anything.
    expect((await get(f, "/narrative/policies")).body).toHaveLength(1);
  });
});

describe("narrative DNA profile", () => {
  it("returns null before anything is written, then round-trips", async () => {
    const f = await seed("dna");
    const before = await get(f, "/narrative/dna");
    expect(before.statusCode).toBe(200);
    expect(before.body).toBeNull();

    const dna = { prose: { sentenceLength: "varied" }, pacing: { actionRatio: 0.4 } };
    const written = await put(f, "/narrative/dna", { dna });
    expect(written.statusCode, JSON.stringify(written.body)).toBe(200);

    const after = await get(f, "/narrative/dna");
    expect((after.body as { dna: unknown }).dna).toEqual(dna);
  });

  it("refuses a non-object DNA payload at the boundary", async () => {
    const f = await seed("dna-bad");
    const res = await put(f, "/narrative/dna", { dna: [1, 2, 3] });
    expect(res.statusCode).toBe(400);
  });
});

describe("tenant isolation", () => {
  it("404s a novel that belongs to another workspace", async () => {
    const mine = await seed("iso-a");
    const other = await seed("iso-b");
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${mine.workspaceId}/novels/${other.novelId}/narrative/drama-window`,
      headers: { cookie: mine.cookie },
      payload: { chaptersSinceDrama: 40 },
    });
    // 404, not 403 — a 403 would confirm the novel exists.
    expect(res.statusCode).toBe(404);
  });

  it("404s an antagonist id from another novel", async () => {
    const mine = await seed("iso-c");
    const other = await seed("iso-d");
    const otherChar = await makeCharacter(other, "theirs");
    const created = await post(other, "/narrative/antagonists", {
      characterId: otherChar,
      role: "MAIN",
      fromChapter: 1,
    });
    const antagonistId = (created.body["antagonist"] as { id: string }).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${mine.workspaceId}/novels/${mine.novelId}/narrative/antagonists/${antagonistId}/stage`,
      headers: { cookie: mine.cookie },
      payload: { stage: "DEFEAT" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s a character id from another novel when casting an antagonist", async () => {
    const mine = await seed("iso-e");
    const other = await seed("iso-f");
    const foreignCharacter = await makeCharacter(other, "foreign");
    // The FK alone would have accepted this — character_id references
    // characters(id) with no novel predicate.
    const res = await post(mine, "/narrative/antagonists", {
      characterId: foreignCharacter,
      role: "MAIN",
      fromChapter: 1,
    });
    expect(res.statusCode).toBe(404);
  });

  it("401s an unauthenticated request", async () => {
    const f = await seed("anon");
    const res = await app.inject({
      method: "GET",
      url: url(f, "/narrative/policies"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("403s a member without canon:manage when writing", async () => {
    const f = await seed("viewer");
    const viewer = await seedUser("viewer-member@example.com");
    await db.membership.create({
      data: { workspaceId: f.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const res = await app.inject({
      method: "PUT",
      url: url(f, "/narrative/policies"),
      headers: { cookie: viewer.cookie },
      payload: { kind: "COOLDOWN", hardness: "SOFT", payload: { windowChapters: 5 } },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("the DB constraints are the subject, not the service guard in front of them", () => {
  // Every refusal above arrives through the HTTP API, and the service
  // validators (validateAntagonistProgression and the boundary checks) fire
  // BEFORE the statement reaches the database. So those tests stay green with
  // a CHECK dropped: they pin the validator, not the constraint. This suite
  // writes straight through Prisma, past every guard, so each case fails if
  // its constraint is absent.
  //
  // packages/database/test/narrative-constraints.integration.test.ts is the
  // companion: it drops each constraint inside a rolled-back transaction and
  // confirms the same statement is then accepted, so each is load-bearing
  // rather than merely present.

  async function seedRaw(slug: string) {
    const owner = await seedUser(`${slug}@example.com`);
    const { workspaceId, novelId } = await seedWorkspace(owner.userId, slug);
    const character = await db.character.create({
      data: { workspaceId, novelId, key: "v", name: "V", createdById: owner.userId },
    });
    return { owner, workspaceId, novelId, characterId: character.id };
  }

  it("Antagonist_temporary_needs_purpose refuses the row the service also refuses", async () => {
    const s = await seedRaw("c1");
    await expect(
      db.antagonist.create({
        data: {
          workspaceId: s.workspaceId,
          novelId: s.novelId,
          characterId: s.characterId,
          role: "TEMPORARY",
          purpose: null,
          fromChapter: 1,
          toChapter: 12,
          createdById: s.owner.userId,
        },
      }),
    ).rejects.toThrow();
    // A stated purpose is legal — the constraint is not wider than it claims.
    await db.antagonist.create({
      data: {
        workspaceId: s.workspaceId,
        novelId: s.novelId,
        characterId: s.characterId,
        role: "TEMPORARY",
        purpose: "Hold the border",
        fromChapter: 1,
        toChapter: 12,
        createdById: s.owner.userId,
      },
    });
  });

  it("Antagonist_temporary_needs_purpose refuses a whitespace-only purpose", async () => {
    // The whole blank class, not just "   ": the first version of this test
    // probed spaces alone, and PostgreSQL's single-arg btrim strips only
    // spaces — so a tab/newline/NBSP purpose was stored, then flagged
    // MISSING_PURPOSE (a HARD problem) on every later read, leaving the row
    // un-advanceable. A direct write is the only path the CHECK guards; the
    // HTTP path trims in Zod first.
    const blanks = ["   ", "\t", "\n", "\r", "\v", "\f", "\u0085", " ", " ", " ", "﻿", "　", " \t  "];
    for (const purpose of blanks) {
      const s = await seedRaw(`c2-${blanks.indexOf(purpose)}`);
      await expect(
        db.antagonist.create({
          data: {
            workspaceId: s.workspaceId,
            novelId: s.novelId,
            characterId: s.characterId,
            role: "TEMPORARY",
            purpose,
            fromChapter: 1,
            toChapter: 12,
            createdById: s.owner.userId,
          },
        }),
        JSON.stringify(purpose),
      ).rejects.toThrow();
    }
  });

  it("Antagonist_chapter_span_valid refuses an inverted span", async () => {
    const s = await seedRaw("c3");
    await expect(
      db.antagonist.create({
        data: {
          workspaceId: s.workspaceId,
          novelId: s.novelId,
          characterId: s.characterId,
          role: "MAIN",
          fromChapter: 10,
          toChapter: 5,
          createdById: s.owner.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.antagonist.create({
        data: {
          workspaceId: s.workspaceId,
          novelId: s.novelId,
          characterId: s.characterId,
          role: "MAIN",
          fromChapter: 0,
          createdById: s.owner.userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("NarrativePolicy_hard_requires_reason refuses the row the service also refuses", async () => {
    const s = await seedRaw("c4");
    await expect(
      db.narrativePolicy.create({
        data: {
          novelId: s.novelId,
          kind: "DRAMA_GAP",
          hardness: "HARD",
          hardReason: null,
          payload: LOW_FREQUENCY_POLICY,
        },
      }),
    ).rejects.toThrow();
    // SOFT with no reason is legal by construction.
    await db.narrativePolicy.create({
      data: {
        novelId: s.novelId,
        kind: "DRAMA_GAP",
        hardness: "SOFT",
        hardReason: null,
        payload: LOW_FREQUENCY_POLICY,
      },
    });
  });

  it("the one-live-policy-per-kind index is enforced by the database", async () => {
    const s = await seedRaw("c5");
    const row = {
      novelId: s.novelId,
      kind: "COOLDOWN" as const,
      hardness: "SOFT" as const,
      payload: { windowChapters: 5 },
    };
    await db.narrativePolicy.create({ data: row });
    await expect(db.narrativePolicy.create({ data: row })).rejects.toThrow();
  });
});
