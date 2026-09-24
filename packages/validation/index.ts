/**
 * @novelforge/validation — fail-closed contracts (Phase 4).
 *
 * Two jobs, both pure and dependency-light:
 * - structured-output contracts for AI steps (JSON Schema subset);
 * - workflow graph contracts (acyclic, deterministic, bounded).
 *
 * Both fail closed: an unrecognised constraint is a rejection, never a
 * silently ignored rule. See json-schema.ts for the verified keyword set.
 */
export {
  compileSchema,
  parseWithSchema,
  extractJson,
  type SchemaValidator,
} from "./json-schema.ts";

export {
  validateGraph,
  STEP_KINDS,
  EXECUTABLE_STEP_KINDS,
  DEFAULT_MAX_STEPS,
  MAX_MAX_STEPS,
  ABSOLUTE_STEP_CEILING,
  type StepKind,
  type WorkflowStep,
  type WorkflowEdge,
  type WorkflowGraph,
  type ValidatedGraph,
} from "./workflow-graph.ts";

export {
  fail,
  at,
  type ValidationFailure,
  type ValidationResult,
} from "./failure.ts";
