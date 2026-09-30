/**
 * Character intelligence rules (Phase 8, slice 1).
 *
 * Pure and IO-free. This package is a DOMAIN package (ADR-0001): it may
 * import contracts/shared/story-core/validation and NOTHING else — no
 * Prisma, no HTTP, no provider. The enum-shaped unions are declared
 * locally rather than imported from the generated Prisma client (same
 * discipline as packages/planning/planning.ts) and pinned by a test.
 *
 * Scope: the roadmap gates Phase 8 on two validation scenarios
 * (monogamy/harem/polygamy and enemy-to-ally) and the MVP cut line says
 * "basic character state". This package carries what those gates
 * exercise — historical state, the knowledge boundary, and arc
 * milestones. Reputation, beliefs, possessions and development
 * milestones are data the schema holds; they earn a rule when a consumer
 * asks one, not before.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const KNOWLEDGE_STANCES = [
  "KNOWN",
  "SUSPECTED",
  "BELIEVED_FALSE",
  "UNKNOWN",
] as const;
export type KnowledgeStance = (typeof KNOWLEDGE_STANCES)[number];

/**
 * How a character came to know something. The distinction is the whole
 * point of a competent protagonist: `DERIVED` and `EXPERIMENTED` are
 * reachable without a teacher or a library, so a story that starves the
 * character of sources can still have them out-think the room.
 */
export const KNOWLEDGE_SOURCES = [
  "REMEMBERED",
  "DERIVED",
  "LEARNED_IN_WORLD",
  "EXPERIMENTED",
  "TAUGHT",
  "RESEARCHED",
] as const;
export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number];

export const ARC_STATUSES = ["ACTIVE", "RESOLVED", "ABANDONED"] as const;
export type ArcStatus = (typeof ARC_STATUSES)[number];

// ---------------------------------------------------------------------------
// Historical state
// ---------------------------------------------------------------------------

/**
 * One span of a character's state. Windows are half-open `[from, to)`, so
 * the chapter a state changes on belongs to the new state — the same
 * convention as a canon fact's validity window.
 */
export interface StateRecord {
  id: string;
  characterId: string;
  /** Inclusive first chapter the state holds. */
  fromChapter: number;
  /** Exclusive last chapter; `null` = still current. */
  toChapter: number | null;
}

export type StateHistoryErrorKind = "BAD_WINDOW" | "OVERLAP";

export interface StateHistoryError {
  recordId: string;
  kind: StateHistoryErrorKind;
  message: string;
}

export interface StateHistoryResult {
  ok: boolean;
  errors: StateHistoryError[];
}

/**
 * Validate that a character's state history is a set of disjoint windows.
 *
 * Overlap is the failure that matters: two rows claiming the same chapter
 * make "where was she in chapter 12" answerable two ways, and whichever
 * the query happens to return becomes accidental canon. A single
 * furthest-reaching bound is tracked rather than the immediately previous
 * window, because a short nested window (`[1,10)` then `[2,3)`) would
 * otherwise mask every later overlap.
 */
export function validateStateHistory(
  records: readonly StateRecord[],
): StateHistoryResult {
  const errors: StateHistoryError[] = [];
  const byCharacter = new Map<string, StateRecord[]>();

  for (const record of records) {
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
    const list = byCharacter.get(record.characterId);
    if (list) list.push(record);
    else byCharacter.set(record.characterId, [record]);
  }

  for (const [characterId, list] of byCharacter) {
    const sorted = [...list].sort(
      (a, b) => a.fromChapter - b.fromChapter || a.id.localeCompare(b.id),
    );
    // `null` end = open-ended; everything after it overlaps by definition.
    let openId: string | null = null;
    let furthestEnd = 0;
    let furthestId = "";
    for (const record of sorted) {
      if (openId !== null) {
        errors.push({
          recordId: record.id,
          kind: "OVERLAP",
          message: `${characterId} already has an open-ended state from ${openId}`,
        });
      } else if (record.fromChapter < furthestEnd) {
        errors.push({
          recordId: record.id,
          kind: "OVERLAP",
          message: `chapter ${record.fromChapter} of ${characterId} is already covered by ${furthestId}`,
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
 * The state record covering `chapter`, or `null`.
 *
 * Null is returned rather than the nearest earlier record: an author who
 * never recorded a state for chapter 40 is not claiming the chapter-30
 * state still held. The same "do not invent a default" posture as
 * `getHorizon` in the planning service.
 */
export function stateAt(
  records: readonly StateRecord[],
  characterId: string,
  chapter: number,
): StateRecord | null {
  for (const record of records) {
    if (record.characterId !== characterId) continue;
    if (chapter < record.fromChapter) continue;
    if (record.toChapter !== null && chapter >= record.toChapter) continue;
    return record;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Knowledge boundary
// ---------------------------------------------------------------------------

export interface KnowledgeRecord {
  id: string;
  characterId: string;
  factId: string;
  stance: KnowledgeStance;
  source: KnowledgeSource;
  fromChapter: number;
  toChapter: number | null;
}

/**
 * What a character holds about a fact at a chapter.
 *
 * The latest covering record wins, so a character can be wrong and then
 * corrected without the earlier belief being erased — the timeline keeps
 * both, and `chapter` selects.
 */
export function knowledgeAt(
  records: readonly KnowledgeRecord[],
  characterId: string,
  factId: string,
  chapter: number,
): KnowledgeRecord | null {
  let found: KnowledgeRecord | null = null;
  for (const record of records) {
    if (record.characterId !== characterId) continue;
    if (record.factId !== factId) continue;
    if (chapter < record.fromChapter) continue;
    if (record.toChapter !== null && chapter >= record.toChapter) continue;
    if (found === null || record.fromChapter >= found.fromChapter) found = record;
  }
  return found;
}

export interface VoiceAccess {
  /** May this character act on, or speak about, the fact here? */
  accessible: boolean;
  stance: KnowledgeStance;
  source: KnowledgeSource | null;
}

/**
 * Whether a character may reference a fact at a chapter.
 *
 * `SUSPECTED` and `BELIEVED_FALSE` are accessible — the character can act
 * on them — but they are not truth, and the caller decides how to voice
 * them from the returned `stance`. An explicit `UNKNOWN` row is
 * accessible nowhere: it records that the author checked, which is
 * exactly when a validator must not read absence as permission.
 */
export function voiceAccess(
  records: readonly KnowledgeRecord[],
  characterId: string,
  factId: string,
  chapter: number,
): VoiceAccess {
  const held = knowledgeAt(records, characterId, factId, chapter);
  if (held === null) return { accessible: false, stance: "UNKNOWN", source: null };
  return {
    accessible: held.stance !== "UNKNOWN",
    stance: held.stance,
    source: held.source,
  };
}

// ---------------------------------------------------------------------------
// Arcs
// ---------------------------------------------------------------------------

export interface ArcMilestone {
  id: string;
  chapter: number;
  summary: string;
}

export interface CharacterArc {
  id: string;
  characterId: string;
  status: ArcStatus;
  milestones: readonly ArcMilestone[];
}

export type ArcErrorKind = "BAD_CHAPTER" | "UNORDERED" | "RESOLVED_WITHOUT_MILESTONE";

export interface ArcError {
  arcId: string;
  kind: ArcErrorKind;
  message: string;
}

export interface ArcResult {
  ok: boolean;
  errors: ArcError[];
}

/**
 * Validate one arc's milestone spine.
 *
 * Milestones must be strictly increasing in chapter. Two milestones on
 * one chapter are not a sequence, they are one beat written twice, and an
 * arc whose order is ambiguous cannot answer "where is this character
 * now" — which is the question arcs exist to answer.
 */
export function validateArc(arc: CharacterArc): ArcResult {
  const errors: ArcError[] = [];
  let previous = 0;
  for (const milestone of arc.milestones) {
    if (!Number.isInteger(milestone.chapter) || milestone.chapter < 1) {
      errors.push({
        arcId: arc.id,
        kind: "BAD_CHAPTER",
        message: `milestone ${milestone.id} has chapter ${milestone.chapter}`,
      });
      continue;
    }
    if (milestone.chapter <= previous) {
      errors.push({
        arcId: arc.id,
        kind: "UNORDERED",
        message: `milestone ${milestone.id} at chapter ${milestone.chapter} does not follow chapter ${previous}`,
      });
      continue;
    }
    previous = milestone.chapter;
  }
  if (arc.status === "RESOLVED" && arc.milestones.length === 0) {
    errors.push({
      arcId: arc.id,
      kind: "RESOLVED_WITHOUT_MILESTONE",
      message: "a resolved arc has no milestone to have resolved",
    });
  }
  return { ok: errors.length === 0, errors };
}

export interface ArcProgress {
  /** Milestones at or before `chapter` — never the ones ahead of it. */
  reached: ArcMilestone[];
  total: number;
  latest: ArcMilestone | null;
}

/**
 * Where an arc stands at a chapter.
 *
 * Spoiler-aware by construction: milestones after `chapter` are excluded,
 * not merely flagged, so an author-side read at chapter 40 cannot leak a
 * chapter-90 beat through a count.
 */
export function arcProgress(arc: CharacterArc, chapter: number): ArcProgress {
  const reached = arc.milestones
    .filter((milestone) => milestone.chapter <= chapter)
    .sort((a, b) => a.chapter - b.chapter);
  return {
    reached,
    total: arc.milestones.length,
    latest: reached.length === 0 ? null : (reached[reached.length - 1] ?? null),
  };
}
