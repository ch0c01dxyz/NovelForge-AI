import { describe, expect, it } from "vitest";
import {
  CAUSAL_CONFIDENCES,
  PROMISE_STATUSES,
  THREAD_KINDS,
  THREAD_STATUSES,
  canPromiseTransition,
  edgeRequiresApproval,
  findCausalCycle,
  isChronological,
  isPromiseOpen,
  isThreadUnresolved,
  narrativeDebt,
  readerVisible,
  type DebtItem,
} from "./events.ts";

describe("vocabulary stays in sync with the schema", () => {
  it("pins THREAD_KINDS", () => {
    expect([...THREAD_KINDS]).toEqual(["MYSTERY", "CONFLICT", "QUESTION", "OBJECTIVE", "SUBPLOT"]);
  });

  it("pins THREAD_STATUSES", () => {
    expect([...THREAD_STATUSES]).toEqual(["ACTIVE", "DORMANT", "RESOLVED"]);
  });

  it("pins PROMISE_STATUSES", () => {
    expect([...PROMISE_STATUSES]).toEqual([
      "SETUP",
      "DEVELOPING",
      "READY_FOR_PAYOFF",
      "PAID_OFF",
      "ABANDONED",
      "INVALIDATED",
    ]);
  });

  it("pins CAUSAL_CONFIDENCES", () => {
    expect([...CAUSAL_CONFIDENCES]).toEqual(["EXPLICIT", "INFERRED", "SPECULATIVE"]);
  });
});

describe("canPromiseTransition", () => {
  it("moves forward through the open lifecycle", () => {
    expect(canPromiseTransition("SETUP", "DEVELOPING")).toBe(true);
    expect(canPromiseTransition("DEVELOPING", "READY_FOR_PAYOFF")).toBe(true);
    expect(canPromiseTransition("SETUP", "READY_FOR_PAYOFF")).toBe(true);
    expect(canPromiseTransition("DEVELOPING", "PAID_OFF")).toBe(true);
  });

  it("refuses to skip backwards — un-paying a promise rewrites what the reader saw", () => {
    expect(canPromiseTransition("DEVELOPING", "SETUP")).toBe(false);
    expect(canPromiseTransition("PAID_OFF", "SETUP")).toBe(false);
    expect(canPromiseTransition("READY_FOR_PAYOFF", "DEVELOPING")).toBe(false);
  });

  it("allows abandonment and invalidation from any open state — the story can kill a promise any time it is owed", () => {
    for (const open of ["SETUP", "DEVELOPING", "READY_FOR_PAYOFF"] as const) {
      expect(canPromiseTransition(open, "ABANDONED")).toBe(true);
      expect(canPromiseTransition(open, "INVALIDATED")).toBe(true);
    }
  });

  it("treats closed states as terminal — reopening needs a corrective record, not a status write", () => {
    expect(canPromiseTransition("PAID_OFF", "ABANDONED")).toBe(false);
    expect(canPromiseTransition("PAID_OFF", "PAID_OFF")).toBe(false);
    expect(canPromiseTransition("ABANDONED", "SETUP")).toBe(false);
    expect(canPromiseTransition("INVALIDATED", "DEVELOPING")).toBe(false);
  });

  it("refuses a no-op move — nothing happens, no transition is recorded", () => {
    expect(canPromiseTransition("SETUP", "SETUP")).toBe(false);
  });
});

describe("isPromiseOpen", () => {
  it("counts the three setup states as owed and the three terminal states as closed", () => {
    expect(isPromiseOpen("SETUP")).toBe(true);
    expect(isPromiseOpen("DEVELOPING")).toBe(true);
    expect(isPromiseOpen("READY_FOR_PAYOFF")).toBe(true);
    expect(isPromiseOpen("PAID_OFF")).toBe(false);
    expect(isPromiseOpen("ABANDONED")).toBe(false);
    expect(isPromiseOpen("INVALIDATED")).toBe(false);
  });
});

describe("isThreadUnresolved", () => {
  it("DORMANT is still unresolved — a resting thread is not a closed one", () => {
    expect(isThreadUnresolved("ACTIVE")).toBe(true);
    expect(isThreadUnresolved("DORMANT")).toBe(true);
    expect(isThreadUnresolved("RESOLVED")).toBe(false);
  });
});

describe("edgeRequiresApproval", () => {
  it("EXPLICIT is grounded in the text; INFERRED and SPECULATIVE are AI-derived candidates (CLAUDE.md §2.13)", () => {
    expect(edgeRequiresApproval("EXPLICIT")).toBe(false);
    expect(edgeRequiresApproval("INFERRED")).toBe(true);
    expect(edgeRequiresApproval("SPECULATIVE")).toBe(true);
  });
});

describe("findCausalCycle", () => {
  const edge = (cause: string, effect: string) => ({ causeEventId: cause, effectEventId: effect });

  it("returns null for an acyclic chain — the common case stays cheap", () => {
    expect(findCausalCycle([edge("a", "b"), edge("b", "c"), edge("a", "c")])).toBeNull();
  });

  it("returns null for an empty graph", () => {
    expect(findCausalCycle([])).toBeNull();
  });

  it("catches a self-loop — an event that is its own cause is still a loop", () => {
    expect(findCausalCycle([edge("a", "a")])).toEqual(["a"]);
  });

  it("catches a two-event loop", () => {
    expect(findCausalCycle([edge("a", "b"), edge("b", "a")])).toEqual(["a", "b"]);
  });

  it("catches a loop only when it closes, not for a diamond that merges back", () => {
    // a → b → d, a → c → d: d has two parents but nothing loops.
    expect(
      findCausalCycle([edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]),
    ).toBeNull();
  });

  it("returns exactly the events on the loop, not the path that found it", () => {
    // tail → a → b → c → a: the cycle is [a, b, c], tail is not on it.
    expect(findCausalCycle([edge("tail", "a"), edge("a", "b"), edge("b", "c"), edge("c", "a")])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("survives a deep chain — iterative DFS, no stack overflow on 2,500-chapter causality", () => {
    const edges = Array.from({ length: 50_000 }, (_, i) => edge(`e${i}`, `e${i + 1}`));
    expect(findCausalCycle(edges)).toBeNull();
  });
});

describe("narrativeDebt", () => {
  const item = (over: Partial<DebtItem> & { id: string }): DebtItem => ({
    kind: "THREAD",
    open: true,
    importance: 3,
    ageChapters: 10,
    ...over,
  });

  it("ranks a high-importance old thread above a low-importance new one", () => {
    const scores = narrativeDebt([
      item({ id: "small", importance: 1, ageChapters: 5 }),
      item({ id: "big", importance: 5, ageChapters: 40 }),
    ]);
    expect(scores[0]!.id).toBe("big");
    expect(scores[1]!.id).toBe("small");
  });

  it("doubles a promise already at READY_FOR_PAYOFF — announced and undelivered is maximal debt", () => {
    const scores = narrativeDebt([
      item({ id: "plain", kind: "PROMISE", importance: 3, ageChapters: 10 }),
      item({ id: "ready", kind: "PROMISE", importance: 3, ageChapters: 10, readyForPayoff: true }),
    ]);
    expect(scores[0]!.id).toBe("ready");
    expect(scores[0]!.score).toBe(scores[1]!.score * 2);
  });

  it("scores closed items 0 but keeps them in the ledger", () => {
    const scores = narrativeDebt([
      item({ id: "closed", open: false, importance: 5, ageChapters: 100 }),
    ]);
    expect(scores).toEqual([{ id: "closed", kind: "THREAD", score: 0 }]);
  });

  it("is deterministic — same rows, same ranking, auditable", () => {
    const items = [
      item({ id: "a", importance: 2, ageChapters: 3 }),
      item({ id: "b", importance: 4, ageChapters: 1 }),
    ];
    expect(narrativeDebt(items)).toEqual(narrativeDebt([...items].reverse()));
  });

  it("returns [] for no items", () => {
    expect(narrativeDebt([])).toEqual([]);
  });
});

describe("readerVisible", () => {
  it("is inclusive — the chapter a reader reached contains its own events", () => {
    expect(readerVisible(5, 5)).toBe(true);
    expect(readerVisible(5, 6)).toBe(true);
  });

  it("hides events the reader has not reached — the spoiler boundary", () => {
    expect(readerVisible(6, 5)).toBe(false);
  });

  it("treats an unanchored item as invisible — unknown provenance must not leak", () => {
    expect(readerVisible(null, 100)).toBe(false);
    expect(readerVisible(undefined, 100)).toBe(false);
  });

  it("refuses non-integer and negative chapter anchors", () => {
    expect(readerVisible(2.5, 100)).toBe(false);
    expect(readerVisible(-1, 100)).toBe(false);
  });
});

describe("isChronological", () => {
  it("accepts empty and single-entry timelines", () => {
    expect(isChronological([])).toBe(true);
    expect(isChronological([{ id: "a", order: 1 }])).toBe(true);
  });

  it("accepts strictly ascending orders", () => {
    expect(
      isChronological([
        { id: "a", order: 1 },
        { id: "b", order: 2 },
        { id: "c", order: 10 },
      ]),
    ).toBe(true);
  });

  it("refuses ties — two events in one slot assert an order the data cannot support", () => {
    expect(
      isChronological([
        { id: "a", order: 1 },
        { id: "b", order: 1 },
      ]),
    ).toBe(false);
  });

  it("refuses descending orders", () => {
    expect(
      isChronological([
        { id: "a", order: 2 },
        { id: "b", order: 1 },
      ]),
    ).toBe(false);
  });
});
