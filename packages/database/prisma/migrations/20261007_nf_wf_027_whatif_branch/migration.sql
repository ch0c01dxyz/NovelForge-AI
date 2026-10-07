-- NF-WF-027: what-if live comparison branch ownership (GAP-100).
--
-- Adds:
--   1. `branch_id` — nullable FK to `novel_branch(id)` on `whatif_comparisons`.
--      The simulation branch the comparison's runs execute on. NULL for
--      pre-027 rows (their live path never worked — GAP-100; no backfill,
--      no silent repair).
--   2. `branch_mode` — `'existing' | 'provision'`, nullable for pre-027 rows.
--      Records whether the author selected an existing branch or asked the
--      service to provision one.
--
-- Invariants (027 contract):
-- - No silent main-branch fallback: the column is nullable, not defaulted.
-- - Additive and idempotent (GAP-030): IF NOT EXISTS / DO-blocks. A
--   partially-applied retry converges. No existing data is altered.
--
-- Rollback: DROP COLUMN branch_id, branch_mode (data loss: only branch
-- linkage on new comparisons; comparisons themselves retained).

-- 1. branch_id column (nullable FK, SET NULL on branch delete — a deleted
--    branch must not cascade-delete the comparison; run-time re-verification
--    surfaces BRANCH_NOT_FOUND).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatif_comparisons' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE "whatif_comparisons"
      ADD COLUMN "branch_id" UUID NULL REFERENCES "novel_branches"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 2. branch_mode column with CHECK constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatif_comparisons' AND column_name = 'branch_mode'
  ) THEN
    ALTER TABLE "whatif_comparisons"
      ADD COLUMN "branch_mode" TEXT NULL
      CHECK ("branch_mode" IN ('existing', 'provision'));
  END IF;
END $$;

-- 3. Index for orphan-branch detection (027 Invariant 5): find
--    simulation-whatif-* branches with no referencing comparison.
CREATE INDEX IF NOT EXISTS "whatif_comparisons_branch_id_idx"
  ON "whatif_comparisons" ("branch_id");
