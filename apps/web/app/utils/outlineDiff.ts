/**
 * Generic JSON diff for the Q2 outline-moved warning (NF-WF-007).
 *
 * Outline version `content` is arbitrary JSON (a frozen node list), so the
 * diff flattens both trees to path → leaf value and reports
 * added/removed/changed leaf paths. Paths use dot/bracket notation
 * (`beats[2]`, `scenes[0].summary`) so the author can see exactly which
 * parts moved.
 */
export interface OutlineChange {
  path: string;
  kind: "added" | "removed" | "changed";
  before: string;
  after: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function summarize(v: unknown): string {
  if (v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(prefix || "[]", value);
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0 && prefix) out.set(prefix, value);
    for (const k of keys) {
      const next = prefix ? `${prefix}.${k}` : k;
      flatten(value[k], next, out);
    }
    return;
  }
  out.set(prefix, value);
}

function leafEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff two outline-version `content` documents. Returns at most `limit`
 * changes in deterministic (sorted-path) order; `truncated` reports
 * whether more changes exist beyond the limit.
 */
export function diffOutlineContent(
  before: unknown,
  after: unknown,
  limit = 20,
): { changes: OutlineChange[]; truncated: boolean } {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before, "", a);
  flatten(after, "", b);

  const paths = new Set([...a.keys(), ...b.keys()]);
  const all: OutlineChange[] = [];
  for (const path of paths) {
    const hasA = a.has(path);
    const hasB = b.has(path);
    if (hasA && !hasB) {
      all.push({ path, kind: "removed", before: summarize(a.get(path)), after: "—" });
    } else if (!hasA && hasB) {
      all.push({ path, kind: "added", before: "—", after: summarize(b.get(path)) });
    } else if (!leafEqual(a.get(path), b.get(path))) {
      all.push({
        path,
        kind: "changed",
        before: summarize(a.get(path)),
        after: summarize(b.get(path)),
      });
    }
  }
  all.sort((x, y) => x.path.localeCompare(y.path));
  return {
    changes: all.slice(0, limit),
    truncated: all.length > limit,
  };
}
