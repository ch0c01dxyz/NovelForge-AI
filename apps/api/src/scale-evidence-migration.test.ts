/**
 * SCALE evidence foundation (NF-WF-050A, S1) migration proof suite.
 *
 * Mandatory per contract "Prerequisites and required acceptance" item 7 and
 * GAP-118 re-review: empty/populated migration, legacy data/checksum
 * preservation, schema parity, and no-backfill proof.
 *
 * Uses a dedicated disposable database
 * (`novelforge_test_scale_evidence_migration`) — never touches the working
 * database. The populated-baseline case applies historical migrations through
 * Prisma itself (`prisma migrate deploy` with the 050A migration staged out
 * of the migrations directory, then restored), so the `_prisma_migrations`
 * ledger — names, checksums, applied steps — is genuine Prisma evidence, not
 * raw-SQL table hashes alone.
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

/** Sorted migration directory names, oldest first (excludes the lock file). */
function migrationDirs(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Run `prisma migrate deploy` against the disposable test database. */
function prismaMigrateDeploy(): void {
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
}

/** Ledger rows: migration name, Prisma checksum, applied steps. */
async function ledgerRows(
  client: pg.Client,
): Promise<Array<{ migration_name: string; checksum: string; applied_steps_count: number }>> {
  const res = await client.query(
    `SELECT migration_name, checksum, applied_steps_count
     FROM _prisma_migrations
     ORDER BY migration_name`,
  );
  return res.rows as Array<{
    migration_name: string;
    checksum: string;
    applied_steps_count: number;
  }>;
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
    prismaMigrateDeploy();

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

describe("migration: populated baseline via Prisma ledger", () => {
  it("baseline via prisma migrate deploy, then 050A upgrade via Prisma: ledger, data and checksums preserved", async () => {
    await freshDatabase();

    // Stage the 050A migration OUT of the migrations directory so the first
    // `prisma migrate deploy` applies the historical baseline (41 migrations)
    // through Prisma's own ledger. Staged to a sibling directory on the same
    // filesystem (rename is atomic there); restored in `finally` no matter what.
    const stageDir = fs.mkdtempSync(path.join(MIGRATIONS_DIR, "..", ".050a-staging-"));
    const stagedMigration = path.join(stageDir, MIGRATION_050A);
    const liveMigration = path.join(MIGRATIONS_DIR, MIGRATION_050A);
    expect(fs.existsSync(liveMigration), "050A migration dir exists before staging").toBe(true);
    expect(migrationDirs()).toContain(MIGRATION_050A);

    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
      fs.renameSync(liveMigration, stagedMigration);

      // 1. Historical baseline through Prisma: writes genuine
      //    `_prisma_migrations` ledger rows (no raw SQL, no `migrate resolve`).
      prismaMigrateDeploy();

      const ledgerBefore = await ledgerRows(client);
      expect(ledgerBefore.length).toBe(41);
      expect(ledgerBefore.some((r) => r.migration_name === MIGRATION_050A)).toBe(false);

      // 050A objects must not exist yet.
      const preTbl = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'`,
      );
      expect(preTbl.rowCount).toBe(0);

      // 2. Seed baseline data through the Prisma client.
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

      // 3. Record the Prisma ledger AND data hashes BEFORE the 050A upgrade.
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
      // Baseline is non-empty (the upgrade must preserve real data).
      expect(before.get("users")!.count).toBeGreaterThan(0);
      expect(before.get("novels")!.count).toBeGreaterThan(0);
      expect(before.get("chapter_versions")!.count).toBeGreaterThan(0);

      // 4. Restore the 050A migration and upgrade through Prisma.
      fs.renameSync(stagedMigration, liveMigration);
      prismaMigrateDeploy();

      // 5. Ledger proof: 42 rows; every baseline row byte-identical
      //    (name, Prisma checksum, applied steps); exactly one new row: 050A.
      const ledgerAfter = await ledgerRows(client);
      expect(ledgerAfter.length).toBe(ledgerBefore.length + 1);
      const beforeByName = new Map(ledgerBefore.map((r) => [r.migration_name, r]));
      for (const row of ledgerAfter) {
        const prev = beforeByName.get(row.migration_name);
        if (prev) {
          expect(row.checksum, `ledger checksum preserved for ${row.migration_name}`).toBe(prev.checksum);
          expect(row.applied_steps_count, `ledger steps preserved for ${row.migration_name}`).toBe(
            prev.applied_steps_count,
          );
        }
      }
      const newRows = ledgerAfter.filter((r) => !beforeByName.has(r.migration_name));
      expect(newRows).toHaveLength(1);
      expect(newRows[0]!.migration_name).toBe(MIGRATION_050A);
      expect(newRows[0]!.checksum.length).toBeGreaterThan(0);

      // 6. Data proof: pre-existing table checksums unchanged by the upgrade.
      for (const t of tables) {
        const after = await tableChecksum(client, t);
        expect(after, `table ${t} rows preserved`).toEqual(before.get(t));
      }

      // 7. No backfill: the new table is empty on a populated baseline.
      const newCount = await client.query(`SELECT count(*)::int AS c FROM "scale_evidence_sets"`);
      expect(newCount.rows[0].c).toBe(0);

      // 8. Schema parity: created_at is TIMESTAMPTZ(6), matching Prisma @db.Timestamptz(6).
      const createdAt = await client.query(
        `SELECT data_type, datetime_precision, udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'scale_evidence_sets'
           AND column_name = 'created_at'`,
      );
      expect(createdAt.rows[0].data_type).toBe("timestamp with time zone");
      expect(createdAt.rows[0].datetime_precision).toBe(6);

      // 9. The baseline novel/chapter/version remain fully usable: a fresh
      //    Prisma client sees them (no silent data corruption).
      const seenNovel = await db.novel.findUnique({ where: { id: novel.id } });
      expect(seenNovel?.title).toBe("Migration Novel");
      const seenVersion = await db.chapterVersion.findUnique({ where: { id: version.id } });
      expect(seenVersion?.content).toContain("Baseline prose");
    } finally {
      // Always restore the staged migration directory and clean up.
      if (fs.existsSync(stagedMigration) && !fs.existsSync(liveMigration)) {
        fs.renameSync(stagedMigration, liveMigration);
      }
      fs.rmSync(stageDir, { recursive: true, force: true });
      await client.end();
    }
    // The working tree must be untouched: the migration dir is back in place.
    expect(fs.existsSync(liveMigration)).toBe(true);
  });
});
