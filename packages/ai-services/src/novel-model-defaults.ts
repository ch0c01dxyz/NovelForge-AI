import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import { ConflictError, NotFoundError } from "./platform.ts";

export interface NovelModelDefaultsView {
  id: string | null;
  number: number;
  generationModelRef: string | null;
  analysisModelRef: string | null;
}
export interface NovelModelDefaultsScope { actorUserId: string; workspaceId: string; novelId: string }
export interface NovelModelDefaultsWrite extends NovelModelDefaultsScope {
  expectedVersion: number;
  generationModelRef: string | null;
  analysisModelRef: string | null;
  reason: string;
}
type Reader = Pick<NovelForgeDb, "membership" | "novel">;
const automatic: NovelModelDefaultsView = { id: null, number: 0, generationModelRef: null, analysisModelRef: null };
export function createNovelModelDefaultsServices(db: NovelForgeDb) {
  async function gate(reader: Reader, input: NovelModelDefaultsScope, write = false) {
    const member = await reader.membership.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId } } });
    if (!member) throw new NotFoundError("workspace");
    requireCapability(member.role, write ? "novel:update" : "novel:read");
    if (!await reader.novel.findFirst({ where: { id: input.novelId, workspaceId: input.workspaceId }, select: { id: true } })) throw new NotFoundError("novel");
  }
  return {
    async getNovelModelDefaults(input: NovelModelDefaultsScope): Promise<NovelModelDefaultsView> {
      await gate(db, input);
      return await db.novelModelDefaultsVersion.findFirst({ where: { novelId: input.novelId }, orderBy: { number: "desc" }, select: { id: true, number: true, generationModelRef: true, analysisModelRef: true } }) ?? { ...automatic };
    },
    async putNovelModelDefaults(input: NovelModelDefaultsWrite): Promise<NovelModelDefaultsView> {
      await gate(db, input, true);
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${input.workspaceId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${input.novelId}::uuid FOR NO KEY UPDATE`;
        await gate(tx, input, true);
        const previous = await tx.novelModelDefaultsVersion.findFirst({ where: { novelId: input.novelId }, orderBy: { number: "desc" } });
        if ((previous?.number ?? 0) !== input.expectedVersion) throw new ConflictError("novel model defaults changed; refresh before saving");
        const refs = [...new Set([input.generationModelRef, input.analysisModelRef].filter((ref): ref is string => ref !== null))];
        const eligible = await tx.aIModel.count({ where: { id: { in: refs }, enabled: true, gateway: { enabled: true }, profileMaps: { some: { enabled: true } } } });
        if (eligible !== refs.length) throw new ConflictError("novel model default is not enabled and mapped");
        const row = await tx.novelModelDefaultsVersion.create({ data: { novelId: input.novelId, number: (previous?.number ?? 0) + 1, generationModelRef: input.generationModelRef, analysisModelRef: input.analysisModelRef, actorUserId: input.actorUserId, reason: input.reason } });
        await tx.auditLog.create({ data: { actorUserId: input.actorUserId, workspaceId: input.workspaceId, action: "novel.model-defaults-versioned", entityType: "Novel", entityId: input.novelId, payload: { previousVersionId: previous?.id ?? null, versionId: row.id, number: row.number, generationModelRef: row.generationModelRef, analysisModelRef: row.analysisModelRef, reason: input.reason } } });
        return { id: row.id, number: row.number, generationModelRef: row.generationModelRef, analysisModelRef: row.analysisModelRef };
      });
    },
  };
}
