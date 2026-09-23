/**
 * Platform routes (ADR-0004): workspaces, members, novels.
 *
 * Routes authenticate via the session cookie, validate with Zod, and
 * delegate to PlatformServices. Service errors map to predictable HTTP
 * codes; membership gaps are 404 (no tenant existence leaks).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { ROLES, type Role } from "@novelforge/auth/authorization";
import { SESSION_COOKIE } from "./auth-routes.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type PlatformServices,
} from "./services/platform.ts";

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

const createWorkspaceBody = z.object({ name: z.string().min(1).max(120), slug });
const createNovelBody = z.object({ title: z.string().min(1).max(200), slug });
const roleEnum = z.enum(ROLES);
const addMemberBody = z.object({ userId: z.string().uuid(), role: roleEnum });
const changeRoleBody = z.object({ role: roleEnum });

export interface PlatformRoutesOptions {
  auth: AuthService;
  services: PlatformServices;
}

/** Resolve the authenticated userId from the session cookie, else null. */
async function actorOf(
  request: FastifyRequest,
  auth: AuthService,
): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await auth.validateSession(token);
  return session?.userId ?? null;
}

export async function registerPlatformRoutes(
  app: FastifyInstance,
  { auth, services }: PlatformRoutesOptions,
): Promise<void> {
  // Map service-layer errors to HTTP once, for all platform routes.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ForbiddenError) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: "NOT_FOUND" });
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send({ error: "CONFLICT" });
    }
    // Never leak internals (CLAUDE.md §15); log with request id.
    request.log.error(error);
    return reply.code(500).send({ error: "INTERNAL" });
  });

  async function requireActor(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> {
    const actorUserId = await actorOf(request, auth);
    if (!actorUserId) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return actorUserId;
  }

  // --- Workspaces ---
  app.post("/api/workspaces", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const parsed = createWorkspaceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const { id } = await services.createWorkspace({ actorUserId, ...parsed.data });
      return reply.code(201).send({ id });
    } catch (e) {
      if (e instanceof ConflictError) return reply.code(409).send({ error: "CONFLICT" });
      throw e;
    }
  });

  app.get("/api/workspaces/:workspaceId", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await services.getWorkspace(actorUserId, workspaceId);
    return ws;
  });

  // --- Members ---
  app.get("/api/workspaces/:workspaceId/members", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId } = request.params as { workspaceId: string };
    return services.listMembers(actorUserId, workspaceId);
  });

  app.post("/api/workspaces/:workspaceId/members", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const parsed = addMemberBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const { id } = await services.addMember({ actorUserId, workspaceId, ...parsed.data });
    return reply.code(201).send({ id });
  });

  app.patch(
    "/api/workspaces/:workspaceId/members/:userId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const { workspaceId, userId } = request.params as {
        workspaceId: string;
        userId: string;
      };
      const parsed = changeRoleBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      await services.changeMemberRole({
        actorUserId,
        workspaceId,
        userId,
        role: parsed.data.role as Role,
      });
      return { status: "ok" };
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/members/:userId",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const { workspaceId, userId } = request.params as {
        workspaceId: string;
        userId: string;
      };
      await services.removeMember({ actorUserId, workspaceId, userId });
      return { status: "ok" };
    },
  );

  // --- Novels ---
  app.get("/api/novels", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    return services.listNovelsForUser(actorUserId);
  });

  app.post("/api/workspaces/:workspaceId/novels", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId } = request.params as { workspaceId: string };
    const parsed = createNovelBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const { id } = await services.createNovel({ actorUserId, workspaceId, ...parsed.data });
    return reply.code(201).send({ id });
  });

  app.get("/api/workspaces/:workspaceId/novels", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId } = request.params as { workspaceId: string };
    return services.listNovels(actorUserId, workspaceId);
  });

  app.get("/api/workspaces/:workspaceId/novels/:novelId", async (request, reply) => {
    const actorUserId = await requireActor(request, reply);
    if (!actorUserId) return;
    const { workspaceId, novelId } = request.params as {
      workspaceId: string;
      novelId: string;
    };
    return services.getNovel(actorUserId, workspaceId, novelId);
  });
}
