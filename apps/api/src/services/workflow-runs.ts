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
import type { NovelForgeDb, WorkflowRunStatus } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import {
  validateGraph,
  type WorkflowGraph,
} from "@novelforge/validation";
import { isUniqueViolation } from "@novelforge/workflow-executor";
import { ConflictError, NotFoundError } from "@novelforge/ai-services";
import { resolveAgent, resolveSkill } from "./definition-resolution.ts";
import { createAuditService, type AuditService } from "@novelforge/ai-services";
import type { WorkflowQueue } from "./workflow-queue.ts";

/**
 * Typed 409 for approval-decision refusals (NF-WF-005, invariant 4).
 * Extends ConflictError so unmapped handlers still return 409; the
 * platform-routes error handler maps `decisionCode` to the machine-readable
 * `code` field, following the HeadConflictError precedent.
 */
export class ApprovalDecisionError extends ConflictError {
  readonly decisionCode:
    | "STALE_APPROVAL"
    | "NO_APPROVAL_SNAPSHOT"
    | "ALREADY_DECIDED"
    | "RUN_CANCELLED";
  constructor(
    decisionCode: ApprovalDecisionError["decisionCode"],
    message: string,
  ) {
    super(message);
    this.name = "ApprovalDecisionError";
    this.decisionCode = decisionCode;
  }
}

/** Shape of the persisted `approvalSnapshot` written at park time. */
interface ParkedApprovalSnapshot {
  material: {
    instruction: string;
    priorOutcomes: Record<string, { text: string | null; json: unknown }>;
    workflowVersionNumber: number;
    agentVersions: Record<string, number>;
    skillVersions: Record<string, number>;
  };
  snapshotHash: string;
}

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
  /**
   * The park-time approval snapshot (NF-WF-005 invariant 2):
   * `{ material, snapshotHash } | null`. Null for steps that never parked
   * and for rows parked before NF-WF-005 (undecidable).
   */
  approvalSnapshot: unknown;
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
  /**
   * Decide a parked HUMAN_APPROVAL step (NF-WF-005).
   * `approve` resumes the same run from the parked step; `reject` fails it.
   * The decision binds to `expectedSnapshotHash` (409 STALE_APPROVAL on
   * mismatch, 409 NO_APPROVAL_SNAPSHOT when the step row has none) and is
   * persisted exactly once in a single transaction with its audit record.
   * Body shape (hash length, reason rules) is validated at the route.
   */
  decideRun(input: {
    actorUserId: string;
    workspaceId: string;
    runId: string;
    decision: "approve" | "reject";
    expectedSnapshotHash: string;
    /** Required for reject (route-validated), optional for approve. */
    reason?: string;
  }): Promise<RunView>;
  listRuns(input: {
    actorUserId: string;
    workspaceId: string;
    workflowId?: string;
    novelId?: string;
    chapterNumber?: number;
    /**
     * NF-WF-018A (Invariant 1(d)): optional run-status filter — the
     * approvals inbox lists `AWAITING_APPROVAL` runs through it.
     */
    status?: WorkflowRunStatus;
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
    cap: "workflow:run" | "workflow:read" | "workflow:approve",
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

    async decideRun(input) {
      await gateWorkspace(
        input.workspaceId,
        input.actorUserId,
        "workflow:approve",
      );

      const run = await db.workflowRun.findFirst({
        where: { id: input.runId, workspaceId: input.workspaceId },
        select: { id: true, status: true },
      });
      if (!run) throw new NotFoundError("run");

      // One transaction: snapshot comparison, guarded run transition,
      // guarded step transition, decision insert, audit insert (invariant 4).
      // No LLM calls and no awaits across the human — the transaction is
      // short and local (constitution §9).
      await db.$transaction(async (tx) => {
        // Find the parked step. Absent → the run is not awaiting a
        // decision: pick the accurate code from the run's current status
        // (invariant 4.1 / invariant 7's cancel-won-race rule).
        const stepRow = await tx.workflowStepRun.findFirst({
          where: { runId: run.id, status: "AWAITING_APPROVAL" },
          select: { id: true, stepKey: true, approvalSnapshot: true },
        });
        if (!stepRow) {
          const current = await tx.workflowRun.findUniqueOrThrow({
            where: { id: run.id },
            select: { status: true },
          });
          if (current.status === "CANCELLED") {
            throw new ApprovalDecisionError(
              "RUN_CANCELLED",
              "the run was cancelled before a decision was recorded",
            );
          }
          throw new ApprovalDecisionError(
            "ALREADY_DECIDED",
            `the run is ${current.status.toLowerCase()}; no approval is pending`,
          );
        }

        // Invariant 3: the decision binds to the parked material. A NULL
        // snapshot (rows parked before NF-WF-005) is undecidable — never
        // backfilled, because a hash over unpinned material would
        // manufacture a binding the approver never saw.
        const snapshot = stepRow.approvalSnapshot as ParkedApprovalSnapshot | null;
        if (!snapshot) {
          throw new ApprovalDecisionError(
            "NO_APPROVAL_SNAPSHOT",
            "this run parked before approval snapshots existed and cannot be decided",
          );
        }
        if (snapshot.snapshotHash !== input.expectedSnapshotHash) {
          throw new ApprovalDecisionError(
            "STALE_APPROVAL",
            "the approval material changed since this decision was prepared; re-read the current snapshot",
          );
        }

        // 1. Guarded run transition: only AWAITING_APPROVAL moves.
        const updated = await tx.workflowRun.updateMany({
          where: { id: run.id, status: "AWAITING_APPROVAL" },
          data: {
            status: input.decision === "approve" ? "PENDING" : "FAILED",
            ...(input.decision === "reject"
              ? { completedAt: new Date(), errorMessage: input.reason ?? null }
              : {}),
          },
        });
        if (updated.count === 0) {
          // Lost a race with a concurrent decide or a cancel: re-read to
          // report accurately (invariant 7).
          const current = await tx.workflowRun.findUniqueOrThrow({
            where: { id: run.id },
            select: { status: true },
          });
          if (current.status === "CANCELLED") {
            throw new ApprovalDecisionError(
              "RUN_CANCELLED",
              "the run was cancelled before a decision was recorded",
            );
          }
          throw new ApprovalDecisionError(
            "ALREADY_DECIDED",
            `the run is ${current.status.toLowerCase()}; no approval is pending`,
          );
        }

        // 2. Guarded step transition. Zero rows → roll back: a decision row
        // must never exist while its step is still AWAITING_APPROVAL —
        // that corrupt state would strand the run PENDING with an
        // undecided step the worker cannot claim.
        const decidedAt = new Date();
        const decidedKind =
          input.decision === "approve" ? "APPROVED" : "REJECTED";
        const stepUpdated = await tx.workflowStepRun.updateMany({
          where: { id: stepRow.id, status: "AWAITING_APPROVAL" },
          data: {
            status: input.decision === "approve" ? "SUCCEEDED" : "FAILED",
            output: {
              text: input.reason ?? null,
              json: {
                decision: decidedKind,
                snapshotHash: snapshot.snapshotHash,
                decidedById: input.actorUserId,
                decidedAt: decidedAt.toISOString(),
              },
            } as never,
            ...(input.decision === "reject"
              ? { errorMessage: input.reason ?? null }
              : {}),
            completedAt: decidedAt,
          },
        });
        if (stepUpdated.count === 0) {
          throw new ApprovalDecisionError(
            "ALREADY_DECIDED",
            "the parked step was decided concurrently",
          );
        }

        // 3. The decision row. The @@unique([runId, stepKey]) is the
        // backstop; a violation rolls the whole transaction back.
        const pins = {
          workflowVersionNumber: snapshot.material.workflowVersionNumber,
          agentVersions: snapshot.material.agentVersions,
          skillVersions: snapshot.material.skillVersions,
        };
        try {
          await tx.workflowApprovalDecision.create({
            data: {
              runId: run.id,
              stepRunId: stepRow.id,
              stepKey: stepRow.stepKey,
              decision: decidedKind,
              snapshotHash: snapshot.snapshotHash,
              pins: pins as never,
              decidedById: input.actorUserId,
              reason: input.reason ?? null,
            },
          });
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new ApprovalDecisionError(
              "ALREADY_DECIDED",
              "a decision is already recorded for this approval step",
            );
          }
          throw err;
        }

        // 4. The audit record is part of the same transaction: no decision
        // without its audit record (invariant 9).
        await createAuditService(tx as unknown as NovelForgeDb).record({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          action:
            input.decision === "approve"
              ? "workflow.run_approved"
              : "workflow.run_rejected",
          entityType: "WorkflowRun",
          entityId: run.id,
          payload: {
            stepKey: stepRow.stepKey,
            snapshotHash: snapshot.snapshotHash,
            pins: pins as never,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        });
      });

      if (input.decision === "approve") {
        // Resume the same run (invariant 5), in this exact order:
        // (1) best-effort remove the old job record — the park path
        // completes its BullMQ job normally and the queue retains
        // completed records, so a re-add() with the same jobId while any
        // record exists is a silent no-op and the approved run would sit
        // PENDING forever; (2) re-add with the same jobId on the one
        // shared queue. A remove-vs-sweeper-(b) race is benign: both add
        // with the same jobId, dedup yields one job, and the PENDING-only
        // claim single-wins. If the add throws after commit, the run sits
        // PENDING with no job and sweeper (b) re-enqueues it.
        try {
          const job = await queue.getJob(run.id);
          await job?.remove();
        } catch (err) {
          dbg?.error?.("could not remove decided run's old job record", {
            runId: run.id,
            err,
          });
        }
        await queue.add("workflow-run", { runId: run.id }, { jobId: run.id });
      }
      // Reject is terminal (invariant 6): no enqueue, remaining PENDING
      // step rows are left untouched as history of what never ran.

      return loadRun(db, run.id);
    },

    async listRuns(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const rows = await db.workflowRun.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
          ...(input.novelId ? { novelId: input.novelId } : {}),
          ...(input.chapterNumber !== undefined
            ? { input: { path: ["chapterNumber"], equals: input.chapterNumber } } : {}),
          // NF-WF-018A (Invariant 1(d)): optional status filter — the
          // approvals inbox lists AWAITING_APPROVAL runs through it.
          ...(input.status ? { status: input.status } : {}),
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
      // NF-WF-005: the park-time approval snapshot ({ material,
      // snapshotHash } | null) so the approver's client can echo
      // expectedSnapshotHash.
      approvalSnapshot: s.approvalSnapshot ?? null,
    })),
  };
}

/** Re-exported so route validation and the executor agree on the shape. */
export type { WorkflowGraph };
