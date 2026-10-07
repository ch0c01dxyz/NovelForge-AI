/**
 * Audit foundation (CLAUDE.md §33, ADR-0003 §6): append-only audit
 * records for sensitive mutations. Create/read only — no update or
 * delete path exists.
 */
import type { InputJsonValue, NovelForgeDb } from "@novelforge/database";

export interface AuditEntry {
  actorUserId?: string | null;
  workspaceId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: InputJsonValue;
}

export interface AuditService {
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditService(db: NovelForgeDb): AuditService {
  return {
    async record(entry) {
      await db.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          workspaceId: entry.workspaceId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          // Never store secrets in audit payloads (CLAUDE.md §22).
          payload: entry.payload ?? {},
        },
      });
    },
  };
}
