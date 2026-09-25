/**
 * Story intelligence routes (Phase 6).
 *
 * Workspace-scoped, like every other mutation route in the repo: the canon
 * service resolves tenant scope from the STORED row, so a cross-tenant id
 * fails as a 404 exactly as a nonexistent one does. The approve/reject
 * routes carry a workspaceId for that reason rather than trusting a bare
 * proposal id (ADR-0008 §6).
 *
 * Deliberately absent: a free-text question endpoint. The Brain dispatches
 * on a discriminated question kind, which is what keeps the roadmap's exit
 * criterion machine-assertable — and NL dispatch would put a model call in
 * the answer path, turning a deterministic read into an untestable one.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  STORY_ENTITY_KINDS,
  type CanonServices,
} from "./services/canon.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const proposalParams = z.object({ workspaceId: uuid, proposalId: uuid });

const keyField = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "key must be lowercase letters, digits and dashes");

const objectFields = {
  objectEntityId: uuid.nullable().optional(),
  objectText: z.string().trim().min(1).max(2000).nullable().optional(),
};

const createEntityBody = z.object({
  kind: z.enum(STORY_ENTITY_KINDS),
  name: z.string().trim().min(1).max(300),
  key: keyField.optional(),
});

const createFactBody = z.object({
  entityId: uuid,
  predicate: z.string().trim().min(1).max(200),
  ...objectFields,
  statement: z.string().trim().min(1).max(4000).optional(),
  validFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
  validUntilChapter: z.number().int().min(0).max(100_000).nullable().optional(),
  // Omitted means "not reader-visible" (CLAUDE.md §10) — never defaulted
  // to 0, which would make an unclassified fact visible at chapter 0.
  availableFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
  source: z
    .object({
      chapterVersionId: uuid.nullable().optional(),
      referenceVersionId: uuid.nullable().optional(),
      quote: z.string().min(1).max(20_000),
      start: z.number().int().min(0),
      end: z.number().int().min(1),
    })
    .optional(),
})
  // `valid_until < valid_from` violates CanonFact_valid_window_ordered, and
  // Prisma 7 surfaces a CHECK violation as P2039. The service's own conflict
  // mapping now catches P2039 and would serve a 409, so this is not the only
  // guard on the path — but a window that runs backwards is malformed input,
  // not a conflict with current canon, and 400 names that better. Both
  // layers are deliberate: the refine states the rule at the boundary the
  // request enters, the service mapping is the backstop for the paths that
  // reach the table without it.
  .refine(
    (b) =>
      b.validFromChapter == null ||
      b.validUntilChapter == null ||
      b.validUntilChapter >= b.validFromChapter,
    { message: "validUntilChapter must not be before validFromChapter" },
  );

const proposeBody = z.object({
  entityId: uuid,
  predicate: z.string().trim().min(1).max(200),
  ...objectFields,
  statement: z.string().trim().min(1).max(4000).optional(),
  // When the proposed claim becomes true in-story. Carried onto the fact at
  // approval AND used to close the superseded fact's validity window — the
  // one input that makes as-of reconstruction possible.
  validFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
});

const approveBody = z.object({
  availableFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
});

const rejectBody = z.object({
  note: z.string().trim().max(2000).optional(),
});

/**
 * A retraction records why the claim was withdrawn. Optional because the
 * decision is the point, not the prose — but it is audited.
 */
const flagBody = z.object({
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Discriminated on `kind`. The four slice-2 kinds are ACCEPTED here and
 * answered with an explicit not-implemented marker — refusing them at the
 * schema would make the API look as if the question does not exist, when
 * the truth is that it is not answerable yet.
 */
const askBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FACT"), entityId: uuid, predicate: z.string().trim().min(1).max(200) }),
  z.object({
    kind: z.literal("STATE"),
    entityId: uuid,
    predicate: z.string().trim().min(1).max(200),
    atChapter: z.number().int().min(0).max(100_000),
  }),
  z.object({ kind: z.literal("RETRIEVAL"), query: z.string().trim().min(1).max(2000) }),
  z.object({ kind: z.literal("EVENT") }),
  z.object({ kind: z.literal("CAUSAL") }),
  z.object({ kind: z.literal("UNRESOLVED") }),
  z.object({ kind: z.literal("PROMISES") }),
]);

// Query-string params arrive as strings, so every numeric field is coerced.
// (`readerChapter` is a body field on the retrieval search route, where a
// bare z.number() is correct — here it travels in the query string.)
const askQuery = z.object({
  mode: z.enum(["AUTHOR", "EDITOR", "READER"]).optional(),
  readerChapter: z.coerce.number().int().min(0).max(100_000).optional(),
});

export interface CanonRoutesOptions {
  auth: AuthService;
  services: CanonServices;
}

/**
 * Validate the mode/readerChapter pair.
 *
 * A malformed pair is a 400 rather than a silent downgrade: `parseViewMode`
 * in the library is deny-by-default, which is right as a backstop but wrong
 * as a user-facing contract. Declared once because all three reader-facing
 * routes need the same rule.
 */
function checkModePair(
  mode: string,
  readerChapter: number | undefined,
): "READER_CHAPTER_REQUIRED" | "READER_CHAPTER_NOT_ALLOWED" | null {
  if (mode === "READER" && readerChapter === undefined) return "READER_CHAPTER_REQUIRED";
  if (mode !== "READER" && readerChapter !== undefined) return "READER_CHAPTER_NOT_ALLOWED";
  return null;
}

export function registerCanonRoutes(
  app: FastifyInstance,
  { auth, services }: CanonRoutesOptions,
): void {
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return session.userId;
  };

  // --- Entities ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/canon/entities", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createEntityBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createEntity({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/canon/entities", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({ kind: z.enum(STORY_ENTITY_KINDS).optional() })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listEntities({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...(query.data.kind ? { kind: query.data.kind } : {}),
    });
  });

  // --- Facts ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/canon/facts", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = createFactBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.createFact({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/canon/facts", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({
        entityId: uuid.optional(),
        predicate: z.string().trim().min(1).max(200).optional(),
        // `z.stringbool`, not `z.coerce.boolean`: the latter is Boolean(str),
        // so the literal query string `includeSuperseded=false` coerces to
        // TRUE and every request that asks to hide superseded rows shows them.
        // A typo is a 400 rather than a silently ignored flag.
        includeSuperseded: z.stringbool().optional(),
        mode: z.enum(["AUTHOR", "EDITOR", "READER"]).optional(),
        readerChapter: z.coerce.number().int().min(0).max(100_000).optional(),
      })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    // Listing canon is a read of story truth, so it obeys the same spoiler
    // boundary the Brain does (CLAUDE.md §10). Defaulting to READER is
    // deliberate: an omitted mode must not be the permissive one.
    const mode = query.data.mode ?? "READER";
    const pairError = checkModePair(mode, query.data.readerChapter);
    if (pairError) return reply.code(400).send({ error: pairError });

    return services.listFacts({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...query.data,
      mode,
    });
  });

  // --- Facts ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/facts/:factId/retract",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ factId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = flagBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.retractFact({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        factId: params.data.factId,
        ...body.data,
      });
      return reply.code(204).send();
    },
  );

  // The escape hatch for a chapter blocked from deletion by a canon citation:
  // the evidence FKs are RESTRICT, so without a way to remove a citation the
  // block would be permanent.
  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/facts/:factId/sources/:sourceId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ factId: uuid, sourceId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.unlinkSource({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        factId: params.data.factId,
        sourceId: params.data.sourceId,
      });
      return reply.code(204).send();
    },
  );

  // --- Proposals (candidate canon) ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/canon/proposals", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = proposeBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const created = await services.proposeCandidate({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...body.data,
    });
    return reply.code(201).send(created);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId/canon/proposals", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({
        status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "SUPERSEDED"]).optional(),
      })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listProposals({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      ...query.data,
    });
  });

  app.post(
    "/api/workspaces/:workspaceId/canon/proposals/:proposalId/approve",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = proposalParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = approveBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.approveProposal({
        actorUserId,
        workspaceId: params.data.workspaceId,
        proposalId: params.data.proposalId,
        ...body.data,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/canon/proposals/:proposalId/reject",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = proposalParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = rejectBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.rejectProposal({
        actorUserId,
        workspaceId: params.data.workspaceId,
        proposalId: params.data.proposalId,
        ...body.data,
      });
      return reply.code(204).send();
    },
  );

  // --- Story Brain ---

  app.post("/api/workspaces/:workspaceId/novels/:novelId/story-brain/ask", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = askBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = askQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    // The mode/readerChapter pair is validated by checkModePair rather than
    // silently downgraded. Defaulting to READER is deliberate: an omitted
    // mode must not be the permissive one.
    const mode = query.data.mode ?? "READER";
    const pairError = checkModePair(mode, query.data.readerChapter);
    if (pairError) return reply.code(400).send({ error: pairError });

    return services.ask({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      question: body.data,
      mode,
      ...(query.data.readerChapter !== undefined
        ? { readerChapter: query.data.readerChapter }
        : {}),
    });
  });
}
