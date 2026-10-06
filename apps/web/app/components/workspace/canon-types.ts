/**
 * Shared canon-domain types for the NF-WF-016 World & Lore and Canon Review
 * panels. Shapes mirror the API exactly (canon-routes.ts / services/canon.ts
 * / services/canon-applications.ts); no invented fields.
 */

export const ENTITY_KINDS = [
  "CHARACTER",
  "LOCATION",
  "ORGANIZATION",
  "FACTION",
  "ITEM",
  "RESOURCE",
  "CONCEPT",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface StoryEntity {
  id: string;
  kind: EntityKind;
  name: string;
  key: string;
}

export type FactSourceKind = "CHAPTER" | "REFERENCE";

export interface FactSource {
  sourceKind: FactSourceKind | string;
  quote: string;
  start: number;
  end: number;
  chapterVersionId: string | null;
  referenceVersionId: string | null;
}

export interface CanonFact {
  id: string;
  entityId: string;
  predicate: string;
  statement: string;
  objectText: string | null;
  objectEntityId: string | null;
  status: string;
  validFromChapter: number | null;
  validUntilChapter: number | null;
  availableFromChapter: number | null;
  supersededById?: string | null;
  sources?: FactSource[];
}

export interface CanonProposal {
  id: string;
  entityId: string;
  predicate: string;
  statement: string;
  status: string;
  conflictKind: "FUNCTIONAL_CONFLICT" | null;
  conflictsWithFactId: string | null;
  canonFactId: string | null;
}

export interface ApplicationItemView {
  id: string;
  claimIndex: number;
  kind: string;
  text: string;
  predicate: string;
  entity: { id: string; key: string; name: string; kind: string } | null;
  verdict: string;
  verdictReasons: string[];
  conflictsWithFact: { id: string; statement: string } | null;
  canonFactId: string | null;
}

export interface CanonApplicationView {
  id: string;
  status: string;
  runId?: string | null;
  items: ApplicationItemView[];
}

/**
 * Stable fingerprint for a citation span. The facts list route does not
 * return CanonFactSource ids, so the UI can only detach sources whose id it
 * learned from an attach (201) response in this session; the fingerprint
 * matches those responses back onto listed sources.
 */
export function sourceFingerprint(s: {
  sourceKind: string;
  start: number;
  end: number;
  chapterVersionId: string | null;
  referenceVersionId: string | null;
  quote: string;
}): string {
  return [
    s.sourceKind,
    String(s.start),
    String(s.end),
    s.chapterVersionId ?? "",
    s.referenceVersionId ?? "",
    s.quote,
  ].join("|");
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTITY_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
