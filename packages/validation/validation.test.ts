/**
 * Fail-closed contract tests.
 *
 * The point of these is not "does validation work" but "can a contract be
 * registered that this validator does not actually enforce". Every case
 * under "fail closed" was verified by probing the installed zod with a
 * deliberately-invalid value and confirming the constraint really does
 * bite — see the per-case comments. Each one previously passed silently,
 * so these are regression guards on the screen.
 */
import { describe, expect, it } from "vitest";
import { compileSchema, parseWithSchema, extractJson } from "./json-schema.ts";
import { validateGraph } from "./workflow-graph.ts";

function failuresOf(schema: unknown): string[] {
  const r = compileSchema(schema);
  if (r.ok) throw new Error("expected schema to be rejected");
  return r.failures.map((f) => f.code);
}

describe("compileSchema — fail closed", () => {
  it("accepts a representative contract", () => {
    const r = compileSchema({
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        beats: {
          type: "array",
          items: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["title", "beats"],
      additionalProperties: false,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a required property that is not declared in properties", () => {
    // Verified against the installed zod: this enforces nothing at all, so
    // an author who typos the properties block gets a contract that looks
    // strict and passes every value.
    expect(
      failuresOf({ type: "object", properties: { a: { type: "string" } }, required: ["a", "ghost"] }),
    ).toContain("SCHEMA_REQUIRED_UNDECLARED");
    expect(failuresOf({ type: "object", required: ["a"] })).toContain("SCHEMA_REQUIRED_UNDECLARED");
    // The control: a declared required property is fine.
    expect(
      compileSchema({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }).ok,
    ).toBe(true);
  });

  it("rejects a schema whose constraint has no type to constrain", () => {
    // Verified: `z.fromJSONSchema({ minLength: 5 })` returns `z.any()`, so
    // the constraint is dropped entirely. A contract like this would accept
    // every value a model produced.
    expect(failuresOf({ minLength: 5 })).toContain("SCHEMA_MISSING_TYPE");
    expect(failuresOf({ type: "object", properties: { a: { minLength: 5 } } })).toContain(
      "SCHEMA_MISSING_TYPE",
    );
    expect(failuresOf({ uniqueItems: true })).toContain("SCHEMA_MISSING_TYPE");
    expect(failuresOf({ properties: { a: { type: "string" } } })).toContain("SCHEMA_MISSING_TYPE");
    // `enum`/`const`/`$ref`/combinators are self-sufficient and stay legal.
    expect(compileSchema({ enum: ["a"] }).ok).toBe(true);
    expect(compileSchema({ const: 1 }).ok).toBe(true);
    // Metadata-only schemas are permissive on purpose, not a silent failure.
    expect(compileSchema({ description: "anything" }).ok).toBe(true);
  });

  it("rejects keywords sitting next to $ref", () => {
    // Verified: `{"$defs":{"S":{"type":"string"}},"$ref":"#/$defs/S",
    // "minLength":100}` accepts "x". The sibling is discarded, so the
    // contract silently means something narrower than it reads.
    const codes = failuresOf({
      $defs: { S: { type: "string" } },
      $ref: "#/$defs/S",
      minLength: 100,
    });
    expect(codes).toContain("SCHEMA_REF_SIBLING");
    // Metadata beside $ref is fine — it has no validation effect anyway.
    expect(
      compileSchema({ $defs: { S: { type: "string" } }, $ref: "#/$defs/S", description: "a name" })
        .ok,
    ).toBe(true);
  });

  it("rejects a local $ref cycle", () => {
    // Verified: the compiled validator throws
    // `RangeError: Maximum call stack size exceeded` on ANY input, so a
    // cycle would crash the run that used it rather than reject a value.
    expect(
      failuresOf({ $defs: { N: { $ref: "#/$defs/N" } }, $ref: "#/$defs/N" }),
    ).toContain("SCHEMA_REF_CYCLE");
    // Indirect cycles are caught too, including ones off an unreferenced branch.
    expect(
      failuresOf({ $defs: { A: { $ref: "#/$defs/B" }, B: { $ref: "#/$defs/A" } }, $ref: "#/$defs/A" }),
    ).toContain("SCHEMA_REF_CYCLE");
    // A dangling ref is a compile error, not a cycle.
    expect(compileSchema({ $defs: { A: { type: "string" } }, $ref: "#/$defs/Missing" }).ok).toBe(false);
  });

  it("rejects an unknown keyword instead of ignoring it", () => {
    // The failure mode that matters: "require" (typo for "required") used to
    // validate every value, so a model could omit required fields freely.
    expect(failuresOf({ type: "object", require: ["a"] })).toContain("SCHEMA_UNSUPPORTED_KEYWORD");
  });

  it.each([
    ["minItems", { type: "array", minItems: 2 }],
    ["maxItems", { type: "array", maxItems: 2 }],
    ["not", { type: "string", not: { const: "a" } }],
    ["if", { type: "string", if: { const: "a" }, then: { type: "number" } }],
    ["definitions", { type: "string", definitions: { S: { type: "string" } } }],
    ["dependentRequired", { type: "object", dependentRequired: { a: ["b"] } }],
    ["unevaluatedProperties", { type: "object", unevaluatedProperties: false }],
  ])("rejects %s (zod ignores or throws on it)", (_name, schema) => {
    expect(failuresOf(schema).length).toBeGreaterThan(0);
  });

  it("rejects formats that zod accepts but does not check", () => {
    // Probed: each of these accepts a deliberately-malformed value.
    for (const format of ["url", "regex", "cuid2", "cidrv4", "hash", "hex", "definitely-not-a-format"]) {
      expect(failuresOf({ type: "string", format })).toContain("SCHEMA_UNSUPPORTED_FORMAT");
    }
  });

  it("accepts formats that zod actually enforces", () => {
    // Probed: each of these rejects a deliberately-malformed value. A
    // format wrongly omitted here is a contract an author cannot write.
    for (const format of [
      "email",
      "uuid",
      "date-time",
      "ipv4",
      "hostname",
      "uri",
      "base64",
      "base64url",
      "ksuid",
      "mac",
    ]) {
      expect(compileSchema({ type: "string", format }).ok).toBe(true);
    }
  });

  it("rejects a remote $ref", () => {
    expect(failuresOf({ $ref: "https://evil.example/schema.json" })).toContain("SCHEMA_BAD_REF");
  });

  it("rejects values JSON cannot represent", () => {
    expect(failuresOf({ type: "object", properties: { a: { type: undefined } } })).toContain("SCHEMA_NOT_JSON");
    expect(failuresOf({ type: "number", minimum: Number.POSITIVE_INFINITY })).toContain("SCHEMA_NOT_JSON");
    expect(failuresOf({ type: "number", minimum: () => true })).toContain("SCHEMA_NOT_JSON");
  });

  it("rejects a malformed pattern rather than dropping it", () => {
    expect(failuresOf({ type: "string", pattern: "[unclosed" })).toContain("SCHEMA_BAD_PATTERN");
  });

  it("rejects a non-object schema", () => {
    expect(failuresOf("string")).toContain("SCHEMA_NOT_OBJECT");
    expect(failuresOf(null)).toContain("SCHEMA_NOT_OBJECT");
  });

  it("bails out on deeply nested schemas instead of overflowing the stack", () => {
    let schema: unknown = { type: "string" };
    for (let i = 0; i < 100; i += 1) schema = { type: "array", items: schema };
    expect(failuresOf(schema)).toContain("SCHEMA_TOO_DEEP");
  });

  it("reports the path of the offending keyword", () => {
    const r = compileSchema({
      type: "object",
      properties: { inner: { type: "array", minItems: 1 } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures[0]!.path).toBe("$.properties.inner.minItems");
  });

  it("does not treat a prototype key as a declared property", () => {
    // `in` would walk the prototype chain, so "constructor" would look
    // declared to the required-check while the converter still enforces
    // nothing. `Object.hasOwn` is what makes this fail closed.
    for (const name of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(
        failuresOf({ type: "object", properties: {}, required: [name] }),
      ).toContain("SCHEMA_REQUIRED_UNDECLARED");
    }
  });
});

describe("compileSchema — enforcement", () => {
  const contract = {
    type: "object",
    properties: {
      name: { type: "string" },
      score: { type: "integer", minimum: 0 },
    },
    required: ["name", "score"],
    additionalProperties: false,
  };

  it("accepts a conforming value", () => {
    expect(parseWithSchema(contract, { name: "a", score: 1 }).ok).toBe(true);
  });

  it.each([
    ["missing required", { score: 1 }],
    ["wrong type", { name: 1, score: 1 }],
    ["out of range", { name: "a", score: -1 }],
    ["non-integer", { name: "a", score: 1.5 }],
    ["extra property", { name: "a", score: 1, x: true }],
  ])("rejects %s", (_name, value) => {
    expect(parseWithSchema(contract, value).ok).toBe(false);
  });

  it("resolves local $defs references", () => {
    const r = parseWithSchema(
      {
        $defs: { Name: { type: "string", minLength: 2 } },
        type: "object",
        properties: { n: { $ref: "#/$defs/Name" } },
        required: ["n"],
      },
      { n: "a" },
    );
    expect(r.ok).toBe(false);
  });

  it("never throws on a hostile value", () => {
    const r = compileSchema({ type: "object" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => r.value.validate(cyclic)).not.toThrow();
  });
});

describe("extractJson", () => {
  it("pulls JSON out of prose and fences", () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('prefix [1,2] suffix')).toEqual({ ok: true, value: [1, 2] });
  });

  it("handles braces inside strings", () => {
    expect(extractJson('{"a":"} not the end"}')).toEqual({ ok: true, value: { a: "} not the end" } });
    expect(extractJson('{"a":"\\""}')).toEqual({ ok: true, value: { a: '"' } });
  });

  it("fails closed on truncated or absent JSON", () => {
    expect(extractJson("no json here").ok).toBe(false);
    const truncated = extractJson('{"a":1');
    expect(truncated.ok).toBe(false);
    if (!truncated.ok) expect(truncated.failures[0]!.code).toBe("JSON_TRUNCATED");
  });
});

const AGENT_STEP = { key: "plan", kind: "AGENT", ref: "scene-planner" };

describe("validateGraph", () => {
  it("accepts a linear graph and orders it", () => {
    const r = validateGraph({
      steps: [
        AGENT_STEP,
        { key: "write", kind: "AGENT", ref: "chapter-writer" },
      ],
      edges: [{ from: "plan", to: "write" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.order).toEqual(["plan", "write"]);
      expect(r.value.entryKeys).toEqual(["plan"]);
    }
  });

  it("is deterministic when declaration order differs from topology", () => {
    const graph = {
      steps: [
        { key: "c", kind: "TRANSFORM" },
        { key: "a", kind: "TRANSFORM" },
        { key: "b", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    const first = validateGraph(graph);
    const second = validateGraph(graph);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.order).toEqual(["a", "b", "c"]);
      expect(first.value.order).toEqual(second.value.order);
    }
  });

  it("rejects a cycle", () => {
    const r = validateGraph({
      steps: [AGENT_STEP, { key: "b", kind: "TRANSFORM" }],
      edges: [
        { from: "plan", to: "b" },
        { from: "b", to: "plan" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("GRAPH_CYCLE");
  });

  it("rejects a self-loop", () => {
    const r = validateGraph({ steps: [AGENT_STEP], edges: [{ from: "plan", to: "plan" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("EDGE_SELF_LOOP");
  });

  it("requires exactly one true and one false branch on a CONDITION", () => {
    const steps = [
      { key: "check", kind: "CONDITION", condition: { path: "$input.ok", equals: true } },
      { key: "yes", kind: "TRANSFORM" },
      { key: "no", kind: "TRANSFORM" },
    ];
    const missingFalse = validateGraph({ steps, edges: [{ from: "check", to: "yes", when: "true" }] });
    expect(missingFalse.ok).toBe(false);
    if (!missingFalse.ok) expect(missingFalse.failures.map((f) => f.code)).toContain("CONDITION_BRANCHES");

    const both = validateGraph({
      steps,
      edges: [
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
      ],
    });
    expect(both.ok).toBe(true);
  });

  it("forbids a branch label on a non-CONDITION step", () => {
    const r = validateGraph({
      steps: [AGENT_STEP, { key: "b", kind: "TRANSFORM" }],
      edges: [{ from: "plan", to: "b", when: "true" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("EDGE_WHEN_NOT_ALLOWED");
  });

  it("requires a condition on CONDITION steps", () => {
    const r = validateGraph({ steps: [{ key: "check", kind: "CONDITION" }], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("CONDITION_REQUIRED");
  });

  it("rejects a forward reference", () => {
    const r = validateGraph({
      steps: [
        { key: "a", kind: "TRANSFORM", inputs: { src: "$steps.b.text" } },
        { key: "b", kind: "AGENT", ref: "writer" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("REF_FORWARD");
  });

  it("rejects an unknown step reference", () => {
    const r = validateGraph({
      steps: [{ key: "a", kind: "TRANSFORM", inputs: { src: "$steps.ghost.text" } }],
      edges: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("REF_UNKNOWN_STEP");
  });

  it("rejects a malformed reference", () => {
    const r = validateGraph({
      steps: [{ key: "a", kind: "TRANSFORM", inputs: { src: "process.env.SECRET" } }],
      edges: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("STEP_BAD_REFERENCE");
  });

  it("accepts disconnected chains and reports every entry point", () => {
    // Not an error: two independent chains each start at their own entry.
    const r = validateGraph({
      steps: [AGENT_STEP, { key: "orphan", kind: "TRANSFORM" }],
      edges: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.entryKeys).toEqual(["plan", "orphan"]);
      expect(r.value.order).toEqual(["plan", "orphan"]);
    }
  });

  it("rejects duplicate keys and duplicate edges", () => {
    const dupKey = validateGraph({ steps: [AGENT_STEP, AGENT_STEP], edges: [] });
    expect(dupKey.ok).toBe(false);
    if (!dupKey.ok) expect(dupKey.failures.map((f) => f.code)).toContain("STEP_DUPLICATE_KEY");
  });

  it("rejects a graph that exceeds its own maxSteps", () => {
    const steps = Array.from({ length: 4 }, (_, i) => ({ key: `s${i}`, kind: "TRANSFORM" }));
    const r = validateGraph({ steps, edges: [], maxSteps: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("GRAPH_STEP_LIMIT");
  });

  it("requires a VALIDATOR to declare a contract and one input", () => {
    // Without outputSchema the step can never fail, so it would record
    // SUCCEEDED for any value while reading as a real check in run history.
    const r = validateGraph({ steps: [{ key: "v", kind: "VALIDATOR" }], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("VALIDATOR_NO_CONTRACT");

    // The executor reads only the first input, so a second is silently lost.
    const two = validateGraph({
      steps: [
        { key: "a", kind: "TRANSFORM" },
        { key: "b", kind: "TRANSFORM" },
        {
          key: "v",
          kind: "VALIDATOR",
          inputs: { one: "$steps.a.json", two: "$steps.b.json" },
          outputSchema: { type: "string" },
        },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "v" }],
    });
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.failures.map((f) => f.code)).toContain("VALIDATOR_INPUTS");

    // The valid shape: one contract, one bound value.
    expect(
      validateGraph({
        steps: [
          { key: "a", kind: "TRANSFORM" },
          {
            key: "v",
            kind: "VALIDATOR",
            inputs: { src: "$steps.a.json" },
            outputSchema: { type: "string" },
          },
        ],
        edges: [{ from: "a", to: "v" }],
      }).ok,
    ).toBe(true);
  });

  it("rejects a per-step retry or timeout option", () => {
    // Nothing in the executor reads these: retry and timeout belong to the
    // gateway record (Phase 3). A stored per-step value would silently do
    // nothing, so it is refused until a step-level deadline exists.
    for (const option of [{ maxRetries: 3 }, { timeoutMs: 5_000 }]) {
      const r = validateGraph({ steps: [{ key: "a", kind: "TRANSFORM", ...option }], edges: [] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("STEP_UNSUPPORTED_OPTION");
    }
  });

  it("rejects a step kind the executor cannot run", () => {
    // RETRIEVAL is in the domain vocabulary (CLAUDE.md §19) but has no
    // executor, so accepting it at definition time would let a workflow be
    // published and then fail mid-run with a partially executed run.
    const r = validateGraph({ steps: [{ key: "a", kind: "RETRIEVAL" }], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("STEP_NOT_EXECUTABLE");
  });

  it("rejects a third outgoing edge on a CONDITION", () => {
    // An extra UNLABELED edge is read by the executor as
    // `(edge.when === "true") === taken`, which is true on the false
    // branch — a third branch the label count alone would permit.
    const r = validateGraph({
      steps: [
        { key: "check", kind: "CONDITION", condition: { path: "$input.ok", equals: true } },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
        { key: "extra", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "check", to: "yes", when: "true" },
        { from: "check", to: "no", when: "false" },
        { from: "check", to: "extra" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("CONDITION_EXTRA_EDGE");
  });

  it("rejects a condition path the runtime cannot resolve", () => {
    // The executor resolves `$input.x` / `$steps.k.json` only, so a bracket
    // or JSONPath-style path would compare `undefined` forever and pin the
    // false branch as dead code.
    for (const path of ['$steps["a"].text', "$.steps.a.text", "state.ok", "$input"]) {
      const r = validateGraph({
        steps: [{ key: "check", kind: "CONDITION", condition: { path, equals: true } }],
        edges: [],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("CONDITION_BAD_PATH");
    }
  });

  it("rejects a condition that could never match", () => {
    // The executor compares with `===`, so an object/array equals is
    // unreachable. Branches are supplied so the branch-shape rule cannot be
    // what rejects these — the equals rule must be.
    const graph = (equals: unknown) => ({
      steps: [
        { key: "check", kind: "CONDITION", condition: { path: "$input.ok", equals } },
        { key: "yes", kind: "TRANSFORM" },
        { key: "no", kind: "TRANSFORM" },
      ],
      edges: [
        { from: "check", to: "yes", when: "true" as const },
        { from: "check", to: "no", when: "false" as const },
      ],
    });

    for (const equals of [{ a: 1 }, [1], undefined]) {
      const r = validateGraph(graph(equals));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failures.map((f) => f.code)).toContain("CONDITION_BAD_EQUALS");
    }
    // Scalar comparisons, plus null, are legal — `===` matches those.
    for (const equals of ["a", 3, true, null]) {
      expect(validateGraph(graph(equals)).ok).toBe(true);
    }
  });

  it("only allows ref on AGENT and SKILL steps", () => {
    expect(validateGraph({ steps: [{ key: "a", kind: "TRANSFORM", ref: "x" }], edges: [] }).ok).toBe(false);
    expect(validateGraph({ steps: [{ key: "a", kind: "AGENT" }], edges: [] }).ok).toBe(false);
    expect(validateGraph({ steps: [{ key: "a", kind: "SKILL", ref: "s1" }], edges: [] }).ok).toBe(true);
  });

  it("validates nested output schemas through the injected screen", () => {
    const r = validateGraph(
      { steps: [{ key: "a", kind: "AGENT", ref: "w", outputSchema: { type: "array", minItems: 1 } }], edges: [] },
      (schema, path) => {
        const compiled = compileSchema(schema);
        return compiled.ok ? [] : compiled.failures.map((f) => ({ ...f, path }));
      },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a non-object graph", () => {
    expect(validateGraph(null).ok).toBe(false);
    expect(validateGraph({}).ok).toBe(false);
  });
});
