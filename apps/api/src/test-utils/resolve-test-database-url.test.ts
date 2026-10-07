/**
 * resolve-test-database-url.test.ts
 *
 * Regression tests for the NF-WF-047C shared test-database URL resolver
 * (GAP-081/082). The resolver's parent-vs-file comparison used a custom
 * line scanner that mishandled quoted values (quotes retained → spurious
 * mismatch warnings), `export` prefixes (line not matched → stale-parent
 * signal missed), and whitespace/comments around `=` (line not matched →
 * signal missed). The repair uses `node:util.parseEnv` for the file read.
 *
 * All credentials here are dummies; no database connection is made.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveTestDatabaseUrl } from "./resolve-test-database-url.ts";

// Dummy URLs only — never a real connection.
const FILE_URL = "postgresql://fileuser:filepw@localhost:5432/filedb";
const PARENT_URL = "postgresql://parentuser:parentpw@localhost:5432/parentdb";

let dir: string;
let savedParent: string | undefined;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  savedParent = process.env.DATABASE_URL;
  dir = mkdtempSync(join(tmpdir(), "nf047c-helper-"));
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  if (savedParent === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = savedParent;
  }
  warnSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

function writeEnv(content: string): string {
  const envPath = join(dir, ".env");
  writeFileSync(envPath, content, "utf-8");
  return envPath;
}

function warningText(): string {
  return warnSpy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .join("\n");
}

describe("resolveTestDatabaseUrl dotenv parsing (NF-WF-047C)", () => {
  it("1. quoted assignment: equal parent/file values → no mismatch warning", () => {
    const envPath = writeEnv(`DATABASE_URL="${FILE_URL}"`);
    process.env.DATABASE_URL = FILE_URL;

    const resolved = resolveTestDatabaseUrl({ envPath });

    expect(resolved).toBe(FILE_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("2. export syntax: differing parent value → warning fires", () => {
    const envPath = writeEnv(`export DATABASE_URL="${FILE_URL}"`);
    process.env.DATABASE_URL = PARENT_URL;

    const resolved = resolveTestDatabaseUrl({ envPath });

    expect(resolved).toBe(PARENT_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("3. whitespace/comments: differing parent value → warning fires", () => {
    const envPath = writeEnv(`  DATABASE_URL = ${FILE_URL}  # comment`);
    process.env.DATABASE_URL = PARENT_URL;

    const resolved = resolveTestDatabaseUrl({ envPath });

    expect(resolved).toBe(PARENT_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("4. equal parent/file values → no mismatch warning", () => {
    const envPath = writeEnv(`DATABASE_URL=${FILE_URL}`);
    process.env.DATABASE_URL = FILE_URL;

    const resolved = resolveTestDatabaseUrl({ envPath });

    expect(resolved).toBe(FILE_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("5. different values → warning fires and is sanitized", () => {
    const envPath = writeEnv(`DATABASE_URL=${FILE_URL}`);
    process.env.DATABASE_URL = PARENT_URL;

    const resolved = resolveTestDatabaseUrl({ envPath });

    expect(resolved).toBe(PARENT_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const text = warningText();
    expect(text).not.toContain("parentpw");
    expect(text).not.toContain("filepw");
    expect(text).not.toContain("://");
  });

  it("6. missing DATABASE_URL (absent parent + missing file) → explicit failure", () => {
    delete process.env.DATABASE_URL;
    const envPath = join(dir, "does-not-exist.env");

    expect(() => resolveTestDatabaseUrl({ envPath })).toThrow(
      /not set and repo-root \.env not found/,
    );
  });

  it("7. placeholder value → explicit failure", () => {
    const envPath = writeEnv("DATABASE_URL=<redacted>");
    delete process.env.DATABASE_URL;

    expect(() => resolveTestDatabaseUrl({ envPath })).toThrow(/placeholder/);
  });

  it("8. invalid configuration (empty-string parent + missing file) → explicit failure, no credential material", () => {
    process.env.DATABASE_URL = "";
    const envPath = join(dir, "does-not-exist.env");

    let thrown: Error | undefined;
    try {
      resolveTestDatabaseUrl({ envPath });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown?.message)).not.toContain("parentpw");
    expect(String(thrown?.message)).not.toContain("://");
  });
});
