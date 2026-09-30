/**
 * Relationship services (Phase 8) — Prisma-backed use cases over the
 * relationship tables. Pure rules live in
 * @novelforge/relationship-intelligence, imported and never re-implemented.
 *
 * This service carries the phase's two named exit scenarios end to end:
 * the monogamy/harem/polygamy structure checks (createBond) and the
 * enemy-to-ally turn (createStance — a second span on the same direction,
 * never an overwrite).
 *
 * Overlap discipline matches characters.ts: the domain validator runs
 * first so the caller gets a message naming the conflicting windows, and
 * relationship_stances_no_overlap is the backstop for a race.
 */
import {
  bondStageAt,
  neglectReport,
  stanceAt,
  stanceSince,
  validateBondLifecycle,
  validateBondStructures,
  validateStanceHistory,
  type Bond,
  type BondStage,
  type BondStructure,
  type BondTransition,
  type BondTransitionKind,
  type RelationshipStance,
  type StanceRecord,
} from "@novelforge/relationship-intelligence";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError, isExclusionViolation } from "./platform.ts";
import type { AuditService } from "./audit.ts";

// --- Views ---

export interface StanceView {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  stance: RelationshipStance;
  fromChapter: number;
  toChapter: number | null;
}

export interface BondView {
  id: string;
  novelId: string;
  structure: BondStructure;
  memberIds: string[];
  fromChapter: number;
  toChapter: number | null;
}

export interface TransitionView {
  id: string;
  bondId: string;
  chapter: number;
  stage: BondStage;
  kind: BondTransitionKind;
}

export interface InteractionView {
  id: string;
  bondId: string;
  chapter: number;
  weight: number;
  summary: string | null;
}

export interface NeglectView {
  lastMeaningfulChapter: number | null;
  chaptersSinceMeaningful: number | null;
  neglected: boolean;
}

// --- Service contract ---

export interface RelationshipScope {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

export interface RelationshipServices {
  createStance(input: RelationshipScope & {
    fromCharacterId: string;
    toCharacterId: string;
    stance: RelationshipStance;
    fromChapter: number;
    toChapter: number | null;
  }): Promise<StanceView>;

  listStances(input: RelationshipScope & {
    fromCharacterId: string | null;
    toCharacterId: string | null;
  }): Promise<StanceView[]>;

  /** How A regards B at `chapter`, or null — never the nearest earlier span. */
  stanceAt(input: RelationshipScope & {
    fromCharacterId: string;
    toCharacterId: string;
    chapter: number;
  }): Promise<StanceView | null>;

  /** The chapter the CURRENT stance began — the date of an enemy-to-ally turn. */
  stanceSince(input: RelationshipScope & {
    fromCharacterId: string;
    toCharacterId: string;
    chapter: number;
  }): Promise<{ stance: RelationshipStance; sinceChapter: number } | null>;
  createBond(input: RelationshipScope & {
    structure: BondStructure;
    memberIds: string[];
    fromChapter: number;
    toChapter: number | null;
  }): Promise<BondView>;

  listBonds(input: RelationshipScope & { take: number; skip: number }): Promise<BondView[]>;

  deleteBond(input: RelationshipScope & { bondId: string }): Promise<void>;

  addTransition(input: RelationshipScope & {
    bondId: string;
    chapter: number;
    stage: BondStage;
    kind: BondTransitionKind;
  }): Promise<TransitionView>;

  listTransitions(input: RelationshipScope & { bondId: string }): Promise<TransitionView[]>;

  /** The stage a bond stands at in `chapter`, or null if it has not begun. */
  bondStageAt(input: RelationshipScope & { bondId: string; chapter: number }): Promise<BondStage | null>;

  recordInteraction(input: RelationshipScope & {
    bondId: string;
    chapter: number;
    weight: number;
    summary: string | null;
  }): Promise<InteractionView>;

  /** Neglect measured on weighted evidence, not on chapter presence. */
  neglectReport(input: RelationshipScope & { bondId: string; chapter: number; maxGap?: number }): Promise<NeglectView>;
}

// --- Implementation ---

export function createRelationshipServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): RelationshipServices {
  const { db, audit } = deps;

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
   * Every named character must exist in THIS novel. The FK alone would
   * accept a characterId from another tenant, so the check is explicit —
   * and it is the check that makes the monogamy scenario mean anything.
   */
  async function requireCharacters(
    characterIds: readonly string[],
    novelId: string,
    workspaceId: string,
  ): Promise<void> {
    const unique = [...new Set(characterIds)];
    const found = await db.character.findMany({
      where: { id: { in: unique }, novelId, workspaceId },
      select: { id: true },
    });
    if (found.length !== unique.length) throw new NotFoundError("character");
  }

  function toBondView(row: {
    id: string; novelId: string; structure: string;
    fromChapter: number; toChapter: number | null;
    members: { characterId: string }[];
  }): BondView {
    return {
      id: row.id,
      novelId: row.novelId,
      structure: row.structure as BondStructure,
      memberIds: row.members.map((m) => m.characterId),
      fromChapter: row.fromChapter,
      toChapter: row.toChapter,
    };
  }

  return {
    // --- Directional stance history (the enemy-to-ally scenario) ----------

    async createStance({
      actorUserId, workspaceId, novelId,
      fromCharacterId, toCharacterId, stance, fromChapter, toChapter,
    }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await requireCharacters([fromCharacterId, toCharacterId], novelId, workspaceId);

      // SELF_REFERENCE, BAD_WINDOW and OVERLAP all arrive from the domain
      // validator; the EXCLUDE below is only the race backstop.
      const existing = await db.relationshipStance.findMany({
        where: { fromCharacterId, toCharacterId },
        select: {
          id: true, fromCharacterId: true, toCharacterId: true,
          stance: true, fromChapter: true, toChapter: true,
        },
      });
      const candidate: StanceRecord = {
        id: "candidate",
        fromCharacterId,
        toCharacterId,
        stance,
        fromChapter,
        toChapter,
      };
      const failures = validateStanceHistory([...existing, candidate]).errors
        .filter((e) => e.recordId === "candidate");
      if (failures.length > 0) {
        throw new ConflictError(failures.map((f) => f.message).join("; "));
      }

      let created;
      try {
        created = await db.relationshipStance.create({
          data: { workspaceId, fromCharacterId, toCharacterId, stance, fromChapter, toChapter },
        });
      } catch (error) {
        if (isExclusionViolation(error)) {
          throw new ConflictError(
            `chapter ${fromChapter} already has a recorded stance for this direction`,
          );
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "relationship.stance-recorded",
        entityType: "RelationshipStance",
        entityId: created.id,
        payload: { fromCharacterId, toCharacterId, stance, fromChapter },
      });
      return {
        id: created.id,
        fromCharacterId: created.fromCharacterId,
        toCharacterId: created.toCharacterId,
        stance: created.stance as RelationshipStance,
        fromChapter: created.fromChapter,
        toChapter: created.toChapter,
      };
    },

    async listStances({ actorUserId, workspaceId, novelId, fromCharacterId, toCharacterId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.relationshipStance.findMany({
        // The workspace predicate is the isolation boundary (ADR-0007).
        where: {
          workspaceId,
          fromCharacter: { novelId },
          ...(fromCharacterId ? { fromCharacterId } : {}),
          ...(toCharacterId ? { toCharacterId } : {}),
        },
        orderBy: [{ fromCharacterId: "asc" }, { fromChapter: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        fromCharacterId: row.fromCharacterId,
        toCharacterId: row.toCharacterId,
        stance: row.stance as RelationshipStance,
        fromChapter: row.fromChapter,
        toChapter: row.toChapter,
      }));
    },

    async stanceAt({ actorUserId, workspaceId, novelId, fromCharacterId, toCharacterId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacters([fromCharacterId, toCharacterId], novelId, workspaceId);
      const rows = await db.relationshipStance.findMany({
        where: { fromCharacterId, toCharacterId },
        orderBy: { fromChapter: "asc" },
      });
      const records: StanceRecord[] = rows.map((row) => ({
        id: row.id,
        fromCharacterId: row.fromCharacterId,
        toCharacterId: row.toCharacterId,
        stance: row.stance as RelationshipStance,
        fromChapter: row.fromChapter,
        toChapter: row.toChapter,
      }));
      const found = stanceAt(records, fromCharacterId, toCharacterId, chapter);
      if (found === null) return null;
      return {
        id: found.id,
        fromCharacterId: found.fromCharacterId,
        toCharacterId: found.toCharacterId,
        stance: found.stance,
        fromChapter: found.fromChapter,
        toChapter: found.toChapter,
      };
    },

    async stanceSince({ actorUserId, workspaceId, novelId, fromCharacterId, toCharacterId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      await requireCharacters([fromCharacterId, toCharacterId], novelId, workspaceId);
      const rows = await db.relationshipStance.findMany({
        where: { fromCharacterId, toCharacterId },
        orderBy: { fromChapter: "asc" },
      });
      const records: StanceRecord[] = rows.map((row) => ({
        id: row.id,
        fromCharacterId: row.fromCharacterId,
        toCharacterId: row.toCharacterId,
        stance: row.stance as RelationshipStance,
        fromChapter: row.fromChapter,
        toChapter: row.toChapter,
      }));
      // stanceSince returns only the chapter; the stance itself comes from
      // stanceAt, so the pair is what makes the turn legible as a dated
      // event rather than an impression.
      const sinceChapter = stanceSince(records, fromCharacterId, toCharacterId, chapter);
      if (sinceChapter === null) return null;
      const held = stanceAt(records, fromCharacterId, toCharacterId, chapter);
      // stanceSince is non-null exactly when stanceAt is, so `held` is too.
      if (held === null) return null;
      return { stance: held.stance, sinceChapter };
    },

    // --- Bond structures (the monogamy / harem / polygamy scenario) -------

    async createBond({ actorUserId, workspaceId, novelId, structure, memberIds, fromChapter, toChapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await requireCharacters(memberIds, novelId, workspaceId);

      if (fromChapter < 1 || (toChapter !== null && toChapter <= fromChapter)) {
        throw new ConflictError(`window [${fromChapter}, ${toChapter}) is empty or inverted`);
      }

      // TOO_MANY_MEMBERS and DUPLICATE_MEMBER are single-bond facts, but
      // EXCLUSIVITY_CONFLICT is a fact about the SET — a member of two
      // concurrent MONOGAMY bonds. So the candidate is validated against
      // every bond already in the novel, not on its own.
      const existing = await db.bond.findMany({
        where: { novelId, workspaceId },
        select: {
          id: true, novelId: true, structure: true, fromChapter: true, toChapter: true,
          members: { select: { characterId: true } },
        },
      });
      const candidate: Bond = { id: "candidate", structure, memberIds, fromChapter, toChapter };
      const failures = validateBondStructures([...existing.map(toBondView), candidate]).errors
        .filter((e) => e.bondId === "candidate");
      if (failures.length > 0) {
        throw new ConflictError(failures.map((f) => f.message).join("; "));
      }

      const created = await db.bond.create({
        data: {
          workspaceId,
          novelId,
          structure,
          fromChapter,
          toChapter,
          createdById: actorUserId,
          members: { create: [...new Set(memberIds)].map((characterId) => ({ characterId })) },
        },
        select: {
          id: true, novelId: true, structure: true, fromChapter: true, toChapter: true,
          members: { select: { characterId: true } },
        },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "relationship.bond-created",
        entityType: "Bond",
        entityId: created.id,
        payload: { structure, memberCount: memberIds.length, fromChapter },
      });
      return toBondView(created);
    },

    async listBonds({ actorUserId, workspaceId, novelId, take, skip }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.bond.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
        take,
        skip,
        select: {
          id: true, novelId: true, structure: true, fromChapter: true, toChapter: true,
          members: { select: { characterId: true } },
        },
      });
      return rows.map(toBondView);
    },

    async deleteBond({ actorUserId, workspaceId, novelId, bondId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      // Members, transitions and interactions all cascade. Deleting a bond
      // removes its recorded history; the route requires the caller to have
      // read it first.
      const deleted = await db.bond.deleteMany({ where: { id: bondId, novelId, workspaceId } });
      if (deleted.count === 0) throw new NotFoundError("bond");
      await audit.record({
        actorUserId,
        workspaceId,
        action: "relationship.bond-deleted",
        entityType: "Bond",
        entityId: bondId,
      });
    },

    // --- Bond lifecycle ---------------------------------------------------

    async addTransition({ actorUserId, workspaceId, novelId, bondId, chapter, stage, kind }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const bond = await db.bond.findFirst({
        where: { id: bondId, novelId, workspaceId },
        select: { id: true },
      });
      if (!bond) throw new NotFoundError("bond");

      const existing = await db.bondTransition.findMany({
        where: { bondId },
        orderBy: { chapter: "asc" },
        select: { id: true, chapter: true, stage: true, kind: true },
      });
      const baseline: BondTransition[] = existing.map((row) => ({
        id: row.id,
        chapter: row.chapter,
        stage: row.stage as BondStage,
        kind: row.kind as BondTransitionKind,
      }));
      const candidate: BondTransition = { id: "candidate", chapter, stage, kind };

      // Same baseline-diff discipline as character arcs: validate the
      // sorted set both with and without the candidate, and act only on the
      // errors the candidate introduced. MISLABELED_REGRESSION is the rule
      // with teeth — a quiet rewind recorded as ADVANCE is invisible
      // without it.
      const sorted = [...baseline, candidate].sort((a, b) => a.chapter - b.chapter);
      const before = new Set(
        validateBondLifecycle(baseline).errors.map((e) => `${e.kind}:${e.message}`),
      );
      const failures = validateBondLifecycle(sorted).errors.filter(
        (e) => !before.has(`${e.kind}:${e.message}`),
      );
      if (failures.length > 0) {
        throw new ConflictError(failures.map((f) => f.message).join("; "));
      }

      let created;
      try {
        created = await db.bondTransition.create({
          data: { bondId, chapter, stage, kind },
        });
      } catch (error) {
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError(`this bond already has a transition at chapter ${chapter}`);
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "relationship.transition-recorded",
        entityType: "BondTransition",
        entityId: created.id,
        payload: { bondId, chapter, stage, kind },
      });
      return {
        id: created.id,
        bondId: created.bondId,
        chapter: created.chapter,
        stage: created.stage as BondStage,
        kind: created.kind as BondTransitionKind,
      };
    },

    async listTransitions({ actorUserId, workspaceId, novelId, bondId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const bond = await db.bond.findFirst({
        where: { id: bondId, novelId, workspaceId },
        select: { id: true },
      });
      if (!bond) throw new NotFoundError("bond");
      const rows = await db.bondTransition.findMany({
        where: { bondId },
        orderBy: { chapter: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        bondId: row.bondId,
        chapter: row.chapter,
        stage: row.stage as BondStage,
        kind: row.kind as BondTransitionKind,
      }));
    },

    async bondStageAt({ actorUserId, workspaceId, novelId, bondId, chapter }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const bond = await db.bond.findFirst({
        where: { id: bondId, novelId, workspaceId },
        select: { id: true },
      });
      if (!bond) throw new NotFoundError("bond");
      const rows = await db.bondTransition.findMany({
        where: { bondId },
        orderBy: { chapter: "asc" },
      });
      return bondStageAt(
        rows.map((row) => ({
          id: row.id,
          chapter: row.chapter,
          stage: row.stage as BondStage,
          kind: row.kind as BondTransitionKind,
        })),
        chapter,
      );
    },

    // --- Meaningful interaction -------------------------------------------

    async recordInteraction({ actorUserId, workspaceId, novelId, bondId, chapter, weight, summary }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const bond = await db.bond.findFirst({
        where: { id: bondId, novelId, workspaceId },
        select: { id: true },
      });
      if (!bond) throw new NotFoundError("bond");
      // The DB CHECK is the backstop; this is the message the caller reads.
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new ConflictError(`weight ${weight} is outside 0..1`);
      }
      const created = await db.meaningfulInteraction.create({
        data: { workspaceId, bondId, chapter, weight, summary },
      });
      await audit.record({
        actorUserId,
        workspaceId,
        action: "relationship.interaction-recorded",
        entityType: "MeaningfulInteraction",
        entityId: created.id,
        payload: { bondId, chapter, weight },
      });
      return {
        id: created.id,
        bondId: created.bondId,
        chapter: created.chapter,
        weight: created.weight,
        summary: created.summary,
      };
    },

    async neglectReport({ actorUserId, workspaceId, novelId, bondId, chapter, maxGap }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const bond = await db.bond.findFirst({
        where: { id: bondId, novelId, workspaceId },
        select: { id: true },
      });
      if (!bond) throw new NotFoundError("bond");
      const rows = await db.meaningfulInteraction.findMany({
        where: { bondId },
        select: { id: true, chapter: true, weight: true },
      });
      // A bond with no interaction at all reports neglected: false — the
      // engine does not accuse an author of neglecting a thread they have
      // not started.
      return neglectReport(
        rows.map((row) => ({ id: row.id, chapter: row.chapter, weight: row.weight })),
        chapter,
        maxGap,
      );
    },
  };
}
