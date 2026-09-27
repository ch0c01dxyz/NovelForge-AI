/**
 * Story intelligence primitives — events, threads, promises, causality
 * (Phase 6 slice 2).
 *
 * Pure and IO-free. Same DOMAIN package rules as canon.ts (ADR-0001): it
 * may import contracts/shared/story-core/validation and NOTHING else — no
 * Prisma, no HTTP, no provider. Every function here is a rule that can be
 * stated without touching a database.
 *
 * The enum-shaped unions are declared locally rather than imported from
 * the generated Prisma client, because importing it would cross the
 * boundary. They must stay in sync with schema.prisma; a unit test pins
 * the member sets.
 *
 * See docs/03-domain/STORY-INTELLIGENCE.md and
 * docs/adr/ADR-0008-canon-authority.md.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const THREAD_KINDS = [
  "MYSTERY",
  "CONFLICT",
  "QUESTION",
  "OBJECTIVE",
  "SUBPLOT",
] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const THREAD_STATUSES = ["ACTIVE", "DORMANT", "RESOLVED"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/**
 * The promise lifecycle (STORY-INTELLIGENCE.md), ordered setup → payoff.
 *
 * The order is load-bearing: `canPromiseTransition` allows only
 * forward movement through the open states, so a promise can never be
 * un-paid or demoted by a data path that should have gone through a
 * correction instead.
 */
export const PROMISE_STATUSES = [
  "SETUP",
  "DEVELOPING",
  "READY_FOR_PAYOFF",
  "PAID_OFF",
  "ABANDONED",
  "INVALIDATED",
] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

/** How strongly a causal edge is grounded in the text. */
export const CAUSAL_CONFIDENCES = ["EXPLICIT", "INFERRED", "SPECULATIVE"] as const;
export type CausalConfidence = (typeof CAUSAL_CONFIDENCES)[number];

// ---------------------------------------------------------------------------
// Promise lifecycle
// ---------------------------------------------------------------------------

const PROMISE_OPEN = new Set<PromiseStatus>(["SETUP", "DEVELOPING", "READY_FOR_PAYOFF"]);

/** A promise still owed to the reader. PAID_OFF/ABANDONED/INVALIDATED are closed. */
export function isPromiseOpen(status: PromiseStatus): boolean {
  return PROMISE_OPEN.has(status);
}

/**
 * May a promise move directly from `from` to `to`?
 *
 * Forward-only through the ordered lifecycle; ABANDONED and INVALIDATED
 * are reachable from any open state because the story can kill a promise
 * at any point while it is owed. Closed states are terminal — reopening a
 * paid-off promise without a corrective record would rewrite what the
 * reader already experienced.
 */
export function canPromiseTransition(from: PromiseStatus, to: PromiseStatus): boolean {
  if (from === to) return false;
  if (!PROMISE_OPEN.has(from)) return false;
  if (to === "ABANDONED" || to === "INVALIDATED") return true;
  return PROMISE_STATUSES.indexOf(to) > PROMISE_STATUSES.indexOf(from);
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** A thread the story has not closed. DORMANT is still unresolved — just resting. */
export function isThreadUnresolved(status: ThreadStatus): boolean {
  return status !== "RESOLVED";
}

// ---------------------------------------------------------------------------
// Causal edges
// ---------------------------------------------------------------------------

/**
 * Does an edge of this confidence need author approval before it may count
 * as story truth?
 *
 * EXPLICIT means the author (or the published text) stated the
 * relationship. INFERRED and SPECULATIVE are conclusions someone — usually
 * an AI pass — drew, and per CLAUDE.md §2.13 AI-derived claims are
 * candidates, not canon: they stay un-approved until an author accepts
 * them.
 */
export function edgeRequiresApproval(confidence: CausalConfidence): boolean {
  return confidence !== "EXPLICIT";
}

/** A causal edge as the cycle check sees it: who points at whom. */
export interface CausalEdgeRef {
  causeEventId: string;
  effectEventId: string;
}

/**
 * Find a cycle in the causal graph, returning the event ids along it, or
 * null when the graph is acyclic.
 *
 * A causal cycle is a time paradox: A happened because B, which happened
 * because A. Nothing downstream of this graph can reason coherently about
 * "why" if the graph loops, so the write path refuses the edge that closes
 * a loop instead of storing one.
 */
export function findCausalCycle(edges: readonly CausalEdgeRef[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.causeEventId) ?? [];
    list.push(edge.effectEventId);
    adjacency.set(edge.causeEventId, list);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of adjacency.keys()) color.set(node, WHITE);

  const path: string[] = [];

  // Iterative DFS — a 2,500-chapter novel can have a deep causal chain and
  // recursion would risk the stack.
  for (const root of adjacency.keys()) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    const stack: Array<{ node: string; index: number }> = [{ node: root, index: 0 }];
    color.set(root, GRAY);
    path.push(root);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = adjacency.get(frame.node) ?? [];
      if (frame.index >= next.length) {
        color.set(frame.node, BLACK);
        path.pop();
        stack.pop();
        continue;
      }
      const target = next[frame.index++]!;
      const targetColor = color.get(target) ?? WHITE;
      if (targetColor === GRAY) {
        // Found the loop: everything on the path from `target` onward.
        return path.slice(path.indexOf(target));
      }
      if (targetColor === WHITE) {
        color.set(target, GRAY);
        path.push(target);
        stack.push({ node: target, index: 0 });
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Narrative debt (STORY-INTELLIGENCE.md: derived, never an LLM score)
// ---------------------------------------------------------------------------

/** One owed narrative item, as the debt calculation sees it. */
export interface DebtItem {
  id: string;
  kind: "THREAD" | "PROMISE";
  open: boolean;
  /** 1–5 author-assigned importance. */
  importance: number;
  /** Chapters since the item was introduced. */
  ageChapters: number;
  /** Only promises at this status get the urgency multiplier. */
  readyForPayoff?: boolean;
}

export interface DebtScore {
  id: string;
  kind: DebtItem["kind"];
  score: number;
}

/**
 * Score narrative debt for a set of threads/promises, highest first.
 *
 * Deterministic and explainable on purpose (STORY-INTELLIGENCE.md): debt =
 * importance × (base + age), doubled when a promise is already at
 * READY_FOR_PAYOFF — a payoff the story has announced it is ready to
 * deliver and then keeps not delivering is the most debt-like thing there
 * is. No LLM, no hidden weights: the same rows always produce the same
 * ranking, so an author can audit why a thread surfaced.
 *
 * Closed items score 0 and sink, but stay in the list so callers can
 * display the full ledger; filter on `score > 0` for the urgent view.
 */
export function narrativeDebt(items: readonly DebtItem[]): DebtScore[] {
  const scored = items.map((item) => {
    if (!item.open) return { id: item.id, kind: item.kind, score: 0 };
    const urgency = item.readyForPayoff ? 2 : 1;
    return {
      id: item.id,
      kind: item.kind,
      score: item.importance * urgency * (10 + item.ageChapters),
    };
  });
  return scored.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Spoiler boundary
// ---------------------------------------------------------------------------

/**
 * Is a story item recorded at `chapter` visible to a reader at `readerAt`?
 *
 * Same semantics as canonBoundary: a non-integer or unknown chapter means
 * "no chapter anchoring", and an item that cannot be anchored is not
 * reader-visible at all — showing it would leak where it came from.
 * Boundary is inclusive: the chapter a reader has reached contains its
 * own events.
 */
export function readerVisible(chapter: number | null | undefined, readerAt: number): boolean {
  if (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 0) return false;
  return chapter <= readerAt;
}

// ---------------------------------------------------------------------------
// Timeline ordering
// ---------------------------------------------------------------------------

/** A timeline entry as the ordering check sees it. */
export interface TimelineEntry {
  id: string;
  order: number;
}

/**
 * Is a list of timeline entries strictly ordered and gap-free at the front?
 *
 * Strictly ascending: two events sharing an order have no defined
 * sequence, and a reader-facing timeline that says "then" twice for the
 * same slot is asserting an order it cannot support. Ordering is the
 * caller's to maintain on write; this checks what it stored.
 */
export function isChronological(entries: readonly TimelineEntry[]): boolean {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.order <= entries[i - 1]!.order) return false;
  }
  return true;
}
