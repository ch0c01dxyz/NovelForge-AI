-- NF-WF-019D: server-side reading progress.
--
-- Adds the `reading_progress` table: one latest-position row per
-- (user, novel). Last-write-wins by the client's clock — the server
-- never fabricates progress; `updated_at` stores the winning write's
-- client timestamp. Rows are retained while a novel is unpublished
-- (invisible until public again) and cascade with the user/novel.
-- Progress is private to the owning user (Invariant 4).
--
-- Rollback: dropping this table is safe for story data (progress is
-- non-canonical social data, not story truth) but it DESTROYS reading
-- progress history — re-sync starts from device-local 014 progress.
-- Never roll back by resetting the database.
--
-- Re-runnability (GAP-030): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the idempotent
-- DO-block form for constraints, which have no IF NOT EXISTS clause)
-- — a retry converges instead of dying half-applied. Purely additive:
-- no existing row is rewritten, and old code (unaware of the table)
-- runs fine against the migrated schema. Backfill: none (no server
-- progress exists; absent row = no position).

CREATE TABLE IF NOT EXISTS "reading_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_number" INTEGER NOT NULL,
  "scroll_ratio" DOUBLE PRECISION,
  "device_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- Idempotent unique constraint (dedup backstop for (userId, novelId)).
DO $$ BEGIN
  ALTER TABLE "reading_progress"
    ADD CONSTRAINT "reading_progress_user_id_novel_id_key"
    UNIQUE ("user_id", "novel_id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Idempotent foreign keys (Cascade with the user/novel).
DO $$ BEGIN
  ALTER TABLE "reading_progress"
    ADD CONSTRAINT "reading_progress_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "reading_progress"
    ADD CONSTRAINT "reading_progress_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
