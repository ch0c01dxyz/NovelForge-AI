/**
 * Structured-output contract validator (Phase 4).
 *
 * Structured AI output is the boundary where a model can silently violate
 * an agreed shape, so the contract must fail closed: a schema is REJECTED
 * at registration if it uses anything this validator does not actually
 * enforce. Silently ignoring a constraint would let a model "satisfy" a
 * contract it broke (CLAUDE.md §2.13 — AI may not silently commit).
 *
 * The conversion itself is `zod.fromJSONSchema` (already a dependency of
 * the workspace); this module owns the fail-closed keyword screen in front
 * of it. Keyword support below was verified empirically against the
 * installed zod, not assumed from documentation:
 *
 *   silently ignored by zod : minItems, maxItems — even alongside
 *                             `type: "array"`, so they cannot be supported
 *   silently accepts unknown formats, including a misspelled one
 *   silently ignores        : a `required` name absent from `properties`,
 *                             and every keyword sitting next to `$ref`
 *   throws on               : not, if/then/else, definitions,
 *                             dependentRequired, unevaluatedProperties
 *   external $ref           : throws ("only local refs (#/...) supported")
 *
 * All of those are therefore rejected here rather than allowed to pass.
 */
import * as z from "zod";
import { at, fail, type ValidationFailure, type ValidationResult } from "./failure.ts";

/** Metadata keywords: accepted, and by specification have no validation effect. */
const METADATA_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
]);

/**
 * Keywords this validator enforces or structurally understands. Anything
 * outside this set is a hard registration error.
 */
const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  ...METADATA_KEYWORDS,
  // References (local only).
  "$ref",
  "$defs",
  // Value constraints.
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "patternProperties",
  "minProperties",
  "maxProperties",
  "items",
  "prefixItems",
  "uniqueItems",
  "contains",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "anyOf",
  "oneOf",
  "allOf",
]);

/**
 * String formats that actually reject malformed input in this zod build.
 *
 * Verified by probing each format with a clearly-invalid value: the ones
 * NOT listed (`url`, `regex`, `cuid2`, `cidrv4`, `cidrv6`, `hash`, `hex`,
 * `lowercase`, `uppercase`) accept anything, so they are deliberately
 * absent — admitting one would store a contract that enforces nothing.
 */
const SUPPORTED_FORMATS: ReadonlySet<string> = new Set([
  "email",
  "uuid",
  "date-time",
  "date",
  "time",
  "duration",
  "ipv4",
  "ipv6",
  "e164",
  "cuid",
  "ulid",
  "nanoid",
  "emoji",
  "jwt",
  "hostname",
  "uri",
  "base64",
  "base64url",
  "ksuid",
  "xid",
  "mac",
]);

const JSON_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

/** Keywords whose value is a single nested schema. */
const SINGLE_SCHEMA_KEYWORDS = [
  "items",
  "additionalProperties",
  "propertyNames",
  "contains",
  "not",
] as const;

/** Keywords whose value is an array of nested schemas. */
const SCHEMA_ARRAY_KEYWORDS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;

/** Keywords whose value is an object mapping names to nested schemas. */
const SCHEMA_MAP_KEYWORDS = ["properties", "patternProperties", "$defs"] as const;

/** Keywords that make a schema stand on its own without a `type`. */
const SELF_SUFFICIENT_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "$ref",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "allOf",
]);

/**
 * Bound the walk so a pathological contract cannot exhaust the stack.
 */
const MAX_DEPTH = 64;

/**
 * Reject a local `$ref` cycle.
 *
 * Verified: `{"$defs":{"N":{"$ref":"#/$defs/N"}},"$ref":"#/$defs/N"}` makes
 * the converter build an infinitely recursive `z.lazy`, and `validate()`
 * then throws `RangeError: Maximum call stack size exceeded` on ANY input.
 * A contract must never be able to crash the run that uses it.
 */
function findRefCycle(schema: Record<string, unknown>): string[] | null {
  const defs = isPlainObject(schema["$defs"]) ? schema["$defs"] : {};

  /** Harvest every local ref target reachable from one schema node. */
  const targetsOf = (node: unknown, out: Set<string>): void => {
    if (typeof node === "string") return;
    if (Array.isArray(node)) {
      for (const item of node) targetsOf(item, out);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/")) {
        out.add(value);
        continue;
      }
      targetsOf(value, out);
    }
  };

  // Paths that are currently being expanded, for cycle detection.
  const visit = (ref: string, stack: string[]): string[] | null => {
    const name = ref.replace(/^#\/(\$defs|definitions)\//, "");
    if (stack.includes(name)) return [...stack.slice(stack.indexOf(name)), name];
    const target = defs[name];
    if (target === undefined) return null;
    const next = new Set<string>();
    targetsOf(target, next);
    for (const child of next) {
      const cycle = visit(child, [...stack, name]);
      if (cycle) return cycle;
    }
    return null;
  };

  // Every ref in the document, not just the root: a cycle can hang off a
  // branch that the root never points at.
  const allRefs = new Set<string>();
  targetsOf(schema, allRefs);
  for (const ref of allRefs) {
    const cycle = visit(ref, []);
    if (cycle) return cycle;
  }
  return null;
}

/** A compiled contract. Produces failures rather than throwing. */
export interface SchemaValidator {
  validate(value: unknown): ValidationFailure[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural screen. Walks the schema and reports every unsupported or
 * malformed construct. Returns failures in traversal order.
 */
function screenSchema(schema: unknown, path: string, depth: number): ValidationFailure[] {
  if (depth > MAX_DEPTH) {
    return [
      {
        path,
        code: "SCHEMA_TOO_DEEP",
        message: `schema nesting exceeds ${MAX_DEPTH} levels`,
      },
    ];
  }

  // JSON Schema allows a bare boolean schema (true = anything, false = nothing).
  if (typeof schema === "boolean") return [];

  if (!isPlainObject(schema)) {
    return [
      {
        path,
        code: "SCHEMA_NOT_OBJECT",
        message: "a schema must be an object or a boolean",
      },
    ];
  }

  const failures: ValidationFailure[] = [];

  // Two structural rules that the per-keyword switch below cannot express.

  // (a) A schema needs something to discriminate on. `enum`, `const`,
  //     `type`, `$ref` and the combinators all qualify; a constraint
  //     keyword on its own does not, because the converter silently turns
  //     the whole schema into `z.any()`.
  const hasDiscriminator = [...SELF_SUFFICIENT_KEYWORDS].some((k) => k in schema);
  if (!hasDiscriminator) {
    const hasConstraint = Object.keys(schema).some(
      (k) => SUPPORTED_KEYWORDS.has(k) && !METADATA_KEYWORDS.has(k),
    );
    if (hasConstraint) {
      failures.push({
        path,
        code: "SCHEMA_MISSING_TYPE",
        message:
          "schema declares a constraint but no discriminator; without " +
          '"type" (or enum/const/$ref/allOf/anyOf/oneOf) the constraint ' +
          "would not be enforced. Add the matching \"type\".",
      });
    }
  }

  // (b) `$ref` siblings are discarded by the converter, so a schema that
  //     carries both silently loses the siblings.
  if ("$ref" in schema) {
    for (const keyword of Object.keys(schema)) {
      if (keyword === "$ref" || METADATA_KEYWORDS.has(keyword) || keyword === "$defs") continue;
      failures.push({
        path: at(path, keyword),
        code: "SCHEMA_REF_SIBLING",
        message:
          `keyword "${keyword}" next to "$ref" would be ignored. ` +
          `Move it into the referenced definition.`,
      });
    }
  }

  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      failures.push({
        path: at(path, keyword),
        code: "SCHEMA_UNSUPPORTED_KEYWORD",
        message:
          `unsupported schema keyword "${keyword}" — it would not be enforced. ` +
          `Remove it or use one this validator enforces.`,
      });
      continue;
    }
    if (METADATA_KEYWORDS.has(keyword)) continue;

    switch (keyword) {
      case "$ref": {
        if (typeof value !== "string" || !value.startsWith("#/")) {
          failures.push({
            path: at(path, "$ref"),
            code: "SCHEMA_BAD_REF",
            message: 'only local references ("#/$defs/...") are supported',
          });
        }
        break;
      }
      case "type": {
        const names = Array.isArray(value) ? value : [value];
        if (names.length === 0) {
          failures.push({
            path: at(path, "type"),
            code: "SCHEMA_BAD_TYPE",
            message: "type must name at least one JSON type",
          });
        }
        for (const name of names) {
          if (typeof name !== "string" || !JSON_TYPES.has(name)) {
            failures.push({
              path: at(path, "type"),
              code: "SCHEMA_BAD_TYPE",
              message: `unknown JSON type ${JSON.stringify(name)}`,
            });
          }
        }
        break;
      }
      case "format": {
        if (typeof value !== "string" || !SUPPORTED_FORMATS.has(value)) {
          failures.push({
            path: at(path, "format"),
            code: "SCHEMA_UNSUPPORTED_FORMAT",
            message:
              `unsupported string format ${JSON.stringify(value)} — the value ` +
              `would be accepted unchecked. Use one this validator enforces.`,
          });
        }
        break;
      }
      case "required": {
        if (!Array.isArray(value) || value.some((n) => typeof n !== "string")) {
          failures.push({
            path: at(path, "required"),
            code: "SCHEMA_BAD_REQUIRED",
            message: "required must be an array of property names",
          });
          break;
        }
        // Verified against the installed zod: a name listed in `required`
        // that has no matching entry in `properties` is silently ignored,
        // so `{ required: ["summary"] }` with no `properties.summary`
        // enforces nothing at all. JSON Schema would let `patternProperties`
        // or `additionalProperties` satisfy it, but this validator cannot,
        // so the contract is rejected rather than stored unenforced.
        const declared = isPlainObject(schema["properties"]) ? schema["properties"] : {};
        for (const name of value) {
          // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so
          // "constructor"/"toString"/"valueOf" would satisfy the guard
          // while the converter still marks nothing required.
          if (typeof name === "string" && !Object.hasOwn(declared, name)) {
            failures.push({
              path: at(path, "required"),
              code: "SCHEMA_REQUIRED_UNDECLARED",
              message:
                `required property ${JSON.stringify(name)} is not declared in ` +
                `"properties", so it would not be enforced. Declare it or ` +
                `remove it from "required".`,
            });
          }
        }
        break;
      }
      case "enum": {
        if (!Array.isArray(value) || value.length === 0) {
          failures.push({
            path: at(path, "enum"),
            code: "SCHEMA_BAD_ENUM",
            message: "enum must be a non-empty array",
          });
        }
        break;
      }
      case "uniqueItems": {
        if (typeof value !== "boolean") {
          failures.push({
            path: at(path, "uniqueItems"),
            code: "SCHEMA_BAD_VALUE",
            message: "uniqueItems must be a boolean",
          });
        }
        break;
      }
      // Numeric and length bounds must be numbers, otherwise the constraint
      // is not expressible and would be dropped by the JSON round-trip.
      case "minimum":
      case "maximum":
      case "exclusiveMinimum":
      case "exclusiveMaximum":
      case "multipleOf":
      case "minLength":
      case "maxLength":
      case "minProperties":
      case "maxProperties": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          failures.push({
            path: at(path, keyword),
            code: "SCHEMA_BAD_VALUE",
            message: `${keyword} must be a finite number`,
          });
        }
        break;
      }
      case "pattern": {
        if (typeof value !== "string") {
          failures.push({
            path: at(path, "pattern"),
            code: "SCHEMA_BAD_VALUE",
            message: "pattern must be a string",
          });
          break;
        }
        // A pattern that cannot compile would be dropped, not enforced.
        try {
          new RegExp(value);
        } catch {
          failures.push({
            path: at(path, "pattern"),
            code: "SCHEMA_BAD_PATTERN",
            message: `pattern ${JSON.stringify(value)} is not a valid regular expression`,
          });
        }
        break;
      }
      case "minItems":
      case "maxItems": {
        // Unreachable while excluded from SUPPORTED_KEYWORDS; kept so that
        // adding them later fails loudly here instead of silently passing.
        failures.push({
          path: at(path, keyword),
          code: "SCHEMA_UNSUPPORTED_KEYWORD",
          message: `${keyword} is not enforced by this validator`,
        });
        break;
      }
      default:
        break;
    }

    if ((SINGLE_SCHEMA_KEYWORDS as readonly string[]).includes(keyword)) {
      failures.push(...screenSchema(value, at(path, keyword), depth + 1));
      continue;
    }
    if ((SCHEMA_ARRAY_KEYWORDS as readonly string[]).includes(keyword)) {
      if (!Array.isArray(value)) {
        failures.push({
          path: at(path, keyword),
          code: "SCHEMA_BAD_VALUE",
          message: `${keyword} must be an array of schemas`,
        });
        continue;
      }
      value.forEach((sub, i) => {
        failures.push(...screenSchema(sub, at(at(path, keyword), i), depth + 1));
      });
      continue;
    }
    if ((SCHEMA_MAP_KEYWORDS as readonly string[]).includes(keyword)) {
      if (!isPlainObject(value)) {
        failures.push({
          path: at(path, keyword),
          code: "SCHEMA_BAD_VALUE",
          message: `${keyword} must be an object mapping names to schemas`,
        });
        continue;
      }
      for (const [name, sub] of Object.entries(value)) {
        failures.push(...screenSchema(sub, at(at(path, keyword), name), depth + 1));
      }
      continue;
    }
  }

  return failures;
}

/**
 * Confirm the schema survives a JSON round-trip unchanged.
 *
 * `fromJSONSchema` normalizes through `JSON.parse(JSON.stringify(...))`, so
 * a value JSON cannot represent (a function, `undefined`, a symbol) is
 * dropped before the schema is compiled. `{ type: undefined }` would become
 * `{}` — which accepts everything. Rejecting those here keeps the
 * fail-closed guarantee intact.
 */
function screenJsonFidelity(value: unknown, path: string, depth: number): ValidationFailure[] {
  if (depth > MAX_DEPTH) return [];
  if (value === null) return [];

  switch (typeof value) {
    case "string":
    case "boolean":
      return [];
    case "number":
      return Number.isFinite(value)
        ? []
        : [
            {
              path,
              code: "SCHEMA_NOT_JSON",
              message: "schema contains a non-finite number, which JSON cannot represent",
            },
          ];
    case "object": {
      const failures: ValidationFailure[] = [];
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          failures.push(...screenJsonFidelity(item, at(path, i), depth + 1));
        });
        return failures;
      }
      for (const [key, sub] of Object.entries(value)) {
        failures.push(...screenJsonFidelity(sub, at(path, key), depth + 1));
      }
      return failures;
    }
    default:
      return [
        {
          path,
          code: "SCHEMA_NOT_JSON",
          message: `schema contains a ${typeof value}, which JSON cannot represent`,
        },
      ];
  }
}

/**
 * Compile a structured-output contract.
 *
 * Fails closed: the returned validator only exists if every declared
 * constraint is actually enforced. Callers must treat a failure as a
 * rejection of the contract (a 400 when an admin registers it).
 */
export function compileSchema(schema: unknown): ValidationResult<SchemaValidator> {
  const fidelity = screenJsonFidelity(schema, "$", 0);
  if (fidelity.length > 0) return { ok: false, failures: fidelity };

  const problems = screenSchema(schema, "$", 0);
  if (problems.length > 0) return { ok: false, failures: problems };

  // A cyclic local $ref survives the keyword screen but makes the compiled
  // validator recurse until the stack overflows on any input, so it is
  // rejected here rather than allowed to crash a run later.
  if (isPlainObject(schema)) {
    const cycle = findRefCycle(schema);
    if (cycle) {
      return fail(
        "$",
        "SCHEMA_REF_CYCLE",
        `local $ref cycle: ${cycle.join(" -> ")}. The compiled validator ` +
          `would recurse without terminating.`,
      );
    }
  }

  let compiled: z.ZodType;
  try {
    compiled = z.fromJSONSchema(schema as never);
  } catch (err) {
    // Local-ref resolution failures and converter edge cases land here.
    // The message is generated from the schema, never from user data.
    return fail(
      "$",
      "SCHEMA_UNCOMPILABLE",
      `schema could not be compiled: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  return {
    ok: true,
    value: {
      validate(value: unknown): ValidationFailure[] {
        const result = compiled.safeParse(value);
        if (result.success) return [];
        return result.error.issues.map((issue) => ({
          path: issue.path.length === 0 ? "$" : at("$", issue.path.map(String).join(".")),
          code: "VALUE_INVALID",
          // Zod's message describes the constraint that failed; it never
          // echoes the value itself, so this is safe to persist or return.
          message: issue.message,
        }));
      },
    },
  };
}

/**
 * Compile and validate in one step — the shape every structured-output
 * consumer wants.
 */
export function parseWithSchema(
  schema: unknown,
  value: unknown,
): ValidationResult<unknown> {
  const compiled = compileSchema(schema);
  if (!compiled.ok) return compiled;
  const failures = compiled.value.validate(value);
  return failures.length > 0 ? { ok: false, failures } : { ok: true, value };
}

/**
 * Extract the first JSON value from a model response and validate it.
 *
 * Models wrap structured output in prose or markdown fences even when told
 * not to, so the first balanced `{...}` or `[...]` is taken. This is a
 * convenience for callers that need it, and it is deliberately strict:
 * text with no JSON at all is a failure, not an empty result.
 */
export function extractJson(text: string): ValidationResult<unknown> {
  const trimmed = text.trim();
  const start = trimmed.search(/[[{]/);
  if (start === -1) {
    return fail("$", "NO_JSON_FOUND", "response contained no JSON value");
  }
  const open = trimmed[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          return { ok: true, value: JSON.parse(candidate) };
        } catch {
          return fail("$", "JSON_MALFORMED", "response contained malformed JSON");
        }
      }
    }
  }
  return fail("$", "JSON_TRUNCATED", "response JSON was not closed");
}
