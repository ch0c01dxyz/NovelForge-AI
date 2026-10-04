/**
 * Character services (Phase 8) — Prisma-backed use cases over the character
 * tables. Pure rules live in @novelforge/character-intelligence, imported
 * and never re-implemented.
 *
 * Overlap discipline: the domain validator runs first so the caller gets a
 * message naming the two conflicting windows, and the DB EXCLUDE
 * (character_states_no_overlap / character_knowledge_no_overlap) is the
 * backstop for a race the pre-check cannot see. A 23P01 the validator did
 * not predict maps to ConflictError, never a 500.
 */
import {
  arcProgress,
  stateAt,
  validateArc,
  validateStateHistory,
  voiceAccess,
  type ArcStatus,
  type KnowledgeSource,
  type KnowledgeStance,
  type StateRecord,
} from "@novelforge/character-intelligence";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError, isExclusionViolation } from "./platform.ts";
import type { AuditService } from "./audit.ts";
// Head CAS for every covered mutation (STORY-VERSIONING.md C3/C4).
import { advanceForMutation, createWithRevision } from "./revisions.ts";

// --- Views ---

export interface CharacterView {
  id: string;
  novelId: string;
  key: string;
  name: string;
  summary: string | null;
  createdAt: Date;
}

export interface StateView {
  id: string;
  characterId: string;
  fromChapter: number;
  toChapter: number | null;
  summary: string;
  createdAt: Date;
}

export interface KnowledgeView {
  id: string;
  characterId: string;
  factId: string;
  stance: KnowledgeStance;
  source: KnowledgeSource;
  fromChapter: number;
  toChapter: number | null;
}

export interface ArcView {
  id: string;
  characterId: string;
  status: ArcStatus;
  title: string;
}

export interface MilestoneView {
  id: string;
  arcId: string;
  chapter: number;
  summary: string;
}

// --- Service contract ---

/** Tenant scope every method takes. */
export interface CharacterScope {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

export interface CharacterServices {
  createCharacter(input: CharacterScope & {
    key: string;
    name: string;
    summary: string | null;
  }): Promise<CharacterView>;

  listCharacters(input: CharacterScope & { take: number; skip: number }): Promise<CharacterView[]>;

  deleteCharacter(input: CharacterScope & { characterId: string }): Promise<void>;

  createState(input: CharacterScope & {
    characterId: string;
    fromChapter: number;
    toChapter: number | null;
    summary: string;
  }): Promise<StateView>;

  listStates(input: CharacterScope & { characterId: string }): Promise<StateView[]>;

  /** The state covering `chapter`, or null — never the nearest earlier one. */
  stateAt(input: CharacterScope & { characterId: string; chapter: number }): Promise<StateView | null>;

  putKnowledge(input: CharacterScope & {
    characterId: string;
    factId: string;
    stance: KnowledgeStance;
    source: KnowledgeSource;
    fromChapter: number;
    toChapter: number | null;
  }): Promise<KnowledgeView>;

  listKnowledge(input: CharacterScope & { characterId: string }): Promise<KnowledgeView[]>;

  /**
   * May this character reference this fact at `chapter`? The validator the
   * spec's dialogue/planning checks read (CHARACTER-RELATIONSHIP.md).
   */
  voiceAccess(input: CharacterScope & {
    characterId: string;
    factId: string;
    chapter: number;
  }): Promise<{ accessible: boolean; stance: KnowledgeStance; source: KnowledgeSource | null }>;

  createArc(input: CharacterScope & {
    characterId: string;
    title: string;
    status: ArcStatus;
  }): Promise<ArcView>;

  listArcs(input: CharacterScope & { characterId: string }): Promise<ArcView[]>;

  addMilestone(input: CharacterScope & {
    arcId: string;
    chapter: number;
    summary: string;
  }): Promise<MilestoneView>;

  /** Spoiler-aware: milestones after `chapter` are excluded, not flagged. */
  arcProgress(input: CharacterScope & {
    arcId: string;
    chapter: number;
  }): Promise<{ reached: MilestoneView[]; total: number; latest: MilestoneView | null }>;
}

// --- Implementation ---

export function createCharacterServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): CharacterServices {
  const { db, audit } = deps;
  // Head CAS for every covered mutation (C3/C4). Bound once so each call site
  // stays a five-argument call; the helper opens its own transaction.
  const withRevision = createWithRevision(db);

  /** Tenant gate: membership + novel resolved server-side, missing either is the SAME 404 (no leak); capability granular (ADR-0004). */
  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    capability: Capability,
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
    requireCapability(membership.role, capability);
  }

  /**
   * Resolve a character inside the tenant. The workspaceId predicate is the
   * isolation boundary (ADR-0007) — a cross-tenant id is a 404, not a 403.
   */
  async function requireCharacter(
    characterId: string,
    novelId: string,
    workspaceId: string,
  ): Promise<{ id: string }> {
    const character = await db.character.findFirst({
      where: { id: characterId, novelId, workspaceId },
      select: { id: true },
    });
    if (!character) throw new NotFoundError("character");
    return character;
  }

  function toStateView(row: {
    id: string; characterId: string; fromChapter: number;
    toChapter: number | null; summary: string; createdAt: Date;
  }): StateView {
    return {
      id: row.id,
      characterId: row.characterId,
      fromChapter: row.fromChapter,
      toChapter: row.toChapter,
      summary: row.summary,
      createdAt: row.createdAt,
    };
  }

  return {
    // --- Characters -------------------------------------------------------

    async createCharacter({ actorUserId, workspaceId, novelId, key, name, summary }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      let created;
      try {
        created = await withRevision(
  { workspaceId, novelId, actorUserId },
  "character.write",
  "Character",
  ["characters"],
  (tx) => tx.character.create({
          data: { workspaceId, novelId, key, name, summary, createdById: actorUserId },
        }),
);
      } catch (error) {
        // characters_novel_id_key_key. A duplicate key is an authoring
        // mistake, not a server fault.
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError(`a character with key "${key}" already exists in this novel`);
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.created",
        entityType: "Character",
        entityId: created.id,
        payload: { key },
      });
      return {
        id: created.id,
        novelId: created.novelId,
        key: created.key,
        name: created.name,
        summary: created.summary,
        createdAt: created.createdAt,
      };
    },

    async listCharacters({ actorUserId, workspaceId, novelId, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.character.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
        take,
        skip,
      });
      return rows.map((row) => ({
        id: row.id,
        novelId: row.novelId,
        key: row.key,
        name: row.name,
        summary: row.summary,
        createdAt: row.createdAt,
      }));
    },

    async deleteCharacter({ actorUserId, workspaceId, novelId, characterId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      // States, knowledge, arcs, stances and bond memberships all cascade
      // (schema), so this is the one delete that has to be deliberate: it
      // removes the character's whole history. The route requires the
      // caller to have read it first.
      // The count check is INSIDE the transaction, deliberately: a 404 thrown
      // after the commit would leave a revision for a delete that deleted
      // nothing (C4 — the revision and the mutation share one boundary).
      await db.$transaction(async (tx) => {
        const deleted = await tx.character.deleteMany({
          where: { id: characterId, novelId, workspaceId },
        });
        if (deleted.count === 0) throw new NotFoundError("character");
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "character.write",
          origin: "MANUAL",
          actorUserId,
          // The cascade reaches every table below, so all of them are
          // invalidated — the intent is derived from what actually changed.
          tables: [
            "characters",
            "character_states",
            "character_knowledge",
            "character_arcs",
            "character_arc_milestones",
            "relationship_stances",
            "bond_members",
          ],
          items: [{ entityType: "Character", entityId: characterId, operation: "DELETE" }],
        });
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.deleted",
        entityType: "Character",
        entityId: characterId,
      });
    },

    // --- Historical state -------------------------------------------------

    async createState({ actorUserId, workspaceId, novelId, characterId, fromChapter, toChapter, summary }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await requireCharacter(characterId, novelId, workspaceId);

      // Validate against the existing history so the caller gets a message
      // naming the conflicting window, not a bare constraint name.
      const existing = await db.characterState.findMany({
        where: { characterId },
        select: { id: true, characterId: true, fromChapter: true, toChapter: true },
      });
      const candidate: StateRecord = {
        id: "candidate",
        characterId,
        fromChapter,
        toChapter,
      };
      const verdict = validateStateHistory([...existing, candidate]);
      const failures = verdict.errors.filter((e) => e.recordId === "candidate");
      if (failures.length > 0) {
        throw new ConflictError(failures.map((f) => f.message).join("; "));
      }

      let created;
      try {
        created = await withRevision(
  { workspaceId, novelId, actorUserId },
  "character.write",
  "CharacterState",
  ["character_states"],
  (tx) => tx.characterState.create({
          data: { characterId, fromChapter, toChapter, summary },
        }),
);
      } catch (error) {
        // The EXCLUDE, for a race the pre-check above did not see.
        if (isExclusionViolation(error)) {
          throw new ConflictError(
            `chapter ${fromChapter} of this character is already covered by another state`,
          );
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.state-recorded",
        entityType: "CharacterState",
        entityId: created.id,
        payload: { characterId, fromChapter, toChapter },
      });
      return toStateView(created);
    },

    async listStates({ actorUserId, workspaceId, novelId, characterId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacter(characterId, novelId, workspaceId);
      const rows = await db.characterState.findMany({
        where: { characterId },
        orderBy: { fromChapter: "asc" },
      });
      return rows.map(toStateView);
    },

    async stateAt({ actorUserId, workspaceId, novelId, characterId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacter(characterId, novelId, workspaceId);
      const rows = await db.characterState.findMany({
        where: { characterId },
        orderBy: { fromChapter: "asc" },
      });
      // The domain rule picks the record; the ROW carries the prose the
      // domain type deliberately does not model (StateRecord is the window
      // only). find() cannot miss — `at` came out of `rows`.
      const at = stateAt(rows, characterId, chapter);
      if (at === null) return null;
      const row = rows.find((r) => r.id === at.id);
      return row === undefined ? null : toStateView(row);
    },

    // --- Knowledge boundary -----------------------------------------------

    async putKnowledge({
      actorUserId, workspaceId, novelId,
      characterId, factId, stance, source, fromChapter, toChapter,
    }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await requireCharacter(characterId, novelId, workspaceId);

      // The fact must belong to this novel — a factId from another tenant
      // must not become a belief here (the FK alone would allow it).
      const fact = await db.canonFact.findFirst({
        where: { id: factId, novelId },
        select: { id: true },
      });
      if (!fact) throw new NotFoundError("canon fact");

      if (!Number.isInteger(fromChapter) || fromChapter < 1) {
        throw new ConflictError(`fromChapter ${fromChapter} is not a chapter number`);
      }
      if (toChapter !== null && toChapter <= fromChapter) {
        throw new ConflictError(`window [${fromChapter}, ${toChapter}) is empty or inverted`);
      }

      const existing = await db.characterKnowledge.findMany({
        where: { characterId, factId },
        select: { id: true, characterId: true, factId: true, stance: true, source: true, fromChapter: true, toChapter: true },
      });
      // knowledgeAt takes the latest covering record, so an overlap is
      // genuinely ambiguous rather than merely untidy.
      const overlapping = existing.some((row) => {
        const otherEnd = row.toChapter ?? Number.POSITIVE_INFINITY;
        const thisEnd = toChapter ?? Number.POSITIVE_INFINITY;
        return row.fromChapter < thisEnd && fromChapter < otherEnd;
      });
      if (overlapping) {
        throw new ConflictError(
          `chapter ${fromChapter} already has a recorded stance for this character and fact`,
        );
      }

      let created;
      try {
        created = await withRevision(
  { workspaceId, novelId, actorUserId },
  "character.write",
  "CharacterKnowledge",
  ["character_knowledge"],
  (tx) => tx.characterKnowledge.create({
          data: { characterId, factId, stance, source, fromChapter, toChapter },
        }),
);
      } catch (error) {
        if (isExclusionViolation(error)) {
          throw new ConflictError(
            `chapter ${fromChapter} already has a recorded stance for this character and fact`,
          );
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.knowledge-recorded",
        entityType: "CharacterKnowledge",
        entityId: created.id,
        // The stance and source are the audit-relevant facts; the fact's
        // own statement is canon and is not duplicated here.
        payload: { characterId, factId, stance, source },
      });
      return {
        id: created.id,
        characterId: created.characterId,
        factId: created.factId,
        stance: created.stance as KnowledgeStance,
        source: created.source as KnowledgeSource,
        fromChapter: created.fromChapter,
        toChapter: created.toChapter,
      };
    },

    async listKnowledge({ actorUserId, workspaceId, novelId, characterId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacter(characterId, novelId, workspaceId);
      const rows = await db.characterKnowledge.findMany({
        where: { characterId },
        orderBy: { fromChapter: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        characterId: row.characterId,
        factId: row.factId,
        stance: row.stance as KnowledgeStance,
        source: row.source as KnowledgeSource,
        fromChapter: row.fromChapter,
        toChapter: row.toChapter,
      }));
    },

    async voiceAccess({ actorUserId, workspaceId, novelId, characterId, factId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacter(characterId, novelId, workspaceId);
      const rows = await db.characterKnowledge.findMany({
        where: { characterId, factId },
        orderBy: { fromChapter: "asc" },
      });
      const records = rows.map((row) => ({
        id: row.id,
        characterId: row.characterId,
        factId: row.factId,
        stance: row.stance as KnowledgeStance,
        source: row.source as KnowledgeSource,
        fromChapter: row.fromChapter,
        toChapter: row.toChapter,
      }));
      // Absence is not permission: an unrecorded fact yields accessible
      // false, which is why this reads the domain helper rather than
      // returning knowledgeAt(...) !== null.
      return voiceAccess(records, characterId, factId, chapter);
    },

    // --- Arcs -------------------------------------------------------------

    async createArc({ actorUserId, workspaceId, novelId, characterId, title, status }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await requireCharacter(characterId, novelId, workspaceId);
      const created = await withRevision(
  { workspaceId, novelId, actorUserId },
  "character.write",
  "CharacterArc",
  ["character_arcs"],
  (tx) => tx.characterArc.create({
        data: { characterId, title, status },
      }),
);
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.arc-created",
        entityType: "CharacterArc",
        entityId: created.id,
        payload: { characterId, status },
      });
      return {
        id: created.id,
        characterId: created.characterId,
        status: created.status as ArcStatus,
        title: created.title,
      };
    },

    async listArcs({ actorUserId, workspaceId, novelId, characterId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacter(characterId, novelId, workspaceId);
      const rows = await db.characterArc.findMany({
        where: { characterId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        characterId: row.characterId,
        status: row.status as ArcStatus,
        title: row.title,
      }));
    },

    async addMilestone({ actorUserId, workspaceId, novelId, arcId, chapter, summary }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      // The arc must be in this novel; walk it through its character, which
      // is where the tenant boundary lives.
      const found = await db.characterArc.findFirst({
        where: { id: arcId, character: { novelId, workspaceId } },
        select: { id: true, characterId: true, status: true, title: true },
      });
      if (!found) throw new NotFoundError("character arc");

      const existing = await db.characterArcMilestone.findMany({
        where: { arcId },
        orderBy: { chapter: "asc" },
        select: { id: true, chapter: true, summary: true },
      });

      // validateArc walks the array IN THE ORDER GIVEN, so appending the
      // candidate and running it only checks the append case — an insert in
      // the middle would slip through. Sort the whole set, then diff the
      // errors against the baseline: whatever the arc already reported is
      // not this write's fault, so a pre-existing defect cannot block a
      // correct milestone. No message parsing, no kind whitelist.
      const baseline = existing.map((m) => ({ id: m.id, chapter: m.chapter, summary: m.summary }));
      const candidate = { id: "candidate", chapter, summary };
      const sorted = [...baseline, candidate].sort((a, b) => a.chapter - b.chapter);
      const asArc = (milestones: typeof sorted) => ({
        id: arcId,
        characterId: found.characterId,
        status: found.status as ArcStatus,
        milestones,
      });
      const before = new Set(validateArc(asArc(baseline)).errors.map((e) => `${e.kind}:${e.message}`));
      const failures = validateArc(asArc(sorted)).errors.filter(
        (e) => !before.has(`${e.kind}:${e.message}`),
      );
      if (failures.length > 0) {
        throw new ConflictError(failures.map((f) => f.message).join("; "));
      }

      let created;
      try {
        created = await withRevision(
  { workspaceId, novelId, actorUserId },
  "character.write",
  "CharacterArcMilestone",
  ["character_arc_milestones"],
  (tx) => tx.characterArcMilestone.create({
          data: { arcId, chapter, summary },
        }),
);
      } catch (error) {
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError(`this arc already has a milestone at chapter ${chapter}`);
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "character.milestone-added",
        entityType: "CharacterArcMilestone",
        entityId: created.id,
        payload: { arcId, chapter },
      });
      return { id: created.id, arcId: created.arcId, chapter: created.chapter, summary: created.summary };
    },

    async arcProgress({ actorUserId, workspaceId, novelId, arcId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const arc = await db.characterArc.findFirst({
        where: { id: arcId, character: { novelId, workspaceId } },
        select: { id: true, characterId: true, status: true },
      });
      if (!arc) throw new NotFoundError("character arc");
      const rows = await db.characterArcMilestone.findMany({
        where: { arcId },
        orderBy: { chapter: "asc" },
      });
      const progress = arcProgress(
        {
          id: arcId,
          characterId: arc.characterId,
          status: arc.status as ArcStatus,
          milestones: rows.map((row) => ({
            id: row.id,
            chapter: row.chapter,
            summary: row.summary,
          })),
        },
        chapter,
      );
      return {
        reached: progress.reached.map((m) => ({
          id: m.id,
          arcId,
          chapter: m.chapter,
          summary: m.summary,
        })),
        total: progress.total,
        latest: progress.latest === null
          ? null
          : {
              id: progress.latest.id,
              arcId,
              chapter: progress.latest.chapter,
              summary: progress.latest.summary,
            },
      };
    },
  };
}
