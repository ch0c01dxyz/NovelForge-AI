/**
 * Reader notification routes (NF-WF-019C): the authenticated reader's
 * in-app inbox and preferences (`/api/reader/notifications*`).
 *
 * All routes here are authenticated by construction (the `requireActor`
 * pattern: nf_session cookie → auth.validateSession → 401
 * {error:"UNAUTHENTICATED"}). Inbox and preferences are private to the
 * owning user (Invariant 4) — there is no endpoint listing another
 * user's notifications or preferences. Notification rows carry IDs +
 * type only; display names resolve at read time (no email, no
 * credential material).
 *
 * Zod validation → 400 {error:"INVALID_INPUT"}. Unknown notification
 * id → 404 {error:"NOT_FOUND"} (identical for another user's rows —
 * the 013 no-oracle rule).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { NotFoundError } from "@novelforge/ai-services";
import {
  PINNED_NOTIFICATION_TYPES,
  type NotificationServices,
} from "./services/notifications.ts";

const cursor = z.string().min(1).max(200).optional();
const limit = z.coerce.number().int().min(1).max(50).optional();

const listQuery = z.object({ cursor, limit });

const notificationIdParams = z.object({ id: z.string().min(1).max(200) });

const preferencesBody = z.object({
  preferences: z
    .array(
      z.object({
        type: z.string().min(1).max(50),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(PINNED_NOTIFICATION_TYPES.length),
});

export interface ReaderNotificationRoutesOptions {
  auth: AuthService;
  services: NotificationServices;
}

export function registerReaderNotificationRoutes(
  app: FastifyInstance,
  { auth, services }: ReaderNotificationRoutesOptions,
): void {
  /**
   * Resolve the caller to a userId, or reply 401. Notifications are
   * identity-based (no new capabilities per Invariant 8); the caller's
   * own inbox is the only readable one (Invariant 4).
   */
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

  const invalidInput = (reply: FastifyReply) =>
    reply.code(400).send({ error: "INVALID_INPUT" });

  async function run(
    reply: FastifyReply,
    fn: () => Promise<unknown>,
    successCode = 200,
  ) {
    try {
      const result = await fn();
      return reply.code(successCode).send(result ?? null);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return reply.code(404).send({ error: "NOT_FOUND" });
      }
      if (error instanceof Error && error.message.startsWith("INVALID_INPUT")) {
        return invalidInput(reply);
      }
      throw error;
    }
  }

  // --- Inbox ---

  app.get("/api/reader/notifications", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const query = listQuery.safeParse(request.query);
    if (!query.success) return invalidInput(reply);
    return run(reply, () =>
      services.listNotifications({
        userId,
        cursor: query.data.cursor,
        limit: query.data.limit,
      }),
    );
  });

  // Registered BEFORE /:id/read: Fastify matches in registration order
  // and "read-all" must not be captured as :id.
  app.post("/api/reader/notifications/read-all", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    return run(reply, () => services.markAllRead({ userId }));
  });

  app.post("/api/reader/notifications/:id/read", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const params = notificationIdParams.safeParse(request.params);
    if (!params.success) return invalidInput(reply);
    return run(reply, () =>
      services.markRead({ userId, id: params.data.id }),
    );
  });

  // --- Preferences ---

  app.get("/api/reader/notifications/preferences", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    return run(reply, () => services.getPreferences({ userId }));
  });

  app.put("/api/reader/notifications/preferences", async (request, reply) => {
    const userId = await requireActor(request, reply);
    if (!userId) return;
    const body = preferencesBody.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    // Only the pinned NotificationType values are accepted (the master
    // switch is a UI-only affordance that writes all three rows).
    for (const p of body.data.preferences) {
      if (!(PINNED_NOTIFICATION_TYPES as readonly string[]).includes(p.type)) {
        return invalidInput(reply);
      }
    }
    return run(reply, () =>
      services.setPreferences({ userId, preferences: body.data.preferences }),
    );
  });
}
