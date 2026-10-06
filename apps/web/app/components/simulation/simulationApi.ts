/**
 * NF-WF-021D: Simulation Center API client.
 *
 * Thin typed wrapper around the 021A run lifecycle routes, 021B
 * causal/proposal routes, and 024B debugger routes.
 *
 * Route shapes mirror:
 * - apps/api/src/simulation-routes.ts (021A)
 * - apps/api/src/simulation-causality-routes.ts (021B)
 * - apps/api/src/simulation-debugger-routes.ts (024B)
 */
import { useApi } from "../../composables/useApi";

// ---------------------------------------------------------------------------
// 021A shapes (mirror apps/api/src/services/simulation.ts)
// ---------------------------------------------------------------------------

export type SimulationRunStatus =
  | "DRAFT"
  | "CONFIGURED"
  | "RUNNING"
  | "PAUSED"
  | "PAUSED_PROPOSAL"
  | "COMPLETED"
  | "ABORTED";

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
  /** NF-WF-024B: why the run paused (breakpoint hit). Null unless paused by debugger. */
  pauseReason: string | null;
  createdAt: string;
}

export interface SimulationTickShape {
  id: string;
  runId: string;
  tickNumber: number;
  stateBefore: unknown;
  stateAfter: unknown;
  events: SimulationEventShape[];
}

export interface SimulationEventShape {
  id: string;
  runId: string;
  tickNumber: number;
  kind: string;
  entityId: string | null;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// 021B shapes (mirror apps/api/src/services/simulation-causality.ts)
// ---------------------------------------------------------------------------

export type CausalKind = "DIRECT" | "ENABLING" | "PREVENTING";
export type ProposalStatus = "PROPOSED" | "APPROVED" | "REJECTED";
export type DivergenceTrigger =
  | "THRESHOLD_SPAN"
  | "NO_DOMINANT_OUTCOME"
  | "COUNTERFACTUAL_UNCERTAINTY";

export interface OutcomeAlternative {
  id: string;
  outcome: unknown;
  evidence: unknown;
  confidence: number;
}

export interface CausalChainNode {
  linkId: string;
  eventId: string;
  causeEventId: string | null;
  causeStateRef: unknown;
  kind: CausalKind;
  evidence: unknown;
  depth: number;
  causes: CausalChainNode[];
}

export interface Counterfactual {
  linkId: string;
  preventedEventId: string;
  preventingEventId: string | null;
  evidence: unknown;
}

export interface ProposalSummary {
  id: string;
  runId: string;
  tickNumber: number;
  kind: string;
  status: ProposalStatus;
  alternatives: OutcomeAlternative[];
  trigger: DivergenceTrigger;
  reason: string;
  rationale: string | null;
  chosenAlternativeId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 024B shapes (mirror apps/api/src/services/simulation-debugger.ts)
// ---------------------------------------------------------------------------

export type BreakpointKind = "TICK" | "PREDICATE" | "ON_PROPOSAL";

export interface BreakpointPredicate {
  path: string;
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
  createdAt: string;
}

export interface BreakpointHit {
  breakpointId: string;
  kind: BreakpointKind;
  tickNumber: number;
  reason: string;
  proposals?: Array<{ id: string; tickNumber: number; trigger: string }>;
}

export interface ReplayResult {
  runId: string;
  toTick: number;
  replayedState: Record<string, unknown>;
  fidelity: {
    matches: boolean;
    replayedCanonical: string;
    storedCanonical: string;
  };
}

export interface WatchValue {
  breakpointId: string;
  path: string;
  values: Array<{ tickNumber: number; value: unknown }>;
}

export interface DebugStepResult {
  tickNumber: number;
  stateAfter: unknown;
  breakpointHit: BreakpointHit | null;
  runStatus: SimulationRunStatus;
  pauseReason: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

function basePath(workspaceId: string, novelId: string): string {
  return `/workspaces/${workspaceId}/novels/${novelId}/simulations`;
}

export function useSimulationApi() {
  const { api } = useApi();

  // --- 021A: run lifecycle ---

  async function listRuns(
    workspaceId: string,
    novelId: string,
  ): Promise<SimulationRunShape[]> {
    const res = await api<{ runs: SimulationRunShape[] }>(
      basePath(workspaceId, novelId),
    );
    return res.runs;
  }

  async function getRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape & { scenario: unknown | null }> {
    const res = await api<{ run: SimulationRunShape & { scenario: unknown | null } }>(
      `${basePath(workspaceId, novelId)}/${runId}`,
    );
    return res.run;
  }

  async function createRun(
    workspaceId: string,
    novelId: string,
    body: {
      branchId?: string;
      scenario?: {
        seed?: string;
        maxTicks?: number;
        initialState?: Record<string, unknown>;
      };
    },
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      basePath(workspaceId, novelId),
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return res.run;
  }

  async function configureRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/configure`,
      { method: "POST" },
    );
    return res.run;
  }

  async function startRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/start`,
      { method: "POST" },
    );
    return res.run;
  }

  async function stepRun(
    workspaceId: string,
    novelId: string,
    runId: string,
    ticks?: number,
  ): Promise<{ run: SimulationRunShape; ticks: SimulationTickShape[] }> {
    const res = await api<{ run: SimulationRunShape; ticks: SimulationTickShape[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/step`,
      {
        method: "POST",
        body: JSON.stringify(ticks !== undefined ? { ticks } : {}),
      },
    );
    return res;
  }

  async function pauseRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/pause`,
      { method: "POST" },
    );
    return res.run;
  }

  async function resumeRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/resume`,
      { method: "POST" },
    );
    return res.run;
  }

  async function abortRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<SimulationRunShape> {
    const res = await api<{ run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/abort`,
      { method: "POST" },
    );
    return res.run;
  }

  async function getTick(
    workspaceId: string,
    novelId: string,
    runId: string,
    tickNumber: number,
  ): Promise<SimulationTickShape> {
    const res = await api<{ tick: SimulationTickShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/ticks/${tickNumber}`,
    );
    return res.tick;
  }

  // --- 021B: causal evidence ---

  async function getCausalChain(
    workspaceId: string,
    novelId: string,
    runId: string,
    eventId: string,
    maxDepth?: number,
  ): Promise<CausalChainNode[]> {
    const qs = maxDepth !== undefined ? `?maxDepth=${maxDepth}` : "";
    const res = await api<{ chain: CausalChainNode[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/events/${eventId}/causes${qs}`,
    );
    return res.chain;
  }

  async function getCounterfactuals(
    workspaceId: string,
    novelId: string,
    runId: string,
    eventId: string,
  ): Promise<Counterfactual[]> {
    const res = await api<{ counterfactuals: Counterfactual[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/events/${eventId}/counterfactuals`,
    );
    return res.counterfactuals;
  }

  // --- 021B: proposals ---

  async function listProposals(
    workspaceId: string,
    novelId: string,
    runId: string,
    status?: ProposalStatus,
  ): Promise<ProposalSummary[]> {
    const qs = status !== undefined ? `?status=${status}` : "";
    const res = await api<{ proposals: ProposalSummary[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/proposals${qs}`,
    );
    return res.proposals;
  }

  async function decideProposal(
    workspaceId: string,
    novelId: string,
    runId: string,
    proposalId: string,
    body: { approve: boolean; choice?: string; rationale?: string },
  ): Promise<{ proposal: ProposalSummary; run: SimulationRunShape }> {
    const res = await api<{ proposal: ProposalSummary; run: SimulationRunShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/proposals/${proposalId}/decide`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return res;
  }

  // --- 024B: debugger ---

  async function listBreakpoints(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<BreakpointShape[]> {
    const res = await api<{ breakpoints: BreakpointShape[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/breakpoints`,
    );
    return res.breakpoints;
  }

  async function createBreakpoint(
    workspaceId: string,
    novelId: string,
    runId: string,
    body: {
      kind: BreakpointKind;
      predicate?: { tickNumber: number } | BreakpointPredicate | null;
      watch?: boolean;
      enabled?: boolean;
    },
  ): Promise<BreakpointShape> {
    const res = await api<{ breakpoint: BreakpointShape }>(
      `${basePath(workspaceId, novelId)}/${runId}/breakpoints`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return res.breakpoint;
  }

  async function deleteBreakpoint(
    workspaceId: string,
    novelId: string,
    runId: string,
    breakpointId: string,
  ): Promise<void> {
    await api(
      `${basePath(workspaceId, novelId)}/${runId}/breakpoints/${breakpointId}`,
      { method: "DELETE" },
    );
  }

  async function replayRun(
    workspaceId: string,
    novelId: string,
    runId: string,
    toTick: number,
  ): Promise<ReplayResult> {
    const res = await api<ReplayResult>(
      `${basePath(workspaceId, novelId)}/${runId}/replay`,
      {
        method: "POST",
        body: JSON.stringify({ toTick }),
      },
    );
    return res;
  }

  async function getWatchValues(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<WatchValue[]> {
    const res = await api<{ watches: WatchValue[] }>(
      `${basePath(workspaceId, novelId)}/${runId}/watch`,
    );
    return res.watches;
  }

  async function debugStep(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<DebugStepResult> {
    const res = await api<DebugStepResult>(
      `${basePath(workspaceId, novelId)}/${runId}/debug-step`,
      { method: "POST" },
    );
    return res;
  }

  return {
    listRuns,
    getRun,
    createRun,
    configureRun,
    startRun,
    stepRun,
    pauseRun,
    resumeRun,
    abortRun,
    getTick,
    getCausalChain,
    getCounterfactuals,
    listProposals,
    decideProposal,
    listBreakpoints,
    createBreakpoint,
    deleteBreakpoint,
    replayRun,
    getWatchValues,
    debugStep,
  };
}
