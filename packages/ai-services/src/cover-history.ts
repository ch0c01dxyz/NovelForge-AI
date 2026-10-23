import type { NovelForgeDb } from "@novelforge/database";
import { validateNovelCover, type NovelCover } from "./novel-cover.ts";

export type CoverTx = Parameters<Parameters<NovelForgeDb["$transaction"]>[0]>[0];

export function readStoredCover(value: unknown): NovelCover | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("invalid stored cover");
  const cover = value as Record<string, unknown>;
  if (typeof cover.mimeType !== "string" || typeof cover.dataBase64 !== "string") throw new Error("invalid stored cover");
  return validateNovelCover({ mimeType: cover.mimeType, dataBase64: cover.dataBase64,
    ...(typeof cover.sourceName === "string" ? { sourceName: cover.sourceName } : {}) });
}

/** The caller holds the novel write lock; unfinished jobs retain their pinned image. */
async function retainCoverPayloads(tx: CoverTx, input: { novelId: string; workspaceId: string; actorUserId: string }, currentHash: string | null) {
  const expired = await tx.$queryRaw<{ id: string }[]>`
    WITH previous AS (
      SELECT sha256 FROM novel_cover_versions WHERE novel_id = ${input.novelId}::uuid
        AND sha256 IS NOT NULL AND sha256 IS DISTINCT FROM ${currentHash}
        AND payload_expired_at IS NULL
      GROUP BY sha256 ORDER BY max(number) DESC LIMIT 2
    )
    UPDATE novel_cover_versions v SET cover = NULL, payload_expired_at = now()
    WHERE v.novel_id = ${input.novelId}::uuid AND v.sha256 IS NOT NULL
      AND v.payload_expired_at IS NULL AND v.sha256 IS DISTINCT FROM ${currentHash}
      AND v.sha256 NOT IN (SELECT sha256 FROM previous)
      AND NOT EXISTS (
        SELECT 1 FROM cover_generation_batches b WHERE b.novel_id = v.novel_id
          AND (b.expected_cover_hash = v.sha256 OR b.source_snapshot->>'coverVersionId' = v.id::text)
          AND EXISTS (SELECT 1 FROM cover_generation_items i WHERE i.batch_id = b.id AND i.state IN ('PENDING', 'RUNNING', 'UNCERTAIN'))
      ) RETURNING v.id`;
  const items = await tx.$queryRaw<{ id: string }[]>`
    UPDATE cover_generation_items i SET image = NULL, payload_expired_at = now(), updated_at = now()
    FROM cover_generation_batches b
    WHERE i.batch_id = b.id AND b.novel_id = ${input.novelId}::uuid
      AND i.state = 'SUCCEEDED' AND i.applied_at IS NOT NULL AND i.payload_expired_at IS NULL
      AND i.image->>'sha256' IS DISTINCT FROM ${currentHash}
      AND NOT EXISTS (SELECT 1 FROM cover_generation_items live WHERE live.batch_id = b.id AND live.state IN ('PENDING', 'RUNNING', 'UNCERTAIN'))
      AND NOT EXISTS (SELECT 1 FROM novel_cover_versions v WHERE v.novel_id = b.novel_id AND v.payload_expired_at IS NULL
        AND (v.source_item_id = i.id OR v.sha256 = i.image->>'sha256'))
      AND NOT EXISTS (SELECT 1 FROM cover_generation_batches pinned WHERE pinned.novel_id = b.novel_id
        AND pinned.expected_cover_hash = i.image->>'sha256'
        AND EXISTS (SELECT 1 FROM cover_generation_items live WHERE live.batch_id = pinned.id AND live.state IN ('PENDING', 'RUNNING', 'UNCERTAIN')))
    RETURNING i.id`;
  if (expired.length || items.length) await tx.auditLog.create({ data: {
    actorUserId: input.actorUserId, workspaceId: input.workspaceId, action: "novel.cover-payloads-expired", entityType: "Novel", entityId: input.novelId,
    payload: { policy: "current-plus-two-distinct-v1", versionIds: expired.map(v => v.id), itemIds: items.map(i => i.id) },
  } });
}

/** Caller holds the novel write lock and has rechecked tenant/capability. */
export async function writeCoverWithHistory(tx: CoverTx, input: {
  novelId: string; workspaceId: string; actorUserId: string; cover: NovelCover | null; sourceItemId?: string;
}) {
  const { novelId, actorUserId, cover } = input;
  const row = await tx.novelSettings.findUnique({ where: { novelId } });
  const base = row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? { ...row.settings } : {};
  const previous = readStoredCover(base.cover);
  const latest = await tx.novelCoverVersion.findFirst({ where: { novelId }, orderBy: { number: "desc" }, select: { number: true } });
  if (!latest) await tx.novelCoverVersion.create({ data: { novelId, actorUserId, number: 0,
    sha256: previous?.sha256 ?? null, ...(previous ? { cover: { ...previous } } : {}) } });
  if (cover) base.cover = { ...cover }; else delete base.cover;
  await tx.novelSettings.upsert({ where: { novelId }, create: { novelId, settings: base }, update: { settings: base } });
  const version = await tx.novelCoverVersion.create({ data: { novelId, actorUserId, number: (latest?.number ?? 0) + 1,
    sha256: cover?.sha256 ?? null, ...(cover ? { cover: { ...cover } } : {}), sourceItemId: input.sourceItemId ?? null } });
  await tx.auditLog.create({ data: { actorUserId, workspaceId: input.workspaceId, action: "novel.cover-updated", entityType: "Novel", entityId: novelId,
    payload: { sha256: cover?.sha256 ?? null, previousSha256: previous?.sha256 ?? null, mimeType: cover?.mimeType ?? null,
      bytes: cover ? Buffer.from(cover.dataBase64, "base64").length : 0, coverVersionId: version.id, sourceItemId: input.sourceItemId ?? null } } });
  await retainCoverPayloads(tx, input, cover?.sha256 ?? null);
  return version;
}
