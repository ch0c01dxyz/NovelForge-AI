import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

/**
 * Component tests for the writer workspace (NF-WF-007).
 *
 * jsdom + @vue/test-utils; tests mock at the HTTP/`useApi` boundary
 * (per the contract reviewer's Q5 interpretation). The full loop is
 * covered API-level against the real backend with the test driver
 * (GAP-028) in apps/api.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.ts", "a11y/**/*.test.ts"],
  },
});
