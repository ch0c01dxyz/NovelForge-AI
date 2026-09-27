// Vitest workspace replacement (vitest ≥4 removed defineWorkspace) — every
// package/app with tests is picked up automatically. Projects without test
// files are fine: root `pnpm test` passes --passWithNoTests.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { projects: ["packages/*", "apps/*"] },
});
