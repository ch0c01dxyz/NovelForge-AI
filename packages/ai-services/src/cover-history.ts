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
  return version;
}
