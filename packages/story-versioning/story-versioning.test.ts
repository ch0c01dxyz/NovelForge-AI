/**
 * Story-versioning contract tests (STORY-VERSIONING.md C1, C2, C3, C7).
 *
 * The property under test is not "does the helper run" but "can the coverage
 * set and the impact class be trusted":
 *
 *  - a coverage set missing a table makes `validateSnapshotComplete` pass a
 *    snapshot that will silently delete that table's rows on restore, so the
 *    count and the exact membership are asserted, not just "non-empty";
 *  - a coverage set in the wrong ORDER makes restore violate a foreign key,
 *    so the order is asserted against the schema's real dependency edges;
 *  - a HIGH operation classified LOW skips the mandatory checkpoint, which is
 *    the one thing the impact class decides — so both directions are pinned;
 *  - `chapters.status` must never reach the payload (C7: a restore that
 *    carried it would publish or unpublish a chapter).
 */
import { describe, expect, it } from "vitest";
import {
  COVERED_TABLES,
  COVERED_TABLE_NAMES,
  SNAPSHOT_FORMAT_VERSION,
  isCoveredTable,
  OUTSIDE_SCOPE,
  payloadColumns,
  validateSnapshotComplete,
} from "./snapshot.ts";
import {
  impactFor,
  OPERATIONS,
  PROJECTIONS,
  projectionForTable,
  projectionsForTables,
  requiresCheckpoint,
} from "./impact.ts";

describe("C1 coverage set", () => {
  it("has exactly the 31 tables the contract names", () => {
    expect(COVERED_TABLE_NAMES).toHaveLength(31);
    // The exact membership, not a spot check: a table dropped from this list
    // would make validateSnapshotComplete accept a payload that omits it, and
    // restore would then delete every row of it.
    expect([...COVERED_TABLE_NAMES].sort()).toEqual(
      [
        "antagonists",
        "bond_members",
        "bond_transitions",
        "bonds",
        "canon_fact_sources",
        "canon_facts",
        "canon_proposals",
        "chapter_versions",
        "chapters",
        "character_arc_milestones",
        "character_arcs",
        "character_knowledge",
        "character_states",
        "characters",
        "causal_edges",
        "meaningful_interactions",
        "narrative_dna_profiles",
        "narrative_policies",
        "outline_nodes",
        "outline_versions",
        "planning_horizons",
        "relationship_stances",
        "sagas",
        "scenes",
        "story_entities",
        "story_events",
        "story_promises",
        "story_thread_events",
        "story_threads",
        "synopses",
        "timeline_events",
      ].sort(),
    );
  });

  it("excludes novel_branches — it is the head pointer, not restorable state", () => {
    expect(isCoveredTable("novel_branches")).toBe(false);
  });

  it("lists the C1 outside-scope tables verbatim, so preview can state them", () => {
    const tables = OUTSIDE_SCOPE.map((r) => r.table);
    for (const t of ["users", "memberships", "novel_settings", "novels", "audit_logs"]) {
      expect(tables).toContain(t);
    }
  });

  it("orders every parent before its child", () => {
    // The dependency edges that matter, transcribed from schema.prisma's
    // relation graph. If COVERED_TABLES is reordered without re-deriving the
    // order, one of these fails before restore violates an FK in production.
    const edges: [parent: string, child: string][] = [
      ["story_entities", "characters"],
      ["characters", "antagonists"],
      ["characters", "bond_members"],
      ["bonds", "bond_members"],
      ["bonds", "bond_transitions"],
      ["story_entities", "canon_facts"],
      ["chapters", "chapter_versions"],
      ["canon_facts", "canon_fact_sources"],
      ["chapter_versions", "canon_fact_sources"],
      ["canon_facts", "canon_proposals"],
      ["chapters", "story_events"],
      ["story_events", "causal_edges"],
      ["characters", "character_arcs"],
      ["character_arcs", "character_arc_milestones"],
      ["canon_facts", "character_knowledge"],
      ["characters", "character_knowledge"],
      ["chapters", "scenes"],
      ["sagas", "outline_nodes"],
      ["scenes", "outline_nodes"],
      ["characters", "relationship_stances"],
      ["story_threads", "story_thread_events"],
      ["story_events", "story_thread_events"],
      ["story_events", "timeline_events"],
    ];
    for (const [parent, child] of edges) {
      expect(
        COVERED_TABLE_NAMES.indexOf(parent),
        `${parent} must precede ${child}`,
      ).toBeLessThan(COVERED_TABLE_NAMES.indexOf(child));
    }
  });

  it("marks only the manuscript pair as non-restore-target", () => {
    const nonTargets = COVERED_TABLES.filter((t) => !t.restoreTarget).map((t) => t.key);
    // chapter_versions is ON DELETE CASCADE from chapters and append-only, so
    // deleting either destroys immutable history (C7).
    expect([...nonTargets].sort()).toEqual(["chapter_versions", "chapters"]);
  });
});

describe("C2/C7 payload shape", () => {
  it("is format_version 1", () => {
    expect(SNAPSHOT_FORMAT_VERSION).toBe(1);
  });

  it("keeps chapters.status out of the payload", () => {
    const columns = payloadColumns("chapters", [
      "id",
      "novel_id",
      "number",
      "title",
      "status",
      "current_version_id",
      "word_count",
    ]);
    // C7: publication pointers are outside story restore, always. A payload
    // carrying status would publish or unpublish a chapter on restore.
    expect(columns).not.toContain("status");
    expect(columns).toEqual([
      "id",
      "novel_id",
      "number",
      "title",
      "current_version_id",
      "word_count",
    ]);
  });

  it("drops no column from a table with no declared exclusions", () => {
    const all = ["id", "novel_id", "key"];
    expect(payloadColumns("characters", all)).toEqual(all);
  });

  it("accepts a payload carrying every covered key", () => {
    const payload = Object.fromEntries(COVERED_TABLE_NAMES.map((t) => [t, []]));
    expect(validateSnapshotComplete(payload)).toEqual({ ok: true });
  });

  it("refuses a payload missing a covered table, by name", () => {
    const payload = Object.fromEntries(
      COVERED_TABLE_NAMES.filter((t) => t !== "canon_facts").map((t) => [t, []]),
    );
    // A missing key reads as "the story had none of these", which is how a
    // partial snapshot silently destroys rows restore would have re-inserted.
    expect(validateSnapshotComplete(payload)).toEqual({
      problem: "MISSING_TABLE",
      table: "canon_facts",
    });
  });

  it("refuses a non-array table value and a non-object payload", () => {
    const payload: Record<string, unknown> = Object.fromEntries(
      COVERED_TABLE_NAMES.map((t) => [t, []]),
    );
    payload["scenes"] = { not: "an array" };
    expect(validateSnapshotComplete(payload)).toEqual({
      problem: "NOT_AN_ARRAY",
      table: "scenes",
    });
    expect(validateSnapshotComplete(null)).toEqual({ problem: "NOT_AN_OBJECT" });
    expect(validateSnapshotComplete([])).toEqual({ problem: "NOT_AN_OBJECT" });
  });
});

describe("C3 impact classes", () => {
  it("classifies every HIGH operation from the contract as HIGH", () => {
    for (const op of [
      "proposal.approve",
      "outlineVersion.approve",
      "outline.supersede",
      "chapters.import",
      "restore.apply",
      "outline.bulkRewrite",
      "branch.merge",
      "ai.bulkRewrite",
      // Not a C3 row: it is the PRE_MUTATION capture the HIGH rows take, so
      // it must classify HIGH or an explicit checkpoint captures nothing.
      "checkpoint.create",
    ] as const) {
      expect(impactFor(op), op).toBe("HIGH");
      expect(requiresCheckpoint(op), op).toBe(true);
    }
  });

  it("classifies every LOW operation from the contract as LOW", () => {
    for (const op of [
      "chapter.save",
      "chapter.restore",
      "synopsis.write",
      "saga.write",
      "outlineNode.write",
      "scene.crud",
      "thread.transition",
      "promise.transition",
      "character.write",
      "relationship.write",
      "dna.write",
      "policy.write",
      "antagonist.advance",
      "fact.create",
      "fact.retract",
      "proposal.create",
      "proposal.reject",
      "event.append",
      "timeline.append",
      "causalEdge.create",
    ] as const) {
      // LOW still records a revision and a change set — the class decides only
      // whether a checkpoint and snapshot are captured (C3).
      expect(impactFor(op), op).toBe("LOW");
      expect(requiresCheckpoint(op), op).toBe(false);
    }
  });

  it("treats an unlisted operation as LOW rather than refusing it", () => {
    expect(impactFor("some.future.operation")).toBe("LOW");
  });

  it("has no operation in both classes", () => {
    const high = OPERATIONS.filter((o) => impactFor(o) === "HIGH");
    const low = OPERATIONS.filter((o) => impactFor(o) === "LOW");
    expect(high.length + low.length).toBe(OPERATIONS.length);
  });
});

describe("C6 projection mapping", () => {
  it("maps every covered table to exactly one projection", () => {
    for (const table of COVERED_TABLE_NAMES) {
      expect(projectionForTable(table), table).not.toBeNull();
    }
  });

  it("derives affected projections from touched tables, deduplicated", () => {
    expect(projectionsForTables(["canon_facts", "character_knowledge"])).toEqual([
      "canon",
      "character",
    ]);
    // Two canon tables collapse to one projection.
    expect(projectionsForTables(["canon_facts", "canon_proposals"])).toEqual(["canon"]);
    expect(projectionsForTables([])).toEqual([]);
    expect(PROJECTIONS).toHaveLength(7);
  });
});
