/**
 * Platform services integration tests (NF-1004) against the live compose
 * PostgreSQL (dedicated novelforge_test_platform db — parallel-safe per
 * ADR-0003). Covers RBAC capability enforcement, tenant isolation at the
 * service layer, ownership invariants, and audit records.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import { createAuditService } from "@novelforge/ai-services";
import {
  ConflictError,
  createPlatformServices,
  ForbiddenError,
  NotFoundError,
  type PlatformServices,
} from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_platform";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", "..", ".env"));
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
let services: PlatformServices;

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
  services = createPlatformServices({ db, audit: createAuditService(db) });
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE audit_logs, novel_settings, novels, memberships, sessions, workspaces, users RESTART IDENTITY CASCADE`,
  );
});

let emailN = 0;
async function makeUser(displayName = "U"): Promise<string> {
  const u = await db.user.create({
    data: {
      email: `p${++emailN}-${Date.now()}@example.com`,
      passwordHash: "x",
      displayName,
    },
  });
  return u.id;
}

describe("workspaces", () => {
  it("createWorkspace makes the actor OWNER and audits it", async () => {
    const actor = await makeUser();
    const { id } = await services.createWorkspace({ actorUserId: actor, name: "W", slug: `w-${Date.now()}` });
    const ws = await services.getWorkspace(actor, id);
    expect(ws.role).toBe("OWNER");
    const audit = await db.auditLog.findFirst({ where: { action: "workspace.created" } });
    expect(audit?.entityId).toBe(id);
    expect(audit?.actorUserId).toBe(actor);
  }, 30_000);

  it("duplicate slug conflicts", async () => {
    const actor = await makeUser();
    await services.createWorkspace({ actorUserId: actor, name: "W", slug: "dup-ws" });
    await expect(
      services.createWorkspace({ actorUserId: actor, name: "W2", slug: "dup-ws" }),
    ).rejects.toBeInstanceOf(ConflictError);
  }, 30_000);

  it("non-members get NotFound (404 semantics, no existence leak)", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-${Date.now()}` });
    await expect(services.getWorkspace(outsider, id)).rejects.toBeInstanceOf(NotFoundError);
  }, 30_000);
});

describe("membership RBAC", () => {
  it("OWNER can add members; VIEWER cannot (ForbiddenError)", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-${Date.now()}` });
    const viewer = await makeUser();
    const guest = await makeUser();
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: viewer, role: "VIEWER" });
    await expect(
      services.addMember({ actorUserId: viewer, workspaceId: wsId, userId: guest, role: "EDITOR" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Owner can.
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: guest, role: "EDITOR" });
    const members = await services.listMembers(owner, wsId);
    expect(members).toHaveLength(3);
    const added = await db.auditLog.findFirst({ where: { action: "member.added" } });
    expect(added).not.toBeNull();
  }, 30_000);

  it("non-OWNER cannot grant OWNER; ADMIN cannot demote OWNER", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-${Date.now()}` });
    const admin = await makeUser();
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: admin, role: "ADMIN" });
    const other = await makeUser();

    // ADMIN cannot grant OWNER.
    await expect(
      services.addMember({ actorUserId: admin, workspaceId: wsId, userId: other, role: "OWNER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // ADMIN cannot demote the OWNER.
    await expect(
      services.changeMemberRole({ actorUserId: admin, workspaceId: wsId, userId: owner, role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // OWNER cannot demote themselves when they are the last owner.
    await expect(
      services.changeMemberRole({ actorUserId: owner, workspaceId: wsId, userId: owner, role: "ADMIN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  }, 30_000);

  it("removed member loses access immediately", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-${Date.now()}` });
    const editor = await makeUser();
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: editor, role: "EDITOR" });
    await services.listNovels(editor, wsId); // works while a member
    await services.removeMember({ actorUserId: owner, workspaceId: wsId, userId: editor });
    await expect(services.listNovels(editor, wsId)).rejects.toBeInstanceOf(NotFoundError);
    const audit = await db.auditLog.findFirst({ where: { action: "member.removed" } });
    expect(audit).not.toBeNull();
  }, 30_000);
});

describe("novels", () => {
  it("AUTHOR can create; VIEWER cannot; audits novel.created", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-${Date.now()}` });
    const author = await makeUser();
    const viewer = await makeUser();
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: author, role: "AUTHOR" });
    await services.addMember({ actorUserId: owner, workspaceId: wsId, userId: viewer, role: "VIEWER" });

    const { id: novelId } = await services.createNovel({
      actorUserId: author, workspaceId: wsId, title: "N", slug: `n-${Date.now()}`,
    });
    await expect(
      services.createNovel({ actorUserId: viewer, workspaceId: wsId, title: "N2", slug: `n2-${Date.now()}` }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // VIEWER can read (novel:read is universal among members).
    const novel = await services.getNovel(viewer, wsId, novelId);
    expect(novel.id).toBe(novelId);
    const audit = await db.auditLog.findFirst({ where: { action: "novel.created" } });
    expect(audit?.entityId).toBe(novelId);
  }, 30_000);

  it("cross-workspace novel access is denied even for a member of another workspace", async () => {
    const ownerA = await makeUser();
    const ownerB = await makeUser();
    const { id: wsA } = await services.createWorkspace({ actorUserId: ownerA, name: "A", slug: `a-${Date.now()}` });
    const { id: wsB } = await services.createWorkspace({ actorUserId: ownerB, name: "B", slug: `b-${Date.now()}` });
    const { id: novelA } = await services.createNovel({
      actorUserId: ownerA, workspaceId: wsA, title: "NA", slug: `na-${Date.now()}`,
    });
    // ownerB is a valid member of wsB but not wsA: reading novelA via wsB is NotFound.
    await expect(services.getNovel(ownerB, wsB, novelA)).rejects.toBeInstanceOf(NotFoundError);
    // And via wsA they are not a member at all: NotFound.
    await expect(services.getNovel(ownerB, wsA, novelA)).rejects.toBeInstanceOf(NotFoundError);
    // listNovelsForUser only returns own-workspace novels.
    expect(await services.listNovelsForUser(ownerB)).toEqual([]);
    const listA = await services.listNovelsForUser(ownerA);
    expect(listA.map((n) => n.id)).toEqual([novelA]);
  }, 30_000);

  it("deleteNovel removes S2 decision history in dependency order (050B)", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-s2-${Date.now()}` });
    const { id: novelId } = await services.createNovel({
      actorUserId: owner, workspaceId: wsId, title: "S2N", slug: `s2n-${Date.now()}`,
    });
    // Seed S2 rows directly (bypassing the service) to test cleanup ordering.
    const chapter = await db.chapter.create({
      data: { novelId, title: "Ch1", number: 1, createdById: owner },
    });
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "<p>x</p>", wordCount: 1, authorId: owner },
    });
    const branch = await db.novelBranch.findFirst({ where: { novelId } });
    const proposal = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: wsId,
        novelId,
        chapterVersionId: version.id,
        sourceBranchId: branch!.id,
        policySnapshot: { absent: true },
        policyFingerprint: "0".repeat(64),
        sequence: 1,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        proposerUserId: owner,
        reason: "s2 cleanup test",
      },
    });
    await db.scaleDecisionOutcome.create({
      data: {
        proposalId: proposal.id,
        workspaceId: wsId,
        novelId,
        chapterVersionId: version.id,
        sourceBranchId: branch!.id,
        sequence: 1,
        action: "REJECT",
        actorUserId: owner,
        reason: "no",
      },
    });

    await services.deleteNovel({ actorUserId: owner, workspaceId: wsId, novelId });

    expect(await db.scaleDecisionOutcome.count({ where: { novelId } })).toBe(0);
    expect(await db.scaleDecisionProposal.count({ where: { novelId } })).toBe(0);
    expect(await db.novel.findUnique({ where: { id: novelId } })).toBeNull();
  }, 30_000);

  it("deleteNovel removes S2 predecessor chains completely (no orphans, 050B)", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-s2c-${Date.now()}` });
    const { id: novelId } = await services.createNovel({
      actorUserId: owner, workspaceId: wsId, title: "S2C", slug: `s2c-${Date.now()}`,
    });
    const chapter = await db.chapter.create({
      data: { novelId, title: "Ch1", number: 1, createdById: owner },
    });
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "<p>x</p>", wordCount: 1, authorId: owner },
    });
    const branch = await db.novelBranch.findFirst({ where: { novelId } });

    // Create predecessor chain: A -> B -> C (alternatives).
    // B.predecessor = A, C.predecessor = B.
    const propA = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: wsId, novelId, chapterVersionId: version.id, sourceBranchId: branch!.id,
        policySnapshot: { absent: true }, policyFingerprint: "a".repeat(64),
        sequence: 1, kind: "CHAPTER_EXCEPTION", payload: { claimIndices: [0] },
        proposerUserId: owner, reason: "chain A",
      },
    });
    const propB = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: wsId, novelId, chapterVersionId: version.id, sourceBranchId: branch!.id,
        policySnapshot: { absent: true }, policyFingerprint: "b".repeat(64),
        sequence: 2, kind: "CHAPTER_EXCEPTION", payload: { claimIndices: [1] },
        proposerUserId: owner, reason: "chain B", predecessorProposalId: propA.id,
      },
    });
    const propC = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: wsId, novelId, chapterVersionId: version.id, sourceBranchId: branch!.id,
        policySnapshot: { absent: true }, policyFingerprint: "c".repeat(64),
        sequence: 3, kind: "CHAPTER_EXCEPTION", payload: { claimIndices: [2] },
        proposerUserId: owner, reason: "chain C", predecessorProposalId: propB.id,
      },
    });
    // Outcomes for A and B (C is pending).
    await db.scaleDecisionOutcome.create({
      data: {
        proposalId: propA.id, workspaceId: wsId, novelId,
        chapterVersionId: version.id, sourceBranchId: branch!.id,
        sequence: 1, action: "REJECT", actorUserId: owner, reason: "no A",
      },
    });
    const outB = await db.scaleDecisionOutcome.create({
      data: {
        proposalId: propB.id, workspaceId: wsId, novelId,
        chapterVersionId: version.id, sourceBranchId: branch!.id,
        sequence: 2, action: "ALTERNATIVE", actorUserId: owner, reason: "try C",
        alternativeProposalId: propC.id,
      },
    });
    expect(outB.alternativeProposalId).toBe(propC.id);

    // Verify chain exists before delete.
    expect(await db.scaleDecisionProposal.count({ where: { novelId } })).toBe(3);
    expect(await db.scaleDecisionOutcome.count({ where: { novelId } })).toBe(2);

    await services.deleteNovel({ actorUserId: owner, workspaceId: wsId, novelId });

    // ALL proposals in the chain removed (not just the head); no orphans.
    expect(await db.scaleDecisionOutcome.count({ where: { novelId } })).toBe(0);
    expect(await db.scaleDecisionProposal.count({ where: { novelId } })).toBe(0);
    // Verify by ID as well (in case of tenant leakage).
    for (const pid of [propA.id, propB.id, propC.id]) {
      expect(await db.scaleDecisionProposal.findUnique({ where: { id: pid } })).toBeNull();
    }
    expect(await db.novel.findUnique({ where: { id: novelId } })).toBeNull();
  }, 30_000);

  it("deleteNovel refused by canon facts preserves S2 history (rollback, 050B)", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-s2r-${Date.now()}` });
    const { id: novelId } = await services.createNovel({
      actorUserId: owner, workspaceId: wsId, title: "S2R", slug: `s2r-${Date.now()}`,
    });
    const chapter = await db.chapter.create({
      data: { novelId, title: "Ch1", number: 1, createdById: owner },
    });
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "<p>x</p>", wordCount: 1, authorId: owner },
    });
    const branch = await db.novelBranch.findFirst({ where: { novelId } });
    const proposal = await db.scaleDecisionProposal.create({
      data: {
        workspaceId: wsId,
        novelId,
        chapterVersionId: version.id,
        sourceBranchId: branch!.id,
        policySnapshot: { absent: true },
        policyFingerprint: "0".repeat(64),
        sequence: 1,
        kind: "CHAPTER_EXCEPTION",
        payload: { claimIndices: [0] },
        proposerUserId: owner,
        reason: "s2 rollback test",
      },
    });
    // Block the delete with a canon fact citing a story entity (Restrict FK).
    const entity = await db.storyEntity.create({
      data: { novelId, kind: "CHARACTER", key: "blocker", name: "Blocker", createdById: owner },
    });
    await db.canonFact.create({
      data: {
        workspaceId: wsId,
        novelId,
        entityId: entity.id,
        predicate: "blocks",
        objectText: "delete",
        statement: "blocks delete",
        createdById: owner,
      },
    });

    await expect(
      services.deleteNovel({ actorUserId: owner, workspaceId: wsId, novelId }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The whole transaction rolled back: novel AND S2 history preserved.
    expect(await db.novel.findUnique({ where: { id: novelId } })).toBeTruthy();
    expect(await db.scaleDecisionProposal.findUnique({ where: { id: proposal.id } })).toBeTruthy();
  }, 30_000);

  it("deleteNovel removes S3 proposals via cascade; refusal preserves them (050C)", async () => {
    const owner = await makeUser();
    const { id: wsId } = await services.createWorkspace({ actorUserId: owner, name: "W", slug: `w-s3-${Date.now()}` });
    const { id: novelId } = await services.createNovel({
      actorUserId: owner, workspaceId: wsId, title: "S3N", slug: `s3n-${Date.now()}`,
    });
    const chapter = await db.chapter.create({
      data: { novelId, title: "Ch1", number: 1, createdById: owner },
    });
    const version = await db.chapterVersion.create({
      data: { chapterId: chapter.id, number: 1, content: "<p>x</p>", wordCount: 1, authorId: owner },
    });
    const branch = await db.novelBranch.findFirst({ where: { novelId } });
    const s3row = await db.scaleS3Proposal.create({
      data: {
        workspaceId: wsId,
        novelId,
        chapterId: chapter.id,
        chapterVersionId: version.id,
        sourceBranchId: branch!.id,
        policyFingerprint: "0".repeat(64),
        payload: { claims: [] },
        requestedByUserId: owner,
      },
    });

    // Refusal path first: canon-fact Restrict rolls back BEFORE any cascade,
    // so the S3 row survives a refused deletion.
    const entity = await db.storyEntity.create({
      data: { novelId, kind: "CHARACTER", key: "blocker-s3", name: "Blocker", createdById: owner },
    });
    await db.canonFact.create({
      data: {
        workspaceId: wsId,
        novelId,
        entityId: entity.id,
        predicate: "blocks",
        objectText: "delete",
        statement: "blocks delete",
        createdById: owner,
      },
    });
    await expect(
      services.deleteNovel({ actorUserId: owner, workspaceId: wsId, novelId }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await db.scaleS3Proposal.findUnique({ where: { id: s3row.id } })).toBeTruthy();

    // Remove the blocker; the successful delete cascades the inert S3 row
    // with its novel — no explicit platform.deleteNovel change needed.
    await db.canonFact.deleteMany({ where: { novelId } });
    await services.deleteNovel({ actorUserId: owner, workspaceId: wsId, novelId });
    expect(await db.novel.findUnique({ where: { id: novelId } })).toBeNull();
    expect(await db.scaleS3Proposal.count({ where: { novelId } })).toBe(0);
  }, 30_000);
});
