/** Shared types for NF-WF-050C S3 proposal assistance. */

/** One of the eight frozen narrative scales (mirrors @novelforge/narrative-rhythm). */
export type NarrativeScaleInput =
  | "OBJECT"
  | "PERSON"
  | "FAMILY"
  | "GROUP"
  | "SETTLEMENT"
  | "REGION"
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
