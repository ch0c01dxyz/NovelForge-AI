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
  })
  .strict();

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
  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-review-context",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const params = scaleDecisionParams.parse(req.params);
      const query = z.object({ chapterVersionId: uuid }).parse(req.query);
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const membership = await getMembership(db, params.workspaceId, session.userId);
      requireCapability(membership.role, "chapter:read" as Capability);
      requireCapability(membership.role, "canon:read" as Capability);

      const context = await db.$transaction(async (tx) => {
        return await readScaleContext(tx as never, {
          workspaceId: params.workspaceId,
          novelId: params.novelId,
          chapterId: params.chapterId,
          chapterVersionId: query.chapterVersionId,
        });
      });

      return reply.code(200).send({ context });
    },
  );

  // POST /chapters/:chapterId/scale-decisions
  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-decisions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const params = scaleDecisionParams.parse(req.params);
      const body = createProposalBody.parse(req.body);
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });

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
      const params = scaleDecisionParams.parse(req.params);
      const query = decisionsQuery.parse(req.query);
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const membership = await getMembership(db, params.workspaceId, session.userId);
      requireCapability(membership.role, "chapter:read" as Capability);
      requireCapability(membership.role, "canon:read" as Capability);

      const where = {
        novelId: params.novelId,
        chapterVersionId: query.chapterVersionId,
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
      const params = proposalIdParams.parse(req.params);
      const body = decideProposalBody.parse(req.body);
      const token = req.cookies[SESSION_COOKIE];
      const session = token ? await auth.validateSession(token) : null;
      if (!session) return reply.code(401).send({ error: "UNAUTHORIZED" });

      // Service enforces chapter:update AND canon:manage AND canon:approve.
      const result = await decisions.decideProposal({
        actorUserId: session.userId,
        workspaceId: params.workspaceId,
        novelId: params.novelId,
        proposalId: params.proposalId,
        ...body,
      });

      return reply.code(200).send(result);
    },
  );
}
