/**
 * Prisma 7 CLI configuration. Connection URL comes from the environment;
 * load .env when present (dev convenience) but never require it — CI and
 * scripts pass DATABASE_URL explicitly.
 */
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — environment must provide DATABASE_URL
}

// `env()` resolves eagerly and would break `prisma generate` on machines
// without DATABASE_URL set; generate needs no connection, so fall back to
// the local compose default. migrate/deploy always pass a real URL.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://novelforge:novelforge@localhost:5432/novelforge";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: DATABASE_URL,
    // Shadow DB for migrate dev/diff; dropped/recreated by the CLI as
    // needed (ADR-0003). Local compose default; overridable via env.
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ??
      "postgresql://novelforge:novelforge@localhost:5432/novelforge_shadow",
  },
});
