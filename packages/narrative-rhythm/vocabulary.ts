/**
 * Narrative rhythm vocabulary (Phase 9, Task A).
 *
 * The enum-shaped unions are declared locally rather than imported from the
 * generated Prisma client, because importing it would cross the DOMAIN
 * package boundary (ADR-0001). They must stay in sync with schema.prisma; a
 * unit test pins the member sets. (The schema enums did not exist when this
 * file was written.)
 *
 * Split from rhythm.ts so both files stay under the 500-line limit
 * (CLAUDE.md) — same shape as packages/story-intelligence (canon.ts +
 * events.ts).
 *
 * See docs/03-domain/NARRATIVE-RHYTHM.md.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const DRAMA_TYPES = [
  "SOCIAL",
  "PERSONAL",
  "ROMANCE",
  "POLITICAL",
  "ECONOMIC",
  "SCHOLARLY",
  "MILITARY",
  "FAMILY",
  "IDEOLOGICAL",
  "CUSTOM",
] as const;
export type DramaType = (typeof DRAMA_TYPES)[number];

export const DRAMA_DENSITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type DramaDensity = (typeof DRAMA_DENSITIES)[number];

/** The three policy payloads a novel can carry (schema NarrativePolicyKind). */
export const NARRATIVE_POLICY_KINDS = ["DRAMA_GAP", "COOLDOWN", "SCALE"] as const;
export type NarrativePolicyKind = (typeof NARRATIVE_POLICY_KINDS)[number];

/** ADR-009: a policy advises unless explicitly marked hard. */
export const POLICY_HARDNESSES = ["SOFT", "HARD"] as const;
export type PolicyHardness = (typeof POLICY_HARDNESSES)[number];

export const ANTAGONIST_ROLES = [
  "MAIN",
  "ARC",
  "TEMPORARY",
  "RIVAL",
  "IDEOLOGICAL",
  "POLITICAL",
  "PERSONAL",
  "COMPETITOR",
] as const;
export type AntagonistRole = (typeof ANTAGONIST_ROLES)[number];

/**
 * The antagonist lifecycle (NARRATIVE-RHYTHM.md). The ORDER is the rule: a
 * progression may only move forward, so an antagonist cannot be "resolved"
 * before it has been "confronted" by a data path that should have gone
 * through a correction instead.
 *
 * Step 4 is the doc's "underestimation/conflict"; the conflict half is
 * carried by the escalation and confrontation steps that follow.
 */
export const ANTAGONIST_STAGES = [
  "INTRODUCTION",
  "MOTIVATION",
  "FRICTION",
  "UNDERESTIMATION",
  "ESCALATION",
  "CONFRONTATION",
  "DEFEAT",
  "CONSEQUENCE",
  "RESOLUTION",
] as const;
export type AntagonistStage = (typeof ANTAGONIST_STAGES)[number];

/** Positional rank, derived from the list above so the order has one source. */
export const ANTAGONIST_STAGE_RANK: Record<AntagonistStage, number> = Object.fromEntries(
  ANTAGONIST_STAGES.map((stage, i) => [stage, i]),
) as Record<AntagonistStage, number>;

export const ANTAGONIST_OUTCOMES = [
  "REGRET",
  "RESENTMENT",
  "RETREAT",
  "LOSS_OF_STATUS",
  "EXILE",
  "DEATH",
  "NEUTRALITY",
  "RESPECT",
  "REDEMPTION",
  "ALLIANCE",
  "SUBORDINATION",
  "FUTURE_REVENGE",
] as const;
export type AntagonistOutcome = (typeof ANTAGONIST_OUTCOMES)[number];

/** The story's scope, widening left to right (NARRATIVE-RHYTHM.md). */
export const NARRATIVE_SCALES = [
  "PERSONAL",
  "FAMILY",
  "VILLAGE",
  "TOWN",
  "CITY",
  "PROVINCE",
  "KINGDOM",
  "EMPIRE",
] as const;
export type NarrativeScale = (typeof NARRATIVE_SCALES)[number];

/** Positional rank, derived from the list above so the order has one source. */
export const NARRATIVE_SCALE_RANK: Record<NarrativeScale, number> = Object.fromEntries(
  NARRATIVE_SCALES.map((scale, i) => [scale, i]),
) as Record<NarrativeScale, number>;

export const DRAMA_WINDOW_STATES = [
  "RECENT",
  "IN_GAP",
  "EXTENDED_CALM",
  "BEYOND_EXTENDED_CALM",
] as const;
export type DramaWindowState = (typeof DRAMA_WINDOW_STATES)[number];
