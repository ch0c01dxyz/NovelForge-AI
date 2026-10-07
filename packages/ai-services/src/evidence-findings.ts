/**
 * NF-WF-010: the normative EvidenceFinding schema (Invariant 7).
 *
 * Mirrors STORY-INTELLIGENCE.md's health finding: rule, severity,
 * evidence, affected entities, status, remediation. Every finding cites
 * its sources — a finding with empty `evidence` is invalid and MUST NOT
 * be emitted (mirrors the RhythmFinding discipline: "Every beat id and
 * chapter of every match — never a bare score").
 *
 * `UNRESOLVED` (distinct from `OPEN`) exists for identity the data
 * cannot resolve (Invariant 6): it carries `remediation: null` because
 * there is no machine proposal when the machine must not decide.
 */
export type FindingSeverity = "INFO" | "WARNING" | "CRITICAL";
export type FindingStatus = "OPEN" | "RESOLVED" | "UNRESOLVED";

export interface FindingEvidence {
  kind:
    | "fact"
    | "revision"
    | "chapterVersion"
    | "timelineEvent"
    | "storyEvent"
    | "character"
    | "stance"
    | "policy"
    | "span";
  id?: string;
  chapter?: number;
  order?: number;
  revisionId?: string;
  /** e.g. validity window "ch 5–12", gap size. Never a bare score. */
  detail?: string;
}

export interface EvidenceFinding {
  rule: string;
  severity: FindingSeverity;
  status: FindingStatus;
  /** Never empty — a finding with no evidence is not emitted. */
  evidence: FindingEvidence[];
  affectedEntities: Array<{
    type: "character" | "entity" | "event" | "thread" | "promise";
    id: string;
  }>;
  /** A proposal; null when UNRESOLVED. */
  remediation: string | null;
  /** The revision the evaluation ran against (both clocks pinned). */
  sourceRevisionId: string;
  evaluatedAt: string;
}

/**
 * Guard the "never a bare claim" invariant at the boundary: throws on
 * an empty evidence array so a rule cannot emit an evidence-less
 * finding by accident.
 */
export function assertFindingEvidence(finding: EvidenceFinding): EvidenceFinding {
  if (finding.evidence.length === 0) {
    throw new Error(`refusing to emit evidence-less finding for rule ${finding.rule}`);
  }
  if (finding.status === "UNRESOLVED" && finding.remediation !== null) {
    throw new Error(`UNRESOLVED finding for rule ${finding.rule} must carry remediation: null`);
  }
  return finding;
}
