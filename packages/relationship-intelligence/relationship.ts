/**
 * Relationship intelligence rules (Phase 8, slice 1).
 *
 * Pure and IO-free. This package is a DOMAIN package (ADR-0001): it may
 * import contracts/shared/story-core/validation and NOTHING else — no
 * Prisma, no HTTP, no provider. Enum-shaped unions are declared locally
 * rather than imported from the generated Prisma client (same discipline
 * as packages/planning/planning.ts) and pinned by a test.
 *
 * This package carries the phase's two exit scenarios:
 *
 *   - structure validation across monogamy / polygamy / polyamory /
 *     harem / reverse harem / political marriage / custom;
 *   - the directional stance history that makes an enemy-to-ally turn a
 *     recorded event rather than an overwrite.
 *
 * The governing spec line is "never assume one mainLoveInterestId": a
 * harem is an allowed structure, not an instruction that every character
 * becomes a love interest. Nothing here caps how many bonds a character
 * may hold — it only refuses the combinations that contradict their own
 * label.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const RELATIONSHIP_STANCES = [
  "ALLY",
  "FRIENDLY",
  "NEUTRAL",
  "WARY",
  "HOSTILE",
  "ENEMY",
] as const;
export type RelationshipStance = (typeof RELATIONSHIP_STANCES)[number];

export const BOND_STRUCTURES = [
  "MONOGAMY",
  "POLYGAMY",
  "POLYAMORY",
  "HAREM",
  "REVERSE_HAREM",
  "POLITICAL_MARRIAGE",
  "CUSTOM",
] as const;
export type BondStructure = (typeof BOND_STRUCTURES)[number];

export const BOND_STAGES = [
  "ATTRACTION",
  "COURTSHIP",
  "COMMITMENT",
  "MARRIAGE",
  "LEGACY",
] as const;
export type BondStage = (typeof BOND_STAGES)[number];

export const BOND_TRANSITION_KINDS = ["ADVANCE", "REGRESS", "SEVER"] as const;
export type BondTransitionKind = (typeof BOND_TRANSITION_KINDS)[number];

// ---------------------------------------------------------------------------
// Directional stance history — the enemy-to-ally scenario
// ---------------------------------------------------------------------------

/**
 * One span of how `fromCharacterId` regards `toCharacterId`.
 *
 * Stances are per-direction and deliberately not mirrored: an author
 * writing a one-sided feud needs `A -> B` ENEMY while `B -> A` stays
 * FRIENDLY, and a symmetric model cannot represent the scene the whole
 * turn depends on. Windows are half-open `[from, to)`, matching the
 * canon-fact convention.
 */
export interface StanceRecord {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  stance: RelationshipStance;
  fromChapter: number;
  toChapter: number | null;
}

/** The stance `from` holds toward `to` at `chapter`, or `null` if unrecorded. */
export function stanceAt(
  records: readonly StanceRecord[],
  fromCharacterId: string,
  toCharacterId: string,
  chapter: number,
): StanceRecord | null {
  let found: StanceRecord | null = null;
  for (const record of records) {
    if (record.fromCharacterId !== fromCharacterId) continue;
    if (record.toCharacterId !== toCharacterId) continue;
    if (chapter < record.fromChapter) continue;
    if (record.toChapter !== null && chapter >= record.toChapter) continue;
    if (found === null || record.fromChapter >= found.fromChapter) found = record;
  }
  return found;
}

export type StanceHistoryErrorKind = "SELF_REFERENCE" | "BAD_WINDOW" | "OVERLAP";

export interface StanceHistoryError {
  recordId: string;
  kind: StanceHistoryErrorKind;
  message: string;
}

export interface StanceHistoryResult {
  ok: boolean;
  errors: StanceHistoryError[];
}

/**
 * Validate a directional stance history.
 *
 * Two rows covering one chapter for one direction make "how does she feel
 * about him in chapter 12" answerable two ways, and whichever the query
 * returns becomes accidental canon — the same overlap failure as a
 * character's state history. A self-edge is rejected outright: a
 * character's stance toward themselves is not a relationship, and letting
 * one in would make the graph's self-loops indistinguishable from data.
 */
export function validateStanceHistory(
  records: readonly StanceRecord[],
): StanceHistoryResult {
  const errors: StanceHistoryError[] = [];
  const byDirection = new Map<string, StanceRecord[]>();

  for (const record of records) {
    if (record.fromCharacterId === record.toCharacterId) {
      errors.push({
        recordId: record.id,
        kind: "SELF_REFERENCE",
        message: `${record.fromCharacterId} cannot hold a stance toward itself`,
      });
      continue;
    }
    let malformed = false;
    if (!Number.isInteger(record.fromChapter) || record.fromChapter < 1) {
      errors.push({
        recordId: record.id,
        kind: "BAD_WINDOW",
        message: `fromChapter ${record.fromChapter} is not a chapter number`,
      });
      malformed = true;
    }
    if (
      record.toChapter !== null &&
      (!Number.isInteger(record.toChapter) ||
        record.toChapter <= record.fromChapter)
    ) {
      errors.push({
        recordId: record.id,
        kind: "BAD_WINDOW",
        message: `window [${record.fromChapter}, ${record.toChapter}) is empty or inverted`,
      });
      malformed = true;
    }
    if (malformed) continue;
    const key = `${record.fromCharacterId}\u0000${record.toCharacterId}`;
    const list = byDirection.get(key);
    if (list) list.push(record);
    else byDirection.set(key, [record]);
  }

  for (const [, list] of byDirection) {
    const sorted = [...list].sort(
      (a, b) => a.fromChapter - b.fromChapter || a.id.localeCompare(b.id),
    );
    let openId: string | null = null;
    let furthestEnd = 0;
    let furthestId = "";
    for (const record of sorted) {
      if (openId !== null) {
        errors.push({
          recordId: record.id,
          kind: "OVERLAP",
          message: `an open-ended stance from ${openId} already covers this direction`,
        });
      } else if (record.fromChapter < furthestEnd) {
        errors.push({
          recordId: record.id,
          kind: "OVERLAP",
          message: `chapter ${record.fromChapter} is already covered by ${furthestId}`,
        });
      }
      if (record.toChapter === null) {
        openId = record.id;
      } else if (record.toChapter > furthestEnd) {
        furthestEnd = record.toChapter;
        furthestId = record.id;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * The chapter a direction's stance last changed at or before `chapter`.
 *
 * `null` when nothing is recorded. This is what makes an enemy-to-ally
 * turn legible: the caller reads the current stance and the chapter it
 * began, so "they became allies" is a dated event and not an impression.
 */
export function stanceSince(
  records: readonly StanceRecord[],
  fromCharacterId: string,
  toCharacterId: string,
  chapter: number,
): number | null {
  const held = stanceAt(records, fromCharacterId, toCharacterId, chapter);
  return held === null ? null : held.fromChapter;
}

// ---------------------------------------------------------------------------
// Bond structures — the monogamy / harem / polygamy scenario
// ---------------------------------------------------------------------------

export interface Bond {
  id: string;
  structure: BondStructure;
  /** Every participant, in no meaningful order. */
  memberIds: readonly string[];
  fromChapter: number;
  toChapter: number | null;
}

export type BondStructureErrorKind =
  | "DUPLICATE_MEMBER"
  | "TOO_MANY_MEMBERS"
  | "EXCLUSIVITY_CONFLICT";

export interface BondStructureError {
  bondId: string;
  kind: BondStructureErrorKind;
  message: string;
}

export interface BondStructureResult {
  ok: boolean;
  errors: BondStructureError[];
}

/**
 * Structures that mean one partner at a time.
 *
 * Only MONOGAMY is exclusive. POLITICAL_MARRIAGE is deliberately NOT: it
 * names *why* a bond exists, not how many a character may hold, and a
 * kingdom where a political marriage forbade every other bond could not
 * model the alliance-then-love arc the structure exists for. Harem and
 * reverse harem are likewise uncapped — "harem" describes a shape, and
 * the spec is explicit that it is not an instruction that every character
 * becomes a love interest.
 */
const EXCLUSIVE_STRUCTURES: readonly BondStructure[] = ["MONOGAMY"];

/**
 * Validate a set of bonds for structural self-contradiction.
 *
 * The failures refused here are the ones that make the label a lie: a
 * MONOGAMY bond with three members, or a member of two MONOGAMY bonds
 * running at the same time. Everything else is the author's business —
 * a harem of five, a polyamorous web, a political marriage alongside a
 * love match. Refusing those would be the engine overruling the author,
 * which §2.13 forbids.
 */
export function validateBondStructures(
  bonds: readonly Bond[],
): BondStructureResult {
  const errors: BondStructureError[] = [];

  for (const bond of bonds) {
    const seen = new Set<string>();
    for (const memberId of bond.memberIds) {
      if (seen.has(memberId)) {
        errors.push({
          bondId: bond.id,
          kind: "DUPLICATE_MEMBER",
          message: `${memberId} is listed twice in ${bond.id}`,
        });
      }
      seen.add(memberId);
    }
    if (bond.structure === "MONOGAMY" && seen.size > 2) {
      errors.push({
        bondId: bond.id,
        kind: "TOO_MANY_MEMBERS",
        message: `a monogamous bond has ${seen.size} members`,
      });
    }
  }

  for (const structure of EXCLUSIVE_STRUCTURES) {
    const scoped = bonds.filter((bond) => bond.structure === structure);
    for (let i = 0; i < scoped.length; i += 1) {
      const a = scoped[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < scoped.length; j += 1) {
        const b = scoped[j];
        if (b === undefined) continue;
        if (!windowsOverlap(a, b)) continue;
        for (const memberId of a.memberIds) {
          if (!b.memberIds.includes(memberId)) continue;
          errors.push({
            bondId: b.id,
            kind: "EXCLUSIVITY_CONFLICT",
            message: `${memberId} holds two concurrent ${structure} bonds (${a.id}, ${b.id})`,
          });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Half-open `[from, to)` windows, `null` end = open. */
function windowsOverlap(a: Bond, b: Bond): boolean {
  const aEnd = a.toChapter;
  const bEnd = b.toChapter;
  if (aEnd !== null && bEnd !== null && Math.min(aEnd, bEnd) <= Math.max(a.fromChapter, b.fromChapter)) {
    return false;
  }
  if (aEnd !== null && aEnd <= b.fromChapter) return false;
  if (bEnd !== null && bEnd <= a.fromChapter) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Bond lifecycle — attraction -> courtship -> commitment -> marriage -> legacy
// ---------------------------------------------------------------------------

export interface BondTransition {
  id: string;
  chapter: number;
  stage: BondStage;
  kind: BondTransitionKind;
}

export type BondLifecycleErrorKind =
  | "BAD_CHAPTER"
  | "UNORDERED"
  | "MISLABELED_REGRESSION"
  | "MISLABELED_ADVANCE"
  | "TRANSITION_AFTER_SEVER";

export interface BondLifecycleError {
  transitionId: string;
  kind: BondLifecycleErrorKind;
  message: string;
}

export interface BondLifecycleResult {
  ok: boolean;
  errors: BondLifecycleError[];
}

/**
 * Validate one bond's stage history.
 *
 * The rule with teeth is the label check: a transition that moves the
 * stage backwards must say so. A relationship that quietly rewinds —
 * recorded as an ADVANCE because the caller only ever writes ADVANCE —
 * is the silent regression the versioning invariants exist to prevent,
 * and it is invisible without this check. Forward jumps are unrestricted:
 * an arranged or political marriage can go from attraction to marriage in
 * one chapter, and refusing that would be the engine writing the story.
 */
export function validateBondLifecycle(
  transitions: readonly BondTransition[],
): BondLifecycleResult {
  const errors: BondLifecycleError[] = [];
  let previousChapter = 0;
  let previousRank = -1;
  let severed = false;

  for (const transition of transitions) {
    if (!Number.isInteger(transition.chapter) || transition.chapter < 1) {
      errors.push({
        transitionId: transition.id,
        kind: "BAD_CHAPTER",
        message: `chapter ${transition.chapter} is not a chapter number`,
      });
      continue;
    }
    if (severed) {
      errors.push({
        transitionId: transition.id,
        kind: "TRANSITION_AFTER_SEVER",
        message: "the bond was severed and cannot advance again",
      });
      continue;
    }
    if (transition.chapter <= previousChapter) {
      errors.push({
        transitionId: transition.id,
        kind: "UNORDERED",
        message: `chapter ${transition.chapter} does not follow chapter ${previousChapter}`,
      });
      continue;
    }
    const rank = BOND_STAGES.indexOf(transition.stage);
    if (rank < previousRank && transition.kind === "ADVANCE") {
      errors.push({
        transitionId: transition.id,
        kind: "MISLABELED_REGRESSION",
        message: `${transition.stage} follows a later stage but is recorded as ADVANCE`,
      });
    } else if (rank > previousRank && transition.kind === "REGRESS") {
      errors.push({
        transitionId: transition.id,
        kind: "MISLABELED_ADVANCE",
        message: `${transition.stage} advances the bond but is recorded as REGRESS`,
      });
    }
    previousChapter = transition.chapter;
    previousRank = rank;
    if (transition.kind === "SEVER") severed = true;
  }

  return { ok: errors.length === 0, errors };
}

/** The stage a bond stands at in `chapter`, or `null` if it has not begun. */
export function bondStageAt(
  transitions: readonly BondTransition[],
  chapter: number,
): BondStage | null {
  let found: BondStage | null = null;
  let latest = 0;
  for (const transition of transitions) {
    if (transition.chapter > chapter) continue;
    if (transition.chapter < latest) continue;
    if (transition.kind === "SEVER") {
      found = null;
      latest = transition.chapter;
      continue;
    }
    found = transition.stage;
    latest = transition.chapter;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Meaningful interaction — neglect measured by evidence, not presence
// ---------------------------------------------------------------------------

export interface MeaningfulInteraction {
  id: string;
  chapter: number;
  /**
   * How much the interaction actually moved the relationship, 0..1.
   * Zero is a scene where they were both present and nothing happened —
   * the case the spec's "not simple chapter presence" rule is about.
   */
  weight: number;
}

export const MEANINGFUL_WEIGHT_FLOOR = 0.25;

export interface NeglectReport {
  /** Latest chapter with an interaction at or above the floor; `null` if none. */
  lastMeaningfulChapter: number | null;
  /** `chapter - lastMeaningfulChapter`, or `null` when there is no baseline. */
  chaptersSinceMeaningful: number | null;
  neglected: boolean;
}

/**
 * Whether a bond has gone quiet, measured on weighted evidence.
 *
 * Presence alone does not reset the clock: a character who appears in
 * forty chapters of crowd scenes while saying nothing to their spouse is
 * exactly the neglect the author wants surfaced, and a chapter-count
 * heuristic reports the opposite. A bond with no meaningful interaction
 * at all reports `neglected: false` with a null baseline — the engine
 * does not accuse an author of neglecting a thread they have not started.
 */
export function neglectReport(
  interactions: readonly MeaningfulInteraction[],
  chapter: number,
  maxGap = 20,
): NeglectReport {
  let last: number | null = null;
  for (const interaction of interactions) {
    if (interaction.chapter > chapter) continue;
    if (interaction.weight < MEANINGFUL_WEIGHT_FLOOR) continue;
    if (last === null || interaction.chapter > last) last = interaction.chapter;
  }
  if (last === null) {
    return { lastMeaningfulChapter: null, chaptersSinceMeaningful: null, neglected: false };
  }
  const gap = chapter - last;
  return {
    lastMeaningfulChapter: last,
    chaptersSinceMeaningful: gap,
    neglected: gap > maxGap,
  };
}
