/** NF-WF-026: enforce the worker import boundary without mutating source files. */
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const eslint = new ESLint({ cwd: root });
const filePath = "apps/worker/src/__boundary-check__.ts";

describe("ESLint no-restricted-imports (NF-WF-026)", () => {
  it("ignores private evidence tooling while keeping application source in scope", async () => {
    expect(await eslint.isPathIgnored(".nf-artifacts/nf056/check.mjs")).toBe(true);
    for (const source of ["apps/api/src/app.ts", "apps/web/app/composables/useApi.ts", "apps/worker/src/index.ts"]) {
      expect(await eslint.isPathIgnored(source)).toBe(false);
    }
  }, 30_000);
  it("flags apps/worker importing from apps/api/src", async () => {
    const results = await eslint.lintText(
      'import { createAiServices } from "../../api/src/services/ai.ts"; export const x = createAiServices;',
      { filePath },
    );
    expect(results.flatMap((r) => r.messages).some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  }, 30_000);

  it("allows the shared service import", async () => {
    const results = await eslint.lintText(
      'import { createWorkerAiPath } from "@novelforge/ai-services"; export const x = createWorkerAiPath;',
      { filePath },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.errorCount).toBe(0);
    expect(results[0]?.warningCount).toBe(0);
  }, 30_000);
});
