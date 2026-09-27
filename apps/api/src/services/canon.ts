/**
 * Story intelligence (Phase 6): canon, candidate canon, and the Story Brain.
 *
 * Canon is the source of story truth (CLAUDE.md §2.1). Two rules shape every
 * method here:
 *
 * 1. **Nothing becomes canon silently.** An AI-generated or proposed claim
 *    lands in `canon_proposals` and stays there until a `canon:approve`
 *    actor decides it (§2.13). There is no path that writes an ACTIVE fact
 *    from a proposal without a decision.
 * 2. **One live value per subject and predicate, enforced by the database.**
 *    A conflicting claim cannot be inserted at all — `canon_facts_live` is a
 *    partial unique index (ADR-0008 §1), so a contradiction surfaces as a
 *    409 rather than coexisting as two "truths" (§4/§5).
 *
 * The pure rules — subject keys, classification, answer basis, span
 * verification — live in @novelforge/story-intelligence and are imported,
 * never reimplemented. This module is the IO half: it resolves scope from
 * stored rows, runs the transactions, and writes the audit trail.
 */
import type { NovelForgeDb, CanonFactStatus } from "@novelforge/database";
import {
  can,
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import {
  answerBasis,
  canonBoundary,
  canonicalSubjectKey,
  classifyProposal,
  edgeRequiresApproval,
  isPromiseOpen,
  isThreadUnresolved,
  narrativeDebt,
  readerVisible,
  resolveObject,
  sameObject,
  verifySpan,
  type ClaimBasis,
  type ClaimObject,
  type ConflictKind,
  type DebtItem,
  type Evidence,
} from "@novelforge/story-intelligence";
import { canView, parseViewMode, type ViewMode } from "@novelforge/retrieval";
import { ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";
import type { RetrievalServices } from "./retrieval.ts";

export const STORY_ENTITY_KINDS = [
  "CHARACTER",
  "LOCATION",
  "ORGANIZATION",
  "FACTION",
  "ITEM",
  "RESOURCE",
  "CONCEPT",
] as const;
export type StoryEntityKindValue = (typeof STORY_ENTITY_KINDS)[number];

/**
 * The question forms the Brain answers (STORY-INTELLIGENCE.md:5-8).
 *
 * EVENT/CAUSAL answer "what happened and why" from story_events and
 * causal_edges; UNRESOLVED/PROMISES answer "what still owes the reader"
 * from story_threads and story_promises, ranked by narrative debt.
 * All four boundaries follow the same deny-by-default rules as FACT/STATE:
 * an unanchored or withheld row is absent, never visible.
 */
export const QUESTION_KINDS = [
  "FACT",
  "STATE",
  "RETRIEVAL",
  "EVENT",
  "CAUSAL",
  "UNRESOLVED",
  "PROMISES",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Question kinds the Brain answers (all of them, since slice 2). */
export const ANSWERABLE_KINDS: readonly QuestionKind[] = QUESTION_KINDS;

/**
 * The fact shape every read path returns. One object, used by the plain list
 * and the READER-filtered list, so the two cannot drift apart.
 */
const FACT_LIST_SELECT = {
  id: true,
  entityId: true,
  predicate: true,
  statement: true,
  objectText: true,
  objectEntityId: true,
  status: true,
  validFromChapter: true,
  validUntilChapter: true,
  availableFromChapter: true,
  supersededById: true,
  sources: {
    select: {
      sourceKind: true,
      quote: true,
      start: true,
      end: true,
      chapterVersionId: true,
      referenceVersionId: true,
    },
  },
} as const;

export interface FactListResult {
  facts: Array<{
    id: string;
    entityId: string;
    predicate: string;
    statement: string;
    objectText: string | null;
    objectEntityId: string | null;
    status: string;
    validFromChapter: number | null;
    validUntilChapter: number | null;
    availableFromChapter: number | null;
    /**
     * ABSENT in READER mode, for the same reason `sources` is: the id names
     * the replacement, and the replacement may sit behind a boundary the
     * reader has not reached — an id alone confirms a future fact exists,
     * which is the existence oracle this branch refuses everywhere else.
     * `status` already tells the reader the claim was superseded.
     */
    supersededById?: string | null;
    /**
     * Evidence spans. PRESENT for AUTHOR/EDITOR, ABSENT for READER — a
     * source's quote is raw chapter or reference text and neither version
     * table carries a spoiler boundary, so a reader-facing list omits them
     * rather than trying to gate text it cannot classify.
     */
    sources?: Array<{
      sourceKind: string;
      quote: string;
      start: number;
      end: number;
      chapterVersionId: string | null;
      referenceVersionId: string | null;
    }>;
  }>;
  /**
   * How many rows the READER boundary withheld, for AUTHOR/EDITOR only.
   * ALWAYS 0 in READER mode: the count is an existence oracle — a reader
   * seeing `withheldCount: 1` learns a claim exists that they may not read,
   * which is exactly the "no such fact" / "not yet visible" distinction the
   * Brain refuses to make. It is kept for authors, where no boundary applies
   * and the number is a genuine drift signal.
   */
  withheldCount: number;
}

export interface EvidenceView {
  kind: Evidence["kind"];
  /** Set for CANON_FACT. */
  factId?: string;
  status?: string;
  /** Set for CHAPTER / REFERENCE_CHUNK. */
  excerpt?: string;
  start?: number;
  end?: number;
  chapterVersionId?: string;
  chapterNumber?: number;
  referenceVersionId?: string;
  /** Set for CANDIDATE. */
  proposalId?: string;
}

export type BrainAnswer =
  | {
      kind: "FACT" | "STATE";
      answered: true;
      /** Null when the subject+predicate is not known to the story. */
      claim: {
        factId: string;
        statement: string;
        entityKey: string;
        predicate: string;
        object: ClaimObject | null;
        status: string;
        validFromChapter: number | null;
        validUntilChapter: number | null;
      } | null;
      basis: ClaimBasis | null;
      /** "no evidence found" — NOT "false". */
      insufficient: boolean;
      evidence: EvidenceView[];
      /** Facts read for an as-of answer but outside the window. */
      notYetTrue: { factId: string; validFromChapter: number | null }[];
    }
  | {
      kind: "RETRIEVAL";
      answered: true;
      hits: Array<{
        referenceVersionId: string;
        title: string;
        text: string;
        start: number;
        end: number;
        score: number;
      }>;
      /** Null when the answer has no evidence — the same representation FACT and STATE use. */
      basis: ClaimBasis | null;
      insufficient: boolean;
      /** Which legs ran. A search that lost every leg 502s instead of answering. */
      retrievers: string[];
      withheldCount: number;
    }
  | {
      kind: "EVENT";
      answered: true;
      events: Array<{
        eventId: string;
        description: string;
        chapterId: string | null;
        /** Reader anchor: null means unanchored, i.e. never reader-visible. */
        availableFromChapter: number | null;
      }>;
      basis: ClaimBasis | null;
      insufficient: boolean;
      /** Authors only: rows withheld from the current view. 0 in READER mode. */
      withheldCount: number;
    }
  | {
      kind: "CAUSAL";
      answered: true;
      edges: Array<{
        edgeId: string;
        cause: { eventId: string; description: string; availableFromChapter: number | null };
        effect: { eventId: string; description: string; availableFromChapter: number | null };
        confidence: "EXPLICIT" | "INFERRED" | "SPECULATIVE";
      }>;
      basis: ClaimBasis | null;
      insufficient: boolean;
      /** Authors only: edges hidden because a side of the chain is not visible. 0 in READER mode. */
      withheldCount: number;
    }
  | {
      kind: "UNRESOLVED" | "PROMISES";
      answered: true;
      /**
       * Ranked by narrative debt (importance × urgency × age), descending.
       * Closed items score 0 and sink but stay in the list so the caller can
       * display the full ledger; filter on debt > 0 for the urgent view.
       */
      items: Array<{
        id: string;
        kind: "THREAD" | "PROMISE";
        /** THREAD title / PROMISE description. */
        title: string;
        /** THREAD: ACTIVE/DORMANT/RESOLVED. PROMISE: SETUP..INVALIDATED. */
        status: string;
        importance: number;
        /** Debt = importance × urgency × (10 + ageChapters); 0 when closed. */
        debt: number;
        introducedAtChapter: number | null;
        resolvedOrPayoffAtChapter: number | null;
      }>;
      basis: ClaimBasis | null;
      insufficient: boolean;
      /** Authors only: rows hidden from the current view. 0 in READER mode. */
      withheldCount: number;
    };

export interface CanonServices {
  createEntity(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    kind: StoryEntityKindValue;
    name: string;
    key?: string;
  }): Promise<{ id: string; key: string }>;

  listEntities(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    kind?: StoryEntityKindValue;
  }): Promise<
    Array<{ id: string; kind: string; key: string; name: string }>
  >;

  createFact(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    entityId: string;
    predicate: string;
    objectEntityId?: string | null;
    objectText?: string | null;
    statement?: string;
    validFromChapter?: number | null;
    validUntilChapter?: number | null;
    availableFromChapter?: number | null;
    source?: {
      chapterVersionId?: string | null;
      referenceVersionId?: string | null;
      quote: string;
      start: number;
      end: number;
    } | null;
  }): Promise<{ id: string }>;

  /**
   * Withdraw a live fact. The row survives with status RETRACTED, so the
   * claim is still in the record and its sources still resolve — but it no
   * longer holds, and because canon_facts_live is anchored on
   * `status = 'ACTIVE'` the slot frees up for a different value to be
   * asserted. That is the whole reason the index is anchored on status
   * rather than on `superseded_by_id IS NULL` (ADR-0008 §1): a
   * supersede-anchored index would trap the subject permanently, since
   * retraction sets no successor.
   */
  retractFact(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    factId: string;
    reason?: string;
  }): Promise<void>;

  /**
   * Remove one citation from a fact.
   *
   * This is the other half of the evidence FKs being RESTRICT: without it, a
   * chapter cited as evidence could never be deleted, because nothing could
   * remove the citation blocking it. The fact keeps its other sources, and a
   * fact with no sources left still stands (its claim was approved on its own
   * merits) — but it stops claiming support it can no longer show.
   */
  unlinkSource(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    factId: string;
    sourceId: string;
  }): Promise<void>;

  proposeCandidate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    entityId: string;
    predicate: string;
    objectEntityId?: string | null;
    objectText?: string | null;
    statement?: string;
    /** When the claim becomes true in-story; closed onto the superseded fact. */
    validFromChapter?: number | null;
  }): Promise<{
    id: string;
    status: string;
    conflictKind: ConflictKind | null;
    conflictsWithFactId: string | null;
  }>;

  listProposals(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    status?: "PROPOSED" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  }): Promise<
    Array<{
      id: string;
      entityId: string;
      predicate: string;
      statement: string;
      status: string;
      conflictKind: ConflictKind | null;
      conflictsWithFactId: string | null;
      canonFactId: string | null;
    }>
  >;

  approveProposal(input: {
    actorUserId: string;
    workspaceId: string;
    proposalId: string;
    availableFromChapter?: number | null;
  }): Promise<{ canonFactId: string; supersededFactId: string | null }>;

  rejectProposal(input: {
    actorUserId: string;
    workspaceId: string;
    proposalId: string;
    note?: string;
  }): Promise<void>;

  listFacts(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    entityId?: string;
    predicate?: string;
    includeSuperseded?: boolean;
    /** READER mode applies the spoiler boundary; AUTHOR/EDITOR see everything. */
    mode?: unknown;
    readerChapter?: number;
  }): Promise<FactListResult>;

  ask(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    question:
      | { kind: "FACT"; entityId: string; predicate: string }
      | { kind: "STATE"; entityId: string; predicate: string; atChapter: number }
      | { kind: "RETRIEVAL"; query: string }
      | { kind: "EVENT" | "CAUSAL" | "UNRESOLVED" | "PROMISES" };
    mode?: unknown;
    readerChapter?: number;
  }): Promise<BrainAnswer>;
}

export function createCanonServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
  retrieval: RetrievalServices;
  /**
   * Raw error sink. Used where a constraint rejects a write: the client gets
   * a mapped 409, and the operator gets the constraint name the 409 cannot
   * carry.
   */
  dbg?: { error?: (message: string, meta: unknown) => void };
}): CanonServices {
  const { db, audit, retrieval, dbg } = deps;

  /**
   * Membership gate. Missing membership is a 404, not a 403 — the caller
   * must not learn whether a foreign workspace exists (ADR-0004).
   */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
  }

  /** Scope a proposal through its stored row, never through the URL. */
  async function gateProposal(
    workspaceId: string,
    proposalId: string,
    userId: string,
    cap: Capability,
  ) {
    const proposal = await db.canonProposal.findFirst({
      where: { id: proposalId, workspaceId },
      include: {
        entity: { select: { id: true, key: true, novelId: true } },
      },
    });
    // Same 404 for "missing", "another workspace", and "another novel":
    // a distinct error would confirm the row exists somewhere.
    if (!proposal) throw new NotFoundError("proposal");
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("proposal");
    requireCapability(membership.role, cap);
    return proposal;
  }

  /** Load an entity, proving it belongs to this novel. */
  async function entityOr404(entityId: string, novelId: string, workspaceId: string) {
    const entity = await db.storyEntity.findFirst({
      where: { id: entityId, novelId, novel: { workspaceId } },
      select: { id: true, key: true, name: true },
    });
    if (!entity) throw new NotFoundError("entity");
    return entity;
  }

  function objectOr400(input: {
    objectEntityId?: string | null;
    objectText?: string | null;
  }): ClaimObject {
    const resolved = resolveObject(input);
    if (!resolved.ok) {
      // The database CHECK is the authority; this is the clear 400 that
      // saves a 500 from a constraint violation.
      throw new ConflictError(`claim object is ${resolved.reason.toLowerCase()}`);
    }
    return resolved.object;
  }

  /**
   * The live fact for a subject and predicate, if any.
   *
   * `canon_facts_live` guarantees at most one ACTIVE row per
   * (novel, entity, predicate), so findFirst is exact rather than
   * arbitrary.
   */
  async function liveFactFor(novelId: string, entityId: string, predicate: string) {
    const row = await db.canonFact.findFirst({
      where: { novelId, entityId, predicate, status: "ACTIVE" },
      select: { id: true, objectEntityId: true, objectText: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      object: (row.objectEntityId !== null
        ? { objectEntityId: row.objectEntityId }
        : { objectText: row.objectText ?? "" }) as ClaimObject,
    };
  }

  /**
   * A display rendering, used only when the caller did not supply one.
   *
   * Takes DISPLAY names, never machine keys or ids: `statement` is documented
   * as the human-readable form, and an earlier version rendered "ling-fan
   * father-of wei-zhao" (and a raw uuid when the target name was missing),
   * which is not a sentence anyone can read. The structured columns stay
   * authoritative — this is never parsed back.
   */
  function renderStatement(
    subjectName: string,
    predicate: string,
    object: ClaimObject,
    objectName?: string | null,
  ): string {
    const value =
      object.objectEntityId !== undefined
        ? (objectName ?? "(unknown entity)")
        : object.objectText;
    return `${subjectName} ${predicate} ${value}`;
  }

  return {
    async createEntity({ actorUserId, workspaceId, novelId, kind, name, key }) {
      await gate(workspaceId, novelId, actorUserId, "canon:manage");
      const trimmed = name.trim();
      if (trimmed === "") throw new ConflictError("entity name is empty");
      const resolvedKey = key?.trim() || canonicalSubjectKey(trimmed);
      if (resolvedKey === "") throw new ConflictError("entity key is empty");

      const existing = await db.storyEntity.findUnique({
        where: { novelId_key: { novelId, key: resolvedKey } },
        select: { id: true, key: true, kind: true },
      });
      // Idempotent: naming a thing that is already named returns the
      // existing identity rather than a 409. Creating an entity commits no
      // story truth (ADR-0008 §5), so there is nothing to protect here.
      if (existing) {
        // ...except identity itself. The key is derived from the name, so two
        // different callers can land on the same key with different kinds
        // ("River" as a LOCATION vs a CHARACTER). Silently returning the
        // stored row would answer 201 to a request that asked for a kind the
        // caller did not get, and the mismatch would only surface later as a
        // fact attached to the wrong sort of thing.
        if (existing.kind !== kind) {
          throw new ConflictError(
            `"${resolvedKey}" already exists as a ${existing.kind.toLowerCase()}`,
          );
        }
        return { id: existing.id, key: existing.key };
      }

      // The findUnique above read in a different statement, so two concurrent
      // creates for the same derived key both pass it and the loser violates
      // story_entities_novel_id_key_key. That is the same create-race the
      // platform service maps on its own slug/key creates (platform.ts
      // isUniqueViolation → ConflictError); without it the loser got a bare
      // INTERNAL 500, contradicting this function's own idempotence contract.
      // Re-read rather than assume: the winner may hold a different kind,
      // which is the 409 branch above.
      let created: { id: string; key: string };
      try {
        created = await db.storyEntity.create({
          data: {
            novelId,
            kind,
            key: resolvedKey,
            name: trimmed,
            createdById: actorUserId,
          },
          select: { id: true, key: true },
        });
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2002") throw e;
        const won = await db.storyEntity.findUnique({
          where: { novelId_key: { novelId, key: resolvedKey } },
          select: { id: true, key: true, kind: true },
        });
        // No audit line here: this caller created nothing, and recording one
        // would attribute the winner's entity to them.
        if (won && won.kind === kind) return { id: won.id, key: won.key };
        if (won) {
          throw new ConflictError(
            `"${resolvedKey}" already exists as a ${won.kind.toLowerCase()}`,
          );
        }
        // The winner rolled back after our collision — a retry, not a claim
        // about what is stored.
        throw new ConflictError(
          "this entity was created concurrently; retry the request",
        );
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.entity-created",
        entityType: "StoryEntity",
        entityId: created.id,
        payload: { novelId, kind, key: resolvedKey },
      });
      return created;
    },

    async listEntities({ actorUserId, workspaceId, novelId, kind }) {
      await gate(workspaceId, novelId, actorUserId, "canon:read");
      const rows = await db.storyEntity.findMany({
        where: { novelId, novel: { workspaceId }, ...(kind ? { kind } : {}) },
        orderBy: [{ kind: "asc" }, { key: "asc" }],
        select: { id: true, kind: true, key: true, name: true },
      });
      return rows;
    },

    async createFact(input) {
      const { actorUserId, workspaceId, novelId, entityId, predicate } = input;
      await gate(workspaceId, novelId, actorUserId, "canon:manage");
      const entity = await entityOr404(entityId, novelId, workspaceId);
      const object = objectOr400(input);
      const trimmedPredicate = predicate.trim();
      if (trimmedPredicate === "") throw new ConflictError("predicate is empty");

      // An entity-valued object must exist in the same novel.
      let objectName: string | null = null;
      if (object.objectEntityId !== undefined) {
        const target = await entityOr404(object.objectEntityId, novelId, workspaceId);
        objectName = target.name;
      }

      // Validate any evidence span BEFORE writing: an unverifiable quote
      // must never be stored as proof (a citation pointing at the wrong
      // text is worse than no citation).
      let sourceRow: {
        sourceKind: "CHAPTER" | "REFERENCE";
        chapterVersionId: string | null;
        referenceVersionId: string | null;
        quote: string;
        start: number;
        end: number;
      } | null = null;
      if (input.source) {
        sourceRow = await resolveSourceEvidence(input.source, workspaceId, novelId);
      }

      const statement =
        input.statement?.trim() ||
        renderStatement(entity.name, trimmedPredicate, object, objectName);

      const createdId = await db
        .$transaction(async (tx) => {
          const fact = await tx.canonFact.create({
            data: {
              workspaceId,
              novelId,
              entityId,
              predicate: trimmedPredicate,
              objectEntityId: object.objectEntityId ?? null,
              objectText: object.objectText ?? null,
              statement,
              validFromChapter: input.validFromChapter ?? null,
              validUntilChapter: input.validUntilChapter ?? null,
              availableFromChapter: input.availableFromChapter ?? null,
              createdById: actorUserId,
            },
            select: { id: true },
          });
          if (sourceRow) {
            await tx.canonFactSource.create({
              data: { canonFactId: fact.id, ...sourceRow, createdById: actorUserId },
            });
          }
          return fact.id;
        })
        .catch((e: unknown) => {
          const code = (e as { code?: string })?.code;
          // The partial unique index raises P2002 when a live fact already
          // exists for this subject and predicate. That is the conflict
          // rule working, not a bug — surface it as a 409 naming the fix.
          if (code === "P2002") {
            throw new ConflictError(
              "a live fact already exists for this subject and predicate — supersede it or propose a candidate",
            );
          }
          // P2039 is the driver-adapter code for a raw Postgres constraint
          // error (23514 CHECK). The window ordering is guarded in the route
          // schema, but object-exactly-one and the span CHECKs also land
          // here, and an unguarded one must not read as a server fault.
          if (code === "P2039" || code === "P2004" || code === "P2003") {
            dbg?.error?.("canon fact rejected by a constraint", { err: e });
            throw new ConflictError(
              "this claim cannot be stored as written — check the claim object and any evidence span",
            );
          }
          throw e;
        });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.fact-created",
        entityType: "CanonFact",
        entityId: createdId,
        payload: { novelId, entityId, predicate: trimmedPredicate },
      });
      return { id: createdId };
    },

    async retractFact({ actorUserId, workspaceId, novelId, factId, reason }) {
      await gate(workspaceId, novelId, actorUserId, "canon:manage");
      // Scope through the stored row: a fact id from another workspace must
      // 404 exactly as a nonexistent one does (ADR-0008 §6).
      const fact = await db.canonFact.findFirst({
        where: { id: factId, novelId, workspaceId },
        select: { id: true, status: true, entityId: true, predicate: true },
      });
      if (!fact) throw new NotFoundError("canon fact");
      if (fact.status !== "ACTIVE") {
        throw new ConflictError(`fact is already ${fact.status.toLowerCase()}`);
      }
      // Status is the only column that changes. `valid_until_chapter` is left
      // alone: it dates when the claim stopped being TRUE in-story, which
      // retraction does not decide — the claim may never have been true, or
      // may still be true and merely withdrawn from canon. Writing a chapter
      // here would assert a story fact the author did not.
      //
      // Compare-and-set, for the same reason the proposal decisions are: the
      // guard above read a status in a different statement. Without the
      // predicate a concurrent approve can supersede this row between the
      // read and the write, and the write then lands RETRACTED on a row the
      // supersede already closed — a state ADR-0008 §1 says cannot exist
      // (retraction sets no supersededById), leaving a withdrawn fact linked
      // to a successor that replaced it.
      const retracted = await db.canonFact.updateMany({
        where: { id: fact.id, status: "ACTIVE" },
        data: { status: "RETRACTED" },
      });
      if (retracted.count === 0) {
        throw new ConflictError("this fact was already superseded or withdrawn");
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.fact-retracted",
        entityType: "CanonFact",
        entityId: fact.id,
        payload: {
          novelId,
          entityId: fact.entityId,
          predicate: fact.predicate,
          reason: reason ?? null,
        },
      });
    },

    async unlinkSource({ actorUserId, workspaceId, novelId, factId, sourceId }) {
      await gate(workspaceId, novelId, actorUserId, "canon:manage");
      // Scope BOTH rows through their stored owners, so neither a foreign
      // fact id nor a source id belonging to another fact can be used to
      // delete something the caller cannot see. A single deleteMany with both
      // conditions does that in one statement.
      const removed = await db.canonFactSource.deleteMany({
        where: {
          id: sourceId,
          canonFactId: factId,
          canonFact: { novelId, workspaceId },
        },
      });
      if (removed.count === 0) throw new NotFoundError("evidence");
      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.source-unlinked",
        entityType: "CanonFactSource",
        entityId: sourceId,
        payload: { novelId, factId },
      });
    },

    async proposeCandidate(input) {
      const { actorUserId, workspaceId, novelId, entityId, predicate } = input;
      await gate(workspaceId, novelId, actorUserId, "canon:manage");
      const entity = await entityOr404(entityId, novelId, workspaceId);
      const object = objectOr400(input);
      const trimmedPredicate = predicate.trim();
      if (trimmedPredicate === "") throw new ConflictError("predicate is empty");

      let objectName: string | null = null;
      if (object.objectEntityId !== undefined) {
        const target = await entityOr404(object.objectEntityId, novelId, workspaceId);
        objectName = target.name;
      }

      const live = await liveFactFor(novelId, entityId, trimmedPredicate);
      const classified = classifyProposal(object, live);

      // A duplicate asserts nothing new. Storing it as a proposal would be
      // actively harmful: an approval gate keyed on "no conflict recorded"
      // would treat it as fresh and hit the unique index. Reject it here,
      // where the message can say why.
      if (classified.class === "DUPLICATE") {
        throw new ConflictError(
          "this claim is already canon for that subject and predicate",
        );
      }

      const statement =
        input.statement?.trim() ||
        renderStatement(entity.name, trimmedPredicate, object, objectName);

      const created = await db.canonProposal.create({
        data: {
          workspaceId,
          novelId,
          entityId,
          predicate: trimmedPredicate,
          objectEntityId: object.objectEntityId ?? null,
          objectText: object.objectText ?? null,
          statement,
          validFromChapter: input.validFromChapter ?? null,
          // CONFLICT is a flag, not a status (ADR-0008 §3): the proposal
          // stays PROPOSED and awaits a human either way.
          conflictKind:
            classified.class === "FUNCTIONAL_CONFLICT" ? "FUNCTIONAL_CONFLICT" : null,
          conflictsWithFactId:
            classified.class === "FUNCTIONAL_CONFLICT" ? classified.liveFactId : null,
          status: "PROPOSED",
          proposedById: actorUserId,
        },
        select: { id: true, status: true, conflictKind: true, conflictsWithFactId: true },
      });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.proposal-created",
        entityType: "CanonProposal",
        entityId: created.id,
        payload: {
          novelId,
          entityId,
          predicate: trimmedPredicate,
          conflictKind: created.conflictKind,
        },
      });
      return created;
    },

    async listProposals({ actorUserId, workspaceId, novelId, status }) {
      await gate(workspaceId, novelId, actorUserId, "canon:read");
      return db.canonProposal.findMany({
        where: { novelId, workspaceId, status: status ?? "PROPOSED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          predicate: true,
          statement: true,
          status: true,
          conflictKind: true,
          conflictsWithFactId: true,
          canonFactId: true,
        },
      });
    },

    async approveProposal({ actorUserId, workspaceId, proposalId, availableFromChapter }) {
      const proposal = await gateProposal(
        workspaceId,
        proposalId,
        actorUserId,
        "canon:approve",
      );
      const novelId = proposal.entity.novelId;

      if (proposal.status !== "PROPOSED") {
        throw new ConflictError(`proposal is already ${proposal.status.toLowerCase()}`);
      }

      const result = await db
        .$transaction(async (tx) => {
          // ADR-0008 §2. The order is load-bearing and every statement is
          // satisfiable on its own at the moment it runs:
          //
          //  1. SUPERSEDE — the old row leaves canon_facts_live while it
          //     still has a NULL superseded_by_id, so no FK value is needed
          //     yet.
          //  2. INSERT — the new row enters the index; the slot is now free.
          //  3. LINK — both rows exist, so the self-FK can be satisfied.
          //  4. DECIDE — the proposal records the fact it minted.
          //
          // The two-statement orders both fail: UPDATE-then-INSERT cannot
          // point at a row that does not exist yet (23503), and
          // INSERT-then-UPDATE collides on the partial index (23505). Both
          // were verified against PostgreSQL before this was written.
          const priorLive = await tx.canonFact.findFirst({
            where: {
              novelId,
              entityId: proposal.entityId,
              predicate: proposal.predicate,
              status: "ACTIVE",
            },
            select: {
              id: true,
              validFromChapter: true,
              validUntilChapter: true,
              objectEntityId: true,
              objectText: true,
            },
          });

          // Re-classify against canon as it stands NOW, not as it stood when
          // the proposal was filed. Nothing stops two proposals for the same
          // subject and predicate from coexisting — and they should, an
          // author weighing alternatives is a normal flow — so the decision
          // point is the only place this can be settled. Without the check,
          // approving a claim identical to the live one supersedes a fact
          // with a copy of itself: canon records a correction that changed
          // nothing, the supersede chain gains a phantom link, and every
          // as-of query for that subject shifts. A live fact that was created
          // AFTER the proposal was filed is exactly the case proposeCandidate
          // could not have seen.
          if (priorLive) {
            const proposalObject: ClaimObject =
              proposal.objectEntityId !== null
                ? { objectEntityId: proposal.objectEntityId }
                : { objectText: proposal.objectText ?? "" };
            const liveObject: ClaimObject =
              priorLive.objectEntityId !== null
                ? { objectEntityId: priorLive.objectEntityId }
                : { objectText: priorLive.objectText ?? "" };
            if (sameObject(proposalObject, liveObject)) {
              throw new ConflictError(
                "this claim is already canon for that subject and predicate",
              );
            }
          }

          // A supersede needs a date to be reconstructable. The replacement's
          // chapter is what closes the old window, so without one there is no
          // chapter that separates the two values and the old one becomes
          // unreachable at EVERY as-of point — including chapters before it
          // changed. Closing at the old row's own start does not save it: the
          // undated replacement covers from -infinity, so it shadows the old
          // value everywhere anyway. That is history destroyed by omission,
          // and the field being optional is what makes it the common path.
          // Refused at the boundary (CLAUDE.md §15) rather than guessed at.
          if (priorLive && proposal.validFromChapter === null) {
            throw new ConflictError(
              "a superseding claim needs validFromChapter — without it the value it replaces cannot be reconstructed as of any chapter",
            );
          }

          let supersededFactId: string | null = null;
          if (priorLive) {
            // (1) Close the old fact's window so an as-of query can tell the
            // two values apart.
            //
            // The close point is `max(replacement start, old start)`:
            //
            //   - Replacement later than the old claim (the ordinary case:
            //     old was true from 10, corrected to be true from 20). Close
            //     at 20, so the old value is reconstructable for 10..19.
            //   - Replacement BACKDATED (true from 5, replacing a claim that
            //     started at 10). Closing at 5 would give the old row
            //     `valid_until < valid_from`, which the
            //     CanonFact_valid_window_ordered CHECK rejects — the whole
            //     approval failed with an opaque 500. A backdated correction
            //     means the old claim never held, so close at 10: an empty
            //     window, which is the truthful answer.
            //
            // The undated replacement is refused above rather than closed
            // here, and the both-null case is now unreachable: `priorLive`
            // means a live fact exists, and a live fact without a start
            // chapter could only have been superseded by a dated proposal.
            // So `closeAt` is never null on this path.
            // A fact may carry an AUTHORED end of window — a claim the author
            // stated held only for a span, e.g. "black 1..9". The correction
            // may SHORTEN that window but never lengthen it. Closing at the
            // authored end alone is wrong when the replacement starts INSIDE
            // the span: the old row would claim black held at 5..8 while the
            // ACTIVE row answers white there — window metadata and every
            // as-of query disagreeing. So the close point is the earlier of
            // the authored end and the start-derived close: a ch-20
            // correction leaves [1,9) alone, a ch-5 correction shortens it
            // to [1,5). Only an open end is closed by the replacement
            // outright. (min never dips below the old start: both operands
            // are >= it, so the CHECK keeps holding.)
            const startClose =
              proposal.validFromChapter === null
                ? priorLive.validFromChapter
                : priorLive.validFromChapter === null
                  ? proposal.validFromChapter
                  : Math.max(proposal.validFromChapter, priorLive.validFromChapter);
            const closeAt =
              priorLive.validUntilChapter === null
                ? startClose
                : startClose === null || startClose > priorLive.validUntilChapter
                  ? priorLive.validUntilChapter
                  : startClose;

            // Compare-and-set on ACTIVE, for the same reason the decision
            // below and retractFact are: `priorLive` was read in a different
            // statement. A concurrent retract that committed RETRACTED
            // between that read and this write would be silently reversed
            // here — a withdrawn fact linked to a successor that replaced it,
            // the state ADR-0008 §1 says cannot exist. The loser throws and
            // the whole transaction rolls back, so the decision commits with
            // its supersede or neither does.
            const superseded = await tx.canonFact.updateMany({
              where: { id: priorLive.id, status: "ACTIVE" },
              data: { status: "SUPERSEDED", validUntilChapter: closeAt },
            });
            if (superseded.count === 0) {
              throw new ConflictError(
                "the fact this claim supersedes was withdrawn or already superseded",
              );
            }
            supersededFactId = priorLive.id;
          }

          // (2)
          const fact = await tx.canonFact.create({
            data: {
              workspaceId,
              novelId,
              entityId: proposal.entityId,
              predicate: proposal.predicate,
              objectEntityId: proposal.objectEntityId,
              objectText: proposal.objectText,
              statement: proposal.statement,
              status: "ACTIVE",
              availableFromChapter: availableFromChapter ?? null,
              validFromChapter: proposal.validFromChapter ?? null,
              createdById: actorUserId,
            },
            select: { id: true },
          });

          // (3)
          if (supersededFactId) {
            await tx.canonFact.update({
              where: { id: supersededFactId },
              data: { supersededById: fact.id },
            });
          }

          // (4) The decision is a compare-and-set, so it is atomic with the
          // fact it mints. `canonFactId` is @unique so a racing second approve
          // cannot mint a second fact, but a racing REJECT could otherwise
          // commit its status write against this proposal after the supersede
          // above had already run — and this update would then overwrite
          // REJECTED with APPROVED while the minted fact survived either way.
          // Predicating on PROPOSED makes the loser's count 0, which throws
          // and rolls the entire transaction back, so either the decision
          // commits with its canon or neither does.
          const decided = await tx.canonProposal.updateMany({
            where: { id: proposal.id, status: "PROPOSED" },
            data: {
              status: "APPROVED",
              canonFactId: fact.id,
              decidedById: actorUserId,
              decidedAt: new Date(),
            },
          });
          if (decided.count === 0) {
            throw new ConflictError("this proposal was already decided");
          }

          return { canonFactId: fact.id, supersededFactId };
        })
        .catch((e: unknown) => {
          const code = (e as { code?: string })?.code;
          if (code === "P2002") {
            // The only @unique column this transaction writes is
            // `canonProposals.canonFactId`, and the CAS above already settled
            // the decision race, so this really is a second approval of the
            // same proposal. Scoped to the fact on the catch's first
            // parameter and checked by name: Prisma reports the colliding
            // constraint in the message tail, and if a future unique index
            // lands in this transaction the generic text would be a lie.
            const meta = (e as { meta?: { target?: unknown } })?.meta?.target;
            const target = Array.isArray(meta) ? meta.join(",") : String(meta ?? "");
            if (target.includes("canon_fact_id")) {
              throw new ConflictError("this proposal was already approved");
            }
            throw new ConflictError(
              "this claim cannot be committed against the current canon — a unique constraint rejected it",
            );
          }
          // A CHECK or FK violation here is a rejected write, not a server
          // fault: the claim and the state it would produce are inconsistent
          // (a validity window that would run backwards, say). Mapping it to
          // a 409 keeps the operator's problem diagnosable instead of a bare
          // INTERNAL. Prisma's message names the constraint but carries no
          // data values, so nothing sensitive reaches the client.
          //
          // P2039 is the code Prisma 7's driver-adapter path actually raises
          // for a raw Postgres constraint error (23514/23503) — verified
          // against the live database. P2004/P2003 are the pre-adapter codes
          // and never fire here; keeping them costs nothing and covers a
          // deployment on the classic engine.
          if (code === "P2039" || code === "P2004" || code === "P2003") {
            dbg?.error?.("canon approval rejected by a constraint", { err: e });
            throw new ConflictError(
              "this claim cannot be committed against the current canon — " +
                "check the validity window and the related rows",
            );
          }
          throw e;
        });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.proposal-approved",
        entityType: "CanonProposal",
        entityId: proposal.id,
        payload: {
          novelId,
          canonFactId: result.canonFactId,
          supersededFactId: result.supersededFactId,
        },
      });
      return result;
    },

    async rejectProposal({ actorUserId, workspaceId, proposalId, note }) {
      const proposal = await gateProposal(
        workspaceId,
        proposalId,
        actorUserId,
        "canon:approve",
      );
      if (proposal.status !== "PROPOSED") {
        throw new ConflictError(`proposal is already ${proposal.status.toLowerCase()}`);
      }
      // Compare-and-set, not read-then-write. The guard above is an optimistic
      // fast path off a row read earlier in a different statement; without a
      // status predicate on the write itself, a concurrent approve can commit
      // its fact-minting transaction between the two, and this rejection then
      // lands on a proposal that already produced canon — leaving a row the
      // status column calls REJECTED while `canonFactId` points at a live
      // ACTIVE fact nobody approved. That is the "no canon without a decision"
      // rule (CLAUDE.md §2.13) bypassed by interleaving rather than by logic.
      // The predicate makes the decision atomic with the write.
      const rejected = await db.canonProposal.updateMany({
        where: { id: proposal.id, status: "PROPOSED" },
        data: {
          status: "REJECTED",
          decidedById: actorUserId,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
        },
      });
      if (rejected.count === 0) {
        throw new ConflictError("this proposal was already decided");
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.proposal-rejected",
        entityType: "CanonProposal",
        entityId: proposal.id,
        payload: { novelId: proposal.entity.novelId },
      });
    },

    async listFacts({
      actorUserId,
      workspaceId,
      novelId,
      entityId,
      predicate,
      includeSuperseded,
      mode,
      readerChapter,
    }) {
      await gate(workspaceId, novelId, actorUserId, "canon:read");
      const viewMode: ViewMode = parseViewMode(mode);
      const at = viewMode === "READER" ? (readerChapter ?? 0) : null;

      // Typed explicitly: the ternary below makes TypeScript widen `status` to
      // a plain string, which Prisma's generated where-input rejects.
      const baseWhere = {
        novelId,
        workspaceId,
        ...(entityId ? { entityId } : {}),
        ...(predicate ? { predicate } : {}),
        // Superseded rows are ADMITTED, not "everything except nothing":
        // dropping the filter entirely also admitted RETRACTED rows, which are
        // withdrawn from canon and must not appear in a reader's list at all.
        ...(includeSuperseded
          ? { status: { in: ["ACTIVE", "SUPERSEDED"] as CanonFactStatus[] } }
          : { status: "ACTIVE" as CanonFactStatus }),
      } satisfies Record<string, unknown>;

      if (at === null) {
        const facts = await db.canonFact.findMany({
          where: baseWhere,
          orderBy: { createdAt: "asc" },
          select: FACT_LIST_SELECT,
        });
        return { facts, withheldCount: 0 };
      }

      // READER: the boundary is applied in the QUERY, not after it
      // (CLAUDE.md §10, ADR-0007). Filtering after the read means the rows a
      // reader may not see were already read, and the only thing between them
      // and the response is a forgotten `if`.
      //
      // Evidence spans are NOT selected here. A source's quote is raw text
      // from a chapter or a reference, and neither version table carries a
      // boundary — a chapter source is visible when its parent chapter is,
      // a reference source not at all — so a row-level gate on
      // `availableFromChapter` says nothing about the quote inside it. A
      // reader-facing list therefore omits sources entirely: they are author
      // provenance, and selecting them out means they are never in memory to
      // leak. (The Brain's FACT answer redacts them the same way.)
      //
      // The withholding COUNT is not reported to a reader either — it is an
      // existence oracle. Its drift signal is for authors, where no boundary
      // applies.
      //
      // `not: null` is load-bearing: a null boundary means "not classified",
      // and an unclassified row must be withheld, not treated as chapter 0.
      const facts = await db.canonFact.findMany({
        where: { ...baseWhere, availableFromChapter: { not: null, lte: at } },
        orderBy: { createdAt: "asc" },
        // `supersededById` is omitted for the same reason `withheldCount` is
        // zeroed: it names the replacement, and the replacement may sit behind
        // a boundary this reader has not reached — an id is enough to confirm
        // a future fact exists, which is the oracle the rest of this branch
        // refuses. `status` already tells the reader the claim was superseded.
        select: { ...FACT_LIST_SELECT, supersededById: false, sources: false },
      });
      return { facts, withheldCount: 0 };
    },

    async ask({ actorUserId, workspaceId, novelId, question, mode, readerChapter }) {
      await gate(workspaceId, novelId, actorUserId, "canon:read");
      const viewMode: ViewMode = parseViewMode(mode);
      // Deny-by-default reader position, identical to the retrieval path: a
      // reader with no recorded position is at the start, not unbounded.
      const at = viewMode === "READER" ? (readerChapter ?? 0) : null;

      // Destructured to a const so TypeScript narrows the discriminated
      // union by it — `question.kind` alone does not narrow a property
      // access on the parameter.
      const kind = question.kind;

      if (kind === "EVENT") {
        return await askEvent(db, workspaceId, novelId, at, viewMode);
      }

      if (kind === "CAUSAL") {
        return await askCausal(db, workspaceId, novelId, at, viewMode);
      }

      if (kind === "UNRESOLVED" || kind === "PROMISES") {
        return await askDebt(db, workspaceId, novelId, at, viewMode, kind);
      }

      if (kind === "RETRIEVAL") {
        const found = await retrieval.search({
          actorUserId,
          workspaceId,
          query: question.query,
          novelId,
          mode: viewMode,
          ...(at !== null ? { readerChapter: at } : {}),
        });
        const hits = found.hits.map((h) => ({
          referenceVersionId: h.referenceVersionId,
          title: h.referenceTitle,
          text: h.text,
          start: h.start,
          end: h.end,
          score: h.score,
        }));
        // Reference material is guidance, never story truth (CLAUDE.md §3),
        // so a prose-recall answer can only ever be a suggestion. Derived
        // through answerBasis rather than hardcoded so the rule lives in one
        // place with the other evidence rules.
        const basis = answerBasis(hits.map(() => ({ kind: "REFERENCE_CHUNK" }) as Evidence));
        return {
          kind: "RETRIEVAL",
          answered: true,
          hits,
          // `basis: null` whenever there is no evidence, matching FACT and
          // STATE exactly. This branch used to substitute "SUGGESTION" for a
          // null basis, so the same `insufficient: true` carried a non-null
          // basis here and a null one there — no client could key on
          // `basis === null` to detect an unbacked answer without also
          // knowing which question kind it asked.
          basis: basis.insufficient ? null : basis.basis,
          insufficient: basis.insufficient,
          retrievers: found.retrievers,
          // Zeroed for a reader on the same rule listFacts applies to its own
          // return: the withholding COUNT is an existence oracle, so a reader
          // learning `2` learns two claims exist that they may not read. The
          // retrieval path's own SQL boundary should already make this 0 —
          // which is exactly why the leak would go unnoticed, since it fires
          // only when the boundary drifts.
          withheldCount: viewMode === "READER" ? 0 : found.withheldCount,
        };
      }

      // FACT / STATE — one row per (novel, entity, predicate, status) is
      // possible, so fetch the whole chain and pick by window.
      //
      // Each positive branch is written out rather than reached by falling
      // through an early return: TypeScript cannot narrow a union member
      // whose discriminant is itself a union, so the EVENT/CAUSAL/PROMISES
      // checks above do not narrow `question` here.
      if (kind === "FACT") {
        const row = await db.canonFact.findFirst({
          where: {
            novelId,
            workspaceId,
            entityId: question.entityId,
            predicate: question.predicate,
            status: "ACTIVE",
          },
          select: {
            id: true,
            statement: true,
            status: true,
            validFromChapter: true,
            validUntilChapter: true,
            availableFromChapter: true,
            objectText: true,
            objectEntityId: true,
            entity: { select: { key: true } },
          },
        });
        if (!row) {
          return {
            kind: "FACT",
            answered: true,
            claim: null,
            basis: null,
            insufficient: true,
            evidence: [],
            notYetTrue: [],
          };
        }
        if (!canView(canonBoundary(row.availableFromChapter), { mode: viewMode, readerChapter: at ?? undefined })) {
          // Withheld, not absent: the caller must not be able to tell the
          // difference between "no such fact" and "not yet visible".
          return {
            kind: "FACT",
            answered: true,
            claim: null,
            basis: null,
            insufficient: true,
            evidence: [],
            notYetTrue: [],
          };
        }
        const evidence: Evidence[] = [
          {
            kind: "CANON_FACT",
            factId: row.id,
            status: "ACTIVE",
            asOfReconstruction: false,
          },
        ];
        const basis = answerBasis(evidence);
        return {
          kind: "FACT",
          answered: true,
          claim: {
            factId: row.id,
            statement: row.statement,
            entityKey: row.entity.key,
            predicate: question.predicate,
            object:
              row.objectEntityId !== null
                ? { objectEntityId: row.objectEntityId }
                : { objectText: row.objectText ?? "" },
            status: row.status,
            validFromChapter: row.validFromChapter,
            validUntilChapter: row.validUntilChapter,
          },
          basis: basis.insufficient ? null : basis.basis,
          insufficient: basis.insufficient,
          evidence: [{ kind: "CANON_FACT", factId: row.id, status: row.status }],
          notYetTrue: [],
        };
      }

      // STATE — reconstruct what was true at a chapter.
      //
      // Reached only for kind === "STATE": every other kind returned above.
      // The guard is on `kind`, not on `question.kind`, because TypeScript
      // cannot eliminate a union member whose discriminant is itself a
      // union — checking one of its values does not narrow the member away.
      if (kind !== "STATE") {
        throw new ConflictError(`unsupported question kind: ${kind}`);
      }
      const atChapter = question.atChapter;
      const chain = await db.canonFact.findMany({
        where: {
          novelId,
          workspaceId,
          entityId: question.entityId,
          predicate: question.predicate,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          statement: true,
          status: true,
          validFromChapter: true,
          validUntilChapter: true,
          availableFromChapter: true,
          objectText: true,
          objectEntityId: true,
          entity: { select: { key: true } },
        },
      });

      // A row covers the as-of point when it had already started and had not
      // yet been replaced. `validUntilChapter` is stamped at supersede time
      // (see approveProposal), which is what makes this reconstructable.
      //
      // RETRACTED rows are excluded from the ANSWER but kept in the record:
      // retraction withdraws a claim from canon (and frees the live slot for
      // a different value), so it must stop answering, but it sets no
      // validUntilChapter — that column dates when a claim stopped being true
      // in-story, which withdrawal does not decide. Without this filter a
      // retracted row's window stays open to infinity and it would be
      // returned as the current value for every chapter at or after its
      // start, forever.
      const covering = chain.filter(
        (r) =>
          r.status !== "RETRACTED" &&
          (r.validFromChapter === null || r.validFromChapter <= atChapter) &&
          (r.validUntilChapter === null || r.validUntilChapter > atChapter),
      );
      // Every row in this list is gated by the same predicate the current
      // value is gated by. Ungated it was a side channel: a READER could name
      // a hidden fact's id and the exact chapter its value takes effect,
      // which is precisely what the FACT branch refuses to disclose — the
      // caller must not be able to tell "not yet visible" from "does not
      // exist" (CLAUDE.md §10, ADR-0008 §8).
      const notYetTrue = chain
        .filter(
          (r) =>
            r.status !== "RETRACTED" &&
            r.validFromChapter !== null &&
            r.validFromChapter > atChapter &&
            // A supersede that lands inside the old claim's own authored
            // window leaves it with `from >= until`: a window that never
            // held. Such a row becomes true at no chapter, so reporting it
            // as "about to become true" is false — the same class of
            // assertion the `insufficient` oracle above was fixed for.
            (r.validUntilChapter === null ||
              r.validUntilChapter > r.validFromChapter),
        )
        .filter((r) =>
          canView(canonBoundary(r.availableFromChapter), {
            mode: viewMode,
            readerChapter: at ?? undefined,
          }),
        )
        .map((r) => ({ factId: r.id, validFromChapter: r.validFromChapter }));

      const current = covering.at(-1) ?? null;
      const visible =
        current !== null &&
        canView(canonBoundary(current.availableFromChapter), {
          mode: viewMode,
          readerChapter: at ?? undefined,
        });

      // Reached when nothing covers the point OR the covering row is
      // withheld. Both answer `insufficient: true`, because keying this on
      // the ungated `covering` length made `{claim: null, insufficient:
      // false}` a positive existence signal — a caller could tell "a fact
      // holds here but you may not see it" from "no fact holds here" — while
      // the FACT branch reports the identical withheld row as
      // `insufficient: true`. The two kinds must agree.
      if (!current || !visible) {
        return {
          kind: "STATE",
          answered: true,
          claim: null,
          basis: null,
          insufficient: true,
          evidence: [],
          notYetTrue,
        };
      }

      const evidence: Evidence[] = [
        {
          kind: "CANON_FACT",
          factId: current.id,
          status: current.status as "ACTIVE" | "SUPERSEDED" | "RETRACTED",
          // Reconstructed history is not present-tense truth, so it can
          // never ground ESTABLISHED_FACT (see answerBasis).
          asOfReconstruction: true,
        },
      ];
      const basis = answerBasis(evidence);
      return {
        kind: "STATE",
        answered: true,
        claim: {
          factId: current.id,
          statement: current.statement,
          entityKey: current.entity.key,
          predicate: (question as { predicate: string }).predicate,
          object:
            current.objectEntityId !== null
              ? { objectEntityId: current.objectEntityId }
              : { objectText: current.objectText ?? "" },
          status: current.status,
          validFromChapter: current.validFromChapter,
          validUntilChapter: current.validUntilChapter,
        },
        basis: basis.insufficient ? null : basis.basis,
        insufficient: basis.insufficient,
        evidence: [
          { kind: "CANON_FACT", factId: current.id, status: current.status },
        ],
        notYetTrue,
      };
    },
  };

  /**
   * EVENT — "what happened", from story_events.
   *
   * READER boundary in the query (listFacts rule, CLAUDE.md §10 / ADR-0007):
   * `availableFromChapter: { not: null, lte: at }` — null means unclassified
   * and an unclassified row is withheld, not chapter 0. Authors get the full
   * list plus a withheld count; readers get no count (existence oracle).
   */
  async function askEvent(
    db: NovelForgeDb,
    workspaceId: string,
    novelId: string,
    at: number | null,
    viewMode: ViewMode,
  ): Promise<Extract<BrainAnswer, { kind: "EVENT" }>> {
    const readerWhere =
      at === null ? {} : { availableFromChapter: { not: null, lte: at } };
    const rows = await db.storyEvent.findMany({
      where: { novelId, workspaceId, ...readerWhere },
      orderBy: { createdAt: "asc" },
      select: { id: true, description: true, chapterId: true, availableFromChapter: true },
    });
    const total = await db.storyEvent.count({ where: { novelId, workspaceId } });
    return {
      kind: "EVENT",
      answered: true,
      events: rows.map((r) => ({
        eventId: r.id,
        description: r.description,
        chapterId: r.chapterId,
        availableFromChapter: r.availableFromChapter,
      })),
      basis: rows.length > 0 ? "ESTABLISHED_FACT" : null,
      insufficient: rows.length === 0,
      withheldCount: viewMode === "READER" ? 0 : total - rows.length,
    };
  }

  /**
   * CAUSAL — "why did X happen", from causal_edges joined to both events.
   *
   * Both sides of the chain must be visible: an edge whose cause or effect is
   * withheld would disclose the hidden half's existence. INFERRED/SPECULATIVE
   * edges are AI-derived candidates (CLAUDE.md §2.13) — edgeRequiresApproval
   * maps them to SUGGESTION, EXPLICIT stays ESTABLISHED_FACT.
   */
  async function askCausal(
    db: NovelForgeDb,
    workspaceId: string,
    novelId: string,
    at: number | null,
    viewMode: ViewMode,
  ): Promise<Extract<BrainAnswer, { kind: "CAUSAL" }>> {
    const rows = await db.causalEdge.findMany({
      where: { novelId, workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        confidence: true,
        causeEvent: { select: { id: true, description: true, availableFromChapter: true } },
        effectEvent: { select: { id: true, description: true, availableFromChapter: true } },
      },
    });
    const visible = rows.filter(
      (r) =>
        (r.causeEvent.availableFromChapter === null || at === null
          ? at === null
          : r.causeEvent.availableFromChapter <= at) &&
        (r.effectEvent.availableFromChapter === null || at === null
          ? at === null
          : r.effectEvent.availableFromChapter <= at),
    );
    const edges = visible.map((r) => ({
      edgeId: r.id,
      cause: {
        eventId: r.causeEvent.id,
        description: r.causeEvent.description,
        availableFromChapter: r.causeEvent.availableFromChapter,
      },
      effect: {
        eventId: r.effectEvent.id,
        description: r.effectEvent.description,
        availableFromChapter: r.effectEvent.availableFromChapter,
      },
      confidence: r.confidence,
    }));
    // Provenance: an EXPLICIT edge is established; anything an author has to
    // approve is a suggestion until then. Mixed lists weaken to the weakest
    // member, matching answerBasis' contract.
    const basis = edges.length === 0
      ? { insufficient: true, basis: null as ClaimBasis | null }
      : edges.some((e) => edgeRequiresApproval(e.confidence))
        ? { insufficient: false, basis: "SUGGESTION" as ClaimBasis }
        : { insufficient: false, basis: "ESTABLISHED_FACT" as ClaimBasis };
    return {
      kind: "CAUSAL",
      answered: true,
      edges,
      basis: basis.insufficient ? null : basis.basis,
      insufficient: basis.insufficient,
      withheldCount: viewMode === "READER" ? 0 : rows.length - visible.length,
    };
  }

  /**
   * UNRESOLVED / PROMISES — "what still owes the reader", from story_threads
   * and story_promises, ranked by narrative debt (importance × urgency × age).
   * Debt is derived here, never stored. ageChapters uses the novel's current
   * frontier — the highest chapter number — because threads/promises carry no
   * end stamp of their own while open.
   *
   * Reader anchor is `introducedAtChapter` (schema docstring: "doubles as the
   * reader anchor"); an unanchored row is never reader-visible per
   * readerVisible().
   */
  async function askDebt(
    db: NovelForgeDb,
    workspaceId: string,
    novelId: string,
    at: number | null,
    viewMode: ViewMode,
    forKind: "UNRESOLVED" | "PROMISES",
  ): Promise<Extract<BrainAnswer, { kind: "UNRESOLVED" | "PROMISES" }>> {
    const frontier = await db.chapter.aggregate({
      where: { novelId },
      _max: { number: true },
    });
    const now = frontier._max?.number ?? 0;

    const threads = await db.storyThread.findMany({
      where: { novelId, workspaceId },
      select: {
        id: true, title: true, status: true, importance: true,
        introducedAtChapter: true, resolvedAtChapter: true,
      },
    });
    const promises = await db.storyPromise.findMany({
      where: { novelId, workspaceId },
      select: {
        id: true, title: true, status: true, importance: true,
        introducedAtChapter: true, payoffAtChapter: true,
      },
    });

    const all: DebtItem[] = [
      ...threads.map((t) => ({
        id: t.id,
        kind: "THREAD" as const,
        open: isThreadUnresolved(t.status),
        importance: t.importance,
        ageChapters: Math.max(0, now - (t.introducedAtChapter ?? 0)),
      })),
      ...promises.map((p) => ({
        id: p.id,
        kind: "PROMISE" as const,
        open: isPromiseOpen(p.status),
        importance: p.importance,
        ageChapters: Math.max(0, now - (p.introducedAtChapter ?? 0)),
        readyForPayoff: p.status === "READY_FOR_PAYOFF",
      })),
    ];

    // For PROMISES only promise rows are asked for; UNRESOLVED shows the full
    // ledger (open threads + open promises are what "unresolved" means; closed
    // items sink to score 0 but stay so the caller can render the full list).
    const wanted =
      forKind === "PROMISES"
        ? all.filter((i) => i.kind === "PROMISE")
        : all;
    const ranked = narrativeDebt(wanted);

    const rowFor = (id: string) =>
      threads.find((t) => t.id === id) ??
      promises.find((p) => p.id === id)!;

    // Boundary rule applied at the view layer here because the anchor
    // is a nullable column with "null = unanchored = never visible" semantics
    // (readerVisible), not a `not: null, lte` predicate shape. Same effect as
    // the listFacts where-clause: a reader never learns a hidden row exists.
    const readerAt = at ?? 0;
    const visibleRows = ranked.filter((i) => {
      const row = rowFor(i.id);
      return viewMode !== "READER" ||
        readerVisible(row.introducedAtChapter, readerAt);
    });

    const items = visibleRows.map((i) => {
      const row = rowFor(i.id);
      const close =
        "resolvedAtChapter" in row ? row.resolvedAtChapter : row.payoffAtChapter;
      return {
        id: i.id,
        kind: i.kind,
        title: row.title,
        status: row.status,
        importance: row.importance,
        debt: i.score,
        introducedAtChapter: row.introducedAtChapter,
        resolvedOrPayoffAtChapter: close ?? null,
      };
    });
    return {
      kind: forKind,
      answered: true,
      items,
      basis: items.length > 0 ? "ESTABLISHED_FACT" : null,
      insufficient: items.length === 0,
      withheldCount: viewMode === "READER" ? 0 : ranked.length - visibleRows.length,
    };
  }

  /**
   * Validate and normalise a piece of evidence before it is stored.
   *
   * The invariant is the same one the reference legs carry: `quote` must be
   * exactly `source.slice(start, end)` against an IMMUTABLE revision. A
   * citation that does not resolve is refused here rather than stored and
   * discovered later by whoever trusted it.
   */
  async function resolveSourceEvidence(
    source: {
      chapterVersionId?: string | null;
      referenceVersionId?: string | null;
      quote: string;
      start: number;
      end: number;
    },
    workspaceId: string,
    novelId: string,
  ): Promise<{
    sourceKind: "CHAPTER" | "REFERENCE";
    chapterVersionId: string | null;
    referenceVersionId: string | null;
    quote: string;
    start: number;
    end: number;
  }> {
    const hasChapter = !!source.chapterVersionId;
    const hasReference = !!source.referenceVersionId;
    if (hasChapter === hasReference) {
      throw new ConflictError(
        "evidence needs exactly one of chapterVersionId or referenceVersionId",
      );
    }

    let text: string;
    if (hasChapter) {
      const version = await db.chapterVersion.findFirst({
        where: {
          id: source.chapterVersionId!,
          chapter: { novelId, novel: { workspaceId } },
        },
        select: { content: true },
      });
      if (!version) throw new NotFoundError("chapter version");
      text = version.content;
    } else {
      const version = await db.referenceVersion.findFirst({
        where: { id: source.referenceVersionId!, reference: { workspaceId } },
        select: { content: true },
      });
      if (!version) throw new NotFoundError("reference version");
      text = version.content;
    }

    if (!verifySpan(text, source.start, source.end)) {
      throw new ConflictError("evidence span does not describe a range in the source");
    }
    if (text.slice(source.start, source.end) !== source.quote) {
      throw new ConflictError("evidence quote does not match the span in the source");
    }

    return {
      sourceKind: hasChapter ? "CHAPTER" : "REFERENCE",
      chapterVersionId: source.chapterVersionId ?? null,
      referenceVersionId: source.referenceVersionId ?? null,
      quote: source.quote,
      start: source.start,
      end: source.end,
    };
  }
}

/** Re-exported so a route can decide whether to advertise a question kind. */
export { can };
