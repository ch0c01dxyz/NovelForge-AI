/**
 * NF-WF-032 (GAP-004): cross-domain recovery integration tests.
 *
 * Covers the contract's acceptance checks that require a live database:
 * - previewRestore surfaces crossDomainConflicts (coherent → empty)
 * - Incoherent snapshot payload → surfaced in crossDomainConflicts (negative)
 * - applyRestore writes the advisory audit-log row
 * - Classification sanity in the API context
 * - Operational tables are never in the restore scope
 * - Determinism and purity
 *
 * The six predicates themselves are unit-tested in
 * packages/story-versioning/coherence.test.ts (pure, no DB).
 *
 * Uses a dedicated scratch database (novelforge_test_coherence_032).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { createRevisionServices } from "./services/revisions.ts";
import {
  verifyCrossDomainCoherence,
  RESTORE_SCOPE_CLASS,
  COVERED_TABLES,
} from "@novelforge/story-versioning";

const TEST_DB = "novelforge_test_coherence_032";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}
const BASE_URL = process.env.DATABASE_URL!;
function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
const TEST_URL = withDb(BASE_URL, TEST_DB);

let db: NovelForgeDb;
let workspaceId: string;
let novelId: string;
let ownerUserId: string;
let branchId: string;

const auditCalls: { action: string; payload: unknown }[] = [];
const fakeAudit = {
  record: async (args: { action: string; payload?: unknown }) => {
    auditCalls.push({ action: args.action, payload: args.payload });
  },
};

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: withDb(BASE_URL, "postgres") });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();
  execFileSync("node", [PRISMA_CLI, "migrate", "deploy"], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });

  db = createDb(TEST_URL);
  const user = await db.user.create({
    data: { email: "owner@coherence.test", passwordHash: "x", displayName: "Owner" },
  });
  ownerUserId = user.id;
  const workspace = await db.workspace.create({
    data: { name: "coherence-test", slug: "coherence-test", ownerId: ownerUserId },
  });
  workspaceId = workspace.id;
  await db.membership.create({
    data: { workspaceId, userId: ownerUserId, role: "OWNER" },
  });
  const novel = await db.novel.create({
    data: { workspaceId, title: "Coherence Test", slug: "coherence-test", createdById: ownerUserId },
  });
  novelId = novel.id;
  const branch = await db.novelBranch.create({
    data: { workspaceId, novelId, name: "main" },
  });
  branchId = branch.id;
  await db.novel.update({ where: { id: novelId }, data: { currentBranchId: branchId } });
}, 120000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  auditCalls.length = 0;
  for (const t of ["canon_fact_sources", "canon_facts", "story_entities", "chapters"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }
});

function services() {
  return createRevisionServices({ db, audit: fakeAudit as never });
}

async function createChapterWithVersion() {
  const chapterId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO "chapters" ("id", "novel_id", "number", "title", "status", "created_by_id", "created_at", "updated_at") VALUES ($1, $2, 1, 'Chapter 1', 'DRAFT', $3, now(), now())`,
    chapterId, novelId, ownerUserId,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "chapter_versions" ("id", "chapter_id", "number", "content", "word_count", "author_id", "created_at") VALUES ($1, $2, 1, '<p>c</p>', 1, $3, now())`,
    versionId, chapterId, ownerUserId,
  );
  await db.$executeRawUnsafe(`UPDATE "chapters" SET "current_version_id" = $1 WHERE "id" = $2`, versionId, chapterId);
  return { chapterId, versionId };
}

async function createFactWithSource(chapterVersionId: string) {
  const entityId = crypto.randomUUID();
  const factId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO "story_entities" ("id", "novel_id", "kind", "key", "name", "created_by_id") VALUES ($1, $2, 'CHARACTER', $3, 'E', $4)`,
    entityId, novelId, `e-${Date.now()}`, ownerUserId,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "canon_facts" ("id", "novel_id", "workspace_id", "entity_id", "predicate", "object_text", "statement", "status", "created_by_id") VALUES ($1, $2, $3, $4, 'is', 'brave', 'Fact', 'ACTIVE', $5)`,
    factId, novelId, workspaceId, entityId, ownerUserId,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "canon_fact_sources" ("id", "canon_fact_id", "source_kind", "chapter_version_id", "quote", "start", "end", "created_by_id") VALUES ($1, $2, 'CHAPTER', $3, 'q', 0, 5, $4)`,
    sourceId, factId, chapterVersionId, ownerUserId,
  );
  return { entityId, factId, sourceId };
}

async function buildPayload(
  tables: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, unknown[]>> {
  const { COVERED_TABLE_NAMES } = await import("@novelforge/story-versioning");
  const payload: Record<string, unknown[]> = {};
  for (const t of COVERED_TABLE_NAMES) payload[t] = tables[t] ?? [];
  return payload;
}

async function createCheckpointWithPayload(payload: Record<string, unknown[]>): Promise<string> {
  const revId = crypto.randomUUID();
  const snapId = crypto.randomUUID();
  const cpId = crypto.randomUUID();
  const maxNum = await db.$queryRawUnsafe<{ max: number }[]>(
    `SELECT COALESCE(MAX("number"), 0) AS max FROM "revisions" WHERE "novel_id" = $1`, novelId,
  );
  const number = (maxNum[0]?.max ?? 0) + 1;
  await db.$executeRawUnsafe(
    `INSERT INTO "revisions" ("id", "workspace_id", "novel_id", "branch_id", "number", "origin", "message") VALUES ($1, $2, $3, $4, $5, 'MANUAL', 'test')`,
    revId, workspaceId, novelId, branchId, number,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "snapshots" ("id", "workspace_id", "novel_id", "branch_id", "revision_id", "format_version", "payload", "byte_size") VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, 0)`,
    snapId, workspaceId, novelId, branchId, revId, JSON.stringify(payload),
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "checkpoints" ("id", "workspace_id", "novel_id", "branch_id", "revision_id", "snapshot_id", "kind", "label") VALUES ($1, $2, $3, $4, $5, $6, 'MANUAL', 'test')`,
    cpId, workspaceId, novelId, branchId, revId, snapId,
  );
  await db.$executeRawUnsafe(`UPDATE "novel_branches" SET "head_revision_id" = $1 WHERE "id" = $2`, revId, branchId);
  return cpId;
}

async function liveRows(table: string): Promise<Record<string, unknown>[]> {
  const scope =
    table === "chapter_versions"
      ? `"chapter_id" IN (SELECT "id" FROM "chapters" WHERE "novel_id" = $1)`
      : table === "canon_fact_sources"
        ? `"canon_fact_id" IN (SELECT "id" FROM "canon_facts" WHERE "novel_id" = $1)`
        : `"novel_id" = $1`;
  const rows = await db.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(
    `SELECT to_jsonb(t) AS row FROM "${table}" t WHERE ${scope}`, novelId,
  );
  return rows.map((r) => r.row);
}

// ---------------------------------------------------------------------------

describe("classification (NF-WF-032)", () => {
  it("every covered table has a classification", () => {
    for (const t of COVERED_TABLES) {
      const cls = RESTORE_SCOPE_CLASS[t.key];
      expect(cls, `table ${t.key} unclassified`).toBeDefined();
      expect(cls).toBe(t.restoreTarget ? "REWOUND" : "PINNED");
    }
  });
});

describe("previewRestore crossDomainConflicts (NF-WF-032)", () => {
  it("coherent state → empty crossDomainConflicts", async () => {
    const svc = services();
    const { versionId } = await createChapterWithVersion();
    await createFactWithSource(versionId);
    const live: Record<string, Record<string, unknown>[]> = {};
    for (const t of ["chapters", "chapter_versions", "canon_facts", "canon_fact_sources", "story_entities"]) {
      live[t] = await liveRows(t);
    }
    const checkpointId = await createCheckpointWithPayload(await buildPayload(live));
    const { preview } = await svc.previewRestore({
      actorUserId: ownerUserId, workspaceId, novelId, checkpointId,
    });
    if (!("crossDomainConflicts" in preview)) throw new Error("expected FULL preview");
    expect(preview.crossDomainConflicts).toEqual([]);
  });

  it("incoherent snapshot payload → surfaced in crossDomainConflicts", async () => {
    const svc = services();
    const { versionId } = await createChapterWithVersion();
    const { sourceId } = await createFactWithSource(versionId);
    // Hand-edit the payload: point the source at a nonexistent version.
    const live: Record<string, Record<string, unknown>[]> = {};
    for (const t of ["chapters", "chapter_versions", "canon_facts", "canon_fact_sources", "story_entities"]) {
      live[t] = await liveRows(t);
    }
    const fakeCvId = "00000000-0000-0000-0000-000000000000";
    for (const row of live["canon_fact_sources"]!) {
      if (row["id"] === sourceId) row["chapter_version_id"] = fakeCvId;
    }
    const checkpointId = await createCheckpointWithPayload(await buildPayload(live));
    const { preview } = await svc.previewRestore({
      actorUserId: ownerUserId, workspaceId, novelId, checkpointId,
    });
    if (!("crossDomainConflicts" in preview)) throw new Error("expected FULL preview");
    const evidence = preview.crossDomainConflicts.filter((c) => c.predicate === "P4_EVIDENCE_COHERENCE");
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0]!.kind).toBe("COHERENCE_VIOLATION");
  });
});

describe("applyRestore advisory check (NF-WF-032)", () => {
  it("advisory audit-log row exists after apply", async () => {
    const svc = services();
    const { versionId } = await createChapterWithVersion();
    await createFactWithSource(versionId);
    const live: Record<string, Record<string, unknown>[]> = {};
    for (const t of ["chapters", "chapter_versions", "canon_facts", "canon_fact_sources", "story_entities"]) {
      live[t] = await liveRows(t);
    }
    const checkpointId = await createCheckpointWithPayload(await buildPayload(live));
    const { restoreOperationId } = await svc.previewRestore({
      actorUserId: ownerUserId, workspaceId, novelId, checkpointId,
    });
    await svc.applyRestore({ actorUserId: ownerUserId, workspaceId, novelId, restoreOperationId });
    const checked = auditCalls.find((c) => c.action === "restore.coherence_checked");
    expect(checked, "advisory audit-log row missing").toBeDefined();
    const p = checked!.payload as { coherent: boolean; violationCount: number };
    expect(p.coherent).toBe(true);
    expect(p.violationCount).toBe(0);
  });
});

describe("operational tables untouched (NF-WF-032)", () => {
  it("generations, audit_logs, notifications are OPERATIONAL, never covered", () => {
    const covered = new Set(COVERED_TABLES.map((t) => t.key));
    expect(covered.has("generations")).toBe(false);
    expect(covered.has("audit_logs")).toBe(false);
    expect(covered.has("notifications")).toBe(false);
    expect(RESTORE_SCOPE_CLASS["generations"]).toBe("OPERATIONAL");
    expect(RESTORE_SCOPE_CLASS["audit_logs"]).toBe("OPERATIONAL");
    expect(RESTORE_SCOPE_CLASS["notifications"]).toBe("OPERATIONAL");
  });
});

describe("determinism and purity (NF-WF-032)", () => {
  it("verifyCrossDomainCoherence has no AI/gateway imports", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(new URL(".", import.meta.url)));
    const src = readFileSync(join(here, "..", "..", "packages", "story-versioning", "coherence.ts"), "utf-8");
    expect(src).not.toMatch(/^import.*ai-core/m);
    expect(src).not.toMatch(/^import.*gateway/m);
  });

  it("predicate is deterministic", () => {
    const state = {
      chapters: [{ id: "ch1", novel_id: "n1" }],
      chapter_versions: [{ id: "cv1", chapter_id: "ch1" }],
    };
    const a = verifyCrossDomainCoherence(state);
    const b = verifyCrossDomainCoherence(state);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
