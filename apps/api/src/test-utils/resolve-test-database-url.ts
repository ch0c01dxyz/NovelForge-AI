/**
 * resolve-test-database-url.ts
 *
 * Shared test-database URL resolver (NF-WF-047C, GAP-081/082).
 *
 * Implements the hardened loader pattern proven in
 * `simulation-causality.test.ts`:
 *
 * 1. If `DATABASE_URL` is absent or contains the placeholder marker,
 *    load the repo-root `.env` (via `process.loadEnvFile`, which never
 *    overrides existing variables).
 * 2. If `DATABASE_URL` is still absent or still contains the
 *    placeholder marker, fail loudly \u2014 never silently continue.
 * 3. If the parent process provided a `DATABASE_URL` that differs from
 *    the repo-root `.env` value, emit a loud sanitized warning (values
 *    are never printed). This addresses the GAP-081/082 silent-precedence
 *    mechanism: a stale parent export silently wins over `.env`.
 *
 * Secret hygiene: this module never prints connection strings or
 * credentials. Warnings describe the situation, not the values.
 *
 * ADR-0003 \u00a78 is preserved: CI passes `DATABASE_URL` explicitly (the
 * parent path); local runs fall back to the repo-root `.env`.
 */

import { readFileSync } from "node:fs";

const PLACEHOLDER_MARKER = "<redacted>";

function isAbsentOrPlaceholder(url: string | undefined): boolean {
  return !url || url.includes(PLACEHOLDER_MARKER);
}

/**
 * Extract the `DATABASE_URL` value from `.env` file content without
 * loading it into the process environment. Returns `undefined` if the
 * key is absent. Used only for the sanitized parent-vs-file comparison;
 * the value is never printed.
 */
function readEnvFileDatabaseUrl(envPath: string): string | undefined {
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    return undefined;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DATABASE_URL=")) {
      return trimmed.slice("DATABASE_URL=".length).trim();
    }
  }
  return undefined;
}

export interface ResolveTestDatabaseUrlOptions {
  /**
   * Absolute path to the repo-root `.env` file. Callers derive this
   * from `import.meta.url` (e.g.
   * `path.join(HERE, "..", "..", "..", ".env")`), never from cwd.
   */
  envPath: string;
}

/**
 * Resolve the base `DATABASE_URL` for tests.
 *
 * @throws If `DATABASE_URL` is absent and the repo-root `.env` cannot
 * be loaded, or if the resolved value is absent or still contains the
 * placeholder marker. The error messages never include credentials.
 */
export function resolveTestDatabaseUrl(
  options: ResolveTestDatabaseUrlOptions,
): string {
  const parentUrl = process.env.DATABASE_URL;
  const parentProvidedValidUrl =
    parentUrl !== undefined &&
    parentUrl !== "" &&
    !parentUrl.includes(PLACEHOLDER_MARKER);

  // Hardened pattern: (re)load from `.env` when absent or placeholder.
  // `process.loadEnvFile` never overrides existing variables, so a
  // valid parent-provided URL is preserved (ADR-0003 \u00a78).
  if (isAbsentOrPlaceholder(parentUrl)) {
    try {
      process.loadEnvFile(options.envPath);
    } catch {
      throw new Error(
        "DATABASE_URL not set and repo-root .env not found \u2014 see ADR-0003",
      );
    }
  }

  const resolvedUrl = process.env.DATABASE_URL;

  // Fail loudly on still-missing or still-placeholder. Never silently
  // continue with an unusable URL.
  if (isAbsentOrPlaceholder(resolvedUrl)) {
    throw new Error(
      "DATABASE_URL not set or contains placeholder \u2014 check repo-root " +
        ".env or export a valid DATABASE_URL (see ADR-0003 \u00a78)",
    );
  }

  // Sanitized mismatch warning (GAP-081/082): if the parent provided a
  // valid URL, `.env` was never consulted (loadEnvFile never overrides).
  // Warn loudly when the file holds a *different* URL, because an
  // operator who edited `.env` would otherwise have no signal that
  // their edit was ignored. Values are never printed.
  if (parentProvidedValidUrl) {
    const fileUrl = readEnvFileDatabaseUrl(options.envPath);
    if (
      fileUrl !== undefined &&
      fileUrl !== "" &&
      !fileUrl.includes(PLACEHOLDER_MARKER) &&
      fileUrl !== parentUrl
    ) {
      console.warn(
        "[test-env] WARNING: the parent process DATABASE_URL differs " +
          "from the repo-root .env DATABASE_URL. The parent value takes " +
          "precedence (process.loadEnvFile never overrides existing " +
          "variables), so edits to .env are currently ignored. Export " +
          "the intended URL or unset DATABASE_URL to use .env. " +
          "See GAP-081/GAP-082. (Values are intentionally not printed.)",
      );
    }
  }

  return resolvedUrl as string;
}
