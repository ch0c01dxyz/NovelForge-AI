/**
 * NF-WF-010 Consumer 2 — final-text review.
 *
 * `reviewFinalText` evaluates the IMMUTABLE text artifact of a
 * ChapterVersion against the novel's validated HARD and SOFT narrative
 * policies. HARD violations → verdict FAIL (stored receipt); the
 * manuscript.setStatus gate then refuses the transition out of DRAFT
 * with 409 HARD_POLICY_VIOLATION. SOFT observations → verdict PASS with
 * `advisory` findings; the gate MUST NOT read advisory findings as a
 * refusal.
 *
 * The review is synchronous and deterministic: policy checks are
 * rule-based over stored policies and the version's metadata — no model
 * calls (GAP-028 does not arise). Author flow: review → fix → review →
 * setStatus.
 *
 * Policy evaluation and the beat projection (documented rule-local
 * definitions, Invariant 7):
 *
 * - Beats: 010 has no typed-beat authoring surface, so every structured
 *   story event established by prose (chapterId non-null) is projected
 *   as a drama beat of type CUSTOM. The COOLDOWN rule then detects
 *   same-flavour repetition; the DRAMA_GAP rule measures chapters since
 *   the last structured event. Beat ids and chapters are always cited —
 *   never a bare score.
 * - DRAMA_GAP: `chaptersSinceDrama` = the chapter's number minus the
 *   most recent beat chapter strictly before it (0 when the story has
 *   no beats yet — the calm is measured from the story's start). A HARD
 *   policy whose window state is BEYOND_EXTENDED_CALM with
 *   strictInterval=true is violated (the author's own strict schedule);
 *   otherwise the window is advisory.
 * - COOLDOWN: the candidate is the chapter version itself
 *   ({ id: chapterVersionId, type: CUSTOM, chapter }); history excludes
 *   the chapter's own beats (distance 0 would self-conflict).
 * - SCALE: the validated standing is the protagonist's standing; the
 *   proposal is the chapter version at the standing's own scale, so a
 *   same-scale proposal is always inside reach and SCALE can never FAIL
 *   a review in 010 — there is no deterministic conflict-proposal
 *   source from a chapter version. The policy is still recorded in
 *   `evaluatedPolicies` as configured. Proposal-carrying enforcement
 *   (e.g. from the planner) is a follow-up.
 *
 * Malformed on read = fail-open (Invariant 5): a stored policy that
 * fails validation is treated as "no policy configured" and emits an
 * UNRESOLVED MALFORMED_POLICY finding naming the row — never a silent
 * pass, never a silent refusal, never an HTTP error.
 *
 * "Soft never forces plot/drama" is shape-enforced (Invariant 4): the
 * `advisory` items carry { rule, observation, evidence, suggestion }
 * with NO instruction/plotting fields, and suggestions are written in
 * descriptive voice — never imperatives ("add a scene", "must
 * confront"). A test pins this against a fixture list of imperative
 * patterns.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import { MemoryError } from "@novelforge/ai-services";
import { PolicyError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";
import {
  assessScaleDeterministic,
  readScaleContext,
} from "@novelforge/ai-services";
import type {
  ScaleReviewProtocol,
  ScaleReviewContext,
} from "@novelforge/ai-services";
import { parseScaleReviewProtocol } from "@novelforge/ai-services";
import {
  assessDramaWindow,
  assessScaleAppropriateness,
  checkCooldown,
  type DramaBeat,
  type NarrativePolicyKind,
  type PolicyHardness,
} from "@novelforge/narrative-rhythm";
import {
  isValidCooldownPayload,
  isValidScalePayload,
  scaleStandingOf,
} from "@novelforge/ai-services";
// readHeadRevisionId not used; head comes from locked branch.
import {
  assertFindingEvidence,
  type EvidenceFinding,
  type FindingEvidence,
} from "@novelforge/ai-services";

export interface ReviewAdvisory {
  rule: string;
  observation: string;
  evidence: FindingEvidence[];
  /** Variation-guidance only — descriptive voice, never imperatives. */
  suggestion: string;
}

export interface ReviewVerdict {
  chapterVersionId: string;
  novelId: string;
  verdict: "PASS" | "FAIL";
  /** Empty when PASS. */
  hardViolations: EvidenceFinding[];
  /** SOFT policies; schema has no instruction fields. */
  advisory: ReviewAdvisory[];
  evaluatedPolicies: Array<{
    kind: NarrativePolicyKind;
    hardness: PolicyHardness;
    configured: boolean;
  }>;
  sourceRevisionId: string;
  receiptId: string;
  /** Protocol 1 SCALE review (050B). Null for legacy receipts. */
  scaleReview: ScaleReviewProtocol | null;
}

interface PolicyRow {
  id: string;
  kind: NarrativePolicyKind;
  hardness: PolicyHardness;
  payload: unknown;
}

/**
 * Read-side policy validation (Invariant 5): the same predicates
 * putPolicy applies on write, applied to stored rows. Returns the
 * problem description, or null when the row validates. Shared with
 * story-health's malformed-on-read rule.
 */
export function validatePolicyPayloadOnRead(
  kind: NarrativePolicyKind,
  payload: unknown,
): string | null {
  if (kind === "DRAMA_GAP") {
    const probe = assessDramaWindow({ policy: payload as never, chaptersSinceDrama: 0 });
    return "problem" in probe ? `drama gap payload malformed: ${probe.problem}` : null;
  }
  if (kind === "COOLDOWN") {
    return isValidCooldownPayload(payload)
      ? null
      : "cooldown payload malformed: windowChapters must be a positive integer";
  }
  return isValidScalePayload(payload)
    ? null
    : "scale payload malformed: standing must be { scale, access, reputation } with valid narrative scales";
}

export function createFinalTextReviewServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): {
  reviewFinalText(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    /** When present, the version MUST belong to this chapter. */
    chapterId?: string;
    chapterVersionId: string;
    simulation?: boolean;
  }): Promise<ReviewVerdict>;
  /** Latest receipt for a chapter version id (the setStatus gate reads this). */
  latestReceipt(input: {
    chapterVersionId: string;
  }): Promise<{
    verdict: "PASS" | "FAIL";
    hardViolations: unknown;
    scaleReview: ScaleReviewProtocol | null;
    revisionId: string;
  } | null>;
} {
  const { db, audit } = deps;

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

  /** The beat projection: structured story events established by prose. */
  async function dramaBeats(novelId: string): Promise<DramaBeat[]> {
    const events = await db.storyEvent.findMany({
      where: { novelId, chapterId: { not: null } },
      select: { id: true, chapterId: true },
    });
    if (events.length === 0) return [];
    const chapters = await db.chapter.findMany({
      where: { id: { in: events.map((e) => e.chapterId as string) } },
      select: { id: true, number: true },
    });
    const numberById = new Map(chapters.map((c) => [c.id, c.number]));
    const beats: DramaBeat[] = [];
    for (const e of events) {
      const n = numberById.get(e.chapterId as string);
      if (n !== undefined) beats.push({ id: e.id, type: "CUSTOM", chapter: n });
    }
    return beats;
  }

  function malformedFinding(
    row: PolicyRow,
    problem: string,
    sourceRevisionId: string,
  ): EvidenceFinding {
    return assertFindingEvidence({
      rule: "MALFORMED_POLICY",
      severity: "WARNING",
      status: "UNRESOLVED",
      evidence: [
        {
          kind: "policy",
          id: row.id,
          detail: `${row.kind} policy row fails read-side validation: ${problem}`,
        },
      ],
      affectedEntities: [],
      // UNRESOLVED: there is no machine proposal when the machine must
      // not decide — the author re-saves the policy (Invariant 6).
      remediation: null,
      sourceRevisionId,
      evaluatedAt: new Date().toISOString(),
    });
  }

  function hardViolation(
    rule: string,
    observation: string,
    evidence: FindingEvidence[],
    remediation: string,
    sourceRevisionId: string,
  ): EvidenceFinding {
    return assertFindingEvidence({
      rule,
      severity: "CRITICAL",
      status: "OPEN",
      evidence,
      affectedEntities: [],
      remediation,
      sourceRevisionId,
      evaluatedAt: new Date().toISOString(),
    });
  }

  return {
    async latestReceipt({ chapterVersionId }) {
      const row = await db.finalTextReview.findUnique({
        where: { chapterVersionId },
        select: { verdict: true, hardViolations: true, scaleReview: true, revisionId: true },
      });
      if (!row) return null;
      return {
        verdict: row.verdict as "PASS" | "FAIL",
        hardViolations: row.hardViolations,
        scaleReview: parseScaleReviewProtocol(row.scaleReview),
        revisionId: row.revisionId,
      };
    },

    async reviewFinalText({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      chapterVersionId,
      simulation,
    }) {
      await gate(actorUserId, workspaceId, novelId);
      // Invariant 9: simulations never feed these consumers — the
      // explicit-tag refusal (full lineage is the deferred follow-up).
      if (simulation === true) {
        throw new MemoryError(
          400,
          "SIMULATION_SOURCE_REFUSED",
          "final-text review refuses simulation-tagged input",
        );
      }

      // 050B: one transaction locks novel NO KEY UPDATE -> checked-out
      // branch UPDATE -> chapter UPDATE. No LLM/human wait inside; no
      // story-head advance for review itself.
      return await db.$transaction(async (tx) => {
        // Lock novel, re-read checked-out branch.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
          novelId,
        );
        const novel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { id: true, currentBranchId: true },
        });
        if (!novel || !novel.currentBranchId) {
          throw new NotFoundError("novel");
        }
        const branchId = novel.currentBranchId;

        // Lock the checked-out branch.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          branchId,
        );
        const branch = await tx.novelBranch.findUnique({
          where: { id: branchId },
          select: { id: true, novelId: true, headRevisionId: true },
        });
        if (!branch || branch.novelId !== novelId) {
          throw new NotFoundError("branch");
        }

        // Headless participating branch: refuse 409 with no receipt writes.
        // Never borrow main's head or manufacture a revision.
        if (!branch.headRevisionId) {
          throw new PolicyError(
            "REVIEW_STALE",
            "checked-out branch has no head revision; review requires a baseline revision",
          );
        }
        const sourceRevisionId = branch.headRevisionId;

        // Resolve and lock the chapter.
        const versionPre = await tx.chapterVersion.findFirst({
          where: { id: chapterVersionId },
          select: { id: true, chapterId: true, chapter: { select: { novelId: true } } },
        });
        if (!versionPre || versionPre.chapter.novelId !== novelId) {
          throw new NotFoundError("chapter version");
        }
        const resolvedChapterId = chapterId ?? versionPre.chapterId;
        if (versionPre.chapterId !== resolvedChapterId) {
          throw new MemoryError(
            400,
            "INVALID_INPUT",
            "chapterVersionId does not belong to chapterId",
          );
        }
        await tx.$queryRawUnsafe(
          `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
          resolvedChapterId,
        );
        const chapter = await tx.chapter.findUnique({
          where: { id: resolvedChapterId },
          select: { id: true, number: true, title: true, currentVersionId: true },
        });
        if (!chapter) throw new NotFoundError("chapter");

        // Require an owned current version: foreign version 404 (handled
        // above via novel scoping); owned but obsolete 409 REVIEW_STALE.
        if (chapter.currentVersionId !== chapterVersionId) {
          throw new PolicyError(
            "REVIEW_STALE",
            "chapter version is not the current version of the checked-out branch",
          );
        }

        const chapterNumber = chapter.number;

        // 050B: read SCALE context (latest set, policy, fingerprint) inside
        // the same transaction. readScaleContext re-validates retained
        // evidence via 050A validators.
        let scaleContext: ScaleReviewContext | null = null;
        try {
          scaleContext = await readScaleContext(tx as never, {
            workspaceId,
            novelId,
            chapterId: resolvedChapterId,
            chapterVersionId,
          });
        } catch {
          // No SCALE context available; scaleReview stays null only when
          // no SCALE rows exist (handled below). A context read failure
          // with SCALE rows present is treated as INCOMPLETE via the
          // missing-set path.
          scaleContext = null;
        }

        // Find applicable approved exception: the LATEST approved
        // CHAPTER_EXCEPTION outcome whose proposal pins match EXACTLY:
        // kind, head (sourceRevisionId), policy fingerprint, set ID,
        // version and branch. An APPROVE row's existence alone is not
        // sufficient — stale or mismatched exceptions must not apply.
        let exceptionCoveredIndices: number[] = [];
        let applicableExceptionOutcomeId: string | null = null;
        if (scaleContext?.latestSet) {
          const outcome = await tx.scaleDecisionOutcome.findFirst({
            where: {
              novelId,
              chapterVersionId,
              sourceBranchId: branchId,
              action: "APPROVE",
              proposal: {
                kind: "CHAPTER_EXCEPTION",
                sourceRevisionId: sourceRevisionId,
              },
            },
            orderBy: { sequence: "desc" },
            select: { id: true, proposal: { select: { payload: true, evidenceSetId: true, policyFingerprint: true, kind: true, sourceRevisionId: true } } },
          });
          if (
            outcome &&
            outcome.proposal.kind === "CHAPTER_EXCEPTION" &&
            outcome.proposal.sourceRevisionId === sourceRevisionId &&
            outcome.proposal.evidenceSetId === scaleContext.latestSet.id &&
            outcome.proposal.policyFingerprint === scaleContext.policyFingerprint
          ) {
            applicableExceptionOutcomeId = outcome.id;
            const payload = outcome.proposal.payload as { claimIndices?: unknown };
            if (
              payload &&
              Array.isArray(payload.claimIndices) &&
              payload.claimIndices.every((i) => Number.isInteger(i))
            ) {
              exceptionCoveredIndices = payload.claimIndices as number[];
            }
          }
        }

        // Compute protocol 1 scaleReview when SCALE rows exist.
        let scaleReview: ScaleReviewProtocol | null = null;
        const hasScaleRows =
          scaleContext !== null &&
          (scaleContext.policy !== null || scaleContext.latestSet !== null);
        if (hasScaleRows && scaleContext) {
          // Build claim inputs from the validated latest set (050A claims
          // have { scale, relevance, explanation, source: { start, end, quote } }).
          const claims = (scaleContext.latestSet?.conflicts ?? []).map((c, idx) => ({
            index: idx,
            scale: c.scale,
            span: { start: c.source.start, end: c.source.end },
            quote: c.source.quote,
          }));
          // Patch the exception outcome pin (resolved by caller per
          // assessScaleDeterministic contract).
          // Honor explicit NO_OPERATIVE_CONFLICT declaration from the
          // validated evidence set (050A). A quiet chapter with valid
          // policy and explicit declaration → NO_OPERATIVE_CONFLICT state.
          const noOperativeConflict =
            scaleContext.latestSet?.declaration === "NO_OPERATIVE_CONFLICT";
          const assessed = assessScaleDeterministic({
            context: scaleContext,
            claims,
            exceptionCoveredIndices,
            noOperativeConflict,
          });
          scaleReview = {
            ...assessed,
            pins: {
              ...assessed.pins,
              exceptionOutcomeId: applicableExceptionOutcomeId,
            },
          };
        }

        const policyRows = await tx.narrativePolicy.findMany({
          where: { novelId },
          select: { id: true, kind: true, hardness: true, payload: true },
        });
        const policies: PolicyRow[] = policyRows.map((r) => ({
          id: r.id,
          kind: r.kind as NarrativePolicyKind,
          hardness: r.hardness as PolicyHardness,
          payload: r.payload,
        }));

        const beats = await dramaBeats(novelId);
        const beatsBefore = beats
          .filter((b) => b.chapter < chapterNumber)
          .sort((a, b) => b.chapter - a.chapter);
        const lastBeatChapter = beatsBefore.length > 0 ? beatsBefore[0]!.chapter : 0;
        const chaptersSinceDrama = chapterNumber - lastBeatChapter;

        const hardViolations: EvidenceFinding[] = [];
        const advisory: ReviewAdvisory[] = [];
        const evaluatedPolicies: ReviewVerdict["evaluatedPolicies"] = [];

        const recordAdvisory = (
          rule: string,
          observation: string,
          evidence: FindingEvidence[],
          suggestion: string,
        ) => {
          advisory.push({ rule, observation, evidence, suggestion });
        };

        for (const policy of policies) {
          const readProblem = validatePolicyPayloadOnRead(policy.kind, policy.payload);
          if (readProblem) {
            const finding = malformedFinding(policy, readProblem, sourceRevisionId);
            recordAdvisory(
              "MALFORMED_POLICY",
              `${policy.kind} policy is stored malformed and reads as unconfigured: ${readProblem}`,
              finding.evidence,
              `Re-save the ${policy.kind} policy through the policy write surface; the stored payload does not validate against the ${policy.kind} schema.`,
            );
            evaluatedPolicies.push({
              kind: policy.kind,
              hardness: policy.hardness,
              configured: false,
            });
            continue;
          }
          evaluatedPolicies.push({
            kind: policy.kind,
            hardness: policy.hardness,
            configured: true,
          });

          if (policy.kind === "DRAMA_GAP") {
            const window = assessDramaWindow({
              policy: policy.payload as never,
              chaptersSinceDrama,
            });
            if ("problem" in window) continue;
            const beyond = window.state === "BEYOND_EXTENDED_CALM";
            const strict = (policy.payload as { strictInterval?: boolean }).strictInterval === true;
            if (beyond && strict) {
              const observation = `drama gap exceeded: ${window.guidance}`;
              const evidence: FindingEvidence[] = [
                {
                  kind: "policy",
                  id: policy.id,
                  detail: `DRAMA_GAP policy (strict): ${window.guidance}`,
                },
                {
                  kind: "chapterVersion",
                  id: chapterVersionId,
                  chapter: chapterNumber,
                  detail: `${chaptersSinceDrama} chapters since the last structured story event (chapter ${lastBeatChapter === 0 ? "— none yet" : lastBeatChapter})`,
                },
              ];
              if (policy.hardness === "HARD") {
                hardViolations.push(
                  hardViolation(
                    "DRAMA_GAP_VIOLATION",
                    observation,
                    evidence,
                    "add a drama beat (a structured story event) within the authored gap, or relax the policy's strict interval",
                    sourceRevisionId,
                  ),
                );
              } else {
                recordAdvisory(
                  "DRAMA_GAP_OBSERVATION",
                  observation,
                  evidence,
                  "The story has been calm longer than the authored extended calm describes. This is an observation about rhythm, not a schedule — the policy's numbers are descriptive.",
                );
              }
            }
          } else if (policy.kind === "COOLDOWN") {
            const decision = checkCooldown(
              { id: chapterVersionId, type: "CUSTOM", chapter: chapterNumber },
              beats.filter((b) => b.chapter !== chapterNumber),
              policy.payload as { windowChapters: number },
            );
            if (!decision.allowed && decision.conflictsWith) {
              const c = decision.conflictsWith;
              const observation = `cooldown conflict: ${decision.reason}`;
              const evidence: FindingEvidence[] = [
                {
                  kind: "policy",
                  id: policy.id,
                  detail: `COOLDOWN policy: ${decision.reason}`,
                },
                {
                  kind: "chapterVersion",
                  id: c.beatId,
                  chapter: c.chapter,
                  detail: `conflicting beat ${c.beatId} at chapter ${c.chapter}, ${c.distance} chapters away`,
                },
              ];
              if (policy.hardness === "HARD") {
                hardViolations.push(
                  hardViolation(
                    "COOLDOWN_VIOLATION",
                    observation,
                    evidence,
                    `move the beat outside the ${(policy.payload as { windowChapters: number }).windowChapters}-chapter cooldown window, or narrow the window`,
                    sourceRevisionId,
                  ),
                );
              } else {
                recordAdvisory(
                  "COOLDOWN_OBSERVATION",
                  observation,
                  evidence,
                  "Two same-flavour beats land close together. The cooldown is advisory here — repetition is a note about rhythm, not a refusal.",
                );
              }
            }
          } else {
            const standing = scaleStandingOf(policy.payload);
            if (standing) {
              const assessment = assessScaleAppropriateness(
                {
                  id: chapterVersionId,
                  scale: standing.scale,
                  summary: chapter.title,
                },
                standing,
              );
              void assessment;
            }
          }
        }

        // 050B: Derive verdict from SCALE blocking. INCOMPLETE with
        // blocking (HARD) → FAIL; VIOLATION with blocking → FAIL.
        // WITHIN_REACH/EXCEPTED/NO_OPERATIVE_CONFLICT do NOT force FAIL
        // (other policies can still fail). INCOMPLETE never fabricates
        // proved violations (hardViolations only contains proved hard
        // violations from non-SCALE policies).
        const scaleBlocks =
          scaleReview !== null && scaleReview.blocking === true;
        const verdict: "PASS" | "FAIL" =
          hardViolations.length > 0 || scaleBlocks ? "FAIL" : "PASS";

        // One receipt per immutable version; re-review REPLACES the row.
        // After a head change, the existing receipt pins the OLD head and
        // the new review pins the CURRENT head (re-read inside this tx
        // under lock). This is a legitimate fresh re-review and must be
        // allowed — the upsert below replaces the stale receipt.
        // The chapter is locked FOR UPDATE in this tx, so the head cannot
        // move between our read and the upsert; no stale-evaluator race.

        const receipt = await tx.finalTextReview.upsert({
          where: { chapterVersionId },
          update: {
            revisionId: sourceRevisionId,
            verdict,
            hardViolations: hardViolations as unknown as object,
            advisory: advisory as unknown as object,
            evaluatedPolicies: evaluatedPolicies as unknown as object,
            scaleReview: scaleReview as unknown as object,
          },
          create: {
            workspaceId,
            novelId,
            chapterVersionId,
            revisionId: sourceRevisionId,
            verdict,
            hardViolations: hardViolations as unknown as object,
            advisory: advisory as unknown as object,
            evaluatedPolicies: evaluatedPolicies as unknown as object,
            scaleReview: scaleReview as unknown as object,
          },
          select: { id: true },
        });

        await audit.record({
          actorUserId,
          workspaceId,
          action: "review.final-text-evaluated",
          entityType: "FinalTextReview",
          entityId: receipt.id,
          payload: {
            chapterVersionId,
            verdict,
            scaleReviewState: scaleReview?.state ?? null,
          },
        });

        return {
          chapterVersionId,
          novelId,
          verdict,
          hardViolations,
          advisory,
          evaluatedPolicies,
          sourceRevisionId,
          receiptId: receipt.id,
          scaleReview,
        };
      });
    },
  };
}

export type FinalTextReviewServices = ReturnType<typeof createFinalTextReviewServices>;
