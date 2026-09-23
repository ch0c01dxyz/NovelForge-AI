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
);
