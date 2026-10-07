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

// ---------------------------------------------------------------------------
// NF-WF-028 (GAP-101): resolved-row builder.
// ---------------------------------------------------------------------------

/**
 * Why `buildResolvedRow` refused to build a merged row. Each maps to a
 * named 409 in the apply path (revisions.ts); the builder itself never
 * throws — it returns null, and the caller picks the typed error.
 */
export type ResolvedRowFailureReason =
  | "NO_EVIDENCE" // missing base/source/target row evidence or absent rule
  | "RULE_MISMATCH" // fresh re-derivation differs from the cited rule
  | "SHAPE_VIOLATION" // row shape violates the rule's preconditions
  | "COUPLED_FIELDS"; // coupled denylist pair detected across sides

export type BuildResolvedRowResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: ResolvedRowFailureReason };

/** Deep clone via JSON round-trip (matches revisions.ts payload handling). */
function cloneRow(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

/**
 * Build the merged row for a semantically-resolved change.
 *
 * Pure and deterministic: same (base, source, target, rule) → same row.
 * No LLM, no gateway, no I/O (024 Invariant 4).
 *
 * - S1: deep clone of sourceVersion (byte-identical to targetVersion).
 * - S2: deep clone of base with the one diverged text field replaced by
 *   the sentence-merged text (source's sentences where source changed,
 *   target's where target changed, base elsewhere).
 * - S3: deep clone of base with source's changed fields applied, then
 *   target's changed fields (denylist re-checked).
 *
 * Returns null (→ explicit refusal in the apply path) when: any row
 * evidence is missing, `semanticRule` is absent, the freshly re-derived
 * rule differs from the cited rule, the row shape violates the rule's
 * preconditions, or a coupled pair is detected.
 */
export function buildResolvedRowDetailed(change: MergeChange): BuildResolvedRowResult {
  const rule = change.semanticRule;
  const { base, sourceVersion, targetVersion } = change;

  // 1. Evidence check: rule + all three row versions must be present.
  if (!rule || !base || !sourceVersion || !targetVersion) {
    return { ok: false, reason: "NO_EVIDENCE" };
  }

  // 2. Re-derivation check (defensive): the cited rule must match a fresh
  // analysis of the change as a CONFLICT. This guards against corrupted
  // changes or rule-evaluation inconsistency — NOT preview staleness
  // (staleness is handled by the expectedHeadRevisionId CAS + locked
  // recompute in applyMerge, before the builder runs).
  const rederived = analyzeMergeChange({ ...change, kind: "CONFLICT" });
  if (rederived !== rule) {
    return { ok: false, reason: "RULE_MISMATCH" };
  }

  // 3. Build per rule, asserting the shape independently.
  switch (rule) {
    case "S1":
      return { ok: true, row: cloneRow(sourceVersion) };
    case "S2":
      return buildS2Row(base, sourceVersion, targetVersion);
    case "S3":
      return buildS3Row(base, sourceVersion, targetVersion);
  }
}

/**
 * Contract-pinned signature: the merged row, or null when unresolvable.
 * Prefer `buildResolvedRowDetailed` when the refusal reason matters.
 */
export function buildResolvedRow(change: MergeChange): Record<string, unknown> | null {
  const result = buildResolvedRowDetailed(change);
  return result.ok ? result.row : null;
}

/**
 * S2 row builder: base + sentence-merged text field.
 *
 * Independently asserts the S2 shape: exactly one field where both sides
 * changed from base, that field a string on all three versions, all other
 * fields byte-identical to base, equal sentence counts, and disjoint
 * changed sentence indices.
 */
function buildS2Row(
  base: Record<string, unknown>,
  sourceVersion: Record<string, unknown>,
  targetVersion: Record<string, unknown>,
): BuildResolvedRowResult {
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(sourceVersion),
    ...Object.keys(targetVersion),
  ]);

  let mergedField: string | null = null;
  for (const key of allKeys) {
    const b = base[key];
    const s = sourceVersion[key];
    const t = targetVersion[key];
    const sChanged = !deepEqual(b, s);
    const tChanged = !deepEqual(b, t);
    if (sChanged && tChanged) {
      if (mergedField !== null) return { ok: false, reason: "SHAPE_VIOLATION" };
      if (typeof b !== "string" || typeof s !== "string" || typeof t !== "string") {
        return { ok: false, reason: "SHAPE_VIOLATION" };
      }
      mergedField = key;
    } else if (sChanged || tChanged) {
      // S2 proves only single-field prose disjointness.
      return { ok: false, reason: "SHAPE_VIOLATION" };
    }
  }
  if (mergedField === null) return { ok: false, reason: "SHAPE_VIOLATION" };

  const bText = base[mergedField] as string;
  const sText = sourceVersion[mergedField] as string;
  const tText = targetVersion[mergedField] as string;
  const bSent = splitSentences(bText);
  const sSent = splitSentences(sText);
  const tSent = splitSentences(tText);
  if (bSent.length !== sSent.length || bSent.length !== tSent.length) {
    return { ok: false, reason: "SHAPE_VIOLATION" };
  }

  const mergedSentences: string[] = [];
  for (let i = 0; i < bSent.length; i++) {
    const sChanged = bSent[i] !== sSent[i];
    const tChanged = bSent[i] !== tSent[i];
    if (sChanged && tChanged) return { ok: false, reason: "SHAPE_VIOLATION" };
    if (sChanged) mergedSentences.push(sSent[i] as string);
    else if (tChanged) mergedSentences.push(tSent[i] as string);
    else mergedSentences.push(bSent[i] as string);
  }

  const row = cloneRow(base);
  // Deterministic reconstruction: sentences joined with a single space.
  // Both the rule and the builder use splitSentences, so the merge is
  // consistent; unchanged sentences come from base verbatim.
  row[mergedField] = mergedSentences.join(" ");
  return { ok: true, row };
}

/**
 * S3 row builder: base + source's changed fields + target's changed fields.
 *
 * Independently asserts the S3 shape: no field changed on both sides,
 * each side changed at least one field, and no coupled denylist pair
 * across sides (re-checked here as defense in depth).
 */
function buildS3Row(
  base: Record<string, unknown>,
  sourceVersion: Record<string, unknown>,
  targetVersion: Record<string, unknown>,
): BuildResolvedRowResult {
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(sourceVersion),
    ...Object.keys(targetVersion),
  ]);

  const sChanged: string[] = [];
  const tChanged: string[] = [];
  for (const key of allKeys) {
    const b = base[key];
    const s = sourceVersion[key];
    const t = targetVersion[key];
    const sc = !deepEqual(b, s);
    const tc = !deepEqual(b, t);
    if (sc && tc) return { ok: false, reason: "SHAPE_VIOLATION" };
    if (sc) sChanged.push(key);
    if (tc) tChanged.push(key);
  }
  if (sChanged.length === 0 || tChanged.length === 0) {
    return { ok: false, reason: "SHAPE_VIOLATION" };
  }

  // Defense in depth: the denylist is checked by the rule, re-checked here.
  for (const s of sChanged) {
    for (const t of tChanged) {
      if (isCoupledPair(s, t)) return { ok: false, reason: "COUPLED_FIELDS" };
    }
  }

  const row = cloneRow(base);
  for (const key of sChanged) {
    row[key] = cloneRow({ v: sourceVersion[key] }).v;
  }
  for (const key of tChanged) {
    row[key] = cloneRow({ v: targetVersion[key] }).v;
  }
  return { ok: true, row };
}
