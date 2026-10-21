/**
 * Workflow run operations against the real NF-WF-004/005 backend
 * (NF-WF-007, Invariants 1–2).
 *
 * - start: POST .../workflows/:workflowId/run with a fresh uuid-v4
 *   `idempotencyKey` per intentional start (double-submit → 200, one row).
 * - poll: NOT here — RunStatusPanel owns its poller (statusUrl/getRun
 *   fallback); this composable exposes getRun for it.
 * - cancel / decide (approve|reject) with typed ApiError passthrough so
 *   callers branch on the exact backend codes (Invariant 5).
 */
import { useApi } from "./useApi";
export interface WorkflowModelPreferencePreview {
  fingerprint: string;
  steps: Array<{ stepKey: string; kind: string; definitionKey: string; profile: string; inheritedModelRef: string | null; inheritedSource: string }>;
}

export interface StepRow {
  stepKey: string;
  sequence: number;
  kind: string;
  status: string;
  agentKey: string | null;
  output: unknown;
  errorMessage: string | null;
  latencyMs: number | null;
  approvalSnapshot: unknown;
}

export interface RunView {
  id: string;
  workflowId: string;
  workflowKey: string;
  workflowVersionNumber: number;
  novelId: string | null;
  status: string;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  stepCount: number;
  startedAt: string;
  completedAt: string | null;
  steps?: StepRow[];
  requestedModelPreferences?: { preferredModelRef?: string; stepModelRefs?: Record<string, string> };
}

export interface RunListItem {
  id: string;
  workflowId: string;
  novelId: string | null;
  status: string;
  input: unknown;
  startedAt: string;
  completedAt: string | null;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (tests): not a cryptographic UUID,
  // but unique enough as an idempotency key.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useWorkflowRuns() {
  const { api } = useApi();

  async function listWorkflows(workspaceId: string) {
    return api<Array<{ id: string; key: string; status: string }>>(
      `/workspaces/${workspaceId}/workflows`,
    );
  }

  /** Resolve the workflow id by key (contract Invariant 2.2). */
  async function resolveWorkflowId(
    workspaceId: string,
    key: string,
  ): Promise<string | null> {
    const rows = await listWorkflows(workspaceId);
    return rows.find((r) => r.key === key)?.id ?? null;
  }

  async function startRun(opts: {
    workspaceId: string;
    workflowId: string;
    novelId: string;
    input: Record<string, unknown>;
    idempotencyKey?: string;
    preferredModelRef?: string;
    stepModelRefs?: Record<string, string>;
    expectedModelPreferenceFingerprint?: string;
  }): Promise<{ run: RunView; statusUrl: string }> {
    const key = opts.idempotencyKey ?? uuidv4();
    // The idempotency contract: a repeated key returns the EXISTING run
    // with 200. useApi only throws on non-2xx, so both the 202 (created)
    // and 200 (deduped) paths resolve here with the single run — the UI
    // shows the existing run, never two panels.
    const res = await api<RunView & { statusUrl: string }>(
      `/workspaces/${opts.workspaceId}/workflows/${opts.workflowId}/run`,
      {
        method: "POST",
        body: JSON.stringify({
          novelId: opts.novelId,
          input: opts.input,
          idempotencyKey: key,
          ...(opts.preferredModelRef ? { preferredModelRef: opts.preferredModelRef } : {}),
          ...(opts.stepModelRefs ? { stepModelRefs: opts.stepModelRefs } : {}),
          ...(opts.expectedModelPreferenceFingerprint ? { expectedModelPreferenceFingerprint: opts.expectedModelPreferenceFingerprint } : {}),
        }),
      },
    );
    return { run: res, statusUrl: res.statusUrl };
  }
  async function cancelRun(workspaceId: string, runId: string): Promise<RunView> {
    return api<RunView>(`/workspaces/${workspaceId}/workflow-runs/${runId}/cancel`, {
      method: "POST",
    });
  }

  async function decideRun(opts: {
    workspaceId: string;
    runId: string;
    decision: "approve" | "reject";
    expectedSnapshotHash: string;
    reason?: string;
  }): Promise<RunView> {
    const body: Record<string, string> = {
      expectedSnapshotHash: opts.expectedSnapshotHash,
    };
    if (opts.reason !== undefined) body.reason = opts.reason;
    return api<RunView>(
      `/workspaces/${opts.workspaceId}/workflow-runs/${opts.runId}/${opts.decision}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  async function getRun(workspaceId: string, runId: string): Promise<RunView> {
    return api<RunView>(`/workspaces/${workspaceId}/workflow-runs/${runId}`);
  }

  async function listRuns(opts: {
    workspaceId: string;
    workflowId?: string;
    novelId?: string;
    chapterNumber?: number;
    limit?: number;
  }): Promise<RunListItem[]> {
    const q = new URLSearchParams();
    if (opts.workflowId) q.set("workflowId", opts.workflowId);
    if (opts.novelId) q.set("novelId", opts.novelId);
    if (opts.chapterNumber !== undefined) q.set("chapterNumber", String(opts.chapterNumber));
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return api<RunListItem[]>(`/workspaces/${opts.workspaceId}/workflow-runs${suffix}`);
  }

  return {
    previewModelPreferences: (workspaceId: string, workflowId: string, novelId: string) => api<WorkflowModelPreferencePreview>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/model-preferences?novelId=${encodeURIComponent(novelId)}`),
    resolveWorkflowId,
    startRun,
    cancelRun,
    decideRun,
    getRun,
    listRuns,
    newIdempotencyKey: uuidv4,
    isTerminal: (status: string) => TERMINAL.has(status),
  };
}
