/**
 * Scale appropriateness (Phase 9, Task A).
 *
 * Split out of rhythm.ts to keep both files under the 500-line limit
 * (CLAUDE.md) — same reason vocabulary.ts was split out first. The rule is
 * unchanged; only its address moved.
 *
 * Pure and IO-free, like the rest of the package (ADR-0001): no Prisma, no
 * HTTP, no provider, no node: imports.
 *
 * See docs/03-domain/NARRATIVE-RHYTHM.md.
 */

import {
  NARRATIVE_SCALES,
  NARRATIVE_SCALE_RANK,
  type NarrativeScale,
} from "./vocabulary.ts";

// ---------------------------------------------------------------------------
// Scale appropriateness
// ---------------------------------------------------------------------------

export interface ConflictProposal {
  id: string;
  scale: NarrativeScale;
  summary?: string | null;
}

export interface ProtagonistStanding {
  /** The scale the protagonist's own story currently operates at. */
  scale: NarrativeScale;
  /** Scales actually reachable — travel, allies, office, delegated authority. */
  access: readonly NarrativeScale[];
  /** 0-100 standing with the powers that operate at those scales. */
  reputation: number;
}

export interface ScaleAssessment {
  ok: boolean;
  /** Scale steps beyond the protagonist's reach; 0 when within. */
  gap: number;
  /** The highest scale the protagonist can currently reach. */
  reach: NarrativeScale;
  reason: string;
}

/**
 * Check a conflict proposal against the protagonist's current standing.
 *
 * Reach is the widest scale the protagonist can actually act at: their own
 * scale, or anything in `access`. A proposal inside reach is accepted; one
 * beyond it is flagged with the size of the gap, so the planner can decide
 * whether to grow the protagonist first.
 *
 * ponytail: `reputation` is carried into the reason as evidence and is
 * deliberately NOT scored — NARRATIVE-RHYTHM.md gives no threshold, and
 * inventing one would turn an author-visible rule out of a made-up number.
 * Upgrade path: give the novel a reputation-per-scale policy (the same
 * per-novel-JSONB shape as planning's HorizonPolicy) and gate `access` on
 * it; this signature does not change.
 */
export function assessScaleAppropriateness(
  proposal: ConflictProposal,
  standing: ProtagonistStanding,
): ScaleAssessment {
  // Same guard the antagonist validator carries: an unknown scale has no
  // rank, and every comparison against undefined is false — which would
  // report an out-of-reach proposal as inside reach. hasOwn also closes the
  // prototype-key hole ("constructor" ranks as a function otherwise).
  const rankOf = (scale: NarrativeScale): number | undefined =>
    Object.hasOwn(NARRATIVE_SCALE_RANK, scale) ? NARRATIVE_SCALE_RANK[scale] : undefined;

  const ownRank = rankOf(standing.scale);
  const proposalRank = rankOf(proposal.scale);
  if (ownRank === undefined || proposalRank === undefined) {
    const unknown = ownRank === undefined ? standing.scale : proposal.scale;
    return {
      ok: false,
      gap: 0,
      reach: standing.scale,
      reason: `"${String(unknown)}" is not a narrative scale, so reach cannot be judged.`,
    };
  }

  let reachRank = ownRank;
  for (const scale of standing.access) {
    const rank = rankOf(scale);
    if (rank !== undefined && rank > reachRank) reachRank = rank;
  }
  const reach = NARRATIVE_SCALES[reachRank] ?? standing.scale;

  const gap = proposalRank > reachRank ? proposalRank - reachRank : 0;

  const context = `own scale ${standing.scale}; access ${
    standing.access.length > 0 ? standing.access.join(", ") : "none"
  }; reputation ${standing.reputation}`;

  return {
    ok: gap === 0,
    gap,
    reach,
    reason:
      gap === 0
        ? `the proposal sits at ${proposal.scale}, inside the protagonist's reach of ${reach} (${context}).`
        : `the proposal sits at ${proposal.scale}, ${gap} scale ${
            gap === 1 ? "step" : "steps"
          } beyond the protagonist's reach of ${reach} (${context}).`,
  };
}
