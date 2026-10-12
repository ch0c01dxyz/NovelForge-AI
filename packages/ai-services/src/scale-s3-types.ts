/** Shared types for NF-WF-050C S3 proposal assistance. */

/**
 * Canonical narrative scale (re-exported from @novelforge/narrative-rhythm —
 * the single vocabulary source; 050C must never re-declare it. A previous
 * local list (OBJECT/PERSON/GROUP/SETTLEMENT/REGION) was WRONG — discovered
 * by the 2026-10-12 live acceptance when a stored proposal's "PERSON" claim
 * could not map into the canonical 050A authoring surface.
 */
export type NarrativeScaleInput =
  | "PERSONAL"
  | "FAMILY"
  | "VILLAGE"
  | "TOWN"
  | "CITY"
  | "PROVINCE"
  | "KINGDOM"
  | "EMPIRE";

export interface ScaleEvidenceClaim {
  scale: NarrativeScaleInput;
  relevance: "ACTION" | "STAKES" | "CONSEQUENCE";
  explanation: string;
  source: { start: number; end: number; quote: string };
}

/** Pin snapshot read under the appendSet lock order. */
export interface ScaleS3PinSnapshot {
  branchId: string;
  headRevisionId: string | null;
  currentVersionId: string | null;
  policyFingerprint: string;
  latestSetId: string | null;
}
