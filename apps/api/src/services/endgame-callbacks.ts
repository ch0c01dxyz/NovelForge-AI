/**
 * @novelforge/api — endgame callback + legacy services (M7, NF-WF-022B).
 *
 * Setup/payoff callback tracking and legacy records. The debt report
 * (022A) reads these tables; 022B does NOT build it.
 *
 * Invariants (contract §"Behavior and invariants"):
 * - Callbacks are EXPLICIT (Invariant 5): a callback row is created ONLY
 *   by the author's explicit POST .../endgame/callbacks. There is no
 *   detection, no auto-linking, no background job — this module exports
 *   no other write path to endgame_callbacks (pinned by test).
 * - Read-only on canon (Invariant 3): planning tables only; the service
 *   never writes to canon/story tables.
 * - Never auto-close (Invariant 1): statuses change only via explicit
 *   author action (createCallback with a payoff).
 *
 * Capabilities: endgame:read / endgame:manage (contract-pinned, 022A §Capabilities).
 * Added to authorization.ts by 022A (in-tree, uncommitted at 022B
 * implementation time — coordination point, no duplication).
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { Capability } from "@novelforge/auth/authorization";
import { requireCapability } from "@novelforge/auth/authorization";
// Shared error vocabulary; the app-wide handler in platform-routes.ts maps
// these once. EndgameCallbackError is the typed 400/404/409 for endgame refusals.
import { NotFoundError } from "./platform.ts";

/**
 * NF-WF-022B: typed endgame refusals. 400s are input validation (contract
 * acceptance); 404s are unknown ids; 409s are state conflicts.
 */
export type EndgameCallbackErrorCode =
  | "INVALID_INPUT" // malformed input (bad uuid, setup == payoff, bad kind)
  | "CALLBACK_NOT_FOUND" // 404: unknown callback id
  | "LEGACY_NOT_FOUND" // 404: unknown legacy id
  | "DUPLICATE_CALLBACK"; // 409: this setup already has a callback for the novel

export class EndgameCallbackError extends Error {
  readonly code: EndgameCallbackErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: EndgameCallbackErrorCode, message: string) {
    super(message);
    this.name = "EndgameCallbackError";
    this.code = code;
    this.statusCode =
      code === "CALLBACK_NOT_FOUND" || code === "LEGACY_NOT_FOUND"
        ? 404
        : code === "DUPLICATE_CALLBACK"
          ? 409
          : 400;
  }
}

/** Pinned EndgameCallback.status values (contract §Migration). */
export type EndgameCallbackStatus = "PENDING" | "PAID";

/** Pinned EndgameLegacy.kind values (contract §Migration). */
export type EndgameLegacyKind = "CHARACTER" | "WORLD" | "THEMATIC";

export interface EndgameCallbackShape {
  id: string;
  novelId: string;
  setupEventId: string;
  payoffEventId: string | null;
  status: EndgameCallbackStatus;
  description: string | null;
  createdById: string;
  createdAt: Date;
}

export interface EndgameLegacyShape {
  id: string;
  novelId: string;
  kind: EndgameLegacyKind;
  subjectId: string | null;
  description: string;
  createdById: string;
  createdAt: Date;
}

export interface EndgameCallbackServices {
  createCallback(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    setupEventId: string;
    payoffEventId?: string;
    description?: string;
  }): Promise<EndgameCallbackShape>;

  listCallbacks(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    status?: EndgameCallbackStatus;
  }): Promise<EndgameCallbackShape[]>;

  /** Setups without payoff (status PENDING). Read by 022A's debt report. */
  listUnpaidCallbacks(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<EndgameCallbackShape[]>;

  recordLegacy(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    kind: EndgameLegacyKind;
    subjectId?: string;
    description: string;
  }): Promise<EndgameLegacyShape>;

  listLegacies(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    kind?: EndgameLegacyKind;
  }): Promise<EndgameLegacyShape[]>;
}

export function createEndgameCallbackServices({
  db,
}: {
  db: NovelForgeDb;
}): EndgameCallbackServices {
  /** Membership gate — 404 for non-members (ADR-0004), role for caps. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
  }

  function toCallbackShape(row: {
    id: string;
    novelId: string;
    setupEventId: string;
    payoffEventId: string | null;
    status: string;
    description: string | null;
    createdById: string;
    createdAt: Date;
  }): EndgameCallbackShape {
    return {
      id: row.id,
      novelId: row.novelId,
      setupEventId: row.setupEventId,
      payoffEventId: row.payoffEventId,
      status: row.status as EndgameCallbackStatus,
      description: row.description,
      createdById: row.createdById,
      createdAt: row.createdAt,
    };
  }

  function toLegacyShape(row: {
    id: string;
    novelId: string;
    kind: string;
    subjectId: string | null;
    description: string;
    createdById: string;
    createdAt: Date;
  }): EndgameLegacyShape {
    return {
      id: row.id,
      novelId: row.novelId,
      kind: row.kind as EndgameLegacyKind,
      subjectId: row.subjectId,
      description: row.description,
      createdById: row.createdById,
      createdAt: row.createdAt,
    };
  }

  return {
    /**
     * Link setup → payoff. THE explicit author action (Invariant 5).
     * This is the ONLY write path to endgame_callbacks in this module —
     * no detection, no auto-linking, no background creation (pinned).
     */
    async createCallback({
      actorUserId,
      workspaceId,
      novelId,
      setupEventId,
      payoffEventId,
      description,
    }) {
      await gate(workspaceId, novelId, actorUserId, "endgame:manage");

      if (payoffEventId !== undefined && payoffEventId === setupEventId) {
        throw new EndgameCallbackError(
          "INVALID_INPUT",
          "setup and payoff must be different events",
        );
      }

      const existing = await db.endgameCallback.findUnique({
        where: { novelId_setupEventId: { novelId, setupEventId } },
        select: { id: true },
      });
      if (existing) {
        throw new EndgameCallbackError(
          "DUPLICATE_CALLBACK",
          "this setup already has a callback for the novel",
        );
      }

      const row = await db.endgameCallback.create({
        data: {
          workspaceId,
          novelId,
          setupEventId,
          payoffEventId: payoffEventId ?? null,
          status: payoffEventId !== undefined ? "PAID" : "PENDING",
          description: description ?? null,
          createdById: actorUserId,
        },
      });
      return toCallbackShape(row);
    },

    async listCallbacks({ actorUserId, workspaceId, novelId, status }) {
      await gate(workspaceId, novelId, actorUserId, "endgame:read");
      const rows = await db.endgameCallback.findMany({
        where: {
          workspaceId,
          novelId,
          ...(status === undefined ? {} : { status }),
        },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toCallbackShape);
    },

    async listUnpaidCallbacks({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "endgame:read");
      const rows = await db.endgameCallback.findMany({
        where: { workspaceId, novelId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toCallbackShape);
    },

    async recordLegacy({
      actorUserId,
      workspaceId,
      novelId,
      kind,
      subjectId,
      description,
    }) {
      await gate(workspaceId, novelId, actorUserId, "endgame:manage");

      if (description.trim().length === 0) {
        throw new EndgameCallbackError("INVALID_INPUT", "description must not be empty");
      }

      const row = await db.endgameLegacy.create({
        data: {
          workspaceId,
          novelId,
          kind,
          subjectId: subjectId ?? null,
          description,
          createdById: actorUserId,
        },
      });
      return toLegacyShape(row);
    },

    async listLegacies({ actorUserId, workspaceId, novelId, kind }) {
      await gate(workspaceId, novelId, actorUserId, "endgame:read");
      const rows = await db.endgameLegacy.findMany({
        where: {
          workspaceId,
          novelId,
          ...(kind === undefined ? {} : { kind }),
        },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toLegacyShape);
    },
  };
}
