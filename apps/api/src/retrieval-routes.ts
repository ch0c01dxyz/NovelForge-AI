/**
 * Knowledge / retrieval routes (Phase 5).
 *
 * Every route is workspace-scoped: a reference belongs to one tenant, and
 * the service resolves that scope from the STORED row, never from an id in
 * the URL. A cross-tenant id therefore fails as a 404, exactly as a
 * nonexistent one does — the caller learns nothing about another tenant's
 * data by probing ids.
 *
 * Two things these handlers deliberately do not decide:
 * - authorization (the service gates each operation by capability);
 * - spoiler filtering (the service applies it in SQL and re-checks it).
 *
 * The mode/readerChapter pair IS validated here (by the shared
 * `checkModePair` from canon-routes), because a malformed value must be a
 * 400 rather than silently downgraded — `parseViewMode` in the library is
 * deny-by-default, which is right as a backstop but wrong as a user-facing
 * contract.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { checkModePair } from "./canon-routes.ts";
import type { RetrievalServices } from "./services/retrieval.ts";

const uuid = z.string().uuid();
const workspaceParams = z.object({ workspaceId: uuid });
const referenceParams = z.object({ referenceId: uuid });
const versionParams = z.object({ versionId: uuid });

const REFERENCE_KINDS = [
  "NOTE",
  "GUIDE",
  "RESEARCH",
  "STYLE",
  "GLOSSARY",
  "IMPORTED",
] as const;

const keyField = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "key must be lowercase letters, digits and dashes");

// A reference is a document, so its body can be large — the manuscript
// import limit, for the same reason.
//
// The limit is measured in UTF-8 BYTES of the received body; the Zod schema
// caps CHARACTERS at 8M. For CJK those differ by 3x, and JSON escaping of
// control characters can add more, so 24MB (3 bytes/char over the full cap)
// is the smallest limit under which the advertised 8M-character document is
// actually reachable.
const REFERENCE_BODY_LIMIT = 24_000_000;

const createReferenceBody = z.object({
  novelId: uuid.optional(),
  key: keyField,
  title: z.string().trim().min(1).max(300),
  kind: z.enum(REFERENCE_KINDS).optional(),
  source: z.string().trim().max(2000).optional(),
  content: z.string().max(8_000_000).default(""),
});

const addVersionBody = z.object({
  content: z.string().max(8_000_000),
  note: z.string().trim().max(1000).optional(),
});

/**
 * `availableFromChapter` is the spoiler boundary (CLAUDE.md §10). Omitted
 * means "not reader-visible", which the schema enforces by leaving it
 * undefined rather than defaulting to 0 — 0 would make an unclassified
 * chunk visible to a reader on chapter 0.
 */
const ingestBody = z.object({
  availableFromChapter: z.number().int().min(0).max(100_000).nullable().optional(),
});

const searchBody = z.object({
  query: z.string().trim().min(1).max(2000),
  novelId: uuid.optional(),
  mode: z.enum(["AUTHOR", "EDITOR", "READER"]).optional(),
  // Required in READER mode, refused as meaningless otherwise: a reader
  // position on an author query would look like it filtered something.
  readerChapter: z.number().int().min(0).max(100_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export interface RetrievalRoutesOptions {
  auth: AuthService;
  services: RetrievalServices;
}

export function registerRetrievalRoutes(
  app: FastifyInstance,
  { auth, services }: RetrievalRoutesOptions,
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

  // --- References (workspace-scoped) ---

  app.post(
    "/api/workspaces/:workspaceId/references",
    { bodyLimit: REFERENCE_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createReferenceBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createReference({
        actorUserId,
        workspaceId: params.data.workspaceId,
        ...body.data,
      });
      return reply.code(201).send(created);
    },
  );

  app.get("/api/workspaces/:workspaceId/references", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listReferences({ actorUserId, workspaceId: params.data.workspaceId });
  });

  app.get("/api/references/:referenceId", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = referenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.getReference({ actorUserId, referenceId: params.data.referenceId });
  });

  app.post(
    "/api/references/:referenceId/versions",
    { bodyLimit: REFERENCE_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = referenceParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = addVersionBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.addReferenceVersion({
        actorUserId,
        referenceId: params.data.referenceId,
        ...body.data,
      });
      return reply.code(201).send(created);
    },
  );

  app.post("/api/references/:referenceId/publish", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = referenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    await services.publishReference({
      actorUserId,
      referenceId: params.data.referenceId,
    });
    return { status: "ok" };
  });

  // Ingestion is on the VERSION, not the reference: chunks are cut from one
  // revision and must never mix two. Re-ingesting the same version is
  // idempotent; ingesting a new version replaces the previous projection.
  app.post("/api/reference-versions/:versionId/ingest", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = ingestBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.ingest({
      actorUserId,
      referenceVersionId: params.data.versionId,
      ...(body.data.availableFromChapter !== undefined
        ? { availableFromChapter: body.data.availableFromChapter }
        : {}),
    });
  });

  // --- Search + history (workspace-scoped) ---

  app.post("/api/workspaces/:workspaceId/retrieval/search", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = searchBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const mode = body.data.mode ?? "READER";
    // The same mode/readerChapter rule canon-routes applies to fact listing
    // and Brain asking; one validation, one contract. Defaulting to READER
    // is deliberate: an omitted mode must not be the permissive one.
    const pairError = checkModePair(mode, body.data.readerChapter);
    if (pairError) return reply.code(400).send({ error: pairError });

    return services.search({
      actorUserId,
      workspaceId: params.data.workspaceId,
      ...body.data,
      mode,
    });
  });

  app.get("/api/workspaces/:workspaceId/retrievals", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.listRetrievals({
      actorUserId,
      workspaceId: params.data.workspaceId,
      limit: query.data.limit,
    });
  });
}
