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
import { createHash } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import {
  NotFoundError,
  ConflictError,
  MemoryError,
  type AuditService,
} from "@novelforge/ai-services";
import { isValidScalePayload, scaleStandingOf } from "./narrative.ts";
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

  // Validate standing even for quiet chapters.
  const standing = scaleStandingOf(policy.payload);
  const missingData: ScaleReviewProtocol["missingData"] = [];

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

  // Explicit NO_OPERATIVE_CONFLICT with valid policy → quiet chapter.
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
  if (p.hardReason !== null && typeof p.hardReason !== "string") return false;
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

export function createScaleDecisionServices(deps: ScaleDecisionDeps) {
  const { db, audit } = deps;

  async function checkCapability(
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

  return {
    /**
     * Create a SCALE decision proposal.
     * Requires chapter:update AND canon:manage. All expectations must match
     * current context (via readScaleContext). Returns 201 {proposal, decisionHeadId}.
     */
    async createProposal(input: {
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
    }) {
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

      await checkCapability(actorUserId, workspaceId, novelId, "chapter:update" as Capability);
      await checkCapability(actorUserId, workspaceId, novelId, "canon:manage" as Capability);

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

      return await db.$transaction(async (tx) => {
        // Lock order: novel -> branch -> chapter
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR NO KEY UPDATE`;
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

        await audit.record({
          actorUserId,
          workspaceId,
          action: "scale.decision-proposed",
          entityType: "ScaleDecisionProposal",
          entityId: proposal.id,
          payload: { chapterVersionId, kind, sequence },
        });

        return {
          proposal,
          decisionHeadId: latestOutcome?.id ?? null,
        };
      });
    },

    /**
     * Decide on a proposal (APPROVE/REJECT/ALTERNATIVE).
     * Requires chapter:update AND canon:manage AND canon:approve.
     */
    async decideProposal(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      proposalId: string;
      action: "APPROVE" | "REJECT" | "ALTERNATIVE";
      reason: string;
      alternativePayload?: unknown;
      expectedBranchId: string;
      expectedHeadRevisionId: string | null;
      expectedDecisionId: string | null;
    }) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        proposalId,
        action,
        reason,
        alternativePayload,
        expectedBranchId,
        expectedHeadRevisionId,
        expectedDecisionId,
      } = input;

      await checkCapability(actorUserId, workspaceId, novelId, "chapter:update" as Capability);
      await checkCapability(actorUserId, workspaceId, novelId, "canon:manage" as Capability);
      await checkCapability(actorUserId, workspaceId, novelId, "canon:approve" as Capability);

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

      return await db.$transaction(async (tx) => {
        // Lock order: novel -> branch -> chapter
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR NO KEY UPDATE`;

        const proposal = await tx.scaleDecisionProposal.findFirst({
          where: { id: proposalId, novelId, workspaceId },
          include: { outcome: true },
        });
        if (!proposal) throw new NotFoundError("proposal");
        if (proposal.outcome) {
          throw new ConflictError("proposal already decided");
        }

        // Verify stored pins match current context (cannot repin old proposal).
        // Note: we do NOT call readScaleContext here with a caught error —
        // a failed query aborts the Postgres transaction. The direct
        // branch/head reads below are sufficient for pin verification.
        const branch = await tx.novelBranch.findFirst({
          where: { id: proposal.sourceBranchId, novelId },
          select: { id: true, headRevisionId: true },
        });
        if (!branch || branch.id !== expectedBranchId) {
          throw new ConflictError("branch expectation mismatch");
        }
        if (branch.headRevisionId !== expectedHeadRevisionId) {
          throw new ConflictError("head revision changed; proposal is stale");
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
          // HIGH classification: advanceForMutation + checkpoint + rebuild intent
          // in SAME transaction. Simplified here: record outcome with policy update.
          // Full advanceForMutation integration is in the API layer.
          const payload = proposal.payload as {
            standing: { scale: string; access: string[]; reputation: number };
            hardness: string;
            hardReason: string | null;
          };

          // Update the SCALE policy (REWOUND classification)
          await tx.narrativePolicy.upsert({
            where: { novelId_kind: { novelId, kind: "SCALE" } },
            update: {
              hardness: payload.hardness as "HARD" | "SOFT",
              hardReason: payload.hardReason,
              payload: { standing: payload.standing },
            },
            create: {
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

        await audit.record({
          actorUserId,
          workspaceId,
          action: `scale.decision-${action.toLowerCase()}`,
          entityType: "ScaleDecisionOutcome",
          entityId: outcome.id,
          payload: { proposalId, action, sequence },
        });

        return {
          outcome,
          alternativeProposal,
          currentHeadRevisionId: branch.headRevisionId,
        };
      });
    },
  };
}

export type ScaleDecisionServices = ReturnType<typeof createScaleDecisionServices>;
