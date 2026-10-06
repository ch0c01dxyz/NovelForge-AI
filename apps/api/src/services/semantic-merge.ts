/**
 * NF-WF-024C Part 1 — Semantic merge analysis.
 *
 * A deterministic layer over 020C's conservative merge. When the merge
 * preview runs with `mode: semantic`, CONFLICT changes are re-examined by
 * three pinned rules (S1/S2/S3). A rule may ONLY narrow CONFLICT → CLEAN,
 * and only with proof. Anything unproven stays CONFLICT (020C behavior).
 *
 * Invariant 4 (024): deterministic — same inputs → same verdict. No LLM
 * in the decision path. The rules below are pure functions of the
 * base/source/target row payloads carried on the MergeChange.
 *
 * §5 (constitution): conflicts must be surfaced, never silently
 * reconciled. A single auto-merged true conflict FAILS the 024C precision
 * gate, so every rule is written conservatively: when in doubt, return
 * null (stays CONFLICT).
 */

import type { MergeChange } from "./revisions.ts";

/** The rule that proved a CONFLICT safe, cited on the reclassified change. */
export type SemanticRule = "S1" | "S2" | "S3";

/**
 * Coupled-field denylist (pinned by the 024 contract, F2).
 *
 * Pairs of fields that are semantically linked: changing one side's
 * `status` while the other side changes `statusReason` is a true
 * conflict even though the fields are technically disjoint. S3 must
 * never clear such pairs.
 *
 * Compared case-insensitively with underscores stripped, so both
 * `statusReason` (Prisma) and `status_reason` (database column) match.
 */
export const COUPLED_FIELD_DENYLIST: ReadonlyArray<readonly [string, string]> = [
  ["status", "statusReason"],
  ["role", "roleDescription"],
] as const;

function normalizeField(name: string): string {
  return name.toLowerCase().replace(/_/g, "");
}

function isCoupledPair(a: string, b: string): boolean {
  const na = normalizeField(a);
  const nb = normalizeField(b);
  return COUPLED_FIELD_DENYLIST.some(([x, y]) => {
    const nx = normalizeField(x);
    const ny = normalizeField(y);
    return (na === nx && nb === ny) || (na === ny && nb === nx);
  });
}

/**
 * Deterministic JSON serialization with sorted keys. Two row payloads
 * that serialize identically are byte-identical changes.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    );
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * S1 — Byte-identical change.
 *
 * Both sides made the exact same change (source and target row payloads
 * are byte-identical). 020C conservatively called this CONFLICT because
 * identity could not be proven from the change log; with the snapshot
 * row evidence proving byte-identity, CLEAN is safe.
 *
 * Requires all three row payloads present. If source and target are
 * identical to each other (regardless of base), the merge result is
 * unambiguous.
 */
function tryS1(change: MergeChange): SemanticRule | null {
  const { sourceVersion, targetVersion } = change;
  if (!sourceVersion || !targetVersion) return null;
  // Both sides present and byte-identical → the merged row is unambiguous.
  if (deepEqual(sourceVersion, targetVersion)) return "S1";
  return null;
}

/**
 * Deterministic sentence splitter. Splits on sentence-terminal
 * punctuation followed by whitespace (or end of string). Pure function,
 * no ML segmenter (Invariant 4).
 */
function splitSentences(text: string): string[] {
  // Split on . ! ? followed by whitespace or end; keep the delimiter.
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * S2 — Disjoint text spans.
 *
 * For a text field changed on both sides: segment base/source/target
 * into sentences deterministically. If the sentence counts differ (an
 * insertion/deletion reshaped the text), the spans cannot be proven
 * disjoint → null. Otherwise, the changed sentence indices on each side
 * (vs base) must be disjoint → the edits touch different regions → CLEAN.
 *
 * Only applies when exactly one text field diverged on both sides and
 * every other field is byte-identical across the three versions. This
 * keeps S2 narrow: it proves non-overlapping edits to a single prose
 * field, nothing more.
 */
function tryS2(change: MergeChange): SemanticRule | null {
  const { base, sourceVersion, targetVersion } = change;
  if (!base || !sourceVersion || !targetVersion) return null;

  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(sourceVersion),
    ...Object.keys(targetVersion),
  ]);

  // Find fields where source and target BOTH differ from base.
  const bothChanged: string[] = [];
  for (const key of allKeys) {
    const b = (base as Record<string, unknown>)[key];
    const s = (sourceVersion as Record<string, unknown>)[key];
    const t = (targetVersion as Record<string, unknown>)[key];
    const sChanged = !deepEqual(b, s);
    const tChanged = !deepEqual(b, t);
    if (sChanged && tChanged) {
      // Must be a text field on all three versions.
      if (typeof b !== "string" || typeof s !== "string" || typeof t !== "string") {
        return null;
      }
      bothChanged.push(key);
    } else if (sChanged || tChanged) {
      // S2 proves only prose disjointness; other fields must be unchanged.
      return null;
    }
    // Fields where source and target differ from EACH OTHER but one
    // equals base are handled by S3/disjointness; S2 requires the
    // both-changed set to be exactly one text field.
  }

  if (bothChanged.length !== 1) return null;
  const field = bothChanged[0] as string;
  const bText = (base as Record<string, unknown>)[field] as string;
  const sText = (sourceVersion as Record<string, unknown>)[field] as string;
  const tText = (targetVersion as Record<string, unknown>)[field] as string;
  const bSent = splitSentences(bText);
  const sSent = splitSentences(sText);
  const tSent = splitSentences(tText);

  // Reshaped text (different sentence counts) → cannot prove disjoint.
  if (bSent.length !== sSent.length || bSent.length !== tSent.length) return null;

  const sChangedIdx = new Set<number>();
  const tChangedIdx = new Set<number>();
  for (let i = 0; i < bSent.length; i++) {
    if (bSent[i] !== sSent[i]) sChangedIdx.add(i);
    if (bSent[i] !== tSent[i]) tChangedIdx.add(i);
  }

  // Disjoint changed regions → non-overlapping edits → safe.
  for (const i of sChangedIdx) {
    if (tChangedIdx.has(i)) return null;
  }
  // At least one side must have changed something (else S1 would apply).
  if (sChangedIdx.size === 0 && tChangedIdx.size === 0) return null;
  return "S2";
}

/**
 * S3 — Disjoint structured fields.
 *
 * Different top-level fields changed on each side → CLEAN, unless any
 * (sourceField, targetField) pair is in the coupled-field denylist.
 * A field changed on BOTH sides (even to the same value — that is S1's
 * domain, checked first) blocks S3.
 */
function tryS3(change: MergeChange): SemanticRule | null {
  const { base, sourceVersion, targetVersion } = change;
  if (!base || !sourceVersion || !targetVersion) return null;

  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(sourceVersion),
    ...Object.keys(targetVersion),
  ]);

  const sChanged: string[] = [];
  const tChanged: string[] = [];
  for (const key of allKeys) {
    const b = (base as Record<string, unknown>)[key];
    const s = (sourceVersion as Record<string, unknown>)[key];
    const t = (targetVersion as Record<string, unknown>)[key];
    const sc = !deepEqual(b, s);
    const tc = !deepEqual(b, t);
    if (sc && tc) return null; // Same field changed both sides → not disjoint.
    if (sc) sChanged.push(key);
    if (tc) tChanged.push(key);
  }

  if (sChanged.length === 0 || tChanged.length === 0) return null;

  // Coupled pairs (e.g. status/statusReason) must stay CONFLICT even
  // when technically disjoint.
  for (const s of sChanged) {
    for (const t of tChanged) {
      if (isCoupledPair(s, t)) return null;
    }
  }
  return "S3";
}

/**
 * Analyze a CONFLICT change. Returns the proving rule, or null when the
 * change must stay CONFLICT.
 *
 * Rule order is S1 → S2 → S3 (most to least specific). The first proven
 * rule wins; its citation is recorded on the change.
 */
export function analyzeMergeChange(change: MergeChange): SemanticRule | null {
  if (change.kind !== "CONFLICT") return null;
  return tryS1(change) ?? tryS2(change) ?? tryS3(change);
}

/**
 * Narrow CONFLICT → CLEAN for every change a semantic rule proves safe.
 * Returns a new array (the input is not mutated). Changes reclassified
 * carry `semanticRule` citing the proving rule.
 */
export function applySemanticMerge(changes: MergeChange[]): MergeChange[] {
  return changes.map((change) => {
    if (change.kind !== "CONFLICT") return change;
    const rule = analyzeMergeChange(change);
    if (!rule) return change;
    return { ...change, kind: "CLEAN" as const, semanticRule: rule };
  });
}
