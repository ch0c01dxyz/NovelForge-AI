import { requireCapability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import {
  ConflictError,
  NotFoundError,
  createAuditService,
  createCanonServices,
  createCharacterServices,
  createNarrativeServices,
  createPlanningServices,
  createRelationshipServices,
  type RetrievalServices,
} from "@novelforge/ai-services";
import { createStoryServices } from "./story.ts";
import { createEndgameCallbackServices } from "./endgame-callbacks.ts";
import { strippedContentIncludes } from "./manuscript.ts";

export interface NovelDecodeCandidate {
  id: string;
  area: string;
  title: string;
  summary: string;
  subject: string | null;
  target: string | null;
  /** Native chapter position, not the original archive filename number. */
  chapterNumber: number;
  citations: { chapterVersionId: string; chapterNumber: number; quote: string }[];
  details?: Record<string, unknown>;
}

export interface ApplyNovelDecodeCandidateInput {
  db: NovelForgeDb;
  scope: { actorUserId: string; workspaceId: string; novelId: string };
  candidate: NovelDecodeCandidate;
  retrieval?: RetrievalServices;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function nonempty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new ConflictError(`decode ${field} is required`);
  return value.trim();
}
function choice<const T extends readonly string[]>(
  value: unknown,
  options: T,
  field: string,
): T[number] {
  if (typeof value !== "string" || !options.includes(value))
    throw new ConflictError(`decode ${field} is unsupported`);
  return value as T[number];
}

/**
 * The caller owns the author decision, source/head CAS, mandatory checkpoint and
 * atomic receipt transaction. Pass its transaction facade, including nested
 * transaction reuse, to every native service. No provider request is made here.
 */
export async function applyNovelDecodeCandidate({
  db,
  scope,
  candidate: c,
  retrieval,
}: ApplyNovelDecodeCandidateInput): Promise<Record<string, unknown>> {
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: scope.workspaceId, userId: scope.actorUserId } },
    select: { role: true },
  });
  const novel =
    membership &&
    (await db.novel.findFirst({
      where: { id: scope.novelId, workspaceId: scope.workspaceId },
      select: { currentBranchId: true },
    }));
  if (!membership || !novel) throw new NotFoundError("novel");
  requireCapability(membership.role, "canon:manage");
  if (!UUID.test(c.id) || !Number.isSafeInteger(c.chapterNumber) || c.chapterNumber < 1)
    throw new ConflictError("decode candidate identity or chapter position is invalid");
  const title = nonempty(c.title, "title");
  const summary = nonempty(c.summary, "summary");
  const key = `decode-${c.id.toLowerCase()}`;
  const details = c.details ?? {};
  if (!Array.isArray(c.citations) || !c.citations.length || c.citations.length > 100)
    throw new ConflictError("decode source citations are required and bounded");
  for (const citation of c.citations) {
    if (
      !UUID.test(citation.chapterVersionId) ||
      !Number.isSafeInteger(citation.chapterNumber) ||
      citation.chapterNumber < 1 ||
      citation.chapterNumber > c.chapterNumber
    )
      throw new ConflictError("decode source position is invalid or reveals a later chapter");
    nonempty(citation.quote, "source quote");
  }
  const versions = await db.chapterVersion.findMany({
    where: {
      id: { in: c.citations.map((x) => x.chapterVersionId) },
      chapter: { novelId: scope.novelId },
    },
    select: { id: true, content: true, chapter: { select: { id: true, number: true } } },
  });
  for (const citation of c.citations) {
    const version = versions.find((v) => v.id === citation.chapterVersionId);
    if (
      !version ||
      version.chapter.number !== citation.chapterNumber ||
      !strippedContentIncludes(version.content, citation.quote)
    )
      throw new ConflictError("decode citation does not match its scoped manuscript source");
  }
  const chapter = await db.chapter.findUnique({
    where: { novelId_number: { novelId: scope.novelId, number: c.chapterNumber } },
    select: { id: true },
  });
  if (!chapter || !c.citations.some((x) => x.chapterNumber === c.chapterNumber))
    throw new ConflictError("decode observation needs evidence at its native chapter boundary");
  const branch = await db.novelBranch.findFirst({
    where: {
      novelId: scope.novelId,
      ...(novel.currentBranchId ? { id: novel.currentBranchId } : { name: "main" }),
    },
    select: { id: true, name: true, headRevisionId: true },
  });
  // These native writers currently revision the materialized main lineage.
  if (!branch || branch.name !== "main" || !branch.headRevisionId)
    throw new ConflictError(
      "decode application requires the checked-out main branch and a recoverable baseline",
    );
  const audit = createAuditService(db);
  const characters = createCharacterServices({ db, audit });
  const planning = createPlanningServices({ db, audit });
  const narrative = createNarrativeServices({ db, audit });
  const story = createStoryServices({ db, audit });
  const evidence = `${summary}\n\nSource reconstruction (chapter ${c.chapterNumber}); external verification is not implied.\n${c.citations.map((x) => `[chapter ${x.chapterNumber}; version ${x.chapterVersionId}] ${x.quote}`).join("\n")}`;
  function canon() {
    if (!retrieval)
      throw new ConflictError("decode application requires the existing retrieval service");
    return createCanonServices({ db, audit, retrieval });
  }
  async function character(ref: unknown) {
    const identity = nonempty(ref, "character subject");
    const rows = await db.character.findMany({
      where: {
        workspaceId: scope.workspaceId,
        novelId: scope.novelId,
        OR: [
          { name: identity },
          { key: identity },
          ...(UUID.test(identity) ? [{ id: identity }] : []),
        ],
      },
      take: 2,
    });
    if (rows.length !== 1)
      throw new ConflictError(
        "decode character dependency is missing or ambiguous; approve an exact identity first",
      );
    return rows[0]!;
  }
  async function entity(ref: unknown) {
    const identity = nonempty(ref, "entity subject");
    const rows = await db.storyEntity.findMany({
      where: {
        novelId: scope.novelId,
        OR: [
          { name: identity },
          { key: identity },
          ...(UUID.test(identity) ? [{ id: identity }] : []),
        ],
      },
      take: 2,
    });
    if (rows.length !== 1)
      throw new ConflictError(
        "decode entity dependency is missing or ambiguous; approve an exact identity first",
      );
    return rows[0]!;
  }
  let result: Record<string, unknown>;
  switch (c.area) {
    case "SYNOPSIS": {
      result = { synopsisId: (await planning.createSynopsis({ ...scope, content: evidence })).id };
      break;
    }
    case "OUTLINE": {
      const reconstruction = "Imported source reconstruction";
      let saga = await db.saga.findFirst({ where: { novelId: scope.novelId, title: reconstruction, kind: "SAGA", parentId: null } });
      if (!saga) {
        const created = await planning.createSaga({ ...scope, kind: "SAGA", title: reconstruction, parentId: null, intent: "Retrospective source structure; not an invented official arc or a future plan" });
        saga = await db.saga.findUniqueOrThrow({ where: { id: created.id } });
      }
      const last = await db.outlineNode.aggregate({ where: { novelId: scope.novelId, sagaId: saga.id }, _max: { order: true } });
      const node = await planning.createOutlineNode({ ...scope, sagaId: saga.id, kind: "CHAPTER", title, summary: evidence, order: (last._max.order ?? -1) + 1, chapterId: chapter.id, sceneId: null });
      const beats = await db.outlineNode.findMany({ where: { novelId: scope.novelId, sagaId: saga.id }, orderBy: [{ chapter: { number: "asc" } }, { order: "asc" }], select: { id: true, chapterId: true, title: true, summary: true } });
      const row = await planning.createOutlineDraft({
        ...scope,
        note: "Retrospective manuscript reconstruction; not an approved future plan",
        content: {
          kind: "SOURCE_RECONSTRUCTION",
          beats,
          candidateId: c.id,
          chapterId: chapter.id,
          chapterNumber: c.chapterNumber,
          title,
          summary,
          citations: c.citations,
        },
      });
      result = { outlineVersionId: row.id, outlineNodeId: node.id, status: "DRAFT" };
      break;
    }
    case "STYLE": {
      const current = (await narrative.getDna(scope))?.dna;
      if (
        current !== null &&
        current !== undefined &&
        (typeof current !== "object" || Array.isArray(current))
      )
        throw new ConflictError("existing narrative DNA is not an object");
      const dna = (current ?? {}) as Record<string, unknown>;
      if (dna.sourceObservedStyles !== undefined && !Array.isArray(dna.sourceObservedStyles))
        throw new ConflictError("existing observed styles need an explicit author correction");
      await narrative.putDna({
        ...scope,
        dna: {
          ...dna,
          sourceObservedStyles: [
            ...((dna.sourceObservedStyles as unknown[] | undefined) ?? []),
            {
              candidateId: c.id,
              title,
              summary,
              chapterNumber: c.chapterNumber,
              citations: c.citations,
            },
          ],
        },
      });
      result = { novelId: scope.novelId, field: "sourceObservedStyles" };
      break;
    }
    case "CHARACTER": {
      const name = nonempty(c.subject ?? title, "character name");
      const matches = await db.character.findMany({
        where: {
          workspaceId: scope.workspaceId,
          novelId: scope.novelId,
          OR: [{ name }, { key: name }],
        },
        take: 2,
      });
      if (matches.length > 1) throw new ConflictError("decode character identity is ambiguous");
      if (matches.length) {
        result = { characterId: matches[0]!.id, reused: true };
        break;
      }
      const nativeCanon = canon();
      const identities = await db.storyEntity.findMany({
        where: { novelId: scope.novelId, OR: [{ name }, { key }] },
        take: 2,
      });
      if (
        identities.length > 1 ||
        (identities[0] && (identities[0].name !== name || identities[0].kind !== "CHARACTER"))
      )
        throw new ConflictError("decode character story identity is ambiguous or incompatible");
      if (
        identities[0] &&
        (await db.character.findFirst({
          where: { storyEntityId: identities[0].id },
          select: { id: true },
        }))
      )
        throw new ConflictError("decode story identity already belongs to a character");
      const created = await characters.createCharacter({ ...scope, key, name, summary: evidence });
      const identity =
        identities[0] ??
        (await nativeCanon.createEntity({ ...scope, kind: "CHARACTER", name, key }));
      const head = await db.novelBranch.findUniqueOrThrow({
        where: { id: branch.id },
        select: { headRevisionId: true },
      });
      const linked = await characters.linkStoryEntity({
        ...scope,
        characterId: created.id,
        storyEntityId: identity.id,
        expectedBranchId: branch.id,
        expectedHeadRevisionId: head.headRevisionId,
      });
      result = {
        characterId: created.id,
        storyEntityId: identity.id,
        checkpointId: linked.checkpointId,
        reused: false,
      };
      break;
    }
    case "CHARACTER_STATE": {
      const subject = await character(c.subject);
      result = {
        stateId: (
          await characters.createState({
            ...scope,
            characterId: subject.id,
            fromChapter: c.chapterNumber,
            toChapter: c.chapterNumber + 1,
            summary: evidence,
          })
        ).id,
      };
      break;
    }
    case "CHARACTER_ARC": {
      const subject = await character(c.subject);
      if (
        !Array.isArray(details.milestones) ||
        details.milestones.length < 2 ||
        details.milestones.length > 8
      )
        throw new ConflictError(
          "decode arc requires at least two source-cited chronological milestones",
        );
      let previous = 0;
      const milestones = details.milestones.map((value: unknown) => {
        const item = value as { chapterNumber?: unknown; summary?: unknown } | null;
        const number = item?.chapterNumber;
        if (
          typeof number !== "number" ||
          !Number.isSafeInteger(number) ||
          number <= previous ||
          number > c.chapterNumber ||
          !c.citations.some((x) => x.chapterNumber === number)
        )
          throw new ConflictError(
            "decode arc milestone must be chronological and source-cited without future leakage",
          );
        previous = number;
        const summary = nonempty(item?.summary, "milestone summary");
        if (summary.length > 2000) throw new ConflictError("DECODE_OUTPUT_INVALID");
        return { chapter: number, summary };
      });
      const arc = await characters.createArc({
        ...scope,
        characterId: subject.id,
        title,
        status: "ACTIVE",
      });
      const milestoneIds: string[] = [];
      for (const milestone of milestones)
        milestoneIds.push(
          (await characters.addMilestone({ ...scope, arcId: arc.id, ...milestone })).id,
        );
      result = { arcId: arc.id, milestoneIds, status: "ACTIVE" };
      break;
    }
    case "RELATIONSHIP": {
      const from = await character(c.subject);
      const to = await character(c.target);
      const stance = choice(
        details.stance,
        ["ALLY", "FRIENDLY", "NEUTRAL", "WARY", "HOSTILE", "ENEMY"] as const,
        "relationship stance",
      );
      result = {
        stanceId: (
          await createRelationshipServices({ db, audit }).createStance({
            ...scope,
            fromCharacterId: from.id,
            toCharacterId: to.id,
            stance,
            fromChapter: c.chapterNumber,
            toChapter: c.chapterNumber + 1,
          })
        ).id,
      };
      break;
    }
    case "WORLD": {
      const kind = choice(
        details.entityKind,
        ["LOCATION", "ORGANIZATION", "FACTION", "ITEM", "RESOURCE", "CONCEPT"] as const,
        "world entity kind",
      );
      const name = nonempty(c.subject ?? title, "world name");
      const matches = await db.storyEntity.findMany({
        where: { novelId: scope.novelId, OR: [{ name }, { key }] },
        take: 2,
      });
      if (
        matches.length > 1 ||
        (matches[0] && (matches[0].name !== name || matches[0].kind !== kind))
      )
        throw new ConflictError("decode world identity is ambiguous or incompatible");
      const nativeCanon = canon();
      const subject = matches[0] ?? (await nativeCanon.createEntity({ ...scope, name, kind, key }));
      const proposal = await nativeCanon.proposeCandidate({
        ...scope,
        entityId: subject.id,
        predicate: "has description",
        objectText: summary,
        statement: summary,
        validFromChapter: c.chapterNumber,
      });
      result = { entityId: subject.id, proposalId: proposal.id, status: proposal.status };
      break;
    }
    case "TIMELINE": {
      const event = await story.createEvent({
        ...scope,
        chapterId: chapter.id,
        availableFromChapter: c.chapterNumber,
        description: evidence,
      });
      const timeline = await story.appendTimelineEvent({
        ...scope,
        description: evidence,
        availableFromChapter: c.chapterNumber,
      });
      result = { eventId: event.id, timelineEventId: timeline.id };
      break;
    }
    case "RESEARCH": {
      if (!retrieval)
        throw new ConflictError("decode research requires the existing retrieval service");
      const ref = await retrieval.createReference({
        ...scope,
        key,
        title,
        kind: "RESEARCH",
        source: "Imported manuscript observation; external verification pending",
        content: evidence,
      });
      result = {
        referenceId: ref.id,
        referenceVersionId: ref.versionId,
        status: "DRAFT",
        externallyVerified: false,
        embedded: false,
      };
      break;
    }
    case "NARRATIVE": {
      const kind = choice(
        details.recordKind,
        ["THREAD", "PROMISE"] as const,
        "narrative record kind",
      );
      const common = {
        ...scope,
        title,
        description: evidence,
        importance: 1,
        introducedAtChapter: c.chapterNumber,
        payoffIntent: null,
      };
      if (kind === "PROMISE")
        result = { promiseId: (await story.createPromise(common)).id, status: "SETUP" };
      else
        result = {
          threadId: (
            await story.createThread({
              ...common,
              kind: choice(
                details.threadKind,
                ["MYSTERY", "CONFLICT", "QUESTION", "OBJECTIVE", "SUBPLOT"] as const,
                "thread kind",
              ),
            })
          ).id,
          status: "ACTIVE",
        };
      break;
    }
    case "ENDGAME": {
      const kind = choice(
        details.legacyKind,
        ["CHARACTER", "WORLD", "THEMATIC"] as const,
        "legacy kind",
      );
      const subjectId = c.subject
        ? kind === "CHARACTER"
          ? (await character(c.subject)).id
          : (await entity(c.subject)).id
        : undefined;
      const legacy = await createEndgameCallbackServices({ db }).recordLegacy({
        ...scope,
        kind,
        ...(subjectId ? { subjectId } : {}),
        description: evidence,
      });
      result = { legacyId: legacy.id, gateApproval: false };
      break;
    }
    case "CANON": {
      const predicate = nonempty(details.predicate, "canon predicate");
      const subject = await entity(c.subject);
      const target = c.target ? await entity(c.target) : null;
      const proposal = await canon().proposeCandidate({
        ...scope,
        entityId: subject.id,
        predicate,
        ...(target ? { objectEntityId: target.id } : { objectText: summary }),
        statement: summary,
        validFromChapter: c.chapterNumber,
      });
      result = { proposalId: proposal.id, status: proposal.status };
      break;
    }
    default:
      throw new ConflictError("decode area is unsupported");
  }
  await audit.record({
    ...scope,
    action: "novel.decode.native-applied",
    entityType: "NovelDecodeCandidate",
    entityId: c.id,
    payload: {
      novelId: scope.novelId,
      area: c.area,
      chapterNumber: c.chapterNumber,
      citations: c.citations,
      result: JSON.parse(JSON.stringify(result)),
    },
  });
  return result;
}
