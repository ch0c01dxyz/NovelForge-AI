/**
 * Line-level diff for the draft review view (NF-WF-007).
 *
 * Implementer choice (recorded per the contract): line granularity. Word
 * granularity was rejected — line diffs are cheaper to verify and read
 * for long prose, and every line is still navigable text (no canvas).
 */
export type DiffOp = "same" | "add" | "del";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Minimal line diff via LCS on lines (O(n*m) time; fine for chapter
 * lengths — bounded by the pinned chapter version and one draft).
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "del", text: a[i]! });
      i++;
    } else {
      out.push({ op: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ op: "del", text: a[i++]! });
  while (j < m) out.push({ op: "add", text: b[j++]! });
  return out;
}
