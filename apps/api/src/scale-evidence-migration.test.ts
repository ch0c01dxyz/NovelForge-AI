/**
 * SCALE evidence foundation (NF-WF-050A, S1) migration proof suite.
 *
 * Mandatory per contract "Prerequisites and required acceptance" item 7 and
 * GAP-118 re-review: empty/populated migration, legacy data/checksum
 * preservation, schema parity, and no-backfill proof.
 *
 * Uses a dedicated disposable database
 * (`novelforge_test_scale_evidence_migration`) — never touches the working
 * database. Applies migrations manually via SQL for the populated-baseline
 * case so the 050A migration can be isolated between baseline seeding and
 * verification.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import pg from "pg";
import { createAuditService } from "@novelforge/ai-services";
import { createPlatformServices } from "@novelforge/ai-services";

const TEST_DB = "novelforge_test_scale_evidence_migration";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
const MIGRATIONS_DIR = path.join(DB_PACKAGE_ROOT, "prisma", "migrations");
const MIGRATION_050A = "20261008_nf_wf_050a_scale_evidence";

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

/** Sorted migration directory names, oldest first. */
function migrationDirs(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function freshDatabase(): Promise<void> {
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
}

/** Execute a migration's SQL file against the test DB. */
async function applyMigrationSql(client: pg.Client, dir: string): Promise<void> {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
  await client.query(sql);
}

/** Content checksum of a table: order-independent md5 over row text. */
async function tableChecksum(client: pg.Client, table: string): Promise<{ count: number; hash: string }> {
  const countRes = await client.query(`SELECT count(*)::int AS c FROM "${table}"`);
  const hashRes = await client.query(
    `SELECT coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), 'empty') AS h FROM "${table}" t`,
  );
  return { count: countRes.rows[0].c as number, hash: hashRes.rows[0].h as string };
}

let db: NovelForgeDb;

beforeAll(async () => {
  await freshDatabase();
});

afterAll(async () => {
  await db?.$disconnect();
});

describe("migration: empty database", () => {
  it("prisma migrate deploy creates scale_evidence_sets with the contracted schema", async () => {
    execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      stdio: "pipe",
      cwd: DB_PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: TEST_URL },
    });

    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();

    // Table exists.
    const tbl = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'`,
    );
    expect(tbl.rowCount).toBe(1);

    // Columns with contracted types; created_at is TIMESTAMPTZ(6).
    const cols = await client.query(
      `SELECT column_name, data_type, udt_name, datetime_precision, is_nullable,
              column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'`,
    );
    const byName = new Map(cols.rows.map((r) => [r.column_name, r]));
    const expected: Record<string, { type: string; nullable: boolean }> = {
      id: { type: "uuid", nullable: false },
      workspace_id: { type: "uuid", nullable: false },
      novel_id: { type: "uuid", nullable: false },
      chapter_version_id: { type: "uuid", nullable: false },
      source_branch_id: { type: "uuid", nullable: false },
      source_revision_id: { type: "uuid", nullable: true },
      sequence: { type: "integer", nullable: false },
      declaration: { type: "USER-DEFINED", nullable: false },
      explanation: { type: "text", nullable: false },
      conflicts_json: { type: "jsonb", nullable: false },
      previous_set_id: { type: "uuid", nullable: true },
      actor_user_id: { type: "uuid", nullable: false },
      created_at: { type: "timestamp with time zone", nullable: false },
    };
    for (const [name, spec] of Object.entries(expected)) {
      const col = byName.get(name);
      expect(col, `column ${name} exists`).toBeTruthy();
      expect(col.data_type, `column ${name} type`).toBe(spec.type);
      expect(col.is_nullable === "YES", `column ${name} nullability`).toBe(spec.nullable);
    }
    // created_at is TIMESTAMPTZ(6): parity with Prisma @db.Timestamptz(6).
    expect(byName.get("created_at")!.datetime_precision).toBe(6);
    // Declaration uses the ScaleEvidenceDeclaration enum.
    expect(byName.get("declaration")!.udt_name).toBe("ScaleEvidenceDeclaration");

    // CHECK constraints: filter to the 4 explicitly named ones (Postgres also
    // reports auto-generated NOT NULL constraints with numeric names).
    const checks = await client.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'
         AND constraint_type = 'CHECK'
         AND constraint_name LIKE 'scale_evidence_sets%'`,
    );
    const checkNames = checks.rows.map((r) => r.constraint_name as string).sort();
    expect(checkNames).toEqual(
      [
        "scale_evidence_sets_conflicts_json_check",
        "scale_evidence_sets_declaration_check",
        "scale_evidence_sets_explanation_check",
        "scale_evidence_sets_sequence_check",
      ].sort(),
    );

    // Foreign keys (7).
    const fks = await client.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'
         AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(fks.rowCount).toBe(7);

    // Indexes: unique (branch, version, sequence) + history index.
    const idx = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'scale_evidence_sets'`,
    );
    const idxNames = idx.rows.map((r) => r.indexname as string);
    expect(idxNames).toContain("scale_evidence_sets_branch_version_sequence_key");
    expect(idxNames).toContain("scale_evidence_sets_history_idx");

    await client.end();
  });
});

describe("migration: populated baseline", () => {
  it("050A migration preserves baseline data and checksums; inserts no rows; schema matches Prisma", async () => {
    await freshDatabase();
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();

    // Apply every migration EXCEPT 050A, in order.
    const dirs = migrationDirs().filter((d) => d !== MIGRATION_050A);
    expect(dirs.length).toBeGreaterThan(0);
    expect(migrationDirs()).toContain(MIGRATION_050A);
    for (const dir of dirs) {
      await applyMigrationSql(client, dir);
    }

    // 050A objects must not exist yet.
    const preTbl = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'`,
    );
    expect(preTbl.rowCount).toBe(0);

    // Seed baseline data through the Prisma client (works: 050A is additive).
    db = createDb(TEST_URL);
    const email = "mig-baseline@t.io";
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
    const ws = await db.workspace.create({ data: { name: "mig-ws", slug: "mig-ws", ownerId: user.id } });
    await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
    const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
      actorUserId: user.id,
      workspaceId: ws.id,
      title: "Migration Novel",
      slug: "mig-novel",
    });
    const chapter = await db.chapter.create({
      data: { novelId: novel.id, title: "Ch1", number: 1, createdById: user.id },
    });
    const version = await db.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        number: 1,
        content: "<p>Baseline prose for migration proof.</p>",
        wordCount: 5,
        authorId: user.id,
      },
    });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });

    // Record checksums of pre-existing tables BEFORE the 050A migration.
    const tables = [
      "users",
      "workspaces",
      "memberships",
      "novels",
      "chapters",
      "chapter_versions",
      "novel_branches",
      "revisions",
      "sessions",
    ];
    const before = new Map<string, { count: number; hash: string }>();
    for (const t of tables) {
      before.set(t, await tableChecksum(client, t));
    }
    // Baseline is non-empty (the migration must preserve real data).
    expect(before.get("users")!.count).toBeGreaterThan(0);
    expect(before.get("novels")!.count).toBeGreaterThan(0);
    expect(before.get("chapter_versions")!.count).toBeGreaterThan(0);

    // Apply the 050A migration.
    await applyMigrationSql(client, MIGRATION_050A);

    // Checksums of pre-existing tables are unchanged.
    for (const t of tables) {
      const after = await tableChecksum(client, t);
      expect(after, `table ${t} row count preserved`).toEqual(before.get(t));
    }

    // No backfill: the new table is empty on a populated baseline.
    const newCount = await client.query(`SELECT count(*)::int AS c FROM "scale_evidence_sets"`);
    expect(newCount.rows[0].c).toBe(0);

    // Schema parity: created_at is TIMESTAMPTZ(6), matching Prisma @db.Timestamptz(6).
    const createdAt = await client.query(
      `SELECT data_type, datetime_precision, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'
         AND column_name = 'created_at'`,
    );
    expect(createdAt.rows[0].data_type).toBe("timestamp with time zone");
    expect(createdAt.rows[0].datetime_precision).toBe(6);

    // The baseline novel/chapter/version remain fully usable: a fresh
    // Prisma client sees them (no silent data corruption).
    const seenNovel = await db.novel.findUnique({ where: { id: novel.id } });
    expect(seenNovel?.title).toBe("Migration Novel");
    const seenVersion = await db.chapterVersion.findUnique({ where: { id: version.id } });
    expect(seenVersion?.content).toContain("Baseline prose");

    await client.end();
  });
});
