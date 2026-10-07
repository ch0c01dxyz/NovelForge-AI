// ESLint flat config — repo-wide. Type-aware linting
// (recommendedTypeChecked) stays out of CI for now to keep the skeleton
// fast; tighten later once packages have real code.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.nuxt/**",
      "**/.output/**",
      "pnpm-lock.yaml",
      "receipts/**",
      "review-receipts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // NF-WF-026 (GAP-028): forbid apps/worker from importing apps/api/src.
  // The worker must use @novelforge/ai-services for the AI path.
  {
    files: ["apps/worker/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Matches relative imports like ../../api/src/... and
              // absolute-like apps/api/src/...
              group: ["**/api/src/**"],
              message:
                "apps/worker must not import from apps/api/src (NF-WF-004 forbidden path). Use @novelforge/ai-services instead.",
            },
          ],
        },
      ],
    },
  },
);
