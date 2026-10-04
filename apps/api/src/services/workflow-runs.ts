/**
 * Workflow run routes' service (NF-WF-004).
 *
 * This module is route-facing only: validation, tenant gates, row writes,
 * and queue interaction. The step-driving loop moved to
 * `@novelforge/workflow-executor` and executes on the worker, off the
 * request thread (scope decision A).
 *
 * - `enqueueRun()` validates exactly as the old synchronous `run()` did,
 *   creates the run row as PENDING **plus PENDING step rows for every
 *   step in the validated topological order** in one transaction, enqueues
 *   one BullMQ job (`jobId = run.id`), and returns 202 semantics to the
 *   route. It never executes a step.
 * - `cancelRun()` transitions PENDING/RUNNING/AWAITING_APPROVAL →
 *   CANCELLED via a guarded update and best-effort removes the queued job.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import {
  validateGraph,
  type WorkflowGraph,
} from "@novelforge/validation";
import { isUniqueViolation } from "@novelforge/workflow-executor";
import { ConflictError, NotFoundError } from "./platform.ts";
import { resolveAgent, resolveSkill } from "./definition-resolution.ts";
import type { AuditService } from "./audit.ts";
import type { WorkflowQueue } from "./workflow-queue.ts";

export interface StepRunView {
  stepKey: string;
  sequence: number;
  kind: string;
  status: string;
  agentKey: string | null;
  agentVersionNumber: number | null;
  skillKey: string | null;
  skillVersionNumber: number | null;
  generationId: string | null;
  output: unknown;
  errorMessage: string | null;
  latencyMs: number | null;
}

export interface RunView {
  id: string;
  workflowId: string;
  workflowKey: string;
  workflowVersionNumber: number;
  novelId: string | null;
  status: string;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  stepCount: number;
  startedAt: Date;
  completedAt: Date | null;
  steps?: StepRunView[];
}

export interface EnqueueResult {
  run: RunView;
  /** True when the idempotency key matched an existing run (route → 200). */
  deduped: boolean;
  /** The existing single-run status URL for the 202/200 response. */
  statusUrl: string;
}

export interface WorkflowRunServices {
  enqueueRun(input: {
    actorUserId: string;
    workspaceId: string;
    workflowId: string;
    runInput?: Record<string, unknown>;
    novelId?: string;
    /** Client-generated opaque key, max 64 chars (validated at the route).
     * Null/undefined/empty keeps the legacy per-POST-row behavior. */
    idempotencyKey?: string | null;
  }): Promise<EnqueueResult>;
  cancelRun(input: {
    actorUserId: string;
    workspaceId: string;
    runId: string;
  }): Promise<RunView>;
  listRuns(input: {
    actorUserId: string;
    workspaceId: string;
    workflowId?: string;
    limit?: number;
  }): Promise<RunView[]>;
  getRun(input: {
    actorUserId: string;
    workspaceId: string;
    runId: string;
  }): Promise<RunView>;
}

export function createWorkflowRunServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
  /** The one shared `workflow-runs` queue (constructed in app setup). */
  queue: WorkflowQueue;
  /** Optional diagnostic sink for details that must not reach a client. */
  dbg?: { error?: (message: string, meta: unknown) => void };
}): WorkflowRunServices {
  const { db, audit, queue, dbg } = deps;

  async function gateWorkspace(
    workspaceId: string,
    userId: string,
    cap: "workflow:run" | "workflow:read",
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("workflow");
    requireCapability(membership.role, cap);
  }

  /**
   * Resolve a definition by key, preferring the workspace's own row over
   * the shared platform catalog — the shared implementation lives in
   * definition-resolution.ts so the orchestrator resolves identically.
   */
  const resolveAgentFor = (workspaceId: string, key: string) =>
    resolveAgent(db, workspaceId, key);
  const resolveSkillFor = (workspaceId: string, key: string) =>
    resolveSkill(db, workspaceId, key);

  /**
   * Shared validation: published gate, version resolution, novel binding,
   * and fail-fast definition resolution. Identical to what the old
   * synchronous `run()` enforced before creating the row — the worker
   * never re-decides authorization (invariant 9).
   */
  async function validateForEnqueue(input: {
    workspaceId: string;
    actorUserId: string;
    workflowId: string;
    novelId?: string;
  }) {
    await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:run");

    const workflow = await db.workflow.findUnique({
      where: { id: input.workflowId },
      include: { currentVersion: true },
    });
    if (!workflow) throw new NotFoundError("workflow");
    if (workflow.scope === "WORKSPACE" && workflow.workspaceId !== input.workspaceId) {
      throw new NotFoundError("workflow");
    }
    if (workflow.scope === "PLATFORM" && workflow.status !== "PUBLISHED") {
      throw new NotFoundError("workflow");
    }
    if (workflow.status !== "PUBLISHED") {
      if (workflow.scope === "WORKSPACE" && workflow.workspaceId === input.workspaceId) {
        throw new ConflictError("workflow is not published");
      }
      throw new NotFoundError("workflow");
    }
    const version = workflow.currentVersion;
    if (!version) throw new ConflictError("workflow has no version to run");

    const validated = validateGraph(version.graph);
    if (!validated.ok) {
      throw new ConflictError("workflow graph failed validation on load");
    }
    const { graph, order } = validated.value;

    const novelId = input.novelId ?? workflow.novelId ?? undefined;
    if (workflow.novelId && novelId !== workflow.novelId) {
      throw new ConflictError("workflow is bound to a different novel");
    }
    if (novelId) {
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!novel) throw new NotFoundError("novel");
    }

    // Fail fast: resolve every referenced definition before the row
    // exists, so a missing agent costs nothing and cannot leave a
    // half-enqueued run behind.
    for (const key of version.agentKeys) {
      await resolveAgentFor(input.workspaceId, key);
    }
    for (const key of version.skillKeys) {
      await resolveSkillFor(input.workspaceId, key);
    }

    return { workflow, version, graph, order, novelId };
  }

  return {
    async enqueueRun(input) {
      const key =
        input.idempotencyKey && input.idempotencyKey.length > 0
          ? input.idempotencyKey
          : null;
      const statusUrlFor = (runId: string) =>
        `/api/workspaces/${input.workspaceId}/workflow-runs/${runId}`;

      const { workflow, version, graph, order, novelId } =
        await validateForEnqueue(input);
      const runInput = input.runInput ?? {};

      // Idempotency (invariant 4): a repeat POST with the same key
      // returns the existing run with 200 — never a second row.
      if (key) {
        const existing = await db.workflowRun.findFirst({
          where: { workspaceId: input.workspaceId, idempotencyKey: key },
          select: { id: true },
        });
        if (existing) {
          return {
            run: await loadRun(db, existing.id),
            deduped: true,
            statusUrl: statusUrlFor(existing.id),
          };
        }
      }

      const stepByKey = new Map(graph.steps.map((s) => [s.key, s]));

      // Create the PENDING run row AND PENDING step rows for every step in
      // the validated topological order, in one transaction (F7). The
      // worker's claims never race creation.
      let runId: string;
      try {
        const created = await db.$transaction(async (tx) => {
          const run = await tx.workflowRun.create({
            data: {
              workflowId: workflow.id,
              workflowVersionId: version.id,
              workflowVersionNumber: version.number,
              workspaceId: input.workspaceId,
              novelId: novelId ?? null,
              triggeredById: input.actorUserId,
              status: "PENDING",
              input: runInput as never,
              ...(key ? { idempotencyKey: key } : {}),
            },
            select: { id: true },
          });
          let sequence = 0;
          for (const stepKey of order) {
            const step = stepByKey.get(stepKey);
            if (!step) continue;
            sequence += 1;
            await tx.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "PENDING",
              },
            });
          }
          return run;
        });
        runId = created.id;
      } catch (err) {
        // Race safety (F14): two concurrent POSTs with the same key can
        // both miss the lookup — the partial unique index is the backstop.
        // The loser re-reads the winner's row and returns it with 200
        // (never a second row, never a 500).
        if (key && isUniqueViolation(err)) {
          const winner = await db.workflowRun.findFirst({
            where: { workspaceId: input.workspaceId, idempotencyKey: key },
            select: { id: true },
          });
          if (winner) {
            return {
              run: await loadRun(db, winner.id),
              deduped: true,
              statusUrl: statusUrlFor(winner.id),
            };
          }
        }
        throw err;
      }

      // Enqueue exactly one job with `jobId = run.id` (invariant 1). A
      // throw here leaves a PENDING row with no job — the sweeper's
      // PENDING-orphan rule (invariant 3b) is the designated recovery, so
      // the error propagates rather than returning a 202 for work that
      // was never queued.
      await queue.add(
        "workflow-run",
        {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          runInput,
          ...(novelId ? { novelId } : {}),
          ...(key ? { idempotencyKey: key } : {}),
          runId,
        },
        { jobId: runId },
      );

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "workflow.run_enqueued",
        entityType: "WorkflowRun",
        entityId: runId,
        payload: {
          workflowKey: workflow.key,
          workflowVersion: version.number,
          ...(key ? { idempotencyKey: key } : {}),
        },
      });

      return {
        run: await loadRun(db, runId),
        deduped: false,
        statusUrl: statusUrlFor(runId),
      };
    },

    async cancelRun(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:run");

      const run = await db.workflowRun.findFirst({
        where: { id: input.runId, workspaceId: input.workspaceId },
        select: { id: true, status: true, workflowId: true },
      });
      if (!run) throw new NotFoundError("run");

      // Retry-safe: cancelling an already-CANCELLED run returns it (200),
      // so a retried cancel never errors. SUCCEEDED/FAILED refuse with 409.
      if (run.status === "CANCELLED") {
        return loadRun(db, run.id);
      }
      if (run.status === "SUCCEEDED" || run.status === "FAILED") {
        throw new ConflictError(`run is already ${run.status.toLowerCase()}`);
      }

      // Guarded transition: only PENDING/RUNNING/AWAITING_APPROVAL move.
      // AWAITING_APPROVAL is cancellable — the run is parked with no
      // worker executing it, so CANCELLED abandons it cleanly.
      const updated = await db.workflowRun.updateMany({
        where: {
          id: run.id,
          status: { in: ["PENDING", "RUNNING", "AWAITING_APPROVAL"] },
        },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      if (updated.count === 0) {
        // Lost a race with completion: re-read to report accurately.
        const current = await db.workflowRun.findUniqueOrThrow({
          where: { id: run.id },
          select: { status: true },
        });
        if (current.status === "CANCELLED") return loadRun(db, run.id);
        throw new ConflictError(`run is already ${current.status.toLowerCase()}`);
      }

      // Best-effort: remove the queued job so a pending job never starts
      // after the cancel. The worker also observes cancellation itself
      // (invariant 5), so a removal failure is not fatal.
      try {
        const job = await queue.getJob(run.id);
        await job?.remove();
      } catch (err) {
        dbg?.error?.("could not remove cancelled run's job", { runId: run.id, err });
      }

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "workflow.run_cancelled",
        entityType: "WorkflowRun",
        entityId: run.id,
        payload: { workflowId: run.workflowId },
      });

      return loadRun(db, run.id);
    },

    async listRuns(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const rows = await db.workflowRun.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        },
        include: { workflow: { select: { key: true } } },
        orderBy: { startedAt: "desc" },
        take: Math.min(input.limit ?? 50, 200),
      });
      return rows.map((r) => ({
        id: r.id,
        workflowId: r.workflowId,
        workflowKey: r.workflow.key,
        workflowVersionNumber: r.workflowVersionNumber,
        novelId: r.novelId,
        status: r.status,
        input: r.input,
        output: r.output,
        errorMessage: r.errorMessage,
        stepCount: r.stepCount,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      }));
    },

    async getRun(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const run = await db.workflowRun.findFirst({
        where: { id: input.runId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!run) throw new NotFoundError("run");
      return loadRun(db, run.id);
    },
  };
}

/** Load a run with its steps, in execution order. */
async function loadRun(db: NovelForgeDb, runId: string): Promise<RunView> {
  const run = await db.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      workflow: { select: { key: true } },
      steps: {
        orderBy: { sequence: "asc" },
        include: {
          agent: { select: { key: true } },
          skill: { select: { key: true } },
        },
      },
    },
  });
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowKey: run.workflow.key,
    workflowVersionNumber: run.workflowVersionNumber,
    novelId: run.novelId,
    status: run.status,
    input: run.input,
    output: run.output,
    errorMessage: run.errorMessage,
    stepCount: run.stepCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    steps: run.steps.map((s) => ({
      stepKey: s.stepKey,
      sequence: s.sequence,
      kind: s.kind,
      status: s.status,
      agentKey: s.agent?.key ?? null,
      agentVersionNumber: s.agentVersionNumber,
      skillKey: s.skill?.key ?? null,
      skillVersionNumber: s.skillVersionNumber,
      generationId: s.generationId,
      output: s.output,
      errorMessage: s.errorMessage,
      latencyMs: s.latencyMs,
    })),
  };
}

/** Re-exported so route validation and the executor agree on the shape. */
export type { WorkflowGraph };
