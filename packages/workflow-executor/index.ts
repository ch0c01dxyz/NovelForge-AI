/**
 * @novelforge/workflow-executor — durable workflow execution core.
 *
 * The step-driving loop, guarded claim transitions, cancellation checks,
 * and restart-recovery scan shared by `apps/api` (enqueue/cancel) and
 * `apps/worker` (execution). All external capabilities arrive as injected
 * structural ports — this package imports no HTTP, no BullMQ constructors,
 * and no process lifecycle.
 */
export {
  createWorkflowExecutor,
  createDbDefinitionResolvers,
  claimRunForExecution,
  claimStepForExecution,
  resetRunForRecovery,
  isRunCancelled,
  type WorkflowExecutorDeps,
  type WorkflowExecutor,
  type ExecuteRunResult,
  type WorkflowGraph,
} from "./executor.ts";
export {
  ExecutorConflictError,
  ExecutorNotFoundError,
  isClientSafeError,
  isUniqueViolation,
} from "./errors.ts";
export {
  buildApprovalSnapshot,
  canonicalizeJson,
  hashApprovalMaterial,
  type ApprovalSnapshot,
  type ApprovalSnapshotMaterial,
} from "./snapshot.ts";
export {
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_DEFAULT_JOB_OPTIONS,
  WORKFLOW_WORKER_LOCK_DURATION_MS,
  WORKFLOW_SWEEPER_INTERVAL_MS,
  WORKFLOW_PENDING_ORPHAN_AGE_MS,
  type StepGenerator,
  type StepRetriever,
  type ResolvedAgent,
  type ResolvedSkill,
  type DefinitionResolvers,
  type CompiledStepContext,
  type ContextCompilerPort,
  type AuditPort,
  type DebugPort,
  type RecoveryJobPort,
  type RecoveryQueuePort,
  type RecoveryReport,
} from "./ports.ts";
