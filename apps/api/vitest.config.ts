import { defineConfig } from "vitest/config";

/**
 * The DB-backed suites create and migrate a dedicated database in
 * `beforeAll` (ADR-0003 §8). Under parallel load that exceeds Vitest's
 * 10s default hook timeout, so it is raised here rather than making every
 * suite set its own.
 *
 * The `src/e2e/` files share one disposable database and serialize their
 * destructive reset through the GAP-076 cross-process setup lock, whose
 * whole-lifecycle hold (destructive setup until `closeE2E`) previously
 * made the LAST e2e file's `beforeAll` wait for every earlier file's
 * ENTIRE run — the long-novel measurement file then hit its fixed 600 s
 * hook ceiling while still waiting for the lock (0 tests run). Running
 * the three e2e files strictly one-at-a-time (`fileParallelism: false`)
 * makes each file's hooks start at its own turn, so the lock is never
 * contended and the hook budget covers only that file's own setup +
 * fixture work. All non-e2e suites keep the default parallel schedule.
 */
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["src/e2e/**"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["src/e2e/**/*.{test,spec}.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
