/**
 * @novelforge/api — endgame services (M7, NF-WF-022A).
 *
 * The closure ledger: per-thread MUST/SHOULD/MAY/OPEN/SEQUEL closure
 * statuses, closure criteria, and the condition-based ending gate.
 *
 * Invariants (contract §"Behavior and invariants"):
 * - NEVER auto-close (Invariant 1): the ONLY code path that changes a
 *   ledger status is updateLedgerEntry, which requires an explicit author
 *   action. No background job, no tick, no cascade touches `status`.
 * - No forced ending (Invariant 2): the gate is condition-based (all
 *   MUSTs closed + author sign-off). The module never keys the ending
 *   off a position in the manuscript.
 * - Read-only on canon (Invariant 3): the module queries StoryThread /
 *   StoryPromise via Prisma filtered by novelId (ADR-0007) and never
 *   writes to canon tables. All writes go to endgame_ledger /
 *   endgame_gate_approval / audit_logs only.
 * - MUST is blocking (Invariant 4): the gate returns BLOCKED if any MUST
 *   ledger entry's thread is not RESOLVED.
 *
 * 022A scope: ledger + gate + debt report. 022B adds callbacks/legacy
 * (the debt report reads 022B's endgame_callbacks table opportunistically —
 * see getDebtReport); 022C adds the 021 simulation integration.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";

/**
 * NF-WF-022A: typed endgame refusals. 400s are input validation;
 * 404s are missing entities; 409s are state conflicts.
 */
export type EndgameErrorCode =
  | "INVALID_INPUT" // malformed input
  | "THREAD_NOT_FOUND" // 404: thread id not in this novel
  | "LEDGER_NOT_FOUND" // 404: unknown ledger entry id
  | "DUPLICATE_LEDGER_ENTRY"; // 409: a ledger entry already exists for this thread

export class EndgameError extends Error {
  readonly code: EndgameErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: EndgameErrorCode, message: string) {
    super(message);
    this.name = "EndgameError";
    this.code = code;
    this.statusCode = code === "DUPLICATE_LEDGER_ENTRY" ? 409 : code === "INVALID_INPUT" ? 400 : 404;
  }
}

/** Pinned closure statuses (contract §Statuses). */
export type EndgameClosureStatus = "MUST" | "SHOULD" | "MAY" | "OPEN" | "SEQUEL";

export const ENDGAME_CLOSURE_STATUSES: readonly EndgameClosureStatus[] = [
  "MUST",
  "SHOULD",
  "MAY",
  "OPEN",
  "SEQUEL",
] as const;

export interface EndgameLedgerShape {
  id: string;
  /** Alias of `id` matching the contract's debt-report naming (`ledgerId`);
   * 022C's projection client consumes this field. */
  ledgerId: string;
  novelId: string;
  threadId: string;
  threadTitle: string;
  threadStatus: string;
  /** Derived: whether the linked story thread is RESOLVED. 022C's
   * projection client consumes this to seed initial state. The ledger's
   * own `status` (the author's plan) is never derived — only this flag. */
  closed: boolean;
  status: EndgameClosureStatus;
  criteria: string | null;
  rationale: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GateBlockingItem {
  ledgerId: string;
  threadId: string;
  threadTitle: string;
  status: EndgameClosureStatus;
  criteria: string | null;
}

export interface EndingGateShape {
  verdict: "BLOCKED" | "READY";
  blockingItems: GateBlockingItem[];
  approved: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
}

/** Pinned debt-report shape (contract §Routes). */
export interface DebtReportShape {
  unclosedMusts: { ledgerId: string; threadId: string; status: EndgameClosureStatus; criteria: string | null }[];
  unpaidCallbacks: { callbackId: string; setupEventId: string; description: string | null }[];
  openThreads: { threadId: string; title: string }[];
  sequelHooks: { ledgerId: string; threadId: string; description: string | null }[];
  generatedAt: string;
}

export interface EndgameServices {
  createLedgerEntry(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    threadId: string;
    status: EndgameClosureStatus;
    criteria?: string;
    rationale?: string;
  }): Promise<EndgameLedgerShape>;

  updateLedgerEntry(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    ledgerId: string;
    status?: EndgameClosureStatus;
    criteria?: string | null;
    rationale?: string | null;
  }): Promise<EndgameLedgerShape>;

  listLedgerEntries(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    status?: EndgameClosureStatus;
  }): Promise<EndgameLedgerShape[]>;

  getGate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<EndingGateShape>;

  approveGate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<EndingGateShape>;

  getDebtReport(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<DebtReportShape>;
}

export function createEndgameServices({
  db,
  audit,
}: {
  db: NovelForgeDb;
  audit: AuditService;
}): EndgameServices {
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

  function toShape(entry: {
    id: string;
    novelId: string;
    threadId: string;
    status: EndgameClosureStatus;
    criteria: string | null;
    rationale: string | null;
    createdAt: Date;
    updatedAt: Date;
    thread: { title: string; status: string };
  }): EndgameLedgerShape {
    return {
      id: entry.id,
      ledgerId: entry.id,
      novelId: entry.novelId,
      threadId: entry.threadId,
      threadTitle: entry.thread.title,
      threadStatus: entry.thread.status,
      closed: entry.thread.status === "RESOLVED",
      status: entry.status,
      criteria: entry.criteria,
      rationale: entry.rationale,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  /** Unclosed MUSTs: ledger entries with status MUST whose thread is not RESOLVED. */
  async function findBlockingItems(workspaceId: string, novelId: string): Promise<GateBlockingItem[]> {
    const musts = await db.endgameLedger.findMany({
      where: { workspaceId, novelId, status: "MUST" },
      include: { thread: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
    return musts
      .filter((e) => e.thread.status !== "RESOLVED")
      .map((e) => ({
        ledgerId: e.id,
        threadId: e.threadId,
        threadTitle: e.thread.title,
        status: e.status as EndgameClosureStatus,
        criteria: e.criteria,
      }));
  }

  async function latestApproval(workspaceId: string, novelId: string) {
    return db.endgameGateApproval.findFirst({
      where: { workspaceId, novelId },
      orderBy: { approvedAt: "desc" },
    });
  }

  /** 022B's table may not exist yet — return [] rather than failing. */
  async function findUnpaidCallbacks(
    novelId: string,
  ): Promise<DebtReportShape["unpaidCallbacks"]> {
    const tables = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'endgame_callbacks'
      ) AS "exists"`;
    if (!tables[0]?.exists) return [];
    const cols = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'endgame_callbacks'
          AND column_name = 'description'
      ) AS "exists"`;
    const hasDescription = cols[0]?.exists === true;
    type CallbackRow = { id: string; setupEventId: string; description: string | null };
    // Two full queries (no interpolated fragments — $queryRaw binds
    // interpolations as parameters, not raw SQL).
    const rows: CallbackRow[] = hasDescription
      ? await db.$queryRaw<CallbackRow[]>`
          SELECT "id" AS "id",
                 "setup_event_id" AS "setupEventId",
                 "description" AS "description"
            FROM "endgame_callbacks"
           WHERE "novel_id" = ${novelId}::uuid
             AND "payoff_event_id" IS NULL
           ORDER BY "created_at" ASC`
      : await db.$queryRaw<CallbackRow[]>`
          SELECT "id" AS "id",
                 "setup_event_id" AS "setupEventId",
                 NULL AS "description"
            FROM "endgame_callbacks"
           WHERE "novel_id" = ${novelId}::uuid
             AND "payoff_event_id" IS NULL
           ORDER BY "created_at" ASC`;
    return rows.map((r) => ({
      callbackId: r.id,
      setupEventId: r.setupEventId,
      description: r.description,
    }));
  }

  return {
    async createLedgerEntry(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:manage");
      const thread = await db.storyThread.findFirst({
        where: { id: input.threadId, novelId: input.novelId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!thread) throw new EndgameError("THREAD_NOT_FOUND", "story thread not found in this novel");
      const existing = await db.endgameLedger.findUnique({
        where: { novelId_threadId: { novelId: input.novelId, threadId: input.threadId } },
        select: { id: true },
      });
      if (existing) {
        throw new EndgameError("DUPLICATE_LEDGER_ENTRY", "a ledger entry already exists for this thread");
      }
      const entry = await db.endgameLedger.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          threadId: input.threadId,
          status: input.status,
          criteria: input.criteria ?? null,
          rationale: input.rationale ?? null,
          createdById: input.actorUserId,
        },
        include: { thread: { select: { title: true, status: true } } },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "endgame.ledger.created",
        entityType: "endgame_ledger",
        entityId: entry.id,
        payload: { threadId: input.threadId, status: input.status },
      });
      return toShape({ ...entry, status: entry.status as EndgameClosureStatus });
    },

    /**
     * The ONLY code path that changes a ledger status (Invariant 1).
     * Requires an explicit author action — nothing else in this module
     * (or any background process) writes to `status`.
     */
    async updateLedgerEntry(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:manage");
      const entry = await db.endgameLedger.findFirst({
        where: { id: input.ledgerId, workspaceId: input.workspaceId, novelId: input.novelId },
        include: { thread: { select: { title: true, status: true } } },
      });
      if (!entry) throw new EndgameError("LEDGER_NOT_FOUND", "ledger entry not found");
      const data: {
        status?: EndgameClosureStatus;
        criteria?: string | null;
        rationale?: string | null;
      } = {};
      if (input.status !== undefined) data.status = input.status;
      if (input.criteria !== undefined) data.criteria = input.criteria;
      if (input.rationale !== undefined) data.rationale = input.rationale;
      const updated = await db.endgameLedger.update({
        where: { id: entry.id },
        data,
        include: { thread: { select: { title: true, status: true } } },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "endgame.ledger.status_updated",
        entityType: "endgame_ledger",
        entityId: entry.id,
        payload: {
          from: entry.status,
          to: updated.status,
          ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
          ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
        },
      });
      return toShape({ ...updated, status: updated.status as EndgameClosureStatus });
    },

    async listLedgerEntries(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:read");
      const entries = await db.endgameLedger.findMany({
        where: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          ...(input.status ? { status: input.status } : {}),
        },
        include: { thread: { select: { title: true, status: true } } },
        orderBy: { createdAt: "asc" },
      });
      return entries.map((e) => toShape({ ...e, status: e.status as EndgameClosureStatus }));
    },

    async getGate(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:read");
      const blockingItems = await findBlockingItems(input.workspaceId, input.novelId);
      const approval = await latestApproval(input.workspaceId, input.novelId);
      const verdict = blockingItems.length === 0 && approval ? "READY" : "BLOCKED";
      return {
        verdict,
        blockingItems,
        approved: approval !== null,
        approvedById: approval?.approvedById ?? null,
        approvedAt: approval?.approvedAt ?? null,
      };
    },

    async approveGate(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:manage");
      const approval = await db.endgameGateApproval.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          approvedById: input.actorUserId,
        },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "endgame.gate.approved",
        entityType: "endgame_gate_approval",
        entityId: approval.id,
        payload: { novelId: input.novelId },
      });
      const blockingItems = await findBlockingItems(input.workspaceId, input.novelId);
      const verdict = blockingItems.length === 0 ? "READY" : "BLOCKED";
      return {
        verdict,
        blockingItems,
        approved: true,
        approvedById: approval.approvedById,
        approvedAt: approval.approvedAt,
      };
    },

    async getDebtReport(input) {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "endgame:read");
      const musts = await db.endgameLedger.findMany({
        where: { workspaceId: input.workspaceId, novelId: input.novelId, status: "MUST" },
        include: { thread: { select: { status: true } } },
        orderBy: { createdAt: "asc" },
      });
      const unclosedMusts = musts
        .filter((e) => e.thread.status !== "RESOLVED")
        .map((e) => ({
          ledgerId: e.id,
          threadId: e.threadId,
          status: e.status as EndgameClosureStatus,
          criteria: e.criteria,
        }));
      const unpaidCallbacks = await findUnpaidCallbacks(input.novelId);
      const openThreads = await db.storyThread.findMany({
        where: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          status: { not: "RESOLVED" },
        },
        select: { id: true, title: true },
        orderBy: { createdAt: "asc" },
      });
      const sequels = await db.endgameLedger.findMany({
        where: { workspaceId: input.workspaceId, novelId: input.novelId, status: "SEQUEL" },
        orderBy: { createdAt: "asc" },
      });
      return {
        unclosedMusts,
        unpaidCallbacks,
        openThreads: openThreads.map((t) => ({ threadId: t.id, title: t.title })),
        sequelHooks: sequels.map((s) => ({
          ledgerId: s.id,
          threadId: s.threadId,
          description: s.rationale ?? s.criteria ?? null,
        })),
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
