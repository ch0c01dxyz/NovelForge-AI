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
  type ScaleDecisionServices,
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

      // Resolve the version ID: client-supplied or server-derived current.
      let chapterVersionId = query.chapterVersionId ?? null;
      if (!chapterVersionId) {
        const chapter = await db.chapter.findFirst({
          where: { id: params.chapterId, novelId: params.novelId, novel: { workspaceId: params.workspaceId } },
          select: { currentVersionId: true },
        });
        if (!chapter?.currentVersionId) {
          return reply.code(404).send({ error: "NOT_FOUND", message: "no saved version" });
        }
        chapterVersionId = chapter.currentVersionId;
      }

      const snapshot = await db.$transaction(async (tx) => {
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

        // Applicable exception: latest APPROVE outcome for a CHAPTER_EXCEPTION
        // proposal matching this exact version/branch/set/policy fingerprint.
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

        return {
          context: {
            ...context,
            decisionHeadId,
            applicableException,
          },
          receipt,
        };
      });

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
