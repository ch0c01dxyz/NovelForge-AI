/**
 * Workflow graph contract (Phase 4).
 *
 * A workflow is a directed acyclic graph of steps. The graph is validated
 * before it can be stored, so an unrunnable or non-deterministic workflow
 * cannot reach the executor (CLAUDE.md §19: validate graphs, prevent
 * invalid cycles, enforce execution limits, never permit an unbounded loop).
 *
 * Determinism is structural, not a runtime hope:
 * - cycles are rejected, so every run terminates;
 * - the execution order is a topological sort with declaration order as the
 *   tie-break, so the same graph always runs in the same sequence;
 * - a CONDITION step must declare exactly one "true" and one "false"
 *   outgoing edge, so branching is explicit and not order-dependent;
 * - references may only point at steps that run earlier, so a step can
 *   never read a result that has not been produced yet.
 */
import { at, type ValidationFailure, type ValidationResult } from "./failure.ts";

/** Step kinds from CLAUDE.md §19. */
export const STEP_KINDS = [
  "AGENT",
  "SKILL",
  "RETRIEVAL",
  "CONDITION",
  "TRANSFORM",
  "VALIDATOR",
  "HUMAN_APPROVAL",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/**
 * Kinds the executor can run. The `STEP_NOT_EXECUTABLE` check in
 * `validateGraph` consults this, so adding a kind to `STEP_KINDS` without
 * an executor fails at definition time rather than mid-run. Every kind
 * currently declared has an executor, so the check is dormant today — it
 * exists for the next kind.
 */
export const EXECUTABLE_STEP_KINDS: ReadonlySet<StepKind> = new Set([
  "AGENT",
  "SKILL",
  // Phase 5: a retrieval step searches the workspace's reference index and
  // passes the citations to later steps.
  "RETRIEVAL",
  "CONDITION",
  "TRANSFORM",
  "VALIDATOR",
  "HUMAN_APPROVAL",
]);

export interface WorkflowEdge {
  from: string;
  to: string;
  /**
   * Branch label. Required to be exactly "true"/"false" on edges leaving a
   * CONDITION step, and forbidden everywhere else.
   */
  when?: "true" | "false";
}

export interface WorkflowStep {
  /** Unique within the workflow; referenced by edges and expressions. */
  key: string;
  kind: StepKind;
  /** Agent key for AGENT steps; skill key for SKILL steps. */
  ref?: string;
  /** Human/model instruction for this step. */
  instruction?: string;
  /**
   * Values bound into the step, as `$input.<name>` or `$steps.<key>.text`
   * / `$steps.<key>.json`. Only earlier steps may be referenced.
   */
  inputs?: Record<string, string>;
  /** Condition predicate for CONDITION steps. */
  condition?: { path: string; equals: unknown };
  /** JSON Schema contract for this step's structured output. */
  outputSchema?: unknown;
}

export interface WorkflowGraph {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  /** Hard ceiling on steps executed in one run. */
  maxSteps: number;
}

export const DEFAULT_MAX_STEPS = 100;
export const MAX_MAX_STEPS = 1000;

/** Hard cap regardless of declared maxSteps — a run can never exceed this. */
export const ABSOLUTE_STEP_CEILING = 1000;

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `$input.name` or `$steps.key.text` / `$steps.key.json` */
const REFERENCE_PATTERN = /^\$(input\.[a-z0-9_-]{1,64}|steps\.[a-z0-9_-]{1,64}\.(text|json))$/;

/**
 * The same reference grammar, anchored for a condition path. Bracket and
 * dot-prefixed variants (`$steps["x"].text`, `$.steps.x.text`) are NOT
 * matched by the runtime resolver, so accepting them here would register a
 * condition that silently compares `undefined` forever.
 */
const CONDITION_PATH_PATTERN = REFERENCE_PATTERN;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ValidatedGraph {
  graph: WorkflowGraph;
  /** Deterministic execution order (topological, declaration-order tie-break). */
  order: string[];
  /** Steps with no incoming edge, in declaration order. */
  entryKeys: string[];
}

/**
 * Validate a workflow graph and compute its execution order.
 *
 * `compileSchema` is injected rather than imported so this module stays a
 * pure graph concern and the JSON-Schema screen can be swapped or faked.
 */
export function validateGraph(
  input: unknown,
  screenSchema?: (schema: unknown, path: string) => ValidationFailure[],
): ValidationResult<ValidatedGraph> {
  const failures: ValidationFailure[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, failures: [{ path: "$", code: "GRAPH_NOT_OBJECT", message: "graph must be an object" }] };
  }

  const rawSteps = input["steps"];
  const rawEdges = input["edges"];
  const rawMaxSteps = input["maxSteps"];

  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    failures.push({ path: "$.steps", code: "GRAPH_NO_STEPS", message: "graph must declare at least one step" });
    return { ok: false, failures };
  }

  let maxSteps: number;
  if (rawMaxSteps === undefined) {
    maxSteps = DEFAULT_MAX_STEPS;
  } else if (typeof rawMaxSteps !== "number" || !Number.isInteger(rawMaxSteps) || rawMaxSteps < 1 || rawMaxSteps > MAX_MAX_STEPS) {
    failures.push({
      path: "$.maxSteps",
      code: "GRAPH_BAD_MAX_STEPS",
      message: `maxSteps must be an integer between 1 and ${MAX_MAX_STEPS}`,
    });
    return { ok: false, failures };
  } else {
    maxSteps = rawMaxSteps;
  }

  // ---- steps ----
  const steps: WorkflowStep[] = [];
  const seenKeys = new Set<string>();
  const indexOf = new Map<string, number>();

  rawSteps.forEach((raw, i) => {
    const path = at("$.steps", i);
    if (!isPlainObject(raw)) {
      failures.push({ path, code: "STEP_NOT_OBJECT", message: "step must be an object" });
      return;
    }
    const key = raw["key"];
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
      failures.push({
        path: at(path, "key"),
        code: "STEP_BAD_KEY",
        message: "step key must be 1-64 chars of [a-z0-9_-] starting alphanumeric",
      });
      return;
    }
    if (seenKeys.has(key)) {
      failures.push({ path: at(path, "key"), code: "STEP_DUPLICATE_KEY", message: `duplicate step key "${key}"` });
      return;
    }
    seenKeys.add(key);
    indexOf.set(key, i);

    const kind = raw["kind"];
    if (typeof kind !== "string" || !(STEP_KINDS as readonly string[]).includes(kind)) {
      failures.push({
        path: at(path, "kind"),
        code: "STEP_BAD_KIND",
        message: `kind must be one of: ${STEP_KINDS.join(", ")}`,
      });
      return;
    }
    // Reject a kind the executor cannot run, at definition time. Accepting
    // it here would let a workflow be created and published, then fail
    // mid-run with the run already partially executed.
    if (!EXECUTABLE_STEP_KINDS.has(kind as StepKind)) {
      failures.push({
        path: at(path, "kind"),
        code: "STEP_NOT_EXECUTABLE",
        message: `step kind ${kind} is not executable yet`,
      });
      return;
    }

    const step: WorkflowStep = { key, kind: kind as StepKind };

    const ref = raw["ref"];
    if (ref !== undefined) {
      if (typeof ref !== "string" || ref.length === 0 || ref.length > 120) {
        failures.push({ path: at(path, "ref"), code: "STEP_BAD_REF", message: "ref must be a non-empty string" });
      } else if (kind === "AGENT" || kind === "SKILL") {
        step.ref = ref;
      } else {
        failures.push({
          path: at(path, "ref"),
          code: "STEP_REF_NOT_ALLOWED",
          message: `ref is only meaningful on AGENT and SKILL steps, not ${kind}`,
        });
      }
    }
    if ((kind === "AGENT" || kind === "SKILL") && step.ref === undefined) {
      failures.push({ path: at(path, "ref"), code: "STEP_REF_REQUIRED", message: `${kind} steps must name a ref` });
    }

    const instruction = raw["instruction"];
    if (instruction !== undefined) {
      if (typeof instruction !== "string" || instruction.trim().length === 0 || instruction.length > 20_000) {
        failures.push({
          path: at(path, "instruction"),
          code: "STEP_BAD_INSTRUCTION",
          message: "instruction must be a non-empty string of at most 20000 chars",
        });
      } else {
        step.instruction = instruction;
      }
    }

    const inputs = raw["inputs"];
    if (inputs !== undefined) {
      if (!isPlainObject(inputs)) {
        failures.push({ path: at(path, "inputs"), code: "STEP_BAD_INPUTS", message: "inputs must be an object" });
      } else {
        const bound: Record<string, string> = {};
        for (const [name, expr] of Object.entries(inputs)) {
          if (typeof expr !== "string" || !REFERENCE_PATTERN.test(expr)) {
            failures.push({
              path: at(at(path, "inputs"), name),
              code: "STEP_BAD_REFERENCE",
              message: 'reference must look like "$input.name" or "$steps.key.text" / "$steps.key.json"',
            });
            continue;
          }
          bound[name] = expr;
        }
        step.inputs = bound;
      }
    }

    const condition = raw["condition"];
    if (kind === "CONDITION") {
      if (!isPlainObject(condition)) {
        failures.push({
          path: at(path, "condition"),
          code: "CONDITION_REQUIRED",
          message: "CONDITION steps must declare { path, equals }",
        });
      } else {
        const p = condition["path"];
        if (typeof p !== "string" || p.length === 0 || p.length > 200) {
          failures.push({
            path: at(at(path, "condition"), "path"),
            code: "CONDITION_BAD_PATH",
            message: "condition.path must be a non-empty string",
          });
        } else if (!CONDITION_PATH_PATTERN.test(p)) {
          // Only the canonical form is evaluated at runtime, so anything
          // else would silently compare `undefined` and take the false
          // branch forever.
          failures.push({
            path: at(at(path, "condition"), "path"),
            code: "CONDITION_BAD_PATH",
            message:
              'condition.path must be "$input.<name>" or ' +
              '"$steps.<key>.text"/"$steps.<key>.json"',
          });
        } else if (!("equals" in condition)) {
          failures.push({
            path: at(at(path, "condition"), "equals"),
            code: "CONDITION_BAD_EQUALS",
            message: "condition.equals is required (use null to match JSON null)",
          });
        } else if (
          condition["equals"] !== null &&
          typeof condition["equals"] !== "string" &&
          typeof condition["equals"] !== "number" &&
          typeof condition["equals"] !== "boolean"
        ) {
          // The executor compares with `===`, so an object or array could
          // never match and the true branch would be dead code.
          failures.push({
            path: at(at(path, "condition"), "equals"),
            code: "CONDITION_BAD_EQUALS",
            message:
              "condition.equals must be a string, number, boolean or null " +
              "(objects and arrays are compared by identity and can never match)",
          });
        } else {
          step.condition = { path: p, equals: condition["equals"] };
        }
      }
    } else if (condition !== undefined) {
      failures.push({
        path: at(path, "condition"),
        code: "CONDITION_NOT_ALLOWED",
        message: "condition is only allowed on CONDITION steps",
      });
    }

    if (raw["outputSchema"] !== undefined) {
      if (screenSchema) {
        failures.push(...screenSchema(raw["outputSchema"], at(path, "outputSchema")));
      }
      step.outputSchema = raw["outputSchema"];
    }

    // A VALIDATOR is a step whose entire purpose is to reject a bad value.
    // Without a contract it can never fail, so it would record SUCCEEDED for
    // anything and read as a real check in the run history — the exact
    // "silently does nothing" failure this module exists to prevent
    // (CLAUDE.md §19). The executor also reads only the first input, so a
    // second one would be silently ignored; both are rejected here.
    if (kind === "VALIDATOR") {
      if (step.outputSchema === undefined) {
        failures.push({
          path: at(path, "outputSchema"),
          code: "VALIDATOR_NO_CONTRACT",
          message: "a VALIDATOR step must declare outputSchema, or it can never fail",
        });
      }
      const inputCount = Object.keys(step.inputs ?? {}).length;
      if (inputCount !== 1) {
        failures.push({
          path: at(path, "inputs"),
          code: "VALIDATOR_INPUTS",
          message:
            `a VALIDATOR step must bind exactly one input (the value it ` +
            `checks); got ${inputCount}`,
        });
      }
    }

    // A RETRIEVAL step's query is its rendered `instruction` — the same
    // text an AGENT step sends as its user message. Without one there is
    // nothing to search for, and the step would record an empty result set
    // that reads as "the knowledge base has nothing on this", which is the
    // wrong diagnosis.
    if (kind === "RETRIEVAL" && step.instruction === undefined) {
      failures.push({
        path: at(path, "instruction"),
        code: "RETRIEVAL_NO_QUERY",
        message: "a RETRIEVAL step must declare an instruction to use as its query",
      });
    }

    // `maxRetries` and `timeoutMs` are not consumed by the executor: retry
    // and timeout are owned by the gateway record (Phase 3). Accepting them
    // would store a per-step contract that silently does nothing, so they
    // are rejected until a step-level deadline actually exists.
    for (const unsupported of ["maxRetries", "timeoutMs"] as const) {
      if (raw[unsupported] !== undefined) {
        failures.push({
          path: at(path, unsupported),
          code: "STEP_UNSUPPORTED_OPTION",
          message:
            `per-step ${unsupported} is not supported yet; retry and timeout ` +
            `come from the gateway configuration`,
        });
      }
    }

    steps.push(step);
  });

  if (failures.length > 0) return { ok: false, failures };

  // ---- edges ----
  const edges: WorkflowEdge[] = [];
  const seenEdges = new Set<string>();
  const rawEdgeList = rawEdges === undefined ? [] : rawEdges;
  if (!Array.isArray(rawEdgeList)) {
    return { ok: false, failures: [{ path: "$.edges", code: "GRAPH_BAD_EDGES", message: "edges must be an array" }] };
  }

  rawEdgeList.forEach((raw, i) => {
    const path = at("$.edges", i);
    if (!isPlainObject(raw)) {
      failures.push({ path, code: "EDGE_NOT_OBJECT", message: "edge must be an object" });
      return;
    }
    const from = raw["from"];
    const to = raw["to"];
    if (typeof from !== "string" || !seenKeys.has(from)) {
      failures.push({ path: at(path, "from"), code: "EDGE_UNKNOWN_FROM", message: "edge.from must name a declared step" });
      return;
    }
    if (typeof to !== "string" || !seenKeys.has(to)) {
      failures.push({ path: at(path, "to"), code: "EDGE_UNKNOWN_TO", message: "edge.to must name a declared step" });
      return;
    }
    if (from === to) {
      failures.push({ path, code: "EDGE_SELF_LOOP", message: "a step cannot connect to itself" });
      return;
    }
    const id = `${from}->${to}`;
    if (seenEdges.has(id)) {
      failures.push({ path, code: "EDGE_DUPLICATE", message: `duplicate edge ${id}` });
      return;
    }
    seenEdges.add(id);

    const when = raw["when"];
    if (when !== undefined && when !== "true" && when !== "false") {
      failures.push({ path: at(path, "when"), code: "EDGE_BAD_WHEN", message: 'when must be "true" or "false"' });
      return;
    }
    const edge: WorkflowEdge = { from, to };
    if (when === "true" || when === "false") edge.when = when;
    edges.push(edge);
  });

  if (failures.length > 0) return { ok: false, failures };

  // ---- branch shape: conditional edges belong only to CONDITION steps ----
  const outgoing = new Map<string, WorkflowEdge[]>();
  const incoming = new Map<string, WorkflowEdge[]>();
  for (const s of steps) {
    outgoing.set(s.key, []);
    incoming.set(s.key, []);
  }
  for (const e of edges) {
    outgoing.get(e.from)!.push(e);
    incoming.get(e.to)!.push(e);
  }

  for (const step of steps) {
    const outs = outgoing.get(step.key)!;
    if (step.kind === "CONDITION") {
      const labels = outs.map((e) => e.when);
      const trueCount = labels.filter((l) => l === "true").length;
      const falseCount = labels.filter((l) => l === "false").length;
      if (trueCount !== 1 || falseCount !== 1) {
        failures.push({
          path: `$.steps.${step.key}`,
          code: "CONDITION_BRANCHES",
          message:
            'a CONDITION step must have exactly one outgoing edge labeled "true" and one labeled "false"',
        });
      } else if (outs.length !== 2) {
        // An extra UNLABELED edge is evaluated by the executor as
        // `(edge.when === "true") === taken`, which is true on the false
        // branch — a third branch the shape check would otherwise permit.
        failures.push({
          path: `$.steps.${step.key}`,
          code: "CONDITION_EXTRA_EDGE",
          message:
            "a CONDITION step may have exactly two outgoing edges; remove " +
            "the extra one or label it true/false",
        });
      }
    } else if (outs.some((e) => e.when !== undefined)) {
      failures.push({
        path: `$.steps.${step.key}`,
        code: "EDGE_WHEN_NOT_ALLOWED",
        message: "edge.when is only allowed on edges leaving a CONDITION step",
      });
    }
  }

  if (failures.length > 0) return { ok: false, failures };

  // ---- acyclicity + deterministic order (Kahn, declaration-order tie-break) ----
  const indegree = new Map<string, number>();
  for (const s of steps) indegree.set(s.key, incoming.get(s.key)!.length);
  const order: string[] = [];
  const ready = steps.filter((s) => indegree.get(s.key) === 0).map((s) => s.key);
  while (ready.length > 0) {
    // Smallest declaration index wins — the determinism guarantee.
    ready.sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);
    const key = ready.shift()!;
    order.push(key);
    for (const e of outgoing.get(key)!) {
      const next = indegree.get(e.to)! - 1;
      indegree.set(e.to, next);
      if (next === 0) ready.push(e.to);
    }
  }

  if (order.length !== steps.length) {
    const inCycle = steps.filter((s) => !order.includes(s.key)).map((s) => s.key);
    return {
      ok: false,
      failures: [
        {
          path: "$.edges",
          code: "GRAPH_CYCLE",
          message: `workflow contains a cycle through: ${inCycle.join(", ")}`,
        },
      ],
    };
  }

  const positionOf = new Map(order.map((k, i) => [k, i]));

  // ---- references must point backwards (or at run input) ----
  for (const step of steps) {
    for (const [name, expr] of Object.entries(step.inputs ?? {})) {
      const m = /^\$steps\.([a-z0-9_-]{1,64})\.(text|json)$/.exec(expr);
      if (!m) continue;
      const target = m[1]!;
      if (!seenKeys.has(target)) {
        failures.push({
          path: `$.steps.${step.key}.inputs.${name}`,
          code: "REF_UNKNOWN_STEP",
          message: `reference to undeclared step "${target}"`,
        });
      } else if (positionOf.get(target)! >= positionOf.get(step.key)!) {
        failures.push({
          path: `$.steps.${step.key}.inputs.${name}`,
          code: "REF_FORWARD",
          message: `reference to "${target}" must be to a step that runs earlier`,
        });
      }
    }

    if (step.condition) {
      const target = /^\$steps\.([a-z0-9_-]{1,64})\./.exec(step.condition.path);
      if (target) {
        const t = target[1]!;
        if (!seenKeys.has(t)) {
          failures.push({
            path: `$.steps.${step.key}.condition.path`,
            code: "REF_UNKNOWN_STEP",
            message: `condition reads undeclared step "${t}"`,
          });
        } else if (positionOf.get(t)! >= positionOf.get(step.key)!) {
          failures.push({
            path: `$.steps.${step.key}.condition.path`,
            code: "REF_FORWARD",
            message: `condition reads "${t}", which must run earlier`,
          });
        }
      }
    }
  }

  // ---- entry points ----
  // Multiple disconnected chains are valid; each contributes an entry step.
  // No further reachability check is needed: the graph is acyclic by the
  // time we get here, and in a DAG every node reaches an indegree-0 node by
  // walking edges backwards. `order` holding every step is the proof.
  const entryKeys = steps.filter((s) => incoming.get(s.key)!.length === 0).map((s) => s.key);

  // ---- execution limit ----
  if (steps.length > maxSteps) {
    failures.push({
      path: "$.maxSteps",
      code: "GRAPH_STEP_LIMIT",
      message: `graph declares ${steps.length} steps but maxSteps is ${maxSteps}`,
    });
  }

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    value: { graph: { steps, edges, maxSteps }, order, entryKeys },
  };
}
