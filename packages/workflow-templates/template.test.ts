/**
 * @novelforge/workflow-templates tests (NF-WF-006).
 *
 * Guards the template source: the graph validates, the schemas compile,
 * every VALIDATOR re-checks its AGENT step's contract, and the agent specs
 * resolve. If the graph rots, this suite fails the build.
 */
import { describe, expect, it } from "vitest";
import { validateGraph, compileSchema } from "@novelforge/validation";
import { CHAPTER_GENERATION_REVIEW, graphsEqual, canonicalizeJson, parseAgentFile } from "./index.ts";

const graph = CHAPTER_GENERATION_REVIEW.graph as {
  steps: Array<{
    key: string;
    kind: string;
    ref?: string;
    inputs?: Record<string, string>;
    outputSchema?: unknown;
    condition?: { path: string; equals: unknown };
  }>;
  edges: Array<{ from: string; to: string; when?: string }>;
  maxSteps: number;
};

describe("chapter generation/review template", () => {
  it("parses equivalent LF, CRLF and CR templates without relaxing required fields", () => {
    const source = "---\nkey: planner\nname: Planner\nmodelProfile: reasoning\n---\nFirst line.\nSecond line.\n";
    const expected = { key: "planner", name: "Planner", modelProfile: "reasoning", instructions: "First line.\nSecond line." };
    for (const ending of ["\n", "\r\n", "\r"]) {
      expect(parseAgentFile(source.replace(/\n/g, ending), "planner.md")).toEqual(expected);
      expect(() => parseAgentFile(source.replace("modelProfile: reasoning\n", "").replace(/\n/g, ending), "planner.md")).toThrow("must define");
      expect(() => parseAgentFile("key: planner" + ending, "planner.md")).toThrow("missing frontmatter");
    }
  });
  it("has the expected identity", () => {
    expect(CHAPTER_GENERATION_REVIEW.key).toBe("chapter-generation-review");
    expect(graph.steps).toHaveLength(20);
    expect(graph.maxSteps).toBe(40);
  });

  it("passes validateGraph (the graph cannot rot)", () => {
    const r = validateGraph(graph);
    expect(r.ok).toBe(true);
  });

  it("compiles all four output schemas", () => {
    for (const name of ["plan-schema", "draft-schema", "findings-schema", "extraction-schema"]) {
      const compiled = compileSchema(CHAPTER_GENERATION_REVIEW.schemas[name]);
      expect(compiled.ok).toBe(true);
    }
  });

  it("gives every AGENT step an outputSchema and a VALIDATOR that re-checks it", () => {
    const agentSteps = graph.steps.filter((s) => s.kind === "AGENT");
    expect(agentSteps.length).toBeGreaterThan(0);
    for (const agent of agentSteps) {
      expect(agent.outputSchema, `${agent.key} outputSchema`).toBeDefined();
      expect(agent.ref, `${agent.key} ref`).toBeDefined();
      // A VALIDATOR step whose first input references this agent's .json
      // and whose outputSchema deep-equals the agent's contract.
      const checker = graph.steps.find(
        (s) =>
          s.kind === "VALIDATOR" &&
          Object.values(s.inputs ?? {})[0] === `$steps.${agent.key}.json`,
      );
      expect(checker, `VALIDATOR for ${agent.key}`).toBeDefined();
      expect(JSON.stringify(checker!.outputSchema)).toBe(JSON.stringify(agent.outputSchema));
    }
  });

  it("branches correction on the extended nested condition paths", () => {
    const byKey = new Map(graph.steps.map((s) => [s.key, s]));
    expect(byKey.get("correct_1")!.condition).toEqual({
      path: "$steps.review_vs.json.needsCorrection",
      equals: true,
    });
    expect(byKey.get("correct_2")!.condition).toEqual({
      path: "$steps.review_1.json.needsCorrection",
      equals: true,
    });
    // CONDITION edges are labeled exactly "true"/"false".
    for (const key of ["correct_1", "correct_2"]) {
      const outs = graph.edges.filter((e) => e.from === key);
      expect(outs.map((e) => e.when).sort()).toEqual(["false", "true"]);
    }
  });

  it("exposes exactly two correction attempts (structural bound)", () => {
    const rewrites = graph.steps.filter((s) => s.key.startsWith("rewrite_"));
    expect(rewrites.map((s) => s.key).sort()).toEqual(["rewrite_1", "rewrite_2"]);
  });

  it("resolves all five agent specs", () => {
    const agents = CHAPTER_GENERATION_REVIEW.agents;
    expect(agents.map((a) => a.key).sort()).toEqual(
      [
        "chapter-extractor",
        "chapter-planner",
        "chapter-writer",
        "final-reviewer",
        "voice-style-reviewer",
      ].sort(),
    );
    for (const a of agents) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.modelProfile.length).toBeGreaterThan(0);
      expect(a.instructions.length).toBeGreaterThan(200);
    }
    const profiles = new Map(agents.map((a) => [a.key, a.modelProfile]));
    expect(profiles.get("chapter-planner")).toBe("DEEP_PLANNER");
    expect(profiles.get("chapter-writer")).toBe("CREATIVE_WRITER");
    expect(profiles.get("voice-style-reviewer")).toBe("CONTINUITY_REVIEWER");
    expect(profiles.get("final-reviewer")).toBe("LONG_CONTEXT_REVIEWER");
    expect(profiles.get("chapter-extractor")).toBe("STRUCTURED_EXTRACTOR");
  });

  it("compares graphs by canonical-JSON byte equality", () => {
    expect(graphsEqual(graph, JSON.parse(JSON.stringify(graph)))).toBe(true);
    const changed = JSON.parse(JSON.stringify(graph)) as typeof graph;
    changed.maxSteps = 41;
    expect(graphsEqual(graph, changed)).toBe(false);
  });

  it("canonicalizes independent of key order (byte format pinned)", () => {
    // Same algorithm as NF-WF-005's snapshot.ts canonicalizeJson; the
    // exact string pins the byte format the seed script compares.
    const a = { z: 1, a: { y: 2, b: 3 }, arr: [{ d: 4, c: 5 }] };
    const b = { a: { b: 3, y: 2 }, arr: [{ c: 5, d: 4 }], z: 1 };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
    expect(canonicalizeJson(a)).toBe('{"a":{"b":3,"y":2},"arr":[{"c":5,"d":4}],"z":1}');
  });
});
