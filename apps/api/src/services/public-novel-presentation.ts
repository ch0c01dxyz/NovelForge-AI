import type { NovelForgeDb } from "@novelforge/database";

/** Call after resolving public visibility or member scope; never load image bytes. */
export async function publicNovelPresentations(db: Pick<NovelForgeDb, "$queryRaw">, novelIds: string[]) {
  if (!novelIds.length) return new Map<string, { coverUrl: string | null; publicSynopsis: string | null }>();
  const rows = await db.$queryRaw<{ novelId: string; coverHash: string | null; publicSynopsis: string | null }[]>`
    SELECT novel_id AS "novelId", settings->'cover'->>'sha256' AS "coverHash",
      CASE WHEN jsonb_typeof(settings->'publicSynopsis') = 'string'
        THEN left(settings->>'publicSynopsis', 6000) END AS "publicSynopsis"
    FROM novel_settings WHERE novel_id = ANY(${novelIds}::uuid[])`;
  return new Map(rows.map(row => [row.novelId, {
    coverUrl: row.coverHash && /^[a-f0-9]{64}$/.test(row.coverHash) ? `/api/public/novels/${row.novelId}/cover?v=${row.coverHash}` : null,
    publicSynopsis: row.publicSynopsis?.trim() || null,
  }]));
}
