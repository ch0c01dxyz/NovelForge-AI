/**
 * Approval snapshot material (NF-WF-005, invariant 2).
 *
 * When the executor parks at a HUMAN_APPROVAL step it persists an
 * `approvalSnapshot` on the step row: `{ material, snapshotHash }`. The
 * hash binds the approver's decision to the exact material they saw —
 * `sha256` over the canonical JSON encoding of the material — so a
 * decision minted against a stale view of the material cannot land
 * (409 STALE_APPROVAL).
 *
 * Canonical JSON: object keys sorted recursively (UTF-16 code-unit order,
 * the same order `Array.prototype.sort` uses), arrays keep their order,
 * `undefined` object values are dropped (matching `JSON.stringify`),
 * and the string is hashed as UTF-8. No whitespace, no key-order
 * dependence, no locale dependence. Deterministic across processes.
 */
import { createHash } from "node:crypto";

/** The material an approval decision binds to (invariant 2). */
export interface ApprovalSnapshotMaterial {
  /** The rendered instruction actually presented at park time. */
  instruction: string;
  /** Prior steps' `{text,json}` outcome envelopes at park time, by step key. */
  priorOutcomes: Record<string, { text: string | null; json: unknown }>;
  /** The workflow definition version the run executes. */
  workflowVersionNumber: number;
  /** Resolved agent versions for the run's steps, by agent key. */
  agentVersions: Record<string, number>;
  /** Resolved skill versions for the run's steps, by skill key. */
  skillVersions: Record<string, number>;
}

/** What is persisted on the step row's `approvalSnapshot` column. */
export interface ApprovalSnapshot {
  material: ApprovalSnapshotMaterial;
  snapshotHash: string;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeysDeep(v);
    return out;
  }
  return value;
}

/**
 * Canonical JSON encoding of any JSON-compatible value. Exported for the
 * fixed test vector — the hash is only as stable as this encoding.
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** sha256 hex of the canonical JSON encoding. */
export function hashApprovalMaterial(
  material: ApprovalSnapshotMaterial,
): string {
  return createHash("sha256")
    .update(canonicalizeJson(material), "utf8")
    .digest("hex");
}

/** Build the full `{ material, snapshotHash }` snapshot for persistence. */
export function buildApprovalSnapshot(
  material: ApprovalSnapshotMaterial,
): ApprovalSnapshot {
  return { material, snapshotHash: hashApprovalMaterial(material) };
}
