/**
 * Derived rebuild intent consumer (ADR-0017, ADR-0022).
 *
 * PostgreSQL is the queue. The worker claims the newest eligible intent per
 * `(projection, branch)` with a compare-and-set, supersedes older eligible
 * intents for the same pair, runs the registered handler, and records the
 * outcome. Projections without a handler are never touched: their rows stay
 * PENDING as terminal audit.
 */
import { createDb, type NovelForgeDb } from "@novelforge/database";
import type { RevisionTx } from "@novelforge/ai-services";
import { isProjection, type Projection } from "@novelforge/story-versioning";
import { createCanonSummaryHandler } from "./canon-summary.ts";

export const INTENT_MAX_ATTEMPTS = 5;
export const INTENT_RETRY_BASE_MS = 30_000;
export const INTENT_RETRY_MAX_MS = 300_000;
export const INTENT_RUNNING_LEASE_MS = 300_000;
export const INTENT_SWEEP_BATCH = 200;
export const INTENT_SWEEP_INTERVAL_MS = 30_000;
export const INTENT_REBUILD_TIMEOUT_MS = 30_000;

export interface RebuildHandler {
  projection: Projection;
  rebuild(ctx: {
    db: RevisionTx;
    workspaceId: string;
    novelId: string;
    sourceRevisionId: string;
  }): Promise<void>;
}

export type HandlerRegistry = Partial<Record<Projection, RebuildHandler>>;

export interface SweepReport {
  claimed: number;
  fresh: number;
  failed: number;
  superseded: number;
  skipped: number;
}

/** Handlers registered in this build. ADR-0022 registers `canon`. */
export function createIntentHandlers(db: NovelForgeDb): HandlerRegistry {
  return { canon: createCanonSummaryHandler({ db }) };
}

export function backoffMs(attempts: number): number {
  return Math.min(INTENT_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), INTENT_RETRY_MAX_MS);
}

export async function runDerivedIntentSweep(ctx: {
  db: NovelForgeDb;
  handlers: HandlerRegistry;
  logger: {
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
  now?: () => Date;
  batchSize?: number;
}): Promise<SweepReport> {
  const { db, handlers, logger } = ctx;
  const now = ctx.now?.() ?? new Date();
  const report: SweepReport = { claimed: 0, fresh: 0, failed: 0, superseded: 0, skipped: 0 };

  // The handler set is the ownership boundary: a projection is consumed only
  // when this build registered a pipeline for it.
  const active = Object.keys(handlers).filter(isProjection);
  if (active.length === 0) return report;

  // Crash recovery: a claimed row whose worker died stays RUNNING. Reap it
  // into FAILED after the lease so the normal retry path can see it again.
  const reaped = await db.derivedRebuildIntent.updateMany({
    where: {
      projection: { in: active },
      status: "RUNNING",
      updatedAt: { lt: new Date(now.getTime() - INTENT_RUNNING_LEASE_MS) },
    },
    data: { status: "FAILED", lastError: "rebuild lease expired" },
  });
  if (reaped.count > 0) {
    logger.warn("reaped expired derived intent leases", { count: reaped.count });
  }

  const candidates = await db.derivedRebuildIntent.findMany({
    where: {
      projection: { in: active },
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: INTENT_MAX_ATTEMPTS } },
      ],
    },
    include: { sourceRevision: { select: { branchId: true, number: true } } },
    orderBy: [{ sourceRevision: { number: "desc" } }, { id: "asc" }],
    take: ctx.batchSize ?? INTENT_SWEEP_BATCH,
  });

  const groups = new Map<string, typeof candidates>();
  for (const row of candidates) {
    if (!isProjection(row.projection)) continue;
    const key = `${row.projection}:${row.sourceRevision.branchId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const rows of groups.values()) {
    rows.sort((a, b) => b.sourceRevision.number - a.sourceRevision.number);
    const newest = rows[0];
    if (!newest) continue;
    const projection = newest.projection;
    if (!isProjection(projection)) continue;
    const handler = handlers[projection];
    if (!handler) continue;

    if (
      newest.status === "FAILED" &&
      newest.updatedAt.getTime() + backoffMs(newest.attempts) > now.getTime()
    ) {
      report.skipped += 1;
      continue;
    }

    const retryAfter = new Date(now.getTime() - backoffMs(newest.attempts));
    const outcome = await db.$transaction(async (tx) => {
      const cas =
        newest.status === "FAILED"
          ? await tx.derivedRebuildIntent.updateMany({
              where: {
                id: newest.id,
                status: "FAILED",
                attempts: { equals: newest.attempts, lt: INTENT_MAX_ATTEMPTS },
                updatedAt: { lte: retryAfter },
              },
              data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
            })
          : await tx.derivedRebuildIntent.updateMany({
              where: { id: newest.id, status: "PENDING", attempts: newest.attempts },
              data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
            });
      if (cas.count !== 1) return null;

      // Every older eligible intent for the pair is superseded, not only the
      // rows in this batch: otherwise a backlog larger than the batch would
      // later rebuild an already-superseded revision.
      const superseded = await tx.derivedRebuildIntent.updateMany({
        where: {
          projection: newest.projection,
          sourceRevision: {
            branchId: newest.sourceRevision.branchId,
            number: { lt: newest.sourceRevision.number },
          },
          status: { in: ["PENDING", "FAILED"] },
        },
        data: {
          status: "STALE",
          completedAt: now,
          lastError: `superseded by intent ${newest.id} at revision ${newest.sourceRevision.number}`,
        },
      });
      return { superseded: superseded.count, attempt: newest.attempts + 1 };
    });
    if (!outcome) {
      report.skipped += 1;
      continue;
    }
    report.claimed += 1;
    report.superseded += outcome.superseded;

    try {
      const published = await db.$transaction(async (tx) => {
        // Lock the exact claim before any projection write. Artifact and
        // terminal status commit together; an expired owner cannot publish.
        const owned = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM derived_rebuild_intents
          WHERE id = ${newest.id}::uuid AND status = 'RUNNING'
            AND attempts = ${outcome.attempt}
          FOR UPDATE
        `;
        if (owned.length !== 1) return false;
        await handler.rebuild({
          db: tx,
          workspaceId: newest.workspaceId,
          novelId: newest.novelId,
          sourceRevisionId: newest.sourceRevisionId,
        });
        const finished = await tx.derivedRebuildIntent.updateMany({
          where: { id: newest.id, status: "RUNNING", attempts: outcome.attempt },
          data: { status: "FRESH", completedAt: new Date() },
        });
        if (finished.count !== 1) throw new Error("derived intent claim lost during rebuild");
        return true;
      }, { isolationLevel: "RepeatableRead", timeout: INTENT_REBUILD_TIMEOUT_MS });
      if (published) report.fresh += 1;
      else report.skipped += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await db.derivedRebuildIntent.updateMany({
        where: { id: newest.id, status: "RUNNING", attempts: outcome.attempt },
        data: { status: "FAILED", lastError: message.slice(0, 2000) },
      });
      if (failed.count === 1) report.failed += 1;
      else report.skipped += 1;
      logger.error("derived intent rebuild failed", {
        intentId: newest.id,
        projection: newest.projection,
        sourceRevisionId: newest.sourceRevisionId,
        message,
      });
    }
  }

  return report;
}

export function startDerivedIntentWorkerApp(
  env: { DATABASE_URL: string },
  logger: {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  },
  deps: {
    db?: NovelForgeDb;
    handlers?: HandlerRegistry;
    intervalMs?: number;
    sweep?: typeof runDerivedIntentSweep;
    createDb?: (url: string) => NovelForgeDb;
  } = {},
) {
  const db = deps.db ?? (deps.createDb ?? createDb)(env.DATABASE_URL);
  const handlers = deps.handlers ?? createIntentHandlers(db);
  const sweep = deps.sweep ?? runDerivedIntentSweep;
  const intervalMs = deps.intervalMs ?? INTENT_SWEEP_INTERVAL_MS;
  let stopped = false;
  let inFlight: Promise<SweepReport> | null = null;
  let stopping: Promise<void> | null = null;
  const empty: SweepReport = { claimed: 0, fresh: 0, failed: 0, superseded: 0, skipped: 0 };

  const tick = (): Promise<SweepReport> => {
    if (stopped) return Promise.resolve(empty);
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(() => sweep({ db, handlers, logger })).catch((error) => {
      logger.error("derived intent sweep failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }).finally(() => { inFlight = null; });
    return inFlight;
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  logger.info("derived intent sweeper started", {
    intervalMs,
    handlers: Object.keys(handlers),
  });

  return {
    started: true,
    get stopped() {
      return stopped;
    },
    tick,
    stop(): Promise<void> {
      if (stopping) return stopping;
      stopped = true;
      clearInterval(timer);
      stopping = (async () => {
        await inFlight;
        await db.$disconnect();
      })();
      return stopping;
    },
  };
}
