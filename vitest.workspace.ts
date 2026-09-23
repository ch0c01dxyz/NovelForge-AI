// Vitest workspace — every package/app with tests is picked up automatically.
// Projects without test files are fine: root `pnpm test` passes
// --passWithNoTests while NF-0003/NF-0004 tests land concurrently.
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/*", "apps/*"]);
