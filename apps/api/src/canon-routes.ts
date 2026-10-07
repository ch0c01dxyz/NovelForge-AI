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
} from "@novelforge/ai-services";
import type { CanonApplicationServices } from "./services/canon-applications.ts";

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

// NF-WF-016 (GAP-057): the attach half of the evidence lifecycle. Detach
// (`DELETE .../sources/:sourceId`) exists without an attach — asymmetric.
// Same span validation as createFact, via resolveSourceEvidence.
const factSourceBody = z.object({
  chapterVersionId: uuid.nullable().optional(),
  referenceVersionId: uuid.nullable().optional(),
  quote: z.string().min(1).max(20_000),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
});

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
  /**
   * The head the caller's plan was built against (C12.1 tri-state): omitted
   * asserts nothing, `null` asserts "no head yet", a uuid compares. NF-WF-002D
   * — `proposal.approve` is HIGH, so it carries the client assertion.
   */
  expectedHeadRevisionId: uuid.nullable().optional(),
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

// --- Contracted extraction applications (NF-WF-008) ---

const applicationParams = z.object({
  workspaceId: uuid,
  novelId: uuid,
  applicationId: uuid,
});

/**
 * The author's contracting for one extract claim: binds the claim
 * (identified by its index in the extract outcome's proposals[]) to
 * (entity, predicate, object, validFromChapter). The entity is an existing
 * id or an inline {kind, name} (created inside the apply transaction).
 */
const applicationItemBody = z.object({
  claimIndex: z.number().int().min(0),
  entity: z.union([
    z.object({ id: uuid }),
    z.object({
      kind: z.enum(STORY_ENTITY_KINDS),
      name: z.string().trim().min(1).max(300),
    }),
  ]),
  predicate: z.string().trim().min(1).max(200),
  object: z.union([
    z.object({ entityId: uuid }),
    z.object({ text: z.string().trim().min(1).max(2000) }),
  ]),
  validFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
});

const createApplicationBody = z.object({
  runId: uuid,
  extractStepKey: z.string().trim().min(1).max(64).optional(),
  items: z.array(applicationItemBody).min(1),
});

const applicationApproveBody = z.object({
  itemIds: z.array(uuid).min(1),
  confirmConflicts: z.boolean().optional(),
  /**
   * The head the caller's plan was built against (C12.1 tri-state): omitted
   * asserts nothing, `null` asserts "no head yet", a uuid compares.
   * Advisory — the application's pinned head is authoritative inside the
   * apply transaction.
   */
  expectedHeadRevisionId: uuid.nullable().optional(),
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
  applications: CanonApplicationServices;
}

/**
 * Validate the mode/readerChapter pair.
 *
 * A malformed pair is a 400 rather than a silent downgrade: `parseViewMode`
 * in the library is deny-by-default, which is right as a backstop but wrong
 * as a user-facing contract. Shared with retrieval-routes, which applies the
 * identical rule to search's mode/readerChapter.
 */
export function checkModePair(
  mode: string,
  readerChapter: number | undefined,
): "READER_CHAPTER_REQUIRED" | "READER_CHAPTER_NOT_ALLOWED" | null {
  if (mode === "READER" && readerChapter === undefined) return "READER_CHAPTER_REQUIRED";
  if (mode !== "READER" && readerChapter !== undefined) return "READER_CHAPTER_NOT_ALLOWED";
  return null;
}

export function registerCanonRoutes(
  app: FastifyInstance,
  { auth, services, applications }: CanonRoutesOptions,
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

  // The entity-delete route the FK hardening anticipates: an entity cited by
  // any canon fact is refused (409) rather than allowed to take the canon
  // record with it — RESTRICT, not CASCADE (20261002 migration).
  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/entities/:entityId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ entityId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deleteEntity({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        entityId: params.data.entityId,
      });
      return reply.code(204).send();
    },
  );

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

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/facts/:factId/sources",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams
        .extend({ factId: uuid })
        .safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = factSourceBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.addSource({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        factId: params.data.factId,
        source: body.data,
      });
      return reply.code(201).send(created);
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

  // --- Contracted extraction applications (NF-WF-008) ---
  //
  // Novel-scoped, matching the rest of the canon router: the application
  // service resolves tenant scope from the STORED row, so a cross-tenant id
  // fails as a 404 exactly as a nonexistent one does. The pre-existing
  // proposal approve/reject routes are workspace-scoped (ADR-0008 §6) — the
  // asymmetry is deliberate and pre-existing, not introduced here.

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/applications",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createApplicationBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await applications.createApplication({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        ...body.data,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = applicationParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return applications.getApplication({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        applicationId: params.data.applicationId,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/revalidate",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = applicationParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return applications.revalidateApplication({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        applicationId: params.data.applicationId,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/approve",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = applicationParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = applicationApproveBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return applications.approveApplication({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        applicationId: params.data.applicationId,
        ...body.data,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/reject",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = applicationParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = rejectBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await applications.rejectApplication({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        applicationId: params.data.applicationId,
        ...(body.data.note !== undefined ? { note: body.data.note } : {}),
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
