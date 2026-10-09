/**
 * SCALE decision routes (NF-WF-050B, S2): author decisions on standing changes
 * and chapter exceptions, plus the deterministic review context.
 *
 * Same conventions as scale-evidence routes: session auth, Zod validation,
 * membership tenant gate (404 for non-members), uuid params, service
 * errors mapped once in the app-wide error handler.
 *
 * Reads require `chapter:read` AND `canon:read`.
 * Proposals require `chapter:update` AND `canon:manage`.
 * Decisions additionally require `canon:approve`.
 * All enforced in services as well as routes.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { NovelForgeDb } from "@novelforge/database";
import {
  createScaleDecisionServices,
  readScaleContext,
  parseScaleReviewProtocol,
  isProtocolLiveConsistent,
  type ScaleDecisionServices,
  type ScaleReviewContext,
  type ScaleReviewProtocol,
} from "@novelforge/ai-services";
import { NotFoundError } from "@novelforge/ai-services";
import { SESSION_COOKIE } from "./auth-routes.ts";

const uuid = z.string().uuid();

const scaleDecisionParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  chapterId: uuid,
});

const scaleReviewContextQuery = z.object({
  chapterVersionId: uuid.optional(),
});

const proposalIdParams = scaleDecisionParams.extend({
  proposalId: uuid,
});

const decisionsQuery = z.object({
  chapterVersionId: uuid,
  beforeSequence: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Strict schemas: reject unknown fields at every level.
const standingSchema = z
  .object({
    scale: z.string(),
    access: z.array(z.string()).max(8),
    reputation: z.number().int().min(0).max(100),
  })
  .strict();

const standingChangePayloadSchema = z
  .object({
    standing: standingSchema,
    hardness: z.enum(["HARD", "SOFT"]),
    hardReason: z.string().nullable(),
  })
  .strict();

const chapterExceptionPayloadSchema = z
  .object({
    claimIndices: z.array(z.number().int().min(0).max(99)).min(1).max(100),
  })
  .strict()
  .refine((p) => new Set(p.claimIndices).size === p.claimIndices.length, {
    message: "claimIndices must be unique",
  });

const createProposalBody = z
  .object({
    chapterVersionId: uuid,
    expectedBranchId: uuid,
    expectedHeadRevisionId: uuid.nullable(),
    expectedSetId: uuid.nullable(),
    expectedDecisionId: uuid.nullable(),
    expectedPolicyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.enum(["STANDING_CHANGE", "CHAPTER_EXCEPTION"]),
    payload: z.unknown(),
    reason: z.string().min(1).max(4000),
    predecessorProposalId: uuid.nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === "STANDING_CHANGE") {
      const r = standingChangePayloadSchema.safeParse(val.payload);
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "standing change payload invalid",
        });
      }
    } else {
      const r = chapterExceptionPayloadSchema.safeParse(val.payload);
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "chapter exception payload invalid",
        });
      }
    }
  });

const decideProposalBody = z
  .object({
    action: z.enum(["APPROVE", "REJECT", "ALTERNATIVE"]),
    reason: z.string().min(1).max(4000),
    alternativePayload: z.unknown().optional(),
    expectedBranchId: uuid,
    expectedHeadRevisionId: uuid.nullable(),
    expectedDecisionId: uuid.nullable(),
    expectedPolicyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    expectedVersionId: uuid,
    expectedSetId: uuid.nullable(),
  })
  .strict();

/**
 * Parse with Zod, returning a 400 INVALID_INPUT on failure instead of
 * letting ZodError fall through to 500. Authenticate first, then validate.
 */
function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown,
  reply: FastifyReply,
): { ok: true; value: T } | { ok: false } {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({
      error: "INVALID_INPUT",
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return { ok: false };
  }
  return { ok: true, value: result.data };
}

async function getMembership(
  db: NovelForgeDb,
  workspaceId: string,
  userId: string,
) {
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError("workspace");
  return membership;
}

/**
 * Server-derived receipt applicability (NF-WF-050B fourth repair).
 *
 * Compares the retained protocol pins verbatim against the SAME coherent
 * context snapshot the route just read — never against a separately fetched
 * state. Statuses:
 * - ABSENT: no receipt row for this version.
 * - LEGACY: receipt exists but scaleReview is null/malformed (never trusted).
 * - STALE: pins mismatch the current snapshot or the protocol is
 *   live-inconsistent; `reasons` names every mismatched pin.
 * - FRESH: all pins match and the protocol is live-consistent.
 */
export function deriveReceiptApplicability(
  receipt: { scaleReview: ScaleReviewProtocol | null } | null,
  context: ScaleReviewContext,
  applicableException: { outcomeId: string; proposalId: string } | null,
): { status: "ABSENT" | "LEGACY" | "STALE" | "FRESH"; reasons: string[] } {
  if (!receipt) return { status: "ABSENT", reasons: ["no receipt"] };
  const protocol = receipt.scaleReview;
  if (!protocol) {
    return { status: "LEGACY", reasons: ["scaleReview missing or malformed"] };
  }
  const reasons: string[] = [];
  const pins = protocol.pins;
  if (pins.chapterVersionId !== context.chapterVersion.id) reasons.push("chapterVersionId");
  if (pins.branchId !== context.branch.id) reasons.push("branchId");
  if (pins.sourceRevisionId !== context.headRevisionId) reasons.push("sourceRevisionId");
  if (pins.evidenceSetId !== (context.latestSet?.id ?? null)) reasons.push("evidenceSetId");
  if (pins.policyFingerprint !== context.policyFingerprint) reasons.push("policyFingerprint");
  if (pins.exceptionOutcomeId !== (applicableException?.outcomeId ?? null)) {
    reasons.push("exceptionOutcomeId");
  }
  const liveHardness = context.policy
    ? (context.policy.hardness as "HARD" | "SOFT")
    : null;
  if (!isProtocolLiveConsistent(protocol, liveHardness)) {
    reasons.push("live-consistency");
  }
  return reasons.length === 0 ? { status: "FRESH", reasons } : { status: "STALE", reasons };
}

export function registerScaleDecisionRoutes(
  app: FastifyInstance,
  deps: { db: NovelForgeDb; auth: AuthService; audit: import("@novelforge/ai-services").AuditService },
): void {
  const { db, auth, audit } = deps;
  const decisions: ScaleDecisionServices = createScaleDecisionServices({ db, audit });

  // GET /chapters/:chapterId/scale-review-context
  // Contract: server-derived current version/branch/head, latest set,
  // policy+fingerprint, decision head, applicable exception, receipt/
  // applicability and checklist. One coherent read snapshot.
  //
  // chapterVersionId is optional: when omitted, the server resolves the
  // chapter's current saved version (server-derived, never client-invented).
  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-review-context",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsedParams = parseOr400(scaleDecisionParams, req.params, reply);
      if (!parsedParams.ok) return;
      const parsedQuery = parseOr400(scaleReviewContextQuery, req.query, reply);
      if (!parsedQuery.ok) return;
      const params = parsedParams.value;
      const query = parsedQuery.value;
      const membership = await getMembership(db, params.workspaceId, session.userId);
      requireCapability(membership.role, "chapter:read" as Capability);
      requireCapability(membership.role, "canon:read" as Capability);

      // GAP-119 (fourth repair): ONE coherent read snapshot. The version is
      // resolved INSIDE the transaction at RepeatableRead, so the version,
      // branch head, evidence set, policy and receipt are all read from the
      // same snapshot — a concurrent version/head advance during the read
      // can never produce a torn context (old version + new head).
      const snapshot = await db.$transaction(
        async (tx) => {
          // Resolve the version ID inside the transaction: client-supplied
          // or server-derived current (never client-invented).
          let chapterVersionId = query.chapterVersionId ?? null;
          if (!chapterVersionId) {
            const chapter = await (tx as NovelForgeDb).chapter.findFirst({
              where: {
                id: params.chapterId,
                novelId: params.novelId,
                novel: { workspaceId: params.workspaceId },
              },
              select: { currentVersionId: true },
            });
            if (!chapter?.currentVersionId) {
              throw new NotFoundError("no saved version");
            }
            chapterVersionId = chapter.currentVersionId;
          }

          const context = await readScaleContext(tx as never, {
            workspaceId: params.workspaceId,
            novelId: params.novelId,
            chapterId: params.chapterId,
            chapterVersionId: chapterVersionId as string,
          });

          // Decision head: latest decision outcome ID for this branch/version.
          const latestOutcome = await (tx as NovelForgeDb).scaleDecisionOutcome.findFirst({
            where: {
              workspaceId: params.workspaceId,
              novelId: params.novelId,
              chapterVersionId: chapterVersionId as string,
              sourceBranchId: context.branch.id,
            },
            orderBy: { sequence: "desc" },
            select: { id: true },
          });
          const decisionHeadId = latestOutcome?.id ?? null;

          // Applicable exception: latest APPROVE outcome for a
          // CHAPTER_EXCEPTION proposal matching this exact version/branch/
          // set/policy fingerprint AND source revision (GAP-119: an
          // exception approved at an older head does not apply after the
          // head advances).
          let applicableException: { outcomeId: string; proposalId: string } | null = null;
          if (context.latestSet) {
            const exceptionOutcome = await (tx as NovelForgeDb).scaleDecisionOutcome.findFirst({
              where: {
                workspaceId: params.workspaceId,
                novelId: params.novelId,
                chapterVersionId: chapterVersionId as string,
                sourceBranchId: context.branch.id,
                action: "APPROVE",
                proposal: {
                  kind: "CHAPTER_EXCEPTION",
                  sourceRevisionId: context.headRevisionId,
                  evidenceSetId: context.latestSet.id,
                  policyFingerprint: context.policyFingerprint,
                },
              },
              orderBy: { sequence: "desc" },
              select: { id: true, proposalId: true },
            });
            if (exceptionOutcome) {
              applicableException = {
                outcomeId: exceptionOutcome.id,
                proposalId: exceptionOutcome.proposalId,
              };
            }
          }

          // Latest review receipt for this version (with scaleReview protocol).
          const receiptRow = await (tx as NovelForgeDb).finalTextReview.findUnique({
            where: { chapterVersionId: chapterVersionId as string },
            select: {
              id: true,
              verdict: true,
              scaleReview: true,
              revisionId: true,
              createdAt: true,
            },
          });
          // Strict retained protocol validation: malformed stored scaleReview
          // is treated as legacy (null), never trusted.
          const receipt = receiptRow
            ? {
                id: receiptRow.id,
                verdict: receiptRow.verdict,
                scaleReview: parseScaleReviewProtocol(receiptRow.scaleReview),
                revisionId: receiptRow.revisionId,
                createdAt: receiptRow.createdAt,
              }
            : null;

          // Server-derived receipt applicability against the SAME coherent
          // context snapshot, plus the deterministic missing-data checklist.
          const applicability = deriveReceiptApplicability(
            receipt,
            context,
            applicableException,
          );
          const checklist =
            applicability.status === "FRESH" && receipt?.scaleReview
              ? receipt.scaleReview.missingData
              : [];

          return {
            context: {
              ...context,
              decisionHeadId,
              applicableException,
            },
            receipt,
            applicability,
            checklist,
          };
        },
        { isolationLevel: "RepeatableRead" },
      );

      return reply.code(200).send(snapshot);
    },
  );

  // POST /chapters/:chapterId/scale-decisions
  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-decisions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsedParams = parseOr400(scaleDecisionParams, req.params, reply);
      if (!parsedParams.ok) return;
      const parsedBody = parseOr400(createProposalBody, req.body, reply);
      if (!parsedBody.ok) return;
      const params = parsedParams.value;
      const body = parsedBody.value;

      // Service enforces chapter:update AND canon:manage.
      const result = await decisions.createProposal({
        actorUserId: session.userId,
        workspaceId: params.workspaceId,
        novelId: params.novelId,
        chapterId: params.chapterId,
        ...body,
      });

      return reply.code(201).send(result);
    },
  );

  // GET /chapters/:chapterId/scale-decisions (paginated)
  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-decisions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsedParams = parseOr400(scaleDecisionParams, req.params, reply);
      if (!parsedParams.ok) return;
      const parsedQuery = parseOr400(decisionsQuery, req.query, reply);
      if (!parsedQuery.ok) return;
      const params = parsedParams.value;
      const query = parsedQuery.value;
      const membership = await getMembership(db, params.workspaceId, session.userId);
      requireCapability(membership.role, "chapter:read" as Capability);
      requireCapability(membership.role, "canon:read" as Capability);

      // P1 fix: resolve all tenant/source identities before querying.
      // Verify novel belongs to workspace, chapter belongs to novel,
      // and version belongs to chapter. Foreign IDs -> 404.
      const novel = await db.novel.findFirst({
        where: { id: params.novelId, workspaceId: params.workspaceId },
        select: { id: true },
      });
      if (!novel) return reply.code(404).send({ error: "NOT_FOUND" });
      const chapter = await db.chapter.findFirst({
        where: { id: params.chapterId, novelId: params.novelId },
        select: { id: true },
      });
      if (!chapter) return reply.code(404).send({ error: "NOT_FOUND" });
      const version = await db.chapterVersion.findFirst({
        where: { id: query.chapterVersionId, chapterId: params.chapterId },
        select: { id: true },
      });
      if (!version) return reply.code(404).send({ error: "NOT_FOUND" });

      // Branch-scoped pagination: resolve the checked-out branch from the
      // server (never client-supplied) and scope the sequence cursor to it.
      const novelWithBranch = await db.novel.findFirst({
        where: { id: params.novelId, workspaceId: params.workspaceId },
        select: { currentBranchId: true },
      });
      const checkedOutBranchId = novelWithBranch?.currentBranchId ?? null;
      if (!checkedOutBranchId) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "no checked-out branch" });
      }

      const where = {
        workspaceId: params.workspaceId,
        novelId: params.novelId,
        chapterVersionId: query.chapterVersionId,
        sourceBranchId: checkedOutBranchId,
        ...(query.beforeSequence ? { sequence: { lt: query.beforeSequence } } : {}),
      };

      const rows = await db.scaleDecisionProposal.findMany({
        where,
        orderBy: { sequence: "desc" },
        take: query.limit + 1,
        include: { outcome: true },
      });

      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      const nextBeforeSequence =
        hasMore && items.length > 0
          ? items[items.length - 1]!.sequence
          : null;

      return reply.code(200).send({ items, nextBeforeSequence });
    },
  );

  // POST /chapters/:chapterId/scale-decisions/:proposalId/decision
  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-decisions/:proposalId/decision",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsedParams = parseOr400(proposalIdParams, req.params, reply);
      if (!parsedParams.ok) return;
      const parsedBody = parseOr400(decideProposalBody, req.body, reply);
      if (!parsedBody.ok) return;
      const params = parsedParams.value;
      const body = parsedBody.value;

      // Service enforces chapter:update AND canon:manage AND canon:approve.
      // GAP-119: pass URL chapterId so the service validates it matches the
      // proposal's chapter (prevents cross-chapter decision confusion).
      const result = await decisions.decideProposal({
        actorUserId: session.userId,
        workspaceId: params.workspaceId,
        novelId: params.novelId,
        chapterId: params.chapterId,
        proposalId: params.proposalId,
        ...body,
      });

      return reply.code(200).send(result);
    },
  );
}
