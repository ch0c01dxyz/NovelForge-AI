/**
 * The three hand-written CHECKs from `20261004_phase9_narrative_dna` are the
 * last line of defence for rules the docs state and a route could forget.
 * `packages/narrative-rhythm` validates all three, but a validator only runs
 * if a caller calls it — these hold whether or not it does.
 *
 * So this suite writes straight to the database, past every service guard,
 * with raw SQL through the `pg` client. It does not import
 * `apps/api/src/services/narrative.ts`: the point is what PostgreSQL does
 * when the service layer is not in the path.
 *
 * A refusal-only test pins nothing — it stays green with the constraint
 * dropped. Each constraint is therefore probed the Phase 8 way: inside a
 * transaction we ROLL BACK, drop the constraint, retry the *exact* refused
 * statement, and confirm it is then accepted. Two lessons carry over from
 * that run:
 *
 *   1. A refused INSERT aborts the enclosing transaction (25P02), so every
 *      attempt needs its own SAVEPOINT.
 *   2. DDL is transactional in PostgreSQL, so `ROLLBACK` both restores the
 *      dropped constraint and discards the probe row. That is why this file
 *      uses ROLLBACK and never a cleanup DELETE — `ADD CONSTRAINT`
 *      re-validates existing rows, so a violating row must never be present
 *      at restore time.
 *
 * Requires a live PostgreSQL and a migrated schema; see ADR-0003. The suite
 * owns `novelforge_test_phase9_constraints` and never touches the dev
 * database. With `DATABASE_URL` unset it FAILS (loudly, at module load) after
 * trying the repo-root `.env` — it does not silently skip, matching
 * `platform.integration.test.ts`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// Unique to this file: another worker may hold a different test database
// concurrently, and DROP DATABASE is not something to aim at a name we do not
// own.
const TEST_DB = "novelforge_test_phase9_constraints";
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
const CHARACTER_ID = "00000000-0000-4000-8000-000000000004";

let client: pg.Client;

async function seedFixtures(): Promise<void> {
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES ($1, 'phase9-probe@example.test', 'x', 'Phase 9 Probe', now(), now())`,
    [USER_ID],
  );
  await client.query(
    `INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at)
     VALUES ($1, 'Phase 9 Probe', 'phase9-constraint-probe', $2, now(), now())`,
    [WORKSPACE_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO novels (id, workspace_id, title, slug, created_by_id, created_at, updated_at)
     VALUES ($1, $2, 'Probe Novel', 'probe-novel', $3, now(), now())`,
    [NOVEL_ID, WORKSPACE_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO characters (id, workspace_id, novel_id, key, name, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'probe-character', 'Probe Character', $4, now(), now())`,
    [CHARACTER_ID, WORKSPACE_ID, NOVEL_ID, USER_ID],
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

const ANTAGONIST_INSERT = `INSERT INTO antagonists
  (id, workspace_id, novel_id, character_id, role, purpose, from_chapter, to_chapter, created_by_id, updated_at)
  VALUES ($1, $2, $3, $4, $5::"AntagonistRole", $6, $7, $8, $9, now())`;

const POLICY_INSERT = `INSERT INTO narrative_policies
  (id, novel_id, kind, hardness, hard_reason, payload, updated_at)
  VALUES ($1, $2, $3::"NarrativePolicyKind", $4::"PolicyHardness", $5, '{}'::jsonb, now())`;

interface Violation {
  /** Human label for the failure message. */
  label: string;
  table: "antagonists" | "narrative_policies";
  constraint: string;
  /** The exact statement the constraint must refuse — retried verbatim by the probe. */
  sql: string;
  params: unknown[];
}

let antagonistSeq = 0;
function antagonist(params: {
  role: string;
  purpose: string | null;
  from: number;
  to: number | null;
}): { sql: string; params: unknown[] } {
  antagonistSeq += 1;
  const id = `00000000-0000-4000-8000-0000000001${String(antagonistSeq).padStart(2, "0")}`;
  return {
    sql: ANTAGONIST_INSERT,
    params: [
      id,
      WORKSPACE_ID,
      NOVEL_ID,
      CHARACTER_ID,
      params.role,
      params.purpose,
      params.from,
      params.to,
      USER_ID,
    ],
  };
}

let policySeq = 0;
function policy(hardness: string, reason: string | null): { sql: string; params: unknown[] } {
  policySeq += 1;
  const id = `00000000-0000-4000-8000-0000000002${String(policySeq).padStart(2, "0")}`;
  const kind = (["DRAMA_GAP", "COOLDOWN", "SCALE"] as const)[policySeq % 3];
  return { sql: POLICY_INSERT, params: [id, NOVEL_ID, kind, hardness, reason] };
}

/** A statement that the constraint under test must refuse. */
function refusing(
  label: string,
  table: Violation["table"],
  constraint: string,
  stmt: { sql: string; params: unknown[] },
): Violation {
  return { label, table, constraint, ...stmt };
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

  await client.query(`ALTER TABLE "${v.table}" DROP CONSTRAINT "${v.constraint}"`);
  const withoutConstraint = await attempt(v.sql, v.params);

  // Undoes the DROP (DDL is transactional) *and* discards the probe row, so
  // the constraint can be re-validated against clean data on the way back.
  await client.query("ROLLBACK");

  const restored = (await constraintNames()).includes(v.constraint);
  return { withConstraint: withConstraint.code, withoutConstraint: withoutConstraint.code, restored };
}

async function constraintNames(): Promise<string[]> {
  const { rows } = await client.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint
     WHERE conname = ANY($1::text[]) AND contype = 'c' ORDER BY conname`,
    [CONSTRAINTS],
  );
  return rows.map((r) => r.conname);
}

const CONSTRAINTS = [
  "Antagonist_temporary_needs_purpose",
  "Antagonist_chapter_span_valid",
  "NarrativePolicy_hard_requires_reason",
];

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

describe("Phase 9 narrative constraints", () => {
  it("all three hand-written CHECKs exist before probing", async () => {
    // Without this, a missing constraint would make "refused" a false pass.
    expect(await constraintNames()).toEqual([...CONSTRAINTS].sort());
  });

  // -------------------------------------------------------------------------
  describe("Antagonist_temporary_needs_purpose", () => {
    const NAME = "Antagonist_temporary_needs_purpose";
    const violations = [
      refusing("TEMPORARY with NULL purpose", "antagonists", NAME, antagonist({ role: "TEMPORARY", purpose: null, from: 1, to: null })),
      refusing("TEMPORARY with whitespace-only purpose", "antagonists", NAME, antagonist({ role: "TEMPORARY", purpose: "   ", from: 1, to: null })),
    ];

    it("refuses a TEMPORARY antagonist with no stated purpose", async () => {
      for (const v of violations) {
        const result = await attempt(v.sql, v.params);
        expect(result.code, `${v.label}: ${JSON.stringify(result)}`).toBe("23514");
        expect(result.constraint, v.label).toBe(NAME);
      }
    });

    it("is not wider than it claims: non-TEMPORARY and stated-purpose rows are legal", async () => {
      const legal: [string, { sql: string; params: unknown[] }][] = [
        ["TEMPORARY with a purpose", antagonist({ role: "TEMPORARY", purpose: "Raise the stakes for one arc", from: 1, to: 12 })],
        ["MAIN with no purpose", antagonist({ role: "MAIN", purpose: null, from: 1, to: null })],
      ];
      for (const [label, stmt] of legal) {
        await client.query("BEGIN");
        const result = await attempt(stmt.sql, stmt.params);
        await client.query("ROLLBACK");
        expect(result.code, `${label}: ${JSON.stringify(result)}`).toBe("ACCEPTED");
      }
    });

    it("is load-bearing", async () => {
      // Every refused shape is probed, not just the first: a sibling shape
      // whose refusal came from some other mechanism (NOT NULL, a second
      // CHECK) would leave this CHECK inert for it and still pass a
      // single-shape probe.
      for (const v of violations) {
        const r = await probe(v);
        expect(r.withConstraint, v.label).toBe("23514");
        expect(r.withoutConstraint, v.label).toBe("ACCEPTED");
        expect(r.restored, v.label).toBe(true);
        console.log(`OK   ${NAME.padEnd(38)} ${v.label}: with=refused  without=accepted`);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("Antagonist_chapter_span_valid", () => {
    const NAME = "Antagonist_chapter_span_valid";
    const violations = [
      refusing("from_chapter = 0", "antagonists", NAME, antagonist({ role: "MAIN", purpose: null, from: 0, to: null })),
      refusing("to_chapter < from_chapter", "antagonists", NAME, antagonist({ role: "MAIN", purpose: null, from: 10, to: 5 })),
    ];

    it("refuses a span that starts before chapter 1 or ends before it starts", async () => {
      for (const v of violations) {
        const result = await attempt(v.sql, v.params);
        expect(result.code, `${v.label}: ${JSON.stringify(result)}`).toBe("23514");
        expect(result.constraint, v.label).toBe(NAME);
      }
    });

    it("is not wider than it claims: open-ended and single-chapter spans are legal", async () => {
      const legal: [string, { sql: string; params: unknown[] }][] = [
        ["from 1, still running", antagonist({ role: "MAIN", purpose: null, from: 1, to: null })],
        ["a one-chapter span", antagonist({ role: "MAIN", purpose: null, from: 5, to: 5 })],
      ];
      for (const [label, stmt] of legal) {
        await client.query("BEGIN");
        const result = await attempt(stmt.sql, stmt.params);
        await client.query("ROLLBACK");
        expect(result.code, `${label}: ${JSON.stringify(result)}`).toBe("ACCEPTED");
      }
    });

    it("is load-bearing", async () => {
      for (const v of violations) {
        const r = await probe(v);
        expect(r.withConstraint, v.label).toBe("23514");
        expect(r.withoutConstraint, v.label).toBe("ACCEPTED");
        expect(r.restored, v.label).toBe(true);
        console.log(`OK   ${NAME.padEnd(38)} ${v.label}: with=refused  without=accepted`);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("NarrativePolicy_hard_requires_reason", () => {
    const NAME = "NarrativePolicy_hard_requires_reason";
    const violations = [
      refusing("HARD with NULL hard_reason", "narrative_policies", NAME, policy("HARD", null)),
      refusing("HARD with whitespace-only hard_reason", "narrative_policies", NAME, policy("HARD", "  ")),
    ];

    it("refuses a HARD policy with no stated reason", async () => {
      for (const v of violations) {
        const result = await attempt(v.sql, v.params);
        expect(result.code, `${v.label}: ${JSON.stringify(result)}`).toBe("23514");
        expect(result.constraint, v.label).toBe(NAME);
      }
    });

    it("is not wider than it claims: SOFT rows and explained HARD rows are legal", async () => {
      const legal: [string, { sql: string; params: unknown[] }][] = [
        ["HARD with a reason", policy("HARD", "Author directive: the dead do not return")],
        ["SOFT with no reason", policy("SOFT", null)],
      ];
      for (const [label, stmt] of legal) {
        await client.query("BEGIN");
        const result = await attempt(stmt.sql, stmt.params);
        await client.query("ROLLBACK");
        expect(result.code, `${label}: ${JSON.stringify(result)}`).toBe("ACCEPTED");
      }
    });

    it("is load-bearing", async () => {
      for (const v of violations) {
        const r = await probe(v);
        expect(r.withConstraint, v.label).toBe("23514");
        expect(r.withoutConstraint, v.label).toBe("ACCEPTED");
        expect(r.restored, v.label).toBe(true);
        console.log(`OK   ${NAME.padEnd(38)} ${v.label}: with=refused  without=accepted`);
      }
    });
  });

  // -------------------------------------------------------------------------
  it("left the schema and the probe tables exactly as it found them", async () => {
    expect(await constraintNames()).toEqual([...CONSTRAINTS].sort());
    const { rows } = await client.query<{ antagonists: number; policies: number }>(
      `SELECT (SELECT count(*)::int FROM antagonists) AS antagonists,
              (SELECT count(*)::int FROM narrative_policies) AS policies`,
    );
    expect(rows[0]).toEqual({ antagonists: 0, policies: 0 });
  });
});
