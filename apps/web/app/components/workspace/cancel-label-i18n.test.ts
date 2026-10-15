/**
 * F4 regression guard (GAP-051 human audit, 2026-10-13): six workspace
 * components rendered the raw key `workspace.common.cancel` on their Cancel
 * buttons because the call sites referenced a key path that does not exist
 * in either dictionary. The labels now reuse the existing top-level
 * `common.cancel` ("Cancel" / "Batal"); no translation aliases were added.
 *
 * Pattern follows scale-review-i18n-parity.test.ts (GAP-121): resolve
 * against the REAL locale modules, never a hand-written mock. Because the
 * reused key exists in BOTH dictionaries, the vue-i18n English-fallback
 * path is never exercised for these labels; the id assertion below is the
 * stronger check. The English fallback itself remains covered by the
 * platform i18n configuration and is intentionally not duplicated here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

const COMPONENTS = [
  "./Antagonists.vue",
  "./DnaEditor.vue",
  "./HealthMemoryPanel.vue",
  "./PolicyList.vue",
  "./ReferenceIngest.vue",
  "./ReferenceLibrary.vue",
] as const;

describe("workspace Cancel label real-dictionary guard (F4)", () => {
  const sources = COMPONENTS.map((file) =>
    readFileSync(new URL(file, import.meta.url), "utf8"),
  );

  it("guards the repaired common.cancel call sites", () => {
    const total = sources.reduce(
      (n, s) => n + (s.match(/\bt\(\s*["']common\.cancel["']\s*\)/g)?.length ?? 0),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(9);
    for (const source of sources) {
      expect(source).toMatch(/\bt\(\s*["']common\.cancel["']\s*\)/);
    }
  });

  it("no longer references the non-existent workspace.common.cancel path", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/["'`]workspace\.common\.cancel["']/);
    }
  });

  it("common.cancel resolves in the real en dictionary", () => {
    expect((en as Record<string, unknown>).common).toMatchObject({ cancel: "Cancel" });
  });

  it("common.cancel resolves in the real id dictionary", () => {
    expect((id as Record<string, unknown>).common).toMatchObject({ cancel: "Batal" });
  });
});
