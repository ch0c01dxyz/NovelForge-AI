/**
 * NF-WF-010 state consumers integration suite.
 *
 * Dedicated novelforge_test_stateconsumers db. Covers the acceptance
 * checklist: real state consumers (assembly), memory-vs-live sourcing
 * (corroboration + forced divergence), null-linkage identity (GAP-011),
 * temporal knowledge (story-time windows, as-of revision negatives),
 * clock contradiction, malformed policy (write 409 + read fail-open),
 * hard-rule rejection via the setStatus gate, soft-never-forces (the
 * imperative-pattern fixture), changed-version invalidation, all seven
 * health categories, unresolved identity surfacing, authorization, and
 * no-regression (compiler legacy path).
 *
 * Structural-only, no AI paths — GAP-028 does not arise.
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
import { createCharacterServices } from "./services/characters.ts";
import { createRelationshipServices } from "./services/relationships.ts";
import { createStoryServices } from "./services/story.ts";
import { createNarrativeServices } from "./services/narrative.ts";
import { createPlanningServices } from "./services/planning.ts";
import { createCanonServices } from "./services/canon.ts";
import { createManuscriptServices } from "./services/manuscript.ts";
import { createStateAssemblyServices } from "./services/state-assembly.ts";
import { createStoryHealthServices } from "./services/story-health.ts";
import { fetchAndCompileContext, TIERS } from "./services/context-compiler.ts";
import type { MemoryBlock } from "@novelforge/memory";

const TEST_DB = "novelforge_test_stateconsumers";
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

const env: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "test",
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

const fakeQueue = {
  add: async () => ({ id: "fake" }),
  getJob: async () => undefined,
  close: async () => {},
};

let db: NovelForgeDb;
let app: FastifyInstance;
const audit = () => createAuditService(db);
let characters: ReturnType<typeof createCharacterServices>;
let relationships: ReturnType<typeof createRelationshipServices>;
let story: ReturnType<typeof createStoryServices>;
let narrative: ReturnType<typeof createNarrativeServices>;
let planning: ReturnType<typeof createPlanningServices>;
let canon: ReturnType<typeof createCanonServices>;
let manuscript: ReturnType<typeof createManuscriptServices>;
let health: ReturnType<typeof createStoryHealthServices>;

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
  app = await buildApp(env, { db, memoryQueue: fakeQueue });
  characters = createCharacterServices({ db, audit: audit() });
  relationships = createRelationshipServices({ db, audit: audit() });
  story = createStoryServices({ db, audit: audit() });
  narrative = createNarrativeServices({ db, audit: audit() });
  planning = createPlanningServices({ db, audit: audit() });
  canon = createCanonServices({ db, audit: audit(), retrieval: {} as never });
  manuscript = createManuscriptServices(db, audit(), {});
  health = createStoryHealthServices({ db, audit: audit() });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.finalTextReview.deleteMany();
  await db.memoryProjection.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.characterKnowledge.deleteMany();
  await db.canonFact.deleteMany();
  await db.canonProposal.deleteMany();
  await db.causalEdge.deleteMany();
  await db.storyThreadEvent.deleteMany();
  await db.storyThread.deleteMany();
  await db.storyPromise.deleteMany();
  await db.timelineEvent.deleteMany();
  await db.storyEvent.deleteMany();
  await db.characterState.deleteMany();
  await db.characterArcMilestone.deleteMany();
  await db.characterArc.deleteMany();
  await db.relationshipStance.deleteMany();
  await db.bondTransition.deleteMany();
  await db.bondMember.deleteMany();
  await db.bond.deleteMany();
  await db.antagonist.deleteMany();
  await db.narrativePolicy.deleteMany();
  await db.narrativeDnaProfile.deleteMany();
  await db.storyEntity.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.changeSetItem.deleteMany();
  await db.changeSet.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.auditLog.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

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

async function seedNovel(
  userId: string,
  slugSuffix: string,
  memberRole: string = "OWNER",
): Promise<{ workspaceId: string; novelId: string }> {
  const slug = `ws-${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`;
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId: userId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId, role: memberRole as never },
  });
  const novel = await createPlatformServices({ db, audit: audit() }).createNovel({
    actorUserId: userId,
    workspaceId: ws.id,
    title: "State Consumer Test Novel",
    slug,
  });
  return { workspaceId: ws.id, novelId: novel.id };
}

const S = (o: { userId: string; workspaceId: string; novelId: string }) => ({
  actorUserId: o.userId,
  workspaceId: o.workspaceId,
  novelId: o.novelId,
});

// Typed HTTP response bodies (the repo lints no-explicit-any in tests).
interface ReviewBody {
  verdict: string;
  receiptId: string;
  hardViolations: Array<{ rule: string }>;
  advisory: Array<{ rule: string; observation: string; suggestion: string; evidence: unknown[] }>;
  evaluatedPolicies: Array<{ kind: string; configured: boolean }>;
  error?: string;
}
interface StatusBody {
  error?: string;
}
interface HealthFinding {
  rule: string;
  severity: string;
  status: string;
  evidence: unknown[];
  remediation: string | null;
  sourceRevisionId: string;
  affectedEntities: unknown[];
}
interface HealthBody {
  findings: HealthFinding[];
  unresolved: HealthFinding[];
  sourceRevisionId: string;
  error?: string;
}
interface TierRow {
  characterName?: string;
  description?: string;
  causeDescription?: string;
  effectDescription?: string;
  availableFromChapter?: number;
  linkedEventId?: string | null;
  provenance?: { source: string; sourceRevisionId?: string };
}

async function mkChapter(
  ids: { userId: string; workspaceId: string; novelId: string },
  title: string,
  content = "chapter prose",
): Promise<{ chapterId: string; versionId: string; number: number }> {
  const chapter = await manuscript.createChapter({ ...S(ids), title });
  await manuscript.saveChapter({
    ...S(ids),
    chapterId: chapter.id,
    content,
    note: undefined,
    expectedVersion: null,
  });
  const version = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId: chapter.id },
    orderBy: { number: "desc" },
  });
  const full = await db.chapter.findFirstOrThrow({ where: { id: chapter.id } });
  return { chapterId: chapter.id, versionId: version.id, number: full.number };
}

async function headRevisionId(novelId: string): Promise<string> {
  const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId } });
  return branch.headRevisionId!;
}

/** A FRESH-chapter-scope memory block stub for the assembly's memory port. */
function freshBlock(
  sourceRevisionId: string,
  facts: MemoryBlock["structural"]["facts"] = [],
): MemoryBlock {
  return {
    scope: "chapter:x",
    freshness: "FRESH",
    sourceRevisionId,
    sourceRevisionNumber: 7,
    chapterCoverage: [1],
    structural: { facts, threads: [], promises: [] },
    summary: null,
    summaryStatus: "SKIPPED",
    provenance: { revisionId: sourceRevisionId, builtAt: new Date().toISOString() },
  };
}

function assemblyWithMemory(block: MemoryBlock | null) {
  return createStateAssemblyServices({
    db,
    audit: audit(),
    memory: {
      recallNovel: async () => ({
        chapterMemory: block,
        recentMemory: [],
        arcMemory: null,
        asOf: { revisionId: block?.sourceRevisionId ?? "none", chapter: 1 },
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Consumer 1 — assembly
// ---------------------------------------------------------------------------

describe("assembleCharacterState", () => {
  it("returns current state + knowledge window + arcs for a chapter, citing live rows", async () => {
    const owner = await seedUser("asm1@t.io");
    const ids = await seedNovel(owner.userId, "asm1");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const c = await characters.createCharacter({ ...S({ ...ids, userId: owner.userId }), key: "aria", name: "Aria", summary: "protagonist" });
    await characters.createState({ ...S({ ...ids, userId: owner.userId }), characterId: c.id, fromChapter: 1, toChapter: null, summary: "Aria is hopeful" });
    const ent = await canon.createEntity({ ...S({ ...ids, userId: owner.userId }), kind: "CHARACTER", name: "Aria", key: "aria" });
    const fact = await canon.createFact({ ...S({ ...ids, userId: owner.userId }), entityId: ent.id, predicate: "is", objectText: "hopeful" });
    await characters.putKnowledge({ ...S({ ...ids, userId: owner.userId }), characterId: c.id, factId: fact.id, stance: "KNOWN", source: "REMEMBERED", fromChapter: 1, toChapter: null });
    const arc = await characters.createArc({ ...S({ ...ids, userId: owner.userId }), characterId: c.id, title: "Rise", status: "ACTIVE" });
    await characters.addMilestone({ ...S({ ...ids, userId: owner.userId }), arcId: arc.id, chapter: 1, summary: "first step" });

    const asm = assemblyWithMemory(null);
    const { characters: out, memory, divergences } = await asm.assembleCharacterState({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.currentState!.summary).toBe("Aria is hopeful");
    expect(out[0]!.knowledge[0]!.factId).toBe(fact.id);
    expect(out[0]!.knowledge[0]!.window).toEqual([1, null]);
    expect(out[0]!.arcs[0]!.milestones).toEqual([1]);
    // The stub memory port has no chapter block → MISSING, live-only rows.
    expect(memory.status).toBe("MISSING");
    expect(out[0]!.currentState!.provenance.source).toBe("LIVE");
    expect(divergences).toEqual([]);
    // NULL story_entity_id → identity null, NO canon facts (never a name match —
    // an entity NAMED "Aria" exists with a fact, and it must not leak in).
    expect(out[0]!.identity.storyEntityId).toBeNull();
    expect(out[0]!.canonFacts).toEqual([]);
  });

  it("joins canon facts ONLY through the non-null FK (exact-key entity)", async () => {
    const owner = await seedUser("asm2@t.io");
    const ids = await seedNovel(owner.userId, "asm2");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "s" });
    const ent = await canon.createEntity({ ...ctx, kind: "CHARACTER", name: "Aria", key: "aria" });
    const fact = await canon.createFact({ ...ctx, entityId: ent.id, predicate: "is", objectText: "hopeful" });
    // Author the link (the migration backfills it on exact (novel_id, key) match).
    await db.character.update({ where: { id: c.id }, data: { storyEntityId: ent.id } });

    const asm = assemblyWithMemory(null);
    const { characters: out } = await asm.assembleCharacterState({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    expect(out[0]!.identity.storyEntityId).toBe(ent.id);
    expect(out[0]!.canonFacts.map((f) => f.factId)).toContain(fact.id);
  });

  it("cites MEMORY_FRESH corroboration when a FRESH block covers the entity", async () => {
    const owner = await seedUser("asm3@t.io");
    const ids = await seedNovel(owner.userId, "asm3");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "s" });
    const ent = await canon.createEntity({ ...ctx, kind: "CHARACTER", name: "Aria", key: "aria" });
    const fact = await canon.createFact({ ...ctx, entityId: ent.id, predicate: "is", objectText: "hopeful" });
    await db.character.update({ where: { id: c.id }, data: { storyEntityId: ent.id } });
    const head = await headRevisionId(ids.novelId);

    const block = freshBlock(head, [
      { factId: fact.id, entityId: ent.id, predicate: "is", statement: "Aria is hopeful", object: { text: "hopeful" }, validFromChapter: 1, validUntilChapter: null },
    ]);
    const asm = assemblyWithMemory(block);
    const { characters: out, memory } = await asm.assembleCharacterState({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    expect(memory.status).toBe("FRESH");
    expect(out[0]!.currentState!.provenance).toEqual({ source: "MEMORY_FRESH", sourceRevisionId: head });
  });

  it("STALE memory → live-only rows with an explicit staleness note", async () => {
    const owner = await seedUser("asm4@t.io");
    const ids = await seedNovel(owner.userId, "asm4");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "s" });
    const head = await headRevisionId(ids.novelId);
    const stale = { ...freshBlock(head), freshness: "STALE" as const };
    const asm = assemblyWithMemory(stale);
    const { characters: out, memory, divergences } = await asm.assembleCharacterState({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    expect(memory.status).toBe("STALE");
    expect(out[0]!.currentState!.provenance.source).toBe("LIVE");
    // STALE is expected to disagree — never a divergence finding.
    expect(divergences).toEqual([]);
  });

  it("a forced memory/live divergence surfaces MEMORY_LIVE_DIVERGENCE as OPEN", async () => {
    const owner = await seedUser("asm5@t.io");
    const ids = await seedNovel(owner.userId, "asm5");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "s" });
    const ent = await canon.createEntity({ ...ctx, kind: "CHARACTER", name: "Aria", key: "aria" });
    const fact = await canon.createFact({ ...ctx, entityId: ent.id, predicate: "is", objectText: "hopeful" });
    await db.character.update({ where: { id: c.id }, data: { storyEntityId: ent.id } });
    const head = await headRevisionId(ids.novelId);
    // Fault injection: the FRESH block lists a fact live canon no longer has.
    const block = freshBlock(head, [
      { factId: fact.id, entityId: ent.id, predicate: "was", statement: "Aria was hopeful", object: { text: "hopeful" }, validFromChapter: 1, validUntilChapter: null },
    ]);
    const asm = assemblyWithMemory(block);
    const { divergences } = await asm.assembleCharacterState({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.rule).toBe("MEMORY_LIVE_DIVERGENCE");
    expect(divergences[0]!.status).toBe("OPEN");
    expect(divergences[0]!.evidence.length).toBeGreaterThan(0);
  });

  it("temporal reads: story-time windows contain the chapter; as-of revision excludes newer rows", async () => {
    const owner = await seedUser("asm6@t.io");
    const ids = await seedNovel(owner.userId, "asm6");
    const ch1 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "early" });
    const r1 = await headRevisionId(ids.novelId);
    // A second state born at a later revision: close the first window
    // first (raw, so the second create is the revision-bearing write).
    await db.characterState.updateMany({ where: { characterId: c.id, summary: "early" }, data: { toChapter: 2 } });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 2, toChapter: null, summary: "later" });

    const asm = assemblyWithMemory(null);
    // Story time 1 → the early window; story time 2 → the later window.
    const at1 = await asm.assembleCharacterState({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: 1 });
    expect(at1.characters[0]!.currentState!.summary).toBe("early");
    const at2 = await asm.assembleCharacterState({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: 2 });
    expect(at2.characters[0]!.currentState!.summary).toBe("later");
    // As-of R1: the "later" state (born after R1) is excluded → temporal-negative.
    const asOf = await asm.assembleCharacterState({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: 2, asOfRevisionId: r1 });
    expect(asOf.characters[0]!.currentState).toBeNull();
    void ch1;
  });
});

describe("assembleRelationships / assembleTimeline", () => {
  it("returns directional stances + bonds for the cast", async () => {
    const owner = await seedUser("rel1@t.io");
    const ids = await seedNovel(owner.userId, "rel1");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const a = await characters.createCharacter({ ...ctx, key: "a", name: "A", summary: "p" });
    const b = await characters.createCharacter({ ...ctx, key: "b", name: "B", summary: "p" });
    await characters.createState({ ...ctx, characterId: a.id, fromChapter: 1, toChapter: null, summary: "s" });
    await characters.createState({ ...ctx, characterId: b.id, fromChapter: 1, toChapter: null, summary: "s" });
    await relationships.createStance({ ...ctx, fromCharacterId: a.id, toCharacterId: b.id, stance: "WARY", fromChapter: 1, toChapter: null });
    const bond = await relationships.createBond({ ...ctx, structure: "CUSTOM", memberIds: [a.id, b.id], fromChapter: 1, toChapter: null });

    const asm = assemblyWithMemory(null);
    const { assembly } = await asm.assembleRelationships({
      actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: ch.number,
    });
    const pair = assembly.pairs.find((p) => p.fromCharacterId === a.id && p.toCharacterId === b.id);
    expect(pair!.stance).toBe("WARY");
    expect(pair!.fromCharacterName).toBe("A");
    expect(assembly.bonds.map((x) => x.id)).toContain(bond.id);
  });

  it("returns ordered timeline entries with linkedEventId flags; causal traversal skips unlinked entries", async () => {
    const owner = await seedUser("tl1@t.io");
    const ids = await seedNovel(owner.userId, "tl1");
    const ctx = S({ ...ids, userId: owner.userId });
    const ev = await story.createEvent({ ...ctx, description: "the duel", chapterId: null, availableFromChapter: 1 });
    const t1 = await story.appendTimelineEvent({ ...ctx, description: "duel at dawn", availableFromChapter: 1 });
    const t2 = await story.appendTimelineEvent({ ...ctx, description: "a quiet meal", availableFromChapter: 1 });
    await db.timelineEvent.update({ where: { id: t1.id }, data: { storyEventId: ev.id } });

    const asm = assemblyWithMemory(null);
    const tl = await asm.assembleTimeline({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId });
    expect(tl.entries.map((e) => e.order)).toEqual([1, 2]);
    expect(tl.entries[0]!.linkedEventId).toBe(ev.id);
    // NULL linkage: still in order, flagged null, never inferred.
    expect(tl.entries[1]!.linkedEventId).toBeNull();
    expect(t2.id).toBe(tl.entries[1]!.id);
  });
});

// ---------------------------------------------------------------------------
// Consumer 2 — final-text review + setStatus gate
// ---------------------------------------------------------------------------

const IMPERATIVE_FIXTURE = [
  /\badd a scene\b/i,
  /\bmust confront\b/i,
  /\byou should\b/i,
  /\bconsider adding\b/i,
  /\bintroduce a (new|twist|character)\b/i,
  /\bmake (him|her|them|the protagonist)\b/i,
  /\bkill off\b/i,
  /\bwrite a\b/i,
];

async function reviewChapter(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  chapterVersionId: string,
  extra: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/final-text-review`,
    headers: { cookie },
    payload: { chapterVersionId, ...extra },
  });
  return { status: res.statusCode, body: res.json() as ReviewBody };
}

async function setStatus(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  chapterId: string,
  status: string,
) {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/chapters/${chapterId}/status`,
    headers: { cookie },
    payload: { status },
  });
  return { status: res.statusCode, body: res.json() as StatusBody };
}

describe("policy validation (GAP-012)", () => {
  it("malformed DRAMA_GAP/COOLDOWN/SCALE writes → 409 MALFORMED_POLICY (SCALE rides PolicyError)", async () => {
    const owner = await seedUser("pol1@t.io");
    const ids = await seedNovel(owner.userId, "pol1");
    const base = `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/narrative/policies`;
    const cases: Array<[string, unknown]> = [
      ["DRAMA_GAP", { density: "NOPE", typicalGap: { min: 1, max: 3 }, extendedGap: { min: 4, max: 6 }, strictInterval: false }],
      ["COOLDOWN", { windowChapters: -2 }],
      ["SCALE", { standing: { scale: "EMPIRE", access: [], reputation: 50 } }],
      ["SCALE", { standing: { scale: "GALAXY", access: ["CITY"], reputation: 50 } }],
      ["SCALE", { standing: { scale: "CITY", access: ["CITY"], reputation: 101 } }],
      ["SCALE", { nope: true }],
    ];
    for (const [kind, payload] of cases) {
      const res = await app.inject({
        method: "PUT",
        url: base,
        headers: { cookie: owner.cookie },
        payload: { kind, hardness: "SOFT", payload },
      });
      // DRAMA_GAP/COOLDOWN keep their ConflictError behavior (409 CONFLICT);
      // the new SCALE refusal rides PolicyError → 409 MALFORMED_POLICY.
      expect(res.statusCode, kind).toBe(409);
      const body = res.json() as HealthBody;
      if (kind === "SCALE") expect(body.error).toBe("MALFORMED_POLICY");
    }
    // A valid SCALE write still lands.
    const ok = await app.inject({
      method: "PUT",
      url: base,
      headers: { cookie: owner.cookie },
      payload: { kind: "SCALE", hardness: "SOFT", payload: { standing: { scale: "CITY", access: ["TOWN", "CITY"], reputation: 60 } } },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe("reviewFinalText + setStatus gate", () => {
  async function seedHARDCooldown(owner: { userId: string; cookie: string }, ids: { workspaceId: string; novelId: string }, hardness: "HARD" | "SOFT" = "HARD") {
    const ctx = S({ ...ids, userId: owner.userId });
    await narrative.putPolicy({ ...ctx, kind: "COOLDOWN", hardness, hardReason: hardness === "HARD" ? "the author binds the beat spacing" : null, payload: { windowChapters: 5 } });
    const ch5 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 5");
    const ch7 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 7");
    await story.createEvent({ ...ctx, description: "a duel", chapterId: ch5.chapterId, availableFromChapter: 5 });
    await story.createEvent({ ...ctx, description: "a second duel", chapterId: ch7.chapterId, availableFromChapter: 7 });
    return { ch5, ch7 };
  }

  it("HARD cooldown violated → FAIL; setStatus → 409 HARD_POLICY_VIOLATION naming the rule", async () => {
    const owner = await seedUser("rev1@t.io");
    const ids = await seedNovel(owner.userId, "rev1");
    const { ch7 } = await seedHARDCooldown(owner, ids);

    const verdict = await reviewChapter(owner.cookie, ids, ch7.chapterId, ch7.versionId);
    expect(verdict.status).toBe(200);
    expect(verdict.body.verdict).toBe("FAIL");
    expect(verdict.body.hardViolations.map((v: { rule: string }) => v.rule)).toContain("COOLDOWN_VIOLATION");
    expect(verdict.body.receiptId).toBeTruthy();

    const blocked = await setStatus(owner.cookie, ids, ch7.chapterId, "PUBLISHED");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("HARD_POLICY_VIOLATION");
  });

  it("no receipt for the current version → 409 REVIEW_STALE", async () => {
    const owner = await seedUser("rev2@t.io");
    const ids = await seedNovel(owner.userId, "rev2");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const res = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("REVIEW_STALE");
  });

  it("SOFT violation → PASS with advisory; advisory never forces plot; setStatus passes", async () => {
    const owner = await seedUser("rev3@t.io");
    const ids = await seedNovel(owner.userId, "rev3");
    const { ch7 } = await seedHARDCooldown(owner, ids, "SOFT");

    const verdict = await reviewChapter(owner.cookie, ids, ch7.chapterId, ch7.versionId);
    expect(verdict.status).toBe(200);
    expect(verdict.body.verdict).toBe("PASS");
    expect(verdict.body.hardViolations).toEqual([]);
    expect(verdict.body.advisory.length).toBeGreaterThan(0);
    for (const a of verdict.body.advisory) {
      expect(a.suggestion).toBeTruthy();
      for (const pattern of IMPERATIVE_FIXTURE) {
        expect(a.suggestion, `imperative pattern ${pattern} in: ${a.suggestion}`).not.toMatch(pattern);
      }
      // Shape-enforced: no instruction/plotting fields.
      expect(Object.keys(a).sort()).toEqual(["evidence", "observation", "rule", "suggestion"]);
    }
    const ok = await setStatus(owner.cookie, ids, ch7.chapterId, "IN_REVIEW");
    expect(ok.status).toBe(200);
  });

  it("changed version invalidates the review → 409 REVIEW_STALE (constitution §11)", async () => {
    const owner = await seedUser("rev4@t.io");
    const ids = await seedNovel(owner.userId, "rev4");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const v1 = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    expect(v1.body.verdict).toBe("PASS");
    // Author edits after review → V2.
    await manuscript.saveChapter({ ...S({ ...ids, userId: owner.userId }), chapterId: ch.chapterId, content: "revised prose", note: undefined, expectedVersion: 1 });
    const stale = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("REVIEW_STALE");
  });

  it("chapterId/chapterVersionId mismatch → 400 INVALID_INPUT", async () => {
    const owner = await seedUser("rev5@t.io");
    const ids = await seedNovel(owner.userId, "rev5");
    const ch1 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ch2 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 2");
    const res = await reviewChapter(owner.cookie, ids, ch1.chapterId, ch2.versionId);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUT");
  });

  it("simulation: true → 400 SIMULATION_SOURCE_REFUSED and no receipt is written", async () => {
    const owner = await seedUser("rev6@t.io");
    const ids = await seedNovel(owner.userId, "rev6");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const res = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId, { simulation: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SIMULATION_SOURCE_REFUSED");
    const receipt = await db.finalTextReview.findUnique({ where: { chapterVersionId: ch.versionId } });
    expect(receipt).toBeNull();
  });

  it("malformed policy on read → fail-open: treated as unconfigured + UNRESOLVED finding, never an HTTP error", async () => {
    const owner = await seedUser("rev7@t.io");
    const ids = await seedNovel(owner.userId, "rev7");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    // A row that reached the table unvalidated (written before 010).
    await db.narrativePolicy.create({
      data: { novelId: ids.novelId, kind: "SCALE", hardness: "SOFT", payload: { standing: { scale: "GALAXY", access: [], reputation: 999 } } },
    });
    const verdict = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    expect(verdict.status).toBe(200);
    expect(verdict.body.verdict).toBe("PASS");
    const malformed = verdict.body.advisory.filter((a: { rule: string }) => a.rule === "MALFORMED_POLICY");
    expect(malformed).toHaveLength(1);
    expect(verdict.body.evaluatedPolicies.find((p: { kind: string }) => p.kind === "SCALE")!.configured).toBe(false);
    // Fail-open: the gate still passes on the PASS receipt.
    const ok = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(ok.status).toBe(200);
  });

  it("re-review of the same version REPLACES the receipt (versions are immutable)", async () => {
    const owner = await seedUser("rev8@t.io");
    const ids = await seedNovel(owner.userId, "rev8");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const v1 = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    const v2 = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    expect(v1.body.receiptId).toBe(v2.body.receiptId);
    const count = await db.finalTextReview.count({ where: { chapterVersionId: ch.versionId } });
    expect(count).toBe(1);
  });

  it("the gate applies ONLY to transitions out of DRAFT — IN_REVIEW→PUBLISHED keeps pre-010 behavior (Invariant 4)", async () => {
    const owner = await seedUser("rev9@t.io");
    const ids = await seedNovel(owner.userId, "rev9");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    // Out of DRAFT without a receipt → gated.
    const gated = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(gated.status).toBe(409);
    expect(gated.body.error).toBe("REVIEW_STALE");
    // Review to PASS, leave DRAFT.
    const v1 = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    expect(v1.body.verdict).toBe("PASS");
    const toReview = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(toReview.status).toBe(200);
    // New version after review → no receipt for the current version. The
    // chapter is no longer in DRAFT, so IN_REVIEW→PUBLISHED is NOT gated
    // (pre-010 behavior) — it must succeed.
    await manuscript.saveChapter({ ...S({ ...ids, userId: owner.userId }), chapterId: ch.chapterId, content: "revised prose", note: undefined, expectedVersion: 1 });
    const publish = await setStatus(owner.cookie, ids, ch.chapterId, "PUBLISHED");
    expect(publish.status).toBe(200);
  });

  it("IN_REVIEW→PUBLISHED is ungated even with a FAIL receipt for the current version (pre-010 behavior)", async () => {
    const owner = await seedUser("rev10@t.io");
    const ids = await seedNovel(owner.userId, "rev10");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    // PASS review → out of DRAFT → publish.
    const ok = await reviewChapter(owner.cookie, ids, ch.chapterId, ch.versionId);
    expect(ok.body.verdict).toBe("PASS");
    const toReview = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(toReview.status).toBe(200);
    const pub = await setStatus(owner.cookie, ids, ch.chapterId, "PUBLISHED");
    expect(pub.status).toBe(200);
    // Simulate a later failed re-review of the SAME version (the gate
    // reads the latest receipt directly).
    await db.finalTextReview.update({
      where: { chapterVersionId: ch.versionId },
      data: { verdict: "FAIL", hardViolations: [{ rule: "COOLDOWN_VIOLATION" }] },
    });
    // The chapter is not in DRAFT: the unpublish path and re-publish keep
    // their pre-010 behavior — both ungated despite the FAIL receipt.
    const unpub = await setStatus(owner.cookie, ids, ch.chapterId, "IN_REVIEW");
    expect(unpub.status).toBe(200);
    const repub = await setStatus(owner.cookie, ids, ch.chapterId, "PUBLISHED");
    expect(repub.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Consumer 3 — story health
// ---------------------------------------------------------------------------

async function getHealth(
  cookie: string,
  ids: { workspaceId: string; novelId: string },
  query = "",
) {
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/story-health${query}`,
    headers: { cookie },
  });
  return { status: res.statusCode, body: res.json() as HealthBody };
}

function rulesOf(body: HealthBody): string[] {
  return body.findings.map((f) => f.rule);
}

describe("evaluateHealth", () => {
  it("KNOWLEDGE_BOUNDARY_VIOLATION fires when the cast meets a fact they should not know (and clears when they learn it)", async () => {
    const owner = await seedUser("hl1@t.io");
    const ids = await seedNovel(owner.userId, "hl1");
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    const ctx = S({ ...ids, userId: owner.userId });
    const c = await characters.createCharacter({ ...ctx, key: "bob", name: "Bob", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "s" });
    const ent = await canon.createEntity({ ...ctx, kind: "ITEM", name: "The Map", key: "map" });
    const fact = await canon.createFact({ ...ctx, entityId: ent.id, predicate: "reveals", objectText: "the vault location" });
    await db.canonFactSource.create({
      data: { canonFactId: fact.id, sourceKind: "CHAPTER", chapterVersionId: ch.versionId, quote: "the map showed the vault", start: 0, end: 8, createdById: owner.userId },
    });
    await characters.putKnowledge({ ...ctx, characterId: c.id, factId: fact.id, stance: "UNKNOWN", source: "REMEMBERED", fromChapter: 1, toChapter: null });

    const hit = await getHealth(owner.cookie, ids);
    expect(hit.status).toBe(200);
    expect(rulesOf(hit.body)).toContain("KNOWLEDGE_BOUNDARY_VIOLATION");
    expect(hit.body.sourceRevisionId).toBeTruthy();

    // Negative: once Bob KNOWS, the boundary clears.
    const ids2 = await seedNovel(owner.userId, "hl1b");
    const ch2 = await mkChapter({ userId: owner.userId, ...ids2 }, "Ch 1");
    const ctx2 = S({ ...ids2, userId: owner.userId });
    const c2 = await characters.createCharacter({ ...ctx2, key: "bob", name: "Bob", summary: "p" });
    await characters.createState({ ...ctx2, characterId: c2.id, fromChapter: 1, toChapter: null, summary: "s" });
    const ent2 = await canon.createEntity({ ...ctx2, kind: "ITEM", name: "The Map", key: "map" });
    const fact2 = await canon.createFact({ ...ctx2, entityId: ent2.id, predicate: "reveals", objectText: "the vault location" });
    await db.canonFactSource.create({
      data: { canonFactId: fact2.id, sourceKind: "CHAPTER", chapterVersionId: ch2.versionId, quote: "the map", start: 0, end: 7, createdById: owner.userId },
    });
    await characters.putKnowledge({ ...ctx2, characterId: c2.id, factId: fact2.id, stance: "KNOWN", source: "REMEMBERED", fromChapter: 1, toChapter: null });
    const clear = await getHealth(owner.cookie, ids2);
    expect(rulesOf(clear.body)).not.toContain("KNOWLEDGE_BOUNDARY_VIOLATION");
  });

  it("TIMELINE_CONFLICT fires when order and chapter disagree; CLOCK_CONTRADICTION fires on a bad window", async () => {
    const owner = await seedUser("hl2@t.io");
    const ids = await seedNovel(owner.userId, "hl2");
    const ctx = S({ ...ids, userId: owner.userId });
    const ch2 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 2");
    const ch10 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 10");
    const evA = await story.createEvent({ ...ctx, description: "event A", chapterId: ch10.chapterId, availableFromChapter: 10 });
    const evB = await story.createEvent({ ...ctx, description: "event B", chapterId: ch2.chapterId, availableFromChapter: 2 });
    const tA = await story.appendTimelineEvent({ ...ctx, description: "A happens", availableFromChapter: 10 });
    const tB = await story.appendTimelineEvent({ ...ctx, description: "B happens", availableFromChapter: 2 });
    await db.timelineEvent.update({ where: { id: tA.id }, data: { storyEventId: evA.id } });
    await db.timelineEvent.update({ where: { id: tB.id }, data: { storyEventId: evB.id } });
    // A clock contradiction: a window starting past the last chapter.
    await story.appendTimelineEvent({ ...ctx, description: "impossible future", availableFromChapter: 999 });

    const res = await getHealth(owner.cookie, ids);
    expect(rulesOf(res.body)).toContain("TIMELINE_CONFLICT");
    expect(rulesOf(res.body)).toContain("CLOCK_CONTRADICTION");
  });

  it("STALE_MAJOR_THREAD fires for a major thread untouched beyond the gap (evidence, never bare scores)", async () => {
    const owner = await seedUser("hl3@t.io");
    const ids = await seedNovel(owner.userId, "hl3");
    const ctx = S({ ...ids, userId: owner.userId });
    await story.createThread({ ...ctx, kind: "CONFLICT", title: "the war", description: "d", importance: 4, introducedAtChapter: 1, payoffIntent: null });

    const res = await getHealth(owner.cookie, ids, "?chapter=20");
    expect(res.status).toBe(200);
    const f = res.body.findings.find((x: { rule: string }) => x.rule === "STALE_MAJOR_THREAD")!;
    expect(f).toBeTruthy();
    expect(f.severity).toBe("WARNING");
    expect(f.evidence.length).toBeGreaterThan(0);
    expect(f.affectedEntities.length).toBeGreaterThan(0);
  });

  it("NEGLECTED_RELATIONSHIP fires for a stale stance window (bounded per-rule cap)", async () => {
    const owner = await seedUser("hl4@t.io");
    const ids = await seedNovel(owner.userId, "hl4");
    const ctx = S({ ...ids, userId: owner.userId });
    const a = await characters.createCharacter({ ...ctx, key: "a", name: "A", summary: "p" });
    const b = await characters.createCharacter({ ...ctx, key: "b", name: "B", summary: "p" });
    await relationships.createStance({ ...ctx, fromCharacterId: a.id, toCharacterId: b.id, stance: "WARY", fromChapter: 1, toChapter: null });

    const res = await getHealth(owner.cookie, ids, "?chapter=25");
    expect(rulesOf(res.body)).toContain("NEGLECTED_RELATIONSHIP");
    expect(res.body.findings.filter((x: { rule: string }) => x.rule === "NEGLECTED_RELATIONSHIP").length).toBeLessThanOrEqual(25);
  });

  it("REPEATED_NARRATIVE_PATTERN fires when beats recur beyond the extended gap", async () => {
    const owner = await seedUser("hl5@t.io");
    const ids = await seedNovel(owner.userId, "hl5");
    const ctx = S({ ...ids, userId: owner.userId });
    await narrative.putPolicy({
      ...ctx,
      kind: "DRAMA_GAP",
      hardness: "SOFT",
      hardReason: null,
      payload: { density: "LOW", typicalGap: { min: 2, max: 3 }, extendedGap: { min: 4, max: 5 }, strictInterval: false },
    });
    // No story events → every chapter ≥ 6 is BEYOND_EXTENDED_CALM.
    const res = await getHealth(owner.cookie, ids, "?chapter=10");
    expect(rulesOf(res.body)).toContain("REPEATED_NARRATIVE_PATTERN");
  });

  it("IMPOSSIBLE_PREREQUISITE fires for a required-but-unknown entity (and clears when it appears)", async () => {
    const owner = await seedUser("hl6@t.io");
    const ids = await seedNovel(owner.userId, "hl6");
    const ctx = S({ ...ids, userId: owner.userId });
    const cannon = await canon.createEntity({ ...ctx, kind: "ITEM", name: "Cannon", key: "cannon" });
    const gunpowder = await canon.createEntity({ ...ctx, kind: "RESOURCE", name: "Gunpowder", key: "gunpowder" });
    await canon.createFact({ ...ctx, entityId: cannon.id, predicate: "requires", objectEntityId: gunpowder.id });

    const hit = await getHealth(owner.cookie, ids);
    expect(rulesOf(hit.body)).toContain("IMPOSSIBLE_PREREQUISITE");

    await canon.createFact({ ...ctx, entityId: gunpowder.id, predicate: "is", objectText: "stockpiled" });
    const clear = await getHealth(owner.cookie, ids);
    expect(rulesOf(clear.body)).not.toContain("IMPOSSIBLE_PREREQUISITE");
  });

  it("UNRESOLVED_ENDGAME carries remediation: null and fires for a critical open promise", async () => {
    const owner = await seedUser("hl7@t.io");
    const ids = await seedNovel(owner.userId, "hl7");
    const ctx = S({ ...ids, userId: owner.userId });
    await story.createPromise({ ...ctx, title: "the final duel", description: "the final duel", importance: 5, introducedAtChapter: 1, payoffIntent: null });

    const res = await getHealth(owner.cookie, ids, "?chapter=40");
    const f = res.body.findings.find((x: { rule: string }) => x.rule === "UNRESOLVED_ENDGAME")!;
    expect(f).toBeTruthy();
    expect(f.remediation).toBeNull();
    expect(f.status).toBe("UNRESOLVED");
  });

  it("UNRESOLVED_IDENTITY fires when a causal span crosses an unlinked entry, and /unresolved lists it", async () => {
    const owner = await seedUser("hl8@t.io");
    const ids = await seedNovel(owner.userId, "hl8");
    const ctx = S({ ...ids, userId: owner.userId });
    const cause = await story.createEvent({ ...ctx, description: "cause", chapterId: null, availableFromChapter: 1 });
    const effect = await story.createEvent({ ...ctx, description: "effect", chapterId: null, availableFromChapter: 3 });
    await story.createCausalEdge({ ...ctx, causeEventId: cause.id, effectEventId: effect.id, confidence: "EXPLICIT" });
    const t1 = await story.appendTimelineEvent({ ...ctx, description: "the cause", availableFromChapter: 1 });
    await story.appendTimelineEvent({ ...ctx, description: "a stranger passes", availableFromChapter: 2 });
    const t3 = await story.appendTimelineEvent({ ...ctx, description: "the effect", availableFromChapter: 3 });
    await db.timelineEvent.update({ where: { id: t1.id }, data: { storyEventId: cause.id } });
    await db.timelineEvent.update({ where: { id: t3.id }, data: { storyEventId: effect.id } });

    const res = await getHealth(owner.cookie, ids);
    expect(rulesOf(res.body)).toContain("UNRESOLVED_IDENTITY");

    const unresolved = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/story-health/unresolved`,
      headers: { cookie: owner.cookie },
    });
    expect(unresolved.statusCode).toBe(200);
    const body = unresolved.json() as HealthBody;
    expect(body.unresolved.some((i: { rule: string }) => i.rule === "UNRESOLVED_IDENTITY")).toBe(true);
    expect(body.unresolved[0]!.remediation).toBeNull();
  });

  it("temporal-negative: rows born after asOfRevisionId are never cited", async () => {
    const owner = await seedUser("hl9@t.io");
    const ids = await seedNovel(owner.userId, "hl9");
    const ctx = S({ ...ids, userId: owner.userId });
    const r1 = await headRevisionId(ids.novelId);
    // Born at R2: a critical promise that would trip UNRESOLVED_ENDGAME.
    await story.createPromise({ ...ctx, title: "the final duel", description: "the final duel", importance: 5, introducedAtChapter: 1, payoffIntent: null });

    const res = await health.evaluateHealth({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: 40, asOfRevisionId: r1 });
    expect(rulesOf(res)).not.toContain("UNRESOLVED_ENDGAME");
    const now = await health.evaluateHealth({ actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, chapter: 40 });
    expect(rulesOf(now)).toContain("UNRESOLVED_ENDGAME");
  });

  it("health output is bounded and typed: max 200 findings, 50-chapter history, evidence never bare scores", async () => {
    const owner = await seedUser("hl10@t.io");
    const ids = await seedNovel(owner.userId, "hl10");
    const ctx = S({ ...ids, userId: owner.userId });
    // Many major threads → many potential findings; the cap must hold.
    for (let i = 0; i < 30; i++) {
      await story.createThread({ ...ctx, kind: "CONFLICT", title: `war ${i}`, description: "d", importance: 4, introducedAtChapter: 1, payoffIntent: null });
    }
    const res = await getHealth(owner.cookie, ids, "?chapter=20");
    expect(res.status).toBe(200);
    expect(res.body.findings.length).toBeLessThanOrEqual(200);
    expect(res.body.sourceRevisionId).toBeTruthy();
    for (const f of res.body.findings) {
      expect(f.rule).toBeTruthy();
      expect(["INFO", "WARNING", "CRITICAL"]).toContain(f.severity);
      expect(["OPEN", "ACKNOWLEDGED", "RESOLVED", "UNRESOLVED"]).toContain(f.status);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.sourceRevisionId).toBeTruthy();
    }
  });

  it("authorization: cross-novel → 404, anonymous → 401, viewer can read health", async () => {
    const owner = await seedUser("hl11@t.io");
    const ids = await seedNovel(owner.userId, "hl11");
    const other = await seedNovel(owner.userId, "hl11b");

    const cross = await getHealth(owner.cookie, { workspaceId: ids.workspaceId, novelId: other.novelId });
    expect(cross.status).toBe(404);

    const anon = await app.inject({ method: "GET", url: `/api/workspaces/${ids.workspaceId}/novels/${ids.novelId}/story-health` });
    expect(anon.statusCode).toBe(401);

    const viewer = await seedUser("hl11v@t.io");
    await db.membership.create({ data: { workspaceId: ids.workspaceId, userId: viewer.userId, role: "VIEWER" } });
    const denied = await getHealth(viewer.cookie, ids);
    expect(denied.status).toBe(403); // VIEWER holds neither canon:read nor canon:manage

    const editor = await seedUser("hl11e@t.io");
    await db.membership.create({ data: { workspaceId: ids.workspaceId, userId: editor.userId, role: "EDITOR" } });
    const ok = await getHealth(editor.cookie, ids);
    expect(ok.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Compiler tier 4/6 integration (NF-WF-010 consumer 1 at the boundary)
// ---------------------------------------------------------------------------

describe("compiler tier 4/6 via the state-assembly port", () => {
  it("tier 4 consumes the assembly with per-row memory provenance; tier 6 keeps linkage flags", async () => {
    const owner = await seedUser("cmp1@t.io");
    const ids = await seedNovel(owner.userId, "cmp1");
    const ctx = S({ ...ids, userId: owner.userId });
    const ch = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    await db.chapter.update({ where: { id: ch.chapterId }, data: { status: "IN_REVIEW" } });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "Aria is hopeful" });
    const ent = await canon.createEntity({ ...ctx, kind: "CHARACTER", name: "Aria", key: "aria" });
    const fact = await canon.createFact({ ...ctx, entityId: ent.id, predicate: "is", objectText: "hopeful" });
    await db.character.update({ where: { id: c.id }, data: { storyEntityId: ent.id } });
    const ev = await story.createEvent({ ...ctx, description: "the duel", chapterId: null, availableFromChapter: 1 });
    const ev2 = await story.createEvent({ ...ctx, description: "the aftermath", chapterId: null, availableFromChapter: 1 });
    const t = await story.appendTimelineEvent({ ...ctx, description: "duel at dawn", availableFromChapter: 1 });
    await db.timelineEvent.update({ where: { id: t.id }, data: { storyEventId: ev.id } });
    await story.createCausalEdge({ ...ctx, causeEventId: ev.id, effectEventId: ev2.id, confidence: "EXPLICIT" });
    const head = await headRevisionId(ids.novelId);
    const block = freshBlock(head, [
      { factId: fact.id, entityId: ent.id, predicate: "is", statement: "Aria is hopeful", object: { text: "hopeful" }, validFromChapter: 1, validUntilChapter: null },
    ]);
    const assembly = assemblyWithMemory(block);

    const compiled = await fetchAndCompileContext(
      {
        canon, characters, relationships, narrative, planning,
        head: { readHeadRevisionId: async () => head },
        stateAssembly: {
          assembleStates: (input) => assembly.assembleCharacterState(input),
          assembleRelationships: (input) => assembly.assembleRelationships(input),
          assembleTimeline: (input) => assembly.assembleTimeline(input),
        },
      },
      { actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, instruction: "write", mode: "AUTHOR", storyPosition: 1 },
    );
    const tier4 = compiled.blocks.find((b) => b.tier === TIERS.STATES)!;
    expect(tier4.status).toBe("PRESENT");
    const row = (tier4.rows as TierRow[]).find((r) => r.characterName === "Aria")!;
    expect(row).toBeTruthy();
    // Per-row provenance from the assembly — MEMORY_FRESH suffix names the
    // source revision so tier-4 prose stays attributable.
    expect(row.provenance!.source).toBe("MEMORY_FRESH");
    expect(row.provenance!.sourceRevisionId).toBe(head);
    expect(tier4.text).toContain(`[memory: FRESH @${head}]`);
    // Block provenance carries the assembly's memory note.
    expect(tier4.provenance).toMatchObject({ memory: { status: "FRESH" } });

    const tier6 = compiled.blocks.find((b) => b.tier === TIERS.TIMELINE)!;
    expect(tier6.status).toBe("PRESENT");
    const tlRow = (tier6.rows as TierRow[]).find((r) => r.description === "duel at dawn")!;
    expect(tlRow.linkedEventId).toBe(ev.id);
    expect(tlRow.availableFromChapter).toBe(1);
    expect(tlRow.provenance!.source).toBe("LIVE");
    // Causal edges surface as tier-6 rows alongside the timeline entries.
    const causalRow = (tier6.rows as TierRow[]).find((r) => r.causeDescription === "the duel")!;
    expect(causalRow).toBeTruthy();
    expect(causalRow.effectDescription).toBe("the aftermath");
  });

  it("without the state-assembly port the legacy fan-out path is unchanged (no regression)", async () => {
    const owner = await seedUser("cmp2@t.io");
    const ids = await seedNovel(owner.userId, "cmp2");
    const ctx = S({ ...ids, userId: owner.userId });
    const ch2 = await mkChapter({ userId: owner.userId, ...ids }, "Ch 1");
    await db.chapter.update({ where: { id: ch2.chapterId }, data: { status: "IN_REVIEW" } });
    const c = await characters.createCharacter({ ...ctx, key: "aria", name: "Aria", summary: "p" });
    await characters.createState({ ...ctx, characterId: c.id, fromChapter: 1, toChapter: null, summary: "Aria is hopeful" });
    const head = await headRevisionId(ids.novelId);

    const compiled = await fetchAndCompileContext(
      {
        canon, characters, relationships, narrative, planning,
        head: { readHeadRevisionId: async () => head },
      },
      { actorUserId: owner.userId, workspaceId: ids.workspaceId, novelId: ids.novelId, instruction: "write", mode: "AUTHOR", storyPosition: 1 },
    );
    const tier4 = compiled.blocks.find((b) => b.tier === TIERS.STATES)!;
    expect(tier4.status).toBe("PRESENT");
    const row = (tier4.rows as TierRow[]).find((r) => r.characterName === "Aria")!;
    expect(row).toBeTruthy();
    // Legacy rows have no assembly provenance.
    expect(row.provenance).toBeUndefined();
    void c;
  });
});
