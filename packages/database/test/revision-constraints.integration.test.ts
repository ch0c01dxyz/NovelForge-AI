/**
 * The two hand-written constraints from `20261006_m1_story_versioning` are the
 * last line of defence for rules `STORY-VERSIONING.md` states and a service
 * could forget:
 *
 *   - `ChangeSetItem_operation_valid` (CHECK) — the change log's CREATE /
 *     UPDATE / DELETE vocabulary (C2). A typo'd or invented operation would
 *     make a change set unreadable to every consumer that switches on it.
 *   - `characters_story_entity_id_key` (PARTIAL unique index, raw SQL) — two
 *     characters may not claim one story entity, but any number may claim
 *     none (C9). Prisma cannot declare `UNIQUE … WHERE story_entity_id IS NOT
 *     NULL`, which is why the index is hand-written.
 *
 * So this suite writes straight to the database, past every service guard,
 * with raw SQL through the `pg` client. It does not import
 * `apps/api/src/services/revisions.ts`: the point is what PostgreSQL does when
 * the service layer is not in the path.
 *
 * A refusal-only test pins nothing — it stays green with the constraint
 * dropped. Each constraint is therefore probed the Phase 6/8/9 way: inside a
 * transaction we ROLL BACK, drop the constraint, retry the *exact* refused
 * statement, and confirm it is then accepted. Two lessons carry over from that
 * run:
 *
 *   1. A refused INSERT aborts the enclosing transaction (25P02), so every
 *      attempt needs its own SAVEPOINT.
 *   2. DDL is transactional in PostgreSQL, so `ROLLBACK` both restores the
 *      dropped constraint and discards the probe row. That is why this file
 *      uses ROLLBACK and never a cleanup DELETE — a violating row must never
 *      be present at restore time.
 *
 * The partial index is probed by DROP INDEX rather than ALTER TABLE DROP
 * CONSTRAINT: a unique index has no `pg_constraint` row, so a probe written
 * for constraints would find nothing to drop and pass for the wrong reason.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. The suite
 * owns `novelforge_test_revision_constraints` and never touches the dev
 * database. With `DATABASE_URL` unset it FAILS (loudly, at module load) after
 * trying the repo-root `.env` — it does not silently skip, matching
 * `narrative-constraints.integration.test.ts`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// Unique to this file: another worker may hold a different test database
// concurrently, and DROP DATABASE is not something to aim at a name we do not
// own.
const TEST_DB = "novelforge_test_revision_constraints";
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRISMA_CLI = path.join(PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  const root = fileURLToPath(new URL("../../../.env", import.meta.url));
  try {
    process.loadEnvFile(root);
  } catch {
    throw new Error(
      "DATABASE_URL not set and repo-root .env not found — see ADR-0003 test setup",
    );
  }
}
const BASE_URL = process.env.DATABASE_URL!;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const TEST_URL = withDb(BASE_URL, TEST_DB);

// ---------------------------------------------------------------------------
// Fixtures. Fixed UUIDs so a leaked row is identifiable; every one of these is
// committed once in beforeAll and referenced by the probes.
// ---------------------------------------------------------------------------
const USER_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const NOVEL_ID = "00000000-0000-4000-8000-000000000003";
const ENTITY_ID = "00000000-0000-4000-8000-000000000004";
const CHARACTER_A_ID = "00000000-0000-4000-8000-000000000005";
const BRANCH_ID = "00000000-0000-4000-8000-000000000006";
const REVISION_ID = "00000000-0000-4000-8000-000000000007";
const CHANGE_SET_ID = "00000000-0000-4000-8000-000000000008";

let client: pg.Client;

async function seedFixtures(): Promise<void> {
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES ($1, 'revision-probe@example.test', 'x', 'Revision Probe', now(), now())`,
    [USER_ID],
  );
  await client.query(
    `INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at)
     VALUES ($1, 'Revision Probe', 'revision-constraint-probe', $2, now(), now())`,
    [WORKSPACE_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO novels (id, workspace_id, title, slug, created_by_id, created_at, updated_at)
     VALUES ($1, $2, 'Probe Novel', 'probe-novel', $3, now(), now())`,
    [NOVEL_ID, WORKSPACE_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO story_entities (id, novel_id, kind, key, name, created_by_id, created_at)
     VALUES ($1, $2, 'CHARACTER', 'probe-entity', 'Probe Entity', $3, now())`,
    [ENTITY_ID, NOVEL_ID, USER_ID],
  );
  // CHARACTER_A claims the entity. CHARACTER_B does not — the NULL side of the
  // partial index, which must stay legal.
  await client.query(
    `INSERT INTO characters
       (id, workspace_id, novel_id, key, name, story_entity_id, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'probe-a', 'Probe A', $4, $5, now(), now())`,
    [CHARACTER_A_ID, WORKSPACE_ID, NOVEL_ID, ENTITY_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO novel_branches (id, workspace_id, novel_id, name, created_at, updated_at)
     VALUES ($1, $2, $3, 'main', now(), now())`,
    [BRANCH_ID, WORKSPACE_ID, NOVEL_ID],
  );
  await client.query(
    `INSERT INTO revisions
       (id, workspace_id, novel_id, branch_id, parent_revision_id, number, origin, message, created_by_id, created_at)
     VALUES ($1, $2, $3, $4, NULL, 1, 'BASELINE', 'probe baseline', $5, now())`,
    [REVISION_ID, WORKSPACE_ID, NOVEL_ID, BRANCH_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO change_sets (id, revision_id, workspace_id, novel_id, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [CHANGE_SET_ID, REVISION_ID, WORKSPACE_ID, NOVEL_ID],
  );
}

// ---------------------------------------------------------------------------
// Probe machinery
// ---------------------------------------------------------------------------

/** Runs `sql`; returns the SQLSTATE that refused it, or "ACCEPTED". */
async function attempt(
  sql: string,
  params: unknown[],
): Promise<{ code: string; constraint: string | null }> {
  try {
    await client.query(sql, params);
    return { code: "ACCEPTED", constraint: null };
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    return { code: e.code ?? "no-code", constraint: e.constraint ?? null };
  }
}

const ITEM_INSERT = `INSERT INTO change_set_items
  (id, change_set_id, entity_type, entity_id, operation, created_at)
  VALUES ($1, $2, $3, $4, $5, now())`;

const CHARACTER_INSERT = `INSERT INTO characters
  (id, workspace_id, novel_id, key, name, story_entity_id, created_by_id, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`;

let itemSeq = 0;
function item(operation: string): { sql: string; params: unknown[] } {
  itemSeq += 1;
  const id = `00000000-0000-4000-8000-0000000009${String(itemSeq).padStart(2, "0")}`;
  return {
    sql: ITEM_INSERT,
    params: [id, CHANGE_SET_ID, "StoryEntity", ENTITY_ID, operation],
  };
}

let characterSeq = 0;
function character(storyEntityId: string | null): { sql: string; params: unknown[] } {
  characterSeq += 1;
  const id = `00000000-0000-4000-8000-000000000a${String(characterSeq).padStart(2, "0")}`;
  return {
    sql: CHARACTER_INSERT,
    params: [
      id,
      WORKSPACE_ID,
      NOVEL_ID,
      `probe-${characterSeq}`,
      `Probe ${characterSeq}`,
      storyEntityId,
      USER_ID,
    ],
  };
}

interface Violation {
  /** Human label for the failure message. */
  label: string;
  /** The exact statement the constraint must refuse — retried verbatim. */
  sql: string;
  params: unknown[];
  /** How to remove it for the without-constraint half of the probe. */
  drop: string;
}

/**
 * The load-bearing proof. Returns what happened with the constraint present,
 * with it dropped, and whether the rollback restored it.
 */
async function probe(v: Violation): Promise<{
  withConstraint: string;
  withoutConstraint: string;
  restored: boolean;
}> {
  await client.query("BEGIN");
  await client.query("SAVEPOINT attempt");

  const withConstraint = await attempt(v.sql, v.params);

  // 25P02: the refusal aborted the transaction. Recover before doing anything.
  await client.query("ROLLBACK TO SAVEPOINT attempt");

  await client.query(v.drop);
  const withoutConstraint = await attempt(v.sql, v.params);

  // Undoes the DROP (DDL is transactional) *and* discards the probe row, so
  // the constraint can be re-validated against clean data on the way back.
  await client.query("ROLLBACK");

  return {
    withConstraint: withConstraint.code,
    withoutConstraint: withoutConstraint.code,
    restored: await present(v),
  };
}

const CHECK_NAME = "ChangeSetItem_operation_valid";
const INDEX_NAME = "characters_story_entity_id_key";

/** Is the object the probe dropped back in place? */
async function present(v: Violation): Promise<boolean> {
  if (v.drop.includes("DROP INDEX")) {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = $1`,
      [INDEX_NAME],
    );
    return rows[0]!.n === 1;
  }
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = $1`,
    [CHECK_NAME],
  );
  return rows[0]!.n === 1;
}

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
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });

  client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  await seedFixtures();
}, 120_000);

afterAll(async () => {
  await client?.end();
});

describe("M1 story-versioning constraints", () => {
  it("both hand-written objects exist before probing", async () => {
    // Without this, a missing constraint would make "refused" a false pass.
    const { rows } = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = $1`,
      [CHECK_NAME],
    );
    expect(rows.map((r) => r.conname)).toEqual([CHECK_NAME]);
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
      [INDEX_NAME],
    );
    expect(idx.map((r) => r.indexname)).toEqual([INDEX_NAME]);
  });

  // -------------------------------------------------------------------------
  describe("ChangeSetItem_operation_valid", () => {
    // The vocabulary C2 fixes. Anything else is a change-log row no consumer
    // can read; the CHECK is what makes the column a closed set rather than a
    // free-text field.
    const violations: Violation[] = [
      "SUPERSEDE",
      "RESTORE",
      "UPSERT",
      "create",
      "",
      " ",
      "CREATE ",
    ].map((operation) => ({
      label: `operation = ${JSON.stringify(operation)}`,
      ...item(operation),
      drop: `ALTER TABLE "change_set_items" DROP CONSTRAINT "${CHECK_NAME}"`,
    }));

    it("refuses every operation outside CREATE / UPDATE / DELETE", async () => {
      for (const v of violations) {
        const result = await attempt(v.sql, v.params);
        expect(result.code, `${v.label}: ${JSON.stringify(result)}`).toBe("23514");
        expect(result.constraint, v.label).toBe(CHECK_NAME);
      }
    });

    it("is not wider than it claims: the three contract operations are legal", async () => {
      for (const operation of ["CREATE", "UPDATE", "DELETE"]) {
        const stmt = item(operation);
        await client.query("BEGIN");
        const result = await attempt(stmt.sql, stmt.params);
        await client.query("ROLLBACK");
        expect(result.code, `${operation}: ${JSON.stringify(result)}`).toBe("ACCEPTED");
      }
    });

    it("is load-bearing", async () => {
      // Every refused shape is probed, not just the first: a sibling shape
      // whose refusal came from some other mechanism would leave this CHECK
      // inert for it and still pass a single-shape probe.
      for (const v of violations) {
        const r = await probe(v);
        expect(r.withConstraint, v.label).toBe("23514");
        expect(r.withoutConstraint, v.label).toBe("ACCEPTED");
        expect(r.restored, v.label).toBe(true);
        console.log(`OK   ${CHECK_NAME.padEnd(34)} ${v.label}: with=refused  without=accepted`);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("characters_story_entity_id_key", () => {
    const violations: Violation[] = [
      {
        label: "a second character claiming the same story entity",
        ...character(ENTITY_ID),
        drop: `DROP INDEX "${INDEX_NAME}"`,
      },
    ];

    it("refuses two characters claiming one story entity", async () => {
      for (const v of violations) {
        const result = await attempt(v.sql, v.params);
        expect(result.code, `${v.label}: ${JSON.stringify(result)}`).toBe("23505");
        expect(result.constraint, v.label).toBe(INDEX_NAME);
      }
    });

    it("is partial, not total: unlinked characters are unlimited", async () => {
      // The whole reason the index is hand-written. A plain UNIQUE on the
      // column would let exactly one character exist with a NULL entity —
      // which is every character the C9 backfill could not match, so a total
      // index would refuse the migration's own output.
      await client.query("BEGIN");
      const first = await attempt(character(null).sql, character(null).params);
      const second = await attempt(character(null).sql, character(null).params);
      await client.query("ROLLBACK");
      expect(first.code, JSON.stringify(first)).toBe("ACCEPTED");
      expect(second.code, JSON.stringify(second)).toBe("ACCEPTED");
    });

    it("is load-bearing", async () => {
      for (const v of violations) {
        const r = await probe(v);
        expect(r.withConstraint, v.label).toBe("23505");
        expect(r.withoutConstraint, v.label).toBe("ACCEPTED");
        expect(r.restored, v.label).toBe(true);
        console.log(`OK   ${INDEX_NAME.padEnd(34)} ${v.label}: with=refused  without=accepted`);
      }
    });
  });

  // -------------------------------------------------------------------------
  it("left the schema and the probe tables exactly as it found them", async () => {
    const { rows } = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = $1`,
      [CHECK_NAME],
    );
    expect(rows.map((r) => r.conname)).toEqual([CHECK_NAME]);
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
      [INDEX_NAME],
    );
    expect(idx.map((r) => r.indexname)).toEqual([INDEX_NAME]);
    const { rows: counts } = await client.query<{ items: number; characters: number }>(
      `SELECT (SELECT count(*)::int FROM change_set_items) AS items,
              (SELECT count(*)::int FROM characters) AS characters`,
    );
    // Exactly the seeded character; every probe row was rolled back.
    expect(counts[0]).toEqual({ items: 0, characters: 1 });
  });
});
