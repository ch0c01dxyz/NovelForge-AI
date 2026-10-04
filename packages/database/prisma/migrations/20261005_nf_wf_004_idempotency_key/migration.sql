-- NF-WF-004: idempotency key for workflow run enqueue.
--
-- Adds `workflow_runs.idempotency_key` (nullable, no default, no backfill)
-- with a PARTIAL unique index on (workspace_id, idempotency_key) WHERE
-- idempotency_key IS NOT NULL. Semantics: two POSTs with the same non-null
-- (workspaceId, idempotencyKey) return the same run row; a null key keeps
-- the legacy per-POST-row behavior and never collides (PostgreSQL treats
-- NULLs as distinct, and the partial index excludes NULLs entirely).
--
-- Why a hand-written partial index instead of Prisma's @@unique: Prisma
-- cannot express a partial index. A full unique constraint on
-- (workspace_id, idempotency_key) would also be *correct* under
-- PostgreSQL's NULL semantics, but the partial index is smaller (NULLs
-- are the common case) and states the intent. The schema documents this
-- in the model comment; do not add @@unique here or `migrate diff` will
-- propose a conflicting full constraint.
--
-- Why plain CREATE INDEX, not CONCURRENTLY: Prisma runs a multi-statement
-- migration file inside a single transaction, and PostgreSQL rejects
-- CREATE INDEX CONCURRENTLY inside a transaction block (error 25001). A
-- partial index over a brand-new, mostly-NULL column builds in
-- milliseconds with only a brief lock — the concurrent-build machinery
-- buys nothing here.
--
-- Re-runnability (GAP-018): a failed `migrate deploy` is partially
-- applied, so both statements carry IF NOT EXISTS — a retry converges
-- instead of dying half-applied. Purely additive: no existing row is
-- rewritten, and old code (unaware of the column) runs fine against the
-- migrated schema because the column is nullable and unwritten.

ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_workspace_idempotency_key_uidx
  ON workflow_runs (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
