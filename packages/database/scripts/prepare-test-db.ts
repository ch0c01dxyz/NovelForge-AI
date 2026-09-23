/**
 * Test-database helper: creates (or recreates) the `novelforge_test`
 * database used by integration tests, applies all migrations to it, and
 * prints the resulting DATABASE_URL.
 *
 * Usage: pnpm --filter @novelforge/database db:test:prepare
 *
 * Connects to the admin database of DATABASE_URL (default: the compose
 * stack at localhost:5432) and CREATE/DROPs only `novelforge_test`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Prisma CLI entry resolved locally (spawning "pnpm" fails on Windows: ENOENT on .cmd shims).
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRISMA_CLI = path.join(PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");
const TEST_DB = "novelforge_test";

function adminUrl(target: string): string {
  const url = new URL(target);
  url.pathname = "/postgres";
  return url.toString();
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(PACKAGE_ROOT, "..", "..", ".env"));
    } catch {
      throw new Error("DATABASE_URL not set and repo-root .env not found");
    }
  }
  const base = process.env.DATABASE_URL!;
  const client = new pg.Client({ connectionString: adminUrl(base) });
  await client.connect();
  // Terminate stray connections so DROP never blocks on a busy test db.
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();

  const testUrl = adminUrl(base).replace("/postgres", `/${TEST_DB}`);
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "inherit",
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  console.log(testUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
