/**
 * NF-WF-020A: dependency-edge table pins.
 *
 * The edge table is the machine-readable form of the schema's FK relations
 * between covered tables. These tests pin it so a schema change that adds,
 * removes, or retargets a relation fails loudly here instead of silently
 * changing selective-restore's conflict analysis.
 */
import { describe, expect, it } from "vitest";
import {
  DEPENDENCY_EDGES,
  SELECTIVE_DOMAINS,
  SELECTIVE_DOMAIN_NAMES,
  DOMAIN_UNMAPPED_TABLES,
  edgesForReferenced,
  edgesForDependent,
  COVERED_TABLE_NAMES,
} from "./index.ts";

describe("dependency edges", () => {
  it("pins the full edge set (42 edges)", () => {
    expect(DEPENDENCY_EDGES).toHaveLength(42);
  });

  it("marks exactly the 9 contract-pinned semantic edges", () => {
    const semantic = DEPENDENCY_EDGES.filter((e) => e.semantic);
    expect(semantic).toHaveLength(9);
    const pairs = semantic.map((e) => `${e.dependent}->${e.referenced}`);
    for (const p of [
      "character_knowledge->canon_facts",
      "canon_fact_sources->canon_facts",
      "canon_proposals->canon_facts",
      "canon_application_items->canon_facts",
      "outline_nodes->chapters",
      "story_thread_events->story_threads",
      "bond_members->bonds",
      "bond_transitions->bonds",
      "timeline_events->story_events",
    ]) {
      expect(pairs).toContain(p);
    }
  });

  it("only references covered tables and real columns", () => {
    const covered = new Set(COVERED_TABLE_NAMES);
    for (const e of DEPENDENCY_EDGES) {
      expect(covered.has(e.dependent), `${e.dependent} not covered`).toBe(true);
      expect(covered.has(e.referenced), `${e.referenced} not covered`).toBe(true);
      expect(e.via.length).toBeGreaterThan(0);
      expect(["Cascade", "Restrict", "SetNull", "NoAction"]).toContain(e.onDelete);
    }
  });

  it("excludes novel_id scoping edges and the C7 manuscript pointer", () => {
    for (const e of DEPENDENCY_EDGES) {
      expect(e.via).not.toBe("novel_id");
    }
    expect(
      DEPENDENCY_EDGES.filter(
        (e) => e.dependent === "chapters" && e.referenced === "chapter_versions",
      ),
    ).toHaveLength(0);
  });

  it("is consistent with the FK-dependency order (dependent after referenced)", () => {
    // Every edge's referenced table must precede the dependent in the
    // FK-dependency order — otherwise the order itself is wrong.
    // (Self-edges are exempt: a table trivially precedes itself.)
    for (const e of DEPENDENCY_EDGES) {
      if (e.dependent === e.referenced) continue;
      expect(
        COVERED_TABLE_NAMES.indexOf(e.referenced),
        `${e.referenced} must precede ${e.dependent}`,
      ).toBeLessThan(COVERED_TABLE_NAMES.indexOf(e.dependent));
    }
  });

  it("exposes lookup helpers", () => {
    const forFacts = edgesForReferenced("canon_facts");
    expect(forFacts.length).toBeGreaterThan(0);
    expect(forFacts.every((e) => e.referenced === "canon_facts")).toBe(true);
    const forKnowledge = edgesForDependent("character_knowledge");
    expect(forKnowledge.map((e) => e.referenced).sort()).toEqual([
      "canon_facts",
      "characters",
    ]);
  });
});

describe("selective domain vocabulary", () => {
  it("pins the 7 domains", () => {
    expect([...SELECTIVE_DOMAIN_NAMES].sort()).toEqual(
      [
        "canon",
        "character",
        "relationship",
        "narrative",
        "planning",
        "intelligence",
        "manuscript",
      ].sort(),
    );
  });

  it("maps 33 covered tables; the 3 unmapped are pinned separately", () => {
    const mapped = new Set(Object.values(SELECTIVE_DOMAINS).flat());
    expect(mapped.size).toBe(33);
    const covered = new Set(COVERED_TABLE_NAMES);
    for (const t of mapped) {
      expect(covered.has(t), `${t} not covered`).toBe(true);
    }
    expect([...DOMAIN_UNMAPPED_TABLES].sort()).toEqual(
      ["final_text_reviews", "memory_projections", "publications"].sort(),
    );
    for (const t of DOMAIN_UNMAPPED_TABLES) {
      expect(mapped.has(t), `${t} must not be domain-mapped`).toBe(false);
    }
    // 33 mapped + 3 unmapped = 36 covered.
    expect(mapped.size + DOMAIN_UNMAPPED_TABLES.length).toBe(covered.size);
  });

  it("pins the canon domain exactly (the 020A acceptance example)", () => {
    expect([...SELECTIVE_DOMAINS.canon].sort()).toEqual(
      [
        "story_entities",
        "canon_facts",
        "canon_fact_sources",
        "canon_proposals",
        "canon_applications",
        "canon_application_items",
      ].sort(),
    );
  });
});
