/**
 * NF-WF-032 (GAP-004): restore-scope classification completeness tests.
 *
 * - Every Prisma model is classified into exactly one RESTORE_SCOPE_CLASS.
 * - REWOUND == COVERED_TABLES with restoreTarget: true.
 * - PINNED == COVERED_TABLES with restoreTarget: false.
 * - Mutation probe: removing a classification entry fails.
 *
 * Pure tests — no database.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESTORE_SCOPE_CLASS,
  RESTORE_SCOPE_CLASS_RATIONALE,
  tablesInClass,
  scopeClassOf,
  type RestoreScopeClass,
} from "./restore-scope.ts";
import { COVERED_TABLES } from "./snapshot.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "database", "prisma", "schema.prisma");

/** Extract model → table mappings from schema.prisma. */
function schemaModels(): { model: string; table: string }[] {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const models: { model: string; table: string }[] = [];
  const modelRe = /model (\w+) \{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema)) !== null) {
    const name = m[1]!;
    const body = m[2]!;
    const mapMatch = /@@map\("([^"]+)"\)/.exec(body);
    models.push({ model: name, table: mapMatch?.[1] ?? name });
  }
  return models;
}

describe("RESTORE_SCOPE_CLASS completeness (NF-WF-032)", () => {
  it("classifies all 96 Prisma models", () => {
    const models = schemaModels();
    expect(models.length).toBe(96);
    for (const { model, table } of models) {
      expect(
        RESTORE_SCOPE_CLASS[table],
        `model ${model} (table ${table}) is unclassified`,
      ).toBeDefined();
    }
  });

  it("classifies each table exactly once (no duplicates possible by construction)", () => {
    const tables = Object.keys(RESTORE_SCOPE_CLASS);
    expect(tables.length).toBe(96);
    expect(new Set(tables).size).toBe(96);
  });

  it("REWOUND equals COVERED_TABLES with restoreTarget: true", () => {
    const expected = COVERED_TABLES.filter((t) => t.restoreTarget).map((t) => t.key);
    const actual = tablesInClass("REWOUND");
    expect(new Set(actual)).toEqual(new Set(expected));
    expect(actual.length).toBe(33);
  });

  it("PINNED equals COVERED_TABLES with restoreTarget: false", () => {
    const expected = COVERED_TABLES.filter((t) => !t.restoreTarget).map((t) => t.key);
    const actual = tablesInClass("PINNED");
    expect(new Set(actual)).toEqual(new Set(expected));
    expect(actual.length).toBe(3);
    expect(new Set(actual)).toEqual(new Set(["chapters", "chapter_versions", "publications"]));
  });

  it("class counts match the contract (33+3+32+2+15+9+2=96)", () => {
    const counts: Record<RestoreScopeClass, number> = {
      REWOUND: tablesInClass("REWOUND").length,
      PINNED: tablesInClass("PINNED").length,
      OPERATIONAL: tablesInClass("OPERATIONAL").length,
      DERIVED: tablesInClass("DERIVED").length,
      CONFIGURATION: tablesInClass("CONFIGURATION").length,
      SIMULATION: tablesInClass("SIMULATION").length,
      REFERENCE: tablesInClass("REFERENCE").length,
    };
    expect(counts).toEqual({
      REWOUND: 33,
      PINNED: 3,
      OPERATIONAL: 32,
      DERIVED: 2,
      CONFIGURATION: 15,
      SIMULATION: 9,
      REFERENCE: 2,
    });
  });

  it("every class has a rationale", () => {
    const classes: RestoreScopeClass[] = [
      "REWOUND",
      "PINNED",
      "OPERATIONAL",
      "DERIVED",
      "CONFIGURATION",
      "SIMULATION",
      "REFERENCE",
    ];
    for (const cls of classes) {
      expect(RESTORE_SCOPE_CLASS_RATIONALE[cls], `no rationale for ${cls}`).toBeTruthy();
    }
  });

  it("scopeClassOf returns the class for known tables and undefined for unknown", () => {
    expect(scopeClassOf("canon_facts")).toBe("REWOUND");
    expect(scopeClassOf("chapters")).toBe("PINNED");
    expect(scopeClassOf("audit_logs")).toBe("OPERATIONAL");
    expect(scopeClassOf("embeddings")).toBe("DERIVED");
    expect(scopeClassOf("novels")).toBe("CONFIGURATION");
    expect(scopeClassOf("simulation_runs")).toBe("SIMULATION");
    expect(scopeClassOf("references")).toBe("REFERENCE");
    expect(scopeClassOf("nonexistent_table")).toBeUndefined();
  });

  it("mutation probe: removing a classification entry fails the completeness check", () => {
    // Simulate a future table added to the schema but not classified.
    const models = schemaModels();
    const mutated = { ...RESTORE_SCOPE_CLASS };
    // Remove one entry — the check must catch it.
    delete (mutated as Record<string, RestoreScopeClass | undefined>)["canon_facts"];
    const unclassified = models.filter(({ table }) => mutated[table] === undefined);
    expect(unclassified.map((u) => u.table)).toContain("canon_facts");
    // And the real constant must not have this problem.
    const reallyUnclassified = models.filter(
      ({ table }) => RESTORE_SCOPE_CLASS[table] === undefined,
    );
    expect(reallyUnclassified).toEqual([]);
  });
});
