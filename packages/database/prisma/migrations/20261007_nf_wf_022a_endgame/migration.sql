-- NF-WF-022A: closure ledger (MUST/SHOULD/MAY/OPEN/SEQUEL) + ending gate approval.
--
-- Adds:
--   1. `endgame_ledger` — per-thread closure status, criteria, rationale.
--      thread_id → story_threads ON DELETE CASCADE (a ledger entry for a
--      deleted thread is meaningless).
--   2. `endgame_gate_approval` — author sign-off rows for the ending gate
--      (latest row per novel wins; required for a READY verdict alongside
--      "all MUSTs closed").
--
-- The endgame module is planning only: it never writes to canon tables
-- (Invariant 3) and never auto-changes a ledger status (Invariant 1).
--
-- Rollback: dropping these tables destroys endgame planning state only; no
-- story data is at risk (new tables, no existing flows touched).
--
-- Re-runnability (GAP-030): every statement is idempotent (CREATE TABLE IF
-- NOT EXISTS, DO-blocks for enum values which have no IF NOT EXISTS clause,
-- idempotent indexes). A partially-applied retry converges. Purely additive:
-- no existing table is altered.

-- Enum (additive values; DO-block for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EndgameClosureStatus') THEN
    CREATE TYPE "EndgameClosureStatus" AS ENUM (
      'MUST', 'SHOULD', 'MAY', 'OPEN', 'SEQUEL'
    );
  END IF;
END
$$;

-- 1. Closure ledger.
CREATE TABLE IF NOT EXISTS "endgame_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "status" "EndgameClosureStatus" NOT NULL,
  "criteria" TEXT,
  "rationale" TEXT,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "endgame_ledger_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_ledger_workspace_id_fkey'
  ) THEN
    ALTER TABLE "endgame_ledger" ADD CONSTRAINT "endgame_ledger_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_ledger_novel_id_fkey'
  ) THEN
    ALTER TABLE "endgame_ledger" ADD CONSTRAINT "endgame_ledger_novel_id_fkey"
      FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_ledger_thread_id_fkey'
  ) THEN
    ALTER TABLE "endgame_ledger" ADD CONSTRAINT "endgame_ledger_thread_id_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "story_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_ledger_created_by_id_fkey'
  ) THEN
    ALTER TABLE "endgame_ledger" ADD CONSTRAINT "endgame_ledger_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "endgame_ledger_novel_id_thread_id_key"
  ON "endgame_ledger"("novel_id", "thread_id");
CREATE INDEX IF NOT EXISTS "endgame_ledger_novel_id_status_idx"
  ON "endgame_ledger"("novel_id", "status");

-- 2. Ending gate approval.
CREATE TABLE IF NOT EXISTS "endgame_gate_approval" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "approved_by_id" UUID NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "endgame_gate_approval_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_gate_approval_workspace_id_fkey'
  ) THEN
    ALTER TABLE "endgame_gate_approval" ADD CONSTRAINT "endgame_gate_approval_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_gate_approval_novel_id_fkey'
  ) THEN
    ALTER TABLE "endgame_gate_approval" ADD CONSTRAINT "endgame_gate_approval_novel_id_fkey"
      FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'endgame_gate_approval_approved_by_id_fkey'
  ) THEN
    ALTER TABLE "endgame_gate_approval" ADD CONSTRAINT "endgame_gate_approval_approved_by_id_fkey"
      FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "endgame_gate_approval_novel_id_approved_at_idx"
  ON "endgame_gate_approval"("novel_id", "approved_at");
