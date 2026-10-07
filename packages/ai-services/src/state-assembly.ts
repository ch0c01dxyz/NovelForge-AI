/**
 * NF-WF-010 Consumer 1 — chapter-generation context assembly.
 *
 * The compiler's tier 4 (states) and tier 6 (timeline) consume these
 * assembly functions, which declare per row whether the row came from
 * 009 memory (a revision-pinned projection) or a live table
 * (Invariant 1). When both exist and disagree, the LIVE table wins for
 * truth and the disagreement becomes an OPEN `MEMORY_LIVE_DIVERGENCE`
 * finding — never a silent correction of either side.
 *
 * Memory corroboration (the pinned triple-match): for each live
 * character-state row, the assembler checks whether the 009 structural
 * facts for the chapter scope contain a fact whose `entityId` equals
 * the character's `storyEntityId` and whose validity window contains
 * the chapter. State rows carry prose summaries, not triples, so the
 * entity match is the implementable form of the contract's
 * "(entityId, predicate, object) triple" check for this row kind; the
 * full triple comparison runs in the divergence check against live
 * canon facts. A NULL `storyEntityId` contributes NO id — never a name
 * match (Invariant 2 / GAP-011).
 *
 * Divergence is only checked against a FRESH block: a STALE block is
 * expected to disagree with live canon (the head moved), and that is
 * carried as staleness metadata, not as a finding.
 *
 * Temporal reads: "as of story time N" = rows whose window contains N.
 * `asOfRevisionId` additionally excludes live rows whose birth revision
 * (ChangeSetItem CREATE lookup) is newer than R — the contract's
 * temporal-negative mechanism.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "./platform.ts";
import { MemoryError } from "./memory.ts";
import { checkedOutBranchId } from "./revisions.ts";
import type { AuditService } from "./audit.ts";
import type { MemoryBlock, RecallNovelResult } from "@novelforge/memory";
import {
  assertFindingEvidence,
  type EvidenceFinding,
} from "./evidence-findings.ts";
import { birthRevisionNumbers, bornAtOrBefore } from "./revision-birth.ts";

/** 003's bounded cast derivation, reused so the assembly cannot drift. */
const CAST_LIMIT = 12;
const PAIR_LIMIT = 24;
const EVENT_LIMIT = 30;

export interface RowProvenance {
  source: "LIVE" | "MEMORY_FRESH";
  sourceRevisionId: string | null;
}

export interface MemoryStatusNote {
  status: "FRESH" | "STALE" | "FAILED" | "MISSING" | "UNCONFIGURED";
  sourceRevisionId: string | null;
}

export interface CharacterAssembly {
  characterId: string;
  key: string;
  name: string;
  /** null = UNLINKED (Invariant 2). */
  identity: { storyEntityId: string | null };
  currentState: {
    id: string;
    summary: string;
    fromChapter: number;
    toChapter: number | null;
    provenance: RowProvenance;
  } | null;
  knowledge: Array<{
    factId: string;
    stance: string;
    window: [number, number | null];
    provenance: RowProvenance;
  }>;
  arcs: Array<{
    id: string;
    status: string;
    milestones: number[];
    provenance: RowProvenance;
  }>;
  /** Canon facts for the EXACT-KEY entity — joined ONLY through the non-null FK. */
  canonFacts: Array<{
    factId: string;
    predicate: string;
    statement: string;
    provenance: RowProvenance;
  }>;
}

export interface RelationshipAssembly {
  pairs: Array<{
    id: string;
    fromCharacterId: string;
    fromCharacterName: string;
    toCharacterId: string;
    toCharacterName: string;
    stance: string;
    window: [number, number | null];
    provenance: RowProvenance;
  }>;
  bonds: Array<{
    id: string;
    structure: string;
    memberIds: string[];
    fromChapter: number;
    toChapter: number | null;
    stageAtChapter: string | null;
    /** The decisive transition's chapter (null when no transition yet). */
    stageChapter: number | null;
    provenance: RowProvenance;
  }>;
}

export interface TimelineAssemblyEntry {
  id: string;
  order: number;
  description: string;
  /** Raw story_event_id; null flagged, never inferred (Invariant 2). */
  linkedEventId: string | null;
  availableFromChapter: number | null;
  provenance: RowProvenance;
}

export interface TimelineAssembly {
  entries: TimelineAssemblyEntry[];
  causal: Array<{
    id: string;
    causeEventId: string;
    effectEventId: string;
    causeDescription: string;
    effectDescription: string;
    confidence: string;
    provenance: RowProvenance;
  }>;
}

export interface MemoryPort {
  recallNovel: (
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    opts: { chapter: number; revisionId?: string; recentChapters?: number },
  ) => Promise<RecallNovelResult>;
}

const LIVE: RowProvenance = { source: "LIVE", sourceRevisionId: null };

export function createStateAssemblyServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
  /** Optional: absent in deployments without the memory wiring. */
  memory?: MemoryPort;
}): {
  assembleCharacterState(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter: number;
    asOfRevisionId?: string;
  }): Promise<{
    characters: CharacterAssembly[];
    memory: MemoryStatusNote;
    divergences: EvidenceFinding[];
  }>;
  assembleRelationships(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter: number;
    asOfRevisionId?: string;
  }): Promise<{ assembly: RelationshipAssembly; memory: MemoryStatusNote }>;
  assembleTimeline(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    asOfRevisionId?: string;
  }): Promise<TimelineAssembly>;
} {
  const { db, memory } = deps;

  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, "canon:read" as Capability);
  }

  /** Resolve an as-of revision to its number, or null for "now". */
  async function asOfNumber(
    novelId: string,
    asOfRevisionId?: string,
  ): Promise<number | null> {
    if (!asOfRevisionId) return null;
    const rev = await db.revision.findFirst({
      where: { id: asOfRevisionId, novelId },
      select: { number: true, branchId: true },
    });
    if (!rev) throw new NotFoundError("revision");
    // NF-WF-020B (GAP-040): the as-of revision must be on the checked-out
    // branch (Invariant 5). Cross-branch as-of is 400 INVALID_INPUT.
    const checkedOutId = await checkedOutBranchId(db, novelId);
    if (rev.branchId !== checkedOutId) {
      throw new MemoryError(400, "INVALID_INPUT", "cross-branch as-of is not supported");
    }
    return rev.number;
  }

  /**
   * The ONE bounded cast derivation (003 invariant 3): groupBy
   * characterId over covering state rows, take CAST_LIMIT. The compiler
   * and this assembly read the same set; neither builds its own.
   */
  async function castCharacterIds(
    novelId: string,
    chapter: number,
  ): Promise<string[]> {
    const grouped = await db.characterState.groupBy({
      by: ["characterId"],
      where: {
        character: { novelId },
        fromChapter: { lte: chapter },
        OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
      },
      orderBy: { characterId: "asc" },
      take: CAST_LIMIT,
    });
    return grouped.map((g) => g.characterId);
  }

  /**
   * Recall the chapter-scope memory block for corroboration. Returns the
   * block when FRESH, otherwise a status note. Any failure reads as
   * UNCONFIGURED — assembly proceeds on live tables alone, never failing
   * the caller (009's "memory never fails the compile closed").
   */
  async function recallChapterBlock(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    chapter: number,
  ): Promise<{ block: MemoryBlock | null; note: MemoryStatusNote }> {
    if (!memory) {
      return { block: null, note: { status: "UNCONFIGURED", sourceRevisionId: null } };
    }
    let recalled: RecallNovelResult;
    try {
      recalled = await memory.recallNovel(actorUserId, workspaceId, novelId, { chapter });
    } catch {
      return { block: null, note: { status: "UNCONFIGURED", sourceRevisionId: null } };
    }
    const block = recalled.chapterMemory;
    if (!block) {
      return { block: null, note: { status: "MISSING", sourceRevisionId: null } };
    }
    if (block.freshness === "FRESH") {
      return { block, note: { status: "FRESH", sourceRevisionId: block.sourceRevisionId } };
    }
    return {
      block: null,
      note: { status: block.freshness, sourceRevisionId: block.sourceRevisionId },
    };
  }

  /**
   * Corroboration: does the FRESH block's structural fact set contain a
   * fact for this entity whose validity window contains the chapter?
   * (The implementable form of the contract's triple-match for
   * prose-summary state rows — see the file comment.)
   */
  function corroborated(
    block: MemoryBlock,
    storyEntityId: string,
    chapter: number,
  ): boolean {
    return block.structural.facts.some(
      (f) =>
        f.entityId === storyEntityId &&
        (f.validFromChapter === null || f.validFromChapter <= chapter) &&
        (f.validUntilChapter === null || f.validUntilChapter > chapter),
    );
  }

  /**
   * Divergence: a FRESH block claims to reflect the current head, so a
   * fact it lists as active must match live canon. Any mismatch is an
   * OPEN finding — the live row stands, the memory row is suspect, and
   * neither is silently corrected.
   */
  async function divergenceFindings(
    block: MemoryBlock,
    novelId: string,
    sourceRevisionId: string,
  ): Promise<EvidenceFinding[]> {
    const findings: EvidenceFinding[] = [];
    const factIds = block.structural.facts.map((f) => f.factId);
    if (factIds.length === 0) return findings;
    const live = await db.canonFact.findMany({
      where: { id: { in: factIds }, novelId },
      select: {
        id: true,
        entityId: true,
        predicate: true,
        objectText: true,
        objectEntityId: true,
        status: true,
      },
    });
    const liveById = new Map(live.map((r) => [r.id, r]));
    for (const f of block.structural.facts) {
      const row = liveById.get(f.factId);
      const memObject =
        "entityId" in f.object ? `entity:${f.object.entityId}` : `text:${f.object.text}`;
      if (!row) {
        findings.push(
          assertFindingEvidence({
            rule: "MEMORY_LIVE_DIVERGENCE",
            severity: "WARNING",
            status: "OPEN",
            evidence: [
              {
                kind: "fact",
                id: f.factId,
                revisionId: sourceRevisionId,
                detail: `memory lists (${f.entityId}, ${f.predicate}, ${memObject}) as ACTIVE at ${sourceRevisionId}; no such canon fact exists in live tables`,
              },
            ],
            affectedEntities: [{ type: "entity", id: f.entityId }],
            remediation:
              "rebuild the memory projection for the scope; the projection row contradicts live canon",
            sourceRevisionId,
            evaluatedAt: new Date().toISOString(),
          }),
        );
        continue;
      }
      const liveObject =
        row.objectEntityId !== null ? `entity:${row.objectEntityId}` : `text:${row.objectText}`;
      const tripleMatch =
        row.entityId === f.entityId &&
        row.predicate === f.predicate &&
        liveObject === memObject;
      if (row.status !== "ACTIVE" || !tripleMatch) {
        findings.push(
          assertFindingEvidence({
            rule: "MEMORY_LIVE_DIVERGENCE",
            severity: "WARNING",
            status: "OPEN",
            evidence: [
              {
                kind: "fact",
                id: f.factId,
                revisionId: sourceRevisionId,
                detail: `memory lists (${f.entityId}, ${f.predicate}, ${memObject}) as ACTIVE at ${sourceRevisionId}; live canon has status ${row.status} with (${row.entityId}, ${row.predicate}, ${liveObject})`,
              },
            ],
            affectedEntities: [{ type: "entity", id: f.entityId }],
            remediation:
              "rebuild the memory projection for the scope; the projection row contradicts live canon",
            sourceRevisionId,
            evaluatedAt: new Date().toISOString(),
          }),
        );
      }
    }
    return findings;
  }

  return {
    async assembleCharacterState({ actorUserId, workspaceId, novelId, chapter, asOfRevisionId }) {
      await gate(actorUserId, workspaceId, novelId);
      const rNumber = await asOfNumber(novelId, asOfRevisionId);
      const { block, note } = await recallChapterBlock(actorUserId, workspaceId, novelId, chapter);
      const divergences =
        block && note.status === "FRESH"
          ? await divergenceFindings(block, novelId, block.sourceRevisionId)
          : [];

      const characterIds = await castCharacterIds(novelId, chapter);
      const characters: CharacterAssembly[] = [];
      for (const characterId of characterIds) {
        const character = await db.character.findFirst({
          where: { id: characterId, novelId, workspaceId },
          select: { id: true, key: true, name: true, storyEntityId: true },
        });
        if (!character) continue;

        const stateRow = await db.characterState.findFirst({
          where: {
            characterId,
            fromChapter: { lte: chapter },
            OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
          },
          orderBy: [{ fromChapter: "asc" }, { id: "asc" }],
          select: { id: true, summary: true, fromChapter: true, toChapter: true },
        });

        let knowledgeRows = await db.characterKnowledge.findMany({
          where: {
            characterId,
            fromChapter: { lte: chapter },
            OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
          },
          orderBy: { id: "asc" },
          select: { id: true, factId: true, stance: true, fromChapter: true, toChapter: true },
        });

        // Temporal-negative: drop live rows born after R (ChangeSetItem
        // CREATE lookup — the contract's named mechanism). Birth unknown
        // → kept (the filter is a ceiling, not a whitelist).
        let stateKept = stateRow;
        if (rNumber !== null) {
          const births = await birthRevisionNumbers(
            db,
            [
              ...(stateRow ? [{ entityType: "CharacterState", entityId: stateRow.id }] : []),
              ...knowledgeRows.map((k) => ({ entityType: "CharacterKnowledge", entityId: k.id })),
            ],
          );
          if (stateKept) {
            const birth = births.get(stateKept.id);
            if (birth !== undefined && birth > rNumber) stateKept = null;
          }
          knowledgeRows = bornAtOrBefore(knowledgeRows, (k) => k.id, births, rNumber);
        }

        const arcs = await db.characterArc.findMany({
          where: { characterId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            milestones: { select: { chapter: true }, orderBy: { chapter: "asc" } },
          },
        });

        // Canon facts for the EXACT-KEY entity — joined ONLY through the
        // non-null FK (Invariant 2). NULL storyEntityId → no canon facts,
        // no name match, no guessed id.
        const canonFacts =
          character.storyEntityId !== null
            ? await db.canonFact.findMany({
                where: {
                  novelId,
                  entityId: character.storyEntityId,
                  status: "ACTIVE",
                  OR: [
                    { validFromChapter: null },
                    { validFromChapter: { lte: chapter } },
                  ],
                },
                orderBy: { id: "asc" },
                take: 50,
                select: { id: true, predicate: true, statement: true },
              })
            : [];

        const memProv: RowProvenance | null =
          block && character.storyEntityId && corroborated(block, character.storyEntityId, chapter)
            ? { source: "MEMORY_FRESH", sourceRevisionId: block.sourceRevisionId }
            : null;
        const prov = (rowProv: RowProvenance = LIVE) => rowProv;

        characters.push({
          characterId: character.id,
          key: character.key,
          name: character.name,
          identity: { storyEntityId: character.storyEntityId },
          currentState: stateKept
            ? {
                id: stateKept.id,
                summary: stateKept.summary,
                fromChapter: stateKept.fromChapter,
                toChapter: stateKept.toChapter,
                provenance: memProv ?? prov(),
              }
            : null,
          knowledge: knowledgeRows.map((k) => ({
            factId: k.factId,
            stance: k.stance as string,
            window: [k.fromChapter, k.toChapter] as [number, number | null],
            provenance: prov(),
          })),
          arcs: arcs.map((a) => ({
            id: a.id,
            status: a.status as string,
            milestones: a.milestones.map((m) => m.chapter),
            provenance: prov(),
          })),
          canonFacts: canonFacts.map((f) => ({
            factId: f.id,
            predicate: f.predicate,
            statement: f.statement,
            provenance: prov(),
          })),
        });
      }

      return { characters, memory: note, divergences };
    },

    async assembleRelationships({ actorUserId, workspaceId, novelId, chapter, asOfRevisionId }) {
      await gate(actorUserId, workspaceId, novelId);
      void asOfRevisionId;
      const { note } = await recallChapterBlock(actorUserId, workspaceId, novelId, chapter);

      const characterIds = await castCharacterIds(novelId, chapter);
      // Names for rendering; lookups stay by id, never by name (GAP-011).
      const nameRows = await db.character.findMany({
        where: { id: { in: characterIds }, novelId },
        select: { id: true, name: true },
      });
      const nameById = new Map(nameRows.map((c) => [c.id, c.name]));
      // Directed pairs among the cast, deterministically ordered, bounded
      // (003's tier-4 pair derivation — same set the compiler reads).
      const pairs: Array<[string, string]> = [];
      const sorted = [...characterIds].sort();
      for (const from of sorted) {
        for (const to of sorted) {
          if (from !== to) pairs.push([from, to]);
        }
      }
      const boundedPairs = pairs.slice(0, PAIR_LIMIT);
      const pairRows: RelationshipAssembly["pairs"] = [];
      for (const [fromCharacterId, toCharacterId] of boundedPairs) {
        const row = await db.relationshipStance.findFirst({
          where: {
            fromCharacterId,
            toCharacterId,
            fromChapter: { lte: chapter },
            OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
          },
          orderBy: [{ fromChapter: "desc" }, { id: "asc" }],
          select: { id: true, stance: true, fromChapter: true, toChapter: true },
        });
        if (row) {
          pairRows.push({
            id: row.id,
            fromCharacterId,
            fromCharacterName: nameById.get(fromCharacterId) ?? fromCharacterId,
            toCharacterId,
            toCharacterName: nameById.get(toCharacterId) ?? toCharacterId,
            stance: row.stance as string,
            window: [row.fromChapter, row.toChapter],
            // Memory's structural core has no stance/bond facts in 010's
            // scope — stance rows are always LIVE (see file comment).
            provenance: LIVE,
          });
        }
      }

      const bondRows = await db.bond.findMany({
        where: {
          novelId,
          workspaceId,
          members: { some: { characterId: { in: characterIds } } },
        },
        orderBy: { id: "asc" },
        take: PAIR_LIMIT,
        select: {
          id: true,
          structure: true,
          fromChapter: true,
          toChapter: true,
          members: { select: { characterId: true } },
        },
      });
      const bonds: RelationshipAssembly["bonds"] = [];
      for (const b of bondRows) {
        const transition = await db.bondTransition.findFirst({
          where: { bondId: b.id, chapter: { lte: chapter } },
          orderBy: [{ chapter: "desc" }, { id: "asc" }],
          select: { stage: true, kind: true, chapter: true },
        });
        bonds.push({
          id: b.id,
          structure: b.structure as string,
          memberIds: b.members.map((m) => m.characterId),
          fromChapter: b.fromChapter,
          toChapter: b.toChapter,
          stageAtChapter: transition ? (transition.kind === "SEVER" ? null : (transition.stage as string)) : null,
          stageChapter: transition ? transition.chapter : null,
          provenance: LIVE,
        });
      }

      return { assembly: { pairs: pairRows, bonds }, memory: note };
    },

    async assembleTimeline({ actorUserId, workspaceId, novelId, asOfRevisionId }) {
      await gate(actorUserId, workspaceId, novelId);
      const rNumber = await asOfNumber(novelId, asOfRevisionId);

      let entries = await db.timelineEvent.findMany({
        where: { novelId, workspaceId },
        orderBy: { order: "asc" },
        take: EVENT_LIMIT,
        select: {
          id: true,
          order: true,
          description: true,
          storyEventId: true,
          availableFromChapter: true,
        },
      });
      // Temporal-negative: rows born after R are excluded (ChangeSetItem
      // CREATE lookup — the contract's named mechanism).
      if (rNumber !== null) {
        const births = await birthRevisionNumbers(
          db,
          entries.map((e) => ({ entityType: "TimelineEvent", entityId: e.id })),
        );
        entries = entries.filter((e) => {
          const birth = births.get(e.id);
          return birth === undefined || birth <= rNumber;
        });
      }

      const causal = await db.causalEdge.findMany({
        where: { novelId, workspaceId },
        orderBy: { id: "asc" },
        take: EVENT_LIMIT,
        select: {
          id: true,
          causeEventId: true,
          effectEventId: true,
          confidence: true,
          causeEvent: { select: { description: true } },
          effectEvent: { select: { description: true } },
        },
      });

      return {
        entries: entries.map((e) => ({
          id: e.id,
          order: e.order,
          description: e.description,
          linkedEventId: e.storyEventId,
          availableFromChapter: e.availableFromChapter,
          // 009 memory contributes nothing to tier 6 in 010: timeline
          // entries are authored prose-position records, not canon
          // derivations (Invariant 1).
          provenance: LIVE,
        })),
        causal: causal.map((c) => ({
          id: c.id,
          causeEventId: c.causeEventId,
          effectEventId: c.effectEventId,
          causeDescription: c.causeEvent.description,
          effectDescription: c.effectEvent.description,
          confidence: c.confidence as string,
          provenance: LIVE,
        })),
      };
    },
  };
}

export type StateAssemblyServices = ReturnType<typeof createStateAssemblyServices>;
