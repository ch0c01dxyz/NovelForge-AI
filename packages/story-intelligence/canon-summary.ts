export const CANON_SUMMARY_MAX_PREDICATES = 20;

// Code-unit order, not localeCompare: the digest must be byte-identical on
// every host regardless of the process locale (ADR-0022 determinism).
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface CanonSummaryInput {
  entities: Array<{ kind: string }>;
  facts: Array<{ predicate: string; status: "ACTIVE" | "SUPERSEDED" | "RETRACTED" }>;
}

export interface CanonSummaryDigest {
  entityCount: number;
  activeFactCount: number;
  supersededFactCount: number;
  retractedFactCount: number;
  entitiesByKind: Record<string, number>;
  topPredicates: Array<{ predicate: string; count: number }>;
  truncatedPredicates: boolean;
}

export function buildCanonSummaryDigest(input: CanonSummaryInput): CanonSummaryDigest {
  const entitiesByKind: Record<string, number> = {};
  for (const entity of input.entities) {
    entitiesByKind[entity.kind] = (entitiesByKind[entity.kind] ?? 0) + 1;
  }
  const sortedKinds = Object.fromEntries(
    Object.entries(entitiesByKind).sort(([a], [b]) => compareText(a, b)),
  );

  let active = 0;
  let superseded = 0;
  let retracted = 0;
  const predicateCounts = new Map<string, number>();
  for (const fact of input.facts) {
    if (fact.status === "ACTIVE") {
      active += 1;
      predicateCounts.set(fact.predicate, (predicateCounts.get(fact.predicate) ?? 0) + 1);
    } else if (fact.status === "SUPERSEDED") {
      superseded += 1;
    } else {
      retracted += 1;
    }
  }
  const ranked = [...predicateCounts.entries()]
    .map(([predicate, count]) => ({ predicate, count }))
    .sort((a, b) => b.count - a.count || compareText(a.predicate, b.predicate));

  return {
    entityCount: input.entities.length,
    activeFactCount: active,
    supersededFactCount: superseded,
    retractedFactCount: retracted,
    entitiesByKind: sortedKinds,
    topPredicates: ranked.slice(0, CANON_SUMMARY_MAX_PREDICATES),
    truncatedPredicates: ranked.length > CANON_SUMMARY_MAX_PREDICATES,
  };
}
