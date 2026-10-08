import type { NovelForgeDb } from "@novelforge/database";
import type { GenerationComponent } from "@novelforge/ai-core";

export interface UsageFilters {
  novelId?: string;
  component?: GenerationComponent;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}
export interface UsageSummary {
  requests: number;
  attempts: number;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
  unknownUsageRequests: number;
  unknownUsageAttempts: number;
  legacyRequests: number;
}
export interface UsageRow {
  component: string;
  task: string;
  artifactId: string | null;
  model: string | null;
  requests: number;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
  unknownUsageRecords: number;
  legacyRecords: number;
}
export interface UsageAnalytics {
  summary: UsageSummary;
  rows: UsageRow[];
  hasMore: boolean;
}

/** Caller must authorize workspace and optional novel before this read-only query. */
export async function queryUsageAnalytics(db: NovelForgeDb, workspaceId: string, filters: UsageFilters): Promise<UsageAnalytics> {
  const result = await db.$queryRaw<UsageAnalytics[]>`
    WITH eligible AS (
      SELECT g.*, s.attempts, s.unknown_attempts, s.observed,
             (g.input_tokens >= 0 OR g.output_tokens >= 0) IS TRUE AS legacy_available
      FROM generations g
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS attempts,
          count(*) FILTER (WHERE a.input_tokens IS NULL OR a.output_tokens IS NULL)::int AS unknown_attempts,
          coalesce(bool_or(a.input_tokens IS NOT NULL OR a.output_tokens IS NOT NULL), false) AS observed
        FROM generation_attempts a WHERE a.generation_id = g.id
      ) s ON true
      WHERE g.workspace_id = ${workspaceId}::uuid
        AND (${filters.novelId ?? null}::uuid IS NULL OR g.novel_id = ${filters.novelId ?? null}::uuid)
        AND (${filters.component ?? null}::text IS NULL OR g.component = ${filters.component ?? null}::text)
        AND (${filters.from ?? null}::timestamp IS NULL OR g.created_at >= ${filters.from ?? null}::timestamp)
        AND (${filters.to ?? null}::timestamp IS NULL OR g.created_at < ${filters.to ?? null}::timestamp)
    ), observations AS (
      SELECT g.id, g.component, g.task, g.artifact_id, a.reported_model_id AS model,
             a.input_tokens, a.output_tokens, false AS legacy
      FROM eligible g JOIN generation_attempts a ON a.generation_id = g.id
      WHERE g.observed OR NOT g.legacy_available
      UNION ALL
      SELECT id, component, task, artifact_id, NULL,
             CASE WHEN input_tokens >= 0 THEN input_tokens END,
             CASE WHEN output_tokens >= 0 THEN output_tokens END, true
      FROM eligible WHERE NOT observed AND legacy_available
      UNION ALL
      SELECT id, component, task, artifact_id, NULL, NULL, NULL, false
      FROM eligible WHERE attempts = 0 AND NOT legacy_available
    ), breakdown AS (
      SELECT component, task, artifact_id, model, count(DISTINCT id)::int AS requests,
        coalesce(sum(input_tokens::bigint),0)::text AS input_tokens,
        coalesce(sum(output_tokens::bigint),0)::text AS output_tokens,
        (coalesce(sum(input_tokens::bigint),0) + coalesce(sum(output_tokens::bigint),0))::text AS total_tokens,
        count(*) FILTER (WHERE input_tokens IS NULL OR output_tokens IS NULL)::int AS unknown_records,
        count(*) FILTER (WHERE legacy)::int AS legacy_records
      FROM observations GROUP BY component, task, artifact_id, model
    ), page AS (
      SELECT * FROM breakdown ORDER BY component, task, artifact_id NULLS FIRST, model NULLS FIRST
      LIMIT ${Math.min(filters.limit ?? 50, 100)} OFFSET ${filters.offset ?? 0}
    )
    SELECT json_build_object(
      'requests', count(DISTINCT id),
      'attempts', (SELECT coalesce(sum(attempts),0) FROM eligible),
      'inputTokens', coalesce(sum(input_tokens::bigint),0)::text,
      'outputTokens', coalesce(sum(output_tokens::bigint),0)::text,
      'totalTokens', (coalesce(sum(input_tokens::bigint),0) + coalesce(sum(output_tokens::bigint),0))::text,
      'unknownUsageRequests', count(DISTINCT id) FILTER (WHERE input_tokens IS NULL OR output_tokens IS NULL),
      'unknownUsageAttempts', (SELECT coalesce(sum(unknown_attempts),0) FROM eligible),
      'legacyRequests', count(DISTINCT id) FILTER (WHERE legacy)
    ) AS summary,
    coalesce((SELECT json_agg(json_build_object(
      'component', component, 'task', task, 'artifactId', artifact_id, 'model', model,
      'requests', requests, 'inputTokens', input_tokens, 'outputTokens', output_tokens,
      'totalTokens', total_tokens, 'unknownUsageRecords', unknown_records, 'legacyRecords', legacy_records
    ) ORDER BY component, task, artifact_id NULLS FIRST, model NULLS FIRST) FROM page), '[]'::json) AS rows,
    (SELECT count(*) FROM breakdown) > ${filters.offset ?? 0}::bigint + ${Math.min(filters.limit ?? 50, 100)}::bigint AS "hasMore"
    FROM observations
  `;
  return result[0]!;
}
