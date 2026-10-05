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
import { NotFoundError } from "./platform.ts";
import { MemoryError } from "./memory.ts";
import type { AuditService } from "./audit.ts";
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
} from "./narrative.ts";
import { readHeadRevisionId } from "./revisions.ts";
import {
  assertFindingEvidence,
  type EvidenceFinding,
  type FindingEvidence,
} from "./evidence-findings.ts";

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
  }): Promise<{ verdict: "PASS" | "FAIL"; hardViolations: unknown } | null>;
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
        select: { verdict: true, hardViolations: true },
      });
      if (!row) return null;
      return { verdict: row.verdict as "PASS" | "FAIL", hardViolations: row.hardViolations };
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

      const version = await db.chapterVersion.findFirst({
        where: { id: chapterVersionId, chapter: { novelId } },
        select: {
          id: true,
          chapterId: true,
          number: true,
          chapter: { select: { id: true, number: true, title: true } },
        },
      });
      if (!version) throw new NotFoundError("chapter version");
      // chapterId/chapterVersionId consistency (pinned at review, P3).
      if (chapterId !== undefined && version.chapterId !== chapterId) {
        throw new MemoryError(
          400,
          "INVALID_INPUT",
          "chapterVersionId does not belong to chapterId",
        );
      }
      const chapterNumber = version.chapter.number;

      const headRevisionId = await readHeadRevisionId(db, novelId);
      // A novel with no revisions yet has no source revision to pin the
      // receipt to. Rather than inventing one, surface the real
      // precondition loudly: review needs at least one revision. (Every
      // covered mutation writes a revision, so a novel with chapters
      // always has one.)
      if (!headRevisionId) throw new NotFoundError("revision");
      const sourceRevisionId = headRevisionId;

      const policyRows = await db.narrativePolicy.findMany({
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
          // Malformed on read = fail-open: treated as unconfigured, with
          // an explicit UNRESOLVED finding (Invariant 5). Never an HTTP
          // error, never a silent pass.
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
          if ("problem" in window) continue; // validated above; defensive
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
          // SCALE: the validated standing is recorded; the chapter
          // version at the standing's own scale is always inside reach,
          // so SCALE never fails a review in 010 (see file comment).
          const standing = scaleStandingOf(policy.payload);
          if (standing) {
            const assessment = assessScaleAppropriateness(
              {
                id: chapterVersionId,
                scale: standing.scale,
                summary: version.chapter.title,
              },
              standing,
            );
            void assessment;
          }
        }
      }

      const verdict: "PASS" | "FAIL" = hardViolations.length > 0 ? "FAIL" : "PASS";

      // One receipt per immutable version; re-review REPLACES the row.
      const receipt = await db.finalTextReview.upsert({
        where: { chapterVersionId },
        update: {
          revisionId: sourceRevisionId,
          verdict,
          hardViolations: hardViolations as unknown as object,
          advisory: advisory as unknown as object,
          evaluatedPolicies: evaluatedPolicies as unknown as object,
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
        },
        select: { id: true },
      });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "review.final-text-evaluated",
        entityType: "FinalTextReview",
        entityId: receipt.id,
        payload: { chapterVersionId, verdict },
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
      };
    },
  };
}

export type FinalTextReviewServices = ReturnType<typeof createFinalTextReviewServices>;
