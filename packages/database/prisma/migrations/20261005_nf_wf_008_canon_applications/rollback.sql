-- NF-WF-008 rollback. Prisma has no down-migration mechanism; this file is
-- the reviewed manual rollback for the 20261005_nf_wf_008_canon_applications
-- migration. Run it by hand (psql) — never as part of `migrate deploy`.
--
-- SAFETY: applied applications are audit history. The rollback REFUSES when
-- any application is APPLIED (the DO block raises before dropping
-- anything). Canon facts/entities minted by applied applications are never
-- touched by this rollback.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "canon_applications" WHERE "status" = 'APPLIED') THEN
    RAISE EXCEPTION 'rollback refused: % applied canon application(s) exist — applied rows are audit history',
      (SELECT count(*) FROM "canon_applications" WHERE "status" = 'APPLIED');
  END IF;
END $$;

DROP TABLE IF EXISTS "canon_application_items";
DROP TABLE IF EXISTS "canon_applications";
DROP TYPE IF EXISTS "CanonApplicationItemVerdict";
DROP TYPE IF EXISTS "CanonApplicationStatus";
