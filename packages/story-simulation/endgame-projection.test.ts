/**
 * NF-WF-022C: endgame projection pure-function tests.
 *
 * Deterministic (no DB, no randomness). These pin the projection
 * semantics: close-plan → per-tick closures, "what if X stays OPEN",
 * projected gate verdicts, and input validation.
 */
import { describe, expect, it } from "vitest";
import {
  buildEndgameScenario,
  interpretEndgameProjection,
  endgameThreadKey,
  ENDGAME_CLOSE_EVENT_KIND,
  type EndgameLedgerEntry,
} from "./endgame-projection.ts";

function entry(
  threadId: string,
  status: EndgameLedgerEntry["status"],
  closed = false,
): EndgameLedgerEntry {
  return {
    ledgerId: `ledger-${threadId}`,
    threadId,
    status,
    closed,
    criteria: `${status} criteria for ${threadId}`,
  };
}

const LEDGER: EndgameLedgerEntry[] = [
  entry("t-must-1", "MUST", true), // already closed
  entry("t-must-2", "MUST", false), // open — blocks the gate
  entry("t-should-1", "SHOULD", false),
  entry("t-may-1", "MAY", false),
  entry("t-open-1", "OPEN", false),
  entry("t-sequel-1", "SEQUEL", false),
];

describe("buildEndgameScenario", () => {
  it("maps ledger closed flags into the initial state", () => {
    const s = buildEndgameScenario(LEDGER, { closePlan: [] });
    expect(s.initialState[endgameThreadKey("t-must-1")]).toBe("CLOSED");
    expect(s.initialState[endgameThreadKey("t-must-2")]).toBe("OPEN");
    expect(s.initialState[endgameThreadKey("t-sequel-1")]).toBe("OPEN");
  });

  it("emits one ENDGAME_THREAD_CLOSED injection per planned thread, in order", () => {
    const s = buildEndgameScenario(LEDGER, {
      closePlan: ["t-must-2", "t-should-1"],
    });
    expect(s.maxTicks).toBe(2);
    const tick1 = s.injections["1"] as Array<Record<string, unknown>>;
    const tick2 = s.injections["2"] as Array<Record<string, unknown>>;
    expect(tick1[0]!.kind).toBe(ENDGAME_CLOSE_EVENT_KIND);
    expect((tick1[0]!.payload as Record<string, unknown>).threadId).toBe(
      "t-must-2",
    );
    expect(tick2[0]!.kind).toBe(ENDGAME_CLOSE_EVENT_KIND);
    expect(
      (tick1[0]!.stateDelta as Record<string, unknown>)[
        endgameThreadKey("t-must-2")
      ],
    ).toBe("CLOSED");
  });

  it("uses a single no-op tick for an empty close plan", () => {
    const s = buildEndgameScenario(LEDGER, { closePlan: [] });
    expect(s.maxTicks).toBe(1);
    expect(s.injections).toEqual({});
  });

  it("rejects a close plan referencing an unknown thread", () => {
    expect(() =>
      buildEndgameScenario(LEDGER, { closePlan: ["t-nope"] }),
    ).toThrow(/INVALID_INPUT.*unknown thread/);
  });

  it("rejects a close plan with duplicate threads", () => {
    expect(() =>
      buildEndgameScenario(LEDGER, {
        closePlan: ["t-must-2", "t-must-2"],
      }),
    ).toThrow(/INVALID_INPUT.*duplicate/);
  });

  it("does not mutate its inputs", () => {
    const before = JSON.parse(JSON.stringify(LEDGER));
    const plan = ["t-must-2"];
    buildEndgameScenario(LEDGER, { closePlan: plan });
    expect(LEDGER).toEqual(before);
    expect(plan).toEqual(["t-must-2"]);
  });

  it("is deterministic: same inputs produce byte-identical scenarios", () => {
    const a = JSON.stringify(
      buildEndgameScenario(LEDGER, { closePlan: ["t-must-2"] }),
    );
    const b = JSON.stringify(
      buildEndgameScenario(LEDGER, { closePlan: ["t-must-2"] }),
    );
    expect(a).toBe(b);
  });
});

describe("interpretEndgameProjection", () => {
  function finalStateAfterPlan(closePlan: string[]): Record<string, unknown> {
    // Simulate 021A's tick rule: initial state + per-tick stateDelta merges.
    const s = buildEndgameScenario(LEDGER, { closePlan });
    const state: Record<string, unknown> = { ...s.initialState };
    for (let tick = 1; tick <= s.maxTicks; tick++) {
      for (const inj of s.injections[String(tick)] ?? []) {
        const delta = (inj as Record<string, unknown>).stateDelta as
          | Record<string, unknown>
          | undefined;
        if (delta) Object.assign(state, delta);
      }
    }
    return state;
  }

  it("projects READY when every MUST closes under the plan", () => {
    const result = interpretEndgameProjection(
      finalStateAfterPlan(["t-must-2", "t-should-1"]),
      LEDGER,
      2,
    );
    expect(result.projectedGate).toBe("READY");
    expect(result.openMusts).toEqual([]);
    expect(result.closedMusts.map((e) => e.threadId).sort()).toEqual([
      "t-must-1",
      "t-must-2",
    ]);
  });

  it("projects BLOCKED when a MUST stays OPEN (the 'what if X stays OPEN' scenario)", () => {
    const result = interpretEndgameProjection(
      finalStateAfterPlan(["t-should-1"]),
      LEDGER,
      1,
    );
    expect(result.projectedGate).toBe("BLOCKED");
    expect(result.openMusts.map((e) => e.threadId)).toEqual(["t-must-2"]);
    // The SHOULD closed, the MUST did not.
    expect(result.closedOthers.map((e) => e.threadId)).toEqual(["t-should-1"]);
  });

  it("an empty plan projects the current state (BLOCKED with open MUSTs)", () => {
    const result = interpretEndgameProjection(
      finalStateAfterPlan([]),
      LEDGER,
      1,
    );
    expect(result.projectedGate).toBe("BLOCKED");
    expect(result.openMusts.map((e) => e.threadId)).toEqual(["t-must-2"]);
  });

  it("SEQUEL/OPEN entries never affect the projected gate", () => {
    const onlySequelOpen: EndgameLedgerEntry[] = [
      entry("t-sequel-1", "SEQUEL", false),
      entry("t-open-1", "OPEN", false),
    ];
    const s = buildEndgameScenario(onlySequelOpen, { closePlan: [] });
    const result = interpretEndgameProjection(
      { ...s.initialState },
      onlySequelOpen,
      1,
    );
    expect(result.projectedGate).toBe("READY");
    expect(result.openOthers.map((e) => e.threadId).sort()).toEqual([
      "t-open-1",
      "t-sequel-1",
    ]);
  });

  it("closing an already-closed thread is a no-op", () => {
    const result = interpretEndgameProjection(
      finalStateAfterPlan(["t-must-1"]),
      LEDGER,
      1,
    );
    expect(result.projectedGate).toBe("BLOCKED"); // t-must-2 still open
    expect(
      result.closedMusts.map((e) => e.threadId),
    ).toContain("t-must-1");
  });

  it("does not mutate the ledger entries", () => {
    const before = JSON.parse(JSON.stringify(LEDGER));
    interpretEndgameProjection(finalStateAfterPlan(["t-must-2"]), LEDGER, 1);
    expect(LEDGER).toEqual(before);
  });
});
