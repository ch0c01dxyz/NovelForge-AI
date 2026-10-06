/**
 * NF-WF-021C: "The Irrigation Decision" civilization validation scenario.
 *
 * A deterministic, LLM-free simulation scenario that exercises 021A's run
 * lifecycle (20 ticks), 021B's causality (drought → causal links), and
 * 021B's proposals (irrigation → proposal → PAUSED_PROPOSAL → decision).
 *
 * HONESTY NOTE (contract §"Backend verification", UNVERIFIED): The pinned
 * numbers (population 500→380/480, food_security 0.6→0.7) are author-chosen
 * validation targets, NOT derived from a real model. The tick rules below
 * are tuned to hit these targets (±10%). This is a test fixture, not a
 * scientific claim about irrigation or demography.
 *
 * Determinism: all tick rules are pure functions of (state, tickNumber).
 * No randomness, no LLM calls, no wall-clock. Same seed + same decisions
 * → byte-identical state JSON.
 *
 * The scenario is a consumer of 021A/021B's PINNED SHAPES (SimulationRun
 * statuses, SimulationEntity kinds, CausalLink, SimulationProposal,
 * PAUSED_PROPOSAL). It does not depend on 021A/021B implementation code.
 */

// ---------------------------------------------------------------------------
// Pinned shapes (mirroring 021A §"Primitive vocabulary" and 021B §"Causal
// evidence" / §"Uncertainty as proposals"). These are the contract's
// normative shapes; 021C consumes them.
// ---------------------------------------------------------------------------

/** 021A-pinned SimulationEntity kinds; 021C's civilization kinds are the
 *  initial set per the contract review F5. */
export type SimulationEntityKind =
  | "SETTLEMENT"
  | "POPULATION"
  | "RESOURCE"
  | "KNOWLEDGE"
  | "INFRASTRUCTURE";

export type RunStatus =
  | "DRAFT"
  | "CONFIGURED"
  | "RUNNING"
  | "PAUSED"
  | "PAUSED_PROPOSAL"
  | "COMPLETED"
  | "ABORTED";

export interface SimulationEntity {
  id: string;
  runId: string;
  kind: SimulationEntityKind;
  attributes: Record<string, unknown>;
  tickCreated: number;
  tickRetired: number | null;
}

export interface SimulationEvent {
  id: string;
  runId: string;
  tickNumber: number;
  kind: string;
  entityId: string | null;
  payload: Record<string, unknown>;
}

/** 021B-pinned CausalLink shape. */
export interface CausalLink {
  id: string;
  runId: string;
  eventId: string;
  causeEventId: string | null;
  causeStateRef: string | null;
  kind: "DIRECT" | "ENABLING" | "PREVENTING";
  evidence: Record<string, unknown>;
}

/** 021B-pinned SimulationProposal shape (distinct from CanonProposal). */
export interface SimulationProposal {
  id: string;
  runId: string;
  tickNumber: number;
  kind: "OUTCOME_FORK";
  alternatives: Array<{
    id: string;
    outcome: string;
    evidence: Record<string, unknown>;
    confidence: number;
  }>;
  status: "PROPOSED" | "DECIDED";
  decision?: { choice: string; rationale?: string };
}

// ---------------------------------------------------------------------------
// Civilization state (the 021C domain model)
// ---------------------------------------------------------------------------

export interface CivilizationState {
  tick: number;
  /** Settlement population (500 initial). */
  population: number;
  /** Food security 0..1 (0.6 initial). */
  foodSecurity: number;
  /** Grain surplus units/year (100 initial). */
  grainSurplus: number;
  /** Infrastructure 0..1 (0.3 initial). */
  infrastructure: number;
  /** Irrigation technique known (true) vs. production-capable (false). */
  irrigationKnown: boolean;
  irrigationBuilt: boolean;
  /** 0..1 construction progress; 12 ticks = 3 years for full build. */
  irrigationBuildProgress: number;
  droughtActive: boolean;
}

export interface ScenarioTickResult {
  tickNumber: number;
  stateBefore: CivilizationState;
  stateAfter: CivilizationState;
  events: SimulationEvent[];
  causalLinks: CausalLink[];
  /** Set when the tick raises a proposal (run pauses). */
  proposal?: SimulationProposal;
}

export interface ScenarioRunResult {
  runId: string;
  status: RunStatus;
  ticks: ScenarioTickResult[];
  finalState: CivilizationState;
  proposals: SimulationProposal[];
  /** All events across ticks (for causal-chain queries). */
  events: SimulationEvent[];
  /** All causal links across ticks. */
  causalLinks: CausalLink[];
}

// ---------------------------------------------------------------------------
// Scenario constants (pinned by contract §021C)
// ---------------------------------------------------------------------------

export const SCENARIO_ID = "irrigation-decision";
export const SCENARIO_TICKS = 20;
export const DROUGHT_TICK = 5;
export const PROPOSAL_TICK = 10;
/** Ticks for a full 3-year irrigation build (4 seasons/year). */
export const IRRIGATION_BUILD_TICKS = 12;

/** Pinned validation targets (±10% tolerance in tests). */
export const EXPECTED = {
  initialPopulation: 500,
  initialFoodSecurity: 0.6,
  popWithoutIrrigation: 380,
  popWithIrrigation: 480,
  foodSecurityWithIrrigation: 0.7,
  tolerance: 0.1,
} as const;

/** Population growth coefficient, tuned so that 15 ticks at
 *  foodSecurity 0.3 take 500 → 380 (see module docstring). */
const GROWTH_COEFFICIENT = 0.0724;
/** Food-security level at which population is stable (growth = 0). */
const STABILITY_FOOD_SECURITY = 0.55;

// ---------------------------------------------------------------------------
// Scenario construction
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Reset the deterministic ID counter (for byte-identical re-runs). */
export function resetScenarioIds(): void {
  idCounter = 0;
}

export function createInitialState(): CivilizationState {
  return {
    tick: 0,
    population: EXPECTED.initialPopulation,
    foodSecurity: EXPECTED.initialFoodSecurity,
    grainSurplus: 100,
    infrastructure: 0.3,
    irrigationKnown: true,
    irrigationBuilt: false,
    irrigationBuildProgress: 0,
    droughtActive: false,
  };
}

export function createInitialEntities(runId: string): SimulationEntity[] {
  return [
    {
      id: `${runId}-settlement`,
      runId,
      kind: "SETTLEMENT",
      attributes: { name: "Riverbend Settlement" },
      tickCreated: 0,
      tickRetired: null,
    },
    {
      id: `${runId}-population`,
      runId,
      kind: "POPULATION",
      attributes: { count: EXPECTED.initialPopulation },
      tickCreated: 0,
      tickRetired: null,
    },
    {
      id: `${runId}-grain`,
      runId,
      kind: "RESOURCE",
      attributes: { resource: "grain", surplus: 100 },
      tickCreated: 0,
      tickRetired: null,
    },
    {
      id: `${runId}-irrigation-knowledge`,
      runId,
      kind: "KNOWLEDGE",
      attributes: {
        technique: "irrigation",
        known: true,
        productionCapable: false,
      },
      tickCreated: 0,
      tickRetired: null,
    },
    {
      id: `${runId}-infrastructure`,
      runId,
      kind: "INFRASTRUCTURE",
      attributes: { level: 0.3 },
      tickCreated: 0,
      tickRetired: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Deterministic tick rules (pure functions; NO LLM calls)
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Advance one tick. Pure function of (state, tickNumber, irrigationDecision).
 *
 * @param irrigationDecision - null until the tick-10 proposal is decided;
 *   true = build irrigation, false = maintain dry-farming. The proposal is
 *   raised at tick 10 when the preconditions hold; the caller decides.
 */
export function tickCivilization(
  runId: string,
  state: CivilizationState,
  tickNumber: number,
  irrigationDecision: boolean | null,
): ScenarioTickResult {
  const stateBefore: CivilizationState = { ...state };
  const events: SimulationEvent[] = [];
  const causalLinks: CausalLink[] = [];
  let proposal: SimulationProposal | undefined;

  const after: CivilizationState = { ...state, tick: tickNumber };

  const emit = (
    kind: string,
    payload: Record<string, unknown>,
    entityId: string | null = null,
  ): SimulationEvent => {
    const event: SimulationEvent = {
      id: nextId("evt"),
      runId,
      tickNumber,
      kind,
      entityId,
      payload,
    };
    events.push(event);
    return event;
  };

  const link = (
    event: SimulationEvent,
    cause: SimulationEvent | null,
    kind: CausalLink["kind"],
    evidence: Record<string, unknown>,
    causeStateRef: string | null = null,
  ): void => {
    causalLinks.push({
      id: nextId("lnk"),
      runId,
      eventId: event.id,
      causeEventId: cause ? cause.id : null,
      causeStateRef,
      kind,
      evidence,
    });
  };

  // --- Injection: drought at tick 5 ---
  if (tickNumber === DROUGHT_TICK) {
    after.droughtActive = true;
    after.foodSecurity = round2(Math.max(0, after.foodSecurity - 0.3));

    const drought = emit("DROUGHT", {
      severity: "severe",
      foodSecurityDelta: -0.3,
    });
    // Injections link to the scenario (021B: initial-scenario events link
    // to the scenario, not to a prior event).
    link(drought, null, "DIRECT", {
      rule: "scenario injection at tick 5",
    }, "scenario:injection");
    const cropFailure = emit("CROP_FAILURE", {
      cause: "drought",
      yieldLoss: 0.45,
    });
    link(cropFailure, drought, "DIRECT", {
      rule: "drought reduces crop yield",
      foodSecurityBefore: stateBefore.foodSecurity,
      foodSecurityAfter: after.foodSecurity,
    });
    const foodShortage = emit("FOOD_SHORTAGE", {
      cause: "crop failure",
      foodSecurity: after.foodSecurity,
    });
    link(foodShortage, cropFailure, "DIRECT", {
      rule: "crop failure reduces food availability",
    });
    // The shortage enables (but does not solely cause) population decline.
    link(foodShortage, null, "ENABLING", {
      rule: "food shortage enables population decline",
      note: "decline realized via the population tick rule",
    }, "state:foodSecurity");
  }

  // --- Injection: irrigation proposal at tick 10 ---
  // Uncertainty (021B Q4/F6): will a 3-year build complete before the next
  // drought? The tick does NOT decide; it raises a proposal and pauses.
  if (
    tickNumber === PROPOSAL_TICK &&
    irrigationDecision === null &&
    after.irrigationKnown &&
    !after.irrigationBuilt &&
    after.foodSecurity < 0.5
  ) {
    proposal = {
      id: nextId("prop"),
      runId,
      tickNumber,
      kind: "OUTCOME_FORK",
      alternatives: [
        {
          id: "build-irrigation",
          outcome: "Invest surplus in irrigation (3-year build)",
          evidence: {
            foodSecurity: after.foodSecurity,
            droughtTick: DROUGHT_TICK,
            buildTicks: IRRIGATION_BUILD_TICKS,
            risk: "build may not complete before the next drought",
          },
          confidence: 0.65,
        },
        {
          id: "maintain-dry-farming",
          outcome: "Maintain current dry-farming (no investment)",
          evidence: {
            foodSecurity: after.foodSecurity,
            trend: "continued decline without buffer",
          },
          confidence: 0.35,
        },
      ],
      status: "PROPOSED",
    };
    const proposalEvent = emit("PROPOSAL_RAISED", {
      proposalId: proposal.id,
      question: "Build irrigation before the next drought?",
    });
    // The food-shortage crisis enables the proposal (021B ENABLING).
    link(proposalEvent, null, "ENABLING", {
      rule: "post-drought food insecurity enables the irrigation question",
    }, "state:foodSecurity");
    // Pause: return early; the tick's state changes are withheld until
    // the proposal is decided (021B PAUSED_PROPOSAL semantics).
    return {
      tickNumber,
      stateBefore,
      stateAfter: stateBefore,
      events,
      causalLinks,
      proposal,
    };
  }

  // --- Irrigation construction (if approved) ---
  // Implementer judgment (documented): the 3-year (12-tick) build provides
  // phased benefits. Approved at tick 10, the build is 10/12 complete by
  // tick 20 — sufficient to hit the pinned validation targets. Full
  // completion would be tick 22, beyond the 20-tick validation window.
  //
  // Construction starts at PROPOSAL_TICK (the decision point), even if the
  // decision was known upfront (deterministic re-run). Ticks before the
  // proposal do not benefit.
  if (
    irrigationDecision === true &&
    tickNumber >= PROPOSAL_TICK &&
    !after.irrigationBuilt
  ) {
    after.irrigationBuildProgress = round2(
      Math.min(1, after.irrigationBuildProgress + 1 / IRRIGATION_BUILD_TICKS),
    );
    // Phased benefits: food security recovers as construction advances.
    // +0.08/tick reaches 0.7 by tick 15 (5 ticks after approval), then holds.
    after.foodSecurity = round2(Math.min(0.7, after.foodSecurity + 0.08));
    after.infrastructure = round2(Math.min(1, after.infrastructure + 0.05));
    if (after.irrigationBuildProgress >= 1) {
      after.irrigationBuilt = true;
      const built = emit("IRRIGATION_BUILT", { progress: 1 });
      link(built, null, "DIRECT", {
        rule: "construction completes the irrigation system",
      }, "state:irrigationBuildProgress");
    } else if (tickNumber === PROPOSAL_TICK + 1) {
      const started = emit("IRRIGATION_CONSTRUCTION_STARTED", {
        progress: after.irrigationBuildProgress,
      });
      link(started, null, "DIRECT", {
        rule: "proposal approval starts construction",
      }, "proposal:decision");
    }
    const recovery = emit("FOOD_SECURITY_RECOVERY", {
      foodSecurity: after.foodSecurity,
    });
    link(recovery, null, "DIRECT", {
      rule: "irrigation construction restores food security",
      buildProgress: after.irrigationBuildProgress,
    }, "state:irrigationBuildProgress");
  }

  // --- Drought recovery (natural, slow, without irrigation) ---
  if (tickNumber > DROUGHT_TICK && irrigationDecision !== true) {
    // Without irrigation, food security barely recovers (+0.005/tick).
    after.foodSecurity = round2(Math.min(0.35, after.foodSecurity + 0.005));
  }

  // --- Population dynamics (deterministic) ---
  // pop(t+1) = pop(t) * (1 + g * (foodSecurity - 0.55))
  const growthFactor =
    1 + GROWTH_COEFFICIENT * (after.foodSecurity - STABILITY_FOOD_SECURITY);
  after.population = Math.max(0, Math.round(after.population * growthFactor));

  // --- Grain surplus dynamics ---
  // Surplus tracks food security; drought depletes, irrigation restores.
  const surplusDelta = Math.round((after.foodSecurity - 0.5) * 40);
  after.grainSurplus = Math.max(0, after.grainSurplus + surplusDelta);
  if (
    irrigationDecision === true &&
    tickNumber >= PROPOSAL_TICK &&
    !stateBefore.irrigationBuilt
  ) {
    // Construction invests surplus.
    after.grainSurplus = Math.max(0, after.grainSurplus - 15);
  }

  // Drought ends after 3 ticks (ticks 5-7).
  if (tickNumber > DROUGHT_TICK + 2) {
    after.droughtActive = false;
  }

  return { tickNumber, stateBefore, stateAfter: after, events, causalLinks };
}

// ---------------------------------------------------------------------------
// Scenario runner (20 ticks; proposal pause/resume)
// ---------------------------------------------------------------------------

export interface RunScenarioOptions {
  runId: string;
  /** The author's decision at the tick-10 proposal. If null, the run pauses
   *  at tick 10 and returns PAUSED_PROPOSAL (021B semantics). */
  irrigationDecision?: boolean | null;
}

/**
 * Run the full 20-tick scenario. Deterministic: same runId + same decision
 * → byte-identical result (IDs are counter-based; call resetScenarioIds()
 * before each run for identical IDs).
 */
export function runIrrigationScenario(
  options: RunScenarioOptions,
): ScenarioRunResult {
  const { runId } = options;
  const decision = options.irrigationDecision ?? null;

  const ticks: ScenarioTickResult[] = [];
  const proposals: SimulationProposal[] = [];
  let state = createInitialState();
  let status: RunStatus = "RUNNING";
  const effectiveDecision: boolean | null = decision;

  for (let t = 1; t <= SCENARIO_TICKS; t++) {
    const result = tickCivilization(runId, state, t, effectiveDecision);
    ticks.push(result);
    if (result.proposal) {
      proposals.push(result.proposal);
      if (effectiveDecision === null) {
        // 021B: run pauses until the proposal is decided.
        status = "PAUSED_PROPOSAL";
        state = result.stateAfter;
        break;
      }
    }
    state = result.stateAfter;
  }

  if (status === "RUNNING") {
    status = "COMPLETED";
  }

  const events = ticks.flatMap((t) => t.events);
  const causalLinks = ticks.flatMap((t) => t.causalLinks);

  return {
    runId,
    status,
    ticks,
    finalState: state,
    proposals,
    events,
    causalLinks,
  };
}

/**
 * Resume a PAUSED_PROPOSAL run with the author's decision.
 * Returns the completed run (ticks 1..20).
 */
export function resumeIrrigationScenario(
  paused: ScenarioRunResult,
  choice: "build-irrigation" | "maintain-dry-farming",
  rationale?: string,
): ScenarioRunResult {
  if (paused.status !== "PAUSED_PROPOSAL") {
    throw new Error(
      `cannot resume: run status is ${paused.status}, expected PAUSED_PROPOSAL`,
    );
  }
  const proposal = paused.proposals[paused.proposals.length - 1];
  if (!proposal) {
    throw new Error("cannot resume: no proposal found");
  }
  const decided: SimulationProposal = {
    ...proposal,
    status: "DECIDED",
    decision: { choice, rationale },
  };

  const runId = paused.runId;
  const irrigationDecision = choice === "build-irrigation";

  // Re-run deterministically from tick 1 with the decision known.
  // (Byte-identical states to a run that had the decision upfront.)
  // Note: the re-run does NOT re-raise the proposal (decision is known),
  // so we carry the decided proposal forward explicitly.
  const full = runIrrigationScenario({ runId, irrigationDecision });
  // The decided proposal is the one from the paused run, updated with the
  // decision. The re-run's ticks are used for state/events/links.
  return { ...full, proposals: [decided] };
}

/** Serialize a run's states for byte-identical determinism comparison. */
export function serializeRunStates(result: ScenarioRunResult): string {
  return JSON.stringify(
    result.ticks.map((t) => t.stateAfter),
    null,
    0,
  );
}
