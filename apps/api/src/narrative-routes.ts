/**
 * Narrative DNA & rhythm routes (Phase 9 write surface).
 *
 * Same contract as story-routes and character-routes: workspace-scoped URLs,
 * session-cookie auth, Zod at every boundary, tenant resolution inside the
 * service from the STORED row (a cross-tenant id is a 404, not a 403 — no
 * existence leak).
 *
 * Enum bodies use the domain package's local mirrors (`z.enum(...)` over
 * ANTAGONIST_STAGES etc.), not the Prisma enums — the mirrors are pinned by a
 * test, so a schema/vocabulary drift fails there rather than silently
 * widening what this route accepts.
 *
 * The four assess endpoints are POST because each takes a structured body
 * (a chapter count, a beat history, a proposal) rather than addressing a
 * resource; they read and persist nothing.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  ANTAGONIST_OUTCOMES,
  ANTAGONIST_ROLES,
  ANTAGONIST_STAGES,
  DRAMA_TYPES,
  NARRATIVE_POLICY_KINDS,
  NARRATIVE_SCALES,
  POLICY_HARDNESSES,
  REPEATED_SEQUENCE_MIN_OCCURRENCES,
} from "@novelforge/narrative-rhythm";
import type { NarrativeServices } from "./services/narrative.ts";

const uuid = z.string().uuid();
const novelParams = z.object({ workspaceId: uuid, novelId: uuid });
const antagonistParams = z.object({ workspaceId: uuid, novelId: uuid, antagonistId: uuid });

const chapter = z.number().int().min(0).max(100_000);

// Fastify's default bodyLimit is 1 MB, and both of these accept more, so
// without a per-route limit a schema-valid payload 413s before Zod ever runs
// — the same defect manifest-routes.ts guards against.
//
// The limits are UTF-8 BYTES; the schemas cap CHARACTERS. Measured at the
// declared maxima with 3-byte CJK ids, which is the worst case a JSONB-ish
// string field admits:
//   patterns  10 000 beats x 2 x 200 chars  -> 12 382 103 B (11.81 MiB)
//   cooldown   5 000 beats x 1 x 200 chars  ->  3 235 672 B ( 3.09 MiB)
// The ASCII case is 4 374 103 B and 1 235 272 B. Each constant sits just
// above the CJK measurement, so every payload the schema describes is
// reachable rather than refused by the transport before validation.
const PATTERNS_BODY_LIMIT = 13_000_000;
const COOLDOWN_BODY_LIMIT = 3_500_000;

const putDnaBody = z.object({
  // A record, not a field inventory: no rule consumes a DNA field yet, and
  // pinning a list here would make this file a second schema (see the
  // service comment).
  dna: z.record(z.string(), z.unknown()),
});

const policyKind = z.enum(NARRATIVE_POLICY_KINDS);
const policyParams = novelParams.extend({ kind: policyKind });

const putPolicyBody = z.object({
  kind: policyKind,
  hardness: z.enum(POLICY_HARDNESSES),
  hardReason: z.string().trim().max(2_000).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

const assessWindowBody = z.object({
  chaptersSinceDrama: chapter,
});

const checkBeatBody = z.object({
  candidate: z.object({
    id: z.string().trim().min(1).max(200),
    type: z.enum(DRAMA_TYPES),
    chapter,
  }),
  history: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        type: z.enum(DRAMA_TYPES),
        chapter,
      }),
    )
    .max(5_000)
    .default([]),
});

const createAntagonistBody = z.object({
  characterId: uuid,
  role: z.enum(ANTAGONIST_ROLES),
  stage: z.enum(ANTAGONIST_STAGES).default("INTRODUCTION"),
  outcome: z.enum(ANTAGONIST_OUTCOMES).nullable().optional(),
  purpose: z.string().trim().max(20_000).nullable().optional(),
  // Chapters are 1-based (chapters.number starts at 1), unlike canon's
  // 0-based availableFromChapter — the migration CHECK says so.
  fromChapter: z.number().int().min(1).max(100_000),
  toChapter: z.number().int().min(1).max(100_000).nullable().optional(),
});

const advanceStageBody = z.object({
  stage: z.enum(ANTAGONIST_STAGES),
  outcome: z.enum(ANTAGONIST_OUTCOMES).nullable().optional(),
});

const detectPatternBody = z.object({
  beats: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        kind: z.string().trim().min(1).max(200),
        chapter,
      }),
    )
    .max(10_000),
  sequence: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  minOccurrences: z.number().int().min(REPEATED_SEQUENCE_MIN_OCCURRENCES).max(100).optional(),
});

const assessScaleBody = z.object({
  proposal: z.object({
    id: z.string().trim().min(1).max(200),
    scale: z.enum(NARRATIVE_SCALES),
    summary: z.string().trim().max(20_000).nullable().optional(),
  }),
  standing: z.object({
    scale: z.enum(NARRATIVE_SCALES),
    access: z.array(z.enum(NARRATIVE_SCALES)).max(NARRATIVE_SCALES.length),
    reputation: z.number().int().min(0).max(100),
  }),
});

export interface NarrativeRoutesOptions {
  auth: AuthService;
  services: NarrativeServices;
}

export function registerNarrativeRoutes(
  app: FastifyInstance,
  { auth, services }: NarrativeRoutesOptions,
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

  // --- Narrative DNA ---

  app.get("/api/workspaces/:workspaceId/novels/:novelId/narrative/dna", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    // null, not 404: the novel exists (the gate would have thrown otherwise),
    // and "this author has not written a DNA profile yet" is a real answer.
    return services.getDna({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
    });
  });

  app.put("/api/workspaces/:workspaceId/novels/:novelId/narrative/dna", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const params = novelParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const body = putDnaBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return services.putDna({
      actorUserId,
      workspaceId: params.data.workspaceId,
      novelId: params.data.novelId,
      dna: body.data.dna,
    });
  });

  // --- Policies ---

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/policies",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listPolicies({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
      });
    },
  );

  app.put(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/policies",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = putPolicyBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.putPolicy({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        kind: body.data.kind,
        hardness: body.data.hardness,
        hardReason: body.data.hardReason ?? null,
        payload: body.data.payload,
      });
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/policies/:kind",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = policyParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.deletePolicy({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        kind: params.data.kind,
      });
      return reply.code(204).send();
    },
  );

  // --- Rhythm assessments ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/drama-window",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = assessWindowBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.assessWindow({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        chaptersSinceDrama: body.data.chaptersSinceDrama,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/cooldown",
    { bodyLimit: COOLDOWN_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = checkBeatBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.checkBeat({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        candidate: body.data.candidate,
        history: body.data.history,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/patterns",
    { bodyLimit: PATTERNS_BODY_LIMIT },
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = detectPatternBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.detectPattern({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        beats: body.data.beats,
        sequence: body.data.sequence,
        minOccurrences: body.data.minOccurrences,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/scale",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = assessScaleBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.assessScale({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        proposal: body.data.proposal,
        standing: body.data.standing,
      });
    },
  );

  // --- Antagonists ---

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/antagonists",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = createAntagonistBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const created = await services.createAntagonist({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        characterId: body.data.characterId,
        role: body.data.role,
        stage: body.data.stage,
        outcome: body.data.outcome ?? null,
        purpose: body.data.purpose ?? null,
        fromChapter: body.data.fromChapter,
        toChapter: body.data.toChapter ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/antagonists",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = novelParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.listAntagonists({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
      });
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/novels/:novelId/narrative/antagonists/:antagonistId/stage",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const params = antagonistParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const body = advanceStageBody.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      return services.advanceAntagonistStage({
        actorUserId,
        workspaceId: params.data.workspaceId,
        novelId: params.data.novelId,
        antagonistId: params.data.antagonistId,
        stage: body.data.stage,
        // Passed through as-is: an omitted outcome must leave the stored one
        // alone, while an explicit null clears it. `?? null` here would make
        // advancing a stage silently erase an outcome already recorded.
        outcome: body.data.outcome,
      });
    },
  );
}
