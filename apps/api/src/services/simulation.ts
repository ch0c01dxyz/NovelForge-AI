/**
 * @novelforge/api — simulation services (M6, NF-WF-021A).
 *
 * Computational primitives for the simulation module: SimulationRun,
 * Scenario, Tick, SimulationEntity, SimulationEvent. The 5 primitives
 * implement the domain spec's 14 conceptual primitives (Entity, State,
 * Event, Relationship, Knowledge, Resource, Rule, Dependency, Cause,
 * Effect, Territory, Organization, Reputation, Timeline); see the
 * 021A section of docs/implementation/progress.md for the mapping.
 *
 * Invariants (contract §"Behavior and invariants"):
 * - Simulations NEVER write to canon tables (Invariant 1). All state
 *   lives in the dedicated simulation_* tables.
 * - Prerequisites are enforced, not advisory (Invariant 4): branch,
 *   snapshot, canon pin, module activation — all required.
 * - Ticks are deterministic and replayable (Invariant 6): same seed +
 *   same ticks = same state. No LLM calls, no unseeded randomness.
 * - Simulations run on branches (Invariant 3); never publishable.
 *
 * 021A scope: primitives, prerequisites, run lifecycle. 021B adds causal
 * links and proposals; 021C adds the civilization domain rules.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
// Shared error vocabulary; the app-wide handler in platform-routes.ts maps
// these once. SimulationError is the typed 400/409 for simulation refusals.
import { NotFoundError } from "@novelforge/ai-services";
// NF-WF-033 (GAP-091): entity persistence seam. Pure pieces live in the
// sibling module; the JSON tick state stays the authoritative record.
import {
  deriveEntityDeltas,
  deriveEntityId,
  isValidEntityKind,
  resolveEntityRules,
  validateInitialEntities,
  EntityValidationError,
  type EntityDelta,
  type InitialEntityInput,
  type SimulationEntityShape,
} from "./simulation-entities.ts";

/**
 * NF-WF-021A: typed simulation refusals. 400s are prerequisite/input
 * validation (contract acceptance); 409s are state conflicts (invalid
 * lifecycle transitions).
 */
export type SimulationErrorCode =
  | "NO_BRANCH" // configure without a branch (contract F3)
  | "NO_SNAPSHOT" // configure without a checkpoint for the branch head
  | "MODULE_NOT_ENABLED" // configure without the simulation module enabled
  | "INVALID_INPUT" // malformed input
  | "INVALID_STATUS_TRANSITION" // 409: lifecycle transition not allowed
  | "RUN_NOT_FOUND"; // 404: unknown run id

export class SimulationError extends Error {
  readonly code: SimulationErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: SimulationErrorCode, message: string) {
    super(message);
    this.name = "SimulationError";
    this.code = code;
    this.statusCode = code === "RUN_NOT_FOUND" ? 404 : code === "INVALID_STATUS_TRANSITION" ? 409 : 400;
  }
}

/** Pinned SimulationRun.status enum (contract F2 — includes PAUSED_PROPOSAL for 021B). */
export type SimulationRunStatus =
  | "DRAFT"
  | "CONFIGURED"
  | "RUNNING"
  | "PAUSED"
  | "PAUSED_PROPOSAL"
  | "COMPLETED"
  | "ABORTED";

/** Pinned SimulationEntity.kind values (contract F5 — 021C's civilization kinds). */
export type SimulationEntityKind =
  | "SETTLEMENT"
  | "POPULATION"
  | "RESOURCE"
  | "KNOWLEDGE"
  | "INFRASTRUCTURE";

export interface SimulationRunShape {
  id: string;
  novelId: string;
  branchId: string | null;
  isSimulationBranch: boolean;
  status: SimulationRunStatus;
  currentTick: number;
  maxTicks: number;
  seed: string;
  snapshotId: string | null;
  canonRevisionId: string | null;
  /// NF-WF-024B: why the run paused (breakpoint hit). Null unless paused
  /// by the debugger. The run reuses 021A PAUSED status.
  pauseReason: string | null;
  createdAt: Date;
}

export interface SimulationServices {
  createRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    branchId?: string;
    scenario?: {
      initialState?: Record<string, unknown>;
      injections?: Record<string, unknown[]>;
      seed?: string;
      maxTicks?: number;
      /// NF-WF-033 (GAP-091): optional initial entities. Validated at run
      /// creation (invalid kind/attributes → 400 INVALID_INPUT, no partial
      /// state) and persisted with tickCreated = 0. Empty/absent → zero rows.
      initialEntities?: Array<{
        kind: SimulationEntityKind;
        attributes: Record<string, unknown>;
      }>;
    };
    /// NF-WF-024A: scenario kind. Defaults to 'STANDARD'. 'WHATIF' tags
    /// narrative-level what-if runs (excluded from 021D's list).
    kind?: string;
  }): Promise<SimulationRunShape>;

  listRuns(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<SimulationRunShape[]>;

  getRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape & { scenario: unknown | null }>;

  configureRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape>;

  startRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape>;

  stepRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    ticks?: number;
  }): Promise<{
    run: SimulationRunShape;
    ticks: {
      tickNumber: number;
      stateBefore: unknown;
      stateAfter: unknown;
      events: unknown[];
    }[];
  }>;

  pauseRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape>;

  resumeRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape>;

  abortRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<SimulationRunShape>;

  getTick(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    tickNumber: number;
  }): Promise<{
    tickNumber: number;
    stateBefore: unknown;
    stateAfter: unknown;
    events: unknown[];
  }>;

  /// NF-WF-033 (GAP-091): run-scoped entity listing. Returns entities live
  /// at `tick` (default: run's currentTick), optionally filtered by kind,
  /// ordered by (tickCreated, id). Gated by simulation:read; every query
  /// resolves through the run gate (no direct novel/workspace-keyed entity
  /// queries — tenant boundary inherited via runId).
  listEntities(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    tick?: number;
    kind?: SimulationEntityKind;
  }): Promise<SimulationEntityShape[]>;
}

/**
 * NF-WF-024B: pure deterministic tick computation (extracted from stepRun).
 *
 * Given the state before a tick and the injections for that tick number,
 * computes the state after and the events — with NO persistence, NO
 * randomness, NO LLM calls. This is the single source of truth for tick
 * semantics: 021A's stepRun and 024B's deterministic replay both use it,
 * so replay fidelity holds by construction (021 Invariant 6).
 *
 * 021A's tick rule is minimal: state carries forward; injections for the
 * tick number are applied as events (with optional `stateDelta`). 021C
 * adds domain dynamics via the story-simulation package (not inline here).
 */
export function computeTick(
  stateBefore: Record<string, unknown>,
  tickNumber: number,
  injections: Record<string, unknown[]>,
): { stateAfter: Record<string, unknown>; events: unknown[] } {
  const currentState = { ...stateBefore };
  const tickInjections = injections[String(tickNumber)] ?? [];
  const events: unknown[] = [];

  // Apply injections as events (deterministic).
  for (const injection of tickInjections) {
    const evt = injection as Record<string, unknown>;
    events.push({
      kind: (evt.kind as string) ?? "INJECTION",
      payload: evt,
    });
    // Injections may carry state deltas under `stateDelta`.
    const delta = evt.stateDelta as Record<string, unknown> | undefined;
    if (delta) {
      for (const [k, v] of Object.entries(delta)) {
        currentState[k] = v;
      }
    }
  }

  return { stateAfter: currentState, events };
}

export function createSimulationServices({
  db,
}: {
  db: NovelForgeDb;
}): SimulationServices {
  /** Membership gate — 404 for non-members (ADR-0004), role for caps. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
  }

  async function getRunOrThrow(
    workspaceId: string,
    novelId: string,
    runId: string,
  ) {
    const run = await db.simulationRun.findFirst({
      where: { id: runId, workspaceId, novelId },
    });
    if (!run) throw new SimulationError("RUN_NOT_FOUND", "simulation run not found");
    return run;
  }

  function toShape(run: {
    id: string;
    novelId: string;
    branchId: string | null;
    isSimulationBranch: boolean;
    status: string;
    currentTick: number;
    maxTicks: number;
    seed: string;
    snapshotId: string | null;
    canonRevisionId: string | null;
    pauseReason: string | null;
    createdAt: Date;
  }): SimulationRunShape {
    return {
      id: run.id,
      novelId: run.novelId,
      branchId: run.branchId,
      isSimulationBranch: run.isSimulationBranch,
      status: run.status as SimulationRunStatus,
      currentTick: run.currentTick,
      maxTicks: run.maxTicks,
      seed: run.seed,
      snapshotId: run.snapshotId,
      canonRevisionId: run.canonRevisionId,
      pauseReason: run.pauseReason,
      createdAt: run.createdAt,
    };
  }

  return {
    async createRun({ actorUserId, workspaceId, novelId, branchId, scenario, kind }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");

      // If a branch is named, verify it exists and belongs to the novel.
      // If omitted, the run is created without a branch; configure will
      // 400 NO_BRANCH (contract F3 — 021A does NOT auto-provision).
      let branchRow: { id: string; name: string } | null = null;
      if (branchId !== undefined) {
        branchRow = await db.novelBranch.findFirst({
          where: { id: branchId, novelId, workspaceId },
          select: { id: true, name: true },
        });
        if (!branchRow) throw new NotFoundError("branch");
      }

      // NF-WF-033 (GAP-091): validate initialEntities BEFORE any write.
      // On failure the run is not created — 400 INVALID_INPUT, zero
      // entity rows, no partial state. (No schema change: the validated
      // entries are persisted as entity rows below, in the same
      // transaction as the run + scenario rows.)
      const initialEntities: InitialEntityInput[] = scenario?.initialEntities ?? [];
      try {
        validateInitialEntities(initialEntities);
      } catch (err) {
        if (err instanceof EntityValidationError) {
          throw new SimulationError("INVALID_INPUT", err.message);
        }
        throw err;
      }

      // Run + scenario + initial entities commit atomically. Initial
      // entities get tickCreated = 0 and deterministic ids
      // (runId + kind + 0 + array index).
      const run = await db.$transaction(async (tx) => {
        const created = await tx.simulationRun.create({
          data: {
            workspaceId,
            novelId,
            branchId: branchRow?.id ?? null,
            // Q6: dedicated branches recommended, not mandated. A branch
            // named `simulation-*` is recorded as simulation-dedicated.
            isSimulationBranch: branchRow ? branchRow.name.startsWith("simulation-") : false,
            status: "DRAFT",
            maxTicks: scenario?.maxTicks ?? 20,
            seed: scenario?.seed ?? "default",
          },
        });

        // Create the scenario row (initial conditions + injections).
        await tx.simulationScenario.create({
          data: {
            runId: created.id,
            initialState: (scenario?.initialState ?? {}) as object,
            injections: (scenario?.injections ?? {}) as object,
            seed: scenario?.seed ?? "default",
            // NF-WF-024A: tag the scenario kind. 'STANDARD' (default) or
            // 'WHATIF' (narrative-level what-if; excluded from 021D's list).
            kind: kind ?? "STANDARD",
          },
        });

        for (let i = 0; i < initialEntities.length; i++) {
          const e = initialEntities[i];
          if (!e) continue; // unreachable: bounded by length, satisfies noUncheckedIndexedAccess
          await tx.simulationEntity.create({
            data: {
              id: deriveEntityId(created.id, e.kind, 0, i),
              runId: created.id,
              kind: e.kind,
              attributes: e.attributes as object,
              tickCreated: 0,
              tickRetired: null,
            },
          });
        }

        return created;
      });

      return toShape(run);
    },

    async listRuns({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const runs = await db.simulationRun.findMany({
        where: {
          workspaceId,
          novelId,
          // NF-WF-024A (F1): WHATIF runs are excluded from 021D's Simulation
          // Center list (read-path isolation). The what-if panel is the sole
          // surface for WHATIF runs; this preserves the 021 Q8
          // narrative/world separation. Runs without a scenario (pre-024A)
          // are included.
          OR: [
            { scenario: null },
            { scenario: { kind: { not: "WHATIF" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      return runs.map(toShape);
    },

    async getRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const run = await getRunOrThrow(workspaceId, novelId, runId);
      const scenario = await db.simulationScenario.findUnique({
        where: { runId: run.id },
      });
      return {
        ...toShape(run),
        scenario: scenario
          ? {
              initialState: scenario.initialState,
              injections: scenario.injections,
              seed: scenario.seed,
            }
          : null,
      };
    },

    async configureRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status !== "DRAFT") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only DRAFT runs can be configured (status is ${run.status})`,
        );
      }

      // Prerequisite 1: branch exists (contract F3).
      if (!run.branchId) {
        throw new SimulationError(
          "NO_BRANCH",
          "simulation run has no branch; create a dedicated branch via 020B createBranch first",
        );
      }
      const branch = await db.novelBranch.findFirst({
        where: { id: run.branchId, novelId, workspaceId },
        select: { id: true, headRevisionId: true },
      });
      if (!branch) {
        throw new SimulationError("NO_BRANCH", "simulation branch not found");
      }

      // Prerequisite 2: snapshot pinned — a checkpoint exists for the branch.
      // The run records the checkpoint id as snapshotId.
      const checkpoint = await db.checkpoint.findFirst({
        where: { novelId, branchId: branch.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!checkpoint) {
        throw new SimulationError(
          "NO_SNAPSHOT",
          "no checkpoint exists for the simulation branch; create one first",
        );
      }

      // Prerequisite 3: canon pin — the branch head revision at configure time.
      // The simulation never modifies canon (Invariant 1); the pin is the
      // basis the simulation was built on.
      const canonRevisionId = branch.headRevisionId;
      if (!canonRevisionId) {
        throw new SimulationError(
          "NO_SNAPSHOT",
          "simulation branch has no head revision",
        );
      }

      // Prerequisite 4: module activated.
      const module = await db.novelModule.findUnique({
        where: { novelId_moduleName: { novelId, moduleName: "simulation" } },
      });
      if (!module) {
        throw new SimulationError(
          "MODULE_NOT_ENABLED",
          "the simulation module is not enabled for this novel",
        );
      }

      const updated = await db.simulationRun.update({
        where: { id: run.id },
        data: {
          status: "CONFIGURED",
          snapshotId: checkpoint.id,
          canonRevisionId,
        },
      });
      return toShape(updated);
    },

    async startRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status !== "CONFIGURED") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only CONFIGURED runs can start (status is ${run.status})`,
        );
      }

      const updated = await db.simulationRun.update({
        where: { id: run.id },
        data: { status: "RUNNING" },
      });
      return toShape(updated);
    },

    async stepRun({ actorUserId, workspaceId, novelId, runId, ticks = 1 }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status !== "RUNNING") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only RUNNING runs can step (status is ${run.status})`,
        );
      }
      if (ticks < 1 || ticks > 100) {
        throw new SimulationError("INVALID_INPUT", "ticks must be between 1 and 100");
      }

      const scenario = await db.simulationScenario.findUnique({
        where: { runId: run.id },
      });
      if (!scenario) throw new SimulationError("INVALID_INPUT", "run has no scenario");

      const injections = scenario.injections as Record<string, unknown[]>;
      const results: {
        tickNumber: number;
        stateBefore: unknown;
        stateAfter: unknown;
        events: unknown[];
      }[] = [];

      // Deterministic tick loop (Invariant 6). 021A's tick rule is minimal:
      // state carries forward; injections for the tick number are applied as
      // events. 021C adds domain dynamics. No randomness, no LLM calls.
      let currentTick = run.currentTick;
      let currentState: Record<string, unknown>;
      if (currentTick === 0) {
        currentState = { ...(scenario.initialState as Record<string, unknown>) };
      } else {
        const lastTick = await db.simulationTick.findUnique({
          where: { runId_tickNumber: { runId: run.id, tickNumber: currentTick } },
        });
        if (!lastTick) {
          throw new SimulationError("INVALID_INPUT", "tick history is inconsistent");
        }
        currentState = { ...(lastTick.stateAfter as Record<string, unknown>) };
      }

      for (let i = 0; i < ticks; i++) {
        const nextTickNumber = currentTick + 1;
        if (nextTickNumber > run.maxTicks) break;

        const stateBefore = { ...currentState };
        // NF-WF-024B: tick computation is the shared pure function (also
        // used by deterministic replay). Behavior identical to the inline
        // version it replaces.
        const { stateAfter, events } = computeTick(
          stateBefore,
          nextTickNumber,
          injections,
        );
        currentState = { ...stateAfter };

        // NF-WF-033 (GAP-091): resolve the scenario-kind-keyed entity
        // rules and derive per-tick deltas. Pure — runs BEFORE the
        // transaction, never inside computeTick (024B). Unknown/
        // unregistered kinds resolve to null = the 021A minimal rule
        // (no entity semantics; entities persist untouched).
        const entityRules = resolveEntityRules(scenario.kind);
        let deltas: EntityDelta = { upsert: [], retire: [] };
        if (entityRules) {
          const liveRows = await db.simulationEntity.findMany({
            where: {
              runId: run.id,
              tickCreated: { lte: nextTickNumber },
              OR: [{ tickRetired: null }, { tickRetired: { gt: nextTickNumber } }],
            },
            select: {
              id: true,
              kind: true,
              attributes: true,
              tickCreated: true,
              tickRetired: true,
            },
          });
          const liveEntities: SimulationEntityShape[] = liveRows.map((r) => ({
            id: r.id,
            kind: r.kind as SimulationEntityKind,
            attributes: r.attributes as Record<string, unknown>,
            tickCreated: r.tickCreated,
            tickRetired: r.tickRetired,
          }));
          try {
            deltas = deriveEntityDeltas({
              stateBefore,
              stateAfter,
              tickNumber: nextTickNumber,
              liveEntities,
              entityRules,
            });
          } catch (err) {
            if (err instanceof EntityValidationError) {
              // Fail the tick atomically: no tick row, no events, no
              // entity changes, currentTick unadvanced. Never silently
              // ignore malformed reducer output.
              throw new SimulationError("INVALID_INPUT", err.message);
            }
            throw err;
          }
        }

        // One transaction per tick: the tick row, its event rows, and
        // the entity delta writes commit together. There is never a
        // tick whose JSON and whose entities disagree.
        await db.$transaction(async (tx) => {
          // Claim this cursor atomically with tick/entity writes. A later tick
          // failure must not strand the run behind its committed history.
          const claimed = await tx.simulationRun.updateMany({
            where: { id: run.id, status: "RUNNING", currentTick },
            data: { currentTick: nextTickNumber, ...(nextTickNumber >= run.maxTicks ? { status: "COMPLETED" } : {}) },
          });
          if (claimed.count !== 1) {
            throw new SimulationError("INVALID_STATUS_TRANSITION", "run status or cursor changed while stepping");
          }
          // Persist the tick and its events (simulation tables only —
          // Invariant 1: never touch canon tables).
          await tx.simulationTick.create({
            data: {
              runId: run.id,
              tickNumber: nextTickNumber,
              stateBefore: stateBefore as object,
              stateAfter: stateAfter as object,
              events: events as object,
            },
          });
          for (const evt of events) {
            const e = evt as { kind: string; payload: unknown };
            await tx.simulationEvent.create({
              data: {
                runId: run.id,
                tickNumber: nextTickNumber,
                kind: e.kind,
                payload: e.payload as object,
              },
            });
          }

          // Apply entity deltas atomically with the tick. Upserts with
          // an id update attributes in place; without an id they create
          // a row with a deterministic id (ordinal = index among this
          // tick's creations).
          let createOrdinal = 0;
          for (const u of deltas.upsert) {
            if (u.id !== undefined) {
              await tx.simulationEntity.update({
                where: { id: u.id },
                data: { attributes: u.attributes as object },
              });
            } else {
              await tx.simulationEntity.create({
                data: {
                  id: deriveEntityId(run.id, u.kind, nextTickNumber, createOrdinal++),
                  runId: run.id,
                  kind: u.kind,
                  attributes: u.attributes as object,
                  tickCreated: nextTickNumber,
                  tickRetired: null,
                },
              });
            }
          }
          for (const id of deltas.retire) {
            await tx.simulationEntity.update({
              where: { id },
              data: { tickRetired: nextTickNumber },
            });
          }
        });

        results.push({
          tickNumber: nextTickNumber,
          stateBefore,
          stateAfter,
          events,
        });
        currentTick = nextTickNumber;
      }

      const updated = await getRunOrThrow(workspaceId, novelId, runId);

      return { run: toShape(updated), ticks: results };
    },

    async pauseRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status !== "RUNNING") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only RUNNING runs can pause (status is ${run.status})`,
        );
      }

      const updated = await db.simulationRun.update({
        where: { id: run.id },
        data: { status: "PAUSED" },
      });
      return toShape(updated);
    },

    async resumeRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status !== "PAUSED") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only PAUSED runs can resume (status is ${run.status})`,
        );
      }

      const updated = await db.simulationRun.update({
        where: { id: run.id },
        data: { status: "RUNNING" },
      });
      return toShape(updated);
    },

    async abortRun({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status === "COMPLETED" || run.status === "ABORTED") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `terminal runs cannot be aborted (status is ${run.status})`,
        );
      }

      const updated = await db.simulationRun.update({
        where: { id: run.id },
        data: { status: "ABORTED" },
      });
      return toShape(updated);
    },

    async getTick({ actorUserId, workspaceId, novelId, runId, tickNumber }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      const tick = await db.simulationTick.findUnique({
        where: { runId_tickNumber: { runId: run.id, tickNumber } },
      });
      if (!tick) throw new SimulationError("RUN_NOT_FOUND", "tick not found");

      return {
        tickNumber: tick.tickNumber,
        stateBefore: tick.stateBefore,
        stateAfter: tick.stateAfter,
        events: tick.events as unknown[],
      };
    },

    async listEntities({ actorUserId, workspaceId, novelId, runId, tick, kind }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      // Tenant boundary inherited via the run: every entity query resolves
      // through the gated run lookup. Direct novel/workspace-keyed entity
      // queries are forbidden (they would bypass the run gate).
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (kind !== undefined && !isValidEntityKind(kind)) {
        throw new SimulationError(
          "INVALID_INPUT",
          `unknown entity kind: ${String(kind)}`,
        );
      }

      // Lifespan rule (contract, normative): live at tick T iff
      // tickCreated <= T AND (tickRetired IS NULL OR tickRetired > T).
      // Default tick: the run's currentTick.
      const atTick = tick ?? run.currentTick;
      const rows = await db.simulationEntity.findMany({
        where: {
          runId: run.id,
          tickCreated: { lte: atTick },
          OR: [{ tickRetired: null }, { tickRetired: { gt: atTick } }],
          ...(kind !== undefined ? { kind } : {}),
        },
        orderBy: [{ tickCreated: "asc" }, { id: "asc" }],
        select: {
          id: true,
          kind: true,
          attributes: true,
          tickCreated: true,
          tickRetired: true,
        },
      });
      return rows.map(
        (r): SimulationEntityShape => ({
          id: r.id,
          kind: r.kind as SimulationEntityKind,
          attributes: r.attributes as Record<string, unknown>,
          tickCreated: r.tickCreated,
          tickRetired: r.tickRetired,
        }),
      );
    },
  };
}
