/**
 * @novelforge/api — simulation entity persistence (M6, NF-WF-033 / GAP-091).
 *
 * Queryable, identity-bearing materialization of simulation state.
 * The JSON tick state (`simulation_ticks.stateBefore`/`stateAfter`)
 * remains the authoritative, replayable record (024B); entities are
 * derived from the same tick computation and persisted in the same
 * transaction — never a competing source of truth.
 *
 * This module holds the pure pieces:
 * - `deriveEntityId`: deterministic UUIDv5 entity ids
 *   (`runId + kind + tickCreated + ordinal`), never random.
 * - `deriveEntityDeltas`: pure per-tick delta derivation + validation.
 * - The scenario-kind-keyed entity-rules registry (code, not data):
 *   unknown/unregistered kinds resolve to null = the 021A minimal rule
 *   (no entity semantics; entities persist untouched).
 *
 * 021 Invariant 6 / 024 Invariant 4: no LLM, no unseeded randomness,
 * no wall-clock in any path here. `createdAt` is audit metadata only.
 */
import { createHash } from "node:crypto";

/** Pinned SimulationEntity.kind values (021A contract F5). Mirrors the
 *  Prisma `SimulationEntityKind` enum; kept as a local union so this
 *  module has no Prisma runtime dependency. */
export type SimulationEntityKind =
  | "SETTLEMENT"
  | "POPULATION"
  | "RESOURCE"
  | "KNOWLEDGE"
  | "INFRASTRUCTURE";

const VALID_KINDS: ReadonlySet<string> = new Set([
  "SETTLEMENT",
  "POPULATION",
  "RESOURCE",
  "KNOWLEDGE",
  "INFRASTRUCTURE",
]);

export function isValidEntityKind(kind: unknown): kind is SimulationEntityKind {
  return typeof kind === "string" && VALID_KINDS.has(kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Entity row shape as returned by listEntities (simulation-meaningful
 *  columns only; `createdAt` is audit metadata). */
export interface SimulationEntityShape {
  id: string;
  kind: SimulationEntityKind;
  attributes: Record<string, unknown>;
  tickCreated: number;
  tickRetired: number | null;
}

/** Reducer input for entity creation at run start. */
export interface InitialEntityInput {
  kind: SimulationEntityKind;
  attributes: Record<string, unknown>;
}

/** Per-tick delta: upserts (id set → update attributes in place;
 *  id absent → create) and retirements. */
export interface EntityDelta {
  upsert: Array<{
    id?: string;
    kind: SimulationEntityKind;
    attributes: Record<string, unknown>;
  }>;
  retire: string[];
}

/** Pure entity reducer: (stateBefore, stateAfter, tickNumber,
 *  liveEntities) → EntityDelta. Simulation semantics, like computeTick
 *  itself — never user content, never from the database. */
export type EntityReducer = (args: {
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  tickNumber: number;
  liveEntities: SimulationEntityShape[];
}) => EntityDelta;

/** Thrown by deriveEntityDeltas on malformed reducer output.
 *  The service maps this to SimulationError("INVALID_INPUT") → 400. */
export class EntityValidationError extends Error {
  readonly code = "INVALID_INPUT" as const;
  constructor(message: string) {
    super(message);
    this.name = "EntityValidationError";
  }
}

/**
 * Fixed UUIDv5 namespace for simulation entity ids. Stable across
 * deploys — the id scheme is part of the determinism contract.
 */
const SIMULATION_ENTITY_NAMESPACE = "c9b3f2a1-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

function uuidv5(namespace: string, name: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(nsBytes)
    .update(name, "utf8")
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant RFC 4122
  const hex = bytes.toString("hex");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}` +
    `-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/**
 * Deterministic entity id (contract §"Deterministic entity ids"):
 * UUIDv5 over `runId:kind:tickCreated:ordinal`, where ordinal is the
 * entity's index within the tick's created set (initialEntities array
 * index for tick 0; reducer output order for per-tick creations),
 * starting at 0. Random UUIDs are forbidden.
 */
export function deriveEntityId(
  runId: string,
  kind: SimulationEntityKind,
  tickCreated: number,
  ordinal: number,
): string {
  return uuidv5(
    SIMULATION_ENTITY_NAMESPACE,
    `${runId}:${kind}:${tickCreated}:${ordinal}`,
  );
}

/**
 * Pure per-tick entity delta derivation (contract §"Write path").
 *
 * Same inputs → same deltas (021 Invariant 6). Validates the reducer
 * output: every upsert needs a valid kind + JSON-object attributes;
 * every referenced id (upsert-with-id, retire) must be a currently-live
 * entity of this run — unknown ids throw EntityValidationError (400,
 * never silently ignored).
 */
export function deriveEntityDeltas(args: {
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  tickNumber: number;
  liveEntities: SimulationEntityShape[];
  entityRules: EntityReducer | null;
}): EntityDelta {
  const { entityRules, liveEntities, tickNumber } = args;
  if (!entityRules) return { upsert: [], retire: [] };

  const raw = entityRules(args);
  const liveIds = new Set(liveEntities.map((e) => e.id));

  const upsert = (raw.upsert ?? []).map((u, i) => {
    if (!isValidEntityKind(u.kind)) {
      throw new EntityValidationError(
        `entity delta upsert[${i}].kind is not a valid SimulationEntityKind: ${String(u.kind)}`,
      );
    }
    if (!isRecord(u.attributes)) {
      throw new EntityValidationError(
        `entity delta upsert[${i}].attributes must be a JSON object`,
      );
    }
    if (u.id !== undefined && !liveIds.has(u.id)) {
      throw new EntityValidationError(
        `entity delta upsert[${i}].id references unknown entity: ${u.id} (tick ${tickNumber})`,
      );
    }
    return {
      ...(u.id !== undefined ? { id: u.id } : {}),
      kind: u.kind,
      attributes: u.attributes,
    };
  });

  const retire = (raw.retire ?? []).map((id, i) => {
    if (!liveIds.has(id)) {
      throw new EntityValidationError(
        `entity delta retire[${i}] references unknown entity: ${id} (tick ${tickNumber})`,
      );
    }
    return id;
  });

  return { upsert, retire };
}

// ---------------------------------------------------------------------------
// Entity-rules registry (contract §"Entity-rules resolution")
// ---------------------------------------------------------------------------

/**
 * Scenario-kind-keyed registry of entity reducers. Code, not data:
 * fixed at deploy time, never read from or written to the database.
 * Unknown or unregistered kinds resolve to null — the 021A minimal
 * rule (no entity semantics; entities persist untouched).
 */
const entityRuleRegistry = new Map<string, EntityReducer>();

export function resolveEntityRules(
  scenarioKind: string | null | undefined,
): EntityReducer | null {
  return entityRuleRegistry.get(scenarioKind ?? "STANDARD") ?? null;
}

/**
 * Test seam: register an entity reducer for a scenario kind.
 * Production code registers nothing. Tests must clear via
 * __clearEntityRulesForTesting (typically in afterEach/beforeEach).
 */
export function __registerEntityRulesForTesting(
  kind: string,
  reducer: EntityReducer,
): void {
  entityRuleRegistry.set(kind, reducer);
}

export function __clearEntityRulesForTesting(): void {
  entityRuleRegistry.clear();
}

/**
 * Validate an initialEntities input array (run creation). Throws
 * EntityValidationError on the first problem; the service maps this
 * to SimulationError("INVALID_INPUT") → 400 before any write.
 */
export function validateInitialEntities(
  input: unknown,
): asserts input is InitialEntityInput[] {
  if (!Array.isArray(input)) {
    throw new EntityValidationError("scenario.initialEntities must be an array");
  }
  input.forEach((e, i) => {
    if (!isRecord(e)) {
      throw new EntityValidationError(
        `scenario.initialEntities[${i}] must be an object`,
      );
    }
    if (!isValidEntityKind(e.kind)) {
      throw new EntityValidationError(
        `scenario.initialEntities[${i}].kind is not a valid SimulationEntityKind: ${String(e.kind)}`,
      );
    }
    if (!isRecord(e.attributes)) {
      throw new EntityValidationError(
        `scenario.initialEntities[${i}].attributes must be a JSON object`,
      );
    }
  });
}
