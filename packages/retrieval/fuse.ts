/**
 * Hybrid ranking (Phase 5).
 *
 * Two retrievers answer different questions and fail differently: full-text
 * finds a name the author typed verbatim (and misses a paraphrase), vector
 * search finds a paraphrase (and misses an exact rare token, and drifts
 * toward whatever is semantically adjacent). Neither is trustworthy alone,
 * so results are combined.
 *
 * The combination is Reciprocal Rank Fusion, chosen for one property that
 * matters more than elegance: it uses only RANKS, never scores. Cosine
 * similarity and PostgreSQL `ts_rank` are on incomparable scales, and any
 * weighted sum of them needs a normalisation constant that quietly encodes
 * assumptions about one deployment's corpus. RRF has no such constant, so
 * the same query returns the same ordering regardless of how scores
 * happen to be distributed that day.
 *
 * Every result keeps the retrievers that found it and each one's rank, so
 * a caller can explain WHY something was returned — the "evidence-bearing"
 * requirement. A fused result that cannot say where it came from is not
 * usable as a citation.
 */
import { at, type ValidationFailure, type ValidationResult } from "@novelforge/validation";

/** Which retriever produced a hit. */
export const RETRIEVERS = ["LEXICAL", "VECTOR"] as const;
export type Retriever = (typeof RETRIEVERS)[number];

export interface Hit {
  /** Stable id of the underlying unit (a chunk, in this phase). */
  id: string;
  /** 1-based position within its retriever's result list. */
  rank: number;
  /** Raw score from that retriever. Kept for explainability, never ranked on. */
  score?: number;
  /** Retriever-specific provenance (e.g. the matched tsquery terms). */
  detail?: string;
}

export interface Contribution {
  retriever: Retriever;
  rank: number;
  score?: number;
  detail?: string;
}

export interface FusedResult {
  id: string;
  /** Sum of reciprocal ranks. Higher is better. */
  score: number;
  /** Every retriever that returned this id, in RETRIEVERS order. */
  foundBy: Retriever[];
  /** Per-retriever rank/score, so the result explains itself. */
  contributions: Contribution[];
}

/**
 * RRF dampening. 60 is the value from the original TREC work and the
 * de-facto default; changing it changes how sharply the top of one list
 * dominates, which is a tuning decision rather than a correctness one.
 */
export const DEFAULT_RRF_K = 60;

export interface FuseOptions {
  /** Per-retriever results, already ordered best-first by that retriever. */
  lists: Partial<Record<Retriever, Hit[]>>;
  /** Rank dampening constant. Must be >= 1. */
  k?: number;
  /**
   * Drop ids found by fewer than this many retrievers. Defaults to 1 (keep
   * everything). Raising it to 2 is a precision/recall trade: it keeps only
   * items both retrievers agree on, which is exactly the case hybrid search
   * exists to catch.
   *
   * Counts DISTINCT retrievers, which is guaranteed because a repeated id
   * within one list is rejected (`FUSE_DUPLICATE_HIT`) rather than counted
   * twice. Without that rejection a single-leg hit could satisfy a
   * two-retriever filter.
   */
  minRetrievers?: number;
  /** Cap on returned results, applied AFTER ordering. */
  limit?: number;
}

export function fuse(options: FuseOptions): ValidationResult<FusedResult[]> {
  const k = options.k ?? DEFAULT_RRF_K;
  const minRetrievers = options.minRetrievers ?? 1;

  if (!Number.isInteger(k) || k < 1) {
    return {
      ok: false,
      failures: [
        { path: "$.k", code: "FUSE_BAD_K", message: "k must be an integer >= 1" },
      ],
    };
  }
  if (!Number.isInteger(minRetrievers) || minRetrievers < 1 || minRetrievers > RETRIEVERS.length) {
    return {
      ok: false,
      failures: [
        {
          path: "$.minRetrievers",
          code: "FUSE_BAD_MIN_RETRIEVERS",
          message: `minRetrievers must be an integer between 1 and ${RETRIEVERS.length}`,
        },
      ],
    };
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    return {
      ok: false,
      failures: [
        { path: "$.limit", code: "FUSE_BAD_LIMIT", message: "limit must be a positive integer" },
      ],
    };
  }

  const acc = new Map<string, FusedResult>();
  const failures: ValidationFailure[] = [];

  // RETRIEVERS order, not object-key order: the output must be independent
  // of the order the caller happened to build the object in.
  //
  // `lists` is validated rather than dereferenced. Every other malformed
  // input returns a structured failure; without this the one MANDATORY
  // field threw a TypeError, so a JS caller (or a spread that dropped the
  // key) got an exception from a function whose whole contract is that
  // failures are data.
  const lists = options.lists;
  if (lists === null || typeof lists !== "object") {
    return {
      ok: false,
      failures: [
        { path: "$.lists", code: "FUSE_BAD_LISTS", message: "lists must be an object of ranked lists" },
      ],
    };
  }

  for (const retriever of RETRIEVERS) {
    const hits = lists[retriever];
    if (!hits) continue;

    hits.forEach((hit, i) => {
      if (typeof hit.id !== "string" || hit.id.length === 0) {
        failures.push({
          path: at(at("$.lists", retriever), i),
          code: "FUSE_BAD_HIT_ID",
          message: "hit id must be a non-empty string",
        });
        return;
      }
      // A mis-numbered rank would silently mis-weight the fusion, so the
      // declared rank must agree with the position in the list.
      if (hit.rank !== i + 1) {
        failures.push({
          path: at(at(at("$.lists", retriever), i), "rank"),
          code: "FUSE_RANK_MISMATCH",
          message: `hit "${hit.id}" declares rank ${hit.rank} but is at position ${i + 1}`,
        });
        return;
      }

      const existing = acc.get(hit.id);
      // A retriever must return each document at most once. RRF scores one
      // rank per retriever per document, so a repeated id would add a second
      // reciprocal rank — the chunk would outrank genuinely better results
      // as though two retrievers had agreed on it, and `foundBy` would name
      // the same retriever twice. Rejected rather than deduped: a leg that
      // emits a duplicate is broken, and silently collapsing it would hide
      // the bug behind a plausible score.
      if (existing && existing.foundBy.includes(retriever)) {
        failures.push({
          path: at(at("$.lists", retriever), i),
          code: "FUSE_DUPLICATE_HIT",
          message: `hit "${hit.id}" appears twice in the ${retriever} list`,
        });
        return;
      }
      const contribution: Contribution = {
        retriever,
        rank: hit.rank,
        ...(hit.score !== undefined ? { score: hit.score } : {}),
        ...(hit.detail !== undefined ? { detail: hit.detail } : {}),
      };
      if (existing) {
        existing.score += 1 / (k + hit.rank);
        existing.foundBy.push(retriever);
        existing.contributions.push(contribution);
      } else {
        acc.set(hit.id, {
          id: hit.id,
          score: 1 / (k + hit.rank),
          foundBy: [retriever],
          contributions: [contribution],
        });
      }
    });
  }

  if (failures.length > 0) return { ok: false, failures };

  const results = [...acc.values()]
    .filter((r) => r.foundBy.length >= minRetrievers)
    // Ties broken by id, so the same input always yields the same output.
    // A tie broken by insertion order would make results depend on which
    // retriever happened to be processed first.
    .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { ok: true, value: options.limit !== undefined ? results.slice(0, options.limit) : results };
}
