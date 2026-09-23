/**
 * Integration tests against the live compose PostgreSQL via a dedicated
 * `novelforge_test` database (ADR-0003). The database is created/dropped
 * and migrated before the suite; rows are cleaned between tests.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "../index.ts";
import pg from "pg";

const TEST_DB = "novelforge_test";
// Prisma CLI entry resolved locally (spawning "pnpm" fails on Windows: ENOENT on .cmd shims).
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRISMA_CLI = path.join(PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

// Load repo-root .env (compose dev credentials) when DATABASE_URL is not
// already in the environment; CI passes it explicitly.
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

let db: NovelForgeDb;

beforeAll(async () => {
  // Recreate + migrate the test database (same path as db:test:prepare).
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
  execFileSync(
    process.execPath,
    [PRISMA_CLI, "migrate", "deploy"],
    {
      stdio: "pipe",
      cwd: PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: TEST_URL },
    },
  );
  db = createDb(TEST_URL);
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  // Truncate tenant tables; order avoids FK violations.
  await db.$executeRawUnsafe(
    `TRUNCATE audit_logs, novel_settings, novels, memberships, sessions, workspaces, users RESTART IDENTITY CASCADE`,
  );
});

describe("platform schema", () => {
  it("applies migrations from empty and enables pgvector", async () => {
    const [{ extversion }] = await db.$queryRawUnsafe<[{ extversion: string }]>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(extversion).toBeTruthy();
  });

  it("creates a user with a generated uuid and unique email", async () => {
    const user = await db.user.create({
      data: { email: "[EMAIL_REDACTED]", passwordHash: "hash", displayName: "A" },
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      db.user.create({
        data: { email: "[EMAIL_REDACTED]", passwordHash: "h", displayName: "B" },
      }),
    ).rejects.toThrow();
  });

  it("enforces one membership per user+workspace and cascades", async () => {
    const user = await db.user.create({
      data: { email: "[EMAIL_REDACTED]", passwordHash: "h", displayName: "O" },
    });
    const ws = await db.workspace.create({
      data: { name: "WS", slug: "ws", ownerId: user.id },
    });
    await db.membership.create({
      data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
    });
    await expect(
      db.membership.create({
        data: { workspaceId: ws.id, userId: user.id, role: "ADMIN" },
      }),
    ).rejects.toThrow();

    // Cascade: deleting the workspace removes memberships and novels.
    await db.novel.create({
      data: { workspaceId: ws.id, title: "N", slug: "n", createdById: user.id },
    });
    await db.workspace.delete({ where: { id: ws.id } });
    expect(await db.membership.count()).toBe(0);
    expect(await db.novel.count()).toBe(0);
  });

  it("keeps audit logs immutable-append with jsonb payload", async () => {
    const entry = await db.auditLog.create({
      data: {
        action: "workspace.created",
        entityType: "Workspace",
        payload: { slug: "ws" },
      },
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.payload).toEqual({ slug: "ws" });
  });
});
