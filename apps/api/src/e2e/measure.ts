/**
 * Measurement harness for NF-WF-011 (`apps/api/src/e2e/measure.ts`).
 *
 * Wraps measured operations and records: wall-clock latency (p50/p95 over
 * repetitions), DB query counts (via a test-only Prisma middleware
 * counter), and per-tier context sizes in chars. Results feed
 * `docs/implementation/e2e-baseline.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NovelForgeDb } from "@novelforge/database";
import type { CompiledContext } from "@novelforge/ai-services";

export interface QueryMeasurement<T> {
  result: T;
  queryCount: number;
}

/**
 * Count the DB queries `fn` issues through a test-only Prisma client
 * extension. Prisma 7 removed `$use`; `$extends` returns a new client, so
 * `bindMeasureDb` returns the instrumented client — use it for measured
 * operations. The counter is active only while a measurement runs, so it
 * never leaks into other operations. Measurements run sequentially, so a
 * single active slot is sufficient.
 */
let activeCounter: { count: number } | null = null;

/** Bind the db the query counter instruments (call once per runner). */
export function bindMeasureDb(db: NovelForgeDb): NovelForgeDb {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (activeCounter) activeCounter.count += 1;
          return query(args);
        },
      },
    },
  }) as NovelForgeDb;
}

export async function measureQueries<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<QueryMeasurement<T>> {
  const counter = { count: 0 };
  activeCounter = counter;
  try {
    const result = await fn();
    return { result, queryCount: counter.count };
  } finally {
    activeCounter = null;
  }
}

export interface LatencyMeasurement {
  p50Ms: number;
  p95Ms: number;
  samples: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** Wall-clock latency over `repetitions` runs; returns p50/p95 in ms. */
export async function measureLatency<T>(
  _label: string,
  repetitions: number,
  fn: () => Promise<T>,
): Promise<LatencyMeasurement> {
  const samples: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    const start = process.hrtime.bigint();
    await fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  samples.sort((a, b) => a - b);
  return { p50Ms: percentile(samples, 50), p95Ms: percentile(samples, 95), samples: samples.length };
}

/** Per-tier char sizes of a compiled context (tier → chars). */
export function measureContext(compiled: CompiledContext): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const b of compiled.blocks) {
    sizes[`tier${b.tier}`] = (b.text ?? "").length;
  }
  sizes.total = Object.values(sizes).reduce((a, c) => a + c, 0);
  return sizes;
}

export interface E2EBaseline {
  generatedAt: string;
  gitSha: string;
  fixtureSeed: number;
  fixture: {
    chapters: number;
    revisions: number;
    characters: number;
    facts: number;
    timelineEvents: number;
    threads: number;
  };
  measurements: Record<
    string,
    {
      p50Ms: number;
      p95Ms: number;
      queries: number;
      thresholdMs: number;
      thresholdQueries: number | null;
    }
  >;
  contextSizes: Record<string, Record<string, number>>;
  thresholds: Record<string, { latencyMs: number; queries: number | null }>;
  notes: string[];
}

/** Write the baseline receipt JSON (pretty-printed, stable key order). */
export function writeBaselineReceipt(filePath: string, receipt: E2EBaseline): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(receipt, null, 2) + "\n");
}

/**
 * The no-regression rule (contract Invariant 4): every later run fails if
 * any DETERMINISTIC measurement (query counts, context sizes) regresses by
 * more than 2× vs the recorded baseline. Latency p95s are noisy, so they
 * are checked against the absolute ceilings instead (P3 observation 1:
 * the strict >2× rule is pinned to deterministic measurements; latencies
 * carry recorded tolerance via their generous ceilings).
 *
 * Defensive over the baseline shape: a hand-written or legacy receipt
 * missing `measurements`/`contextSizes` is treated as empty rather than
 * crashing the run (the baseline test re-baselines on shape mismatch).
 */
export function checkNoRegression(baseline: E2EBaseline, actual: E2EBaseline): string[] {
  const failures: string[] = [];
  for (const [name, base] of Object.entries(baseline.measurements ?? {})) {
    const cur = actual.measurements[name];
    if (!cur) {
      failures.push(`${name}: missing from current run`);
      continue;
    }
    if (base.queries > 0 && cur.queries > base.queries * 2) {
      failures.push(
        `${name}: query count regressed >2× (baseline ${base.queries}, now ${cur.queries})`,
      );
    }
  }
  for (const [name, baseSizes] of Object.entries(baseline.contextSizes ?? {})) {
    const curSizes = actual.contextSizes[name];
    if (!curSizes) {
      failures.push(`context ${name}: missing from current run`);
      continue;
    }
    for (const [tier, baseChars] of Object.entries(baseSizes)) {
      const curChars = curSizes[tier];
      if (curChars === undefined) {
        failures.push(`context ${name} ${tier}: missing from current run`);
        continue;
      }
      if (baseChars > 0 && curChars > baseChars * 2) {
        failures.push(
          `context ${name} ${tier}: size regressed >2× (baseline ${baseChars}, now ${curChars})`,
        );
      }
    }
  }
  return failures;
}
