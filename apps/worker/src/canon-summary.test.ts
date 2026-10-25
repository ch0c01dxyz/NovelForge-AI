/**
 * ADR-0022 canon summary rebuild.
 *
 * Dedicated novelforge_test_canon_summary db. Covers as-of exclusion,
 * status/kind counts, and idempotent upsert through the shared
 * `@novelforge/ai-services` rebuild used by both worker and API.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { rebuildCanonSummary } from "@novelforge/ai-services";
import pg from "pg";

const TEST_DB = "novelforge_test_canon_summary";
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
let userId: string;
let workspaceId: string;
let novelId: string;
let branchId: string;
let rev1Id: string;
let rev2Id: string;
const T0 = new Date("2026-01-01T00:00:00.000Z");
const BEFORE = new Date("2025-12-31T23:59:00.000Z");
const SAME_REV = new Date("2026-01-01T00:00:10.000Z");
const REV2_AT = new Date("2026-01-01T00:00:30.000Z");
const AFTER = new Date("2026-01-01T00:01:00.000Z");

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
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.canonSummary.deleteMany();
  await db.canonFactSource.deleteMany();
  await db.canonFact.deleteMany();
  await db.storyEntity.deleteMany();
  await db.auditLog.deleteMany();
  await db.revision.deleteMany();
  await db.novelBranch.deleteMany();
  await db.novel.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  const user = await db.user.create({
    data: { email: `canon-${Date.now()}@test.local`, passwordHash: "x", displayName: "Canon" },
  });
  userId = user.id;
  const workspace = await db.workspace.create({
    data: { name: "Canon WS", slug: `canon-${Date.now()}`, ownerId: userId },
  });
  workspaceId = workspace.id;
  const novel = await db.novel.create({
    data: {
      workspaceId,
      title: "Canon Novel",
      slug: `canon-novel-${Date.now()}`,
      createdById: userId,
    },
  });
  novelId = novel.id;
  const branch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  branchId = branch.id;
  const rev1 = await db.revision.create({
    data: { workspaceId, novelId, branchId, number: 1, origin: "MANUAL", createdAt: T0 },
  });
  rev1Id = rev1.id;
  await db.novel.update({ where: { id: novelId }, data: { currentBranchId: branchId } });
  await db.novelBranch.update({
    where: { id: branchId },
    data: { headRevisionId: rev1.id },
  });
  // Revision 2 bounds rev1's as-of window: advanceHead writes the revision row
  // before its own rows, so rev1's state ends only when rev2's row exists.
  const rev2 = await db.revision.create({
    data: {
      workspaceId,
      novelId,
      branchId,
      parentRevisionId: rev1.id,
      number: 2,
      origin: "MANUAL",
      createdAt: REV2_AT,
    },
  });
  rev2Id = rev2.id;
  await db.novelBranch.update({
    where: { id: branchId },
    data: { headRevisionId: rev2.id },
  });

  const character = await db.storyEntity.create({
    data: {
      novelId,
      kind: "CHARACTER",
      key: "aria",
      name: "Aria",
      createdById: userId,
      createdAt: BEFORE,
    },
  });
  const location = await db.storyEntity.create({
    data: {
      novelId,
      kind: "LOCATION",
      key: "vale",
      name: "Vale",
      createdById: userId,
      createdAt: BEFORE,
    },
  });
  await db.storyEntity.create({
    data: {
      novelId,
      kind: "ORGANIZATION",
      key: "later-guild",
      name: "Later Guild",
      createdById: userId,
      createdAt: AFTER,
    },
  });

  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: character.id,
      predicate: "has child",
      statement: "Aria has a child",
      objectText: "a child",
      status: "ACTIVE",
      createdById: userId,
      createdAt: BEFORE,
    },
  });
  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: character.id,
      predicate: "protects",
      statement: "Aria protects the vale",
      objectText: "the vale",
      status: "SUPERSEDED",
      createdById: userId,
      createdAt: BEFORE,
    },
  });
  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: location.id,
      predicate: "lies near",
      statement: "Vale lies near the sea",
      objectText: "the sea",
      status: "RETRACTED",
      createdById: userId,
      createdAt: BEFORE,
    },
  });
  await db.canonFact.create({
    data: {
      workspaceId,
      novelId,
      entityId: character.id,
      predicate: "joins",
      statement: "Aria joins the guild",
      objectText: "the guild",
      status: "ACTIVE",
      createdById: userId,
      createdAt: AFTER,
    },
  });
  // A persisted revision pin, independent of the live tables and row timestamps.
  const payload = {
    story_entities: [{ novel_id: novelId, kind: "CHARACTER" }, { novel_id: novelId, kind: "LOCATION" }],
    canon_facts: [
      { novel_id: novelId, predicate: "has child", status: "ACTIVE" },
      { novel_id: novelId, predicate: "protects", status: "SUPERSEDED" },
      { novel_id: novelId, predicate: "lies near", status: "RETRACTED" },
    ],
  };
  await db.snapshot.create({
    data: {
      workspaceId, novelId, branchId, revisionId: rev1Id, formatVersion: 1, storage: "INLINE",
      payload, byteSize: Buffer.byteLength(JSON.stringify(payload)),
    },
  });
});

describe("rebuildCanonSummary", () => {
  it("rebuilds an as-of digest", async () => {
    const summary = await rebuildCanonSummary(db, {
      workspaceId,
      novelId,
      sourceRevisionId: rev1Id,
    });
    expect(summary.entityCount).toBe(2);
    expect(summary.activeFactCount).toBe(1);
    expect(summary.supersededFactCount).toBe(1);
    expect(summary.retractedFactCount).toBe(1);
    expect(summary.sourceRevisionNumber).toBe(1);
    expect(summary.digest).toMatchObject({
      entitiesByKind: { CHARACTER: 1, LOCATION: 1 },
      topPredicates: [{ predicate: "has child", count: 1 }],
      truncatedPredicates: false,
    });
  });

  it("excludes later writes even when they predate the next revision timestamp", async () => {
    await db.canonFact.create({
      data: {
        workspaceId,
        novelId,
        entityId: (await db.storyEntity.findFirstOrThrow({ where: { novelId, key: "aria" } })).id,
        predicate: "wields",
        statement: "Aria wields the tide blade",
        objectText: "the tide blade",
        status: "ACTIVE",
        createdById: userId,
        createdAt: SAME_REV,
      },
    });

    const atRev1 = await rebuildCanonSummary(db, {
      workspaceId,
      novelId,
      sourceRevisionId: rev1Id,
    });
    expect(atRev1.activeFactCount).toBe(1);
    expect(atRev1.digest).toMatchObject({
      topPredicates: [
        { predicate: "has child", count: 1 },
      ],
    });

    // rev2 is the head, so every row written after it exists is included.
    const atRev2 = await rebuildCanonSummary(db, {
      workspaceId,
      novelId,
      sourceRevisionId: rev2Id,
    });
    expect(atRev2.activeFactCount).toBe(3);
    expect(atRev2.entityCount).toBe(3);
  });

  it("is idempotent: a re-run upserts the same row", async () => {
    const first = await rebuildCanonSummary(db, {
      workspaceId,
      novelId,
      sourceRevisionId: rev1Id,
    });
    const second = await rebuildCanonSummary(db, {
      workspaceId,
      novelId,
      sourceRevisionId: rev1Id,
    });
    expect(second.id).toBe(first.id);
    expect(await db.canonSummary.count()).toBe(1);
  });

  it("rebuilds an inactive branch from its exact snapshot, not the checked-out tables", async () => {
    const other = await db.novelBranch.create({ data: { workspaceId, novelId, name: "alternate" } });
    await db.novel.update({ where: { id: novelId }, data: { currentBranchId: other.id } });
    await db.canonFact.deleteMany();
    const result = await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1Id });
    expect(result.branchId).toBe(branchId);
    expect(result.activeFactCount).toBe(1);
    expect(await db.canonFact.count()).toBe(0);
  });

  it("refuses an unavailable or malformed historical source without overwriting a summary", async () => {
    const saved = await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1Id });
    await db.snapshot.deleteMany({ where: { revisionId: rev1Id } });
    await expect(rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1Id })).rejects.toThrow(/no usable canon snapshot/);
    await db.snapshot.create({ data: { workspaceId, novelId, branchId, revisionId: rev1Id, storage: "INLINE", formatVersion: 1, payload: {}, byteSize: 2 } });
    await expect(rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1Id })).rejects.toThrow(/no usable canon snapshot/);
    expect(await db.canonSummary.findUnique({ where: { id: saved.id } })).toEqual(saved);
  });

  it("pins concurrent head advancement to one repeatable-read view", async () => {
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const paused = db.$extends({ query: { novelBranch: { async findFirst({ args, query }) {
      const branch = await query(args);
      entered(); await resume;
      return branch;
    } } } });
    const pending = rebuildCanonSummary(paused as unknown as NovelForgeDb, { workspaceId, novelId, sourceRevisionId: rev2Id });
    await barrier;
    try {
      await db.$transaction(async tx => {
        const next = await tx.revision.create({ data: { workspaceId, novelId, branchId, number: 3, origin: "MANUAL" } });
        await tx.novelBranch.update({ where: { id: branchId }, data: { headRevisionId: next.id } });
        const entity = await tx.storyEntity.findFirstOrThrow({ where: { novelId, key: "aria" } });
        await tx.canonFact.create({ data: { workspaceId, novelId, entityId: entity.id, predicate: "future", statement: "Future only", objectText: "future", createdById: userId } });
      });
    } finally { release(); }
    expect((await pending).activeFactCount).toBe(2);
  });

  it("rejects a revision that does not belong to the novel", async () => {
    const otherUser = await db.user.create({
      data: { email: `canon-other-${Date.now()}@test.local`, passwordHash: "x", displayName: "Other" },
    });
    const otherWs = await db.workspace.create({
      data: { name: "Other WS", slug: `other-${Date.now()}`, ownerId: otherUser.id },
    });
    const otherNovel = await db.novel.create({
      data: {
        workspaceId: otherWs.id,
        title: "Other Novel",
        slug: `other-novel-${Date.now()}`,
        createdById: otherUser.id,
      },
    });
    const otherBranch = await db.novelBranch.create({
      data: { workspaceId: otherWs.id, novelId: otherNovel.id, name: "main" },
    });
    const foreignRev = await db.revision.create({
      data: {
        workspaceId: otherWs.id,
        novelId: otherNovel.id,
        branchId: otherBranch.id,
        number: 1,
        origin: "MANUAL",
      },
    });

    await expect(
      rebuildCanonSummary(db, {
        workspaceId,
        novelId,
        sourceRevisionId: foreignRev.id,
      }),
    ).rejects.toThrow(/not found for novel/);
    expect(await db.canonSummary.count()).toBe(0);
  });
});
