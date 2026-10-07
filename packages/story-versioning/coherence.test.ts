/**
 * NF-WF-032 (GAP-004): verifyCrossDomainCoherence predicate tests.
 *
 * Pure tests — no database. Each predicate is tested with a positive
 * case and (where meaningful) a negative probe proving detection.
 */
import { describe, expect, it } from "vitest";
import {
  verifyCrossDomainCoherence,
  toCrossDomainConflicts,
  type CoherenceState,
} from "./coherence.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, ...extra };
}

/** A minimal coherent state: chapter + version + fact + source + character. */
function coherentState(): CoherenceState {
  return {
    chapters: [row("ch1", { novel_id: "n1", number: 1, current_version_id: "cv1" })],
    chapter_versions: [row("cv1", { chapter_id: "ch1", novel_id: "n1" })],
    story_entities: [row("se1", { novel_id: "n1" })],
    characters: [row("c1", { novel_id: "n1", story_entity_id: "se1" })],
    canon_facts: [row("cf1", { novel_id: "n1", entity_id: "se1" })],
    canon_fact_sources: [
      row("cfs1", {
        novel_id: "n1",
        canon_fact_id: "cf1",
        chapter_version_id: "cv1",
        reference_version_id: null,
      }),
    ],
    canon_proposals: [row("cp1", { novel_id: "n1", canon_fact_id: "cf1" })],
    canon_applications: [row("ca1", { novel_id: "n1" })],
    canon_application_items: [
      row("cai1", {
        novel_id: "n1",
        application_id: "ca1",
        proposal_id: "cp1",
        canon_fact_id: "cf1",
      }),
    ],
    references: [row("r1", { novel_id: "n1" })],
    reference_versions: [row("rv1", { novel_id: "n1", reference_id: "r1" })],
    memory_projections: [
      row("mp1", { novel_id: "n1", scope: "chapter:ch1", source_revision_id: "rev1" }),
    ],
  };
}

// ---------------------------------------------------------------------------
// P2 — Reference resolvability
// ---------------------------------------------------------------------------

describe("P2_REFERENCE_RESOLVABILITY", () => {
  it("coherent state passes", () => {
    const report = verifyCrossDomainCoherence(coherentState());
    expect(report.coherent).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("dangling FK is detected (bond_members → missing bonds row)", () => {
    const state = coherentState();
    state["bonds"] = [];
    state["bond_members"] = [row("bm1", { novel_id: "n1", bond_id: "b-missing" })];
    const report = verifyCrossDomainCoherence(state);
    expect(report.coherent).toBe(false);
    const v = report.violations.find((x) => x.predicate === "P2_REFERENCE_RESOLVABILITY");
    expect(v).toBeDefined();
    expect(v!.tables).toContain("bond_members");
    expect(v!.tables).toContain("bonds");
    expect(v!.rowIds).toContain("b-missing");
  });

  it("NULL FKs are not violations", () => {
    const state = coherentState();
    // canon_proposals.conflicts_with_fact_id is nullable.
    state["canon_proposals"] = [
      row("cp1", { novel_id: "n1", canon_fact_id: "cf1", conflicts_with_fact_id: null }),
    ];
    const report = verifyCrossDomainCoherence(state);
    const p2 = report.violations.filter((x) => x.predicate === "P2_REFERENCE_RESOLVABILITY");
    expect(p2).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P3 — Identity-join coherence (GAP-011 NULL-honesty)
// ---------------------------------------------------------------------------

describe("P3_IDENTITY_JOIN_COHERENCE", () => {
  it("NULL story_entity_id is honest-unlinked, not a violation", () => {
    const state = coherentState();
    state["characters"] = [row("c1", { novel_id: "n1", story_entity_id: null })];
    const report = verifyCrossDomainCoherence(state);
    const p3 = report.violations.filter((x) => x.predicate === "P3_IDENTITY_JOIN_COHERENCE");
    expect(p3).toEqual([]);
  });

  it("non-NULL story_entity_id pointing at a missing entity is a violation", () => {
    const state = coherentState();
    state["characters"] = [row("c1", { novel_id: "n1", story_entity_id: "se-gone" })];
    const report = verifyCrossDomainCoherence(state);
    expect(report.coherent).toBe(false);
    const v = report.violations.find((x) => x.predicate === "P3_IDENTITY_JOIN_COHERENCE");
    expect(v).toBeDefined();
    expect(v!.tables).toEqual(["characters", "story_entities"]);
    expect(v!.rowIds).toContain("c1");
    expect(v!.rowIds).toContain("se-gone");
  });

  it("NULL story_event_id is honest-unlinked", () => {
    const state = coherentState();
    state["timeline_events"] = [row("te1", { novel_id: "n1", story_event_id: null })];
    state["story_events"] = [];
    const report = verifyCrossDomainCoherence(state);
    const p3 = report.violations.filter((x) => x.predicate === "P3_IDENTITY_JOIN_COHERENCE");
    expect(p3).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P4 — Evidence coherence
// ---------------------------------------------------------------------------

describe("P4_EVIDENCE_COHERENCE", () => {
  it("chapter_version source resolves", () => {
    const report = verifyCrossDomainCoherence(coherentState());
    const p4 = report.violations.filter((x) => x.predicate === "P4_EVIDENCE_COHERENCE");
    expect(p4).toEqual([]);
  });

  it("reference_version source resolves", () => {
    const state = coherentState();
    state["canon_fact_sources"] = [
      row("cfs1", {
        novel_id: "n1",
        canon_fact_id: "cf1",
        chapter_version_id: null,
        reference_version_id: "rv1",
      }),
    ];
    const report = verifyCrossDomainCoherence(state);
    const p4 = report.violations.filter((x) => x.predicate === "P4_EVIDENCE_COHERENCE");
    expect(p4).toEqual([]);
  });

  it("dangling evidence is detected", () => {
    const state = coherentState();
    state["canon_fact_sources"] = [
      row("cfs1", {
        novel_id: "n1",
        canon_fact_id: "cf1",
        chapter_version_id: "cv-gone",
        reference_version_id: null,
      }),
    ];
    const report = verifyCrossDomainCoherence(state);
    expect(report.coherent).toBe(false);
    const v = report.violations.find((x) => x.predicate === "P4_EVIDENCE_COHERENCE");
    expect(v).toBeDefined();
    expect(v!.rowIds).toContain("cfs1");
  });
});

// ---------------------------------------------------------------------------
// P5 — Manuscript coherence
// ---------------------------------------------------------------------------

describe("P5_MANUSCRIPT_COHERENCE", () => {
  it("coherent manuscript passes", () => {
    const report = verifyCrossDomainCoherence(coherentState());
    const p5 = report.violations.filter((x) => x.predicate === "P5_MANUSCRIPT_COHERENCE");
    expect(p5).toEqual([]);
  });

  it("chapter_versions pointing at a missing chapter is detected", () => {
    const state = coherentState();
    state["chapters"] = [];
    const report = verifyCrossDomainCoherence(state);
    expect(report.coherent).toBe(false);
    const v = report.violations.find(
      (x) => x.predicate === "P5_MANUSCRIPT_COHERENCE" && x.tables.includes("chapter_versions"),
    );
    expect(v).toBeDefined();
    expect(v!.rowIds).toContain("cv1");
  });

  it("canon_application_items pointing at a deleted proposal is detected", () => {
    const state = coherentState();
    state["canon_proposals"] = []; // Proposal deleted, item still points at it.
    const report = verifyCrossDomainCoherence(state);
    expect(report.coherent).toBe(false);
    const v = report.violations.find(
      (x) =>
        x.predicate === "P5_MANUSCRIPT_COHERENCE" &&
        x.tables[0] === "canon_application_items" &&
        x.tables[1] === "canon_proposals",
    );
    expect(v).toBeDefined();
    expect(v!.tables).toEqual(["canon_application_items", "canon_proposals"]);
    expect(v!.rowIds).toContain("cai1");
  });
});

// ---------------------------------------------------------------------------
// P1 — Rewind fidelity
// ---------------------------------------------------------------------------

describe("P1_REWIND_FIDELITY", () => {
  it("skipped when no payload is provided (preview mode)", () => {
    const report = verifyCrossDomainCoherence(coherentState());
    const p1 = report.violations.filter((x) => x.predicate === "P1_REWIND_FIDELITY");
    expect(p1).toEqual([]);
  });

  it("identical payload and state passes", () => {
    const state = coherentState();
    const payload: Record<string, Record<string, unknown>[]> = {
      canon_facts: state["canon_facts"] ?? [],
      characters: state["characters"] ?? [],
    };
    const report = verifyCrossDomainCoherence(state, { payload });
    const p1 = report.violations.filter((x) => x.predicate === "P1_REWIND_FIDELITY");
    expect(p1).toEqual([]);
  });

  it("divergent field is detected", () => {
    const state = coherentState();
    const payload: Record<string, Record<string, unknown>[]> = {
      canon_facts: [row("cf1", { novel_id: "n1", entity_id: "se1", statement: "old" })],
    };
    // Live has a different statement.
    state["canon_facts"] = [row("cf1", { novel_id: "n1", entity_id: "se1", statement: "new" })];
    const report = verifyCrossDomainCoherence(state, { payload });
    expect(report.coherent).toBe(false);
    const v = report.violations.find((x) => x.predicate === "P1_REWIND_FIDELITY");
    expect(v).toBeDefined();
    expect(v!.rowIds).toContain("cf1");
    expect(v!.detail).toContain("statement");
  });

  it("missing live row is detected", () => {
    const state = coherentState();
    const payload: Record<string, Record<string, unknown>[]> = {
      canon_facts: [row("cf1", { novel_id: "n1" }), row("cf2", { novel_id: "n1" })],
    };
    const report = verifyCrossDomainCoherence(state, { payload });
    const v = report.violations.find(
      (x) => x.predicate === "P1_REWIND_FIDELITY" && x.detail.includes("missing from live"),
    );
    expect(v).toBeDefined();
    expect(v!.rowIds).toContain("cf2");
  });

  it("extra live row is detected", () => {
    const state = coherentState();
    state["canon_facts"] = [
      row("cf1", { novel_id: "n1", entity_id: "se1" }),
      row("cf-extra", { novel_id: "n1" }),
    ];
    const payload: Record<string, Record<string, unknown>[]> = {
      canon_facts: [row("cf1", { novel_id: "n1", entity_id: "se1" })],
    };
    const report = verifyCrossDomainCoherence(state, { payload });
    const v = report.violations.find(
      (x) => x.predicate === "P1_REWIND_FIDELITY" && x.detail.includes("absent from snapshot"),
    );
    expect(v).toBeDefined();
    expect(v!.rowIds).toContain("cf-extra");
  });
});

// ---------------------------------------------------------------------------
// P6 — Derived-state honesty
// ---------------------------------------------------------------------------

describe("P6_DERIVED_STATE_HONESTY", () => {
  it("skipped when revisionNumber is not provided", () => {
    const report = verifyCrossDomainCoherence(coherentState());
    const p6 = report.violations.filter((x) => x.predicate === "P6_DERIVED_STATE_HONESTY");
    expect(p6).toEqual([]);
  });

  it("projection pinned at or before R is honest", () => {
    const state = coherentState();
    const report = verifyCrossDomainCoherence(state, {
      revisionNumber: 5,
      revisionNumbers: { rev1: 5 },
    });
    const p6 = report.violations.filter((x) => x.predicate === "P6_DERIVED_STATE_HONESTY");
    expect(p6).toEqual([]);
  });

  it("projection pinned newer than R is a violation", () => {
    const state = coherentState();
    const report = verifyCrossDomainCoherence(state, {
      revisionNumber: 5,
      revisionNumbers: { rev1: 7 },
    });
    expect(report.coherent).toBe(false);
    const v = report.violations.find((x) => x.predicate === "P6_DERIVED_STATE_HONESTY");
    expect(v).toBeDefined();
    expect(v!.tables).toEqual(["memory_projections"]);
    expect(v!.rowIds).toContain("mp1");
  });
});

// ---------------------------------------------------------------------------
// Determinism and shape
// ---------------------------------------------------------------------------

describe("determinism and shape", () => {
  it("same inputs → byte-identical report", () => {
    const state = coherentState();
    state["canon_proposals"] = [];
    const a = verifyCrossDomainCoherence(state, { revisionNumber: 5 });
    const b = verifyCrossDomainCoherence(state, { revisionNumber: 5 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("violations are sorted deterministically", () => {
    const state = coherentState();
    state["canon_proposals"] = [];
    state["characters"] = [row("c1", { novel_id: "n1", story_entity_id: "se-gone" })];
    const report = verifyCrossDomainCoherence(state);
    const predicates = report.violations.map((v) => v.predicate);
    const sorted = [...predicates].sort();
    expect(predicates).toEqual(sorted);
  });

  it("toCrossDomainConflicts mirrors the report", () => {
    const state = coherentState();
    state["canon_proposals"] = [];
    const report = verifyCrossDomainCoherence(state);
    const conflicts = toCrossDomainConflicts(report);
    expect(conflicts.length).toBe(report.violations.length);
    for (const c of conflicts) {
      expect(c.kind).toBe("COHERENCE_VIOLATION");
      expect(c.predicate).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });

  it("empty state is coherent (no rows, no violations)", () => {
    const report = verifyCrossDomainCoherence({});
    expect(report.coherent).toBe(true);
  });
});
