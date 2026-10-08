/**
 * SCALE evidence foundation (NF-WF-050A, S1): version-bound author assessments
 * of operative conflicts in one saved chapter version.
 *
 * An assessment is an append-only annotation, not canon and not a final-review
 * verdict. Absence, explicit no-conflict declarations and stale assessments
 * remain distinct. S1 does not change protagonist standing, infer events,
 * approve text or enable AI.
 *
 * Storage: `ScaleEvidenceSet` (table `scale_evidence_sets`), one row per
 * assessment. No mutable current-set pointer; the latest set per
 * (sourceBranchId, chapterVersionId) by sequence is authoritative, with
 * previousSetId forming the audit chain.
 *
 * Concurrency: appendSet runs one transaction locking novel FOR NO KEY
 * UPDATE, checked-out branch FOR UPDATE, then chapter FOR UPDATE (the
 * lockManuscriptBranch order). All expectations are rechecked under those
 * locks; sequence+1 and previousSetId are allocated atomically. Stale
 * expectations surface as ConflictError (409 at the route).
 *
 * Applicability: a set is CURRENT only when it is the latest for the
 * chapter's current version AND the checked-out branch AND its
 * sourceRevisionId equals that branch's actual head (null-safe). Any head
 * change conservatively yields STALE with SOURCE_REVISION_CHANGED; a new
 * text version with no sets yields UNASSESSED.
 */
import { randomUUID } from "node:crypto";
import type { InputJsonValue, NovelForgeDb } from "@novelforge/database";
import { NARRATIVE_SCALES, type NarrativeScale } from "@novelforge/narrative-rhythm";
import { verifySpan } from "@novelforge/story-intelligence";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import { ConflictError, NotFoundError } from "./platform.ts";
import { verifyEvidenceQuote } from "./manuscript.ts";

/**
 * Validation failures for SCALE evidence claims/schemas.
 * Maps to HTTP 400 (INVALID_INPUT) at the route layer.
 * Distinct from ConflictError (409) which is reserved for stale
 * branch/head/set expectations per the contract.
 */
export class ScaleEvidenceValidationError extends Error {
  readonly code = "INVALID_INPUT" as const;
  readonly statusCode = 400 as const;
  constructor(message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Frozen claim schema (contract §"Operative conflict and quote schema")
// ---------------------------------------------------------------------------

export const SCALE_EVIDENCE_SCALES: readonly NarrativeScale[] = NARRATIVE_SCALES;

export const SCALE_CLAIM_RELEVANCE = ["ACTION", "STAKES", "CONSEQUENCE"] as const;
export type ScaleClaimRelevance = (typeof SCALE_CLAIM_RELEVANCE)[number];

export type ScaleEvidenceDeclaration = "CONFLICTS" | "NO_OPERATIVE_CONFLICT";

export interface ScaleEvidenceClaimSource {
  start: number;
  end: number;
  quote: string;
}

export interface ScaleEvidenceClaim {
  scale: NarrativeScale;
  relevance: ScaleClaimRelevance;
  explanation: string;
  source: ScaleEvidenceClaimSource;
}

export type ScaleEvidenceStatus = "UNASSESSED" | "CURRENT" | "STALE";

export type ScaleEvidenceStaleReason = "SOURCE_REVISION_CHANGED" | "UNASSESSED";

export interface ScaleEvidenceSetRecord {
  id: string;
  workspaceId: string;
  novelId: string;
  chapterVersionId: string;
  sourceBranchId: string;
  sourceRevisionId: string | null;
  sequence: number;
  declaration: ScaleEvidenceDeclaration;
  explanation: string;
  conflicts: ScaleEvidenceClaim[];
  previousSetId: string | null;
  actorUserId: string;
  createdAt: Date;
}

const MAX_CLAIMS = 100;
const MAX_EXPLANATION_LENGTH = 4000;
const MAX_QUOTE_LENGTH = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidScale(value: unknown): value is NarrativeScale {
  return (
    typeof value === "string" &&
    (NARRATIVE_SCALES as readonly string[]).includes(value)
  );
}

function isValidRelevance(value: unknown): value is ScaleClaimRelevance {
  return (
    typeof value === "string" &&
    (SCALE_CLAIM_RELEVANCE as readonly string[]).includes(value)
  );
}

/**
 * Validate one claim against the frozen schema and the enclosing chapter
 * version content. Returns the normalized claim (trimmed strings). Throws
 * ScaleEvidenceValidationError (400) on any schema/quote violation.
 */
function validateClaim(
  raw: unknown,
  content: string,
  index: number,
): ScaleEvidenceClaim {
  const where = `conflicts[${index}]`;
  if (!isRecord(raw)) throw new ScaleEvidenceValidationError(`${where} must be an object`);
  // Strict schema: reject unknown fields (contract requires strict nested
  // claim/source schemas; unknown fields are not silently discarded).
  const allowedClaimKeys = new Set(["scale", "relevance", "explanation", "source"]);
  for (const key of Object.keys(raw)) {
    if (!allowedClaimKeys.has(key))
      throw new ScaleEvidenceValidationError(`${where} has unknown field: ${key}`);
  }
  if (!isValidScale(raw.scale))
    throw new ScaleEvidenceValidationError(`${where}.scale must be one of the eight narrative scales`);
  if (!isValidRelevance(raw.relevance))
    throw new ScaleEvidenceValidationError(`${where}.relevance must be ACTION, STAKES or CONSEQUENCE`);
  if (typeof raw.explanation !== "string" || raw.explanation.trim().length === 0)
    throw new ScaleEvidenceValidationError(`${where}.explanation is required`);
  const explanation = raw.explanation.trim();
  if (explanation.length > MAX_EXPLANATION_LENGTH)
    throw new ScaleEvidenceValidationError(`${where}.explanation exceeds ${MAX_EXPLANATION_LENGTH} characters`);

  if (!isRecord(raw.source)) throw new ScaleEvidenceValidationError(`${where}.source must be an object`);
  // Strict source schema: reject unknown fields.
  const allowedSourceKeys = new Set(["start", "end", "quote"]);
  for (const key of Object.keys(raw.source)) {
    if (!allowedSourceKeys.has(key))
      throw new ScaleEvidenceValidationError(`${where}.source has unknown field: ${key}`);
  }
  const { start, end, quote } = raw.source;
  // verifySpan enforces integer, nonnegative, start < end, end <= length.
  if (!verifySpan(content, start as number, end as number))
    throw new ScaleEvidenceValidationError(`${where}.source offsets do not describe a range in the chapter version`);
  if (typeof quote !== "string" || quote.trim().length === 0)
    throw new ScaleEvidenceValidationError(`${where}.source.quote is required`);
  const trimmedQuote = quote.trim();
  if (trimmedQuote.length > MAX_QUOTE_LENGTH)
    throw new ScaleEvidenceValidationError(`${where}.source.quote exceeds ${MAX_QUOTE_LENGTH} characters`);
  if (!verifyEvidenceQuote(content, start as number, end as number, quote as string))
    throw new ScaleEvidenceValidationError(`${where}.source.quote does not match the span in the chapter version`);
  // Nonempty prose span: the stripped span text must contain non-whitespace.
  // verifyEvidenceQuote already normalizes whitespace for the match; here we
  // require the raw span to carry actual prose, not only markup/whitespace.
  const spanText = content.slice(start as number, end as number).replace(/<[^>]*>/g, "").trim();
  if (spanText.length === 0)
    throw new ScaleEvidenceValidationError(`${where}.source span has no prose text`);

  return {
    scale: raw.scale,
    relevance: raw.relevance,
    explanation,
    source: { start: start as number, end: end as number, quote: trimmedQuote },
  };
}

function claimKey(claim: ScaleEvidenceClaim): string {
  return `${claim.scale}|${claim.relevance}|${claim.explanation}|${claim.source.start}|${claim.source.end}|${claim.source.quote}`;
}

/**
 * Validate the full claim array for a declaration. Returns normalized claims.
 */
function validateConflicts(
  declaration: ScaleEvidenceDeclaration,
  rawConflicts: unknown,
  content: string,
): ScaleEvidenceClaim[] {
  if (!Array.isArray(rawConflicts))
    throw new ScaleEvidenceValidationError("conflicts must be an array");
  if (declaration === "NO_OPERATIVE_CONFLICT") {
    if (rawConflicts.length !== 0)
      throw new ScaleEvidenceValidationError("NO_OPERATIVE_CONFLICT requires an empty conflicts array");
    return [];
  }
  // CONFLICTS
  if (rawConflicts.length < 1 || rawConflicts.length > MAX_CLAIMS)
    throw new ScaleEvidenceValidationError(`CONFLICTS requires 1..${MAX_CLAIMS} claims`);
  const claims = rawConflicts.map((raw, i) => validateClaim(raw, content, i));
  const seen = new Set<string>();
  for (const claim of claims) {
    const key = claimKey(claim);
    if (seen.has(key)) throw new ScaleEvidenceValidationError("duplicate conflict claim");
    seen.add(key);
  }
  return claims;
}

function toRecord(row: {
  id: string;
  workspaceId: string;
  novelId: string;
  chapterVersionId: string;
  sourceBranchId: string;
  sourceRevisionId: string | null;
  sequence: number;
  declaration: string;
  explanation: string;
  conflictsJson: unknown;
  previousSetId: string | null;
  actorUserId: string;
  createdAt: Date;
}): ScaleEvidenceSetRecord {
  // Full revalidation of stored data before serialization (contract:
  // malformed retained rows fail explicitly; corrupt data must not become
  // CURRENT). Validation failures are 400, not 409.
  if (row.declaration !== "CONFLICTS" && row.declaration !== "NO_OPERATIVE_CONFLICT")
    throw new ScaleEvidenceValidationError(`stored set ${row.id} has invalid declaration`);
  if (!Number.isInteger(row.sequence) || row.sequence <= 0)
    throw new ScaleEvidenceValidationError(`stored set ${row.id} has invalid sequence`);
  const explanation = typeof row.explanation === "string" ? row.explanation : "";
  if (explanation.length === 0 || explanation.length > MAX_EXPLANATION_LENGTH)
    throw new ScaleEvidenceValidationError(`stored set ${row.id} has invalid explanation`);
  const conflictsJson = row.conflictsJson;
  if (!Array.isArray(conflictsJson))
    throw new ScaleEvidenceValidationError(`stored set ${row.id} has malformed conflicts`);
  const conflicts: ScaleEvidenceClaim[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < conflictsJson.length; i++) {
    const raw = conflictsJson[i];
    // Reuse the strict claim validator (content-independent checks need
    // offsets/quotes validated structurally here; quote-vs-content was
    // verified at write time and the version is immutable).
    if (!isRecord(raw))
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}] must be an object`);
    const allowedClaimKeys = new Set(["scale", "relevance", "explanation", "source"]);
    for (const key of Object.keys(raw)) {
      if (!allowedClaimKeys.has(key))
        throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}] has unknown field: ${key}`);
    }
    if (!isValidScale(raw.scale))
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].scale is invalid`);
    if (!isValidRelevance(raw.relevance))
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].relevance is invalid`);
    if (typeof raw.explanation !== "string" || raw.explanation.length === 0 || raw.explanation.length > MAX_EXPLANATION_LENGTH)
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].explanation is invalid`);
    if (!isRecord(raw.source))
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].source must be an object`);
    const allowedSourceKeys = new Set(["start", "end", "quote"]);
    for (const key of Object.keys(raw.source)) {
      if (!allowedSourceKeys.has(key))
        throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].source has unknown field: ${key}`);
    }
    const { start, end, quote } = raw.source;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].source offsets are invalid`);
    if (typeof quote !== "string" || quote.length === 0 || quote.length > MAX_QUOTE_LENGTH)
      throw new ScaleEvidenceValidationError(`stored set ${row.id} conflicts[${i}].source.quote is invalid`);
    const claim: ScaleEvidenceClaim = {
      scale: raw.scale,
      relevance: raw.relevance,
      explanation: raw.explanation,
      source: { start, end, quote },
    };
    const key = claimKey(claim);
    if (seen.has(key))
      throw new ScaleEvidenceValidationError(`stored set ${row.id} has duplicate conflict claim`);
    seen.add(key);
    conflicts.push(claim);
  }
  // Declaration/cardinality coherence (mirrors the DB CHECK).
  if (row.declaration === "CONFLICTS" && (conflicts.length < 1 || conflicts.length > MAX_CLAIMS))
    throw new ScaleEvidenceValidationError(`stored set ${row.id} declaration/cardinality mismatch`);
  if (row.declaration === "NO_OPERATIVE_CONFLICT" && conflicts.length !== 0)
    throw new ScaleEvidenceValidationError(`stored set ${row.id} declaration/cardinality mismatch`);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    novelId: row.novelId,
    chapterVersionId: row.chapterVersionId,
    sourceBranchId: row.sourceBranchId,
    sourceRevisionId: row.sourceRevisionId,
    sequence: row.sequence,
    declaration: row.declaration,
    explanation,
    conflicts,
    previousSetId: row.previousSetId,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ScaleEvidenceServices {
  readCurrent(input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    actorUserId: string;
  }): Promise<{
    chapterVersionId: string | null;
    branchId: string | null;
    currentHeadRevisionId: string | null;
    assessment: ScaleEvidenceSetRecord | null;
    status: ScaleEvidenceStatus;
    staleReasons: ScaleEvidenceStaleReason[];
  }>;
  listHistory(input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
    beforeSequence?: number;
    limit?: number;
    actorUserId: string;
  }): Promise<{ items: ScaleEvidenceSetRecord[]; nextBeforeSequence: number | null }>;
  appendSet(input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
    expectedBranchId: string;
    expectedHeadRevisionId: string | null;
    expectedSetId: string | null;
    declaration: ScaleEvidenceDeclaration;
    explanation: string;
    conflicts: unknown;
    actorUserId: string;
  }): Promise<ScaleEvidenceSetRecord>;
}

export function createScaleEvidenceServices(deps: {
  db: NovelForgeDb;
}): ScaleEvidenceServices {
  const { db } = deps;

  /**
   * Tenant gate + capability enforcement. Missing membership is a 404, not
   * a 403 — the caller must not learn whether a foreign novel exists.
   * Capabilities are enforced inside the service (not only routes) so
   * direct service callers cannot bypass authorization.
   */
  async function requireNovelMembership(
    workspaceId: string,
    novelId: string,
    actorUserId: string,
    capabilities: Capability[],
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { id: true, role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    for (const capability of capabilities) {
      requireCapability(membership.role, capability);
    }
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true, currentBranchId: true },
    });
    if (!novel) throw new NotFoundError("novel");
    return novel;
  }

  async function requireChapter(
    workspaceId: string,
    novelId: string,
    chapterId: string,
  ) {
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, novelId, novel: { workspaceId } },
      select: { id: true, currentVersionId: true },
    });
    if (!chapter) throw new NotFoundError("chapter");
    return chapter;
  }

  /**
   * Resolve the server checked-out branch for a novel (never client-supplied).
   */
  async function resolveCheckedOutBranch(novelId: string, currentBranchId: string | null) {
    const branch = await db.novelBranch.findFirst({
      where: currentBranchId
        ? { id: currentBranchId, novelId }
        : { novelId, name: "main" },
      select: { id: true, headRevisionId: true },
    });
    if (!branch) throw new ConflictError("no checked-out branch exists");
    return branch;
  }

  /**
   * Latest set for a branch/version by sequence (descending).
   */
  async function latestSet(
    tx: Pick<NovelForgeDb, "scaleEvidenceSet">,
    sourceBranchId: string,
    chapterVersionId: string,
  ) {
    return tx.scaleEvidenceSet.findFirst({
      where: { sourceBranchId, chapterVersionId },
      orderBy: { sequence: "desc" },
    });
  }

  return {
    async readCurrent({ workspaceId, novelId, chapterId, actorUserId }) {
      // Capability + membership gate (404 for non-members, 403 for members
      // lacking chapter:read). This check is intentionally outside the
      // RepeatableRead snapshot; all applicability reads below are inside.
      await requireNovelMembership(workspaceId, novelId, actorUserId, [
        "chapter:read",
      ]);

      // All applicability reads — checkout, chapter version, branch head,
      // latest assessment — inside ONE RepeatableRead transaction, so a
      // concurrent save/checkout cannot combine independently read values
      // into a false CURRENT response.
      return db.$transaction(
        async (tx) => {
          const chapter = await tx.chapter.findFirst({
            where: { id: chapterId, novelId, novel: { workspaceId } },
            select: { id: true, currentVersionId: true },
          });
          if (!chapter) throw new NotFoundError("chapter");

          // Unsaved chapter: null version, UNASSESSED. Never fill absence
          // with historical or another branch's evidence.
          if (!chapter.currentVersionId) {
            return {
              chapterVersionId: null,
              branchId: null,
              currentHeadRevisionId: null,
              assessment: null,
              status: "UNASSESSED" as ScaleEvidenceStatus,
              staleReasons: ["UNASSESSED" as ScaleEvidenceStaleReason],
            };
          }
          const currentVersionId: string = chapter.currentVersionId;

          const novel = await tx.novel.findFirst({
            where: { id: novelId, workspaceId },
            select: { currentBranchId: true },
          });
          if (!novel) throw new NotFoundError("novel");
          const branch = await tx.novelBranch.findFirst({
            where: novel.currentBranchId
              ? { id: novel.currentBranchId, novelId }
              : { novelId, name: "main" },
            select: { id: true, headRevisionId: true },
          });
          if (!branch) throw new ConflictError("no checked-out branch exists");
          const latest = await latestSet(tx, branch.id, currentVersionId);

          if (!latest) {
            return {
              chapterVersionId: currentVersionId,
              branchId: branch.id,
              currentHeadRevisionId: branch.headRevisionId,
              assessment: null,
              status: "UNASSESSED" as ScaleEvidenceStatus,
              staleReasons: ["UNASSESSED" as ScaleEvidenceStaleReason],
            };
          }

          const assessment = toRecord(latest);
          // CURRENT only when the latest set's source revision equals the
          // branch's actual head (null-safe). Any head change — even an
          // unrelated one — conservatively yields STALE.
          const revisionMatches =
            assessment.sourceRevisionId === branch.headRevisionId;
          if (revisionMatches) {
            return {
              chapterVersionId: currentVersionId,
              branchId: branch.id,
              currentHeadRevisionId: branch.headRevisionId,
              assessment,
              status: "CURRENT" as ScaleEvidenceStatus,
              staleReasons: [] as ScaleEvidenceStaleReason[],
            };
          }
          return {
            chapterVersionId: currentVersionId,
            branchId: branch.id,
            currentHeadRevisionId: branch.headRevisionId,
            assessment,
            status: "STALE" as ScaleEvidenceStatus,
            staleReasons: ["SOURCE_REVISION_CHANGED" as ScaleEvidenceStaleReason],
          };
        },
        { isolationLevel: "RepeatableRead" },
      );
    },

    async listHistory({
      workspaceId,
      novelId,
      chapterId,
      chapterVersionId,
      beforeSequence,
      limit,
      actorUserId,
    }) {
      await requireNovelMembership(workspaceId, novelId, actorUserId, [
        "chapter:read",
      ]);
      await requireChapter(workspaceId, novelId, chapterId);
      // The version must belong to the route chapter (tenant-safe 404).
      const version = await db.chapterVersion.findFirst({
        where: { id: chapterVersionId, chapterId, chapter: { novelId, novel: { workspaceId } } },
        select: { id: true },
      });
      if (!version) throw new NotFoundError("chapter version");

      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { currentBranchId: true },
      });
      if (!novel) throw new NotFoundError("novel");
      // Reading older version history is allowed; the checked-out branch is
      // resolved on the server and current applicability is never implied.
      const branch = await resolveCheckedOutBranch(novelId, novel.currentBranchId);

      const take = Math.min(Math.max(limit ?? 20, 1), 100);
      const where = {
        sourceBranchId: branch.id,
        chapterVersionId,
        ...(beforeSequence !== undefined ? { sequence: { lt: beforeSequence } } : {}),
      };
      // Fetch one extra to determine whether another page exists.
      const rows = await db.scaleEvidenceSet.findMany({
        where,
        orderBy: { sequence: "desc" },
        take: take + 1,
      });
      const items = rows.slice(0, take).map(toRecord);
      // Exclusive cursor: the last DISPLAYED sequence. The next page uses
      // `sequence < nextBeforeSequence`, so using the first omitted row
      // would skip it. Only set when another page exists.
      const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
      const nextBeforeSequence =
        rows.length > take && lastItem ? lastItem.sequence : null;
      return { items, nextBeforeSequence };
    },

    async appendSet({
      workspaceId,
      novelId,
      chapterId,
      chapterVersionId,
      expectedBranchId,
      expectedHeadRevisionId,
      expectedSetId,
      declaration,
      explanation,
      conflicts,
      actorUserId,
    }) {
      if (declaration !== "CONFLICTS" && declaration !== "NO_OPERATIVE_CONFLICT")
        throw new ScaleEvidenceValidationError("declaration must be CONFLICTS or NO_OPERATIVE_CONFLICT");
      const trimmedExplanation =
        typeof explanation === "string" ? explanation.trim() : "";
      if (trimmedExplanation.length === 0)
        throw new ScaleEvidenceValidationError("explanation is required");
      if (trimmedExplanation.length > MAX_EXPLANATION_LENGTH)
        throw new ScaleEvidenceValidationError(`explanation exceeds ${MAX_EXPLANATION_LENGTH} characters`);

      // Membership + dual-write capability gate before the transaction
      // (404 for non-members; 403 for members lacking capabilities).
      await requireNovelMembership(workspaceId, novelId, actorUserId, [
        "chapter:update",
        "canon:manage",
      ]);

      return db.$transaction(async (tx) => {
        // Lock order follows lockManuscriptBranch: novel FOR NO KEY UPDATE,
        // checked-out branch FOR UPDATE, then chapter FOR UPDATE.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
          novelId,
        );
        const lockedNovel = await tx.novel.findUniqueOrThrow({
          where: { id: novelId },
          select: { currentBranchId: true, workspaceId: true },
        });
        if (lockedNovel.workspaceId !== workspaceId) throw new NotFoundError("novel");
        const branch = await tx.novelBranch.findFirst({
          where: lockedNovel.currentBranchId
            ? { id: lockedNovel.currentBranchId, novelId }
            : { novelId, name: "main" },
          select: { id: true, headRevisionId: true, novelId: true },
        });
        if (!branch) throw new ConflictError("no checked-out branch exists");
        await tx.$queryRawUnsafe(
          `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          branch.id,
        );
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId, novel: { workspaceId } },
          select: { id: true, currentVersionId: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
        await tx.$queryRawUnsafe(
          `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
          chapter.id,
        );

        // Recheck all expectations under the locks. The chapter row was
        // re-read above AFTER acquiring its lock, so currentVersionId is
        // fresh: reject a stale submitted version with 409.
        if (chapter.currentVersionId !== chapterVersionId)
          throw new ConflictError("chapter version is no longer current", {
            currentHeadRevisionId: branch.headRevisionId,
          });
        if (branch.id !== expectedBranchId)
          throw new ConflictError("checked-out branch changed", {
            currentHeadRevisionId: branch.headRevisionId,
          });
        // Null-safe head comparison: null means an actual headless branch.
        const headMatches =
          branch.headRevisionId === expectedHeadRevisionId;
        if (!headMatches)
          throw new ConflictError("branch head changed", {
            currentHeadRevisionId: branch.headRevisionId,
          });

        // The submitted version must belong to the scoped chapter/novel.
        const version = await tx.chapterVersion.findFirst({
          where: {
            id: chapterVersionId,
            chapterId: chapter.id,
            chapter: { novelId, novel: { workspaceId } },
          },
          select: { id: true, content: true },
        });
        if (!version) throw new NotFoundError("chapter version");

        // Validate claims against the immutable version content.
        const normalizedConflicts = validateConflicts(declaration, conflicts, version.content);

        // Latest set by sequence, compared null-safe against expectedSetId.
        const latest = await latestSet(tx, branch.id, chapterVersionId);
        const latestId = latest ? latest.id : null;
        if (latestId !== expectedSetId)
          throw new ConflictError("a newer assessment set exists", {
            currentHeadRevisionId: branch.headRevisionId,
          });

        const sequence = (latest ? latest.sequence : 0) + 1;
        const created = await tx.scaleEvidenceSet.create({
          data: {
            id: randomUUID(),
            workspaceId,
            novelId,
            chapterVersionId,
            sourceBranchId: branch.id,
            sourceRevisionId: branch.headRevisionId,
            sequence,
            declaration,
            explanation: trimmedExplanation,
            conflictsJson: normalizedConflicts as unknown as InputJsonValue,
            previousSetId: latestId,
            actorUserId,
          },
        });
        return toRecord(created);
      });
    },
  };
}
