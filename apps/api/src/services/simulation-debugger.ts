/**
 * @novelforge/api — simulation debugger services (M9, NF-WF-024B).
 *
 * A debugger for 021 simulation runs: breakpoints, watch, deterministic
 * time-travel replay, and causal event trace — built on the 021D Simulation
 * Center. 021D already provides step/pause/resume and tick state diffs;
 * 024B adds what a stepper cannot do: stop *on condition*, observe *across*
 * ticks, go *backwards*, and walk *causality*.
 *
 * Invariants (024 contract §"Behavior and invariants"):
 * - Invariant 5 (Debugger never mutates history): breakpoints pause; watch
 *   observes; replay re-executes deterministically WITHOUT persisting.
 *   There is NO "edit state and continue" operation — grep-verified.
 * - 021 Invariant 6 (deterministic, replayable ticks): replay uses the
 *   shared pure `computeTick` from simulation.ts, so fidelity holds by
 *   construction. Replayed state must match the stored tick's stateAfter.
 * - Read-only: the debugger never modifies simulation state, only views
 *   it (breakpoint pause sets PAUSED + pause_reason, which is debugger
 *   metadata, not simulation history).
 * - No new capabilities: reuses `simulation:read` / `simulation:manage`
 *   (024 contract §Capabilities).
 *
 * Scope (contract §"Child 024B — Simulation debugger", pinned):
 * - Breakpoints: TICK (tick number); PREDICATE (entity-attribute predicate
 *   `attributes.<path> <op> <value>`); ON_PROPOSAL (on-proposal-raised).
 *   Hit → run pauses (021A PAUSED status reused; `pauseReason` recorded in
 *   the new nullable `pause_reason` column — no new PAUSED_BREAKPOINT
 *   status).
 * - Watch list: PREDICATE-kind breakpoints with `watch: true`; values shown
 *   per tick in a strip chart/table.
 * - Time-travel: replay to tick K by deterministic re-execution; replayed
 *   state must be byte-identical to the original tick's `stateAfter`.
 *   Pinned: replay is NON-PERSISTING — returns replayed state + fidelity
 *   proof; never overwrites stored ticks.
 * - Event trace: 021B causal-chain walk integrated into the debugger view
 *   (the UI reuses 021B's causes route; no new backend needed).
 * - NOT in scope: editing state mid-run (forbidden); LLM explanations;
 *   conditional breakpoints on LLM-judged predicates (deterministic only).
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "./platform.ts";
import { SimulationError, computeTick } from "./simulation.ts";

/**
 * NF-WF-024B: typed debugger refusals. 400s are input validation;
 * 404 is unknown run/breakpoint; 409 is invalid state for the operation.
 */
export type DebuggerErrorCode =
  | "INVALID_INPUT"
  | "RUN_NOT_FOUND"
  | "BREAKPOINT_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "REPLAY_OUT_OF_RANGE";

export class DebuggerError extends Error {
  readonly code: DebuggerErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: DebuggerErrorCode, message: string) {
    super(message);
    this.name = "DebuggerError";
    this.code = code;
    this.statusCode =
      code === "RUN_NOT_FOUND" || code === "BREAKPOINT_NOT_FOUND"
        ? 404
        : code === "INVALID_STATUS_TRANSITION" || code === "REPLAY_OUT_OF_RANGE"
          ? 409
          : 400;
  }
}

/** Pinned breakpoint kinds (contract §Scope). */
export type BreakpointKind = "TICK" | "PREDICATE" | "ON_PROPOSAL";

/** Predicate shape for PREDICATE breakpoints: `attributes.<path> <op> <value>`. */
export interface BreakpointPredicate {
  /** Dot-separated path into the tick's stateAfter (e.g. "population"). */
  path: string;
  /** Deterministic comparison operator (no LLM-judged predicates). */
  op: ">" | "<" | ">=" | "<=" | "==" | "!=";
  value: unknown;
}

export interface BreakpointShape {
  id: string;
  runId: string;
  kind: BreakpointKind;
  predicate: unknown | null;
  watch: boolean;
  enabled: boolean;
  createdAt: Date;
}

export interface BreakpointHit {
  breakpointId: string;
  kind: BreakpointKind;
  tickNumber: number;
  /** Human-readable reason (also stored as the run's pause_reason). */
  reason: string;
  /** For ON_PROPOSAL: the proposals that triggered the hit. */
  proposals?: Array<{ id: string; tickNumber: number; trigger: string }>;
}

export interface ReplayResult {
  runId: string;
  toTick: number;
  replayedState: Record<string, unknown>;
  fidelity: {
    /** True when the replayed state matches the stored tick's stateAfter. */
    matches: boolean;
    /** Canonical JSON of the replayed state (for the fidelity badge). */
    replayedCanonical: string;
    /** Canonical JSON of the stored state (for comparison). */
    storedCanonical: string;
  };
}

export interface WatchValue {
  breakpointId: string;
  path: string;
  values: Array<{ tickNumber: number; value: unknown }>;
}

export interface DebuggerServices {
  createBreakpoint(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    kind: BreakpointKind;
    predicate?: BreakpointPredicate | { tickNumber: number } | null;
    watch?: boolean;
    enabled?: boolean;
  }): Promise<BreakpointShape>;

  listBreakpoints(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<BreakpointShape[]>;

  deleteBreakpoint(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    breakpointId: string;
  }): Promise<void>;

  /**
   * Deterministic time-travel replay. Re-executes ticks 1..toTick from the
   * run's initial state WITHOUT persisting. Returns the replayed state +
   * fidelity proof (byte-identical comparison with the stored tick).
   * Requires simulation:read.
   */
  replayRun(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    toTick: number;
  }): Promise<ReplayResult>;

  /**
   * Watch strip data: for each enabled watch breakpoint, the predicate's
   * path value across ticks 1..currentTick. Requires simulation:read.
   */
  getWatchValues(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
  }): Promise<WatchValue[]>;

  /**
   * Step with breakpoints. Steps one tick (via 021A's stepRun), then
   * checks enabled breakpoints. On hit: pauses the run (PAUSED +
   * pause_reason) and returns the hit. Requires simulation:manage.
   */
  debugStep(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    /** Injected 021A step function (avoids circular import). */
    stepFn: (args: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      runId: string;
      ticks: number;
    }) => Promise<{
      run: { status: string; currentTick: number };
      ticks: Array<{
        tickNumber: number;
        stateBefore: unknown;
        stateAfter: unknown;
        events: unknown[];
      }>;
    }>;
  }): Promise<{
    tickNumber: number;
    stateAfter: unknown;
    breakpointHit: BreakpointHit | null;
    runStatus: string;
    pauseReason: string | null;
  }>;
}

/**
 * Canonical JSON: recursively sorted keys, so byte-identity comparison
 * is not fooled by key insertion order. Deterministic for JSON values.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Get a dot-separated path from a JSON object (e.g. "population"). */
export function getPathValue(obj: unknown, path: string): unknown {
  // Strip the conceptual "attributes." namespace prefix if present.
  const clean = path.startsWith("attributes.") ? path.slice("attributes.".length) : path;
  const parts = clean.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Deterministic predicate evaluation (no LLM). */
export function evaluatePredicate(
  actual: unknown,
  op: BreakpointPredicate["op"],
  expected: unknown,
): boolean {
  switch (op) {
    case ">":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "<":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case ">=":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "<=":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      return false;
  }
}

export function createDebuggerServices({
  db,
}: {
  db: NovelForgeDb;
}): DebuggerServices {
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

  async function getRunOrThrow(workspaceId: string, novelId: string, runId: string) {
    const run = await db.simulationRun.findFirst({
      where: { id: runId, workspaceId, novelId },
    });
    if (!run) throw new DebuggerError("RUN_NOT_FOUND", "simulation run not found");
    return run;
  }

  function toShape(bp: {
    id: string;
    runId: string;
    kind: string;
    predicate: unknown;
    watch: boolean;
    enabled: boolean;
    createdAt: Date;
  }): BreakpointShape {
    return {
      id: bp.id,
      runId: bp.runId,
      kind: bp.kind as BreakpointKind,
      predicate: bp.predicate,
      watch: bp.watch,
      enabled: bp.enabled,
      createdAt: bp.createdAt,
    };
  }

  function validatePredicate(
    kind: BreakpointKind,
    predicate: unknown,
  ): void {
    if (kind === "TICK") {
      const p = predicate as { tickNumber?: unknown } | null;
      if (!p || typeof p.tickNumber !== "number" || !Number.isInteger(p.tickNumber) || p.tickNumber < 1) {
        throw new DebuggerError(
          "INVALID_INPUT",
          "TICK breakpoint requires predicate.tickNumber (positive integer)",
        );
      }
    } else if (kind === "PREDICATE") {
      const p = predicate as BreakpointPredicate | null;
      if (
        !p ||
        typeof p.path !== "string" ||
        p.path.length === 0 ||
        ![">", "<", ">=", "<=", "==", "!="].includes(p.op)
      ) {
        throw new DebuggerError(
          "INVALID_INPUT",
          "PREDICATE breakpoint requires predicate { path, op, value } with op in >,<,>=,<=,==,!=",
        );
      }
    } else if (kind === "ON_PROPOSAL") {
      // predicate must be null/undefined for ON_PROPOSAL.
      if (predicate !== null && predicate !== undefined) {
        throw new DebuggerError(
          "INVALID_INPUT",
          "ON_PROPOSAL breakpoint takes no predicate",
        );
      }
    }
  }

  /**
   * Check enabled breakpoints against a just-completed tick.
   * Returns the first hit (TICK < PREDICATE < ON_PROPOSAL priority),
   * or null. Pure evaluation — no persistence here.
   */
  async function checkBreakpoints(
    workspaceId: string,
    novelId: string,
    runId: string,
    tickNumber: number,
    stateAfter: unknown,
    onlyOnProposal = false,
  ): Promise<BreakpointHit | null> {
    // Watch entries (watch=true) are observe-only — they feed the watch
    // strip but never pause the run (contract §"Watch list").
    const breakpoints = await db.simulationBreakpoint.findMany({
      where: { runId, enabled: true, watch: false, ...(onlyOnProposal ? { kind: "ON_PROPOSAL" } : {}) },
      orderBy: { createdAt: "asc" },
    });

    // Priority: TICK first (most specific), then PREDICATE, then ON_PROPOSAL.
    const byKind = (k: BreakpointKind) => breakpoints.filter((b) => b.kind === k);

    for (const bp of byKind("TICK")) {
      const p = bp.predicate as { tickNumber: number } | null;
      if (p && p.tickNumber === tickNumber) {
        return {
          breakpointId: bp.id,
          kind: "TICK",
          tickNumber,
          reason: `Breakpoint hit: tick ${tickNumber} (TICK breakpoint)`,
        };
      }
    }

    for (const bp of byKind("PREDICATE")) {
      const p = bp.predicate as BreakpointPredicate | null;
      if (!p) continue;
      const actual = getPathValue(stateAfter, p.path);
      if (evaluatePredicate(actual, p.op, p.value)) {
        return {
          breakpointId: bp.id,
          kind: "PREDICATE",
          tickNumber,
          reason:
            `Breakpoint hit: ${p.path} ${p.op} ${JSON.stringify(p.value)} ` +
            `(actual: ${JSON.stringify(actual)}) at tick ${tickNumber}`,
        };
      }
    }

    const onProposal = byKind("ON_PROPOSAL");
    if (onProposal.length > 0) {
      // A proposal is "raised" when a PROPOSED simulation_proposal exists
      // for this run (021B). The breakpoint fires with all open proposals
      // listed (contract evaluation scenario 3: "proposal storm").
      const proposals = await db.simulationProposal.findMany({
        where: { runId, status: "PROPOSED" },
        select: { id: true, tickNumber: true, trigger: true },
        orderBy: { createdAt: "asc" },
      });
      if (proposals.length > 0) {
        const firstBp = onProposal[0];
        if (!firstBp) return null;
        return {
          breakpointId: firstBp.id,
          kind: "ON_PROPOSAL",
          tickNumber,
          reason:
            `Breakpoint hit: ${proposals.length} proposal(s) raised ` +
            `(ON_PROPOSAL breakpoint) at tick ${tickNumber}`,
          proposals: proposals.map((p) => ({
            id: p.id,
            tickNumber: p.tickNumber,
            trigger: p.trigger,
          })),
        };
      }
    }

    return null;
  }

  return {
    async createBreakpoint({
      actorUserId,
      workspaceId,
      novelId,
      runId,
      kind,
      predicate = null,
      watch = false,
      enabled = true,
    }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      await getRunOrThrow(workspaceId, novelId, runId);

      if (!["TICK", "PREDICATE", "ON_PROPOSAL"].includes(kind)) {
        throw new DebuggerError("INVALID_INPUT", `unknown breakpoint kind: ${kind}`);
      }
      validatePredicate(kind, predicate);

      // Watch entries must be PREDICATE-kind (contract §Migration).
      if (watch && kind !== "PREDICATE") {
        throw new DebuggerError(
          "INVALID_INPUT",
          "watch entries must be PREDICATE-kind breakpoints",
        );
      }

      const bp = await db.simulationBreakpoint.create({
        data: {
          workspaceId,
          novelId,
          runId,
          kind,
          predicate: (predicate ?? undefined) as object | undefined,
          watch,
          enabled,
        },
      });
      return toShape(bp);
    },

    async listBreakpoints({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      await getRunOrThrow(workspaceId, novelId, runId);
      const bps = await db.simulationBreakpoint.findMany({
        where: { runId },
        orderBy: { createdAt: "asc" },
      });
      return bps.map(toShape);
    },

    async deleteBreakpoint({
      actorUserId,
      workspaceId,
      novelId,
      runId,
      breakpointId,
    }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      await getRunOrThrow(workspaceId, novelId, runId);
      const bp = await db.simulationBreakpoint.findFirst({
        where: { id: breakpointId, runId },
      });
      if (!bp) throw new DebuggerError("BREAKPOINT_NOT_FOUND", "breakpoint not found");
      await db.simulationBreakpoint.delete({ where: { id: bp.id } });
    },

    async replayRun({ actorUserId, workspaceId, novelId, runId, toTick }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (!Number.isInteger(toTick) || toTick < 1 || toTick > run.currentTick) {
        throw new DebuggerError(
          "REPLAY_OUT_OF_RANGE",
          `toTick must be between 1 and the run's current tick (${run.currentTick})`,
        );
      }

      const scenario = await db.simulationScenario.findUnique({
        where: { runId: run.id },
      });
      if (!scenario) throw new DebuggerError("INVALID_INPUT", "run has no scenario");

      const storedTick = await db.simulationTick.findUnique({
        where: { runId_tickNumber: { runId: run.id, tickNumber: toTick } },
      });
      if (!storedTick) {
        throw new DebuggerError("INVALID_INPUT", `tick ${toTick} not found`);
      }

      // Deterministic re-execution (021 Invariant 6): start from the
      // scenario's initial state, apply the shared pure computeTick for
      // ticks 1..toTick. NO persistence — this is a pure read (024
      // Invariant 5: replay never mutates history).
      const injections = scenario.injections as Record<string, unknown[]>;
      let state: Record<string, unknown> = {
        ...(scenario.initialState as Record<string, unknown>),
      };
      for (let n = 1; n <= toTick; n++) {
        const { stateAfter } = computeTick(state, n, injections);
        state = stateAfter;
      }

      // Fidelity proof: canonical JSON comparison (byte-identical modulo
      // key order — the tick engine is deterministic, so the replayed
      // state must match the stored stateAfter exactly).
      const replayedCanonical = canonicalJson(state);
      const storedCanonical = canonicalJson(storedTick.stateAfter);
      const matches = replayedCanonical === storedCanonical;

      return {
        runId: run.id,
        toTick,
        replayedState: state,
        fidelity: { matches, replayedCanonical, storedCanonical },
      };
    },

    async getWatchValues({ actorUserId, workspaceId, novelId, runId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      const watches = await db.simulationBreakpoint.findMany({
        where: { runId, watch: true, enabled: true },
        orderBy: { createdAt: "asc" },
      });
      if (watches.length === 0) return [];

      // Load all ticks once (1..currentTick) for the strip.
      const ticks = await db.simulationTick.findMany({
        where: { runId, tickNumber: { gte: 1, lte: run.currentTick } },
        select: { tickNumber: true, stateAfter: true },
        orderBy: { tickNumber: "asc" },
      });

      return watches.map((w) => {
        const p = w.predicate as BreakpointPredicate | null;
        const path = p?.path ?? "";
        return {
          breakpointId: w.id,
          path,
          values: ticks.map((t) => ({
            tickNumber: t.tickNumber,
            value: getPathValue(t.stateAfter, path),
          })),
        };
      });
    },

    async debugStep({
      actorUserId,
      workspaceId,
      novelId,
      runId,
      stepFn,
    }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const run = await getRunOrThrow(workspaceId, novelId, runId);

      if (run.status === "PAUSED_PROPOSAL") {
        // Observe the approval boundary without advancing or changing its status.
        const tick = await db.simulationTick.findFirst({
          where: { runId, tickNumber: run.currentTick },
        });
        return {
          tickNumber: run.currentTick,
          stateAfter: tick?.stateAfter ?? null,
          breakpointHit: await checkBreakpoints(workspaceId, novelId, runId, run.currentTick, tick?.stateAfter, true),
          runStatus: run.status,
          pauseReason: run.pauseReason,
        };
      }

      if (run.status !== "RUNNING") {
        throw new SimulationError(
          "INVALID_STATUS_TRANSITION",
          `only RUNNING runs can debug-step (status is ${run.status})`,
        );
      }

      // Step exactly one tick via 021A's stepRun (no behavior change to
      // 021A; the debugger drives the existing API).
      const { ticks } = await stepFn({
        actorUserId,
        workspaceId,
        novelId,
        runId,
        ticks: 1,
      });
      if (ticks.length === 0) {
        // Run completed (maxTicks reached) — no breakpoint to check.
        const refreshed = await getRunOrThrow(workspaceId, novelId, runId);
        return {
          tickNumber: refreshed.currentTick,
          stateAfter: null,
          breakpointHit: null,
          runStatus: refreshed.status,
          pauseReason: refreshed.pauseReason,
        };
      }

      const tick = ticks[0];
      if (!tick) {
        throw new DebuggerError("INVALID_INPUT", "step produced no tick");
      }
      const hit = await checkBreakpoints(
        workspaceId,
        novelId,
        runId,
        tick.tickNumber,
        tick.stateAfter,
      );

      if (hit) {
        // Pause with reason (021A PAUSED status reused — no new
        // PAUSED_BREAKPOINT status per contract). The pause_reason is
        // debugger metadata, not simulation history (Invariant 5).
        await db.simulationRun.updateMany({
          where: { id: run.id, status: "RUNNING" },
          data: { status: "PAUSED", pauseReason: hit.reason },
        });
        const refreshed = await getRunOrThrow(workspaceId, novelId, runId);
        return {
          tickNumber: tick.tickNumber,
          stateAfter: tick.stateAfter,
          breakpointHit: hit,
          runStatus: refreshed.status,
          pauseReason: refreshed.pauseReason,
        };
      }

      const refreshed = await getRunOrThrow(workspaceId, novelId, runId);
      return {
        tickNumber: tick.tickNumber,
        stateAfter: tick.stateAfter,
        breakpointHit: null,
        runStatus: refreshed.status,
        pauseReason: refreshed.pauseReason,
      };
    },
  };
}
