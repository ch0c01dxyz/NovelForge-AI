import { useApi } from "./useApi";

/**
 * Thin fetch wrapper over the receipts routes (NF-WF-018C). No business
 * logic lives here — the server owns authorization, the ledger shapes,
 * and the audit allowlists; the UI gates below are progressive
 * enhancement only.
 *
 * Additive backend items used: `GET /api/workspaces/:workspaceId/audit-log`
 * and (GAP-067) `GET .../novels/:novelId/final-text-reviews`. The
 * generation ledger rides the frozen routes.
 */

export type WorkspaceRole = "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER";

export interface GenerationRow {
  id: string;
  novelId: string | null;
  userId: string | null;
  task: string;
  component?: string;
  artifactId?: string | null;
  modelProfile: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "INCOMPLETE" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface GenerationAttemptRow {
  attemptNumber: number;
  gatewayId: string | null;
  modelId: string | null;
  requestedModelId?: string | null;
  reportedModelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status: string;
  errorCategory: string;
  latencyMs: number | null;
}

export interface GenerationDetail extends GenerationRow {
  attempts: GenerationAttemptRow[];
}

export interface UsageAnalyticsView {
  summary: { requests: number; attempts: number; inputTokens: string; outputTokens: string; totalTokens: string;
    unknownUsageRequests: number; unknownUsageAttempts: number; legacyRequests: number };
  rows: Array<{ component: string; task: string; artifactId: string | null; model: string | null; requests: number;
    inputTokens: string; outputTokens: string; totalTokens: string; unknownUsageRecords: number; legacyRecords: number }>;
  hasMore: boolean;
}

export interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface FinalTextReviewRow {
  id: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterVersionId: string;
  verdict: "PASS" | "FAIL";
  hardViolations: unknown;
  advisory: unknown;
  evaluatedPolicies: unknown;
  revisionId: string;
  createdAt: string;
}

export interface NovelSummary {
  id: string;
  title: string;
  slug: string;
}

export interface HealthCategoryResult {
  status: string;
  findings?: unknown[];
  [key: string]: unknown;
}

export interface HealthResult {
  [category: string]: unknown;
}

/**
 * Client-side capability derivation (progressive enhancement — the
 * server is the enforcer). Mirrors `ROLE_CAPABILITIES` in
 * `packages/auth/authorization.ts`; do not invent grants here.
 */
export function canReadReceipts(role: WorkspaceRole | null): boolean {
  // generation:read holders: OWNER, ADMIN, AUTHOR, EDITOR.
  return role !== null && role !== "VIEWER";
}
export function canReadEvaluations(role: WorkspaceRole | null): boolean {
  // canon:read holders: OWNER, ADMIN, AUTHOR, EDITOR.
  return role !== null && role !== "VIEWER";
}
export function canReadAuditTrail(role: WorkspaceRole | null): boolean {
  // workflow:manage holders: OWNER, ADMIN.
  return role === "OWNER" || role === "ADMIN";
}

/** The pinned 018C workspace audit-action allowlist (server-enforced). */
export const RECEIPT_AUDIT_ACTIONS = [
  "agent.created",
  "agent.published",
  "skill.created",
  "skill.published",
  "workflow.created",
  "workflow.published",
  "workflow.deleted",
  "workflow.run",
  "generation.completed",
  "generation.failed",
] as const;

export function useReceipts() {
  const { api } = useApi();

  function usageAnalytics(workspaceId: string, query: { novelId?: string; component?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    return api<UsageAnalyticsView>(`/workspaces/${workspaceId}/generations/usage?${params}`);
  }

  function listGenerations(
    workspaceId: string,
    query: { novelId?: string; limit?: number } = {},
  ) {
    const params = new URLSearchParams();
    if (query.novelId) params.set("novelId", query.novelId);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return api<GenerationRow[]>(
      `/workspaces/${workspaceId}/generations${qs ? `?${qs}` : ""}`,
    );
  }

  function getGeneration(workspaceId: string, generationId: string) {
    return api<GenerationDetail>(
      `/workspaces/${workspaceId}/generations/${generationId}`,
    );
  }

  function listNovels(workspaceId: string) {
    return api<NovelSummary[]>(`/workspaces/${workspaceId}/novels`);
  }

  function listFinalTextReviews(workspaceId: string, novelId: string) {
    return api<FinalTextReviewRow[]>(
      `/workspaces/${workspaceId}/novels/${novelId}/final-text-reviews`,
    );
  }

  function getStoryHealth(workspaceId: string, novelId: string) {
    return api<HealthResult>(
      `/workspaces/${workspaceId}/novels/${novelId}/story-health`,
    );
  }

  function listWorkspaceAuditLog(
    workspaceId: string,
    query: { action?: string; limit?: number } = {},
  ) {
    const params = new URLSearchParams();
    if (query.action) params.set("action", query.action);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return api<AuditRow[]>(
      `/workspaces/${workspaceId}/audit-log${qs ? `?${qs}` : ""}`,
    );
  }

  return {
    usageAnalytics,
    listGenerations,
    getGeneration,
    listNovels,
    listFinalTextReviews,
    getStoryHealth,
    listWorkspaceAuditLog,
  };
}
