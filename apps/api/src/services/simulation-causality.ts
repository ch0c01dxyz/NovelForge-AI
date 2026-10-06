/**
 * NF-WF-021B: Causal evidence and uncertainty as proposals.
 *
 * Makes the simulation explainable and honest about uncertainty:
 * - Every SimulationEvent records WHY it happened as explicit CausalLink
 *   rows (DIRECT/ENABLING/PREVENTING), not inferred post-hoc (Invariant 5).
 * - When a tick rule encounters multiple plausible outcomes, it does NOT
 *   pick one — it creates a SimulationProposal and the run pauses
 *   (PAUSED_PROPOSAL) until the author decides (Invariant 2, §5).
 * - SimulationProposals are DISTINCT from CanonProposals and NEVER enter
 *   the canon pipeline (Invariant 8).
 *
 * Divergence triggers (contract F6 — implementer-defined, documented):
 * - THRESHOLD_SPAN: a numeric outcome's confidence interval spans a
 *   decision threshold (e.g., food_security 0.65 CI [0.55, 0.75] spans
 *   the 0.6 crisis threshold).
 * - NO_DOMINANT_OUTCOME: multiple discrete outcomes, none with confidence
 *   > 0.7 (the dominance threshold).
 * - COUNTERFACTUAL_UNCERTAINTY: a PREVENTING link's evidence confidence
 *   < 0.8 (the prevention itself is uncertain).
 *
 * The "never silently resolve" principle is non-negotiable: there is NO
 * auto-resolve path. `evaluateDivergence` reports; `createProposal` pauses;
 * `decideProposal` requires an explicit choice. Any attempt to bypass
 * (e.g., a rule picking an outcome without a proposal) is a programming
 * error, not a feature.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";

/**
 * Transaction client type (mirrors RevisionTx — the generated
 * Prisma.TransactionClient without the top-level methods).
 */
export type CausalityTx = Omit<
  NovelForgeDb,
  "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends" | "$use"
>;

// ---------------------------------------------------------------------------
// Types (mirroring the pinned contract shapes)
// ---------------------------------------------------------------------------

export type CausalKind = "DIRECT" | "ENABLING" | "PREVENTING";

export type ProposalStatus = "PROPOSED" | "APPROVED" | "REJECTED";

export interface OutcomeAlternative {
  id: string;
  outcome: unknown;
  evidence: unknown;
  confidence: number; // 0..1
}

export type DivergenceTrigger =
  | "THRESHOLD_SPAN"
  | "NO_DOMINANT_OUTCOME"
  | "COUNTERFACTUAL_UNCERTAINTY";

export interface DivergenceInput {
  /** Discrete outcomes with confidences (for NO_DOMINANT_OUTCOME). */
  outcomes?: OutcomeAlternative[];
  /** Numeric estimate with confidence interval and threshold (for THRESHOLD_SPAN). */
  numericEstimate?: {
    value: number;
    low: number;
    high: number;
    threshold: number;
  };
  /** A PREVENTING link whose prevention confidence is uncertain. */
  preventingLink?: {
    linkId: string;
    preventionConfidence: number;
  };
}

export interface DivergenceEvaluation {
  isDivergent: boolean;
  trigger: DivergenceTrigger | null;
  alternatives: OutcomeAlternative[];
  /** Human-readable reason (for the proposal evidence). */
  reason: string;
}

/** Dominance threshold: no outcome above this → divergent (F6). */
export const DOMINANCE_THRESHOLD = 0.7;
/** Prevention confidence below this → the prevention itself is uncertain (F6). */
export const PREVENTION_CONFIDENCE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SimulationCausalityError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409,
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "PROPOSAL_ALREADY_DECIDED"
      | "NO_OPEN_PROPOSAL"
      | "INVALID_ALTERNATIVE",
    message: string,
  ) {
    super(message);
    this.name = "SimulationCausalityError";
  }
}

// ---------------------------------------------------------------------------
// Divergence evaluation (F6 — implementer-defined triggers)
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a tick rule's output is divergent (requires a proposal)
 * or can proceed deterministically.
 *
 * NEVER silently resolves: if divergent, the caller MUST create a proposal
 * (via createProposal) and pause the run. There is no "pick the best"
 * path — the function only reports.
 */
export function evaluateDivergence(input: DivergenceInput): DivergenceEvaluation {
  // Trigger 1: THRESHOLD_SPAN — confidence interval spans a decision threshold
  if (input.numericEstimate) {
    const { value, low, high, threshold } = input.numericEstimate;
    const spans = (low < threshold && high > threshold) || (low > threshold && high < threshold);
    if (spans) {
      return {
        isDivergent: true,
        trigger: "THRESHOLD_SPAN",
        alternatives: [
          {
            id: "above-threshold",
            outcome: { value, direction: "above", threshold },
            evidence: { interval: [low, high], threshold, note: "Confidence interval spans threshold" },
            confidence: 0.5,
          },
          {
            id: "below-threshold",
            outcome: { value, direction: "below", threshold },
            evidence: { interval: [low, high], threshold, note: "Confidence interval spans threshold" },
            confidence: 0.5,
          },
        ],
        reason: `Numeric estimate ${value} CI [${low}, ${high}] spans threshold ${threshold}`,
      };
    }
  }

  // Trigger 2: NO_DOMINANT_OUTCOME — no outcome exceeds dominance threshold
  if (input.outcomes && input.outcomes.length > 0) {
    const dominant = input.outcomes.filter((o) => o.confidence > DOMINANCE_THRESHOLD);
    if (input.outcomes.length > 1 && dominant.length === 0) {
      return {
        isDivergent: true,
        trigger: "NO_DOMINANT_OUTCOME",
        alternatives: input.outcomes,
        reason: `No outcome exceeds dominance threshold ${DOMINANCE_THRESHOLD} (${input.outcomes.length} alternatives)`,
      };
    }
    // Single outcome or one dominant outcome → not divergent
    const dom = dominant[0];
    return {
      isDivergent: false,
      trigger: null,
      alternatives: input.outcomes,
      reason: dom
        ? `Outcome '${dom.id}' dominates (confidence ${dom.confidence})`
        : "Single outcome, no divergence",
    };
  }

  // Trigger 3: COUNTERFACTUAL_UNCERTAINTY — prevention confidence too low
  if (input.preventingLink) {
    const { linkId, preventionConfidence } = input.preventingLink;
    if (preventionConfidence < PREVENTION_CONFIDENCE_THRESHOLD) {
      return {
        isDivergent: true,
        trigger: "COUNTERFACTUAL_UNCERTAINTY",
        alternatives: [
          {
            id: "prevention-holds",
            outcome: { prevented: true, linkId },
            evidence: { preventionConfidence, note: "Prevention uncertain" },
            confidence: preventionConfidence,
          },
          {
            id: "prevention-fails",
            outcome: { prevented: false, linkId },
            evidence: { preventionConfidence, note: "Prevention uncertain" },
            confidence: 1 - preventionConfidence,
          },
        ],
        reason: `PREVENTING link ${linkId} confidence ${preventionConfidence} < ${PREVENTION_CONFIDENCE_THRESHOLD}`,
      };
    }
  }

  return {
    isDivergent: false,
    trigger: null,
    alternatives: [],
    reason: "No divergence triggers matched",
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CausalityServices {
  createCausalLink(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    eventId: string;
    causeEventId?: string;
    causeStateRef?: unknown;
    kind: CausalKind;
    evidence: unknown;
  }): Promise<{ id: string }>;

  getCausalChain(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    eventId: string;
    maxDepth?: number;
  }): Promise<CausalChainNode[]>;

  getCounterfactuals(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    eventId: string;
  }): Promise<Counterfactual[]>;

  createProposal(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    tickNumber: number;
    alternatives: OutcomeAlternative[];
    trigger: DivergenceTrigger;
    reason: string;
  }): Promise<{ proposalId: string; runPaused: boolean }>;

  decideProposal(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    proposalId: string;
    choice: string;
    rationale?: string;
    approve: boolean;
  }): Promise<{ proposalId: string; status: ProposalStatus }>;

  listProposals(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    runId: string;
    status?: ProposalStatus;
  }): Promise<ProposalSummary[]>;

  hasOpenProposals(runId: string): Promise<boolean>;
}

export interface CausalChainNode {
  linkId: string;
  eventId: string;
  causeEventId: string | null;
  causeStateRef: unknown;
  kind: CausalKind;
  evidence: unknown;
  depth: number;
  causes: CausalChainNode[];
}

export interface Counterfactual {
  linkId: string;
  preventedEventId: string;
  preventingEventId: string | null;
  evidence: unknown;
}

export interface ProposalSummary {
  id: string;
  runId: string;
  tickNumber: number;
  kind: string;
  status: ProposalStatus;
  alternatives: OutcomeAlternative[];
  rationale: string | null;
  chosenAlternativeId: string | null;
  createdAt: Date;
}

type Db = NovelForgeDb;

async function requireRunAccess(
  db: Db,
  workspaceId: string,
  novelId: string,
  runId: string,
  actorUserId: string,
  capability: "simulation:read" | "simulation:manage",
) {
  // Verify the actor is a member with the capability (via the workspace).
  // Follows the revisions.ts pattern: membership → novel exists → requireCapability.
  const membership = await db.membership.findFirst({
    where: { workspaceId, userId: actorUserId },
    select: { role: true },
  });
  if (!membership) {
    throw new SimulationCausalityError(404, "NOT_FOUND", "Workspace not found");
  }
  const novel = await db.novel.findFirst({
    where: { id: novelId, workspaceId },
    select: { id: true },
  });
  if (!novel) {
    throw new SimulationCausalityError(404, "NOT_FOUND", "Novel not found");
  }
  // Server-enforced authorization: the capability must be granted to the role.
  requireCapability(membership.role, capability);
  // The run must belong to the novel (logical FK check).
  const run = await db.simulationRun.findFirst({
    where: { id: runId, novelId, workspaceId },
    select: { id: true, status: true },
  });
  if (!run) {
    throw new SimulationCausalityError(404, "NOT_FOUND", "Simulation run not found");
  }
  return run;
}

export function createCausalityServices(db: Db): CausalityServices {
  return {
    async createCausalLink(input) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        runId,
        eventId,
        causeEventId,
        causeStateRef,
        kind,
        evidence,
      } = input;

      // Every link needs a cause: either a cause event OR a state ref.
      // (Initial-scenario events link to the scenario via causeStateRef.)
      if (!causeEventId && !causeStateRef) {
        throw new SimulationCausalityError(
          400,
          "INVALID_INPUT",
          "Causal link requires causeEventId or causeStateRef",
        );
      }

      await requireRunAccess(db, workspaceId, novelId, runId, actorUserId, "simulation:manage");

      const link = await db.simulationCausalLink.create({
        data: {
          workspaceId,
          novelId,
          runId,
          eventId,
          causeEventId: causeEventId ?? null,
          causeStateRef: causeStateRef ?? undefined,
          kind,
          evidence: evidence as object,
        },
        select: { id: true },
      });
      return { id: link.id };
    },

    async getCausalChain(input) {
      const { actorUserId, workspaceId, novelId, eventId, maxDepth = 10 } = input;

      // Find the run via the event's links (we need runId for access check).
      // First, find any link for this event to get the run.
      const firstLink = await db.simulationCausalLink.findFirst({
        where: { eventId, workspaceId, novelId },
        select: { runId: true },
      });
      if (!firstLink) {
        return [];
      }
      await requireRunAccess(db, workspaceId, novelId, firstLink.runId, actorUserId, "simulation:read");

      // Recursive CTE for bounded-depth ancestry.
      // We build the tree in TypeScript for clarity (depth is bounded).
      async function buildNode(
        eid: string,
        depth: number,
        visited: Set<string>,
      ): Promise<CausalChainNode[]> {
        if (depth > maxDepth || visited.has(eid)) return [];
        visited.add(eid);
        const links = await db.simulationCausalLink.findMany({
          where: { eventId: eid, workspaceId, novelId },
          orderBy: { createdAt: "asc" },
        });
        const nodes: CausalChainNode[] = [];
        for (const link of links) {
          const causes = link.causeEventId
            ? await buildNode(link.causeEventId, depth + 1, new Set(visited))
            : [];
          nodes.push({
            linkId: link.id,
            eventId: link.eventId,
            causeEventId: link.causeEventId,
            causeStateRef: link.causeStateRef,
            kind: link.kind as CausalKind,
            evidence: link.evidence,
            depth,
            causes,
          });
        }
        return nodes;
      }

      return buildNode(eventId, 0, new Set());
    },

    async getCounterfactuals(input) {
      const { actorUserId, workspaceId, novelId, eventId } = input;

      const firstLink = await db.simulationCausalLink.findFirst({
        where: { eventId, workspaceId, novelId },
        select: { runId: true },
      });
      if (!firstLink) return [];
      await requireRunAccess(db, workspaceId, novelId, firstLink.runId, actorUserId, "simulation:read");

      // PREVENTING links where this event was the prevented one (i.e., links
      // ON this eventId with kind PREVENTING), plus PREVENTING links FROM
      // this event (this event prevented others).
      const asPrevented = await db.simulationCausalLink.findMany({
        where: { eventId, kind: "PREVENTING", workspaceId, novelId },
      });
      const asPreventer = await db.simulationCausalLink.findMany({
        where: { causeEventId: eventId, kind: "PREVENTING", workspaceId, novelId },
      });

      const result: Counterfactual[] = [];
      for (const link of asPrevented) {
        result.push({
          linkId: link.id,
          preventedEventId: link.eventId,
          preventingEventId: link.causeEventId,
          evidence: link.evidence,
        });
      }
      for (const link of asPreventer) {
        result.push({
          linkId: link.id,
          preventedEventId: link.eventId,
          preventingEventId: link.causeEventId,
          evidence: link.evidence,
        });
      }
      return result;
    },

    async createProposal(input) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        runId,
        tickNumber,
        alternatives,
        trigger,
        reason,
      } = input;

      if (!alternatives || alternatives.length < 2) {
        throw new SimulationCausalityError(
          400,
          "INVALID_INPUT",
          "A proposal requires at least 2 alternatives (a divergence with one outcome is not uncertain)",
        );
      }

      const run = await requireRunAccess(db, workspaceId, novelId, runId, actorUserId, "simulation:manage");

      // The run must be in a state that can pause for a proposal.
      if (run.status !== "RUNNING") {
        throw new SimulationCausalityError(
          409,
          "INVALID_INPUT",
          `Cannot create proposal: run is ${run.status}, must be RUNNING`,
        );
      }

      // Create the proposal and pause the run atomically.
      // Invariant 2: uncertainty is surfaced, never silently resolved.
      const proposal = await db.$transaction(async (tx: CausalityTx) => {
        const p = await tx.simulationProposal.create({
          data: {
            workspaceId,
            novelId,
            runId,
            tickNumber,
            kind: "OUTCOME_FORK",
            alternatives: alternatives as object,
            status: "PROPOSED",
            trigger,
            reason,
          },
          select: { id: true },
        });
        await tx.simulationRun.update({
          where: { id: runId },
          data: { status: "PAUSED_PROPOSAL" },
        });
        return p;
      });

      return { proposalId: proposal.id, runPaused: true };
    },

    async decideProposal(input) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        proposalId,
        choice,
        rationale,
        approve,
      } = input;

      const proposal = await db.simulationProposal.findFirst({
        where: { id: proposalId, workspaceId, novelId },
      });
      if (!proposal) {
        throw new SimulationCausalityError(404, "NOT_FOUND", "Simulation proposal not found");
      }
      if (proposal.status !== "PROPOSED") {
        throw new SimulationCausalityError(
          409,
          "PROPOSAL_ALREADY_DECIDED",
          `Proposal already ${proposal.status}`,
        );
      }

      await requireRunAccess(db, workspaceId, novelId, proposal.runId, actorUserId, "simulation:manage");

      const alternatives = proposal.alternatives as unknown as OutcomeAlternative[];
      const chosen = alternatives.find((a) => a.id === choice);
      if (approve && !chosen) {
        throw new SimulationCausalityError(
          400,
          "INVALID_ALTERNATIVE",
          `Alternative '${choice}' not in proposal`,
        );
      }

      const newStatus: ProposalStatus = approve ? "APPROVED" : "REJECTED";

      // Decide the proposal and resume the run atomically.
      // The decision is recorded; the tick resumes with the chosen outcome
      // (021A's step logic reads the decided proposal).
      await db.$transaction(async (tx: CausalityTx) => {
        await tx.simulationProposal.update({
          where: { id: proposalId },
          data: {
            status: newStatus,
            rationale: rationale ?? null,
            chosenAlternativeId: approve ? choice : null,
            decidedById: actorUserId,
            decidedAt: new Date(),
          },
        });
        // Resume the run: PAUSED_PROPOSAL -> RUNNING.
        // (If 021A later adds more nuanced resume logic, this is the hook.)
        await tx.simulationRun.update({
          where: { id: proposal.runId },
          data: { status: "RUNNING" },
        });
      });

      return { proposalId, status: newStatus };
    },

    async listProposals(input) {
      const { actorUserId, workspaceId, novelId, runId, status } = input;
      await requireRunAccess(db, workspaceId, novelId, runId, actorUserId, "simulation:read");

      const rows = await db.simulationProposal.findMany({
        where: {
          runId,
          workspaceId,
          novelId,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r: (typeof rows)[number]) => ({
        id: r.id,
        runId: r.runId,
        tickNumber: r.tickNumber,
        kind: r.kind,
        status: r.status as ProposalStatus,
        alternatives: r.alternatives as unknown as OutcomeAlternative[],
        rationale: r.rationale,
        chosenAlternativeId: r.chosenAlternativeId,
        createdAt: r.createdAt,
      }));
    },

    async hasOpenProposals(runId: string): Promise<boolean> {
      const count = await db.simulationProposal.count({
        where: { runId, status: "PROPOSED" },
      });
      return count > 0;
    },
  };
}
