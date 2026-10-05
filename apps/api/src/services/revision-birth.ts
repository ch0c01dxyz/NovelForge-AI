/**
 * NF-WF-010: birth-revision lookup for the temporal-negative rule.
 *
 * "As of revision R" MUST NOT cite any row, revision, or chapter version
 * created at a revision newer than R (Invariant 3). The mechanism is the
 * contract's named one: `ChangeSetItem` CREATE lookup via
 * `ChangeSet → Revision` pins each row's birth revision; rows whose
 * birth revision number > R.number are excluded.
 *
 * Every covered mutation writes its change-set items atomically with
 * the mutation (STORY-VERSIONING.md C2), so a CREATE item is the
 * row's birth certificate. A row with NO create item (written before
 * the revision machinery, or by a path that skipped it) is treated as
 * "birth unknown" and KEPT — excluding it would silently drop
 * legitimate history; the as-of filter is a ceiling, not a whitelist.
 */
import type { NovelForgeDb } from "@novelforge/database";

export interface EntityRef {
  entityType: string;
  entityId: string;
}

/**
 * The earliest revision number at which each referenced entity was
 * created (min over CREATE items). Entities with no CREATE item are
 * absent from the map (birth unknown → kept by callers).
 */
export async function birthRevisionNumbers(
  db: NovelForgeDb,
  refs: EntityRef[],
): Promise<Map<string, number>> {
  const births = new Map<string, number>();
  if (refs.length === 0) return births;
  const types = [...new Set(refs.map((r) => r.entityType))];
  const ids = [...new Set(refs.map((r) => r.entityId))];
  const items = await db.changeSetItem.findMany({
    where: {
      entityType: { in: types },
      entityId: { in: ids },
      operation: "CREATE",
    },
    select: {
      entityId: true,
      changeSet: { select: { revision: { select: { number: true } } } },
    },
  });
  for (const item of items) {
    const n = item.changeSet.revision.number;
    const prev = births.get(item.entityId);
    if (prev === undefined || n < prev) births.set(item.entityId, n);
  }
  return births;
}

/**
 * Filter helper: keep the entity when its birth is unknown or ≤ R.
 * Returns the kept subset, preserving order.
 */
export function bornAtOrBefore<T>(
  rows: T[],
  idOf: (row: T) => string,
  births: Map<string, number>,
  rNumber: number,
): T[] {
  return rows.filter((row) => {
    const birth = births.get(idOf(row));
    return birth === undefined || birth <= rNumber;
  });
}
