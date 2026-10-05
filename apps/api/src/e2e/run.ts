/**
 * NF-WF-011 E2E runner: `pnpm e2e`.
 *
 * Preflight: DATABASE_URL set (or repo-root .env), PostgreSQL and Redis
 * reachable. Then spawns vitest over `src/e2e/` with
 * `--no-file-parallelism` (single `novelforge_test_e2e` database).
 * Propagates the exit code.
 */
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = path.join(HERE, "..", "..", "..", "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");

if (!process.env.DATABASE_URL && existsSync(ENV_PATH)) {
  process.loadEnvFile(ENV_PATH);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("e2e: DATABASE_URL not set and repo-root .env not found — see ADR-0003");
  process.exit(2);
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function checkPg(): Promise<void> {
  // Connect to the maintenance db; the e2e DB is created by the harness.
  const url = new URL(DATABASE_URL!);
  url.pathname = "/postgres";
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
}

function checkRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(REDIS_URL);
    const socket = createConnection(
      { host: url.hostname, port: Number(url.port ?? 6379) },
      () => {
        socket.end();
        resolve();
      },
    );
    socket.on("error", reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("redis connect timeout"));
    });
  });
}

async function main(): Promise<void> {
  try {
    await checkPg();
  } catch (e) {
    console.error(`e2e preflight: PostgreSQL not reachable: ${(e as Error).message}`);
    process.exit(2);
  }
  try {
    await checkRedis();
  } catch (e) {
    console.error(`e2e preflight: Redis not reachable (${REDIS_URL}): ${(e as Error).message}`);
    process.exit(2);
  }

  const result = spawnSync(
    process.execPath,
    [
      "../../node_modules/vitest/vitest.mjs",
      "run",
      "--no-file-parallelism",
      "src/e2e",
    ],
    { stdio: "inherit", cwd: path.join(HERE, "..", "..") },
  );
  process.exit(result.status ?? 1);
}

main();
