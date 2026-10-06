/**
 * NF-WF-022B: Endgame callbacks + legacy API client.
 *
 * Thin typed wrapper around the 022B routes. No new API routes are added
 * in 022B UI scope — this module only consumes the backend surface.
 * (022A owns the ledger/gate/debt-report routes; 022C owns endgameApi.ts
 * for projections. This file is 022B's separate client.)
 *
 * Route shapes mirror:
 * - apps/api/src/endgame-callback-routes.ts (022B)
 */
import { useApi } from "../../composables/useApi";

// ---------------------------------------------------------------------------
// 022B shapes (mirror apps/api/src/services/endgame-callbacks.ts)
// ---------------------------------------------------------------------------

export type EndgameCallbackStatus = "PENDING" | "PAID";
export type EndgameLegacyKind = "CHARACTER" | "WORLD" | "THEMATIC";

export interface EndgameCallbackShape {
  id: string;
  novelId: string;
  setupEventId: string;
  payoffEventId: string | null;
  status: EndgameCallbackStatus;
  description: string | null;
  createdById: string;
  createdAt: string;
}

export interface EndgameLegacyShape {
  id: string;
  novelId: string;
  kind: EndgameLegacyKind;
  subjectId: string | null;
  description: string;
  createdById: string;
  createdAt: string;
}

function scope(workspaceId: string, novelId: string): string {
  return `/workspaces/${workspaceId}/novels/${novelId}/endgame`;
}

export function useEndgameCallbackApi(workspaceId: string, novelId: string) {
  const { api } = useApi();
  const base = scope(workspaceId, novelId);

  return {
    async createCallback(input: {
      setupEventId: string;
      payoffEventId?: string;
      description?: string;
    }): Promise<EndgameCallbackShape> {
      const { callback } = await api<{ callback: EndgameCallbackShape }>(
        `${base}/callbacks`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return callback;
    },

    async listCallbacks(status?: EndgameCallbackStatus): Promise<EndgameCallbackShape[]> {
      const qs = status ? `?status=${status}` : "";
      const { callbacks } = await api<{ callbacks: EndgameCallbackShape[] }>(
        `${base}/callbacks${qs}`,
      );
      return callbacks;
    },

    async listUnpaid(): Promise<EndgameCallbackShape[]> {
      const { callbacks } = await api<{ callbacks: EndgameCallbackShape[] }>(
        `${base}/callbacks/unpaid`,
      );
      return callbacks;
    },

    async recordLegacy(input: {
      kind: EndgameLegacyKind;
      subjectId?: string;
      description: string;
    }): Promise<EndgameLegacyShape> {
      const { legacy } = await api<{ legacy: EndgameLegacyShape }>(
        `${base}/legacy`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return legacy;
    },

    async listLegacies(kind?: EndgameLegacyKind): Promise<EndgameLegacyShape[]> {
      const qs = kind ? `?kind=${kind}` : "";
      const { legacies } = await api<{ legacies: EndgameLegacyShape[] }>(
        `${base}/legacy${qs}`,
      );
      return legacies;
    },
  };
}
