import type { NovelForgeDb } from "@novelforge/database";

export const DEFAULT_BRANDING = { name: "NovelForge", mark: "N", markColor: "#1c1207", version: 0 };
export interface BrandingInput { name: string; mark: string; markColor: string; expectedVersion: number }
const projection = { name: true, mark: true, markColor: true, version: true } as const;

export function createBrandingService(db: NovelForgeDb) {
  return {
    async get() {
      return await db.platformBranding.findUnique({ where: { id: "platform" }, select: projection }) ?? DEFAULT_BRANDING;
    },
    async update(actorUserId: string, { expectedVersion, ...values }: BrandingInput) {
      return db.$transaction(async (tx) => {
        const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { platformRole: true } });
        if (actor?.platformRole !== "SUPER_ADMIN") return { error: "FORBIDDEN" } as const;
        // Serialize first-write and subsequent CAS together, including the audit entry.
        await tx.$executeRaw`INSERT INTO platform_branding (id, name, mark, mark_color, version, updated_at) VALUES ('platform', 'NovelForge', 'N', '#1c1207', 0, NOW()) ON CONFLICT (id) DO NOTHING`;
        const changed = await tx.platformBranding.updateMany({ where: { id: "platform", version: expectedVersion }, data: { ...values, version: { increment: 1 } } });
        if (changed.count !== 1) return { error: "BRANDING_CHANGED" } as const;
        const branding = await tx.platformBranding.findUniqueOrThrow({ where: { id: "platform" }, select: projection });
        await tx.auditLog.create({ data: { actorUserId, action: "platform-branding.updated", entityType: "PlatformBranding", payload: { ...branding, singletonKey: "platform", previousVersion: expectedVersion } } });
        return { branding };
      });
    },
  };
}
