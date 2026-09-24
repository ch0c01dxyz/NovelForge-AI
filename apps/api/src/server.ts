/**
 * @novelforge/api — entrypoint.
 *
 * loadEnv() fails fast on invalid configuration (masked error, no secrets
 * in output). Composes the database + auth stores here (composition
 * layer, ADR-0002 §7) and hands them to buildApp. Bind after the app is
 * ready; exit non-zero on any failure.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "@novelforge/config";
import { createDb } from "@novelforge/database";
import { buildApp } from "./app.ts";

// Load the repo-root .env when present so `node src/server.ts` works
// without an explicit --env-file. Existing process.env wins (Node only
// sets keys that are not already defined). Real deployments inject env
// directly and have no .env file — this is a no-op there.
const envFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".env",
);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp(env, { db });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await db.$disconnect();
  process.exit(1);
}
