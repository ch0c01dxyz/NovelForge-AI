-- NF-WF-020C: conservative merge + bulk recovery.
--
-- Adds `MERGE` to the `RevisionOrigin` enum — the origin of the single new
-- revision that a branch merge apply records on the target branch (one
-- revision per recovery op, Invariant 4).
--
-- This is the ONLY schema change in 020C. Branch metadata
-- (`Novel.currentBranchId`, `NovelBranch.sourceRevisionId`,
-- `RevisionOrigin.BRANCH_SWITCH`) is 020B's scope and lands in its own
-- migration; 020C reads those columns through the (regenerated) Prisma
-- client but does not own them.
--
-- Re-runnability (GAP-030): `ALTER TYPE ... ADD VALUE` has no IF NOT
-- EXISTS clause, so the add is guarded by a DO-block probing `pg_enum` —
-- a partially-applied retry converges. Purely additive: no existing row
-- or value is touched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RevisionOrigin' AND e.enumlabel = 'MERGE'
  ) THEN
    ALTER TYPE "RevisionOrigin" ADD VALUE 'MERGE';
  END IF;
END
$$;
