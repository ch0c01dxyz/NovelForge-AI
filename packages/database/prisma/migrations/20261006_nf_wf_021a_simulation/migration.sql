-- NF-WF-021A: simulation primitives and prerequisites.
--
-- Adds:
--   1. `simulation_runs` — a bounded simulation execution (DRAFT/CONFIGURED/
--      RUNNING/PAUSED/PAUSED_PROPOSAL/COMPLETED/ABORTED). PAUSED_PROPOSAL is
--      the 021B uncertainty mechanism (contract F2 — pinned here so 021B works).
--   2. `simulation_scenarios` — initial conditions + event injections per run.
--   3. `simulation_ticks` — discrete time steps with before/after state.
--   4. `simulation_entities` — simulated counterparts (NOT canon entities;
--      Invariant 1). Kinds: SETTLEMENT/POPULATION/RESOURCE/KNOWLEDGE/
--      INFRASTRUCTURE (contract F5 — 021C's civilization kinds as initial set).
--   5. `simulation_events` — things that happened in the simulation.
--   6. `novel_modules` — per-novel module activation (021A defines the table;
--      only the `simulation` module is used in 021; UI is follow-up).
--
-- All tables are novel-scoped with ON DELETE CASCADE. Simulation code MUST
-- NOT write to canon tables (Invariant 1).
--
-- Rollback: dropping these tables destroys simulation state only; no story
-- data is at risk (new tables, no existing flows touched).
--
-- Re-runnability (GAP-030): every statement is idempotent (CREATE TABLE IF
-- NOT EXISTS, DO-blocks for enum values which have no IF NOT EXISTS clause,
-- idempotent indexes). A partially-applied retry converges. Purely additive:
-- no existing table is altered.

-- Enums (additive values; DO-blocks for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationRunStatus') THEN
    CREATE TYPE "SimulationRunStatus" AS ENUM (
      'DRAFT', 'CONFIGURED', 'RUNNING', 'PAUSED', 'PAUSED_PROPOSAL',
      'COMPLETED', 'ABORTED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationEntityKind') THEN
    CREATE TYPE "SimulationEntityKind" AS ENUM (
      'SETTLEMENT', 'POPULATION', 'RESOURCE', 'KNOWLEDGE', 'INFRASTRUCTURE'
    );
  END IF;
END
$$;

-- 1. Simulation runs.
CREATE TABLE IF NOT EXISTS "simulation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "branch_id" UUID,
  "is_simulation_branch" BOOLEAN NOT NULL DEFAULT false,
  "status" "SimulationRunStatus" NOT NULL DEFAULT 'DRAFT',
  "current_tick" INTEGER NOT NULL DEFAULT 0,
  "max_ticks" INTEGER NOT NULL DEFAULT 20,
  "seed" TEXT NOT NULL DEFAULT 'default',
  "snapshot_id" UUID,
  "canon_revision_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_runs'
      AND constraint_name = 'simulation_runs_workspace_id_fkey'
  ) THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_runs'
      AND constraint_name = 'simulation_runs_novel_id_fkey'
  ) THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_novel_id_fkey"
      FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_runs'
      AND constraint_name = 'simulation_runs_branch_id_fkey'
  ) THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "simulation_runs_novel_id_status_idx"
  ON "simulation_runs" ("novel_id", "status");

-- 2. Scenarios (one per run).
CREATE TABLE IF NOT EXISTS "simulation_scenarios" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "initial_state" JSONB NOT NULL,
  "injections" JSONB NOT NULL DEFAULT '{}',
  "seed" TEXT NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_scenarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "simulation_scenarios_run_id_key" UNIQUE ("run_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_scenarios'
      AND constraint_name = 'simulation_scenarios_run_id_fkey'
  ) THEN
    ALTER TABLE "simulation_scenarios"
      ADD CONSTRAINT "simulation_scenarios_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 3. Ticks.
CREATE TABLE IF NOT EXISTS "simulation_ticks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "tick_number" INTEGER NOT NULL,
  "state_before" JSONB NOT NULL,
  "state_after" JSONB NOT NULL,
  "events" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_ticks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "simulation_ticks_run_id_tick_number_key" UNIQUE ("run_id", "tick_number")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_ticks'
      AND constraint_name = 'simulation_ticks_run_id_fkey'
  ) THEN
    ALTER TABLE "simulation_ticks"
      ADD CONSTRAINT "simulation_ticks_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 4. Entities.
CREATE TABLE IF NOT EXISTS "simulation_entities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "kind" "SimulationEntityKind" NOT NULL,
  "attributes" JSONB NOT NULL,
  "tick_created" INTEGER NOT NULL,
  "tick_retired" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_entities_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_entities'
      AND constraint_name = 'simulation_entities_run_id_fkey'
  ) THEN
    ALTER TABLE "simulation_entities"
      ADD CONSTRAINT "simulation_entities_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "simulation_entities_run_id_kind_idx"
  ON "simulation_entities" ("run_id", "kind");

-- 5. Events.
CREATE TABLE IF NOT EXISTS "simulation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "tick_number" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "entity_id" UUID,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_events_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_events'
      AND constraint_name = 'simulation_events_run_id_fkey'
  ) THEN
    ALTER TABLE "simulation_events"
      ADD CONSTRAINT "simulation_events_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'simulation_events'
      AND constraint_name = 'simulation_events_entity_id_fkey'
  ) THEN
    ALTER TABLE "simulation_events"
      ADD CONSTRAINT "simulation_events_entity_id_fkey"
      FOREIGN KEY ("entity_id") REFERENCES "simulation_entities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "simulation_events_run_id_tick_number_idx"
  ON "simulation_events" ("run_id", "tick_number");

-- 6. Module activation.
CREATE TABLE IF NOT EXISTS "novel_modules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "novel_id" UUID NOT NULL,
  "module_name" TEXT NOT NULL,
  "enabled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "novel_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_modules_novel_id_module_name_key" UNIQUE ("novel_id", "module_name")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'novel_modules'
      AND constraint_name = 'novel_modules_novel_id_fkey'
  ) THEN
    ALTER TABLE "novel_modules"
      ADD CONSTRAINT "novel_modules_novel_id_fkey"
      FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
