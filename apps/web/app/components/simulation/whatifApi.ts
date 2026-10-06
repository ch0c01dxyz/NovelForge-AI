/**
 * NF-WF-024A: What-if outline simulation API client.
 *
 * Thin typed wrapper around the 024A what-if routes.
 * Route shapes mirror apps/api/src/whatif-routes.ts.
 */
import { useApi } from "../../composables/useApi";

// ---------------------------------------------------------------------------
// 024A shapes (mirror apps/api/src/services/whatif.ts)
// ---------------------------------------------------------------------------

export type WhatifComparisonStatus =
  | "DRAFT"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "INCOMPLETE_BUDGET_EXHAUSTED"
  | "ABORTED";

export interface DivergencePoint {
  tickNumber: number;
  chapterIndex: number;
  kind: "STRUCTURAL" | "UNATTRIBUTED";
  summary: string;
  outlineVersionIds: string[];
}

export interface WhatifComparisonShape {
  id: string;
  novelId: string;
  outlineVersionIds: string[];
  runIds: string[];
  divergencePoints: DivergencePoint[];
  maxChapters: number;
  tokenBudget: number;
  tokenSpent: number;
  status: WhatifComparisonStatus;
  createdAt: string;
}

export interface OutlineVersionShape {
  id: string;
  number: number;
  status: string;
  note: string | null;
  createdAt: string;
}

export function useWhatifApi(workspaceId: string, novelId: string) {
  const { api } = useApi();
  const base = `/workspaces/${workspaceId}/novels/${novelId}/whatif/comparisons`;

  async function listComparisons(): Promise<WhatifComparisonShape[]> {
    const res = await api<{ comparisons: WhatifComparisonShape[] }>(base);
    return res.comparisons;
  }

  async function getComparison(comparisonId: string): Promise<WhatifComparisonShape> {
    const res = await api<{ comparison: WhatifComparisonShape }>(`${base}/${comparisonId}`);
    return res.comparison;
  }

  async function createComparison(input: {
    outlineVersionIds: string[];
    maxChapters?: number;
    tokenBudget?: number;
    confirmed: true;
  }): Promise<WhatifComparisonShape> {
    const res = await api<{ comparison: WhatifComparisonShape }>(base, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.comparison;
  }

  async function runComparison(comparisonId: string): Promise<WhatifComparisonShape> {
    const res = await api<{ comparison: WhatifComparisonShape }>(`${base}/${comparisonId}/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return res.comparison;
  }

  async function listOutlineVersions(): Promise<OutlineVersionShape[]> {
    // Reuses the existing outline versions route (planning service).
    const res = await api<{ versions: OutlineVersionShape[] }>(
      `/workspaces/${workspaceId}/novels/${novelId}/planning/outline-versions`,
    );
    return res.versions;
  }

  return {
    listComparisons,
    getComparison,
    createComparison,
    runComparison,
    listOutlineVersions,
  };
}
