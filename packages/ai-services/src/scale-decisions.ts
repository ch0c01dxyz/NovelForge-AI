/**
 * NF-WF-050B Slice 2 — S2 author decision service and deterministic SCALE review.
 *
 * This module implements:
 * - `assessScaleDeterministic`: pure deterministic SCALE assessment (protocol 1)
 * - `createScaleDecisionServices`: proposal/decision service with CAS and authorization
 *
 * The deterministic assessment follows the contract's 8-row table:
 * - NOT_CONFIGURED: no SCALE policy → no hold, never label SCALE PASS
 * - INCOMPLETE: configured HARD with malformed/missing/stale input → FAIL, hold
 * - WITHIN_REACH: complete claims inside validated reach → no hold
 * - VIOLATION: complete claims beyond reach, HARD → FAIL unless exception covers all
 * - EXCEPTED: approved scoped resolution of all violations → no hold
 * - NO_OPERATIVE_CONFLICT: explicit no-conflict declaration → quiet chapter
 *
 * INCOMPLETE never fabricates proved violations. hardViolations includes only
 * proved hard violations. Overall FAIL also includes blocking INCOMPLETE.
 */
import { createHash, randomUUID } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import {
  NotFoundError,
  ConflictError,
  MemoryError,
  type AuditService,
} from "@novelforge/ai-services";
import { isValidScalePayload, scaleStandingOf } from "./narrative.ts";
import { advanceForMutation } from "./revisions.ts";
import type { ScalePolicySnapshot } from "./scale-review-types.ts";
import {
  readScaleContext,
  type ScaleReviewContext,
  type ScaleReviewContextTx,
} from "./scale-evidence.ts";
import {
  assessScaleAppropriateness,
  NARRATIVE_SCALES,
  type NarrativeScale,
} from "@novelforge/narrative-rhythm";
import type {
  ScaleReviewProtocol,
  ScaleReviewPins,
  ScaleReviewClaim,
} from "./scale-review-types.ts";

// ---------------------------------------------------------------------------
// Deterministic assessment
// ---------------------------------------------------------------------------

/** Input claims for deterministic assessment (from validated evidence set). */
export interface AssessmentClaimInput {
  index: number;
  scale: NarrativeScale;
  span: { start: number; end: number };
  quote: string;
}

/**
 * Deterministic SCALE assessment (protocol 1).
 *
 * Pure function: no IO, no database, no randomness. Implements the contract's
 * 8-row decision table. The `exceptionOutcomeId` covers specific claim indices;
 * only claims explicitly covered count as EXCEPTED.
 */
export function assessScaleDeterministic(input: {
  context: ScaleReviewContext;
  claims: AssessmentClaimInput[];
  /** Claim indices covered by the applicable approved exception (empty if none). */
  exceptionCoveredIndices: number[];
  /** Explicit NO_OPERATIVE_CONFLICT declaration (author-declared, validated). */
  noOperativeConflict: boolean;
}): ScaleReviewProtocol {
  const { context, claims, exceptionCoveredIndices, noOperativeConflict } = input;
  const { policy, policyFingerprint, branch, chapterVersion, latestSet } = context;

  const pins: ScaleReviewPins = {
    chapterVersionId: chapterVersion.id,
    branchId: branch.id,
    sourceRevisionId: context.headRevisionId,
    evidenceSetId: latestSet?.id ?? null,
    policyFingerprint,
    exceptionOutcomeId:
      exceptionCoveredIndices.length > 0 ? "applicable" : null, // resolved by caller
  };

  // No SCALE policy → NOT_CONFIGURED. Never label SCALE PASS.
  if (!policy) {
    return {
      protocol: 1,
      state: "NOT_CONFIGURED",
      blocking: false,
      pins,
      claims: [],
      missingData: [],
    };
  }

  const hardness = policy.hardness;
  const isHard = hardness === "HARD";
  const missingData: ScaleReviewProtocol["missingData"] = [];

  // Provenance FIRST (GAP-119): the evidence set must exist and be fresh
  // before any complete state. A stale quiet declaration must HOLD a HARD
  // review — it must never silently gain a receipt pinned to a newer head.
  // Missing set → INCOMPLETE (HARD blocks; SOFT advisory).
  if (!latestSet) {
    missingData.push({
      code: "MISSING_EVIDENCE_SET",
      field: "evidenceSet",
      reason: "No SCALE evidence set exists for this branch/version",
      explanation:
        "SCALE review requires an author-appended evidence set for the current branch and chapter version.",
      example:
        "Example (hypothetical): append an evidence set with ACTION/STAKES/CONSEQUENCE claims, or declare no operative conflict.",
      nextAction:
        "Append a SCALE evidence set via the 050A surface, or declare NO_OPERATIVE_CONFLICT.",
    });
    return {
      protocol: 1,
      state: "INCOMPLETE",
      blocking: isHard,
      pins,
      claims: [],
      missingData,
    };
  }

  // Stale set (source revision != head) → INCOMPLETE.
  if (latestSet.sourceRevisionId !== context.headRevisionId) {
    missingData.push({
      code: "STALE_EVIDENCE_SET",
      field: "evidenceSet.sourceRevisionId",
      reason: "Evidence set is stale relative to branch head",
      explanation:
        "The latest evidence set was assessed against an older branch head. A head change requires a fresh assessment.",
      example:
        "Example (hypothetical): set pinned to revision A, but branch head is now revision B after a story mutation.",
      nextAction:
        "Append a fresh evidence set against the current head, or re-run review after confirming the set is still valid.",
    });
    return {
      protocol: 1,
      state: "INCOMPLETE",
      blocking: isHard,
      pins,
      claims: [],
      missingData,
    };
  }

  // Validate standing even for quiet chapters (after provenance).
  const standing = scaleStandingOf(policy.payload);

  if (!standing) {
    // Malformed HARD payload → INCOMPLETE (fail closed).
    // Malformed SOFT payload → INCOMPLETE but advisory only.
    missingData.push({
      code: "MALFORMED_STANDING",
      field: "policy.payload.standing",
      reason: "SCALE policy standing is malformed",
      explanation:
        "The stored SCALE policy payload does not validate as { scale, access, reputation } with valid narrative scales.",
      example:
        "Example (hypothetical): { scale: 'VILLAGE', access: [], reputation: 50 } is valid; { scale: 'UNKNOWN' } is not.",
      nextAction:
        "Re-save the SCALE policy through the policy write surface with a valid standing.",
    });
    return {
      protocol: 1,
      state: "INCOMPLETE",
      blocking: isHard,
      pins,
      claims: [],
      missingData,
    };
  }

  // Explicit NO_OPERATIVE_CONFLICT — reachable only with a fresh evidence
  // set and valid standing (provenance checked above) → quiet chapter.
  if (noOperativeConflict && claims.length === 0) {
    return {
      protocol: 1,
      state: "NO_OPERATIVE_CONFLICT",
      blocking: false,
      pins,
      claims: [],
      missingData: [],
    };
  }

  // Assess every claim using its own scale.
  const assessedClaims: ScaleReviewClaim[] = [];
  const violations: number[] = [];

  for (const claim of claims) {
    const assessment = assessScaleAppropriateness(
      { id: `claim-${claim.index}`, scale: claim.scale },
      standing,
    );
    const covered = exceptionCoveredIndices.includes(claim.index);
    const ok = assessment.ok || covered;

    assessedClaims.push({
      index: claim.index,
      scale: claim.scale,
      reach: assessment.reach,
      gap: String(assessment.gap),
      ok,
      span: claim.span,
      quote: claim.quote,
      coveredByException: covered,
    });

    if (!assessment.ok && !covered) {
      violations.push(claim.index);
    }
  }

  // All violations covered by exception → EXCEPTED.
  if (violations.length === 0 && exceptionCoveredIndices.length > 0) {
    return {
      protocol: 1,
      state: "EXCEPTED",
      blocking: false,
      pins,
      claims: assessedClaims,
      missingData: [],
    };
  }

  // Proved violations remain → VIOLATION (HARD blocks; SOFT advisory).
  if (violations.length > 0) {
    return {
      protocol: 1,
      state: "VIOLATION",
      blocking: isHard,
      pins,
      claims: assessedClaims,
      missingData: [],
    };
  }

  // All claims within reach → WITHIN_REACH.
  return {
    protocol: 1,
    state: "WITHIN_REACH",
    blocking: false,
    pins,
    claims: assessedClaims,
    missingData: [],
  };
}

/**
 * CURRENT violating claim indices for a CHAPTER_EXCEPTION prerequisite check
 * (GAP-119: exception creation/approval must verify CURRENT complete
 * evidence, valid standing and actual violating indices — not just
 * claim-index shape).
 *
 * Runs the deterministic assessment with no exception coverage against the
 * context's latest validated set. Returns the indices that are actual
 * proved violations right now, or a failure describing why no exception
 * can be warranted:
 * - 409 when evidence is missing or stale (never 400: the author must
 *   append fresh evidence, not fix a payload shape);
 * - 400 when no SCALE policy is configured or the standing is invalid.
 * A quiet chapter (NO_OPERATIVE_CONFLICT) or a within-reach assessment
 * yields zero violations, which is a 400: there is nothing to except.
 */
function currentViolatingClaimIndices(
  context: ScaleReviewContext,
):
  | { ok: true; violating: Set<number> }
  | { ok: false; status: 400 | 409; reason: string } {
  const latestSet = context.latestSet;
  if (!latestSet) {
    return {
      ok: false,
      status: 409,
      reason: "no current complete evidence set for this branch/version",
    };
  }
  if (latestSet.sourceRevisionId !== context.headRevisionId) {
    return {
      ok: false,
      status: 409,
      reason: "evidence set is stale relative to the branch head",
    };
  }
  if (!context.policy) {
    return {
      ok: false,
      status: 400,
      reason: "no SCALE policy configured",
    };
  }
  if (!scaleStandingOf(context.policy.payload)) {
    return {
      ok: false,
      status: 400,
      reason: "SCALE policy standing is invalid",
    };
  }
  const claims: AssessmentClaimInput[] = (latestSet.conflicts ?? []).map(
    (c, idx) => ({
      index: idx,
      scale: c.scale,
      span: { start: c.source.start, end: c.source.end },
      quote: c.source.quote,
    }),
  );
  const assessed = assessScaleDeterministic({
    context,
    claims,
    exceptionCoveredIndices: [],
    noOperativeConflict: latestSet.declaration === "NO_OPERATIVE_CONFLICT",
  });
  const violating = new Set(
    assessed.claims.filter((c) => !c.ok).map((c) => c.index),
  );
  if (violating.size === 0) {
    return {
      ok: false,
      status: 400,
      reason: "no current violations to except",
    };
  }
  return { ok: true, violating };
}

// ---------------------------------------------------------------------------
// S2 decision service
// ---------------------------------------------------------------------------

/** Strict payload schemas. */
function isValidStandingChangePayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  // Must contain complete standing + hardness/hardReason
  if (!isValidScalePayload({ standing: p.standing })) return false;
  if (p.hardness !== "HARD" && p.hardness !== "SOFT") return false;
  if (p.hardness === "HARD") {
    // HARD requires a nonblank reason (matches NarrativePolicy_hard_requires_reason).
    // Reject here with 400 before persistence instead of hitting the DB CHECK.
    if (typeof p.hardReason !== "string" || p.hardReason.trim().length === 0) return false;
  } else if (p.hardReason !== null && typeof p.hardReason !== "string") {
    return false;
  }
  // Reject unknown fields
  const allowed = new Set(["standing", "hardness", "hardReason"]);
  for (const key of Object.keys(p)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidChapterExceptionPayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  const indices = p.claimIndices;
  if (!Array.isArray(indices) || indices.length === 0 || indices.length > 100) {
    return false;
  }
  const seen = new Set<number>();
  for (const i of indices) {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) > 99) return false;
    if (seen.has(i as number)) return false;
    seen.add(i as number);
  }
  // Reject unknown fields
  const allowed = new Set(["claimIndices"]);
  for (const key of Object.keys(p)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

export interface ScaleDecisionDeps {
  db: NovelForgeDb;
  audit: AuditService;
}

export interface CreateProposalInput {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  chapterVersionId: string;
  expectedBranchId: string;
  expectedHeadRevisionId: string | null;
  expectedSetId: string | null;
  expectedDecisionId: string | null;
  expectedPolicyFingerprint: string;
  kind: "STANDING_CHANGE" | "CHAPTER_EXCEPTION";
  payload: unknown;
  reason: string;
  predecessorProposalId?: string | null;
}

export interface DecideProposalInput {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
  proposalId: string;
  action: "APPROVE" | "REJECT" | "ALTERNATIVE";
  reason: string;
  alternativePayload?: unknown;
  expectedBranchId: string;
  expectedHeadRevisionId: string | null;
  expectedDecisionId: string | null;
  expectedPolicyFingerprint: string;
  expectedVersionId: string;
  expectedSetId: string | null;
}

// Transaction client type for atomic composition.
// Uses RevisionTx (Omit<NovelForgeDb, ...>) which matches Prisma's tx client.
export type ScaleDecisionTx = import("./revisions.ts").RevisionTx;

export function createScaleDecisionServices(deps: ScaleDecisionDeps) {
  const { db, audit } = deps;

  async function checkCapability(
    client: Pick<NovelForgeDb, "membership" | "novel">,
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    capability: Capability,
  ): Promise<void> {
    const membership = await client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await client.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, capability);
  }

  /**
   * Create a SCALE decision proposal (transaction-aware variant).
   * Runs inside the caller's transaction; for standalone use, the public
   * createProposal wraps this in db.$transaction.
   * Requires chapter:update AND canon:manage. All expectations must match
   * current context (via readScaleContext). Returns {proposal, decisionHeadId}.
   */
  async function createProposalTx(tx: ScaleDecisionTx, input: CreateProposalInput) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        chapterId,
        chapterVersionId,
        expectedBranchId,
        expectedHeadRevisionId,
        expectedSetId,
        expectedDecisionId,
        expectedPolicyFingerprint,
        kind,
        payload,
        reason,
      } = input;

      await checkCapability(tx, actorUserId, workspaceId, novelId, "chapter:update" as Capability);
      await checkCapability(tx, actorUserId, workspaceId, novelId, "canon:manage" as Capability);

      // Validate reason
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 1 || trimmedReason.length > 4000) {
        throw new MemoryError(400, "INVALID_INPUT", "reason must be 1..4000 chars");
      }

      // Validate payload strict schema
      if (kind === "STANDING_CHANGE") {
        if (!isValidStandingChangePayload(payload)) {
          throw new MemoryError(400, "INVALID_INPUT", "standing change payload invalid");
        }
      } else {
        if (!isValidChapterExceptionPayload(payload)) {
          throw new MemoryError(400, "INVALID_INPUT", "chapter exception payload invalid");
        }
      }

      // Payload body bound (64KiB)
      const payloadJson = JSON.stringify(payload);
      if (payloadJson.length > 65536) {
        throw new MemoryError(400, "INVALID_INPUT", "payload exceeds 64KiB");
      }

      // Lock order: novel -> branch -> chapter (frozen, same as decisions).
      // GAP-119: proposal creation must lock the participating branch/chapter,
      // not just the novel, and must refuse a supplied obsolete version.
      {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR NO KEY UPDATE`;
        // Resolve and lock the checked-out branch.
        const lockedNovel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { currentBranchId: true },
        });
        if (!lockedNovel) throw new NotFoundError("novel");
        const lockedBranch = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          lockedNovel.currentBranchId ?? "",
        );
        if (!lockedBranch || lockedBranch.length === 0) {
          throw new ConflictError("no checked-out branch exists");
        }
        // Lock the chapter and read the live current version pointer.
        const lockedChapter = await tx.$queryRawUnsafe<{ id: string; current_version_id: string | null }[]>(
          `SELECT id, current_version_id FROM chapters WHERE id = $1 FOR UPDATE`,
          chapterId,
        );
        if (!lockedChapter || lockedChapter.length === 0) {
          throw new NotFoundError("chapter");
        }
        // Refuse obsolete-version proposal creation: the supplied version must
        // be the live current version. An obsolete version needs a new proposal
        // against the current version, not a backdated one.
        if (lockedChapter[0]!.current_version_id !== chapterVersionId) {
          throw new ConflictError(
            "proposal version is obsolete; create the proposal against the current chapter version",
          );
        }
        const context = await readScaleContext(tx as ScaleReviewContextTx, {
          workspaceId,
          novelId,
          chapterId,
          chapterVersionId,
        });

        // Verify all expectations match current context
        if (context.branch.id !== expectedBranchId) {
          throw new ConflictError("branch expectation mismatch");
        }
        if (context.headRevisionId !== expectedHeadRevisionId) {
          throw new ConflictError("head revision expectation mismatch");
        }
        if ((context.latestSet?.id ?? null) !== expectedSetId) {
          throw new ConflictError("evidence set expectation mismatch");
        }
        if (context.policyFingerprint !== expectedPolicyFingerprint) {
          throw new ConflictError("policy fingerprint expectation mismatch");
        }

        // Verify decision head expectation
        const latestOutcome = await tx.scaleDecisionOutcome.findFirst({
          where: {
            novelId,
            sourceBranchId: context.branch.id,
            chapterVersionId,
          },
          orderBy: { sequence: "desc" },
          select: { id: true },
        });
        if ((latestOutcome?.id ?? null) !== expectedDecisionId) {
          throw new ConflictError("decision head expectation mismatch");
        }

        // CHAPTER_EXCEPTION prerequisites (GAP-119): a CURRENT complete
        // evidence set, valid standing and actual violating claim indices —
        // not just claim-index shape. Missing/stale evidence is 409 (the
        // author must append fresh evidence); invalid standing or
        // non-violating indices are 400.
        if (kind === "CHAPTER_EXCEPTION") {
          const prereq = currentViolatingClaimIndices(context);
          if (!prereq.ok) {
            if (prereq.status === 409) {
              throw new ConflictError(`cannot create exception: ${prereq.reason}`);
            }
            throw new MemoryError(
              400,
              "INVALID_INPUT",
              `cannot create exception: ${prereq.reason}`,
            );
          }
          const requested = (payload as { claimIndices: number[] }).claimIndices;
          for (const i of requested) {
            if (!prereq.violating.has(i)) {
              throw new MemoryError(
                400,
                "INVALID_INPUT",
                `cannot create exception: claim index ${i} does not correspond to a current violating claim`,
              );
            }
          }
        }

        // Allocate proposal sequence (monotonic per branch+version)
        const maxProposal = await tx.scaleDecisionProposal.findFirst({
          where: {
            novelId,
            sourceBranchId: context.branch.id,
            chapterVersionId,
          },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        const sequence = (maxProposal?.sequence ?? 0) + 1;

        // Verify predecessor if provided
        if (input.predecessorProposalId) {
          const pred = await tx.scaleDecisionProposal.findFirst({
            where: {
              id: input.predecessorProposalId,
              novelId,
              sourceBranchId: context.branch.id,
              chapterVersionId,
            },
          });
          if (!pred) throw new NotFoundError("predecessor proposal");
        }

        const proposal = await tx.scaleDecisionProposal.create({
          data: {
            workspaceId,
            novelId,
            chapterVersionId,
            sourceBranchId: context.branch.id,
            sourceRevisionId: context.headRevisionId,
            evidenceSetId: context.latestSet?.id ?? null,
            policySnapshot: (context.policy ?? { absent: true }) as unknown as object,
            policyFingerprint: context.policyFingerprint,
            sequence,
            kind,
            payload: payload as unknown as object,
            proposerUserId: actorUserId,
            reason: trimmedReason,
            predecessorProposalId: input.predecessorProposalId ?? null,
          },
        });

        // GAP-119 (audit atomicity): write audit through the SAME tx so a
        // rolled-back proposal/outcome leaves no orphaned audit record.
        await tx.auditLog.create({
          data: {
            actorUserId,
            workspaceId,
            action: "scale.decision-proposed",
            entityType: "ScaleDecisionProposal",
            entityId: proposal.id,
            payload: { chapterVersionId, kind, sequence },
          },
        });

        return {
          proposal,
          decisionHeadId: latestOutcome?.id ?? null,
        };
      }
  }

  /**
   * Decide on a proposal (transaction-aware variant).
   * Runs inside the caller's transaction; for standalone use, the public
   * decideProposal wraps this in db.$transaction.
   * Requires chapter:update AND canon:manage AND canon:approve.
   */
  async function decideProposalTx(tx: ScaleDecisionTx, input: DecideProposalInput) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        chapterId,
        proposalId,
        action,
        reason,
        alternativePayload,
        expectedBranchId,
        expectedHeadRevisionId,
        expectedDecisionId,
        expectedPolicyFingerprint,
        expectedVersionId,
        expectedSetId,
      } = input;

      await checkCapability(tx, actorUserId, workspaceId, novelId, "chapter:update" as Capability);
      await checkCapability(tx, actorUserId, workspaceId, novelId, "canon:manage" as Capability);
      await checkCapability(tx, actorUserId, workspaceId, novelId, "canon:approve" as Capability);

      const trimmedReason = reason.trim();
      if (trimmedReason.length < 1 || trimmedReason.length > 4000) {
        throw new MemoryError(400, "INVALID_INPUT", "reason must be 1..4000 chars");
      }

      // ALTERNATIVE requires new payload; APPROVE/REJECT forbid it
      if (action === "ALTERNATIVE") {
        if (alternativePayload === undefined) {
          throw new MemoryError(400, "INVALID_INPUT", "ALTERNATIVE requires alternativePayload");
        }
      } else if (alternativePayload !== undefined) {
        throw new MemoryError(400, "INVALID_INPUT", "alternativePayload only for ALTERNATIVE");
      }

      // Frozen lock order (same as reviewFinalText and the shared gate):
      // novel NO KEY UPDATE -> checked-out branch UPDATE -> chapter UPDATE.
      // Every stored pin and every client expectation is re-read under
      // these locks; a failed expectation aborts with zero writes.
      {
        await tx.$queryRawUnsafe(
          `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
          novelId,
        );

        // Re-read the novel under lock and resolve the checked-out branch
        // from the server, never from the client.
        const lockedNovel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { id: true, currentBranchId: true },
        });
        if (!lockedNovel || !lockedNovel.currentBranchId) {
          throw new NotFoundError("novel");
        }
        const checkedOutBranchId = lockedNovel.currentBranchId;

        // Lock the checked-out branch.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          checkedOutBranchId,
        );
        const lockedBranch = await tx.novelBranch.findFirst({
          where: { id: checkedOutBranchId, novelId },
          select: { id: true, name: true },
        });
        if (!lockedBranch) throw new NotFoundError("branch");

        // Re-read the stored proposal under lock. Its pins are immutable.
        const proposal = await tx.scaleDecisionProposal.findFirst({
          where: { id: proposalId, novelId, workspaceId },
          include: { outcome: true },
        });
        if (!proposal) throw new NotFoundError("proposal");
        if (proposal.outcome) {
          throw new ConflictError("proposal already decided");
        }

        // Resolve the chapter from the proposal's immutable version pin and
        // lock it. Version/chapter/novel/workspace ownership is enforced here
        // before any decision history is read or written.
        const versionPre = await tx.chapterVersion.findFirst({
          where: { id: proposal.chapterVersionId },
          select: {
            id: true,
            chapterId: true,
            chapter: { select: { novelId: true, novel: { select: { workspaceId: true } } } },
          },
        });
        if (
          !versionPre ||
          versionPre.chapter.novelId !== novelId ||
          versionPre.chapter.novel.workspaceId !== workspaceId
        ) {
          throw new NotFoundError("chapter version");
        }
        // GAP-119: validate URL chapterId matches the proposal's chapter.
        // A mismatched URL chapter is 404 (never operate on a different chapter).
        if (versionPre.chapterId !== chapterId) {
          throw new NotFoundError("chapter");
        }
        const resolvedChapterId = versionPre.chapterId;
        await tx.$queryRawUnsafe(
          `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
          resolvedChapterId,
        );

        // Re-read current context under lock via the frozen context reader.
        // Corrupt retained evidence throws ScaleEvidenceValidationError
        // (honest 400, zero writes); missing/foreign rows throw 404. Both
        // roll the transaction back without touching decision history.
        const context = await readScaleContext(tx as ScaleReviewContextTx, {
          workspaceId,
          novelId,
          chapterId,
          chapterVersionId: proposal.chapterVersionId,
        });

        // Obsolete-version guard: the stored proposal pins an immutable version,
        // but the chapter's LIVE current pointer may have moved on. A proposal
        // for an obsolete version can never be decided — the author must
        // create a new proposal against the current version. Without this
        // check the comparison below would compare the proposal to itself
        // (context.chapterVersion is resolved FROM proposal.chapterVersionId).
        // Zero writes on 409.
        if (proposal.chapterVersionId !== context.currentVersionId) {
          throw new ConflictError(
            `proposal is for obsolete version ${proposal.chapterVersionId}; current version is ${context.currentVersionId}; create a new proposal`,
          );
        }

        // Validate the STORED proposal pins against CURRENT context. Stored
        // pins are immutable: any mismatch means the proposal is stale and
        // must NOT be repinned — the author creates a new proposal and the
        // old record is retained. Zero writes on 409.
        //
        // Exception: for APPROVE of a CHAPTER_EXCEPTION, the exception
        // applicability check below runs FIRST so that a replaced evidence
        // set (or otherwise inapplicable exception) reports the precise
        // "exception no longer applicable" refusal instead of the generic
        // stale-pin message.
        if (action === "APPROVE" && proposal.kind === "CHAPTER_EXCEPTION") {
          const prereq = currentViolatingClaimIndices(context);
          if (!prereq.ok) {
            throw new ConflictError(
              `exception no longer applicable: ${prereq.reason}`,
            );
          }
          const storedPayload = proposal.payload as { claimIndices?: unknown };
          const storedIndices = Array.isArray(storedPayload.claimIndices)
            ? (storedPayload.claimIndices as number[])
            : [];
          for (const i of storedIndices) {
            if (!prereq.violating.has(i)) {
              throw new ConflictError(
                `exception no longer applicable: claim index ${i} is not a current violating claim`,
              );
            }
          }
        }

        const mismatchedPins: string[] = [];
        if (proposal.sourceBranchId !== context.branch.id) {
          mismatchedPins.push("branchId");
        }
        if (proposal.chapterVersionId !== context.chapterVersion.id) {
          mismatchedPins.push("chapterVersionId");
        }
        if (proposal.sourceRevisionId !== context.headRevisionId) {
          mismatchedPins.push("sourceRevisionId");
        }
        if (proposal.evidenceSetId !== (context.latestSet?.id ?? null)) {
          mismatchedPins.push("evidenceSetId");
        }
        if (proposal.policyFingerprint !== context.policyFingerprint) {
          mismatchedPins.push("policyFingerprint");
        }
        if (mismatchedPins.length > 0) {
          throw new ConflictError(
            `proposal is stale (${mismatchedPins.join(", ")} no longer match current context); create a new proposal`,
          );
        }

        // Validate the CLIENT expectations against current context. Current
        // client expectations cannot repin an old proposal; any mismatch is
        // 409 with zero writes.
        if (expectedBranchId !== context.branch.id) {
          throw new ConflictError("branch expectation mismatch");
        }
        if (expectedHeadRevisionId !== context.headRevisionId) {
          throw new ConflictError("head revision expectation mismatch");
        }
        if (expectedPolicyFingerprint !== context.policyFingerprint) {
          throw new ConflictError("policy fingerprint expectation mismatch");
        }
        if (expectedVersionId !== context.currentVersionId) {
          throw new ConflictError("version expectation mismatch");
        }
        if (expectedSetId !== (context.latestSet?.id ?? null)) {
          throw new ConflictError("evidence set expectation mismatch");
        }

        // Verify decision head (concurrent stale expectedDecisionId → 409)
        const latestOutcome = await tx.scaleDecisionOutcome.findFirst({
          where: {
            novelId,
            sourceBranchId: proposal.sourceBranchId,
            chapterVersionId: proposal.chapterVersionId,
          },
          orderBy: { sequence: "desc" },
          select: { id: true },
        });
        if ((latestOutcome?.id ?? null) !== expectedDecisionId) {
          throw new ConflictError("decision head changed; concurrent decision");
        }

        // Allocate outcome sequence
        const maxOutcome = await tx.scaleDecisionOutcome.findFirst({
          where: {
            novelId,
            sourceBranchId: proposal.sourceBranchId,
            chapterVersionId: proposal.chapterVersionId,
          },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        const sequence = (maxOutcome?.sequence ?? 0) + 1;

        let resultRevisionId: string | null = null;
        let alternativeProposal: unknown = null;

        if (action === "APPROVE" && proposal.kind === "STANDING_CHANGE") {
          const payload = proposal.payload as {
            standing: { scale: string; access: string[]; reputation: number };
            hardness: string;
            hardReason: string | null;
          };

          // HIGH scale.standing.approve: advanceForMutation FIRST (before any
          // policy write) so the PRE_MUTATION checkpoint captures pre-mutation
          // state. Creates revision + change set + checkpoint + rebuild intent
          // in this SAME transaction. A missing baseline or stale head refuses
          // here with zero writes.
          //
          // ChangeSetItem.entity_id is UUID NOT NULL at the DB level. For an
          // existing policy use its actual row UUID; for initial creation
          // preallocate a UUID and use it in BOTH the change-set item and the
          // upsert's create clause so they match.
          const existingPolicy = await tx.narrativePolicy.findUnique({
            where: { novelId_kind: { novelId, kind: "SCALE" } },
            select: { id: true },
          });
          const policyId = existingPolicy?.id ?? randomUUID();
          const policyOp = existingPolicy ? "UPDATE" : "CREATE";
          const advance = await advanceForMutation(tx, {
            workspaceId,
            novelId,
            expectedHeadRevisionId: context.headRevisionId,
            branchName: lockedBranch.name,
            operation: "scale.standing.approve",
            origin: "MANUAL",
            actorUserId,
            tables: ["narrative_policies"],
            items: [
              {
                entityType: "NarrativePolicy",
                entityId: policyId,
                operation: policyOp,
              },
            ],
          });
          resultRevisionId = advance.revisionId;

          // Update the SCALE policy (REWOUND classification)
          await tx.narrativePolicy.upsert({
            where: { novelId_kind: { novelId, kind: "SCALE" } },
            update: {
              hardness: payload.hardness as "HARD" | "SOFT",
              hardReason: payload.hardReason,
              payload: { standing: payload.standing },
            },
            create: {
              id: policyId,
              novelId,
              kind: "SCALE",
              hardness: payload.hardness as "HARD" | "SOFT",
              hardReason: payload.hardReason,
              payload: { standing: payload.standing },
            },
          });
        }

        if (action === "ALTERNATIVE") {
          // Validate alternative payload (same kind, strict schema)
          const altPayload = alternativePayload as Record<string, unknown>;
          if (proposal.kind === "STANDING_CHANGE") {
            if (!isValidStandingChangePayload(altPayload)) {
              throw new MemoryError(400, "INVALID_INPUT", "alternative payload invalid");
            }
          } else {
            if (!isValidChapterExceptionPayload(altPayload)) {
              throw new MemoryError(400, "INVALID_INPUT", "alternative payload invalid");
            }
          }

          // Allocate new proposal sequence
          const maxProp = await tx.scaleDecisionProposal.findFirst({
            where: {
              novelId,
              sourceBranchId: proposal.sourceBranchId,
              chapterVersionId: proposal.chapterVersionId,
            },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const altSequence = (maxProp?.sequence ?? 0) + 1;

          const newProposal = await tx.scaleDecisionProposal.create({
            data: {
              workspaceId,
              novelId,
              chapterVersionId: proposal.chapterVersionId,
              sourceBranchId: proposal.sourceBranchId,
              sourceRevisionId: proposal.sourceRevisionId,
              evidenceSetId: proposal.evidenceSetId,
              policySnapshot: proposal.policySnapshot as unknown as object,
              policyFingerprint: proposal.policyFingerprint,
              sequence: altSequence,
              kind: proposal.kind,
              payload: altPayload as unknown as object,
              proposerUserId: actorUserId,
              reason: trimmedReason,
              predecessorProposalId: proposal.id,
            },
          });
          alternativeProposal = newProposal;
        }

        const outcome = await tx.scaleDecisionOutcome.create({
          data: {
            proposalId: proposal.id,
            workspaceId,
            novelId,
            chapterVersionId: proposal.chapterVersionId,
            sourceBranchId: proposal.sourceBranchId,
            sequence,
            action,
            actorUserId,
            reason: trimmedReason,
            alternativeProposalId:
              alternativeProposal !== null
                ? (alternativeProposal as { id: string }).id
                : null,
            resultRevisionId,
          },
        });

        // GAP-119 (audit atomicity): write audit through the SAME tx so a
        // rolled-back outcome leaves no orphaned audit record.
        await tx.auditLog.create({
          data: {
            actorUserId,
            workspaceId,
            action: `scale.decision-${action.toLowerCase()}`,
            entityType: "ScaleDecisionOutcome",
            entityId: outcome.id,
            payload: { proposalId, action, sequence },
          },
        });

        // GAP-119: return the ACTUAL committed head. For APPROVE
        // STANDING_CHANGE, advanceForMutation commits a new revision, so the
        // client must use resultRevisionId (not the stale pre-decision head)
        // for subsequent expectations.
        return {
          outcome,
          alternativeProposal,
          currentHeadRevisionId: resultRevisionId ?? context.headRevisionId,
        };
      }
  }

  return {
    /**
     * Create a SCALE decision proposal (standalone).
     * Wraps createProposalTx in its own transaction.
     */
    async createProposal(input: CreateProposalInput) {
      return db.$transaction((tx) => createProposalTx(tx as ScaleDecisionTx, input));
    },

    /**
     * Decide on a proposal (standalone).
     * Wraps decideProposalTx in its own transaction.
     */
    async decideProposal(input: DecideProposalInput) {
      return db.$transaction((tx) => decideProposalTx(tx as ScaleDecisionTx, input));
    },

    // Transaction-aware variants for atomic composition
    // (e.g., direct SCALE PUT in narrative.ts).
    createProposalTx,
    decideProposalTx,
  };
}

export type ScaleDecisionServices = ReturnType<typeof createScaleDecisionServices>;
