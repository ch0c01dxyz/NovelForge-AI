-- NF-WF-024A: evaluated what-if outline simulation.
--
-- Adds:
--   1. `whatif_comparisons` — a persisted comparison across 2+ outline
--      versions, linking 021A SimulationRuns (kind='WHATIF'), with
--      divergence points, token budget accounting, and status.
--   2. `kind` column on `simulation_scenarios` (nullable, default
--      'STANDARD'; 'WHATIF' for what-if runs). Read-path isolation:
--      021D's Simulation Center list query excludes kind='WHATIF'.
--
-- Invariants (024 Invariant 1 / 021 Invariant 1): what-if runs NEVER
-- write to canon tables. All state lives in simulation_* and
-- whatif_comparisons. There is no approve/promote path on comparisons.
--
-- Rollback: dropping whatif_comparisons destroys comparison records
-- only; simulation runs remain (kind='WHATIF' column is additive).
--
-- Re-runnability (GAP-030): every statement is idempotent (CREATE TABLE
-- IF NOT EXISTS, DO-blocks for column adds). A partially-applied retry
-- converges. Purely additive: no existing data is altered.

-- 1. whatif_comparisons table (novel-scoped, ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS "whatif_comparisons" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  -- Outline versions being compared (2+, any status — 024A Q2).
  "outline_version_ids" JSONB NOT NULL DEFAULT '[]',
  -- 021A SimulationRun ids (one per outline version), kind='WHATIF'.
  "run_ids" JSONB NOT NULL DEFAULT '[]',
  -- Divergence points: [{ tickNumber, chapterIndex, kind, summary,
  --   outlineVersionIds: [...] }]. JSONB on purpose: computed artifacts
  --   read as a unit.
  "divergence_points" JSONB NOT NULL DEFAULT '[]',
  -- Cost bounds (024 Invariant 3): declared up front, enforced server-side.
  "max_chapters" INTEGER NOT NULL DEFAULT 3,
  "token_budget" INTEGER NOT NULL,
  "token_spent" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'whatif_comparisons_novel_id_idx'
  ) THEN
    CREATE INDEX "whatif_comparisons_novel_id_idx" ON "whatif_comparisons"("novel_id");
  END IF;
END
$$;

-- 2. kind column on simulation_scenarios (additive, nullable, default 'STANDARD').
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulation_scenarios' AND column_name = 'kind'
  ) THEN
    ALTER TABLE "simulation_scenarios" ADD COLUMN "kind" TEXT DEFAULT 'STANDARD';
  END IF;
END
$$;

-- Backfill: existing rows get 'STANDARD' (the DEFAULT only applies to
-- new rows in some Postgres versions when added via ALTER; be explicit).
UPDATE "simulation_scenarios" SET "kind" = 'STANDARD' WHERE "kind" IS NULL;
