-- NF-WF-005: approval decisions and the park-time approval snapshot.
--
-- Adds `workflow_step_runs.approval_snapshot` (nullable JSONB, no default,
-- no backfill) and the `workflow_approval_decisions` table (one row per
-- (run_id, step_key), enforced by a unique constraint).
--
-- Why no backfill: before NF-WF-005, parking at HUMAN_APPROVAL was a dead
-- end (GAP-003) — any existing AWAITING_APPROVAL rows simply have no
-- snapshot and are undecidable (decide → 409 NO_APPROVAL_SNAPSHOT, per the
-- NF-WF-005 contract invariant 3). Backfilling a hash over material that
-- was never pinned would manufacture a binding the approver never saw.
--
-- Re-runnability (GAP-018): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the equivalent
-- notice-level no-op for CREATE TABLE / CREATE TYPE) — a retry converges
-- instead of dying half-applied. Purely additive: no existing row is
-- rewritten, and old code (unaware of the column/table) runs fine against
-- the migrated schema because everything new is nullable/unused.
--
-- Note on CREATE TABLE IF NOT EXISTS: when the table already exists the
-- statement is a notice-level no-op, so the inline constraints are only
-- materialized on first creation — exactly the converge-on-retry behavior
-- GAP-018 requires.

-- The approver's decision kind. CREATE TYPE has no IF NOT EXISTS clause,
-- so the idempotent DO block is the re-runnable form (GAP-018).
DO $$ BEGIN
  CREATE TYPE "ApprovalDecisionKind" AS ENUM ('APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Park-time snapshot on the step row (NF-WF-005 invariant 2).
ALTER TABLE workflow_step_runs ADD COLUMN IF NOT EXISTS approval_snapshot JSONB;

-- The decision record (NF-WF-005 invariant 4): exactly one row per
-- (run_id, step_key). Cascades with the run and the step row; the decider
-- is SetNull so deleting a user never destroys the execution audit trail.
CREATE TABLE IF NOT EXISTS "workflow_approval_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "step_run_id" UUID NOT NULL,
  "step_key" TEXT NOT NULL,
  "decision" "ApprovalDecisionKind" NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "pins" JSONB NOT NULL,
  "decided_by_id" UUID,
  "reason" TEXT,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_approval_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_approval_decisions_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workflow_approval_decisions_step_run_id_fkey"
    FOREIGN KEY ("step_run_id") REFERENCES "workflow_step_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workflow_approval_decisions_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "workflow_approval_decisions_run_id_step_key_key"
    UNIQUE ("run_id", "step_key")
);
