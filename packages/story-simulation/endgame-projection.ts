/**
 * NF-WF-022C: endgame closure projection — pure domain logic.
 *
 * "What if thread X stays OPEN?" The projection reads the 022A closure
 * ledger (MUST/SHOULD/MAY/OPEN/SEQUEL statuses) and projects which threads
 * close under an author-supplied close plan, using 021 simulation
 * primitives (initialState + per-tick injections with stateDelta).
 *
 * These functions are pure and deterministic: no DB, no HTTP, no LLM,
 * no randomness. The seed is recorded on the scenario for provenance
 * (same convention as 021C), but the outcome is fully determined by
 * (ledger entries, closePlan).
 *
 * READ-ONLY on the ledger: buildEndgameScenario and
 * interpretEndgameProjection never mutate their inputs. The simulation
 * run itself writes to 021 simulation tables only (Invariant 1) — the
 * ledger is never written by the projection. Callers that need a stronger
 * guarantee should snapshot their ledger store before projecting.
 *
 * The ledger entry shape mirrors the 022A contract's pinned shapes
 * (tasks/NF-WF-022-endgame.md §022A): statuses MUST/SHOULD/MAY/OPEN/SEQUEL.
 * `closed` is 022A's derivation of whether the entry's thread is already
 * closed (however 022A derives it — e.g. linked story thread RESOLVED).
 * This module does not reach into story tables.
 */

/** Pinned 022A closure-planning statuses (contract §022A). */
export type EndgameClosureStatus =
  | "MUST"
  | "SHOULD"
  | "MAY"
  | "OPEN"
  | "SEQUEL";

/**
 * A closure ledger entry as read for projection. Pinned shape —
 * 022A's `GET .../endgame/ledger` returns entries with at least these
 * fields; extra fields are ignored by the projection.
 */
export interface EndgameLedgerEntry {
  ledgerId: string;
  threadId: string;
  status: EndgameClosureStatus;
  /** Whether the entry's thread is already closed (022A's derivation). */
  closed: boolean;
  criteria: string | null;
}

/** A 021 scenario carrying an endgame projection. */
export interface EndgameProjectionScenario {
  initialState: Record<string, unknown>;
  injections: Record<string, unknown[]>;
  seed: string;
  maxTicks: number;
}

/** Which threads the projection closes, and the projected gate verdict. */
export interface EndgameProjectionResult {
  /** MUST entries closed at the end of the projected scenario. */
  closedMusts: EndgameLedgerEntry[];
  /** MUST entries still open at the end of the projected scenario. */
  openMusts: EndgameLedgerEntry[];
  /** SHOULD/MAY entries closed at the end of the projected scenario. */
  closedOthers: EndgameLedgerEntry[];
  /** SHOULD/MAY/OPEN entries still open at the end. SEQUEL never blocks. */
  openOthers: EndgameLedgerEntry[];
  /**
   * Projected gate verdict under the scenario: READY when no MUST is
   * open. This is a *projection*, not the 022A ending gate — author
   * sign-off (022A `POST .../gate/approve`) is a separate act.
   */
  projectedGate: "READY" | "BLOCKED";
  ticksRun: number;
}

/** State key for a thread's projected closure state. */
export function endgameThreadKey(threadId: string): string {
  return `thread:${threadId}`;
}

export const ENDGAME_CLOSE_EVENT_KIND = "ENDGAME_THREAD_CLOSED";
const CLOSED = "CLOSED";
const OPEN_STATE = "OPEN";

export interface BuildEndgameScenarioOptions {
  /**
   * Thread ids the author plans to close, in order. One thread closes
   * per tick. Threads absent from the plan stay in their ledger state
   * — this is how "what if thread X stays OPEN?" is expressed.
   * Entries already closed are no-ops (idempotent).
   */
  closePlan: string[];
  seed?: string;
}

/**
 * Build a 021 scenario from ledger entries and a close plan.
 *
 * @throws Error with code "INVALID_INPUT" when the close plan references
 * an unknown thread id or contains duplicates.
 */
export function buildEndgameScenario(
  entries: EndgameLedgerEntry[],
  options: BuildEndgameScenarioOptions,
): EndgameProjectionScenario {
  const { closePlan, seed = "endgame-projection" } = options;

  const known = new Set(entries.map((e) => e.threadId));
  const seen = new Set<string>();
  for (const threadId of closePlan) {
    if (!known.has(threadId)) {
      throw new Error(
        `INVALID_INPUT: close plan references unknown thread ${threadId}`,
      );
    }
    if (seen.has(threadId)) {
      throw new Error(
        `INVALID_INPUT: close plan contains duplicate thread ${threadId}`,
      );
    }
    seen.add(threadId);
  }

  const byThreadId = new Map(entries.map((e) => [e.threadId, e]));

  const initialState: Record<string, unknown> = {
    projection: "endgame-closure",
  };
  for (const e of entries) {
    initialState[endgameThreadKey(e.threadId)] = e.closed ? CLOSED : OPEN_STATE;
  }

  const injections: Record<string, unknown[]> = {};
  closePlan.forEach((threadId, i) => {
    const entry = byThreadId.get(threadId)!;
    injections[String(i + 1)] = [
      {
        kind: ENDGAME_CLOSE_EVENT_KIND,
        payload: {
          threadId,
          ledgerId: entry.ledgerId,
          status: entry.status,
        },
        stateDelta: { [endgameThreadKey(threadId)]: CLOSED },
      },
    ];
  });

  // One tick per planned closure; a single no-op tick when the plan is
  // empty so the run still reports the current projected state.
  const maxTicks = Math.max(closePlan.length, 1);

  return { initialState, injections, seed, maxTicks };
}

/**
 * Interpret a finished projection run's final tick state.
 *
 * @param finalState the last tick's stateAfter (flat thread-key map).
 * @param entries the ledger entries the scenario was built from.
 * @param ticksRun how many ticks actually ran.
 */
export function interpretEndgameProjection(
  finalState: Record<string, unknown>,
  entries: EndgameLedgerEntry[],
  ticksRun: number,
): EndgameProjectionResult {
  const isClosed = (e: EndgameLedgerEntry): boolean =>
    finalState[endgameThreadKey(e.threadId)] === CLOSED;

  const closedMusts: EndgameLedgerEntry[] = [];
  const openMusts: EndgameLedgerEntry[] = [];
  const closedOthers: EndgameLedgerEntry[] = [];
  const openOthers: EndgameLedgerEntry[] = [];

  for (const e of entries) {
    const closed = isClosed(e);
    if (e.status === "MUST") {
      (closed ? closedMusts : openMusts).push(e);
    } else {
      (closed ? closedOthers : openOthers).push(e);
    }
  }

  return {
    closedMusts,
    openMusts,
    closedOthers,
    openOthers,
    projectedGate: openMusts.length === 0 ? "READY" : "BLOCKED",
    ticksRun,
  };
}
