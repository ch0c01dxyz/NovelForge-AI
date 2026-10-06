-- NF-WF-024B: Simulation debugger (breakpoints, watch, time-travel replay).
--
-- Adds:
--   1. `simulation_breakpoints` — debugger breakpoints per run. Kinds:
--      TICK (stop at tick N), PREDICATE (entity-attribute predicate
--      `attributes.<path> <op> <value>`), ON_PROPOSAL (stop when a proposal
--      is raised). Watch entries are PREDICATE-kind rows with watch=true.
--   2. `pause_reason` nullable TEXT column on `simulation_runs` — records
--      WHY a run paused (breakpoint hit description); the run reuses the
--      021A PAUSED status (no new PAUSED_BREAKPOINT status per contract).
--   3. `SimulationBreakpointKind` enum (TICK/PREDICATE/ON_PROPOSAL).
--
-- Invariants (024 Invariant 5 / 021 Invariant 6): the debugger NEVER mutates
-- simulation history. Breakpoints pause; watch observes; replay re-executes
-- deterministically without persisting. There is no "edit state and
-- continue" operation.
--
-- Tenant boundary: workspace_id/novel_id are real FKs (CASCADE). run_id is
-- a logical FK to 021A's simulation_runs.id (no DB FK — 021A owns the table;
-- 024B parallelizes against the pinned shapes, following the 021B pattern).
--
-- Re-runnability (GAP-030): every statement is idempotent — DO-blocks guard
-- enum creation and the column add, CREATE TABLE IF NOT EXISTS guards the
-- table, index creation uses IF NOT EXISTS. A partially-applied retry
-- converges. Purely additive: no existing data is altered.

-- Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationBreakpointKind') THEN
    CREATE TYPE "SimulationBreakpointKind" AS ENUM ('TICK', 'PREDICATE', 'ON_PROPOSAL');
  END IF;
END
$$;

-- simulation_breakpoints
CREATE TABLE IF NOT EXISTS "simulation_breakpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  -- Logical FK to 021A simulation_runs.id (no DB FK — 021A owns the table).
  "run_id" UUID NOT NULL,
  "kind" "SimulationBreakpointKind" NOT NULL,
  -- Predicate JSON. TICK: {"tickNumber": N}. PREDICATE: {"path": "...",
  -- "op": ">", "value": ...}. ON_PROPOSAL: null.
  "predicate" JSONB,
  -- Watch entries are PREDICATE-kind breakpoints with watch=true (contract).
  "watch" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "simulation_breakpoints_run_idx"
  ON "simulation_breakpoints"("run_id");
CREATE INDEX IF NOT EXISTS "simulation_breakpoints_run_enabled_idx"
  ON "simulation_breakpoints"("run_id", "enabled");

-- pause_reason on simulation_runs (additive, nullable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulation_runs' AND column_name = 'pause_reason'
  ) THEN
    ALTER TABLE "simulation_runs" ADD COLUMN "pause_reason" TEXT;
  END IF;
END
$$;
