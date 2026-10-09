/**
 * SCALE evidence foundation (NF-WF-050A, S1) migration proof suite.
 *
 * Mandatory per contract "Prerequisites and required acceptance" item 7 and
 * GAP-118 re-review: empty/populated migration, legacy data/checksum
 * preservation, schema parity, and no-backfill proof.
 *
 * Uses a dedicated disposable database
 * (`novelforge_test_scale_evidence_migration`) — never touches the working
 * database. All `prisma migrate deploy` runs execute against private
 * temporary copies of the schema/config/migrations owned by this test
 * (under `os.tmpdir()`); the live repository migrations tree is only ever
 * read, never renamed, removed, or modified. The populated-baseline case
 * applies historical migrations through Prisma itself, so the
 * `_prisma_migrations` ledger — names, checksums, applied steps — is genuine
 * Prisma evidence, not raw-SQL table hashes alone.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
const SCHEMA_PRISMA = path.join(DB_PACKAGE_ROOT, "prisma", "schema.prisma");
const MIGRATION_050A = "20261008_nf_wf_050a_scale_evidence";
// Migrations after 050A (e.g., 050B) depend on 050A tables; exclude them from baseline too.
const MIGRATIONS_AFTER_050A = ["20261008_nf_wf_050b_scale_decisions"];

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

/** A private Prisma home owned by this test: copied schema + migrations. */
interface TempPrismaHome {
  root: string;
  migrationsDir: string;
}

/**
 * Build a private temporary Prisma home: the full migrations directory and
 * schema.prisma are COPIED (never moved) into a temp dir owned by this test;
 * node_modules is symlinked so `prisma/config` resolves in the generated
 * config. When `with050A` is false the 050A migration is deleted from the
 * TEMP COPY only — the live repository tree is never touched.
 * No .env or secrets are copied; DATABASE_URL is passed via the child env.
 */
function makeTempPrismaHome(with050A: boolean): TempPrismaHome {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "050a-mig-"));
  const migrationsDir = path.join(root, "migrations");
  fs.cpSync(MIGRATIONS_DIR, migrationsDir, { recursive: true });
  // Always exclude post-050A migrations (e.g., 050B) from this 050A-focused test;
  // they depend on 050A tables and are covered by their own migration tests.
  for (const m of MIGRATIONS_AFTER_050A) {
    fs.rmSync(path.join(migrationsDir, m), { recursive: true, force: true });
  }
  if (!with050A) {
    fs.rmSync(path.join(migrationsDir, MIGRATION_050A), { recursive: true, force: true });
  }
  fs.copyFileSync(SCHEMA_PRISMA, path.join(root, "schema.prisma"));
  fs.symlinkSync(path.join(DB_PACKAGE_ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
  fs.writeFileSync(
    path.join(root, "prisma.config.ts"),
    `import { defineConfig } from "prisma/config";\n` +
      `const DATABASE_URL = process.env.DATABASE_URL ?? "";\n` +
      `export default defineConfig({\n` +
      `  schema: "schema.prisma",\n` +
      `  migrations: { path: "migrations" },\n` +
      `  datasource: { url: DATABASE_URL },\n` +
      `});\n`,
  );
  return { root, migrationsDir };
}

/** Run `prisma migrate deploy` with cwd at a private temp Prisma home. */
function prismaMigrateDeployAt(cwd: string): void {
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
}

/**
 * Delete a temp Prisma home. Refuses paths outside os.tmpdir() or without
 * the expected prefix — cleanup is limited to verified owned temp paths.
 */
function removeTempDir(dir: string): void {
  const resolved = path.resolve(dir);
  const tmp = path.resolve(os.tmpdir());
  if (!resolved.startsWith(tmp + path.sep)) {
    throw new Error(`refusing to delete path outside os.tmpdir(): ${dir}`);
  }
  if (!path.basename(resolved).startsWith("050a-mig-")) {
    throw new Error(`refusing to delete unexpected temp dir: ${dir}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

/** Fingerprint of the LIVE migrations tree (relative paths + file bytes). */
function liveMigrationsFingerprint(): string {
  const entries: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) {
        entries.push(`${r}:${createHash("md5").update(fs.readFileSync(p)).digest("hex")}`);
      }
    }
  };
  walk(MIGRATIONS_DIR, "");
  return createHash("md5").update(entries.join("\n")).digest("hex");
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
    // Deploy from a private temp copy of the full migration set; the live
    // repository tree is only read, never modified.
    const home = makeTempPrismaHome(true);
    const liveBefore = liveMigrationsFingerprint();
    const client = new pg.Client({ connectionString: TEST_URL });
    try {
      prismaMigrateDeployAt(home.root);
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
    } finally {
      await client.end().catch(() => undefined);
      removeTempDir(home.root);
    }

    // The live repository migrations tree is untouched (paths and bytes).
    expect(liveMigrationsFingerprint()).toBe(liveBefore);
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_050A))).toBe(true);
  });
});

describe("migration: populated baseline via Prisma ledger", () => {
  it("baseline via prisma migrate deploy, then 050A upgrade via Prisma: ledger, data and checksums preserved", async () => {
    await freshDatabase();

    // Private temp Prisma homes: baseline WITHOUT 050A (deleted from the temp
    // copy only) and upgrade WITH the full set. The live repository migrations
    // tree is only read, never renamed, removed, or modified — concurrent API
    // suites running `prisma migrate deploy` against the live tree are
    // unaffected, and runner interruption cannot displace tracked files.
    const liveBefore = liveMigrationsFingerprint();
    const baselineHome = makeTempPrismaHome(false);
    const upgradeHome = makeTempPrismaHome(true);
    expect(
      fs.existsSync(path.join(baselineHome.migrationsDir, MIGRATION_050A)),
      "050A absent from baseline temp copy",
    ).toBe(false);
    expect(
      fs.existsSync(path.join(upgradeHome.migrationsDir, MIGRATION_050A)),
      "050A present in upgrade temp copy",
    ).toBe(true);

    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
      // 1. Historical baseline through Prisma: writes genuine
      //    `_prisma_migrations` ledger rows (no raw SQL, no `migrate resolve`).
      prismaMigrateDeployAt(baselineHome.root);

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

      // 4. Upgrade through Prisma using the full temp migration set.
      prismaMigrateDeployAt(upgradeHome.root);

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
      // Cleanup is limited to verified owned temp paths; the live repository
      // tree was never modified, so nothing needs restoring there.
      await client.end().catch(() => undefined);
      removeTempDir(baselineHome.root);
      removeTempDir(upgradeHome.root);
    }
    // The live repository migrations tree is untouched (paths and bytes),
    // after both success and any failure inside the private fixture.
    expect(liveMigrationsFingerprint()).toBe(liveBefore);
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_050A))).toBe(true);
  });
});
