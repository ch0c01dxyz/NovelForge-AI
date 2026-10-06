/**
 * NF-WF-022C: endgame projection API client.
 *
 * - Ledger reads go to 022A's `GET .../endgame/ledger` (022A implements
 *   this route in parallel; the path is pinned by the 022 contract).
 * - The projection itself is driven through 021A's run lifecycle routes
 *   (contract §Routes: "None new — uses 021A/021B routes"). The scenario
 *   is built client-side with the pure `buildEndgameScenario` helper from
 *   `@novelforge/story-simulation` and interpreted with
 *   `interpretEndgameProjection`.
 * - Branch options come from the 020B branch list route.
 */
import { useApi } from "../../composables/useApi";
import type {
  EndgameClosureStatus,
  EndgameLedgerEntry,
} from "@novelforge/story-simulation";

export type { EndgameClosureStatus, EndgameLedgerEntry };

export interface BranchOption {
  id: string;
  name: string;
}

function endgameBase(workspaceId: string, novelId: string): string {
  return `/workspaces/${workspaceId}/novels/${novelId}/endgame`;
}

function simBase(workspaceId: string, novelId: string): string {
  return `/workspaces/${workspaceId}/novels/${novelId}/simulations`;
}

export interface EndgameProjectionScenarioBody {
  initialState: Record<string, unknown>;
  injections: Record<string, unknown[]>;
  seed: string;
  maxTicks: number;
}

export function useEndgameApi() {
  const { api } = useApi();

  /** 022A ledger list (pinned route; 022A implements in parallel). */
  async function fetchLedger(
    workspaceId: string,
    novelId: string,
  ): Promise<EndgameLedgerEntry[]> {
    const res = await api<{ entries: EndgameLedgerEntry[] }>(
      `${endgameBase(workspaceId, novelId)}/ledger`,
    );
    return res.entries;
  }

  /** 020B branch list for the projection's branch picker. */
  async function fetchBranches(
    workspaceId: string,
    novelId: string,
  ): Promise<BranchOption[]> {
    const res = await api<{ branches: BranchOption[] }>(
      `/workspaces/${workspaceId}/novels/${novelId}/branches`,
    );
    return res.branches;
  }

  /**
   * 021A createRun with the full scenario body (initialState +
   * injections). 021D's client type omits `injections`; the route
   * accepts it (021A contract), so this posts the complete body.
   */
  async function createProjectionRun(
    workspaceId: string,
    novelId: string,
    body: { branchId?: string; scenario: EndgameProjectionScenarioBody },
  ): Promise<{ id: string }> {
    const res = await api<{ run: { id: string } }>(
      simBase(workspaceId, novelId),
      { method: "POST", body: JSON.stringify(body) },
    );
    return res.run;
  }

  async function configureRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<void> {
    await api(`${simBase(workspaceId, novelId)}/${runId}/configure`, {
      method: "POST",
    });
  }

  async function startRun(
    workspaceId: string,
    novelId: string,
    runId: string,
  ): Promise<void> {
    await api(`${simBase(workspaceId, novelId)}/${runId}/start`, {
      method: "POST",
    });
  }

  async function stepRun(
    workspaceId: string,
    novelId: string,
    runId: string,
    ticks: number,
  ): Promise<Array<{ tickNumber: number; stateAfter: unknown }>> {
    const res = await api<{
      ticks: Array<{ tickNumber: number; stateAfter: unknown }>;
    }>(`${simBase(workspaceId, novelId)}/${runId}/step`, {
      method: "POST",
      body: JSON.stringify({ ticks }),
    });
    return res.ticks;
  }

  return {
    fetchLedger,
    fetchBranches,
    createProjectionRun,
    configureRun,
    startRun,
    stepRun,
  };
}
