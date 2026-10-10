/**
 * SCALE review and author decisions (NF-WF-050B, S2) migration proof suite.
 *
 * Mandatory per contract "Bounded implementation order and acceptance" item 1:
 * prove empty and populated upgrades using private migration copies, genuine
 * Prisma ledger, unchanged legacy data/checksums, null legacy receipts and
 * restore classification.
 *
 * Uses a dedicated disposable database
 * (`novelforge_test_scale_review_migration`) — never touches the working
 * database. All `prisma migrate deploy` runs execute against private
 * temporary copies of the schema/config/migrations owned by this test
 * (under `os.tmpdir()`); the live repository migrations tree is only ever
 * read, never renamed, removed, or modified. The populated-baseline case
 * applies historical migrations through Prisma itself, so the
 * `_prisma_migrations` ledger — names, checksums, applied steps — is genuine
 * Prisma evidence, not raw-SQL table hashes alone.
 *
 * The 050B migration depends on 050A tables (evidence_set_id FK to
 * scale_evidence_sets), so the baseline INCLUDES 050A but EXCLUDES 050B.
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

const TEST_DB = "novelforge_test_scale_review_migration";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
const MIGRATIONS_DIR = path.join(DB_PACKAGE_ROOT, "prisma", "migrations");
const SCHEMA_PRISMA = path.join(DB_PACKAGE_ROOT, "prisma", "schema.prisma");
const MIGRATION_050B = "20261008_nf_wf_050b_scale_decisions";
// Migrations after 050B (none yet); kept for forward-compatibility.
const MIGRATIONS_AFTER_050B: string[] = [];

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
 * config. When `with050B` is false the 050B migration is deleted from the
 * TEMP COPY only — the live repository tree is never touched.
 * No .env or secrets are copied; DATABASE_URL is passed via the child env.
 *
 * Note: 050A is ALWAYS included (050B depends on scale_evidence_sets).
 */
function makeTempPrismaHome(with050B: boolean): TempPrismaHome {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "050b-mig-"));
  const migrationsDir = path.join(root, "migrations");
  fs.cpSync(MIGRATIONS_DIR, migrationsDir, { recursive: true });
  for (const m of MIGRATIONS_AFTER_050B) {
    fs.rmSync(path.join(migrationsDir, m), { recursive: true, force: true });
  }
  if (!with050B) {
    fs.rmSync(path.join(migrationsDir, MIGRATION_050B), { recursive: true, force: true });
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
async function removeTempDir(dir: string): Promise<void> {
  const resolved = path.resolve(dir);
  const tmp = path.resolve(os.tmpdir());
  if (!resolved.startsWith(tmp + path.sep)) {
    throw new Error(`refusing to delete path outside os.tmpdir(): ${dir}`);
  }
  if (!path.basename(resolved).startsWith("050b-mig-")) {
    throw new Error(`refusing to delete unexpected temp dir: ${dir}`);
  }
  const nodeModulesLink = path.join(resolved, "node_modules");
  const st = fs.lstatSync(nodeModulesLink, { throwIfNoEntry: false });
  if (st) {
    if (!st.isSymbolicLink()) {
      throw new Error(`refusing cleanup: node_modules is not a symbolic link: ${nodeModulesLink}`);
    }
    const target = path.resolve(path.dirname(nodeModulesLink), fs.readlinkSync(nodeModulesLink));
    if (target !== path.resolve(DB_PACKAGE_ROOT, "node_modules")) {
      throw new Error(`refusing cleanup: node_modules link target is unexpected: ${target}`);
    }
    // Windows: remove the link explicitly first; the recursive rm below then
    // never traverses it.
    fs.unlinkSync(nodeModulesLink);
  }
  // Windows: the Prisma CLI child process's cwd handle on this directory can
  // outlive execFileSync return by several hundred ms; deletion until then
  // raises EPERM regardless of per-entry retries. Retry the whole rm on the
  // transient lock codes. Measured release latency ~550ms (5/5 repros).
  const transient = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);
  let lastErr: NodeJS.ErrnoException | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      if (!fs.existsSync(resolved)) return;
      lastErr = Object.assign(new Error(`temp dir still present after rm: ${resolved}`), { code: "EPERM" });
    } catch (err) {
      if (!transient.has((err as NodeJS.ErrnoException).code ?? "")) throw err;
      lastErr = err as NodeJS.ErrnoException;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw lastErr;
}

/**
 * Sentinel wrapper for a body that threw — including `throw undefined`.
 * Distinguishes "body threw X" from "body completed" explicitly.
 */
interface BodyFailure {
  thrown: true;
  value: unknown;
}

/**
 * Remove each owned temp home independently; every home is attempted even if
 * an earlier cleanup fails. Cleanup failures fail the caller. If the body
 * threw, the ORIGINAL thrown value is rethrown unchanged when cleanup
 * succeeds, or kept as the first element of the AggregateError when cleanup
 * also failed. The thrown value is never serialized or wrapped.
 * `remove` is an internal seam for the regression tests below.
 */
async function cleanupTempHomes(
  roots: string[],
  bodyError?: BodyFailure,
  remove: (dir: string) => Promise<void> = removeTempDir,
): Promise<void> {
  const cleanupErrors: unknown[] = [];
  for (const root of roots) {
    try {
      await remove(root);
    } catch (err) {
      cleanupErrors.push(err);
    }
  }
  if (cleanupErrors.length === 0) {
    if (bodyError) throw bodyError.value;
    return;
  }
  if (bodyError) {
    throw new AggregateError([bodyError.value, ...cleanupErrors], "test body failed and temp Prisma home cleanup also failed");
  }
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  throw new AggregateError(cleanupErrors, "temp Prisma home cleanup failed");
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
  it("prisma migrate deploy creates scale_decision tables with the contracted schema", async () => {
    const home = makeTempPrismaHome(true);
    const liveBefore = liveMigrationsFingerprint();
    const client = new pg.Client({ connectionString: TEST_URL });
    let bodyFailure: BodyFailure | undefined;
    try {
      prismaMigrateDeployAt(home.root);
      await client.connect();

      // Both tables exist.
      for (const tbl of ["scale_decision_proposals", "scale_decision_outcomes"]) {
        const r = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1`,
          [tbl],
        );
        expect(r.rowCount, `table ${tbl} exists`).toBe(1);
      }

      // Proposals: columns with contracted types; created_at is TIMESTAMPTZ(3).
      const pcols = await client.query(
        `SELECT column_name, data_type, udt_name, datetime_precision, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'scale_decision_proposals'`,
      );
      const pByName = new Map(pcols.rows.map((r) => [r.column_name, r]));
      const pExpected: Record<string, { type: string; nullable: boolean }> = {
        id: { type: "uuid", nullable: false },
        workspace_id: { type: "uuid", nullable: false },
        novel_id: { type: "uuid", nullable: false },
        chapter_version_id: { type: "uuid", nullable: false },
        source_branch_id: { type: "uuid", nullable: false },
        source_revision_id: { type: "uuid", nullable: true },
        evidence_set_id: { type: "uuid", nullable: true },
        policy_snapshot: { type: "jsonb", nullable: false },
        policy_fingerprint: { type: "text", nullable: false },
        sequence: { type: "integer", nullable: false },
        kind: { type: "USER-DEFINED", nullable: false },
        payload: { type: "jsonb", nullable: false },
        proposer_user_id: { type: "uuid", nullable: false },
        reason: { type: "text", nullable: false },
        predecessor_proposal_id: { type: "uuid", nullable: true },
        created_at: { type: "timestamp with time zone", nullable: false },
      };
      for (const [name, spec] of Object.entries(pExpected)) {
        const col = pByName.get(name);
        expect(col, `proposals column ${name} exists`).toBeTruthy();
        expect(col.data_type, `proposals column ${name} type`).toBe(spec.type);
        expect(col.is_nullable === "YES", `proposals column ${name} nullability`).toBe(spec.nullable);
      }
      expect(pByName.get("created_at")!.datetime_precision).toBe(3);
      expect(pByName.get("kind")!.udt_name).toBe("ScaleDecisionKind");

      // Outcomes: columns.
      const ocols = await client.query(
        `SELECT column_name, data_type, udt_name, datetime_precision, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'scale_decision_outcomes'`,
      );
      const oByName = new Map(ocols.rows.map((r) => [r.column_name, r]));
      const oExpected: Record<string, { type: string; nullable: boolean }> = {
        id: { type: "uuid", nullable: false },
        proposal_id: { type: "uuid", nullable: false },
        workspace_id: { type: "uuid", nullable: false },
        novel_id: { type: "uuid", nullable: false },
        chapter_version_id: { type: "uuid", nullable: false },
        source_branch_id: { type: "uuid", nullable: false },
        sequence: { type: "integer", nullable: false },
        action: { type: "USER-DEFINED", nullable: false },
        actor_user_id: { type: "uuid", nullable: false },
        reason: { type: "text", nullable: false },
        alternative_proposal_id: { type: "uuid", nullable: true },
        result_revision_id: { type: "uuid", nullable: true },
        created_at: { type: "timestamp with time zone", nullable: false },
      };
      for (const [name, spec] of Object.entries(oExpected)) {
        const col = oByName.get(name);
        expect(col, `outcomes column ${name} exists`).toBeTruthy();
        expect(col.data_type, `outcomes column ${name} type`).toBe(spec.type);
        expect(col.is_nullable === "YES", `outcomes column ${name} nullability`).toBe(spec.nullable);
      }
      expect(oByName.get("created_at")!.datetime_precision).toBe(3);
      expect(oByName.get("action")!.udt_name).toBe("ScaleDecisionAction");

      // CHECK constraints on proposals: sequence > 0, reason 1..4000, fingerprint hex64.
      const pchecks = await client.query(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = 'scale_decision_proposals'
           AND constraint_type = 'CHECK'
           AND constraint_name LIKE 'scale_decision_proposals%'`,
      );
      const pCheckNames = pchecks.rows.map((r) => r.constraint_name as string).sort();
      expect(pCheckNames).toContain("scale_decision_proposals_sequence_check");
      expect(pCheckNames).toContain("scale_decision_proposals_reason_check");
      expect(pCheckNames).toContain("scale_decision_proposals_policy_fingerprint_check");

      // Unique: (branch, version, sequence) on both; proposal_id unique on outcomes.
      const pidx = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'scale_decision_proposals'`,
      );
      const pIdxNames = pidx.rows.map((r) => r.indexname as string);
      expect(pIdxNames).toContain("scale_decision_proposals_branch_version_sequence_key");

      const oidx = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'scale_decision_outcomes'`,
      );
      const oIdxNames = oidx.rows.map((r) => r.indexname as string);
      expect(oIdxNames).toContain("scale_decision_outcomes_branch_version_sequence_key");
      expect(oIdxNames).toContain("scale_decision_outcomes_proposal_id_key");

      // final_text_reviews.scale_review is nullable (legacy receipts get NULL).
      const srCol = await client.query(
        `SELECT is_nullable, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'final_text_reviews'
           AND column_name = 'scale_review'`,
      );
      expect(srCol.rowCount).toBe(1);
      expect(srCol.rows[0].is_nullable).toBe("YES");
      expect(srCol.rows[0].data_type).toBe("jsonb");
    } catch (error) {
      bodyFailure = { thrown: true, value: error };
    }
    await client.end().catch(() => undefined);
    await cleanupTempHomes([home.root], bodyFailure);

    // The live repository migrations tree is untouched (paths and bytes).
    expect(liveMigrationsFingerprint()).toBe(liveBefore);
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_050B))).toBe(true);
  });
});

describe("migration: populated baseline via Prisma ledger", () => {
  it("baseline via prisma migrate deploy, then 050B upgrade via Prisma: ledger, data and checksums preserved", async () => {
    await freshDatabase();

    // Baseline INCLUDES 050A (050B FKs reference scale_evidence_sets) but
    // EXCLUDES 050B. Upgrade adds 050B.
    const liveBefore = liveMigrationsFingerprint();
    const baselineHome = makeTempPrismaHome(false);
    const upgradeHome = makeTempPrismaHome(true);
    expect(
      fs.existsSync(path.join(baselineHome.migrationsDir, MIGRATION_050B)),
      "050B absent from baseline temp copy",
    ).toBe(false);
    expect(
      fs.existsSync(path.join(upgradeHome.migrationsDir, MIGRATION_050B)),
      "050B present in upgrade temp copy",
    ).toBe(true);
    // 050A present in both (dependency).
    expect(fs.existsSync(path.join(baselineHome.migrationsDir, "20261008_nf_wf_050a_scale_evidence"))).toBe(true);

    const client = new pg.Client({ connectionString: TEST_URL });
    let bodyFailure: BodyFailure | undefined;
    await client.connect();
    try {
      // 1. Historical baseline through Prisma (includes 050A).
      prismaMigrateDeployAt(baselineHome.root);

      const ledgerBefore = await ledgerRows(client);
      expect(ledgerBefore.some((r) => r.migration_name === MIGRATION_050B)).toBe(false);
      expect(ledgerBefore.some((r) => r.migration_name === "20261008_nf_wf_050a_scale_evidence")).toBe(true);

      // 050B objects must not exist yet.
      for (const tbl of ["scale_decision_proposals", "scale_decision_outcomes"]) {
        const r = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1`,
          [tbl],
        );
        expect(r.rowCount, `${tbl} absent before upgrade`).toBe(0);
      }
      // scale_review column must not exist yet.
      const preCol = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'final_text_reviews'
           AND column_name = 'scale_review'`,
      );
      expect(preCol.rowCount).toBe(0);

      // 2. Seed baseline data through the Prisma client.
      db = createDb(TEST_URL);
      const email = "mig-050b-baseline@t.io";
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
      const ws = await db.workspace.create({ data: { name: "mig-050b-ws", slug: "mig-050b-ws", ownerId: user.id } });
      await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
      const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
        actorUserId: user.id,
        workspaceId: ws.id,
        title: "050B Migration Novel",
        slug: "mig-050b-novel",
      });

      // 2b. GENUINE BASELINE RECEIPT: create chapter/version and insert a REAL
      // FinalTextReview row BEFORE the upgrade (the scale_review column does
      // not exist yet in the baseline schema). This proves pre-upgrade receipt
      // preservation, not post-upgrade insertion.
      const chapter = await db.chapter.create({
        data: { novelId: novel.id, title: "Ch1", number: 1, createdById: user.id },
      });
      const version = await db.chapterVersion.create({
        data: {
          chapterId: chapter.id,
          number: 1,
          content: "<p>Legacy prose.</p>",
          wordCount: 2,
          authorId: user.id,
        },
      });
      await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });
      const branch = await db.novelBranch.findFirst({ where: { novelId: novel.id } });
      const revision = await db.revision.findFirst({ where: { novelId: novel.id } });
      let baselineReceiptId: string | null = null;
      if (branch && revision) {
        const ins = await client.query(
          `INSERT INTO final_text_reviews
             (workspace_id, novel_id, chapter_version_id, revision_id, verdict, hard_violations, advisory, evaluated_policies)
           VALUES ($1, $2, $3, $4, 'PASS', '[{"code":"H1"}]', '[]', '{"SCALE":{"kind":"SCALE"}}')
           RETURNING id, verdict, hard_violations::text AS hv`,
          [ws.id, novel.id, version.id, revision.id],
        );
        baselineReceiptId = ins.rows[0].id as string;
        // Record the pre-upgrade receipt data for post-upgrade comparison.
        // (Compare parsed JSON: Postgres normalizes JSONB whitespace.)
        expect(ins.rows[0].verdict).toBe("PASS");
        expect(JSON.parse(ins.rows[0].hv)).toEqual([{ code: "H1" }]);
      }
      expect(baselineReceiptId, "baseline receipt inserted before upgrade").not.toBeNull();

      // 3. Record the Prisma ledger AND data hashes BEFORE the 050B upgrade.
      // Note: final_text_reviews is excluded from checksum comparison because
      // the upgrade legitimately adds the scale_review column (NULL for existing
      // rows changes the raw row hash); data preservation is verified explicitly
      // in step 8 below via field-by-field comparison.
      const tables = ["users", "workspaces", "memberships", "novels", "sessions", "scale_evidence_sets"];
      const before = new Map<string, { count: number; hash: string }>();
      for (const t of tables) {
        before.set(t, await tableChecksum(client, t));
      }
      expect(before.get("users")!.count).toBeGreaterThan(0);
      expect(before.get("novels")!.count).toBeGreaterThan(0);

      // 4. Upgrade through Prisma using the full temp migration set.
      prismaMigrateDeployAt(upgradeHome.root);

      // 5. Ledger proof: exactly one new row (050B); all baseline rows byte-identical.
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
      expect(newRows[0]!.migration_name).toBe(MIGRATION_050B);
      expect(newRows[0]!.checksum.length).toBeGreaterThan(0);

      // 6. Data proof: pre-existing table checksums unchanged by the upgrade.
      for (const t of tables) {
        const after = await tableChecksum(client, t);
        expect(after, `table ${t} rows preserved`).toEqual(before.get(t));
      }

      // 7. No backfill: the new tables are empty on a populated baseline.
      for (const tbl of ["scale_decision_proposals", "scale_decision_outcomes"]) {
        const c = await client.query(`SELECT count(*)::int AS c FROM "${tbl}"`);
        expect(c.rows[0].c, `${tbl} empty after upgrade`).toBe(0);
      }

      // 8. Legacy receipt preservation: the PRE-UPGRADE receipt still exists
      //    with identical data, and scale_review is NULL (legacy, never
      //    fabricated proof). This verifies genuine pre-upgrade preservation.
      const sr = await client.query(
        `SELECT id, verdict, hard_violations::text AS hv, advisory::text AS adv,
                evaluated_policies::text AS ep, scale_review
         FROM final_text_reviews WHERE id = $1`,
        [baselineReceiptId],
      );
      expect(sr.rowCount, "pre-upgrade receipt survives upgrade").toBe(1);
      expect(sr.rows[0].verdict, "receipt verdict preserved").toBe("PASS");
      expect(JSON.parse(sr.rows[0].hv), "receipt hard_violations preserved").toEqual([{ code: "H1" }]);
      expect(JSON.parse(sr.rows[0].adv), "receipt advisory preserved").toEqual([]);
      expect(JSON.parse(sr.rows[0].ep), "receipt evaluated_policies preserved").toEqual({ SCALE: { kind: "SCALE" } });
      expect(sr.rows[0].scale_review, "legacy receipt scale_review is NULL").toBeNull();

      // 9. The baseline novel remains fully usable.
      const seenNovel = await db.novel.findUnique({ where: { id: novel.id } });
      expect(seenNovel?.title).toBe("050B Migration Novel");
    } catch (error) {
      bodyFailure = { thrown: true, value: error };
    }
    await client.end().catch(() => undefined);
    await cleanupTempHomes([baselineHome.root, upgradeHome.root], bodyFailure);
    // The live repository migrations tree is untouched (paths and bytes),
    // after both success and any failure inside the private fixture.
    expect(liveMigrationsFingerprint()).toBe(liveBefore);
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_050B))).toBe(true);
  });
});

/**
 * Focused regression evidence for cleanupTempHomes error-preservation and
 * await semantics. Uses a fake removal seam — no real temp homes touched.
 * The production call sites pass no `remove`, so these cover the real logic.
 */
describe("cleanupTempHomes regression", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  function failAt(dirs: string[], err: unknown) {
    return async (d: string): Promise<void> => {
      if (dirs.includes(d)) throw err;
    };
  }

  it("body-only failure: original thrown value rethrown unchanged, including undefined", async () => {
    await expect(cleanupTempHomes(["/t/a"], { thrown: true, value: undefined }, async () => undefined)).rejects.toBe(
      undefined,
    );
    const marker = new Error("body");
    await expect(cleanupTempHomes(["/t/a"], { thrown: true, value: marker }, async () => undefined)).rejects.toBe(marker);
  });

  it("cleanup-only failure: fails the caller with the original error", async () => {
    const boom = new Error("cleanup");
    await expect(cleanupTempHomes(["/t/a"], undefined, failAt(["/t/a"], boom))).rejects.toBe(boom);
  });

  it("combined failure: AggregateError keeps the ORIGINAL body value first, cleanup errors after", async () => {
    const body = circular; // arbitrary non-Error thrown value
    const c1 = new Error("c1");
    const err = await cleanupTempHomes(["/t/a", "/t/b"], { thrown: true, value: body }, failAt(["/t/a", "/t/b"], c1))
      .then(
        () => {
          throw new Error("should have thrown");
        },
        (e) => e,
      );
    expect(err).toBeInstanceOf(AggregateError);
    expect((err as AggregateError).errors[0]).toBe(body);
    expect((err as AggregateError).errors[0]).toBe(circular);
    expect((err as AggregateError).errors[1]).toBe(c1);
  });

  it("combined failure: every owned home's cleanup attempted even when one fails", async () => {
    const attempted: string[] = [];
    const remove = async (d: string): Promise<void> => {
      attempted.push(d);
      if (d === "/t/a") throw new Error("a fails");
    };
    await expect(cleanupTempHomes(["/t/a", "/t/b"], undefined, remove)).rejects.toThrow("a fails");
    expect(attempted).toEqual(["/t/a", "/t/b"]);
  });

  it("combined failure: circular object and undefined body values preserved unserialized", async () => {
    const cErr = await cleanupTempHomes(["/t/a"], { thrown: true, value: circular }, failAt(["/t/a"], new Error("c")))
      .then(
        () => null,
        (e) => e as AggregateError,
      );
    expect(cErr).toBeInstanceOf(AggregateError);
    expect((cErr as AggregateError).errors[0]).toBe(circular);
    expect((cErr as AggregateError).errors[0].self).toBe(circular);

    const uErr = await cleanupTempHomes(["/t/a"], { thrown: true, value: undefined }, failAt(["/t/a"], new Error("c")))
      .then(
        () => null,
        (e) => e as AggregateError,
      );
    expect(uErr).toBeInstanceOf(AggregateError);
    expect((uErr as AggregateError).errors[0]).toBeUndefined();
  });

  it("cleanup completion awaited: caller resolves only after removal finished", async () => {
    let done = false;
    const remove = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 20));
      done = true;
    };
    await cleanupTempHomes(["/t/a"], undefined, remove);
    expect(done).toBe(true);
  });
});
