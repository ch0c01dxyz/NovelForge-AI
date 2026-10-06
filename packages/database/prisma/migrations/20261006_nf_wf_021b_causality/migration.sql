-- NF-WF-021B: Causal evidence and uncertainty as proposals.
--
-- Adds `simulation_causal_links` and `simulation_proposals` tables plus the
-- `SimulationCausalKind`, `SimulationProposalKind`, and
-- `SimulationProposalStatus` enums. 021B owns these tables; 021A owns
-- `simulation_runs`/`simulation_events` (referenced by logical UUID FKs,
-- no DB-level FK constraints — the two children parallelize).
--
-- Re-runnability (GAP-030): every statement is idempotent — DO-blocks guard
-- enum creation, CREATE TABLE IF NOT EXISTS guards tables, and index
-- creation uses IF NOT EXISTS. A partially-applied retry converges.
-- Purely additive: no existing table is altered.

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationCausalKind') THEN
    CREATE TYPE "SimulationCausalKind" AS ENUM ('DIRECT', 'ENABLING', 'PREVENTING');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationProposalKind') THEN
    CREATE TYPE "SimulationProposalKind" AS ENUM ('OUTCOME_FORK');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SimulationProposalStatus') THEN
    CREATE TYPE "SimulationProposalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

-- simulation_causal_links
CREATE TABLE IF NOT EXISTS "simulation_causal_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "run_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "cause_event_id" UUID,
  "cause_state_ref" JSONB,
  "kind" "SimulationCausalKind" NOT NULL,
  "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "simulation_causal_links_cause_check"
    CHECK ("cause_event_id" IS NOT NULL OR "cause_state_ref" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "simulation_causal_links_run_event_idx"
  ON "simulation_causal_links"("run_id", "event_id");
CREATE INDEX IF NOT EXISTS "simulation_causal_links_run_cause_idx"
  ON "simulation_causal_links"("run_id", "cause_event_id");

-- simulation_proposals
CREATE TABLE IF NOT EXISTS "simulation_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "run_id" UUID NOT NULL,
  "tick_number" INTEGER NOT NULL,
  "kind" "SimulationProposalKind" NOT NULL DEFAULT 'OUTCOME_FORK',
  "alternatives" JSONB NOT NULL,
  "status" "SimulationProposalStatus" NOT NULL DEFAULT 'PROPOSED',
  "trigger" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "rationale" TEXT,
  "chosen_alternative_id" TEXT,
  "decided_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent additive columns for existing deployments (GAP-030 pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulation_proposals' AND column_name = 'trigger'
  ) THEN
    ALTER TABLE "simulation_proposals" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'NO_DOMINANT_OUTCOME';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulation_proposals' AND column_name = 'reason'
  ) THEN
    ALTER TABLE "simulation_proposals" ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "simulation_proposals_run_status_idx"
  ON "simulation_proposals"("run_id", "status");
