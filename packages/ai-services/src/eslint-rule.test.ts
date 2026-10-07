/**
 * NF-WF-026 (GAP-028): Negative test for the ESLint no-restricted-imports rule.
 *
 * Verifies that `apps/worker` files importing from `apps/api/src` are
 * flagged by the rule. This is a CI enforcement check for Invariant 2.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

describe("ESLint no-restricted-imports (NF-WF-026)", () => {
  it("flags apps/worker importing from apps/api/src", () => {
    // Create a synthetic violating file in apps/worker
    // __dirname is packages/ai-services/src, so ../../../ reaches repo root
    const violatingFile = join(
      __dirname,
      "../../../apps/worker/src/__test-violation__.ts"
    );
    writeFileSync(
      violatingFile,
      `// Synthetic violation for NF-WF-026 negative test\nimport { createAiServices } from "../../api/src/services/ai.ts";\nexport const x = createAiServices;\n`
    );

    try {
      // Run ESLint on the violating file — should exit non-zero
      let eslintOutput = "";
      let eslintFailed = false;
      try {
        eslintOutput = execSync(`npx eslint ${violatingFile} 2>&1`, {
          encoding: "utf-8",
          cwd: join(__dirname, "../../.."),
        });
      } catch (err) {
        eslintFailed = true;
        eslintOutput = (err as { stdout?: string }).stdout ?? String(err);
      }

      expect(eslintFailed).toBe(true);
      expect(eslintOutput).toContain("no-restricted-imports");
    } finally {
      // Clean up
      if (existsSync(violatingFile)) {
        unlinkSync(violatingFile);
      }
    }
  });

  it("passes for apps/worker importing from @novelforge/ai-services", () => {
    // The real workflow-jobs.ts imports from @novelforge/ai-services — should pass
    // We check specifically for no-restricted-imports errors, ignoring other lint issues
    let output = "";
    try {
      output = execSync(`npx eslint apps/worker/src/workflow-jobs.ts 2>&1`, {
        encoding: "utf-8",
        cwd: join(__dirname, "../../.."),
      });
    } catch (err) {
      output = (err as { stdout?: string }).stdout ?? "";
    }
    // Should not contain no-restricted-imports errors (other errors are OK for this test)
    expect(output).not.toContain("no-restricted-imports");
  });
});
