/**
 * NF-WF-022C: endgame closure projection — server orchestrator.
 *
 * Drives 021A's SimulationServices programmatically (create → configure →
 * start → step) to project "what if thread X stays OPEN?" scenarios against
 * the 022A closure ledger. There are NO new API routes in 022C scope
 * (contract §Routes): this module is consumed in two ways —
 *
 * 1. **Web UI** (`apps/web/app/components/endgame/EndgameProjectionView.vue`)
 *    drives the existing 021A HTTP routes directly and uses the pure
 *    helpers from `@novelforge/story-simulation` (buildEndgameScenario /
 *    interpretEndgameProjection) to build the scenario and interpret the
 *    result. No server round-trip beyond 021A's routes.
 * 2. **Future server use**: `runEndgameProjection` below orchestrates the
 *    same flow via 021A's service layer (e.g. if 022A's routes grow a
 *    projection endpoint later). The integration point is documented on
 *    the function.
 *
 * READ-ONLY on the ledger: the projection never writes to the ledger.
 * Ledger access is injected as `EndgameLedgerReader` (022A is implemented
 * in parallel; the reader is the pinned-shape seam). The simulation run
 * itself writes to 021 simulation tables only (Invariant 1).
 *
 * Capabilities: running a projection requires `simulation:manage`
 * (enforced inside 021A's service methods). The projection *view* is an
 * endgame surface — 022A's routes gate it with `endgame:read` (pinned
 * role mapping: OWNER/ADMIN/AUTHOR both, EDITOR read-only, VIEWER
 * neither). This module does not add or check capabilities itself.
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  buildEndgameScenario,
  interpretEndgameProjection,
  type EndgameLedgerEntry,
  type EndgameProjectionResult,
} from "@novelforge/story-simulation";
import type { SimulationServices } from "./simulation.ts";
import type { EndgameServices } from "./endgame.ts";

export type { EndgameLedgerEntry, EndgameProjectionResult };

/**
 * Pinned-shape seam to the 022A closure ledger.
 *
 * 022A's `GET .../endgame/ledger` returns entries with at least
 * { ledgerId, threadId, status, closed, criteria }. The production
 * reader is `createEndgameLedgerReader` below (thin adapter over 022A's
 * ledger service); tests may supply a stub. The projection never writes
 * to the ledger through either path.
 */
export type EndgameLedgerReader = (input: {
  workspaceId: string;
  novelId: string;
}) => Promise<EndgameLedgerEntry[]>;

/**
 * Production EndgameLedgerReader backed by 022A's ledger service.
 * Read-only: delegates to 022A's `listLedgerEntries` (gated by
 * `endgame:read` inside 022A's service). Shapes are structurally
 * identical to the projection's pinned `EndgameLedgerEntry`.
 */
export function createEndgameLedgerReader(
  endgameServices: EndgameServices,
  actorUserId: string,
): EndgameLedgerReader {
  return async ({ workspaceId, novelId }) => {
    const entries = await endgameServices.listLedgerEntries({
      actorUserId,
      workspaceId,
      novelId,
    });
    return entries.map((e) => ({
      ledgerId: e.ledgerId,
      threadId: e.threadId,
      status: e.status,
      closed: e.closed,
      criteria: e.criteria,
    }));
  };
}

export interface RunEndgameProjectionInput {
  db: NovelForgeDb;
  simulationServices: SimulationServices;
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  /**
   * 021A prerequisite 1 (contract F3): the run needs a branch. 022C does
   * NOT auto-provision — the caller picks (the web UI offers the 020B
   * branch picker). Omitted → 021A's configure 400s NO_BRANCH.
   */
  branchId?: string;
  readLedger: EndgameLedgerReader;
  /**
   * Thread ids the author plans to close, in order (one per tick).
   * Threads absent from the plan keep their ledger state — the
   * "what if X stays OPEN?" scenario.
   */
  closePlan: string[];
  seed?: string;
}

export interface EndgameProjectionRun
  extends EndgameProjectionResult {
  /** The 021 simulation run backing this projection (audit trail). */
  runId: string;
}

/**
 * Run an endgame closure projection via 021 simulation primitives.
 *
 * Lifecycle: createRun (DRAFT) → configureRun (prerequisites; 400
 * MODULE_NOT_ENABLED when the 021 module is not enabled — 021A's existing
 * prerequisite check, no new code invented) → startRun → stepRun.
 *
 * INTEGRATION POINT: if 022A later adds `POST .../endgame/projection`,
 * that route calls this function with a Prisma-backed EndgameLedgerReader
 * over `db.endgameLedger` and gates with `endgame:read` (+ `simulation:manage`
 * is enforced by 021A inside).
 */
export async function runEndgameProjection(
  input: RunEndgameProjectionInput,
): Promise<EndgameProjectionRun> {
  const {
    simulationServices,
    actorUserId,
    workspaceId,
    novelId,
    branchId,
    readLedger,
    closePlan,
    seed,
  } = input;

  // Read-only ledger read. The projection never writes to the ledger —
  // buildEndgameScenario / interpretEndgameProjection are pure.
  const entries = await readLedger({ workspaceId, novelId });

  const scenario = buildEndgameScenario(entries, { closePlan, seed });

  const run = await simulationServices.createRun({
    actorUserId,
    workspaceId,
    novelId,
    ...(branchId === undefined ? {} : { branchId }),
    scenario: {
      initialState: scenario.initialState,
      injections: scenario.injections,
      seed: scenario.seed,
      maxTicks: scenario.maxTicks,
    },
  });

  // Prerequisites enforced by 021A: NO_BRANCH / NO_SNAPSHOT /
  // MODULE_NOT_ENABLED surface here as SimulationError (400s).
  await simulationServices.configureRun({
    actorUserId,
    workspaceId,
    novelId,
    runId: run.id,
  });
  await simulationServices.startRun({
    actorUserId,
    workspaceId,
    novelId,
    runId: run.id,
  });
  const { ticks } = await simulationServices.stepRun({
    actorUserId,
    workspaceId,
    novelId,
    runId: run.id,
    ticks: scenario.maxTicks,
  });

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick) {
    throw new Error("endgame projection produced no ticks");
  }
  const result = interpretEndgameProjection(
    lastTick.stateAfter as Record<string, unknown>,
    entries,
    ticks.length,
  );
  return { ...result, runId: run.id };
}
