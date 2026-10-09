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
import {
  fingerprintScalePolicy,
  type ScalePolicySnapshot,
} from "./scale-review-types.ts";

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

/**
 * A retained scale_evidence_sets row as read from the database.
 */
type StoredSetRow = {
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
};

/**
 * Bounded predecessor-chain validation for a retained set. Sequence 1
 * requires previousSetId null. For sequence n > 1 the referenced
 * predecessor row must exist (a single bounded findUnique — never a
 * history scan) and match on workspace, novel, branch and version, with
 * sequence exactly n-1. Broken chains are rejected explicitly with
 * ScaleEvidenceValidationError (400); never silently repaired.
 */
async function validatePredecessor(
  dbClient: Pick<NovelForgeDb, "scaleEvidenceSet">,
  row: StoredSetRow,
): Promise<void> {
  const where = `stored set ${row.id}`;
  if (row.sequence === 1) {
    if (row.previousSetId !== null)
      throw new ScaleEvidenceValidationError(`${where} first set must have null previousSetId`);
    return;
  }
  if (row.previousSetId === null)
    throw new ScaleEvidenceValidationError(`${where} non-first set must have previousSetId`);
  const pred = await dbClient.scaleEvidenceSet.findUnique({
    where: { id: row.previousSetId },
    select: {
      workspaceId: true,
      novelId: true,
      sourceBranchId: true,
      chapterVersionId: true,
      sequence: true,
    },
  });
  if (!pred)
    throw new ScaleEvidenceValidationError(`${where} predecessor ${row.previousSetId} not found`);
  if (
    pred.workspaceId !== row.workspaceId ||
    pred.novelId !== row.novelId ||
    pred.sourceBranchId !== row.sourceBranchId ||
    pred.chapterVersionId !== row.chapterVersionId
  )
    throw new ScaleEvidenceValidationError(`${where} predecessor scope mismatch`);
  if (pred.sequence !== row.sequence - 1)
    throw new ScaleEvidenceValidationError(
      `${where} predecessor sequence ${pred.sequence} is not ${row.sequence - 1}`,
    );
}

/**
 * Validate a retained row's shape and content before serialization. Reuses
 * the write-time `validateConflicts` (which enforces bounds, quote match,
 * trimmed nonempty strings and strict schemas against the immutable version
 * content) instead of a divergent shape-only validator. Also enforces tenant
 * and source-branch consistency. Predecessor-chain integrity is verified
 * separately by validatePredecessor (bounded single-row lookup) — callers
 * must use toValidatedRecord, never toRecord directly. Any failure throws
 * ScaleEvidenceValidationError (400); corrupt data is never returned as
 * CURRENT and never silently repaired.
 *
 * Fork semantics: the source revision's `branchId` is NOT required to equal
 * `sourceBranchId` — a branch head may be a revision created on its parent
 * branch. Only existence (FK) and novel/workspace tenant match are checked.
 */
function toRecord(
  row: StoredSetRow,
  opts: {
    /** Immutable ChapterVersion.content the claims anchor to. */
    content: string;
    /** Request scope for tenant consistency. */
    workspaceId: string;
    novelId: string;
    /** Server-resolved branch for source consistency. */
    sourceBranchId: string;
  },
): ScaleEvidenceSetRecord {
  const where = `stored set ${row.id}`;
  // Tenant consistency: the row must belong to the request scope.
  if (row.workspaceId !== opts.workspaceId || row.novelId !== opts.novelId)
    throw new ScaleEvidenceValidationError(`${where} tenant mismatch`);
  // Source-branch consistency: the row must have been created on the branch
  // it is read for. (Callers filter by sourceBranchId; this is defense-in-depth.)
  if (row.sourceBranchId !== opts.sourceBranchId)
    throw new ScaleEvidenceValidationError(`${where} source branch mismatch`);
  // Declaration validity.
  if (row.declaration !== "CONFLICTS" && row.declaration !== "NO_OPERATIVE_CONFLICT")
    throw new ScaleEvidenceValidationError(`${where} has invalid declaration`);
  // Sequence: positive integer.
  if (!Number.isInteger(row.sequence) || row.sequence <= 0)
    throw new ScaleEvidenceValidationError(`${where} has invalid sequence`);
  // Explanation: trimmed nonempty (rejects whitespace-only), max length.
  const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
  if (explanation.length === 0 || explanation.length > MAX_EXPLANATION_LENGTH)
    throw new ScaleEvidenceValidationError(`${where} has invalid explanation`);
  // Predecessor-chain integrity is verified by validatePredecessor (bounded
  // single-row lookup) at every call site before toRecord runs.
  // Claims: reuse the write-time validator against the immutable content.
  // This enforces integer bounds within content length, quote match at the
  // span (same normalization as write time), trimmed nonempty strings,
  // strict nested schemas and duplicate rejection. Forged quotes or
  // out-of-bounds spans fail here and can never become CURRENT.
  const conflicts = validateConflicts(
    row.declaration,
    row.conflictsJson,
    opts.content,
  );
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

/**
 * Serialize a retained row after full validation: bounded predecessor-chain
 * check first, then shape/content validation via toRecord. Every read path
 * (readCurrent, listHistory) and the append path must use this wrapper —
 * never toRecord directly — so a broken chain can never be serialized.
 */
async function toValidatedRecord(
  dbClient: Pick<NovelForgeDb, "scaleEvidenceSet">,
  row: StoredSetRow,
  opts: {
    content: string;
    workspaceId: string;
    novelId: string;
    sourceBranchId: string;
  },
): Promise<ScaleEvidenceSetRecord> {
  await validatePredecessor(dbClient, row);
  return toRecord(row, opts);
}

/**
 * Latest set for a branch/version by sequence (descending). Module scope so
 * both the 050A service and the 050B transaction-compatible context reader
 * share one implementation.
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

          // Validate the retained set against its immutable source before
          // serialization. Fetch the version content for quote/span checks.
          const version = await tx.chapterVersion.findUniqueOrThrow({
            where: { id: currentVersionId },
            select: { content: true },
          });
          // Source-revision tenant check: the FK guarantees the revision
          // exists; verify it belongs to this novel/workspace. Fork
          // semantics: do NOT require revision.branchId === sourceBranchId —
          // a branch head may be a revision created on its parent branch.
          if (latest.sourceRevisionId !== null) {
            const sourceRev = await tx.revision.findUnique({
              where: { id: latest.sourceRevisionId },
              select: { novelId: true, workspaceId: true },
            });
            if (
              !sourceRev ||
              sourceRev.novelId !== novelId ||
              sourceRev.workspaceId !== workspaceId
            )
              throw new ScaleEvidenceValidationError(
                `stored set ${latest.id} source revision tenant mismatch`,
              );
          }
          const assessment = await toValidatedRecord(tx, latest, {
            content: version.content,
            workspaceId,
            novelId,
            sourceBranchId: branch.id,
          });
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
      // Content is fetched for retained-evidence validation (quote/span
      // checks against the immutable source).
      const version = await db.chapterVersion.findFirst({
        where: { id: chapterVersionId, chapterId, chapter: { novelId, novel: { workspaceId } } },
        select: { id: true, content: true },
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
      // Source-revision tenant check per row: the FK guarantees the revision
      // exists; verify it belongs to this novel/workspace. Fork semantics:
      // do NOT require revision.branchId === sourceBranchId.
      for (const row of rows) {
        if (row.sourceRevisionId !== null) {
          const sourceRev = await db.revision.findUnique({
            where: { id: row.sourceRevisionId },
            select: { novelId: true, workspaceId: true },
          });
          if (
            !sourceRev ||
            sourceRev.novelId !== novelId ||
            sourceRev.workspaceId !== workspaceId
          )
            throw new ScaleEvidenceValidationError(
              `stored set ${row.id} source revision tenant mismatch`,
            );
        }
      }
      const items: ScaleEvidenceSetRecord[] = [];
      for (const row of rows.slice(0, take)) {
        items.push(
          await toValidatedRecord(db, row, {
            content: version.content,
            workspaceId,
            novelId,
            sourceBranchId: branch.id,
          }),
        );
      }
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
          select: { id: true, novelId: true },
        });
        if (!branch) throw new ConflictError("no checked-out branch exists");
        // The locking query itself returns the authoritative head: any
        // concurrent head change waits on this lock, so the value read here
        // is fresh. Never use a pre-lock cached headRevisionId.
        const [lockedBranch] = await tx.$queryRawUnsafe<
          { id: string; head_revision_id: string | null }[]
        >(
          `SELECT id, head_revision_id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          branch.id,
        );
        if (!lockedBranch) throw new ConflictError("no checked-out branch exists");
        const lockedBranchId: string = lockedBranch.id;
        const lockedHeadRevisionId: string | null = lockedBranch.head_revision_id;
        const chapter = await tx.chapter.findFirst({
          where: { id: chapterId, novelId, novel: { workspaceId } },
          select: { id: true },
        });
        if (!chapter) throw new NotFoundError("chapter");
        // The locking query itself returns the authoritative currentVersionId:
        // a concurrent save waits on this lock, so the value read here is
        // fresh. Never compare against a pre-lock cached value.
        const [lockedChapter] = await tx.$queryRawUnsafe<
          { id: string; current_version_id: string | null }[]
        >(
          `SELECT id, current_version_id FROM chapters WHERE id = $1 FOR UPDATE`,
          chapter.id,
        );
        if (!lockedChapter) throw new NotFoundError("chapter");
        const lockedChapterId: string = lockedChapter.id;
        const lockedCurrentVersionId: string | null = lockedChapter.current_version_id;

        // Ownership first: a missing/foreign version is 404, never 409.
        // The submitted version must belong to the scoped chapter/novel.
        const version = await tx.chapterVersion.findFirst({
          where: {
            id: chapterVersionId,
            chapterId: lockedChapterId,
            chapter: { novelId, novel: { workspaceId } },
          },
          select: { id: true, content: true },
        });
        if (!version) throw new NotFoundError("chapter version");

        // Recheck all expectations under the locks, using ONLY post-lock
        // values. A stale submitted version (obsolete but owned) is 409.
        if (lockedCurrentVersionId !== chapterVersionId)
          throw new ConflictError("chapter version is no longer current", {
            currentHeadRevisionId: lockedHeadRevisionId,
          });
        if (lockedBranchId !== expectedBranchId)
          throw new ConflictError("checked-out branch changed", {
            currentHeadRevisionId: lockedHeadRevisionId,
          });
        // Null-safe head comparison: null means an actual headless branch.
        const headMatches =
          lockedHeadRevisionId === expectedHeadRevisionId;
        if (!headMatches)
          throw new ConflictError("branch head changed", {
            currentHeadRevisionId: lockedHeadRevisionId,
          });

        // Validate claims against the immutable version content.
        const normalizedConflicts = validateConflicts(declaration, conflicts, version.content);

        // Latest set by sequence, compared null-safe against expectedSetId.
        const latest = await latestSet(tx, lockedBranchId, chapterVersionId);
        const latestId = latest ? latest.id : null;
        if (latestId !== expectedSetId)
          throw new ConflictError("a newer assessment set exists", {
            currentHeadRevisionId: lockedHeadRevisionId,
          });

        // The append extends retained history: the latest set it links to
        // must itself be the tip of an intact chain. A corrupt chain violates
        // the append precondition (the client's expectedSetId asserts a valid
        // tip), so this is a 409 conflict — and critically, no new row is
        // created below.
        if (latest) {
          try {
            await validatePredecessor(tx, latest);
          } catch (err) {
            if (err instanceof ScaleEvidenceValidationError) {
              throw new ConflictError(
                "predecessor chain is corrupt; cannot extend retained history",
                { currentHeadRevisionId: lockedHeadRevisionId },
              );
            }
            throw err;
          }
        }

        const sequence = (latest ? latest.sequence : 0) + 1;
        const created = await tx.scaleEvidenceSet.create({
          data: {
            id: randomUUID(),
            workspaceId,
            novelId,
            chapterVersionId,
            sourceBranchId: lockedBranchId,
            sourceRevisionId: lockedHeadRevisionId,
            sequence,
            declaration,
            explanation: trimmedExplanation,
            conflictsJson: normalizedConflicts as unknown as InputJsonValue,
            previousSetId: latestId,
            actorUserId,
          },
        });
        // Validate the created row through the same retained-evidence path
        // (defense-in-depth; claims were already validated pre-insert, and
        // the predecessor was validated above).
        // sourceRevisionId comes from the locked branch head (valid or null
        // for headless), so no separate revision tenant check is needed here.
        return await toValidatedRecord(tx, created, {
          content: version.content,
          workspaceId,
          novelId,
          sourceBranchId: lockedBranchId,
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 050B Slice 1: transaction-compatible SCALE context reader
// ---------------------------------------------------------------------------

/**
 * Frozen SCALE review context returned by `readScaleContext`. Part of the
 * Slice 1 frozen interfaces consumed by the deterministic reviewer (Slice 2)
 * and the shared API/worker gate (Slice 2).
 */
export interface ScaleReviewContext {
  /** Immutable chapter version the review pins to. */
  chapterVersion: { id: string; content: string };
  /** Server-resolved checked-out branch (never client-supplied). */
  branch: { id: string; headRevisionId: string | null };
  /**
   * Branch head revision id. Null denotes an actual headless branch; the
   * context reader still returns it (nullable) for guidance/050A authoring —
   * review itself refuses a headless participating branch with 409.
   */
  headRevisionId: string | null;
  /**
   * Latest assessment set for the branch/version, fully validated against
   * the immutable version content via the 050A retained-evidence validators
   * (quote/span/predecessor); null when no set exists.
   */
  latestSet: ScaleEvidenceSetRecord | null;
  /** Approved SCALE policy snapshot; null = explicitly absent. */
  policy: ScalePolicySnapshot | null;
  /** SHA-256 hex of the canonical policy representation (explicit absence). */
  policyFingerprint: string;
}

/**
 * Transaction client surface required by `readScaleContext`. The caller
 * passes the transaction it already holds (e.g. `reviewFinalText` after
 * acquiring novel NO KEY UPDATE -> branch UPDATE -> chapter UPDATE); the
 * reader performs no locking of its own.
 */
export type ScaleReviewContextTx = Pick<
  NovelForgeDb,
  | "chapter"
  | "novel"
  | "novelBranch"
  | "chapterVersion"
  | "scaleEvidenceSet"
  | "narrativePolicy"
>;

/**
 * Read the frozen SCALE review context inside the caller's transaction
 * (NF-WF-050B Slice 1).
 *
 * Reads, in order: the tenant-scoped immutable chapter version, the
 * server-resolved checked-out branch, the latest validated assessment set
 * for that branch/version, and the approved SCALE policy snapshot. The
 * latest set is validated with the 050A retained-evidence validators
 * (`toValidatedRecord`: quote/span bounds, trimmed nonempty strings,
 * strict schemas, predecessor chain); corrupt retained rows throw
 * `ScaleEvidenceValidationError` and can never surface as review context.
 *
 * Transaction-client-only helper: the caller must already hold the review
 * lock order and must enforce authorization itself (this helper applies
 * tenant scoping to every read but performs no capability checks). No
 * LLM/human wait and no story-head advance happen here.
 */
export async function readScaleContext(
  tx: ScaleReviewContextTx,
  input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
  },
): Promise<ScaleReviewContext> {
  const { workspaceId, novelId, chapterId, chapterVersionId } = input;

  // Tenant-scoped immutable version. A missing version, or one belonging
  // to another chapter/novel/workspace, is 404 (never 409).
  const chapterVersion = await tx.chapterVersion.findFirst({
    where: {
      id: chapterVersionId,
      chapterId,
      chapter: { novelId, novel: { workspaceId } },
    },
    select: { id: true, content: true },
  });
  if (!chapterVersion) throw new NotFoundError("chapter version");

  // Server-resolved checked-out branch (never client-supplied).
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

  // Latest assessment set for this branch/version, validated against the
  // immutable version content with the 050A retained-evidence validators.
  const latest = await latestSet(tx, branch.id, chapterVersionId);
  const latestSetRecord = latest
    ? await toValidatedRecord(tx, latest, {
        content: chapterVersion.content,
        workspaceId,
        novelId,
        sourceBranchId: branch.id,
      })
    : null;

  // Approved SCALE policy snapshot. `updatedAt` is never read: the
  // fingerprint must not depend on it, and `id` is never the sole version
  // signal. Null = explicitly absent (NOT_CONFIGURED), never legacy proof.
  const policyRow = await tx.narrativePolicy.findUnique({
    where: { novelId_kind: { novelId, kind: "SCALE" } },
    select: { id: true, kind: true, hardness: true, hardReason: true, payload: true },
  });
  const policy: ScalePolicySnapshot | null = policyRow
    ? {
        id: policyRow.id,
        kind: policyRow.kind,
        hardness: policyRow.hardness,
        hardReason: policyRow.hardReason,
        payload: policyRow.payload,
      }
    : null;

  return {
    chapterVersion: { id: chapterVersion.id, content: chapterVersion.content },
    branch: { id: branch.id, headRevisionId: branch.headRevisionId },
    headRevisionId: branch.headRevisionId,
    latestSet: latestSetRecord,
    policy,
    policyFingerprint: fingerprintScalePolicy(policy),
  };
}
