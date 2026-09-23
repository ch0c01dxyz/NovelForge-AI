/**
 * Integration tests: register/login/logout/validate round-trip against the
 * live compose PostgreSQL (novelforge_test db, same setup as
 * packages/database — see ADR-0003). The Prisma-backed store adapters live
 * here in the test (composition layer), keeping packages/auth ORM-free
 * per ADR-0002 §7.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import pg from "pg";
import {
  createAuthService,
  hashSessionToken,
  type SessionStore,
  type UserStore,
} from "../index.ts";

// Separate test database per package: the database and auth integration
// suites run in parallel from the repo root and must not drop each other DB.
const TEST_DB = "novelforge_test_auth";
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DB_PACKAGE_ROOT = path.join(PACKAGE_ROOT, "..", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

// Load repo-root .env when DATABASE_URL is not in the environment (CI passes it).
if (!process.env.DATABASE_URL) {
  const root = path.join(PACKAGE_ROOT, "..", "..", ".env");
  try {
    process.loadEnvFile(root);
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

function prismaUserStore(): UserStore {
  return {
    async findByEmail(email) {
      return db.user.findUnique({ where: { email } });
    },
    async findById(id) {
      return db.user.findUnique({ where: { id } });
    },
    async create({ email, passwordHash, displayName }) {
      return db.user.create({ data: { email, passwordHash, displayName } });
    },
  };
}

function prismaSessionStore(): SessionStore {
  return {
    async findByTokenHash(tokenHash) {
      return db.session.findUnique({ where: { tokenHash } });
    },
    async create({ tokenHash, userId, expiresAt }) {
      return db.session.create({ data: { tokenHash, userId, expiresAt } });
    },
    async revoke(id) {
      await db.session.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    async extend(id, expiresAt) {
      await db.session.update({ where: { id }, data: { expiresAt } });
    },
  };
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
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE audit_logs, novel_settings, novels, memberships, sessions, workspaces, users RESTART IDENTITY CASCADE`,
  );
});

describe("auth round-trip (postgres)", () => {
  it("register -> login -> validate -> logout -> validate", async () => {
    const svc = createAuthService({ users: prismaUserStore(), sessions: prismaSessionStore() });
    const email = `roundtrip-${Date.now()}@example.com`;
    const { userId } = await svc.register({ email, password: "pw12345678", displayName: "R" });
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);

    const { token } = await svc.login(email, "pw12345678");
    const session = await svc.validateSession(token);
    expect(session?.userId).toBe(userId);

    // Only the hash is persisted.
    const row = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(token);

    await svc.logout(token);
    expect(await svc.validateSession(token)).toBeNull();
  }, 30_000);

  it("duplicate register hits the unique email constraint cleanly", async () => {
    const svc = createAuthService({ users: prismaUserStore(), sessions: prismaSessionStore() });
    const email = `dup-${Date.now()}@example.com`;
    await svc.register({ email, password: "pw12345678", displayName: "A" });
    await expect(
      svc.register({ email, password: "pw87654321", displayName: "B" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  }, 30_000);
});
