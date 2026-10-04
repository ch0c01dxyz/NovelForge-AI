/**
 * NF-WF-003 — shared chapter context compiler tests.
 *
 * Part 1 (pure): `compileContext` over object literals, no server, no DB.
 * Part 2 (integration): the bounded service reads against a scratch
 * database, plus the head pin and the caller-divergence checks.
 *
 * Every negative test is written to FAIL against the pre-003 behavior it
 * replaces (unbounded oldest-first read, silent break-truncation, latest-row
 * temporal reads, faked memory tiers, name-matched joins).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import {
  compileContext,
  emptyCompilerRows,
  fetchAndCompileContext,
  renderContextText,
  HeadConflictError,
  FACT_LIMIT,
  CAST_LIMIT,
  TIERS,
  type ResolvedCompilerInput,
} from "./services/context-compiler.ts";
import { createCanonServices } from "./services/canon.ts";
import { createCharacterServices } from "./services/characters.ts";
import { createRelationshipServices } from "./services/relationships.ts";
import { createPlanningServices } from "./services/planning.ts";
import { createNarrativeServices } from "./services/narrative.ts";
import { createAuditService } from "./services/audit.ts";
import { createPlatformServices } from "./services/platform.ts";
import { readHeadRevisionId } from "./services/revisions.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import Fastify from "fastify";
import { registerPlatformRoutes } from "./platform-routes.ts";
import type { PlatformServices } from "./services/platform.ts";
import type { AuthService } from "@novelforge/auth";

// ---------------------------------------------------------------------------
// Part 1 — pure compiler
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<ResolvedCompilerInput> = {}): ResolvedCompilerInput {
  return {
    actorUserId: "u1",
    workspaceId: "w1",
    novelId: "n1",
    instruction: "write the next scene",
    storyPosition: 10,
    headRevisionId: "head-1",
    ...overrides,
  };
}

function factRow(id: string, statement = `statement ${id}`) {
  return {
    id,
    entityId: "e1",
    objectEntityId: null,
    predicate: "is",
    statement,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("compileContext (pure)", () => {
  it("tier 1 is always PRESENT and mandatory", () => {
    const compiled = compileContext(baseInput(), emptyCompilerRows());
    const tier1 = compiled.blocks.find((b) => b.tier === TIERS.INSTRUCTION)!;
    expect(tier1.status).toBe("PRESENT");
    expect(tier1.mandatory).toBe(true);
    expect(tier1.text).toBe("write the next scene");
    expect(compiled.canDispatch).toBe(true);
  });

  it("tiers 7 and 8 are UNAVAILABLE with the owning task named, never an empty PRESENT block", () => {
    const compiled = compileContext(baseInput(), emptyCompilerRows());
    for (const tier of [TIERS.RECENT_MEMORY, TIERS.HISTORICAL_MEMORY]) {
      const b = compiled.blocks.find((x) => x.tier === tier)!;
      expect(b.status).toBe("UNAVAILABLE");
      expect(b.rows).toEqual([]);
      expect(b.provenance.reason).toMatch(/NF-WF-009/);
    }
    // No block may claim PRESENT with zero rows.
    for (const b of compiled.blocks) {
      if (b.status === "PRESENT") expect(b.rows.length).toBeGreaterThan(0);
    }
  });

  it("novel-less generation marks novel tiers NOT_APPLICABLE and invents no novel/head", () => {
    const input = baseInput({ novelId: undefined });
    const compiled = compileContext(
      { ...input, storyPosition: 0, headRevisionId: null },
      emptyCompilerRows(),
    );
    for (const tier of [TIERS.OUTLINE, TIERS.CANON, TIERS.STATES, TIERS.DEBT, TIERS.TIMELINE, TIERS.DNA]) {
      expect(compiled.blocks.find((b) => b.tier === tier)!.status).toBe("NOT_APPLICABLE");
    }
    expect(compiled.headRevisionId).toBeNull();
    expect(compiled.storyPosition).toBe(0);
  });

  it("backed tiers with zero rows are EMPTY, not failed", () => {
    const compiled = compileContext(baseInput(), emptyCompilerRows());
    for (const tier of [TIERS.OUTLINE, TIERS.CANON, TIERS.STATES, TIERS.DEBT, TIERS.TIMELINE, TIERS.DNA, TIERS.REFERENCES]) {
      expect(compiled.blocks.find((b) => b.tier === tier)!.status).toBe("EMPTY");
    }
    expect(compiled.canDispatch).toBe(true);
  });

  it("mandatory overflow fails closed and names the dropped block", () => {
    const rows = emptyCompilerRows();
    rows.facts = [factRow("f1", "x".repeat(100)), factRow("f2", "y".repeat(100))];
    const compiled = compileContext(
      baseInput({ mandatoryTiers: [TIERS.CANON], contextBudgetChars: 10 }),
      rows,
    );
    const canon = compiled.blocks.find((b) => b.tier === TIERS.CANON)!;
    expect(canon.status).toBe("OVERFLOWED");
    expect(canon.provenance.reason).toMatch(/hard canon/);
    expect(compiled.canDispatch).toBe(false);
    expect(compiled.overflow?.tier).toBe(TIERS.CANON);
    expect(compiled.overflow?.name).toBe("hard canon");
  });

  it("droppable tiers truncate with provenance instead of silently succeeding", () => {
    const rows = emptyCompilerRows();
    rows.facts = [factRow("f1", "x".repeat(100)), factRow("f2", "y".repeat(100))];
    const compiled = compileContext(baseInput({ contextBudgetChars: 120 }), rows);
    const canon = compiled.blocks.find((b) => b.tier === TIERS.CANON)!;
    expect(canon.status).toBe("PRESENT");
    expect(canon.provenance.truncated).toBe(true);
    expect(canon.provenance.droppedCount).toBe(1);
    expect(compiled.canDispatch).toBe(true);
  });

  it("contextSnapshot keeps the old floor shape (fact ids, reference ids)", () => {
    const rows = emptyCompilerRows();
    rows.facts = [factRow("f1"), factRow("f2")];
    rows.references = [
      {
        chunkId: "c1",
        referenceId: "r1",
        referenceVersionId: "rv1",
        referenceTitle: "T",
        start: 0,
        end: 10,
        text: "hello",
      },
    ];
    const compiled = compileContext(baseInput(), rows);
    expect(compiled.contextSnapshot["facts"]).toEqual(["f1", "f2"]);
    expect(compiled.contextSnapshot["references"]).toEqual([
      { referenceId: "r1", referenceVersionId: "rv1", chunkId: "c1" },
    ]);
    expect(compiled.contextSnapshot["storyPosition"]).toBe(10);
    expect(compiled.contextSnapshot["headRevisionId"]).toBe("head-1");
  });

  it("renderContextText skips the instruction and non-PRESENT blocks", () => {
    const rows = emptyCompilerRows();
    rows.facts = [factRow("f1")];
    const compiled = compileContext(baseInput(), rows);
    const text = renderContextText(compiled);
    expect(text).toContain("## Established canon");
    expect(text).not.toContain("write the next scene");
    expect(text).not.toContain("recent memory");
  });

  it("block order follows the §7 priority ladder", () => {
    const compiled = compileContext(baseInput(), emptyCompilerRows());
    const tiers = compiled.blocks.map((b) => b.tier);
    expect(tiers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — integration against a scratch database
// ---------------------------------------------------------------------------

const TEST_DB = "novelforge_test_compiler";
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

let db: NovelForgeDb;

const fakeRetrieval = {
  search: async () => ({ hits: [], auditId: "audit-stub" }),
};

function services() {
  const audit = createAuditService(db);
  return {
    canon: createCanonServices({ db, audit, retrieval: fakeRetrieval as never }),
    characters: createCharacterServices({ db, audit }),
    relationships: createRelationshipServices({ db, audit }),
    planning: createPlanningServices({ db, audit }),
    narrative: createNarrativeServices({ db, audit }),
  };
}

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
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
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

async function seedNovel(ownerId: string, slug: string) {
  const ws = await db.workspace.create({ data: { name: slug, slug, ownerId } });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" as never },
  });
  const novel = await createPlatformServices({
    db,
    audit: createAuditService(db),
  }).createNovel({ actorUserId: ownerId, workspaceId: ws.id, title: `Novel ${slug}`, slug });
  return { workspaceId: ws.id, novelId: novel.id };
}

async function seedChapter(
  ownerId: string,
  novelId: string,
  number: number,
  status: "DRAFT" | "PUBLISHED" = "PUBLISHED",
) {
  return db.chapter.create({
    data: {
      novel: { connect: { id: novelId } },
      number,
      title: `Ch ${number}`,
      status: status as never,
      createdBy: { connect: { id: ownerId } },
    },
  });
}

async function seedCharacter(ownerId: string, workspaceId: string, novelId: string, name: string, key: string) {
  const svc = services();
  const created = await svc.characters.createCharacter({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    key,
    name,
    summary: null,
  });
  return created;
}

/**
 * Link a character to its canon entity via the explicit FK chain
 * (Character.storyEntityId → StoryEntity). Test seeding only: production
 * links are established by the migration backfill / author action.
 */
async function linkCharacterEntity(characterId: string, entityId: string): Promise<void> {
  await db.character.update({
    where: { id: characterId },
    data: { storyEntityId: entityId },
  });
}

async function seedState(
  ownerId: string,
  workspaceId: string,
  novelId: string,
  characterId: string,
  fromChapter: number,
  toChapter: number | null,
  summary: string,
) {
  const svc = services();
  return svc.characters.createState({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    characterId,
    fromChapter,
    toChapter,
    summary,
  });
}

async function seedEntity(ownerId: string, workspaceId: string, novelId: string, name: string): Promise<string> {
  const svc = services();
  const created = await svc.canon.createEntity({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    kind: "CHARACTER",
    name,
  });
  return created.id;
}

async function seedFact(
  ownerId: string,
  workspaceId: string,
  novelId: string,
  entityId: string,
  statement: string,
  extra: Record<string, unknown> = {},
) {
  const svc = services();
  const { predicate, objectEntityId, ...rest } = extra;
  const objectEntityIdStr = objectEntityId as string | undefined;
  return svc.canon.createFact({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    entityId,
    predicate: (predicate as string | undefined) ?? "is",
    // Exactly one claim object: an entity reference replaces the free text.
    ...(objectEntityIdStr ? { objectEntityId: objectEntityIdStr } : { objectText: "something" }),
    statement,
    ...rest,
  });
}

beforeEach(async () => {
  // Wipe in dependency order.
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.canonProposal.deleteMany();
  await db.storyEntity.deleteMany();
  await db.characterState.deleteMany();
  await db.character.deleteMany();
  await db.outlineNode.deleteMany();
  await db.outlineVersion.deleteMany();
  await db.chapterVersion.deleteMany();
  await db.chapter.deleteMany();
  await db.novelBranch.deleteMany();
  await db.revision.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("listFactsForCompiler — bounded read (invariant 11)", () => {
  it("the fact query itself carries a take bound", async () => {
    const owner = await seedUser("bounded@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "bounded");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Aldric");

    const spy = vi.spyOn(db.canonFact, "findMany");
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: [entityId],
      limit: 10,
    });
    // Both the entity-matched query and (when short) the fill query carry take.
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      expect(call[0]).toHaveProperty("take");
      expect((call[0] as { take?: number }).take).toBeLessThanOrEqual(10);
    }
    expect(result.facts.length).toBeLessThanOrEqual(10);
    spy.mockRestore();
  });

  it("never fetches every ACTIVE fact: 70 facts in, FACT_LIMIT out", async () => {
    const owner = await seedUser("seventy@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "seventy");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Bram");
    for (let i = 0; i < 70; i++) {
      await seedFact(owner.userId, workspaceId, novelId, entityId, `fact number ${i}`, {
        predicate: `is-${i}`,
      });
    }
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: [],
      limit: FACT_LIMIT,
    });
    expect(result.facts).toHaveLength(FACT_LIMIT);
  });

  it("ACTIVE filter survives the new ordering: superseded facts never occupy a slot", async () => {
    const owner = await seedUser("active@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "active");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Cora");
    // Create then supersede a fact via the proposal flow.
    const created = await seedFact(owner.userId, workspaceId, novelId, entityId, "old claim");
    const proposal = await svc.canon.proposeCandidate({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      entityId,
      predicate: "is",
      objectText: "something new",
      statement: "new claim",
      validFromChapter: 1,
    });
    await svc.canon.approveProposal({
      actorUserId: owner.userId,
      workspaceId,
      proposalId: proposal.id,
    });
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: [entityId],
      limit: 10,
    });
    const ids = result.facts.map((f) => f.id);
    expect(ids).not.toContain(created.id);
    expect(result.facts.every((f) => f.statement !== "old claim")).toBe(true);
  });
});

describe("listFactsForCompiler — relevance ordering (invariant 3)", () => {
  it("entity-matched facts outrank unmatched ones at equal createdAt", async () => {
    const owner = await seedUser("rel@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "rel");
    const svc = services();
    // Cast: one character with a state window covering position 5.
    const char = await seedCharacter(owner.userId, workspaceId, novelId, "Dain", "dain");
    const dainEntity = await seedEntity(owner.userId, workspaceId, novelId, "Dain");
    await linkCharacterEntity(char.id, dainEntity);
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, null, "around");
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 5,
      limit: CAST_LIMIT,
    });
    expect(cast.entityIds.length).toBeGreaterThan(0);

    const other = await seedEntity(owner.userId, workspaceId, novelId, "Else");
    // Two facts, same createdAt (seeded back-to-back), tight limit of 1.
    await seedFact(owner.userId, workspaceId, novelId, other, "unrelated claim");
    const relevantId = cast.entityIds[0]!;
    await seedFact(owner.userId, workspaceId, novelId, relevantId, "relevant claim");
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: cast.entityIds,
      limit: 1,
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.statement).toBe("relevant claim");
  });

  it("objectEntityId counts as a match (finding 6)", async () => {
    const owner = await seedUser("obj@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "obj");
    const svc = services();
    const char = await seedCharacter(owner.userId, workspaceId, novelId, "Fenn", "fenn");
    const fennEntity = await seedEntity(owner.userId, workspaceId, novelId, "Fenn");
    await linkCharacterEntity(char.id, fennEntity);
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, null, "around");
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 5,
      limit: CAST_LIMIT,
    });
    const subject = await seedEntity(owner.userId, workspaceId, novelId, "Garr");
    const other = await seedEntity(owner.userId, workspaceId, novelId, "Hale");
    const fennId = cast.entityIds[0]!;
    await seedFact(owner.userId, workspaceId, novelId, subject, "subject match", {
      objectEntityId: fennId,
    });
    await seedFact(owner.userId, workspaceId, novelId, fennId, "direct match");
    await seedFact(owner.userId, workspaceId, novelId, other, "no match");
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: cast.entityIds,
      limit: 2,
    });
    const statements = result.facts.map((f) => f.statement).sort();
    expect(statements).toEqual(["direct match", "subject match"]);
  });

  it("newest relevant facts survive; oldest are dropped (truncation fix)", async () => {
    const owner = await seedUser("trunc@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "trunc");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Ivo");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      // Distinct predicates: canon_facts_live holds one ACTIVE row per
      // (entity, predicate).
      const created = await seedFact(owner.userId, workspaceId, novelId, entityId, `claim ${i}`, {
        predicate: `is-${i}`,
      });
      ids.push(created.id);
      // Ensure distinct createdAt ordering.
      await new Promise((r) => setTimeout(r, 5));
    }
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: [entityId],
      limit: 3,
    });
    // Newest three, not oldest three — the exact inversion of the old defect.
    expect(result.facts.map((f) => f.id)).toEqual([ids[4], ids[3], ids[2]]);
  });

  it("a null storyEntityId contributes no entity id and is never name-matched (GAP-011)", async () => {
    const owner = await seedUser("nullfk@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "nullfk");
    const svc = services();
    // Character with no storyEntityId (the migration backfills only on exact
    // key match; a fresh character keeps NULL).
    const char = await svc.characters.createCharacter({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      key: "unlinked-char",
      name: "Unlinked",
      summary: null,
    });
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, null, "around");
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 5,
      limit: CAST_LIMIT,
    });
    expect(cast.characterIds).toContain(char.id);
    expect(cast.entityIds).toHaveLength(0);

    // A fact about a same-named entity must NOT match via the character.
    const sameName = await seedEntity(owner.userId, workspaceId, novelId, "Unlinked");
    await seedFact(owner.userId, workspaceId, novelId, sameName, "name-trap claim");
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "AUTHOR",
      relevantEntityIds: cast.entityIds,
      limit: 10,
    });
    // With an empty entity set, the fact is admissible but unboosted — and
    // critically, no id comparison ever matched it.
    expect(result.facts.map((f) => f.statement)).toContain("name-trap claim");
    expect(cast.entityIds).not.toContain(sameName);
  });
});

describe("listRelevantCast — the bounded derivation (invariant 3)", () => {
  it("one character appears once in the grouped derivation", async () => {
    const owner = await seedUser("dedupe@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "dedupe");
    const svc = services();
    const char = await seedCharacter(owner.userId, workspaceId, novelId, "Joren", "joren");
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, 10, "early");
    // The domain rejects a second overlapping state row for the same
    // character, so the groupBy derivation yields one row per characterId
    // by construction.
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 7,
      limit: CAST_LIMIT,
    });
    expect(cast.characterIds.filter((id) => id === char.id)).toHaveLength(1);
  });

  it("toChapter is exclusive: a character ending exactly at the position is excluded", async () => {
    const owner = await seedUser("fence@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "fence");
    const svc = services();
    const char = await seedCharacter(owner.userId, workspaceId, novelId, "Kessa", "kessa");
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, 7, "gone by 7");
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 7,
      limit: CAST_LIMIT,
    });
    expect(cast.characterIds).not.toContain(char.id);
  });

  it("bounds distinct characters, not rows (take on the grouped list)", async () => {
    const owner = await seedUser("takegroup@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "takegroup");
    const svc = services();
    for (let i = 0; i < 5; i++) {
      const char = await seedCharacter(owner.userId, workspaceId, novelId, `Char${i}`, `char-${i}`);
      await seedState(owner.userId, workspaceId, novelId, char.id, 1, null, "s1");
    }
    const spy = vi.spyOn(db.characterState, "groupBy");
    const cast = await svc.characters.listRelevantCast({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      storyPosition: 3,
      limit: 3,
    });
    expect(cast.characterIds).toHaveLength(3);
    const args = spy.mock.calls[0]![0] as { take?: number; by?: string[] };
    expect(args.take).toBe(3);
    expect(args.by).toEqual(["characterId"]);
    spy.mockRestore();
  });
});

describe("tier 4 is temporal (invariant 5)", () => {
  it("a state change at chapter 12 compiles with the chapter-10 state at position 10", async () => {
    const owner = await seedUser("temporal@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "temporal");
    const svc = services();
    const char = await seedCharacter(owner.userId, workspaceId, novelId, "Liora", "liora");
    await seedState(owner.userId, workspaceId, novelId, char.id, 1, 12, "before the turn");
    await seedState(owner.userId, workspaceId, novelId, char.id, 12, null, "after the turn");
    const atTen = await svc.characters.getStateAtPosition({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      characterId: char.id,
      chapter: 10,
    });
    const atTwelve = await svc.characters.getStateAtPosition({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      characterId: char.id,
      chapter: 12,
    });
    expect(atTen?.summary).toBe("before the turn");
    expect(atTwelve?.summary).toBe("after the turn");
  });
});

describe("tenant and spoiler boundaries (invariant 8)", () => {
  it("a non-member gets a 404 and learns no revision id", async () => {
    const owner = await seedUser("tenant-owner@example.com");
    const stranger = await seedUser("stranger@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "tenant");
    const svc = services();
    await expect(
      svc.canon.listFactsForCompiler({
        actorUserId: stranger.userId,
        workspaceId,
        novelId,
      mode: "AUTHOR",
        relevantEntityIds: [],
        limit: 10,
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      svc.characters.listRelevantCast({
        actorUserId: stranger.userId,
        workspaceId,
        novelId,
        storyPosition: 1,
        limit: 5,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("READER mode withholds facts behind the reader chapter", async () => {
    const owner = await seedUser("spoiler@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "spoiler");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Mira");
    await seedFact(owner.userId, workspaceId, novelId, entityId, "early claim", {
      availableFromChapter: 2,
      predicate: "is-early",
    });
    await seedFact(owner.userId, workspaceId, novelId, entityId, "late claim", {
      availableFromChapter: 9,
      predicate: "is-late",
    });
    const result = await svc.canon.listFactsForCompiler({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      mode: "READER",
      readerChapter: 5,
      relevantEntityIds: [entityId],
      limit: 10,
    });
    const statements = result.facts.map((f) => f.statement);
    expect(statements).toContain("early claim");
    expect(statements).not.toContain("late claim");
  });
});

describe("head pin (invariant 6)", () => {
  it("a covered mutation between head reads refuses with a typed conflict", async () => {
    const owner = await seedUser("headrace@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "headrace");
    const svc = services();

    let reads = 0;
    const headPort = {
      readHeadRevisionId: async (_novelId: string) => {
        reads++;
        // Move the head between the before/after pin reads.
        return reads === 1 ? "head-a" : "head-b";
      },
    };
    await expect(
      fetchAndCompileContext(
        {
          canon: svc.canon,
          planning: svc.planning,
          characters: svc.characters,
          relationships: svc.relationships,
          narrative: svc.narrative,
          head: headPort,
        },
        {
          actorUserId: owner.userId,
          workspaceId,
          novelId,
          instruction: "write",
          mode: "AUTHOR",
        },
      ),
    ).rejects.toBeInstanceOf(HeadConflictError);
  });

  it("an expectedHeadRevisionId mismatch refuses before any context read", async () => {
    const owner = await seedUser("expect@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "expect");
    const svc = services();
    const headPort = {
      readHeadRevisionId: async (_novelId: string) => "head-real",
    };
    await expect(
      fetchAndCompileContext(
        {
          canon: svc.canon,
          planning: svc.planning,
          characters: svc.characters,
          relationships: svc.relationships,
          narrative: svc.narrative,
          head: headPort,
        },
        {
          actorUserId: owner.userId,
          workspaceId,
          novelId,
          instruction: "write",
          mode: "AUTHOR",
          expectedHeadRevisionId: "head-stale",
        },
      ),
    ).rejects.toBeInstanceOf(HeadConflictError);
  });
});

describe("story position and outline (planning)", () => {
  it("story position is the highest non-DRAFT chapter number, else 0", async () => {
    const owner = await seedUser("pos@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "pos");
    const svc = services();
    expect(
      await svc.planning.getStoryPosition({ actorUserId: owner.userId, workspaceId, novelId }),
    ).toBe(0);
    await seedChapter(owner.userId, novelId, 3, "PUBLISHED");
    await seedChapter(owner.userId, novelId, 5, "DRAFT");
    await seedChapter(owner.userId, novelId, 2, "PUBLISHED");
    expect(
      await svc.planning.getStoryPosition({ actorUserId: owner.userId, workspaceId, novelId }),
    ).toBe(3);
  });

  it("getApprovedOutline returns null when nothing is approved", async () => {
    const owner = await seedUser("nooutline@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "nooutline");
    const svc = services();
    expect(
      await svc.planning.getApprovedOutline({ actorUserId: owner.userId, workspaceId, novelId }),
    ).toBeNull();
  });

  it("a malformed horizon policy is loud in tier-2 provenance, never a bare EMPTY (F1)", async () => {
    const owner = await seedUser("badhorizon@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "badhorizon");
    // putHorizon validates and refuses malformed policies, so write one
    // directly: the compiler must still handle it loudly instead of
    // inventing a default window.
    await db.planningHorizon.upsert({
      where: { novelId },
      create: { novelId, policy: { bands: "not-an-array" } },
      update: { policy: { bands: "not-an-array" } },
    });
    const svc = services();
    const compiled = await fetchAndCompileContext(
      {
        canon: svc.canon,
        planning: svc.planning,
        characters: svc.characters,
        relationships: svc.relationships,
        narrative: svc.narrative,
        head: { readHeadRevisionId: (id: string) => readHeadRevisionId(db, id) },
      },
      {
        actorUserId: owner.userId,
        workspaceId,
        novelId,
        instruction: "write",
        mode: "AUTHOR",
      },
    );
    const tier2 = compiled.blocks.find((b) => b.tier === TIERS.OUTLINE)!;
    expect(tier2.rows).toEqual([]);
    // Loud, not silent: the problem is observable in the output, so a
    // broken policy is distinguishable from "no outline nodes".
    expect(tier2.provenance.reason).toMatch(/MALFORMED_POLICY/);
  });

  it("the approved outline version is pinned in tier-2 provenance (F3)", async () => {
    const owner = await seedUser("pinnedoutline@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "pinnedoutline");
    const svc = services();
    const draft = await svc.planning.createOutlineDraft({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      content: { title: "v1" },
      note: null,
    });
    const approved = await svc.planning.approveOutlineVersion({
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      versionId: draft.id,
    });
    const compiled = await fetchAndCompileContext(
      {
        canon: svc.canon,
        planning: svc.planning,
        characters: svc.characters,
        relationships: svc.relationships,
        narrative: svc.narrative,
        head: { readHeadRevisionId: (id: string) => readHeadRevisionId(db, id) },
      },
      {
        actorUserId: owner.userId,
        workspaceId,
        novelId,
        instruction: "write",
        mode: "AUTHOR",
      },
    );
    const tier2 = compiled.blocks.find((b) => b.tier === TIERS.OUTLINE)!;
    expect(tier2.provenance.outlineVersionId).toBe(approved.id);
  });
});

describe("caller divergence (invariant 7)", () => {  it("the orchestrator input shape and the workflow RETRIEVAL input shape compile identically", async () => {
    const owner = await seedUser("diverge@example.com");
    const { workspaceId, novelId } = await seedNovel(owner.userId, "diverge");
    const svc = services();
    const entityId = await seedEntity(owner.userId, workspaceId, novelId, "Wren");
    await seedFact(owner.userId, workspaceId, novelId, entityId, "wren claim");

    const ports = {
      canon: svc.canon,
      planning: svc.planning,
      characters: svc.characters,
      relationships: svc.relationships,
      narrative: svc.narrative,
      head: { readHeadRevisionId: (novelId: string) => readHeadRevisionId(db, novelId) },
    };

    // Shape 1: the direct generate path (orchestrator.ts).
    const direct = await fetchAndCompileContext(ports, {
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      instruction: "Write the next chapter.",
      contextQuery: "wren",
      mode: "AUTHOR",
    });

    // Shape 2: the workflow RETRIEVAL step (workflow-runs.ts) — same novel,
    // same query, AUTHOR mode fixed by the step contract.
    const viaWorkflow = await fetchAndCompileContext(ports, {
      actorUserId: owner.userId,
      workspaceId,
      novelId,
      instruction: "wren",
      contextQuery: "wren",
      mode: "AUTHOR",
    });

    // One compiler: identical tier selection and provenance for the same
    // story state, regardless of which caller invoked it.
    expect(viaWorkflow.blocks.map((b) => b.provenance)).toEqual(
      direct.blocks.map((b) => b.provenance),
    );
    expect(viaWorkflow.storyPosition).toBe(direct.storyPosition);
    expect(viaWorkflow.headRevisionId).toBe(direct.headRevisionId);
  });
});

describe("HeadConflictError HTTP mapping (F2)", () => {
  async function handlerApp() {
    const testApp = Fastify();
    // The real app-wide error handler; routes are registered but never
    // hit — only the mapping is under test.
    await registerPlatformRoutes(testApp, {
      auth: {} as AuthService,
      services: {} as unknown as PlatformServices,
    });
    return testApp;
  }

  it("maps a head race to 409 with the observed head, not 500", async () => {
    const testApp = await handlerApp();
    testApp.get("/__test-head-conflict", async () => {
      throw new HeadConflictError("expected-head", "actual-head");
    });
    const res = await testApp.inject({ method: "GET", url: "/__test-head-conflict" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: "CONFLICT",
      code: "HEAD_CONFLICT",
      currentHeadRevisionId: "actual-head",
    });
    await testApp.close();
  });

  it("a null observed head is disclosed as null (the 'no head yet' observation)", async () => {
    const testApp = await handlerApp();
    testApp.get("/__test-head-conflict-null", async () => {
      throw new HeadConflictError("expected-head", null);
    });
    const res = await testApp.inject({ method: "GET", url: "/__test-head-conflict-null" });
    expect(res.statusCode).toBe(409);
    // `null` is a real observation, not an absent field (the 002D rule).
    expect(res.json()).toEqual({
      error: "CONFLICT",
      code: "HEAD_CONFLICT",
      currentHeadRevisionId: null,
    });
    await testApp.close();
  });
});
