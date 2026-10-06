/**
 * NF-WF-022A: closure ledger / ending gate / debt report API client.
 *
 * Thin typed wrapper around the 022A routes. Kept separate from 022C's
 * `endgameApi.ts` (projection client) — the two modules are implemented in
 * parallel by separate actors.
 *
 * Status/type vocabulary is shared with 022C via
 * `@novelforge/story-simulation` (the 022A-pinned shapes live there so
 * both children build against one source of truth).
 *
 * Route shapes mirror apps/api/src/endgame-routes.ts (022A).
 */
import { useApi } from "../../composables/useApi";
import type { EndgameClosureStatus } from "@novelforge/story-simulation";

export type { EndgameClosureStatus };

export const ENDGAME_CLOSURE_STATUSES: readonly EndgameClosureStatus[] = [
  "MUST",
  "SHOULD",
  "MAY",
  "OPEN",
  "SEQUEL",
];

/** Mirrors apps/api/src/services/endgame.ts EndgameLedgerShape. */
export interface EndgameLedgerShape {
  id: string;
  ledgerId: string;
  novelId: string;
  threadId: string;
  threadTitle: string;
  threadStatus: string;
  closed: boolean;
  status: EndgameClosureStatus;
  criteria: string | null;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GateBlockingItem {
  ledgerId: string;
  threadId: string;
  threadTitle: string;
  status: EndgameClosureStatus;
  criteria: string | null;
}

export interface EndingGateShape {
  verdict: "BLOCKED" | "READY";
  blockingItems: GateBlockingItem[];
  approved: boolean;
  approvedById: string | null;
  approvedAt: string | null;
}

export interface DebtReportShape {
  unclosedMusts: { ledgerId: string; threadId: string; status: EndgameClosureStatus; criteria: string | null }[];
  unpaidCallbacks: { callbackId: string; setupEventId: string; description: string | null }[];
  openThreads: { threadId: string; title: string }[];
  sequelHooks: { ledgerId: string; threadId: string; description: string | null }[];
  generatedAt: string;
}

export interface StoryThreadOption {
  id: string;
  title: string;
  status: string;
  kind: string;
}

function base(workspaceId: string, novelId: string): string {
  return `/workspaces/${workspaceId}/novels/${novelId}/endgame`;
}

export function useEndgameLedgerApi(workspaceId: string, novelId: string) {
  const { api } = useApi();
  const prefix = base(workspaceId, novelId);

  return {
    listLedger(status?: EndgameClosureStatus): Promise<{ entries: EndgameLedgerShape[] }> {
      const qs = status ? `?status=${status}` : "";
      return api<{ entries: EndgameLedgerShape[] }>(`${prefix}/ledger${qs}`);
    },
    createLedger(body: {
      threadId: string;
      status: EndgameClosureStatus;
      criteria?: string;
      rationale?: string;
    }): Promise<{ entry: EndgameLedgerShape }> {
      return api<{ entry: EndgameLedgerShape }>(`${prefix}/ledger`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateLedger(
      ledgerId: string,
      body: { status?: EndgameClosureStatus; criteria?: string | null; rationale?: string | null },
    ): Promise<{ entry: EndgameLedgerShape }> {
      return api<{ entry: EndgameLedgerShape }>(`${prefix}/ledger/${ledgerId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    getGate(): Promise<{ gate: EndingGateShape }> {
      return api<{ gate: EndingGateShape }>(`${prefix}/gate`);
    },
    approveGate(): Promise<{ gate: EndingGateShape }> {
      return api<{ gate: EndingGateShape }>(`${prefix}/gate/approve`, { method: "POST" });
    },
    getDebtReport(): Promise<{ report: DebtReportShape }> {
      return api<{ report: DebtReportShape }>(`${prefix}/debt-report`);
    },
    /** 010 story threads — thread picker for the create dialog. */
    listThreads(): Promise<{ threads: StoryThreadOption[] }> {
      return api<{ threads: StoryThreadOption[] }>(
        `/workspaces/${workspaceId}/novels/${novelId}/story/threads`,
      );
    },
  };
}
