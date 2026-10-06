-- NF-WF-020B: branch isolation (temporal model, Klein Q1 DECIDED 2026-10-06).
--
-- Adds:
--   1. `novel_branches.source_revision_id` (nullable UUID) — the fork point
--      revision a branch was created from (020C's merge base). NULL for
--      pre-020 branches (only `main` exists pre-020, whose source is itself;
--      honest: fork point unknown, and `main` was never forked).
--   2. `novels.current_branch_id` (nullable UUID FK to novel_branches,
--      ON DELETE SET NULL) — the checked-out branch whose head the live
--      covered tables reflect (Invariant 5). Backfilled to each novel's
--      `main` branch id; NULL reads as `main` for safety.
--   3. `RevisionOrigin.BRANCH_SWITCH` — additive enum value for the
--      revision created by a branch switch (restore-to-head).
--
-- Rollback: dropping these columns is safe for story data (branch metadata
-- only, not story truth) but it DESTROYS branch lineage — pre-020 code
-- treats every novel as single-branch `main`, which remains coherent.
-- Never roll back by resetting the database.
--
-- Re-runnability (GAP-030): every statement is idempotent (IF NOT EXISTS
-- for columns via information_schema check, DO-blocks for the FK
-- constraint and enum value, which have no IF NOT EXISTS clause) — a
-- partially-applied retry converges. Purely additive: no existing row is
-- rewritten except the `current_branch_id` backfill (NULL → main branch
-- id, the honest default).

-- 1. The fork-point revision (020C merge base).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'novel_branches'
      AND column_name = 'source_revision_id'
  ) THEN
    ALTER TABLE "novel_branches"
      ADD COLUMN "source_revision_id" UUID;
  END IF;
END
$$;

-- 2. The checked-out branch pointer (Invariant 5, contract F1).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'novels'
      AND column_name = 'current_branch_id'
  ) THEN
    ALTER TABLE "novels"
      ADD COLUMN "current_branch_id" UUID;
  END IF;
END
$$;

-- The FK: ON DELETE SET NULL so deleting a branch never deletes the novel;
-- a NULL current_branch_id reads as `main` (the pre-020 default).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'novels'
      AND constraint_name = 'novels_current_branch_id_fkey'
  ) THEN
    ALTER TABLE "novels"
      ADD CONSTRAINT "novels_current_branch_id_fkey"
      FOREIGN KEY ("current_branch_id")
      REFERENCES "novel_branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill: every novel checks out its `main` branch. Idempotent — only
-- touches NULL rows, so a retry (or a novel created concurrently with a
-- NULL that the app then sets) converges.
UPDATE "novels" n
SET "current_branch_id" = b."id"
FROM "novel_branches" b
WHERE b."novel_id" = n."id"
  AND b."name" = 'main'
  AND n."current_branch_id" IS NULL;

-- 3. The BRANCH_SWITCH origin (additive enum value).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RevisionOrigin' AND e.enumlabel = 'BRANCH_SWITCH'
  ) THEN
    ALTER TYPE "RevisionOrigin" ADD VALUE 'BRANCH_SWITCH';
  END IF;
END
$$;
