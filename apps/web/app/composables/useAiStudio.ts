import { useApi, ApiError } from "./useApi";

/**
 * Thin fetch wrapper over the frozen definition/run/approval routes
 * (NF-WF-018A). No business logic lives here — the server owns
 * authorization, versioning, and the 005 decide contract; the UI gates
 * below are progressive enhancement only.
 *
 * Additive backend items used: the run-list `?status=` filter
 * (Invariant 1(d)) and the GAP-064 versions-list routes
 * (`GET /api/:kind/:id/versions`).
 */

export type DefinitionKind = "agent" | "skill" | "workflow";
export type WorkspaceRole = "OWNER" | "ADMIN" | "AUTHOR" | "EDITOR" | "VIEWER";

const KIND_PLURAL: Record<DefinitionKind, string> = {
  agent: "agents",
  skill: "skills",
  workflow: "workflows",
};

export interface DefinitionSummary {
  id: string;
  scope: "PLATFORM" | "WORKSPACE";
  workspaceId: string | null;
  key: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number | null;
  versionId: string | null;
  createdAt: string;
  updatedAt: string;
  modelProfile?: string | null;
  preferredModelRef?: string | null;
  defaultModelRef?: string | null;
  skillKeys?: string[];
  agentKeys?: string[];
  category?: string;
  novelId?: string | null;
}

export interface DefinitionVersionRow {
  id: string;
  number: number;
  createdAt: string;
  createdBy: string | null;
}

export interface RunSummary {
  id: string;
  workflowId: string;
  workflowKey: string;
  workflowVersionNumber: number | null;
  novelId: string | null;
  status: string;
  stepCount: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ApprovalSnapshotMaterial {
  instruction: string;
  priorOutcomes: Record<string, { text: string | null; json: unknown }>;
  workflowVersionNumber: number;
  agentVersions: Record<string, number>;
  skillVersions: Record<string, number>;
}

export interface StepView {
  stepKey: string;
  sequence: number;
  kind: string;
  status: string;
  agentKey: string | null;
  agentVersionNumber: number | null;
  skillKey: string | null;
  skillVersionNumber: number | null;
  generationId: string | null;
  output: unknown;
  errorMessage: string | null;
  latencyMs: number | null;
  approvalSnapshot: { material: ApprovalSnapshotMaterial; snapshotHash: string } | null;
}

export interface RunDetail extends RunSummary {
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  steps: StepView[];
}

/** The 005 decision codes the inbox must surface actionably. */
export type DecisionRefusalCode =
  | "STALE_APPROVAL"
  | "NO_APPROVAL_SNAPSHOT"
  | "ALREADY_DECIDED"
  | "RUN_CANCELLED";

export class DecisionError extends Error {
  constructor(
    readonly refusalCode: DecisionRefusalCode | "CONFLICT" | "FORBIDDEN",
    readonly status: number,
  ) {
    super(`${status} ${refusalCode}`);
    this.name = "DecisionError";
  }
}

/**
 * Client-side capability derivation (progressive enhancement — the server
 * is the enforcer). Mirrors `ROLE_CAPABILITIES` in
 * `packages/auth/authorization.ts`; do not invent grants here.
 */
export function canViewStudio(role: WorkspaceRole | null): boolean {
  // workflow:read holders: OWNER, ADMIN, AUTHOR, EDITOR.
  return role !== null && role !== "VIEWER";
}
export function canManageDefinitions(role: WorkspaceRole | null): boolean {
  // agent:manage / skill:manage / workflow:manage holders.
  return role === "OWNER" || role === "ADMIN";
}
export function canDecideApprovals(role: WorkspaceRole | null): boolean {
  // workflow:approve holders.
  return role === "OWNER" || role === "ADMIN" || role === "AUTHOR";
}
export function canLaunchRuns(role: WorkspaceRole | null): boolean {
  // workflow:run holders.
  return role !== null && role !== "VIEWER";
}

const DECISION_REFUSAL_CODES: ReadonlySet<string> = new Set([
  "STALE_APPROVAL",
  "NO_APPROVAL_SNAPSHOT",
  "ALREADY_DECIDED",
  "RUN_CANCELLED",
]);

export function useAiStudio() {
  const { api } = useApi();

  function installStarterPack(workspaceId: string) {
    return api<{ workflowId: string; created: boolean }>(`/workspaces/${workspaceId}/studio/starter-pack`, { method: "POST", body: "{}" });
  }

  function createDefinition(workspaceId: string, kind: DefinitionKind, content: Record<string, unknown>) {
    const body: Record<string, unknown> = { ...content, scope: "WORKSPACE", workspaceId };
    delete body.novelId;
    return api<{ id: string }>(`/${KIND_PLURAL[kind]}`, { method: "POST", body: JSON.stringify(body) });
  }

  function listDefinitions(workspaceId: string, kind: DefinitionKind) {
    return api<DefinitionSummary[]>(
      `/workspaces/${workspaceId}/${KIND_PLURAL[kind]}`,
    );
  }

  function getDefinition(kind: DefinitionKind, id: string) {
    return api<Record<string, unknown>>(`/${KIND_PLURAL[kind]}/${id}`);
  }

  /** GAP-064: the definition's immutable version history, ascending. */
  function listVersions(kind: DefinitionKind, id: string) {
    return api<DefinitionVersionRow[]>(`/${KIND_PLURAL[kind]}/${id}/versions`);
  }

  /**
   * Append a new version (the server validates the content; on failure it
   * returns `{error: "INVALID_DEFINITION", failures: [...]}`). The local
   * fetch preserves `failures` so the form can show them actionably.
   */
  async function addVersion(kind: DefinitionKind, id: string, content: unknown) {
    const res = await fetch(`/api/${KIND_PLURAL[kind]}/${id}/versions`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(content),
    });
    if (!res.ok) {
      let code = String(res.status);
      let failures: string[] = [];
      try {
        const parsed = (await res.json()) as { error?: string; failures?: string[] };
        code = parsed.error ?? code;
        failures = parsed.failures ?? [];
      } catch {
        /* non-JSON error body */
      }
      const err = new ApiError(code, res.status) as ApiError & { failures: string[] };
      err.failures = failures;
      throw err;
    }
    return (await res.json()) as { versionId: string; version: number };
  }

  function publishDefinition(kind: DefinitionKind, id: string) {
    return api<{ status: string }>(`/${KIND_PLURAL[kind]}/${id}/publish`, {
      method: "POST",
    });
  }

  function listRuns(
    workspaceId: string,
    opts?: { workflowId?: string; status?: string; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (opts?.workflowId) params.set("workflowId", opts.workflowId);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return api<RunSummary[]>(
      `/workspaces/${workspaceId}/workflow-runs${qs ? `?${qs}` : ""}`,
    );
  }

  function getRun(workspaceId: string, runId: string) {
    return api<RunDetail>(`/workspaces/${workspaceId}/workflow-runs/${runId}`);
  }

  function launchRun(
    workspaceId: string,
    workflowId: string,
    input?: Record<string, unknown>,
  ) {
    return api<RunDetail & { statusUrl: string }>(
      `/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      { method: "POST", body: JSON.stringify(input ? { input } : {}) },
    );
  }

  /**
   * Decide a parked approval (NF-WF-005). The 005 decide 409s carry
   * `{error: "CONFLICT", code: <decisionCode>}` — `useApi`'s ApiError
   * only keeps the `error` field, so this local fetch preserves the
   * machine-readable decision code for the inbox's actionable mapping.
   */
  async function decideRun(
    workspaceId: string,
    runId: string,
    decision: "approve" | "reject",
    expectedSnapshotHash: string,
    reason?: string,
  ): Promise<RunDetail> {
    const body: Record<string, string> = { expectedSnapshotHash };
    if (reason !== undefined) body.reason = reason;
    const res = await fetch(
      `/api/workspaces/${workspaceId}/workflow-runs/${runId}/${decision}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      let code = "CONFLICT";
      try {
        const parsed = (await res.json()) as { error?: string; code?: string };
        if (parsed.code && DECISION_REFUSAL_CODES.has(parsed.code)) {
          code = parsed.code;
        } else if (res.status === 403) {
          code = "FORBIDDEN";
        }
      } catch {
        /* non-JSON error body */
      }
      throw new DecisionError(code as DecisionError["refusalCode"], res.status);
    }
    return (await res.json()) as RunDetail;
  }

  /**
   * The current user's workspace role for UI gating (progressive
   * enhancement). Returns null when the user is not a member — the
   * server's 404/403 gates are the enforcement.
   */
  async function getWorkspaceRole(
    workspaceId: string,
  ): Promise<WorkspaceRole | null> {
    const session = await api<{ userId: string }>(`/auth/session`);
    const members = await api<Array<{ userId: string; role: string }>>(
      `/workspaces/${workspaceId}/members`,
    );
    const mine = members.find((m) => m.userId === session.userId);
    return (mine?.role as WorkspaceRole | undefined) ?? null;
  }

  return {
    createDefinition,
    installStarterPack,
    listDefinitions,
    getDefinition,
    listVersions,
    addVersion,
    publishDefinition,
    listRuns,
    getRun,
    launchRun,
    decideRun,
    getWorkspaceRole,
  };
}
