/**
 * Routing policy — pure decision logic, no I/O.
 *
 * Kept pure so retry/fallback/circuit-breaker rules are unit-testable
 * without a database or a network (CLAUDE.md §25). The manager supplies
 * candidates and applies the decisions.
 */
import { isRetryable, type ErrorCategory } from "./errors.ts";

export type RoutingStrategy =
  | "PRIORITY"
  | "WEIGHTED"
  | "ROUND_ROBIN"
  | "LEAST_LATENCY"
  | "FAILOVER";

/** A gateway/model pair eligible to serve a request. */
export interface Candidate {
  gatewayId: string;
  gatewayName: string;
  modelId: string;
  /** Lower = preferred (PRIORITY/FAILOVER). */
  priority: number;
  /** Relative share for WEIGHTED. */
  weight: number;
  /** Observed latency in ms, null when never measured. */
  latencyMs: number | null;
  /** Consecutive failures; drives the circuit breaker. */
  consecutiveFailures: number;
  enabled: boolean;
  /** Extra attempts allowed against this gateway after its first failure. */
  maxRetries?: number;
}

/**
 * Failures before a gateway is considered circuit-open. A small number:
 * the router already retries, so repeated failure means the instance is
 * genuinely unhealthy rather than briefly unlucky.
 */
export const CIRCUIT_THRESHOLD = 3;

export function isCircuitOpen(consecutiveFailures: number): boolean {
  return consecutiveFailures >= CIRCUIT_THRESHOLD;
}

/** Bounded exponential backoff with full jitter (CLAUDE.md §27). */
export function backoffDelayMs(
  attempt: number,
  baseMs = 250,
  maxMs = 8_000,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  // Full jitter: uniform in [0, exp] avoids synchronized retry storms.
  return Math.floor(random() * exp);
}

function byPriority(a: Candidate, b: Candidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  // Deterministic tiebreak so behaviour is reproducible.
  return a.gatewayId.localeCompare(b.gatewayId);
}

function byLatency(a: Candidate, b: Candidate): number {
  // Unmeasured gateways sort after measured ones (optimism deferred
  // until we actually know their latency), then by priority.
  const al = a.latencyMs ?? Number.POSITIVE_INFINITY;
  const bl = b.latencyMs ?? Number.POSITIVE_INFINITY;
  if (al !== bl) return al - bl;
  return byPriority(a, b);
}

/**
 * Weighted ordering without replacement: repeatedly pick from the
 * remaining pool with probability proportional to weight. Uses the
 * injected RNG so tests are deterministic.
 */
function orderWeighted(
  pool: Candidate[],
  random: () => number,
): Candidate[] {
  const remaining = [...pool];
  const out: Candidate[] = [];
  while (remaining.length > 0) {
    const total = remaining.reduce((s, c) => s + Math.max(1, c.weight), 0);
    let pick = random() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      pick -= Math.max(1, remaining[i]!.weight);
      if (pick <= 0) {
        index = i;
        break;
      }
    }
    out.push(remaining.splice(index, 1)[0]!);
  }
  return out;
}

/** Rotate by a caller-supplied counter (ROUND_ROBIN needs shared state). */
function orderRoundRobin(pool: Candidate[], cursor: number): Candidate[] {
  const sorted = [...pool].sort(byPriority);
  if (sorted.length === 0) return sorted;
  const start = ((cursor % sorted.length) + sorted.length) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

/**
 * Order the eligible candidates into the sequence of attempts to try.
 *
 * Circuit-open gateways are dropped when at least one healthy candidate
 * remains; if EVERY candidate is circuit-open they are all kept (better
 * to try something than to fail outright — the breaker is an ordering
 * preference, not a hard block).
 */
export function planAttempts(
  candidates: readonly Candidate[],
  strategy: RoutingStrategy,
  opts: {
    random?: () => number;
    roundRobinCursor?: number;
    maxAttempts?: number;
  } = {},
): Candidate[] {
  const random = opts.random ?? Math.random;
  const enabled = candidates.filter((c) => c.enabled);
  const healthy = enabled.filter((c) => !isCircuitOpen(c.consecutiveFailures));
  const pool = healthy.length > 0 ? healthy : enabled;

  let ordered: Candidate[];
  switch (strategy) {
    case "WEIGHTED":
      ordered = orderWeighted(pool, random);
      break;
    case "ROUND_ROBIN":
      ordered = orderRoundRobin(pool, opts.roundRobinCursor ?? 0);
      break;
    case "LEAST_LATENCY":
      ordered = [...pool].sort(byLatency);
      break;
    case "PRIORITY":
    case "FAILOVER":
    default:
      ordered = [...pool].sort(byPriority);
      break;
  }

  // Dedupe by gateway so fallback always moves to a DIFFERENT instance
  // first; a second model on the same gateway is only worth trying if no
  // other gateway exists.
  const seen = new Set<string>();
  const primary: Candidate[] = [];
  const repeats: Candidate[] = [];
  for (const c of ordered) {
    if (seen.has(c.gatewayId)) repeats.push(c);
    else {
      seen.add(c.gatewayId);
      primary.push(c);
    }
  }

  // Per-gateway retry budget: a gateway may be attempted once, plus
  // `maxRetries` more times. Configuring 0 means "never retry this
  // instance" — without this the stored setting would be inert.
  const used = new Map<string, number>();
  const sequence: Candidate[] = [];
  for (const c of [...primary, ...repeats]) {
    const budget = 1 + Math.max(0, c.maxRetries ?? DEFAULT_GATEWAY_RETRIES);
    const count = used.get(c.gatewayId) ?? 0;
    if (count >= budget) continue;
    used.set(c.gatewayId, count + 1);
    sequence.push(c);
  }

  return opts.maxAttempts !== undefined
    ? sequence.slice(0, Math.max(1, opts.maxAttempts))
    : sequence;
}

/**
 * Extra attempts allowed against a gateway when its config does not say.
 * Matches the schema default so an unconfigured gateway behaves like one
 * created with the default, and a single-gateway deployment still gets a
 * retry.
 */
export const DEFAULT_GATEWAY_RETRIES = 2;

/**
 * Whether to continue to the next candidate after a failed attempt.
 *
 * Auth/unsupported failures do not block the NEXT gateway (a different
 * instance may have valid credentials or the model), but invalid requests
 * and cancellations stop immediately — retrying them anywhere is futile
 * (CLAUDE.md §27).
 */
export function shouldTryNext(
  category: ErrorCategory,
  attemptsMade: number,
  maxAttempts: number,
): boolean {
  if (attemptsMade >= maxAttempts) return false;
  if (category === "INVALID_REQUEST" || category === "DETERMINISTIC") {
    return false;
  }
  // AUTH and UNSUPPORTED are gateway/model-specific: try elsewhere.
  if (category === "AUTH" || category === "UNSUPPORTED") return true;
  return isRetryable(category);
}
