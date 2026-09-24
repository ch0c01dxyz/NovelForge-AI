import { defineConfig } from "vitest/config";

/**
 * The DB-backed suites create and migrate a dedicated database in
 * `beforeAll` (ADR-0003 §8). Under parallel load that exceeds Vitest's
 * 10s default hook timeout, so it is raised here rather than making every
 * suite set its own.
 */
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
