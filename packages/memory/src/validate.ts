/**
 * @novelforge/memory — deterministic arc-summary response validation
 * (NF-WF-053 §13.1). Pure, fail-closed, no AI imports: proves SHAPE and
 * referential closure, never semantic faithfulness (accepted residual
 * risk, mitigated by persisted provenance + status visibility).
 */
import {
  ARC_SUMMARY_SECTION_HEADINGS,
  MEMORY_SUMMARY_MAX_CHARS,
} from "./constants.ts";
import type {
  ArcSummaryValidationResult,
  RegisteredEntityName,
  StructuralMemory,
} from "./types.ts";

/**
 * Validate the raw model output against the row's just-built structural
 * memory. Every failure is deterministic and terminal (no retry).
 */
export function validateArcSummary(args: {
  raw: string;
  structural: StructuralMemory;
  registeredEntities: RegisteredEntityName[];
}): ArcSummaryValidationResult {
  const { raw, structural, registeredEntities } = args;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "unparseable output: not JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, reason: "unparseable output: not an object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.summary !== "string") {
    return { valid: false, reason: "invalid output: summary missing" };
  }
  if (!Array.isArray(obj.coveredFactIds)) {
    return { valid: false, reason: "invalid output: coveredFactIds missing" };
  }
  const summary = obj.summary;
  const covered = obj.coveredFactIds;

  // 1. non-empty covered set.
  if (covered.length === 0) {
    return { valid: false, reason: "invalid coverage: empty coveredFactIds" };
  }
  // 2. unique members within the row's structural fact-id set.
  const structuralFactIds = new Set(structural.facts.map((f) => f.factId));
  const seen = new Set<string>();
  for (const id of covered) {
    if (typeof id !== "string") {
      return { valid: false, reason: "invalid coverage: non-string fact id" };
    }
    if (!structuralFactIds.has(id)) {
      return { valid: false, reason: `invalid coverage: unknown fact id ${id}` };
    }
    if (seen.has(id)) {
      return { valid: false, reason: `invalid coverage: duplicate fact id ${id}` };
    }
    seen.add(id);
  }
  // 3. summary non-empty and within the ceiling.
  if (summary.length === 0) {
    return { valid: false, reason: "invalid summary: empty" };
  }
  if (summary.length > MEMORY_SUMMARY_MAX_CHARS) {
    return {
      valid: false,
      reason: `invalid summary: length ${summary.length} exceeds ${MEMORY_SUMMARY_MAX_CHARS}`,
    };
  }
  // 4. fixed section headings present (exact strings).
  for (const heading of ARC_SUMMARY_SECTION_HEADINGS) {
    if (!summary.includes(heading)) {
      return { valid: false, reason: `invalid summary: missing heading ${heading}` };
    }
  }
  // 5. no-uncovered-entity closure: a registered entity name appearing in
  // the summary must be covered by the validated fact set.
  const coveredIds = new Set(covered as string[]);
  const coveredEntityIds = new Set<string>();
  for (const f of structural.facts) {
    if (!coveredIds.has(f.factId)) continue;
    coveredEntityIds.add(f.entityId);
    if ("entityId" in f.object) coveredEntityIds.add(f.object.entityId);
  }
  for (const e of registeredEntities) {
    if (e.name && summary.includes(e.name) && !coveredEntityIds.has(e.id)) {
      return {
        valid: false,
        reason: `invalid closure: uncovered entity ${e.name}`,
      };
    }
  }
  return { valid: true, summary, coveredFactIds: covered as string[] };
}
