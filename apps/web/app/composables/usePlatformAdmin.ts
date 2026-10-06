/**
 * Thin fetch wrapper for the platform-admin API (NF-WF-018B).
 *
 * SUPER_ADMIN-only routes (the server enforces; this layer is a view).
 * No business logic here — the composable only shapes requests.
 */
import { useApi, ApiError } from "./useApi";

export type PlatformRole = "SUPER_ADMIN" | null;

export interface GatewayView {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number;
  maxRetries: number;
  health: string;
  lastHealthCheckAt: string | null;
  lastErrorAt: string | null;
  lastErrorCategory: string | null;
  consecutiveFailures: number;
  /** True when a credential is stored. The value itself is never returned. */
  hasCredential: boolean;
}

export interface ModelView {
  id: string;
  gatewayId: string;
  modelId: string;
  displayName: string | null;
  capabilities: string[];
  contextWindow: number | null;
  enabled: boolean;
}

export interface ProfileMapping {
  profile: string;
  modelId: string;
  gatewayId: string;
  priority: number;
  enabled: boolean;
}

export interface PlatformAuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface CreateGatewayInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  priority?: number;
  weight?: number;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export interface UpdateGatewayInput {
  name?: string;
  baseUrl?: string;
  /** Write-only: rotating re-encrypts; the UI never prefills this. */
  apiKey?: string;
  priority?: number;
  weight?: number;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export function usePlatformAdmin() {
  const { api } = useApi();

  /**
   * The current user's platform role for UI gating (progressive
   * enhancement). Returns null for regular users — the server's 403
   * gates are the enforcement.
   */
  async function getPlatformRole(): Promise<PlatformRole> {
    const session = await api<{ userId: string; platformRole: PlatformRole }>(
      `/auth/session`,
    );
    return session.platformRole;
  }

  function isSuperAdmin(role: PlatformRole): boolean {
    return role === "SUPER_ADMIN";
  }

  async function listGateways(): Promise<GatewayView[]> {
    return api<GatewayView[]>(`/gateways`);
  }

  async function createGateway(input: CreateGatewayInput): Promise<{ id: string }> {
    return api<{ id: string }>(`/gateways`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async function updateGateway(
    gatewayId: string,
    patch: UpdateGatewayInput,
  ): Promise<{ status: string }> {
    return api<{ status: string }>(`/gateways/${gatewayId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async function deleteGateway(gatewayId: string): Promise<{ status: string }> {
    return api<{ status: string }>(`/gateways/${gatewayId}`, { method: "DELETE" });
  }

  async function healthCheck(): Promise<
    Array<{ gatewayId: string; healthy: boolean; latencyMs: number }>
  > {
    return api(`/gateways/health-check`, { method: "POST" });
  }

  async function syncModels(
    gatewayId: string,
  ): Promise<{ discovered: Array<{ modelId: string }> }> {
    return api(`/gateways/${gatewayId}/sync-models`, { method: "POST" });
  }

  async function listModels(): Promise<ModelView[]> {
    return api<ModelView[]>(`/models`);
  }

  async function setModelEnabled(
    modelId: string,
    enabled: boolean,
  ): Promise<{ status: string }> {
    return api<{ status: string }>(`/models/${modelId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  }

  async function listProfileMappings(): Promise<ProfileMapping[]> {
    return api<ProfileMapping[]>(`/model-profiles`);
  }

  async function setProfileMapping(input: {
    profile: string;
    modelId: string;
    priority?: number;
    enabled?: boolean;
  }): Promise<{ status: string }> {
    return api<{ status: string }>(`/model-profiles`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async function getRoutingStrategy(): Promise<{ strategy: string }> {
    return api<{ strategy: string }>(`/admin/routing-strategy`);
  }

  async function listAuditLog(
    action?: string,
    limit?: number,
  ): Promise<PlatformAuditLogEntry[]> {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (limit !== undefined) params.set("limit", String(limit));
    const qs = params.toString();
    return api<PlatformAuditLogEntry[]>(`/admin/audit-log${qs ? `?${qs}` : ""}`);
  }

  return {
    getPlatformRole,
    isSuperAdmin,
    listGateways,
    createGateway,
    updateGateway,
    deleteGateway,
    healthCheck,
    syncModels,
    listModels,
    setModelEnabled,
    listProfileMappings,
    setProfileMapping,
    getRoutingStrategy,
    listAuditLog,
  };
}

export { ApiError };
