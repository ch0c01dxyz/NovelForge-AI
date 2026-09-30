/**
 * Narrative rhythm rules (Phase 9, Task A).
 *
 * Pure and IO-free. Same DOMAIN package rules as packages/planning and
 * packages/story-intelligence (ADR-0001): no Prisma, no HTTP, no provider,
 * no node: imports.
 *
 * The enum-shaped unions are declared locally rather than imported from the
 * generated Prisma client, because importing it would cross the boundary.
 * They must stay in sync with schema.prisma; a unit test pins the member
 * sets. (The schema enums did not exist when this file was written.)
 *
 * Two spec constraints shape the signatures below:
 *
 *  - ADR-009 / NARRATIVE-RHYTHM.md Principle: rhythm preferences are SOFT.
 *    "drama every N chapters" as a cron-like rule is forbidden, so
 *    `assessDramaWindow` returns an observation plus the author's own
 *    numbers — never an instruction, under any policy. `strictInterval`
 *    raises the signal the PLANNER sees; it does not turn prose into a
 *    command.
 *  - ADR-012 / STORY-INTELLIGENCE.md Story Health: findings are
 *    evidence-backed issues, not vibes. Every `RhythmFinding` carries the
 *    concrete beat ids and chapters that produced it.
 *
 * See docs/03-domain/NARRATIVE-RHYTHM.md.
 */

import {
  ANTAGONIST_STAGE_RANK,
  DRAMA_DENSITIES,
  type AntagonistRole,
  type AntagonistStage,
  type DramaDensity,
  type DramaType,
  type DramaWindowState,
} from "./vocabulary.ts";

// ---------------------------------------------------------------------------
// Drama windows
// ---------------------------------------------------------------------------

export interface GapBand {
  min: number;
  max: number;
}

/** The author's drama gap policy — the novel's own numbers, never universal. */
export interface DramaPolicy {
  density: DramaDensity;
  /** The usual authored distance between meaningful drama beats. */
  typicalGap: GapBand;
  /** The authored occasional extended calm. */
  extendedGap: GapBand;
  /** True only when the author asked for a strict interval. */
  strictInterval: boolean;
}

export interface DramaWindow {
  state: DramaWindowState;
  chaptersSinceDrama: number;
  /** Echo of the author's strictInterval — signal for the PLANNER, not a command. */
  strict: boolean;
  /** Descriptive always: no imperative wording appears here, under any policy. */
  guidance: string;
}

export type DramaWindowProblem = "MALFORMED_POLICY";

/**
 * A band is two integers with min <= max.
 *
 * The `typeof band === "object"` arm is load-bearing, not defensive padding:
 * `band !== undefined` alone lets `null` through (JSONB carries it happily),
 * and `null.min` then throws a TypeError out of a pure function — which the
 * HTTP layer surfaces as a 500 on a payload the route should answer with a
 * 409. An array reaches the same place with `undefined` bounds.
 */
function validBand(band: GapBand | undefined | null): band is GapBand {
  return (
    typeof band === "object" &&
    band !== null &&
    !Array.isArray(band) &&
    Number.isInteger(band.min) &&
    Number.isInteger(band.max) &&
    band.min >= 0 &&
    band.max >= band.min
  );
}

/**
 * Where does the story sit relative to THIS novel's drama gap policy?
 *
 * Bands, lowest-first: below typicalGap.min the story is still inside the
 * calm after a payoff (RECENT); up to typicalGap.max it is at its normal
 * rhythm (IN_GAP); up to extendedGap.max it is in the authored extended calm
 * (EXTENDED_CALM); past that the story has been calm longer than the policy
 * describes (BEYOND_EXTENDED_CALM).
 *
 * Failure is loud: a malformed policy returns a problem rather than
 * inventing a default band.
 */
export function assessDramaWindow(input: {
  policy: DramaPolicy;
  chaptersSinceDrama: number;
}): DramaWindow | { problem: DramaWindowProblem } {
  const { policy, chaptersSinceDrama } = input;

  if (!Number.isInteger(chaptersSinceDrama) || chaptersSinceDrama < 0) {
    return { problem: "MALFORMED_POLICY" }; // caller bug: a chapter count
  }
  if (
    policy === null ||
    policy === undefined ||
    !DRAMA_DENSITIES.includes(policy.density) ||
    !validBand(policy.typicalGap) ||
    !validBand(policy.extendedGap) ||
    policy.extendedGap.max < policy.typicalGap.max ||
    typeof policy.strictInterval !== "boolean"
  ) {
    return { problem: "MALFORMED_POLICY" };
  }

  const { min: tMin, max: tMax } = policy.typicalGap;
  const { min: eMin, max: eMax } = policy.extendedGap;
  const d = chaptersSinceDrama;

  const state: DramaWindowState =
    d < tMin
      ? "RECENT"
      : d <= tMax
        ? "IN_GAP"
        : d <= eMax
          ? "EXTENDED_CALM"
          : "BEYOND_EXTENDED_CALM";

  const guidance =
    state === "RECENT"
      ? `${d} chapters since meaningful drama — inside the authored calm that follows a payoff (typical gap ${tMin}-${tMax}).`
      : state === "IN_GAP"
        ? `${d} chapters since meaningful drama — inside the authored typical gap of ${tMin}-${tMax}. This is the story's normal rhythm.`
        : state === "EXTENDED_CALM"
          ? `${d} chapters since meaningful drama — past the authored typical gap of ${tMin}-${tMax}. The authored extended calm runs to ${eMax} chapters.`
          : `${d} chapters since meaningful drama — past the authored extended calm of ${eMin}-${eMax}. The story has been calm for longer than this author's policy describes.`;

  return { state, chaptersSinceDrama: d, strict: policy.strictInterval === true, guidance };
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

/** A drama beat already in the story, as the caller fetched it. */
export interface DramaBeat {
  id: string;
  type: DramaType;
  chapter: number;
}

export interface CooldownPolicy {
  /** Minimum chapter distance required between two same-type beats. */
  windowChapters: number;
}

export interface CooldownDecision {
  allowed: boolean;
  /** The nearest same-type beat within the window that blocks this proposal. */
  conflictsWith: { beatId: string; chapter: number; distance: number } | null;
  reason: string;
}

/**
 * May a new drama beat of `candidate.type` land at `candidate.chapter`?
 *
 * Refused when a same TYPE already lands closer than `windowChapters` to it —
 * in EITHER direction, because a beat inserted before an existing one is the
 * same repetition as one inserted after it, and the author's planning pass
 * revises chapters in both directions. Exactly `windowChapters` apart is
 * allowed: the value is the minimum distance the author wants, not an
 * exclusive bound. A different type is never blocked: the cooldown protects
 * against a repeated flavour, not against drama itself.
 *
 * This is the one HARD rule in this file — the author sets the window, and
 * within it the beat is refused rather than advised against.
 */
export function checkCooldown(
  candidate: { id: string; type: DramaType; chapter: number },
  history: readonly DramaBeat[],
  policy: CooldownPolicy,
): CooldownDecision {
  const window = policy?.windowChapters;
  if (!Number.isInteger(window) || window <= 0) {
    return {
      allowed: true,
      conflictsWith: null,
      reason: `no cooldown window is configured for ${candidate.type} drama.`,
    };
  }

  let nearest: { beatId: string; chapter: number; distance: number } | null = null;
  for (const beat of history) {
    if (beat.type !== candidate.type) continue;
    const distance = Math.abs(candidate.chapter - beat.chapter);
    if (distance >= window) continue;
    // Nearest wins, whichever side it is on.
    if (nearest === null || distance < nearest.distance) {
      nearest = { beatId: beat.id, chapter: beat.chapter, distance };
    }
  }

  if (nearest === null) {
    return {
      allowed: true,
      conflictsWith: null,
      reason: `no ${candidate.type} drama beat within ${window} chapters of chapter ${candidate.chapter}.`,
    };
  }

  const side = nearest.chapter <= candidate.chapter ? "before" : "after";
  return {
    allowed: false,
    conflictsWith: nearest,
    reason: `a ${candidate.type} drama beat already lands at chapter ${nearest.chapter}, ${nearest.distance} chapters ${side} chapter ${candidate.chapter} — inside the ${window}-chapter ${candidate.type} cooldown.`,
  };
}

// ---------------------------------------------------------------------------
// Antagonist lifecycle
// ---------------------------------------------------------------------------

/**
 * A TEMPORARY antagonist exists for a bounded span; NARRATIVE-RHYTHM.md puts
 * that at roughly 5-20 chapters. Both bounds are inclusive.
 */
export const TEMPORARY_ANTAGONIST_MIN_CHAPTERS = 5;
export const TEMPORARY_ANTAGONIST_MAX_CHAPTERS = 20;

export interface AntagonistProgression {
  role: AntagonistRole;
  /** The stages reached, in the order the story reached them. */
  stages: readonly AntagonistStage[];
  /** TEMPORARY only — why this antagonist exists at all. */
  purpose?: string | null;
  /** TEMPORARY only — how many chapters the antagonist spans. */
  spanChapters?: number | null;
}

export type AntagonistProblem =
  | "UNKNOWN_STAGE"
  | "REPEATED_STAGE"
  | "BACKWARD_STAGE"
  | "MISSING_PURPOSE"
  | "MISSING_SPAN"
  | "SPAN_OUT_OF_BOUNDS";

export interface AntagonistError {
  problem: AntagonistProblem;
  /** 1-based position in `stages` for stage problems; null otherwise. */
  index: number | null;
  message: string;
}

export interface AntagonistResult {
  ok: boolean;
  errors: AntagonistError[];
}

/**
 * Validate one antagonist's lifecycle.
 *
 *  - every stage is known (UNKNOWN_STAGE — the value may arrive from
 *    hand-written or AI-proposed JSONB, and an unknown stage would otherwise
 *    compare as `undefined` and pass silently);
 *  - the progression is strictly forward (REPEATED_STAGE for a stage reached
 *    twice, BACKWARD_STAGE for one reached after a later stage);
 *  - a TEMPORARY antagonist states its purpose explicitly (MISSING_PURPOSE)
 *    and spans a bounded 5-20 chapters (MISSING_SPAN, SPAN_OUT_OF_BOUNDS).
 *
 * Roles other than TEMPORARY carry no span requirement here: their length is
 * the story's, not the lifecycle's.
 */
export function validateAntagonistProgression(
  progression: AntagonistProgression,
): AntagonistResult {
  const errors: AntagonistError[] = [];
  const { stages, role } = progression;

  let previousRank = -1;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i] as AntagonistStage;
    // hasOwn, not `=== undefined`: the rank maps are object literals, so a
    // prototype key ("constructor", "toString") reads back as a function and
    // would slip past an undefined check, clobbering previousRank.
    const rank = Object.hasOwn(ANTAGONIST_STAGE_RANK, stage)
      ? ANTAGONIST_STAGE_RANK[stage]
      : undefined;

    if (rank === undefined) {
      errors.push({
        problem: "UNKNOWN_STAGE",
        index: i + 1,
        message: `"${String(stage)}" is not an antagonist stage`,
      });
      continue;
    }
    if (rank === previousRank) {
      errors.push({
        problem: "REPEATED_STAGE",
        index: i + 1,
        message: `${stage} is reached twice in a row`,
      });
      continue;
    }
    if (rank < previousRank) {
      errors.push({
        problem: "BACKWARD_STAGE",
        index: i + 1,
        message: `${stage} (rank ${rank}) is reached after a later stage (rank ${previousRank})`,
      });
      continue;
    }
    previousRank = rank;
  }

  if (role === "TEMPORARY") {
    const purpose = progression.purpose;
    if (typeof purpose !== "string" || purpose.trim() === "") {
      errors.push({
        problem: "MISSING_PURPOSE",
        index: null,
        message: "a TEMPORARY antagonist must state its purpose explicitly",
      });
    }

    const span = progression.spanChapters;
    if (span === null || span === undefined) {
      errors.push({
        problem: "MISSING_SPAN",
        index: null,
        message: `a TEMPORARY antagonist must bound its span to ${TEMPORARY_ANTAGONIST_MIN_CHAPTERS}-${TEMPORARY_ANTAGONIST_MAX_CHAPTERS} chapters`,
      });
    } else if (
      !Number.isInteger(span) ||
      span < TEMPORARY_ANTAGONIST_MIN_CHAPTERS ||
      span > TEMPORARY_ANTAGONIST_MAX_CHAPTERS
    ) {
      errors.push({
        problem: "SPAN_OUT_OF_BOUNDS",
        index: null,
        message: `span of ${span} chapters is outside the ${TEMPORARY_ANTAGONIST_MIN_CHAPTERS}-${TEMPORARY_ANTAGONIST_MAX_CHAPTERS} a TEMPORARY antagonist may occupy`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

/** One beat as it actually appears in the manuscript. */
export interface BeatRecord {
  id: string;
  /** Beat kind, e.g. "underestimate", "provoke", "demonstrates". */
  kind: string;
  chapter: number;
}

/** The sequence repeats at least this often before it is worth reporting. */
export const REPEATED_SEQUENCE_MIN_OCCURRENCES = 2;
/** At or above this, the finding escalates from INFO to WARNING. */
export const REPEATED_SEQUENCE_WARNING_OCCURRENCES = 3;

export interface RhythmFinding {
  rule: "REPEATED_BEAT_SEQUENCE";
  severity: "INFO" | "WARNING";
  /** Every beat id and chapter of every match — never a bare score (ADR-012). */
  evidence: { beatId: string; chapter: number }[];
  occurrences: number;
  message: string;
  /** Variation, not a ban (NARRATIVE-RHYTHM.md "Pattern detection"). */
  suggestion: string;
}

/**
 * Detect a repeated beat SEQUENCE — the doc's example being
 * underestimate -> provoke -> demonstrates -> public humiliation.
 *
 * Matches are non-overlapping and consecutive: a sequence must appear as an
 * unbroken run of beats. Below `minOccurrences` matches there is no finding
 * at all (null) — a trope used once is not a pattern.
 *
 * The finding recommends variation. It never proposes banning the trope.
 */
export function detectRepeatedSequence(
  beats: readonly BeatRecord[],
  sequence: readonly string[],
  minOccurrences: number = REPEATED_SEQUENCE_MIN_OCCURRENCES,
): RhythmFinding | null {
  if (sequence.length === 0) return null;
  // The floor is the rule's own definition of a pattern: below it there is no
  // finding. Clamped here so a caller cannot ask for a "repeat" of 0 or 1 and
  // get a finding with no evidence (ADR-012).
  if (!Number.isInteger(minOccurrences) || minOccurrences < REPEATED_SEQUENCE_MIN_OCCURRENCES) {
    minOccurrences = REPEATED_SEQUENCE_MIN_OCCURRENCES;
  }

  const matches: BeatRecord[][] = [];
  for (let i = 0; i + sequence.length <= beats.length;) {
    let matched = true;
    for (let j = 0; j < sequence.length; j++) {
      if (beats[i + j]?.kind !== sequence[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      matches.push(beats.slice(i, i + sequence.length));
      i += sequence.length;
    } else {
      i++;
    }
  }

  if (matches.length < minOccurrences) return null;

  const evidence = matches.flatMap((match) =>
    match.map((beat) => ({ beatId: beat.id, chapter: beat.chapter })),
  );

  return {
    rule: "REPEATED_BEAT_SEQUENCE",
    severity: matches.length >= REPEATED_SEQUENCE_WARNING_OCCURRENCES ? "WARNING" : "INFO",
    evidence,
    occurrences: matches.length,
    message: `the beat sequence ${sequence.join(" -> ")} repeats ${matches.length} times (chapters ${evidence.map((e) => e.chapter).join(", ")}).`,
    suggestion:
      "Vary at least one step — a different reaction, a different audience, or a private rather than public outcome. The trope is not the problem; the repetition is.",
  };
}
