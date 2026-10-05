-- NF-WF-010: final-text review receipts.
--
-- Adds the `FinalTextVerdict` enum and the `final_text_reviews` table:
-- one stored verdict per immutable ChapterVersion (@@unique on
-- chapter_version_id); a re-review of the SAME version REPLACES the row —
-- versions are immutable, so replacement is not history loss. The
-- manuscript.setStatus gate reads the latest receipt for
-- chapter.currentVersionId: no receipt → 409 REVIEW_STALE, FAIL → 409
-- HARD_POLICY_VIOLATION (constitution §11).
--
-- Receipts are audit, not truth: restore covers them as rebuildable
-- (a re-review regenerates any receipt), so rollback is always SAFE —
-- dropping this table loses no truth.
--
-- Re-runnability (GAP-030): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the idempotent
-- DO-block form for CREATE TYPE, which has no IF NOT EXISTS clause) —
-- a retry converges instead of dying half-applied. Purely additive: no
-- existing row is rewritten, and old code (unaware of the table) runs
-- fine against the migrated schema.

-- The review verdict. CREATE TYPE has no IF NOT EXISTS clause, so the
-- idempotent DO block is the re-runnable form (GAP-030).
DO $$ BEGIN
  CREATE TYPE "FinalTextVerdict" AS ENUM ('PASS', 'FAIL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "final_text_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "verdict" "FinalTextVerdict" NOT NULL,
  "hard_violations" JSONB NOT NULL,
  "advisory" JSONB NOT NULL,
  "evaluated_policies" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "final_text_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "final_text_reviews_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "final_text_reviews_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "final_text_reviews_chapter_version_id_fkey"
    FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "final_text_reviews_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "revisions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- One receipt per immutable version (the dedup key); re-review replaces.
DO $$ BEGIN
  ALTER TABLE "final_text_reviews"
    ADD CONSTRAINT "final_text_reviews_chapter_version_id_key"
    UNIQUE ("chapter_version_id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "final_text_reviews_novel_id_idx"
  ON "final_text_reviews" ("novel_id");
