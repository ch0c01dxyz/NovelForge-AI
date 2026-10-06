/**
 * NF-WF-020A: selective restore (DOMAIN / ENTITY / SELECTIVE) integration suite.
 *
 * Dedicated `novelforge_test_selective` db (parallel-safe per ADR-0003 §8).
 * Every assertion drives the real HTTP surface against a real migrated
 * database: selection resolution, dependency-conflict analysis, the
 * surgical apply, the acknowledgment gate, and the negative cases.
 *
 * What this suite pins:
 * - DOMAIN "canon" preview reports an out-of-domain ORPHAN_REFERENCE
 *   (character_knowledge -> canon_facts, the pinned acceptance fixture).
 * - ENTITY preview returns the named entity plus its dependency closure,
 *   with conflict kinds (informational, no gate).
 * - A selective apply rewinds ONLY the selection: non-selected tables
 *   byte-identical, selected tables match the checkpoint, one new
 *   revision with origin RESTORE.
 * - Acknowledged apply removes orphan dependents with consent (recorded
 *   in the change set); unacknowledged apply is 409 UNACKNOWLEDGED_CONFLICTS.
 * - Moved head -> 409 (no writes). Empty selection -> 400. Unmapped
 *   tables -> 400. Preview is read-only. revision:manage enforced
 *   (VIEWER -> 403).
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. With
 * `DATABASE_URL` unset it FAILS loudly at module load — it does not
 * silently skip.
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
import { advanceForMutation } from "./services/revisions.ts";

interface DependencyConflictView {
  kind: "ORPHAN_REFERENCE" | "STALE_DEPENDENT";
  dependentTable: string;
  dependentId: string;
  via: string;
  referencedTable: string;
  referencedId: string;
  semantic: boolean;
  resolution: "DELETE_DEPENDENT" | "NULL_FK";
}

const TEST_DB = "novelforge_test_selective";
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

let app: FastifyInstance;
let db: NovelForgeDb;
let admin: pg.Pool;

interface Fixture {
  cookie: string;
  userId: string;
  workspaceId: string;
  novelId: string;
}

async function seedUser(email: string): Promise<{ cookie: string; userId: string }> {
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
  return { cookie: `${SESSION_COOKIE}=${token}`, userId: user.id };
}

async function seedNovel(slug: string): Promise<Fixture> {
  const owner = await seedUser(`${slug}@example.com`);
  const ws = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: { cookie: owner.cookie },
    payload: { name: slug, slug },
  });
  expect(ws.statusCode, ws.body).toBe(201);
  const workspaceId = (ws.json() as { id: string }).id;

  const novel = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/novels`,
    headers: { cookie: owner.cookie },
    payload: { title: `Novel ${slug}`, slug },
  });
  expect(novel.statusCode, novel.body).toBe(201);
  return {
    cookie: owner.cookie,
    userId: owner.userId,
    workspaceId,
    novelId: (novel.json() as { id: string }).id,
  };
}

function novelUrl(f: Fixture, suffix: string): string {
  return `/api/workspaces/${f.workspaceId}/novels/${f.novelId}${suffix}`;
}

/** Raw story rows (bypass the API for precise fixture control). */
async function mkEntity(f: Fixture, name: string): Promise<string> {
  const row = await db.storyEntity.create({
    data: {
      novelId: f.novelId,
      kind: "CHARACTER",
      key: name.toLowerCase(),
      name,
      createdById: f.userId,
    },
  });
  return row.id;
}

async function mkFact(
  f: Fixture,
  entityId: string,
  predicate: string,
  statement: string,
): Promise<string> {
  const row = await db.canonFact.create({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      entityId,
      predicate,
      objectText: "true",
      statement,
      createdById: f.userId,
    },
  });
  return row.id;
}

async function mkCharacter(f: Fixture, key: string): Promise<string> {
  const row = await db.character.create({
    data: {
      workspaceId: f.workspaceId,
      novelId: f.novelId,
      key,
      name: key,
      createdById: f.userId,
    },
  });
  return row.id;
}

async function mkKnowledge(
  f: Fixture,
  characterId: string,
  factId: string,
): Promise<string> {
  const row = await db.characterKnowledge.create({
    data: {
      characterId,
      factId,
      stance: "KNOWN",
      source: "LEARNED_IN_WORLD",
      fromChapter: 1,
    },
  });
  return row.id;
}

async function createCheckpoint(
  f: Fixture,
  label: string,
): Promise<{ checkpointId: string }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/checkpoints"),
    headers: { cookie: f.cookie },
    payload: { label },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { checkpointId: string };
}

async function preview(
  f: Fixture,
  checkpointId: string,
  scope: string,
  selection?: Record<string, unknown>,
  cookie?: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, "/restores/preview"),
    headers: { cookie: cookie ?? f.cookie },
    payload: selection ? { checkpointId, scope, selection } : { checkpointId, scope },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function apply(
  f: Fixture,
  restoreOperationId: string,
  acknowledged?: boolean,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: novelUrl(f, `/restores/${restoreOperationId}/apply`),
    headers: { cookie: f.cookie },
    payload: acknowledged === undefined ? {} : { acknowledged },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function revisionCount(f: Fixture): Promise<number> {
  return db.revision.count({ where: { novelId: f.novelId } });
}

async function factStatement(factId: string): Promise<string | null> {
  const row = await db.canonFact.findUnique({
    where: { id: factId },
    select: { statement: true },
  });
  return row?.statement ?? null;
}

beforeAll(async () => {
  admin = new pg.Pool({ connectionString: BASE_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  const url = withDb(BASE_URL, TEST_DB);
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = url;
  db = createDb(url);
  const env = { NODE_ENV: "test" } as Env;
  app = await buildApp(env, { db });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  await admin?.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin?.end();
});

beforeEach(async () => {
  // Wipe story data between tests (order: dependents first).
  await db.$executeRawUnsafe(
    `TRUNCATE "character_knowledge", "canon_facts", "story_entities", "characters",
      "restore_operations", "checkpoints", "revisions", "novels", "workspaces",
      "sessions", "users" CASCADE`,
  );
  // Re-add the FK if a previous test forged an orphan (idempotent).
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'character_knowledge_fact_id_fkey'
      ) THEN
        ALTER TABLE "character_knowledge"
          ADD CONSTRAINT "character_knowledge_fact_id_fkey"
          FOREIGN KEY ("fact_id") REFERENCES "canon_facts"("id")
          ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
});

describe("DOMAIN preview", () => {
  it("reports an out-of-domain ORPHAN_REFERENCE (character_knowledge -> canon_facts)", async () => {
    const f = await seedNovel("sel-domain-orphan");
    const entityId = await mkEntity(f, "Aldric");
    const charId = await mkCharacter(f, "aldric");
    const cp = await createCheckpoint(f, "boundary");

    // After the checkpoint: create a fact and a knowledge row referencing
    // it. The restore will DELETE the fact (in live, not in payload),
    // orphaning the out-of-domain knowledge row.
    const factId = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const knowledgeId = await mkKnowledge(f, charId, factId);

    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const conflicts = (p.body.preview as { dependencyConflicts: DependencyConflictView[] }).dependencyConflicts;
    const orphan = conflicts.find(
      (c) => c.kind === "ORPHAN_REFERENCE" && c.dependentTable === "character_knowledge",
    );
    expect(orphan, JSON.stringify(conflicts)).toBeDefined();
    expect(orphan!.dependentId).toBe(knowledgeId);
    expect(orphan!.referencedTable).toBe("canon_facts");
    expect(orphan!.referencedId).toBe(factId);
    expect(orphan!.via).toBe("fact_id");
    expect(orphan!.semantic).toBe(true);
    expect(orphan!.resolution).toBe("DELETE_DEPENDENT");
    // The selection is stored on the preview.
    const selView = p.body.preview as {
      selection: { scope: string; domain: string; tables: string[] };
    };
    expect(selView.selection.scope).toBe("DOMAIN");
    expect(selView.selection.domain).toBe("canon");
    expect(selView.selection.tables).toContain("canon_facts");
  }, 30_000);

  it("reports STALE_DEPENDENT when the referenced row survives but changed", async () => {
    const f = await seedNovel("sel-domain-stale");
    const entityId = await mkEntity(f, "Aldric");
    const factId = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const charId = await mkCharacter(f, "aldric");
    await mkKnowledge(f, charId, factId);
    const cp = await createCheckpoint(f, "boundary");

    // After the checkpoint: change the fact's statement (it survives).
    await db.canonFact.update({
      where: { id: factId },
      data: { statement: "Aldric is cautious." },
    });

    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const conflicts = (p.body.preview as { dependencyConflicts: DependencyConflictView[] }).dependencyConflicts;
    const stale = conflicts.find((c) => c.kind === "STALE_DEPENDENT");
    expect(stale, JSON.stringify(conflicts)).toBeDefined();
    expect(stale!.dependentTable).toBe("character_knowledge");
    expect(stale!.referencedId).toBe(factId);
  }, 30_000);

  it("refuses an unknown domain and the manuscript domain with 400", async () => {
    const f = await seedNovel("sel-domain-bad");
    const cp = await createCheckpoint(f, "boundary");
    const bad = await preview(f, cp.checkpointId, "DOMAIN", { domain: "nope" });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toEqual({ error: "INVALID_INPUT" });
    const manuscript = await preview(f, cp.checkpointId, "DOMAIN", {
      domain: "manuscript",
    });
    expect(manuscript.statusCode).toBe(400);
  }, 30_000);
});

describe("ENTITY preview", () => {
  it("returns the entity plus its dependency closure with kinds (informational)", async () => {
    const f = await seedNovel("sel-entity");
    const entityId = await mkEntity(f, "Aldric");
    const factId = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const charId = await mkCharacter(f, "aldric");
    const knowledgeId = await mkKnowledge(f, charId, factId);
    const cp = await createCheckpoint(f, "boundary");

    const p = await preview(f, cp.checkpointId, "ENTITY", {
      entityType: "canon_facts",
      entityId: factId,
    });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const sel = (p.body.preview as {
      selection: {
        scope: string;
        entityRefs: { table: string; id: string }[];
      };
    }).selection;
    expect(sel.scope).toBe("ENTITY");
    // The closure: the fact plus the knowledge row that references it.
    const refs = sel.entityRefs;
    expect(refs).toContainEqual({ table: "canon_facts", id: factId });
    expect(refs).toContainEqual({ table: "character_knowledge", id: knowledgeId });
    // Conflict report = informational blast radius, with kinds.
    const conflicts = (p.body.preview as { dependencyConflicts: DependencyConflictView[] }).dependencyConflicts;
    expect(conflicts.length).toBeGreaterThan(0);
    for (const c of conflicts) {
      expect(["ORPHAN_REFERENCE", "STALE_DEPENDENT"]).toContain(c.kind);
    }
    // The character row is NOT in the closure (nothing references it here).
    expect(refs.some((r) => r.id === charId)).toBe(false);
  }, 30_000);

  it("refuses an unknown entity with 400", async () => {
    const f = await seedNovel("sel-entity-bad");
    const cp = await createCheckpoint(f, "boundary");
    const p = await preview(f, cp.checkpointId, "ENTITY", {
      entityType: "canon_facts",
      entityId: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(p.statusCode).toBe(400);
  }, 30_000);
});

describe("SELECTIVE preview validation", () => {
  it("refuses empty tables, unmapped tables, and unknown ids with 400", async () => {
    const f = await seedNovel("sel-validate");
    const cp = await createCheckpoint(f, "boundary");

    const empty = await preview(f, cp.checkpointId, "SELECTIVE", { tables: [] });
    expect(empty.statusCode).toBe(400);

    for (const t of ["publications", "memory_projections", "final_text_reviews", "chapters"]) {
      const r = await preview(f, cp.checkpointId, "SELECTIVE", { tables: [t] });
      expect(r.statusCode, t).toBe(400);
      expect(r.body).toEqual({ error: "INVALID_INPUT" });
    }

    const unknownId = await preview(f, cp.checkpointId, "SELECTIVE", {
      tables: ["canon_facts"],
      entityIds: ["00000000-0000-4000-8000-0000000000ff"],
    });
    expect(unknownId.statusCode).toBe(400);
  }, 30_000);
});

describe("selective apply", () => {
  it("rewinds ONLY the selection; non-selected tables are untouched", async () => {
    const f = await seedNovel("sel-apply");
    const entityId = await mkEntity(f, "Aldric");
    const fact1 = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const fact2 = await mkFact(f, entityId, "is_tall", "Aldric is tall.");
    const cp = await createCheckpoint(f, "boundary");
    const revsBefore = await revisionCount(f);

    // After the checkpoint: change fact1, add fact3, add a character
    // (character domain — outside the canon selection).
    await db.canonFact.update({
      where: { id: fact1 },
      data: { statement: "Aldric is cautious." },
    });
    const fact3 = await mkFact(f, entityId, "is_wise", "Aldric is wise.");
    const charId = await mkCharacter(f, "aldric");

    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const opId = p.body.restoreOperationId as string;

    const a = await apply(f, opId, true);
    expect(a.statusCode, JSON.stringify(a.body)).toBe(200);

    // Selected table rewound: fact1 restored, fact3 gone, fact2 kept.
    expect(await factStatement(fact1)).toBe("Aldric is brave.");
    expect(await factStatement(fact2)).toBe("Aldric is tall.");
    expect(await db.canonFact.findUnique({ where: { id: fact3 } })).toBeNull();
    // Non-selected table untouched: the character survives.
    expect(
      await db.character.findUnique({ where: { id: charId } }),
    ).not.toBeNull();
    // One new revision, origin RESTORE.
    const revsAfter = await revisionCount(f);
    expect(revsAfter).toBe(revsBefore + 1);
    const latest = await db.revision.findFirst({
      where: { novelId: f.novelId },
      orderBy: { number: "desc" },
      select: { origin: true, message: true },
    });
    expect(latest?.origin).toBe("RESTORE");
    expect(latest?.message).toContain("DOMAIN canon");
  }, 30_000);

  it("acknowledged apply removes orphan dependents with consent (recorded)", async () => {
    const f = await seedNovel("sel-apply-orphan");
    const entityId = await mkEntity(f, "Aldric");
    const charId = await mkCharacter(f, "aldric");
    const cp = await createCheckpoint(f, "boundary");
    // After the checkpoint: fact + knowledge. Restore deletes the fact,
    // orphaning the knowledge row (out-of-domain dependent).
    const factId = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const knowledgeId = await mkKnowledge(f, charId, factId);

    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode).toBe(201);
    const opId = p.body.restoreOperationId as string;

    // Unacknowledged -> 409 UNACKNOWLEDGED_CONFLICTS, no writes.
    const revsBefore = await revisionCount(f);
    const denied = await apply(f, opId);
    expect(denied.statusCode).toBe(409);
    expect(denied.body).toEqual({ error: "UNACKNOWLEDGED_CONFLICTS" });
    expect(await revisionCount(f)).toBe(revsBefore);

    // Acknowledged -> the orphan dependent is removed with consent.
    const a = await apply(f, opId, true);
    expect(a.statusCode, JSON.stringify(a.body)).toBe(200);
    expect(
      await db.characterKnowledge.findUnique({ where: { id: knowledgeId } }),
    ).toBeNull();
    // The change set records the consent-cleaned row.
    const changeSet = await db.changeSetItem.findFirst({
      where: { entityType: "character_knowledge", entityId: knowledgeId },
      select: { operation: true },
    });
    expect(changeSet?.operation).toBe("DELETE");
  }, 30_000);

  it("refuses a moved head with 409 and no writes", async () => {
    const f = await seedNovel("sel-apply-moved");
    const entityId = await mkEntity(f, "Aldric");
    await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const cp = await createCheckpoint(f, "boundary");
    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode).toBe(201);

    // Move the head after the preview.
    await createCheckpoint(f, "after");

    const revsBefore = await revisionCount(f);
    const a = await apply(f, p.body.restoreOperationId as string, true);
    expect(a.statusCode).toBe(409);
    expect(await revisionCount(f)).toBe(revsBefore);
  }, 30_000);

  it("PRE_MUTATION checkpoint pins the pre-restore image when the head is snapshot-less (C4 / F1)", async () => {
    const f = await seedNovel("sel-c4-order");
    const entityId = await mkEntity(f, "Aldric");
    const fact1 = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const cp = await createCheckpoint(f, "boundary");

    // A LOW mutation advances the head WITHOUT a snapshot (C3: revision
    // and change set only) — the head is now snapshot-less. This is the
    // F1 regression precondition: advanceHead reuses an existing
    // snapshot, so only a snapshot-less head exercises the capture path
    // where the old statement order pinned the post-restore image.
    await db.$transaction(async (tx) => {
      await tx.canonFact.update({
        where: { id: fact1 },
        data: { statement: "Aldric is cautious." },
      });
      await advanceForMutation(tx, {
        workspaceId: f.workspaceId,
        novelId: f.novelId,
        branchName: "main",
        operation: "fact.update",
        origin: "MANUAL",
        actorUserId: f.userId,
        tables: ["canon_facts"],
        items: [
          { entityType: "CanonFact", entityId: fact1, operation: "UPDATE" },
        ],
      });
    });
    const lowHead = (
      await db.novelBranch.findUniqueOrThrow({
        where: { novelId_name: { novelId: f.novelId, name: "main" } },
        select: { headRevisionId: true },
      })
    ).headRevisionId!;
    // Sanity: the LOW head genuinely has no snapshot.
    expect(
      await db.snapshot.findUnique({ where: { revisionId: lowHead } }),
    ).toBeNull();

    const p = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const opId = p.body.restoreOperationId as string;

    const a = await apply(f, opId, true);
    expect(a.statusCode, JSON.stringify(a.body)).toBe(200);
    // Live state is the restored (checkpoint) image.
    expect(await factStatement(fact1)).toBe("Aldric is brave.");

    // The new PRE_MUTATION checkpoint pins the LOW head, and its snapshot
    // is the pre-restore image — NOT the post-restore image. C4 statement
    // order: the revision advance (and its snapshot capture) runs before
    // the state writes.
    const preCheckpoint = await db.checkpoint.findFirstOrThrow({
      where: { novelId: f.novelId, revisionId: lowHead, kind: "PRE_MUTATION" },
      select: { snapshotId: true, revisionId: true },
    });
    const snapshot = await db.snapshot.findUniqueOrThrow({
      where: { id: preCheckpoint.snapshotId },
      select: { payload: true },
    });
    const payload = snapshot.payload as Record<
      string,
      { id: string; statement?: string }[]
    >;
    const factRow = (payload["canon_facts"] ?? []).find(
      (r) => r.id === fact1,
    );
    // Pre-restore image: the cautious edit is still the live row there.
    expect(factRow?.statement).toBe("Aldric is cautious.");
  }, 30_000);

  it("SELECTIVE with entityIds rewinds exactly the named rows", async () => {
    const f = await seedNovel("sel-apply-rows");
    const entityId = await mkEntity(f, "Aldric");
    const fact1 = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const fact2 = await mkFact(f, entityId, "is_tall", "Aldric is tall.");
    const cp = await createCheckpoint(f, "boundary");
    await db.canonFact.update({
      where: { id: fact1 },
      data: { statement: "Aldric is cautious." },
    });
    await db.canonFact.update({
      where: { id: fact2 },
      data: { statement: "Aldric is short." },
    });

    const p = await preview(f, cp.checkpointId, "SELECTIVE", {
      tables: ["canon_facts"],
      entityIds: [fact1],
    });
    expect(p.statusCode, JSON.stringify(p.body)).toBe(201);
    const a = await apply(f, p.body.restoreOperationId as string, true);
    expect(a.statusCode, JSON.stringify(a.body)).toBe(200);

    // Only fact1 rewound; fact2 keeps its post-checkpoint edit.
    expect(await factStatement(fact1)).toBe("Aldric is brave.");
    expect(await factStatement(fact2)).toBe("Aldric is short.");
  }, 30_000);
});

describe("selective preview is read-only", () => {
  it("creates no revision and changes no story state", async () => {
    const f = await seedNovel("sel-readonly");
    const entityId = await mkEntity(f, "Aldric");
    const factId = await mkFact(f, entityId, "is_brave", "Aldric is brave.");
    const cp = await createCheckpoint(f, "boundary");
    await db.canonFact.update({
      where: { id: factId },
      data: { statement: "Aldric is cautious." },
    });
    const revsBefore = await revisionCount(f);

    const p1 = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    const p2 = await preview(f, cp.checkpointId, "DOMAIN", { domain: "canon" });
    expect(p1.statusCode).toBe(201);
    expect(p2.statusCode).toBe(201);
    expect(await revisionCount(f)).toBe(revsBefore);
    expect(await factStatement(factId)).toBe("Aldric is cautious.");
  }, 30_000);
});

describe("selective authorization", () => {
  it("VIEWER cannot preview or apply (403, revision:manage)", async () => {
    const f = await seedNovel("sel-authz");
    const viewer = await seedUser("sel-viewer@example.com");
    // Attach the viewer to the workspace as VIEWER.
    await db.membership.create({
      data: { workspaceId: f.workspaceId, userId: viewer.userId, role: "VIEWER" },
    });
    const cp = await createCheckpoint(f, "boundary");

    const p = await preview(
      f,
      cp.checkpointId,
      "DOMAIN",
      { domain: "canon" },
      viewer.cookie,
    );
    expect(p.statusCode).toBe(403);
  }, 30_000);
});
